// SPDX-License-Identifier: GPL-2.0
// OpenDives — requête HTTPS fournie par la plateforme (remplace QNetworkAccessManager).
// Le certificat du serveur DOIT être validé (chaîne de confiance et nom d'hôte).
#ifndef OPENDIVES_PLATFORM_HTTPS_H
#define OPENDIVES_PLATFORM_HTTPS_H

#include <string>

// GET sur `url` (https:// seulement). Renvoie 0 si une réponse HTTP a été reçue
// sur une connexion TLS valide ; `status` et `body` sont alors remplis.
// Renvoie une valeur négative en cas d'échec réseau, TLS ou de délai dépassé.
int opendives_https_get(const std::string &url, const std::string &user_agent,
			int timeout_seconds, int &status, std::string &body);

#endif
