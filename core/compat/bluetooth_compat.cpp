// SPDX-License-Identifier: GPL-2.0
// Subsurface's Bluetooth code without Qt, for libdivecomputer's custom I/O:
//  - core/bluetoothaddress.cpp, ported as is (std::regex for QRegularExpression);
//  - core/qt-ble.cpp (BLE GATT: choice of the service and characteristics,
//    notifications, credits of the Heinrichs Weikamp modules, reads, writes,
//    ioctls) and core/qtserialbluetooth.cpp (ble_packet_open, and RFCOMM for
//    Bluetooth Classic), ported function by function. Qt's event loop and
//    signals become the synchronous calls of the platform's transport
//    (bt_transport.h); the decisions, their order and the timeouts are
//    Subsurface's. The comments in English quoted from Subsurface keep their
//    wording. Departures, each marked "OpenDives:", are only where Qt's own
//    behaviour cannot be reproduced without Qt.
#include "core/compat/bt_transport.h"

#include "core/bluetoothaddress.h"
#include "core/errorhelper.h"
#include "core/libdivecomputer.h"

#include <libdivecomputer/ble.h>
#include <libdivecomputer/context.h>
#include <libdivecomputer/custom.h>

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <regex>
#include <thread>

#ifdef __ANDROID__
#include <android/log.h>
#endif

namespace opendives_compat {

static BtTransport *current_transport = nullptr;

void set_bt_transport(BtTransport *transport)
{
	current_transport = transport;
}

BtTransport *bt_transport()
{
	return current_transport;
}

bool bt_transport_error = false;
void (*bt_io_hook)() = nullptr;
void (*bt_state_hook)(const char *state) = nullptr;
void (*bt_log_hook)(const std::string &line) = nullptr;

void bt_log(const char *fmt, ...)
{
	char buf[1024];
	va_list ap;
	va_start(ap, fmt);
	vsnprintf(buf, sizeof(buf), fmt, ap);
	va_end(ap);
#ifdef __ANDROID__
	__android_log_print(ANDROID_LOG_INFO, "OpenDives", "%s", buf);
#else
	if (getenv("OPENDIVES_BT_LOG"))
		fprintf(stderr, "bt: %s\n", buf);
#endif
	if (bt_log_hook)
		bt_log_hook(buf);
}

} // namespace opendives_compat

using namespace opendives_compat;

// --- core/bluetoothaddress.cpp -----------------------------------------------

static std::string trimmed_string(const QString &s)
{
	return s.trimmed().toStdString();
}

bool isBluetoothAddress(const QString &address)
{
	return !extractBluetoothAddress(address).isEmpty();
}

bool isBluetoothLowEnergyAddress(const QString &address)
{
	return address.startsWith("LE:", Qt::CaseInsensitive) && extractBluetoothAddress(address) == address.trimmed();
}

bool isBluetoothClassicAddress(const QString &address)
{
	return address.startsWith("BT:", Qt::CaseInsensitive) && extractBluetoothAddress(address) == address.trimmed();
}

QString bluetoothAddressWithoutPrefix(const QString &address)
{
	return isBluetoothLowEnergyAddress(address) || isBluetoothClassicAddress(address) ? address.mid(3) : address;
}

QString extractBluetoothAddress(const QString &address)
{
	// UUIDs identify BLE devices on Apple platforms and cannot be forced to Classic.
	if (address.contains("BT:{", Qt::CaseInsensitive))
		return {};

	static const std::regex compactMac("^(?:(?:LE|BT):)?[0-9A-F]{12}$", std::regex::icase);
	if (std::regex_search(trimmed_string(address), compactMac))
		return address.trimmed();

	static const std::string macAddress = "(?:(?:[0-9A-F]{2}:){5}[0-9A-F]{2}|(?:[0-9A-F]{2}-){5}[0-9A-F]{2})";
	static const std::regex re("(?:(?:LE|BT):)?" + macAddress +
				   "|(?:LE:)?\\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\\}",
				   std::regex::icase);
	std::smatch m;
	std::string s = address.toStdString();
	if (std::regex_search(s, m, re))
		return QString::fromStdString(m.str(0));
	return {};
}

std::pair<QString, QString> extractBluetoothNameAddress(const QString &address)
{
	QString extractedAddress = extractBluetoothAddress(address);
	if (extractedAddress == address.trimmed())
		return { extractedAddress, QString() };
	if (extractedAddress.isEmpty()) {
		report_info("can't parse address %s", qPrintable(address));
		return { QString(), QString() };
	}

	static const std::regex re("^([^()]+)\\(([^)]*\\))$");
	std::smatch m;
	std::string s = address.toStdString();
	if (std::regex_search(s, m, re))
		return { extractedAddress, QString::fromStdString(m.str(1)).trimmed() };
	report_info("can't parse address %s", qPrintable(address));
	return { QString(), QString() };
}

// --- core/qt-ble.cpp ----------------------------------------------------------

#define BLE_TIMEOUT 12000 // 12 seconds seems like a very long time to wait
#define DEBUG_THRESHOLD 50
static int debugCounter;

#define MAXIMAL_HW_CREDIT	254
#define MINIMAL_HW_CREDIT	32

#define TELIT_DATA_RX    0
#define TELIT_DATA_TX    1
#define TELIT_CREDITS_RX 2
#define TELIT_CREDITS_TX 3

#define UBLOX_DATA_RX    0
#define UBLOX_DATA_TX    0
#define UBLOX_CREDITS_RX 1
#define UBLOX_CREDITS_TX 1

static const char *const telit[] = {
	"00000001-0000-1000-8000-008025000000", // TELIT_DATA_RX
	"00000002-0000-1000-8000-008025000000", // TELIT_DATA_TX
	"00000003-0000-1000-8000-008025000000", // TELIT_CREDITS_RX
	"00000004-0000-1000-8000-008025000000"  // TELIT_CREDITS_TX
};

static const char *const ublox[] = {
	"2456e1b9-26e2-8f83-e744-f34f01e9d703", // UBLOX_DATA_RX, UBLOX_DATA_TX
	"2456e1b9-26e2-8f83-e744-f34f01e9d704"  // UBLOX_CREDITS_RX, UBLOX_CREDITS_TX
};

static const char *const CCCD_UUID = "00002902-0000-1000-8000-00805f9b34fb";

static std::string lower(std::string s)
{
	for (char &c: s)
		c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
	return s;
}

static bool same_uuid(const std::string &a, const char *b)
{
	return lower(a) == lower(b);
}

static std::string to_hex(const Bytes &bytes)
{
	static const char digits[] = "0123456789abcdef";
	std::string out;
	out.reserve(bytes.size() * 2);
	for (unsigned char c: bytes) {
		out += digits[c >> 4];
		out += digits[c & 15];
	}
	return out;
}

// QTime::currentTime().toString(), for the packet log.
static std::string current_time()
{
	using namespace std::chrono;
	auto ms = duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
	time_t t = static_cast<time_t>(ms / 1000);
	struct tm tm;
	localtime_r(&t, &tm);
	char buf[32];
	snprintf(buf, sizeof(buf), "%02d:%02d:%02d.%03d", tm.tm_hour, tm.tm_min, tm.tm_sec, static_cast<int>(ms % 1000));
	return buf;
}

static bool is_hw(const device_data_t &d)
{
	return d.vendor == "Heinrichs Weikamp";
}

static bool is_shearwater(const device_data_t &d)
{
	return d.vendor == "Shearwater";
}

static bool is_garmin(const device_data_t &d)
{
	return d.vendor == "Garmin";
}

static bool is_halcyon(const device_data_t &d)
{
	return d.vendor == "Halcyon";
}

#define ACCESS_NONE  0x00
#define ACCESS_READ  0x01
#define ACCESS_WRITE 0x02

struct uuid_match {
	const char *uuid, *details;
	unsigned int access;
};

static const char *match_uuid_list(const std::string &match, const struct uuid_match *array, unsigned int access)
{
	const char *uuid;

	while ((uuid = array->uuid) != NULL) {
		if (same_uuid(match, uuid) &&
			(access == ACCESS_NONE || array->access & access))
			return array->details;
		array++;
	}
	return NULL;
}

//
// Known BLE GATT service UUID's that we should prefer for the serial
// emulation. Services listed first have higher precendence.
//
static const struct uuid_match serial_service_uuids[] = {
	{ "0000fefb-0000-1000-8000-00805f9b34fb", "Heinrichs-Weikamp (Telit/Stollmann)" },
	{ "2456e1b9-26e2-8f83-e744-f34f01e9d701", "Heinrichs-Weikamp (U-Blox)" },
	{ "544e326b-5b72-c6b0-1c46-41c1bc448118", "Mares BlueLink Pro" },
	{ "98ae7120-e62e-11e3-badd-0002a5d5c51b", "Suunto (EON Steel/Core, G5)" },
	{ "cb3c4555-d670-4670-bc20-b61dbc851e9a", "Pelagic (i770R, i200C, Pro Plus X, Geo 4.0)" },
	{ "ca7b0001-f785-4c38-b599-c7c5fbadb034", "Pelagic (i330R, DSX)" },
	{ "fdcdeaaa-295d-470e-bf15-04217b7aa0a0", "ScubaPro (G2, G3)"},
	{ "fe25c237-0ece-443c-b0aa-e02033e7029d", "Shearwater (Perdix/Teric/Peregrine/Tern)" },
	{ "1aa44039-1667-4b29-87cc-dfecaaf31d97", "Shearwater (Perdix 3)" },
	{ "0000fcef-0000-1000-8000-00805f9b34fb", "Divesoft" },
	{ "6e400001-b5a3-f393-e0a9-e50e24dc10b8", "Cressi"}, // Must have higher priority than Nordic UART
	{ "6e400001-b5a3-f393-e0a9-e50e24dcca9e", "Nordic Semi UART" },
	{ "00000001-8c3b-4f2c-a59e-8c08224f3253", "Halcyon Symbios" },
	{ "84968ffe-d26d-478a-b953-5010bcf58bca", "Seac" },
	{ NULL, }
};

//
// Sometimes we don't know which is the good service, but we can tell
// that a service is NOT a serial service because we've seen that
// people use it for firmware upgrades.
//
static const struct uuid_match upgrade_service_uuids[] = {
	{ "00001530-1212-efde-1523-785feabcd123", "Nordic Upgrade" },
	{ "9e5d1e47-5c13-43a0-8635-82ad38a1386f", "Broadcom Upgrade #1" },
	{ "a86abc2d-d44c-442e-99f7-80059a873e36", "Broadcom Upgrade #2" },
	{ NULL, }
};

static const char *is_known_serial_service(const std::string &service)
{
	return match_uuid_list(service, serial_service_uuids, ACCESS_NONE);
}

static const char *is_known_bad_service(const std::string &service)
{
	return match_uuid_list(service, upgrade_service_uuids, ACCESS_NONE);
}

// QBluetoothUuid::toUInt16(&ok): a 16-bit UUID of the Bluetooth base UUID.
static bool is_standard_uuid(const std::string &uuid)
{
	std::string u = lower(uuid);
	return u.size() == 36 && u.compare(0, 4, "0000") == 0 && u.compare(8, 28, "-0000-1000-8000-00805f9b34fb") == 0;
}

/*
 * The McLean Extreme has just one vendor service, but then inside that
 * service it has several characteristics, and it's not obvious which
 * ones are the read/write ones.
 *
 * So just make sure to skip the ones we don't want.
 *
 * The proper ones are:
 *
 *   Microchip service UUID:  49535343-fe7d-4ae5-8fa9-9fafd205e455
 *            TX characteristic: 49535343-1e4d-4bd9-ba61-23c647249616
 *            RX characteristic: 49535343-8841-43f4-a8d4-ecbe34729bb3
 */
static const struct uuid_match skip_characteristics[] = {
	{ "49535343-6daa-4d02-abf6-19569aca69fe", "McLean Extreme Avoid", ACCESS_READ | ACCESS_WRITE},
	{ "49535343-aca3-481c-91ec-d85e28a60318", "McLean Extreme Avoid", ACCESS_READ | ACCESS_WRITE},
	{ "49535343-026e-3a9b-954c-97daef17e26e", "McLean Extreme Avoid", ACCESS_READ | ACCESS_WRITE},
	{ "49535343-4c8a-39b3-2f49-511cff073b7e", "McLean Extreme Avoid", ACCESS_READ | ACCESS_WRITE},
	{ "00000101-8c3b-4f2c-a59e-8c08224f3253", "Halcyon Symbios Rx", ACCESS_READ},
	{ "00000201-8c3b-4f2c-a59e-8c08224f3253", "Halcyon Symbios Tx", ACCESS_WRITE},
	{ NULL, }
};

// a write characteristic needs Write or WriteNoResponse
static bool is_write_characteristic(const BleCharacteristic &c)
{
	if (match_uuid_list(c.uuid, skip_characteristics, ACCESS_WRITE))
		return false;
	return c.properties & (BLE_PROP_WRITE | BLE_PROP_WRITE_NO_RESPONSE);
}

static bool is_read_characteristic(const BleCharacteristic &c)
{
	if (match_uuid_list(c.uuid, skip_characteristics, ACCESS_READ))
		return false;
	return c.properties & BLE_PROP_READ;
}

// We need a Notify or Indicate for the reading side, and
// a descriptor to enable it
static bool is_notify_characteristic(const BleCharacteristic &c)
{
	if (match_uuid_list(c.uuid, skip_characteristics, ACCESS_READ))
		return false;
	return !c.descriptors.empty() && (c.properties & (BLE_PROP_NOTIFY | BLE_PROP_INDICATE));
}

namespace {

// BLEObject of qt-ble.cpp. The packets Qt queues from its signals
// (characteristicChanged, characteristicRead) are fetched here from the
// platform's queue when a read or a poll waits for one.
class BLEObject {
public:
	BLEObject(BtTransport &t, device_data_t &d) : transport(t), device(d), timeout(BLE_TIMEOUT)
	{
		debugCounter = 0;
	}
	~BLEObject()
	{
		report_info("Deleting BLE object");
		transport.ble_close();
	}
	void set_timeout(int value) { timeout = value; }
	dc_status_t write(const void *data, size_t size, size_t *actual);
	dc_status_t read(void *data, size_t size, size_t *actual);
	dc_status_t get_name(char *res, size_t size);
	dc_status_t read_characteristic(const std::string &uuid, char *res, size_t size);
	dc_status_t poll(int timeout);
	dc_status_t purge(dc_direction_t direction);

	const BleService *preferredService() const { return preferred; }
	void addService(const BleService &newService);
	dc_status_t select_preferred_service();
	dc_status_t setupHwTerminalIo(const std::vector<BleCharacteristic> &allC);
	dc_status_t setHwCredit(unsigned int c);
	dc_status_t enable_notifications(const BleCharacteristic &c);

private:
	void characteristcStateChanged(const std::string &c, const Bytes &value);
	void characteristicWritten(const std::string &c, const Bytes &value);
	// Waits up to `ms` for receivedPackets not to be empty, as WAITFOR() in
	// qt-ble.cpp; false on timeout or disconnection.
	bool wait_for_packet(int ms);

	BtTransport &transport;
	std::vector<BleService> services;
	const BleService *preferred = nullptr;
	std::deque<Bytes> receivedPackets;
	bool notify = false;
	bool disconnected = false;
	device_data_t &device;
	unsigned int hw_credit = 0;
	int timeout;
};

} // namespace

void BLEObject::characteristcStateChanged(const std::string &c, const Bytes &value)
{
	if (verbose > 2 || debugCounter < DEBUG_THRESHOLD)
		bt_log("%s packet RECV %s", current_time().c_str(), to_hex(value).c_str());
	if (is_hw(device)) {
		if (same_uuid(c, telit[TELIT_DATA_TX]) || same_uuid(c, ublox[UBLOX_DATA_TX])) {
			hw_credit--;
			receivedPackets.push_back(value);
			if (hw_credit == MINIMAL_HW_CREDIT)
				setHwCredit(MAXIMAL_HW_CREDIT - MINIMAL_HW_CREDIT);
		} else {
			bt_log("ignore packet from %s %s", c.c_str(), to_hex(value).c_str());
		}
	} else {
		receivedPackets.push_back(value);
	}
}

void BLEObject::characteristicWritten(const std::string &c, const Bytes &value)
{
	if (is_hw(device)) {
		if (same_uuid(c, telit[TELIT_CREDITS_RX]) || same_uuid(c, ublox[UBLOX_CREDITS_RX])) {
			// value.toHex().toInt(&ok, 16)
			unsigned int credits = 0;
			for (unsigned char b: value)
				credits = credits << 8 | b;
			hw_credit += credits;
		}
	} else {
		if (verbose > 2 || debugCounter < DEBUG_THRESHOLD)
			bt_log("BLEObject::characteristicWritten");
	}
}

bool BLEObject::wait_for_packet(int ms)
{
	auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(ms);
	while (receivedPackets.empty() && !disconnected) {
		int left = static_cast<int>(
			std::chrono::duration_cast<std::chrono::milliseconds>(deadline - std::chrono::steady_clock::now()).count());
		if (left <= 0)
			break;
		std::string c;
		Bytes value;
		int r = transport.ble_receive(c, value, left);
		if (r < 0) {
			// OpenDives: Qt has no such answer; the wait would run to its
			// end. Stop at once instead.
			disconnected = true;
			bt_transport_error = true;
			bt_log("%s device disconnected (%s)", current_time().c_str(), transport.last_error().c_str());
		} else if (r > 0) {
			characteristcStateChanged(c, value);
		}
	}
	return !receivedPackets.empty();
}

void BLEObject::addService(const BleService &newService)
{
	const char *details;

	bt_log("Found service %s", newService.uuid.c_str());

	//
	// Known bad service that we should ignore?
	// (typically firmware update service).
	//
	details = is_known_bad_service(newService.uuid);
	if (details) {
		bt_log(" .. ignoring service %s", details);
		return;
	}

	// Note that if it's not _known_ to be good, we'll ignore
	// any standard services. They are usually things like battery
	// status or device name services.
	//
	// But Heinrich-Weicamp actually has a standard service ID in the
	// known good category, because Telit/Stollmann (the manufacturer)
	// applied for a UUID for its product.
	//
	// If it's not a known service, and not a standard one, we'll just
	// add it to the list and then we'll try our heuristics on that
	// list.
	//
	details = is_known_serial_service(newService.uuid);
	if (details) {
		bt_log(" .. recognized service %s", details);
	} else {
		if (is_standard_uuid(newService.uuid)) {
			bt_log(" .. ignoring standard service");
			return;
		}
	}

	services.push_back(newService);
}

dc_status_t BLEObject::write(const void *data, size_t size, size_t *actual)
{
	if (actual) *actual = 0;

	for (const BleCharacteristic &c: preferredService()->characteristics) {
		if (!is_write_characteristic(c))
			continue;

		Bytes bytes((const unsigned char *)data, (const unsigned char *)data + size);
		if (verbose > 2 || debugCounter < DEBUG_THRESHOLD)
			bt_log("%s packet SEND %s", current_time().c_str(), to_hex(bytes).c_str());

		bool with_response = !(c.properties & BLE_PROP_WRITE_NO_RESPONSE);

		// OpenDives: Qt queues the write and returns; Android allows one GATT
		// operation at a time, so the platform waits until it is sent.
		if (!transport.ble_write(preferredService()->uuid, c.uuid, bytes, with_response, BLE_TIMEOUT)) {
			bt_log("%s write failed: %s", current_time().c_str(), transport.last_error().c_str());
			bt_transport_error = true;
			return DC_STATUS_IO;
		}
		characteristicWritten(c.uuid, bytes);
		if (actual) *actual = size;
		return DC_STATUS_SUCCESS;
	}

	return DC_STATUS_IO;
}

dc_status_t BLEObject::poll(int timeout)
{
	if (receivedPackets.empty()) {
		if (preferredService()->characteristics.empty())
			return DC_STATUS_IO;

		if (verbose > 2 || debugCounter < DEBUG_THRESHOLD)
			bt_log("%s packet WAIT", current_time().c_str());

		wait_for_packet(timeout);
		if (receivedPackets.empty()) {
			bt_transport_error = true; // no answer, or disconnected
			return disconnected ? DC_STATUS_IO : DC_STATUS_TIMEOUT;
		}
	}

	return DC_STATUS_SUCCESS;
}

dc_status_t BLEObject::purge(dc_direction_t direction)
{
	if (direction & DC_DIRECTION_INPUT)
		receivedPackets.clear();

	return DC_STATUS_SUCCESS;
}

dc_status_t BLEObject::read(void *data, size_t size, size_t *actual)
{
	dc_status_t rc = DC_STATUS_SUCCESS;

	if (actual)
		*actual = 0;

	if (!notify) {
		bool found = false;
		const BleService *service = preferredService();
		for (const BleCharacteristic &ch: service->characteristics) {
			if (!is_read_characteristic(ch))
				continue;

			bt_log("Reading BLE characteristic %s", ch.uuid.c_str());
			// Qt's characteristicRead signal queues the value.
			Bytes value;
			if (transport.ble_read(service->uuid, ch.uuid, value, timeout))
				characteristcStateChanged(ch.uuid, value);
			found = true;
			break;
		}

		if (!found) {
			report_error("No read characteristic found.");
			return DC_STATUS_IO;
		}
	}

	// Wait for a packet
	rc = poll(timeout);
	if (rc != DC_STATUS_SUCCESS)
		return rc;

	Bytes packet = std::move(receivedPackets.front());
	receivedPackets.pop_front();

	// Did we get more than asked for?
	// Truncate the packet and report the error.
	if (packet.size() > size) {
		report_error("%s packet too large (%llu %llu)", current_time().c_str(), (long long) packet.size(), (long long) size);
		packet.resize(size);
		rc = DC_STATUS_IO;
	}

	memcpy((char *)data, packet.data(), packet.size());
	if (actual)
		*actual += packet.size();

	if (verbose > 2 || debugCounter < DEBUG_THRESHOLD)
		bt_log("%s packet READ %s", current_time().c_str(), to_hex(packet).c_str());

	return rc;
}

//
// select_preferred_service() gets called after all services
// have been discovered.
//
// The role of this function is to pick the preferred service.
//
// NOTE! Picking the preferred service is divecomputer-specific.
// Right now we special-case the HW known service number, but for
// others we just pick the first one that isn't a standard service.
//
// That's wrong, but works for the simple case.
//
dc_status_t BLEObject::select_preferred_service()
{
	// Discard every other service if a known service is found
	const BleService *known = NULL;
	for (const BleService &s: services) {
		const struct uuid_match *array = serial_service_uuids;
		const char *uuid;

		// prioritize known services according to their ordering in serial_service_uuids
		while ((uuid = array->uuid) != NULL) {
			if (same_uuid(s.uuid, uuid)) {
				known = &s;
				break;
			}
			array++;
		}
		if (known) {
			break;
		}
	}
	if (known) {
		BleService keep = *known;
		services.clear();
		services.push_back(std::move(keep));
	}

	// Print out the services for debugging
	for (const BleService &s: services) {
		bt_log("Found service %s", s.uuid.c_str());

		for (const BleCharacteristic &c: s.characteristics) {
			bt_log("   c: %s 0x%02x", c.uuid.c_str(), c.properties);

			for (const std::string &d: c.descriptors)
				bt_log("        d: %s", d.c_str());
		}
	}

	// Pick the preferred one
	for (const BleService &s: services) {
		bool hasnotify = false;
		bool hasread = false;
		bool haswrite = false;

		for (const BleCharacteristic &c: s.characteristics) {
			hasnotify |= is_notify_characteristic(c);
			hasread |= is_read_characteristic(c);
			haswrite |= is_write_characteristic(c);
		}

		if (!hasnotify && !hasread) {
			bt_log(" .. ignoring service without read/notify characteristic %s", s.uuid.c_str());
			continue;
		}

		if (!haswrite) {
			bt_log(" .. ignoring service without write characteristic %s", s.uuid.c_str());
			continue;
		}

		// We now know that the service has both read and write characteristics
		preferred = &s;
		notify = hasnotify;
		bt_log("Using service %s as preferred service", s.uuid.c_str());
		break;
	}

	if (!preferred) {
		bt_log("failed to find suitable service");
		report_error("Failed to find suitable BLE GATT service");
		return DC_STATUS_IO;
	}

	return DC_STATUS_SUCCESS;
}

dc_status_t BLEObject::setHwCredit(unsigned int c)
{
	/* The Terminal I/O client transmits initial UART credits to the server (see 6.5).
	 *
	 * Notice that we have to write to the characteristic here, and not to its
	 * descriptor as for the enabeling of notifications or indications.
	 */

	const std::vector<BleCharacteristic> &list = preferredService()->characteristics;
	int credits_rx = list.size() == 4 ? TELIT_CREDITS_RX : UBLOX_CREDITS_RX;
	Bytes value(1, static_cast<unsigned char>(c));

	/* And wait for the answer*/
	if (!transport.ble_write(preferredService()->uuid, list[credits_rx].uuid, value, true, BLE_TIMEOUT))
		return DC_STATUS_TIMEOUT;
	characteristicWritten(list[credits_rx].uuid, value);
	return DC_STATUS_SUCCESS;
}

dc_status_t BLEObject::setupHwTerminalIo(const std::vector<BleCharacteristic> &allC)
{	/* This initalizes the Terminal I/O client as described in
	 * http://www.telit.com/fileadmin/user_upload/products/Downloads/sr-rf/BlueMod/TIO_Implementation_Guide_r04.pdf
	 * Referenced section numbers below are from that document.
	 *
	 * This is for all HW computers, that use referenced BT/BLE hardware module from Telit
	 * (formerly Stollmann). The 16 bit UUID 0xFEFB (or a derived 128 bit UUID starting with
	 * 0x0000FEFB is a clear indication that the OSTC is equipped with this BT/BLE hardware.
	 */

	if (allC.size() != 4 && allC.size() != 2) {
		bt_log("This should not happen. HW/OSTC BT/BLE device without 2(UBLOX) or 4(TELIT) Characteristics");
		return DC_STATUS_IO;
	}

	/* The Terminal I/O client subscribes to indications of the UART credits TX
	 * characteristic (see 6.4).
	 *
	 * Notice that indications are subscribed to by writing 0x0200 to its descriptor. This
	 * can be understood by looking for Client Characteristic Configuration, Assigned
	 * Number: 0x2902. Enabling/Disabeling is setting the proper bit, and they
	 * differ for indications and notifications.
	 */
	int credits_tx = allC.size() == 4 ? TELIT_CREDITS_TX : UBLOX_CREDITS_TX;
	if (allC[credits_tx].descriptors.empty())
		return DC_STATUS_IO;
	// OpenDives: Qt does not wait for these two writes; a failure is only logged.
	if (!transport.ble_write_descriptor(preferredService()->uuid, allC[credits_tx].uuid, allC[credits_tx].descriptors.front(),
					    Bytes{ 0x02, 0x00 }, BLE_TIMEOUT))
		bt_log("credits TX descriptor write not confirmed: %s", transport.last_error().c_str());

	/* The Terminal I/O client subscribes to notifications of the UART data TX
	 * characteristic (see 6.2).
	 */
	int data_tx = allC.size() == 4 ? TELIT_DATA_TX : UBLOX_DATA_TX;
	if (allC[data_tx].descriptors.empty())
		return DC_STATUS_IO;
	if (!transport.ble_write_descriptor(preferredService()->uuid, allC[data_tx].uuid, allC[data_tx].descriptors.front(),
					    Bytes{ 0x01, 0x00 }, BLE_TIMEOUT))
		bt_log("data TX descriptor write not confirmed: %s", transport.last_error().c_str());

	/* The Terminal I/O client transmits initial UART credits to the server (see 6.5). */
	return setHwCredit(MAXIMAL_HW_CREDIT);
}

// The notification part of qt_ble_open().
dc_status_t BLEObject::enable_notifications(const BleCharacteristic &c)
{
	bt_log("Using read characteristic %s", c.uuid.c_str());

	std::string d = c.descriptors.front();
	for (const std::string &tmp: c.descriptors) {
		if (same_uuid(tmp, CCCD_UUID)) {
			d = tmp;
			break;
		}
	}

	Bytes value = c.properties & BLE_PROP_NOTIFY ? Bytes{ 0x01, 0x00 } : Bytes{ 0x02, 0x00 };

	// The CCCD write confirmation (descriptorWritten) can take well
	// over 1 s on the Qt6 Android backend (MTU/connection-parameter
	// negotiation) and the request is sometimes dropped silently.
	// Retry a few times and wait up to the normal BLE_TIMEOUT each go.
	const int maxAttempts = 3;
	bool enabled = false;
	for (int attempt = 0; attempt < maxAttempts && !enabled; attempt++) {
		bt_log("writing \"0x%s\" to descriptor %s (attempt %d/%d)", to_hex(value).c_str(), d.c_str(), attempt + 1,
		       maxAttempts);
		enabled = transport.ble_write_descriptor(preferredService()->uuid, c.uuid, d, value, BLE_TIMEOUT);
		if (!enabled)
			bt_log("..CCCD write not confirmed within %d ms, retrying (%s)", BLE_TIMEOUT,
			       transport.last_error().c_str());
	}
	if (!enabled) {
		bt_log("Bluetooth: Failed to enable notifications for characteristic %s", c.uuid.c_str());
		report_error("Bluetooth: Failed to enable notifications.");
		bt_transport_error = true;
		return DC_STATUS_TIMEOUT;
	}
	return DC_STATUS_SUCCESS;
}

// Bluez is broken, and doesn't have a sane way to query
// whether to use a random address or not. So we have to
// fake it.
//
// For devices other than the Shearwater and Garmin ones handled in
// use_random_address(), look at the address itself. A public address
// starts with an IEEE-assigned OUI, which always has the multicast
// (0x01) and locally administered (0x02) bits of the first byte clear.
// A random address only defines the top two bits of that byte, the
// rest is random. So if either of the low two bits is set, it can't
// be a public address. This catches three out of four random addresses;
// for the rest we keep assuming public.
static bool looks_like_random_address(const char *devaddr)
{
	unsigned int first;
	if (strlen(devaddr) != 17 || sscanf(devaddr, "%2x", &first) != 1)
		return false;
	return first & 0x03;
}

static int use_random_address(const device_data_t &user_device, const char *devaddr)
{
	return is_shearwater(user_device) || is_garmin(user_device) || is_halcyon(user_device) || looks_like_random_address(devaddr);
}

static dc_status_t qt_ble_open(void **io, dc_context_t *, const char *devaddr, device_data_t *user_device)
{
	debugCounter = 0;
	BtTransport *transport = bt_transport();
	if (!transport) {
		report_error("No Bluetooth transport");
		return DC_STATUS_IO;
	}

	/*
	 * LE-only devices get the "LE:" prepended by the scanning
	 * code, so that the rfcomm code can see they only do LE.
	 *
	 * We just skip that prefix (and it doesn't always exist,
	 * since the device may support both legacy BT and LE).
	 */
	if (!strncmp(devaddr, "LE:", 3))
		devaddr += 3;

	bool random = use_random_address(*user_device, devaddr);
	bt_log("qt_ble_open(%s)%s", devaddr, random ? ", random address type" : "");

	// Try to connect to the device
	if (!transport->ble_connect(devaddr, random, BLE_TIMEOUT)) {
		bt_log("failed to connect to the controller %s with error %s", devaddr, transport->last_error().c_str());
		report_error("Failed to connect to %s: '%s'", devaddr, transport->last_error().c_str());
		bt_transport_error = true;
		transport->ble_close();
		return DC_STATUS_IO;
	}
	bt_log("connected to the controller for device %s", devaddr);

	BLEObject *ble = new BLEObject(*transport, *user_device);

	// Finish discovering the services, then add all those services and discover their characteristics.
	std::vector<BleService> discovered;
	if (!transport->ble_discover(discovered, BLE_TIMEOUT))
		bt_log("  .. even after waiting for the full BLE timeout, controller is still in discovering state (%s)",
		       transport->last_error().c_str());
	bt_log("finished service discovery, start discovering characteristics");
	for (const BleService &s: discovered)
		ble->addService(s);

	bt_log(" .. done discovering services");

	dc_status_t error = ble->select_preferred_service();

	if (error != DC_STATUS_SUCCESS) {
		bt_log("Failed to find suitable service on '%s'", devaddr);
		report_error("Failed to find suitable service on '%s'", devaddr);
		delete ble;
		return error;
	}

	bt_log(" .. enabling notifications");

	/* Enable notifications */
	const std::vector<BleCharacteristic> &list = ble->preferredService()->characteristics;
	if (is_hw(*user_device)) {
		dc_status_t r = ble->setupHwTerminalIo(list);
		if (r != DC_STATUS_SUCCESS) {
			delete ble;
			return r;
		}
	} else {
		for (const BleCharacteristic &c: list) {
			if (!is_notify_characteristic(c))
				continue;
			dc_status_t r = ble->enable_notifications(c);
			if (r != DC_STATUS_SUCCESS) {
				delete ble;
				return r;
			}
			break;
		}
	}

	// Fill in info
	*io = (void *)ble;
	return DC_STATUS_SUCCESS;
}

static dc_status_t qt_ble_close(void *io)
{
	BLEObject *ble = (BLEObject *) io;

	delete ble;

	return DC_STATUS_SUCCESS;
}

static void checkThreshold()
{
	if (++debugCounter == DEBUG_THRESHOLD)
		bt_log("turning off further BT debug output");
}

/*
 * NOTE! The 'set_timeout()' function only affects the timeout
 * for qt_ble_read(), not for the various general BLE operations.
 */
static dc_status_t qt_ble_set_timeout(void *io, int timeout)
{
	BLEObject *ble = (BLEObject *) io;
	ble->set_timeout(timeout);
	return DC_STATUS_SUCCESS;
}

static dc_status_t qt_ble_read(void *io, void* data, size_t size, size_t *actual)
{
	checkThreshold();
	BLEObject *ble = (BLEObject *) io;
	dc_status_t rc = ble->read(data, size, actual);
	if (bt_io_hook)
		bt_io_hook();
	return rc;
}

static dc_status_t qt_ble_write(void *io, const void* data, size_t size, size_t *actual)
{
	checkThreshold();
	BLEObject *ble = (BLEObject *) io;
	return ble->write(data, size, actual);
}

static dc_status_t qt_ble_poll(void *io, int timeout)
{
	BLEObject *ble = (BLEObject *) io;

	return ble->poll(timeout);
}

static dc_status_t qt_ble_purge(void *io, dc_direction_t direction)
{
	BLEObject *ble = (BLEObject *) io;
	return ble->purge(direction);
}

dc_status_t BLEObject::get_name(char *data, size_t size)
{
	if (device.btname.empty())
		return DC_STATUS_UNSUPPORTED;
	strncpy(data, device.btname.c_str(), size);
	return DC_STATUS_SUCCESS;
}

dc_status_t BLEObject::read_characteristic(const std::string &uuid, char *res, size_t size)
{
	const BleService *s = preferredService();
	if (!s) {
		return DC_STATUS_NODEVICE;
	}

	for (const BleCharacteristic &ch: s->characteristics) {
		if (!same_uuid(ch.uuid, uuid.c_str())) {
			continue;
		}
		bt_log("Reading BLE characteristic %s", uuid.c_str());
		// The value is consumed here so that it does not leak into the
		// data-transfer queue used by subsequent dc_iostream_read calls.
		Bytes val;
		if (!transport.ble_read(s->uuid, ch.uuid, val, timeout)) {
			report_error("Timeout reading characteristic %s", uuid.c_str());
			return DC_STATUS_TIMEOUT;
		}
		if (val.size() != size) {
			report_error("Unexpected read characteristic size (%lld): expected %lld", (long long)val.size(), (long long)size);
			return DC_STATUS_DATAFORMAT;
		}
		bt_log("Obtained characteristic value: %s", to_hex(val).c_str());
		memcpy(res, val.data(), size);
		return DC_STATUS_SUCCESS;
	}

	// Not found
	report_error("characteristic %s not found", uuid.c_str());
	return DC_STATUS_NOACCESS;
}

static dc_status_t qt_ble_ioctl(void *io, unsigned int request, void *data, size_t size)
{
	BLEObject *ble = (BLEObject *) io;
	switch (request) {
	case DC_IOCTL_BLE_GET_NAME:
		return ble->get_name((char *) data, size);
	case DC_IOCTL_BLE_CHARACTERISTIC_READ: {
		if (size < sizeof(dc_ble_uuid_t))
			return DC_STATUS_INVALIDARGS;
		char uuid[DC_BLE_UUID_SIZE];
		if (!dc_ble_uuid2str((const unsigned char *)data, uuid, sizeof(uuid)))
			return DC_STATUS_INVALIDARGS;
		size_t readsize = size - sizeof(dc_ble_uuid_t);
		char *p = ((char*)data) + sizeof(dc_ble_uuid_t);
		return ble->read_characteristic(uuid, p, readsize);
	}
	default:
		bt_log("ioctl 0x%08x not supported", request);
		return DC_STATUS_UNSUPPORTED;
	}
}

#ifdef __ANDROID__
// --- core/serial_usb_android.cpp: USB serial cables, not supported -----------
// Only reached when device_data_t.androidUsbDeviceDescriptor is set, which
// OpenDives never does: downloads go over Bluetooth only.
dc_status_t serial_usb_android_open(dc_iostream_t **, dc_context_t *, void *)
{
	return DC_STATUS_UNSUPPORTED;
}
#endif

// --- core/qtserialbluetooth.cpp ----------------------------------------------

struct qt_serial_t {
	BtTransport *socket;
	long timeout;
};

static dc_status_t qt_serial_open(qt_serial_t **io, dc_context_t*, const char *devaddr)
{
	BtTransport *transport = bt_transport();
	if (!transport) {
		report_error("No Bluetooth transport");
		return DC_STATUS_IO;
	}

	// Allocate memory.
	qt_serial_t *serial_port = (qt_serial_t *) malloc (sizeof (qt_serial_t));
	if (serial_port == NULL) {
		return DC_STATUS_NOMEMORY;
	}

	// Default to blocking reads.
	serial_port->timeout = -1;
	serial_port->socket = transport;

	auto start = std::chrono::steady_clock::now();
	bt_log("connecting to Uuid 00001101-0000-1000-8000-00805f9b34fb at %s", devaddr);
	// Five seconds, then "the connection step took more than expected. Wait
	// another 20 seconds": 25 seconds in all.
	int msec = 5000;
	if (!transport->rfcomm_connect(devaddr, 5 * msec)) {
		long long elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
		bt_log("Failed to connect to device %s after %lld ms. Error: %s", devaddr, elapsed, transport->last_error().c_str());
		transport->rfcomm_close();
		free (serial_port);
		return DC_STATUS_IO;
	}

	*io = serial_port;

	return DC_STATUS_SUCCESS;
}

static dc_status_t qt_serial_close(void *io)
{
	qt_serial_t *device = (qt_serial_t*) io;

	if (device == NULL)
		return DC_STATUS_SUCCESS;

	device->socket->rfcomm_close();
	free(device);

	return DC_STATUS_SUCCESS;
}

static dc_status_t qt_serial_read(void *io, void* data, size_t size, size_t *actual)
{
	qt_serial_t *device = (qt_serial_t*) io;

	if (device == NULL || device->socket == NULL || !actual)
		return DC_STATUS_INVALIDARGS;

	*actual = 0;
	if (!size)
		return DC_STATUS_SUCCESS;

	// The bytes waiting, else the first ones received within the timeout.
	int rc = device->socket->rfcomm_read((unsigned char *) data, size, static_cast<int>(device->timeout));
	if (bt_io_hook)
		bt_io_hook();
	if (rc < 0)
		return DC_STATUS_IO;
	if (rc == 0)
		return DC_STATUS_TIMEOUT;
	*actual = rc;
	return DC_STATUS_SUCCESS;
}

static dc_status_t qt_serial_write(void *io, const void* data, size_t size, size_t *actual)
{
	qt_serial_t *device = (qt_serial_t*) io;

	if (device == NULL || device->socket == NULL || !actual)
		return DC_STATUS_INVALIDARGS;

	*actual = 0;
	int rc = device->socket->rfcomm_write((const unsigned char *) data, size);
	if (rc < 0)
		return DC_STATUS_IO;

	*actual = rc;
	return rc ? DC_STATUS_SUCCESS : DC_STATUS_IO;
}

static dc_status_t qt_serial_poll(void *io, int timeout)
{
	qt_serial_t *device = (qt_serial_t*) io;

	if (!device)
		return DC_STATUS_INVALIDARGS;

	if (!device->socket)
		return DC_STATUS_INVALIDARGS;

	// Waits for readyRead. OpenDives: bytes already waiting count too.
	auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout < 0 ? 0 : timeout);
	for (;;) {
		if (device->socket->rfcomm_available() > 0)
			return DC_STATUS_SUCCESS;
		if (timeout >= 0 && std::chrono::steady_clock::now() >= deadline)
			return DC_STATUS_TIMEOUT;
		std::this_thread::sleep_for(std::chrono::milliseconds(10));
	}
}

static dc_status_t qt_serial_ioctl(void *, unsigned int, void *, size_t)
{
	return DC_STATUS_UNSUPPORTED;
}

static dc_status_t qt_serial_purge(void *io, dc_direction_t)
{
	qt_serial_t *device = (qt_serial_t*) io;

	if (device == NULL)
		return DC_STATUS_INVALIDARGS;
	// TODO: add implementation

	return DC_STATUS_SUCCESS;
}

static dc_status_t qt_serial_get_available(void *io, size_t *available)
{
	qt_serial_t *device = (qt_serial_t*) io;

	if (device == NULL || device->socket == NULL)
		return DC_STATUS_INVALIDARGS;

	*available = device->socket->rfcomm_available();

	return DC_STATUS_SUCCESS;
}

static dc_status_t qt_serial_set_timeout(void *io, int timeout)
{
	qt_serial_t *device = (qt_serial_t*) io;

	if (device == NULL)
		return DC_STATUS_INVALIDARGS;

	device->timeout = timeout;

	return DC_STATUS_SUCCESS;
}

static dc_status_t qt_custom_sleep(void *, unsigned int timeout)
{
	std::this_thread::sleep_for(std::chrono::milliseconds(timeout));
	return DC_STATUS_SUCCESS;
}

dc_status_t
ble_packet_open(dc_iostream_t **iostream, dc_context_t *context, const char* devaddr, void *userdata)
{
	dc_status_t rc = DC_STATUS_SUCCESS;
	void *io = NULL;

	static const dc_custom_cbs_t callbacks = {
		.set_timeout	= qt_ble_set_timeout,
		.set_break	= nullptr,
		.set_dtr	= nullptr,
		.set_rts	= nullptr,
		.get_lines	= nullptr,
		.get_available	= nullptr,
		.configure	= nullptr,
		.poll		= qt_ble_poll,
		.read		= qt_ble_read,
		.write		= qt_ble_write,
		.ioctl		= qt_ble_ioctl,
		.flush		= nullptr,
		.purge		= qt_ble_purge,
		.sleep		= qt_custom_sleep,
		.close		= qt_ble_close,
	};

	if (bt_state_hook)
		bt_state_hook("connecting");
	rc = qt_ble_open(&io, context, devaddr, (device_data_t *) userdata);
	if (rc != DC_STATUS_SUCCESS) {
		return rc;
	}

	rc = dc_custom_open (iostream, context, DC_TRANSPORT_BLE, &callbacks, io);
	if (rc == DC_STATUS_SUCCESS && bt_state_hook)
		bt_state_hook("connected");
	return rc;
}

dc_status_t
rfcomm_stream_open(dc_iostream_t **iostream, dc_context_t *context, const char* devaddr)
{
	dc_status_t rc = DC_STATUS_SUCCESS;
	qt_serial_t *io = NULL;

	static const dc_custom_cbs_t callbacks = {
		.set_timeout	= qt_serial_set_timeout,
		.set_break	= nullptr,
		.set_dtr	= nullptr,
		.set_rts	= nullptr,
		.get_lines	= nullptr,
		.get_available	= qt_serial_get_available,
		.configure	= nullptr,
		.poll		= qt_serial_poll,
		.read		= qt_serial_read,
		.write		= qt_serial_write,
		.ioctl		= qt_serial_ioctl,
		.flush		= nullptr,
		.purge		= qt_serial_purge,
		.sleep		= qt_custom_sleep,
		.close		= qt_serial_close,
	};

	if (bt_state_hook)
		bt_state_hook("connecting");
	rc = qt_serial_open(&io, context, devaddr);
	if (rc != DC_STATUS_SUCCESS) {
		return rc;
	}

	rc = dc_custom_open (iostream, context, DC_TRANSPORT_BLUETOOTH, &callbacks, io);
	if (rc == DC_STATUS_SUCCESS && bt_state_hook)
		bt_state_hook("connected");
	return rc;
}
