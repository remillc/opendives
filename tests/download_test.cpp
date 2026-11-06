// SPDX-License-Identifier: GPL-2.0
// Download from a dive computer without hardware: the port of Subsurface's
// Bluetooth code (core/compat/bluetooth_compat.cpp) driven through
// libdivecomputer's custom I/O by a scripted fake transport, the dive
// computer names (download.cpp), the download's failure paths, and the import
// of downloaded dives as one undoable step.
// usage: download <a log the core reads> <other dives to import>
//   e.g. build/poc/download third_party/subsurface/dives/SampleDivesV2.ssrf \
//        third_party/subsurface/dives/TestDiveDivelogsDE.xml
#include "../core/libopendives/opendives.h"
#include "../core/libopendives/internal.h"
#include "core/compat/bt_transport.h"

#include "core/bluetoothaddress.h"
#include "core/device.h"
#include "core/divelog.h"
#include "core/file.h"
#include "core/libdivecomputer.h"
#include "core/pref.h"

#include <libdivecomputer/ble.h>
#include <libdivecomputer/context.h>
#include <libdivecomputer/iostream.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <deque>
#include <functional>
#include <string>
#include <thread>

using namespace opendives_compat;

static int failed = 0;

static void check(const char *what, bool ok, const std::string &detail = std::string())
{
	printf("%s %s%s%s\n", ok ? "ok  " : "FAIL", what, detail.empty() ? "" : ": ", detail.c_str());
	failed += !ok;
}

static std::atomic<bool> never_cancelled { false };
static std::atomic<bool> cancel_flag { false };

// A GATT server and an RFCOMM peer played from a script.
struct FakeTransport : BtTransport {
	bool connect_ok = true;
	std::vector<BleService> services;
	std::vector<std::string> log; // "descriptor <char> <hex>", "write <char> <hex> <mode>", "read <char>"
	std::deque<std::pair<std::string, Bytes>> incoming;
	std::function<void(const std::string &, const Bytes &)> on_write;
	Bytes read_value;
	bool disconnect_when_empty = false;
	std::atomic<bool> *cancelled = &never_cancelled;
	bool closed = false;
	std::deque<unsigned char> rfcomm_in;
	Bytes rfcomm_out;

	static std::string hex(const Bytes &b)
	{
		std::string s;
		char buf[4];
		for (unsigned char c: b) {
			snprintf(buf, sizeof(buf), "%02x", c);
			s += buf;
		}
		return s;
	}
	bool ble_connect(const std::string &, bool, int) override { return connect_ok; }
	bool ble_discover(std::vector<BleService> &out, int) override
	{
		out = services;
		return true;
	}
	bool ble_write_descriptor(const std::string &, const std::string &c, const std::string &, const Bytes &value,
				  int) override
	{
		log.push_back("descriptor " + c + " " + hex(value));
		return true;
	}
	bool ble_write(const std::string &, const std::string &c, const Bytes &data, bool with_response, int) override
	{
		log.push_back("write " + c + " " + hex(data) + (with_response ? " response" : " noresponse"));
		if (on_write)
			on_write(c, data);
		return true;
	}
	bool ble_read(const std::string &, const std::string &c, Bytes &value, int) override
	{
		log.push_back("read " + c);
		value = read_value;
		return true;
	}
	int ble_receive(std::string &c, Bytes &data, int timeout_ms) override
	{
		auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
		for (;;) {
			if (*cancelled)
				return -1;
			if (!incoming.empty()) {
				c = incoming.front().first;
				data = incoming.front().second;
				incoming.pop_front();
				return 1;
			}
			if (disconnect_when_empty)
				return -1;
			if (std::chrono::steady_clock::now() >= end)
				return 0;
			std::this_thread::sleep_for(std::chrono::milliseconds(5));
		}
	}
	void ble_close() override { closed = true; }
	bool rfcomm_connect(const std::string &, int) override { return connect_ok; }
	int rfcomm_read(unsigned char *data, size_t size, int) override
	{
		if (*cancelled)
			return -1;
		size_t n = 0;
		while (n < size && !rfcomm_in.empty()) {
			data[n++] = rfcomm_in.front();
			rfcomm_in.pop_front();
		}
		return static_cast<int>(n);
	}
	int rfcomm_write(const unsigned char *data, size_t size) override
	{
		rfcomm_out.insert(rfcomm_out.end(), data, data + size);
		return static_cast<int>(size);
	}
	size_t rfcomm_available() override { return rfcomm_in.size(); }
	void rfcomm_close() override { closed = true; }
	std::string last_error() override { return "fake"; }
};

static const char *SHEARWATER_SERVICE = "fe25c237-0ece-443c-b0aa-e02033e7029d";
static const char *SHEARWATER_CHAR = "27b7570b-359e-45a3-91bb-cf7e70049bd2";
static const char *CCCD = "00002902-0000-1000-8000-00805f9b34fb";

static FakeTransport shearwater_like()
{
	FakeTransport t;
	t.services = {
		{ "00001800-0000-1000-8000-00805f9b34fb", { { "00002a00-0000-1000-8000-00805f9b34fb", BLE_PROP_READ, {} } } },
		{ "0000180f-0000-1000-8000-00805f9b34fb",
		  { { "00002a19-0000-1000-8000-00805f9b34fb", BLE_PROP_READ | BLE_PROP_NOTIFY, { CCCD } } } },
		{ "00001530-1212-efde-1523-785feabcd123",
		  { { "00001531-1212-efde-1523-785feabcd123", BLE_PROP_WRITE | BLE_PROP_NOTIFY, { CCCD } } } },
		{ SHEARWATER_SERVICE,
		  { { SHEARWATER_CHAR, BLE_PROP_WRITE | BLE_PROP_WRITE_NO_RESPONSE | BLE_PROP_NOTIFY,
		      { "00002901-0000-1000-8000-00805f9b34fb", CCCD } } } },
	};
	return t;
}

static void test_addresses()
{
	check("LE address", isBluetoothLowEnergyAddress("LE:00:13:43:0D:72:1C"));
	check("LE address is not Classic", !isBluetoothClassicAddress("LE:00:13:43:0D:72:1C"));
	check("BT address", isBluetoothClassicAddress("BT:00:13:43:0D:72:1C"));
	check("plain MAC is neither LE nor BT", !isBluetoothLowEnergyAddress("00:13:43:0D:72:1C") &&
						  !isBluetoothClassicAddress("00:13:43:0D:72:1C"));
	check("prefix removed", bluetoothAddressWithoutPrefix("LE:00:13:43:0D:72:1C") == "00:13:43:0D:72:1C");
	check("name and address", extractBluetoothAddress("Petrel 3 (LE:00:13:43:0D:72:1C)") == "LE:00:13:43:0D:72:1C");
	check("compact MAC", isBluetoothLowEnergyAddress("LE:0013430D721C"));
	check("not an address", !isBluetoothAddress("/dev/ttyUSB0"));
}

static void test_names()
{
	struct {
		const char *name, *expected;
	} cases[] = {
		{ "Petrel 3 6F2A", "{\"vendor\":\"Shearwater\",\"product\":\"Petrel 3\"}" },
		{ "Perdix 2 33B1", "{\"vendor\":\"Shearwater\",\"product\":\"Perdix 2\"}" },
		{ "Perdix 1ABC", "{\"vendor\":\"Shearwater\",\"product\":\"Perdix\"}" },
		{ "Petrel 1234", "{\"vendor\":\"Shearwater\",\"product\":\"Petrel 2\"}" },
		{ "Teric 0001", "{\"vendor\":\"Shearwater\",\"product\":\"Teric\"}" },
		{ "OSTC4-12345", "{\"vendor\":\"Heinrichs Weikamp\",\"product\":\"OSTC 4\"}" },
		{ "FQ123456", "{\"vendor\":\"Aqualung\",\"product\":\"i770R\"}" },
		{ "2_00af", "{\"vendor\":\"Cressi\",\"product\":\"Goa\"}" },
		{ "EON Steel 1234", "{\"vendor\":\"Suunto\",\"product\":\"EON Steel\"}" },
		{ "Galaxy Buds", "null" },
		{ "", "null" },
	};
	for (const auto &c: cases) {
		std::string got = opendives::dc_from_bluetooth_name(c.name);
		check((std::string("name ") + c.name).c_str(), got == c.expected, got);
	}
	std::string models = opendives::dc_bluetooth_models();
	check("models list has the Petrel 3 over BLE", models.find("{\"name\":\"Petrel 3\",\"ble\":true,\"classic\":false}") != std::string::npos);
	check("models list has the Perdix over both", models.find("{\"name\":\"Perdix\",\"ble\":true,\"classic\":true}") != std::string::npos);
	check("models list leaves out USB-only models", models.find("\"Uemis\"") == std::string::npos);
}

static void test_ble_stream()
{
	FakeTransport t = shearwater_like();
	set_bt_transport(&t);
	device_data_t data;
	data.vendor = "Shearwater";
	data.product = "Petrel 3";
	data.btname = "Petrel 3 6F2A";
	dc_context_t *context = nullptr;
	dc_context_new(&context);
	dc_iostream_t *io = nullptr;
	dc_status_t rc = ble_packet_open(&io, context, "LE:C8:5C:A2:11:22:33", &data);
	check("BLE open", rc == DC_STATUS_SUCCESS);
	if (rc != DC_STATUS_SUCCESS)
		return;
	check("notifications enabled on the Shearwater characteristic through its CCCD",
	      !t.log.empty() && t.log[0] == std::string("descriptor ") + SHEARWATER_CHAR + " 0100", t.log.empty() ? "" : t.log[0]);
	check("no other descriptor written (battery, upgrade service ignored)", t.log.size() == 1);

	unsigned char out[] = { 0xff, 0x01, 0x04, 0x00, 0x22, 0x80, 0x10, 0xc0 };
	size_t actual = 0;
	rc = dc_iostream_write(io, out, sizeof(out), &actual);
	check("write without response on the write characteristic",
	      rc == DC_STATUS_SUCCESS && actual == sizeof(out) &&
		      t.log.back() == std::string("write ") + SHEARWATER_CHAR + " ff010400228010c0 noresponse",
	      t.log.back());

	t.incoming.push_back({ SHEARWATER_CHAR, { 1, 2, 3 } });
	t.incoming.push_back({ SHEARWATER_CHAR, { 4, 5 } });
	unsigned char in[64];
	rc = dc_iostream_read(io, in, sizeof(in), &actual);
	check("read gives one notification", rc == DC_STATUS_SUCCESS && actual == 3 && in[0] == 1 && in[2] == 3);
	rc = dc_iostream_read(io, in, sizeof(in), &actual);
	check("read gives the next one", rc == DC_STATUS_SUCCESS && actual == 2 && in[0] == 4);

	dc_iostream_set_timeout(io, 50);
	rc = dc_iostream_read(io, in, sizeof(in), &actual);
	check("read times out", rc == DC_STATUS_TIMEOUT && actual == 0);

	t.incoming.push_back({ SHEARWATER_CHAR, Bytes(10, 7) });
	rc = dc_iostream_read(io, in, 4, &actual);
	check("packet larger than asked: truncated, IO error", rc == DC_STATUS_IO && actual == 4);

	t.incoming.push_back({ SHEARWATER_CHAR, { 9 } });
	rc = dc_iostream_poll(io, 10);
	check("poll sees a waiting packet", rc == DC_STATUS_SUCCESS);
	rc = dc_iostream_purge(io, DC_DIRECTION_INPUT);
	rc = dc_iostream_poll(io, 10);
	check("purge drops it", rc == DC_STATUS_TIMEOUT);

	char name[32] = {};
	rc = dc_iostream_ioctl(io, DC_IOCTL_BLE_GET_NAME, name, sizeof(name));
	check("ioctl BLE name", rc == DC_STATUS_SUCCESS && std::string(name) == "Petrel 3 6F2A", name);

	unsigned char request[sizeof(dc_ble_uuid_t) + 2];
	dc_ble_str2uuid(SHEARWATER_CHAR, request);
	t.read_value = { 0xab, 0xcd };
	rc = dc_iostream_ioctl(io, DC_IOCTL_BLE_CHARACTERISTIC_READ, request, sizeof(request));
	check("ioctl characteristic read", rc == DC_STATUS_SUCCESS && request[16] == 0xab && request[17] == 0xcd);

	t.disconnect_when_empty = true;
	dc_iostream_set_timeout(io, 5000);
	auto start = std::chrono::steady_clock::now();
	rc = dc_iostream_read(io, in, sizeof(in), &actual);
	auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
	check("disconnection ends a read at once with an IO error", rc == DC_STATUS_IO && ms < 1000);

	dc_iostream_close(io);
	check("close closes the GATT connection", t.closed);
	dc_context_free(context);
	set_bt_transport(nullptr);
}

// Heinrichs Weikamp OSTC with the Telit module: credits (qt-ble.cpp,
// setupHwTerminalIo and characteristcStateChanged).
static void test_hw_credits()
{
	const char *rx = "00000001-0000-1000-8000-008025000000", *tx = "00000002-0000-1000-8000-008025000000",
		   *crx = "00000003-0000-1000-8000-008025000000", *ctx = "00000004-0000-1000-8000-008025000000";
	FakeTransport t;
	t.services = { { "0000fefb-0000-1000-8000-00805f9b34fb",
			 { { rx, BLE_PROP_WRITE, {} },
			   { tx, BLE_PROP_NOTIFY, { CCCD } },
			   { crx, BLE_PROP_WRITE, {} },
			   { ctx, BLE_PROP_INDICATE, { CCCD } } } } };
	set_bt_transport(&t);
	device_data_t data;
	data.vendor = "Heinrichs Weikamp";
	data.product = "OSTC 4";
	dc_context_t *context = nullptr;
	dc_context_new(&context);
	dc_iostream_t *io = nullptr;
	dc_status_t rc = ble_packet_open(&io, context, "00:80:25:AA:BB:CC", &data);
	check("OSTC open", rc == DC_STATUS_SUCCESS);
	if (rc != DC_STATUS_SUCCESS)
		return;
	check("credits TX indications, data TX notifications, 254 credits",
	      t.log.size() == 3 && t.log[0] == std::string("descriptor ") + ctx + " 0200" &&
		      t.log[1] == std::string("descriptor ") + tx + " 0100" && t.log[2] == std::string("write ") + crx + " fe response");
	// 222 packets bring the credits down to 32: 222 more are granted.
	for (int i = 0; i < 222; i++)
		t.incoming.push_back({ tx, { static_cast<unsigned char>(i) } });
	t.incoming.push_back({ ctx, { 1 } }); // not data: ignored
	unsigned char in[8];
	size_t actual;
	int got = 0;
	dc_iostream_set_timeout(io, 50);
	while (dc_iostream_read(io, in, sizeof(in), &actual) == DC_STATUS_SUCCESS)
		got++;
	check("every data packet read", got == 222, std::to_string(got));
	check("credits granted again at 32", t.log.size() == 4 && t.log[3] == std::string("write ") + crx + " de response",
	      t.log.back());
	dc_iostream_write(io, "ab", 2, &actual);
	check("data written on the data RX characteristic, with response",
	      t.log.back() == std::string("write ") + rx + " 6162 response", t.log.back());
	dc_iostream_close(io);
	dc_context_free(context);
	set_bt_transport(nullptr);
}

static void test_no_service()
{
	FakeTransport t;
	t.services = { { "0000180f-0000-1000-8000-00805f9b34fb",
			 { { "00002a19-0000-1000-8000-00805f9b34fb", BLE_PROP_READ | BLE_PROP_NOTIFY, { CCCD } } } } };
	set_bt_transport(&t);
	device_data_t data;
	data.vendor = "Shearwater";
	dc_context_t *context = nullptr;
	dc_context_new(&context);
	dc_iostream_t *io = nullptr;
	check("no serial service: open fails", ble_packet_open(&io, context, "C8:5C:A2:11:22:33", &data) == DC_STATUS_IO);
	check("and the connection is closed", t.closed);
	dc_context_free(context);
	set_bt_transport(nullptr);
}

static void test_rfcomm()
{
	FakeTransport t;
	set_bt_transport(&t);
	dc_context_t *context = nullptr;
	dc_context_new(&context);
	dc_iostream_t *io = nullptr;
	dc_status_t rc = rfcomm_stream_open(&io, context, "00:13:43:0D:72:1C");
	check("RFCOMM open", rc == DC_STATUS_SUCCESS);
	t.rfcomm_in = { 1, 2, 3, 4, 5 };
	unsigned char in[3];
	size_t actual;
	rc = dc_iostream_read(io, in, sizeof(in), &actual);
	check("RFCOMM partial read", rc == DC_STATUS_SUCCESS && actual == 3 && in[2] == 3);
	size_t available = 0;
	dc_iostream_get_available(io, &available);
	check("RFCOMM bytes available", available == 2);
	rc = dc_iostream_read(io, in, sizeof(in), nullptr);
	check("RFCOMM full read with too few bytes times out", rc == DC_STATUS_TIMEOUT);
	dc_iostream_write(io, "xyz", 3, &actual);
	check("RFCOMM write", t.rfcomm_out == Bytes({ 'x', 'y', 'z' }));
	dc_iostream_close(io);
	check("RFCOMM close", t.closed);
	dc_context_free(context);
	set_bt_transport(nullptr);
}

static std::string events;
static void on_progress(const std::string &json, void *)
{
	events += json + "\n";
}

static void test_download_failures()
{
	std::string json, error;
	// Connection refused: NOT_FOUND; the computer is still remembered, as Subsurface does.
	FakeTransport t = shearwater_like();
	t.connect_ok = false;
	set_bt_transport(&t);
	std::string request = "{\"vendor\":\"Shearwater\",\"product\":\"Petrel 3\",\"address\":\"LE:C8:5C:A2:11:22:33\","
			      "\"name\":\"Petrel 3 6F2A\"}";
	events.clear();
	int rc = opendives::download_dives(request, on_progress, nullptr, json, error);
	check("connection refused: NOT_FOUND", rc == -1 && error.rfind("NOT_FOUND", 0) == 0, error);
	check("progress said connecting", events.find("\"state\":\"connecting\"") != std::string::npos, events);
	std::string prefs;
	opendives::get_prefs(prefs);
	check("computer remembered after the attempt",
	      prefs.find("{\"slot\":1,\"vendor\":\"Shearwater\",\"product\":\"Petrel 3\",\"device\":\"LE:C8:5C:A2:11:22:33\","
			 "\"name\":\"Petrel 3 6F2A\"}") != std::string::npos);

	// Connected, then the computer stops answering: FAILED.
	t = shearwater_like();
	t.disconnect_when_empty = true;
	set_bt_transport(&t);
	events.clear();
	rc = opendives::download_dives(request, on_progress, nullptr, json, error);
	check("connection lost: FAILED", rc == -1 && error.rfind("FAILED", 0) == 0, error);
	check("progress said connected", events.find("\"state\":\"connected\"") != std::string::npos);

	// Cancelled while waiting for the computer.
	t = shearwater_like();
	t.cancelled = &cancel_flag;
	set_bt_transport(&t);
	std::thread canceller([] {
		std::this_thread::sleep_for(std::chrono::milliseconds(300));
		opendives::download_cancel();
		cancel_flag = true;
	});
	rc = opendives::download_dives(request, on_progress, nullptr, json, error);
	canceller.join();
	check("cancelled: CANCELLED", rc == -1 && error == "CANCELLED", error);

	// Unknown model and bad requests.
	rc = opendives::download_dives("{\"vendor\":\"Nobody\",\"product\":\"X\",\"address\":\"LE:C8:5C:A2:11:22:33\"}", nullptr,
				       nullptr, json, error);
	check("unknown model", rc == -1 && error.rfind("UNKNOWN_COMPUTER", 0) == 0, error);
	rc = opendives::download_dives("{\"vendor\":\"Shearwater\"}", nullptr, nullptr, json, error);
	check("missing address", rc == -1 && error.rfind("BAD_REQUEST", 0) == 0, error);
	set_bt_transport(nullptr);
	rc = opendives::download_dives(request, nullptr, nullptr, json, error);
	check("no transport", rc == -1 && error == "NO_TRANSPORT", error);

	// The remembered computers go back into the core as the app keeps them.
	opendives::get_prefs(prefs);
	size_t at = prefs.find("\"diveComputerList\":");
	size_t end = prefs.find(']', at);
	std::string list = prefs.substr(at + 19, end - at - 18);
	opendives::set_prefs("{\"forgetDiveComputer\":0}", error);
	opendives::set_prefs("{\"diveComputerList\":" + list + "}", error);
	std::string again;
	opendives::get_prefs(again);
	check("diveComputerList set back", again == prefs);
}

// The downloaded dives as one undoable step, with the fingerprint (download.cpp,
// edit.cpp import_downloaded).
static void test_import_step(const char *file)
{
	std::string json, error;
	struct divelog log;
	if (parse_file(file, &log) || log.dives.empty()) {
		check("read the dives to import", false, file);
		return;
	}
	size_t imported = log.dives.size();
	// A fingerprint as do_libdivecomputer_import() leaves it.
	fingerprint_table previous;
	for (const fingerprint_record &fp: fingerprints) {
		fingerprint_record r;
		r.model = fp.model;
		r.serial = fp.serial;
		r.fsize = fp.fsize;
		r.fdeviceid = fp.fdeviceid;
		r.fdiveid = fp.fdiveid;
		r.raw_data = std::make_unique<unsigned char[]>(fp.fsize);
		memcpy(r.raw_data.get(), fp.raw_data.get(), fp.fsize);
		previous.push_back(std::move(r));
	}
	size_t fp_before = fingerprints.size();
	unsigned char raw[4] = { 1, 2, 3, 4 };
	create_fingerprint_node(fingerprints, 0x1234, 42, raw, sizeof(raw), 7, 8);
	int rc = opendives::internal::import_downloaded(log, "LE:C8:5C:A2:11:22:33", previous, json, error);
	check("downloaded dives imported", rc == 0 && json.rfind("{\"listChange\":true", 0) == 0, rc ? error : json);
	check("step text", opendives::undo_text() == "import " + std::to_string(imported) + (imported == 1 ? " dive" : " dives") +
							     " from LE:C8:5C:A2:11:22:33",
	      opendives::undo_text());
	check("fingerprint kept", fingerprints.size() == fp_before + 1);
	opendives::undo(json, error);
	check("undo removes the fingerprint too", fingerprints.size() == fp_before);
	opendives::redo(json, error);
	check("redo puts it back", fingerprints.size() == fp_before + 1);
	opendives::undo(json, error);
}

int main(int argc, char **argv)
{
	if (argc < 3) {
		fprintf(stderr, "usage: %s <log> <other dives to import>\n", argv[0]);
		return 2;
	}
	opendives::init();
	test_addresses();
	test_names();
	test_ble_stream();
	test_hw_credits();
	test_no_service();
	test_rfcomm();

	std::string json, error;
	if (opendives::list_dives(argv[1], json, error)) {
		fprintf(stderr, "cannot read %s: %s\n", argv[1], error.c_str());
		return 2;
	}
	test_download_failures();
	test_import_step(argv[2]);
	printf("%s\n", failed ? "FAILED" : "all passed");
	return failed ? 1 : 0;
}
