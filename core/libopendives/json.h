// SPDX-License-Identifier: GPL-2.0
// Minimal JSON reader shared by the façade's source files: one flat object
// whose values are strings, integers, booleans (read as 1 or 0) or arrays of
// strings. Not part of the façade's API.
#ifndef OPENDIVES_JSON_H
#define OPENDIVES_JSON_H

#include <cctype>
#include <cstdlib>
#include <string>
#include <utility>
#include <vector>

namespace opendives::internal {

struct JsonValue {
	enum Kind { STRING, NUMBER, LIST } kind = STRING;
	std::string text;
	long number = 0;
	std::vector<std::string> list;
};

class JsonReader {
public:
	explicit JsonReader(const std::string &s) : s(s) {}

	bool object(std::vector<std::pair<std::string, JsonValue>> &out)
	{
		space();
		if (!eat('{'))
			return false;
		space();
		if (eat('}'))
			return end();
		for (;;) {
			std::string key;
			JsonValue value;
			space();
			if (!string(key))
				return false;
			space();
			if (!eat(':'))
				return false;
			space();
			if (!val(value))
				return false;
			out.emplace_back(std::move(key), std::move(value));
			space();
			if (eat(','))
				continue;
			if (eat('}'))
				return end();
			return false;
		}
	}

private:
	const std::string &s;
	size_t i = 0;

	void space()
	{
		while (i < s.size() && isspace(static_cast<unsigned char>(s[i])))
			i++;
	}
	bool eat(char c)
	{
		if (i < s.size() && s[i] == c) {
			i++;
			return true;
		}
		return false;
	}
	bool word(const char *w)
	{
		size_t n = std::char_traits<char>::length(w);
		if (s.compare(i, n, w) != 0)
			return false;
		i += n;
		return true;
	}
	bool end()
	{
		space();
		return i == s.size();
	}
	static void utf8(std::string &out, unsigned cp)
	{
		if (cp < 0x80) {
			out += static_cast<char>(cp);
		} else if (cp < 0x800) {
			out += static_cast<char>(0xC0 | (cp >> 6));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		} else if (cp < 0x10000) {
			out += static_cast<char>(0xE0 | (cp >> 12));
			out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		} else {
			out += static_cast<char>(0xF0 | (cp >> 18));
			out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
			out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
			out += static_cast<char>(0x80 | (cp & 0x3F));
		}
	}
	bool hex4(unsigned &cp)
	{
		if (i + 4 > s.size())
			return false;
		cp = 0;
		for (int k = 0; k < 4; k++) {
			char c = s[i++];
			cp <<= 4;
			if (c >= '0' && c <= '9')
				cp |= c - '0';
			else if (c >= 'a' && c <= 'f')
				cp |= c - 'a' + 10;
			else if (c >= 'A' && c <= 'F')
				cp |= c - 'A' + 10;
			else
				return false;
		}
		return true;
	}
	bool string(std::string &out)
	{
		if (!eat('"'))
			return false;
		while (i < s.size()) {
			char c = s[i++];
			if (c == '"')
				return true;
			if (c != '\\') {
				out += c;
				continue;
			}
			if (i >= s.size())
				return false;
			char e = s[i++];
			switch (e) {
			case '"': out += '"'; break;
			case '\\': out += '\\'; break;
			case '/': out += '/'; break;
			case 'b': out += '\b'; break;
			case 'f': out += '\f'; break;
			case 'n': out += '\n'; break;
			case 'r': out += '\r'; break;
			case 't': out += '\t'; break;
			case 'u': {
				unsigned cp;
				if (!hex4(cp))
					return false;
				if (cp >= 0xD800 && cp < 0xDC00 && i + 6 <= s.size() && s[i] == '\\' && s[i + 1] == 'u') {
					i += 2;
					unsigned low;
					if (!hex4(low) || low < 0xDC00 || low > 0xDFFF)
						return false;
					cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
				}
				utf8(out, cp);
				break;
			}
			default:
				return false;
			}
		}
		return false;
	}
	bool val(JsonValue &v)
	{
		if (i < s.size() && s[i] == '"') {
			v.kind = JsonValue::STRING;
			return string(v.text);
		}
		bool is_true = word("true");
		if (is_true || word("false")) {
			v.kind = JsonValue::NUMBER;
			v.number = is_true ? 1 : 0;
			return true;
		}
		if (eat('[')) {
			v.kind = JsonValue::LIST;
			space();
			if (eat(']'))
				return true;
			for (;;) {
				std::string item;
				space();
				if (!string(item))
					return false;
				v.list.push_back(std::move(item));
				space();
				if (eat(','))
					continue;
				return eat(']');
			}
		}
		size_t start = i;
		if (i < s.size() && s[i] == '-')
			i++;
		while (i < s.size() && isdigit(static_cast<unsigned char>(s[i])))
			i++;
		if (i == start || (i == start + 1 && s[start] == '-'))
			return false;
		v.kind = JsonValue::NUMBER;
		v.number = strtol(s.substr(start, i - start).c_str(), nullptr, 10);
		return true;
	}
};

} // namespace opendives::internal

#endif
