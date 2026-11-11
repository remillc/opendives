// SPDX-License-Identifier: GPL-2.0
// Reordering the cylinders of a dive (edit_dive "cylinders" with the entries in
// a new order): every gas change and tank-sensor mapping must follow its
// cylinder, so that the gas timeline and the profile are unchanged, in memory,
// after undo, after a save to git and reload, and after an export to XML
// (ssrf) and import. Subsurface's core does the renumbering
// (cylinder_renumber(), as CylindersModel::moveAtFirst in the planner).
//
// usage: cylinder-reorder <dive-file> <new-folder>
// Prints one line per dive tested; exit status 0 when all checks pass, 1 when
// one fails, 2 when no dive of the file has several cylinders and gas changes.
#include "core/libopendives/opendives.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/divecomputer.h"
#include "core/equipment.h"
#include "core/event.h"
#include "core/sample.h"
#include "core/tanksensormapping.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

using namespace opendives;

static int failures = 0;

static void check(bool ok, const std::string &what)
{
	if (!ok) {
		printf("FAIL: %s\n", what.c_str());
		failures++;
	}
}

// The gas in use over time on every computer: (seconds, o2, he), repeats dropped.
static std::vector<std::vector<int>> timeline(const dive &d)
{
	std::vector<std::vector<int>> out;
	for (const auto &dc: d.dcs) {
		gasmix_loop loop(d, dc);
		std::vector<int> last;
		while (loop.has_next()) {
			auto [mix, time] = loop.next();
			std::vector<int> entry = { time, mix.o2.permille, mix.he.permille };
			if (!last.empty() && last[1] == entry[1] && last[2] == entry[2])
				continue;
			out.push_back(last = entry);
		}
		out.push_back({ -1, -1, -1 }); // computer separator
	}
	return out;
}

static std::vector<int> profile(const dive &d)
{
	std::vector<int> out;
	for (const auto &dc: d.dcs)
		for (const auto &s: dc.samples) {
			out.push_back(s.time.seconds);
			out.push_back(s.depth.mm);
		}
	return out;
}

// The cylinders as (o2, he, size, start, end), in order.
static std::vector<std::vector<int>> cylinders(const dive &d)
{
	std::vector<std::vector<int>> out;
	for (const auto &c: d.cylinders)
		out.push_back({ c.gasmix.o2.permille, c.gasmix.he.permille, c.type.size.mliter, c.start.mbar, c.end.mbar,
				static_cast<int>(c.cylinder_use) });
	return out;
}

// The tank-sensor mappings (the "no sensors mapped" sentinel apart), each as the sensor and the description of its
// cylinder, so that they are compared whatever the order of the cylinders.
static std::vector<std::string> sensor_mappings(const dive &d)
{
	std::vector<std::string> out;
	for (const auto &dc: d.dcs)
		for (const auto &m: dc.tank_sensor_mappings)
			out.push_back(std::to_string(dc.tank_sensor_mappings.size()) + ":" + std::to_string(m.sensor_id) + ":" +
				      (m.sensor_id == NO_SENSOR ? std::string("none") : m.cylinder_index < d.cylinders.size() ? d.cylinders[m.cylinder_index].type.description : "?"));
	std::sort(out.begin(), out.end());
	return out;
}

static bool has_gaschange(const dive &d)
{
	for (const auto &dc: d.dcs)
		for (const auto &ev: dc.events)
			if (ev.is_gaschange())
				return true;
	return false;
}

struct Expected {
	timestamp_t when;
	std::vector<std::vector<int>> timeline;
	std::vector<int> profile;
	std::vector<std::vector<int>> cylinders;
	std::vector<std::string> sensors;
};

static std::vector<std::vector<int>> permuted(const std::vector<std::vector<int>> &list, const std::vector<int> &order)
{
	std::vector<std::vector<int>> out;
	for (int i: order)
		out.push_back(list[i]);
	return out;
}

static void print_timeline(const std::vector<std::vector<int>> &t)
{
	for (const auto &e: t)
		printf(" (%d %d %d)", e[0], e[1], e[2]);
	printf("\n");
}

static void check_dive(const dive &d, const Expected &e, const std::string &what)
{
	if (timeline(d) != e.timeline && getenv("VERBOSE")) {
		printf("%s\n expected:", what.c_str());
		print_timeline(e.timeline);
		printf(" got:     ");
		print_timeline(timeline(d));
	}
	check(d.when == e.when, what + ": date");
	check(timeline(d) == e.timeline, what + ": gas timeline");
	check(profile(d) == e.profile, what + ": profile");
	check(cylinders(d) == e.cylinders, what + ": cylinders");
	check(sensor_mappings(d) == e.sensors, what + ": tank sensors");
}

static dive *dive_at(timestamp_t when)
{
	for (auto &d: divelog.dives)
		if (d->when == when)
			return d.get();
	return nullptr;
}

int main(int argc, char **argv)
{
	if (argc != 3) {
		fprintf(stderr, "usage: %s <dive-file> <new-folder>\n", argv[0]);
		return 1;
	}
	std::string folder = argv[2], error, json, result;
	init();
	std::string a = folder + "/a[main]", b = folder + "/b[main]";
	if (import_file(argv[1], a, error) <= 0 || list_dives(a, json, error)) {
		printf("error=%s\n", error.c_str());
		return 1;
	}

	std::vector<Expected> tested; // after the reversal
	std::vector<int> ids;
	for (size_t n = 0; n < divelog.dives.size(); n++) {
		dive *d = divelog.dives[n].get();
		int count = static_cast<int>(d->cylinders.size());
		if (count < 2 || !has_gaschange(*d))
			continue;
		Expected before { d->when, timeline(*d), profile(*d), cylinders(*d), sensor_mappings(*d) };
		std::vector<int> reverse, rotate;
		for (int i = 0; i < count; i++) {
			reverse.push_back(count - 1 - i);
			rotate.push_back((i + 1) % count);
		}
		auto request = [&](const std::vector<int> &order) {
			std::string r = "{\"cylinders\":[";
			for (size_t i = 0; i < order.size(); i++)
				r += (i ? "," : "") + std::string("\"{\\\"index\\\":") + std::to_string(order[i]) + "}\"";
			return r + "]}";
		};
		// Each order, in memory, then undone.
		for (const auto &order: { rotate, reverse }) {
			std::string what = "dive " + std::to_string(d->number) + " order";
			for (int i: order)
				what += " " + std::to_string(i);
			if (edit_dive(d->id, request(order), result, error)) {
				check(false, what + ": " + error);
				continue;
			}
			Expected e { before.when, before.timeline, before.profile, permuted(before.cylinders, order), before.sensors };
			check_dive(*dive_at(before.when), e, what);
			if (undo(result, error))
				check(false, what + ": undo " + error);
			else
				check_dive(*dive_at(before.when), before, what + " undone");
		}
		// The reversal stays for the save.
		if (edit_dive(d->id, request(reverse), result, error)) {
			check(false, "reverse: " + error);
			continue;
		}
		tested.push_back({ before.when, before.timeline, before.profile, permuted(before.cylinders, reverse), before.sensors });
		ids.push_back(d->id);
		printf("tested dive %d: %d cylinders\n", d->number, count);
	}
	if (tested.empty())
		return 2;

	// Saved to git and reloaded.
	if (save_local(error) || list_dives(a, json, error)) {
		printf("error=save: %s\n", error.c_str());
		return 1;
	}
	for (const Expected &e: tested) {
		dive *d = dive_at(e.when);
		check(d != nullptr, "reloaded dive");
		if (d)
			check_dive(*d, e, "git reload");
	}

	// Exported to XML and imported again.
	std::string xml = folder + "/export.ssrf";
	std::vector<int> reloaded;
	for (const Expected &e: tested)
		if (dive *d = dive_at(e.when))
			reloaded.push_back(d->id);
	if (export_dives(reloaded, "ssrf", false, xml, error) || import_file(xml, b, error) <= 0 || list_dives(b, json, error)) {
		printf("error=xml: %s\n", error.c_str());
		return 1;
	}
	for (const Expected &e: tested) {
		dive *d = dive_at(e.when);
		check(d != nullptr, "xml dive");
		if (d)
			check_dive(*d, e, "xml reload");
	}
	printf(failures ? "%d failures\n" : "all checks passed\n", failures);
	return failures ? 1 : 0;
}
