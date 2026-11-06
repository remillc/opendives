// SPDX-License-Identifier: GPL-2.0
// New account and divelogs.de (core/libopendives/account.cpp).
//
// usage: account <divelogs list sample, tests/data/divelogs-available-dives.xml> [<a log to read>]
//
// Offline: Subsurface's credential checks, the write lock (nothing is sent for
// another account than the test one), the divelogs.de form body and the
// reading of its list of dives.
// With OPENDIVES_CLOUD_EMAIL, OPENDIVES_CLOUD_PASSWORD and
// OPENDIVES_CLOUD_TEST_EMAIL set to the SAME account (the existing test
// account), also asks the server, which creates nothing for an existing,
// verified account: "/storage" with its password must answer "verified", and
// cloud_create_log must stop at LOG_EXISTS. The password is never printed.
#include "../core/libopendives/opendives.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>

static int failed = 0;

static void check(const char *what, bool ok)
{
	printf("%s %s\n", ok ? "ok  " : "FAIL", what);
	failed += !ok;
}

static void check_eq(const char *what, const std::string &got, const std::string &expected)
{
	bool ok = got == expected;
	printf("%s %s: \"%s\"%s%s%s\n", ok ? "ok  " : "FAIL", what, got.c_str(), ok ? "" : " (expected \"",
	       ok ? "" : expected.c_str(), ok ? "" : "\")");
	failed += !ok;
}

static std::string lower(std::string s)
{
	std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
	return s;
}

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: %s <divelogs list sample>\n", argv[0]);
		return 2;
	}
	if (opendives::init())
		return 2;
	std::string json, error;

	// Subsurface's checks (core/cloudstorage.cpp).
	check("valid email", opendives::cloud_valid_email("diver.one+log@example.org"));
	check("email without domain dot", !opendives::cloud_valid_email("diver@example"));
	check("email with a space", !opendives::cloud_valid_email("a b@example.org"));
	check("email with a one-letter TLD", !opendives::cloud_valid_email("a@example.o"));
	check("local part over 64", !opendives::cloud_valid_email(std::string(65, 'a') + "@example.org"));
	check("valid password", opendives::cloud_valid_password("Abc.123_x-y+z@"));
	check("empty password", !opendives::cloud_valid_password(""));
	check("password with a space", !opendives::cloud_valid_password("pass word"));
	check("password with an accent", !opendives::cloud_valid_password("caf\xc3\xa9"));

	// The write lock: nothing is sent for another account.
	opendives::set_cloud_test_email("test-account@example.org");
	error.clear();
	check("create, other account: refused",
	      opendives::cloud_create_account("someone@example.org", "secret1", json, error) == -1);
	check_eq("create, other account: error", error, "WRITE_LOCKED");
	error.clear();
	opendives::cloud_create_account("someone@example", "secret1", json, error);
	check_eq("create, invalid email: error", error, "INVALID_CREDENTIALS");
	error.clear();
	opendives::cloud_create_account("test-account@example.org", "pass word", json, error);
	check_eq("create, invalid password: error", error, "INVALID_CREDENTIALS");
	error.clear();
	opendives::cloud_verify_pin("test-account@example.org", "secret1", "", json, error);
	check_eq("verify, no PIN: error", error, "INVALID_PIN");
	error.clear();
	check("first logbook, no account: refused", opendives::cloud_create_log("", json, error) == -1);
	check_eq("first logbook, no account: error", error, "NO_ACCOUNT");

	// divelogs.de form body: "+" encoded as Subsurface does, the rest of the
	// reserved characters percent-encoded.
	check_eq("divelogs list body", opendives::divelogs_request_body("Diver One", "p+ss&w=rd%41", ""),
		 "user=Diver%20One&pass=p%2Bss%26w%3Drd%2541");
	check_eq("divelogs archive body", opendives::divelogs_request_body("diver", "pw", "12,345"),
		 "user=diver&pass=pw&ids=12%2C345");

	// The list of dives.
	std::ifstream sample(argv[1], std::ios::binary);
	std::stringstream buf;
	buf << sample.rdbuf();
	opendives::divelogs_list list = opendives::divelogs_parse_list(buf.str());
	check_eq("sample: error", list.error, "");
	check_eq("sample: ids", list.ids, "481516,2342,108");
	check("sample: count 3", list.count == 3);

	list = opendives::divelogs_parse_list(
		"<DiveDateReader version=\"1.0\"><Login>failed</Login><DiveDates/></DiveDateReader>");
	check_eq("login failed", list.error, "LOGIN_FAILED");
	list = opendives::divelogs_parse_list(
		"<DiveDateReader><Login>succeeded</Login><DiveDates><date divelogsId=\"7\"/>"
		"<date divelogsId=\"8\"></date></DiveDates></DiveDateReader>");
	check_eq("empty elements: ids", list.ids, "7,8");
	list = opendives::divelogs_parse_list("<DiveDateReader version=\"1.0\"><DiveDates></DiveDates></DiveDateReader>");
	check("no dive: no error", list.error.empty() && list.count == 0 && list.ids.empty());
	list = opendives::divelogs_parse_list("<html><body>Error</body></html>");
	check_eq("wrong root", list.error, "INVALID_RESPONSE");
	list = opendives::divelogs_parse_list("<DiveDateReader version=\"1.0\"></DiveDateReader>");
	check_eq("no DiveDates", list.error, "INVALID_RESPONSE");
	list = opendives::divelogs_parse_list("<DiveDateReader><DiveDates><date divelogsId=\"1\">");
	check_eq("malformed", list.error, "INVALID_RESPONSE");
	error.clear();
	check("download without credentials: refused",
	      opendives::divelogs_download("", "", "/nonexistent/x.dld", json, error) == -1 &&
		      error == "INVALID_CREDENTIALS");

	error.clear();
	check("divelogs check without credentials: refused",
	      opendives::divelogs_check("", "", json, error) == -1 && error == "INVALID_CREDENTIALS");

	// The "read the dives" step of the import.
	error.clear();
	check("import_count, missing file: refused",
	      opendives::import_count("/nonexistent/x.dld", json, error) == -1 && error == "IMPORT_FAILED");
	if (argc >= 3) {
		error.clear();
		int ret = opendives::import_count(argv[2], json, error);
		printf("import_count(%s): %s\n", argv[2], ret ? error.c_str() : json.c_str());
		check("import_count of a log: some dives", ret == 0 && json.rfind("{\"dives\":", 0) == 0 && json != "{\"dives\":0}");
	}

	// The existing test account, if its credentials are given.
	const char *email = getenv("OPENDIVES_CLOUD_EMAIL");
	const char *password = getenv("OPENDIVES_CLOUD_PASSWORD");
	const char *test_email = getenv("OPENDIVES_CLOUD_TEST_EMAIL");
	if (email && password && test_email && *email && *password && lower(email) == lower(test_email)) {
		opendives::set_cloud_test_email(test_email);
		error.clear();
		int ret = opendives::cloud_create_account(email, password, json, error);
		printf("test account /storage: %s %s\n", ret ? error.c_str() : "", ret ? "" : json.c_str());
		check("test account: answered verified", ret == 0 && json.find("\"status\":\"verified\"") != std::string::npos);

		std::string url;
		opendives::cloud_configure(email, password, url);
		error.clear();
		ret = opendives::cloud_create_log("", json, error);
		check_eq("test account: first logbook refused", error, "LOG_EXISTS");
	} else {
		printf("skip the test account (OPENDIVES_CLOUD_EMAIL, _PASSWORD, _TEST_EMAIL not the same account)\n");
	}

	printf("%s\n", failed ? "FAILED" : "all passed");
	return failed ? 1 : 0;
}
