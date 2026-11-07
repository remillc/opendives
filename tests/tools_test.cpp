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

	// Fresh water (10000 kg per 10000 l): 3362 mbar above the surface at 9.80665 kPa
	// per metre of 1000 kg/m3 = 34.28 m, rounded to 34 m (sea water: 33 m).
	opendives::gas_calculator(320, 0, 1400, 30000, json, error, -1, 10000);
	check("EAN32 MOD in fresh water", number(json, "modMm"), 34000);
	// Best mix at 30 m in fresh water: 30 m is 3943 mbar, 140000 / 3943 = 35.5 -> 350.
	check("best O2 at 30 m in fresh water", number(json, "bestO2"), 350);
	// EAD and END at the planned depth: EAN32 at 30 m, O2 narcotic: END = 30 m.
	opendives::gas_calculator(320, 0, 1400, 30000, json, error);
	check_true("END at the planned depth about 30 m", std::abs(number(json, "endPlannedMm") - 30000) < 100);
	check_true("EAD at the planned depth about 24 m", number(json, "eadPlannedMm") > 23500 && number(json, "eadPlannedMm") < 25000);
	// Best nitrox alone at 30 m is EAN34, narcotic fraction 100 %: END = 30 m.
	check_true("END of the best nitrox about 30 m", std::abs(number(json, "nitroxEndMm") - 30000) < 100);
	// END of 30 m for the best mix is the default Settings limit; here limited to 20 m.
	opendives::gas_calculator(210, 0, 1400, 50000, json, error, 20000);
	check("best mix END override", number(json, "bestMixEndMm"), 20000);
	check_true("best mix END override: more helium than at 30 m", number(json, "bestHe") > 340);
	opendives::gas_calculator(210, 0, 1400, 50000, json, error);
	check("best mix END back to the preference", number(json, "bestHe"), 340);
	check("bad salinity refused", opendives::gas_calculator(210, 0, 1400, 30000, json, error, -1, 5000), -1);

	// --- Gas blender (real gases) -------------------------------------------------
	// Amounts are checked against an ideal-gas hand calculation, within a few
	// percent (the compressibility of helium and oxygen at 200 bar is 1 to 4 %),
	// and the fill is checked for coherence: pressures rise, the last is the
	// wanted final pressure.
	auto step = [&](const std::string &j, int n, const char *key) {
		size_t at = j.find("\"steps\":[");
		for (int i = 0; at != std::string::npos && i <= n; i++)
			at = j.find('{', at + 1);
		return number(j, key, at);
	};
	auto near = [](long got, double expected, double tol) { return std::abs(got - expected) <= tol * expected; };

	// EAN32 from empty, 200 bar, 12 L, filled with air. No helium. Ideal: oxygen
	// to 0.32 * 200 - 0.21 * 120 ... N2 0.68 * 200 = 136 bar from air, so air
	// 172.2 bar (O2 36.2), oxygen added 64 - 36.2 = 27.8 bar, pressure after
	// oxygen 27.8 bar.
	check("nitrox: blend accepted", opendives::gas_blend(320, 0, 200000, 12000, 0, 0, 0, 210, json, error), 0);
	printf("%s\n", json.c_str());
	check_true("nitrox: feasible", json.find("\"feasible\":true") != std::string::npos);
	check("nitrox: no helium added", step(json, 0, "addedMbar"), 0);
	check_true("nitrox: oxygen about 27.8 bar", near(step(json, 1, "addedMbar"), 27800, 0.06));
	check_true("nitrox: oxygen volume about 27.8 bar x 12 L", near(step(json, 1, "volumeMl"), 27.8 * 12000, 0.06));
	check("nitrox: ends at the wanted pressure", step(json, 2, "toMbar"), 200000);
	check_true("nitrox: pressures rise", step(json, 1, "toMbar") >= step(json, 0, "toMbar") && step(json, 2, "toMbar") > step(json, 1, "toMbar"));

	// Trimix 21/35 to 220 bar from empty, air top-up. Ideal: helium 77 bar; air
	// 0.44 * 220 / 0.79 = 122.5 bar (O2 25.7); oxygen 46.2 - 25.7 = 20.5 bar.
	opendives::gas_blend(210, 350, 220000, 12000, 0, 0, 0, 210, json, error);
	printf("%s\n", json.c_str());
	check_true("trimix: feasible", json.find("\"feasible\":true") != std::string::npos);
	check_true("trimix: helium about 77 bar", near(step(json, 0, "addedMbar"), 77000, 0.08));
	check_true("trimix: oxygen about 20.5 bar", near(step(json, 1, "addedMbar"), 20500, 0.10));
	check_true("trimix: air about 122.5 bar", near(step(json, 2, "addedMbar"), 122500, 0.08));
	check("trimix: ends at the wanted pressure", step(json, 2, "toMbar"), 220000);
	check_true("trimix: helium volume", near(step(json, 0, "volumeMl"), 77.0 * 12000, 0.08));

	// Oxygen first: the same amounts, read in the other order; the top-up is last.
	std::string he_first = json;
	opendives::gas_blend(210, 350, 220000, 12000, 0, 0, 0, 210, json, error, true);
	check_true("oxygen first: oxygen step before helium", json.find("\"gas\":\"o2\"") < json.find("\"gas\":\"he\"") && json.find("\"gas\":\"he\"") < json.find("\"gas\":\"topup\""));
	check_true("oxygen first: oxygen about 20.5 bar", near(step(json, 0, "addedMbar"), 20500, 0.10));
	check_true("oxygen first: helium within 3 % of helium first", near(step(json, 1, "addedMbar"), step(he_first, 0, "addedMbar"), 0.03));
	check("oxygen first: ends at the wanted pressure", step(json, 2, "toMbar"), 220000);
	check_true("oxygen first: pressures rise", step(json, 0, "toMbar") < step(json, 1, "toMbar") && step(json, 1, "toMbar") < step(json, 2, "toMbar"));

	// Partly filled: 50 bar of 21/35 in the cylinder, same wanted mix. Ideal:
	// helium 0.35 * (220 - 50) = 59.5 bar; air 0.44 * 170 / 0.79 = 94.7 bar
	// (O2 19.9); oxygen 0.21 * 170 - 19.9 = 15.8 bar.
	opendives::gas_blend(210, 350, 220000, 12000, 50000, 210, 350, 210, json, error);
	check_true("partly filled, same mix: feasible", json.find("\"feasible\":true") != std::string::npos);
	check_true("partly filled, same mix: helium about 59.5 bar", near(step(json, 0, "addedMbar"), 59500, 0.10));
	check_true("partly filled, same mix: oxygen about 15.8 bar", near(step(json, 1, "addedMbar"), 15800, 0.10));
	check("partly filled, same mix: ends at the wanted pressure", step(json, 2, "toMbar"), 220000);

	// Partly filled with air (50 bar), EAN32 wanted at 200 bar: the residual air
	// brings oxygen, so less is added than from an empty cylinder (27.7 bar).
	opendives::gas_blend(320, 0, 200000, 12000, 50000, 210, 0, 210, json, error);
	check_true("air residual: feasible", json.find("\"feasible\":true") != std::string::npos);
	check_true("air residual: oxygen added between 20 and 27 bar", step(json, 1, "addedMbar") > 20000 && step(json, 1, "addedMbar") < 27000);
	check("air residual: oxygen starts after the residual", step(json, 1, "toMbar") - step(json, 1, "addedMbar"), step(json, 0, "toMbar"));
	check("air residual: no helium", step(json, 0, "addedMbar"), 0);
	check("air residual: first step starts at the cylinder pressure", step(json, 0, "toMbar"), 50000);

	// Impossible: 150 bar of air left in the cylinder, EAN36 wanted at 150 bar:
	// the nitrogen alone, 0.79 * 150 = 118.5 bar, exceeds 0.64 * 150 = 96 bar.
	// Bleed down to 96 / 0.79 = 121.5 bar (ideal), then oxygen up to 150 bar.
	opendives::gas_blend(360, 0, 150000, 12000, 150000, 210, 0, 210, json, error);
	printf("%s\n", json.c_str());
	check_true("too much residual: not feasible", json.find("\"feasible\":false") != std::string::npos);
	check_true("too much residual: error", json.find("RESIDUAL_TOO_HIGH") != std::string::npos);
	long bleed = number(json, "bleedToMbar");
	check_true("too much residual: bleed to about 121.5 bar", near(bleed, 121500, 0.03));
	check_true("too much residual: the fill starts from the bleed pressure", step(json, 0, "toMbar") == bleed);
	check("too much residual: ends at the wanted pressure", step(json, 2, "toMbar"), 150000);

	// Impossible: helium left in the cylinder while a nitrox is wanted: empty it.
	opendives::gas_blend(320, 0, 200000, 12000, 30000, 210, 350, 210, json, error);
	check_true("helium left, nitrox wanted: bleed to empty", json.find("RESIDUAL_TOO_HIGH") != std::string::npos && number(json, "bleedToMbar") == 0);

	// Impossible whatever is bled: top-up gas richer than the wanted mix (EAN32
	// wanted from EAN50 top-up cannot be reached with only oxygen/helium added).
	opendives::gas_blend(210, 350, 220000, 12000, 0, 0, 0, 500, json, error);
	check_true("top-up too rich: error", json.find("TOPUP_TOO_RICH") != std::string::npos);
	check("bad blend refused", opendives::gas_blend(0, 0, 200000, 12000, 0, 0, 0, 210, json, error), -1);
	check("bad top-up refused", opendives::gas_blend(320, 0, 200000, 12000, 0, 0, 0, 1000, json, error), -1);

	opendives::gas_cylinder_types(json);
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
