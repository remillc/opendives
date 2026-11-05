// SPDX-License-Identifier: GPL-2.0
// Essai de la façade sur le poste de développement, sans téléphone.
// usage: facade import <fichier> <chemin[branche]>
//        facade list <chemin[branche]>
#include "core/libopendives/opendives.h"
#include <cstdio>
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
	fprintf(stderr, "usage: %s import <fichier> <dépôt[branche]> | list <dépôt[branche]>\n", argv[0]);
	return 2;
}
