// SPDX-License-Identifier: GPL-2.0
// Exercises the façade on the development machine, without a phone.
// usage: facade import <file> <path[branch]>
//        facade filter <log> <fulltext> [type:string_mode:range_mode:negate:data]...
//        facade list <path[branch]>
//        facade dive <log> <number>
#include "core/libopendives/opendives.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

int main(int argc, char **argv)
{
	std::string error, json;
	if (opendives::init())
		return 2;
	if (argc == 4 && !strcmp(argv[1], "import")) {
		int n = opendives::import_file(argv[2], argv[3], error);
		if (n < 0) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%d\n", n);
		return 0;
	}
	if (argc == 3 && !strcmp(argv[1], "list")) {
		printf("exists=%d\n", opendives::log_exists(argv[2]));
		if (opendives::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%s\n", json.c_str());
		return 0;
	}
	if (argc == 4 && !strcmp(argv[1], "dive")) {
		// dive <log> <number>: detail of the dive with this number.
		if (opendives::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		std::string key = "\"number\":" + std::string(argv[3]) + ",";
		size_t pos = json.find(key);
		size_t id_pos = pos == std::string::npos ? pos : json.rfind("{\"id\":", pos);
		if (id_pos == std::string::npos) {
			fprintf(stderr, "dive number not found\n");
			return 1;
		}
		int id = atoi(json.c_str() + id_pos + 6);
		std::string prefs;
		opendives::get_prefs(prefs);
		printf("%s\n", prefs.c_str());
		if (opendives::get_dive(id, json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%s\n", json.c_str());
		return 0;
	}
	if (argc >= 4 && !strcmp(argv[1], "filter")) {
		// filter <log> <fulltext> [type:string_mode:range_mode:negate:data]...
		// Prints the filter options, then the identifiers of the matching dives.
		if (opendives::list_dives(argv[2], json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		std::vector<opendives::filter_rule> rules;
		for (int i = 4; i < argc; i++) {
			std::string s = argv[i], parts[5];
			for (int k = 0; k < 4; k++) {
				size_t colon = s.find(':');
				parts[k] = s.substr(0, colon);
				s = colon == std::string::npos ? std::string() : s.substr(colon + 1);
			}
			parts[4] = s;
			rules.push_back({ parts[0], parts[1], parts[2], parts[4], parts[3] == "1" });
		}
		opendives::filter_options(json);
		printf("%s\n", json.c_str());
		if (opendives::filter_dives(argv[3], "", rules, json, error)) {
			fprintf(stderr, "%s\n", error.c_str());
			return 1;
		}
		printf("%s\n", json.c_str());
		return 0;
	}
	fprintf(stderr, "usage: %s import <file> <repo[branch]> | list <repo[branch]> | dive <log> <number>"
		" | filter <log> <fulltext> [type:string_mode:range_mode:negate:data]...\n", argv[0]);
	return 2;
}
