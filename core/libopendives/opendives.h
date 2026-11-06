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
// The library back to Subsurface's standard list (Reset all settings).
void reset_cylinder_library();
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

// --- New account and divelogs.de (account.cpp; spec, section 4, "First launch")
//
// Subsurface's checks of cloud credentials (core/cloudstorage.cpp,
// isValidEmail and isValidPassword).
bool cloud_valid_email(const std::string &email);
bool cloud_valid_password(const std::string &password);

// Creating an account WRITES to the Subsurface cloud: both functions are
// under the cloud write lock (WRITE_LOCKED for any email but the test
// account's, unless writes are enabled), and check the credentials first
// (INVALID_CREDENTIALS, INVALID_PIN); no request is sent then. Port of
// CloudStorageAuthenticate::backend(): POST "email password" to
// cloud_base_url + "/storage" (an unknown email creates the account and the
// server mails a PIN; a known one checks the password), or "email password
// pin" to "/verify". The email is sent in lower case, as Subsurface-mobile
// does. Writes {"status":"verified"|"need_pin"|"incorrect", "http":…,
// "reply":<server reply>}, read as uploadFinished() reads it ("[VERIFIED]"
// or "[OK]": verified; "[VERIFY]" or "Invalid PIN": need_pin; anything else:
// incorrect). NETWORK when no reply came. Nothing is kept: the app
// configures the account (cloud_configure) once it is verified.
int cloud_create_account(const std::string &email, const std::string &password, std::string &json,
			 std::string &error);
int cloud_verify_pin(const std::string &email, const std::string &password, const std::string &pin,
		     std::string &json, std::string &error);

// First logbook of the account set by cloud_configure(), whose log branch
// does not exist on the server yet (a new account). WRITES to the cloud: under
// the write lock. Refused when the server cannot be reached (NETWORK), when the
// branch exists (LOG_EXISTS) or when this device already has a copy of the
// account's log (LOCAL_COPY_EXISTS). With `import_path` (a file the core reads,
// e.g. the .dld downloaded from divelogs.de), the file is read first
// (IMPORT_FAILED: nothing written). Then, as Subsurface does for a new
// account (git-access.cpp, create_and_push_remote), the log is created with
// an empty commit pushed to the server; the imported dives are added as
// Subsurface-mobile imports a file (add_imported_dives, merge_all_trips),
// saved and synced. Writes the object of cloud_list_dives plus
// "imported":<dives read from the file>.
int cloud_create_log(const std::string &import_path, std::string &json, std::string &error);

// Read-only: reads the file `path` (as cloud_create_log will) into a
// separate log and writes {"dives":n}; IMPORT_FAILED if it cannot be read.
// The "read the dives" step of the import, before anything is written.
int import_count(const std::string &path, std::string &json, std::string &error);

// divelogs.de, as Subsurface's desktop "Download from divelogs.de": the form
// body of the requests (user, pass and, for the archive, the dive ids), and
// the reading of the list of dives (parseDiveLogsDeDiveList): `ids` comma-
// separated, or `error` LOGIN_FAILED or INVALID_RESPONSE (with `details`).
struct divelogs_list {
	std::string error, details, ids;
	int count = 0;
};
std::string divelogs_request_body(const std::string &user, const std::string &password, const std::string &ids);
divelogs_list divelogs_parse_list(const std::string &xml);

// Checks the divelogs.de credentials with the first request of the download
// (the list of dives), before anything else: writes {"dives":n}. Same errors
// as divelogs_download, LOGIN_FAILED when divelogs.de refuses them.
int divelogs_check(const std::string &user, const std::string &password, std::string &json, std::string &error);

// Downloads the divelogs.de logbook of `user` into `out_path` (a .dld zip
// archive the core reads). The credentials are only sent to divelogs.de, over
// HTTPS, never kept or logged. Writes {"dives":n, "bytes":…}; with no dive,
// {"dives":0} and no file. Errors: INVALID_CREDENTIALS, NETWORK,
// LOGIN_FAILED, INVALID_RESPONSE, INVALID_ARCHIVE, WRITE_FAILED.
int divelogs_download(const std::string &user, const std::string &password, const std::string &out_path,
		      std::string &json, std::string &error);

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
// --- Dive planner (plan.cpp; spec, section 4, "Planner") -------------------
//
// Read-only: nothing is added to the logbook and the preferences are left as
// they were. The deco model, gradient factors and VPM-B conservatism are the
// core's preferences (Settings, "Décompression").

// The planner's settings as the preferences hold them:
// {"model":"buehlmann"|"vpmb"|"recreational", "gfLow", "gfHigh",
//  "vpmbConservatism", and the planner-only ones: "bottomSacMlMin",
//  "decoSacMlMin", "bottomPo2Mbar", "decoPo2Mbar", "descentMmMin",
//  "ascent75MmMin", "ascent50MmMin", "ascentStopsMmMin", "ascentLast6mMmMin",
//  "lastStop6m", "safetyStop", "switchAtRequiredStop", "minSwitchSeconds",
//  "o2Breaks", "reserveMbar" (recreational mode), "problemSolvingMinutes",
//  "sacFactor" (x100)}.
int planner_setup(std::string &json);

// Runs Subsurface's planner on a square profile. `request`: {"depthMm",
// "bottomTimeSeconds" (descent included), "cylinders":[{"o2Permille",
// "hePermille", "sizeMl", "startMbar", optional "switchDepthMm"}] (the first
// is the bottom gas, the others are switched to at their switch depth, by
// default the MOD at the ppO2 for deco rounded to 3 m / 10 ft), optional
// "surfacePressureMbar" (1013), "salinity" (10300, sea water), "when" (local
// timestamp; default an hour from now, or after the latest dive), and any
// planner-only setting of planner_setup(), for this plan only}.
// Writes {"error":""|"TIMEOUT"|"INAPPROPRIATE_GAS"|"NO_SUITABLE_BAILOUT_GAS"|
// "RECREATIONAL_EXCEEDS_NDL", "setup":{…as used}, "effGfLow", "effGfHigh",
// "when", "surfaceIntervalSeconds", "runtimeSeconds", "maxDepthMm", "cns",
// "otu", "points":[[s, mm]…], "segments":[{"timeSeconds", "depthMm",
// "cylinder", "entered"}], "stops":[{"depthMm", "durationSeconds",
// "runtimeSeconds", "cylinder", "gasChange"}], "cylinders":[{"o2Permille",
// "hePermille", "sizeMl", "startMbar", "endMbar", "gasUsedMl",
// "decoGasUsedMl", "decoPressureMbar", "switchDepthMm", "bottomModMm",
// "warning":""|"MORE_THAN_AVAILABLE"|"NO_RESERVE_FOR_SHARING"|
// "NO_GAS_FOR_PROBLEM_SOLVING"}], "minimumGas":null|{"cylinder", "depthMm",
// "pressureMbar", "deltaMbar" (negative: short), "sacFactor",
// "problemSolvingMinutes"}}, as plannernotes.cpp computes them.
// -1 with BAD_REQUEST.
int plan_dive(const std::string &request, std::string &json, std::string &error);
// --- Free filter (filter.cpp), read-only -----------------------------------
//
// One constraint in the text form of Subsurface's filter presets (the
// filter_constraint parser constructor): `type` a token of
// core/filterconstraint.cpp ("suit", "depth", "dive_mode"…), the modes as
// tokens or empty, `data` as filter_constraint_data_to_string() writes it
// (core units: mm, seconds, mK, mL/min, mL, permille; strings separated by
// commas; dive_mode and day_of_week as a bit field). Never accepted: weight,
// weight_type, water_density, cylinder_n2 (spec). OpenDives additions, not in
// Subsurface's filter: "od_country", "od_region" (the site's taxonomy) and
// "od_trip" (trip identifiers of the load), with comma-separated values.
// Text values may also be given one per line ('\n'): then each is kept
// whole, commas included (the preset text form splits at every comma).
struct filter_rule {
	std::string type, string_mode, range_mode, data;
	bool negate = false;
};

// Values present in the loaded log for each criterion, so that a criterion
// that applies to no dive is not offered: {"modes":["OC","CCR"…],
// "years":[min,max], "suits", "computers", "cylinderTypes", "tags", "people",
// "sites", "countries", "regions" (sorted lists), and flags "helium",
// "oxygen" (a gas other than air), "cylinderSize", "sac", "waterTemp",
// "airTemp", "planned" (both planned and logged dives), "notes", "rating",
// "visibility", "current", "wavesize", "surge", "chill"}.
int filter_options(std::string &json);

// Identifiers of the dives of the loaded log that match every rule and the
// fulltext query (mode "starts_with" by default, "substring" or "exact"),
// as a JSON array. BAD_REQUEST for a type or mode not accepted.
int filter_dives(const std::string &fulltext, const std::string &fulltext_mode, const std::vector<filter_rule> &rules,
		 std::string &json, std::string &error);

// --- Adding and importing dives, filter presets (edit.cpp) ------------------
// Each is one undoable step, saved and synced like an edit. A dive list step
// gives {"listChange":true, "dives":<dives in the log>, "id":<first dive
// added, 0 if none>}, also on its undo and redo.

// Logs a dive by hand (spec, section 3, "Add"): Subsurface-mobile's
// QMLManager::addDive() (the core's default dive) with the values of the form
// as its commitChanges() sets them (a simple profile from the depth and the
// duration, fake_dc()), added by AddDive (autogroup, new number). Fields:
// "date" ("YYYY-MM-DDTHH:MM", local time), "durationSeconds", "maxDepthMm",
// "site" (uuid, 0 for none), "notes", "suit", "buddies", "guides", "tags"
// (lists), "rating", "visibility" (0 to 5), "waterTempMk", "airTempMk", and
// for the first cylinder "cylinderType" (a name of the cylinder types table,
// which gives its size and working pressure), "startMbar", "endMbar",
// "o2Permille", "hePermille".
int create_dive(const std::string &fields_json, std::string &result_json, std::string &error);

// Deletes a dive (DeleteDive, commands/command_divelist.cpp): its trip goes
// too if it was the last one; undo puts both back.
int delete_dive(int id, std::string &result_json, std::string &error);

// Imports a file (.ssrf, .xml and the other formats the core reads) into the
// log: parse_file(), then ImportDives with merge_all_trips, as
// QMLManager::importDivesFromFile() does; `source` names the file in the
// command text. IMPORT_FAILED, NO_DIVES, NO_NEW_DIVES (all already there).
int import_dives(const std::string &file, const std::string &source, std::string &result_json, std::string &error);

// Filter presets of the log (Subsurface's filter_presets):
// {"presetList":[{"index", "name", "filter":{"fulltext", "mode", "rules"}}]}.
int filter_presets_json(std::string &json);
// CreateFilterPreset, or EditFilterPreset when the name exists; rules as
// filter_dives() takes them. NOT_IN_PRESET for country, region, trip, or a
// text value with a comma (the log could not keep them).
int filter_preset_save(const std::string &name, const std::string &fulltext, const std::string &fulltext_mode,
		       const std::vector<filter_rule> &rules, std::string &json, std::string &error);
int filter_preset_delete(int index, std::string &json, std::string &error); // RemoveFilterPreset

// --- Sync conflict (edit.cpp; spec, section 6, an OpenDives addition) ------
// After Subsurface's automatic merge (union of the lines of each file), the
// dives whose same line both sides changed differently. Read-only:
// {"conflict":false} or {"conflict":true, "deviceTime", "cloudTime" (commit
// times, UTC), "items":[{"path", "diveId", "number", "date", "lines":[{"key",
// "device", "cloud"}]}]}.
int sync_conflicts(std::string &json, std::string &error);
// Keeps, for each conflicting file, the side chosen by the diver:
// `choices_json` is {"<path>":"device"|"cloud", …}, every conflicting path
// included. One new commit on the merge, then the log is read again (no
// network); the app syncs it like an edit. Cloud writes as save_local(): the
// test account only.
int resolve_conflicts(const std::string &choices_json, std::string &error);
// --- Statistics (stats.cpp), read-only --------------------------------------
//
// Figures of a set of dives, Subsurface's stats_t (core/statistics.h):
// S = {"dives", "totalSeconds", "shortestSeconds", "longestSeconds",
// "maxDepthMm", "minDepthMm", "meanDepthMm", "meanMaxDepthMm", "meanSacMlMin",
// "minTempMk", "maxTempMk", "meanTempMk"}; 0 when unknown. Invalid dives are
// left out, as Subsurface does.
//
// `criteria_json`: {"<field>":["value", …], …}, fields suit, tag, buddy,
// guide, site, trip, mode, gas, cylinder, computer, year, month, rating, with
// the keys stats_values() gives ("" for "not set"), and "id" (dive identifiers
// of the load, for the free filter's result). Several values of a field:
// any of them; several fields: all of them. "{}": every dive. The dives are
// marked through their `selected` flag, in memory only and put back, and
// counted by calculate_stats_summary() and calculate_stats_selected().
// Writes {"logDives":n, "total":S, "yearly":[S+"year"], "monthly":[S+"year",
// "month"], "byTrip":[S+"start","location"], "byMode":[S+"mode"],
// "bySuit":[S+"value"], "byBuddy":[S+"value"], "diveIds":[…]}.
// BAD_REQUEST for an unknown field.
int stats(const std::string &criteria_json, std::string &json, std::string &error);

// The values of one field in the loaded log, with their number of dives:
// [{"key", "dives"}] sorted by key, "" for dives without one; for "trip",
// the key is the date of the trip's first dive (trips have no stable
// identifier) and "location" is added. Gas keys are "o2/he" in per mille.
int stats_values(const std::string &field, std::string &json, std::string &error);

// --- Download from a dive computer (download.cpp; spec, "Download") ---------
//
// Over Bluetooth only, as Subsurface-mobile on Android: Bluetooth Low Energy
// and Bluetooth Classic (RFCOMM). The platform provides the transport
// (core/compat/bt_transport.h, set with opendives_compat::set_bt_transport);
// Subsurface's own Bluetooth code, ported in core/compat/bluetooth_compat.cpp,
// drives it through libdivecomputer's custom I/O.

// The dive computer a Bluetooth device name stands for, as Subsurface's
// btdiscovery.cpp (getDeviceType) tells: {"vendor", "product"} (a model of
// libdivecomputer's list), or null when the name is not a known dive
// computer. Reentrant: may run on any thread.
std::string dc_from_bluetooth_name(const std::string &name);

// The models that download over Bluetooth, for a device whose name says
// nothing: [{"vendor", "products":[{"name", "ble", "classic"}]}] sorted as
// Subsurface's vendor and product lists. Reentrant.
std::string dc_bluetooth_models();

// Progress of a download, called on the download's thread with a JSON
// object: {"state":"connecting"|"connected", "fraction" (0 to 1, -1 when
// unknown), "dives" (dives received), "newDives":[{"date", "maxDepthMm",
// "durationSeconds", "profile"}] (received since the last call)}.
using download_progress = void (*)(const std::string &json, void *userdata);

// Downloads the new dives of a dive computer and adds them to the log as one
// undoable step, saved and synced like an edit: Subsurface-mobile's
// DownloadThread::run() then DiveImportedModel::recordDives(). Blocks until
// the end. `request_json`: {"vendor", "product" (a model of
// dc_bluetooth_models), "address" ("LE:" + MAC for Bluetooth Low Energy,
// the MAC alone to try Classic first when the model has both, as
// Subsurface), "name" (the device's Bluetooth name), "forceDownload" (all
// dives, not only the new ones; default false), "logFile" (path of
// libdivecomputer's log, optional)}. The computer is remembered (Settings,
// dive computers) as Subsurface does after each attempt. Writes
// {"downloaded":n, "vendor", "product" (as the computer told), "serial",
// "firmware", "list":{…} (the dive list step, as import_dives; absent when
// n is 0), "undo", "diveComputerList" (get_prefs')}. Errors: NO_LOG,
// FORMAT_NEWER, BAD_REQUEST, UNKNOWN_COMPUTER, NO_TRANSPORT, CANCELLED,
// NOT_FOUND (the connection could not be opened), FAILED (it was, then the
// download failed), each followed by ": " and Subsurface's message.
int download_dives(const std::string &request_json, download_progress progress, void *userdata, std::string &json,
		   std::string &error);

// Asks the download running on another thread to stop (Subsurface's
// import_thread_cancelled); the platform also ends the transport's waits.
void download_cancel();

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

// Local save if needed, then for a cloud log (or a git log with a remote of
// its own) Subsurface's exchange with the server (fetch, then fast-forward,
// merge or push). When only this device's commits were sent, the log in
// memory is kept, and so is the undo history (as desktop Subsurface after a
// cloud save); when the cloud brought changes, the merged log is read again
// with its settings (as Subsurface-mobile). Writes {"status":…, "pending":n,
// "reloaded":true|false} with status "local" (log without account),
// "up_to_date", "pushed", "pulled", "merged", "offline" (saved locally,
// server unreachable) or "stopped" (sync failed; the local commits wait).
// After a reload the dives are new: list them again with
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
