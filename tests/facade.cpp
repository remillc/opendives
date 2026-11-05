// SPDX-License-Identifier: GPL-2.0
// Exercises the façade on the development machine, without a phone.
// usage: facade import <file> <path[branch]>
//        facade list <path[branch]>
//        facade dive <log> <number>
#include "core/libopendives/opendives.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>

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
	fprintf(stderr, "usage: %s import <file> <repo[branch]> | list <repo[branch]> | dive <log> <number>\n", argv[0]);
	return 2;
}
