// SPDX-License-Identifier: GPL-2.0
//
// OpenDives — port without Qt of the cloud helpers of Subsurface:
//   checkcloudconnection.cpp : canReachCloudServer(), checkServer(), nextServer()
//   qthelper.cpp             : getCloudURL(), sanitize_email()
// Same requests, same server order, same side effects on prefs and git_local_only.
// Only the HTTPS request itself is delegated to the platform (platform_https.h).

#include "core/errorhelper.h"
#include "core/format.h"
#include "core/git-access.h"
#include "core/pref.h"
#include "core/qthelper.h"
#include "core/subsurface-string.h"
#include "platform_https.h"

#include <cctype>
#include <string>

// our own madeup API to make sure we are talking to a Subsurface cloud server
#define TEAPOT "/make-latte?number-of-shots=3"
#define HTTP_I_AM_A_TEAPOT 418
#define MILK "Linus does not like non-fat milk"

static bool nextServer()
{
	struct serverTried {
		const char *server;
		bool tried;
	};
	static struct serverTried cloudServers[] = {
		{ CLOUD_HOST_EU, false },
		{ CLOUD_HOST_US, false },
		{ CLOUD_HOST_E2, false },
		{ CLOUD_HOST_U2, false }
	};
	const char *server = nullptr;
	for (serverTried &item: cloudServers) {
		if (contains(prefs.cloud_base_url, item.server))
			item.tried = true;
		else if (item.tried == false)
			server = item.server;
	}
	if (server) {
		using namespace std::string_literals;
		std::string base_url = "https://"s + server + "/"s;
		report_info("failed to connect to %s next server to try: %s", prefs.cloud_base_url.c_str(), base_url.c_str());
		prefs.cloud_base_url = std::move(base_url);
		git_storage_update_progress("Trying different cloud server...");
		return true;
	}
	report_info("failed to connect to any of the Subsurface cloud servers, giving up");
	return false;
}

static bool checkServer()
{
	if (verbose)
		report_info("Checking cloud connection...");
	std::string user_agent = subsurface_user_agent();
	do {
		int status = 0;
		std::string body;
		std::string url = prefs.cloud_base_url + TEAPOT;
		int ret = opendives_https_get(url, user_agent, prefs.cloud_timeout, status, body);
		if (ret == 0 && status == HTTP_I_AM_A_TEAPOT && body == MILK) {
			if (verbose)
				report_info("Cloud storage: successfully checked connection to cloud server");
			return true;
		}
		if (verbose)
			report_info("connection test to cloud server %s failed %d %d", prefs.cloud_base_url.c_str(), ret, status);
	} while (nextServer());
	// if none of the servers was reachable, update the user and switch to git_local_only
	git_storage_update_progress("Cloud connection failed");
	git_local_only = true;
	if (verbose)
		report_info("Cloud storage: unable to connect to cloud server");
	return false;
}

// helper to be used from C code
bool canReachCloudServer(struct git_info *info)
{
	if (verbose)
		report_info("Cloud storage: checking connection to cloud server %s", info->url.c_str());
	bool connection = checkServer();
	if (info->url.find(prefs.cloud_base_url) == std::string::npos) {
		// we switched the cloud URL - likely because we couldn't reach the server passed in
		// the strstr with the offset is designed so we match the right component in the name;
		// the cloud_base_url ends with a '/', so we need the text starting at "git/..."
		size_t pos = info->url.find("org/git/");
		if (pos != std::string::npos) {
			info->url = format_string_std("%s%s", prefs.cloud_base_url.c_str(), info->url.c_str() + pos + 4);
			if (verbose)
				report_info("updating remote to: %s", info->url.c_str());
		}
	}
	return connection;
}

static void sanitize_email(std::string &email)
{
	size_t j = 0;
	for (char c: email) {
		if (isalnum(c) || c == '@' || c == '.' ||
		    c == '_' || c == '+' || c == '-')
			email[j++] = c;
	}
	email.resize(j);
}

std::optional<std::string> getCloudURL()
{
	std::string email(prefs.cloud_storage_email);
	sanitize_email(email);
	if (email.empty() || prefs.cloud_storage_password.empty()) {
		report_error("Please configure Cloud storage email and password in the preferences");
		return {};
	}
	prefs.cloud_storage_email_encoded = email;
	std::string filename = std::string(prefs.cloud_base_url) + "git/" + email + "[" + email + "]";
	if (verbose)
		report_info("returning cloud URL %s", filename.c_str());
	return filename;
}
