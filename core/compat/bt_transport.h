// SPDX-License-Identifier: GPL-2.0
// Bluetooth transport of the platform, used by bluetooth_compat.cpp (the port
// of Subsurface's core/qt-ble.cpp and core/qtserialbluetooth.cpp without Qt).
//
// Subsurface drives the system Bluetooth through Qt; OpenDives drives it
// through the platform's own API (Android: android.bluetooth, in Kotlin, see
// plugins/opendives-core/android/.../BluetoothTransport.kt). The platform only
// provides the primitive operations below, each one synchronous and blocking
// the calling thread (the core's thread) until it is done or its timeout
// expires. Everything that Subsurface decides (which GATT service and
// characteristics to use, notifications, credits of the Heinrichs Weikamp
// modules, timeouts) is in bluetooth_compat.cpp, as in Subsurface.
#ifndef OPENDIVES_BT_TRANSPORT_H
#define OPENDIVES_BT_TRANSPORT_H

#include <cstddef>
#include <string>
#include <vector>

namespace opendives_compat {

// Characteristic properties, as Bluetooth defines them (the same bits in Qt's
// QLowEnergyCharacteristic and Android's BluetoothGattCharacteristic).
enum : unsigned {
	BLE_PROP_READ = 0x02,
	BLE_PROP_WRITE_NO_RESPONSE = 0x04,
	BLE_PROP_WRITE = 0x08,
	BLE_PROP_NOTIFY = 0x10,
	BLE_PROP_INDICATE = 0x20,
};

// UUIDs are written in lower case, 36 characters
// ("0000fefb-0000-1000-8000-00805f9b34fb").
struct BleCharacteristic {
	std::string uuid;
	unsigned properties = 0;
	std::vector<std::string> descriptors; // in the order the device gives them
};

struct BleService {
	std::string uuid;
	std::vector<BleCharacteristic> characteristics; // in the order the device gives them
};

using Bytes = std::vector<unsigned char>;

class BtTransport {
public:
	virtual ~BtTransport() = default;

	// --- Bluetooth Low Energy (GATT client) ---
	// Connects to `address` (a MAC address, without "LE:"); `random_address`
	// as Subsurface's use_random_address(). True once connected.
	virtual bool ble_connect(const std::string &address, bool random_address, int timeout_ms) = 0;
	// Discovers every service with its characteristics and descriptors.
	virtual bool ble_discover(std::vector<BleService> &services, int timeout_ms) = 0;
	// Writes a descriptor and waits for its confirmation. For the Client
	// Characteristic Configuration descriptor (0x2902), the platform also
	// subscribes locally to the characteristic's notifications or indications.
	virtual bool ble_write_descriptor(const std::string &service, const std::string &characteristic,
					  const std::string &descriptor, const Bytes &value, int timeout_ms) = 0;
	// Writes a characteristic, with or without response, and waits until the
	// platform has sent it.
	virtual bool ble_write(const std::string &service, const std::string &characteristic, const Bytes &data,
			       bool with_response, int timeout_ms) = 0;
	// Reads a characteristic's value.
	virtual bool ble_read(const std::string &service, const std::string &characteristic, Bytes &value,
			      int timeout_ms) = 0;
	// The next notification or indication received, in order of arrival:
	// 1 with its characteristic and data, 0 after timeout_ms without one, -1
	// when the device is disconnected or the download was cancelled.
	virtual int ble_receive(std::string &characteristic, Bytes &data, int timeout_ms) = 0;
	virtual void ble_close() = 0;

	// --- Bluetooth Classic, serial port profile (RFCOMM) ---
	virtual bool rfcomm_connect(const std::string &address, int timeout_ms) = 0;
	// Bytes received, at most `size`, waiting up to timeout_ms (negative: no
	// limit) for the first one: the number of bytes, 0 after the timeout, -1
	// on error (disconnected, cancelled).
	virtual int rfcomm_read(unsigned char *data, size_t size, int timeout_ms) = 0;
	// Bytes written, or -1.
	virtual int rfcomm_write(const unsigned char *data, size_t size) = 0;
	// Bytes received and not read yet.
	virtual size_t rfcomm_available() = 0;
	virtual void rfcomm_close() = 0;

	// The platform's text for the last failure, for the log.
	virtual std::string last_error() { return std::string(); }
};

// The transport used by ble_packet_open() and rfcomm_stream_open(); set by the
// platform before a download, nullptr afterwards. Not owned.
void set_bt_transport(BtTransport *transport);
BtTransport *bt_transport();

// Called after every read of the Bluetooth stream, on the download's thread,
// so that the download can report its progress (download.cpp).
extern void (*bt_io_hook)();

// Called once the Bluetooth stream is open (connected, service chosen), and
// with "connecting" before.
extern void (*bt_state_hook)(const char *state);

// The Bluetooth log: logcat tag "OpenDives" on Android; stderr elsewhere when
// the environment variable OPENDIVES_BT_LOG is set. A hook, if set, gets
// every line too (tests).
void bt_log(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
extern void (*bt_log_hook)(const std::string &line);

} // namespace opendives_compat

#endif
