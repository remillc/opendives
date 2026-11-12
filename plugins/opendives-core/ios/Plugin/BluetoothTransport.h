// SPDX-License-Identifier: GPL-2.0
// The Bluetooth primitives of core/compat/bt_transport.h on iOS, with
// CoreBluetooth (the counterpart of the Android BluetoothTransport.kt).
// Pure C++ on purpose: the CoreBluetooth objects live in BluetoothTransport.mm.
#ifndef OPENDIVES_IOS_BLUETOOTH_TRANSPORT_H
#define OPENDIVES_IOS_BLUETOOTH_TRANSPORT_H

#include <memory>
#include <string>
#include <vector>

#include "core/compat/bt_transport.h"

namespace opendives_compat {

// Every BtTransport call blocks the calling thread (the core's thread);
// CoreBluetooth's delegates run on a private serial queue. Bluetooth Classic
// does not exist for iOS apps: the rfcomm_* calls fail.
//
// The address given to ble_connect() is what the scan reports as "mac": the
// CBPeripheral identifier as "{UUID}" (the form Subsurface uses on Apple
// platforms); "LE:" in front, braces or none are all accepted.
class IosBluetoothTransport : public BtTransport {
public:
	IosBluetoothTransport();
	~IosBluetoothTransport() override;
	IosBluetoothTransport(const IosBluetoothTransport &) = delete;
	IosBluetoothTransport &operator=(const IosBluetoothTransport &) = delete;

	// Starts a new download: nothing cancelled, no error. Call before each download.
	void reset();
	// Ends every wait at once (any thread); ble_receive() then returns -1.
	void cancel();

	bool ble_connect(const std::string &address, bool random_address, int timeout_ms) override;
	bool ble_discover(std::vector<BleService> &services, int timeout_ms) override;
	bool ble_write_descriptor(const std::string &service, const std::string &characteristic,
				  const std::string &descriptor, const Bytes &value, int timeout_ms) override;
	bool ble_write(const std::string &service, const std::string &characteristic, const Bytes &data,
		       bool with_response, int timeout_ms) override;
	bool ble_read(const std::string &service, const std::string &characteristic, Bytes &value,
		      int timeout_ms) override;
	int ble_receive(std::string &characteristic, Bytes &data, int timeout_ms) override;
	void ble_close() override;

	bool rfcomm_connect(const std::string &address, int timeout_ms) override;
	int rfcomm_read(unsigned char *data, size_t size, int timeout_ms) override;
	int rfcomm_write(const unsigned char *data, size_t size) override;
	size_t rfcomm_available() override;
	void rfcomm_close() override;

	std::string last_error() override;

	struct Impl; // public only so that the Objective-C delegate can name it

private:
	std::unique_ptr<Impl> impl_;
};

} // namespace opendives_compat

#endif
