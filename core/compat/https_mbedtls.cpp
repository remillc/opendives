// SPDX-License-Identifier: GPL-2.0
// OpenDives — opendives_https_get() with Mbed TLS (Android).
// Full validation: trusted authorities, chain and host name.
// Mbed TLS is used under its GPL-2.0-or-later option, compatible with the
// GPL v2 of Subsurface's core; OpenSSL's Apache 2.0 licence is not.
#include "platform_https.h"

#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/error.h>
#include <mbedtls/ssl.h>
#include <mbedtls/x509_crt.h>

#include <cerrno>
#include <cstring>

#include <netdb.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

static std::string ca_file;

void opendives_https_set_ca_file(const std::string &path)
{
	ca_file = path;
}

static int connect_tcp(const std::string &host, int timeout_seconds)
{
	struct addrinfo hints = {}, *res = nullptr;
	hints.ai_family = AF_UNSPEC;
	hints.ai_socktype = SOCK_STREAM;
	if (getaddrinfo(host.c_str(), "443", &hints, &res) != 0)
		return -1;
	int fd = -1;
	for (struct addrinfo *ai = res; ai; ai = ai->ai_next) {
		fd = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
		if (fd < 0)
			continue;
		struct timeval tv = { timeout_seconds, 0 };
		setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
		setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
		if (connect(fd, ai->ai_addr, ai->ai_addrlen) == 0)
			break;
		close(fd);
		fd = -1;
	}
	freeaddrinfo(res);
	return fd;
}

static std::string decode_chunked(const std::string &in)
{
	std::string out;
	size_t pos = 0;
	while (pos < in.size()) {
		size_t eol = in.find("\r\n", pos);
		if (eol == std::string::npos)
			break;
		size_t len = strtoul(in.substr(pos, eol - pos).c_str(), nullptr, 16);
		if (len == 0)
			break;
		out += in.substr(eol + 2, len);
		pos = eol + 2 + len + 2;
	}
	return out;
}

// The socket under the TLS session. The time limits are the socket's.
static int socket_send(void *context, const unsigned char *data, size_t length)
{
	ssize_t n = send(*static_cast<int *>(context), data, length, MSG_NOSIGNAL);
	if (n >= 0)
		return static_cast<int>(n);
	return errno == EINTR ? MBEDTLS_ERR_SSL_WANT_WRITE : MBEDTLS_ERR_SSL_TIMEOUT;
}

static int socket_recv(void *context, unsigned char *data, size_t length)
{
	ssize_t n = recv(*static_cast<int *>(context), data, length, 0);
	if (n >= 0)
		return static_cast<int>(n);
	return errno == EINTR ? MBEDTLS_ERR_SSL_WANT_READ : MBEDTLS_ERR_SSL_TIMEOUT;
}

namespace {

// Everything a request needs, freed in one place.
struct Session {
	mbedtls_entropy_context entropy;
	mbedtls_ctr_drbg_context random;
	mbedtls_x509_crt authorities;
	mbedtls_ssl_config config;
	mbedtls_ssl_context ssl;
	int fd = -1;

	Session()
	{
		mbedtls_entropy_init(&entropy);
		mbedtls_ctr_drbg_init(&random);
		mbedtls_x509_crt_init(&authorities);
		mbedtls_ssl_config_init(&config);
		mbedtls_ssl_init(&ssl);
	}
	~Session()
	{
		if (fd >= 0) {
			mbedtls_ssl_close_notify(&ssl);
			close(fd);
		}
		mbedtls_ssl_free(&ssl);
		mbedtls_ssl_config_free(&config);
		mbedtls_x509_crt_free(&authorities);
		mbedtls_ctr_drbg_free(&random);
		mbedtls_entropy_free(&entropy);
	}
};

} // namespace

static bool write_all(mbedtls_ssl_context *ssl, const std::string &data)
{
	const unsigned char *at = reinterpret_cast<const unsigned char *>(data.data());
	size_t left = data.size();
	while (left) {
		int n = mbedtls_ssl_write(ssl, at, left);
		if (n == MBEDTLS_ERR_SSL_WANT_READ || n == MBEDTLS_ERR_SSL_WANT_WRITE)
			continue;
		if (n <= 0)
			return false;
		at += n;
		left -= static_cast<size_t>(n);
	}
	return true;
}

// One HTTPS request; `request_body` and `content_type` only for a POST.
static int https_request(const std::string &method, const std::string &url, const std::string &user_agent,
			 const std::string &accept, const std::string &content_type, const std::string &request_body,
			 int timeout_seconds, int &status, std::string &body)
{
	const std::string scheme = "https://";
	if (url.compare(0, scheme.size(), scheme) != 0)
		return -1;
	size_t slash = url.find('/', scheme.size());
	std::string host = url.substr(scheme.size(), slash - scheme.size());
	std::string path = slash == std::string::npos ? "/" : url.substr(slash);
	if (timeout_seconds <= 0)
		timeout_seconds = 5;
	// No authorities, no connection: Mbed TLS has no system store to fall back on.
	if (ca_file.empty())
		return -3;

	Session s;
	static const char personalization[] = "opendives https";
	if (mbedtls_ctr_drbg_seed(&s.random, mbedtls_entropy_func, &s.entropy,
				  reinterpret_cast<const unsigned char *>(personalization), sizeof(personalization) - 1) != 0)
		return -2;
	if (mbedtls_x509_crt_parse_file(&s.authorities, ca_file.c_str()) < 0)
		return -3;
	if (mbedtls_ssl_config_defaults(&s.config, MBEDTLS_SSL_IS_CLIENT, MBEDTLS_SSL_TRANSPORT_STREAM,
					MBEDTLS_SSL_PRESET_DEFAULT) != 0)
		return -2;
	mbedtls_ssl_conf_min_tls_version(&s.config, MBEDTLS_SSL_VERSION_TLS1_2);
	mbedtls_ssl_conf_authmode(&s.config, MBEDTLS_SSL_VERIFY_REQUIRED);
	mbedtls_ssl_conf_ca_chain(&s.config, &s.authorities, nullptr);
	mbedtls_ssl_conf_rng(&s.config, mbedtls_ctr_drbg_random, &s.random);
	if (mbedtls_ssl_setup(&s.ssl, &s.config) != 0)
		return -2;
	// Both the name announced to the server and the name the certificate must carry.
	if (mbedtls_ssl_set_hostname(&s.ssl, host.c_str()) != 0)
		return -2;

	s.fd = connect_tcp(host, timeout_seconds);
	if (s.fd < 0)
		return -4;
	mbedtls_ssl_set_bio(&s.ssl, &s.fd, socket_send, socket_recv, nullptr);

	int handshake;
	do {
		handshake = mbedtls_ssl_handshake(&s.ssl);
	} while (handshake == MBEDTLS_ERR_SSL_WANT_READ || handshake == MBEDTLS_ERR_SSL_WANT_WRITE);
	if (handshake != 0 || mbedtls_ssl_get_verify_result(&s.ssl) != 0)
		return -5;

	std::string request = method + " " + path + " HTTP/1.1\r\nHost: " + host +
		"\r\nAccept: " + accept + "\r\nUser-Agent: " + user_agent;
	if (method == "POST")
		request += "\r\nContent-Type: " + content_type + "\r\nContent-Length: " + std::to_string(request_body.size());
	request += "\r\nConnection: close\r\n\r\n" + request_body;
	if (!write_all(&s.ssl, request))
		return -5;

	std::string response;
	unsigned char buffer[4096];
	for (;;) {
		int n = mbedtls_ssl_read(&s.ssl, buffer, sizeof(buffer));
		if (n == MBEDTLS_ERR_SSL_WANT_READ || n == MBEDTLS_ERR_SSL_WANT_WRITE)
			continue;
		if (n <= 0)
			break; // closed by the server, or the time limit
		response.append(reinterpret_cast<char *>(buffer), static_cast<size_t>(n));
	}
	size_t end = response.find("\r\n\r\n");
	if (end == std::string::npos || sscanf(response.c_str(), "HTTP/%*s %d", &status) != 1)
		return -6;
	std::string headers = response.substr(0, end);
	body = response.substr(end + 4);
	for (char &c: headers)
		c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
	if (headers.find("transfer-encoding: chunked") != std::string::npos)
		body = decode_chunked(body);
	return 0;
}

int opendives_https_get(const std::string &url, const std::string &user_agent,
			int timeout_seconds, int &status, std::string &body)
{
	return https_request("GET", url, user_agent, "text/plain", std::string(), std::string(), timeout_seconds, status, body);
}

int opendives_https_post(const std::string &url, const std::string &user_agent, const std::string &accept,
			 const std::string &content_type, const std::string &request_body,
			 int timeout_seconds, int &status, std::string &body)
{
	return https_request("POST", url, user_agent, accept, content_type, request_body, timeout_seconds, status, body);
}
