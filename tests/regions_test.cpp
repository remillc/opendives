// SPDX-License-Identifier: GPL-2.0
// Offline country and region lookup (core/libopendives/regions.cpp).
// usage: regions core/data/regions.txt
#include "../core/libopendives/opendives.h"

#include <cstdio>
#include <string>

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: %s regions.txt\n", argv[0]);
		return 2;
	}
	opendives::set_regions_file(argv[1]);
	struct Case {
		double lat, lon;
		const char *lang, *country, *region; // nullptr: no result expected
	} cases[] = {
		// Ottawa. Natural Earth (1:10 million) is only accurate to about a
		// kilometre: along a narrow border river (the St. Lawrence at Brockville
		// or Kinghorn) a site may fall on the wrong side. Nominatim, online, is
		// exact.
		{ 45.4215, -75.6972, "en", "Canada", "Ontario" },
		{ 45.4215, -75.6972, "fr", "Canada", "Ontario" },
		{ -35.4485, 174.7320, "en", "New Zealand", "Northland" }, // Northern Arch, offshore
		{ 20.3500, -87.0300, "fr", "Mexique", "Quintana Roo" },    // off Cozumel
		{ 48.8566, 2.3522, "fr", "France", "Île-de-France" }, // région, not département
		{ 30.0, -40.0, "en", nullptr, nullptr },                   // mid-Atlantic
	};
	int failed = 0;
	for (const Case &c: cases) {
		std::string country, region;
		bool found = opendives::offline_region(static_cast<int>(c.lat * 1e6), static_cast<int>(c.lon * 1e6), c.lang, country, region);
		bool ok = c.country ? found && country == c.country && region == c.region : !found;
		printf("%s %.4f %.4f %s: %s / %s\n", ok ? "ok  " : "FAIL", c.lat, c.lon, c.lang, found ? country.c_str() : "-",
		       found ? region.c_str() : "-");
		failed += !ok;
	}
	printf("%d failed\n", failed);
	return failed ? 1 : 0;
}
