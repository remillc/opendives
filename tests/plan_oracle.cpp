// SPDX-License-Identifier: GPL-2.0
// Independent checker of the planner (Bühlmann ZH-L16C only).
//
// A small ZH-L16C written from the published formulas, WITHOUT reading
// Subsurface's core/deco.cpp or core/planner.cpp:
//  - Schreiner equation for the tissue loading in a linear change of depth;
//  - Bühlmann's half-times and a/b coefficients, ZH-L16C, nitrogen and helium;
//  - Baker's gradient factors, GF low anchored at the deepest ceiling met;
//  - the NOAA oxygen exposure limits (CNS) and the oxygen toxicity units (OTU).
// It reads the plans the façade (opendives::plan_dive, core/libopendives/plan.cpp)
// gives over a grid of a few hundred plans and checks, on the profile the
// planner returned:
//   1. ceiling: at every waypoint the tissues allow the depth, at the gradient
//      factor of that depth (so no stop is shallower than the ceiling);
//   2. surfacing: at the surface, the tissues are within GF high;
//   3. no longer than needed: one planner step (60 s) before the end of a stop,
//      the tissues did not yet allow the next depth;
//   4. gas used by each cylinder (ml at surface pressure);
//   5. ppO2: no gas is breathed deeper than its switch depth (ppO2 limit for
//      deco), and the bottom MOD of each gas;
//   6. switch depth of each deco gas (its MOD at ppO2 1.6, rounded down to 3 m);
//   7. CNS and OTU.
// It is also checked against itself: corrupted plans must be flagged.
//
// Tolerances (each one explained where it is used, see TOL_*): the planner
// works with integer mm, mbar and seconds, a 60 s decompression step,
// Subsurface's own CNS table and gas compressibility, which this checker does
// not copy.
//
// usage: plan-oracle           OD_MUTATE=<name> as for the plan test; OD_DUMP=1
//        prints the statistics of each check
#include "../core/libopendives/opendives.h"
#include "zhl16c.h"

#include "core/divelog.h"
#include "core/pref.h"
#include "core/units.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// Published constants
// ---------------------------------------------------------------------------

namespace {

using namespace zhl16c;

// SAC is given in ml/min at 1 atmosphere, not at 1 bar.
constexpr double ATMOSPHERE_BAR = 1.01325;

// NOAA single-exposure limits: ppO2 (bar) -> minutes.
const double CNS_PO2[] = { 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 };
const double CNS_MIN[] = { 720, 570, 450, 360, 300, 240, 210, 180, 150, 120, 45 };

// ---------------------------------------------------------------------------
// Tolerances
// ---------------------------------------------------------------------------

// Surfacing: the gradient factor at the surface may exceed GF high by this
// (gradient factor points, 1 = 1 %). This is the sharp check: it does not depend on
// where GF low is anchored. The grid measures at most +1.6 (a ceiling compared in
// whole mm, a gradient of 1 point is about 3 mbar for the slow tissues); a wrong GF high
// (+10) or altitude moves it by more.
constexpr double TOL_SURFACE_GF = 2.5;
// Ceiling during the ascent, and stops not longer than needed. The slope of GF
// between GF low and GF high is anchored at the first stop, whose depth is the planner's
// (a 3 m rounding of a ceiling that keeps changing while it ascends). An independent
// implementation cannot reproduce this to the point: the best fit on the grid (anchor at the
// deepest ceiling at GF low since the planner's own ascent began, shifting it by 1 m
// either way makes it worse) leaves the planner within +6.8 GF points of the ceiling and
// within 9.1 points of "longer than needed" for the deep helium plans, where one
// minute changes the fast tissues by several points. Tolerance: 10. Errors that matter
// (a stop 9 m too shallow, a stop cut short by 4 minutes) are far beyond; the self-test shows it.
constexpr double TOL_STEP_GF = 10.0;
// Gas used: Subsurface converts with the compressibility of the gas
// (Z factor), this checker uses the ideal gas at ambient pressure.
constexpr double TOL_GAS_RELATIVE = 0.01;
// A gas change is placed within 3 s of where this checker puts it: the gas of a
// segment is counted for up to 3 s more or less (at the SAC and pressure of
// the last segment of each gas).
constexpr double TOL_GAS_SECONDS = 3;
// OTU: the exponent 5/6 is published as 0.83 or 0.8333; the checker integrates
// by seconds, the planner by the segments of its profile.
constexpr double TOL_OTU_RELATIVE = 0.03;
constexpr double TOL_OTU_ABSOLUTE = 2;
// CNS: the table is NOAA's, interpolated linearly here; Subsurface uses
// its own fit of it. Relative, with an absolute floor in percent points.
constexpr double TOL_CNS_RELATIVE = 0.10;
constexpr double TOL_CNS_ABSOLUTE = 1.5;
// Bottom MOD: reported in whole metres, from a rounding the planner chooses.
constexpr double TOL_MOD_MM = 1000;
// ppO2 above the limit (bar): the planner rounds the switch depth of 100 % oxygen
// to 6 m (ppO2 1.62) and of EAN50 to 24 m at 800 mbar (1.61).
constexpr double TOL_PO2 = 0.05;

// ---------------------------------------------------------------------------
// A plan as the façade returns it
// ---------------------------------------------------------------------------

struct Waypoint {
	long time;       // s
	long depth_mm;
	int cylinder;
	bool entered;
};
struct Cylinder {
	int o2, he;      // per mille
	long gas_used_ml;
	long switch_depth_mm;
	long bottom_mod_mm;
};
struct Plan {
	std::string error;
	long runtime = 0, cns = 0, otu = 0;
	std::vector<Waypoint> wp;
	std::vector<Cylinder> cyl;
};
struct Params {
	int gf_low, gf_high;
	long salinity;          // kg per 10000 l
	long surface_mbar;
	long bottom_sac, deco_sac; // ml/min
	long bottom_po2 = 1400, deco_po2 = 1600; // mbar
	long round_mm = 3000;   // switch depths are multiples of 3 m
	bool safety_stop = false; // the planner adds a 3 min stop at 3 m to a dive deeper than 10 m
};

long num_after(const std::string &s, size_t from, const char *key, bool *found = nullptr)
{
	std::string k = std::string("\"") + key + "\":";
	size_t at = s.find(k, from);
	if (found)
		*found = at != std::string::npos;
	if (at == std::string::npos)
		return -999999;
	return strtol(s.c_str() + at + k.size(), nullptr, 10);
}

// Objects of the array "key" as [begin, end) positions.
std::vector<std::pair<size_t, size_t>> objects(const std::string &s, const char *key)
{
	std::vector<std::pair<size_t, size_t>> out;
	size_t at = s.find(std::string("\"") + key + "\":[");
	if (at == std::string::npos)
		return out;
	size_t i = at + strlen(key) + 4, depth = 1;
	while (i < s.size() && depth) {
		if (s[i] == '[')
			depth++;
		else if (s[i] == ']')
			depth--;
		else if (s[i] == '{' && depth == 1) {
			size_t e = s.find('}', i);
			out.push_back({ i, e });
			i = e;
		}
		i++;
	}
	return out;
}

bool parse(const std::string &json, Plan &p)
{
	size_t e = json.find("\"error\":\"");
	if (e == std::string::npos)
		return false;
	p.error = json.substr(e + 9, json.find('"', e + 9) - e - 9);
	p.runtime = num_after(json, 0, "runtimeSeconds");
	p.cns = num_after(json, 0, "cns");
	p.otu = num_after(json, 0, "otu");
	for (auto o: objects(json, "segments")) {
		std::string s = json.substr(o.first, o.second - o.first);
		p.wp.push_back({ num_after(s, 0, "timeSeconds"), num_after(s, 0, "depthMm"), (int)num_after(s, 0, "cylinder"),
				 s.find("\"entered\":true") != std::string::npos });
	}
	for (auto o: objects(json, "cylinders")) {
		std::string s = json.substr(o.first, o.second - o.first);
		p.cyl.push_back({ (int)num_after(s, 0, "o2Permille"), (int)num_after(s, 0, "hePermille"), num_after(s, 0, "gasUsedMl"),
				  num_after(s, 0, "switchDepthMm"), num_after(s, 0, "bottomModMm") });
	}
	return !p.wp.empty() && !p.cyl.empty();
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

struct Tissues {
	double n2[N], he[N];
};

class Model {
public:
	Model(const Params &p) : p(p)
	{
		surface = p.surface_mbar / 1000.0;
		bar_per_m = p.salinity / 10000.0 * GRAVITY / 100.0; // kg/l -> kg/m3 -> bar
		for (int i = 0; i < N; i++) {
			t.n2[i] = (surface - WATER_VAPOUR_BAR) * AIR_N2;
			t.he[i] = 0;
		}
		first = surface;
	}

	double pressure(double depth_mm) const { return surface + depth_mm / 1000.0 * bar_per_m; }
	double depth_mm(double bar) const { return (bar - surface) / bar_per_m * 1000.0; }

	// Schreiner: `seconds` of a linear change from depth a to depth b, breathing the gas (fractions).
	void segment(double a_mm, double b_mm, double seconds, double f_n2, double f_he)
	{
		if (seconds <= 0)
			return;
		double minutes = seconds / 60.0, pa = pressure(a_mm), pb = pressure(b_mm);
		double rate = (pb - pa) / minutes;
		for (int i = 0; i < N; i++) {
			schreiner(t.n2[i], HT_N2[i], pa, rate, minutes, f_n2);
			schreiner(t.he[i], HT_HE[i], pa, rate, minutes, f_he);
		}
	}

	// Gradient factor in use at ambient pressure `bar`: the largest, over the
	// compartments, of (tissue - ambient) / (M-value - ambient). 1 = at the M-value.
	double gradient(double bar) const
	{
		double worst = -1e9;
		for (int i = 0; i < N; i++) {
			double pt = t.n2[i] + t.he[i], a, b;
			coefficients(i, a, b);
			double m = bar / b + a;
			worst = std::max(worst, (pt - bar) / (m - bar));
		}
		return worst;
	}

	// The gradient factor the plan may use at ambient pressure `bar`: GF high at
	// the surface, GF low at the first stop (the deepest ceiling at GF low met so far).
	double allowed(double bar) const
	{
		double hi = p.gf_high / 100.0, lo = p.gf_low / 100.0;
		if (first <= surface + 1e-9)
			return hi;
		double x = (bar - surface) / (first - surface);
		return hi + (lo - hi) * std::min(1.0, std::max(0.0, x));
	}

	// Does the tissue state allow ambient pressure `bar`?
	double margin(double bar) const { return (gradient(bar) - allowed(bar)) * 100.0; } // in GF points; <= 0: allowed

	// Ceiling at a given gradient factor, as an ambient pressure (never above the surface).
	double ceiling_at(double gf) const
	{
		double ceil = surface;
		for (int i = 0; i < N; i++) {
			double pt = t.n2[i] + t.he[i], a, b;
			coefficients(i, a, b);
			double tol = (pt - a * gf) / (gf / b - gf + 1.0);
			ceil = std::max(ceil, tol);
		}
		return ceil;
	}

	// GF low applies at the first stop: its ambient pressure anchors the slope.
	void anchor(double bar) { first = bar; }
	// The running anchor: the deepest ceiling at GF low met so far.
	void track() { first = std::max(first, ceiling_at(p.gf_low / 100.0)); }
	double anchored() const { return first; }

	Tissues t;

private:
	Params p;
	double surface, bar_per_m, first;

	void coefficients(int i, double &a, double &b) const
	{
		double pn = t.n2[i], ph = t.he[i], pt = pn + ph;
		a = (A_N2[i] * pn + A_HE[i] * ph) / pt;
		b = (B_N2[i] * pn + B_HE[i] * ph) / pt;
	}

	static void schreiner(double &load, double half_time, double pa, double rate_bar_min, double minutes, double fraction)
	{
		load = zhl16c::schreiner(load, half_time, pa, rate_bar_min, minutes, fraction);
	}
};

double cns_per_minute(double po2)
{
	if (po2 < CNS_PO2[0])
		return 0;
	if (po2 >= CNS_PO2[10])
		return 100.0 / CNS_MIN[10];
	for (int i = 0; i < 10; i++)
		if (po2 <= CNS_PO2[i + 1]) {
			double x = (po2 - CNS_PO2[i]) / (CNS_PO2[i + 1] - CNS_PO2[i]);
			return 100.0 / (CNS_MIN[i] + x * (CNS_MIN[i + 1] - CNS_MIN[i]));
		}
	return 0;
}

double otu_per_minute(double po2)
{
	return po2 > 0.5 ? pow((po2 - 0.5) / 0.5, 5.0 / 6.0) : 0;
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

struct Stat {
	double worst = -1e9;
	void add(double v) { worst = std::max(worst, v); }
};
Stat s_ceiling, s_surface, s_minimal;       // GF points over the allowed
Stat s_gas, s_gas_raw, s_cns, s_otu;                    // relative error
int checked_plans = 0;
bool trace = false; // OD_TRACE=<plan number>: print the walk of that plan

struct Issue {
	std::string what;
};

// Depth and gas at time t, along the waypoints (the segment ending at waypoint k is on its cylinder).
struct Walk {
	double depth_mm;
	int cylinder;
};

std::vector<Issue> verify(const Plan &plan, const Params &pr, bool record)
{
	std::vector<Issue> issues;
	auto fail = [&](const std::string &s) { issues.push_back({ s }); };
	Model m(pr);
		double deco_po2 = pr.deco_po2 / 1000.0;
	auto fo2 = [&](int c) { return plan.cyl[c].o2 / 1000.0; };
	auto fhe = [&](int c) { return plan.cyl[c].he / 1000.0; };

	// Gas used, CNS, OTU on the way (second by second for the exposures).
	std::vector<double> used(plan.cyl.size(), 0), slack(plan.cyl.size(), 0);
	double cns = 0, otu = 0, band_minutes = 0;
	long prev_t = 0;
	double prev_d = 0;
	size_t last_stop_check = 0;
	(void)last_stop_check;
	// A stop is a calculated segment at a constant depth.
	for (size_t k = 0; k < plan.wp.size(); k++) {
		const Waypoint &w = plan.wp[k];
		long dt = w.time - prev_t;
		if (dt < 0) {
			fail("waypoint " + std::to_string(k) + " before the previous one");
			continue;
		}
		if (dt == 0) // a gas change on the spot
			continue;
		int c = w.cylinder;
		double a = prev_d, b = (double)w.depth_mm;
		bool stop = !w.entered && a == b && b > 0;

		// ppO2 of the gas breathed: deco gases never deeper than their switch depth.
		double deepest = std::max(a, b);
		if (c > 0 && !w.entered && fo2(c) * m.pressure(deepest) > deco_po2 + TOL_PO2 && b > 0)
			fail("ppO2 above the limit on gas " + std::to_string(c) + " at " + std::to_string((long)deepest) + " mm");

		// Gas used by the segment: ambient pressure averaged over the segment, SAC of the segment.
		double avg = (m.pressure(a) + m.pressure(b)) / 2.0;
		double sac = w.entered ? pr.bottom_sac : pr.deco_sac;
		used[c] += sac * avg / ATMOSPHERE_BAR * dt / 60.0;
		bool boundary = k == 0 || plan.wp[k - 1].cylinder != c || k + 1 == plan.wp.size() || plan.wp[k + 1].cylinder != c;
		if (boundary)
			slack[c] += TOL_GAS_SECONDS * sac * m.pressure(deepest) / ATMOSPHERE_BAR / 60.0;

		// Exposure by 1 s steps.
		for (long s = 0; s < dt; s++) {
			double d0 = a + (b - a) * s / dt, d1 = a + (b - a) * (s + 1) / dt;
			double po2 = fo2(c) * m.pressure((d0 + d1) / 2.0);
			cns += cns_per_minute(po2) / 60.0;
			otu += otu_per_minute(po2) / 60.0;
			if (po2 >= 0.5 && po2 < CNS_PO2[0])
				band_minutes += 1.0 / 60.0;
		}

		// Tissues.
		double f_he = fhe(c), f_n2 = 1.0 - fo2(c) - f_he;
		Model before = m;
		// GF low is anchored at the deepest ceiling met since the planner's own ascent began (the
		// levels the diver entered may go through ceilings: they do not count).
		if (!w.entered)
			m.track();
		m.segment(a, b, dt, f_n2, f_he);
		if (!w.entered)
			m.track();

		// 1. Ceiling: at the waypoint, the tissues allow the depth.
		if (k > 0 || b > 0) {
			double bar = m.pressure(b);
			double over = m.margin(bar);
			if (trace)
				printf("       t=%5ld %6.1f -> %6.1f m cyl %d %s %s gf_used %.1f%% allowed %.1f%% (over %+.1f) used[c]=%.0f\n", w.time, a / 1000, b / 1000, c, w.entered ? "entered" : "calc   ", stop ? "STOP" : "    ", m.gradient(bar) * 100, m.allowed(bar) * 100, over, used[c]);
			// Only the planner's own ascent: the levels the diver entered are not corrected.
			if (b > 0 && !w.entered) {
				if (record)
					s_ceiling.add(over);
				if (over > TOL_STEP_GF)
					fail("ceiling: " + std::to_string((long)b) + " mm at " + std::to_string(w.time) + " s is above the ceiling by " + std::to_string(over) + " GF points");
			}
		}
		// 3. Not longer than needed: a stop is held until the next depth is allowed.
		bool gas_change_stop = k > 0 && plan.wp[k - 1].cylinder != c;
		bool safety_stop = pr.safety_stop && b <= 5000;
		if (stop && dt > 60 && !gas_change_stop && !safety_stop) {
			// 60 s before the end of the stop, the next depth was not yet allowed.
			Model earlier = before;
			earlier.segment(a, b, dt - 60, f_n2, f_he);
			// The next depth: one step up (3 m, or 6 m to the surface when the last stop is at 6 m ->
			// the nearest shallower waypoint of the plan).
			double next_mm = 0;
			for (size_t j = k + 1; j < plan.wp.size(); j++)
				if (plan.wp[j].depth_mm < b) {
					next_mm = (double)plan.wp[j].depth_mm;
					break;
				}
			double over = earlier.margin(m.pressure(next_mm));
			if (trace)
				printf("         stop %.0f m, %ld s: 60 s before its end, margin to %.0f m is %+.1f GF points; at its end %+.1f (anchor %.1f m)\n", b / 1000, dt,
				       next_mm / 1000, over, m.margin(m.pressure(next_mm)), m.depth_mm(m.anchored()) / 1000);
			if (record)
				s_minimal.add(-over);
			if (-over > TOL_STEP_GF)
				fail("stop at " + std::to_string((long)b) + " mm longer than needed: 60 s before its end the next depth was already allowed by " + std::to_string(-over) + " GF points");
		}
		prev_t = w.time;
		prev_d = b;
	}

	// 2. Surfacing: after the last waypoint (at the surface), within GF high.
	if (prev_d == 0) {
		double over = m.margin(m.pressure(0));
		if (record)
			s_surface.add(over);
		if (over > TOL_SURFACE_GF)
			fail("surfacing above GF high by " + std::to_string(over) + " GF points");
	} else {
		fail("the plan does not end at the surface");
	}

	// 4. Gas used.
	for (size_t c = 0; c < plan.cyl.size(); c++) {
		double reported = (double)plan.cyl[c].gas_used_ml;
		double error = std::fabs(used[c] - reported) / std::max(1.0, std::max(used[c], reported));
		if (used[c] == 0 && reported == 0)
			continue;
		if (record)
			s_gas_raw.add(error);
		if (record)
			s_gas.add(std::max(0.0, std::fabs(used[c] - reported) - slack[c]) / std::max(1.0, std::max(used[c], reported)));
		// Plus the second or two around a gas change (TOL_GAS_SECONDS), at the SAC and depth of the segment.
		double over_by = std::fabs(used[c] - reported);
		if (over_by > TOL_GAS_RELATIVE * std::max(used[c], reported) + slack[c])
			fail("gas used by cylinder " + std::to_string(c) + ": " + std::to_string((long)reported) + " ml, expected " + std::to_string((long)used[c]));
	}

	// 5, 6. MOD at the bottom ppO2 (rounded down to 1 m) and switch depths.
	for (size_t c = 0; c < plan.cyl.size(); c++) {
		double f = fo2(c);
		double mod_mm = m.depth_mm(pr.bottom_po2 / 1000.0 / f);
		// The planner rounds to a whole metre; this checker only requires the reported MOD to be
		// within that metre of the true one (TOL_MOD_MM).
		if (mod_mm > 0 && std::fabs((double)plan.cyl[c].bottom_mod_mm - mod_mm) > TOL_MOD_MM)
			fail("bottom MOD of cylinder " + std::to_string(c) + ": " + std::to_string(plan.cyl[c].bottom_mod_mm) + " mm, expected about " + std::to_string((long)mod_mm));
		if (c > 0) {
			double sw = m.depth_mm(deco_po2 / f);
			// A multiple of 3 m within one step of the true MOD (the planner rounds to the nearest
			// step in some cases and down in others: 100 % oxygen goes to 6 m, ppO2 1.62), and
			// never at a ppO2 above the limit by more than TOL_PO2.
			long got = plan.cyl[c].switch_depth_mm;
			// The planner takes the MOD in sea water whatever the plan's water (shallower, so safe, in fresh water).
			Params sea = pr;
			sea.salinity = 10300;
			double sw_sea = Model(sea).depth_mm(deco_po2 / f);
			if (got % pr.round_mm != 0 || got > sw + pr.round_mm || got < sw_sea - pr.round_mm || fo2(c) * m.pressure((double)got) > deco_po2 + TOL_PO2)
				fail("switch depth of cylinder " + std::to_string(c) + ": " + std::to_string(got) + " mm, MOD " + std::to_string((long)sw));
		}
	}

	// 7. CNS and OTU.
	if (record) {
		double up = cns + band_minutes * 100.0 / CNS_MIN[0];
		s_cns.add(std::max(0.0, std::max(cns - plan.cns, plan.cns - up) - TOL_CNS_ABSOLUTE) / std::max(1.0, (double)plan.cns));
		s_otu.add(std::max(0.0, std::fabs(otu - plan.otu) - TOL_OTU_ABSOLUTE) / std::max(1.0, (double)plan.otu));
	}
	// Below ppO2 0.6 NOAA has no limit; Subsurface counts a little from 0.5: anything up to the
	// 0.6 rate (100 / 720 per minute) for the minutes spent in that band is accepted.
	double upper = cns + band_minutes * 100.0 / CNS_MIN[0];
	if (plan.cns < cns - TOL_CNS_ABSOLUTE - TOL_CNS_RELATIVE * cns || plan.cns > upper + TOL_CNS_ABSOLUTE + TOL_CNS_RELATIVE * upper)
		fail("CNS " + std::to_string(plan.cns) + " %, expected " + std::to_string(cns));
	if (std::fabs(otu - plan.otu) > TOL_OTU_ABSOLUTE + TOL_OTU_RELATIVE * plan.otu)
		fail("OTU " + std::to_string(plan.otu) + ", expected " + std::to_string(otu));
	return issues;
}

} // namespace

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

namespace {

unsigned long seed = 20261109;
unsigned next(unsigned n)
{
	seed = seed * 6364136223846793005UL + 1442695040888963407UL;
	return (unsigned)((seed >> 33) % n);
}

struct GasSet {
	const char *name;
	std::vector<std::pair<int, int>> gases; // o2, he per mille
	int max_depth_m;                         // deepest sensible bottom depth for the first gas
};

const GasSet GAS_SETS[] = {
	{ "air", { { 209, 0 } }, 30 },
	{ "air+EAN50", { { 209, 0 }, { 500, 0 } }, 36 },
	{ "air+EAN50+O2", { { 209, 0 }, { 500, 0 }, { 1000, 0 } }, 36 },
	{ "EAN32+O2", { { 320, 0 }, { 1000, 0 } }, 30 },
	{ "EAN32+EAN50", { { 320, 0 }, { 500, 0 } }, 30 },
	{ "21/35+EAN50+O2", { { 210, 350 }, { 500, 0 }, { 1000, 0 } }, 60 },
	{ "18/45+21/35+EAN50+O2", { { 180, 450 }, { 210, 350 }, { 500, 0 }, { 1000, 0 } }, 70 },
	{ "10/70+21/35+EAN50", { { 100, 700 }, { 210, 350 }, { 500, 0 } }, 90 },
};

std::string request(const std::vector<std::pair<long, long>> &levels, const GasSet &gs, const Params &pr, bool last_stop6, long ascent_mm_min)
{
	std::string r = "{\"levels\":[";
	for (size_t i = 0; i < levels.size(); i++)
		r += (i ? "," : "") + std::string("{\"depthMm\":") + std::to_string(levels[i].first) + ",\"durationSeconds\":" + std::to_string(levels[i].second) + "}";
	r += "],\"decoModel\":0,\"gfLow\":" + std::to_string(pr.gf_low) + ",\"gfHigh\":" + std::to_string(pr.gf_high) +
	     ",\"salinity\":" + std::to_string(pr.salinity) + ",\"surfacePressureMbar\":" + std::to_string(pr.surface_mbar) +
	     ",\"bottomSacMlMin\":" + std::to_string(pr.bottom_sac) + ",\"decoSacMlMin\":" + std::to_string(pr.deco_sac) +
	     ",\"safetyStop\":" + (pr.safety_stop ? "true" : "false") + ",\"lastStop6m\":" + (last_stop6 ? "true" : "false") + ",\"ascent75MmMin\":" + std::to_string(ascent_mm_min) +
	     ",\"ascent50MmMin\":" + std::to_string(ascent_mm_min) + ",\"ascentStopsMmMin\":" + std::to_string(ascent_mm_min) +
	     ",\"ascentLast6mMmMin\":" + std::to_string(ascent_mm_min < 9000 ? ascent_mm_min : 3000) + ",\"when\":1000000000,\"cylinders\":[";
	for (size_t i = 0; i < gs.gases.size(); i++)
		r += (i ? "," : "") + std::string("{\"o2Permille\":") + std::to_string(gs.gases[i].first) + ",\"hePermille\":" + std::to_string(gs.gases[i].second) + "}";
	return r + "]}";
}

// The mutation of OD_MUTATE, sent to the façade only: the checker keeps the true parameters.
std::string mutate(std::string r)
{
	const char *m = getenv("OD_MUTATE");
	if (!m || !*m)
		return r;
	std::string name = m, extra;
	if (name == "sac")
		extra = "\"bottomSacMlMin\":" + std::to_string((long)(1.1 * (double)strtol(r.c_str() + r.find("\"bottomSacMlMin\":") + 17, nullptr, 10))) +
			",\"decoSacMlMin\":" + std::to_string((long)(1.1 * (double)strtol(r.c_str() + r.find("\"decoSacMlMin\":") + 15, nullptr, 10)));
	else if (name == "gf")
		extra = "\"gfHigh\":" + std::to_string(strtol(r.c_str() + r.find("\"gfHigh\":") + 9, nullptr, 10) + 10);
	else if (name == "water")
		extra = "\"salinity\":10000";
	else if (name == "altitude")
		extra = "\"surfacePressureMbar\":850";
	else if (name == "vpmb")
		extra = "\"decoModel\":1";
	else if (name == "ascent")
		extra = "\"ascent75MmMin\":15000,\"ascent50MmMin\":15000,\"ascentStopsMmMin\":15000";
	else {
		printf("unknown mutation %s\n", m);
		exit(2);
	}
	r.pop_back();
	return r + "," + extra + "}";
}

int failed = 0;
void check(bool ok, const std::string &what)
{
	printf("%s %s\n", ok ? "ok  " : "FAIL", what.c_str());
	failed += !ok;
}

} // namespace

int main()
{
	opendives::init();
	prefs = default_prefs;
	prefs.unit_system = METRIC;
	prefs.units.length = units::METERS;
	bool dump = getenv("OD_DUMP") != nullptr;

	const int gf_low[] = { 30, 40, 50, 20, 100, 70, 35 };
	const int gf_high[] = { 75, 85, 70, 90, 100, 70, 80 };
	const long salinity[] = { 10300, 10000, 10300, 10100 };
	const long surface[] = { 1013, 1013, 900, 800 };
	const long sacs[][2] = { { 20000, 17000 }, { 15000, 12000 }, { 25000, 20000 }, { 30000, 20000 } };

	int planned = 0, refused = 0, bad = 0, with_stops = 0, gas_switches = 0;
	const int PLANS = 360;
	std::vector<std::string> samples;
	for (int n = 0; n < PLANS; n++) {
		const GasSet &gs = GAS_SETS[next(sizeof(GAS_SETS) / sizeof(GAS_SETS[0]))];
		Params pr;
		int g = next(7);
		pr.gf_low = gf_low[g];
		pr.gf_high = gf_high[g];
		int w = next(4);
		pr.salinity = salinity[w];
		pr.surface_mbar = surface[next(4)];
		int s = next(4);
		pr.bottom_sac = sacs[s][0];
		pr.deco_sac = sacs[s][1];
		// Levels: 1 to 3, the first at 12 m to the gas set's depth.
		int depth = 12 + (int)next((unsigned)(gs.max_depth_m - 12) / 3 + 1) * 3;
		std::vector<std::pair<long, long>> levels;
		levels.push_back({ depth * 1000L, (long)(8 + next(40)) * 60 });
		int extra = next(3);
		for (int l = 0; l < extra; l++) {
			int d = std::max(6, (int)(levels.back().first / 1000 * (60 + next(30)) / 100 / 3 * 3));
			levels.push_back({ d * 1000L, (long)(5 + next(25)) * 60 });
		}
		pr.safety_stop = next(4) == 0;
		bool last6 = next(2);
		long ascent = next(3) == 0 ? 6000 : 9000;
		std::string req = request(levels, gs, pr, last6, ascent);
		std::string json, error;
		if (opendives::plan_dive(mutate(req), json, error)) {
			bad++;
			continue;
		}
		Plan plan;
		if (!parse(json, plan)) {
			bad++;
			continue;
		}
		if (!plan.error.empty()) {
			refused++;
			continue;
		}
		planned++;
		bool stops = false, sw = false;
		for (size_t k = 1; k < plan.wp.size(); k++) {
			stops = stops || (!plan.wp[k].entered && plan.wp[k].depth_mm == plan.wp[k - 1].depth_mm && plan.wp[k].depth_mm > 0);
			sw = sw || plan.wp[k].cylinder != plan.wp[k - 1].cylinder;
		}
		with_stops += stops;
		gas_switches += sw;
		checked_plans++;
		trace = getenv("OD_TRACE") && atoi(getenv("OD_TRACE")) == n;
		if (trace)
			printf("trace plan %d: %s\n     reported: cns %ld otu %ld runtime %ld gas used %ld %ld %ld\n", n, req.c_str(), plan.cns, plan.otu, plan.runtime, plan.cyl[0].gas_used_ml, plan.cyl.size() > 1 ? plan.cyl[1].gas_used_ml : 0L, plan.cyl.size() > 2 ? plan.cyl[2].gas_used_ml : 0L);
		std::vector<Issue> issues = verify(plan, pr, true);
		if (!issues.empty()) {
			printf("FAIL plan %d (%s, %d m, GF %d/%d, salinity %ld, %ld mbar): %s\n", n, gs.name, depth, pr.gf_low, pr.gf_high, pr.salinity, pr.surface_mbar,
			       issues[0].what.c_str());
			failed++;
			if (samples.size() < 3)
				samples.push_back(req);
		}
	}
	printf("     %d plans: %d checked, %d refused by the planner, %d not read; %d with stops, %d with a gas switch\n", PLANS, planned, refused, bad, with_stops, gas_switches);
	if (dump || true) {
		printf("     worst over the grid (tolerance): ceiling %+.2f GF points (%.1f), surfacing %+.2f (%.1f), stop longer than needed by %+.2f (%.1f); gas %.2f %% beyond the gas-change seconds, %.2f %% raw (%.0f %% + %.0f s of gas change), CNS %.1f %% (%.0f %% + %.1f points), OTU %.1f %% (%.0f %% + %.0f), beyond their absolute floors\n",
		       s_ceiling.worst, TOL_STEP_GF, s_surface.worst, TOL_SURFACE_GF, s_minimal.worst, TOL_STEP_GF, s_gas.worst * 100, s_gas_raw.worst * 100, TOL_GAS_RELATIVE * 100,
		       TOL_GAS_SECONDS, s_cns.worst * 100, TOL_CNS_RELATIVE * 100, TOL_CNS_ABSOLUTE, s_otu.worst * 100, TOL_OTU_RELATIVE * 100, TOL_OTU_ABSOLUTE);
	}
	check(planned >= 300 && bad == 0, "grid: at least 300 plans planned and read");
	check(with_stops >= 150 && gas_switches >= 50, "grid: plans with decompression stops and with gas switches");

	// Self-test: corrupted plans must be flagged. A plan with stops and a deco gas.
	{
		GasSet gs = GAS_SETS[5];
		Params pr { 30, 75, 10300, 1013, 20000, 17000 };
		std::string json, error;
		std::string req = request({ { 45000, 25 * 60 } }, gs, pr, false, 9000);
		Plan plan;
		bool ok = !opendives::plan_dive(req, json, error) && parse(json, plan) && plan.error.empty();
		check(ok, "self-test: reference plan 45 m 25 min, 21/35 + EAN50 + O2, GF 30/75");
		if (ok) {
			check(verify(plan, pr, false).empty(), "self-test: the reference plan passes the checker");
			// a) the first stop 9 m too shallow
			Plan a = plan;
			for (size_t k = 1; k < a.wp.size(); k++)
				if (!a.wp[k].entered && a.wp[k].depth_mm == a.wp[k - 1].depth_mm && a.wp[k].depth_mm >= 12000) {
					a.wp[k].depth_mm -= 9000;
					a.wp[k - 1].depth_mm -= 9000;
					break;
				}
			check(!verify(a, pr, false).empty(), "self-test: a first stop 9 m too shallow is flagged");
			// b) the last stop cut short by 4 min (the ascent follows at once)
			Plan b = plan;
			for (size_t k = b.wp.size() - 1; k > 0; k--)
				if (!b.wp[k].entered && b.wp[k].depth_mm == b.wp[k - 1].depth_mm && b.wp[k].time - b.wp[k - 1].time > 300) {
					long cut = 240;
					for (size_t j = k; j < b.wp.size(); j++)
						b.wp[j].time -= cut;
					break;
				}
			check(!verify(b, pr, false).empty(), "self-test: a decompression stop cut short is flagged");
			// c) the gas used 10 % higher / the wrong SAC
			Params sac = pr;
			sac.bottom_sac = 22000;
			sac.deco_sac = 18700;
			check(!verify(plan, sac, false).empty(), "self-test: SAC +10 % is flagged");
			// d) the wrong gradient factor
			Params gf = pr;
			gf.gf_high = 60;
			check(!verify(plan, gf, false).empty(), "self-test: a lower GF high is flagged");
			// e) the wrong water
			Params water = pr;
			water.salinity = 10000;
			check(!verify(plan, water, false).empty(), "self-test: fresh water instead of sea water is flagged");
			// f) the wrong altitude
			Params altitude = pr;
			altitude.surface_mbar = 900;
			check(!verify(plan, altitude, false).empty(), "self-test: another altitude is flagged");
		}
	}
	printf("%d failed\n", failed);
	return failed ? 1 : 0;
}
