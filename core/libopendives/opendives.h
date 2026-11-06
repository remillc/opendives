// SPDX-License-Identifier: GPL-2.0
// OpenDives façade over the Subsurface core. The rest of the application
// never sees Subsurface's internal structures.
// These functions are not reentrant: the core must run on a single thread.
#ifndef OPENDIVES_H
#define OPENDIVES_H

#include <string>
#include <cstdint>
#include <vector>

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

// --- Settings (settings.cpp; spec, section 4, "Settings, modelled on Subsurface")
//
// The core's preferences (core/pref.h) shown in Settings, in integer units:
// {"length":"m"|"ft", "temperature":"C"|"F", "pressure":"bar"|"psi",
//  "volume":"l"|"cuft", "weight":"kg"|"lbs", "unitSystem", "verticalSpeed",
//  "duration", the other keys accepted by set_prefs, "autogroup" (the log's),
//  "diveComputers":[{"slot", "vendor", "product", "device", "name"}],
//  "planner":{planner-only values}, "defaults":{Subsurface's default of each
//  key accepted by set_prefs}}.
int get_prefs(std::string &json);

// Sets preferences from a flat object whose keys are those of get_prefs
// (strings, integers, booleans); unknown keys are BAD_REQUEST and nothing
// changes. Changing one unit sets the unit system to "personalize", as in
// Subsurface; "unitSystem" "metric" or "imperial" sets the five units.
// "decoModel" sets display_deco_mode and planner_deco_mode together.
// "forgetDiveComputer": slot 1 to 4, or 0 for all of them (Subsurface-mobile's
// "Forget remembered dive computers"). These are settings of the device: the
// app keeps them and sets them again at each start. The units, the tank bar,
// the dive computer's ceiling and the rebreather displays are also written in
// the log by save-git, and the log's values are applied after each load
// (apply_log_prefs), as Subsurface-mobile does.
int set_prefs(const std::string &changes_json, std::string &error);

// Cylinder types (Settings, "Types de bouteilles"), as Subsurface's "Manage
// cylinder types" (qt-models/tankinfomodel.cpp): the runtime table (the
// device's library, if "displayDefaultTankInfos", plus the types the log
// uses), each {"name", "ml", "mbar", "standard" (in the core's default list),
// "library" (in the device's library: can be removed)}, and the device's
// library itself as it is stored, one string per type, "name\tml\tbar\tcuft\tpsi":
// {"types":[…], "library":[…]}.
int cylinder_types(std::string &json);
// The device's library, {"library":[…]} as cylinder_types() writes it, set
// again at start (Subsurface keeps it in its settings); rebuilds the table.
int set_cylinder_library(const std::string &library_json, std::string &error);
// action: "add" (a new type `name` of `ml` and `mbar`; NAME_IN_USE), "size"
// (`ml` and `mbar` of the type `name`, in the table and, if it is there, in the
// library), "remove" (from the library and the table, and as the default
// cylinder; only a library type). Writes cylinder_types(). Renaming changes
// the log: see cylinder_type_rename().
int cylinder_type_action(const std::string &action, const std::string &name, int ml, int mbar, std::string &json,
			 std::string &error);

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

// Signs out of the cloud account (spec, section 4, "Sign out"): closes the log
// in memory and forgets the account. The local copy of the account's log is
// kept, and reused if the diver signs in again, unless `delete_copy`: then it
// is deleted, but never while it holds changes not sent (PENDING_CHANGES).
// The app forgets the stored credentials itself.
int cloud_sign_out(bool delete_copy, std::string &error);

// Deletes the cloud account (spec, section 4, "Delete the account"). NEVER
// called by automated tests. `password` is the password typed again; it must
// be the account's (WRONG_PASSWORD, no request). Refused while changes are not
// sent (PENDING_CHANGES): the app syncs them first. With `keep_dives_in` (a new
// "path[branch]"), the dives in memory are saved there first, as a log without
// account. Then posts the request, as Subsurface does, and writes
// {"deleted":…, "status":<HTTP status>, "reply":<server reply>}. Only when the
// reply confirms the deletion is the local copy deleted and the account
// forgotten; otherwise nothing changes. -1 only when nothing was sent
// (or NETWORK when the request failed).
int cloud_delete_account(const std::string &password, const std::string &keep_dives_in, std::string &json,
			 std::string &error);

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
// (strings), "rating", "visibility", "wavesize", "current", "surge", "chill"
// (0 to 5 stars), "buddies", "diveguide", "tags"
// (lists of strings). Only those fields change; everything else in the dive
// is kept as loaded. Like Subsurface, lists keep their order: removed entries
// go, new ones are added at the end. Writes the updated dive, as get_dive()
// does. Nothing changes and no step is added when the values are the same.
// FORMAT_NEWER when the log was written by a newer format than this core's.
int edit_dive(int id, const std::string &changes_json, std::string &result_json, std::string &error);

// Trips (spec, section 4, "Trip"), each change one undoable step, as
// Subsurface's EditTripLocation/EditTripNotes, RemoveDivesFromTrip,
// CreateTrip, MergeTrips and AddDivesToTrip do it. Trip identifiers are those
// of the load (list_dives): valid until the next load, never stored. Each
// writes the trip as trip_json() does; {"tripId":0} when it no longer exists:
// {"tripId", "location", "notes", "autogen", "dives":[{"id", "number",
// "date", "durationSeconds", "site"}]}.
int trip_json(int trip_id, std::string &json, std::string &error);
int edit_trip(int trip_id, const std::string &field, const std::string &value, std::string &json, std::string &error);
int trip_remove_dive(int dive_id, std::string &json, std::string &error);
int trip_split_at(int dive_id, std::string &json, std::string &error); // this dive and the later ones form a new trip
int trips_merge(int trip_id, int other_id, std::string &json, std::string &error);
int trip_add_dives(int trip_id, const std::vector<int> &dive_ids, std::string &json, std::string &error);
int trip_ungroup(int trip_id, std::string &json, std::string &error);
// "Group dives into trips" (the log's autogroup), as Subsurface desktop's
// View > Autogroup: sets the flag, then one undoable step, AutogroupDives when
// on, RemoveAutogenTrips when off (no step when no dive moves; the flag itself
// is not undone, as in Subsurface). Writes the trip of the first dive moved,
// {"tripId":0} when none.
int trips_autogroup(bool on, std::string &json, std::string &error);

// Renames a cylinder type, as Subsurface's RenameCylinderType: the cylinders
// of that type in the log, the runtime table and the device's library; one
// undoable step. NAME_IN_USE when the new name is already a type. Writes
// cylinder_types().
int cylinder_type_rename(const std::string &old_name, const std::string &new_name, std::string &json,
			 std::string &error);

// Dive sites (spec, section 4, "Sites"), by uuid; each change one undoable
// step as Subsurface's site commands. Coordinates in micro-degrees.
// site_json: summary + description, notes, countryTaxonomy/region/city
// ({value, manual}) and diveList; {"uuid":0} when the site no longer exists.
int sites_json(std::string &json);
int site_json(uint32_t uuid, std::string &json, std::string &error);
int site_nearby(int lat_udeg, int lon_udeg, int distance_m, std::string &json); // get_by_gps_proximity; "null" if none
int site_create(const std::string &name, int lat_udeg, int lon_udeg, std::string &json, std::string &error);
// field: name, description, notes, location (lat, lon; 0, 0 removes it),
// country, region, city (corrected values, never replaced by a lookup).
int site_edit(uint32_t uuid, const std::string &field, const std::string &value, int lat_udeg, int lon_udeg,
	      std::string &json, std::string &error);
// Country, region and city for the site's position, written in the taxonomy
// as Subsurface's reverseGeoLookup does; keeps corrected values. From
// OpenStreetMap's Nominatim when the network answers, else country and region
// from the offline Natural Earth file (set_regions_file).
int site_geocode(uint32_t uuid, const std::string &lang, std::string &json, std::string &error);
// Read-only: what site_geocode would find at a position, without writing:
// {"country", "region", "city", "offline"} or null.
int place_at(int lat_udeg, int lon_udeg, const std::string &lang, std::string &json);
// regions.cpp: the offline file (core/data/regions.txt), read on first use.
void set_regions_file(const std::string &path);
bool offline_region(int lat_udeg, int lon_udeg, const std::string &lang, std::string &country, std::string &region);
// Possible duplicates: same name ignoring case within same_name_m, or
// different names within same_place_m: [{"a":…, "b":…, "distanceM":…}].
int sites_duplicates(int same_name_m, int same_place_m, std::string &json);
int sites_merge(uint32_t keep, uint32_t other, std::string &json, std::string &error); // MergeDiveSites
int sites_delete_unused(const std::vector<uint32_t> &uuids, std::string &json, std::string &error);
// One site, used or not (DeleteDiveSites): its dives stay without a site.
int site_delete(uint32_t uuid, std::string &json, std::string &error);
// Dives without a site: [{"id", "number", "date", "durationSeconds", "suggestedSite"}].
int dives_without_site(std::string &json);

// --- Tools (tools.cpp; spec, section 1, "Tools"), read-only ---------------

// Gas calculator, as Subsurface-mobile's (sea water, 1013 mbar). Gas in per
// mille, pO2 limit in mbar, planned depth in mm. Writes {"o2", "he",
// "po2Mbar", "modMm" (core's gas_mod, rounded to 1 m), "eadMm" (EAD at the
// MOD), "endMm" (END at the MOD, O2 narcotic per prefs.o2narcotic),
// "o2Narcotic", "plannedDepthMm", "bestO2", "bestHe" (core's best_o2 at the
// given pO2 and best_he with prefs.bestmixend), "bestMixEndMm"}. -1 with
// BAD_REQUEST when the gas does not exist.
int gas_calculator(int o2_permille, int he_permille, int po2_mbar, int planned_depth_mm, std::string &json,
		   std::string &error);

// Gas calculator: cylinder types offered in Subsurface's lists (formatFullCylinderList):
// {"default": prefs.default_cylinder, "types": [{"name", "ml", "workingPressureMbar"}]}.
int gas_cylinder_types(std::string &json);

// Tissues at `now` (local wall-clock seconds, as the core's dive times; 0 for
// the current time), loaded by the core's init_decompression() with the
// logbook dives before now, as the planner does for a new dive, with the
// planner's model and gradient factors. Writes {"now", "surfaceSeconds" (since
// the last dive, -1 when no dive counts), "model", "gfLow", "gfHigh",
// "vpmbConservatism", "dives": [{"id", "number", "date", "endDate", "site",
// "maxDepthMm", "durationSeconds"}], "tissues": 16 × {"percent" (Subsurface's
// tissue graph: 50 = ambient pressure, 100 = M-value), "surfaceGf", "n2Bar",
// "heBar", "halfTimeMin"}}.
int desaturation(int64_t now, std::string &json);

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
