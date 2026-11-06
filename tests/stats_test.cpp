// SPDX-License-Identifier: GPL-2.0
// Statistics of the façade (core/libopendives/stats.cpp) on Subsurface's
// sample log, against figures read from the log's dives (durations, depths)
// and Subsurface's own rules (invalid dives left out).
// usage: stats <log, e.g. third_party/subsurface/dives/SampleDivesV2.ssrf>
#include "../core/libopendives/opendives.h"

#include <cstdio>
#include <cstdlib>
#include <string>

static int failed = 0;

static long number(const std::string &json, const std::string &key, size_t from = 0)
{
	size_t p = json.find("\"" + key + "\":", from);
	return p == std::string::npos ? -999999 : atol(json.c_str() + p + key.size() + 3);
}

static void check(const char *what, long got, long expected)
{
	bool ok = got == expected;
	printf("%s %s: %ld (expected %ld)\n", ok ? "ok  " : "FAIL", what, got, expected);
	failed += !ok;
}

static void check_true(const char *what, bool ok)
{
	printf("%s %s\n", ok ? "ok  " : "FAIL", what);
	failed += !ok;
}

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: %s <log>\n", argv[0]);
		return 2;
	}
	std::string json, error;
	if (opendives::init() || opendives::list_dives(argv[1], json, error)) {
		fprintf(stderr, "cannot load %s: %s\n", argv[1], error.c_str());
		return 2;
	}
	if (getenv("STATS_DUMP")) {
		opendives::stats("{}", json, error);
		printf("%s\n", json.c_str());
		for (const char *f: { "suit", "buddy", "mode", "year", "trip", "gas", "tag" }) {
			opendives::stats_values(f, json, error);
			printf("%s: %s\n", f, json.c_str());
		}
		return 0;
	}

	// The dive list, to check the totals against the dives themselves.
	const std::string list = json;
	long count = 0, seconds = 0, deepest = 0, in2011 = 0, first_id = -1;
	// Each dive starts with {"id":…,"number": (a trip object has no number).
	for (size_t q = list.find(",\"number\":"); q != std::string::npos; q = list.find(",\"number\":", q + 1)) {
		size_t p = list.rfind("{\"id\":", q);
		if (first_id < 0)
			first_id = atol(list.c_str() + p + 6);
		count++;
		seconds += number(list, "durationSeconds", p);
		long depth = number(list, "maxDepthMm", p);
		if (depth > deepest)
			deepest = depth;
		size_t date = list.find("\"date\":\"", p);
		in2011 += list.compare(date + 8, 4, "2011") == 0;
	}

	// All dives (the sample has no invalid dive).
	check_true("stats {}", opendives::stats("{}", json, error) == 0);
	check("dives", number(json, "dives", json.find("\"total\"")), 29);
	check("dives = list", number(json, "dives", json.find("\"total\"")), count);
	check("log dives", number(json, "logDives"), 29);
	check("total time = sum of durations", number(json, "totalSeconds", json.find("\"total\"")), seconds);
	check("total time", number(json, "totalSeconds", json.find("\"total\"")), 87266);
	check("deepest = list", number(json, "maxDepthMm", json.find("\"total\"")), deepest);
	check("deepest", number(json, "maxDepthMm", json.find("\"total\"")), 46480);
	check("shortest", number(json, "shortestSeconds", json.find("\"total\"")), 226);
	check("longest", number(json, "longestSeconds", json.find("\"total\"")), 7195);
	check("2011 dives = list", number(json, "dives", json.find("{\"year\":2011")), in2011);
	check("2011 dives", number(json, "dives", json.find("{\"year\":2011")), 12);
	check("Oct 2011 dives", number(json, "dives", json.find("{\"year\":2011,\"month\":10")), 6);
	check("Koror trip dives", number(json, "dives", json.find("\"location\":\"Koror, Palau\"")), 11);
	check("open circuit dives", number(json, "dives", json.find("{\"mode\":\"OC\"")), 29);
	check("suit wet 3mm dives", number(json, "dives", json.find("{\"value\":\"wet, 3mm\"")), 12);
	check("buddy Linus dives", number(json, "dives", json.find("{\"value\":\"Linus\"")), 24);
	check("no buddy dives", number(json, "dives", json.find("{\"value\":\"\"", json.find("\"byBuddy\""))), 1);

	// One value; several values of a field (any); several fields (all).
	opendives::stats("{\"suit\":[\"wet, 5mm\"]}", json, error);
	check("suit wet 5mm", number(json, "dives", json.find("\"total\"")), 6);
	check("suit wet 5mm time", number(json, "totalSeconds", json.find("\"total\"")), 20621);
	check("log dives with criteria", number(json, "logDives"), 29);
	opendives::stats("{\"suit\":[\"wet, 5mm\",\"wet, 3mm\"]}", json, error);
	check("suit 5mm or 3mm", number(json, "dives", json.find("\"total\"")), 18);
	opendives::stats("{\"year\":[\"2011\"],\"buddy\":[\"Scott\"]}", json, error);
	check("2011 and Scott", number(json, "dives", json.find("\"total\"")), 2);
	opendives::stats("{\"buddy\":[\"\"]}", json, error);
	check("without buddy", number(json, "dives", json.find("\"total\"")), 1);
	opendives::stats("{\"gas\":[\"500/0\"]}", json, error);
	check("EAN50 breathed", number(json, "dives", json.find("\"total\"")), 6);
	opendives::stats("{\"id\":[\"" + std::to_string(first_id) + "\"]}", json, error);
	check("one dive by id", number(json, "dives", json.find("\"total\"")), 1);
	check_true("diveIds holds it", json.find("\"diveIds\":[" + std::to_string(first_id) + "]") != std::string::npos);

	// The selection is put back: all dives again.
	opendives::stats("{}", json, error);
	check("all dives again", number(json, "dives", json.find("\"total\"")), 29);

	// Values of a field, with their number of dives.
	check_true("values buddy", opendives::stats_values("buddy", json, error) == 0);
	check("buddy Linus", number(json, "dives", json.find("{\"key\":\"Linus\"")), 24);
	check("no buddy", number(json, "dives", json.find("{\"key\":\"\"")), 1);
	opendives::stats_values("year", json, error);
	check("year 2013", number(json, "dives", json.find("{\"key\":\"2013\"")), 11);
	opendives::stats_values("trip", json, error);
	check_true("trip key is its first dive's date",
		   json.find("{\"key\":\"2013-06-01T10:15:23\",\"dives\":11,\"location\":\"Koror, Palau\"}") != std::string::npos);

	// Refused: an unknown field (weight is never offered).
	check_true("weight refused", opendives::stats("{\"weight\":[\"1\"]}", json, error) == -1);
	check_true("weight values refused", opendives::stats_values("weight", json, error) == -1);
	check_true("bad JSON refused", opendives::stats("[", json, error) == -1);

	printf("%s\n", failed ? "FAILED" : "all passed");
	return failed ? 1 : 0;
}
