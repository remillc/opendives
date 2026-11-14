// SPDX-License-Identifier: GPL-2.0
// Tools of the façade (core/libopendives/tools.cpp): desaturation and the cylinder
// types, against values worked out by hand from Subsurface's formulas. The gas
// calculator and the gas blender are in JavaScript; their checks are in
// tests/app/gas-tools.test.mjs.
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
// OD_TOOLS_MUTATE=desat sends a wrong input to the façade only (the
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

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: %s <log>\n", argv[0]);
		return 2;
	}
	std::string json, error;

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
