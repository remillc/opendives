// SPDX-License-Identifier: GPL-2.0
// OpenDives: offline country and region of a position, from Natural Earth's
// states and provinces (core/data/regions.txt, built by
// tools/build-regions.mjs). Used when Nominatim cannot be reached.
#include "opendives.h"

#include <cmath>
#include <fstream>
#include <limits>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

namespace opendives {

namespace {

struct Country {
	std::string en, fr;
};

struct Region {
	int country = 0;
	std::string en, fr;
	int minx = 0, miny = 0, maxx = 0, maxy = 0; // thousandths of a degree
	std::vector<std::vector<int>> rings;        // x0, y0, x1, y1, ... absolute
};

std::mutex mutex;
std::string file_path;
bool loaded = false;
std::vector<Country> countries;
std::vector<Region> regions;

std::vector<std::string> split_tabs(const std::string &line)
{
	std::vector<std::string> fields;
	size_t start = 0;
	for (;;) {
		size_t tab = line.find('\t', start);
		fields.push_back(line.substr(start, tab == std::string::npos ? std::string::npos : tab - start));
		if (tab == std::string::npos)
			return fields;
		start = tab + 1;
	}
}

void load()
{
	loaded = true;
	std::ifstream in(file_path);
	std::string line;
	while (std::getline(in, line)) {
		if (line.size() < 2 || line[1] != '\t')
			continue;
		if (line[0] == 'C') {
			auto f = split_tabs(line);
			if (f.size() >= 4)
				countries.push_back({ f[2], f[3] });
		} else if (line[0] == 'R') {
			auto f = split_tabs(line);
			if (f.size() < 8)
				continue;
			Region r;
			r.country = std::stoi(f[1]);
			r.en = f[2];
			r.fr = f[3];
			r.minx = std::stoi(f[4]);
			r.miny = std::stoi(f[5]);
			r.maxx = std::stoi(f[6]);
			r.maxy = std::stoi(f[7]);
			regions.push_back(std::move(r));
		} else if (line[0] == 'P' && !regions.empty()) {
			std::vector<int> ring;
			std::istringstream values(line.substr(2));
			std::string v;
			int x = 0, y = 0;
			for (size_t i = 0; std::getline(values, v, ','); i++) {
				int n = std::stoi(v);
				if (i % 2 == 0)
					ring.push_back(x = i < 2 ? n : x + n);
				else
					ring.push_back(y = i < 2 ? n : y + n);
			}
			regions.back().rings.push_back(std::move(ring));
		}
	}
}

// Even-odd rule over all the rings: holes need no marking.
bool contains(const Region &r, double x, double y)
{
	bool inside = false;
	for (const auto &ring: r.rings) {
		size_t n = ring.size() / 2;
		for (size_t i = 0, j = n - 1; i < n; j = i++) {
			double xi = ring[2 * i], yi = ring[2 * i + 1], xj = ring[2 * j], yj = ring[2 * j + 1];
			if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
				inside = !inside;
		}
	}
	return inside;
}

// Distance to the region's outline, in thousandths of a degree of latitude.
double distance(const Region &r, double x, double y, double xscale)
{
	double best = std::numeric_limits<double>::max();
	for (const auto &ring: r.rings) {
		size_t n = ring.size() / 2;
		for (size_t i = 0, j = n - 1; i < n; j = i++) {
			double ax = ring[2 * j] * xscale, ay = ring[2 * j + 1];
			double bx = ring[2 * i] * xscale, by = ring[2 * i + 1];
			double px = x * xscale, dx = bx - ax, dy = by - ay;
			double len = dx * dx + dy * dy;
			double t = len > 0 ? ((px - ax) * dx + (y - ay) * dy) / len : 0;
			t = t < 0 ? 0 : t > 1 ? 1 : t;
			double ex = ax + t * dx - px, ey = ay + t * dy - y;
			best = std::min(best, std::sqrt(ex * ex + ey * ey));
		}
	}
	return best;
}

} // namespace

void set_regions_file(const std::string &path)
{
	std::lock_guard<std::mutex> lock(mutex);
	file_path = path;
	loaded = false;
	countries.clear();
	regions.clear();
}

bool offline_region(int lat_udeg, int lon_udeg, const std::string &lang, std::string &country, std::string &region)
{
	std::lock_guard<std::mutex> lock(mutex);
	if (!loaded && !file_path.empty())
		load();
	double x = lon_udeg / 1000.0, y = lat_udeg / 1000.0;
	const Region *found = nullptr;
	for (const Region &r: regions) {
		if (x >= r.minx && x <= r.maxx && y >= r.miny && y <= r.maxy && contains(r, x, y)) {
			found = &r;
			break;
		}
	}
	if (!found) {
		// Dive sites are often off the coast: the nearest region within
		// 30 km (270 thousandths of a degree of latitude).
		const double reach = 270;
		double xscale = std::cos(lat_udeg / 1e6 * M_PI / 180.0);
		double degree_reach = reach / std::max(xscale, 0.1);
		double best = reach;
		for (const Region &r: regions) {
			if (x < r.minx - degree_reach || x > r.maxx + degree_reach || y < r.miny - reach || y > r.maxy + reach)
				continue;
			double d = distance(r, x, y, xscale);
			if (d < best) {
				best = d;
				found = &r;
			}
		}
	}
	if (!found || found->country < 0 || found->country >= static_cast<int>(countries.size()))
		return false;
	bool fr = lang.rfind("fr", 0) == 0;
	const Country &c = countries[found->country];
	country = fr && !c.fr.empty() ? c.fr : c.en;
	region = fr && !found->fr.empty() ? found->fr : found->en;
	return true;
}

} // namespace opendives
