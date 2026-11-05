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

// Après un chargement : reprend dans les préférences les réglages lus dans le
// carnet (unités, etc.), comme Subsurface-mobile (QMLManager::consumeFinishedLoad).
// Indispensable avant d'enregistrer : save-git réécrit ces réglages depuis prefs.
void apply_log_prefs();

// Lit `source` (.xml, .ssrf…) et l'enregistre dans le dépôt git local `repo`,
// créé au besoin. Renvoie le nombre de plongées, ou -1 avec `error` renseigné.
int import_file(const std::string &source, const std::string &repo, std::string &error);

// Charge `log` ("chemin[branche]" ou fichier) et écrit dans `json` un tableau
// de plongées. Renvoie 0, ou -1 avec `error` renseigné.
int list_dives(const std::string &log, std::string &json, std::string &error);

// Règle le compte du cloud Subsurface et écrit dans `url` l'adresse du carnet,
// au format de Subsurface : "https://<serveur>/git/<courriel>[<courriel>]".
int cloud_configure(const std::string &email, const std::string &password, std::string &url);

// Lecture seule : demande au serveur la liste de ses branches, avec la
// validation TLS normale de libgit2, et dit si la branche du carnet existe.
// Ne clone rien, n'écrit rien, ne pousse rien.
int cloud_branch_status(const std::string &url, bool &exists, std::string &head, std::string &error);

} // namespace opendives

#endif
