// SPDX-License-Identifier: GPL-2.0
// Façade d'OpenDives au-dessus du cœur de Subsurface. Le reste de l'application
// ne voit jamais les structures internes de Subsurface.
// Ces fonctions ne sont pas réentrantes : le cœur doit tourner sur un seul fil.
#ifndef OPENDIVES_H
#define OPENDIVES_H

#include <string>

namespace opendives {

// À appeler une fois avant toute autre fonction. Renvoie 0 si tout va bien.
int init();

// Vrai si `repo` (au format "chemin[branche]") désigne un dépôt déjà enregistré.
bool log_exists(const std::string &repo);

// Lit `source` (.xml, .ssrf…) et l'enregistre dans le dépôt git local `repo`,
// créé au besoin. Renvoie le nombre de plongées, ou -1 avec `error` renseigné.
int import_file(const std::string &source, const std::string &repo, std::string &error);

// Charge `log` ("chemin[branche]" ou fichier) et écrit dans `json` un tableau
// de plongées. Renvoie 0, ou -1 avec `error` renseigné.
int list_dives(const std::string &log, std::string &json, std::string &error);

} // namespace opendives

#endif
