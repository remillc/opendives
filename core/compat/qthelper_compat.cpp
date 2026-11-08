// SPDX-License-Identifier: GPL-2.0
//
// OpenDives — portable replacements for the Qt-based helpers that the
// Subsurface core calls (qthelper.cpp, string-format.cpp, gettextfromc.cpp,
// metadata.cpp, bluetoothaddress.cpp, checkcloudconnection.cpp, ...).
//
// The Subsurface sources are compiled unmodified; only these helpers are
// reimplemented in standard C++. Anything that affects data written to the
// log (GPS coordinate strings, stylesheets) is ported faithfully; UI-only
// helpers are kept minimal.

#include "core/dive.h"
#include "core/divelog.h"
#include "core/errorhelper.h"
#include "core/git-access.h"
#include "core/metadata.h"
#include "core/pref.h"
#include "core/qthelper.h"
#include "core/string-format.h"
#include "core/units.h"
#include "core/file.h"
#include "commands/command.h"
#include "commands/command.h"

#include <libxslt/xsltutils.h>
#include <libxslt/transform.h>
#include <libxslt/documents.h>
#include "ssrf-version.h"
#include <libxml/parser.h>

#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <string>
#include <sys/stat.h>
#include <filesystem>

#ifndef SUBSURFACE_SOURCE
#error "SUBSURFACE_SOURCE must point to the Subsurface source tree (for xslt/)"
#endif

std::string existing_filename;

// --- gettextfromc.cpp: no translation in the POC -------------------------
const char *trGettext(const char *text)
{
	return text;
}

// --- string-format.cpp ---------------------------------------------------
QString get_depth_unit()
{
	return QString(prefs.units.length == units::METERS ? "m" : "ft");
}

QString get_weight_unit()
{
	return QString(prefs.units.weight == units::KG ? "kg" : "lbs");
}

QString get_temp_unit()
{
	return QString(prefs.units.temperature == units::CELSIUS ? "°C" : "°F");
}

QString get_volume_unit()
{
	return QString(prefs.units.volume == units::LITER ? "L" : "cuft");
}

QString formatDayOfWeek(int day)
{
	static const char *const names[] = {
		"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
	};
	return QString(day >= 0 && day < 7 ? names[day] : "");
}

// Faithful port of printGPSCoords() (string-format.cpp).
std::string printGPSCoordsC(const location_t *location)
{
	int lat = location->lat.udeg;
	int lon = location->lon.udeg;
	char buf[128];

	if (!has_location(location))
		return std::string();

	if (prefs.coordinates_traditional) {
		const char *lath = lat >= 0 ? "N" : "S";
		const char *lonh = lon >= 0 ? "E" : "W";
		lat = abs(lat);
		lon = abs(lon);
		unsigned int latdeg = lat / 1000000U;
		unsigned int londeg = lon / 1000000U;
		unsigned int latmin = (lat % 1000000U) * 60U;
		unsigned int lonmin = (lon % 1000000U) * 60U;
		double latsec = (latmin % 1000000) * 60;
		double lonsec = (lonmin % 1000000) * 60;
		snprintf(buf, sizeof(buf), "%u°%02d\'%06.3f\"%s %u°%02d\'%06.3f\"%s",
			 latdeg, latmin / 1000000, latsec / 1000000, lath,
			 londeg, lonmin / 1000000, lonsec / 1000000, lonh);
	} else {
		snprintf(buf, sizeof(buf), "%f %f", (double)lat / 1000000.0, (double)lon / 1000000.0);
	}
	return std::string(buf);
}

std::string get_dive_date_c_string(timestamp_t when)
{
	// Only used in libdivecomputer log messages.
	time_t t = (time_t)when;
	struct tm tm;
	gmtime_r(&t, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M", &tm);
	return std::string(buf);
}

// --- qthelper.cpp --------------------------------------------------------
std::string get_current_date()
{
	time_t now = time(nullptr);
	struct tm tm;
	localtime_r(&now, &tm);
	char buf[32];
	strftime(buf, sizeof(buf), "%Y-%m-%d", &tm);
	return std::string(buf);
}

std::string subsurface_user_agent()
{
	return "OpenDives-POC/0.0.1 (Subsurface core " CANONICAL_VERSION_STRING ")";
}

timestamp_t dateTimeToTimestamp(const QDateTime &t)
{
	return t.toSecsSinceEpoch();
}

// Accepts "YYYY-MM-DDTHH:MM:SS" with optional "Z" (Qt::ISODate subset).
time_t get_dive_datetime_from_isostring(const char *when)
{
	struct tm tm = {};
	int y, mo, d, h = 0, mi = 0, s = 0;
	if (!when || sscanf(when, "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &s) < 3)
		return 0;
	tm.tm_year = y - 1900;
	tm.tm_mon = mo - 1;
	tm.tm_mday = d;
	tm.tm_hour = h;
	tm.tm_min = mi;
	tm.tm_sec = s;
	return timegm(&tm);
}

std::string move_away(const std::string &old_path)
{
	namespace fs = std::filesystem;
	std::string newPath;
	int i = 0;
	do {
		newPath = old_path + "." + std::to_string(++i);
	} while (fs::exists(newPath));
	std::error_code ec;
	fs::rename(old_path, newPath, ec);
	if (ec) {
		report_info("rename of %s to %s failed", old_path.c_str(), newPath.c_str());
		return std::string();
	}
	return newPath;
}

void subsurface_mkdir(const char *dir)
{
	std::error_code ec;
	std::filesystem::create_directories(dir, ec);
	if (ec)
		report_info("failed to create path %s", dir);
}

void emit_reset_signal()
{
}

void uiNotification(const QString &msg)
{
	report_info("%s", msg.toStdString().c_str());
}

// Stylesheets are read from a directory instead of Qt resources: the
// Subsurface tree of the build, or where the app copied them on the device
// (opendives::set_xslt_dir).
namespace opendives_compat {
std::string xslt_dir = SUBSURFACE_SOURCE "/xslt/";
}

static xmlDocPtr get_stylesheet_doc(const xmlChar *uri, xmlDictPtr, int, void *, xsltLoadType)
{
	// A stylesheet's xsl:include comes resolved against its own path: absolute.
	std::string name = (const char *)uri;
	std::string filename = name.rfind('/', 0) == 0 ? name : opendives_compat::xslt_dir + name;
	return xmlParseFile(filename.c_str());
}

xsltStylesheetPtr get_stylesheet(const char *name)
{
	xsltSetLoaderFunc(get_stylesheet_doc);
	xmlDocPtr doc = get_stylesheet_doc((const xmlChar *)name, NULL, 0, NULL, XSLT_LOAD_START);
	if (!doc)
		return NULL;
	xsltStylesheetPtr xslt = xsltParseStylesheetDoc(doc);
	if (!xslt) {
		xmlFreeDoc(doc);
		return NULL;
	}
	return xslt;
}

// --- checkcloudconnection.cpp: see cloud_compat.cpp ----------------------

// --- metadata.cpp (photo EXIF/video metadata): handled by the app layer ---
enum mediatype_t get_metadata(const char *, struct metadata *data)
{
	data->timestamp = 0;
	data->duration.seconds = 0;
	data->location = location_t();
	return MEDIATYPE_UNKNOWN;
}

// --- bluetoothaddress.cpp: ported in bluetooth_compat.cpp ----------------

// --- import-suunto-json.cpp (Qt JSON): not part of the POC ---------------
int suunto_json_import(const std::string &, const std::string &, struct divelog *)
{
	return report_error("Suunto JSON import is not available in this build");
}

// --- commands/command.cpp: undo stack lives in the app layer -------------
namespace opendives_compat {
std::string (*changes_made_hook)() = nullptr;
}

namespace Command {
std::string changesMade()
{
	return opendives_compat::changes_made_hook ? opendives_compat::changes_made_hook() : std::string();
}
}

// --- qthelper.cpp: Seabear CSV header parsing (not part of the POC) ------
void parse_seabear_header(const char *, struct xml_params *)
{
}
