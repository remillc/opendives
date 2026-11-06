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

#include "core/dive.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/file.h"
#include "core/fulltext.h"
#include "core/git-access.h"
#include "core/pref.h"
#include "core/tag.h"
#include "core/trip.h"
#include "core/version.h"
#include "commands/command.h"

#include <git2.h>
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <ctime>
#include <memory>
#include <vector>

namespace opendives {

// ---------------------------------------------------------------------------
// Minimal JSON reader for edit_dive(): one flat object whose values are
// strings, integers or arrays of strings.

namespace {

struct JsonValue {
	enum Kind { STRING, NUMBER, LIST } kind = STRING;
	std::string text;
	long number = 0;
	std::vector<std::string> list;
};

class JsonReader {
public:
	explicit JsonReader(const std::string &s) : s(s) {}

	bool object(std::vector<std::pair<std::string, JsonValue>> &out)
	{
		space();
		if (!eat('{'))
			return false;
		space();
		if (eat('}'))
			return end();
		for (;;) {
			std::string key;
			JsonValue value;
			space();
			if (!string(key))
				return false;
			space();
			if (!eat(':'))
				return false;
			space();
			if (!val(value))
				return false;
			out.emplace_back(std::move(key), std::move(value));
			space();
			if (eat(','))
				continue;
			if (eat('}'))
				return end();
			return false;
		}
	}

private:
	const std::string &s;
	size_t i = 0;

	void space()
	{
		while (i < s.size() && isspace(static_cast<unsigned char>(s[i])))
			i++;
	}
	bool eat(char c)
	{
		if (i < s.size() && s[i] == c) {
			i++;
			return true;
		}
		return false;
	}
	bool end()
	{
		space();
		return i == s.size();
	}
	static void utf8(std::string &out, unsigned cp)
	{
		if (cp < 0x80) {
			out += static_cast<char>(cp);
		} else if (cp < 0x800) {
			out += static_cast<char>(0xC0 | (cp >> 6));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		} else if (cp < 0x10000) {
			out += static_cast<char>(0xE0 | (cp >> 12));
			out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		} else {
			out += static_cast<char>(0xF0 | (cp >> 18));
			out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
			out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		}
	}
	bool hex4(unsigned &cp)
	{
		if (i + 4 > s.size())
			return false;
		cp = 0;
		for (int k = 0; k < 4; k++) {
			char c = s[i++];
			cp <<= 4;
			if (c >= '0' && c <= '9')
				cp |= c - '0';
			else if (c >= 'a' && c <= 'f')
				cp |= c - 'a' + 10;
			else if (c >= 'A' && c <= 'F')
				cp |= c - 'A' + 10;
			else
				return false;
		}
		return true;
	}
	bool string(std::string &out)
	{
		if (!eat('"'))
			return false;
		while (i < s.size()) {
			char c = s[i++];
			if (c == '"')
				return true;
			if (c != '\\') {
				out += c;
				continue;
			}
			if (i >= s.size())
				return false;
			char e = s[i++];
			switch (e) {
			case '"': out += '"'; break;
			case '\\': out += '\\'; break;
			case '/': out += '/'; break;
			case 'b': out += '\b'; break;
			case 'f': out += '\f'; break;
			case 'n': out += '\n'; break;
			case 'r': out += '\r'; break;
			case 't': out += '\t'; break;
			case 'u': {
				unsigned cp;
				if (!hex4(cp))
					return false;
				if (cp >= 0xD800 && cp < 0xDC00 && i + 6 <= s.size() && s[i] == '\\' && s[i + 1] == 'u') {
					i += 2;
					unsigned low;
					if (!hex4(low) || low < 0xDC00 || low > 0xDFFF)
						return false;
					cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
				}
				utf8(out, cp);
				break;
			}
			default:
				return false;
			}
		}
		return false;
	}
	bool val(JsonValue &v)
	{
		if (i < s.size() && s[i] == '"') {
			v.kind = JsonValue::STRING;
			return string(v.text);
		}
		if (eat('[')) {
			v.kind = JsonValue::LIST;
			space();
			if (eat(']'))
				return true;
			for (;;) {
				std::string item;
				space();
				if (!string(item))
					return false;
				v.list.push_back(std::move(item));
				space();
				if (eat(','))
					continue;
				return eat(']');
			}
		}
		size_t start = i;
		if (i < s.size() && s[i] == '-')
			i++;
		while (i < s.size() && isdigit(static_cast<unsigned char>(s[i])))
			i++;
		if (i == start || (i == start + 1 && s[start] == '-'))
			return false;
		v.kind = JsonValue::NUMBER;
		v.number = strtol(s.substr(start, i - start).c_str(), nullptr, 10);
		return true;
	}
};

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

struct Step {
	enum Kind { DIVE, TRIP_FIELD, MOVE } kind = DIVE;
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

bool writes_allowed()
{
	if (!internal::current_log_is_cloud())
		return true; // a local log cannot affect the cloud (plan, section 4)
	if (cloud_writes_enabled)
		return true;
	std::string a = prefs.cloud_storage_email, b = cloud_test_email;
	std::transform(a.begin(), a.end(), a.begin(), [](unsigned char c) { return std::tolower(c); });
	std::transform(b.begin(), b.end(), b.begin(), [](unsigned char c) { return std::tolower(c); });
	return !b.empty() && a == b;
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

int pending_for(const std::string &log)
{
	return static_cast<int>(list_pending(log).size());
}

void on_log_loaded()
{
	steps.clear();
	applied = 0;
	clean_index = 0;
	next_to_write = 0;
	loaded_format_version = read_format_version();
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

static int swap_step(Step &step, std::string &result_json, std::string &error)
{
	if (step.kind == Step::TRIP_FIELD) {
		std::string &field = step.notes ? step.trip->notes : step.trip->location;
		std::swap(field, step.value);
		return trip_json(step.trip->id, result_json, error);
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

	// saveChangesCloud(): reload with git_local_only off, which fetches,
	// merges and pushes (sync_with_remote), then reads the merged log.
	bool was_local_only = git_local_only;
	git_local_only = false;
	int ret = internal::load(log, error);
	git_local_only = was_local_only;
	if (ret) {
		error = "STOPPED: " + error;
		return -1;
	}
	apply_log_prefs();
	divelog.process_loaded_dives();
	if (!git_remote_sync_successful)
		status_json = sync_json("stopped", true);
	else
		status_json = sync_json(server_in_local ? "pushed" : local_in_server ? "pulled" : "merged", true);
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
