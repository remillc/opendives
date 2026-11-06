// SPDX-License-Identifier: GPL-2.0
// Subsurface cloud account creation and the divelogs.de download, without Qt.
//
// - cloud_create_account / cloud_verify_pin: port of
//   CloudStorageAuthenticate::backend() and uploadFinished()
//   (core/cloudstorage.cpp), with the email and password checks of
//   isValidEmail() / isValidPassword() and the lower-case email of
//   QMLManager::saveCloudCredentials() (mobile-widgets/qmlmanager.cpp).
// - divelogs_*: port of DivelogsDeWebServices::startDownload(),
//   listDownloadFinished(), saveToZipFile() and parseDiveLogsDeDiveList()
//   (desktop-widgets/subsurfacewebservices.cpp).
#include "opendives.h"
#include "internal.h"

#include "core/divelog.h"
#include "core/file.h"
#include "core/pref.h"
#include "core/qthelper.h"
#include "core/compat/platform_https.h"

#include <libxml/xmlreader.h>

#include <algorithm>
#include <cstdio>
#include <regex>

namespace opendives {

namespace {

void append_json_string(std::string &out, const std::string &s)
{
	out += '"';
	for (unsigned char c: s) {
		switch (c) {
		case '"': out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n"; break;
		case '\r': out += "\\r"; break;
		case '\t': out += "\\t"; break;
		default:
			if (c < 0x20) {
				char buf[8];
				snprintf(buf, sizeof(buf), "\\u%04x", c);
				out += buf;
			} else {
				out += static_cast<char>(c);
			}
		}
	}
	out += '"';
}

std::string lower(std::string s)
{
	std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
	return s;
}

// POST of "email password[ pin]" to the cloud backend, as
// CloudStorageAuthenticate::backend(); the reply is read as uploadFinished()
// reads it. Never called without the write lock's agreement.
int authenticate(const std::string &email_in, const std::string &password, const std::string &pin, std::string &json,
		 std::string &error)
{
	// "email address MUST be lower case or bad things happen" (saveCloudCredentials).
	const std::string email = lower(email_in);
	if (!cloud_valid_email(email) || !cloud_valid_password(password)) {
		error = "INVALID_CREDENTIALS";
		return -1;
	}
	if (!pin.empty() && (pin.find(' ') != std::string::npos || pin.find('\n') != std::string::npos)) {
		error = "INVALID_PIN";
		return -1;
	}
	// Creating or verifying an account writes to the cloud: the same lock as
	// every other cloud write (plan, section 4).
	if (!internal::cloud_writes_allowed_for(email)) {
		error = "WRITE_LOCKED";
		return -1;
	}
	std::string payload = email + ' ' + password;
	if (!pin.empty())
		payload += ' ' + pin;
	const std::string url = prefs.cloud_base_url + (pin.empty() ? "/storage" : "/verify");
	int status = 0;
	std::string reply;
	// The server takes about 9 s to answer (measured on the test account):
	// longer than prefs.cloud_timeout.
	if (opendives_https_post(url, subsurface_user_agent(), "text/xml, text/plain", "text/plain", payload, 30, status,
				 reply)) {
		error = "NETWORK";
		return -1;
	}
	const char *state;
	if (reply == "[VERIFIED]" || reply == "[OK]")
		state = "verified";
	else if (reply == "[VERIFY]" || reply == "Invalid PIN")
		state = "need_pin";
	else
		state = "incorrect";
	json = "{\"status\":\"";
	json += state;
	json += "\",\"http\":" + std::to_string(status) + ",\"reply\":";
	append_json_string(json, reply);
	json += '}';
	return 0;
}

// Percent-encoding of a form value: everything but the unreserved
// characters. Qt's QUrlQuery leaves some sub-delimiters as they are and keeps
// "%XX" sequences; the server decodes both forms alike. As in Subsurface,
// "+" is sent encoded (Subsurface replaces it with "%2b" by hand).
std::string form_encode(const std::string &value)
{
	static const char hex[] = "0123456789ABCDEF";
	std::string out;
	for (unsigned char c: value) {
		if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' ||
		    c == '_' || c == '~') {
			out += static_cast<char>(c);
		} else {
			out += '%';
			out += hex[c >> 4];
			out += hex[c & 15];
		}
	}
	return out;
}

// The tokens of QXmlStreamReader that parseDiveLogsDeDiveList() uses, over
// libxml2's reader: an empty element gives a start then an end, as in Qt.
class XmlStream {
public:
	explicit XmlStream(const std::string &xml)
	{
		reader = xmlReaderForMemory(xml.data(), static_cast<int>(xml.size()), nullptr, nullptr,
					    XML_PARSE_NONET | XML_PARSE_NOERROR | XML_PARSE_NOWARNING);
		if (!reader)
			failed = true;
	}
	~XmlStream()
	{
		if (reader)
			xmlFreeTextReader(reader);
	}
	XmlStream(const XmlStream &) = delete;
	XmlStream &operator=(const XmlStream &) = delete;

	enum Token { Start, End, Text, Other, Done };

	Token next()
	{
		if (pending_end) {
			pending_end = false;
			return End;
		}
		if (failed)
			return Done;
		int ret = xmlTextReaderRead(reader);
		if (ret < 0) {
			failed = true;
			return Done;
		}
		if (ret == 0)
			return Done;
		switch (xmlTextReaderNodeType(reader)) {
		case XML_READER_TYPE_ELEMENT:
			name = reinterpret_cast<const char *>(xmlTextReaderConstName(reader));
			attributes.clear();
			while (xmlTextReaderMoveToNextAttribute(reader) == 1)
				attributes.emplace_back(reinterpret_cast<const char *>(xmlTextReaderConstName(reader)),
							reinterpret_cast<const char *>(xmlTextReaderConstValue(reader)));
			xmlTextReaderMoveToElement(reader);
			pending_end = xmlTextReaderIsEmptyElement(reader) == 1;
			return Start;
		case XML_READER_TYPE_END_ELEMENT:
			return End;
		case XML_READER_TYPE_TEXT:
		case XML_READER_TYPE_CDATA:
		case XML_READER_TYPE_SIGNIFICANT_WHITESPACE:
		case XML_READER_TYPE_WHITESPACE: {
			const xmlChar *v = xmlTextReaderConstValue(reader);
			text = v ? reinterpret_cast<const char *>(v) : "";
			return Text;
		}
		default:
			return Other;
		}
	}

	// QXmlStreamReader::readNextStartElement().
	bool read_next_start_element()
	{
		for (;;) {
			Token t = next();
			if (t == Start)
				return true;
			if (t == End || t == Done)
				return false;
		}
	}

	// QXmlStreamReader::readElementText(), on a start element.
	std::string read_element_text()
	{
		std::string out;
		int depth = 1;
		while (depth > 0) {
			Token t = next();
			if (t == Done)
				break;
			if (t == Start)
				depth++;
			else if (t == End)
				depth--;
			else if (t == Text && depth == 1)
				out += text;
		}
		return out;
	}

	// QXmlStreamReader::skipCurrentElement().
	void skip_current_element()
	{
		int depth = 1;
		while (depth > 0) {
			Token t = next();
			if (t == Done)
				break;
			depth += t == Start ? 1 : t == End ? -1 : 0;
		}
	}

	std::string attribute(const std::string &key) const
	{
		for (const auto &[k, v]: attributes)
			if (k == key)
				return v;
		return std::string();
	}

	bool has_error() const { return failed; }
	std::string name;

private:
	xmlTextReaderPtr reader = nullptr;
	bool failed = false;
	bool pending_end = false;
	std::string text;
	std::vector<std::pair<std::string, std::string>> attributes;
};

} // namespace

bool cloud_valid_email(const std::string &email)
{
	// Max overall length per RFC 5321
	if (email.size() > 254)
		return false;
	// Local part (before @) max 64 characters per RFC 5321
	size_t at = email.find('@');
	if (at != std::string::npos && at > 64)
		return false;
	static const std::regex pattern("^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.+_-]+\\.[a-zA-Z0-9+_-]{2,}$");
	return std::regex_match(email, pattern);
}

bool cloud_valid_password(const std::string &password)
{
	if (password.empty())
		return false;
	static const std::regex pattern("^[a-zA-Z0-9@.+_-]+$");
	return std::regex_match(password, pattern);
}

int cloud_create_account(const std::string &email, const std::string &password, std::string &json, std::string &error)
{
	return authenticate(email, password, std::string(), json, error);
}

int cloud_verify_pin(const std::string &email, const std::string &password, const std::string &pin, std::string &json,
		     std::string &error)
{
	if (pin.empty()) {
		error = "INVALID_PIN";
		return -1;
	}
	return authenticate(email, password, pin, json, error);
}

std::string divelogs_request_body(const std::string &user, const std::string &password, const std::string &ids)
{
	std::string body = "user=" + form_encode(user) + "&pass=" + form_encode(password);
	if (!ids.empty())
		body += "&ids=" + form_encode(ids);
	return body;
}

divelogs_list divelogs_parse_list(const std::string &xml)
{
	/* XML format seems to be:
	 * <DiveDateReader version="1.0">
	 *   <DiveDates>
	 *     <date diveLogsId="nnn" lastModified="YYYY-MM-DD hh:mm:ss">DD.MM.YYYY hh:mm</date>
	 *     [repeat <date></date>]
	 *   </DiveDates>
	 * </DiveDateReader>
	 */
	XmlStream reader(xml);
	const std::string invalid_xml = "INVALID_RESPONSE";
	bool seen_dive_dates = false;
	divelogs_list result;

	if (reader.read_next_start_element() && reader.name != "DiveDateReader") {
		result.error = invalid_xml;
		result.details = "Expected XML tag 'DiveDateReader', got instead '" + reader.name + "'";
		goto out;
	}

	while (reader.read_next_start_element()) {
		if (reader.name != "DiveDates") {
			if (reader.name == "Login") {
				std::string status = reader.read_element_text();
				// Note: there has to be a better way to determine a successful login...
				if (status == "failed") {
					result.error = "LOGIN_FAILED";
					goto out;
				}
			}
			continue;
		}

		// process <DiveDates>
		seen_dive_dates = true;
		while (reader.read_next_start_element()) {
			if (reader.name != "date")
				continue;
			std::string id = reader.attribute("divelogsId");
			if (!id.empty()) {
				result.ids += id;
				result.ids += ',';
				++result.count;
			}
			reader.skip_current_element();
		}
	}

	// chop the ending comma, if any
	if (!result.ids.empty())
		result.ids.pop_back();

	if (!seen_dive_dates) {
		result.error = invalid_xml;
		result.details = "Expected XML tag 'DiveDates' not found";
	}

out:
	if (reader.has_error()) {
		// if there was an XML error, overwrite the result or other error conditions
		result.error = invalid_xml;
		result.details = "Malformed XML response";
	}
	return result;
}

int import_count(const std::string &path, std::string &json, std::string &error)
{
	struct divelog log;
	if (parse_file(path.c_str(), &log)) {
		error = "IMPORT_FAILED";
		return -1;
	}
	json = "{\"dives\":" + std::to_string(log.dives.size()) + '}';
	return 0;
}

// The list of dives of `user` (DivelogsDeWebServices::startDownload() and
// listDownloadFinished()); `list.error` set on failure.
static divelogs_list divelogs_fetch_list(const std::string &user, const std::string &password)
{
	divelogs_list list;
	if (user.empty() || password.empty()) {
		list.error = "INVALID_CREDENTIALS";
		return list;
	}
	int status = 0;
	std::string reply;
	if (opendives_https_post("https://divelogs.de/xml_available_dives.php", subsurface_user_agent(),
				 "text/xml, application/xml", "application/x-www-form-urlencoded",
				 divelogs_request_body(user, password, std::string()), 30, status, reply)) {
		list.error = "NETWORK";
		return list;
	}
	return divelogs_parse_list(reply);
}

int divelogs_check(const std::string &user, const std::string &password, std::string &json, std::string &error)
{
	divelogs_list list = divelogs_fetch_list(user, password);
	if (!list.error.empty()) {
		error = list.error;
		return -1;
	}
	json = "{\"dives\":" + std::to_string(list.count) + '}';
	return 0;
}

int divelogs_download(const std::string &user, const std::string &password, const std::string &out_path,
		      std::string &json, std::string &error)
{
	divelogs_list list = divelogs_fetch_list(user, password);
	if (!list.error.empty()) {
		error = list.error;
		return -1;
	}
	int status = 0;
	std::string reply;
	if (list.count == 0) {
		json = "{\"dives\":0}";
		return 0;
	}
	if (opendives_https_post("https://divelogs.de/DivelogsDirectExport.php", subsurface_user_agent(),
				 "application/zip, */*", "application/x-www-form-urlencoded",
				 divelogs_request_body(user, password, list.ids), 30, status, reply)) {
		error = "NETWORK";
		return -1;
	}
	if (status != 200 || reply.size() < 4 || reply.compare(0, 2, "PK") != 0) {
		// Subsurface opens the reply as a zip archive and stops if it cannot.
		error = "INVALID_ARCHIVE";
		return -1;
	}
	FILE *f = fopen(out_path.c_str(), "wb");
	if (!f || fwrite(reply.data(), 1, reply.size(), f) != reply.size()) {
		if (f)
			fclose(f);
		error = "WRITE_FAILED";
		return -1;
	}
	fclose(f);
	json = "{\"dives\":" + std::to_string(list.count) + ",\"bytes\":" + std::to_string(reply.size()) + '}';
	return 0;
}

} // namespace opendives
