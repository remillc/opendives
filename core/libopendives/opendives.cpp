// SPDX-License-Identifier: GPL-2.0
#include "opendives.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/errorhelper.h"
#include "core/file.h"
#include "core/git-access.h"
#include "core/pref.h"
#include "core/qthelper.h"
#include "core/trip.h"

#include <git2.h>
#include <cstdio>
#include <ctime>

namespace opendives {

static void append_json_string(std::string &out, const std::string &s)
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

// Le cœur garde l'heure locale de la plongée dans un timestamp_t, sans fuseau.
static std::string iso_date(timestamp_t when)
{
	time_t t = static_cast<time_t>(when);
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tm);
	return buf;
}

static std::string repo_path(const std::string &repo)
{
	return repo.substr(0, repo.find('['));
}

static int load(const std::string &path, std::string &error)
{
	divelog.clear();
	int ret = parse_file(path.c_str(), &divelog);
	if (ret) {
		error = "Lecture impossible de " + path + " (" + std::to_string(ret) + ")";
		return -1;
	}
	return 0;
}

// Port de QMLManager::consumeFinishedLoad() (mobile-widgets/qmlmanager.cpp),
// sans la partie interface.
void apply_log_prefs()
{
	/* Only apply unit system when the loaded file contained a "units" line.
	 * Without this guard, git_prefs.unit_system defaults to METRIC and would
	 * clobber the correct preference already loaded from the settings. */
	if (git_prefs_units_set) {
		prefs.unit_system = git_prefs.unit_system;
		if (git_prefs.unit_system == IMPERIAL)
			git_prefs.units = IMPERIAL_units;
		else if (git_prefs.unit_system == METRIC)
			git_prefs.units = SI_units;
		prefs.units = git_prefs.units;
	}
	prefs.tankbar = git_prefs.tankbar;
	prefs.show_ccr_setpoint = git_prefs.show_ccr_setpoint;
	prefs.show_ccr_sensors = git_prefs.show_ccr_sensors;
	prefs.pp_graphs.po2 = git_prefs.pp_graphs.po2;
}

int init()
{
	int ret = git_libgit2_init();
	return ret < 0 ? ret : 0;
}

bool log_exists(const std::string &repo)
{
	git_repository *r = nullptr;
	if (git_repository_open(&r, repo_path(repo).c_str()))
		return false;
	git_repository_free(r);
	return true;
}

int import_file(const std::string &source, const std::string &repo, std::string &error)
{
	if (load(source, error))
		return -1;
	if (!log_exists(repo) && git_create_local_repo(repo)) {
		error = "Création impossible du dépôt " + repo;
		return -1;
	}
	int ret = save_dives(repo.c_str(), true);
	if (ret) {
		error = "Enregistrement impossible dans " + repo + " (" + std::to_string(ret) + ")";
		return -1;
	}
	return static_cast<int>(divelog.dives.size());
}

int list_dives(const std::string &log, std::string &json, std::string &error)
{
	if (load(log, error))
		return -1;
	apply_log_prefs();
	divelog.process_loaded_dives();

	json = "[";
	bool first = true;
	for (const auto &d: divelog.dives) {
		if (!first)
			json += ',';
		first = false;
		json += "{\"number\":" + std::to_string(d->number);
		json += ",\"date\":";
		append_json_string(json, iso_date(d->when));
		json += ",\"site\":";
		append_json_string(json, d->dive_site ? d->dive_site->name : std::string());
		json += ",\"maxDepthMm\":" + std::to_string(d->maxdepth.mm);
		json += ",\"durationSeconds\":" + std::to_string(d->duration.seconds);
		json += ",\"trip\":";
		if (d->divetrip) {
			json += "{\"id\":" + std::to_string(d->divetrip->id) + ",\"location\":";
			append_json_string(json, d->divetrip->location);
			json += '}';
		} else {
			json += "null";
		}
		json += '}';
	}
	json += ']';
	return 0;
}

int cloud_configure(const std::string &email, const std::string &password, std::string &url)
{
	prefs.cloud_storage_email = email;
	prefs.cloud_storage_password = password;
	auto cloud_url = getCloudURL();
	if (!cloud_url)
		return -1;
	url = *cloud_url;
	return 0;
}

// Une seule tentative : un mauvais mot de passe ne doit pas être répété.
static int probe_credentials(git_credential **out, const char *, const char *, unsigned int, void *payload)
{
	int *attempts = static_cast<int *>(payload);
	if ((*attempts)++ > 0)
		return GIT_EUSER;
	return git_credential_userpass_plaintext_new(out, prefs.cloud_storage_email_encoded.c_str(),
						     prefs.cloud_storage_password.c_str());
}

int cloud_branch_status(const std::string &url, bool &exists, std::string &head, std::string &error)
{
	exists = false;
	head.clear();
	size_t open = url.rfind('[');
	if (open == std::string::npos || url.back() != ']') {
		error = "Adresse de carnet invalide";
		return -1;
	}
	std::string remote_url = url.substr(0, open);
	std::string branch_ref = "refs/heads/" + url.substr(open + 1, url.size() - open - 2);

	git_remote *remote = nullptr;
	if (git_remote_create_detached(&remote, remote_url.c_str())) {
		error = git_error_last() ? git_error_last()->message : "git_remote_create_detached";
		return -1;
	}
	int attempts = 0;
	git_remote_callbacks callbacks = GIT_REMOTE_CALLBACKS_INIT;
	callbacks.credentials = probe_credentials;
	callbacks.payload = &attempts;
	// Pas de certificate_check : libgit2 applique sa validation normale.
	int ret = git_remote_connect(remote, GIT_DIRECTION_FETCH, &callbacks, nullptr, nullptr);
	if (ret == 0) {
		const git_remote_head **heads = nullptr;
		size_t count = 0;
		ret = git_remote_ls(&heads, &count, remote);
		for (size_t i = 0; ret == 0 && i < count; i++) {
			if (branch_ref == heads[i]->name) {
				char sha[41];
				git_oid_tostr(sha, sizeof(sha), &heads[i]->oid);
				head = sha;
				exists = true;
			}
		}
		git_remote_disconnect(remote);
	}
	if (ret) {
		error = attempts > 1 ? "Identifiants refusés par le serveur"
				     : (git_error_last() ? git_error_last()->message : "Connexion impossible");
	}
	git_remote_free(remote);
	return ret ? -1 : 0;
}

} // namespace opendives
