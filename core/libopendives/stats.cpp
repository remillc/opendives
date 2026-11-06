// SPDX-License-Identifier: GPL-2.0
// Statistics (docs/ui-specification.md, section 1 and 5, "Statistics"),
// read-only. Every figure is Subsurface's: calculate_stats_summary() and
// calculate_stats_selected() of core/statistics.cpp, run on the dives that meet
// the criteria. The criteria are marked with the dives' `selected` flag, in
// memory only (it is never saved), and the flags are put back afterwards.
//
// The criteria are values, not Subsurface filter constraints: the statistics
// count dives "with this suit" or "without a suit", which the filter's text
// constraints cannot say, and the values offered (stats_values) and the
// values matched must be the same keys. Both use keys_of() below.
#include "opendives.h"
#include "json.h"

#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/gas.h"
#include "core/statistics.h"
#include "core/subsurface-time.h"
#include "core/tag.h"
#include "core/trip.h"

#include <algorithm>
#include <cstdio>
#include <ctime>
#include <map>
#include <set>

namespace opendives {

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

std::string trimmed(const std::string &s)
{
	size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
	return a == std::string::npos ? std::string() : s.substr(a, b - a + 1);
}

// As list_dives() writes the date: the dive's local time, without a zone.
std::string iso_date(timestamp_t when)
{
	time_t t = static_cast<time_t>(when);
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tm);
	return buf;
}

// Comma-separated names (buddies, dive guides), as has_people() splits them.
void add_names(std::set<std::string> &out, const std::string &list)
{
	size_t start = 0;
	while (start <= list.size()) {
		size_t comma = list.find(',', start);
		std::string name = trimmed(list.substr(start, comma == std::string::npos ? std::string::npos : comma - start));
		if (!name.empty())
			out.insert(name);
		if (comma == std::string::npos)
			break;
		start = comma + 1;
	}
}

// A trip is identified by the date of its first dive: the core's trip
// identifiers change at each load and are never stored (spec, "Trip").
std::string trip_key(const dive_trip &trip)
{
	timestamp_t first = 0;
	for (const dive *d: trip.dives) {
		if (!first || d->when < first)
			first = d->when;
	}
	return first ? iso_date(first) : std::string();
}

const char *const FIELDS[] = { "suit", "tag", "buddy", "guide", "site", "trip", "mode",
			       "gas", "cylinder", "computer", "year", "month", "rating" };

bool known_field(const std::string &field)
{
	return std::any_of(std::begin(FIELDS), std::end(FIELDS), [&field](const char *f) { return field == f; });
}

// The values of one criterion for a dive; an empty set means "not set" (key "").
std::set<std::string> keys_of(const std::string &field, const dive &d)
{
	std::set<std::string> keys;
	if (field == "suit") {
		if (!trimmed(d.suit).empty())
			keys.insert(trimmed(d.suit));
	} else if (field == "tag") {
		for (const divetag *tag: d.tags) {
			if (!trimmed(tag->name).empty())
				keys.insert(trimmed(tag->name));
		}
	} else if (field == "buddy") {
		add_names(keys, d.buddy);
	} else if (field == "guide") {
		add_names(keys, d.diveguide);
	} else if (field == "site") {
		if (d.dive_site && !trimmed(d.dive_site->name).empty())
			keys.insert(trimmed(d.dive_site->name));
	} else if (field == "trip") {
		if (d.divetrip)
			keys.insert(trip_key(*d.divetrip));
	} else if (field == "mode") {
		if (!d.dcs.empty())
			keys.insert(divemode_text[d.dcs[0].divemode]);
	} else if (field == "gas") {
		// Gases breathed, as "o2/he" in per mille (air: "209/0").
		for (size_t i = 0; i < d.cylinders.size(); i++) {
			if (!d.is_cylinder_used(static_cast<int>(i)))
				continue;
			const gasmix &mix = d.cylinders[i].gasmix;
			keys.insert(std::to_string(get_o2(mix)) + '/' + std::to_string(get_he(mix)));
		}
	} else if (field == "cylinder") {
		for (const cylinder_t &cyl: d.cylinders) {
			if (!trimmed(cyl.type.description).empty())
				keys.insert(trimmed(cyl.type.description));
		}
	} else if (field == "computer") {
		for (const divecomputer &dc: d.dcs) {
			if (!trimmed(dc.model).empty())
				keys.insert(trimmed(dc.model));
		}
	} else if (field == "year") {
		keys.insert(std::to_string(utc_year(d.when)));
	} else if (field == "month") {
		keys.insert(iso_date(d.when).substr(0, 7));
	} else if (field == "rating") {
		if (d.rating > 0)
			keys.insert(std::to_string(d.rating));
	} else if (field == "id") {
		keys.insert(std::to_string(d.id));
	}
	return keys;
}

struct Criterion {
	std::string field;
	std::set<std::string> values;
};

// Several values of a criterion: any of them; several criteria: all of them.
bool matches(const std::vector<Criterion> &criteria, const dive &d)
{
	for (const Criterion &c: criteria) {
		std::set<std::string> keys = keys_of(c.field, d);
		if (keys.empty())
			keys.insert(std::string());
		if (std::none_of(keys.begin(), keys.end(), [&c](const std::string &k) { return c.values.count(k) > 0; }))
			return false;
	}
	return true;
}

void append_figures(std::string &json, const stats_t &s)
{
	unsigned n = s.selection_size;
	auto field = [&json](const char *key, long long value) {
		json += '"';
		json += key;
		json += "\":";
		json += std::to_string(value);
	};
	field("dives", n);
	json += ',';
	field("totalSeconds", s.total_time.seconds);
	json += ',';
	field("shortestSeconds", s.shortest_time.seconds);
	json += ',';
	field("longestSeconds", s.longest_time.seconds);
	json += ',';
	field("maxDepthMm", s.max_depth.mm);
	json += ',';
	field("minDepthMm", s.min_depth.mm);
	json += ',';
	field("meanDepthMm", s.avg_depth.mm);
	json += ',';
	// As yearlystatisticsmodel.cpp shows the "average maximum depth".
	field("meanMaxDepthMm", n ? s.combined_max_depth.mm / static_cast<long long>(n) : 0);
	json += ',';
	field("meanSacMlMin", s.avg_sac.mliter);
	json += ',';
	field("minTempMk", s.min_temp.mkelvin);
	json += ',';
	field("maxTempMk", s.max_temp.mkelvin);
	json += ',';
	field("meanTempMk", s.combined_count ? static_cast<long long>(s.combined_temp.mkelvin / s.combined_count) : 0);
}

// Figures of the selected dives that have `key` for `field`, by
// calculate_stats_selected(); the selection is put back.
std::string groups_json(const std::string &field)
{
	std::vector<std::pair<dive *, bool>> saved;
	std::map<std::string, std::vector<dive *>> groups;
	for (auto &dp: divelog.dives) {
		saved.emplace_back(dp.get(), dp->selected);
		if (!dp->selected || dp->invalid)
			continue;
		std::set<std::string> keys = keys_of(field, *dp);
		if (keys.empty())
			keys.insert(std::string());
		for (const std::string &k: keys)
			groups[k].push_back(dp.get());
	}
	std::vector<std::pair<std::string, stats_t>> out;
	for (const auto &[key, dives]: groups) {
		for (auto &dp: divelog.dives)
			dp->selected = false;
		for (dive *d: dives)
			d->selected = true;
		out.emplace_back(key, calculate_stats_selected());
	}
	for (auto &[d, selected]: saved)
		d->selected = selected;
	// The most dives first, then by name; "not set" last.
	std::stable_sort(out.begin(), out.end(), [](const auto &a, const auto &b) {
		if (a.first.empty() != b.first.empty())
			return b.first.empty();
		return a.second.selection_size > b.second.selection_size;
	});
	std::string json = "[";
	bool first = true;
	for (const auto &[key, s]: out) {
		if (!first)
			json += ',';
		first = false;
		json += "{\"value\":";
		append_json_string(json, key);
		json += ',';
		append_figures(json, s);
		json += '}';
	}
	return json + ']';
}

} // namespace

int stats(const std::string &criteria_json, std::string &json, std::string &error)
{
	std::vector<std::pair<std::string, internal::JsonValue>> fields;
	const std::string text = criteria_json.empty() ? std::string("{}") : criteria_json; // the reader keeps a reference
	internal::JsonReader reader(text);
	if (!reader.object(fields)) {
		error = "BAD_REQUEST: invalid JSON";
		return -1;
	}
	std::vector<Criterion> criteria;
	for (const auto &[field, value]: fields) {
		if ((!known_field(field) && field != "id") || value.kind != internal::JsonValue::LIST) {
			error = "BAD_REQUEST: criterion " + field;
			return -1;
		}
		if (!value.list.empty())
			criteria.push_back({ field, std::set<std::string>(value.list.begin(), value.list.end()) });
	}

	std::vector<std::pair<dive *, bool>> saved;
	int log_dives = 0;
	for (auto &dp: divelog.dives) {
		saved.emplace_back(dp.get(), dp->selected);
		dp->selected = matches(criteria, *dp);
		if (!dp->invalid)
			log_dives++;
	}

	stats_summary summary = calculate_stats_summary(true);
	stats_t total = calculate_stats_selected();

	json = "{\"logDives\":" + std::to_string(log_dives) + ",\"total\":{";
	append_figures(json, total);
	json += "},\"yearly\":[";
	for (size_t i = 0; i < summary.stats_yearly.size(); i++) {
		if (i)
			json += ',';
		json += "{\"year\":" + std::to_string(summary.stats_yearly[i].period) + ',';
		append_figures(json, summary.stats_yearly[i]);
		json += '}';
	}

	// Monthly and by-trip entries do not carry their year or trip: walk the
	// dives in the order calculate_stats_summary() does to name them.
	std::vector<std::pair<int, int>> months; // year, month
	std::vector<const dive_trip *> trips;
	const dive_trip *trip = nullptr;
	for (auto &dp: divelog.dives) {
		if (!dp->selected || dp->invalid)
			continue;
		struct tm tm;
		utc_mkdate(dp->when, &tm);
		std::pair<int, int> ym { tm.tm_year, tm.tm_mon + 1 };
		if (months.empty() || months.back() != ym)
			months.push_back(ym);
		if (dp->divetrip && dp->divetrip != trip) {
			trip = dp->divetrip;
			trips.push_back(trip);
		}
	}
	json += "],\"monthly\":[";
	for (size_t i = 0; i < summary.stats_monthly.size() && i < months.size(); i++) {
		if (i)
			json += ',';
		json += "{\"year\":" + std::to_string(months[i].first) + ",\"month\":" + std::to_string(months[i].second) + ',';
		append_figures(json, summary.stats_monthly[i]);
		json += '}';
	}
	// stats_by_trip[0] is all the dives in trips together.
	json += "],\"byTrip\":[";
	for (size_t i = 1; i < summary.stats_by_trip.size() && i - 1 < trips.size(); i++) {
		if (i > 1)
			json += ',';
		json += "{\"start\":";
		append_json_string(json, trip_key(*trips[i - 1]));
		json += ",\"location\":";
		append_json_string(json, trips[i - 1]->location);
		json += ',';
		append_figures(json, summary.stats_by_trip[i]);
		json += '}';
	}
	// stats_by_type[0] is all the dives; then one per dive mode.
	json += "],\"byMode\":[";
	bool first = true;
	for (int mode = 0; mode < NUM_DIVEMODE && mode + 1 < static_cast<int>(summary.stats_by_type.size()); mode++) {
		const stats_t &s = summary.stats_by_type[mode + 1];
		if (!s.selection_size)
			continue;
		if (!first)
			json += ',';
		first = false;
		json += "{\"mode\":";
		append_json_string(json, divemode_text[mode]);
		json += ',';
		append_figures(json, s);
		json += '}';
	}
	json += "],\"bySuit\":" + groups_json("suit");
	json += ",\"byBuddy\":" + groups_json("buddy");
	json += ",\"diveIds\":[";
	first = true;
	for (auto &dp: divelog.dives) {
		if (!dp->selected || dp->invalid)
			continue;
		if (!first)
			json += ',';
		first = false;
		json += std::to_string(dp->id);
	}
	json += "]}";

	for (auto &[d, selected]: saved)
		d->selected = selected;
	return 0;
}

int stats_values(const std::string &field, std::string &json, std::string &error)
{
	if (!known_field(field)) {
		error = "BAD_REQUEST: criterion " + field;
		return -1;
	}
	std::map<std::string, int> counts;
	std::map<std::string, std::string> locations;
	for (auto &dp: divelog.dives) {
		if (dp->invalid)
			continue;
		std::set<std::string> keys = keys_of(field, *dp);
		if (keys.empty())
			keys.insert(std::string());
		for (const std::string &k: keys)
			counts[k]++;
		if (field == "trip" && dp->divetrip)
			locations[trip_key(*dp->divetrip)] = dp->divetrip->location;
	}
	json = "[";
	bool first = true;
	for (const auto &[key, n]: counts) {
		if (!first)
			json += ',';
		first = false;
		json += "{\"key\":";
		append_json_string(json, key);
		json += ",\"dives\":" + std::to_string(n);
		if (field == "trip") {
			json += ",\"location\":";
			append_json_string(json, locations[key]);
		}
		json += '}';
	}
	json += ']';
	return 0;
}

} // namespace opendives
