// SPDX-License-Identifier: GPL-2.0
// Tools section (docs/ui-specification.md, section 1, "Tools"): cylinder and
// weight types, and desaturation (the gas calculator and blender are in
// JavaScript, app/src/lib/gas-calculator.js and gas-blend.js). Read-only: nothing here changes the log. Every value comes
// from the core's own functions, or from code ported as is from Subsurface
// (each port names its source).
#include "opendives.h"
#include "internal.h"

#include "core/deco.h"
#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelist.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/equipment.h"
#include "core/gas.h"
#include "core/pref.h"
#include "core/profile.h"
#include "core/subsurface-time.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <ctime>

namespace opendives {

static void tools_json_string(std::string &out, const std::string &s)
{
	out += '"';
	for (unsigned char c: s) {
		if (c == '"' || c == '\\') {
			out += '\\';
			out += static_cast<char>(c);
		} else if (c < 0x20) {
			char buf[8];
			snprintf(buf, sizeof(buf), "\\u%04x", c);
			out += buf;
		} else {
			out += static_cast<char>(c);
		}
	}
	out += '"';
}

// The core keeps local wall-clock time in a timestamp_t, without a time zone.
static std::string tools_iso(timestamp_t when)
{
	time_t t = static_cast<time_t>(when);
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tm);
	return buf;
}

static const char *deco_mode_name(enum deco_mode mode)
{
	return mode == VPMB ? "vpmb" : mode == RECREATIONAL ? "recreational" : "buehlmann";
}

int gas_cylinder_types(std::string &json)
{
	// Port of formatFullCylinderList() (core/string-format.cpp): the cylinder
	// types used in the log, then the known types, sorted, without duplicates.
	// Without a reload through Subsurface's clear_dive_file_data(), the known
	// types are the baseline that reset_tank_info_table() would copy.
	std::vector<std::string> names;
	auto add = [&names](const std::string &s) {
		if (s.empty())
			return;
		auto it = std::lower_bound(names.begin(), names.end(), s);
		if (it != names.end() && *it == s)
			return;
		names.insert(it, s);
	};
	for (auto &d: divelog.dives)
		for (const cylinder_t &cyl: d->cylinders)
			add(cyl.type.description);
	for (const auto &ti: tank_info_table)
		add(ti.name);
	if (tank_info_table.empty() && prefs.display_default_tank_infos)
		for (const auto &ti: get_tank_info_baseline())
			add(ti.name);

	json = "{\"default\":";
	tools_json_string(json, prefs.default_cylinder);
	json += ",\"types\":[";
	for (size_t i = 0; i < names.size(); i++) {
		if (i)
			json += ',';
		auto [size, pressure] = get_tank_info_data(tank_info_table, names[i]);
		if (!size.mliter && !pressure.mbar)
			std::tie(size, pressure) = get_tank_info_data(get_tank_info_baseline(), names[i]);
		json += "{\"name\":";
		tools_json_string(json, names[i]);
		json += ",\"ml\":" + std::to_string(size.mliter) + ",\"workingPressureMbar\":" + std::to_string(pressure.mbar) + '}';
	}
	json += "]}";
	return 0;
}

int weight_types(std::string &json)
{
	// WSInfoModel (qt-models/weightsysteminfomodel.cpp): ws_info_table in order.
	json = "{\"types\":[";
	for (size_t i = 0; i < ws_info_table.size(); i++) {
		if (i)
			json += ',';
		json += "{\"name\":";
		tools_json_string(json, ws_info_table[i].name);
		json += ",\"grams\":" + std::to_string(ws_info_table[i].weight.grams) + '}';
	}
	json += "]}";
	return 0;
}

int desaturation(int64_t now, std::string &json)
{
	// Local wall-clock time, as Subsurface's planner dates a new dive.
	if (!now)
		now = static_cast<int64_t>(time(nullptr)) + gettimezoneoffset();

	internal::HiddenPlans hidden_plans; // a plan is not a dive done

	// A dive starting now, in no trip: the core's init_decompression() then
	// loads the tissues with the logbook dives before it and the surface
	// intervals, up to now, as the planner does for a new dive.
	struct dive now_dive;
	make_planner_dc(&now_dive.dcs[0]);
	now_dive.when = now;

	// Same settings as the planner (planner.cpp, plan()).
	set_gf(prefs.gflow, prefs.gfhigh);
	set_vpmb_conservatism(prefs.vpmb_conservatism);
	struct deco_state ds;
	int surface_time = divelog.dives.init_decompression(&ds, &now_dive, true);

	// The dives init_decompression() used: going back from now, while a dive
	// ends less than 48 h before the start of the next one (or before now).
	std::vector<const struct dive *> used;
	timestamp_t last_start = now;
	for (auto it = divelog.dives.rbegin(); it != divelog.dives.rend(); ++it) {
		const struct dive &d = **it;
		if (d.when >= now)
			continue; // future dives are not added
		if (d.endtime() + 48 * 60 * 60 < last_start)
			break;
		used.push_back(&d);
		last_start = d.when;
	}
	std::reverse(used.begin(), used.end());

	double surface_pressure = now_dive.get_surface_pressure().mbar / 1000.0;
	if (used.empty()) {
		// Tissues at rest. clear_deco() leaves tissue_inertgas_saturation at
		// zero until the first add_segment(), which the profile always runs
		// before reading it: one second of air at the surface, unchanged.
		add_segment(&ds, surface_pressure, gasmix_air, 1, 0, OC, prefs.decosac, true);
		tissue_tolerance_calc(&ds, &now_dive, surface_pressure, true);
	}

	json = "{\"now\":";
	tools_json_string(json, tools_iso(now));
	json += ",\"surfaceSeconds\":" + std::to_string(used.empty() ? -1 : surface_time);
	json += ",\"model\":\"";
	json += deco_mode_name(pref_deco_mode(true));
	json += "\",\"gfLow\":" + std::to_string(prefs.gflow) + ",\"gfHigh\":" + std::to_string(prefs.gfhigh);
	json += ",\"vpmbConservatism\":" + std::to_string(prefs.vpmb_conservatism);
	json += ",\"dives\":[";
	for (size_t i = 0; i < used.size(); i++) {
		const struct dive &d = *used[i];
		if (i)
			json += ',';
		json += "{\"id\":" + std::to_string(d.id) + ",\"number\":" + std::to_string(d.number) + ",\"date\":";
		tools_json_string(json, tools_iso(d.when));
		json += ",\"endDate\":";
		tools_json_string(json, tools_iso(d.endtime()));
		json += ",\"site\":";
		tools_json_string(json, d.dive_site ? d.dive_site->name : std::string());
		json += ",\"maxDepthMm\":" + std::to_string(d.maxdepth.mm);
		json += ",\"durationSeconds\":" + std::to_string(d.duration.seconds) + '}';
	}
	json += "],\"tissues\":[";
	// Per compartment, the saturation shown by Subsurface's profile (tissue
	// graph, calculate_deco_information() in core/profile.cpp) at the surface:
	// 0 to AMB_PERCENTAGE below the ambient pressure, AMB_PERCENTAGE to 100
	// from ambient to the M-value; and the surface GF of the same function.
	double ambpressure = surface_pressure;
	for (int j = 0; j < 16; j++) {
		double m_value = ds.buehlmann_inertgas_a[j] + ambpressure / ds.buehlmann_inertgas_b[j];
		double surface_m_value = ds.buehlmann_inertgas_a[j] + surface_pressure / ds.buehlmann_inertgas_b[j];
		double current_gf = (ds.tissue_inertgas_saturation[j] - ambpressure) / (m_value - ambpressure);
		long percent = ds.tissue_inertgas_saturation[j] < ambpressure ?
			lrint(ds.tissue_inertgas_saturation[j] / ambpressure * AMB_PERCENTAGE) :
			lrint(AMB_PERCENTAGE + current_gf * (100.0 - AMB_PERCENTAGE));
		double surface_gf = 100.0 * (ds.tissue_inertgas_saturation[j] - surface_pressure) / (surface_m_value - surface_pressure);
		char buf[160];
		snprintf(buf, sizeof(buf), "%s{\"percent\":%ld,\"surfaceGf\":%.1f,\"n2Bar\":%.4f,\"heBar\":%.4f,\"halfTimeMin\":%g}",
			 j ? "," : "", percent, surface_gf, ds.tissue_n2_sat[j], ds.tissue_he_sat[j], buehlmann_N2_t_halflife[j]);
		json += buf;
	}
	json += "]}";
	return 0;
}

} // namespace opendives
