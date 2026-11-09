// SPDX-License-Identifier: GPL-2.0
// Shared between the façade's source files; not part of its API.
#ifndef OPENDIVES_INTERNAL_H
#define OPENDIVES_INTERNAL_H

#include "opendives.h"

#include <cstdint>
#include <string>
#include <vector>

struct FilterData;
struct divelog;
struct dive;
struct dive_site;
struct fingerprint_record;
using fingerprint_table = std::vector<fingerprint_record>; // core/device.h

namespace opendives::internal {

// Download from a dive computer (edit.cpp): NO_LOG or FORMAT_NEWER when the
// log in memory cannot take changes.
int check_writable(std::string &error);
// The downloaded dives of `log` (consumed) added as one undoable step, as
// DiveImportedModel::recordDives() does (prefer_imported | is_downloaded);
// `fingerprints_before` is the core's fingerprint table before the download,
// swapped in by the step's undo. NO_NEW_DIVES when nothing is added: then
// `fingerprints_before` is left as it was.
int import_downloaded(struct divelog &log, const std::string &source, fingerprint_table &fingerprints_before,
		      std::string &result_json, std::string &error);

// The end of a download (download.cpp), apart for the tests: the computer as
// it identified itself; `failure` empty, CANCELLED, or "FAILED: …" or
// "NOT_FOUND: …". Success: the dives of `log` are added as one undoable step.
// Failure: the dives received, if any, are kept aside with the core's
// fingerprint table as the download left it (download_partial), and the
// table goes back to `fingerprints_before`.
struct DownloadedComputer {
	std::string devname, vendor, product;
	uint32_t serial = 0, firmware = 0;
};
int finish_download(struct divelog &log, const DownloadedComputer &computer, const std::string &failure,
		    fingerprint_table &fingerprints_before, std::string &json, std::string &error);
// Drops the dives kept aside after a failure (a new load, a new download).
void download_forget_partial();

// A dive that is only a plan: Subsurface's "planned dive" computer and no
// logged one. OpenDives lists these in the planner only (plan.cpp).
bool is_plan_only(const struct dive &d);

// While it lives, the plans (and `also`, a dive being planned from) are out
// of the dive table: the core's tissue loading of the dives around a time
// (init_decompression) reads the whole table, and a plan is not a dive done.
// Nothing is saved meanwhile; the dives go back in the destructor.
class HiddenPlans {
public:
	explicit HiddenPlans(const struct dive *also = nullptr);
	~HiddenPlans();
	HiddenPlans(const HiddenPlans &) = delete;
	HiddenPlans &operator=(const HiddenPlans &) = delete;

private:
	struct Held;
	std::vector<Held> held;
};

// Runs the plan of `request` for saving: `d` is the planned dive, with its
// notes and the request kept as extra data ("OpenDives plan"); `site` the
// site of the dive it starts from (nullptr if none). INVALID_PLAN when the
// core refuses the plan. Nothing is added to the log.
int build_plan(const std::string &request, struct dive &d, struct dive_site *&site, std::string &error);

// The thumbnail of list_dives() ("profile"), as a JSON array (opendives.cpp).
std::string profile_json(const struct dive &d);

// Loads `path` into the core's divelog (opendives.cpp). On success, the log
// becomes the current one: edits apply to it and saves go to it.
int load(const std::string &path, std::string &error);

// Address of the log in memory ("path[branch]", a cloud URL or a file), or
// empty when none is loaded.
const std::string &current_log();

// True when the log in memory is the cloud log of the configured account.
bool current_log_is_cloud();

// Cloud write lock for the account `email` (edit.cpp), whatever log is in
// memory: true when it is the test account or writes are enabled.
bool cloud_writes_allowed_for(const std::string &email);

// Called by load() after every successful load (edit.cpp): the dives are new
// objects, so the undo stack is cleared; the format version is read again.
void on_log_loaded();

// Same JSON object as get_dive() for one dive (opendives.cpp).
int dive_json(int id, std::string &json, std::string &error);

// JSON array of the dives in memory, as list_dives() returns (opendives.cpp).
std::string dives_json();

// Local commits of the git log `log` not on its remote-tracking branch
// (edit.cpp), whatever log is in memory.
int pending_for(const std::string &log);

// True when `name` is a cylinder type of the runtime table or of the device's
// library (settings.cpp; TankInfoModel's tank_type_name_in_use()).
bool cylinder_type_name_in_use(const std::string &name);

// Free filter (filter.cpp). A filter as Subsurface's FilterData, for a filter
// preset: refuses the OpenDives criteria (country, region, trip) and text
// values holding a comma, which the log could not keep (NOT_IN_PRESET).
int filter_data_from_rules(const std::string &fulltext, const std::string &fulltext_mode,
			   const std::vector<filter_rule> &rules, FilterData &out, std::string &error);
// FilterData::operator== of desktop core/divefilter.cpp, not compiled here.
bool filter_data_equal(const FilterData &a, const FilterData &b);
// {"fulltext", "mode", "rules":[{type, stringMode, rangeMode, negate, data}]},
// text values one per line, as filter_dives() takes them.
void append_filter_data(std::string &json, const FilterData &data);

} // namespace opendives::internal

#endif
