// SPDX-License-Identifier: GPL-2.0
// Essai du cloud Subsurface en LECTURE SEULE, sur le poste de développement.
// Identifiants lus dans OPENDIVES_CLOUD_EMAIL et OPENDIVES_CLOUD_PASSWORD ;
// le mot de passe n'est jamais affiché.
//
// usage: cloud probe   la branche du carnet existe-t-elle ? (aucun clone)
//        cloud load    charge le carnet par le cœur de Subsurface (clone ou
//                      mise à jour du cache local sous $HOME/.subsurface)
//
// « load » refuse de continuer si la branche n'existe pas sur le serveur :
// le cœur la créerait alors en poussant un commit vide.
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
		fprintf(stderr, "OPENDIVES_CLOUD_EMAIL et OPENDIVES_CLOUD_PASSWORD sont requis\n");
		return 2;
	}
	if (opendives::init())
		return 2;

	std::string url, error, head;
	if (!strcmp(argv[1], "list")) {
		// Même chemin que l'app : opendives::cloud_list_dives().
		std::string json;
		if (opendives::cloud_list_dives(email, password, json, error)) {
			fprintf(stderr, "échec: %s\n", error.c_str());
			return 1;
		}
		size_t dives = json.find("\"dives\":");
		printf("%s\n", json.substr(0, dives).c_str());
		size_t count = 0;
		for (size_t p = json.find("\"number\":"); p != std::string::npos; p = json.find("\"number\":", p + 1))
			count++;
		printf("plongées: %zu\n", count);
		return 0;
	}
	if (opendives::cloud_configure(email, password, url))
		return 1;
	bool exists = false;
	if (opendives::cloud_branch_status(url, exists, head, error)) {
		fprintf(stderr, "sonde: %s (%s)\n", error.c_str(), host_of(url).c_str());
		return 1;
	}
	printf("serveur: %s\nbranche: %s\nhead: %s\n", host_of(url).c_str(),
	       exists ? "présente" : "ABSENTE", exists ? head.c_str() : "-");
	if (!strcmp(argv[1], "probe"))
		return 0;
	if (!exists) {
		fprintf(stderr, "branche absente : chargement refusé pour ne rien pousser\n");
		return 1;
	}

	int ret = parse_file(url.c_str(), &divelog);
	if (ret) {
		fprintf(stderr, "chargement impossible (%d)\n", ret);
		return 1;
	}
	struct git_info info;
	is_git_repository(url.c_str(), &info);
	printf("chargé: %zu plongées, %zu sites, %zu voyages\n",
	       divelog.dives.size(), divelog.sites.size(), divelog.trips.size());
	printf("cache: %s\n", info.localdir.c_str());
	printf("git_local_only: %d\n", git_local_only ? 1 : 0);
	return 0;
}
