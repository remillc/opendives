// SPDX-License-Identifier: GPL-2.0
// Test 3 of docs/editing-and-sync-plan.md: WRITES to a Subsurface cloud
// account, through the façade. Driven by tests/run-cloud-write-test.sh.
//
// Runs only when OPENDIVES_CLOUD_EMAIL equals OPENDIVES_CLOUD_TEST_EMAIL (the
// test account); the façade's write lock is set to that address. The password
// (OPENDIVES_CLOUD_PASSWORD) is never printed. Each "clone" is a separate
// $HOME: the core keeps its cache under $HOME/.subsurface.
//
// usage: cloud-write head                       server head of the log branch
//        cloud-write numbers                    load (with sync); some dive numbers, the cache
//        cloud-write get <number>               load (with sync); {"notes":…} of that dive
//        cloud-write edit <number> <json-file> sync|save
//                                               load, edit the dive, then sync or save locally
//        cloud-write edit-cached <number> <json-file> sync|save
//                                               same, from the local copy without syncing first
//                                               (to make two clones diverge)
//        cloud-write sync                       read the local copy, then sync
//        cloud-write pending                    read the local copy; local commits not on the server
//        cloud-write lockcheck                  with another test address set, save and sync
//                                               must be refused (WRITE_LOCKED); writes nothing
// Prints KEY=VALUE lines; exit status 0 on success, 1 on failure, 2 when refused.
#include "core/libopendives/opendives.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/git-access.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

using namespace opendives;

static std::string lower(std::string s)
{
	std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
	return s;
}

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

static dive *by_number(int number)
{
	for (auto &d: divelog.dives)
		if (d->number == number)
			return d.get();
	return nullptr;
}

static std::string email, password;

// Loads the cloud log as the app does: probe, then clone or update with sync.
static bool load_cloud()
{
	std::string json, error;
	if (cloud_list_dives(email, password, json, error)) {
		printf("error=load: %s\n", error.c_str());
		return false;
	}
	size_t synced = json.find("\"synced\":");
	printf("synced=%s\n", synced != std::string::npos && json.compare(synced + 9, 4, "true") == 0 ? "true" : "false");
	return true;
}

// Reads the local copy only (no network), keeping local commits.
static bool load_cached()
{
	std::string url, json, error;
	if (cloud_configure(email, password, url)) {
		printf("error=configure\n");
		return false;
	}
	int ret = cloud_list_cached_dives(json, error);
	if (ret) {
		printf("error=cached: %s\n", ret > 0 ? "no local copy" : error.c_str());
		return false;
	}
	return true;
}

int main(int argc, char **argv)
{
	const char *e = getenv("OPENDIVES_CLOUD_EMAIL");
	const char *p = getenv("OPENDIVES_CLOUD_PASSWORD");
	const char *t = getenv("OPENDIVES_CLOUD_TEST_EMAIL");
	if (!e || !*e || !p || !*p || !t || !*t) {
		fprintf(stderr, "OPENDIVES_CLOUD_EMAIL, OPENDIVES_CLOUD_PASSWORD and OPENDIVES_CLOUD_TEST_EMAIL are required\n");
		return 2;
	}
	if (lower(e) != lower(t)) {
		fprintf(stderr, "refused: the account is not the test account\n");
		return 2;
	}
	if (argc < 2) {
		fprintf(stderr, "usage: %s head|numbers|get|edit|sync|pending ...\n", argv[0]);
		return 2;
	}
	email = e;
	password = p;
	std::string cmd = argv[1];
	if (init())
		return 1;
	set_cloud_test_email(t);

	if (cmd == "head") {
		std::string url, json, error;
		if (cloud_configure(email, password, url) || cloud_probe(json, error)) {
			printf("error=probe: %s\n", error.c_str());
			return 1;
		}
		size_t h = json.find("\"head\":\"");
		printf("head=%s\n", h == std::string::npos ? "" : json.substr(h + 8, 40).c_str());
		return 0;
	}

	if (cmd == "numbers") {
		if (!load_cloud())
			return 1;
		std::vector<int> numbers;
		for (auto &d: divelog.dives)
			if (d->number > 0)
				numbers.push_back(d->number);
		std::sort(numbers.rbegin(), numbers.rend());
		printf("dives=%zu\nnumbers=", divelog.dives.size());
		for (size_t i = 0; i < numbers.size() && i < 8; i++)
			printf("%s%d", i ? " " : "", numbers[i]);
		printf("\n");
		std::string url;
		cloud_configure(email, password, url);
		struct git_info info;
		if (is_git_repository(url.c_str(), &info))
			printf("cache=%s\n", info.localdir.c_str());
		return 0;
	}

	if (cmd == "get" && argc == 3) {
		if (!load_cloud())
			return 1;
		dive *d = by_number(atoi(argv[2]));
		if (!d) {
			printf("error=no dive %s\n", argv[2]);
			return 1;
		}
		printf("value={\"notes\":%s}\n", json_string(d->notes).c_str());
		return 0;
	}

	if ((cmd == "edit" || cmd == "edit-cached") && argc == 5) {
		std::ifstream in(argv[3]);
		std::stringstream request;
		request << in.rdbuf();
		std::string mode = argv[4];
		if (!(cmd == "edit" ? load_cloud() : load_cached()))
			return 1;
		dive *d = by_number(atoi(argv[2]));
		if (!d) {
			printf("error=no dive %s\n", argv[2]);
			return 1;
		}
		std::string result, error, status;
		if (edit_dive(d->id, request.str(), result, error)) {
			printf("error=edit: %s\n", error.c_str());
			return 1;
		}
		printf("text=%s\n", undo_text().c_str());
		if (mode == "save") {
			if (save_local(error)) {
				printf("error=save: %s\n", error.c_str());
				return 1;
			}
			std::string pending;
			pending_changes(pending);
			printf("status=saved\n");
			return 0;
		}
		if (sync(status, error)) {
			printf("error=sync: %s\n", error.c_str());
			return 1;
		}
		printf("status=%s\n", status.c_str());
		return 0;
	}

	if (cmd == "sync") {
		if (!load_cached())
			return 1;
		std::string status, error;
		if (sync(status, error)) {
			printf("error=sync: %s\n", error.c_str());
			return 1;
		}
		printf("status=%s\n", status.c_str());
		return 0;
	}

	if (cmd == "lockcheck") {
		set_cloud_test_email("someone-else@example.invalid");
		if (!load_cloud())
			return 1;
		dive *d = divelog.dives.empty() ? nullptr : divelog.dives[0].get();
		std::string result, error, status;
		if (!d || edit_dive(d->id, "{\"notes\":\"lock check\"}", result, error)) {
			printf("error=edit: %s\n", error.c_str());
			return 1;
		}
		int saved = save_local(error);
		printf("save=%d %s\n", saved, error.c_str());
		bool save_locked = saved != 0 && error == "WRITE_LOCKED";
		int synced = sync(status, error);
		printf("sync=%d %s\n", synced, error.c_str());
		return save_locked && synced != 0 && error == "WRITE_LOCKED" ? 0 : 1;
	}

	if (cmd == "pending") {
		if (!load_cached())
			return 1;
		std::string json;
		pending_changes(json);
		size_t count = 0;
		for (size_t pos = json.find("\"id\":"); pos != std::string::npos; pos = json.find("\"id\":", pos + 1))
			count++;
		printf("pending=%zu\n", count);
		return 0;
	}

	fprintf(stderr, "usage: %s head|numbers|get <n>|edit <n> <file> sync|save|sync|pending\n", argv[0]);
	return 2;
}
