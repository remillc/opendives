// SPDX-License-Identifier: GPL-2.0
// Shared between the façade's source files; not part of its API.
#ifndef OPENDIVES_INTERNAL_H
#define OPENDIVES_INTERNAL_H

#include "opendives.h"

#include <string>
#include <vector>

struct FilterData;

namespace opendives::internal {

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
