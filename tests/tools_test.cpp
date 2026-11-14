// SPDX-License-Identifier: GPL-2.0
// Tools of the façade (core/libopendives/tools.cpp): gas calculator and
// desaturation, against values worked out by hand from Subsurface's formulas.
// usage: tools <log with dives, e.g. third_party/subsurface/dives/SampleDivesV2.ssrf>
#include "../core/libopendives/opendives.h"
#include "zhl16c.h"

#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelog.h"
#include "core/equipment.h"
#include "core/event.h"
#include "core/sample.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <cstring>
#include <string>
#include <vector>

static int failed = 0;

// Tolerances of the references, set just above the differences measured (the
// reasons are given where they are used).
// Desaturation: the façade prints the loads to 4 decimals (rounding up to 5e-5 bar);
// the largest difference measured is 6e-5 bar, so the time-stepping error of
// Subsurface's one-second integration is below the print precision.
constexpr double TOL_DESAT_BAR = 1e-4;
// Blender, added pressure of a step: the façade rounds to 1 mbar and evaluates Z
// with the mix rounded to a permille of each gas (an error of up to 5e-4 in a
// fraction, i.e. about 7e-5 of the pressure at 220 bar); measured at most 4.4 mbar.
constexpr double TOL_BLEND_MBAR = 5.0;
// Blender, volume of a gas: rounded to 1 ml; measured at most 0.5 ml.
constexpr double TOL_BLEND_ML = 1.0;

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

// ---------------------------------------------------------------------------
// Independent references
// ---------------------------------------------------------------------------
// OD_TOOLS_MUTATE=<calc|desat|blend> sends a wrong input to the façade only (the
// references keep the true one): the run must then fail. The release check
// (tests/release-check.sh, "mutations") runs each of them.
static bool mutated(const char *name)
{
	const char *m = getenv("OD_TOOLS_MUTATE");
	return m && !strcmp(m, name);
}

// Reads a decimal number after "key": (for the values printed with decimals).
static double decimal(const std::string &json, const std::string &key, size_t from = 0)
{
	size_t p = json.find("\"" + key + "\":", from);
	return p == std::string::npos ? -1e9 : atof(json.c_str() + p + key.size() + 3);
}

// --- Desaturation: ZH-L16C replay of the logged dives (zhl16c.h, shared with
// plan_oracle.cpp). What Subsurface does, and what is replayed here from the
// published formulas:
//  - tissues at rest on the surface of the first dive: (P - 0.0627) * 0.781
//    (N2_IN_AIR; the dive segments breathe the air as 0.791 N2, 0.209 O2);
//  - each dive from its first to its last sample, up to its total time, depth
//    linear between two samples, water at 1.03 kg/l with g = 9.81 m/s2 (0.101043
//    bar per metre, Subsurface's salinity * 0.981 / 100000 mbar per mm), the gas
//    being the first cylinder's until a "gaschange" event;
//  - air at the surface pressure of the next dive (of "now") between two dives;
//  - dives are taken back from now while a dive ends less than 48 h before the
//    start of the following one.
// Subsurface integrates every second at the depth of that second (a step
// function); this replay uses the exact Schreiner equation over each sample
// interval. The difference is the time-stepping error, measured below.
namespace ref {

constexpr double N2_AT_REST = 0.781;
constexpr double BAR_PER_M = 1.03 * 9.81 / 100.0;
constexpr double AIR_O2 = 0.209;

struct Tissues {
	double n2[zhl16c::N], he[zhl16c::N];
};

Tissues rest(double surface_bar)
{
	Tissues t;
	for (int i = 0; i < zhl16c::N; i++) {
		t.n2[i] = (surface_bar - zhl16c::WATER_VAPOUR_BAR) * N2_AT_REST;
		t.he[i] = 0;
	}
	return t;
}

// `seconds` at ambient pressure going linearly from pa to pb (bar), breathing o2/he fractions.
void segment(Tissues &t, double pa, double pb, double seconds, double o2, double he)
{
	if (seconds <= 0)
		return;
	double minutes = seconds / 60.0, rate = (pb - pa) / minutes, n2 = 1.0 - o2 - he;
	for (int i = 0; i < zhl16c::N; i++) {
		t.n2[i] = zhl16c::schreiner(t.n2[i], zhl16c::HT_N2[i], pa, rate, minutes, n2);
		t.he[i] = zhl16c::schreiner(t.he[i], zhl16c::HT_HE[i], pa, rate, minutes, he);
	}
}

struct Gas {
	int at;
	double o2, he;
};

// Gases of a dive: the first cylinder's, then each "gaschange" event.
std::vector<Gas> gases(const struct dive &d)
{
	const struct divecomputer &dc = d.dcs[0];
	double o2 = get_o2(d.cylinders[0].gasmix) / 1000.0, he = get_he(d.cylinders[0].gasmix) / 1000.0;
	std::vector<Gas> g = { { 0, o2, he } };
	for (const auto &e: dc.events)
		if (e.name == "gaschange")
			g.push_back({ e.time.seconds, get_o2(e.gas.mix) / 1000.0, get_he(e.gas.mix) / 1000.0 });
	std::stable_sort(g.begin(), g.end(), [](const Gas &a, const Gas &b) { return a.at < b.at; });
	return g;
}

void dive(Tissues &t, const struct dive &d, double surface_bar)
{
	const struct divecomputer &dc = d.dcs[0];
	int end = d.totaltime().seconds;
	std::vector<Gas> g = gases(d);
	auto gas_at = [&](double s) {
		Gas r = g[0];
		for (const Gas &x: g)
			if (x.at <= s)
				r = x;
		return r;
	};
	for (size_t i = 1; i < dc.samples.size(); i++) {
		double t0 = dc.samples[i - 1].time.seconds, t1 = dc.samples[i].time.seconds;
		double d0 = dc.samples[i - 1].depth.mm, d1 = dc.samples[i].depth.mm;
		if (t0 >= end)
			break;
		double stop = std::min<double>(t1, end);
		// Cut the interval at the gas changes.
		std::vector<double> cut = { t0 };
		for (const Gas &x: g)
			if (x.at > t0 && x.at < stop)
				cut.push_back(x.at);
		cut.push_back(stop);
		for (size_t k = 1; k < cut.size(); k++) {
			auto depth_at = [&](double s) { return (d0 + (d1 - d0) * (s - t0) / (t1 - t0)) / 1000.0; };
			Gas gas = gas_at(cut[k - 1]);
			segment(t, surface_bar + depth_at(cut[k - 1]) * BAR_PER_M, surface_bar + depth_at(cut[k]) * BAR_PER_M,
				cut[k] - cut[k - 1], gas.o2, gas.he);
		}
	}
}

// The dives counted at `now`, oldest first: back from now while a dive ends
// less than 48 h before the start of the next one.
std::vector<const struct dive *> chain(int64_t now)
{
	std::vector<const struct dive *> used;
	int64_t last_start = now;
	for (auto it = divelog.dives.rbegin(); it != divelog.dives.rend(); ++it) {
		const struct dive &d = **it;
		if (d.when >= now)
			continue;
		if (d.endtime() + 48 * 3600 < last_start)
			break;
		used.push_back(&d);
		last_start = d.when;
	}
	std::reverse(used.begin(), used.end());
	return used;
}

// Tissues at `now`, on the surface at 1013 mbar (the façade's planner dive).
Tissues desaturation(const std::vector<const struct dive *> &used, int64_t now)
{
	Tissues t = rest(1.013);
	if (used.empty())
		return t;
	t = rest(used[0]->get_surface_pressure().mbar / 1000.0);
	int64_t last_end = 0;
	for (size_t i = 0; i < used.size(); i++) {
		double surface = used[i]->get_surface_pressure().mbar / 1000.0;
		if (i)
			segment(t, surface, surface, used[i]->when - last_end, AIR_O2, 0);
		dive(t, *used[i], surface);
		last_end = used[i]->endtime();
	}
	segment(t, 1.013, 1.013, now - last_end, AIR_O2, 0);
	return t;
}

} // namespace ref

// --- Gas blender: an exact real-gas reference. -----------------------------------
// Compressibility factor of a mix, Z = 1 + sum_i x_i (c1_i P + c2_i P^2 + c3_i P^3),
// the cubic virial fit of Perry's Chemical Engineers' Handbook (7th ed.) data for
// O2, N2 and He at 300 K. The coefficients are the ones Subsurface publishes in
// core/gas-model.cpp (they are data, copied: no other source gives this fit); the
// mixing is linear in the mole fractions. Everything below is written from the
// definition of a blend, not from the façade:
//  - a cylinder of volume V at pressure P holds n = P V / (Z R T) of gas, and T
//    and V are fixed, so amounts are kept as n^ = P / Z(mix, P) in bar (the
//    pressure the same amount would read as an ideal gas);
//  - the amounts of helium, nitrogen and oxygen after filling are those of the
//    wanted mix at its final pressure: n^_f = Pf / Z(F, Pf), each gas x_i n^_f;
//  - the three additions (helium, oxygen, nitrox top-up) solve a 3 x 3 linear
//    system of component balances (Gaussian elimination) and must be >= 0;
//  - the pressure after a step solves P / Z(mix, P) = n^ by Newton's method
//    (the façade bisects);
//  - a residual that is too rich is bled down: the highest residual pressure for
//    which the system has a non-negative solution, found by bisection on the
//    pressure (the façade solves the limit in closed form);
//  - the volume of a gas used is n^ V Z(pure gas, 1 bar), as measured at 1 bar.
namespace blend {

struct Mix {
	double o2, he;
};

double z(Mix m, double bar)
{
	static const double O2[3] = { -7.18092073703e-04, +2.81852572808e-06, -1.50290620492e-09 };
	static const double N2[3] = { -2.19260353292e-04, +2.92844845532e-06, -2.07613482075e-09 };
	static const double HE[3] = { +4.87320026468e-04, -8.83632921053e-08, +5.33304543646e-11 };
	auto virial = [&](const double c[3]) { return bar * (c[0] + bar * (c[1] + bar * c[2])); };
	return 1.0 + m.o2 * virial(O2) + m.he * virial(HE) + (1.0 - m.o2 - m.he) * virial(N2);
}

double nhat(Mix m, double bar) { return bar / z(m, bar); }

// Pressure at which the cylinder holds n^ of the mix: Newton from the ideal value.
double pressure(Mix m, double n)
{
	double p = n;
	for (int i = 0; i < 60; i++) {
		double h = 1e-4, f = nhat(m, p) - n, df = (nhat(m, p + h) - nhat(m, p - h)) / (2 * h);
		double next = p - f / df;
		if (std::abs(next - p) < 1e-12)
			return next;
		p = next;
	}
	return p;
}

struct Fill {
	bool ok;
	double he, o2, topup;   // n^ to add of each
};

// Solves the component balances for a residual amount n_r of the mix r.
Fill solve(Mix r, double n_r, Mix f, double n_f, double topup_o2)
{
	// Unknowns (he, o2, topup). Rows: helium, oxygen, nitrogen.
	double a[3][4] = {
		{ 1, 0, 0, f.he * n_f - r.he * n_r },
		{ 0, 1, topup_o2, f.o2 * n_f - r.o2 * n_r },
		{ 0, 0, 1 - topup_o2, (1.0 - f.o2 - f.he) * n_f - (1.0 - r.o2 - r.he) * n_r },
	};
	double x[3];
	for (int i = 2; i >= 0; i--) {
		double s = a[i][3];
		for (int j = i + 1; j < 3; j++)
			s -= a[i][j] * x[j];
		x[i] = s / a[i][i];
	}
	const double eps = 1e-7;
	return { x[0] >= -eps && x[1] >= -eps && x[2] >= -eps, std::max(0.0, x[0]), std::max(0.0, x[1]), std::max(0.0, x[2]) };
}

struct Step {
	double added_bar, volume_ml;
};
struct Result {
	bool ok;
	double bleed_bar = -1;  // -1: nothing bled
	Step steps[3];          // in the order of the façade: he, o2, topup (oxygen first: o2, he, topup)
};

// A blend: wanted o2/he at final bar in a cylinder of `ml`; start `start_bar` of the mix r; top-up o2.
Result run(Mix f, double final_bar, double ml, double start_bar, Mix r, double topup_o2, bool oxygen_first)
{
	Result res = {};
	double n_f = nhat(f, final_bar), n_r = nhat(r, start_bar);
	Fill fill = solve(r, n_r, f, n_f, topup_o2);
	if (!fill.ok) {
		// Highest residual pressure that still gives a feasible fill.
		double lo = 0, hi = start_bar;
		for (int i = 0; i < 200; i++) {
			double mid = 0.5 * (lo + hi);
			if (solve(r, nhat(r, mid), f, n_f, topup_o2).ok)
				lo = mid;
			else
				hi = mid;
		}
		res.bleed_bar = lo;
		start_bar = lo;
		n_r = nhat(r, lo);
		fill = solve(r, n_r, f, n_f, topup_o2);
	}
	res.ok = fill.ok;
	// Amounts in the cylinder after each step.
	double he = n_r * r.he, o2 = n_r * r.o2, n2 = n_r * (1.0 - r.o2 - r.he);
	auto p_of = [&](double he_n, double o2_n) {
		double tot = he_n + o2_n + n2;
		return tot > 0 ? pressure({ o2_n / tot, he_n / tot }, tot) : 0.0;
	};
	double p0 = start_bar, p1, p2;
	if (oxygen_first) {
		p1 = p_of(he, o2 + fill.o2);
		p2 = p_of(he + fill.he, o2 + fill.o2);
	} else {
		p1 = p_of(he + fill.he, o2);
		p2 = p_of(he + fill.he, o2 + fill.o2);
	}
	double p3 = pressure(f, n_f);
	auto vol = [&](double n, Mix gas) { return n * ml * z(gas, 1.0); };
	Step he_step = { 0, vol(fill.he, { 0, 1 }) }, o2_step = { 0, vol(fill.o2, { 1, 0 }) };
	if (oxygen_first) {
		o2_step.added_bar = p1 - p0;
		he_step.added_bar = p2 - p1;
		res.steps[0] = o2_step;
		res.steps[1] = he_step;
	} else {
		he_step.added_bar = p1 - p0;
		o2_step.added_bar = p2 - p1;
		res.steps[0] = he_step;
		res.steps[1] = o2_step;
	}
	res.steps[2] = { p3 - p2, vol(fill.topup, { topup_o2, 0 }) };
	return res;
}

} // namespace blend

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
	opendives::gas_calculator(320, 0, mutated("calc") ? 1500 : 1400, 30000, json, error);
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


	// --- Gas blender against the exact real-gas reference (namespace blend) ---------
	// Each fill step (added pressure, gas volume) and the bleed-down pressure are
	// compared with the reference. The reference solves the blend to 1e-12 bar; what
	// the façade rounds is described at TOL_BLEND_*. The worst differences measured
	// are printed below.
	auto vs_reference = [&](const char *what, int o2, int he, int final_mbar, int ml, int start_mbar, int start_o2, int start_he,
				int topup, bool oxygen_first) {
		std::string j, e;
		opendives::gas_blend(o2, he, final_mbar + (mutated("blend") ? 1000 : 0), ml, start_mbar, start_o2, start_he, topup, j, e, oxygen_first);
		blend::Result r = blend::run({ o2 / 1000.0, he / 1000.0 }, final_mbar / 1000.0, ml, start_mbar / 1000.0,
					     { start_o2 / 1000.0, start_he / 1000.0 }, topup / 1000.0, oxygen_first);
		if (getenv("OD_TOOLS_DUMP")) {
			printf("%s\n", j.c_str());
			for (auto &st: r.steps)
				printf("  reference: added %.4f bar, %.1f ml\n", st.added_bar, st.volume_ml);
		}
		double worst_p = 0, worst_v = 0, abs_p = 0, abs_v = 0;
		bool ok = r.ok == (j.find("\"feasible\":true") != std::string::npos || j.find("RESIDUAL_TOO_HIGH") != std::string::npos);
		for (int i = 0; i < 3; i++) {
			double p = step(j, i, "addedMbar") / 1000.0, v = step(j, i, "volumeMl");
			abs_p = std::max(abs_p, std::abs(p - r.steps[i].added_bar) * 1000.0);
			abs_v = std::max(abs_v, std::abs(v - r.steps[i].volume_ml));
			worst_p = std::max(worst_p, std::abs(p - r.steps[i].added_bar) / std::max(1.0, std::abs(r.steps[i].added_bar)));
			worst_v = std::max(worst_v, std::abs(v - r.steps[i].volume_ml) / std::max(1000.0, r.steps[i].volume_ml));
			ok = ok && std::abs(p - r.steps[i].added_bar) <= TOL_BLEND_MBAR / 1000.0;
			// After a bleed-down the façade keeps 1 mbar less than the exact limit (rounded
			// down so as never to keep too much): the top-up then fills that 1 mbar (ml / 1000 ml).
			ok = ok && std::abs(v - r.steps[i].volume_ml) <= TOL_BLEND_ML + (r.bleed_bar >= 0 ? ml / 1000.0 : 0.0);
		}
		if (r.bleed_bar >= 0)
			ok = ok && std::abs(number(j, "bleedToMbar") / 1000.0 - r.bleed_bar) <= 1.0 / 1000.0; // floored to 1 mbar
		else
			ok = ok && j.find("bleedToMbar") == std::string::npos;
		printf("%s reference blend, %s: worst difference %.2f mbar and %.1f ml (%.4f %% of a step pressure of at least 1 bar)%s\n",
		       ok ? "ok  " : "FAIL", what, abs_p, abs_v, worst_p * 100, r.bleed_bar >= 0 ? ", with bleed-down" : "");
		failed += !ok;
	};
	vs_reference("nitrox from empty, helium first", 320, 0, 200000, 12000, 0, 0, 0, 210, false);
	vs_reference("nitrox from empty, oxygen first", 320, 0, 200000, 12000, 0, 0, 0, 210, true);
	vs_reference("trimix 21/35 from empty", 210, 350, 220000, 12000, 0, 0, 0, 210, false);
	vs_reference("trimix 21/35 from empty, oxygen first", 210, 350, 220000, 12000, 0, 0, 0, 210, true);
	vs_reference("trimix 18/45 to 300 bar", 180, 450, 300000, 15000, 0, 0, 0, 320, false);
	vs_reference("partly filled with the same trimix", 210, 350, 220000, 12000, 50000, 210, 350, 210, false);
	vs_reference("partly filled with the same trimix, oxygen first", 210, 350, 220000, 12000, 50000, 210, 350, 210, true);
	vs_reference("partly filled with air", 320, 0, 200000, 12000, 50000, 210, 0, 210, false);
	vs_reference("partly filled with a lean trimix", 180, 450, 232000, 18000, 80000, 210, 300, 320, false);
	vs_reference("bleed-down of air", 360, 0, 150000, 12000, 150000, 210, 0, 210, false);
	vs_reference("bleed-down of air, oxygen first", 360, 0, 150000, 12000, 150000, 210, 0, 210, true);
	vs_reference("helium left, nitrox wanted", 320, 0, 200000, 12000, 30000, 210, 350, 210, false);
	vs_reference("bleed-down of a trimix", 180, 450, 200000, 12000, 120000, 210, 350, 210, false);

	// --- Desaturation against the ZH-L16C replay (namespace ref) ----------------
	// The same dives of the log are replayed through the 16 compartments; each
	// nitrogen and helium load is compared with the façade's, and so is the
	// percentage shown by the graph. Two things differ on purpose: Subsurface
	// integrates every second at the depth of that second (a step function,
	// on the pressure of the start of the second), the replay is exact over each
	// sample interval; the gradient of the pressure within a second is the
	// time-stepping error, which TOL_DESAT_BAR is set just above (measured below).
	auto desat_vs_reference = [&](const char *what, int64_t now, size_t expected_dives) {
		std::string j;
		opendives::desaturation(now + (mutated("desat") ? 600 : 0), j);
		auto used = ref::chain(now);
		bool ok = used.size() == expected_dives;
		size_t at = 0;
		for (auto *d: used) {
			at = j.find("\"id\":" + std::to_string(d->id) + ",", at);
			ok = ok && at != std::string::npos && d->dcs[0].salinity == 0 && d->get_surface_pressure().mbar > 0;
		}
		ref::Tissues t = ref::desaturation(used, now);
		size_t tissues = j.find("\"tissues\":[");
		double worst_n2 = 0, worst_he = 0;
		int worst_percent = 0, count = 0;
		size_t p = tissues;
		for (int i = 0; i < zhl16c::N; i++) {
			p = j.find("{\"percent\"", p + 1);
			if (p == std::string::npos) {
				ok = false;
				break;
			}
			count++;
			worst_n2 = std::max(worst_n2, std::abs(decimal(j, "n2Bar", p) - t.n2[i]));
			worst_he = std::max(worst_he, std::abs(decimal(j, "heBar", p) - t.he[i]));
			double total = t.n2[i] + t.he[i], amb = 1.013;
			double a = (zhl16c::A_N2[i] * t.n2[i] + zhl16c::A_HE[i] * t.he[i]) / total;
			double b = (zhl16c::B_N2[i] * t.n2[i] + zhl16c::B_HE[i] * t.he[i]) / total;
			long percent = total < amb ? lrint(total / amb * 50.0) : lrint(50.0 + (total - amb) / (a + amb / b - amb) * 50.0);
			worst_percent = std::max<long>(worst_percent, std::labs(number(j, "percent", p) - percent));
		}
		ok = ok && count == 16 && worst_n2 <= TOL_DESAT_BAR && worst_he <= TOL_DESAT_BAR && worst_percent <= 1;
		printf("%s reference desaturation, %s: %zu dives, worst difference %.5f bar nitrogen, %.5f bar helium, %d point of graph\n",
		       ok ? "ok  " : "FAIL", what, used.size(), worst_n2, worst_he, worst_percent);
		failed += !ok;
	};
	// The last dive of the log, after 1 h and 12 h (the chain behind it too).
	const struct dive &last_dive = *divelog.dives.back();
	desat_vs_reference("1 h after the last dive", last_dive.endtime() + 3600, ref::chain(last_dive.endtime() + 3600).size());
	desat_vs_reference("12 h after the last dive", last_dive.endtime() + 12 * 3600, ref::chain(last_dive.endtime() + 12 * 3600).size());
	// Dives 85 to 90 (29-30 September 2011): six dives in two days, gas changes to
	// EAN50 in 87, 88 and 90, surface intervals from 20 min to 19 h.
	const struct dive *d90 = nullptr;
	for (auto &d: divelog.dives)
		if (d->number == 90)
			d90 = d.get();
	if (d90) {
		desat_vs_reference("1 h after dive 90 (gas changes)", d90->endtime() + 3600, 6);
		desat_vs_reference("12 h after dive 90 (gas changes)", d90->endtime() + 12 * 3600, 6);
	} else {
		check_true("dive 90 is in the log", false);
	}

	printf("%d failed\n", failed);
	return failed ? 1 : 0;
}
