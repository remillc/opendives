// SPDX-License-Identifier: GPL-2.0
// Test 1 of docs/editing-and-sync-plan.md: local edit round trip, through the
// façade, on a git log. Driven by tests/run-edit-roundtrip.sh, which compares
// the git trees.
//
// usage: edit-roundtrip local    <dive-file> <new-folder>  test 2: create a log, edit, save, reopen
//        edit-roundtrip baseline <repo[branch]> <new-repo[branch]>
//                                                       load as the app does, save into a new repo
//        edit-roundtrip edit   <repo[branch]> <field>   edit the first dive, save, reload, check
//        edit-roundtrip undo   <repo[branch]> <field>   edit, save, undo, save
//        edit-roundtrip refuse <repo[branch]> <other[branch]>
//                                                       edit, then save into an unrelated repo
//        edit-roundtrip divelist <repo[branch]> <file>  log a dive by hand, import <file>; each undone
//        edit-roundtrip presets  <repo[branch]> -       filter presets created, edited, deleted, undone
//        edit-roundtrip conflict <repo[branch]> device|cloud
//                                                       a sync conflict on the notes, resolved
// field: notes, suit, rating, visibility, buddies, diveguide, tags
// Prints KEY=VALUE lines (dives, text, undo_text, error); exit status 0 when
// the check passes, 1 when it fails, 2 when the log has no dive.
#include "core/libopendives/opendives.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/tag.h"
#include "core/trip.h"
#include "core/divesite.h"
#include "core/divecomputer.h"
#include "core/filterpreset.h"
#include "core/filterpresettable.h"

#include <git2.h>

#include <functional>

#include <algorithm>
#include <cstdio>
#include <string>
#include <vector>

using namespace opendives;

// save-git.cpp (not in a header).
int update_git_checkout(git_repository *repo, git_object *parent, git_tree *tree);

static std::string json_string(const std::string &s)
{
	std::string out = "\"";
	for (unsigned char c: s) {
		if (c == '"' || c == '\\') {
			out += '\\';
			out += static_cast<char>(c);
		} else if (c == '\n') {
			out += "\\n";
		} else if (c < 0x20) {
			char buf[8];
			snprintf(buf, sizeof(buf), "\\u%04x", c);
			out += buf;
		} else {
			out += static_cast<char>(c);
		}
	}
	return out + "\"";
}

static std::string json_list(const std::vector<std::string> &list)
{
	std::string out = "[";
	for (size_t i = 0; i < list.size(); i++)
		out += (i ? "," : "") + json_string(list[i]);
	return out + "]";
}

static std::vector<std::string> split(const std::string &s)
{
	std::vector<std::string> out;
	size_t start = 0;
	while (start <= s.size()) {
		size_t comma = s.find(',', start);
		std::string item = s.substr(start, comma == std::string::npos ? std::string::npos : comma - start);
		size_t a = item.find_first_not_of(" \t"), b = item.find_last_not_of(" \t");
		if (a != std::string::npos)
			out.push_back(item.substr(a, b - a + 1));
		if (comma == std::string::npos)
			break;
		start = comma + 1;
	}
	return out;
}

static std::vector<std::string> tags_of(const dive &d)
{
	std::vector<std::string> out;
	for (const divetag *t: d.tags)
		out.push_back(t->name);
	return out;
}

// The value of a field as a comparable string (lists: sorted for tags, whose
// order the core normalises; in order for buddies and guides).
static std::string field_value(const dive &d, const std::string &field)
{
	if (field == "notes")
		return d.notes;
	if (field == "suit")
		return d.suit;
	if (field == "rating")
		return std::to_string(d.rating);
	if (field == "visibility")
		return std::to_string(d.visibility);
	if (field == "wavesize")
		return std::to_string(d.wavesize);
	if (field == "current")
		return std::to_string(d.current);
	if (field == "surge")
		return std::to_string(d.surge);
	if (field == "chill")
		return std::to_string(d.chill);
	if (field == "buddies")
		return json_list(split(d.buddy));
	if (field == "diveguide")
		return json_list(split(d.diveguide));
	std::vector<std::string> tags = tags_of(d);
	std::sort(tags.begin(), tags.end());
	return json_list(tags);
}

// A change of `field` that differs from the current value. Lists drop their
// first entry and gain a new one, to test both directions and the order.
static bool make_change(const dive &d, const std::string &field, std::string &request, std::string &expected)
{
	if (field == "notes" || field == "suit") {
		std::string old = field == "notes" ? d.notes : d.suit;
		std::string value = field == "notes" ? old + (old.empty() ? "" : "\n") + "OpenDives edit test, \"quoted\" é"
						     : "OpenDives test suit";
		if (value == old)
			value += " 2";
		request = "{" + json_string(field) + ":" + json_string(value) + "}";
		expected = value;
		return true;
	}
	if (field == "rating" || field == "visibility" || field == "wavesize" || field == "current" || field == "surge" ||
	    field == "chill") {
		int old = field == "rating" ? d.rating : field == "visibility" ? d.visibility : field == "wavesize" ? d.wavesize
			: field == "current" ? d.current : field == "surge" ? d.surge : d.chill;
		int value = (old + 1) % 6;
		request = "{" + json_string(field) + ":" + std::to_string(value) + "}";
		expected = std::to_string(value);
		return true;
	}
	if (field == "buddies" || field == "diveguide" || field == "tags") {
		std::vector<std::string> old = field == "buddies" ? split(d.buddy) : field == "diveguide" ? split(d.diveguide) : tags_of(d);
		std::vector<std::string> wanted(old.begin() + (old.empty() ? 0 : 1), old.end());
		wanted.push_back(field == "buddies" ? "OpenDives Buddy" : field == "diveguide" ? "OpenDives Guide" : "opendives-test");
		request = "{" + json_string(field) + ":" + json_list(wanted) + "}";
		if (field == "tags")
			std::sort(wanted.begin(), wanted.end());
		expected = json_list(wanted);
		return true;
	}
	return false;
}

static size_t trip_by_id_size(int id)
{
	for (auto &t: divelog.trips)
		if (t->id == id)
			return t->dives.size();
	return 0;
}

static std::string trip_location(int id)
{
	for (auto &t: divelog.trips)
		if (t->id == id)
			return t->location;
	return std::string();
}

static dive *first_dive()
{
	return divelog.dives.empty() ? nullptr : divelog.dives[0].get();
}

static int open_log(const std::string &repo)
{
	std::string json, error;
	if (list_dives(repo, json, error)) {
		printf("error=%s\n", error.c_str());
		return 1;
	}
	printf("dives=%zu\n", divelog.dives.size());
	return first_dive() ? 0 : 2;
}

int main(int argc, char **argv)
{
	if (argc != 4) {
		fprintf(stderr, "usage: %s edit|undo|refuse <repo[branch]> <field|other-repo[branch]>\n", argv[0]);
		return 1;
	}
	std::string mode = argv[1], repo = argv[2], arg = argv[3];
	init();

	if (mode == "local") {
		// Test 2: a log without account. `repo` is a dive file, `arg` a
		// folder that does not exist yet: create the log there as the app
		// does (import_file), edit, save, reopen.
		std::string log = arg + "[main]", error, json, result;
		int count = import_file(repo, log, error);
		printf("created=%d\n", count);
		if (count <= 0 || open_log(log))
			return 1;
		dive *d = first_dive();
		timestamp_t when = d->when;
		std::string request, expected;
		make_change(*d, "notes", request, expected);
		if (edit_dive(d->id, request, result, error) || save_local(error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		printf("text=%s\n", undo_text().c_str());
		if (open_log(log))
			return 1;
		d = first_dive();
		if (d->when != when || d->notes != expected) {
			printf("error=notes not saved\n");
			return 1;
		}
		return 0;
	}

	if (int ret = open_log(repo))
		return ret;

	if (mode == "sites") {
		// Each site change: applied, saved, undone, saved again; the script
		// then checks that the tree is the original one.
		std::vector<dive_site *> used;
		for (auto &ds: divelog.sites)
			if (!ds->dives.empty())
				used.push_back(ds.get());
		if (used.size() < 2) {
			printf("error=fewer than two sites with dives\n");
			return 2;
		}
		uint32_t a = used[0]->uuid, b = used[1]->uuid;
		int dive_id = used[1]->dives[0]->id;
		size_t sites0 = divelog.sites.size();
		auto undo_and_save = [&](const char *name) {
			std::string json, error;
			printf("step=%s\n", undo_text().c_str());
			if (save_local(error) || undo(json, error) || save_local(error)) {
				printf("error=%s: save or undo: %s\n", name, error.c_str());
				return false;
			}
			if (divelog.sites.size() != sites0) {
				printf("error=%s: undo did not restore the sites\n", name);
				return false;
			}
			return true;
		};
		std::string json, error;
		struct Edit {
			const char *field, *value;
			int lat, lon;
		};
		for (Edit e: { Edit{ "name", "OpenDives site", 0, 0 }, Edit{ "location", "", 45500000, -73500000 },
			       Edit{ "country", "Testland", 0, 0 }, Edit{ "notes", "site notes", 0, 0 } }) {
			if (site_edit(a, e.field, e.value, e.lat, e.lon, json, error)) {
				printf("error=edit %s: %s\n", e.field, error.c_str());
				return 1;
			}
			if (!undo_and_save(e.field))
				return 1;
		}
		if (edit_dive(dive_id, "{\"site\":" + std::to_string(a) + "}", json, error) || !undo_and_save("dive site")) {
			printf("error=dive site: %s\n", error.c_str());
			return 1;
		}
		if (sites_merge(a, b, json, error)) {
			printf("error=merge: %s\n", error.c_str());
			return 1;
		}
		if (divelog.sites.size() != sites0 - 1 || !undo_and_save("merge"))
			return 1;
		// Delete a used site: its dives stay, without a site, until the undo.
		size_t a_dives = divelog.sites.get_by_uuid(a)->dives.size();
		dive *a_dive = divelog.sites.get_by_uuid(a)->dives[0];
		if (site_delete(a, json, error) || divelog.sites.size() != sites0 - 1 || a_dive->dive_site) {
			printf("error=delete used site: %s\n", error.c_str());
			return 1;
		}
		if (!undo_and_save("delete used site"))
			return 1;
		if (a_dive->dive_site != divelog.sites.get_by_uuid(a) || divelog.sites.get_by_uuid(a)->dives.size() != a_dives) {
			printf("error=delete used site: the undo did not give the dives their site back\n");
			return 1;
		}
		if (site_create("OpenDives new site", 45500000, -73500000, json, error)) {
			printf("error=create: %s\n", error.c_str());
			return 1;
		}
		uint32_t created = static_cast<uint32_t>(atol(json.c_str() + json.find("\"uuid\":") + 7));
		if (divelog.sites.size() != sites0 + 1) {
			printf("error=create: site count\n");
			return 1;
		}
		if (sites_delete_unused({ created }, json, error) || divelog.sites.size() != sites0) {
			printf("error=delete: %s\n", error.c_str());
			return 1;
		}
		// Undo the delete then the creation: back to the original.
		if (undo(json, error) || undo(json, error) || save_local(error) || divelog.sites.size() != sites0) {
			printf("error=undo create and delete: %s\n", error.c_str());
			return 1;
		}
		printf("step=create, delete\n");
		return 0;
	}

	if (mode == "trips") {
		// Each trip operation: applied and checked, saved, undone, saved again.
		// The script then checks that the tree is the original one.
		auto trips_with = [](size_t min) {
			std::vector<dive_trip *> out;
			for (auto &t: divelog.trips)
				if (t->dives.size() >= min)
					out.push_back(t.get());
			return out;
		};
		std::vector<dive_trip *> big = trips_with(3);
		if (big.empty() || divelog.trips.size() < 2) {
			printf("error=no trip with 3 dives and another trip\n");
			return 2;
		}
		dive_trip *trip = big[0];
		dive_trip *other = divelog.trips[0].get() == trip ? divelog.trips[1].get() : divelog.trips[0].get();
		int trip_id = trip->id, other_id = other->id;
		size_t trips0 = divelog.trips.size(), size0 = trip->dives.size();
		int second = trip->dives[1]->id;
		dive *loose = nullptr;
		for (auto &d: divelog.dives)
			if (!d->divetrip)
				loose = d.get();
		struct Op {
			const char *name;
			std::function<int(std::string &, std::string &)> run;
			std::function<bool()> check;
		};
		std::vector<Op> ops = {
			{ "split", [&](std::string &j, std::string &e) { return trip_split_at(second, j, e); },
			  [&] { return divelog.trips.size() == trips0 + 1; } },
			{ "remove", [&](std::string &j, std::string &e) { return trip_remove_dive(second, j, e); },
			  [&] { return trip_by_id_size(trip_id) == size0 - 1; } },
			{ "ungroup", [&](std::string &j, std::string &e) { return trip_ungroup(trip_id, j, e); },
			  [&] { return divelog.trips.size() == trips0 - 1; } },
			{ "merge", [&](std::string &j, std::string &e) { return trips_merge(trip_id, other_id, j, e); },
			  [&] { return divelog.trips.size() == trips0 - 1; } },
			{ "location", [&](std::string &j, std::string &e) { return edit_trip(trip_id, "location", "OpenDives test", j, e); },
			  [&] { return trip_location(trip_id) == "OpenDives test"; } },
		};
		if (loose)
			ops.push_back({ "add", [&](std::string &j, std::string &e) { return trip_add_dives(trip_id, { loose->id }, j, e); },
					[&] { return trip_by_id_size(trip_id) == size0 + 1; } });
		for (Op &op: ops) {
			std::string json, error;
			if (op.run(json, error)) {
				printf("error=%s: %s\n", op.name, error.c_str());
				return 1;
			}
			if (!op.check()) {
				printf("error=%s: unexpected result\n", op.name);
				return 1;
			}
			printf("step=%s\n", undo_text().c_str());
			if (save_local(error) || undo(json, error) || save_local(error)) {
				printf("error=%s: save or undo: %s\n", op.name, error.c_str());
				return 1;
			}
			if (divelog.trips.size() != trips0 || trip_by_id_size(trip_id) != size0) {
				printf("error=%s: undo did not restore the trips\n", op.name);
				return 1;
			}
		}
		return 0;
	}

	if (mode == "divelist") {
		// A dive logged by hand, then the file `arg` imported: each created,
		// checked, saved, undone, saved. The script then checks that the tree
		// is the original one.
		std::string json, error;
		size_t dives0 = divelog.dives.size();
		auto undo_and_save = [&](const char *name) {
			printf("step=%s\n", undo_text().c_str());
			if (save_local(error) || undo(json, error) || save_local(error) || divelog.dives.size() != dives0) {
				printf("error=%s: save or undo: %s\n", name, error.c_str());
				return false;
			}
			return true;
		};
		std::string fields = "{\"date\":\"2001-02-03T10:20\",\"durationSeconds\":2700,\"maxDepthMm\":18300,"
				     "\"buddies\":[\"OpenDives test\"],\"rating\":3,\"notes\":\"logged by hand\"}";
		if (create_dive(fields, json, error)) {
			printf("error=create: %s\n", error.c_str());
			return 1;
		}
		dive *added = nullptr;
		for (auto &dv: divelog.dives)
			if (dv->notes == "logged by hand")
				added = dv.get();
		if (divelog.dives.size() != dives0 + 1 || !added || added->duration.seconds != 2700 ||
		    added->maxdepth.mm != 18300 || added->dcs[0].samples.empty() || added->buddy != "OpenDives test" ||
		    undo_text() != "add dive") {
			printf("error=create: unexpected dive\n");
			return 1;
		}
		if (!undo_and_save("create"))
			return 1;
		if (import_dives(arg, "import-test", json, error)) {
			if (error == "NO_NEW_DIVES") {
				printf("import=nothing new\n");
				return 0;
			}
			printf("error=import: %s\n", error.c_str());
			return 1;
		}
		printf("import=%zu dives\n", divelog.dives.size() - dives0);
		if (divelog.dives.size() <= dives0 || undo_text().rfind("import ", 0) != 0) {
			printf("error=import: no dive added\n");
			return 1;
		}
		return undo_and_save("import") ? 0 : 1;
	}

	if (mode == "presets") {
		// A filter preset created, edited and deleted, each saved and undone;
		// then created, saved, read again from git, and deleted. The script
		// checks that the tree is the original one.
		std::string json, error;
		size_t presets0 = divelog.filter_presets.size();
		std::vector<filter_rule> deep = { { "depth", "", "greater", "10000,0", false } };
		std::vector<filter_rule> people = { { "people", "exact", "", "OpenDives test\n", false } };
		auto undo_and_save = [&](const char *name) {
			printf("step=%s\n", undo_text().c_str());
			if (save_local(error) || undo(json, error) || save_local(error)) {
				printf("error=%s: save or undo: %s\n", name, error.c_str());
				return false;
			}
			return true;
		};
		if (filter_preset_save("OpenDives test", "", "", deep, json, error) ||
		    divelog.filter_presets.size() != presets0 + 1 || !undo_and_save("create") ||
		    divelog.filter_presets.size() != presets0) {
			printf("error=create preset: %s\n", error.c_str());
			return 1;
		}
		// Refused: OpenDives criteria and values with commas cannot be kept in the log.
		if (!filter_preset_save("x", "", "", { { "od_country", "", "", "France", false } }, json, error) ||
		    !filter_preset_save("x", "", "", { { "suit", "exact", "", "wet, 3mm\n", false } }, json, error)) {
			printf("error=a preset the log cannot keep was accepted\n");
			return 1;
		}
		// Create, save, read again, edit, delete, each undone in turn.
		if (filter_preset_save("OpenDives test", "wreck", "substring", deep, json, error) || save_local(error) ||
		    open_log(repo)) {
			printf("error=create and save: %s\n", error.c_str());
			return 1;
		}
		int index = divelog.filter_presets.preset_id("OpenDives test");
		if (index < 0 || divelog.filter_presets[index].data.constraints.size() != 1 ||
		    divelog.filter_presets[index].fulltext_query() != "wreck") {
			printf("error=preset not read back from git\n");
			return 1;
		}
		if (filter_preset_save("OpenDives test", "", "", people, json, error) || !undo_and_save("edit")) {
			printf("error=edit: %s\n", error.c_str());
			return 1;
		}
		if (filter_preset_delete(divelog.filter_presets.preset_id("OpenDives test"), json, error) ||
		    divelog.filter_presets.size() != presets0 || !undo_and_save("delete") ||
		    divelog.filter_presets.size() != presets0 + 1) {
			printf("error=delete: %s\n", error.c_str());
			return 1;
		}
		// Back to the original: delete the preset for good.
		if (filter_preset_delete(divelog.filter_presets.preset_id("OpenDives test"), json, error) || save_local(error)) {
			printf("error=final delete: %s\n", error.c_str());
			return 1;
		}
		return 0;
	}

	if (mode == "conflict") {
		// A dive whose notes changed on this device and in the "cloud" (another
		// branch from the same commit), merged as Subsurface's sync does
		// (try_to_git_merge(): union of the lines, "Automatic merge"); then
		// the conflict is read and resolved by keeping `arg` ("device" or
		// "cloud"). Needs a non-bare repository with the branch checked out.
		std::string json, error, result;
		std::string path = repo.substr(0, repo.find('['));
		git_repository *grepo = nullptr;
		git_oid base_id, local_id, remote_id;
		git_commit *base = nullptr;
		if (git_repository_open(&grepo, path.c_str()) || git_reference_name_to_id(&base_id, grepo, "refs/heads/main") ||
		    git_commit_lookup(&base, grepo, &base_id)) {
			printf("error=open the repository\n");
			return 1;
		}
		git_reference *cloud_ref = nullptr;
		if (git_branch_create(&cloud_ref, grepo, "cloud", base, 0)) {
			printf("error=create the cloud branch\n");
			return 1;
		}
		git_reference_free(cloud_ref);
		timestamp_t when = first_dive()->when;
		auto edit_notes = [&](const std::string &log, const char *notes) {
			if (open_log(log))
				return false;
			dive *dv = first_dive();
			if (dv->when != when)
				return false;
			return !edit_dive(dv->id, std::string("{\"notes\":\"") + notes + "\"}", result, error) && !save_local(error);
		};
		if (!edit_notes(path + "[cloud]", "cloud version") || !edit_notes(repo, "device version")) {
			printf("error=edit both sides: %s\n", error.c_str());
			return 1;
		}
		git_reference_name_to_id(&local_id, grepo, "refs/heads/main");
		git_reference_name_to_id(&remote_id, grepo, "refs/heads/cloud");
		// The merge, as try_to_git_merge().
		git_commit *lc = nullptr, *rc = nullptr, *mc = nullptr;
		git_tree *lt = nullptr, *rt = nullptr, *bt = nullptr, *mt = nullptr;
		git_index *merged = nullptr;
		git_merge_options opts;
		git_merge_init_options(&opts, GIT_MERGE_OPTIONS_VERSION);
		opts.flags = GIT_MERGE_FIND_RENAMES;
		opts.file_favor = GIT_MERGE_FILE_FAVOR_UNION;
		opts.rename_threshold = 100;
		git_oid tree_id, merge_id;
		git_signature *sig = nullptr;
		git_reference *main_ref = nullptr, *moved = nullptr;
		if (git_commit_lookup(&lc, grepo, &local_id) || git_commit_lookup(&rc, grepo, &remote_id) ||
		    git_commit_tree(&lt, lc) || git_commit_tree(&rt, rc) || git_commit_tree(&bt, base) ||
		    git_merge_trees(&merged, grepo, bt, lt, rt, &opts) || git_index_has_conflicts(merged) ||
		    git_index_write_tree_to(&tree_id, merged, grepo) || git_tree_lookup(&mt, grepo, &tree_id) ||
		    git_signature_now(&sig, "test", "test@example.invalid") ||
		    git_commit_create_v(&merge_id, grepo, nullptr, sig, sig, nullptr, "Automatic merge\n\nCreated by test\n", mt, 2,
					lc, rc) ||
		    git_reference_lookup(&main_ref, grepo, "refs/heads/main") ||
		    update_git_checkout(grepo, reinterpret_cast<git_object *>(lc), mt) ||
		    git_reference_set_target(&moved, main_ref, &merge_id, "test merge")) {
			printf("error=merge: %s\n", git_error_last() ? git_error_last()->message : "?");
			return 1;
		}
		git_repository_free(grepo);
		if (open_log(repo) || sync_conflicts(json, error) || json.find("\"conflict\":true") == std::string::npos ||
		    json.find("\"key\":\"notes\"") == std::string::npos || json.find("device version") == std::string::npos ||
		    json.find("cloud version") == std::string::npos) {
			printf("error=conflict not found: %s %s\n", json.c_str(), error.c_str());
			return 1;
		}
		printf("conflict=%s\n", json.c_str());
		if (resolve_conflicts(arg, error)) {
			printf("error=resolve: %s\n", error.c_str());
			return 1;
		}
		std::string expected = arg + " version";
		if (first_dive()->notes != expected) {
			printf("error=notes are '%s' after keeping %s\n", first_dive()->notes.c_str(), arg.c_str());
			return 1;
		}
		if (sync_conflicts(json, error) || json != "{\"conflict\":false}") {
			printf("error=conflict still there: %s\n", json.c_str());
			return 1;
		}
		return 0;
	}

	if (mode == "baseline") {
		// The app loads through list_dives(), which runs process_loaded_dives()
		// (automatic trips, as Subsurface does): the baseline is saved after it.
		std::string error;
		if (save_as(arg, error)) {
			printf("error=save: %s\n", error.c_str());
			return 1;
		}
		return 0;
	}

	dive *d = first_dive();
	timestamp_t when = d->when;
	std::string field = mode == "refuse" ? "notes" : arg;
	std::string request, expected, result, error;
	if (!make_change(*d, field, request, expected)) {
		printf("error=unknown field %s\n", field.c_str());
		return 1;
	}
	if (edit_dive(d->id, request, result, error)) {
		printf("error=edit: %s\n", error.c_str());
		return 1;
	}
	printf("text=%s\n", undo_text().c_str());
	if (!has_unsaved_changes()) {
		printf("error=no unsaved change after the edit\n");
		return 1;
	}

	if (mode == "refuse") {
		int ret = save_as(arg, error);
		printf("save_as=%d %s\n", ret, error.c_str());
		return ret != 0 && error.rfind("SAVE_REPLACEMENT", 0) == 0 ? 0 : 1;
	}

	if (save_local(error)) {
		printf("error=save: %s\n", error.c_str());
		return 1;
	}
	if (has_unsaved_changes()) {
		printf("error=still unsaved after the save\n");
		return 1;
	}

	if (mode == "undo") {
		std::string undo_label = undo_text();
		if (undo(result, error)) {
			printf("error=undo: %s\n", error.c_str());
			return 1;
		}
		printf("undo_text=(undo) %s\n", undo_label.c_str());
		if (!has_unsaved_changes()) {
			printf("error=no unsaved change after the undo\n");
			return 1;
		}
		if (save_local(error)) {
			printf("error=save after undo: %s\n", error.c_str());
			return 1;
		}
		return 0;
	}

	// Reload from git and check the field.
	if (int ret = open_log(repo))
		return 1;
	d = first_dive();
	if (d->when != when) {
		printf("error=first dive changed after reload\n");
		return 1;
	}
	std::string got = field_value(*d, field);
	if (got != expected) {
		printf("error=%s is %s, expected %s\n", field.c_str(), got.c_str(), expected.c_str());
		return 1;
	}
	return 0;
}
