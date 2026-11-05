// SPDX-License-Identifier: GPL-2.0
// OpenDives compat layer: minimal, Qt-free stand-ins for the Qt types that
// Subsurface's core code uses. Subsurface's own sources are compiled unchanged
// against these headers; no Qt library is linked.
//
// QString stores UTF-32 code points, so indices behave like Qt's for text in
// the Basic Multilingual Plane. Locale-aware formatting is reduced to the "C"
// locale: OpenDives formats numbers and dates for display in its interface.
#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <cwctype>
#include <functional>
#include <memory>
#include <mutex>
#include <numeric>
#include <regex>
#include <string>
#include <utility>
#include <vector>

#define QT_VERSION 0x060a00
#define QT_VERSION_CHECK(a, b, c) (((a) << 16) | ((b) << 8) | (c))
#define Q_DECLARE_METATYPE(T)
#define Q_OBJECT
#define Q_PROPERTY(...)
#define QT_TRANSLATE_NOOP(ctx, s) s
#define QT_TRANSLATE_NOOP3(ctx, s, comment) { s, comment }
#define QStringLiteral(s) QString(s)
#define signals public
#define slots
#define emit

namespace Qt {
enum SplitBehavior { KeepEmptyParts, SkipEmptyParts };
enum CaseSensitivity { CaseInsensitive, CaseSensitive };
}

namespace qtshim {
inline std::u32string from_utf8(const char *s, size_t n)
{
	std::u32string out;
	out.reserve(n);
	for (size_t i = 0; i < n;) {
		unsigned char c = (unsigned char)s[i];
		char32_t cp;
		int len;
		if (c < 0x80) { cp = c; len = 1; }
		else if ((c >> 5) == 0x6) { cp = c & 0x1f; len = 2; }
		else if ((c >> 4) == 0xe) { cp = c & 0x0f; len = 3; }
		else if ((c >> 3) == 0x1e) { cp = c & 0x07; len = 4; }
		else { out.push_back(0xfffd); ++i; continue; }
		if (i + len > n) { out.push_back(0xfffd); break; }
		for (int k = 1; k < len; ++k)
			cp = (cp << 6) | ((unsigned char)s[i + k] & 0x3f);
		out.push_back(cp);
		i += len;
	}
	return out;
}
inline std::string to_utf8(const std::u32string &s)
{
	std::string out;
	out.reserve(s.size());
	for (char32_t cp: s) {
		if (cp < 0x80) out.push_back((char)cp);
		else if (cp < 0x800) { out.push_back((char)(0xc0 | (cp >> 6))); out.push_back((char)(0x80 | (cp & 0x3f))); }
		else if (cp < 0x10000) { out.push_back((char)(0xe0 | (cp >> 12))); out.push_back((char)(0x80 | ((cp >> 6) & 0x3f))); out.push_back((char)(0x80 | (cp & 0x3f))); }
		else { out.push_back((char)(0xf0 | (cp >> 18))); out.push_back((char)(0x80 | ((cp >> 12) & 0x3f))); out.push_back((char)(0x80 | ((cp >> 6) & 0x3f))); out.push_back((char)(0x80 | (cp & 0x3f))); }
	}
	return out;
}
inline char32_t upper(char32_t c) { return (char32_t)std::towupper((wint_t)c); }
inline char32_t lower(char32_t c) { return (char32_t)std::towlower((wint_t)c); }
}

class QChar {
public:
	QChar() = default;
	QChar(char c) : c_((unsigned char)c) {}
	QChar(int c) : c_((char32_t)c) {}
	QChar(char32_t c) : c_(c) {}
	QChar(unsigned int c) : c_((char32_t)c) {}
	char32_t unicode() const { return c_; }
	bool isSpace() const { return std::iswspace((wint_t)c_); }
	bool isPunct() const { return std::iswpunct((wint_t)c_); }
	bool isDigit() const { return c_ >= '0' && c_ <= '9'; }
	bool isLetterOrNumber() const { return std::iswalnum((wint_t)c_); }
	QChar toUpper() const { return QChar(qtshim::upper(c_)); }
	QChar toLower() const { return QChar(qtshim::lower(c_)); }
	char toLatin1() const { return c_ < 256 ? (char)c_ : '?'; }
	bool operator==(QChar o) const { return c_ == o.c_; }
	bool operator!=(QChar o) const { return c_ != o.c_; }
private:
	char32_t c_ = 0;
};

class QByteArray {
public:
	QByteArray() = default;
	QByteArray(const char *s, int n = -1) : d_(s ? std::string(s, n < 0 ? strlen(s) : (size_t)n) : std::string()) {}
	explicit QByteArray(const std::string &s) : d_(s) {}
	int size() const { return (int)d_.size(); }
	bool isEmpty() const { return d_.empty(); }
	const char *constData() const { return d_.c_str(); }
	const char *data() const { return d_.c_str(); }
	char *data() { return d_.data(); }
	std::string toStdString() const { return d_; }
	static QByteArray fromHex(const char *hex)
	{
		QByteArray r;
		auto val = [](char c) -> int {
			if (c >= '0' && c <= '9') return c - '0';
			if (c >= 'a' && c <= 'f') return c - 'a' + 10;
			if (c >= 'A' && c <= 'F') return c - 'A' + 10;
			return -1;
		};
		int hi = -1;
		for (const char *p = hex; p && *p; ++p) {
			int v = val(*p);
			if (v < 0) continue;
			if (hi < 0) hi = v;
			else { r.d_.push_back((char)((hi << 4) | v)); hi = -1; }
		}
		return r;
	}
private:
	std::string d_;
};

class QStringList;
class QRegularExpression;

class QString {
public:
	enum NormalizationForm { NormalizationForm_D, NormalizationForm_C, NormalizationForm_KD, NormalizationForm_KC };
	QString() = default;
	QString(const char *s) : s_(s ? qtshim::from_utf8(s, strlen(s)) : std::u32string()) {}
	QString(QChar c) : s_(1, c.unicode()) {}
	QString(int n, QChar c) : s_((size_t)std::max(n, 0), c.unicode()) {}
	static QString fromStdString(const std::string &s) { QString q; q.s_ = qtshim::from_utf8(s.data(), s.size()); return q; }
	static QString fromUtf8(const char *s, int n = -1) { QString q; if (s) q.s_ = qtshim::from_utf8(s, n < 0 ? strlen(s) : (size_t)n); return q; }
	static QString fromUtf8(const QByteArray &b) { return fromUtf8(b.constData(), b.size()); }
	static QString fromLatin1(const char *s, int n = -1) { QString q; if (s) { size_t len = n < 0 ? strlen(s) : (size_t)n; for (size_t i = 0; i < len; ++i) q.s_.push_back((unsigned char)s[i]); } return q; }
	static QString fromWCharArray(const wchar_t *s, int n = -1) { QString q; if (s) { size_t len = n < 0 ? wcslen(s) : (size_t)n; for (size_t i = 0; i < len; ++i) q.s_.push_back((char32_t)s[i]); } return q; }
	static QString number(long long n, int base = 10) { return QString().arg(n, 0, base); }
	static QString number(int n, int base = 10) { return number((long long)n, base); }
	static QString number(double d, char fmt = 'g', int prec = 6) { return QString("%1").arg(d, 0, fmt, prec); }

	std::string toStdString() const { return qtshim::to_utf8(s_); }
	QByteArray toUtf8() const { return QByteArray(toStdString()); }
	QByteArray toLatin1() const { std::string r; for (char32_t c: s_) r.push_back(c < 256 ? (char)c : '?'); return QByteArray(r); }
	QByteArray toLocal8Bit() const { return toUtf8(); }

	bool isEmpty() const { return s_.empty(); }
	bool isNull() const { return s_.empty(); }
	int size() const { return (int)s_.size(); }
	int length() const { return size(); }
	int count() const { return size(); }
	void clear() { s_.clear(); }
	void resize(int n, QChar fill = QChar(' ')) { s_.resize((size_t)std::max(n, 0), fill.unicode()); }
	QChar at(int i) const { return (i >= 0 && i < size()) ? QChar(s_[(size_t)i]) : QChar(); }
	QChar operator[](int i) const { return at(i); }
	QString left(int n) const { QString q; q.s_ = s_.substr(0, (size_t)std::max(n, 0)); return q; }
	QString right(int n) const { QString q; size_t k = (size_t)std::clamp(n, 0, size()); q.s_ = s_.substr(s_.size() - k); return q; }
	QString mid(int pos, int n = -1) const
	{
		QString q;
		if (pos < 0 || pos >= size()) return q;
		q.s_ = s_.substr((size_t)pos, n < 0 ? std::u32string::npos : (size_t)n);
		return q;
	}
	QString leftJustified(int width, QChar fill = QChar(' '), bool truncate = false) const
	{
		QString q = *this;
		if (q.size() < width) q.s_.append((size_t)(width - q.size()), fill.unicode());
		else if (truncate) q.s_.resize((size_t)width);
		return q;
	}
	QString rightJustified(int width, QChar fill = QChar(' '), bool truncate = false) const
	{
		QString q = *this;
		if (q.size() < width) q.s_.insert(0, (size_t)(width - q.size()), fill.unicode());
		else if (truncate) q.s_.resize((size_t)width);
		return q;
	}
	QString toUpper() const { QString q = *this; for (auto &c: q.s_) c = qtshim::upper(c); return q; }
	QString toLower() const { QString q = *this; for (auto &c: q.s_) c = qtshim::lower(c); return q; }
	QString normalized(NormalizationForm) const { return *this; } // see note at the top of this file
	QString trimmed() const
	{
		size_t b = 0, e = s_.size();
		while (b < e && std::iswspace((wint_t)s_[b])) ++b;
		while (e > b && std::iswspace((wint_t)s_[e - 1])) --e;
		QString q; q.s_ = s_.substr(b, e - b); return q;
	}
	QString simplified() const
	{
		QString q; bool space = false;
		for (char32_t c: trimmed().s_) {
			if (std::iswspace((wint_t)c)) { space = true; continue; }
			if (space) q.s_.push_back(' ');
			space = false; q.s_.push_back(c);
		}
		return q;
	}

	static std::u32string fold(const std::u32string &s, Qt::CaseSensitivity cs)
	{
		if (cs == Qt::CaseSensitive) return s;
		std::u32string r = s; for (auto &c: r) c = qtshim::lower(c); return r;
	}
	int indexOf(const QString &s, int from = 0, Qt::CaseSensitivity cs = Qt::CaseSensitive) const
	{
		size_t p = fold(s_, cs).find(fold(s.s_, cs), (size_t)std::max(from, 0));
		return p == std::u32string::npos ? -1 : (int)p;
	}
	int indexOf(QChar c, int from = 0) const { return indexOf(QString(c), from); }
	bool contains(const QString &s, Qt::CaseSensitivity cs = Qt::CaseSensitive) const { return indexOf(s, 0, cs) >= 0; }
	bool contains(QChar c) const { return indexOf(c) >= 0; }
	bool startsWith(const QString &s, Qt::CaseSensitivity cs = Qt::CaseSensitive) const { return s.size() <= size() && fold(s_.substr(0, s.s_.size()), cs) == fold(s.s_, cs); }
	bool endsWith(const QString &s, Qt::CaseSensitivity cs = Qt::CaseSensitive) const { return s.size() <= size() && fold(s_.substr(s_.size() - s.s_.size()), cs) == fold(s.s_, cs); }
	int compare(const QString &o, Qt::CaseSensitivity cs = Qt::CaseSensitive) const { return fold(s_, cs).compare(fold(o.s_, cs)); }

	inline QStringList split(const QString &sep, Qt::SplitBehavior b = Qt::KeepEmptyParts) const;
	inline QStringList split(QChar sep, Qt::SplitBehavior b = Qt::KeepEmptyParts) const;
	inline QStringList split(char sep, Qt::SplitBehavior b = Qt::KeepEmptyParts) const;

	QString &replace(const QString &before, const QString &after, Qt::CaseSensitivity cs = Qt::CaseSensitive)
	{
		if (before.isEmpty()) return *this;
		std::u32string out; int pos = 0, hit;
		while ((hit = indexOf(before, pos, cs)) >= 0) {
			out.append(s_, (size_t)pos, (size_t)(hit - pos)); out.append(after.s_);
			pos = hit + before.size();
		}
		out.append(s_, (size_t)pos, std::u32string::npos); s_ = out; return *this;
	}
	QString &replace(QChar before, QChar after) { for (auto &c: s_) if (c == before.unicode()) c = after.unicode(); return *this; }
	inline QString &replace(const QRegularExpression &re, const QString &after);
	QString &append(const QString &o) { s_ += o.s_; return *this; }
	QString &append(QChar c) { s_.push_back(c.unicode()); return *this; }
	QString &prepend(const QString &o) { s_ = o.s_ + s_; return *this; }
	QString &operator+=(const QString &o) { return append(o); }
	QString &operator+=(QChar c) { return append(c); }
	QString &operator+=(char c) { return append(QChar(c)); }
	QString &operator+=(const char *c) { return append(QString(c)); }

	int toInt(bool *ok = nullptr, int base = 10) const
	{
		std::string t = trimmed().toStdString(); char *end = nullptr;
		long v = strtol(t.c_str(), &end, base);
		bool good = !t.empty() && end && *end == '\0';
		if (ok) *ok = good;
		return good ? (int)v : 0;
	}
	long long toLongLong(bool *ok = nullptr, int base = 10) const
	{
		std::string t = trimmed().toStdString(); char *end = nullptr;
		long long v = strtoll(t.c_str(), &end, base);
		bool good = !t.empty() && end && *end == '\0';
		if (ok) *ok = good;
		return good ? v : 0;
	}
	double toDouble(bool *ok = nullptr) const
	{
		std::string t = trimmed().toStdString(); char *end = nullptr;
		double v = strtod(t.c_str(), &end);
		bool good = !t.empty() && end && *end == '\0';
		if (ok) *ok = good;
		return good ? v : 0.0;
	}

	// arg(): replaces the lowest-numbered %N (or %LN) marker, like Qt.
	QString arg(const QString &a, int fieldWidth = 0, QChar fill = QChar(' ')) const { return substitute(pad(a, fieldWidth, fill)); }
	QString arg(const char *a) const { return arg(QString(a)); }
	QString arg(const std::string &a) const { return arg(QString::fromStdString(a)); }
	QString arg(const QString &a1, const QString &a2) const { return arg(a1).arg(a2); }
	QString arg(const QString &a1, const QString &a2, const QString &a3) const { return arg(a1).arg(a2).arg(a3); }
	QString arg(QChar c) const { return arg(QString(c)); }
	QString arg(char c) const { return arg(QString(QChar(c))); }
	QString arg(long long v, int fieldWidth = 0, int base = 10, QChar fill = QChar(' ')) const
	{
		bool neg = v < 0; unsigned long long u = neg ? 0ULL - (unsigned long long)v : (unsigned long long)v;
		std::string digits;
		do { int d = (int)(u % (unsigned)base); digits.insert(digits.begin(), (char)(d < 10 ? '0' + d : 'a' + d - 10)); u /= (unsigned)base; } while (u);
		QString s = QString(digits.c_str());
		if (fill.unicode() == '0' && fieldWidth > 0) { s = s.rightJustified(fieldWidth - (neg ? 1 : 0), fill); if (neg) s.prepend(QString("-")); return substitute(s); }
		if (neg) s.prepend(QString("-"));
		return substitute(pad(s, fieldWidth, fill));
	}
	QString arg(unsigned long long v, int fieldWidth = 0, int base = 10, QChar fill = QChar(' ')) const { return arg((long long)v, fieldWidth, base, fill); }
	QString arg(long v, int fieldWidth = 0, int base = 10, QChar fill = QChar(' ')) const { return arg((long long)v, fieldWidth, base, fill); }
	QString arg(unsigned long v, int fieldWidth = 0, int base = 10, QChar fill = QChar(' ')) const { return arg((long long)v, fieldWidth, base, fill); }
	QString arg(int v, int fieldWidth = 0, int base = 10, QChar fill = QChar(' ')) const { return arg((long long)v, fieldWidth, base, fill); }
	QString arg(unsigned int v, int fieldWidth = 0, int base = 10, QChar fill = QChar(' ')) const { return arg((long long)v, fieldWidth, base, fill); }
	QString arg(double v, int fieldWidth = 0, char fmt = 'g', int prec = -1, QChar fill = QChar(' ')) const
	{
		char spec[16]; char buf[512];
		if (prec < 0) prec = 6;
		snprintf(spec, sizeof(spec), "%%.%d%c", prec, fmt);
		snprintf(buf, sizeof(buf), spec, v);
		QString s(buf);
		if (fill.unicode() == '0' && fieldWidth > 0) {
			bool neg = !s.isEmpty() && s.at(0) == QChar('-');
			if (neg) s = s.mid(1);
			s = s.rightJustified(fieldWidth - (neg ? 1 : 0), fill);
			if (neg) s.prepend(QString("-"));
			return substitute(s);
		}
		return substitute(pad(s, fieldWidth, fill));
	}

	bool operator==(const QString &o) const { return s_ == o.s_; }
	bool operator!=(const QString &o) const { return s_ != o.s_; }
	bool operator<(const QString &o) const { return s_ < o.s_; }
	bool operator==(const char *o) const { return *this == QString(o); }
	bool operator!=(const char *o) const { return *this != QString(o); }
	friend QString operator+(QString a, const QString &b) { a.s_ += b.s_; return a; }
	friend QString operator+(QString a, const char *b) { return a + QString(b); }
	friend QString operator+(const char *a, const QString &b) { return QString(a) + b; }
	friend QString operator+(QString a, QChar b) { a.s_.push_back(b.unicode()); return a; }
	friend QString operator+(QChar a, const QString &b) { return QString(a) + b; }
	friend QString operator+(char a, const QString &b) { return QString(QChar(a)) + b; }
	friend QString operator+(QString a, char b) { return a + QChar(b); }

private:
	static QString pad(const QString &s, int fieldWidth, QChar fill)
	{
		if (fieldWidth > 0) return s.rightJustified(fieldWidth, fill);
		if (fieldWidth < 0) return s.leftJustified(-fieldWidth, fill);
		return s;
	}
	QString substitute(const QString &value) const
	{
		int best = 100, bestPos = -1, bestLen = 0;
		for (int i = 0; i + 1 < size(); ++i) {
			if (s_[(size_t)i] != '%') continue;
			int j = i + 1;
			if (j < size() && s_[(size_t)j] == 'L') ++j;
			int n = 0, k = j;
			while (k < size() && k - j < 2 && s_[(size_t)k] >= '0' && s_[(size_t)k] <= '9') n = n * 10 + (int)(s_[(size_t)k++] - '0');
			if (k == j || n == 0) continue;
			if (n < best) { best = n; bestPos = i; bestLen = k - i; }
		}
		if (bestPos < 0) return *this;
		QString r; r.s_ = s_; r.s_.replace((size_t)bestPos, (size_t)bestLen, value.s_);
		// Qt replaces every occurrence of the lowest marker
		QString marker; marker.s_ = s_.substr((size_t)bestPos, (size_t)bestLen);
		return r.replace(marker, value);
	}
	std::u32string s_;
	friend class QRegularExpression;
};

class QStringList : public std::vector<QString> {
public:
	using std::vector<QString>::vector;
	QStringList() = default;
	QStringList(std::initializer_list<QString> l) : std::vector<QString>(l) {}
	bool isEmpty() const { return empty(); }
	int count() const { return (int)size(); }
	int length() const { return (int)size(); }
	void append(const QString &s) { push_back(s); }
	void append(const QStringList &l) { insert(end(), l.begin(), l.end()); }
	QStringList &operator<<(const QString &s) { push_back(s); return *this; }
	bool contains(const QString &s, Qt::CaseSensitivity cs = Qt::CaseSensitive) const
	{
		return std::any_of(begin(), end(), [&](const QString &x) { return x.compare(s, cs) == 0; });
	}
	QString join(const QString &sep) const
	{
		QString r;
		for (size_t i = 0; i < size(); ++i) { if (i) r += sep; r += (*this)[i]; }
		return r;
	}
	QString join(QChar sep) const { return join(QString(sep)); }
	const QString &first() const { return front(); }
	const QString &last() const { return back(); }
	QString value(int i) const { return i >= 0 && i < (int)size() ? (*this)[(size_t)i] : QString(); }
};

inline QStringList QString::split(const QString &sep, Qt::SplitBehavior b) const
{
	QStringList r; int pos = 0, hit;
	if (sep.isEmpty()) { r.push_back(*this); return r; }
	while ((hit = indexOf(sep, pos)) >= 0) {
		QString part = mid(pos, hit - pos);
		if (b == Qt::KeepEmptyParts || !part.isEmpty()) r.push_back(part);
		pos = hit + sep.size();
	}
	QString part = mid(pos);
	if (b == Qt::KeepEmptyParts || !part.isEmpty()) r.push_back(part);
	return r;
}
inline QStringList QString::split(QChar sep, Qt::SplitBehavior b) const { return split(QString(sep), b); }
inline QStringList QString::split(char sep, Qt::SplitBehavior b) const { return split(QString(QChar(sep)), b); }

class QRegularExpression {
public:
	QRegularExpression(const char *p) : re_(p) {}
	QRegularExpression(const QString &p) : re_(p.toStdString()) {}
	const std::regex &re() const { return re_; }
private:
	std::regex re_;
};
inline QString &QString::replace(const QRegularExpression &re, const QString &after)
{
	*this = QString::fromStdString(std::regex_replace(toStdString(), re.re(), after.toStdString()));
	return *this;
}

template <typename A, typename B> using QPair = std::pair<A, B>;
template <typename T> using QVector = std::vector<T>;
using QMutex = std::mutex;

class QDate {
public:
	QDate() = default;
	QDate(int y, int m, int d) : y_(y), m_(m), d_(d) {}
	int year() const { return y_; }
	int month() const { return m_; }
	int day() const { return d_; }
private:
	int y_ = 1970, m_ = 1, d_ = 1;
};

// Seconds since the epoch, always UTC: Subsurface stores dive times as
// local time without a time zone, so UTC arithmetic is what it expects.
class QDateTime {
public:
	QDateTime() = default;
	static QDateTime currentDateTimeUtc() { QDateTime t; t.secs_ = (long long)time(nullptr); return t; }
	static QDateTime fromSecsSinceEpoch(long long s) { QDateTime t; t.secs_ = s; return t; }
	long long toSecsSinceEpoch() const { return secs_; }
	QDateTime addSecs(long long s) const { return fromSecsSinceEpoch(secs_ + s); }
	QDateTime addDays(long long d) const { return addSecs(d * 86400); }
	QDateTime addYears(int y) const
	{
		time_t t = (time_t)secs_; struct tm tm; gmtime_r(&t, &tm);
		tm.tm_year += y;
		return fromSecsSinceEpoch((long long)timegm(&tm));
	}
	QDate date() const { time_t t = (time_t)secs_; struct tm tm; gmtime_r(&t, &tm); return QDate(tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday); }
private:
	long long secs_ = 0;
};

class QLocale {
public:
	QString toUpper(const QString &s) const { return s.toUpper(); }
	QString toLower(const QString &s) const { return s.toLower(); }
	QChar decimalPoint() const { return QChar('.'); }
};

class QObject {
public:
	virtual ~QObject() = default;
	static QString tr(const char *s, const char * = nullptr, int = -1) { return QString(s); }
};
#define qPrintable(s) ((s).toStdString().c_str())
#define qWarning(...) fprintf(stderr, __VA_ARGS__)

#define Q_DECLARE_TR_FUNCTIONS(ctx) \
public: \
	static QString tr(const char *s, const char * = nullptr, int = -1) { return QString(s); }
class QCoreApplication {
public:
	static QString translate(const char *, const char *s, const char * = nullptr, int = -1) { return QString(s); }
};

class QNetworkProxy {
public:
	enum ProxyType { DefaultProxy, Socks5Proxy, NoProxy, HttpProxy, HttpCachingProxy, FtpCachingProxy };
};
