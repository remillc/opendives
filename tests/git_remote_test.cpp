// SPDX-License-Identifier: GPL-2.0
// Own git repository instead of the cloud (to-do #11), through the façade.
// Driven by tests/run-git-remote-test.sh, which serves local repositories with
// `git daemon` (git://, accepted here through set_git_any_scheme_for_tests();
// the app itself accepts HTTPS only) and checks the repositories afterwards.
// The credentials used are fakes: the daemon does not ask for any. Nothing
// here reaches a real server except `check` against an address given on the
// command line, which only reads.
//
// usage: git-remote selftest                      rules of git_check and git_configure
//        git-remote check <url> [user token]      git_check; prints its JSON
//        git-remote create <url> <user> <token> <branch>
//                                                 git_configure, then git_create_log
//        git-remote open <url> <user> <token> <branch> [edit]
//                                                 git_configure, cloud_list_dives; with
//                                                 "edit" one dive is added, saved, synced
//        git-remote offline <url> <user> <token> <branch>
//                                                 the same, the server unreachable
// Prints KEY=VALUE lines; exit status 0 on success, 1 on failure.
#include "core/libopendives/opendives.h"

#include <cstdio>
#include <cstring>
#include <string>

using namespace opendives;

static int failures = 0;

static void expect(bool ok, const char *what)
{
	printf("%s %s\n", ok ? "ok  " : "FAIL", what);
	if (!ok)
		failures++;
}

static std::string error_of_configure(const std::string &url, const std::string &user, const std::string &token,
				     const std::string &branch)
{
	std::string address, error;
	return git_configure(url, user, token, branch, address, error) ? error : "";
}

static int selftest()
{
	std::string json, error, address;
	// HTTPS only, nothing that carries credentials or breaks "url[branch]".
	expect(error_of_configure("http://github.com/a/b.git", "u", "t", "main") == "BAD_ADDRESS", "http refused");
	expect(error_of_configure("git://github.com/a/b.git", "u", "t", "main") == "BAD_ADDRESS", "git:// refused");
	expect(error_of_configure("https://u:p@github.com/a/b.git", "u", "t", "main") == "BAD_ADDRESS", "credentials in the address refused");
	expect(error_of_configure("https://github.com/a/b.git[main]", "u", "t", "main") == "BAD_ADDRESS", "brackets refused");
	expect(error_of_configure("https://github.com/a/ b.git", "u", "t", "main") == "BAD_ADDRESS", "space refused");
	expect(error_of_configure("https://github.com/", "u", "t", "main") == "BAD_ADDRESS", "no path refused");
	expect(error_of_configure("https://github.com/a/b.git?x=1", "u", "t", "main") == "BAD_ADDRESS", "query refused");
	expect(error_of_configure("https://github.com/a/b.git", "u@x", "t", "main") == "BAD_CREDENTIALS", "user name with @ refused");
	expect(error_of_configure("https://github.com/a/b.git", "", "t", "main") == "BAD_CREDENTIALS", "empty user name refused");
	expect(error_of_configure("https://github.com/a/b.git", "u", "", "main") == "BAD_CREDENTIALS", "empty token refused");
	expect(error_of_configure("https://github.com/a/b.git", "u", "a b", "main") == "BAD_CREDENTIALS", "token with a space refused");
	expect(error_of_configure("https://github.com/a/b.git", "u", "t", "a..b") == "BAD_BRANCH", "branch with .. refused");
	expect(error_of_configure("https://github.com/a/b.git", "u", "t", "a]b") == "BAD_BRANCH", "branch with ] refused");
	expect(!git_mode(), "a refused configuration leaves git mode off");
	// Accepted: the address has a trailing slash dropped, never credentials.
	const std::string token = "ghp_FAKE0123456789tokenvalue";
	bool ok = !git_configure("https://github.com/remillc/opendives-test/", "remillc", token, "main", address, error);
	expect(ok && address == "https://github.com/remillc/opendives-test[main]", "address without credentials");
	expect(address.find(token) == std::string::npos && address.find('@') == std::string::npos, "no token, no user in the address");
	expect(git_mode(), "git mode on");
	// git_check refuses what git_configure refuses; its answers never hold the token.
	expect(git_check("http://github.com/a/b.git", "", "", json, error) != 0 && error == "BAD_ADDRESS", "check: http refused");
	expect(git_check("https://github.com/a/b.git", "u@", "t", json, error) != 0 && error == "BAD_CREDENTIALS", "check: bad user");
	// Signing out forgets everything, the token included.
	expect(cloud_sign_out(false, error) == 0 && !git_mode(), "sign out leaves git mode");
	// A cloud account takes over the log address again.
	std::string url;
	expect(cloud_configure("a@example.com", "pw", url) == 0 && !git_mode() && url.find("/git/") != std::string::npos,
	       "cloud_configure leaves git mode");
	cloud_sign_out(false, error);
	return failures ? 1 : 0;
}

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: git-remote selftest|check|create|open|offline …\n");
		return 1;
	}
	const std::string mode = argv[1];
	// The rules are checked as the app has them: HTTPS only.
	set_git_any_scheme_for_tests(mode != "selftest");
	if (init() < 0)
		return 1;
	std::string json, error, address;
	if (mode == "selftest")
		return selftest();

	if (mode == "check") {
		if (argc < 3)
			return 1;
		if (git_check(argv[2], argc > 4 ? argv[3] : "", argc > 4 ? argv[4] : "", json, error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		printf("json=%s\n", json.c_str());
		return 0;
	}

	if ((mode == "create" || mode == "open" || mode == "offline") && argc >= 6) {
		if (git_configure(argv[2], argv[3], argv[4], argv[5], address, error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		printf("address=%s\n", address.c_str());
		if (mode == "create") {
			if (git_create_log(json, error)) {
				printf("error=%s\n", error.c_str());
				return 1;
			}
			printf("json=%s\n", json.c_str());
			return 0;
		}
		if (cloud_list_dives("", "", json, error)) {
			printf("error=%s\n", error.c_str());
			return 1;
		}
		// The dives themselves are not printed: only their number and the sync state.
		size_t dives = 0;
		for (size_t at = json.find("\"id\":"); at != std::string::npos; at = json.find("\"id\":", at + 1))
			dives++;
		printf("dives=%zu\n", dives);
		printf("synced=%s\n", json.find("\"synced\":true") != std::string::npos ? "true" : "false");
		if (argc > 6 && !strcmp(argv[6], "edit")) {
			std::string result, status;
			if (create_dive("{\"date\":\"2026-12-01T10:00:00\",\"durationSeconds\":1800,\"maxDepthMm\":12000}", result,
					error) ||
			    save_local(error)) {
				printf("error=edit: %s\n", error.c_str());
				return 1;
			}
			std::string pending;
			pending_changes(pending);
			printf("pending=%s\n", pending == "[]" ? "0" : "some");
			if (sync(status, error)) {
				printf("error=sync: %s\n", error.c_str());
				return 1;
			}
			printf("sync=%s\n", status.c_str());
			pending_changes(pending);
			printf("pendingAfter=%s\n", pending == "[]" ? "0" : "some");
		}
		return 0;
	}
	fprintf(stderr, "bad arguments\n");
	return 1;
}
