// SPDX-License-Identifier: GPL-2.0
// Settings (docs/ui-specification.md, section 4, "Settings, modelled on
// Subsurface"): the core's preferences (core/pref.h) read and written as
// Subsurface's preference pages do (desktop-widgets/preferences/*.cpp,
// mobile-widgets/qml/Settings.qml), and the cylinder types library, ported
// from qt-models/tankinfomodel.cpp without Qt.
#include "opendives.h"
#include "internal.h"
#include "json.h"

#include "core/divelog.h"
#include "core/equipment.h"
#include "core/pref.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <initializer_list>

namespace opendives {

using internal::JsonReader;
using internal::JsonValue;

static void append_string(std::string &out, const std::string &s)
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

// The switches of Settings, by key: each is one bool of `preferences`.
struct BoolPref {
	const char *key;
	bool preferences::*field;
};

static const BoolPref bool_prefs[] = {
	{ "displayInvalidDives", &preferences::display_invalid_dives },
	{ "extraEnvironmental", &preferences::extraEnvironmentalDefault },
	{ "salinityEdit", &preferences::salinityEditDefault },
	{ "includeUnusedTanks", &preferences::include_unused_tanks },
	{ "displayDefaultTankInfos", &preferences::display_default_tank_infos },
	{ "showAverageDepth", &preferences::show_average_depth },
	{ "threeMGrid", &preferences::three_m_based_grid },
	{ "dcCeiling", &preferences::dcceiling },
	{ "redCeiling", &preferences::redceiling },
	{ "calcCeiling", &preferences::calcceiling },
	{ "tankbar", &preferences::tankbar },
	{ "o2narcotic", &preferences::o2narcotic },
	{ "showCcrSensors", &preferences::show_ccr_sensors },
	{ "showCcrSetpoint", &preferences::show_ccr_setpoint },
	{ "allowOcGasAsDiluent", &preferences::allowOcGasAsDiluent },
	{ "showScrOcPo2", &preferences::show_scr_ocpo2 },
	{ "dateFormatOverride", &preferences::date_format_override },
	{ "timeFormatOverride", &preferences::time_format_override },
	// The planner's own switches (Subsurface-mobile's "Dive planner setup").
	{ "lastStop6m", &preferences::last_stop },
	{ "safetyStop", &preferences::safetystop },
	{ "switchAtRequiredStop", &preferences::switch_at_req_stop },
	{ "o2Breaks", &preferences::doo2breaks },
};

// The planner's own numbers, by key: one int of `preferences`, its range in
// the key's unit, and the factor from the stored unit to the key's (rates are
// stored in mm/s and passed in mm/min; set as the planner's per-minute fields
// do it: value / 60).
struct IntPref {
	const char *key;
	int preferences::*field;
	long min, max;
	int per_minute; // 60 for the rates, 1 otherwise
};

// Ranges of Subsurface's planner fields (desktop-widgets/diveplanner.ui,
// mobile-widgets/qml/DivePlannerSetup.qml).
static const IntPref int_prefs[] = {
	{ "bottomPo2Mbar", &preferences::bottompo2, 160, 2000, 1 },
	{ "decoPo2Mbar", &preferences::decopo2, 160, 2000, 1 },
	{ "bottomSacMlMin", &preferences::bottomsac, 1000, 99000, 1 },
	{ "decoSacMlMin", &preferences::decosac, 1000, 99000, 1 },
	{ "descentMmMin", &preferences::descrate, 1000, 99000, 60 },
	{ "ascent75MmMin", &preferences::ascrate75, 1000, 99000, 60 },
	{ "ascent50MmMin", &preferences::ascrate50, 1000, 99000, 60 },
	{ "ascentStopsMmMin", &preferences::ascratestops, 1000, 99000, 60 },
	{ "ascentLast6mMmMin", &preferences::ascratelast6m, 1000, 99000, 60 },
	{ "minSwitchSeconds", &preferences::min_switch_duration, 0, 9 * 60, 1 },
	{ "problemSolvingMinutes", &preferences::problemsolvingtime, 0, 99, 1 },
	{ "sacFactor", &preferences::sacfactor, 100, 900, 1 },
	{ "reserveMbar", &preferences::reserve_gas, 0, 400000, 1 },
};

// Partial pressures, stored by the core as bar (double), passed as mbar.
static double *pressure_field(preferences &p, const std::string &key)
{
	if (key == "po2MinMbar")
		return &p.pp_graphs.po2_threshold_min;
	if (key == "po2MaxMbar")
		return &p.pp_graphs.po2_threshold_max;
	if (key == "pn2Mbar")
		return &p.pp_graphs.pn2_threshold;
	if (key == "pheMbar")
		return &p.pp_graphs.phe_threshold;
	if (key == "modPo2Mbar")
		return &p.modpO2;
	return nullptr;
}

static const char *pressure_keys[] = { "po2MinMbar", "po2MaxMbar", "pn2Mbar", "pheMbar", "modPo2Mbar" };

// The keys accepted by set_prefs(), with their values in `p`.
static void append_values(std::string &json, const preferences &p)
{
	const struct units &u = p.units;
	json += "\"length\":";
	json += u.length == units::FEET ? "\"ft\"" : "\"m\"";
	json += ",\"temperature\":";
	json += u.temperature == units::FAHRENHEIT ? "\"F\"" : "\"C\"";
	json += ",\"pressure\":";
	json += u.pressure == units::PSI ? "\"psi\"" : "\"bar\"";
	json += ",\"volume\":";
	json += u.volume == units::CUFT ? "\"cuft\"" : "\"l\"";
	json += ",\"weight\":";
	json += u.weight == units::LBS ? "\"lbs\"" : "\"kg\"";
	json += ",\"unitSystem\":";
	json += p.unit_system == IMPERIAL ? "\"imperial\"" : p.unit_system == PERSONALIZE ? "\"personalize\"" : "\"metric\"";
	json += ",\"verticalSpeed\":";
	json += u.vertical_speed_time == units::SECONDS ? "\"s\"" : "\"min\"";
	json += ",\"duration\":";
	json += u.duration_units == units::MINUTES_ONLY ? "\"minutes\"" : u.duration_units == units::ALWAYS_HOURS ? "\"hours\"" : "\"mixed\"";
	json += ",\"dateFormat\":";
	append_string(json, p.date_format);
	json += ",\"timeFormat\":";
	append_string(json, p.time_format);
	json += ",\"defaultCylinder\":";
	append_string(json, p.default_cylinder);
	for (const BoolPref &b: bool_prefs) {
		json += ",\"";
		json += b.key;
		json += "\":";
		json += p.*b.field ? "true" : "false";
	}
	// One model for the profile and the planner (spec, "Décompression").
	json += ",\"decoModel\":";
	json += p.display_deco_mode == VPMB ? "\"vpmb\"" : "\"buehlmann\"";
	json += ",\"gfLow\":" + std::to_string(p.gflow);
	json += ",\"gfHigh\":" + std::to_string(p.gfhigh);
	json += ",\"vpmbConservatism\":" + std::to_string(p.vpmb_conservatism);
	json += ",\"bestMixEndMm\":" + std::to_string(p.bestmixend.mm);
	for (const char *key: pressure_keys) {
		double bar = *pressure_field(const_cast<preferences &>(p), key); // read only
		json += std::string(",\"") + key + "\":" + std::to_string(lrint(bar * 1000));
	}
	json += ",\"setpointMbar\":" + std::to_string(p.defaultsetpoint);
	json += ",\"o2ConsumptionMlMin\":" + std::to_string(p.o2consumption);
	json += ",\"pscrRatio\":" + std::to_string(p.pscr_ratio);
	for (const IntPref &i: int_prefs)
		json += std::string(",\"") + i.key + "\":" + std::to_string(static_cast<long>(p.*i.field) * i.per_minute);
}

static dive_computer_prefs_t *dive_computer_slot(preferences &p, int slot)
{
	switch (slot) {
	case 1: return &p.dive_computer1;
	case 2: return &p.dive_computer2;
	case 3: return &p.dive_computer3;
	case 4: return &p.dive_computer4;
	default: return nullptr;
	}
}

int get_prefs(std::string &json)
{
	json = "{";
	append_values(json, prefs);
	json += ",\"autogroup\":";
	json += divelog.autogroup ? "true" : "false";
	// The remembered dive computers (qPrefDiveComputer's list of four).
	json += ",\"diveComputers\":[";
	bool first = true;
	for (int slot = 1; slot <= 4; slot++) {
		const dive_computer_prefs_t &dc = *dive_computer_slot(prefs, slot);
		if (dc.vendor.empty() && dc.product.empty())
			continue;
		if (!first)
			json += ',';
		first = false;
		json += "{\"slot\":" + std::to_string(slot) + ",\"vendor\":";
		append_string(json, dc.vendor);
		json += ",\"product\":";
		append_string(json, dc.product);
		json += ",\"device\":";
		append_string(json, dc.device);
		json += ",\"name\":";
		append_string(json, dc.device_name);
		json += '}';
	}
	json += ']';
	// Planner-only values (the planner screen); the decompression model and
	// its parameters are above, shared with the profile.
	json += ",\"planner\":{";
	json += "\"bottomPo2Mbar\":" + std::to_string(prefs.bottompo2);
	json += ",\"decoPo2Mbar\":" + std::to_string(prefs.decopo2);
	json += ",\"bottomSacMlMin\":" + std::to_string(prefs.bottomsac);
	json += ",\"decoSacMlMin\":" + std::to_string(prefs.decosac);
	json += '}';
	json += ",\"defaults\":{";
	preferences defaults;
	append_values(json, defaults);
	json += "}}";
	return 0;
}

static void set_unit_system(preferences &p, unit_system_values system)
{
	p.unit_system = system;
	if (system == PERSONALIZE)
		return;
	// The metric and imperial buttons set the five units
	// (desktop-widgets/preferences/preferences_units.cpp).
	const struct units &u = system == IMPERIAL ? IMPERIAL_units : SI_units;
	p.units.length = u.length;
	p.units.volume = u.volume;
	p.units.pressure = u.pressure;
	p.units.temperature = u.temperature;
	p.units.weight = u.weight;
}

// A choice among names: the index of `value` in `names`, or -1.
static int choice(const JsonValue &v, std::initializer_list<const char *> names)
{
	if (v.kind != JsonValue::STRING)
		return -1;
	int i = 0;
	for (const char *name: names) {
		if (v.text == name)
			return i;
		i++;
	}
	return -1;
}

static bool in_range(const JsonValue &v, long min, long max)
{
	return v.kind == JsonValue::NUMBER && v.number >= min && v.number <= max;
}

static int apply_change(preferences &p, const std::string &key, const JsonValue &v, bool &unit_changed)
{
	for (const BoolPref &b: bool_prefs) {
		if (key == b.key) {
			if (v.kind != JsonValue::NUMBER)
				return -1;
			p.*b.field = v.number != 0;
			return 0;
		}
	}
	for (const IntPref &i: int_prefs) {
		if (key == i.key) {
			if (!in_range(v, i.min, i.max))
				return -1;
			p.*i.field = static_cast<int>(v.number / i.per_minute);
			return 0;
		}
	}
	if (double *field = pressure_field(p, key)) {
		if (!in_range(v, 0, 100000))
			return -1;
		*field = v.number / 1000.0;
		return 0;
	}
	int c;
	if (key == "length") {
		if ((c = choice(v, { "m", "ft" })) < 0)
			return -1;
		p.units.length = c ? units::FEET : units::METERS;
		unit_changed = true;
	} else if (key == "temperature") {
		if ((c = choice(v, { "C", "F" })) < 0)
			return -1;
		p.units.temperature = c ? units::FAHRENHEIT : units::CELSIUS;
		unit_changed = true;
	} else if (key == "pressure") {
		if ((c = choice(v, { "bar", "psi" })) < 0)
			return -1;
		p.units.pressure = c ? units::PSI : units::BAR;
		unit_changed = true;
	} else if (key == "volume") {
		if ((c = choice(v, { "l", "cuft" })) < 0)
			return -1;
		p.units.volume = c ? units::CUFT : units::LITER;
		unit_changed = true;
	} else if (key == "weight") {
		if ((c = choice(v, { "kg", "lbs" })) < 0)
			return -1;
		p.units.weight = c ? units::LBS : units::KG;
		unit_changed = true;
	} else if (key == "unitSystem") {
		if ((c = choice(v, { "metric", "imperial", "personalize" })) < 0)
			return -1;
		set_unit_system(p, c == 0 ? METRIC : c == 1 ? IMPERIAL : PERSONALIZE);
	} else if (key == "verticalSpeed") {
		if ((c = choice(v, { "min", "s" })) < 0)
			return -1;
		p.units.vertical_speed_time = c ? units::SECONDS : units::MINUTES;
	} else if (key == "duration") {
		if ((c = choice(v, { "mixed", "minutes", "hours" })) < 0)
			return -1;
		p.units.duration_units = c == 0 ? units::MIXED : c == 1 ? units::MINUTES_ONLY : units::ALWAYS_HOURS;
	} else if (key == "dateFormat" || key == "timeFormat" || key == "defaultCylinder") {
		if (v.kind != JsonValue::STRING)
			return -1;
		(key == "dateFormat" ? p.date_format : key == "timeFormat" ? p.time_format : p.default_cylinder) = v.text;
	} else if (key == "decoModel") {
		if ((c = choice(v, { "buehlmann", "vpmb" })) < 0)
			return -1;
		p.display_deco_mode = p.planner_deco_mode = c ? VPMB : BUEHLMANN;
	} else if (key == "gfLow") {
		if (!in_range(v, 10, 150))
			return -1;
		p.gflow = static_cast<int>(v.number);
	} else if (key == "gfHigh") {
		if (!in_range(v, 40, 150))
			return -1;
		p.gfhigh = static_cast<int>(v.number);
	} else if (key == "vpmbConservatism") {
		if (!in_range(v, 0, 4))
			return -1;
		p.vpmb_conservatism = static_cast<int>(v.number);
	} else if (key == "bestMixEndMm") {
		if (!in_range(v, 0, 200000))
			return -1;
		p.bestmixend.mm = static_cast<int32_t>(v.number);
	} else if (key == "setpointMbar") {
		if (!in_range(v, 0, 10000))
			return -1;
		p.defaultsetpoint = static_cast<int>(v.number);
	} else if (key == "o2ConsumptionMlMin") {
		if (!in_range(v, 0, 10000))
			return -1;
		p.o2consumption = static_cast<int>(v.number);
	} else if (key == "pscrRatio") {
		if (!in_range(v, 1, 1000))
			return -1;
		p.pscr_ratio = static_cast<int>(v.number);
	} else if (key == "forgetDiveComputer") {
		// Subsurface-mobile's "Forget": vendor, product and device of each
		// remembered computer and of the last one used.
		// One computer (slot 1 to 4) also forgets it as the last one used.
		if (!in_range(v, 0, 4))
			return -1;
		int only = static_cast<int>(v.number);
		auto forget = [](dive_computer_prefs_t &dc) { dc.vendor = dc.product = dc.device = ""; };
		for (int slot = 1; slot <= 4; slot++) {
			dive_computer_prefs_t &dc = *dive_computer_slot(p, slot);
			if (only && slot != only)
				continue;
			if (only && dc.vendor == p.dive_computer.vendor && dc.product == p.dive_computer.product &&
			    dc.device == p.dive_computer.device)
				forget(p.dive_computer);
			forget(dc);
		}
		if (!only)
			forget(p.dive_computer);
	} else {
		return -1;
	}
	return 0;
}

int set_prefs(const std::string &changes_json, std::string &error)
{
	std::vector<std::pair<std::string, JsonValue>> changes;
	if (!JsonReader(changes_json).object(changes)) {
		error = "BAD_REQUEST: invalid JSON";
		return -1;
	}
	preferences p = prefs;
	bool unit_changed = false, system_set = false;
	for (const auto &[key, value]: changes) {
		if (apply_change(p, key, value, unit_changed)) {
			error = "BAD_REQUEST: " + key;
			return -1;
		}
		system_set |= key == "unitSystem";
	}
	// Changing one unit goes to "Personalised" (spec, settings table).
	if (unit_changed && !system_set)
		p.unit_system = PERSONALIZE;
	bool tank_infos_changed = p.display_default_tank_infos != prefs.display_default_tank_infos;
	prefs = p;
	if (tank_infos_changed)
		reset_tank_info_table(tank_info_table); // as preferences_equipment.cpp
	return 0;
}

// --- Cylinder types ---------------------------------------------------------

static bool name_less(const std::string &a, const std::string &b)
{
	return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end(), [](char x, char y) {
		return tolower(static_cast<unsigned char>(x)) < tolower(static_cast<unsigned char>(y));
	});
}

namespace internal {

bool cylinder_type_name_in_use(const std::string &name)
{
	auto same = [&name](const tank_info &ti) { return ti.name == name; };
	return std::any_of(tank_info_table.begin(), tank_info_table.end(), same) ||
	       std::any_of(get_tank_info_baseline().begin(), get_tank_info_baseline().end(), same);
}

} // namespace internal

int cylinder_types(std::string &json)
{
	std::vector<tank_info> standard = default_tank_info_table();
	std::vector<tank_info> &library = get_tank_info_baseline();
	std::vector<const tank_info *> sorted;
	for (const tank_info &info: tank_info_table)
		sorted.push_back(&info);
	// TankInfoModel shows the table sorted by name, ignoring case.
	std::stable_sort(sorted.begin(), sorted.end(),
			 [](const tank_info *a, const tank_info *b) { return name_less(a->name, b->name); });
	json = "{\"types\":[";
	bool first = true;
	for (const tank_info *info: sorted) {
		auto [size, pressure] = extract_tank_info(*info);
		if (!first)
			json += ',';
		first = false;
		json += "{\"name\":";
		append_string(json, info->name);
		json += ",\"ml\":" + std::to_string(size.mliter) + ",\"mbar\":" + std::to_string(pressure.mbar);
		json += ",\"standard\":";
		json += get_tank_info(standard, info->name) ? "true" : "false";
		json += ",\"library\":";
		json += get_tank_info(library, info->name) ? "true" : "false";
		json += '}';
	}
	json += "],\"library\":[";
	first = true;
	for (const tank_info &info: library) {
		if (!first)
			json += ',';
		first = false;
		append_string(json, info.name + "\t" + std::to_string(info.ml) + "\t" + std::to_string(info.bar) + "\t" +
					    std::to_string(info.cuft) + "\t" + std::to_string(info.psi));
	}
	json += "]}";
	return 0;
}

int set_cylinder_library(const std::string &library_json, std::string &error)
{
	std::vector<std::pair<std::string, JsonValue>> fields;
	if (!JsonReader(library_json).object(fields) || fields.size() != 1 || fields[0].first != "library" ||
	    fields[0].second.kind != JsonValue::LIST) {
		error = "BAD_REQUEST: library";
		return -1;
	}
	std::vector<tank_info> library;
	for (const std::string &line: fields[0].second.list) {
		std::vector<std::string> parts;
		size_t start = 0;
		for (;;) {
			size_t tab = line.find('\t', start);
			parts.push_back(line.substr(start, tab == std::string::npos ? std::string::npos : tab - start));
			if (tab == std::string::npos)
				break;
			start = tab + 1;
		}
		if (parts.size() != 5 || parts[0].empty()) {
			error = "BAD_REQUEST: library entry";
			return -1;
		}
		library.push_back(tank_info { parts[0], atoi(parts[3].c_str()), atoi(parts[1].c_str()),
					      atoi(parts[4].c_str()), atoi(parts[2].c_str()) });
	}
	set_tank_info_baseline(std::move(library));
	reset_tank_info_table(tank_info_table);
	return 0;
}

int cylinder_type_action(const std::string &action, const std::string &name, int ml, int mbar, std::string &json,
			 std::string &error)
{
	std::vector<tank_info> &library = get_tank_info_baseline();
	if (action == "add") {
		// TankInfoModel::add(), then the size and pressure typed in the sheet.
		if (name.empty()) {
			error = "BAD_REQUEST: name";
			return -1;
		}
		if (internal::cylinder_type_name_in_use(name)) {
			error = "NAME_IN_USE";
			return -1;
		}
		tank_info info { name, 0, 0, 0, 0 };
		if (ml > 0)
			update_tank_info_data(info, volume_t { .mliter = ml }, pressure_t { .mbar = mbar });
		tank_info_table.push_back(info);
		library.push_back(info);
	} else if (action == "size") {
		// TankInfoModel::setData() for ML and BAR.
		tank_info *info = get_tank_info(tank_info_table, name);
		if (!info) {
			error = "NOT_FOUND";
			return -1;
		}
		if (ml <= 0 || mbar < 0) {
			error = "BAD_REQUEST: size";
			return -1;
		}
		update_tank_info_data(*info, volume_t { .mliter = ml }, pressure_t { .mbar = mbar });
		if (tank_info *in_library = get_tank_info(library, name))
			update_tank_info_data(*in_library, volume_t { .mliter = ml }, pressure_t { .mbar = mbar });
	} else if (action == "remove") {
		// TankInfoModel::remove(): only a type of the library.
		auto it = std::find_if(library.begin(), library.end(), [&name](const tank_info &ti) { return ti.name == name; });
		if (it == library.end()) {
			error = "NOT_FOUND";
			return -1;
		}
		auto row = std::find_if(tank_info_table.begin(), tank_info_table.end(),
					[&name](const tank_info &ti) { return ti.name == name; });
		if (row != tank_info_table.end())
			tank_info_table.erase(row);
		library.erase(it);
		if (prefs.default_cylinder == name)
			prefs.default_cylinder.clear();
	} else {
		error = "BAD_REQUEST: unknown action " + action;
		return -1;
	}
	return cylinder_types(json);
}

} // namespace opendives
