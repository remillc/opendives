// SPDX-License-Identifier: GPL-2.0
// Dive planner of the façade (core/libopendives/plan.cpp), compared with the
// known values of Subsurface's own tests (third_party/subsurface/tests/
// testplan.cpp: testMetric, testVpmbMetric45m30minTx,
// testVpmbMetric60m30minAir), then the plan of the planner mock-ups.
// usage: plan
#include "../core/libopendives/opendives.h"

#include "core/divelog.h"
#include "core/pref.h"
#include "core/units.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>

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

static std::string run(const std::string &request)
{
	std::string json, error;
	if (opendives::plan_dive(request, json, error)) {
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

int main()
{
	opendives::init();
	prefs = default_prefs;
	prefs.unit_system = METRIC;
	prefs.units.length = units::METERS;

	// testMetric: Bühlmann GF 100/100, 79 m for 30 min on 15/45 (36 L, 232 bar)
	// with EAN36 and oxygen; ascents 30 ft/min, last 6 m 10 ft/min, last stop 6 m.
	prefs.planner_deco_mode = BUEHLMANN;
	prefs.gflow = prefs.gfhigh = 100;
	std::string metric = run(
		"{\"depthMm\":79000,\"bottomTimeSeconds\":1800,\"descentMmMin\":23000,"
		"\"ascent75MmMin\":9144,\"ascent50MmMin\":9144,\"ascentStopsMmMin\":9144,\"ascentLast6mMmMin\":3048,"
		"\"lastStop6m\":true,\"when\":1000000000,"
		"\"cylinders\":[{\"o2Permille\":150,\"hePermille\":450,\"sizeMl\":36000,\"startMbar\":232000},"
		"{\"o2Permille\":360,\"hePermille\":0},{\"o2Permille\":1000,\"hePermille\":0}]}");
	printf("     runtime %ld s\n", num(metric, "runtimeSeconds"));
	bar(metric, "testMetric: minimum gas 148 bar", 148);
	check(num(metric, "switchDepthMm", item(metric, "cylinders", 1)) == 33000, "testMetric: EAN36 at 33 m");
	check(num(metric, "switchDepthMm", item(metric, "cylinders", 2)) == 6000, "testMetric: oxygen at 6 m");
	check(close_runtime(num(metric, "runtimeSeconds"), 109 * 60), "testMetric: run time 109 min");
	// The gas changes appear on the stops, at 33 m (cylinder 1) and 6 m (cylinder 2).
	bool ean36 = false, oxygen = false;
	for (int i = 0; item(metric, "stops", i) != std::string::npos && item(metric, "stops", i) < metric.find("\"cylinders\""); i++) {
		size_t at = item(metric, "stops", i);
		if (metric.compare(metric.find("\"gasChange\":", at) + 12, 4, "true") == 0) {
			ean36 |= num(metric, "depthMm", at) == 33000 && num(metric, "cylinder", at) == 1;
			oxygen |= num(metric, "depthMm", at) == 6000 && num(metric, "cylinder", at) == 2;
		}
	}
	check(ean36 && oxygen, "testMetric: stops switch to EAN36 at 33 m, oxygen at 6 m");

	// testVpmbMetric45m30minTx: VPM-B +0, 45 m for 30 min on 21/35 (24 L, 232 bar)
	// with EAN50 and oxygen; ascents 10 m/min, last stop 3 m.
	prefs.planner_deco_mode = VPMB;
	prefs.vpmb_conservatism = 0;
	const char *vpmb_rates = "\"descentMmMin\":23000,\"ascent75MmMin\":10000,\"ascent50MmMin\":10000,"
				 "\"ascentStopsMmMin\":10000,\"ascentLast6mMmMin\":10000,\"lastStop6m\":false,\"when\":1000000000,";
	std::string tx = run(std::string("{\"depthMm\":45000,\"bottomTimeSeconds\":1800,") + vpmb_rates +
		"\"cylinders\":[{\"o2Permille\":210,\"hePermille\":350,\"sizeMl\":24000,\"startMbar\":232000},"
		"{\"o2Permille\":500,\"hePermille\":0},{\"o2Permille\":1000,\"hePermille\":0}]}");
	bar(tx, "testVpmbMetric45m30minTx: minimum gas 108 bar", 108);

	// testVpmbMetric60m30minAir: 60 m for 30 min on air (100 L, 232 bar),
	// descent at 99 m/min.
	std::string air = run(std::string("{\"depthMm\":60000,\"bottomTimeSeconds\":1800,") + vpmb_rates + "\"descentMmMin\":99000," +
		"\"cylinders\":[{\"o2Permille\":210,\"hePermille\":0,\"sizeMl\":100000,\"startMbar\":232000}]}");
	bar(air, "testVpmbMetric60m30minAir: minimum gas 180 bar", 180);
	printf("     runtime %ld s\n", num(air, "runtimeSeconds"));
	check(close_runtime(num(air, "runtimeSeconds"), 141 * 60 + 20), "testVpmbMetric60m30minAir: run time 141 min 20 s");

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

	std::string bad, error;
	check(opendives::plan_dive("{\"depthMm\":0}", bad, error) == -1 && error.rfind("BAD_REQUEST", 0) == 0, "bad request refused");

	printf("%d failed\n", failed);
	return failed ? 1 : 0;
}
