// SPDX-License-Identifier: GPL-2.0
// OpenDives — opendives_https_get() pour Linux (POC et tests), avec OpenSSL.
// Validation complète : magasin de certificats du système, chaîne et nom d'hôte.
#include "platform_https.h"

#include <openssl/err.h>
#include <openssl/ssl.h>
#include <openssl/x509v3.h>

#include <netdb.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#include <cstring>
#include <strings.h>

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

int opendives_https_get(const std::string &url, const std::string &user_agent,
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

	SSL_CTX *ctx = SSL_CTX_new(TLS_client_method());
	if (!ctx)
		return -2;
	SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
	SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, nullptr);
	if (SSL_CTX_set_default_verify_paths(ctx) != 1) {
		SSL_CTX_free(ctx);
		return -3;
	}
	int fd = connect_tcp(host, timeout_seconds);
	if (fd < 0) {
		SSL_CTX_free(ctx);
		return -4;
	}
	SSL *ssl = SSL_new(ctx);
	SSL_set_fd(ssl, fd);
	SSL_set_tlsext_host_name(ssl, host.c_str());
	SSL_set1_host(ssl, host.c_str());

	int ret = -5;
	if (SSL_connect(ssl) == 1 && SSL_get_verify_result(ssl) == X509_V_OK) {
		std::string request = "GET " + path + " HTTP/1.1\r\nHost: " + host +
			"\r\nAccept: text/plain\r\nUser-Agent: " + user_agent + "\r\nConnection: close\r\n\r\n";
		if (SSL_write(ssl, request.data(), (int)request.size()) == (int)request.size()) {
			std::string response;
			char buf[4096];
			int n;
			while ((n = SSL_read(ssl, buf, sizeof(buf))) > 0)
				response.append(buf, n);
			size_t end = response.find("\r\n\r\n");
			if (end != std::string::npos && sscanf(response.c_str(), "HTTP/%*s %d", &status) == 1) {
				std::string headers = response.substr(0, end);
				body = response.substr(end + 4);
				for (char &c: headers)
					c = tolower((unsigned char)c);
				if (headers.find("transfer-encoding: chunked") != std::string::npos)
					body = decode_chunked(body);
				ret = 0;
			} else {
				ret = -6;
			}
		}
	}
	SSL_shutdown(ssl);
	SSL_free(ssl);
	close(fd);
	SSL_CTX_free(ctx);
	return ret;
}
