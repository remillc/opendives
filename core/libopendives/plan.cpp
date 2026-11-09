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
//  - the waypoints of a logged dive from DivePlannerPointsModel::loadFromDive();
//  - the minimum gas and the gas warnings as core/plannernotes.cpp computes
//    them (add_plan_to_notes(), called by plan(), sets minimum_gas).
// The deco model, gradient factors and VPM-B conservatism come from the core's
// preferences (Settings, "Décompression") unless the request sets them for
// this plan; the preferences are put back afterwards.
#include "opendives.h"
#include "internal.h"

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
#include "core/profile.h"
#include "core/sample.h"
#include "core/subsurface-time.h"
#include "core/units.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace opendives {

namespace internal {

bool is_plan_only(const struct dive &d)
{
	return d.is_planned() && !d.is_logged();
}

struct HiddenPlans::Held {
	std::unique_ptr<struct dive> d;
	bool hidden_by_filter;
};

HiddenPlans::HiddenPlans(const struct dive *also)
{
	for (int i = static_cast<int>(divelog.dives.size()) - 1; i >= 0; i--) {
		const struct dive *d = divelog.dives[i].get();
		if (d != also && !is_plan_only(*d))
			continue;
		bool hidden = d->hidden_by_filter;
		held.push_back({ divelog.dives.unregister_dive(i), hidden });
	}
}

HiddenPlans::~HiddenPlans()
{
	for (Held &h: held) {
		struct dive *d = divelog.dives.register_dive(std::move(h.d));
		d->hidden_by_filter = h.hidden_by_filter;
	}
}

} // namespace internal

namespace {

// Minimal reader for the plan request: one object whose values are integers,
// booleans or an array of such flat objects ("cylinders").
using Flat = std::map<std::string, long>;

class Reader {
public:
	explicit Reader(const std::string &s) : s(s) {}

	bool request(Flat &values, std::vector<Flat> &cylinders, std::vector<Flat> &levels)
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
			if (key == "cylinders" || key == "levels") {
				std::vector<Flat> &list = key == "levels" ? levels : cylinders;
				if (!eat('['))
					return false;
				space();
				if (!eat(']')) {
					for (;;) {
						Flat c;
						if (!flat(c))
							return false;
						list.push_back(std::move(c));
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
	add_bool(json, "dropStone", prefs.drop_stone_mode);
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
	prefs.drop_stone_mode = get(v, "dropStone", prefs.drop_stone_mode);
	prefs.reserve_gas = get(v, "reserveMbar", prefs.reserve_gas);
	prefs.problemsolvingtime = get(v, "problemSolvingMinutes", prefs.problemsolvingtime);
	prefs.sacfactor = get(v, "sacFactor", prefs.sacfactor);
	// The plan's own model, also for the ceiling computed for it.
	if (v.count("decoModel"))
		prefs.planner_deco_mode = prefs.display_deco_mode = get(v, "decoModel", 0) == 1 ? VPMB : BUEHLMANN;
	prefs.gflow = get(v, "gfLow", prefs.gflow);
	prefs.gfhigh = get(v, "gfHigh", prefs.gfhigh);
	prefs.vpmb_conservatism = get(v, "vpmbConservatism", prefs.vpmb_conservatism);
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

// A gas without a cylinder: the core computes the minimum gas as a pressure in
// a cylinder, so it gets a very large one, nearly ideal at the pressures
// reached, and the result is turned back into a volume. Never saved.
constexpr int nominal_size_ml = 400000;
constexpr int nominal_mbar = 232000;

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

	json += ']';

	// Decompression ceiling of the plan, computed as the detail's "Plafond"
	// layer (profile.cpp, with the gradient factors the plan used, in prefs):
	// [time s, mm] per profile entry; empty when the plan never has one.
	{
		struct plot_info pi = create_plot_info_new(&d, &dc, nullptr);
		bool any = false;
		for (const auto &e: pi.entry)
			any = any || e.ceiling.mm > 0;
		json += ",\"ceiling\":[";
		bool first_entry = true;
		for (const auto &e: pi.entry) {
			if (!any)
				break;
			if (!first_entry)
				json += ',';
			first_entry = false;
			json += '[' + std::to_string(e.sec) + ',' + std::to_string(e.ceiling.mm) + ']';
		}
		json += ']';
	}

	// Waypoints of the plan, as plan() leaves them (absolute times).
	json += ",\"segments\":[";
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
		// The reserve of this gas: the minimum gas for the last bottom gas, the
		// gas of the ascent for the others (shared with a buddy).
		{
			long reserve = cyl.deco_gas_used.mliter;
			if (mindp && static_cast<int>(i) == mindp->cylinderid && cyl.type.size.mliter) {
				double bar = mindp->minimum_gas.mbar / 1000.0;
				reserve = lrint(bar * cyl.type.size.mliter / gas_compressibility_factor(cyl.gasmix, bar));
			}
			add(json, "reserveMl", reserve);
		}
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

namespace {

constexpr int max_levels = 20;

// A request read and checked; `source` the logged dive it starts from.
struct PlanRun {
	Flat v;
	std::vector<Flat> cylinders, levels;
	struct dive *source = nullptr;
};

bool parse(const std::string &request, PlanRun &run, std::string &error)
{
	if (!Reader(request).request(run.v, run.cylinders, run.levels)) {
		error = "BAD_REQUEST: not a plan request";
		return false;
	}
	const Flat &v = run.v;
	long depth = get(v, "depthMm", 0), bottom_time = get(v, "bottomTimeSeconds", 0);
	long source_id = get(v, "sourceDiveId", 0);
	if (source_id) {
		run.source = divelog.dives.get_by_uniq_id(static_cast<int>(source_id));
		if (!run.source) {
			error = "NOT_FOUND: the dive to start from";
			return false;
		}
	}
	long total = 0;
	for (const Flat &l: run.levels) {
		long mm = get(l, "depthMm", 0), seconds = get(l, "durationSeconds", 0);
		if (mm <= 0 || mm > 300000 || seconds <= 0) {
			error = "BAD_REQUEST: invalid level";
			return false;
		}
		total += seconds;
	}
	bool have_profile = run.source || (!run.levels.empty() && run.levels.size() <= max_levels && total <= 6 * 3600) ||
			    (run.levels.empty() && depth > 0 && depth <= 300000 && bottom_time > 0 && bottom_time <= 6 * 3600);
	if (!have_profile || run.cylinders.empty() || run.cylinders.size() > 20) {
		error = "BAD_REQUEST: depth, bottom time and at least one cylinder are needed";
		return false;
	}
	for (const Flat &c: run.cylinders) {
		long o2 = get(c, "o2Permille", 0), he = get(c, "hePermille", 0);
		if (o2 <= 0 || o2 > 1000 || he < 0 || o2 + he > 1000 || get(c, "sizeMl", 0) < 0 || get(c, "startMbar", 0) < 0) {
			error = "BAD_REQUEST: invalid cylinder";
			return false;
		}
	}
	// utc_mktime() (core/time.cpp) only reads dates up to 2029: a later one would
	// come back from the log as 0.
	if (get(v, "when", 0) < 0 || get(v, "when", 0) >= 1893456000) {
		error = "BAD_REQUEST: date";
		return false;
	}
	long gf_low = get(v, "gfLow", 30), gf_high = get(v, "gfHigh", 75), conservatism = get(v, "vpmbConservatism", 0);
	if (gf_low < 10 || gf_low > 150 || gf_high < 40 || gf_high > 150 || conservatism < 0 || conservatism > 4) {
		error = "BAD_REQUEST: invalid decompression settings";
		return false;
	}
	return true;
}

// The time the plan runs in: the preferences are the plan's, the other plans
// and the dive it starts from are out of the tissue loading.
class PlanScope {
public:
	explicit PlanScope(const struct dive *source) : saved(prefs), hidden(source) {}
	~PlanScope()
	{
		prefs = saved;
		set_gf(prefs.gflow, prefs.gfhigh);
		set_vpmb_conservatism(prefs.vpmb_conservatism);
	}

private:
	struct preferences saved;
	internal::HiddenPlans hidden;
};

// DivePlannerPointsModel::loadFromDive(): at most 100 averaged waypoints of
// the logged dive, each on the gas breathed then. `gas_of` turns a cylinder
// of that dive into one of the plan.
void add_source_waypoints(diveplan &dp, struct dive *source, const std::map<int, int> &gas_of)
{
	struct divecomputer dc = source->dcs[0];
	bool marked = false;
	if (!dc.samples.empty())
		marked = dc.samples[0].manually_entered;
	else
		fake_dc(&dc);
	auto gas = [&](duration_t t) {
		auto it = gas_of.find(get_cylinderid_at_time(source, &dc, t));
		return it == gas_of.end() ? 0 : it->second;
	};
	int plansamples = std::min(static_cast<int>(dc.samples.size()), 100);
	int j = 0, previous = 0, samplecount = 0, cylinder = 0;
	depth_t depthsum;
	duration_t lasttime, lastrecorded, newtime;
	for (int i = 0; i < plansamples - 1; i++) {
		if (dc.last_manual_time.seconds && dc.last_manual_time.seconds > 120 && lasttime.seconds >= dc.last_manual_time.seconds)
			break;
		while (j * plansamples <= i * static_cast<int>(dc.samples.size())) {
			const sample &s = dc.samples[j];
			if (s.time.seconds != 0 && (!marked || s.manually_entered)) {
				depthsum += s.depth;
				++samplecount;
				newtime = s.time;
			}
			j++;
		}
		if (!samplecount)
			continue;
		cylinder = gas(lasttime);
		duration_t nexttime = newtime;
		++nexttime.seconds;
		if (newtime.seconds - lastrecorded.seconds > 10 || cylinder == gas(nexttime)) {
			if (newtime.seconds == lastrecorded.seconds)
				newtime.seconds += 10;
			if (newtime.seconds > previous) {
				plan_add_segment(dp, newtime.seconds - previous, depthsum / samplecount, cylinder, 0, true, OC);
				previous = newtime.seconds;
			}
			lastrecorded = newtime;
		}
		lasttime = newtime;
		depthsum = 0_m;
		samplecount = 0;
	}
	// The last point, so that the duration is right.
	if (!marked && !dc.last_manual_time.seconds && dc.duration.seconds > previous)
		plan_add_segment(dp, dc.duration.seconds - previous, 0_m, cylinder, 0, true, OC);
}

// The waypoints of the levels: each level's time is at depth, the transit to
// it is added at the descent or ascent rate. All on the bottom gas.
void add_levels(diveplan &dp, const std::vector<Flat> &levels)
{
	long previous = 0;
	for (const Flat &level: levels) {
		long mm = get(level, "depthMm", 0);
		depth_t depth { .mm = static_cast<int32_t>(mm) };
		if (mm != previous) {
			int transit = mm > previous ? (prefs.drop_stone_mode ? 1 : static_cast<int>((mm - previous) / prefs.descrate))
						    : static_cast<int>((previous - mm) / prefs.ascrate50);
			dp_add(dp, std::max(transit, 1), depth);
		}
		dp_add(dp, static_cast<int>(get(level, "durationSeconds", 0)), depth);
		previous = mm;
	}
}

// Sets up and runs plan(), inside a PlanScope.
planner_error_t run_plan(const PlanRun &run, struct dive &d, diveplan &dp, bool saving)
{
	const Flat &v = run.v;
	const std::vector<Flat> &cylinders = run.cylinders;
	// Planner-only settings for this plan only.
	apply_settings(v);

	d.when = get(v, "when", 0) > 0 ? get(v, "when", 0) : run.source ? run.source->when : start_time();
	make_planner_dc(&d.dcs[0]);
	d.dcs[0].divemode = OC;
	// Create every cylinder first: pointers are not stable while the table grows.
	d.get_or_create_cylinder(static_cast<int>(cylinders.size()) - 1);
	std::map<int, int> gas_of;
	for (size_t i = 0; i < cylinders.size(); i++) {
		cylinder_t &cyl = d.cylinders[i];
		long size = get(cylinders[i], "sizeMl", 0), start = get(cylinders[i], "startMbar", 0);
		bool nominal = !saving && !size && !start;
		cyl.gasmix.o2.permille = get(cylinders[i], "o2Permille", 209);
		cyl.gasmix.he.permille = get(cylinders[i], "hePermille", 0);
		cyl.type.size.mliter = nominal ? nominal_size_ml : size;
		cyl.type.workingpressure.mbar = nominal ? nominal_mbar : start;
		cyl.cylinder_use = OC_GAS;
		cyl.manually_added = true;
		// 0: the MOD at the ppO2 for deco, set by reset_cylinders() below.
		cyl.depth.mm = static_cast<int32_t>(std::max(0L, get(cylinders[i], "switchDepthMm", 0)));
		long source_cylinder = get(cylinders[i], "sourceCylinder", -1);
		if (source_cylinder >= 0)
			gas_of[static_cast<int>(source_cylinder)] = static_cast<int>(i);
	}

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
	if (run.source) {
		add_source_waypoints(dp, run.source, gas_of);
	} else if (!run.levels.empty()) {
		add_levels(dp, run.levels);
	} else {
		depth_t bottom { .mm = static_cast<int32_t>(get(v, "depthMm", 0)) };
		long bottom_time = get(v, "bottomTimeSeconds", 0);
		// The descent at the descent rate, counted in the bottom time (Subsurface's
		// runtime of the last entered waypoint); with the instant descent setting
		// (drop_stone_mode), the whole bottom time is spent at depth: one second,
		// as a segment of no duration would make the next one the descent.
		int descent = prefs.drop_stone_mode ? 1 : bottom.mm / prefs.descrate;
		dp_add(dp, descent, bottom);
		if (bottom_time > descent)
			dp_add(dp, static_cast<int>(bottom_time) - descent, bottom);
	}

	deco_state_cache cache;
	struct deco_state ds;
	return plan(&ds, dp, &d, 0, 60, cache, true, saving, nullptr);
}

} // namespace

int plan_dive(const std::string &request, std::string &json, std::string &error)
{
	PlanRun run;
	if (!parse(request, run, error))
		return -1;
	PlanScope scope(run.source);
	struct dive d;
	diveplan dp;
	planner_error_t result = run_plan(run, d, dp, false);
	json = result_json(dp, d, result);
	return 0;
}

namespace internal {

int build_plan(const std::string &request, struct dive &d, struct dive_site *&site, std::string &error)
{
	PlanRun run;
	if (!parse(request, run, error))
		return -1;
	site = run.source ? run.source->dive_site : nullptr;
	{
		PlanScope scope(run.source);
		diveplan dp;
		if (run_plan(run, d, dp, true) != PLAN_OK) {
			error = "INVALID_PLAN";
			return -1;
		}
	}
	// The request, to reopen the plan as it was typed. Single quotes: Subsurface
	// writes the value as it is, and the request holds no other quoted text.
	std::string kept = request;
	std::replace(kept.begin(), kept.end(), '"', '\'');
	add_extra_data(&d.dcs[0], "OpenDives plan", kept);
	return 0;
}

} // namespace internal

} // namespace opendives
