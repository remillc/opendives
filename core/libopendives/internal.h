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

// Called by load() after every successful load (edit.cpp): the dives are new
// objects, so the undo stack is cleared; the format version is read again.
void on_log_loaded();

// Same JSON object as get_dive() for one dive (opendives.cpp).
int dive_json(int id, std::string &json, std::string &error);

// JSON array of the dives in memory, as list_dives() returns (opendives.cpp).
std::string dives_json();

} // namespace opendives::internal

#endif
