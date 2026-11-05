// SPDX-License-Identifier: GPL-2.0
#include "opendives.h"

#include "core/dive.h"
#include "core/divelog.h"
#include "core/divesite.h"
#include "core/errorhelper.h"
#include "core/file.h"
#include "core/git-access.h"
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

} // namespace opendives
