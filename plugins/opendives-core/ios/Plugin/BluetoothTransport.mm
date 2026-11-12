// SPDX-License-Identifier: GPL-2.0
// CoreBluetooth implementation of core/compat/bt_transport.h, the iOS
// counterpart of plugins/opendives-core/android/.../BluetoothTransport.kt.
// What to do with the packets (service, characteristics, notifications,
// credits) is decided in C++ by core/compat/bluetooth_compat.cpp.
#import "BluetoothTransport.h"

#import <CoreBluetooth/CoreBluetooth.h>
#import <Foundation/Foundation.h>
#include <strings.h>

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <utility>

@interface ODBtDelegate : NSObject <CBCentralManagerDelegate, CBPeripheralDelegate>
@property(nonatomic, assign) opendives_compat::IosBluetoothTransport::Impl *impl;
@end

namespace opendives_compat {
namespace {

using Clock = std::chrono::steady_clock;

const char *const kCccd = "00002902-0000-1000-8000-00805f9b34fb";

// The contract's form: 36 characters, lower case; CoreBluetooth gives 4, 8 or
// 36 characters. Comparisons are done on this form, never on CBUUID equality
// (a short CBUUID and its 128-bit expansion are not equal).
std::string uuid_string(CBUUID *u)
{
	std::string s = [[u.UUIDString lowercaseString] UTF8String];
	if (s.size() == 4)
		return "0000" + s + "-0000-1000-8000-00805f9b34fb";
	if (s.size() == 8)
		return s + "-0000-1000-8000-00805f9b34fb";
	return s;
}

bool same_uuid(const std::string &a, const std::string &b)
{
	return strcasecmp(a.c_str(), b.c_str()) == 0;
}

unsigned map_properties(CBCharacteristicProperties p)
{
	unsigned r = 0;
	if (p & CBCharacteristicPropertyRead)
		r |= BLE_PROP_READ;
	if (p & CBCharacteristicPropertyWriteWithoutResponse)
		r |= BLE_PROP_WRITE_NO_RESPONSE;
	if (p & CBCharacteristicPropertyWrite)
		r |= BLE_PROP_WRITE;
	if (p & (CBCharacteristicPropertyNotify | CBCharacteristicPropertyNotifyEncryptionRequired))
		r |= BLE_PROP_NOTIFY;
	if (p & (CBCharacteristicPropertyIndicate | CBCharacteristicPropertyIndicateEncryptionRequired))
		r |= BLE_PROP_INDICATE;
	return r;
}

std::string error_text(NSError *e)
{
	if (!e)
		return "unknown error";
	return std::string([[NSString stringWithFormat:@"%@ (%ld)", e.localizedDescription, (long)e.code] UTF8String]);
}

Bytes to_bytes(NSData *d)
{
	const unsigned char *p = static_cast<const unsigned char *>(d.bytes);
	return d.length ? Bytes(p, p + d.length) : Bytes();
}

// "LE:{UUID}", "{UUID}" or "UUID": the peripheral identifier.
NSUUID *parse_identifier(const std::string &address)
{
	NSString *s = [[NSString stringWithUTF8String:address.c_str()]
		stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
	if (!s)
		return nil;
	if ([s length] >= 3 && [[s substringToIndex:3] caseInsensitiveCompare:@"LE:"] == NSOrderedSame)
		s = [s substringFromIndex:3];
	s = [s stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"{}"]];
	return [[NSUUID alloc] initWithUUIDString:s];
}

} // namespace

struct IosBluetoothTransport::Impl {
	enum Kind { None, Scan, Connect, Discover, DescriptorWrite, Notify, Write, Read };

	// Everything below up to the CoreBluetooth objects is guarded by `m`.
	std::mutex m;
	std::condition_variable cv;
	bool cancelled = false;
	std::string error;
	CBManagerState state = CBManagerStateUnknown;
	bool connected = false;
	// The operation the core's thread waits for: one at a time.
	Kind kind = None;
	id pendingObj = nil;
	bool opDone = false;
	bool opOk = false;
	std::string opErr;
	Bytes opValue;
	int discoverPending = 0;
	NSUUID *scanTarget = nil;
	CBPeripheral *found = nil;
	// Notifications and indications, in order of arrival: (characteristic, value).
	std::deque<std::pair<std::string, Bytes>> received;

	// Touched on `queue` only (set up once, before the first use of `central`).
	dispatch_queue_t queue = nil;
	CBCentralManager *central = nil;
	CBPeripheral *peripheral = nil;
	ODBtDelegate *delegate = nil;

	~Impl()
	{
		if (!queue)
			return;
		dispatch_sync(queue, ^{
			delegate.impl = nullptr;
			central.delegate = nil;
			peripheral.delegate = nil;
		});
	}

	void on_queue(dispatch_block_t block) { dispatch_sync(queue, block); }

	bool fail(const std::string &msg)
	{
		std::lock_guard<std::mutex> g(m);
		error = msg;
		return false;
	}

	void begin(Kind k, id obj)
	{
		std::lock_guard<std::mutex> g(m);
		kind = k;
		pendingObj = obj;
		opDone = false;
		opOk = false;
		opErr.clear();
		opValue.clear();
	}

	// With `m` held, on the delegate queue.
	void complete(bool ok, const std::string &err = std::string())
	{
		opDone = true;
		opOk = ok;
		opErr = err;
		cv.notify_all();
	}

	// Waits for the answer of the operation just started; false after the
	// timeout, on cancellation, or (when `need_connected`) on disconnection.
	bool wait_op(int timeout_ms, const char *what, bool need_connected)
	{
		std::unique_lock<std::mutex> lk(m);
		auto deadline = Clock::now() + std::chrono::milliseconds(std::max(timeout_ms, 0));
		bool ok = false;
		while (true) {
			if (opDone) {
				ok = opOk;
				if (!ok)
					error = opErr;
				break;
			}
			if (cancelled) {
				error = "cancelled";
				break;
			}
			if (need_connected && !connected) {
				if (error.empty())
					error = "disconnected";
				break;
			}
			if (cv.wait_until(lk, deadline) == std::cv_status::timeout && !opDone) {
				error = std::string("no answer to ") + what + " within " + std::to_string(timeout_ms) + " ms";
				break;
			}
		}
		kind = None;
		pendingObj = nil;
		return ok;
	}

	// Sleeps, but wakes up at once on cancellation; false when cancelled.
	bool pause(int ms)
	{
		std::unique_lock<std::mutex> lk(m);
		return !cv.wait_for(lk, std::chrono::milliseconds(ms), [this] { return cancelled; });
	}

	void ensure_central()
	{
		if (central)
			return;
		queue = dispatch_queue_create("org.opendives.core.bluetooth", DISPATCH_QUEUE_SERIAL);
		delegate = [[ODBtDelegate alloc] init];
		delegate.impl = this;
		// The first use of CoreBluetooth makes iOS ask for the permission.
		central = [[CBCentralManager alloc] initWithDelegate:delegate queue:queue options:nil];
	}

	// Central state must be powered on before anything.
	bool wait_powered_on(int timeout_ms)
	{
		std::unique_lock<std::mutex> lk(m);
		auto deadline = Clock::now() + std::chrono::milliseconds(std::max(timeout_ms, 0));
		while (true) {
			switch (state) {
			case CBManagerStatePoweredOn:
				return true;
			case CBManagerStateUnsupported:
				error = "Bluetooth Low Energy is not supported on this device";
				return false;
			case CBManagerStateUnauthorized:
				error = "Bluetooth permission denied: allow Bluetooth for OpenDives in the iOS Settings";
				return false;
			case CBManagerStatePoweredOff:
				error = "Bluetooth is turned off";
				return false;
			default: // unknown, resetting: the state is not known yet
				break;
			}
			if (cancelled) {
				error = "cancelled";
				return false;
			}
			if (cv.wait_until(lk, deadline) == std::cv_status::timeout) {
				error = "Bluetooth is not ready within " + std::to_string(timeout_ms) + " ms";
				return false;
			}
		}
	}

	// The peripheral the system already knows by its identifier, else a short scan.
	CBPeripheral *find_peripheral(NSUUID *uuid, int timeout_ms)
	{
		__block CBPeripheral *p = nil;
		on_queue(^{
			p = [central retrievePeripheralsWithIdentifiers:@[ uuid ]].firstObject;
		});
		if (p)
			return p;
		bt_log("peripheral %s not known to the system, scanning", [uuid.UUIDString UTF8String]);
		{
			std::lock_guard<std::mutex> g(m);
			scanTarget = uuid;
			found = nil;
		}
		begin(Scan, nil);
		on_queue(^{
			[central scanForPeripheralsWithServices:nil
							options:@{CBCentralManagerScanOptionAllowDuplicatesKey : @NO}];
		});
		bool ok = wait_op(std::min(timeout_ms, 10000), "scan for the device", false);
		on_queue(^{
			[central stopScan];
		});
		std::lock_guard<std::mutex> g(m);
		scanTarget = nil;
		CBPeripheral *result = found;
		found = nil;
		if (!ok && !cancelled)
			error = "device not found";
		return ok ? result : nil;
	}

	bool connect(const std::string &address, int timeout_ms)
	{
		{
			std::lock_guard<std::mutex> g(m);
			error.clear();
			received.clear();
			connected = false;
		}
		NSUUID *uuid = parse_identifier(address);
		if (!uuid)
			return fail("invalid address " + address);
		ensure_central();
		if (!wait_powered_on(timeout_ms))
			return false;
		CBPeripheral *p = find_peripheral(uuid, timeout_ms);
		if (!p)
			return false;
		// OpenDives: as on Android, one more attempt after a failed connection.
		for (int attempt = 1; attempt <= 2; attempt++) {
			bt_log("connect to %s (attempt %d)", address.c_str(), attempt);
			begin(Connect, nil);
			on_queue(^{
				peripheral = p;
				p.delegate = delegate;
				[central connectPeripheral:p options:nil];
			});
			if (wait_op(timeout_ms, "connect", false))
				break;
			on_queue(^{
				[central cancelPeripheralConnection:p];
			});
			bool cancelled_now;
			{
				std::lock_guard<std::mutex> g(m);
				cancelled_now = cancelled;
			}
			if (cancelled_now || attempt == 2)
				return false;
			if (!pause(500))
				return false;
			std::lock_guard<std::mutex> g(m);
			error.clear();
		}
		std::lock_guard<std::mutex> g(m);
		return connected;
	}

	// On `queue`.
	CBCharacteristic *find_characteristic(const std::string &service, const std::string &characteristic)
	{
		for (CBService *s in peripheral.services) {
			if (!same_uuid(uuid_string(s.UUID), service))
				continue;
			for (CBCharacteristic *c in s.characteristics) {
				if (same_uuid(uuid_string(c.UUID), characteristic))
					return c;
			}
		}
		return nil;
	}

	CBCharacteristic *lookup(const std::string &service, const std::string &characteristic)
	{
		{
			std::lock_guard<std::mutex> g(m);
			if (!connected) {
				if (error.empty())
					error = "not connected";
				return nil;
			}
		}
		__block CBCharacteristic *c = nil;
		on_queue(^{
			c = find_characteristic(service, characteristic);
		});
		if (!c)
			fail("characteristic " + characteristic + " not found");
		return c;
	}

	bool discover(std::vector<BleService> &services, int timeout_ms)
	{
		{
			std::lock_guard<std::mutex> g(m);
			if (!connected) {
				if (error.empty())
					error = "not connected";
				return false;
			}
			discoverPending = 0;
		}
		begin(Discover, nil);
		on_queue(^{
			[peripheral discoverServices:nil];
		});
		// On a timeout the core still gets what has been discovered so far.
		bool ok = wait_op(timeout_ms, "service discovery", true);
		std::vector<BleService> *out = &services;
		on_queue(^{
			for (CBService *s in peripheral.services) {
				BleService bs;
				bs.uuid = uuid_string(s.UUID);
				for (CBCharacteristic *c in s.characteristics) {
					BleCharacteristic bc;
					bc.uuid = uuid_string(c.UUID);
					bc.properties = map_properties(c.properties);
					for (CBDescriptor *d in c.descriptors)
						bc.descriptors.push_back(uuid_string(d.UUID));
					// CoreBluetooth hides the CCCD, which the core looks for (and takes
					// the first descriptor of for the HW Terminal I/O): list it first.
					if ((bc.properties & (BLE_PROP_NOTIFY | BLE_PROP_INDICATE)) &&
					    std::none_of(bc.descriptors.begin(), bc.descriptors.end(),
							 [](const std::string &u) { return same_uuid(u, kCccd); }))
						bc.descriptors.insert(bc.descriptors.begin(), kCccd);
					bs.characteristics.push_back(std::move(bc));
				}
				out->push_back(std::move(bs));
			}
		});
		return ok;
	}

	bool write_descriptor(const std::string &service, const std::string &characteristic, const std::string &descriptor,
			      const Bytes &value, int timeout_ms)
	{
		CBCharacteristic *c = lookup(service, characteristic);
		if (!c)
			return false;
		if (same_uuid(descriptor, kCccd)) {
			// CoreBluetooth refuses a write to the CCCD: subscribing does it.
			bool on = std::any_of(value.begin(), value.end(), [](unsigned char b) { return b != 0; });
			__block BOOL already = NO;
			on_queue(^{
				already = c.isNotifying == on;
			});
			if (already)
				return true;
			begin(Notify, c);
			on_queue(^{
				[peripheral setNotifyValue:on forCharacteristic:c];
			});
			return wait_op(timeout_ms, "notification state", true);
		}
		__block CBDescriptor *d = nil;
		on_queue(^{
			for (CBDescriptor *x in c.descriptors) {
				if (same_uuid(uuid_string(x.UUID), descriptor)) {
					d = x;
					break;
				}
			}
		});
		if (!d)
			return fail("descriptor " + descriptor + " not found");
		NSData *data = [NSData dataWithBytes:value.data() length:value.size()];
		begin(DescriptorWrite, d);
		on_queue(^{
			[peripheral writeValue:data forDescriptor:d];
		});
		return wait_op(timeout_ms, "descriptor write", true);
	}

	bool write(const std::string &service, const std::string &characteristic, const Bytes &bytes, bool with_response,
		   int timeout_ms)
	{
		CBCharacteristic *c = lookup(service, characteristic);
		if (!c)
			return false;
		CBCharacteristicWriteType type = with_response ? CBCharacteristicWriteWithResponse : CBCharacteristicWriteWithoutResponse;
		CBCharacteristicProperties needed = with_response ? CBCharacteristicPropertyWrite : CBCharacteristicPropertyWriteWithoutResponse;
		__block NSUInteger max_length = 0;
		__block BOOL allowed = NO;
		on_queue(^{
			allowed = (c.properties & needed) != 0;
			max_length = [peripheral maximumWriteValueLengthForType:type];
		});
		if (!allowed)
			return fail(std::string("characteristic does not support a write ") + (with_response ? "with" : "without") + " response");
		// Nothing is split, as on Android: too much data is refused.
		if (bytes.size() > max_length)
			return fail("write of " + std::to_string(bytes.size()) + " bytes exceeds the maximum of " + std::to_string(max_length));
		NSData *data = [NSData dataWithBytes:bytes.data() length:bytes.size()];
		if (with_response) {
			begin(Write, c);
			on_queue(^{
				[peripheral writeValue:data forCharacteristic:c type:type];
			});
			return wait_op(timeout_ms, "write", true);
		}
		// No answer comes for a write without response: wait for room in the
		// transmit queue, submit, and return.
		auto deadline = Clock::now() + std::chrono::milliseconds(std::max(timeout_ms, 0));
		while (true) {
			__block BOOL can = NO;
			on_queue(^{
				can = peripheral.canSendWriteWithoutResponse;
			});
			if (can)
				break;
			std::unique_lock<std::mutex> lk(m);
			if (cancelled) {
				error = "cancelled";
				return false;
			}
			if (!connected) {
				if (error.empty())
					error = "disconnected";
				return false;
			}
			if (Clock::now() >= deadline) {
				error = "write not ready within " + std::to_string(timeout_ms) + " ms";
				return false;
			}
			// onReadyToSend wakes this; the cap covers a wake-up missed between the check and here.
			cv.wait_for(lk, std::chrono::milliseconds(50));
		}
		on_queue(^{
			[peripheral writeValue:data forCharacteristic:c type:type];
		});
		return true;
	}

	bool read(const std::string &service, const std::string &characteristic, Bytes &value, int timeout_ms)
	{
		CBCharacteristic *c = lookup(service, characteristic);
		if (!c)
			return false;
		begin(Read, c);
		on_queue(^{
			[peripheral readValueForCharacteristic:c];
		});
		if (!wait_op(timeout_ms, "read", true))
			return false;
		std::lock_guard<std::mutex> g(m);
		value = opValue;
		return true;
	}

	int receive(std::string &characteristic, Bytes &data, int timeout_ms)
	{
		std::unique_lock<std::mutex> lk(m);
		auto deadline = Clock::now() + std::chrono::milliseconds(std::max(timeout_ms, 0));
		while (true) {
			if (cancelled)
				return -1;
			if (!received.empty()) {
				characteristic = std::move(received.front().first);
				data = std::move(received.front().second);
				received.pop_front();
				return 1;
			}
			if (!connected)
				return -1;
			if (Clock::now() >= deadline)
				return 0;
			cv.wait_until(lk, deadline);
		}
	}

	void close()
	{
		{
			std::lock_guard<std::mutex> g(m);
			connected = false; // before the disconnection callback: not reported as an error
			received.clear();
			kind = None;
			pendingObj = nil;
			cv.notify_all();
		}
		if (!central)
			return;
		on_queue(^{
			if (peripheral) {
				peripheral.delegate = nil;
				[central cancelPeripheralConnection:peripheral];
			}
			peripheral = nil;
		});
	}

	// --- delegate callbacks, on `queue` ----------------------------------------

	// The state comes as an argument: the callback can run before `central` is assigned.
	void on_state(CBManagerState s)
	{
		std::lock_guard<std::mutex> g(m);
		state = s;
		if (state != CBManagerStatePoweredOn && connected) {
			connected = false;
			error = "Bluetooth is no longer available";
		}
		cv.notify_all();
	}

	void on_discover(CBPeripheral *p)
	{
		std::lock_guard<std::mutex> g(m);
		if (kind == Scan && scanTarget && [p.identifier isEqual:scanTarget]) {
			found = p;
			complete(true);
		}
	}

	void on_connect(CBPeripheral *p)
	{
		std::lock_guard<std::mutex> g(m);
		if (p != peripheral)
			return;
		connected = true;
		if (kind == Connect)
			complete(true);
		cv.notify_all();
	}

	void on_fail_connect(CBPeripheral *p, NSError *e)
	{
		std::lock_guard<std::mutex> g(m);
		if (p != peripheral)
			return;
		if (kind == Connect)
			complete(false, "connection failed: " + error_text(e));
	}

	void on_disconnect(CBPeripheral *p, NSError *e)
	{
		std::lock_guard<std::mutex> g(m);
		if (p != peripheral)
			return;
		if (connected) {
			connected = false;
			error = "disconnected: " + (e ? error_text(e) : std::string("by the device"));
		}
		if (kind == Connect)
			complete(false, "disconnected during the connection");
		cv.notify_all();
	}

	void on_services(CBPeripheral *p, NSError *e)
	{
		if (p != peripheral)
			return;
		NSArray<CBService *> *services = nil;
		{
			std::lock_guard<std::mutex> g(m);
			if (kind != Discover)
				return;
			if (e) {
				complete(false, "service discovery: " + error_text(e));
				return;
			}
			services = p.services;
			discoverPending = (int)services.count;
			if (discoverPending == 0)
				complete(true);
		}
		for (CBService *s in services)
			[p discoverCharacteristics:nil forService:s];
	}

	void on_characteristics(CBPeripheral *p, CBService *s, NSError *e)
	{
		if (p != peripheral)
			return;
		NSArray<CBCharacteristic *> *list = nil;
		{
			std::lock_guard<std::mutex> g(m);
			if (kind != Discover)
				return;
			discoverPending--;
			if (e)
				bt_log("characteristic discovery of %s: %s", uuid_string(s.UUID).c_str(), error_text(e).c_str());
			else
				list = s.characteristics;
			discoverPending += (int)list.count;
			if (discoverPending == 0)
				complete(true);
		}
		for (CBCharacteristic *c in list)
			[p discoverDescriptorsForCharacteristic:c];
	}

	void on_descriptors(CBPeripheral *p, CBCharacteristic *c, NSError *e)
	{
		if (p != peripheral)
			return;
		std::lock_guard<std::mutex> g(m);
		if (kind != Discover)
			return;
		if (e)
			bt_log("descriptor discovery of %s: %s", uuid_string(c.UUID).c_str(), error_text(e).c_str());
		if (--discoverPending == 0)
			complete(true);
	}

	// One callback for the answer of a read and for notifications: a pending
	// read of this characteristic takes the first value, as no flag tells them apart.
	void on_value(CBPeripheral *p, CBCharacteristic *c, NSError *e)
	{
		if (p != peripheral)
			return;
		std::lock_guard<std::mutex> g(m);
		if (kind == Read && pendingObj == c) {
			if (e) {
				complete(false, "read: " + error_text(e));
			} else {
				opValue = to_bytes(c.value);
				complete(true);
			}
			return;
		}
		if (e) {
			bt_log("value update error on %s: %s", uuid_string(c.UUID).c_str(), error_text(e).c_str());
			return;
		}
		received.emplace_back(uuid_string(c.UUID), to_bytes(c.value)); // copied at once: c.value changes
		cv.notify_all();
	}

	void on_write(CBPeripheral *p, CBCharacteristic *c, NSError *e)
	{
		if (p != peripheral)
			return;
		std::lock_guard<std::mutex> g(m);
		if (kind == Write && pendingObj == c)
			complete(!e, e ? "write: " + error_text(e) : std::string());
	}

	void on_descriptor_write(CBPeripheral *p, CBDescriptor *d, NSError *e)
	{
		if (p != peripheral)
			return;
		std::lock_guard<std::mutex> g(m);
		if (kind == DescriptorWrite && pendingObj == d)
			complete(!e, e ? "descriptor write: " + error_text(e) : std::string());
	}

	void on_notify_state(CBPeripheral *p, CBCharacteristic *c, NSError *e)
	{
		if (p != peripheral)
			return;
		std::lock_guard<std::mutex> g(m);
		if (kind == Notify && pendingObj == c)
			complete(!e, e ? "notification state: " + error_text(e) : std::string());
	}

	void on_ready_to_write(CBPeripheral *p)
	{
		if (p != peripheral)
			return;
		std::lock_guard<std::mutex> g(m);
		cv.notify_all();
	}
};

} // namespace opendives_compat

@implementation ODBtDelegate

- (void)centralManagerDidUpdateState:(CBCentralManager *)central
{
	if (self.impl)
		self.impl->on_state(central.state);
}

- (void)centralManager:(CBCentralManager *)central
 didDiscoverPeripheral:(CBPeripheral *)peripheral
     advertisementData:(NSDictionary<NSString *, id> *)advertisementData
		  RSSI:(NSNumber *)RSSI
{
	if (self.impl)
		self.impl->on_discover(peripheral);
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral
{
	if (self.impl)
		self.impl->on_connect(peripheral);
}

- (void)centralManager:(CBCentralManager *)central
didFailToConnectPeripheral:(CBPeripheral *)peripheral
		 error:(NSError *)error
{
	if (self.impl)
		self.impl->on_fail_connect(peripheral, error);
}

- (void)centralManager:(CBCentralManager *)central
didDisconnectPeripheral:(CBPeripheral *)peripheral
		 error:(NSError *)error
{
	if (self.impl)
		self.impl->on_disconnect(peripheral, error);
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error
{
	if (self.impl)
		self.impl->on_services(peripheral, error);
}

- (void)peripheral:(CBPeripheral *)peripheral
didDiscoverCharacteristicsForService:(CBService *)service
	     error:(NSError *)error
{
	if (self.impl)
		self.impl->on_characteristics(peripheral, service, error);
}

- (void)peripheral:(CBPeripheral *)peripheral
didDiscoverDescriptorsForCharacteristic:(CBCharacteristic *)characteristic
	     error:(NSError *)error
{
	if (self.impl)
		self.impl->on_descriptors(peripheral, characteristic, error);
}

- (void)peripheral:(CBPeripheral *)peripheral
didUpdateValueForCharacteristic:(CBCharacteristic *)characteristic
	     error:(NSError *)error
{
	if (self.impl)
		self.impl->on_value(peripheral, characteristic, error);
}

- (void)peripheral:(CBPeripheral *)peripheral
didWriteValueForCharacteristic:(CBCharacteristic *)characteristic
	     error:(NSError *)error
{
	if (self.impl)
		self.impl->on_write(peripheral, characteristic, error);
}

- (void)peripheral:(CBPeripheral *)peripheral
didWriteValueForDescriptor:(CBDescriptor *)descriptor
	     error:(NSError *)error
{
	if (self.impl)
		self.impl->on_descriptor_write(peripheral, descriptor, error);
}

- (void)peripheral:(CBPeripheral *)peripheral
didUpdateNotificationStateForCharacteristic:(CBCharacteristic *)characteristic
	     error:(NSError *)error
{
	if (self.impl)
		self.impl->on_notify_state(peripheral, characteristic, error);
}

- (void)peripheralIsReadyToSendWriteWithoutResponse:(CBPeripheral *)peripheral
{
	if (self.impl)
		self.impl->on_ready_to_write(peripheral);
}

@end

namespace opendives_compat {

IosBluetoothTransport::IosBluetoothTransport() : impl_(new Impl) {}

IosBluetoothTransport::~IosBluetoothTransport()
{
	cancel();
	impl_->close();
}

void IosBluetoothTransport::reset()
{
	std::lock_guard<std::mutex> g(impl_->m);
	impl_->cancelled = false;
	impl_->error.clear();
}

void IosBluetoothTransport::cancel()
{
	std::lock_guard<std::mutex> g(impl_->m);
	impl_->cancelled = true;
	impl_->error = "cancelled";
	impl_->cv.notify_all();
}

bool IosBluetoothTransport::ble_connect(const std::string &address, bool, int timeout_ms)
{
	// random_address means nothing here: iOS knows the address type itself.
	return impl_->connect(address, timeout_ms);
}

bool IosBluetoothTransport::ble_discover(std::vector<BleService> &services, int timeout_ms)
{
	return impl_->discover(services, timeout_ms);
}

bool IosBluetoothTransport::ble_write_descriptor(const std::string &service, const std::string &characteristic,
						 const std::string &descriptor, const Bytes &value, int timeout_ms)
{
	return impl_->write_descriptor(service, characteristic, descriptor, value, timeout_ms);
}

bool IosBluetoothTransport::ble_write(const std::string &service, const std::string &characteristic, const Bytes &data,
				      bool with_response, int timeout_ms)
{
	return impl_->write(service, characteristic, data, with_response, timeout_ms);
}

bool IosBluetoothTransport::ble_read(const std::string &service, const std::string &characteristic, Bytes &value,
				     int timeout_ms)
{
	return impl_->read(service, characteristic, value, timeout_ms);
}

int IosBluetoothTransport::ble_receive(std::string &characteristic, Bytes &data, int timeout_ms)
{
	return impl_->receive(characteristic, data, timeout_ms);
}

void IosBluetoothTransport::ble_close()
{
	impl_->close();
}

bool IosBluetoothTransport::rfcomm_connect(const std::string &, int)
{
	impl_->fail("Bluetooth Classic (RFCOMM) is not available to iOS apps");
	return false;
}

int IosBluetoothTransport::rfcomm_read(unsigned char *, size_t, int)
{
	return -1;
}

int IosBluetoothTransport::rfcomm_write(const unsigned char *, size_t)
{
	return -1;
}

size_t IosBluetoothTransport::rfcomm_available()
{
	return 0;
}

void IosBluetoothTransport::rfcomm_close() {}

std::string IosBluetoothTransport::last_error()
{
	std::lock_guard<std::mutex> g(impl_->m);
	return impl_->error;
}

} // namespace opendives_compat
