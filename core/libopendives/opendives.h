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
// Needs no network.
int cloud_configure(const std::string &email, const std::string &password, std::string &url);

// PEM file of trusted certificate authorities, for libgit2 and server
// verification. Required on Android: the system does not provide one.
int set_ca_file(const std::string &path);

// Read-only: checks that the log branch exists on the server, then loads
// the log through the core (clone, or update of the local cache under
// $HOME/.subsurface). Writes an object into `json`:
//   {"server":…, "head":…, "synced":true|false, "offlineReason":…,
//    "unchanged":true|false, "dives":[…]}
// When the server's head is the commit already loaded from this log (by an
// earlier call or by cloud_list_cached_dives), nothing is loaded again:
// "unchanged" is true and "dives" is absent; the loaded log and its dive
// identifiers stay valid. Like Subsurface's remote_repo_uptodate().
// Server unreachable: reads the local copy without syncing (synced=false,
// offlineReason set), or fails if there is none.
// Refuses to load if the branch is missing: the core would create it by pushing.
int cloud_list_dives(const std::string &email, const std::string &password, std::string &json, std::string &error);

// Read-only, no network: loads the local cache of the cloud log of the
// account set by cloud_configure(), as left by the last sync, so that the
// logbook can be shown at once. Same object as cloud_list_dives, with
// "synced":false and "head" the commit read.
// Returns 1, with `json` empty, when there is no local cache yet.
int cloud_list_cached_dives(std::string &json, std::string &error);

// Read-only, network only: asks the server for the head of the log branch of
// the account set by cloud_configure(). Writes {"exists":…, "head":…}.
// The one façade function that may run on another thread than the core's,
// at the same time as a load: it only reads the configured account, and
// libgit2 is thread-safe. Not while cloud_configure() runs.
int cloud_probe(std::string &json, std::string &error);

// Read-only: asks the server for its list of branches, with libgit2's normal
// TLS validation, and tells whether the log branch exists.
// Clones nothing, writes nothing, pushes nothing.
int cloud_branch_status(const std::string &url, bool &exists, std::string &head, std::string &error);

// --- Editing and saving (edit.cpp; docs/editing-and-sync-plan.md) ---------
//
// Errors are returned as -1 with `error` set to a code, optionally followed
// by ": " and details: NO_LOG, NOT_GIT, NOT_FOUND, BAD_REQUEST, FORMAT_NEWER,
// NOTHING_TO_UNDO, NOTHING_TO_REDO, WRITE_LOCKED, SAVE_REPLACEMENT,
// SAVE_ERROR, STOPPED.

// Applies a set of field changes to one dive of the log in memory as a single
// undoable step. `changes_json` is an object with any of: "notes", "suit"
// (strings), "rating", "visibility" (0 to 5), "buddies", "diveguide", "tags"
// (lists of strings). Only those fields change; everything else in the dive
// is kept as loaded. Like Subsurface, lists keep their order: removed entries
// go, new ones are added at the end. Writes the updated dive, as get_dive()
// does. Nothing changes and no step is added when the values are the same.
// FORMAT_NEWER when the log was written by a newer format than this core's.
int edit_dive(int id, const std::string &changes_json, std::string &result_json, std::string &error);

// Undo stack of the session; cleared by every load. The result is the dive
// changed, as get_dive() gives it.
int undo(std::string &result_json, std::string &error);
int redo(std::string &result_json, std::string &error);
bool can_undo();
bool can_redo();
std::string undo_text(); // e.g. "Edit notes [#12]"; empty when nothing to undo
std::string redo_text();

// True when the log in memory differs from the last local save.
bool has_unsaved_changes();

// Saves the log in memory to its local git repository, without network.
// Refused unless Subsurface's classify_git_save() says "normal"
// (SAVE_REPLACEMENT, SAVE_ERROR), and for a cloud log unless writes are
// allowed (WRITE_LOCKED). The commit message lists the changes since the
// last save, as Subsurface writes them.
int save_local(std::string &error);

// Saves the log in memory to another git repository ("path[branch]"), with
// the same check; for tests.
int save_as(const std::string &destination, std::string &error);

// Local save if needed, then for a cloud log the reload with sync of
// Subsurface-mobile (fetch, merge, push), then the log's settings. Writes
// {"status":…, "pending":n, "reloaded":true|false} with status "local" (log
// without account), "up_to_date", "pushed", "pulled", "merged", "offline"
// (saved locally, server unreachable) or "stopped" (sync failed; the local
// commits wait). After a reload the dives are new: list them again with
// list_loaded_dives(); the undo stack is cleared.
int sync(std::string &status_json, std::string &error);

// Local commits of the cloud log not yet on the server, newest first:
// [{"id":…, "summary":…, "message":…}]. Empty for a log without account.
int pending_changes(std::string &json);

// The dives of the log in memory, as list_dives() returns them, without
// loading anything.
int list_loaded_dives(std::string &json);

// Cloud write lock (plan, section 4). Writing to a cloud log is refused
// unless the account email equals `email` (the test account), or writes
// were enabled with the developer setting. Logs without account are not
// affected.
void set_cloud_test_email(const std::string &email);
void set_cloud_writes_enabled(bool enabled);

} // namespace opendives

#endif
