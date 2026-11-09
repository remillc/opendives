// SPDX-License-Identifier: GPL-2.0
// OpenDives — HTTPS request provided by the platform (replaces QNetworkAccessManager).
// The server certificate MUST be validated (trust chain and host name).
#ifndef OPENDIVES_PLATFORM_HTTPS_H
#define OPENDIVES_PLATFORM_HTTPS_H

#include <string>

// GET on `url` (https:// only). Returns 0 if an HTTP response was received
// over a valid TLS connection; `status` and `body` are then filled in.
// Returns a negative value on network failure, TLS failure or timeout.
int opendives_https_get(const std::string &url, const std::string &user_agent,
			int timeout_seconds, int &status, std::string &body);

// POST of `request_body` (Content-Type `content_type`) on `url`, with the same
// TLS validation and return values as opendives_https_get().
int opendives_https_post(const std::string &url, const std::string &user_agent, const std::string &accept,
			 const std::string &content_type, const std::string &request_body,
			 int timeout_seconds, int &status, std::string &body);

// PEM file of trusted certificate authorities. Empty: the system default store
// (Linux). Android has none that the TLS library can read: the app provides one.
void opendives_https_set_ca_file(const std::string &path);

#endif
