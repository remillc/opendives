// SPDX-License-Identifier: GPL-2.0
// OpenDives façade over the Subsurface core. The rest of the application
// never sees Subsurface's internal structures.
// These functions are not reentrant: the core must run on a single thread.
#ifndef OPENDIVES_H
#define OPENDIVES_H

#include <string>

namespace opendives {

// Call once before any other function. Returns 0 on success.
int init();

// True if `repo` (in "path[branch]" format) names an already saved repository.
bool log_exists(const std::string &repo);

// Detail of one dive of the loaded log (identifier `id` from list_dives):
// facts, cylinders and gases, gas changes, buddies, tags, notes,
// and the profile computed by the core (depth, active cylinder, ppO2, ceiling
// if present). Integer SI units. Returns 0, or -1 with `error`.
// Identifiers are only valid until the next load.
int get_dive(int id, std::string &json, std::string &error);

// Units of the log, one per quantity: {"length":"m"|"ft", "temperature":"C"|"F",
// "pressure":"bar"|"psi", "volume":"l"|"cuft", "weight":"kg"|"lbs"}.
int get_prefs(std::string &json);

// After a load: copies the settings read from the log (units, etc.) into the
// preferences, like Subsurface-mobile (QMLManager::consumeFinishedLoad).
// Required before saving: save-git rewrites these settings from prefs.
void apply_log_prefs();

// Reads `source` (.xml, .ssrf…) and saves it into the local git repository `repo`,
// created if needed. Returns the number of dives, or -1 with `error` set.
int import_file(const std::string &source, const std::string &repo, std::string &error);

// Loads `log` ("path[branch]" or a file) and writes a JSON array of dives
// into `json`. Returns 0, or -1 with `error` set.
int list_dives(const std::string &log, std::string &json, std::string &error);

// Sets the Subsurface cloud account and writes the log address into `url`,
// in Subsurface's format: "https://<server>/git/<email>[<email>]".
int cloud_configure(const std::string &email, const std::string &password, std::string &url);

// PEM file of trusted certificate authorities, for libgit2 and server
// verification. Required on Android: the system does not provide one.
int set_ca_file(const std::string &path);

// Read-only: checks that the log branch exists on the server, then loads
// the log through the core (clone, or update of the local cache under
// $HOME/.subsurface). Writes an object into `json`:
//   {"server":…, "head":…, "synced":true|false, "offlineReason":…, "dives":[…]}
// Server unreachable: reads the local copy without syncing (synced=false,
// offlineReason set), or fails if there is none.
// Refuses to load if the branch is missing: the core would create it by pushing.
int cloud_list_dives(const std::string &email, const std::string &password, std::string &json, std::string &error);

// Read-only: asks the server for its list of branches, with libgit2's normal
// TLS validation, and tells whether the log branch exists.
// Clones nothing, writes nothing, pushes nothing.
int cloud_branch_status(const std::string &url, bool &exists, std::string &head, std::string &error);

} // namespace opendives

#endif
