// @ts-check
// The checks of the account and git repository forms, run as the diver types (forms are
// validated live, Christian's rule of 14 November 2026). The same rules as the C++ façade,
// which keeps its own copy as a guard before credentials go to the cloud or to libgit2:
// cloud_valid_email and cloud_valid_password (core/libopendives/account.cpp), and
// normalise_git_url, valid_git_username, valid_git_token, valid_git_branch
// (core/libopendives/opendives.cpp). A rule changed here changes there too.

/** The cloud's e-mail syntax: RFC 5321 lengths, then Subsurface's pattern. */
const EMAIL = /^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.+_-]+\.[a-zA-Z0-9+_-]{2,}$/;

/** The characters the cloud accepts in a password. */
const PASSWORD = /^[a-zA-Z0-9@.+_-]+$/;

/**
 * Whether the cloud would take this e-mail address: at most 254 characters, at most 64 before
 * the @, and Subsurface's pattern.
 * @param {string} email
 * @returns {boolean}
 */
export function validCloudEmail(email) {
  if (email.length > 254) return false;
  const at = email.indexOf('@');
  if (at > 64) return false;
  return EMAIL.test(email);
}

/**
 * Whether the cloud would take this password: not empty, letters, digits and @ . + _ - only.
 * @param {string} password
 * @returns {boolean}
 */
export function validCloudPassword(password) {
  return password.length > 0 && PASSWORD.test(password);
}

/**
 * The git repository address as the façade stores it, or null when it would refuse it:
 * « https://host/path » (any « scheme:// » when `anyScheme`, the debug setting), trimmed,
 * trailing slashes dropped; nothing that could carry credentials or confuse Subsurface's
 * « url[branch] » syntax (no space, control character, @ [ ] ? # \), a host of letters,
 * digits, . - : only, and a path after it.
 * @param {string} input
 * @param {boolean} [anyScheme]
 * @returns {{ url: string, host: string } | null}
 */
export function normaliseGitUrl(input, anyScheme = false) {
  let url = input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  if (!url) return null;
  let schemeLength;
  if (url.startsWith('https://')) schemeLength = 8;
  else if (anyScheme) {
    const pos = url.indexOf('://');
    if (pos <= 0) return null;
    schemeLength = pos + 3;
  } else return null;
  for (const ch of url) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x20 || c === 0x7f || '@[]?#\\'.includes(ch)) return null;
  }
  url = url.replace(/\/+$/, '');
  const slash = url.indexOf('/', schemeLength);
  if (slash < 0 || slash === schemeLength || slash + 1 >= url.length) return null;
  const host = url.slice(schemeLength, slash);
  if (!/^[A-Za-z0-9.:-]+$/.test(host)) return null;
  return { url, host };
}

/**
 * Whether a git user name is accepted: 1 to 100 letters, digits, . _ -.
 * @param {string} name
 * @returns {boolean}
 */
export function validGitUsername(name) {
  return name.length > 0 && name.length <= 100 && /^[A-Za-z0-9._-]+$/.test(name);
}

/**
 * Whether an access token is accepted: 1 to 1000 printable ASCII characters, no space.
 * @param {string} token
 * @returns {boolean}
 */
export function validGitToken(token) {
  return token.length > 0 && token.length <= 1000 && /^[\x21-\x7e]+$/.test(token);
}

/**
 * Whether a branch name is accepted: 1 to 200 characters, not starting with - or /, not ending
 * with / or ., no « .. » or « // », no space, control character or [ ] ~ ^ : ? * \.
 * @param {string} branch
 * @returns {boolean}
 */
export function validGitBranch(branch) {
  if (!branch || branch.length > 200) return false;
  if (branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/') || branch.endsWith('.')) return false;
  if (branch.includes('..') || branch.includes('//')) return false;
  for (const ch of branch) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x20 || c === 0x7f || '[]~^:?*\\'.includes(ch)) return false;
  }
  return true;
}
