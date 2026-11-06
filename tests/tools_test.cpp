// SPDX-License-Identifier: GPL-2.0
// Tools of the façade (core/libopendives/tools.cpp): gas calculator and
// desaturation, against values worked out by hand from Subsurface's formulas.
// usage: tools <log with dives, e.g. third_party/subsurface/dives/SampleDivesV2.ssrf>
#include "../core/libopendives/opendives.h"

#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <string>

static int failed = 0;

static long number(const std::string &json, const std::string &key, size_t from = 0)
{
	size_t p = json.find("\"" + key + "\":", from);
	return p == std::string::npos ? -999999 : atol(json.c_str() + p + key.size() + 3);
}

static void check(const char *what, long got, long expected)
{
	bool ok = got == expected;
	printf("%s %s: %ld (expected %ld)\n", ok ? "ok  " : "FAIL", what, got, expected);
	failed += !ok;
}

static void check_true(const char *what, bool ok)
{
	printf("%s %s\n", ok ? "ok  " : "FAIL", what);
	failed += !ok;
}

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: %s <log>\n", argv[0]);
		return 2;
	}
	std::string json, error;

	// EAN32 at 1.4 bar, sea water, 1013 mbar. MOD: 1400 * 1000 / 320 = 4375 mbar,
	// (4375 - 1013) / 0.101043 = 33273 mm, rounded to 33 m. At 33 m: 4347 mbar =
	// 4.291214 atm (the core's atm is 1013 mbar). EAD: 4.291214 * 0.680 / 0.79
	// = 3.693704 atm, 26.937 m. END (O2 narcotic, the default): 3.291214 atm
	// above the surface, 32.912 m.
	// Best mix at 30 m (4044 mbar): (1400 * 100 / 4044) * 10 = 340, no helium
	// since the planned depth is the best-mix END (30 m).
	opendives::gas_calculator(320, 0, 1400, 30000, json, error);
	printf("%s\n", json.c_str());
	check("EAN32 MOD", number(json, "modMm"), 33000);
	check("EAN32 EAD at MOD", number(json, "eadMm"), 26937);
	check("EAN32 END at MOD", number(json, "endMm"), 32912);
	check("best O2 at 30 m", number(json, "bestO2"), 340);
	check("best He at 30 m", number(json, "bestHe"), 0);

	// Air at 1.4: 1400 * 1000 / 210 = 6666 mbar, 55946 mm, 56 m. Best mix at
	// 50 m (6065 mbar): O2 (140000 / 6065 = 23) * 10 = 230; He (100 - 404400 /
	// 6065 = 66) * 10 = 340.
	opendives::gas_calculator(210, 0, 1400, 50000, json, error);
	check("air MOD", number(json, "modMm"), 56000);
	check("best O2 at 50 m", number(json, "bestO2"), 230);
	check("best He at 50 m", number(json, "bestHe"), 340);
	check("bad gas refused", opendives::gas_calculator(800, 300, 1400, 30000, json, error), -1);

	opendives::cylinder_types(json);
	check_true("cylinder types listed", json.find("\"name\":\"AL80\"") != std::string::npos);

	// Desaturation with nothing loaded: tissues at rest, (1.013 - 0.0627) * 0.781
	// = 0.7422 bar of nitrogen, 0.7422 / 1.013 * 50 = 37 % in Subsurface's graph.
	opendives::desaturation(1700000000, json);
	check("no dive: surfaceSeconds", number(json, "surfaceSeconds"), -1);
	check("no dive: fastest tissue at rest", number(json, "percent"), 37);
	check("no dive: slowest tissue at rest", number(json, "percent", json.rfind("{\"percent\"")), 37);

	if (opendives::list_dives(argv[1], json, error)) {
		fprintf(stderr, "%s\n", error.c_str());
		return 2;
	}
	// End of the last dive of the log (dives are sorted by time).
	size_t last = json.rfind("\"date\":\"");
	size_t date = last + 8;
	struct tm tm = {};
	strptime(json.substr(date, 19).c_str(), "%Y-%m-%dT%H:%M:%S", &tm);
	int64_t end = static_cast<int64_t>(timegm(&tm)) + number(json, "durationSeconds", last);

	opendives::desaturation(end + 3600, json);
	printf("%s\n", json.c_str());
	long surface = number(json, "surfaceSeconds");
	check_true("one hour after: surface interval about an hour", surface > 3000 && surface <= 3600);
	check_true("one hour after: dives used", json.find("\"dives\":[{") != std::string::npos);
	// The last dive of the sample is 4 m deep for two hours. An hour later the
	// fastest compartment (4 min) is back to rest in Subsurface's graph; the
	// slowest (635 min) still holds more nitrogen than at rest (0.7422 bar).
	int count = 0;
	for (size_t p = json.find("{\"percent\""); p != std::string::npos; p = json.find("{\"percent\"", p + 1))
		count++;
	check("one hour after: compartments", count, 16);
	check("one hour after: fastest compartment at rest", number(json, "percent", json.find("{\"percent\"")), 37);
	size_t slowest = json.rfind("\"n2Bar\":");
	check_true("one hour after: slowest compartment above rest", atof(json.c_str() + slowest + 8) > 0.7430);

	opendives::desaturation(end + 49 * 3600, json);
	check("49 hours after: no dive counts", number(json, "surfaceSeconds"), -1);
	check("49 hours after: dives", json.find("\"dives\":[]") != std::string::npos, 1);

	printf("%d failed\n", failed);
	return failed ? 1 : 0;
}
