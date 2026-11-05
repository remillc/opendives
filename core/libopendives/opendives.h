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

// Détail d'une plongée du carnet chargé (identifiant `id` de list_dives) :
// faits, bouteilles et gaz, changements de gaz, compagnons, étiquettes, notes,
// et profil calculé par le cœur (profondeur, bouteille active, ppO2, plafond
// si présent). Unités SI entières. Renvoie 0, ou -1 avec `error`.
// Les identifiants ne valent que jusqu'au prochain chargement.
int get_dive(int id, std::string &json, std::string &error);

// Unités du carnet, une par mesure : {"length":"m"|"ft", "temperature":"C"|"F",
// "pressure":"bar"|"psi", "volume":"l"|"cuft", "weight":"kg"|"lbs"}.
int get_prefs(std::string &json);

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

// Fichier PEM des autorités de confiance, pour libgit2 et la vérification du
// serveur. Sous Android, il est obligatoire : le système n'en fournit pas.
int set_ca_file(const std::string &path);

// Lecture seule : vérifie que la branche du carnet existe sur le serveur, puis
// charge le carnet par le cœur (clone, ou mise à jour du cache local sous
// $HOME/.subsurface). Écrit dans `json` un objet :
//   {"server":…, "head":…, "synced":true|false, "offlineReason":…, "dives":[…]}
// Serveur injoignable : lit la copie locale sans synchroniser (synced=false,
// offlineReason renseigné), ou échoue s'il n'y en a pas.
// Refuse de charger si la branche est absente : le cœur la créerait en poussant.
int cloud_list_dives(const std::string &email, const std::string &password, std::string &json, std::string &error);

// Lecture seule : demande au serveur la liste de ses branches, avec la
// validation TLS normale de libgit2, et dit si la branche du carnet existe.
// Ne clone rien, n'écrit rien, ne pousse rien.
int cloud_branch_status(const std::string &url, bool &exists, std::string &head, std::string &error);

} // namespace opendives

#endif
