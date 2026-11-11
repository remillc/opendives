// SPDX-License-Identifier: GPL-2.0
// Dive planner of the façade (core/libopendives/plan.cpp), compared with the
// known values of Subsurface's own tests (third_party/subsurface/tests/
// testplan.cpp, its 17 TestPlan::test* functions: see reference_cases() for
// those the façade can express and not_expressible() for the others), then
// the plan of the planner mock-ups and the façade's own behaviour.
// usage: plan
//
// OD_MUTATE=<name> sends a wrong input (a mutation) with every request while
// the expected values stay the same: the run must then fail. It is how
// tests/release-check.sh proves that these tests detect errors. Names: sac
// (SAC +10 %), gf (gradient factor high altered), vpmb (conservatism +1),
// ascent (ascent rate altered), water (fresh instead of sea water), altitude
// (surface pressure of about 500 m).
#include "../core/libopendives/opendives.h"

#include "core/divelog.h"
#include "core/pref.h"
#include "core/units.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <utility>
#include <vector>

static int failed = 0;

static void check(bool ok, const char *what)
{
	printf("%s %s\n", ok ? "ok  " : "FAIL", what);
	failed += !ok;
}

// Integer value of "key" in `json`, after position `from`; -999999 if absent.
static long num(const std::string &json, const std::string &key, size_t from = 0)
{
	size_t at = json.find("\"" + key + "\":", from);
	if (at == std::string::npos)
		return -999999;
	return strtol(json.c_str() + at + key.size() + 3, nullptr, 10);
}

// Position of the n-th object of the array "key".
static size_t item(const std::string &json, const std::string &key, int n)
{
	size_t at = json.find("\"" + key + "\":[");
	for (int i = 0; at != std::string::npos && i <= n; i++)
		at = json.find('{', at + 1);
	return at;
}

// The mutation asked for by OD_MUTATE, as keys added at the end of the request
// (the last value of a key wins in the façade's reader).
static std::string mutated(std::string request)
{
	const char *m = getenv("OD_MUTATE");
	std::string extra;
	if (!m || !*m)
		return request;
	std::string name = m;
	if (name == "sac")
		extra = "\"bottomSacMlMin\":22000,\"decoSacMlMin\":18700";
	else if (name == "gf")
		extra = "\"gfHigh\":95";
	else if (name == "vpmb")
		extra = "\"vpmbConservatism\":1";
	else if (name == "ascent")
		extra = "\"ascent75MmMin\":12000,\"ascent50MmMin\":12000,\"ascentStopsMmMin\":12000";
	else if (name == "water")
		extra = "\"salinity\":10000";
	else if (name == "altitude")
		extra = "\"surfacePressureMbar\":950";
	else {
		printf("unknown mutation %s\n", m);
		exit(2);
	}
	if (!request.empty() && request.back() == '}') {
		request.pop_back();
		request += "," + extra + "}";
	}
	return request;
}

static std::string run(const std::string &request)
{
	std::string json, error;
	if (opendives::plan_dive(mutated(request), json, error)) {
		printf("plan_dive: %s\n", error.c_str());
		return "";
	}
	return json;
}

// testplan.cpp's compareDecoTime(): equal, or within 1 % + 60 s.
static bool close_runtime(long actual, long benchmark)
{
	return std::labs(actual - benchmark) <= lrint(0.01 * benchmark + 60);
}

static void bar(const std::string &json, const char *what, long expected_bar)
{
	long mbar = num(json, "pressureMbar", json.find("\"minimumGas\""));
	printf("     minimum gas %ld mbar\n", mbar);
	check(lrint(mbar / 1000.0) == expected_bar, what);
}

// ---------------------------------------------------------------------------
// Subsurface's own plan tests (third_party/subsurface/tests/testplan.cpp, the
// 17 TestPlan::test* functions), through the façade's plan_dive().
//
// Two kinds of expected values, as in testplan.cpp:
//  - the "known Subsurface runtime": what Subsurface computes today. It is
//    required EXACTLY (testplan.cpp only logs a mismatch; here it fails);
//  - the "benchmark runtime" of another planner: only within 1 % + 60 s
//    (testplan.cpp's compareDecoTime()), and only for those values.
// The minimum gas and the gas changes are required as testplan.cpp does.
//
// Cases the façade cannot express are listed by not_expressible() below.
// Changing an expected value here needs a commit that explains why.
// ---------------------------------------------------------------------------

static std::string cyl(int o2, int he, long size = 0, long start = 0)
{
	std::string s = "{\"o2Permille\":" + std::to_string(o2) + ",\"hePermille\":" + std::to_string(he);
	if (size)
		s += ",\"sizeMl\":" + std::to_string(size) + ",\"startMbar\":" + std::to_string(start);
	return s + '}';
}

struct Ref {
	const char *name;
	std::string profile;   // "depthMm":..,"bottomTimeSeconds":.. or "levels":[..]
	std::string settings;  // rates, last stop, model, ...
	std::string cylinders; // JSON array content
	long min_bar;          // minimum gas of the bottom cylinder, -1: not checked
	long known_s;          // known Subsurface runtime, exact; -1: none
	long benchmark_s;      // benchmark runtime, 1 % + 60 s; -1: none
	std::vector<std::pair<long, int>> switches; // gas changes: depth (mm), cylinder
};

// Runs one case and checks it; returns its runtime.
static long run_ref(const Ref &r)
{
	std::string name = r.name;
	std::string json = run("{" + r.profile + "," + r.settings + ",\"when\":1000000000,\"cylinders\":[" + r.cylinders + "]}");
	long runtime = num(json, "runtimeSeconds");
	printf("     %s: runtime %ld s (%ld:%02ld)\n", r.name, runtime, runtime / 60, runtime % 60);
	check(json.find("\"error\":\"\"") != std::string::npos, (name + ": no planner error").c_str());
	if (r.min_bar >= 0)
		bar(json, (name + ": minimum gas " + std::to_string(r.min_bar) + " bar").c_str(), r.min_bar);
	for (const auto &sw: r.switches) {
		bool at = num(json, "switchDepthMm", item(json, "cylinders", sw.second)) == sw.first;
		bool stop = false;
		size_t end = json.find("\"cylinders\"");
		for (int i = 0; item(json, "stops", i) != std::string::npos && item(json, "stops", i) < end; i++) {
			size_t s = item(json, "stops", i);
			if (json.compare(json.find("\"gasChange\":", s) + 12, 4, "true") == 0)
				stop |= num(json, "depthMm", s) == sw.first && num(json, "cylinder", s) == sw.second;
		}
		check(at && stop, (name + ": cylinder " + std::to_string(sw.second) + " at " + std::to_string(sw.first) + " mm").c_str());
	}
	if (r.known_s >= 0)
		check(runtime == r.known_s, (name + ": known Subsurface runtime " + std::to_string(r.known_s) + " s, exactly").c_str());
	if (r.benchmark_s >= 0)
		check(close_runtime(runtime, r.benchmark_s), (name + ": benchmark runtime " + std::to_string(r.benchmark_s) + " s, 1 % + 60 s").c_str());
	return runtime;
}

// What the façade cannot express, with the reason (printed by every run).
static void not_expressible()
{
	printf("     NOT COVERED testMultipleGases: a gas change during the entered part of the dive (the façade's levels are all on the bottom gas)\n");
	printf("     NOT COVERED testCcrBailoutGasSelection: closed circuit (the façade plans open circuit only)\n");
	printf("     NOT COVERED testZeroDurationO2SwitchSampleOrder, testZeroDurationO2SwitchPressureAttribution: passive semi-closed circuit (open circuit only)\n");
}

static void reference_cases()
{
	// Rates of testplan.cpp's setupPrefs(): 30 ft/min, last 6 m 10 ft/min, last stop 6 m.
	const std::string ft_rates = "\"ascent75MmMin\":9144,\"ascent50MmMin\":9144,\"ascentStopsMmMin\":9144,\"ascentLast6mMmMin\":3048,\"lastStop6m\":true";
	// setupPrefsVpmb(): 10 m/min everywhere, no 6 m last stop; the descent depends on the case.
	auto vpmb = [](int descent) {
		return "\"decoModel\":1,\"vpmbConservatism\":0,\"gfLow\":100,\"gfHigh\":100,\"descentMmMin\":" + std::to_string(descent) +
		       ",\"ascent75MmMin\":10000,\"ascent50MmMin\":10000,\"ascentStopsMmMin\":10000,\"ascentLast6mMmMin\":10000,\"lastStop6m\":false";
	};
	auto profile = [](long depth_mm, long seconds) { return "\"depthMm\":" + std::to_string(depth_mm) + ",\"bottomTimeSeconds\":" + std::to_string(seconds); };

	prefs = default_prefs;
	prefs.unit_system = METRIC;
	prefs.units.length = units::METERS;

	// 1. testMetric: Bühlmann GF 100/100, 79 m for 30 min, 15/45 (36 L, 232 bar), EAN36, oxygen.
	run_ref({ "testMetric", profile(79000, 1800), "\"decoModel\":0,\"gfLow\":100,\"gfHigh\":100,\"descentMmMin\":23000," + ft_rates,
		  cyl(150, 450, 36000, 232000) + "," + cyl(360, 0) + "," + cyl(1000, 0), 148, 109 * 60, 109 * 60, { { 33000, 1 }, { 6000, 2 } } });

	// 2. testImperial: the same in feet; 260 ft, 75 ft/min descent, switch depths rounded to 10 ft.
	prefs.unit_system = IMPERIAL;
	prefs.units.length = units::FEET;
	run_ref({ "testImperial", profile(79248, 1800), "\"decoModel\":0,\"gfLow\":100,\"gfHigh\":100,\"descentMmMin\":22860," + ft_rates,
		  cyl(150, 450, 36000, 232000) + "," + cyl(360, 0) + "," + cyl(1000, 0), 155, 111 * 60 - 2, 111 * 60 - 2, { { 33528, 1 }, { 6096, 2 } } });
	prefs.unit_system = METRIC;
	prefs.units.length = units::METERS;

	// 3. testVpmbMetric45m30minTx
	run_ref({ "testVpmbMetric45m30minTx", profile(45000, 1800), vpmb(23000), cyl(210, 350, 24000, 232000) + "," + cyl(500, 0) + "," + cyl(1000, 0), 108, -1, -1, {} });
	// 4. testVpmbMetric60m10minTx
	run_ref({ "testVpmbMetric60m10minTx", profile(60000, 600), vpmb(23000), cyl(180, 450, 24000, 232000) + "," + cyl(500, 150) + "," + cyl(1000, 0), 162, -1, -1, {} });
	// 5. testVpmbMetric60m30minAir
	run_ref({ "testVpmbMetric60m30minAir", profile(60000, 1800), vpmb(99000), cyl(210, 0, 100000, 232000), 180, 139 * 60 + 20, 141 * 60 + 20, {} });
	// 6. testVpmbMetric60m30minEan50
	run_ref({ "testVpmbMetric60m30minEan50", profile(60000, 1800), vpmb(99000), cyl(210, 0, 36000, 232000) + "," + cyl(500, 0), 155, 96 * 60 + 20, 95 * 60 + 20, { { 21000, 1 } } });
	// 7. testVpmbMetric60m30minTx
	run_ref({ "testVpmbMetric60m30minTx", profile(60000, 1800), vpmb(99000), cyl(180, 450, 36000, 232000) + "," + cyl(500, 0), 159, 89 * 60 + 20, 89 * 60 + 20, { { 21000, 1 } } });
	// 8. testVpmbMetric100m60min
	run_ref({ "testVpmbMetric100m60min", profile(100000, 3600), vpmb(99000), cyl(180, 450, 200000, 232000) + "," + cyl(500, 0) + "," + cyl(1000, 0), 157,
		  315 * 60 + 20, 311 * 60 + 20, { { 21000, 1 }, { 6000, 2 } } });
	// 9. testMultipleGases: not expressible (see not_expressible()).
	// 10. testVpmbMetricMultiLevelAir: 20 m for 10 min, then a 1 min ramp to 60 m, 29 min at 60 m.
	// The façade's levels hold a time at depth and add the transit at the descent rate: 60 m is
	// reached in 24 s, not 60 s, so this is not exactly testplan.cpp's profile. The runtime is
	// nevertheless the known Subsurface one (169 min 20 s), required exactly: a regression guard
	// for the façade's own profile; the benchmark (167 min 20 s) keeps its tolerance.
	run_ref({ "testVpmbMetricMultiLevelAir (24 s transit instead of a 60 s ramp)",
		  "\"levels\":[{\"depthMm\":20000,\"durationSeconds\":588},{\"depthMm\":60000,\"durationSeconds\":1776}]", vpmb(99000),
		  cyl(210, 0, 200000, 232000), 101, 169 * 60 + 20, 167 * 60 + 20, {} });
	// 11. testVpmbMetric100m10min
	run_ref({ "testVpmbMetric100m10min", profile(100000, 600), vpmb(99000), cyl(180, 450, 60000, 232000) + "," + cyl(500, 0) + "," + cyl(1000, 0), 175,
		  57 * 60 + 20, 58 * 60 + 20, { { 21000, 1 }, { 6000, 2 } } });
	// 12. testVpmbMetricRepeat: 30 m 20 min; 100 m then 70 m (30 min in all) with four gases; the first again.
	Ref first = { "testVpmbMetricRepeat 1", profile(30000, 1200), vpmb(18000), cyl(210, 0, 36000, 232000), 61, 27 * 60 + 20, 27 * 60 + 20, {} };
	long first_runtime = run_ref(first);
	run_ref({ "testVpmbMetricRepeat 2", "\"levels\":[{\"depthMm\":100000,\"durationSeconds\":867},{\"depthMm\":70000,\"durationSeconds\":420}]", vpmb(18000),
		  cyl(120, 650, 36000, 232000) + "," + cyl(210, 350) + "," + cyl(500, 0) + "," + cyl(1000, 0), 85, 127 * 60 + 20, 127 * 60 + 20,
		  { { 63000, 1 }, { 21000, 2 }, { 6000, 3 } } });
	first.name = "testVpmbMetricRepeat 3";
	check(run_ref(first) == first_runtime, "testVpmbMetricRepeat 3: runtime exactly the same as the first time");
	// 13. testCcrBailoutGasSelection: not expressible.
	// 14 and 17. testRecreationalWithinNDL / ExceedingNDL. The façade does not choose the
	// recreational mode (the app does not offer it): it is set in the core's preferences.
	prefs.planner_deco_mode = RECREATIONAL;
	prefs.reserve_gas = 40000;
	std::string rec_gas = "\"cylinders\":[" + cyl(210, 0, 24000, 232000) + "]";
	std::string within = run("{" + profile(20000, 1200) + ",\"descentMmMin\":23000,\"gfLow\":100,\"gfHigh\":100,\"when\":1000000000," + rec_gas + "}");
	check(within.find("\"error\":\"\"") != std::string::npos && num(within, "runtimeSeconds") > 0, "testRecreationalWithinNDL: plan ok");
	std::string beyond = run("{" + profile(50000, 3000) + ",\"descentMmMin\":23000,\"gfLow\":100,\"gfHigh\":100,\"when\":1000000000," + rec_gas + "}");
	check(beyond.find("\"error\":\"RECREATIONAL_EXCEEDS_NDL\"") != std::string::npos, "testRecreationalExceedingNDL: planner error RECREATIONAL_EXCEEDS_NDL");
	prefs = default_prefs;
	prefs.unit_system = METRIC;
	prefs.units.length = units::METERS;
	// 15, 16. PSCR tests: not expressible.
	not_expressible();
}

int main()
{
	opendives::init();
	reference_cases();

	// A request with its own model and settings leaves the preferences as they were.
	prefs = default_prefs;
	prefs.planner_deco_mode = VPMB;
	run("{\"depthMm\":30000,\"bottomTimeSeconds\":1200,\"decoModel\":0,\"ascent50MmMin\":12000,\"lastStop6m\":true,\"when\":1000000000,"
	    "\"cylinders\":[{\"o2Permille\":209,\"hePermille\":0,\"sizeMl\":12000,\"startMbar\":200000}]}");

	// Read only: nothing in the logbook, preferences as they were.
	check(divelog.dives.empty(), "no dive added to the logbook");
	check(prefs.planner_deco_mode == VPMB && prefs.ascrate50 == default_prefs.ascrate50 &&
		      prefs.last_stop == default_prefs.last_stop && prefs.descrate == default_prefs.descrate,
	      "preferences restored");

	// The planner mock-ups: 28 m for 30 min on EAN33 (12 L, 195 bar), SAC
	// 10.3 L/min, Bühlmann GF 30/70, Subsurface's other defaults.
	prefs = default_prefs;
	prefs.gflow = 30;
	prefs.gfhigh = 70;
	std::string mock = run("{\"depthMm\":28000,\"bottomTimeSeconds\":1800,\"bottomSacMlMin\":10300,\"decoSacMlMin\":10300,"
			       "\"when\":1000000000,\"cylinders\":[{\"o2Permille\":330,\"hePermille\":0,\"sizeMl\":12000,\"startMbar\":195000}]}");
	printf("     %s\n", mock.substr(0, mock.find("\"points\"")).c_str());
	size_t cyl = item(mock, "cylinders", 0);
	printf("     runtime %ld s, end %ld mbar, minimum gas %ld mbar, delta %ld mbar, CNS %ld, OTU %ld\n",
	       num(mock, "runtimeSeconds"), num(mock, "endMbar", cyl), num(mock, "pressureMbar", mock.find("\"minimumGas\"")),
	       num(mock, "deltaMbar"), num(mock, "cns"), num(mock, "otu"));
	check(num(mock, "runtimeSeconds") / 60 == 38, "mock-up: total 38 min");
	check(num(mock, "depthMm", item(mock, "stops", 0)) == 6000 && num(mock, "depthMm", item(mock, "stops", 1)) == 3000,
	      "mock-up: stops at 6 and 3 m");
	check(num(mock, "cns") == 16 && num(mock, "otu") == 44, "mock-up: CNS 16 %, 44 OTU");

	// A deco gas with its switch depth chosen (EAN50 at 9 m instead of its MOD,
	// 21 m at ppO2 1.6): the switch happens at 9 m.
	std::string deco = run("{\"depthMm\":40000,\"bottomTimeSeconds\":1500,\"when\":1000000000,"
			       "\"cylinders\":[{\"o2Permille\":210,\"hePermille\":0,\"sizeMl\":24000,\"startMbar\":200000},"
			       "{\"o2Permille\":500,\"hePermille\":0,\"sizeMl\":7000,\"startMbar\":200000,\"switchDepthMm\":9000}]}");
	std::string mod = run("{\"depthMm\":40000,\"bottomTimeSeconds\":1500,\"when\":1000000000,"
			      "\"cylinders\":[{\"o2Permille\":210,\"hePermille\":0,\"sizeMl\":24000,\"startMbar\":200000},"
			      "{\"o2Permille\":500,\"hePermille\":0,\"sizeMl\":7000,\"startMbar\":200000}]}");
	check(num(mod, "switchDepthMm", item(mod, "cylinders", 1)) == 21000, "deco gas: EAN50 switch at its MOD, 21 m");
	check(num(deco, "switchDepthMm", item(deco, "cylinders", 1)) == 9000, "deco gas: chosen switch depth kept");
	bool at9 = false;
	for (int i = 0; item(deco, "stops", i) != std::string::npos && item(deco, "stops", i) < deco.find("\"cylinders\""); i++) {
		size_t at = item(deco, "stops", i);
		if (deco.compare(deco.find("\"gasChange\":", at) + 12, 4, "true") == 0)
			at9 |= num(deco, "depthMm", at) == 9000 && num(deco, "cylinder", at) == 1;
	}
	check(at9, "deco gas: switch to EAN50 on the 9 m stop");
	check(num(deco, "gasUsedMl", item(deco, "cylinders", 1)) > 0, "deco gas: its gas use");

	// Water type: fresh water (salinity 10000) is lighter than the default sea
	// water (10300), so the same 30 m for 20 min on air breathes less gas.
	std::string water_cyl = "\"cylinders\":[{\"o2Permille\":209,\"hePermille\":0,\"sizeMl\":12000,\"startMbar\":200000}]}";
	std::string sea = run("{\"depthMm\":30000,\"bottomTimeSeconds\":1200,\"when\":1000000000," + water_cyl);
	std::string sea_explicit = run("{\"depthMm\":30000,\"bottomTimeSeconds\":1200,\"salinity\":10300,\"when\":1000000000," + water_cyl);
	std::string fresh = run("{\"depthMm\":30000,\"bottomTimeSeconds\":1200,\"salinity\":10000,\"when\":1000000000," + water_cyl);
	long sea_gas = num(sea, "gasUsedMl", item(sea, "cylinders", 0));
	long fresh_gas = num(fresh, "gasUsedMl", item(fresh, "cylinders", 0));
	printf("     gas used: sea %ld ml, fresh %ld ml\n", sea_gas, fresh_gas);
	check(sea_gas > 0 && sea_gas == num(sea_explicit, "gasUsedMl", item(sea_explicit, "cylinders", 0)), "water: sea water is the default");
	check(fresh_gas > 0 && fresh_gas < sea_gas, "water: fresh water uses less gas than sea water");

	// Levels: the time of a level is at depth, the descent is added. One level
	// of 10 min at 30 m is the square profile of 100 s of descent + 10 min.
	prefs = default_prefs;
	prefs.gflow = 30;
	prefs.gfhigh = 75;
	std::string gases = "\"cylinders\":[{\"o2Permille\":209,\"hePermille\":0,\"sizeMl\":12000,\"startMbar\":200000}]}";
	std::string square = run("{\"depthMm\":30000,\"bottomTimeSeconds\":700,\"descentMmMin\":18000,\"when\":1000000000," + gases);
	std::string level = run("{\"levels\":[{\"depthMm\":30000,\"durationSeconds\":600}],\"descentMmMin\":18000,\"when\":1000000000," + gases);
	check(num(square, "runtimeSeconds") == num(level, "runtimeSeconds") && num(square, "cns") == num(level, "cns"), "levels: one level is the square profile");

	// Two levels: deeper first, then shallower; the plan is longer than the first level alone.
	std::string first_only = run("{\"levels\":[{\"depthMm\":30000,\"durationSeconds\":900}],\"when\":1000000000," + gases);
	std::string two = run("{\"levels\":[{\"depthMm\":30000,\"durationSeconds\":900},{\"depthMm\":18000,\"durationSeconds\":1200}],\"when\":1000000000," + gases);
	printf("     two levels: runtime %ld s, one level %ld s\n", num(two, "runtimeSeconds"), num(first_only, "runtimeSeconds"));
	check(num(two, "maxDepthMm") >= 30000 && num(two, "runtimeSeconds") > num(first_only, "runtimeSeconds") + 1200, "levels: the second level is held");
	bool at18 = false;
	for (int i = 0; item(two, "segments", i) != std::string::npos && item(two, "segments", i) < two.find("\"stops\""); i++)
		at18 |= num(two, "depthMm", item(two, "segments", i)) == 18000;
	check(at18, "levels: a waypoint at 18 m");
	std::string bad_level, level_error;
	check(opendives::plan_dive("{\"levels\":[{\"depthMm\":0,\"durationSeconds\":60}]," + gases, bad_level, level_error) == -1, "levels: an empty level is refused");

	// The plan's own gradient factors: for this plan only.
	std::string conservative = run("{\"levels\":[{\"depthMm\":40000,\"durationSeconds\":1500}],\"gfLow\":20,\"gfHigh\":60,\"when\":1000000000," + gases);
	std::string liberal = run("{\"levels\":[{\"depthMm\":40000,\"durationSeconds\":1500}],\"gfLow\":90,\"gfHigh\":95,\"when\":1000000000," + gases);
	printf("     GF 20/60 %ld s, GF 90/95 %ld s\n", num(conservative, "runtimeSeconds"), num(liberal, "runtimeSeconds"));
	check(num(conservative, "runtimeSeconds") > num(liberal, "runtimeSeconds"), "own GF: lower factors, longer plan");
	check(prefs.gflow == 30 && prefs.gfhigh == 75 && prefs.planner_deco_mode == default_prefs.planner_deco_mode, "own GF: preferences put back");
	std::string vpmb = run("{\"levels\":[{\"depthMm\":40000,\"durationSeconds\":1500}],\"decoModel\":1,\"vpmbConservatism\":2,\"when\":1000000000," + gases);
	check(vpmb.find("\"model\":\"vpmb\"") != std::string::npos && prefs.planner_deco_mode != VPMB, "own model: VPM-B for this plan only");

	// Without a cylinder: the reserve as a volume, as with a real cylinder.
	std::string real = run("{\"levels\":[{\"depthMm\":30000,\"durationSeconds\":1500}],\"when\":1000000000,"
			       "\"cylinders\":[{\"o2Permille\":209,\"hePermille\":0,\"sizeMl\":24000,\"startMbar\":232000}]}");
	std::string volumes = run("{\"levels\":[{\"depthMm\":30000,\"durationSeconds\":1500}],\"when\":1000000000,"
				  "\"cylinders\":[{\"o2Permille\":209,\"hePermille\":0}]}");
	long real_reserve = num(real, "reserveMl", item(real, "cylinders", 0)), reserve = num(volumes, "reserveMl", item(volumes, "cylinders", 0));
	printf("     reserve: %ld ml with a cylinder, %ld ml without\n", real_reserve, reserve);
	check(reserve > 0 && std::labs(reserve - real_reserve) * 100 <= real_reserve, "volumes: reserve within 1 % of a real cylinder");
	check(num(volumes, "gasUsedMl", item(volumes, "cylinders", 0)) == num(real, "gasUsedMl", item(real, "cylinders", 0)), "volumes: same gas used");

	// Two SACs: the deco SAC is used for the ascent and the stops only. The
	// same plan with a higher deco SAC keeps its runtime and breathes more gas;
	// a higher bottom SAC also breathes more, at the bottom.
	std::string sac_base = run("{\"levels\":[{\"depthMm\":40000,\"durationSeconds\":1500}],\"bottomSacMlMin\":20000,\"decoSacMlMin\":15000,\"when\":1000000000," + gases);
	std::string sac_deco = run("{\"levels\":[{\"depthMm\":40000,\"durationSeconds\":1500}],\"bottomSacMlMin\":20000,\"decoSacMlMin\":30000,\"when\":1000000000," + gases);
	std::string sac_bottom = run("{\"levels\":[{\"depthMm\":40000,\"durationSeconds\":1500}],\"bottomSacMlMin\":30000,\"decoSacMlMin\":15000,\"when\":1000000000," + gases);
	long base_gas = num(sac_base, "gasUsedMl", item(sac_base, "cylinders", 0));
	long deco_gas = num(sac_deco, "gasUsedMl", item(sac_deco, "cylinders", 0));
	long bottom_gas = num(sac_bottom, "gasUsedMl", item(sac_bottom, "cylinders", 0));
	printf("     SAC: bottom 20 / deco 15 %ld ml, deco 30 %ld ml, bottom 30 %ld ml\n", base_gas, deco_gas, bottom_gas);
	check(num(sac_deco, "runtimeSeconds") == num(sac_base, "runtimeSeconds"), "two SACs: the deco SAC does not change the runtime");
	check(deco_gas > base_gas, "two SACs: a higher deco SAC breathes more gas");
	check(bottom_gas > base_gas, "two SACs: a higher bottom SAC breathes more gas");

	std::string bad, error;
	check(opendives::plan_dive("{\"depthMm\":0}", bad, error) == -1 && error.rfind("BAD_REQUEST", 0) == 0, "bad request refused");

	printf("%d failed\n", failed);
	return failed ? 1 : 0;
}
