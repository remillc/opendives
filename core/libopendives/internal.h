// SPDX-License-Identifier: GPL-2.0
// Shared between the façade's source files; not part of its API.
#ifndef OPENDIVES_INTERNAL_H
#define OPENDIVES_INTERNAL_H

#include <string>

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

} // namespace opendives::internal

#endif
