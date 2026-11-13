// @ts-check
// Deep links, the pure part (decided on 13 November 2026): what a link or a
// shared file address means, and the links the app shares. No router and no
// native call here; lib/open-link.js acts on the result.
//
// Two forms of the same address, both opening the app:
//   opendives://sites/12                 custom scheme
//   https://opendives.app/sites/12       verified link (Android App Links, iOS Universal Links)
// They differ only by the prefix; the path is the table below. Only screens that
// are safe to land on are listed: never an editor, an account screen or a delete.
//
//   /                          Logbook
//   /dives/at/20121105T101500  the dive that began at that local date and time (see below)
//   /sites/                    Sites
//   /sites/12                  a site, by its uuid
//   /plan/new, /plans/         Planner, saved plans
//   /tools/, /tools/<tool>     Tools: desaturation, ead-mod, best-mix, blender
//   /statistics/               Statistics
//   /settings/, /settings/planner, /settings/maps/, /about
//
// The stable key of a dive. The core's dive id is a runtime id, numbered again
// at each load, and the dive number can be changed by renumbering. Subsurface
// itself names a dive in its git log by its start (Dive-<number>-<day>-<time>
// under the date folders), and the date and time to the second is what the cloud
// and the desktop app keep identical, so a link carries it: the local start time
// "YYYYMMDDTHHMMSS", the `date` of the core's dive list. Two dives starting in the
// same second (two computers) are the same dive for Subsurface's merge; the link
// opens the first. A site has a uuid, kept by the cloud, used as is (decimal).

/** The host of the verified links. */
export const LINK_HOST = 'opendives.app';

/**
 * @typedef {'logbook'|'sites'|'statistics'|'tools'|'account'} LinkSection
 * @typedef {(
 *   { kind: 'route', section: LinkSection, path: string, over?: boolean } |
 *   { kind: 'dive', stamp: string, date: string } |
 *   { kind: 'site', uuid: number } |
 *   { kind: 'file', uri: string } |
 *   { kind: 'unknown' }
 * )} LinkTarget
 */

/** Screens that open as they are: path, section, opened over the section (Settings, About). @type {Record<string, { section: LinkSection, over?: boolean }>} */
const ROUTES = {
  '/': { section: 'logbook' },
  '/sites/': { section: 'sites' },
  '/statistics/': { section: 'statistics' },
  '/tools/': { section: 'tools' },
  '/tools/desaturation': { section: 'tools' },
  '/tools/ead-mod': { section: 'tools' },
  '/tools/best-mix': { section: 'tools' },
  '/tools/blender': { section: 'tools' },
  '/plan/new': { section: 'tools' },
  '/plans/': { section: 'tools' },
  '/settings/': { section: 'account', over: true },
  '/settings/planner': { section: 'account', over: true },
  '/settings/maps/': { section: 'account', over: true },
  '/about': { section: 'account', over: true },
};

/**
 * The path of a link: the part after opendives:// or after the host of an https link;
 * null for any other address.
 * @param {string} url
 * @returns {string|null} starting with "/", without query or fragment
 */
function linkPath(url) {
  let rest;
  const custom = /^opendives:\/\/\/?([^?#]*)/i.exec(url);
  if (custom) rest = custom[1];
  else {
    const https = /^https:\/\/([^/?#:]+)(?::443)?([^?#]*)/i.exec(url);
    if (!https || https[1].toLowerCase() !== LINK_HOST) return null;
    rest = https[2].replace(/^\//, '');
  }
  return '/' + rest;
}

/**
 * The path in its canonical form: a resource has no trailing slash, a collection has
 * one (AGENTS.md); a link written the other way still finds its screen.
 * @param {string} path
 */
function canonical(path) {
  const clean = path.replace(/\/{2,}/g, '/');
  if (clean in ROUTES) return clean;
  if (clean.endsWith('/') && clean.slice(0, -1) in ROUTES) return clean.slice(0, -1);
  if (!clean.endsWith('/') && clean + '/' in ROUTES) return clean + '/';
  return clean;
}

/**
 * What a link or a file address is for.
 * @param {string} url the address received from the system
 * @returns {LinkTarget}
 */
export function parseLink(url) {
  const text = String(url ?? '').trim();
  // A file received from another app (Android content://, iOS file://).
  if (/^(content|file):\/\//i.test(text)) return { kind: 'file', uri: text };
  const raw = linkPath(text);
  if (raw === null) return { kind: 'unknown' };
  let path;
  try {
    path = canonical(decodeURIComponent(raw));
  } catch {
    return { kind: 'unknown' };
  }
  const dive = /^\/dives\/at\/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\/?$/.exec(path);
  if (dive) {
    const [, y, mo, d, h, mi, s] = dive;
    return { kind: 'dive', stamp: `${y}${mo}${d}T${h}${mi}${s}`, date: `${y}-${mo}-${d}T${h}:${mi}:${s}` };
  }
  const site = /^\/sites\/(\d{1,10})$/.exec(path);
  if (site) return { kind: 'site', uuid: Number(site[1]) };
  const route = ROUTES[path];
  if (route) return { kind: 'route', path, section: route.section, ...(route.over ? { over: true } : {}) };
  return { kind: 'unknown' };
}

/**
 * The https link to a dive, from the `date` the core gives it.
 * @param {string} date e.g. 2012-11-05T10:15:00
 * @returns {string|null} null when the date has no seconds-precise form
 */
export function diveLink(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(date ?? '');
  return m ? `https://${LINK_HOST}/dives/at/${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}` : null;
}

/**
 * The https link to a site.
 * @param {number} uuid
 */
export function siteLink(uuid) {
  return `https://${LINK_HOST}/sites/${uuid}`;
}

// --- A file sent to the app -----------------------------------------------------

/** A logbook file is read whole to be imported: nothing larger than this is opened. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Whether the beginning of a file is a Subsurface logbook: XML whose root element is
 * <divelog> (.ssrf, .xml export) or the older <dives>.
 * @param {string} head the first characters of the file, as text
 */
export function isSubsurfaceXml(head) {
  const text = head.replace(/^(\uFEFF|\xEF\xBB\xBF)/, '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/^\s*<\?xml|^\s*<(divelog|dives)[\s>]/i.test(text)) return false;
  // The root is the first element that is not the declaration, a comment or a doctype.
  const root = /<(?![?!])([A-Za-z][\w:.-]*)/.exec(text);
  return !!root && /^(divelog|dives)$/i.test(root[1]);
}

/**
 * Decides whether a shared file is imported, and under which name for the core (which
 * reads the format from the extension). The mime type is never trusted: mail and
 * Drive send .ssrf as application/octet-stream or text/plain. A name ending in .ssrf or
 * .xml is accepted when its contents are Subsurface XML; any other name (or none: some
 * providers give an opaque name) is accepted only when the contents are.
 * @param {string} name display name of the file
 * @param {string} head the first characters of the file, as text
 * @param {number} size bytes
 * @returns {{ ok: true, name: string } | { ok: false, reason: 'EMPTY'|'TOO_BIG'|'NOT_A_LOGBOOK' }}
 */
export function checkSharedFile(name, head, size) {
  if (size <= 0) return { ok: false, reason: 'EMPTY' };
  if (size > MAX_FILE_BYTES) return { ok: false, reason: 'TOO_BIG' };
  if (!isSubsurfaceXml(head)) return { ok: false, reason: 'NOT_A_LOGBOOK' };
  const base = (name || '').split(/[\\/]/).pop() || '';
  const ext = /\.(ssrf|xml)$/i.test(base);
  return { ok: true, name: ext ? base : `${base.replace(/\.[^.]*$/, '') || 'import'}.ssrf` };
}

/**
 * The message key for a failed import, shared by "+" › Import a file and a file opened
 * from another app.
 * @param {string} code the core's error code (start of the message)
 */
export function importErrorKey(code) {
  if (code.startsWith('NO_NEW_DIVES')) return 'logbook.importNothingNew';
  if (code.startsWith('NO_DIVES')) return 'logbook.importNoDives';
  if (code.startsWith('WRITE_LOCKED')) return 'edit.writeLocked';
  return 'logbook.importFailed';
}
