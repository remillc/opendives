// SPDX-License-Identifier: GPL-2.0
// Download from a dive computer over Bluetooth (opendives.h), ported from
// Subsurface:
//  - core/downloadfromdcthread.cpp: fill_computer_list() (the models and their
//    descriptors), DownloadThread::run() and updateRememberedDCs();
//  - core/btdiscovery.cpp: getDeviceType() (dive computer from a Bluetooth name);
//  - qt-models/diveimportedmodel.cpp: recordDives(), the import of the
//    downloaded dives (edit.cpp, internal::import_downloaded).
// The download itself is Subsurface's do_libdivecomputer_import()
// (core/libdivecomputer.cpp, compiled as is), and the Bluetooth stream its
// ble_packet_open() and rfcomm_stream_open() (core/compat/bluetooth_compat.cpp).
#include "opendives.h"
#include "internal.h"
#include "json.h"

#include "core/compat/bt_transport.h"
#include "core/device.h"
#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelog.h"
#include "core/errorhelper.h"
#include "core/format.h"
#include "core/libdivecomputer.h"
#include "core/pref.h"

#include <libdivecomputer/descriptor.h>
#include <libdivecomputer/iterator.h>

#include <algorithm>
#include <chrono>
#include <cstring>
#include <ctime>
#include <map>
#include <mutex>
#include <regex>
#include <set>

namespace opendives {

namespace {

void append_json_string(std::string &out, const std::string &s)
{
	out += '"';
	for (unsigned char c: s) {
		switch (c) {
		case '"': out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n"; break;
		case '\r': out += "\\r"; break;
		case '\t': out += "\\t"; break;
		default:
			if (c < 0x20) {
				char buf[8];
				snprintf(buf, sizeof(buf), "\\u%04x", c);
				out += buf;
			} else {
				out += static_cast<char>(c);
			}
		}
	}
	out += '"';
}

std::string lower(std::string s)
{
	for (char &c: s)
		c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
	return s;
}

// --- fill_computer_list() (downloadfromdcthread.cpp) --------------------------

struct ComputerList {
	std::vector<std::string> vendorList;
	std::map<std::string, std::vector<std::string>> productList;
	std::map<std::string, dc_descriptor_t *> descriptorLookup; // keys always lower case
};

const ComputerList &computer_list()
{
	static ComputerList list;
	static std::once_flag once;
	std::call_once(once, [] {
		dc_iterator_t *iterator = NULL;
		dc_descriptor_t *descriptor = NULL;

		unsigned int transportMask = get_supported_transports(NULL);

		dc_descriptor_iterator(&iterator);
		while (dc_iterator_next(iterator, &descriptor) == DC_STATUS_SUCCESS) {
			// mask out the transports that aren't supported
			unsigned int transports = dc_descriptor_get_transports(descriptor) & transportMask;
			if (transports == 0)
				// none of the transports are available, skip
				continue;

			const char *vendor = dc_descriptor_get_vendor(descriptor);
			const char *product = dc_descriptor_get_product(descriptor);
			// "FIT" is libdivecomputer's generic FIT-file-import pseudo-device, not an
			// actual dive computer.
			if (std::string(vendor) == "FIT")
				continue;
			if (std::find(list.vendorList.begin(), list.vendorList.end(), vendor) == list.vendorList.end())
				list.vendorList.push_back(vendor);
			auto &products = list.productList[vendor];
			if (std::find(products.begin(), products.end(), product) == products.end())
				products.push_back(product);

			list.descriptorLookup[lower(vendor) + lower(product)] = descriptor;
		}
		dc_iterator_free(iterator);
		for (auto &[vendor, products]: list.productList)
			std::sort(products.begin(), products.end());
		// The Uemis Zurich is not a Bluetooth device: left out, as on Android.
		std::sort(list.vendorList.begin(), list.vendorList.end());
	});
	return list;
}

dc_descriptor_t *lookup_descriptor(const std::string &vendor, const std::string &product)
{
	const auto &lookup = computer_list().descriptorLookup;
	auto it = lookup.find(lower(vendor) + lower(product));
	return it == lookup.end() ? nullptr : it->second;
}

// --- getDeviceType() (btdiscovery.cpp) ----------------------------------------

struct modelPattern {
	uint16_t    model;
	const char *vendor;
	const char *product;
};
const struct modelPattern model[] = {
	{ 0x4552, "Oceanic", "Pro Plus X" },
	{ 0x455A, "Aqualung", "i750TC" },
	{ 0x4647, "Sherwood", "Sage" },
	{ 0x4648, "Aqualung", "i300C" },
	{ 0x4649, "Aqualung", "i200C" },
	{ 0x4749, "Aqualung", "i200Cv2" },
	{ 0x4651, "Aqualung", "i770R" },
	{ 0x4652, "Aqualung", "i550C" },
	{ 0x4653, "Oceanic", "Geo 4.0" },
	{ 0x4654, "Oceanic", "Veo 4.0" },
	{ 0x4655, "Sherwood", "Wisdom 4" },
	{ 0x4656, "Oceanic", "Pro Plus 4" },
	{ 0x4741, "Apeks", "DSX" },
	{ 0x4742, "Sherwood", "Beacon" },
	{ 0x4743, "Aqualung", "i470TC" },
	{ 0x4744, "Aqualung", "i330R" },
	{ 0x474B, "Oceanic", "Geo Air" },
	{ 0x474D, "Oceanic", "Geo i330R Console" },
};

// The Cressi BT interfaces for Goa-style computers advertise names with pattern:
//  <model number>_<4 digit lowercase hex serial number>
// The source of truth for model numbers is in libdivecomputer/src/descriptor.c
const std::map<int, std::string> cressiModelNumToProduct{
	{ 1, "Cartesio"},
	{ 2, "Goa"},
	{ 3, "Leonardo 2.0"},
	{ 4, "Donatello"},
	{ 5, "Michelangelo"},
	{ 6, "Raffaello"},
	{ 9, "Neon"},
	{10, "Nepto"}
};

struct namePattern {
	const char *prefix;
	const char *vendor;
	const char *product;
};
// search is in order of this array, and as a prefix search, so more specific names
// should be added before less specific names (i.e. "Perdix 2" before "Perdix")
const struct namePattern name[] = {
	// Shearwater dive computers
	{ "Predator", "Shearwater", "Predator" },
	{ "Perdix 3", "Shearwater", "Perdix 3"},
	{ "Perdix 2", "Shearwater", "Perdix 2"},
	{ "Petrel 3", "Shearwater", "Petrel 3"},
	// both the Petrel and Petrel 2 identify as "Petrel" as BT/BLE device
	// but only the Petrel 2 is listed as available dive computer on iOS (which requires BLE support)
	// so always pick the "Petrel 2" as product when seeing a Petrel
	{ "Petrel", "Shearwater", "Petrel 2" },
	{ "Perdix", "Shearwater", "Perdix" },
	{ "Teric", "Shearwater", "Teric" },
	{ "Peregrine", "Shearwater", "Peregrine" },
	{ "NERD 2", "Shearwater", "NERD 2" },
	{ "NERD", "Shearwater", "NERD" }, // order is important, test for the more specific one first
	{ "Predator", "Shearwater", "Predator" },
	{ "Tern", "Shearwater", "Tern" },
	// Suunto dive computers
	{ "EON Steel", "Suunto", "EON Steel" },
	{ "EON Core", "Suunto", "EON Core" },
	{ "Suunto D5", "Suunto", "D5" },
	// Scubapro dive computers
	{ "G2", "Scubapro", "G2" },
	{ "HUD", "Scubapro", "G2 HUD" },
	{ "G3", "Scubapro", "G3" },
	{ "Aladin", "Scubapro", "Aladin Sport Matrix" },
	{ "A1", "Scubapro", "Aladin A1" },
	{ "A2", "Scubapro", "Aladin A2" },
	{ "Luna 2.0 AI", "Scubapro", "Luna 2.0 AI" },
	{ "Luna 2.0", "Scubapro", "Luna 2.0" },
	// Mares dive computers
	{ "Mares Genius", "Mares", "Genius" },
	{ "Sirius", "Mares", "Sirius" },
	{ "Quad Ci", "Mares", "Quad Ci" },
	{ "Quad", "Mares", "Quad" },
	{ "Mares", "Mares", "Quad" }, // we actually don't know and just pick a common one - user needs to fix in UI
	{ "Puck4", "Mares", "Puck 4"},
	{ "Puck Lite", "Mares", "Puck Lite"},
	{ "Puck Pro U", "Mares", "Puck Pro Ultra"},
	{ "Puck", "Mares", "Puck Pro EZ"},
	// Cress dive computers
	{ "CARESIO_", "Cressi", "Cartesio" },
	{ "GOA_", "Cressi", "Goa" },
	// Deepblu dive computesr
	{ "COSMIQ", "Deepblu", "Cosmiq+" },
	// Oceans dive computers
	{ "S1", "Oceans", "S1" },
	// McLean dive computers
	{ "McLean Extreme", "McLean", "Extreme" },
	// Tecdiving dive computers
	{ "DiveComputer", "Tecdiving", "DiveComputer.eu" }
};

bool starts_with(const std::string &s, const char *prefix)
{
	return s.compare(0, strlen(prefix), prefix) == 0;
}

// central function to convert a BT name to a Subsurface known vendor/model pair
dc_descriptor_t *getDeviceType(const std::string &btName)
{
	std::string vendor, product;

	static const std::regex ratioDs("^DS\\d{6}");
	static const std::regex ratioIx5m("^IX5M\\d{6}");
	static const std::regex ratioName("^RATIO-\\d{6}");
	static const std::regex pelagic("^[A-Z]{2}\\d{6}");
	static const std::regex cressiBTNamePattern("^([1-9][0-9]?)_[0-9a-f]{4}$");
	std::smatch m;

	if (starts_with(btName, "OSTC")) {
		vendor = "Heinrichs Weikamp";
		std::string one = btName.substr(std::min<size_t>(4, btName.size()), 1);
		std::string two = btName.substr(std::min<size_t>(4, btName.size()), 2);
		if (one == "3") product = "OSTC Plus";
		else if (two == "s#") product = "OSTC Sport";
		else if (two == "s ") product = "OSTC Sport";
		else if (two == "4-") product = "OSTC 4";
		else if (two == "5-") product = "OSTC 5";
		else if (two == "2-") product = "OSTC 2N";
		else if (two == "+ ") product = "OSTC 2";
		// all BT/BLE enabled OSTCs are HW_FAMILY_OSTC_3, so when we do not know,
		// just use a default product that allows the code to download from the
		// user's dive computer
		else product = "OSTC 2";
	} else if (std::regex_search(btName, ratioDs)) {
		// The Ratio bluetooth name looks like the Pelagic ones,
		// but that seems to be just happenstance.
		vendor = "Ratio";
		product = "iX3M 2021 GPS Easy"; // we don't know which of the Bluetooth models, so set one that supports BLE
	} else if (std::regex_search(btName, ratioIx5m) || std::regex_search(btName, ratioName)) {
		// The 2021 iX3M models (square buttons) report as iX5M,
		// eventhough the physical model states iX3M.
		vendor = "Ratio";
		product = "iX3M 2021 GPS Easy"; // we don't know which of the Bluetooth models, so set one that supports BLE
	} else if (std::regex_search(btName, pelagic)) {
		// try the Pelagic/Aqualung name patterns
		// The Pelagic dive computers (generally branded as Oceanic, Aqualung, or Sherwood)
		// show up with a two-byte model code followed by six bytes of serial
		// number. The model code matches the hex model (so "FQ" is 0x4651,
		// where 'F' is 46h and 'Q' is 51h in ASCII).
		for (const modelPattern &p: model) {
			std::string pattern = std::string("^") + static_cast<char>(p.model >> 8) +
					      static_cast<char>(p.model & 0xFF) + "\\d{6}$";
			if (std::regex_search(btName, std::regex(pattern))) {
				vendor = p.vendor;
				product = p.product;
				break;
			}
		}
	} else if (std::regex_search(btName, m, cressiBTNamePattern)) {
		auto it = cressiModelNumToProduct.find(std::stoi(m.str(1)));
		if (it != cressiModelNumToProduct.end()) {
			product = it->second;
			vendor = "Cressi";
		}
	} else { // finally try all the string prefix based ones
		for (const namePattern &p: name) {
			if (starts_with(btName, p.prefix)) {
				vendor = p.vendor;
				product = p.product;
				break;
			}
		}
	}

	// check if we found a known dive computer
	if (!vendor.empty() && !product.empty()) {
		dc_descriptor_t *lookup = lookup_descriptor(vendor, product);
		if (!lookup) {
			// the Ratio dive computers come in BT only or BLE only and we can't tell
			// which just from the name; so while this is fairly unlikely, the user
			// could be on an older computer / device that only supports BT and no BLE
			// and giving the BLE only name might therefore not work, so try the other
			// one just in case
			if (vendor == "Ratio" && product == "iX3M 2021 GPS Easy") {
				product = "iX3M GPS Easy"; // this one is BT only
				lookup = lookup_descriptor(vendor, product);
			}
			if (!lookup) // still nothing?
				opendives_compat::bt_log("known dive computer %s%s not found in descriptorLookup", vendor.c_str(),
							 product.c_str());
		}
		return lookup;
	}
	return nullptr;
}

// --- updateRememberedDCs() (downloadfromdcthread.cpp) -------------------------

std::string dc_key(const dive_computer_prefs_t &dc)
{
	return dc.vendor + " - " + dc.product + " - " + dc.device;
}

void updateRememberedDCs()
{
	std::string current = dc_key(prefs.dive_computer);
	std::string dcs[] = { dc_key(prefs.dive_computer1), dc_key(prefs.dive_computer2), dc_key(prefs.dive_computer3),
			      dc_key(prefs.dive_computer4) };
	if (std::find(std::begin(dcs), std::end(dcs), current) != std::end(dcs))
		// already in the list
		return;
	// add the current one as the first remembered one and drop the 4th one
	// don't get confused by 0-based and 1-based indices!
	// (The device name moves with each entry: qPrefDiveComputer keeps one per slot.)
	if (dcs[2] != " - ")
		prefs.dive_computer4 = prefs.dive_computer3;
	if (dcs[1] != " - ")
		prefs.dive_computer3 = prefs.dive_computer2;
	if (dcs[0] != " - ")
		prefs.dive_computer2 = prefs.dive_computer1;
	prefs.dive_computer1 = prefs.dive_computer;
}

// --- Progress -------------------------------------------------------------------

struct Progress {
	download_progress callback = nullptr;
	void *userdata = nullptr;
	device_data_t *data = nullptr;
	std::set<const dive *> sent;
	std::chrono::steady_clock::time_point last;
	bool connected = false;
	std::string state;
};
Progress progress;

std::string iso_date(timestamp_t when)
{
	time_t t = static_cast<time_t>(when);
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tm);
	return buf;
}

void send_progress(bool force)
{
	if (!progress.callback || !progress.data || !progress.data->log)
		return;
	auto now = std::chrono::steady_clock::now();
	const auto &dives = progress.data->log->dives;
	bool new_dive = dives.size() > progress.sent.size();
	if (!force && !new_dive && now - progress.last < std::chrono::milliseconds(250))
		return;
	progress.last = now;
	std::string json = "{\"state\":";
	append_json_string(json, progress.state);
	char fraction[32];
	snprintf(fraction, sizeof(fraction), "%.3f", progress_bar_fraction);
	json += ",\"fraction\":";
	json += fraction;
	json += ",\"dives\":" + std::to_string(dives.size()) + ",\"newDives\":[";
	bool first = true;
	for (const auto &d: dives) {
		if (!progress.sent.insert(d.get()).second)
			continue;
		if (!first)
			json += ',';
		first = false;
		const divecomputer *dc = d->dcs.empty() ? nullptr : &d->dcs[0];
		int depth = d->maxdepth.mm ? d->maxdepth.mm : dc ? dc->maxdepth.mm : 0;
		int duration = d->duration.seconds ? d->duration.seconds : dc ? dc->duration.seconds : 0;
		json += "{\"date\":";
		append_json_string(json, iso_date(d->when));
		json += ",\"maxDepthMm\":" + std::to_string(depth) + ",\"durationSeconds\":" + std::to_string(duration);
		json += ",\"profile\":" + internal::profile_json(*d) + '}';
	}
	json += "]}";
	progress.callback(json, progress.userdata);
}

void on_io()
{
	send_progress(false);
}

void on_state(const char *state)
{
	progress.state = state;
	if (!strcmp(state, "connected"))
		progress.connected = true;
	opendives_compat::bt_log("download: %s", state);
	send_progress(true);
}

void on_dev_info(const std::string &text)
{
	opendives_compat::bt_log("dev_info: %s", text.c_str());
}

fingerprint_table copy_fingerprints(const fingerprint_table &table)
{
	fingerprint_table copy;
	for (const fingerprint_record &fp: table) {
		fingerprint_record r;
		r.model = fp.model;
		r.serial = fp.serial;
		r.fsize = fp.fsize;
		r.fdeviceid = fp.fdeviceid;
		r.fdiveid = fp.fdiveid;
		if (fp.raw_data && fp.fsize) {
			r.raw_data = std::make_unique<unsigned char[]>(fp.fsize);
			memcpy(r.raw_data.get(), fp.raw_data.get(), fp.fsize);
		}
		copy.push_back(std::move(r));
	}
	return copy;
}

} // namespace

std::string dc_from_bluetooth_name(const std::string &btName)
{
	dc_descriptor_t *d = getDeviceType(btName);
	if (!d)
		return "null";
	std::string json = "{\"vendor\":";
	append_json_string(json, dc_descriptor_get_vendor(d));
	json += ",\"product\":";
	append_json_string(json, dc_descriptor_get_product(d));
	json += '}';
	return json;
}

std::string dc_bluetooth_models()
{
	const ComputerList &list = computer_list();
	std::string json = "[";
	for (const std::string &vendor: list.vendorList) {
		std::string products;
		for (const std::string &product: list.productList.at(vendor)) {
			dc_descriptor_t *d = lookup_descriptor(vendor, product);
			unsigned int t = d ? dc_descriptor_get_transports(d) : 0;
			if (!(t & (DC_TRANSPORT_BLE | DC_TRANSPORT_BLUETOOTH)))
				continue;
			if (!products.empty())
				products += ',';
			products += "{\"name\":";
			append_json_string(products, product);
			products += std::string(",\"ble\":") + (t & DC_TRANSPORT_BLE ? "true" : "false");
			products += std::string(",\"classic\":") + (t & DC_TRANSPORT_BLUETOOTH ? "true" : "false") + '}';
		}
		if (products.empty())
			continue;
		if (json.size() > 1)
			json += ',';
		json += "{\"vendor\":";
		append_json_string(json, vendor);
		json += ",\"products\":[" + products + "]}";
	}
	json += ']';
	return json;
}

void download_cancel()
{
	import_thread_cancelled = true;
}

int download_dives(const std::string &request_json, download_progress progress_cb, void *userdata, std::string &json,
		   std::string &error)
{
	using internal::JsonReader;
	using internal::JsonValue;
	std::vector<std::pair<std::string, JsonValue>> fields;
	if (!JsonReader(request_json).object(fields)) {
		error = "BAD_REQUEST: invalid JSON";
		return -1;
	}
	std::string vendor, product, address, btname, log_file;
	bool force = false;
	for (const auto &[key, v]: fields) {
		if (key == "vendor")
			vendor = v.text;
		else if (key == "product")
			product = v.text;
		else if (key == "address")
			address = v.text;
		else if (key == "name")
			btname = v.text;
		else if (key == "logFile")
			log_file = v.text;
		else if (key == "forceDownload")
			force = v.number != 0;
		else {
			error = "BAD_REQUEST: " + key;
			return -1;
		}
	}
	if (vendor.empty() || product.empty() || address.empty()) {
		error = "BAD_REQUEST: vendor, product and address are needed";
		return -1;
	}
	if (internal::check_writable(error))
		return -1;
	if (!opendives_compat::bt_transport()) {
		error = "NO_TRANSPORT";
		return -1;
	}

	// DCDeviceData::DCDeviceData(), with BT_SUPPORT and SUBSURFACE_MOBILE.
	device_data_t data;
	struct divelog log;
	data.log = nullptr;
	data.diveid = 0;
	data.bluetooth_mode = true;
	data.force_download = force;
	data.libdc_dump = false;
	data.libdc_log = !log_file.empty();
	data.sync_time = false;
	data.vendor = vendor;
	data.product = product;
	// DCDeviceData::setDevName(): a string of the form "devicename
	// (deviceaddress)" or "deviceaddress (devicename)" may have found its way
	// into the preferences; fetch the address from it.
	{
		size_t idx1 = address.find('('), idx2 = address.rfind(')');
		if (idx1 != std::string::npos && idx2 != std::string::npos && idx2 > idx1) {
			std::string front = address.substr(0, idx1);
			front.erase(front.find_last_not_of(" \t") + 1);
			front.erase(0, front.find_first_not_of(" \t"));
			std::string back = address.substr(idx1 + 1, idx2 - idx1 - 1);
			address = back.find(':') != std::string::npos ? back : front;
		}
	}
	data.devname = address;

	// DownloadThread::run()
	data.descriptor = lookup_descriptor(vendor, product);
	data.log = &log;
	data.btname = btname;
	if (!data.descriptor) {
		report_info("No download possible when DC type is unknown");
		error = "UNKNOWN_COMPUTER: " + vendor + " " + product;
		return -1;
	}
	// get the list of transports that this device supports and filter depending on Bluetooth option
	unsigned int transports = dc_descriptor_get_transports(data.descriptor);
	transports &= (DC_TRANSPORT_BLE | DC_TRANSPORT_BLUETOOTH);
	opendives_compat::bt_log("Starting download from %s%s%s (%s %s at %s)", transports & DC_TRANSPORT_BLUETOOTH ? "BT" : "",
				 transports == (DC_TRANSPORT_BLE | DC_TRANSPORT_BLUETOOTH) ? ", " : "",
				 transports & DC_TRANSPORT_BLE ? "BLE" : "", vendor.c_str(), product.c_str(), address.c_str());
	opendives_compat::bt_log("downloading %s dives", data.force_download ? "all" : "only new");

	std::string saved_logfile = logfile_name;
	if (!log_file.empty())
		logfile_name = log_file;
	int saved_verbose = verbose;
	verbose = std::max(verbose, 1);
	fingerprint_table fingerprints_before = copy_fingerprints(fingerprints);
	progress = Progress();
	progress.callback = progress_cb;
	progress.userdata = userdata;
	progress.data = &data;
	progress.state = "connecting";
	progress_bar_fraction = 0.0;
	opendives_compat::bt_io_hook = on_io;
	opendives_compat::bt_state_hook = on_state;
	progress_callback = on_dev_info;

	import_thread_cancelled = false;
	std::string errorText = do_libdivecomputer_import(&data);
	bool cancelled = import_thread_cancelled;
	import_thread_cancelled = false;

	send_progress(true);
	opendives_compat::bt_io_hook = nullptr;
	opendives_compat::bt_state_hook = nullptr;
	progress_callback = nullptr;
	bool connected = progress.connected;
	progress = Progress();
	verbose = saved_verbose;
	logfile_name = saved_logfile;

	std::string message;
	if (!errorText.empty()) {
		message = format_string_std(errorText.c_str(), data.devname.c_str(), data.vendor.c_str(), data.product.c_str());
		opendives_compat::bt_log("Finishing download thread: %s", message.c_str());
	} else {
		opendives_compat::bt_log("Finishing download thread: %d dives downloaded", static_cast<int>(log.dives.size()));
	}
	prefs.dive_computer.vendor = data.vendor;
	prefs.dive_computer.product = data.product;
	prefs.dive_computer.device = data.devname;
	prefs.dive_computer.device_name = btname;
	updateRememberedDCs();

	auto restore_fingerprints = [&] { std::swap(fingerprints, fingerprints_before); };
	if (cancelled) {
		restore_fingerprints();
		error = "CANCELLED";
		return -1;
	}
	if (!errorText.empty()) {
		// Nothing is added: the dives read before the failure are dropped
		// (Subsurface-mobile offers them), and so is the new fingerprint.
		restore_fingerprints();
		error = std::string(connected ? "FAILED: " : "NOT_FOUND: ") + message;
		return -1;
	}

	size_t n = log.dives.size();
	std::string list_json, prefs_json;
	if (n) {
		std::string import_error;
		if (internal::import_downloaded(log, data.devname, fingerprints_before, list_json, import_error)) {
			restore_fingerprints();
			if (import_error != "NO_NEW_DIVES") {
				error = import_error;
				return -1;
			}
			n = 0;
		}
	} else {
		restore_fingerprints();
	}
	json = "{\"downloaded\":" + std::to_string(n) + ",\"vendor\":";
	append_json_string(json, data.vendor);
	json += ",\"product\":";
	append_json_string(json, data.product);
	json += ",\"serial\":" + std::to_string(data.devinfo.serial);
	json += ",\"firmware\":" + std::to_string(data.devinfo.firmware);
	if (!list_json.empty())
		json += ",\"list\":" + list_json;
	json += ",\"undo\":";
	append_json_string(json, undo_text());
	get_prefs(prefs_json);
	size_t at = prefs_json.find("\"diveComputerList\":");
	size_t end = at == std::string::npos ? at : prefs_json.find(']', at);
	if (end != std::string::npos)
		json += ',' + prefs_json.substr(at, end - at + 1);
	json += '}';
	return 0;
}

} // namespace opendives
