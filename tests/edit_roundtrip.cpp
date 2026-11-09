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
//        edit-roundtrip syncundo <git://…[branch]> -    edit, save, sync, undo, save, sync
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
#include "core/equipment.h"
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
	if (field == "airtemp")
		return std::to_string(d.airtemp.mkelvin);
	if (field == "watertemp")
		return std::to_string(d.watertemp.mkelvin);
	if (field == "salinity")
		return std::to_string(d.user_salinity);
	if (field == "atmpress")
		return std::to_string(d.surface_pressure.mbar);
	if (field == "divemode")
		return divemode_text[d.dcs[0].divemode];
	if (field == "invalid")
		return d.invalid ? "1" : "0";
	if (field == "weights") {
		std::string out;
		for (const weightsystem_t &ws: d.weightsystems)
			out += ws.description + "=" + std::to_string(ws.weight.grams) + ";";
		return out;
	}
	if (field == "cylinders") {
		std::string out;
		for (const cylinder_t &c: d.cylinders)
			out += c.type.description + "/" + std::to_string(c.type.size.mliter) + "/" + std::to_string(c.start.mbar) + "/" +
			       std::to_string(c.gasmix.o2.permille) + ";";
		return out;
	}
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
	if (field == "airtemp" || field == "watertemp" || field == "salinity" || field == "atmpress") {
		int old = std::stoi(field_value(d, field));
		int value = field == "salinity" ? (old == 10300 ? 10000 : 10300)
			  : field == "atmpress" ? (old ? old + 10 : 1013)
			  : (old ? old + 1000 : 293150);
		const char *key = field == "airtemp" ? "airTempMk" : field == "watertemp" ? "waterTempMk"
				: field == "salinity" ? "userSalinity" : "surfacePressureMbar";
		request = "{" + json_string(key) + ":" + std::to_string(value) + "}";
		expected = std::to_string(value);
		return true;
	}
	if (field == "divemode") {
		expected = d.dcs[0].divemode == OC ? "CCR" : "OC";
		request = "{\"divemode\":" + json_string(expected) + "}";
		return true;
	}
	if (field == "invalid") {
		expected = d.invalid ? "0" : "1";
		request = std::string("{\"invalid\":") + (d.invalid ? "false" : "true") + "}";
		return true;
	}
	if (field == "weights") {
		// The weights of the dive, plus a belt of 2 kg.
		std::vector<std::string> items;
		for (const weightsystem_t &ws: d.weightsystems)
			items.push_back("{\"description\":" + json_string(ws.description) + ",\"grams\":" + std::to_string(ws.weight.grams) + "}");
		items.push_back("{\"description\":\"belt\",\"grams\":2000}");
		request = "{\"weights\":" + json_list(items) + "}";
		expected = field_value(d, field) + "belt=2000;";
		return true;
	}
	if (field == "cylinders") {
		// The cylinders of the dive unchanged, plus a new AL80 of EAN32, which
		// AddCylinder puts at first_hidden_cylinder().
		std::vector<std::string> items;
		for (size_t i = 0; i < d.cylinders.size(); i++)
			items.push_back("{\"index\":" + std::to_string(i) + "}");
		items.push_back("{\"index\":-1,\"description\":\"AL80\",\"sizeMl\":11100,\"workingPressureMbar\":206843,\"o2Permille\":320}");
		request = "{\"cylinders\":" + json_list(items) + "}";
		int at = first_hidden_cylinder(&d);
		expected.clear();
		for (int i = 0; i <= static_cast<int>(d.cylinders.size()); i++) {
			if (i == at)
				expected += "AL80/11100/0/320;";
			if (i < static_cast<int>(d.cylinders.size())) {
				const cylinder_t &c = d.cylinders[i];
				expected += c.type.description + "/" + std::to_string(c.type.size.mliter) + "/" + std::to_string(c.start.mbar) +
					    "/" + std::to_string(c.gasmix.o2.permille) + ";";
			}
		}
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

	if (mode == "plans") {
		// Planned dives: saved, reopened, replaced, left out of everything else.
		std::string log = arg + "[main]", error, json, result;
		int count = import_file(repo, log, error);
		if (count <= 0 || open_log(log))
			return 1;
		auto fail = [](const char *what) {
			printf("error=%s\n", what);
			return 1;
		};
		auto plans = [] {
			std::string list;
			list_plans(list);
			return list;
		};
		auto listed = [] {
			std::string list;
			list_loaded_dives(list);
			return list;
		};
		const std::string before = listed();
		int last_number = divelog.dives.back()->number;
		// In the future, so that it is the last of the table.
		const std::string request = "{\"levels\":[{\"depthMm\":30000,\"durationSeconds\":1200},{\"depthMm\":18000,\"durationSeconds\":600}],"
					    "\"when\":1800000000,\"bottomSacMlMin\":17000,\"gfLow\":35,\"gfHigh\":70,"
					    "\"cylinders\":[{\"o2Permille\":320,\"hePermille\":0,\"carriedMl\":2400000},{\"o2Permille\":500,\"hePermille\":0}]}";
		if (save_plan(request, 0, result, error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		dive *plan = divelog.dives.back().get();
		int plan_id = plan->id;
		if (!plan->is_planned() || plan->number != 0 || plan->divetrip)
			return fail("a plan has no number and no trip");
		if (plan->notes.find("Subsurface") == std::string::npos)
			return fail("the plan has no notes");
		if (plan->cylinders[0].type.size.mliter != 0)
			return fail("a cylinder of the calculation was saved");
		if (listed() != before)
			return fail("the plan is in the dive list");
		std::string list = plans();
		if (list.find("\"id\":" + std::to_string(plan_id)) == std::string::npos || list.find("carriedMl") == std::string::npos)
			return fail("the plan is not listed with its request");

		// A dive logged by hand follows the last real dive, not the plan.
		if (create_dive("{\"date\":\"2026-12-01T10:00:00\",\"durationSeconds\":1800,\"maxDepthMm\":12000}", result, error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		dive *manual = nullptr;
		for (auto &d: divelog.dives)
			if (!d->is_planned() && (!manual || d->when > manual->when))
				manual = d.get();
		if (last_number > 0 && manual->number != last_number + 1)
			return fail("a new dive did not follow the last real dive");
		const std::string with_manual = listed();
		const std::vector<int> all_numbers;
		if (renumber_dives({}, 1, result, error, all_numbers)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		if (divelog.dives.get_by_uniq_id(plan_id)->number != 0)
			return fail("renumbering numbered the plan");

		// The plan survives a save and a reload as it was.
		if (save_local(error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		if (open_log(log))
			return 1;
		list = plans();
		if (list.find("carriedMl") == std::string::npos || list.find("\\\"levels\\\"") == std::string::npos) {
			printf("list=%s\n", list.c_str());
			return fail("the request did not survive a reload");
		}
		// The levels read back from the dive itself, for a plan made elsewhere.
		if (list.find("\"levels\":[{\"depthMm\":30000,\"durationSeconds\":1200},{\"depthMm\":18000,\"durationSeconds\":600}]") == std::string::npos) {
			printf("list=%s\n", list.substr(0, 400).c_str());
			return fail("the levels did not come back from the dive");
		}
		dive *reloaded = nullptr;
		for (auto &d: divelog.dives)
			if (d->is_planned())
				reloaded = d.get();
		if (!reloaded)
			return fail("the plan was not reloaded");

		// Replaced, then undone.
		const int old_id = reloaded->id;
		const timestamp_t old_when = reloaded->when;
		if (save_plan(request, old_id, result, error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		int plans_now = 0;
		for (auto &d: divelog.dives)
			plans_now += d->is_planned();
		printf("replan: plans=%d last=%lld was=%lld\n", plans_now, static_cast<long long>(divelog.dives.back()->when), static_cast<long long>(old_when));
		if (plans_now != 1 || divelog.dives.back()->when != old_when)
			return fail("replanning did not replace the plan");
		if (undo(result, error) || !divelog.dives.get_by_uniq_id(old_id))
			return fail("undo did not bring the plan back");

		// A second plan at the same time starts a minute later.
		const int first_duration = divelog.dives.get_by_uniq_id(old_id)->duration.seconds;
		if (save_plan(request, 0, result, error) || divelog.dives.back()->when != old_when + 60)
			return fail("two plans at the same second");
		printf("duplicate: %d s, first %d s\n", divelog.dives.back()->duration.seconds, first_duration);
		if (divelog.dives.back()->duration.seconds != first_duration)
			return fail("a duplicate has another duration");

		// From a logged dive: its profile, the site kept, the dive still there.
		dive *logged = first_dive();
		const std::string from = "{\"sourceDiveId\":" + std::to_string(logged->id) +
					 ",\"cylinders\":[{\"o2Permille\":209,\"hePermille\":0,\"sourceCylinder\":0}]}";
		if (plan_dive(from, json, error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		printf("source=%.200s\n", json.c_str());
		if (json.find("\"runtimeSeconds\":" + std::to_string(logged->dcs[0].duration.seconds)) == std::string::npos)
			printf("note=runtime differs from the dive\n");
		if (!divelog.dives.get_by_uniq_id(logged->id))
			return fail("the dive left the log");

		if (delete_dive(divelog.dives.back()->id, result, error))
			return fail("deleting a plan");
		printf("plans=ok\n");
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
		int first_in_trip = trip->dives[0]->id;
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
			{ "remove2", [&](std::string &j, std::string &e) { return trip_remove_dives({ first_in_trip, second }, j, e); },
			  [&] { return size0 > 2 ? trip_by_id_size(trip_id) == size0 - 2 : divelog.trips.size() == trips0 - 1; } },
			{ "create", [&](std::string &j, std::string &e) { return trip_create({ second }, j, e); },
			  [&] { return divelog.trips.size() == trips0 + 1 && trip_by_id_size(trip_id) == size0 - 1; } },
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
				     "\"buddies\":[\"OpenDives test\"],\"rating\":3,\"notes\":\"logged by hand\","
				     "\"waterTempMk\":291150,\"cylinderType\":\"AL80\",\"startMbar\":200000,"
				     "\"endMbar\":60000,\"o2Permille\":320,\"hePermille\":0}";
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
		    added->watertemp.mkelvin != 291150 || added->cylinders.empty() ||
		    added->cylinders[0].type.description != "AL80" || added->cylinders[0].type.size.mliter <= 0 ||
		    added->cylinders[0].start.mbar != 200000 || added->cylinders[0].end.mbar != 60000 ||
		    added->cylinders[0].gasmix.o2.permille != 320 || undo_text() != "add dive") {
			printf("error=create: unexpected dive\n");
			return 1;
		}
		if (!undo_and_save("create"))
			return 1;
		// Delete the first dive (and its trip if it was the last one), then undo.
		dive *first = first_dive();
		size_t trips0 = divelog.trips.size();
		if (delete_dive(first->id, json, error) || divelog.dives.size() != dives0 - 1 ||
		    undo_text().rfind("delete 1 dive(s) [", 0) != 0) {
			printf("error=delete: %s\n", error.c_str());
			return 1;
		}
		if (!undo_and_save("delete") || divelog.trips.size() != trips0)
			return 1;
		// Delete the first two dives in one step, then undo.
		if (divelog.dives.size() >= 2) {
			std::vector<int> two = { divelog.dives[0]->id, divelog.dives[1]->id };
			if (delete_dives(two, json, error) || divelog.dives.size() != dives0 - 2 ||
			    undo_text().rfind("delete 2 dive(s) [", 0) != 0) {
				printf("error=delete2: %s\n", error.c_str());
				return 1;
			}
			if (!undo_and_save("delete2") || divelog.trips.size() != trips0)
				return 1;
		}
		// Renumber: all the dives from 100, then the last half only from 7; the
		// numbers are consecutive in date order, planned dives left out; each
		// saved and undone.
		auto plan_only = [](const dive &d) { return d.is_planned() && !d.is_logged(); };
		for (int pass = 0; pass < 2; pass++) {
			std::vector<int> ids;
			int start = pass ? 7 : 100;
			size_t real = 0;
			for (size_t i = pass ? divelog.dives.size() / 2 : 0; i < divelog.dives.size(); i++) {
				if (plan_only(*divelog.dives[i]))
					continue;
				real++;
				if (pass)
					ids.push_back(divelog.dives[i]->id);
			}
			if (!real)
				continue;
			if (renumber_dives(ids, start, json, error) || undo_text().rfind("renumber ", 0) != 0) {
				printf("error=renumber: %s\n", error.c_str());
				return 1;
			}
			int expected = start;
			for (size_t i = pass ? divelog.dives.size() / 2 : 0; i < divelog.dives.size(); i++) {
				if (plan_only(*divelog.dives[i]))
					continue;
				if (divelog.dives[i]->number != expected++) {
					printf("error=renumber: dive %zu has number %d, expected %d\n", i, divelog.dives[i]->number,
					       expected - 1);
					return 1;
				}
			}
			if (!undo_and_save("renumber"))
				return 1;
		}
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

	if (mode == "maindc") {
		// The second computer of a dive becomes the first, saved, then undone
		// and saved: the script checks that the tree is the original one.
		dive *found = nullptr;
		for (auto &d: divelog.dives)
			if (!found && d->dcs.size() >= 2)
				found = d.get();
		if (!found)
			return 2;
		std::string result, error, second = found->dcs[1].model;
		if (edit_dive(found->id, "{\"mainComputer\":1}", result, error) || save_local(error)) {
			printf("error=move to front: %s\n", error.c_str());
			return 1;
		}
		if (found->dcs[0].model != second) {
			printf("error=the second computer is not first\n");
			return 1;
		}
		if (undo(result, error) || save_local(error)) {
			printf("error=undo: %s\n", error.c_str());
			return 1;
		}
		return 0;
	}

	if (mode == "syncundo") {
		// `repo` is a log with a remote ("git://…[main]"): edit, save, sync
		// (the commit is only pushed: the log is not read again), then undo,
		// save, sync. The undo history must survive the sync; the script then
		// checks that the remote's tree is the original one.
		std::string json, error, result, status;
		dive *dv = first_dive();
		std::string request, expected;
		make_change(*dv, "notes", request, expected);
		if (edit_dive(dv->id, request, result, error) || save_local(error) || sync(status, error)) {
			printf("error=edit and sync: %s\n", error.c_str());
			return 1;
		}
		printf("sync=%s\n", status.c_str());
		if (status.find("\"reloaded\":false") == std::string::npos || status.find("pushed") == std::string::npos ||
		    !can_undo()) {
			printf("error=the sync read the log again or lost the undo history\n");
			return 1;
		}
		if (undo(result, error) || save_local(error) || sync(status, error)) {
			printf("error=undo after the sync: %s\n", error.c_str());
			return 1;
		}
		printf("sync=%s\n", status.c_str());
		return status.find("pushed") != std::string::npos ? 0 : 1;
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
		size_t p0 = json.find("\"path\":\"") + 8;
		std::string path_in_log = json.substr(p0, json.find('"', p0) - p0);
		if (resolve_conflicts("{\"" + path_in_log + "\":\"" + arg + "\"}", error)) {
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
