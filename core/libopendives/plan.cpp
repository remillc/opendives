// SPDX-License-Identifier: GPL-2.0
// Dive planner (docs/ui-specification.md, section 4, "Planner"): runs
// Subsurface's plan() on a dive that is never added to the logbook.
//
// Ported from Subsurface without modifying it:
//  - the plan setup from qt-models/diveplannermodel.cpp: createSimpleDive()
//    (planner dive computer, start time from setupStartTime()),
//    createTemporaryPlan() (a zero-length segment per cylinder at its switch
//    depth, then the descent at the descent rate as in drop-stone mode, then
//    the bottom)
//    and updateDiveProfile() (plan() with a 60 s time step);
//  - the switch depths from qt-models/cylindermodel.cpp, through the core's
//    reset_cylinders() / calculate_deco_switch_depth() (ppO2 for deco, rounded
//    to 3 m / 10 ft); in the planner the cylinder's working pressure is its
//    start pressure, as in Subsurface's planner cylinder table;
//  - the rates from mobile-widgets (qPrefDivePlanner): per minute, divided by 60;
//  - the minimum gas and the gas warnings as core/plannernotes.cpp computes
//    them (add_plan_to_notes(), called by plan(), sets minimum_gas).
// The deco model, gradient factors and VPM-B conservatism are read from the
// core's preferences (Settings, "Décompression"), never from the request.
#include "opendives.h"

#include "core/deco.h"
#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelist.h"
#include "core/divelog.h"
#include "core/equipment.h"
#include "core/event.h"
#include "core/gas.h"
#include "core/planner.h"
#include "core/pref.h"
#include "core/sample.h"
#include "core/subsurface-time.h"
#include "core/units.h"

#include <cctype>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <map>
#include <string>
#include <vector>

namespace opendives {

namespace {

// Minimal reader for the plan request: one object whose values are integers,
// booleans or an array of such flat objects ("cylinders").
using Flat = std::map<std::string, long>;

class Reader {
public:
	explicit Reader(const std::string &s) : s(s) {}

	bool request(Flat &values, std::vector<Flat> &cylinders)
	{
		if (!open())
			return false;
		if (eat('}'))
			return end();
		for (;;) {
			std::string key;
			if (!string(key) || !colon())
				return false;
			space();
			if (key == "cylinders") {
				if (!eat('['))
					return false;
				space();
				if (!eat(']')) {
					for (;;) {
						Flat c;
						if (!flat(c))
							return false;
						cylinders.push_back(std::move(c));
						space();
						if (eat(','))
							continue;
						if (eat(']'))
							break;
						return false;
					}
				}
			} else {
				long v;
				if (!number(v))
					return false;
				values[key] = v;
			}
			space();
			if (eat(','))
				continue;
			if (eat('}'))
				return end();
			return false;
		}
	}

private:
	const std::string &s;
	size_t i = 0;

	void space()
	{
		while (i < s.size() && isspace(static_cast<unsigned char>(s[i])))
			i++;
	}
	bool eat(char c)
	{
		space();
		if (i < s.size() && s[i] == c) {
			i++;
			return true;
		}
		return false;
	}
	bool open() { return eat('{'); }
	bool colon() { return eat(':'); }
	bool end()
	{
		space();
		return i == s.size();
	}
	bool string(std::string &out)
	{
		if (!eat('"'))
			return false;
		while (i < s.size() && s[i] != '"') {
			if (s[i] == '\\')
				return false; // keys are plain names
			out += s[i++];
		}
		return eat('"');
	}
	bool word(const char *w)
	{
		size_t n = strlen(w);
		if (s.compare(i, n, w) != 0)
			return false;
		i += n;
		return true;
	}
	bool number(long &v)
	{
		space();
		if (word("true")) {
			v = 1;
			return true;
		}
		if (word("false")) {
			v = 0;
			return true;
		}
		size_t start = i;
		if (i < s.size() && s[i] == '-')
			i++;
		while (i < s.size() && isdigit(static_cast<unsigned char>(s[i])))
			i++;
		if (i == start || (i == start + 1 && s[start] == '-'))
			return false;
		v = strtol(s.substr(start, i - start).c_str(), nullptr, 10);
		return true;
	}
	bool flat(Flat &out)
	{
		if (!open())
			return false;
		if (eat('}'))
			return true;
		for (;;) {
			std::string key;
			long v;
			if (!string(key) || !colon() || !number(v))
				return false;
			out[key] = v;
			if (eat(','))
				continue;
			return eat('}');
		}
	}
};

void dp_add(diveplan &dp, int duration, depth_t depth)
{
	plan_add_segment(dp, duration, depth, 0, 0, true, OC);
}

long get(const Flat &values, const char *key, long fallback)
{
	auto it = values.find(key);
	return it == values.end() ? fallback : it->second;
}

const char *model_name(enum deco_mode mode)
{
	return mode == VPMB ? "vpmb" : mode == RECREATIONAL ? "recreational" : "buehlmann";
}

const char *error_name(planner_error_t error)
{
	switch (error) {
	case PLAN_OK: return "";
	case PLAN_ERROR_TIMEOUT: return "TIMEOUT";
	case PLAN_ERROR_INAPPROPRIATE_GAS: return "INAPPROPRIATE_GAS";
	case PLAN_ERROR_NO_SUITABLE_BAILOUT_GAS: return "NO_SUITABLE_BAILOUT_GAS";
	case PLAN_ERROR_RECREATIONAL_EXCEEDS_NDL: return "RECREATIONAL_EXCEEDS_NDL";
	}
	return "UNKNOWN";
}

void add(std::string &json, const char *key, long value, bool comma = true)
{
	if (comma)
		json += ',';
	json += '"';
	json += key;
	json += "\":";
	json += std::to_string(value);
}

void add_bool(std::string &json, const char *key, bool value)
{
	json += ",\"";
	json += key;
	json += "\":";
	json += value ? "true" : "false";
}

// Settings the planner reads from prefs: the planner-only ones, which the
// request may set for this plan, and the shared decompression ones.
std::string setup_json()
{
	std::string json = "{\"model\":\"";
	json += model_name(prefs.planner_deco_mode);
	json += '"';
	add(json, "gfLow", prefs.gflow);
	add(json, "gfHigh", prefs.gfhigh);
	add(json, "vpmbConservatism", prefs.vpmb_conservatism);
	add(json, "bottomSacMlMin", prefs.bottomsac);
	add(json, "decoSacMlMin", prefs.decosac);
	add(json, "bottomPo2Mbar", prefs.bottompo2);
	add(json, "decoPo2Mbar", prefs.decopo2);
	add(json, "descentMmMin", prefs.descrate * 60L);
	add(json, "ascent75MmMin", prefs.ascrate75 * 60L);
	add(json, "ascent50MmMin", prefs.ascrate50 * 60L);
	add(json, "ascentStopsMmMin", prefs.ascratestops * 60L);
	add(json, "ascentLast6mMmMin", prefs.ascratelast6m * 60L);
	add_bool(json, "lastStop6m", prefs.last_stop);
	add_bool(json, "safetyStop", prefs.safetystop);
	add_bool(json, "switchAtRequiredStop", prefs.switch_at_req_stop);
	add(json, "minSwitchSeconds", prefs.min_switch_duration);
	add_bool(json, "o2Breaks", prefs.doo2breaks);
	add(json, "reserveMbar", prefs.reserve_gas);
	add(json, "problemSolvingMinutes", prefs.problemsolvingtime);
	add(json, "sacFactor", prefs.sacfactor);
	json += '}';
	return json;
}

// The request's planner-only settings, into prefs (restored by the caller).
void apply_settings(const Flat &v)
{
	prefs.bottomsac = get(v, "bottomSacMlMin", prefs.bottomsac);
	prefs.decosac = get(v, "decoSacMlMin", prefs.decosac);
	prefs.bottompo2 = get(v, "bottomPo2Mbar", prefs.bottompo2);
	prefs.decopo2 = get(v, "decoPo2Mbar", prefs.decopo2);
	prefs.descrate = get(v, "descentMmMin", prefs.descrate * 60L) / 60;
	prefs.ascrate75 = get(v, "ascent75MmMin", prefs.ascrate75 * 60L) / 60;
	prefs.ascrate50 = get(v, "ascent50MmMin", prefs.ascrate50 * 60L) / 60;
	prefs.ascratestops = get(v, "ascentStopsMmMin", prefs.ascratestops * 60L) / 60;
	prefs.ascratelast6m = get(v, "ascentLast6mMmMin", prefs.ascratelast6m * 60L) / 60;
	prefs.last_stop = get(v, "lastStop6m", prefs.last_stop);
	prefs.safetystop = get(v, "safetyStop", prefs.safetystop);
	prefs.switch_at_req_stop = get(v, "switchAtRequiredStop", prefs.switch_at_req_stop);
	prefs.min_switch_duration = get(v, "minSwitchSeconds", prefs.min_switch_duration);
	prefs.doo2breaks = get(v, "o2Breaks", prefs.doo2breaks);
	prefs.reserve_gas = get(v, "reserveMbar", prefs.reserve_gas);
	prefs.problemsolvingtime = get(v, "problemSolvingMinutes", prefs.problemsolvingtime);
	prefs.sacfactor = get(v, "sacFactor", prefs.sacfactor);
	// A plan is always calculated, never "display only" options.
	prefs.surface_segment = 0;
}

// DivePlannerPointsModel::setupStartTime(): an hour from now, or an hour
// after the end of the latest dive if it ends later.
timestamp_t start_time()
{
	timestamp_t when = time(nullptr) + gettimezoneoffset() + 3600;
	if (!divelog.dives.empty()) {
		timestamp_t ends = divelog.dives.back()->endtime();
		if (ends - when > 0)
			when += ends - when + 3600;
	}
	return when;
}

std::string result_json(const diveplan &plan, struct dive &d, planner_error_t error)
{
	const divecomputer &dc = d.dcs[0];
	std::string json = "{\"error\":\"";
	json += error_name(error);
	json += "\",\"setup\":" + setup_json();
	add(json, "effGfLow", plan.eff_gflow);
	add(json, "effGfHigh", plan.eff_gfhigh);
	add(json, "when", static_cast<long>(plan.when));
	add(json, "surfaceIntervalSeconds", plan.surface_interval);
	add(json, "runtimeSeconds", dc.duration.seconds);
	int max_depth = 0;
	for (const sample &s: dc.samples)
		max_depth = std::max(max_depth, s.depth.mm);
	add(json, "maxDepthMm", max_depth);
	add(json, "cns", d.cns);
	add(json, "otu", d.otu);

	// Profile: one point per sample of the planned dive.
	json += ",\"points\":[";
	for (size_t i = 0; i < dc.samples.size(); i++) {
		if (i)
			json += ',';
		json += '[' + std::to_string(dc.samples[i].time.seconds) + ',' + std::to_string(dc.samples[i].depth.mm) + ']';
	}

	// Waypoints of the plan, as plan() leaves them (absolute times).
	json += "],\"segments\":[";
	bool first = true;
	for (const divedatapoint &p: plan.dp) {
		if (p.time == 0)
			continue; // the available gases, not waypoints
		if (!first)
			json += ',';
		first = false;
		json += '{';
		add(json, "timeSeconds", p.time, false);
		add(json, "depthMm", p.depth.mm);
		add(json, "cylinder", p.cylinderid);
		add_bool(json, "entered", p.entered);
		json += '}';
	}

	// Stops: calculated segments at a constant depth below the surface.
	json += "],\"stops\":[";
	first = true;
	const divedatapoint *prev = nullptr;
	int gas = -1;
	for (const divedatapoint &p: plan.dp) {
		if (p.time == 0)
			continue;
		bool stop = prev && !p.entered && p.depth.mm > 0 && p.depth.mm == prev->depth.mm && p.time > prev->time;
		if (stop) {
			if (!first)
				json += ',';
			first = false;
			json += '{';
			add(json, "depthMm", p.depth.mm, false);
			add(json, "durationSeconds", p.time - prev->time);
			add(json, "runtimeSeconds", p.time);
			add(json, "cylinder", p.cylinderid);
			add_bool(json, "gasChange", gas != -1 && p.cylinderid != gas);
			json += '}';
		}
		gas = p.cylinderid;
		prev = &p;
	}

	// Gas use, then the warnings of plannernotes.cpp, in its order.
	const divedatapoint *mindp = nullptr;
	for (const divedatapoint &p: plan.dp)
		if (p.minimum_gas.mbar != 0)
			mindp = &p;
	constexpr pressure_t min_cylinder_pressure = 10_bar;
	std::string minimum = "null";
	json += "],\"cylinders\":[";
	for (size_t i = 0; i < d.cylinders.size(); i++) {
		const cylinder_t &cyl = d.cylinders[i];
		const char *warning = "";
		double deco_pressure_mbar = 0;
		if (cyl.type.size.mliter) {
			int remaining_gas = lrint((double)cyl.end.mbar * cyl.type.size.mliter / 1000.0 / gas_compressibility_factor(cyl.gasmix, cyl.end.mbar / 1000.0));
			deco_pressure_mbar = isothermal_pressure(cyl.gasmix, 1.0, remaining_gas + cyl.deco_gas_used.mliter,
				cyl.type.size.mliter) * 1000 - cyl.end.mbar;
			if (cyl.end.mbar <= min_cylinder_pressure.mbar)
				warning = "MORE_THAN_AVAILABLE";
			else if ((cyl.end - min_cylinder_pressure).mbar / 1000.0 * cyl.type.size.mliter / gas_compressibility_factor(cyl.gasmix, (cyl.end - min_cylinder_pressure).mbar / 1000.0) < cyl.deco_gas_used.mliter)
				warning = "NO_RESERVE_FOR_SHARING";
			else if (mindp && static_cast<int>(i) == mindp->cylinderid) {
				if ((cyl.start - min_cylinder_pressure).mbar <= mindp->minimum_gas.mbar)
					warning = "NO_GAS_FOR_PROBLEM_SOLVING";
				minimum = "{";
				add(minimum, "cylinder", mindp->cylinderid, false);
				add(minimum, "depthMm", mindp->depth.mm);
				add(minimum, "pressureMbar", mindp->minimum_gas.mbar);
				// Pressure left at the end of the bottom time, minus the minimum gas.
				add(minimum, "deltaMbar", lrint((double)cyl.end.mbar + deco_pressure_mbar - mindp->minimum_gas.mbar));
				add(minimum, "sacFactor", prefs.sacfactor);
				add(minimum, "problemSolvingMinutes", prefs.problemsolvingtime);
				minimum += '}';
			}
		}
		if (i)
			json += ',';
		json += '{';
		add(json, "o2Permille", get_o2(cyl.gasmix), false);
		add(json, "hePermille", get_he(cyl.gasmix));
		add(json, "sizeMl", cyl.type.size.mliter);
		add(json, "startMbar", cyl.start.mbar);
		add(json, "endMbar", cyl.end.mbar);
		add(json, "gasUsedMl", cyl.gas_used.mliter);
		add(json, "decoGasUsedMl", cyl.deco_gas_used.mliter);
		add(json, "decoPressureMbar", lrint(deco_pressure_mbar));
		add(json, "switchDepthMm", cyl.depth.mm);
		// Deepest use of this gas at the ppO2 for the bottom (rounded down to 1 m).
		add(json, "bottomModMm", d.gas_mod(cyl.gasmix, pressure_t { .mbar = prefs.bottompo2 }, 1_m).mm);
		json += ",\"warning\":\"";
		json += warning;
		json += "\"}";
	}
	json += "],\"minimumGas\":" + minimum + '}';
	return json;
}

} // namespace

int planner_setup(std::string &json)
{
	json = setup_json();
	return 0;
}

int plan_dive(const std::string &request, std::string &json, std::string &error)
{
	Flat v;
	std::vector<Flat> cylinders;
	if (!Reader(request).request(v, cylinders)) {
		error = "BAD_REQUEST: not a plan request";
		return -1;
	}
	long depth = get(v, "depthMm", 0), bottom_time = get(v, "bottomTimeSeconds", 0);
	if (depth <= 0 || depth > 300000 || bottom_time <= 0 || bottom_time > 6 * 3600 || cylinders.empty() || cylinders.size() > 20) {
		error = "BAD_REQUEST: depth, bottom time and at least one cylinder are needed";
		return -1;
	}
	for (const Flat &c: cylinders) {
		long o2 = get(c, "o2Permille", 0), he = get(c, "hePermille", 0);
		if (o2 <= 0 || o2 > 1000 || he < 0 || o2 + he > 1000 || get(c, "sizeMl", 0) < 0 || get(c, "startMbar", 0) < 0) {
			error = "BAD_REQUEST: invalid cylinder";
			return -1;
		}
	}

	// Planner-only settings for this plan only: prefs are restored afterwards.
	struct preferences saved = prefs;
	apply_settings(v);

	struct dive d;
	d.when = get(v, "when", 0) > 0 ? get(v, "when", 0) : start_time();
	make_planner_dc(&d.dcs[0]);
	d.dcs[0].divemode = OC;
	// Create every cylinder first: pointers are not stable while the table grows.
	d.get_or_create_cylinder(static_cast<int>(cylinders.size()) - 1);
	for (size_t i = 0; i < cylinders.size(); i++) {
		cylinder_t &cyl = d.cylinders[i];
		cyl.gasmix.o2.permille = get(cylinders[i], "o2Permille", 209);
		cyl.gasmix.he.permille = get(cylinders[i], "hePermille", 0);
		cyl.type.size.mliter = get(cylinders[i], "sizeMl", 0);
		cyl.type.workingpressure.mbar = get(cylinders[i], "startMbar", 0);
		cyl.cylinder_use = OC_GAS;
		cyl.manually_added = true;
	}

	diveplan dp;
	dp.when = d.when;
	dp.salinity = get(v, "salinity", 10300);
	dp.surface_pressure.mbar = get(v, "surfacePressureMbar", 1013);
	dp.bottomsac = prefs.bottomsac;
	dp.decosac = prefs.decosac;
	dp.gflow = prefs.gflow;
	dp.gfhigh = prefs.gfhigh;
	dp.vpmb_conservatism = prefs.vpmb_conservatism;
	d.surface_pressure = dp.surface_pressure;
	d.salinity = dp.salinity;
	// Switch depths at the ppO2 for deco, start = end = fill pressure.
	reset_cylinders(&d, true);

	// createTemporaryPlan(): the available gases, then the bottom.
	for (size_t i = 0; i < d.cylinders.size(); i++)
		if (d.cylinders[i].depth.mm && d.cylinders[i].cylinder_use == OC_GAS)
			plan_add_segment(dp, 0, d.cylinders[i].depth, static_cast<int>(i), 0, false, OC);
	depth_t bottom { .mm = static_cast<int32_t>(depth) };
	// As in drop-stone mode: the descent at the descent rate, counted in the
	// bottom time (Subsurface's runtime of the last entered waypoint).
	int descent = bottom.mm / prefs.descrate;
	dp_add(dp, descent, bottom);
	if (bottom_time > descent)
		dp_add(dp, static_cast<int>(bottom_time) - descent, bottom);

	deco_state_cache cache;
	struct deco_state ds;
	planner_error_t result = plan(&ds, dp, &d, 0, 60, cache, true, false, nullptr);
	json = result_json(dp, d, result);
	prefs = saved;
	set_gf(prefs.gflow, prefs.gfhigh);
	set_vpmb_conservatism(prefs.vpmb_conservatism);
	return 0;
}

} // namespace opendives
