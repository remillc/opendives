// SPDX-License-Identifier: GPL-2.0
// Tools section (docs/ui-specification.md, section 1, "Tools"): gas calculator
// and desaturation. Read-only: nothing here changes the log. Every value comes
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

// Equivalent depth at the MOD, ported from Subsurface-mobile's gas calculator
// (DivePlannerPointsModel::calculateGasInfo, qt-models/diveplannermodel.cpp),
// for one pO2 and one choice of o2_is_narcotic: true gives the END (O2 and N2
// narcotic), false the EAD (N2 only).
static depth_t depth_at_mod(const struct dive &temp_dive, struct gasmix mix, int o2_permille, depth_t mod,
			    bool o2_is_narcotic)
{
	int fNarcotic_permille;
	if (o2_is_narcotic) {
		// If O2 is narcotic, the narcotic fraction is N2 + O2.
		fNarcotic_permille = get_n2(mix) + o2_permille;
	} else {
		// Otherwise, it's just N2.
		fNarcotic_permille = get_n2(mix);
	}
	double p_amb_at_mod = temp_dive.depth_to_atm(mod);
	double p_narcotic = p_amb_at_mod * fNarcotic_permille / 1000.0;
	depth_t narcotic_depth = { .mm = 0 };
	if (fNarcotic_permille > 0) {
		double divisor = o2_is_narcotic ? 1.0 : 0.79;
		double ead_atm = p_narcotic / divisor;
		narcotic_depth.mm = static_cast<int>((ead_atm - 1.0) * 10000.0);
		if (narcotic_depth.mm < 0)
			narcotic_depth.mm = 0;
	}
	return narcotic_depth;
}

int gas_calculator(int o2_permille, int he_permille, int po2_mbar, int planned_depth_mm, std::string &json,
		   std::string &error, int best_mix_end_mm, int salinity)
{
	if (salinity < 9900 || salinity > 10500) {
		error = "BAD_REQUEST: salinity out of range";
		return -1;
	}
	if (o2_permille <= 0 || o2_permille > 1000 || he_permille < 0 || o2_permille + he_permille > 1000 ||
	    po2_mbar <= 0 || planned_depth_mm < 0) {
		error = "BAD_REQUEST: gas or pO2 out of range";
		return -1;
	}
	// As Subsurface-mobile: a planner dive, so sea water and 1013 mbar.
	struct dive temp_dive;
	make_planner_dc(&temp_dive.dcs[0]);
	// Water type: kg per 10000 l, as the planner's dive (dive::depth_to_mbarf).
	temp_dive.dcs[0].salinity = salinity;
	temp_dive.salinity = salinity;
	struct gasmix mix;
	mix.o2.permille = o2_permille;
	mix.he.permille = he_permille;
	sanitize_gasmix(mix);

	pressure_t po2_limit = { .mbar = po2_mbar };
	depth_t mod = temp_dive.gas_mod(mix, po2_limit, 1_m);
	depth_t ead = depth_at_mod(temp_dive, mix, o2_permille, mod, false);
	depth_t end = depth_at_mod(temp_dive, mix, o2_permille, mod, prefs.o2narcotic);
	// The same two figures at the planned depth (EAD and MOD screen).
	depth_t planned_depth = { .mm = planned_depth_mm };
	depth_t ead_planned = depth_at_mod(temp_dive, mix, o2_permille, planned_depth, false);
	depth_t end_planned = depth_at_mod(temp_dive, mix, o2_permille, planned_depth, prefs.o2narcotic);

	// Best mix for the planned depth, at the chosen pO2: the core's best_o2()
	// reads the pO2 from prefs.modpO2, set for the call only.
	depth_t planned = { .mm = planned_depth_mm };
	double saved_modpo2 = prefs.modpO2;
	prefs.modpO2 = po2_mbar / 1000.0;
	fraction_t best_o2 = temp_dive.best_o2(planned, false);
	prefs.modpO2 = saved_modpo2;
	// The END limit may be changed for this calculation only (Best mix
	// screen): prefs.bestmixend is restored right after.
	depth_t saved_bestmixend = prefs.bestmixend;
	if (best_mix_end_mm >= 0)
		prefs.bestmixend.mm = best_mix_end_mm;
	fraction_t best_he = temp_dive.best_he(planned, prefs.o2narcotic, best_o2);
	depth_t best_end = prefs.bestmixend;
	prefs.bestmixend = saved_bestmixend;
	// The nitrox alone (no helium) at the planned depth: its END, to compare
	// with the limit.
	struct gasmix nitrox;
	nitrox.o2.permille = best_o2.permille;
	nitrox.he.permille = 0;
	depth_t nitrox_end = depth_at_mod(temp_dive, nitrox, best_o2.permille, planned, prefs.o2narcotic);

	json = "{\"o2\":" + std::to_string(get_o2(mix)) + ",\"he\":" + std::to_string(get_he(mix));
	json += ",\"po2Mbar\":" + std::to_string(po2_mbar);
	json += ",\"modMm\":" + std::to_string(mod.mm);
	json += ",\"eadMm\":" + std::to_string(ead.mm);
	json += ",\"endMm\":" + std::to_string(end.mm);
	json += ",\"eadPlannedMm\":" + std::to_string(ead_planned.mm);
	json += ",\"endPlannedMm\":" + std::to_string(end_planned.mm);
	json += ",\"o2Narcotic\":";
	json += prefs.o2narcotic ? "true" : "false";
	json += ",\"plannedDepthMm\":" + std::to_string(planned_depth_mm);
	json += ",\"bestO2\":" + std::to_string(best_o2.permille);
	json += ",\"bestHe\":" + std::to_string(best_he.permille);
	json += ",\"bestMixEndMm\":" + std::to_string(best_end.mm);
	json += ",\"nitroxEndMm\":" + std::to_string(nitrox_end.mm);
	json += '}';
	return 0;
}

// --- Gas blender: see opendives.h. ---
//
// Partial pressure blending with real-gas behaviour. For a cylinder of fixed
// volume at a fixed (cooled) temperature, the amount of gas is n = P V / (Z R T),
// Z = gas_compressibility_factor() of the mix at pressure P. R, T and V are
// common to every term, so amounts are kept as n_hat = P / Z, in bar (the
// pressure the same amount would read if the gas were ideal).
//
// Wanted final mix F at Pf: n_f = Pf / Z(F, Pf), each component must end at its
// fraction of n_f. The residual gas (n_r = P0 / Z(R, P0)) and the nitrox top-up
// gas (no helium) bring the rest:
//   He : n_r*he_r + a_he                 = he_f * n_f
//   N2 : n_r*n2_r + t * n2_t             = n2_f * n_f
//   O2 : n_r*o2_r + a_o2 + t * o2_t      = o2_f * n_f
// which gives a_he, t (top-up) and a_o2, each of which must be >= 0. The pressure
// after each step solves P / Z(mix, P) = n_hat of the mix then (bisection, P / Z
// increases with P). When one is negative the residual gas is bled down: the
// conditions are linear in n_r, so the largest n_r that satisfies them is found
// and converted back to a pressure of the residual mix.
namespace {

gasmix blend_gasmix(double o2, double he)
{
	gasmix g;
	g.o2.permille = static_cast<int>(lrint(o2 * 1000));
	g.he.permille = static_cast<int>(lrint(he * 1000));
	return g;
}

double blend_z(double o2, double he, double bar)
{
	return gas_compressibility_factor(blend_gasmix(o2, he), bar);
}

double blend_nhat(double o2, double he, double bar)
{
	return bar <= 0 ? 0.0 : bar / blend_z(o2, he, bar);
}

// Pressure (bar) at which the cylinder holds n_hat of the mix.
double blend_pressure(double o2, double he, double n_hat)
{
	if (n_hat <= 0)
		return 0.0;
	double lo = 0.0, hi = 600.0;
	for (int i = 0; i < 80; i++) {
		double mid = 0.5 * (lo + hi);
		if (blend_nhat(o2, he, mid) < n_hat)
			lo = mid;
		else
			hi = mid;
	}
	return 0.5 * (lo + hi);
}

} // namespace

int gas_blend(int o2_permille, int he_permille, int final_mbar, int cylinder_ml, int start_mbar,
	      int start_o2_permille, int start_he_permille, int topup_o2_permille, std::string &json,
	      std::string &error, bool oxygen_first)
{
	if (o2_permille <= 0 || o2_permille > 1000 || he_permille < 0 || o2_permille + he_permille > 1000 ||
	    final_mbar <= 0 || final_mbar > 500000 || cylinder_ml <= 0 || start_mbar < 0 || start_mbar > 500000 ||
	    start_o2_permille < 0 || start_he_permille < 0 || start_o2_permille + start_he_permille > 1000 ||
	    topup_o2_permille <= 0 || topup_o2_permille >= 1000) {
		error = "BAD_REQUEST: blend out of range";
		return -1;
	}
	const double eps = 1e-6;
	const double o2_f = o2_permille / 1000.0, he_f = he_permille / 1000.0, n2_f = 1.0 - o2_f - he_f;
	const double o2_t = topup_o2_permille / 1000.0, n2_t = 1.0 - o2_t;
	const double o2_r = start_o2_permille / 1000.0, he_r = start_he_permille / 1000.0, n2_r = 1.0 - o2_r - he_r;
	const double final_bar = final_mbar / 1000.0;
	double start_bar = start_mbar / 1000.0;
	const double n_f = blend_nhat(o2_f, he_f, final_bar);
	double n_r = blend_nhat(o2_r, he_r, start_bar);

	std::string reason;
	// Oxygen to add from an empty cylinder: negative when the top-up gas is too
	// rich for the wanted mix, whatever is bled.
	double a0 = o2_f * n_f - o2_t * n2_f * n_f / n2_t;
	if (a0 < -eps) {
		reason = "TOPUP_TOO_RICH";
	} else {
		// Largest residual amount every condition allows.
		double limit = n_f; // the cylinder cannot start with more than it ends with
		if (he_r > 0)
			limit = std::min(limit, he_f * n_f / he_r);
		if (n2_r > 0)
			limit = std::min(limit, n2_f * n_f / n2_r);
		double b = o2_r - o2_t * n2_r / n2_t;
		if (b > 0)
			limit = std::min(limit, a0 / b);
		if (n_r > limit + eps) {
			reason = "RESIDUAL_TOO_HIGH";
			// Bleed pressure rounded down to 1 mbar, so as never to keep too much.
			start_bar = std::floor(blend_pressure(o2_r, he_r, std::max(0.0, limit)) * 1000.0) / 1000.0;
			n_r = blend_nhat(o2_r, he_r, start_bar);
		}
	}

	json = std::string("{\"feasible\":") + (reason.empty() ? "true" : "false") + ",\"error\":\"" + reason + "\"";
	json += ",\"startMbar\":" + std::to_string(start_mbar);
	if (reason == "RESIDUAL_TOO_HIGH")
		json += ",\"bleedToMbar\":" + std::to_string(lrint(start_bar * 1000.0));
	if (reason == "TOPUP_TOO_RICH") {
		json += ",\"steps\":[]}";
		return 0;
	}

	// The fill from the (possibly bled) residual gas.
	double a_he = std::max(0.0, he_f * n_f - n_r * he_r);
	double t = std::max(0.0, (n2_f * n_f - n_r * n2_r) / n2_t);
	double a_o2 = std::max(0.0, o2_f * n_f - n_r * o2_r - t * o2_t);

	// Mix and pressure after the first gas added, then after the second (the
	// amounts to add do not depend on the order, only the pressures read).
	double he_n = n_r * he_r, o2_n = n_r * o2_r, n2_n = n_r * n2_r;
	auto pressure_of = [&](double he_amount, double o2_amount) {
		double total = he_amount + o2_amount + n2_n;
		return total > 0 ? blend_pressure(o2_amount / total, he_amount / total, total) : 0.0;
	};
	double p1, p2;
	if (oxygen_first) {
		p1 = pressure_of(he_n, o2_n + a_o2);
		p2 = pressure_of(he_n + a_he, o2_n + a_o2);
	} else {
		p1 = pressure_of(he_n + a_he, o2_n);
		p2 = pressure_of(he_n + a_he, o2_n + a_o2);
	}
	double p3 = blend_pressure(o2_f, he_f, n_f); // the final pressure

	// Gas used, at 1 bar: n_hat * cylinder volume * Z of the pure gas at 1 bar.
	auto ml = [&](double n_hat, double o2, double he) { return std::to_string(lrint(n_hat * cylinder_ml * blend_z(o2, he, 1.0))); };
	auto mbar = [](double bar) { return std::to_string(lrint(bar * 1000.0)); };
	auto step = [&](const char *gas, double from, double to, const std::string &volume) {
		return std::string("{\"gas\":\"") + gas + "\",\"toMbar\":" + mbar(to) + ",\"addedMbar\":" + mbar(to - from) +
		       ",\"volumeMl\":" + volume + "}";
	};
	std::string he_step_pre = oxygen_first ? "" : step("he", start_bar, p1, ml(a_he, 0, 1));
	std::string o2_step_pre = oxygen_first ? step("o2", start_bar, p1, ml(a_o2, 1, 0)) : step("o2", p1, p2, ml(a_o2, 1, 0));
	std::string he_step = oxygen_first ? step("he", p1, p2, ml(a_he, 0, 1)) : he_step_pre;
	json += ",\"steps\":[";
	json += oxygen_first ? o2_step_pre + "," + he_step : he_step + "," + o2_step_pre;
	json += "," + step("topup", p2, p3, ml(t, o2_t, 0));
	json += "]}";
	return 0;
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
