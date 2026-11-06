// SPDX-License-Identifier: GPL-2.0
// Free filter (docs/ui-specification.md, section 5, "Filter criteria"),
// read-only. The constraints are Subsurface's own (core/filterconstraint.cpp),
// in the text form its parser reads (filter presets in the git log), combined
// as DiveFilter::showDive() and DiveFilter::update() do (desktop
// core/divefilter.cpp, not compiled here because of its Qt models): every
// constraint must match, and the fulltext query if there is one
// (core/fulltext.cpp). Three OpenDives criteria that Subsurface's filter does
// not have are added: the site's country and region (from its taxonomy) and
// the trip.
#include "opendives.h"
#include "internal.h"

#include "core/dive.h"
#include "core/divecomputer.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/divefilter.h"
#include "core/filterconstraint.h"
#include "core/fulltext.h"
#include "core/gas.h"
#include "core/subsurface-time.h"
#include "core/tag.h"
#include "core/taxonomy.h"
#include "core/trip.h"

#include <algorithm>
#include <cstdio>
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

void append_set(std::string &json, const char *key, const std::set<std::string> &values)
{
	json += ",\"";
	json += key;
	json += "\":[";
	bool first = true;
	for (const std::string &v: values) {
		if (!first)
			json += ',';
		first = false;
		append_json_string(json, v);
	}
	json += ']';
}

// Subsurface criteria offered by OpenDives. Never offered (spec): weight,
// weight type, water density and nitrogen percentage.
bool allowed_type(const std::string &type)
{
	static const char *const allowed[] = {
		"date", "date_time", "time_of_day", "year", "day_of_week", "rating", "wavesize", "current",
		"visibility", "surge", "chill", "depth", "duration", "water_temp", "air_temp", "sac", "logged",
		"planned", "dive_mode", "tags", "people", "location", "cylinder_type", "cylinder_size",
		"cylinder_o2", "cylinder_he", "suit", "notes", "dive_computer",
	};
	return std::any_of(std::begin(allowed), std::end(allowed), [&type](const char *a) { return type == a; });
}

bool known(const std::string &value, std::initializer_list<const char *> tokens)
{
	return std::any_of(tokens.begin(), tokens.end(), [&value](const char *t) { return value == t; });
}

// OpenDives criteria: a list of values, one of which must equal the dive's
// (ignoring case, as Subsurface's "exact" mode does), or of trip identifiers.
struct ExtraRule {
	enum Kind { COUNTRY, REGION, TRIP } kind;
	std::vector<std::string> values;
	bool negate;
};

// Values one per line, or separated by commas when there is a single line.
std::vector<std::string> split_values(const std::string &s)
{
	std::vector<std::string> out;
	char sep = s.find('\n') == std::string::npos ? ',' : '\n';
	size_t start = 0;
	while (start <= s.size()) {
		size_t comma = s.find(sep, start);
		std::string v = trimmed(s.substr(start, comma == std::string::npos ? std::string::npos : comma - start));
		if (!v.empty())
			out.push_back(v);
		if (comma == std::string::npos)
			break;
		start = comma + 1;
	}
	return out;
}

bool equal_ignoring_case(const std::string &a, const std::string &b)
{
	return QString::fromStdString(a).compare(QString::fromStdString(b), Qt::CaseInsensitive) == 0;
}

bool extra_matches(const ExtraRule &r, const dive &d)
{
	if (r.values.empty())
		return true;
	std::string value;
	if (r.kind == ExtraRule::TRIP) {
		value = d.divetrip ? std::to_string(d.divetrip->id) : std::string();
	} else if (d.dive_site) {
		value = r.kind == ExtraRule::COUNTRY ? taxonomy_get_country(d.dive_site->taxonomy)
						     : taxonomy_get_value(d.dive_site->taxonomy, TC_ADMIN_L1);
	}
	value = trimmed(value);
	bool found = !value.empty() &&
		     std::any_of(r.values.begin(), r.values.end(),
				 [&value](const std::string &v) { return equal_ignoring_case(v, value); });
	return found != r.negate;
}

} // namespace

int filter_options(std::string &json)
{
	std::set<std::string> suits, computers, cylinder_types, tags, people, sites, countries, regions;
	uint64_t modes = 0;
	int year_min = 0, year_max = 0;
	bool helium = false, oxygen = false, sac = false, water = false, air = false, planned = false, logged = false;
	bool notes = false, cylinder_size = false;
	bool rating = false, visibility = false, current = false, wavesize = false, surge = false, chill = false;
	for (const auto &dp: divelog.dives) {
		const dive &d = *dp;
		if (!d.dcs.empty())
			modes |= 1ULL << static_cast<int>(d.dcs[0].divemode);
		int year = utc_year(d.when);
		if (!year_min || year < year_min)
			year_min = year;
		if (year > year_max)
			year_max = year;
		if (!trimmed(d.suit).empty())
			suits.insert(trimmed(d.suit));
		for (const divecomputer &dc: d.dcs) {
			if (!trimmed(dc.model).empty())
				computers.insert(trimmed(dc.model));
		}
		for (const cylinder_t &cyl: d.cylinders) {
			if (!trimmed(cyl.type.description).empty())
				cylinder_types.insert(trimmed(cyl.type.description));
			if (cyl.type.size.mliter)
				cylinder_size = true;
			if (get_he(cyl.gasmix))
				helium = true;
			if (get_o2(cyl.gasmix) != O2_IN_AIR)
				oxygen = true;
		}
		for (const divetag *tag: d.tags) {
			if (!trimmed(tag->name).empty())
				tags.insert(trimmed(tag->name));
		}
		add_names(people, d.buddy);
		add_names(people, d.diveguide);
		if (d.dive_site) {
			if (!trimmed(d.dive_site->name).empty())
				sites.insert(trimmed(d.dive_site->name));
			std::string country = trimmed(taxonomy_get_country(d.dive_site->taxonomy));
			if (!country.empty())
				countries.insert(country);
			std::string region = trimmed(taxonomy_get_value(d.dive_site->taxonomy, TC_ADMIN_L1));
			if (!region.empty())
				regions.insert(region);
		}
		sac |= d.sac > 0;
		water |= d.watertemp.mkelvin > 0;
		air |= d.airtemp.mkelvin > 0;
		planned |= d.is_planned();
		logged |= d.is_logged();
		notes |= !d.notes.empty();
		rating |= d.rating > 0;
		visibility |= d.visibility > 0;
		current |= d.current > 0;
		wavesize |= d.wavesize > 0;
		surge |= d.surge > 0;
		chill |= d.chill > 0;
	}
	json = "{\"modes\":[";
	bool first = true;
	for (int i = 0; i < NUM_DIVEMODE; i++) {
		if (!(modes & (1ULL << i)))
			continue;
		if (!first)
			json += ',';
		first = false;
		append_json_string(json, divemode_text[i]);
	}
	json += "],\"years\":[" + std::to_string(year_min) + ',' + std::to_string(year_max) + ']';
	append_set(json, "suits", suits);
	append_set(json, "computers", computers);
	append_set(json, "cylinderTypes", cylinder_types);
	append_set(json, "tags", tags);
	append_set(json, "people", people);
	append_set(json, "sites", sites);
	append_set(json, "countries", countries);
	append_set(json, "regions", regions);
	auto flag = [&json](const char *key, bool value) {
		json += ",\"";
		json += key;
		json += value ? "\":true" : "\":false";
	};
	flag("helium", helium);
	flag("oxygen", oxygen);
	flag("cylinderSize", cylinder_size);
	flag("sac", sac);
	flag("waterTemp", water);
	flag("airTemp", air);
	flag("planned", planned && logged);
	flag("notes", notes);
	flag("rating", rating);
	flag("visibility", visibility);
	flag("current", current);
	flag("wavesize", wavesize);
	flag("surge", surge);
	flag("chill", chill);
	json += '}';
	return 0;
}

namespace {

// Subsurface's constraints and the OpenDives criteria of a filter. Fulltext
// mode tokens: "starts_with" (or "startswith", as filter presets write it),
// "substring", "exact".
int parse_rules(const std::string &fulltext_mode, const std::vector<filter_rule> &rules,
		std::vector<filter_constraint> &constraints, std::vector<ExtraRule> &extras, StringFilterMode &mode,
		std::string &error)
{
	for (const filter_rule &r: rules) {
		if (r.type == "od_country" || r.type == "od_region" || r.type == "od_trip") {
			ExtraRule::Kind kind = r.type == "od_country" ? ExtraRule::COUNTRY
					       : r.type == "od_region" ? ExtraRule::REGION
								     : ExtraRule::TRIP;
			extras.push_back({ kind, split_values(r.data), r.negate });
			continue;
		}
		if (!allowed_type(r.type)) {
			error = "BAD_REQUEST: filter type " + r.type;
			return -1;
		}
		// The constructor reports unknown modes and falls back: refuse them first.
		if (!r.string_mode.empty() && !known(r.string_mode, { "starts_with", "substring", "exact" })) {
			error = "BAD_REQUEST: string mode " + r.string_mode;
			return -1;
		}
		if (!r.range_mode.empty() && !known(r.range_mode, { "equal", "less", "greater", "range" })) {
			error = "BAD_REQUEST: range mode " + r.range_mode;
			return -1;
		}
		if (r.data.find('\n') == std::string::npos) {
			constraints.emplace_back(r.type, r.string_mode, r.range_mode, r.negate, r.data);
			continue;
		}
		// Values that may hold commas (site "Green Bay, Larnaca, Cyprus", suit
		// "wet, 3mm"), one per line: the parser would split them at the
		// commas, so the list is set whole.
		constraints.emplace_back(r.type, r.string_mode, r.range_mode, r.negate, std::string());
		filter_constraint &c = constraints.back();
		if (!filter_constraint_is_string(c.type)) {
			error = "BAD_REQUEST: lines in a filter that is not a text";
			return -1;
		}
		c.data.string_list->clear();
		size_t start = 0;
		while (start <= r.data.size()) {
			size_t nl = r.data.find('\n', start);
			std::string v = trimmed(r.data.substr(start, nl == std::string::npos ? std::string::npos : nl - start));
			if (!v.empty())
				c.data.string_list->push_back(QString::fromStdString(v));
			if (nl == std::string::npos)
				break;
			start = nl + 1;
		}
	}
	if (!fulltext_mode.empty() && !known(fulltext_mode, { "starts_with", "startswith", "substring", "exact" })) {
		error = "BAD_REQUEST: fulltext mode " + fulltext_mode;
		return -1;
	}
	// FilterData's default is "starts with".
	mode = fulltext_mode == "substring" ? StringFilterMode::SUBSTRING
	       : fulltext_mode == "exact"   ? StringFilterMode::EXACT
					    : StringFilterMode::STARTSWITH;
	return 0;
}

} // namespace

namespace internal {

int filter_data_from_rules(const std::string &fulltext, const std::string &fulltext_mode,
			   const std::vector<filter_rule> &rules, FilterData &out, std::string &error)
{
	std::vector<filter_constraint> constraints;
	std::vector<ExtraRule> extras;
	StringFilterMode mode;
	if (parse_rules(fulltext_mode, rules, constraints, extras, mode, error))
		return -1;
	if (!extras.empty()) {
		error = "NOT_IN_PRESET: country, region and trip are not Subsurface criteria";
		return -1;
	}
	// The log keeps a text list joined by commas (filter_constraint_data_to_string):
	// a value with a comma would come back as several values.
	for (const filter_constraint &c: constraints) {
		if (!filter_constraint_is_string(c.type))
			continue;
		for (const QString &v: *c.data.string_list) {
			if (v.contains(',')) {
				error = "NOT_IN_PRESET: a value holds a comma";
				return -1;
			}
		}
	}
	out = FilterData();
	out.fullText = QString::fromStdString(trimmed(fulltext));
	out.fulltextStringMode = mode;
	out.constraints = std::move(constraints);
	return 0;
}

bool filter_data_equal(const FilterData &a, const FilterData &b)
{
	// FilterData::operator== (desktop core/divefilter.cpp, not compiled here).
	return a.fullText.originalQuery == b.fullText.originalQuery && a.fulltextStringMode == b.fulltextStringMode &&
	       a.constraints == b.constraints;
}

void append_filter_data(std::string &json, const FilterData &data)
{
	json += "{\"fulltext\":";
	append_json_string(json, data.fullText.originalQuery.toStdString());
	json += ",\"mode\":\"";
	json += data.fulltextStringMode == StringFilterMode::SUBSTRING ? "substring"
		: data.fulltextStringMode == StringFilterMode::EXACT    ? "exact"
									: "starts_with";
	json += "\",\"rules\":[";
	bool first = true;
	for (const filter_constraint &c: data.constraints) {
		if (!first)
			json += ',';
		first = false;
		json += "{\"type\":\"";
		json += filter_constraint_type_to_string(c.type);
		json += "\",\"stringMode\":\"";
		if (filter_constraint_has_string_mode(c.type))
			json += filter_constraint_string_mode_to_string(c.string_mode);
		json += "\",\"rangeMode\":\"";
		if (filter_constraint_has_range_mode(c.type))
			json += filter_constraint_range_mode_to_string(c.range_mode);
		json += "\",\"negate\":";
		json += c.negate ? "true" : "false";
		json += ",\"data\":";
		std::string data;
		if (filter_constraint_is_string(c.type)) {
			// One value per line, as filter_dives() takes them.
			for (const QString &v: *c.data.string_list)
				data += v.toStdString() + "\n";
		} else {
			data = filter_constraint_data_to_string(c);
		}
		append_json_string(json, data);
		json += '}';
	}
	json += "]}";
}

} // namespace internal

int filter_dives(const std::string &fulltext, const std::string &fulltext_mode, const std::vector<filter_rule> &rules,
		 std::string &json, std::string &error)
{
	std::vector<filter_constraint> constraints;
	std::vector<ExtraRule> extras;
	StringFilterMode mode;
	if (parse_rules(fulltext_mode, rules, constraints, extras, mode, error))
		return -1;
	FullTextQuery query;
	query = QString::fromStdString(fulltext);
	bool do_fulltext = query.doit();

	json = "[";
	bool first = true;
	for (const auto &dp: divelog.dives) {
		const dive *d = dp.get();
		if (do_fulltext && !fulltext_dive_matches(d, query, mode))
			continue;
		if (!std::all_of(constraints.begin(), constraints.end(),
				 [d](const filter_constraint &c) { return filter_constraint_match_dive(c, d); }))
			continue;
		if (!std::all_of(extras.begin(), extras.end(), [d](const ExtraRule &r) { return extra_matches(r, *d); }))
			continue;
		if (!first)
			json += ',';
		first = false;
		json += std::to_string(d->id);
	}
	json += ']';
	return 0;
}

} // namespace opendives
