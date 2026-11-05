// SPDX-License-Identifier: GPL-2.0
// OpenDives — opendives_https_get() quand la plateforme ne fournit pas encore
// de réseau (build Android actuel) : le cloud est simplement injoignable.
#include "platform_https.h"

int opendives_https_get(const std::string &, const std::string &, int, int &, std::string &)
{
	return -1;
}
