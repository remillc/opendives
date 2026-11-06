// SPDX-License-Identifier: GPL-2.0
// Editing dives, undo and redo, local save and cloud sync
// (docs/editing-and-sync-plan.md, sections 3 and 4).
//
// Ported from Subsurface without modifying it:
//  - the edit itself from commands/command_edit.cpp: EditDive::exchangeDives()
//    (copy the dive, change the copy, swap the contents, with the fulltext and
//    dive site registration around the swap), and the Edit* command texts;
//  - the tag-like lists (tags, buddies, dive guide) from EditTagsBase: only
//    the entries added or removed change, the order of the others is kept;
//  - the commit message text from commands/command_base.cpp: changesMade();
//  - the save flow from mobile-widgets/qmlmanager.cpp: saveChangesLocal()
//    (refuse unless classify_git_save() says "normal", then save with
//    git_local_only) and saveChangesCloud() (then reload with sync).
#include "opendives.h"
#include "internal.h"
#include "json.h"

#include "core/device.h"
#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/sample.h"
#include "core/divefilter.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/equipment.h"
#include "core/filterpreset.h"
#include "core/filterpresettable.h"
#include "core/subsurface-time.h"
#include "core/file.h"
#include "core/fulltext.h"
#include "core/git-access.h"
#include "core/pref.h"
#include "core/tag.h"
#include "core/trip.h"
#include "core/taxonomy.h"
#include "core/compat/platform_https.h"
#include "core/qthelper.h"
#include "core/version.h"
#include "commands/command.h"

#include <git2.h>
#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <initializer_list>
#include <map>
#include <memory>
#include <set>
#include <thread>
#include <vector>

// save-git.cpp: checks out a new tree in a non-bare repository (not in a header).
int update_git_checkout(git_repository *repo, git_object *parent, git_tree *tree);

namespace opendives {

using internal::JsonReader;
using internal::JsonValue;

namespace {

void append_json_string(std::string &out, const std::string &s)
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

// ---------------------------------------------------------------------------
// Undo stack: for each step, the dive's previous contents and the command
// text, as Subsurface's EditDive keeps the old and new dives.

// A dive moved to a trip (null: out of any trip); after a move, `trip` holds
// the previous one, so the same move done again reverts it.
struct TripMove {
	dive *d;
	dive_trip *trip;
};

// A dive out of the log, with the trip and site it goes back to (Subsurface's
// DiveToAdd, commands/command_divelist.h).
struct DiveToAdd {
	std::unique_ptr<dive> d;
	dive_trip *trip = nullptr;
	dive_site *site = nullptr;
};

// Dives, trips and sites to put in the log (owned), and those to take out:
// Subsurface's DivesAndTripsToAdd and DivesAndSitesToRemove.
struct DiveListChange {
	std::vector<DiveToAdd> dives;
	std::vector<std::unique_ptr<dive_trip>> trips;
	std::vector<std::unique_ptr<dive_site>> sites;
	std::vector<dive *> remove_dives;
	std::vector<dive_site *> remove_sites;
};

struct Step {
	enum Kind { DIVE, TRIP_FIELD, MOVE, SITE_FIELD, SITES, CYLINDER_TYPE, DIVE_LIST, FILTER_PRESET, RENUMBER } kind = DIVE;
	// DIVE_LIST: as Subsurface's AddDive and ImportDives: what the next undo
	// or redo puts in and takes out; for an import, the dive computers and
	// filter presets it brings, and whether they are in the log now.
	DiveListChange list;
	std::vector<device> devices;
	std::vector<std::pair<std::string, FilterData>> presets_to_add;
	std::vector<int> presets_to_remove;
	bool list_applied = false;
	// RENUMBER: as Subsurface's RenumberDives, each dive with the number to
	// swap in; after each undo or redo it holds the previous numbers.
	std::vector<std::pair<dive *, int>> renumbered;
	// A download from a dive computer (download.cpp): the core's fingerprint
	// table to swap in on the next undo or redo, so that undoing the download
	// also forgets the fingerprint of its newest dive (an OpenDives addition:
	// Subsurface keeps it, and the next download then skips those dives).
	bool swap_fingerprints = false;
	fingerprint_table fingerprints;
	// FILTER_PRESET: as CreateFilterPreset, RemoveFilterPreset and
	// EditFilterPreset (commands/command_filter.cpp).
	enum PresetOp { CREATE, REMOVE, EDIT } preset_op = CREATE;
	int preset_index = 0;
	std::string preset_name;
	FilterData preset_data;
	bool preset_applied = false;
	// DIVE: the dive and the contents to swap in on the next undo or redo.
	int dive_id = 0;
	std::unique_ptr<dive> other;
	// TRIP_FIELD: the trip, which field, and the value to swap in.
	dive_trip *trip = nullptr;
	bool notes = false;
	std::string value;
	// MOVE: as Subsurface's DivesToTrip (commands/command_divelist.h).
	std::vector<TripMove> moves;
	std::vector<std::unique_ptr<dive_trip>> trips_to_add;
	// SITE_FIELD: a site, which field (0 name, 1 description, 2 notes,
	// 3 location, 4 taxonomy) and the value to swap in.
	dive_site *site = nullptr;
	int site_field = 0;
	location_t location {};
	taxonomy_data taxonomy;
	// SITES: as Subsurface's AddDiveSite, DeleteDiveSites and MergeDiveSites:
	// sites to remove from the core, or removed ones (owned) to put back;
	// for a merge, the site that receives their dives.
	std::vector<dive_site *> sites_to_remove;
	std::vector<std::unique_ptr<dive_site>> sites_to_add;
	dive_site *merge_into = nullptr;
	// CYLINDER_TYPE: as Subsurface's RenameCylinderType, the cylinders of that
	// type in the log; after each undo or redo, `value` holds the name to put
	// back and `type_name` the name in use.
	std::vector<std::pair<dive *, int>> cylinders;
	std::string type_name;
	std::string text;
};

std::vector<Step> steps;
size_t applied = 0;           // steps currently applied (QUndoStack::index())
long clean_index = 0;         // `applied` at the last save; -1 if unreachable
long next_to_write = 0;       // changesMade(): first step not yet in a commit message
int loaded_format_version = 0; // "version" line of 00-Subsurface; 0 if unknown

// Cloud write lock (plan, section 4).
std::string cloud_test_email;
bool cloud_writes_enabled = false;

// is_git_repository() resets git_remote_sync_successful (it expects a new
// remote): the façade's own lookups after a sync must keep the flag.
bool git_info_of(const std::string &log, struct git_info &info)
{
	bool kept = git_remote_sync_successful;
	bool found = is_git_repository(log.c_str(), &info);
	git_remote_sync_successful = kept;
	return found;
}

const std::string &step_text(long i)
{
	static const std::string none;
	return i >= 0 && static_cast<size_t>(i) < steps.size() ? steps[i].text : none;
}

// Port of Command::changesMade() (commands/command_base.cpp): the texts of the
// commands since the last commit, "(undo) " before the ones walked back.
std::string changes_made()
{
	long cur = static_cast<long>(applied);
	std::string texts;
	if (cur > next_to_write) {
		for (long i = next_to_write; i < cur; i++)
			texts += step_text(i) + "\n";
	} else if (cur < next_to_write) {
		for (long i = next_to_write - 1; i >= cur; i--)
			texts += "(undo) " + step_text(i) + "\n";
	} else if (cur > 0) {
		// Something was undone, then something else done: only the last change is known.
		texts += step_text(cur - 1) + "\n";
	}
	next_to_write = cur;
	return texts;
}

struct HookInstaller {
	HookInstaller() { opendives_compat::changes_made_hook = changes_made; }
} hook_installer;

// Port of EditDive::exchangeDives(): `other` holds the contents to put in
// `d`; afterwards it holds the previous contents. The dive site travels in
// `other.dive_site` while `other` is not a registered dive.
void exchange(dive *d, dive &other)
{
	fulltext_unregister(d);
	dive_site *old_site = d->dive_site;
	if (old_site)
		unregister_dive_from_dive_site(d); // sets d->dive_site to null
	dive_site *new_site = other.dive_site;
	other.dive_site = nullptr;
	std::swap(*d, other);
	fulltext_register(d);
	if (new_site)
		new_site->add_dive(d);
	other.dive_site = old_site;
	d->invalidate_cache(); // so that save-git writes this dive again
}

// Port of moveDiveToTrip() (commands/command_divelist.cpp), without the
// selection and the signals: an emptied trip leaves the trip table and is
// returned, owned, to be put back on the next undo or redo.
std::unique_ptr<dive_trip> move_dive_to_trip(TripMove &move)
{
	if (move.trip == move.d->divetrip)
		return {};
	std::unique_ptr<dive_trip> removed;
	dive_trip *trip = unregister_dive_from_trip(move.d);
	if (trip && trip->dives.empty()) {
		auto [t, idx] = divelog.trips.pull(trip);
		removed = std::move(t);
	}
	std::swap(trip, move.trip);
	if (trip)
		trip->add_dive(move.d);
	move.d->invalidate_cache(); // so that save-git writes this dive again
	return removed;
}

// Port of moveDivesBetweenTrips(): put back the trips to add, move each dive,
// keep the trips that became empty. Doing it twice is a no-op.
void move_dives_between_trips(Step &step)
{
	for (std::unique_ptr<dive_trip> &trip: step.trips_to_add)
		divelog.trips.put(std::move(trip));
	step.trips_to_add.clear();
	for (TripMove &move: step.moves) {
		std::unique_ptr<dive_trip> removed = move_dive_to_trip(move);
		if (removed)
			step.trips_to_add.push_back(std::move(removed));
	}
	divelog.trips.sort(); // as TripBase::redoit()
}

dive_trip *trip_by_id(int id)
{
	for (auto &trip: divelog.trips)
		if (trip->id == id)
			return trip.get();
	return nullptr;
}

// Ports of addDiveSites() and removeDiveSites() (commands/command_divesite.cpp),
// without signals. A removed site keeps its list of dives for the undo. The
// dives' cache is invalidated so that their site is written again (Subsurface
// does not do it here).
std::vector<dive_site *> add_sites(std::vector<std::unique_ptr<dive_site>> &sites)
{
	std::vector<dive_site *> res;
	for (std::unique_ptr<dive_site> &ds: sites) {
		for (dive *d: ds->dives) {
			d->dive_site = ds.get();
			d->invalidate_cache();
		}
		res.push_back(divelog.sites.register_site(std::move(ds)).ptr);
	}
	sites.clear();
	return res;
}

std::vector<std::unique_ptr<dive_site>> remove_sites(std::vector<dive_site *> &sites)
{
	std::vector<std::unique_ptr<dive_site>> res;
	for (dive_site *ds: sites) {
		for (dive *d: ds->dives) {
			d->dive_site = nullptr;
			d->invalidate_cache();
		}
		res.push_back(std::move(divelog.sites.pull(ds).ptr));
	}
	sites.clear();
	return res;
}

// Redo and undo of a SITES step (AddDiveSite, DeleteDiveSites, MergeDiveSites).
void apply_sites(Step &step)
{
	if (!step.sites_to_remove.empty()) {
		step.sites_to_add = remove_sites(step.sites_to_remove);
		if (step.merge_into) {
			for (const std::unique_ptr<dive_site> &site: step.sites_to_add)
				for (dive *d: site->dives) {
					step.merge_into->add_dive(d);
					d->invalidate_cache();
				}
		}
	} else {
		if (step.merge_into) {
			for (const std::unique_ptr<dive_site> &site: step.sites_to_add)
				for (dive *d: site->dives) {
					unregister_dive_from_dive_site(d);
					d->invalidate_cache();
				}
		}
		step.sites_to_remove = add_sites(step.sites_to_add);
	}
}

// Redo and undo of a SITE_FIELD step: the value is swapped.
void apply_site_field(Step &step)
{
	dive_site *ds = step.site;
	switch (step.site_field) {
	case 0: std::swap(ds->name, step.value); break;
	case 1: std::swap(ds->description, step.value); break;
	case 2: std::swap(ds->notes, step.value); break;
	case 3: std::swap(ds->location, step.location); break;
	default: std::swap(ds->taxonomy, step.taxonomy); break;
	}
	for (dive *d: ds->dives)
		d->invalidate_cache();
}

// "#12", or "@" and the date when the dive has no number. Subsurface's
// diveNumberOrDate() uses the date format of the user's settings; a fixed
// format is used here.
std::string dive_number_or_date(const dive &d)
{
	if (d.number != 0)
		return "#" + std::to_string(d.number);
	time_t t = static_cast<time_t>(d.when);
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M", &tm);
	return std::string("@") + buf;
}

std::string trim(const std::string &s)
{
	size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
	return a == std::string::npos ? std::string() : s.substr(a, b - a + 1);
}

// Port of stringToList() (core/qthelper.cpp): split on commas, trim, skip empty.
std::vector<std::string> string_to_list(const std::string &s)
{
	std::vector<std::string> out;
	size_t start = 0;
	while (start <= s.size()) {
		size_t comma = s.find(',', start);
		std::string item = s.substr(start, comma == std::string::npos ? std::string::npos : comma - start);
		if (!item.empty()) // SkipEmptyParts applies before trimming
			out.push_back(trim(item));
		if (comma == std::string::npos)
			break;
		start = comma + 1;
	}
	return out;
}

std::string join(const std::vector<std::string> &list)
{
	std::string out;
	for (size_t i = 0; i < list.size(); i++) {
		if (i)
			out += ", ";
		out += list[i];
	}
	return out;
}

bool contains(const std::vector<std::string> &list, const std::string &s)
{
	return std::find(list.begin(), list.end(), s) != list.end();
}

// Port of EditTagsBase::workToBeDone() and undo() for one dive: returns
// false when nothing changes; otherwise `list` becomes the old list without
// the removed entries, then the added ones.
bool apply_tag_edit(std::vector<std::string> &list, const std::vector<std::string> &wanted_in)
{
	std::vector<std::string> wanted;
	for (const std::string &s: wanted_in) { // the edit field gives trimmed entries
		std::string t = trim(s);
		if (!t.empty())
			wanted.push_back(t);
	}
	std::vector<std::string> to_add, to_remove;
	for (const std::string &s: wanted)
		if (!contains(list, s))
			to_add.push_back(s);
	for (const std::string &s: list)
		if (!contains(wanted, s))
			to_remove.push_back(s);
	if (to_add.empty() && to_remove.empty())
		return false;
	for (const std::string &s: to_remove)
		list.erase(std::remove(list.begin(), list.end(), s), list.end());
	for (const std::string &s: to_add)
		if (!contains(list, s))
			list.push_back(s);
	return true;
}

std::vector<std::string> tag_names(const dive &d)
{
	std::vector<std::string> out;
	for (const divetag *tag: d.tags)
		out.push_back(tag->name);
	return out;
}

// Format version of the log in memory, from the "version" line of
// 00-Subsurface in the commit that was loaded.
int read_format_version()
{
	const std::string &log = internal::current_log();
	if (log.empty() || loaded_git_commit.empty())
		return 0;
	struct git_info info;
	if (!git_info_of(log, info))
		return 0;
	git_repository *repo = nullptr;
	if (git_repository_open(&repo, info.localdir.c_str()))
		return 0;
	int version = 0;
	git_oid oid;
	git_commit *commit = nullptr;
	git_tree *tree = nullptr;
	git_tree_entry *entry = nullptr;
	git_blob *blob = nullptr;
	if (!git_oid_fromstr(&oid, loaded_git_commit.c_str()) &&
	    !git_commit_lookup(&commit, repo, &oid) &&
	    !git_commit_tree(&tree, commit) &&
	    !git_tree_entry_bypath(&entry, tree, "00-Subsurface") &&
	    !git_blob_lookup(&blob, repo, git_tree_entry_id(entry))) {
		std::string text(static_cast<const char *>(git_blob_rawcontent(blob)), git_blob_rawsize(blob));
		size_t pos = 0;
		while (pos < text.size()) {
			size_t eol = text.find('\n', pos);
			std::string line = text.substr(pos, eol == std::string::npos ? std::string::npos : eol - pos);
			if (line.rfind("version ", 0) == 0)
				version = atoi(line.c_str() + 8);
			if (eol == std::string::npos)
				break;
			pos = eol + 1;
		}
	}
	git_blob_free(blob);
	git_tree_entry_free(entry);
	git_tree_free(tree);
	git_commit_free(commit);
	git_repository_free(repo);
	return version;
}

bool account_writes_allowed(const std::string &email)
{
	if (cloud_writes_enabled)
		return true;
	std::string a = email, b = cloud_test_email;
	std::transform(a.begin(), a.end(), a.begin(), [](unsigned char c) { return std::tolower(c); });
	std::transform(b.begin(), b.end(), b.begin(), [](unsigned char c) { return std::tolower(c); });
	return !b.empty() && a == b;
}

bool writes_allowed()
{
	if (!internal::current_log_is_cloud())
		return true; // a local log cannot affect the cloud (plan, section 4)
	return account_writes_allowed(prefs.cloud_storage_email);
}

bool is_git_log(const std::string &log)
{
	struct git_info info;
	return !log.empty() && git_info_of(log, info);
}

// Port of cloudDestinationIsSafe(): only "normal" may be saved.
int check_destination(const std::string &log, std::string &error)
{
	struct git_info info;
	if (!git_info_of(log, info)) {
		error = "NOT_GIT";
		return -1;
	}
	switch (classify_git_save(&info)) {
	case git_save_kind::normal:
		return 0;
	case git_save_kind::replacement:
		error = "SAVE_REPLACEMENT";
		return -1;
	default:
		error = "SAVE_ERROR: cannot inspect the destination";
		return -1;
	}
}

int save_to(const std::string &log, std::string &error)
{
	if (check_destination(log, error))
		return -1;
	bool was_local_only = git_local_only;
	git_local_only = true;
	int ret = save_dives(log.c_str());
	git_local_only = was_local_only;
	if (ret) {
		error = "SAVE_ERROR: save_dives returned " + std::to_string(ret);
		return -1;
	}
	return 0;
}

// Local branch and remote-tracking branch of a git log, as commit ids; empty
// when missing.
struct Heads {
	std::string local, remote;
};

std::string ref_target(git_repository *repo, const std::string &name)
{
	git_oid oid;
	if (git_reference_name_to_id(&oid, repo, name.c_str()))
		return std::string();
	char sha[GIT_OID_HEXSZ + 1];
	git_oid_tostr(sha, sizeof(sha), &oid);
	return sha;
}

int open_log_repo(const std::string &log, git_repository **repo, std::string &branch)
{
	struct git_info info;
	if (!git_info_of(log, info))
		return -1;
	branch = info.branch;
	return git_repository_open(repo, info.localdir.c_str());
}

Heads read_heads(const std::string &log)
{
	Heads heads;
	git_repository *repo = nullptr;
	std::string branch;
	if (open_log_repo(log, &repo, branch))
		return heads;
	heads.local = ref_target(repo, "refs/heads/" + branch);
	heads.remote = ref_target(repo, "refs/remotes/origin/" + branch);
	git_repository_free(repo);
	return heads;
}

// Is commit `a` the same as or a descendant of `b`, in the log's repository?
// False when either is unknown locally.
bool includes(const std::string &log, const std::string &a, const std::string &b)
{
	if (a.empty() || b.empty())
		return false;
	if (a == b)
		return true;
	git_repository *repo = nullptr;
	std::string branch;
	if (open_log_repo(log, &repo, branch))
		return false;
	git_oid oa, ob;
	bool result = !git_oid_fromstr(&oa, a.c_str()) && !git_oid_fromstr(&ob, b.c_str()) &&
		      git_graph_descendant_of(repo, &oa, &ob) == 1;
	git_repository_free(repo);
	return result;
}

// Local commits not yet on the server (not reachable from the
// remote-tracking branch), newest first.
struct PendingCommit {
	std::string id, summary, message;
};

std::vector<PendingCommit> list_pending(const std::string &log)
{
	std::vector<PendingCommit> out;
	git_repository *repo = nullptr;
	std::string branch;
	if (open_log_repo(log, &repo, branch))
		return out;
	git_revwalk *walk = nullptr;
	if (!git_revwalk_new(&walk, repo) && !git_revwalk_push_ref(walk, ("refs/heads/" + branch).c_str())) {
		git_revwalk_hide_ref(walk, ("refs/remotes/origin/" + branch).c_str()); // absent: everything is pending
		git_oid oid;
		while (!git_revwalk_next(&oid, walk)) {
			git_commit *commit = nullptr;
			if (git_commit_lookup(&commit, repo, &oid))
				continue;
			char sha[GIT_OID_HEXSZ + 1];
			git_oid_tostr(sha, sizeof(sha), &oid);
			const char *summary = git_commit_summary(commit);
			const char *message = git_commit_message(commit);
			out.push_back({ sha, summary ? summary : "", message ? message : "" });
			git_commit_free(commit);
		}
	}
	git_revwalk_free(walk);
	git_repository_free(repo);
	return out;
}

int pending_count()
{
	return internal::current_log_is_cloud() ? static_cast<int>(list_pending(internal::current_log()).size()) : 0;
}

std::string sync_json(const std::string &status, bool reloaded)
{
	std::string json = "{\"status\":\"" + status + "\",\"pending\":" + std::to_string(pending_count());
	json += ",\"reloaded\":";
	json += reloaded ? "true" : "false";
	json += '}';
	return json;
}

} // namespace

// ---------------------------------------------------------------------------

namespace internal {

bool cloud_writes_allowed_for(const std::string &email)
{
	return account_writes_allowed(email);
}

int pending_for(const std::string &log)
{
	return static_cast<int>(list_pending(log).size());
}

void on_log_loaded()
{
	download_forget_partial();
	steps.clear();
	applied = 0;
	clean_index = 0;
	next_to_write = 0;
	loaded_format_version = read_format_version();
	// The cylinder types of the new log (as clear_dive_file_data() before a load).
	reset_tank_info_table(tank_info_table);
}

} // namespace internal

int edit_dive(int id, const std::string &changes_json, std::string &result_json, std::string &error)
{
	dive *d = divelog.dives.get_by_uniq_id(id);
	if (!d) {
		error = "NOT_FOUND";
		return -1;
	}
	if (loaded_format_version > dataformat_version) {
		error = "FORMAT_NEWER";
		return -1;
	}
	std::vector<std::pair<std::string, JsonValue>> changes;
	if (!JsonReader(changes_json).object(changes)) {
		error = "BAD_REQUEST: invalid JSON";
		return -1;
	}

	auto copy = std::make_unique<dive>(*d);
	std::vector<std::string> fields; // names as in Subsurface's Edit* commands
	for (const auto &[key, value]: changes) {
		if (key == "notes" || key == "suit") {
			if (value.kind != JsonValue::STRING) {
				error = "BAD_REQUEST: " + key + " must be a string";
				return -1;
			}
			std::string &target = key == "notes" ? copy->notes : copy->suit;
			if (target != value.text) {
				target = value.text;
				fields.push_back(key);
			}
		} else if (key == "rating" || key == "visibility" || key == "wavesize" || key == "current" || key == "surge" ||
			   key == "chill") {
			// 0 to 5 star ratings (EditRating, EditVisibility, EditWaveSize,
			// EditCurrent, EditSurge, EditChill); the field name is the command's.
			if (value.kind != JsonValue::NUMBER || value.number < 0 || value.number > 5) {
				error = "BAD_REQUEST: " + key + " must be an integer from 0 to 5";
				return -1;
			}
			int &target = key == "rating" ? copy->rating : key == "visibility" ? copy->visibility
				    : key == "wavesize" ? copy->wavesize : key == "current" ? copy->current
				    : key == "surge" ? copy->surge : copy->chill;
			if (target != value.number) {
				target = static_cast<int>(value.number);
				fields.push_back(key);
			}
		} else if (key == "buddies" || key == "diveguide") {
			if (value.kind != JsonValue::LIST) {
				error = "BAD_REQUEST: " + key + " must be a list of strings";
				return -1;
			}
			std::string &target = key == "buddies" ? copy->buddy : copy->diveguide;
			std::vector<std::string> list = string_to_list(target);
			if (apply_tag_edit(list, value.list)) {
				target = join(list); // EditBuddies::set(): v.join(", ")
				fields.push_back(key == "buddies" ? "buddies" : "dive guide");
			}
		} else if (key == "tags") {
			if (value.kind != JsonValue::LIST) {
				error = "BAD_REQUEST: tags must be a list of strings";
				return -1;
			}
			std::vector<std::string> list = tag_names(*copy);
			if (apply_tag_edit(list, value.list)) {
				// EditTags::set()
				copy->tags.clear();
				for (const std::string &tag: list)
					taglist_add_tag(copy->tags, tag);
				taglist_cleanup(copy->tags);
				fields.push_back("tags");
			}
		} else if (key == "site") {
			// EditDiveSite: the dive's site by uuid; 0: no site.
			if (value.kind != JsonValue::NUMBER) {
				error = "BAD_REQUEST: site must be a site uuid";
				return -1;
			}
			dive_site *ds = value.number ? divelog.sites.get_by_uuid(static_cast<uint32_t>(value.number)) : nullptr;
			if (value.number && !ds) {
				error = "NOT_FOUND";
				return -1;
			}
			if (copy->dive_site != ds) {
				copy->dive_site = ds;
				fields.push_back("dive site");
			}
		} else {
			error = "BAD_REQUEST: unknown field " + key;
			return -1;
		}
	}

	if (!fields.empty()) {
		// One field: the desktop text ("Edit notes [#12]"); several: the
		// mobile text ("Edit dive [#12]"), as Subsurface-mobile edits a whole dive.
		std::string what = fields.size() == 1 ? "Edit " + fields[0] : "Edit dive";
		std::string text = what + " [" + dive_number_or_date(*d) + "]";
		exchange(d, *copy);
		// A new step drops the steps that were undone, as QUndoStack::push() does.
		if (applied < steps.size()) {
			if (clean_index > static_cast<long>(applied))
				clean_index = -1;
			steps.resize(applied);
		}
		Step step;
		step.dive_id = id;
		step.other = std::move(copy);
		step.text = text;
		steps.push_back(std::move(step));
		applied++;
	}
	return internal::dive_json(id, result_json, error);
}

// ---------------------------------------------------------------------------
// Trips (spec, section 4, "Trip"). Trip identifiers are those of the load:
// valid until the next one, never stored.

static std::string iso_time(timestamp_t when)
{
	time_t t = static_cast<time_t>(when);
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tm);
	return buf;
}

int trip_json(int trip_id, std::string &json, std::string &error)
{
	(void)error;
	dive_trip *trip = trip_by_id(trip_id);
	if (!trip) {
		json = "{\"tripId\":0}"; // the trip no longer exists (emptied)
		return 0;
	}
	json = "{\"tripId\":" + std::to_string(trip->id) + ",\"location\":";
	append_json_string(json, trip->location);
	json += ",\"notes\":";
	append_json_string(json, trip->notes);
	json += ",\"autogen\":";
	json += trip->autogen ? "true" : "false";
	json += ",\"dives\":[";
	bool first = true;
	for (const dive *d: trip->dives) {
		if (!first)
			json += ',';
		first = false;
		json += "{\"id\":" + std::to_string(d->id) + ",\"number\":" + std::to_string(d->number) + ",\"date\":";
		append_json_string(json, iso_time(d->when));
		json += ",\"durationSeconds\":" + std::to_string(d->duration.seconds) + ",\"site\":";
		append_json_string(json, d->dive_site ? d->dive_site->name : std::string());
		json += '}';
	}
	json += "]}";
	return 0;
}

// Adds a step that is already applied, as QUndoStack::push() does.
static void push_step(Step step)
{
	if (applied < steps.size()) {
		if (clean_index > static_cast<long>(applied))
			clean_index = -1;
		steps.resize(applied);
	}
	steps.push_back(std::move(step));
	applied++;
}

// Port of getListOfDives() (commands/command_base.cpp): at most five
// numbers, or four and "...".
static std::string list_of_dives(const std::vector<dive *> &dives)
{
	if (dives.size() == divelog.dives.size())
		return "all dives";
	std::string out;
	int i = 0;
	for (dive *d: dives) {
		if (++i == 4 && dives.size() >= 5)
			return out + "...";
		out += dive_number_or_date(*d) + ", ";
	}
	if (!out.empty())
		out.resize(out.size() - 2);
	return out;
}

// Applies a MOVE step and keeps it; the result is the trip shown.
static int do_move(Step step, int show_trip, std::string &json, std::string &error)
{
	if (step.moves.empty()) {
		error = "NOTHING_TO_DO";
		return -1;
	}
	move_dives_between_trips(step);
	push_step(std::move(step));
	return trip_json(show_trip, json, error);
}

int edit_trip(int trip_id, const std::string &field, const std::string &value, std::string &json, std::string &error)
{
	dive_trip *trip = trip_by_id(trip_id);
	if (!trip) {
		error = "NOT_FOUND";
		return -1;
	}
	if (field != "location" && field != "notes") {
		error = "BAD_REQUEST: unknown trip field " + field;
		return -1;
	}
	Step step;
	step.kind = Step::TRIP_FIELD;
	step.trip = trip;
	step.notes = field == "notes";
	std::string &target = step.notes ? trip->notes : trip->location;
	if (target != value) { // EditTripBase::workToBeDone()
		step.value = target;
		target = value;
		step.text = step.notes ? "Edit trip notes" : "Edit trip location";
		push_step(std::move(step));
	}
	return trip_json(trip_id, json, error);
}

// RemoveDivesFromTrip: the dives leave their trip and are not autogrouped again.
static int remove_from_trip(const std::vector<dive *> &all, int show_trip, std::string &json, std::string &error)
{
	std::vector<dive *> dives;
	for (dive *d: all)
		if (d->divetrip)
			dives.push_back(d);
	Step step;
	step.kind = Step::MOVE;
	step.text = "remove " + std::to_string(dives.size()) + " dive(s) from trip [" + list_of_dives(dives) + "]";
	for (dive *d: dives) {
		d->notrip = true;
		step.moves.push_back({ d, nullptr });
	}
	return do_move(std::move(step), show_trip, json, error);
}

int trip_remove_dive(int dive_id, std::string &json, std::string &error)
{
	dive *d = divelog.dives.get_by_uniq_id(dive_id);
	if (!d || !d->divetrip) {
		error = "NOT_FOUND";
		return -1;
	}
	return remove_from_trip({ d }, d->divetrip->id, json, error);
}

int trip_ungroup(int trip_id, std::string &json, std::string &error)
{
	dive_trip *trip = trip_by_id(trip_id);
	if (!trip) {
		error = "NOT_FOUND";
		return -1;
	}
	std::vector<dive *> dives(trip->dives.begin(), trip->dives.end());
	return remove_from_trip(dives, trip_id, json, error);
}

int trip_split_at(int dive_id, std::string &json, std::string &error)
{
	dive *d = divelog.dives.get_by_uniq_id(dive_id);
	if (!d || !d->divetrip) {
		error = "NOT_FOUND";
		return -1;
	}
	// The dives from this one on go into a new trip (CreateTrip).
	std::vector<dive *> later;
	for (dive *other: d->divetrip->dives)
		if (other->when >= d->when)
			later.push_back(other);
	if (later.size() == d->divetrip->dives.size()) {
		error = "NOTHING_TO_DO"; // the first dive: nothing to split
		return -1;
	}
	Step step;
	step.kind = Step::MOVE;
	step.text = "create trip";
	std::unique_ptr<dive_trip> trip = create_trip_from_dive(later[0]);
	dive_trip *new_trip = trip.get();
	for (dive *other: later)
		step.moves.push_back({ other, new_trip });
	step.trips_to_add.push_back(std::move(trip));
	int keep = d->divetrip->id;
	return do_move(std::move(step), keep, json, error);
}

int trips_merge(int trip_id, int other_id, std::string &json, std::string &error)
{
	dive_trip *a = trip_by_id(trip_id), *b = trip_by_id(other_id);
	if (!a || !b || a == b) {
		error = "NOT_FOUND";
		return -1;
	}
	// MergeTrips: a new trip combining both (Subsurface sets no command text).
	Step step;
	step.kind = Step::MOVE;
	step.text = "merge trips";
	std::unique_ptr<dive_trip> trip = combine_trips(a, b);
	dive_trip *merged = trip.get();
	for (dive *d: a->dives)
		step.moves.push_back({ d, merged });
	for (dive *d: b->dives)
		step.moves.push_back({ d, merged });
	step.trips_to_add.push_back(std::move(trip));
	int show = merged->id;
	return do_move(std::move(step), show, json, error);
}

int trip_add_dives(int trip_id, const std::vector<int> &dive_ids, std::string &json, std::string &error)
{
	dive_trip *trip = trip_by_id(trip_id);
	if (!trip) {
		error = "NOT_FOUND";
		return -1;
	}
	std::vector<dive *> dives;
	for (int id: dive_ids) {
		dive *d = divelog.dives.get_by_uniq_id(id);
		if (d && d->divetrip != trip)
			dives.push_back(d);
	}
	Step step;
	step.kind = Step::MOVE;
	step.text = "add " + std::to_string(dives.size()) + " dives to trip [" + list_of_dives(dives) + "]";
	for (dive *d: dives)
		step.moves.push_back({ d, trip });
	return do_move(std::move(step), trip_id, json, error);
}

// MainWindow::on_actionAutoGroup_triggered(): the flag, then AutogroupDives or
// RemoveAutogenTrips (commands/command_divelist.cpp).
int trips_autogroup(bool on, std::string &json, std::string &error)
{
	divelog.autogroup = on;
	Step step;
	step.kind = Step::MOVE;
	if (on) {
		step.text = "autogroup dives";
		for (auto &entry: get_dives_to_autogroup(divelog.dives)) {
			if (entry.created_trip)
				step.trips_to_add.push_back(std::move(entry.created_trip));
			for (auto it = divelog.dives.begin() + entry.from; it != divelog.dives.begin() + entry.to; ++it)
				step.moves.push_back({ it->get(), entry.trip });
		}
	} else {
		step.text = "remove autogenerated trips";
		for (auto &d: divelog.dives)
			if (d->divetrip && d->divetrip->autogen)
				step.moves.push_back({ d.get(), nullptr });
	}
	if (step.moves.empty()) // TripBase::workToBeDone()
		return trip_json(0, json, error);
	move_dives_between_trips(step);
	dive *first = step.moves[0].d;
	int show = first->divetrip ? first->divetrip->id : 0;
	push_step(std::move(step));
	return trip_json(show, json, error);
}

// RenameCylinderType::redo() and undo(): from step.type_name to step.value,
// then the two names are swapped for the next undo or redo.
static void apply_cylinder_type(Step &step)
{
	const std::string &from = step.type_name, &to = step.value;
	for (auto &[d, idx]: step.cylinders) {
		d->cylinders[idx].type.description = to;
		d->invalidate_cache(); // so that save-git writes this dive again
	}
	if (tank_info *info = get_tank_info(tank_info_table, from))
		info->name = to;
	if (tank_info *info = get_tank_info(get_tank_info_baseline(), from))
		info->name = to;
	std::swap(step.type_name, step.value);
}

int cylinder_type_rename(const std::string &old_name, const std::string &new_name_in, std::string &json,
			 std::string &error)
{
	// TankInfoModel::setData(): trimmed, not empty, not the same, not in use.
	std::string new_name = trim(new_name_in);
	if (new_name.empty() || new_name == old_name)
		return cylinder_types(json);
	if (internal::cylinder_type_name_in_use(new_name)) {
		error = "NAME_IN_USE";
		return -1;
	}
	Step step;
	step.kind = Step::CYLINDER_TYPE;
	step.cylinders = find_cylinders_with_type_description(old_name);
	// RenameCylinderType::workToBeDone()
	if (step.cylinders.empty() && !get_tank_info(tank_info_table, old_name) &&
	    !get_tank_info(get_tank_info_baseline(), old_name)) {
		error = "NOT_FOUND";
		return -1;
	}
	std::vector<dive *> affected;
	for (auto &[d, idx]: step.cylinders)
		if (std::find(affected.begin(), affected.end(), d) == affected.end())
			affected.push_back(d);
	step.text = affected.size() <= 1 ? "Rename cylinder type"
					 : "Rename cylinder type (" + std::to_string(affected.size()) + " dive(s))";
	step.type_name = old_name;
	step.value = new_name;
	apply_cylinder_type(step);
	push_step(std::move(step));
	return cylinder_types(json);
}

// ---------------------------------------------------------------------------
// Dive sites (spec, section 4, "Sites"). Sites are identified by their uuid.

static std::string iso_time(timestamp_t when);

static void append_site_summary(std::string &json, const dive_site &ds)
{
	json += "{\"uuid\":" + std::to_string(ds.uuid) + ",\"name\":";
	append_json_string(json, ds.name);
	json += ",\"hasLocation\":";
	json += has_location(&ds.location) ? "true" : "false";
	json += ",\"latUdeg\":" + std::to_string(ds.location.lat.udeg);
	json += ",\"lonUdeg\":" + std::to_string(ds.location.lon.udeg);
	json += ",\"country\":";
	append_json_string(json, taxonomy_get_country(ds.taxonomy));
	json += ",\"dives\":" + std::to_string(ds.dives.size());
	// The latest dive and the deepest, for the list of sites.
	timestamp_t last = 0;
	int deepest = 0;
	for (const dive *d: ds.dives) {
		last = std::max(last, d->when);
		deepest = std::max(deepest, d->maxdepth.mm);
	}
	json += ",\"lastDate\":";
	append_json_string(json, last ? iso_time(last) : std::string());
	json += ",\"maxDepthMm\":" + std::to_string(deepest) + '}';
}

int sites_json(std::string &json)
{
	json = "[";
	bool first = true;
	for (const auto &ds: divelog.sites) {
		if (!first)
			json += ',';
		first = false;
		append_site_summary(json, *ds);
	}
	json += ']';
	return 0;
}

static const taxonomy *find_taxonomy(const taxonomy_data &t, taxonomy_category cat)
{
	for (const taxonomy &entry: t)
		if (entry.category == cat)
			return &entry;
	return nullptr;
}

static void append_taxonomy_entry(std::string &json, const char *key, const taxonomy_data &t, taxonomy_category cat)
{
	const taxonomy *entry = find_taxonomy(t, cat);
	json += std::string(",\"") + key + "\":{\"value\":";
	append_json_string(json, entry ? entry->value : std::string());
	json += ",\"manual\":";
	json += entry && entry->origin == GEOMANUAL ? "true" : "false";
	json += '}';
}

int site_json(uint32_t uuid, std::string &json, std::string &error)
{
	(void)error;
	dive_site *ds = uuid ? divelog.sites.get_by_uuid(uuid) : nullptr;
	if (!ds) {
		json = "{\"uuid\":0}"; // the site no longer exists
		return 0;
	}
	append_site_summary(json = std::string(), *ds);
	json.pop_back(); // reopen the object
	json += ",\"description\":";
	append_json_string(json, ds->description);
	json += ",\"notes\":";
	append_json_string(json, ds->notes);
	append_taxonomy_entry(json, "countryTaxonomy", ds->taxonomy, TC_COUNTRY);
	append_taxonomy_entry(json, "region", ds->taxonomy, TC_ADMIN_L1);
	append_taxonomy_entry(json, "city", ds->taxonomy, TC_LOCALNAME);
	json += ",\"diveList\":[";
	bool first = true;
	for (const dive *d: ds->dives) {
		if (!first)
			json += ',';
		first = false;
		json += "{\"id\":" + std::to_string(d->id) + ",\"number\":" + std::to_string(d->number) + ",\"date\":";
		append_json_string(json, iso_time(d->when));
		json += ",\"durationSeconds\":" + std::to_string(d->duration.seconds) + ",\"maxDepthMm\":" +
			std::to_string(d->maxdepth.mm) + '}';
	}
	json += "]}";
	return 0;
}

int site_nearby(int lat_udeg, int lon_udeg, int distance_m, std::string &json)
{
	location_t loc;
	loc.lat.udeg = lat_udeg;
	loc.lon.udeg = lon_udeg;
	dive_site *ds = divelog.sites.get_by_gps_proximity(loc, distance_m);
	if (!ds) {
		json = "null";
		return 0;
	}
	json.clear();
	append_site_summary(json, *ds);
	return 0;
}

int site_create(const std::string &name, int lat_udeg, int lon_udeg, std::string &json, std::string &error)
{
	location_t loc;
	loc.lat.udeg = lat_udeg;
	loc.lon.udeg = lon_udeg;
	Step step;
	step.kind = Step::SITES;
	step.text = "add dive site"; // AddDiveSite
	step.sites_to_add.push_back(std::make_unique<dive_site>(name, loc));
	apply_sites(step);
	uint32_t uuid = step.sites_to_remove[0]->uuid;
	push_step(std::move(step));
	return site_json(uuid, json, error);
}

static int push_site_field(dive_site *ds, Step step, std::string &json, std::string &error)
{
	apply_site_field(step);
	push_step(std::move(step));
	return site_json(ds->uuid, json, error);
}

int site_edit(uint32_t uuid, const std::string &field, const std::string &value, int lat_udeg, int lon_udeg,
	      std::string &json, std::string &error)
{
	dive_site *ds = divelog.sites.get_by_uuid(uuid);
	if (!ds) {
		error = "NOT_FOUND";
		return -1;
	}
	Step step;
	step.kind = Step::SITE_FIELD;
	step.site = ds;
	if (field == "name" || field == "description" || field == "notes") {
		// EditDiveSiteName, EditDiveSiteDescription, EditDiveSiteNotes
		const std::string &current = field == "name" ? ds->name : field == "description" ? ds->description : ds->notes;
		if (current == value)
			return site_json(uuid, json, error);
		step.site_field = field == "name" ? 0 : field == "description" ? 1 : 2;
		step.value = value;
		step.text = "Edit dive site " + field;
		return push_site_field(ds, std::move(step), json, error);
	}
	if (field == "location") {
		// EditDiveSiteLocation; 0, 0 removes the position.
		location_t loc;
		loc.lat.udeg = lat_udeg;
		loc.lon.udeg = lon_udeg;
		bool ok = has_location(&loc), old_ok = has_location(&ds->location);
		if (ok == old_ok && (!ok || loc == ds->location))
			return site_json(uuid, json, error);
		step.site_field = 3;
		step.location = loc;
		step.text = "Edit dive site location";
		return push_site_field(ds, std::move(step), json, error);
	}
	if (field == "country" || field == "region" || field == "city") {
		// A corrected value: origin GEOMANUAL, never replaced by a lookup.
		taxonomy_data t = ds->taxonomy;
		if (field == "country") {
			if (taxonomy_get_country(t) == value)
				return site_json(uuid, json, error);
			taxonomy_set_country(t, value, GEOMANUAL); // EditDiveSiteCountry
			step.text = "Edit dive site country";
		} else {
			taxonomy_category cat = field == "region" ? TC_ADMIN_L1 : TC_LOCALNAME;
			if (taxonomy_get_value(t, cat) == value)
				return site_json(uuid, json, error);
			taxonomy_set_category(t, cat, value, GEOMANUAL); // EditDiveSiteTaxonomy
			step.text = "Edit dive site taxonomy";
		}
		step.site_field = 4;
		step.taxonomy = std::move(t);
		return push_site_field(ds, std::move(step), json, error);
	}
	error = "BAD_REQUEST: unknown site field " + field;
	return -1;
}

// The first string value of "key" in a JSON text, from `from` on; JSON escapes
// of quotes and backslashes are undone, \uXXXX are kept as they are.
static std::string json_value(const std::string &text, const std::string &key, size_t from = 0)
{
	std::string pattern = "\"" + key + "\":\"";
	size_t start = text.find(pattern, from);
	if (start == std::string::npos)
		return std::string();
	start += pattern.size();
	std::string out;
	for (size_t i = start; i < text.size() && text[i] != '"'; i++) {
		if (text[i] == '\\' && i + 1 < text.size())
			i++;
		out += text[i];
	}
	return out;
}

// Nominatim's usage policy (operations.osmfoundation.org/policies/nominatim):
// an identifying User-Agent, at most one request per second, results cached.
static const char *nominatim_user_agent = "OpenDives (dive log app; https://github.com/remillc/opendives)";
static std::chrono::steady_clock::time_point last_nominatim_request;
static std::map<std::string, taxonomy_data> nominatim_cache;

// The first of these keys of Nominatim's "address" object that has a value.
static std::string address_value(const std::string &body, size_t address, std::initializer_list<const char *> keys)
{
	for (const char *key: keys) {
		std::string value = json_value(body, key, address);
		if (!value.empty())
			return value;
	}
	return std::string();
}

// Nominatim's reverse lookup. Returns 0 with the taxonomy filled in, 1 when
// the server answered without a place (open sea), -1 when it did not answer.
static int nominatim_lookup(location_t loc, const std::string &lang, taxonomy_data &taxonomy)
{
	char query[160];
	snprintf(query, sizeof(query), "lat=%.6f&lon=%.6f", loc.lat.udeg / 1000000.0, loc.lon.udeg / 1000000.0);
	std::string key = std::string(query) + "&" + lang;
	auto cached = nominatim_cache.find(key);
	if (cached != nominatim_cache.end()) {
		taxonomy = cached->second;
		return 0;
	}
	auto wait = last_nominatim_request + std::chrono::seconds(1) - std::chrono::steady_clock::now();
	if (wait > std::chrono::steady_clock::duration::zero())
		std::this_thread::sleep_for(wait);
	last_nominatim_request = std::chrono::steady_clock::now();
	std::string url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&" +
			  std::string(query) + "&accept-language=" + lang;
	int status = 0;
	std::string body;
	if (opendives_https_get(url, nominatim_user_agent, 5, status, body) || status != 200)
		return -1;
	size_t address = body.find("\"address\":{");
	if (address == std::string::npos)
		return 1;
	std::string country = json_value(body, "country", address);
	std::string region = address_value(body, address, { "state", "province", "region", "state_district" });
	std::string county = json_value(body, "county", address);
	std::string town = address_value(body, address, { "city", "town", "village", "hamlet", "municipality" });
	if (!country.empty())
		taxonomy_set_country(taxonomy, country, GEOCODED);
	if (!region.empty())
		taxonomy_set_category(taxonomy, TC_ADMIN_L1, region, GEOCODED);
	if (!county.empty())
		taxonomy_set_category(taxonomy, TC_ADMIN_L2, county, GEOCODED);
	if (!town.empty())
		taxonomy_set_category(taxonomy, TC_LOCALNAME, town, GEOCODED);
	nominatim_cache[key] = taxonomy;
	return 0;
}

// In place of reverseGeoLookup() (core/divesitehelpers.cpp, Qt, GeoNames):
// the same taxonomy categories, from Nominatim, else from the offline Natural
// Earth file (country and region only).
static int reverse_geo_lookup(location_t loc, const std::string &lang, taxonomy_data &taxonomy, std::string &error,
			      bool *offline = nullptr)
{
	if (offline)
		*offline = false;
	if (nominatim_lookup(loc, lang, taxonomy) == 0 && !taxonomy.empty())
		return 0;
	taxonomy.clear();
	if (offline)
		*offline = true;
	std::string country, region;
	if (!offline_region(loc.lat.udeg, loc.lon.udeg, lang, country, region)) {
		error = "NO_RESULT";
		return -1;
	}
	taxonomy_set_country(taxonomy, country, GEOCODED);
	if (!region.empty())
		taxonomy_set_category(taxonomy, TC_ADMIN_L1, region, GEOCODED);
	return 0;
}

int place_at(int lat_udeg, int lon_udeg, const std::string &lang, std::string &json)
{
	location_t loc;
	loc.lat.udeg = lat_udeg;
	loc.lon.udeg = lon_udeg;
	taxonomy_data found;
	std::string error;
	bool offline = false;
	if (reverse_geo_lookup(loc, lang, found, error, &offline)) {
		json = "null";
		return 0;
	}
	json = "{\"country\":";
	append_json_string(json, taxonomy_get_country(found));
	json += ",\"region\":";
	append_json_string(json, taxonomy_get_value(found, TC_ADMIN_L1));
	json += ",\"city\":";
	append_json_string(json, taxonomy_get_value(found, TC_LOCALNAME));
	json += ",\"offline\":";
	json += offline ? "true}" : "false}";
	return 0;
}

int site_geocode(uint32_t uuid, const std::string &lang, std::string &json, std::string &error)
{
	dive_site *ds = divelog.sites.get_by_uuid(uuid);
	if (!ds || !has_location(&ds->location)) {
		error = "NOT_FOUND";
		return -1;
	}
	taxonomy_data found;
	if (reverse_geo_lookup(ds->location, lang, found, error))
		return -1;
	// A corrected value is never replaced (spec, section 4, "Sites").
	taxonomy_data t = ds->taxonomy;
	for (const taxonomy &entry: found) {
		const taxonomy *old = find_taxonomy(t, entry.category);
		if (!old || old->origin != GEOMANUAL)
			taxonomy_set_category(t, entry.category, entry.value, entry.origin);
	}
	Step step;
	step.kind = Step::SITE_FIELD;
	step.site = ds;
	step.site_field = 4;
	step.taxonomy = std::move(t);
	step.text = "Edit dive site taxonomy";
	return push_site_field(ds, std::move(step), json, error);
}

static std::string lower(std::string s)
{
	std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
	return s;
}

int sites_duplicates(int same_name_m, int same_place_m, std::string &json)
{
	// Possible duplicates, as the spec defines them: same name ignoring case
	// and close, or same position with different names.
	json = "[";
	bool first = true;
	std::vector<dive_site *> all;
	for (auto &ds: divelog.sites)
		all.push_back(ds.get());
	for (size_t i = 0; i < all.size(); i++) {
		for (size_t j = i + 1; j < all.size(); j++) {
			dive_site *a = all[i], *b = all[j];
			bool located = has_location(&a->location) && has_location(&b->location);
			unsigned int distance = located ? get_distance(a->location, b->location) : 0;
			bool same_name = !a->name.empty() && lower(a->name) == lower(b->name) &&
					 (!located || distance <= static_cast<unsigned int>(same_name_m));
			bool same_place = located && a->name != b->name && distance <= static_cast<unsigned int>(same_place_m);
			if (!same_name && !same_place)
				continue;
			if (!first)
				json += ',';
			first = false;
			json += "{\"a\":";
			append_site_summary(json, *a);
			json += ",\"b\":";
			append_site_summary(json, *b);
			json += ",\"distanceM\":" + std::to_string(located ? static_cast<int>(distance) : -1) + '}';
		}
	}
	json += ']';
	return 0;
}

int sites_merge(uint32_t keep, uint32_t other, std::string &json, std::string &error)
{
	dive_site *ds = divelog.sites.get_by_uuid(keep), *gone = divelog.sites.get_by_uuid(other);
	if (!ds || !gone || ds == gone) {
		error = "NOT_FOUND";
		return -1;
	}
	Step step;
	step.kind = Step::SITES;
	step.text = "merge dive sites"; // MergeDiveSites
	step.merge_into = ds;
	step.sites_to_remove.push_back(gone);
	apply_sites(step);
	push_step(std::move(step));
	return site_json(keep, json, error);
}

int sites_delete_unused(const std::vector<uint32_t> &uuids, std::string &json, std::string &error)
{
	// PurgeUnusedDiveSites, limited to the selection: only sites without dives.
	Step step;
	step.kind = Step::SITES;
	for (uint32_t uuid: uuids) {
		dive_site *ds = divelog.sites.get_by_uuid(uuid);
		if (ds && ds->dives.empty())
			step.sites_to_remove.push_back(ds);
	}
	if (step.sites_to_remove.empty()) {
		error = "NOTHING_TO_DO";
		return -1;
	}
	step.text = "delete " + std::to_string(step.sites_to_remove.size()) + " dive site(s)"; // DeleteDiveSites
	apply_sites(step);
	push_step(std::move(step));
	json = "{\"uuid\":0}";
	return 0;
}

int site_delete(uint32_t uuid, std::string &json, std::string &error)
{
	// DeleteDiveSites for one site, used or not: its dives stay in the
	// logbook without a site, and get it back on undo.
	dive_site *ds = divelog.sites.get_by_uuid(uuid);
	if (!ds) {
		error = "NOT_FOUND";
		return -1;
	}
	Step step;
	step.kind = Step::SITES;
	step.sites_to_remove.push_back(ds);
	step.text = "delete 1 dive site(s)"; // DeleteDiveSites, tr("delete %n dive site(s)")
	apply_sites(step);
	push_step(std::move(step));
	json = "{\"uuid\":0}";
	return 0;
}

int dives_without_site(std::string &json)
{
	json = "[";
	bool first = true;
	for (const auto &d: divelog.dives) {
		if (d->dive_site)
			continue;
		if (!first)
			json += ',';
		first = false;
		json += "{\"id\":" + std::to_string(d->id) + ",\"number\":" + std::to_string(d->number) + ",\"date\":";
		append_json_string(json, iso_time(d->when));
		json += ",\"durationSeconds\":" + std::to_string(d->duration.seconds);
		// Suggestion: the site of another dive of the same trip.
		uint32_t suggestion = 0;
		if (d->divetrip)
			for (const dive *other: d->divetrip->dives)
				if (other->dive_site) {
					suggestion = other->dive_site->uuid;
					break;
				}
		json += ",\"suggestedSite\":" + std::to_string(suggestion) + '}';
	}
	json += ']';
	return 0;
}

// ---------------------------------------------------------------------------
// Adding and importing dives (spec, section 3, "Add"): ports of
// DiveListBase::removeDive(), addDive(), removeDives() and addDives()
// (commands/command_divelist.cpp), without the selection, the filter and the
// signals, which belong to Subsurface's interface.

// removeDive(): the dive leaves its trip and its site, an emptied trip leaves
// the log (kept in `trips`), and the dive is taken out of the table.
static DiveToAdd remove_one_dive(dive *d, std::vector<std::unique_ptr<dive_trip>> &trips)
{
	DiveToAdd res;
	res.trip = unregister_dive_from_trip(d);
	res.site = unregister_dive_from_dive_site(d);
	if (res.trip && res.trip->dives.empty()) {
		divelog.trips.sort(); // Removal of dives has changed order of trips! (as Subsurface)
		auto [t, idx] = divelog.trips.pull(res.trip);
		trips.push_back(std::move(t));
	}
	size_t idx = divelog.dives.get_idx(d);
	res.d = divelog.dives.unregister_dive(static_cast<int>(idx));
	return res;
}

// addDive(): back in its trip and site, then in the table (and the fulltext index).
static dive *add_one_dive(DiveToAdd &d)
{
	if (d.trip)
		d.trip->add_dive(d.d.get());
	if (d.site)
		d.site->add_dive(d.d.get());
	return divelog.dives.register_dive(std::move(d.d));
}

// removeDives(): the dives and sites to remove leave the log and become the
// ones to add on the next call.
static void remove_listed(DiveListChange &c)
{
	std::sort(c.remove_dives.begin(), c.remove_dives.end(),
		  [](const dive *d1, const dive *d2) { return dive_less_than(*d1, *d2); });
	for (dive *d: c.remove_dives)
		c.dives.push_back(remove_one_dive(d, c.trips));
	c.remove_dives.clear();
	for (dive_site *ds: c.remove_sites)
		c.sites.push_back(std::move(divelog.sites.pull(ds).ptr));
	c.remove_sites.clear();
}

// addDives(): in reverse order, so that trips are created before use; then
// the trips and sites.
static void add_listed(DiveListChange &c, std::vector<dive *> &added, std::vector<dive_site *> &added_sites)
{
	std::sort(c.dives.begin(), c.dives.end(),
		  [](const DiveToAdd &a, const DiveToAdd &b) { return dive_less_than(*a.d, *b.d); });
	added.assign(c.dives.size(), nullptr);
	auto out = added.rbegin();
	for (auto it = c.dives.rbegin(); it != c.dives.rend(); ++it, ++out)
		*out = add_one_dive(*it);
	c.dives.clear();
	for (std::unique_ptr<dive_trip> &trip: c.trips)
		divelog.trips.put(std::move(trip));
	c.trips.clear();
	for (std::unique_ptr<dive_site> &ds: c.sites)
		added_sites.push_back(divelog.sites.register_site(std::move(ds)).ptr);
	c.sites.clear();
}

// ImportDives::redoit() and undoit() (AddDive is the case with nothing to
// remove): add what is to add, remove what is to remove, and swap the roles.
// The dive computers and filter presets of an import come and go with it.
static void apply_dive_list(Step &step)
{
	std::vector<dive *> added;
	std::vector<dive_site *> added_sites;
	add_listed(step.list, added, added_sites);
	remove_listed(step.list);
	step.list.remove_dives = std::move(added);
	step.list.remove_sites = std::move(added_sites);
	divelog.trips.sort(); // as AddDive::redoit(): adding a dive may reorder trips
	step.list_applied = !step.list_applied;
	if (step.swap_fingerprints)
		std::swap(::fingerprints, step.fingerprints);
	if (step.list_applied) {
		for (const device &dev: step.devices)
			add_to_device_table(divelog.devices, dev);
		for (auto &it: step.presets_to_add)
			step.presets_to_remove.push_back(divelog.filter_presets.add(it.first, it.second));
		step.presets_to_add.clear();
	} else {
		for (const device &dev: step.devices)
			remove_device(divelog.devices, dev);
		for (auto it = step.presets_to_remove.rbegin(); it != step.presets_to_remove.rend(); ++it) {
			const filter_preset &preset = divelog.filter_presets[*it];
			step.presets_to_add.emplace_back(preset.name, preset.data);
			divelog.filter_presets.remove(*it);
		}
		step.presets_to_remove.clear();
		std::reverse(step.presets_to_add.begin(), step.presets_to_add.end());
	}
}

// CreateFilterPreset, RemoveFilterPreset, EditFilterPreset: redo and undo.
static void apply_filter_preset(Step &step)
{
	bool create = (step.preset_op == Step::CREATE) != step.preset_applied;
	if (step.preset_op == Step::EDIT) {
		std::swap(step.preset_data, divelog.filter_presets[step.preset_index].data);
	} else if (create) {
		step.preset_index = divelog.filter_presets.add(step.preset_name, step.preset_data);
	} else {
		const filter_preset &preset = divelog.filter_presets[step.preset_index];
		step.preset_name = preset.name;
		step.preset_data = preset.data;
		divelog.filter_presets.remove(step.preset_index);
	}
	step.preset_applied = !step.preset_applied;
}

// Result of a dive list step: {"listChange":true, "dives":<dives in the log>,
// "id":<first dive added, 0 if none>}.
static std::string dive_list_json(const Step &step)
{
	int id = step.list_applied && !step.list.remove_dives.empty() ? step.list.remove_dives[0]->id : 0;
	return "{\"listChange\":true,\"dives\":" + std::to_string(divelog.dives.size()) + ",\"id\":" +
	       std::to_string(id) + "}";
}

static int swap_step(Step &step, std::string &result_json, std::string &error)
{
	if (step.kind == Step::RENUMBER) {
		// renumberDives(): the old numbers are kept in the array, so doing it
		// twice is a no-op.
		for (auto &[d, number]: step.renumbered) {
			std::swap(d->number, number);
			d->invalidate_cache();
		}
		result_json = "{\"listChange\":true,\"dives\":" + std::to_string(divelog.dives.size()) + ",\"id\":0}";
		return 0;
	}
	if (step.kind == Step::DIVE_LIST) {
		apply_dive_list(step);
		result_json = dive_list_json(step);
		return 0;
	}
	if (step.kind == Step::FILTER_PRESET) {
		apply_filter_preset(step);
		return filter_presets_json(result_json);
	}
	if (step.kind == Step::TRIP_FIELD) {
		std::string &field = step.notes ? step.trip->notes : step.trip->location;
		std::swap(field, step.value);
		return trip_json(step.trip->id, result_json, error);
	}
	if (step.kind == Step::SITE_FIELD) {
		apply_site_field(step);
		return site_json(step.site->uuid, result_json, error);
	}
	if (step.kind == Step::SITES) {
		apply_sites(step);
		uint32_t shown = step.merge_into ? step.merge_into->uuid
			       : !step.sites_to_remove.empty() ? step.sites_to_remove[0]->uuid : 0;
		return site_json(shown, result_json, error);
	}
	if (step.kind == Step::CYLINDER_TYPE) {
		apply_cylinder_type(step);
		return cylinder_types(result_json);
	}
	if (step.kind == Step::MOVE) {
		move_dives_between_trips(step);
		// The trip shown: the one the first dive is in now, or was in.
		dive_trip *trip = step.moves.empty() ? nullptr : step.moves[0].d->divetrip;
		if (!trip && !step.moves.empty())
			trip = step.moves[0].trip;
		return trip_json(trip ? trip->id : 0, result_json, error);
	}
	dive *d = divelog.dives.get_by_uniq_id(step.dive_id);
	if (!d) {
		error = "NOT_FOUND";
		return -1;
	}
	exchange(d, *step.other);
	return internal::dive_json(step.dive_id, result_json, error);
}

int undo(std::string &result_json, std::string &error)
{
	if (!can_undo()) {
		error = "NOTHING_TO_UNDO";
		return -1;
	}
	applied--;
	return swap_step(steps[applied], result_json, error);
}

int redo(std::string &result_json, std::string &error)
{
	if (!can_redo()) {
		error = "NOTHING_TO_REDO";
		return -1;
	}
	applied++;
	return swap_step(steps[applied - 1], result_json, error);
}

bool can_undo()
{
	return applied > 0;
}

bool can_redo()
{
	return applied < steps.size();
}

std::string undo_text()
{
	return can_undo() ? steps[applied - 1].text : std::string();
}

std::string redo_text()
{
	return can_redo() ? steps[applied].text : std::string();
}

bool has_unsaved_changes()
{
	return static_cast<long>(applied) != clean_index;
}

int save_local(std::string &error)
{
	const std::string &log = internal::current_log();
	if (!is_git_log(log)) {
		error = log.empty() ? "NO_LOG" : "NOT_GIT";
		return -1;
	}
	if (!writes_allowed()) {
		error = "WRITE_LOCKED";
		return -1;
	}
	if (check_destination(log, error))
		return -1;
	if (!has_unsaved_changes())
		return 0;
	if (save_to(log, error))
		return -1;
	clean_index = static_cast<long>(applied);
	return 0;
}

int save_as(const std::string &destination, std::string &error)
{
	return save_to(destination, error);
}

static int sync_and_reload_if_needed(const std::string &log, const std::string &local_before, bool server_in_local,
			      bool local_in_server, std::string &status_json, std::string &error);

int sync(std::string &status_json, std::string &error)
{
	const std::string log = internal::current_log();
	if (!is_git_log(log)) {
		error = log.empty() ? "NO_LOG" : "NOT_GIT";
		return -1;
	}
	if (!internal::current_log_is_cloud()) {
		if (save_local(error))
			return -1;
		// A git log with a remote of its own (not the Subsurface cloud, e.g.
		// "git://host/repo[branch]", which the tests use): the same exchange.
		struct git_info info;
		if (git_info_of(log, info) && info.transport != RT_LOCAL) {
			Heads before = read_heads(log);
			return sync_and_reload_if_needed(log, before.local, before.local != before.remote, before.local == before.remote, status_json,
							 error);
		}
		status_json = sync_json("local", false);
		return 0;
	}
	if (!writes_allowed()) {
		error = "WRITE_LOCKED";
		return -1;
	}
	// Ask the server again before any write: Subsurface treats almost any
	// clone failure as "branch missing" and would then create an empty
	// commit (git-access.cpp:52). Never write if the branch status is unknown.
	bool exists = false;
	std::string server_head, probe_error;
	bool reachable = cloud_branch_status(log, exists, server_head, probe_error) == 0;
	if (reachable && !exists) {
		error = "STOPPED: no log branch on the server";
		return -1;
	}
	if (save_local(error))
		return -1;
	if (!reachable) {
		status_json = sync_json("offline", false);
		return 0;
	}
	Heads before = read_heads(log);
	if (before.local == server_head) {
		status_json = sync_json("up_to_date", false);
		return 0;
	}
	// The server's head may not be known locally yet (not fetched): then the
	// local branch is "in the server" when it has no commit of its own.
	bool server_in_local = includes(log, before.local, server_head);
	bool local_in_server = includes(log, server_head, before.local) || before.local == before.remote;

	return sync_and_reload_if_needed(log, before.local, server_in_local, local_in_server, status_json, error);
}

// The exchange with the server without reading the log: Subsurface's
// open_git_repository() with git_local_only off (get_remote_repo(), then
// sync_with_remote(): fetch, then fast-forward, merge or push, as on
// desktop after a save). When the local branch did not move (only this
// device's commits were sent), the log in memory is still the saved one: it
// is kept, and so is the undo history, as desktop Subsurface keeps it after
// a cloud save. When the cloud brought changes, the merged log is read again,
// as Subsurface-mobile does (saveChangesCloud()), and the undo history goes.
static int sync_and_reload_if_needed(const std::string &log, const std::string &local_before, bool server_in_local,
			      bool local_in_server, std::string &status_json, std::string &error)
{
	{
		struct git_info info;
		if (!is_git_repository(log.c_str(), &info)) {
			error = "NOT_GIT";
			return -1;
		}
		git_remote_sync_successful = false;
		bool was_local_only = git_local_only;
		git_local_only = false;
		bool opened = open_git_repository(&info);
		git_local_only = was_local_only;
		if (!opened) {
			error = "STOPPED: cannot open the local copy";
			return -1;
		}
	}
	bool synced = git_remote_sync_successful;
	Heads after = read_heads(log);
	if (after.local == local_before) {
		status_json = sync_json(!synced ? "stopped" : server_in_local ? "pushed" : "up_to_date", false);
		return 0;
	}
	bool was_local_only = git_local_only;
	git_local_only = true;
	int ret = internal::load(log, error);
	git_local_only = was_local_only;
	git_remote_sync_successful = synced;
	if (ret) {
		error = "STOPPED: " + error;
		return -1;
	}
	apply_log_prefs();
	divelog.process_loaded_dives();
	if (!synced)
		status_json = sync_json("stopped", true);
	else
		status_json = sync_json(local_in_server ? "pulled" : "merged", true);
	return 0;
}

// ---------------------------------------------------------------------------
// Sync conflict (spec, section 6, "Conflict"; an OpenDives addition). When the
// device and the cloud both changed the log, Subsurface's sync merges them
// (try_to_git_merge() in core/git-access.cpp, files merged by the union of
// their lines) and commits "Automatic merge". When both sides changed the same
// line of a dive (the notes, the rating…), the union keeps both lines and the
// loaded dive shows only one of them. The merge commit keeps both versions:
// these functions find such lines and let the diver choose one side.

namespace {

// "key value" lines of a file of the git log, grouped by key; lines starting
// with a space or a tab continue the previous key.
std::map<std::string, std::string> git_file_lines(git_repository *repo, const git_tree *tree, const std::string &path)
{
	std::map<std::string, std::string> out;
	git_tree_entry *entry = nullptr;
	if (!tree || git_tree_entry_bypath(&entry, tree, path.c_str()))
		return out;
	git_blob *blob = nullptr;
	if (!git_blob_lookup(&blob, repo, git_tree_entry_id(entry))) {
		std::string text(static_cast<const char *>(git_blob_rawcontent(blob)), git_blob_rawsize(blob));
		std::string key;
		size_t start = 0;
		while (start < text.size()) {
			size_t nl = text.find('\n', start);
			std::string line = text.substr(start, nl == std::string::npos ? std::string::npos : nl - start);
			start = nl == std::string::npos ? text.size() : nl + 1;
			if (line.empty())
				continue;
			if (line[0] != ' ' && line[0] != '\t')
				key = line.substr(0, line.find(' '));
			std::string &value = out[key];
			if (!value.empty())
				value += '\n';
			value += line;
		}
		git_blob_free(blob);
	}
	git_tree_entry_free(entry);
	return out;
}

// The value of a "key value" line for showing it: quotes and escapes removed.
std::string line_value(const std::string &lines)
{
	std::string out;
	size_t start = 0;
	while (start < lines.size()) {
		size_t nl = lines.find('\n', start);
		std::string line = lines.substr(start, nl == std::string::npos ? std::string::npos : nl - start);
		start = nl == std::string::npos ? lines.size() : nl + 1;
		size_t sp = line.find(' ');
		std::string v = sp == std::string::npos ? std::string() : trim(line.substr(sp + 1));
		if (v.size() >= 2 && v.front() == '"' && v.back() == '"') {
			std::string u;
			for (size_t i = 1; i + 1 < v.size(); i++) {
				if (v[i] == '\\' && i + 2 < v.size()) {
					i++;
					u += v[i] == 'n' ? '\n' : v[i];
				} else {
					u += v[i];
				}
			}
			v = u;
		}
		if (!out.empty())
			out += '\n';
		out += v;
	}
	return out;
}

// A dive's local time from a path of the git log: "YYYY/MM/DD-Wday-hh=mm=ss/…",
// possibly inside a trip directory (save-git.cpp, create_dive_name()); 0 when
// the path is not a dive's.
timestamp_t dive_time_of_path(const std::string &path)
{
	std::vector<std::string> parts;
	size_t start = 0;
	while (start <= path.size()) {
		size_t slash = path.find('/', start);
		parts.push_back(path.substr(start, slash == std::string::npos ? std::string::npos : slash - start));
		if (slash == std::string::npos)
			break;
		start = slash + 1;
	}
	if (parts.size() < 3)
		return 0;
	int year = atoi(parts[0].c_str()), month = atoi(parts[1].c_str());
	for (size_t i = 2; i < parts.size(); i++) {
		int day, h, m, s;
		char wday[16];
		if (sscanf(parts[i].c_str(), "%d-%15[^-]-%d=%d=%d", &day, wday, &h, &m, &s) == 5) {
			struct tm tm = {};
			tm.tm_year = year;
			tm.tm_mon = month - 1;
			tm.tm_mday = day;
			tm.tm_hour = h;
			tm.tm_min = m;
			tm.tm_sec = s;
			return utc_mktime(&tm);
		}
	}
	return 0;
}

struct ConflictLine {
	std::string key, device, cloud;
};

struct ConflictFile {
	std::string path;
	std::vector<ConflictLine> lines;
};

// The automatic merge at the head of the log's branch, if any: its two
// parents (this device's commit first, as try_to_git_merge() orders them)
// and the files whose same key the two sides changed differently.
struct MergeConflicts {
	git_oid head {}, device {}, cloud {};
	git_time_t device_time = 0, cloud_time = 0;
	std::vector<ConflictFile> files;
};

int find_merge_conflicts(git_repository *repo, const std::string &branch, MergeConflicts &out)
{
	git_commit *head = nullptr, *dev = nullptr, *cld = nullptr, *base_commit = nullptr;
	git_tree *tdev = nullptr, *tcld = nullptr, *tbase = nullptr;
	git_diff *ddev = nullptr, *dcld = nullptr;
	int ret = -1;
	if (git_reference_name_to_id(&out.head, repo, ("refs/heads/" + branch).c_str()) ||
	    git_commit_lookup(&head, repo, &out.head))
		goto done;
	ret = 0;
	if (git_commit_parentcount(head) != 2 || strncmp(git_commit_message(head), "Automatic merge", 15) != 0)
		goto done;
	{
		git_oid base;
		out.device = *git_commit_parent_id(head, 0);
		out.cloud = *git_commit_parent_id(head, 1);
		if (git_commit_lookup(&dev, repo, &out.device) || git_commit_lookup(&cld, repo, &out.cloud) ||
		    git_merge_base(&base, repo, &out.device, &out.cloud) || git_commit_lookup(&base_commit, repo, &base) ||
		    git_commit_tree(&tdev, dev) || git_commit_tree(&tcld, cld) || git_commit_tree(&tbase, base_commit) ||
		    git_diff_tree_to_tree(&ddev, repo, tbase, tdev, nullptr) ||
		    git_diff_tree_to_tree(&dcld, repo, tbase, tcld, nullptr)) {
			ret = -1;
			goto done;
		}
		out.device_time = git_commit_time(dev);
		out.cloud_time = git_commit_time(cld);
		std::map<std::string, git_oid> changed_on_device;
		for (size_t i = 0; i < git_diff_num_deltas(ddev); i++) {
			const git_diff_delta *delta = git_diff_get_delta(ddev, i);
			if (delta->status == GIT_DELTA_MODIFIED)
				changed_on_device[delta->new_file.path] = delta->new_file.id;
		}
		for (size_t i = 0; i < git_diff_num_deltas(dcld); i++) {
			const git_diff_delta *delta = git_diff_get_delta(dcld, i);
			auto it = changed_on_device.find(delta->new_file.path);
			if (delta->status != GIT_DELTA_MODIFIED || it == changed_on_device.end() ||
			    git_oid_equal(&it->second, &delta->new_file.id))
				continue;
			// Changed on both sides: the keys changed on both sides, differently.
			std::string path = delta->new_file.path;
			auto b = git_file_lines(repo, tbase, path), d = git_file_lines(repo, tdev, path),
			     c = git_file_lines(repo, tcld, path);
			ConflictFile file { path, {} };
			std::set<std::string> keys;
			for (auto &kv: d)
				keys.insert(kv.first);
			for (auto &kv: c)
				keys.insert(kv.first);
			for (const std::string &key: keys) {
				const std::string &bv = b[key], &dv = d[key], &cv = c[key];
				if (dv != bv && cv != bv && dv != cv)
					file.lines.push_back({ key, dv, cv });
			}
			if (!file.lines.empty())
				out.files.push_back(std::move(file));
		}
	}
done:
	git_diff_free(ddev);
	git_diff_free(dcld);
	git_tree_free(tdev);
	git_tree_free(tcld);
	git_tree_free(tbase);
	git_commit_free(head);
	git_commit_free(dev);
	git_commit_free(cld);
	git_commit_free(base_commit);
	return ret;
}

std::string iso_seconds(git_time_t t)
{
	time_t tt = static_cast<time_t>(t);
	struct tm tm;
	gmtime_r(&tt, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
	return buf;
}

} // namespace

int sync_conflicts(std::string &json, std::string &error)
{
	const std::string &log = internal::current_log();
	json = "{\"conflict\":false}";
	if (!is_git_log(log))
		return 0;
	git_repository *repo = nullptr;
	std::string branch;
	if (open_log_repo(log, &repo, branch)) {
		error = "NOT_GIT";
		return -1;
	}
	MergeConflicts mc;
	int ret = find_merge_conflicts(repo, branch, mc);
	git_repository_free(repo);
	if (ret) {
		error = "GIT_ERROR: cannot read the merge";
		return -1;
	}
	if (mc.files.empty())
		return 0;
	json = "{\"conflict\":true,\"deviceTime\":\"" + iso_seconds(mc.device_time) + "\",\"cloudTime\":\"" +
	       iso_seconds(mc.cloud_time) + "\",\"items\":[";
	bool first = true;
	for (const ConflictFile &f: mc.files) {
		if (!first)
			json += ',';
		first = false;
		timestamp_t when = dive_time_of_path(f.path);
		const dive *d = nullptr;
		for (auto &dp: divelog.dives)
			if (when && dp->when == when)
				d = dp.get();
		json += "{\"path\":";
		append_json_string(json, f.path);
		json += ",\"diveId\":" + std::to_string(d ? d->id : 0) + ",\"number\":" + std::to_string(d ? d->number : 0);
		json += ",\"date\":";
		append_json_string(json, when ? iso_time(when) : std::string());
		json += ",\"lines\":[";
		for (size_t i = 0; i < f.lines.size(); i++) {
			if (i)
				json += ',';
			json += "{\"key\":";
			append_json_string(json, f.lines[i].key);
			json += ",\"device\":";
			append_json_string(json, line_value(f.lines[i].device));
			json += ",\"cloud\":";
			append_json_string(json, line_value(f.lines[i].cloud));
			json += '}';
		}
		json += "]}";
	}
	json += "]}";
	return 0;
}

int resolve_conflicts(const std::string &choices_json, std::string &error)
{
	const std::string log = internal::current_log();
	// One choice per conflicting file: {"<path>":"device"|"cloud", …}.
	std::vector<std::pair<std::string, JsonValue>> fields;
	if (!JsonReader(choices_json).object(fields)) {
		error = "BAD_REQUEST: choices";
		return -1;
	}
	std::map<std::string, bool> keep_device;
	for (const auto &[path, value]: fields) {
		if (value.kind != JsonValue::STRING || (value.text != "device" && value.text != "cloud")) {
			error = "BAD_REQUEST: choice for " + path;
			return -1;
		}
		keep_device[path] = value.text == "device";
	}
	if (!is_git_log(log)) {
		error = log.empty() ? "NO_LOG" : "NOT_GIT";
		return -1;
	}
	if (!writes_allowed()) {
		error = "WRITE_LOCKED";
		return -1;
	}
	if (has_unsaved_changes() && save_local(error))
		return -1;
	git_repository *repo = nullptr;
	std::string branch;
	if (open_log_repo(log, &repo, branch)) {
		error = "NOT_GIT";
		return -1;
	}
	MergeConflicts mc;
	if (find_merge_conflicts(repo, branch, mc) || mc.files.empty()) {
		git_repository_free(repo);
		error = "NOTHING_TO_DO";
		return -1;
	}
	for (const ConflictFile &f: mc.files) {
		if (!keep_device.count(f.path)) {
			git_repository_free(repo);
			error = "BAD_REQUEST: no choice for " + f.path;
			return -1;
		}
	}
	// The head's tree, with each conflicting file as the chosen side has it.
	git_commit *head = nullptr, *dev = nullptr, *cld = nullptr;
	git_tree *head_tree = nullptr, *dev_tree = nullptr, *cld_tree = nullptr, *new_tree = nullptr;
	git_index *index = nullptr;
	git_signature *author = nullptr;
	git_reference *ref = nullptr;
	git_oid tree_oid, commit_oid;
	std::string message = "Changes made: \n\n";
	int ret = -1;
	if (git_commit_lookup(&head, repo, &mc.head) || git_commit_tree(&head_tree, head) ||
	    git_commit_lookup(&dev, repo, &mc.device) || git_commit_tree(&dev_tree, dev) ||
	    git_commit_lookup(&cld, repo, &mc.cloud) || git_commit_tree(&cld_tree, cld) ||
	    git_index_new(&index) || git_index_read_tree(index, head_tree))
		goto done;
	for (const ConflictFile &f: mc.files) {
		bool device = keep_device[f.path];
		git_tree_entry *entry = nullptr;
		if (git_tree_entry_bypath(&entry, device ? dev_tree : cld_tree, f.path.c_str()))
			goto done;
		git_index_entry ie = {};
		ie.mode = git_tree_entry_filemode(entry);
		ie.id = *git_tree_entry_id(entry);
		ie.path = f.path.c_str();
		int add = git_index_add(index, &ie);
		git_tree_entry_free(entry);
		if (add)
			goto done;
		timestamp_t when = dive_time_of_path(f.path);
		const dive *d = nullptr;
		for (auto &dp: divelog.dives)
			if (when && dp->when == when)
				d = dp.get();
		message += std::string(device ? "Keep this device's version" : "Take the cloud's version") + " [" +
			   (d ? dive_number_or_date(*d) : f.path) + "]\n";
	}
	message += "\nCreated by " + subsurface_user_agent() + "\n";
	if (git_index_write_tree_to(&tree_oid, index, repo) || git_tree_lookup(&new_tree, repo, &tree_oid) ||
	    get_authorship(repo, &author) < 0 ||
	    git_commit_create_v(&commit_oid, repo, nullptr, author, author, nullptr, message.c_str(), new_tree, 1, head) ||
	    git_reference_lookup(&ref, repo, ("refs/heads/" + branch).c_str()))
		goto done;
	// As create_new_commit() in save-git.cpp: the checkout follows a head branch.
	if (git_branch_is_head(ref) == 1 && !git_repository_is_bare(repo) &&
	    update_git_checkout(repo, reinterpret_cast<git_object *>(head), new_tree))
		goto done;
	{
		git_reference *moved = nullptr;
		if (git_reference_set_target(&moved, ref, &commit_oid, "OpenDives conflict resolution"))
			goto done;
		git_reference_free(moved);
	}
	ret = 0;
done:
	if (ret)
		error = std::string("GIT_ERROR: ") + (git_error_last() ? git_error_last()->message : "resolution failed");
	git_reference_free(ref);
	git_signature_free(author);
	git_index_free(index);
	git_tree_free(new_tree);
	git_tree_free(dev_tree);
	git_tree_free(cld_tree);
	git_tree_free(head_tree);
	git_commit_free(dev);
	git_commit_free(cld);
	git_commit_free(head);
	git_repository_free(repo);
	if (ret)
		return -1;
	// The log in memory is the merged one: read the resolved commit (no network).
	bool was_local_only = git_local_only;
	git_local_only = true;
	int loaded = internal::load(log, error);
	git_local_only = was_local_only;
	if (loaded)
		return -1;
	apply_log_prefs();
	divelog.process_loaded_dives();
	return 0;
}

int pending_changes(std::string &json)
{
	json = "[";
	if (internal::current_log_is_cloud()) {
		bool first = true;
		for (const PendingCommit &c: list_pending(internal::current_log())) {
			if (!first)
				json += ',';
			first = false;
			json += "{\"id\":";
			append_json_string(json, c.id);
			json += ",\"summary\":";
			append_json_string(json, c.summary);
			json += ",\"message\":";
			append_json_string(json, c.message);
			json += '}';
		}
	}
	json += ']';
	return 0;
}

// ---------------------------------------------------------------------------
// Adding, importing, filter presets (spec, sections 3 and 5).

static int check_writable_log(std::string &error)
{
	if (internal::current_log().empty()) {
		error = "NO_LOG";
		return -1;
	}
	if (loaded_format_version > dataformat_version) {
		error = "FORMAT_NEWER";
		return -1;
	}
	return 0;
}

int create_dive(const std::string &fields_json, std::string &result_json, std::string &error)
{
	if (check_writable_log(error))
		return -1;
	std::vector<std::pair<std::string, JsonValue>> fields;
	if (!JsonReader(fields_json).object(fields)) {
		error = "BAD_REQUEST: not a JSON object of fields";
		return -1;
	}
	// QMLManager::addDive(): the core's default dive (manually added, one
	// default cylinder), then the values of the form as commitChanges() sets them.
	std::unique_ptr<dive> d = divelog.dives.default_dive();
	dive_site *site = nullptr;
	bool profile_changed = false;
	std::string cylinder_type;
	int start_mbar = -1, end_mbar = -1, o2 = -1, he = -1;
	for (const auto &[key, value]: fields) {
		bool number = value.kind == JsonValue::NUMBER, text = value.kind == JsonValue::STRING,
		     list = value.kind == JsonValue::LIST;
		if (key == "date" && text) {
			// Local time of the dive, "YYYY-MM-DDTHH:MM[:SS]", stored without time zone.
			int y, mo, da, h, mi, se = 0;
			if (sscanf(value.text.c_str(), "%d-%d-%dT%d:%d:%d", &y, &mo, &da, &h, &mi, &se) < 5) {
				error = "BAD_REQUEST: date";
				return -1;
			}
			struct tm tm = {};
			tm.tm_year = y;
			tm.tm_mon = mo - 1;
			tm.tm_mday = da;
			tm.tm_hour = h;
			tm.tm_min = mi;
			tm.tm_sec = se;
			timestamp_t when = utc_mktime(&tm);
			if (!when) {
				error = "BAD_REQUEST: date";
				return -1;
			}
			d->when = d->dcs[0].when = when;
		} else if (key == "durationSeconds" && number && value.number > 0 && value.number < 48 * 3600) {
			// checkDuration(): a manually added dive loses its samples.
			d->dcs[0].duration = d->duration = duration_t { .seconds = static_cast<int32_t>(value.number) };
			profile_changed = true;
		} else if (key == "maxDepthMm" && number && value.number >= 0 && value.number <= 500000) {
			// checkDepth()
			d->maxdepth.mm = d->dcs[0].maxdepth.mm = static_cast<int32_t>(value.number);
			profile_changed = true;
		} else if (key == "site" && number) {
			site = value.number ? divelog.sites.get_by_uuid(static_cast<uint32_t>(value.number)) : nullptr;
			if (value.number && !site) {
				error = "NOT_FOUND: site";
				return -1;
			}
		} else if (key == "notes" && text) {
			d->notes = value.text;
		} else if (key == "suit" && text) {
			d->suit = trim(value.text);
		} else if ((key == "buddies" || key == "guides") && list) {
			// Subsurface separates names with ", " (commitChanges()).
			std::string joined;
			for (const std::string &name: value.list) {
				std::string n = trim(name);
				if (n.empty())
					continue;
				if (!joined.empty())
					joined += ", ";
				joined += n;
			}
			(key == "buddies" ? d->buddy : d->diveguide) = joined;
		} else if (key == "tags" && list) {
			for (const std::string &tag: value.list)
				if (!trim(tag).empty())
					taglist_add_tag(d->tags, trim(tag));
		} else if ((key == "rating" || key == "visibility") && number && value.number >= 0 && value.number <= 5) {
			(key == "rating" ? d->rating : d->visibility) = static_cast<int>(value.number);
		} else if ((key == "waterTempMk" || key == "airTempMk") && number && value.number >= 0) {
			(key == "waterTempMk" ? d->watertemp : d->airtemp).mkelvin = static_cast<uint32_t>(value.number);
		} else if (key == "cylinderType" && text) {
			cylinder_type = trim(value.text);
		} else if ((key == "startMbar" || key == "endMbar") && number && value.number >= 0 && value.number <= 500000) {
			(key == "startMbar" ? start_mbar : end_mbar) = static_cast<int>(value.number);
		} else if ((key == "o2Permille" || key == "hePermille") && number && value.number >= 0 && value.number <= 1000) {
			(key == "o2Permille" ? o2 : he) = static_cast<int>(value.number);
		} else {
			error = "BAD_REQUEST: field " + key;
			return -1;
		}
	}
	// commitChanges(): the first cylinder's pressures (the end never above
	// the start), gas mix (only a valid one) and type, whose size and working
	// pressure come from the cylinder types table.
	if (start_mbar >= 0 || end_mbar >= 0) {
		cylinder_t *cyl = d->get_or_create_cylinder(0);
		if (start_mbar >= 0)
			cyl->start.mbar = start_mbar;
		if (end_mbar >= 0)
			cyl->end.mbar = end_mbar;
		if (cyl->end.mbar > cyl->start.mbar)
			cyl->end.mbar = cyl->start.mbar;
	}
	if (o2 >= 0 || he >= 0) {
		int o2v = o2 >= 0 ? o2 : 0, hev = he >= 0 ? he : 0;
		if (o2v + hev > 1000) {
			error = "BAD_REQUEST: gas mix";
			return -1;
		}
		cylinder_t *cyl = d->get_or_create_cylinder(0);
		cyl->gasmix.o2.permille = o2v;
		cyl->gasmix.he.permille = hev;
	}
	if (!cylinder_type.empty()) {
		int size = 0, wp = 0;
		for (const tank_info &ti: tank_info_table) {
			if (ti.name == cylinder_type) {
				if (ti.ml > 0) {
					size = ti.ml;
					wp = ti.bar * 1000;
				} else {
					size = (int)(cuft_to_l(ti.cuft) * 1000 / bar_to_atm(psi_to_bar(ti.psi)));
					wp = psi_to_mbar(ti.psi);
				}
				break;
			}
		}
		cylinder_t *cyl = d->get_or_create_cylinder(0);
		cyl->type.description = cylinder_type;
		cyl->type.size.mliter = size;
		cyl->type.workingpressure.mbar = wp;
	}
	if (profile_changed) {
		d->dcs[0].samples.clear();
		// commitChanges(): "we have depth > 0, a manually added dive and no
		// samples: let's create an actual profile so the desktop version can
		// work it"; the mean depth is cleared first.
		if (d->maxdepth.mm > 0) {
			d->meandepth = d->dcs[0].meandepth = 0_m;
			fake_dc(&d->dcs[0]);
		}
	}
	divelog.dives.fixup_dive(*d);

	// AddDive::AddDive(d, autogroup, newNumber = true).
	Step step;
	step.kind = Step::DIVE_LIST;
	step.text = "add dive";
	d->maxdepth = 0_m;
	d->dcs[0].maxdepth = 0_m;
	divelog.dives.fixup_dive(*d);
	d->selected = false;
	d->divetrip = nullptr;
	d->dive_site = nullptr;
	dive_trip *trip = nullptr;
	if (divelog.autogroup) {
		auto [t, allocated] = get_trip_for_new_dive(divelog, d.get());
		trip = t;
		if (allocated)
			step.list.trips.push_back(std::move(allocated));
	}
	size_t idx = divelog.dives.get_insertion_index(d.get());
	d->number = divelog.dives.get_dive_nr_at_idx(static_cast<int>(idx));
	step.list.dives.push_back({ std::move(d), trip, site });
	apply_dive_list(step);
	result_json = dive_list_json(step);
	push_step(std::move(step));
	return 0;
}

int delete_dive(int id, std::string &result_json, std::string &error)
{
	if (check_writable_log(error))
		return -1;
	dive *d = divelog.dives.get_by_uniq_id(id);
	if (!d) {
		error = "NOT_FOUND";
		return -1;
	}
	// DeleteDive::DeleteDive() and redoit(): the dive leaves the log, with its
	// trip if it was the last one.
	Step step;
	step.kind = Step::DIVE_LIST;
	step.list.remove_dives = { d };
	step.text = "delete 1 dive(s) [" + list_of_dives(step.list.remove_dives) + "]";
	apply_dive_list(step);
	result_json = dive_list_json(step);
	push_step(std::move(step));
	return 0;
}

int renumber_dives(const std::vector<int> &ids, int start, std::string &result_json, std::string &error)
{
	if (check_writable_log(error))
		return -1;
	if (start < 0) {
		error = "BAD_REQUEST: start";
		return -1;
	}
	std::set<int> wanted(ids.begin(), ids.end());
	for (int id: ids) {
		if (!divelog.dives.get_by_uniq_id(id)) {
			error = "NOT_FOUND";
			return -1;
		}
	}
	// RenumberDialog::buttonClicked() (desktop-widgets/simplewidgets.cpp): the
	// dives in date order (the order of the table), from the starting number.
	Step step;
	step.kind = Step::RENUMBER;
	int number = start;
	for (auto &d: divelog.dives) {
		if (wanted.empty() || wanted.count(d->id))
			step.renumbered.push_back({ d.get(), number++ });
	}
	if (step.renumbered.empty()) {
		error = "NOTHING_TO_DO";
		return -1;
	}
	std::vector<dive *> list;
	for (auto &item: step.renumbered)
		list.push_back(item.first);
	// RenumberDives::RenumberDives(): "renumber %n dive(s) [list]".
	step.text = "renumber " + std::to_string(list.size()) + " dive(s) [" + list_of_dives(list) + "]";
	std::string unused;
	swap_step(step, result_json, unused);
	push_step(std::move(step));
	return 0;
}

// ImportDives::ImportDives(log, flags, source) as one undoable step; the
// tables of `log` are consumed. With `fingerprints_before`, the step swaps the
// core's fingerprint table with it on each undo and redo.
static int import_log(struct divelog &log, int flags, const std::string &source,
		      fingerprint_table *fingerprints_before, std::string &result_json, std::string &error)
{
	Step step;
	step.kind = Step::DIVE_LIST;
	size_t n = log.dives.size();
	step.text = (n == 1 ? "import 1 dive from " : "import " + std::to_string(n) + " dives from ") + source;
	for (auto &dv: log.dives)
		normalize_imported_cylinder_depths(dv.get());
	auto [dives_to_add, dives_to_remove, trips_to_add, sites_to_add, devices_to_add] =
		divelog.process_imported_dives(log, flags);
	step.devices = std::move(devices_to_add);
	for (auto &trip: trips_to_add)
		step.list.trips.push_back(std::move(trip));
	for (auto &ds: sites_to_add)
		step.list.sites.push_back(std::move(ds));
	for (auto &dp: dives_to_add) {
		dp->selected = false;
		dive_trip *trip = dp->divetrip;
		dp->divetrip = nullptr;
		dive_site *site = dp->dive_site;
		dp->dive_site = nullptr;
		step.list.dives.push_back({ std::move(dp), trip, site });
	}
	step.list.remove_dives = std::move(dives_to_remove);
	// Filter presets of the same name and contents are not added twice.
	for (const filter_preset &preset: log.filter_presets) {
		auto it = std::find_if(divelog.filter_presets.begin(), divelog.filter_presets.end(),
				       [&preset](const filter_preset &p) { return p.name == preset.name; });
		if (it != divelog.filter_presets.end() && internal::filter_data_equal(it->data, preset.data))
			continue;
		step.presets_to_add.emplace_back(preset.name, preset.data);
	}
	if (step.list.dives.empty()) {
		// ImportDives::workToBeDone(): every dive is already in the log.
		error = "NO_NEW_DIVES";
		return -1;
	}
	if (fingerprints_before) {
		// The core's table holds the new fingerprint: the step keeps it, and
		// the table goes back to its state before until the step applies.
		step.swap_fingerprints = true;
		step.fingerprints = std::move(*fingerprints_before);
		std::swap(::fingerprints, step.fingerprints);
	}
	apply_dive_list(step);
	result_json = dive_list_json(step);
	push_step(std::move(step));
	return 0;
}

int import_dives(const std::string &file, const std::string &source, std::string &result_json, std::string &error)
{
	if (check_writable_log(error))
		return -1;
	struct divelog log;
	if (parse_file(file.c_str(), &log)) {
		error = "IMPORT_FAILED";
		return -1;
	}
	if (log.dives.empty()) {
		error = "NO_DIVES";
		return -1;
	}
	// ImportDives::ImportDives(log, import_flags::merge_all_trips, source), as
	// QMLManager::importDivesFromFile() and the desktop import do.
	return import_log(log, import_flags::merge_all_trips, source, nullptr, result_json, error);
}

namespace internal {

int check_writable(std::string &error)
{
	return check_writable_log(error);
}

int import_downloaded(struct divelog &log, const std::string &source, fingerprint_table &fingerprints_before,
		      std::string &result_json, std::string &error)
{
	if (check_writable_log(error))
		return -1;
	// DiveImportedModel::recordDives(): prefer_imported | is_downloaded.
	return import_log(log, import_flags::prefer_imported | import_flags::is_downloaded, source, &fingerprints_before,
			  result_json, error);
}

} // namespace internal

int filter_presets_json(std::string &json)
{
	json = "{\"presetList\":[";
	for (size_t i = 0; i < divelog.filter_presets.size(); i++) {
		const filter_preset &p = divelog.filter_presets[i];
		if (i)
			json += ',';
		json += "{\"index\":" + std::to_string(i) + ",\"name\":";
		append_json_string(json, p.name);
		json += ",\"filter\":";
		internal::append_filter_data(json, p.data);
		json += '}';
	}
	json += "]}";
	return 0;
}

int filter_preset_save(const std::string &name_in, const std::string &fulltext, const std::string &fulltext_mode,
		       const std::vector<filter_rule> &rules, std::string &json, std::string &error)
{
	if (check_writable_log(error))
		return -1;
	std::string name = trim(name_in);
	if (name.empty()) {
		error = "BAD_REQUEST: name";
		return -1;
	}
	Step step;
	step.kind = Step::FILTER_PRESET;
	if (internal::filter_data_from_rules(fulltext, fulltext_mode, rules, step.preset_data, error))
		return -1;
	// Saving under an existing name replaces that preset (filterpresettable.h).
	int index = divelog.filter_presets.preset_id(name);
	if (index >= 0) {
		step.preset_op = Step::EDIT;
		step.preset_index = index;
		step.text = "Edit filter preset " + name;
	} else {
		step.preset_op = Step::CREATE;
		step.preset_name = name;
		step.text = "Create filter preset " + name;
	}
	apply_filter_preset(step);
	push_step(std::move(step));
	return filter_presets_json(json);
}

int filter_preset_delete(int index, std::string &json, std::string &error)
{
	if (check_writable_log(error))
		return -1;
	if (index < 0 || static_cast<size_t>(index) >= divelog.filter_presets.size()) {
		error = "NOT_FOUND";
		return -1;
	}
	Step step;
	step.kind = Step::FILTER_PRESET;
	step.preset_op = Step::REMOVE;
	step.preset_index = index;
	step.text = "Delete filter preset " + divelog.filter_presets[index].name;
	apply_filter_preset(step);
	push_step(std::move(step));
	return filter_presets_json(json);
}

int list_loaded_dives(std::string &json)
{
	json = internal::dives_json();
	return 0;
}

void set_cloud_test_email(const std::string &email)
{
	cloud_test_email = email;
}

void set_cloud_writes_enabled(bool enabled)
{
	cloud_writes_enabled = enabled;
}

} // namespace opendives
