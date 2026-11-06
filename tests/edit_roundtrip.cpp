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
// field: notes, suit, rating, visibility, buddies, diveguide, tags
// Prints KEY=VALUE lines (dives, text, undo_text, error); exit status 0 when
// the check passes, 1 when it fails, 2 when the log has no dive.
#include "core/libopendives/opendives.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/tag.h"
#include "core/trip.h"

#include <functional>

#include <algorithm>
#include <cstdio>
#include <string>
#include <vector>

using namespace opendives;

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
