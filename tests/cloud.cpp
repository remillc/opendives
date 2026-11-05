// SPDX-License-Identifier: GPL-2.0
// READ-ONLY test of the Subsurface cloud, on the development machine.
// Credentials are read from OPENDIVES_CLOUD_EMAIL and OPENDIVES_CLOUD_PASSWORD;
// the password is never printed.
//
// usage: cloud probe   does the log branch exist? (no clone)
//        cloud load    loads the log through the Subsurface core (clone or
//                      update of the local cache under $HOME/.subsurface)
//        cloud list    same path as the app: opendives::cloud_list_dives()
//
// "load" refuses to continue if the branch does not exist on the server:
// the core would then create it by pushing an empty commit.
#include "core/libopendives/opendives.h"
#include "core/divelog.h"
#include "core/file.h"
#include "core/git-access.h"
#include "core/pref.h"
#include <git2.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>

static std::string host_of(const std::string &url)
{
	size_t start = url.find("://");
	start = start == std::string::npos ? 0 : start + 3;
	return url.substr(start, url.find('/', start) - start);
}

int main(int argc, char **argv)
{
	const char *email = getenv("OPENDIVES_CLOUD_EMAIL");
	const char *password = getenv("OPENDIVES_CLOUD_PASSWORD");
	if (argc != 2 || (strcmp(argv[1], "probe") && strcmp(argv[1], "load") && strcmp(argv[1], "list"))) {
		fprintf(stderr, "usage: %s probe|load|list\n", argv[0]);
		return 2;
	}
	if (!email || !*email || !password || !*password) {
		fprintf(stderr, "OPENDIVES_CLOUD_EMAIL and OPENDIVES_CLOUD_PASSWORD are required\n");
		return 2;
	}
	if (opendives::init())
		return 2;

	std::string url, error, head;
	if (!strcmp(argv[1], "list")) {
		// Same path as the app: opendives::cloud_list_dives().
		std::string json;
		if (opendives::cloud_list_dives(email, password, json, error)) {
			fprintf(stderr, "failed: %s\n", error.c_str());
			return 1;
		}
		size_t dives = json.find("\"dives\":");
		printf("%s\n", json.substr(0, dives).c_str());
		size_t count = 0;
		for (size_t p = json.find("\"number\":"); p != std::string::npos; p = json.find("\"number\":", p + 1))
			count++;
		printf("dives: %zu\n", count);
		return 0;
	}
	if (opendives::cloud_configure(email, password, url))
		return 1;
	bool exists = false;
	if (opendives::cloud_branch_status(url, exists, head, error)) {
		fprintf(stderr, "probe: %s (%s)\n", error.c_str(), host_of(url).c_str());
		return 1;
	}
	printf("server: %s\nbranch: %s\nhead: %s\n", host_of(url).c_str(),
	       exists ? "present" : "MISSING", exists ? head.c_str() : "-");
	if (!strcmp(argv[1], "probe"))
		return 0;
	if (!exists) {
		fprintf(stderr, "branch missing: load refused so that nothing is pushed\n");
		return 1;
	}

	int ret = parse_file(url.c_str(), &divelog);
	if (ret) {
		fprintf(stderr, "load failed (%d)\n", ret);
		return 1;
	}
	struct git_info info;
	is_git_repository(url.c_str(), &info);
	printf("loaded: %zu dives, %zu sites, %zu trips\n",
	       divelog.dives.size(), divelog.sites.size(), divelog.trips.size());
	printf("cache: %s\n", info.localdir.c_str());
	printf("git_local_only: %d\n", git_local_only ? 1 : 0);
	return 0;
}
