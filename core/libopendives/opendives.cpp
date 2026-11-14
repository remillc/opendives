// SPDX-License-Identifier: GPL-2.0
#include "opendives.h"
#include "internal.h"

#include "core/device.h"
#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/event.h"
#include "core/profile.h"
#include "core/extradata.h"
#include "core/sample.h"
#include "core/statistics.h"
#include "core/taxonomy.h"
#include "core/errorhelper.h"
#include "core/file.h"
#include "core/git-access.h"
#include "core/pref.h"
#include "core/qthelper.h"
#include "core/trip.h"
#include "core/compat/platform_https.h"

#include <git2.h>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <filesystem>
#include <vector>

// core/compat/qthelper_compat.cpp: where the XSLT stylesheets are read from.
namespace opendives_compat {
extern std::string xslt_dir;
}

namespace opendives {

static void append_json_string(std::string &out, const std::string &s)
{
	out += '"';
	for (unsigned char c: s) {
		switch (c) {
		case '"': out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n"; break;
		case '\r': out += "\\r"; break;
		case '\t': out += "\\t"; break;
		default:
			if (c < 0x20) {
				char buf[8];
				snprintf(buf, sizeof(buf), "\\u%04x", c);
				out += buf;
			} else {
				out += static_cast<char>(c);
			}
		}
	}
	out += '"';
}

// The core keeps the dive's local time in a timestamp_t, without a time zone.
static std::string iso_date(timestamp_t when)
{
	time_t t = static_cast<time_t>(when);
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tm);
	return buf;
}

static std::string repo_path(const std::string &repo)
{
	return repo.substr(0, repo.find('['));
}

// Address of the cloud log currently in `divelog`; empty for any other log.
static std::string loaded_cloud_url;

// Address of the log in memory; see internal::current_log().
static std::string current_log_path;

static int load(const std::string &path, std::string &error)
{
	// Set by the core's git loader; cleared here for files and failed loads.
	loaded_git_commit.clear();
	current_log_path.clear();
	divelog.clear();
	// The dive computers' fingerprints are global in the core, not in
	// divelog: those of the log read before must not be saved into this one.
	// The loader fills the table again from the log.
	fingerprints.clear();
	int ret = parse_file(path.c_str(), &divelog);
	if (ret) {
		error = "Cannot read " + path + " (" + std::to_string(ret) + ")";
		internal::on_log_loaded();
		return -1;
	}
	current_log_path = path;
	internal::on_log_loaded();
	return 0;
}

// Port of QMLManager::consumeFinishedLoad() (mobile-widgets/qmlmanager.cpp),
// without the UI part.
void apply_log_prefs()
{
	/* Only apply unit system when the loaded file contained a "units" line.
	 * Without this guard, git_prefs.unit_system defaults to METRIC and would
	 * clobber the correct preference already loaded from the settings. */
	if (git_prefs_units_set) {
		prefs.unit_system = git_prefs.unit_system;
		if (git_prefs.unit_system == IMPERIAL)
			git_prefs.units = IMPERIAL_units;
		else if (git_prefs.unit_system == METRIC)
			git_prefs.units = SI_units;
		prefs.units = git_prefs.units;
	}
	prefs.tankbar = git_prefs.tankbar;
	prefs.show_ccr_setpoint = git_prefs.show_ccr_setpoint;
	prefs.show_ccr_sensors = git_prefs.show_ccr_sensors;
	prefs.pp_graphs.po2 = git_prefs.pp_graphs.po2;
}

int init()
{
	int ret = git_libgit2_init();
	return ret < 0 ? ret : 0;
}

bool log_exists(const std::string &repo)
{
	git_repository *r = nullptr;
	if (git_repository_open(&r, repo_path(repo).c_str()))
		return false;
	git_repository_free(r);
	return true;
}

// Read apart (its own divelog): the log loaded in memory is not touched.
// Reading a git log sets the loaded commit (set_git_id()), which the next
// save checks against its destination: it is put back.
int count_dives(const std::string &log, std::string &error)
{
	struct divelog other;
	std::string loaded = loaded_git_commit;
	int ret = parse_file(log.c_str(), &other);
	loaded_git_commit = loaded;
	if (ret) {
		error = "IMPORT_FAILED";
		return -1;
	}
	return static_cast<int>(other.dives.size());
}

int import_file(const std::string &source, const std::string &repo, std::string &error)
{
	if (load(source, error))
		return -1;
	if (!log_exists(repo) && git_create_local_repo(repo)) {
		error = "Cannot create repository " + repo;
		return -1;
	}
	int ret = save_dives(repo.c_str(), true);
	if (ret) {
		error = "Cannot save to " + repo + " (" + std::to_string(ret) + ")";
		return -1;
	}
	return static_cast<int>(divelog.dives.size());
}

template <typename T>
static void append_json_array(std::string &out, const std::vector<T> &values)
{
	out += '[';
	for (size_t i = 0; i < values.size(); i++) {
		if (i)
			out += ',';
		out += std::to_string(values[i]);
	}
	out += ']';
}

// Thumbnail: about `points` pairs (time s, depth mm) taken from the samples
// of the first dive computer. In each time slice, the deepest sample is kept,
// to preserve the shape of the profile.
static std::vector<int> profile_summary(const struct dive &d, size_t points = 40)
{
	std::vector<int> out;
	if (d.dcs.empty() || d.dcs[0].samples.empty())
		return out;
	const auto &samples = d.dcs[0].samples;
	int end = samples.back().time.seconds;
	if (end <= 0)
		return out;
	out.push_back(0);
	out.push_back(0);
	size_t i = 0;
	for (size_t b = 1; b <= points; b++) {
		int limit = static_cast<int>((int64_t)end * b / points);
		const struct sample *best = nullptr;
		for (; i < samples.size() && samples[i].time.seconds <= limit; i++) {
			if (!best || samples[i].depth.mm > best->depth.mm)
				best = &samples[i];
		}
		if (best && best->time.seconds > out[out.size() - 2]) {
			out.push_back(best->time.seconds);
			out.push_back(best->depth.mm);
		}
	}
	if (out[out.size() - 2] != end) {
		out.push_back(end);
		out.push_back(samples.back().depth.mm);
	}
	return out;
}

std::string internal::profile_json(const struct dive &d)
{
	std::string json;
	append_json_array(json, profile_summary(d));
	return json;
}

static std::string site_name(const struct dive &d)
{
	return d.dive_site ? d.dive_site->name : std::string();
}

static void append_trip(std::string &json, const struct dive &d)
{
	json += ",\"trip\":";
	if (!d.divetrip) {
		json += "null";
		return;
	}
	json += "{\"id\":" + std::to_string(d.divetrip->id) + ",\"location\":";
	append_json_string(json, d.divetrip->location);
	json += ",\"autogen\":";
	json += d.divetrip->autogen ? "true" : "false";
	json += '}';
}

// The levels of a plan: the holds at one depth up to the last entered time.
// Subsurface saves that time, not which samples were entered.
static std::string plan_levels_json(const struct dive &d)
{
	const struct divecomputer &dc = d.dcs[0];
	std::string json = "[";
	bool first = true;
	int depth = 0, held = 0;
	auto flush = [&] {
		if (held > 0) {
			if (!first)
				json += ',';
			first = false;
			json += "{\"depthMm\":" + std::to_string(depth) + ",\"durationSeconds\":" + std::to_string(held) + '}';
		}
		held = 0;
	};
	const sample *previous = nullptr;
	for (const sample &s: dc.samples) {
		if (dc.last_manual_time.seconds && s.time.seconds > dc.last_manual_time.seconds)
			break;
		if (previous && s.depth.mm > 0 && s.depth.mm == previous->depth.mm) {
			if (s.depth.mm != depth)
				flush();
			depth = s.depth.mm;
			held += s.time.seconds - previous->time.seconds;
		} else {
			flush();
		}
		previous = &s;
	}
	flush();
	return json + ']';
}

int list_plans(std::string &json)
{
	json = "[";
	bool first = true;
	for (auto it = divelog.dives.rbegin(); it != divelog.dives.rend(); ++it) {
		const struct dive &d = **it;
		if (!internal::is_plan_only(d))
			continue;
		if (!first)
			json += ',';
		first = false;
		json += "{\"id\":" + std::to_string(d.id) + ",\"date\":";
		append_json_string(json, iso_date(d.when));
		json += ",\"when\":" + std::to_string(d.when) + ",\"site\":";
		append_json_string(json, site_name(d));
		json += ",\"maxDepthMm\":" + std::to_string(d.maxdepth.mm);
		json += ",\"durationSeconds\":" + std::to_string(d.duration.seconds);
		json += ",\"salinity\":" + std::to_string(d.salinity);
		json += ",\"surfacePressureMbar\":" + std::to_string(d.surface_pressure.mbar);
		json += ",\"profile\":";
		append_json_array(json, profile_summary(d));
		json += ",\"levels\":" + plan_levels_json(d);
		json += ",\"gases\":[";
		for (size_t i = 0; i < d.cylinders.size(); i++) {
			if (i)
				json += ',';
			json += "{\"o2Permille\":" + std::to_string(get_o2(d.cylinders[i].gasmix)) +
				",\"hePermille\":" + std::to_string(get_he(d.cylinders[i].gasmix)) + '}';
		}
		json += "],\"request\":";
		std::string request;
		for (const extra_data &e: d.dcs[0].extra_data)
			if (e.key == "OpenDives plan")
				request = e.value;
		std::replace(request.begin(), request.end(), '\'', '"');
		append_json_string(json, request);
		json += ",\"title\":";
		std::string title;
		for (const extra_data &e: d.dcs[0].extra_data)
			if (e.key == "OpenDives title")
				title = e.value;
		append_json_string(json, title);
		json += '}';
	}
	json += ']';
	return 0;
}

static std::string dives_json()
{
	std::string json = "[";
	bool first = true;
	for (const auto &d: divelog.dives) {
		// Invalid dives are hidden unless "Show invalid dives" (DiveFilter::showDive).
		if (d->invalid && !prefs.display_invalid_dives)
			continue;
		// Plans are listed by the planner only (list_plans).
		if (internal::is_plan_only(*d))
			continue;
		if (!first)
			json += ',';
		first = false;
		json += "{\"id\":" + std::to_string(d->id);
		json += ",\"number\":" + std::to_string(d->number);
		json += ",\"date\":";
		append_json_string(json, iso_date(d->when));
		json += ",\"site\":";
		append_json_string(json, site_name(*d));
		json += ",\"maxDepthMm\":" + std::to_string(d->maxdepth.mm);
		json += ",\"durationSeconds\":" + std::to_string(d->duration.seconds);
		json += ",\"profile\":";
		append_json_array(json, profile_summary(*d));
		append_trip(json, *d);
		json += '}';
	}
	json += ']';
	return json;
}

static void append_names(std::string &json, const std::string &list)
{
	// Subsurface separates buddies and guides with commas.
	json += '[';
	bool first = true;
	size_t start = 0;
	while (start <= list.size()) {
		size_t comma = list.find(',', start);
		std::string name = list.substr(start, comma == std::string::npos ? std::string::npos : comma - start);
		size_t a = name.find_first_not_of(" \t"), b = name.find_last_not_of(" \t");
		if (a != std::string::npos) {
			if (!first)
				json += ',';
			first = false;
			append_json_string(json, name.substr(a, b - a + 1));
		}
		if (comma == std::string::npos)
			break;
		start = comma + 1;
	}
	json += ']';
}

int get_dive(int id, std::string &json, std::string &error)
{
	// Not const: the core's get_gas_used() takes a mutable dive (it does not change it).
	struct dive *d = divelog.dives.get_by_uniq_id(id);
	if (!d) {
		error = "Dive not found";
		return -1;
	}
	const struct divecomputer *dc = d->get_dc(0);

	json = "{\"id\":" + std::to_string(d->id);
	json += ",\"number\":" + std::to_string(d->number);
	json += ",\"date\":";
	append_json_string(json, iso_date(d->when));
	json += ",\"site\":";
	append_json_string(json, site_name(*d));
	json += ",\"siteCoordinates\":";
	if (d->dive_site && has_location(&d->dive_site->location))
		json += "{\"latUdeg\":" + std::to_string(d->dive_site->location.lat.udeg) +
			",\"lonUdeg\":" + std::to_string(d->dive_site->location.lon.udeg) + '}';
	else
		json += "null";
	// Location of the site from its taxonomy (GeoNames), as stored; empty when unknown.
	json += ",\"siteLocation\":{\"city\":";
	std::string city;
	if (d->dive_site) {
		city = taxonomy_get_value(d->dive_site->taxonomy, TC_LOCALNAME);
		if (city.empty())
			city = taxonomy_get_value(d->dive_site->taxonomy, TC_ADMIN_L3);
	}
	append_json_string(json, city);
	json += ",\"region\":";
	append_json_string(json, d->dive_site ? taxonomy_get_value(d->dive_site->taxonomy, TC_ADMIN_L1) : std::string());
	json += ",\"country\":";
	append_json_string(json, d->dive_site ? taxonomy_get_country(d->dive_site->taxonomy) : std::string());
	json += '}';
	json += ",\"maxDepthMm\":" + std::to_string(d->maxdepth.mm);
	json += ",\"meanDepthMm\":" + std::to_string(d->meandepth.mm);
	json += ",\"durationSeconds\":" + std::to_string(d->duration.seconds);
	json += ",\"waterTempMk\":" + std::to_string(d->watertemp.mkelvin);
	json += ",\"airTempMk\":" + std::to_string(d->airtemp.mkelvin);
	json += ",\"sacMlMin\":" + std::to_string(d->sac);
	json += ",\"cns\":" + std::to_string(d->maxcns);
	json += ",\"otu\":" + std::to_string(d->otu);
	json += ",\"rating\":" + std::to_string(d->rating);
	json += ",\"visibility\":" + std::to_string(d->visibility);
	// The other conditions, 0 to 5 stars as in Subsurface (0: not filled in).
	json += ",\"conditions\":{\"wavesize\":" + std::to_string(d->wavesize);
	json += ",\"current\":" + std::to_string(d->current);
	json += ",\"surge\":" + std::to_string(d->surge);
	json += ",\"chill\":" + std::to_string(d->chill) + '}';
	// The dive's salinity as the core works it out (the diver's choice, else the computer's);
	// the water type is named from it in JavaScript (waterTypeOf, plugins/opendives-core/core-api.js).
	json += ",\"salinity\":" + std::to_string(d->get_salinity());
	// Surface pressure as stored, as dive::get_surface_pressure() picks it,
	// but 0 instead of its default of one atmosphere when nothing is stored.
	{
		int mbar = d->dcs.empty() || is_dc_manually_added_dive(&d->dcs[0]) ? d->surface_pressure.mbar
									      : d->dcs[0].surface_pressure.mbar;
		if (!mbar)
			mbar = d->surface_pressure.mbar;
		json += ",\"surfacePressureMbar\":" + std::to_string(mbar > 0 ? mbar : 0);
	}
	// For the editor: the water type chosen by the diver (EditWaterTypeUser,
	// 0: none), the "invalid" mark, and whether the dive was entered by hand
	// (duration and depth editable, as TabDiveNotes).
	json += ",\"userSalinity\":" + std::to_string(d->user_salinity);
	json += ",\"invalid\":";
	json += d->invalid ? "true" : "false";
	json += ",\"manual\":";
	json += !d->dcs.empty() && is_dc_manually_added_dive(&d->dcs[0]) ? "true" : "false";
	json += ",\"pictures\":" + std::to_string(d->pictures.size());
	json += ",\"diveComputers\":[";
	for (size_t i = 0; i < d->dcs.size(); i++) {
		if (i)
			json += ',';
		json += "{\"model\":";
		append_json_string(json, d->dcs[i].model);
		json += ",\"nickname\":";
		append_json_string(json, get_dc_nickname(&d->dcs[i]));
		json += ",\"divemode\":";
		append_json_string(json, divemode_text[d->dcs[i].divemode]);
		json += '}';
	}
	json += ']';
	json += ",\"divemode\":";
	append_json_string(json, dc ? divemode_text[dc->divemode] : "OC");
	json += ",\"computer\":";
	append_json_string(json, dc ? dc->model : std::string());
	json += ",\"computers\":" + std::to_string(d->dcs.size());
	json += ",\"buddies\":";
	append_names(json, d->buddy);
	json += ",\"guides\":";
	append_names(json, d->diveguide);
	json += ",\"suit\":";
	append_json_string(json, d->suit);
	json += ",\"tags\":[";
	for (size_t i = 0; i < d->tags.size(); i++) {
		if (i)
			json += ',';
		append_json_string(json, d->tags[i]->name);
	}
	json += "],\"notes\":";
	append_json_string(json, d->notes);
	append_trip(json, *d);

	json += ",\"weights\":[";
	for (size_t i = 0; i < d->weightsystems.size(); i++) {
		const weightsystem_t &w = d->weightsystems[i];
		if (i)
			json += ',';
		json += "{\"grams\":" + std::to_string(w.weight.grams) + ",\"description\":";
		append_json_string(json, w.description);
		json += '}';
	}
	json += ']';

	// Gas used per cylinder, computed by the core from the start and end
	// pressures with gas compressibility (statistics.cpp).
	std::vector<volume_t> gas_used = get_gas_used(d);
	json += ",\"cylinders\":[";
	for (size_t i = 0; i < d->cylinders.size(); i++) {
		const cylinder_t &c = d->cylinders[i];
		if (i)
			json += ',';
		json += "{\"description\":";
		append_json_string(json, c.type.description);
		json += ",\"sizeMl\":" + std::to_string(c.type.size.mliter);
		json += ",\"workingPressureMbar\":" + std::to_string(c.type.workingpressure.mbar);
		json += ",\"startMbar\":" + std::to_string(c.start.mbar ? c.start.mbar : c.sample_start.mbar);
		json += ",\"endMbar\":" + std::to_string(c.end.mbar ? c.end.mbar : c.sample_end.mbar);
		json += ",\"o2Permille\":" + std::to_string(c.gasmix.o2.permille);
		json += ",\"hePermille\":" + std::to_string(c.gasmix.he.permille);
		json += ",\"gas\":";
		append_json_string(json, c.gasmix.name());
		json += ",\"use\":";
		append_json_string(json, cylinderuse_text[c.cylinder_use]);
		json += ",\"used\":";
		json += d->is_cylinder_used(static_cast<int>(i)) ? "true" : "false";
		json += ",\"gasUsedMl\":" + std::to_string(i < gas_used.size() ? gas_used[i].mliter : 0);
		// Depth of the first switch to this cylinder during the dive, from the
		// core's get_depth_at_time(); 0 when there is none after the start.
		int switch_mm = 0;
		if (dc) {
			for (const auto &ev: dc->events) {
				if (ev.is_gaschange() && ev.time.seconds > 0 && d->get_cylinder_index(ev, *dc) == static_cast<int>(i)) {
					switch_mm = get_depth_at_time(dc, ev.time.seconds);
					break;
				}
			}
		}
		json += ",\"switchDepthMm\":" + std::to_string(switch_mm);
		// The gas switch depth as stored (cylinder_t::depth), and whether the
		// profile uses the cylinder (cannot be removed, as RemoveCylinder).
		json += ",\"depthMm\":" + std::to_string(c.depth.mm);
		json += ",\"protected\":";
		json += d->is_cylinder_prot(static_cast<int>(i)) ? "true" : "false";
		json += '}';
	}
	json += ']';

	json += ",\"events\":[";
	bool first = true;
	if (dc) {
		for (const auto &ev: dc->events) {
			if (!ev.is_gaschange())
				continue;
			if (!first)
				json += ',';
			first = false;
			int cyl = d->get_cylinder_index(ev, *dc);
			json += "{\"type\":\"gaschange\",\"timeSeconds\":" + std::to_string(ev.time.seconds);
			json += ",\"cylinder\":" + std::to_string(cyl);
			json += '}';
		}
	}
	json += ']';

	// Profile computed by the core (profile.cpp), as Subsurface draws it.
	std::vector<int> t, depth, ceiling, ppo2, cylinder, temperature;
	bool has_ceiling = false, has_temperature = false;
	// Tissue loading, 16 compartments per entry, flattened (see "tissues" below).
	std::vector<int> tissues;
	if (dc) {
		// A plan is not a dive done: it does not load the tissues of this one.
		internal::HiddenPlans hidden_plans;
		struct plot_info pi = create_plot_info_new(d, dc, nullptr);
		for (const auto &e: pi.entry) {
			t.push_back(e.sec);
			depth.push_back(e.depth.mm);
			ceiling.push_back(e.ceiling.mm);
			ppo2.push_back(static_cast<int>(e.pressures.o2 * 1000.0 + 0.5));
			cylinder.push_back(e.ruler_cylinder);
			// Water temperature as the profile carries it (populate_plot_entries
			// fills the gaps with the last value), in mK; 0 when unknown.
			temperature.push_back(e.temperature);
			for (int p: e.percentages)
				tissues.push_back(p);
			has_ceiling = has_ceiling || e.ceiling.mm > 0;
			has_temperature = has_temperature || e.temperature > 0;
		}
	}
	json += ",\"samples\":{\"timeSeconds\":";
	append_json_array(json, t);
	json += ",\"depthMm\":";
	append_json_array(json, depth);
	json += ",\"cylinder\":";
	append_json_array(json, cylinder);
	json += ",\"ceilingMm\":";
	if (has_ceiling)
		append_json_array(json, ceiling);
	else
		json += "null";
	json += ",\"ppo2Mbar\":";
	append_json_array(json, ppo2);
	json += ",\"temperatureMk\":";
	if (has_temperature)
		append_json_array(json, temperature);
	else
		json += "null";
	// Per-compartment loading in percent (profile.cpp: 50 at ambient pressure,
	// 100 at the M-value limit with the gradient factors), as one flat array,
	// 16 values per sample, in the order of the other arrays: the value of
	// compartment c at sample i is tissues[16 * i + c]. One flat array keeps
	// the JSON small (about 3 bytes per value, so ~35 KB for 2 hours at 10 s).
	json += ",\"tissues\":";
	if (tissues.empty())
		json += "null";
	else
		append_json_array(json, tissues);
	json += "}}";
	return 0;
}

int list_dives(const std::string &log, std::string &json, std::string &error)
{
	loaded_cloud_url.clear();
	if (load(log, error))
		return -1;
	apply_log_prefs();
	divelog.process_loaded_dives();
	json = dives_json();
	return 0;
}

int set_ca_file(const std::string &path)
{
	opendives_https_set_ca_file(path);
	return git_libgit2_opts(GIT_OPT_SET_SSL_CERT_LOCATIONS, path.c_str(), nullptr) < 0 ? -1 : 0;
}

// Own git repository (git_configure): the log address, without credentials,
// and the host it is on.
static bool git_mode_on = false;
static bool git_any_scheme = false;
static std::string git_host;

static std::string cloud_host()
{
	if (git_mode_on)
		return git_host;
	size_t host_start = prefs.cloud_base_url.find("://");
	host_start = host_start == std::string::npos ? 0 : host_start + 3;
	std::string host = prefs.cloud_base_url.substr(host_start);
	if (!host.empty() && host.back() == '/')
		host.pop_back();
	return host;
}

// The object returned by the cloud functions; `dives` false for "unchanged".
static std::string cloud_json(const std::string &head, bool synced, const std::string &offline_reason, bool dives)
{
	std::string json = "{\"server\":";
	append_json_string(json, cloud_host());
	json += ",\"head\":";
	append_json_string(json, head);
	json += ",\"synced\":";
	json += synced ? "true" : "false";
	json += ",\"offlineReason\":";
	append_json_string(json, offline_reason);
	json += ",\"unchanged\":";
	json += dives ? "false" : "true";
	if (dives)
		json += ",\"dives\":" + dives_json();
	json += '}';
	return json;
}

// Durations of the last cloud_branch_status() steps, in ms, for cloud_probe.
static long probe_connect_ms = 0, probe_list_ms = 0;

// Log address set by the last successful cloud_configure().
static std::string configured_url;

int cloud_list_cached_dives(std::string &json, std::string &error)
{
	json.clear();
	if (configured_url.empty()) {
		error = "Cloud account not configured";
		return -1;
	}
	const std::string url = configured_url;
	struct git_info info;
	if (!is_git_repository(url.c_str(), &info) || !log_exists(info.localdir))
		return 1;
	bool was_local_only = git_local_only;
	git_local_only = true;
	int ret = load(url, error);
	git_local_only = was_local_only;
	if (ret) {
		loaded_cloud_url.clear();
		return -1;
	}
	loaded_cloud_url = url;
	apply_log_prefs();
	divelog.process_loaded_dives();
	json = cloud_json(loaded_git_commit, false, std::string(), true);
	return 0;
}

int cloud_list_dives(const std::string &email, const std::string &password, std::string &json, std::string &error)
{
	std::string url, head;
	bool exists = false;
	if (git_mode_on) {
		// Own git repository: configured by git_configure(), nothing to set.
		url = configured_url;
		if (url.empty()) {
			error = "Repository not configured";
			return -1;
		}
	} else if (cloud_configure(email, password, url)) {
		error = "Incomplete cloud credentials";
		return -1;
	}
	bool offline = false;
	std::string probe_error;
	if (cloud_branch_status(url, exists, head, probe_error)) {
		// Server unreachable: read the local copy, if there is one, without
		// syncing (like Subsurface when offline).
		struct git_info info;
		if (!is_git_repository(url.c_str(), &info) || !log_exists(info.localdir)) {
			error = probe_error;
			return -1;
		}
		offline = true;
	} else if (!exists) {
		// The core would create the branch by pushing an empty commit: stop here.
		error = "No dive log on the server for this account";
		return -1;
	} else if (loaded_cloud_url == url && !loaded_git_commit.empty() && loaded_git_commit == head) {
		// What is loaded is the server's head: nothing to fetch or read again.
		json = cloud_json(head, true, std::string(), false);
		return 0;
	}
	bool was_local_only = git_local_only;
	if (offline)
		git_local_only = true;
	int ret = load(url, error);
	git_local_only = was_local_only;
	if (ret) {
		loaded_cloud_url.clear();
		return -1;
	}
	loaded_cloud_url = url;
	apply_log_prefs();
	divelog.process_loaded_dives();
	json = cloud_json(head, !offline && git_remote_sync_successful, offline ? probe_error : std::string(), true);
	return 0;
}

int cloud_configure(const std::string &email, const std::string &password, std::string &url)
{
	git_mode_on = false;
	prefs.cloud_storage_email = email;
	prefs.cloud_storage_password = password;
	configured_url.clear();
	auto cloud_url = getCloudURL();
	if (!cloud_url)
		return -1;
	url = configured_url = *cloud_url;
	return 0;
}

int cloud_sign_out(bool delete_copy, std::string &error)
{
	const std::string url = configured_url;
	if (delete_copy && !url.empty()) {
		struct git_info info;
		if (is_git_repository(url.c_str(), &info) && log_exists(info.localdir)) {
			// Never delete a copy that holds changes the server does not have.
			if (internal::pending_for(url) > 0) {
				error = "PENDING_CHANGES";
				return -1;
			}
			std::error_code ec;
			std::filesystem::remove_all(info.localdir, ec);
			if (ec) {
				error = "DELETE_FAILED: " + ec.message();
				return -1;
			}
		}
	}
	// Close the log and forget the account.
	divelog.clear();
	fingerprints.clear();
	loaded_git_commit.clear();
	current_log_path.clear();
	loaded_cloud_url.clear();
	configured_url.clear();
	git_mode_on = false;
	git_host.clear();
	internal::on_log_loaded();
	prefs.cloud_storage_email.clear();
	prefs.cloud_storage_email_encoded.clear();
	prefs.cloud_storage_password.clear();
	return 0;
}

// Port of CloudStorageAuthenticate::deleteAccount() (core/cloudstorage.cpp):
// POST "email password" as text/plain to cloud_base_url + "/delete-account",
// the same URL as Subsurface (the base ends with "/", hence "//").
// Unlike Subsurface, the reply is read. The server's replies are not
// documented: the account counts as deleted only on HTTP 200 with a reply
// that says so; to be checked on the test account and adjusted.
static bool reply_confirms_deletion(int status, const std::string &reply)
{
	if (status != 200)
		return false;
	std::string text = reply;
	for (char &c: text)
		c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
	return text.find("delet") != std::string::npos && text.find("error") == std::string::npos &&
	       text.find("fail") == std::string::npos && text.find("not ") == std::string::npos;
}

int cloud_delete_account(const std::string &password, const std::string &keep_dives_in, std::string &json,
			 std::string &error)
{
	const std::string url = configured_url;
	if (url.empty() || prefs.cloud_storage_email.empty()) {
		error = "NO_ACCOUNT";
		return -1;
	}
	// The password typed again must be the account's: no request otherwise.
	if (password != prefs.cloud_storage_password) {
		error = "WRONG_PASSWORD";
		return -1;
	}
	// Unsent changes are synced first by the app; never delete with some left.
	if (internal::pending_for(url) > 0) {
		error = "PENDING_CHANGES";
		return -1;
	}
	// Keep the dives first, in a new log without account, before anything is deleted.
	if (!keep_dives_in.empty()) {
		std::string repo = keep_dives_in.substr(0, keep_dives_in.find('['));
		if (log_exists(repo)) {
			error = "KEEP_TARGET_EXISTS";
			return -1;
		}
		if (git_create_local_repo(keep_dives_in) || save_as(keep_dives_in, error)) {
			error = "KEEP_FAILED: " + error;
			return -1;
		}
	}

	int status = 0;
	std::string reply;
	std::string payload = prefs.cloud_storage_email + " " + password;
	if (opendives_https_post(prefs.cloud_base_url + "/delete-account", subsurface_user_agent(), "text/xml, text/plain",
				 "text/plain", payload, 20, status, reply)) {
		error = "NETWORK";
		return -1;
	}
	bool deleted = reply_confirms_deletion(status, reply);
	json = "{\"deleted\":";
	json += deleted ? "true" : "false";
	json += ",\"status\":" + std::to_string(status) + ",\"reply\":";
	append_json_string(json, reply);
	json += '}';
	if (deleted) {
		// The account is gone: its local copy has no use any more.
		struct git_info info;
		if (is_git_repository(url.c_str(), &info)) {
			std::error_code ec;
			std::filesystem::remove_all(info.localdir, ec);
		}
		std::string ignored;
		cloud_sign_out(false, ignored);
	}
	return 0;
}

int cloud_probe(std::string &json, std::string &error)
{
	const std::string url = configured_url;
	if (url.empty()) {
		error = "Cloud account not configured";
		return -1;
	}
	bool exists = false;
	std::string head;
	if (cloud_branch_status(url, exists, head, error))
		return -1;
	json = "{\"exists\":";
	json += exists ? "true" : "false";
	json += ",\"head\":";
	append_json_string(json, head);
	json += ",\"connectMs\":" + std::to_string(probe_connect_ms);
	json += ",\"listMs\":" + std::to_string(probe_list_ms);
	json += '}';
	return 0;
}

int cloud_create_log(const std::string &import_path, std::string &json, std::string &error)
{
	const std::string url = configured_url;
	if (url.empty() || prefs.cloud_storage_email.empty()) {
		error = "NO_ACCOUNT";
		return -1;
	}
	if (!internal::cloud_writes_allowed_for(prefs.cloud_storage_email)) {
		error = "WRITE_LOCKED";
		return -1;
	}
	struct git_info info;
	if (!is_git_repository(url.c_str(), &info)) {
		error = "Invalid dive log address";
		return -1;
	}
	std::error_code ec;
	if (std::filesystem::exists(info.localdir, ec)) {
		error = "LOCAL_COPY_EXISTS";
		return -1;
	}
	// Never create the branch unless the server says, now, that it is missing.
	bool exists = false;
	std::string head, probe_error;
	if (cloud_branch_status(url, exists, head, probe_error)) {
		error = "NETWORK: " + probe_error;
		return -1;
	}
	if (exists) {
		error = "LOG_EXISTS";
		return -1;
	}
	// The file is read before anything is written.
	struct divelog imported;
	if (!import_path.empty() && parse_file(import_path.c_str(), &imported)) {
		error = "IMPORT_FAILED";
		return -1;
	}
	const size_t count = imported.dives.size();

	// No local cache: the core clones, finds no branch and creates it with an
	// empty commit pushed to the server (create_and_push_remote).
	bool was_local_only = git_local_only;
	git_local_only = false;
	int ret = load(url, error);
	git_local_only = was_local_only;
	if (ret) {
		loaded_cloud_url.clear();
		error = "CREATE_FAILED: " + error;
		return -1;
	}
	loaded_cloud_url = url;
	apply_log_prefs();
	divelog.process_loaded_dives();
	bool synced = git_remote_sync_successful;
	if (count > 0) {
		// As QMLManager::importCacheRepo(): add the dives read, then save and sync.
		divelog.add_imported_dives(imported, import_flags::merge_all_trips);
		divelog.process_loaded_dives();
		if (save_as(url, error)) {
			error = "SAVE_FAILED: " + error;
			return -1;
		}
		std::string status;
		if (sync(status, error)) {
			// Saved on this device: the next sync sends it.
			synced = false;
			error.clear();
		} else {
			synced = status.find("\"stopped\"") == std::string::npos && status.find("\"offline\"") == std::string::npos;
		}
	}
	json = cloud_json(loaded_git_commit, synced, std::string(), true);
	json.pop_back();
	json += ",\"imported\":" + std::to_string(count) + '}';
	return 0;
}

// A single attempt: a wrong password must not be retried.
static int probe_credentials(git_credential **out, const char *, const char *, unsigned int, void *payload)
{
	int *attempts = static_cast<int *>(payload);
	if ((*attempts)++ > 0)
		return GIT_EUSER;
	return git_credential_userpass_plaintext_new(out, prefs.cloud_storage_email_encoded.c_str(),
						     prefs.cloud_storage_password.c_str());
}

static long ms_since(const std::chrono::steady_clock::time_point &start)
{
	return static_cast<long>(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count());
}

int cloud_branch_status(const std::string &url, bool &exists, std::string &head, std::string &error)
{
	exists = false;
	head.clear();
	size_t open = url.rfind('[');
	if (open == std::string::npos || url.back() != ']') {
		error = "Invalid dive log address";
		return -1;
	}
	std::string remote_url = url.substr(0, open);
	std::string branch_ref = "refs/heads/" + url.substr(open + 1, url.size() - open - 2);

	git_remote *remote = nullptr;
	if (git_remote_create_detached(&remote, remote_url.c_str())) {
		error = git_error_last() ? git_error_last()->message : "git_remote_create_detached";
		return -1;
	}
	int attempts = 0;
	git_remote_callbacks callbacks = GIT_REMOTE_CALLBACKS_INIT;
	callbacks.credentials = probe_credentials;
	callbacks.payload = &attempts;
	// No certificate_check: libgit2 applies its normal validation.
	auto start = std::chrono::steady_clock::now();
	int ret = git_remote_connect(remote, GIT_DIRECTION_FETCH, &callbacks, nullptr, nullptr);
	probe_connect_ms = ms_since(start);
	probe_list_ms = 0;
	if (ret == 0) {
		const git_remote_head **heads = nullptr;
		size_t count = 0;
		start = std::chrono::steady_clock::now();
		ret = git_remote_ls(&heads, &count, remote);
		probe_list_ms = ms_since(start);
		for (size_t i = 0; ret == 0 && i < count; i++) {
			if (branch_ref == heads[i]->name) {
				char sha[41];
				git_oid_tostr(sha, sizeof(sha), &heads[i]->oid);
				head = sha;
				exists = true;
			}
		}
		git_remote_disconnect(remote);
	}
	if (ret) {
		// "AUTH" tells the app the server answered and refused (spec, "Sync failures").
		const char *message = git_error_last() ? git_error_last()->message : "";
		if (attempts > 1 || strstr(message, "401") || strstr(message, "403") || strstr(message, "authentication"))
			error = "AUTH: Credentials rejected by the server";
		else
			error = *message ? message : "Cannot connect";
	}
	git_remote_free(remote);
	return ret ? -1 : 0;
}

// --- Own git repository instead of the cloud --------------------------------

bool git_mode()
{
	return git_mode_on;
}

void set_git_any_scheme_for_tests(bool allowed)
{
	git_any_scheme = allowed;
}

// "https://host/path" (a trailing slash is dropped) and its host. Nothing that
// could carry credentials or confuse Subsurface's "url[branch]" syntax.
static bool normalise_git_url(const std::string &in, std::string &out, std::string &host)
{
	size_t first = in.find_first_not_of(" \t\r\n");
	size_t last = in.find_last_not_of(" \t\r\n");
	if (first == std::string::npos)
		return false;
	std::string url = in.substr(first, last - first + 1);
	size_t scheme_len = 0;
	if (url.compare(0, 8, "https://") == 0) {
		scheme_len = 8;
	} else if (git_any_scheme) {
		size_t pos = url.find("://");
		if (pos == std::string::npos || pos == 0)
			return false;
		scheme_len = pos + 3;
	} else {
		return false;
	}
	for (unsigned char c: url) {
		if (c <= 0x20 || c == 0x7f || c == '@' || c == '[' || c == ']' || c == '?' || c == '#' || c == '\\')
			return false;
	}
	while (!url.empty() && url.back() == '/')
		url.pop_back();
	size_t slash = url.find('/', scheme_len);
	if (slash == std::string::npos || slash == scheme_len || slash + 1 >= url.size())
		return false;
	host = url.substr(scheme_len, slash - scheme_len);
	for (unsigned char c: host) {
		if (!isalnum(c) && c != '.' && c != '-' && c != ':')
			return false;
	}
	out = url;
	return true;
}

static bool valid_git_username(const std::string &name)
{
	if (name.empty() || name.size() > 100)
		return false;
	for (unsigned char c: name) {
		if (!isalnum(c) && c != '.' && c != '_' && c != '-')
			return false;
	}
	return true;
}

static bool valid_git_token(const std::string &token)
{
	if (token.empty() || token.size() > 1000)
		return false;
	for (unsigned char c: token) {
		if (c <= 0x20 || c >= 0x7f)
			return false;
	}
	return true;
}

static bool valid_git_branch(const std::string &branch)
{
	if (branch.empty() || branch.size() > 200 || branch[0] == '-' || branch[0] == '/' || branch.back() == '/' ||
	    branch.back() == '.' || branch.find("..") != std::string::npos || branch.find("//") != std::string::npos)
		return false;
	for (unsigned char c: branch) {
		if (c <= 0x20 || c == 0x7f || c == '[' || c == ']' || c == '~' || c == '^' || c == ':' || c == '?' ||
		    c == '*' || c == '\\')
			return false;
	}
	return true;
}

namespace {

// What libgit2's credential callback needs for one question to a server. The
// token only lives here for the time of the question.
struct CheckAuth {
	std::string user, token;
	int calls = 0;
};

// One attempt: a refused token must not be retried.
int check_credentials(git_credential **out, const char *, const char *, unsigned int allowed, void *payload)
{
	CheckAuth *auth = static_cast<CheckAuth *>(payload);
	if (auth->calls++ > 0 || auth->token.empty() || !(allowed & GIT_CREDENTIAL_USERPASS_PLAINTEXT))
		return GIT_EUSER;
	return git_credential_userpass_plaintext_new(out, auth->user.c_str(), auth->token.c_str());
}

struct CheckResult {
	std::string status; // see git_check()
	std::vector<std::string> branches;
	bool empty = false;
};

// The git_check() question. Anonymous: the fetch advertisement (`git
// ls-remote`). With a token: the push advertisement (receive-pack), which
// asks for credentials even on a public repository and refuses a token that
// may not write; nothing is sent.
void check_remote(const std::string &url, const std::string &username, const std::string &token, CheckResult &result)
{
	result = CheckResult();
	CheckAuth auth{ username, token };
	git_remote *remote = nullptr;
	if (git_remote_create_detached(&remote, url.c_str())) {
		result.status = "none";
		return;
	}
	git_remote_callbacks callbacks = GIT_REMOTE_CALLBACKS_INIT;
	callbacks.credentials = check_credentials;
	callbacks.payload = &auth;
	// No certificate_check: libgit2 applies its normal validation.
	int ret = git_remote_connect(remote, token.empty() ? GIT_DIRECTION_FETCH : GIT_DIRECTION_PUSH, &callbacks, nullptr,
				     nullptr);
	if (ret == 0) {
		const git_remote_head **heads = nullptr;
		size_t count = 0;
		ret = git_remote_ls(&heads, &count, remote);
		bool any_ref = false;
		for (size_t i = 0; ret == 0 && i < count; i++) {
			const std::string name = heads[i]->name;
			if (name.compare(0, 5, "refs/") != 0)
				continue;
			any_ref = true;
			if (name.compare(0, 11, "refs/heads/") == 0)
				result.branches.push_back(name.substr(11));
		}
		result.empty = ret == 0 && !any_ref;
		git_remote_disconnect(remote);
	}
	if (ret == 0) {
		result.status = token.empty() ? "public" : "ok";
	} else if (auth.calls > 0) {
		// The server asked for credentials (and refused them, with a token).
		result.status = token.empty() ? "auth" : "denied";
	} else {
		const char *message = git_error_last() ? git_error_last()->message : "";
		result.status = !token.empty() && (strstr(message, "401") || strstr(message, "403")) ? "denied" : "none";
	}
	git_remote_free(remote);
}

} // namespace

int git_check(const std::string &url, const std::string &username, const std::string &token, std::string &json,
	      std::string &error)
{
	std::string clean, host;
	if (!normalise_git_url(url, clean, host)) {
		error = "BAD_ADDRESS";
		return -1;
	}
	if (!token.empty() && (!valid_git_token(token) || !valid_git_username(username))) {
		error = "BAD_CREDENTIALS";
		return -1;
	}
	CheckResult result;
	check_remote(clean, username, token, result);
	json = "{\"status\":";
	append_json_string(json, result.status);
	json += ",\"empty\":";
	json += result.empty ? "true" : "false";
	json += ",\"branches\":[";
	for (size_t i = 0; i < result.branches.size(); i++) {
		if (i)
			json += ',';
		append_json_string(json, result.branches[i]);
	}
	json += "]}";
	return 0;
}

int git_configure(const std::string &url, const std::string &username, const std::string &token,
		  const std::string &branch, std::string &address, std::string &error)
{
	std::string clean, host;
	if (!normalise_git_url(url, clean, host)) {
		error = "BAD_ADDRESS";
		return -1;
	}
	if (!valid_git_username(username) || !valid_git_token(token)) {
		error = "BAD_CREDENTIALS";
		return -1;
	}
	if (!valid_git_branch(branch)) {
		error = "BAD_BRANCH";
		return -1;
	}
	// Another repository or another account: nothing of the previous one stays.
	prefs.cloud_storage_email.clear();
	prefs.cloud_storage_email_encoded = username;
	prefs.cloud_storage_password = token;
	git_mode_on = true;
	git_host = host;
	address = configured_url = clean + "[" + branch + "]";
	return 0;
}

int git_create_log(std::string &json, std::string &error)
{
	const std::string url = configured_url;
	if (!git_mode_on || url.empty()) {
		error = "NO_REPOSITORY";
		return -1;
	}
	struct git_info info;
	if (!is_git_repository(url.c_str(), &info)) {
		error = "BAD_ADDRESS";
		return -1;
	}
	std::error_code ec;
	if (std::filesystem::exists(info.localdir, ec)) {
		error = "LOCAL_COPY_EXISTS";
		return -1;
	}
	// Never create anything unless the server says, now, that it holds no
	// reference at all (a push of the first branch cannot overwrite anything).
	CheckResult state;
	check_remote(url.substr(0, url.rfind('[')), prefs.cloud_storage_email_encoded, prefs.cloud_storage_password, state);
	if (state.status != "ok") {
		error = state.status == "denied" ? "DENIED" : "NETWORK";
		return -1;
	}
	if (!state.empty) {
		const std::string branch = url.substr(url.rfind('[') + 1, url.size() - url.rfind('[') - 2);
		bool has_branch = false;
		for (const std::string &b: state.branches)
			has_branch = has_branch || b == branch;
		error = has_branch ? "LOG_EXISTS" : "NOT_EMPTY";
		return -1;
	}
	// No local copy: the core clones, finds no branch and creates it with an
	// empty commit pushed to the server (create_and_push_remote).
	bool was_local_only = git_local_only;
	git_local_only = false;
	int ret = load(url, error);
	git_local_only = was_local_only;
	bool created = false;
	std::string head, probe_error;
	if (!ret && cloud_branch_status(url, created, head, probe_error) == 0 && created) {
		loaded_cloud_url = url;
		apply_log_prefs();
		divelog.process_loaded_dives();
		json = cloud_json(loaded_git_commit, git_remote_sync_successful, std::string(), true);
		return 0;
	}
	// Nothing reached the server: the copy made here is of no use.
	loaded_cloud_url.clear();
	if (!ret) {
		divelog.clear();
		current_log_path.clear();
		internal::on_log_loaded();
	}
	std::filesystem::remove_all(info.localdir, ec);
	error = "CREATE_FAILED: " + (ret ? error : probe_error);
	return -1;
}

void set_xslt_dir(const std::string &dir)
{
	opendives_compat::xslt_dir = dir.empty() || dir.back() == '/' ? dir : dir + "/";
}

int export_dives(const std::vector<int> &ids, const std::string &format, bool anonymize, const std::string &path,
		 std::string &error)
{
	const char *stylesheet = format == "uddf" ? "uddf-export.xslt"
			       : format == "csv" ? "xml2summarycsv.xslt"
			       : format == "csvProfiles" ? "xml2detailscsv.xslt" : nullptr;
	if ((format != "ssrf" && !stylesheet) || path.empty() || ids.empty()) {
		error = "BAD_REQUEST";
		return -1;
	}
	for (int id: ids) {
		if (!divelog.dives.get_by_uniq_id(id)) {
			error = "NOT_FOUND";
			return -1;
		}
	}
	// The export dialog's "Selected dives": the listed dives are the core's
	// selection for the time of the export, then the selection is put back.
	std::vector<std::pair<dive *, bool>> saved;
	for (auto &d: divelog.dives) {
		saved.push_back({ d.get(), d->selected });
		d->selected = false;
	}
	for (int id: ids)
		divelog.dives.get_by_uniq_id(id)->selected = true;
	int ret = 0;
	if (!stylesheet) {
		if (save_dives_logic(path.c_str(), true, anonymize))
			ret = -1, error = "EXPORT_FAILED: ssrf";
	} else {
		// DiveLogExportDialog's units: 0 metric, 1 imperial.
		int units = prefs.units.length == units::FEET ? 1 : 0;
		auto [rc, message] = export_dives_xslt(path.c_str(), true, units, stylesheet, anonymize);
		if (rc)
			ret = -1, error = "EXPORT_FAILED: " + message;
	}
	for (auto &[d, selected]: saved)
		d->selected = selected;
	return ret;
}

namespace internal {

int load(const std::string &path, std::string &error)
{
	return opendives::load(path, error);
}

const std::string &current_log()
{
	return current_log_path;
}

bool current_log_is_cloud()
{
	return !current_log_path.empty() && current_log_path == loaded_cloud_url;
}

int dive_json(int id, std::string &json, std::string &error)
{
	return get_dive(id, json, error);
}

std::string dives_json()
{
	return opendives::dives_json();
}

} // namespace internal

} // namespace opendives
