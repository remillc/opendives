// @ts-check
// Dive sites (spec, section 4, "Sites"): changes through the core, saved and
// synced like a dive edit; coordinates as Subsurface writes them.
import { OpenDivesCore } from 'opendives-core';
import { logbook, refreshAfterChange } from './logbook.svelte.js';
import { language } from './i18n.js';

/**
 * One site change (create, edit, geocode, merge, delete), one undoable step.
 * @param {Parameters<import('opendives-core').OpenDivesCorePlugin['siteAction']>[0]} options
 */
export async function siteChange(options) {
  const result = await OpenDivesCore.siteAction(options);
  await refreshAfterChange(result.undo);
  return result;
}

/**
 * Country, region and city from GeoNames for the site's position; a value the
 * diver corrected is kept. Returns false when the lookup is not possible
 * (offline, no GeoNames account): the values stay as they are.
 * @param {number} uuid
 */
export async function geocodeSite(uuid) {
  try {
    await siteChange({ action: 'geocode', uuid, value: language });
    return true;
  } catch (e) {
    console.info('GeoNames lookup not done', String(/** @type {any} */ (e)?.message ?? e));
    return false;
  }
}

/** "These are not duplicates": kept on this device, by pair of uuids. */
export function dismissedPairs() {
  try {
    return new Set(JSON.parse(localStorage.getItem('od.notDuplicates') ?? '[]'));
  } catch {
    return new Set();
  }
}

/** @param {number} a @param {number} b */
export function pairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Thresholds of the possible duplicates, in metres (to be confirmed). */
const SAME_NAME_M = 500;
const SAME_PLACE_M = 50;

/**
 * Possible duplicates to show: the core's pairs, without those the diver
 * dismissed. A pair "same position, different names" is left out when a third
 * site shares that position: imports often give every site of an island or a
 * dive centre the same approximate position, and those sites are distinct.
 * @returns {Promise<{a: import('opendives-core').SiteSummary, b: import('opendives-core').SiteSummary, distanceM: number}[]>}
 */
export async function possibleDuplicates() {
  const dismissed = dismissedPairs();
  /** @type {{a: import('opendives-core').SiteSummary, b: import('opendives-core').SiteSummary, distanceM: number}[]} */
  const pairs = await OpenDivesCore.siteQuery({ kind: 'duplicates', a: SAME_NAME_M, b: SAME_PLACE_M });
  const sameName = (/** @type {(typeof pairs)[number]} */ p) => p.a.name.toLocaleLowerCase() === p.b.name.toLocaleLowerCase();
  /** @type {Map<number, number>} */
  const placePartners = new Map();
  for (const p of pairs) {
    if (sameName(p)) continue;
    placePartners.set(p.a.uuid, (placePartners.get(p.a.uuid) ?? 0) + 1);
    placePartners.set(p.b.uuid, (placePartners.get(p.b.uuid) ?? 0) + 1);
  }
  return pairs.filter(
    (p) =>
      !dismissed.has(pairKey(p.a.uuid, p.b.uuid)) &&
      (sameName(p) || (placePartners.get(p.a.uuid) === 1 && placePartners.get(p.b.uuid) === 1)),
  );
}

/** @param {number} a @param {number} b */
export function dismissPair(a, b) {
  const set = dismissedPairs();
  set.add(pairKey(a, b));
  try {
    localStorage.setItem('od.notDuplicates', JSON.stringify([...set]));
  } catch {
    // Not fatal.
  }
}

/**
 * "35° 26,9′ S  174° 43,9′ E": degrees and decimal minutes, in the device's
 * number format.
 * @param {number} latUdeg
 * @param {number} lonUdeg
 */
export function formatCoordinates(latUdeg, lonUdeg) {
  const minutes = new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  /** @param {number} udeg @param {string} pos @param {string} neg */
  const part = (udeg, pos, neg) => {
    const abs = Math.abs(udeg) / 1e6;
    const deg = Math.floor(abs);
    const min = (abs - deg) * 60;
    return `${deg}° ${minutes.format(min)}′ ${udeg < 0 ? neg : pos}`;
  };
  return `${part(latUdeg, 'N', 'S')}  ${part(lonUdeg, 'E', 'W')}`;
}

/**
 * Coordinates typed by the diver: decimal degrees ("-35.4485, 174.732") or
 * degrees and minutes ("35°26.9'S 174°43.9'E"). Null when not understood.
 * @param {string} text
 * @returns {{latUdeg: number, lonUdeg: number}|null}
 */
export function parseCoordinates(text) {
  const t = text.trim().replace(/,(?=\d)/g, '.');
  const decimal = t.match(/^(-?\d+(?:\.\d+)?)\s*[;,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (decimal) return check(Number(decimal[1]), Number(decimal[2]));
  const part = String.raw`(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NSEWOnsewo])`;
  const dm = t.match(new RegExp(`^${part}[\\s,;]*${part}$`));
  if (!dm) return null;
  /** @param {string} d @param {string} m @param {string} s @param {string} h */
  const value = (d, m, s, h) => {
    const v = Number(d) + Number(m ?? 0) / 60 + Number(s ?? 0) / 3600;
    return /[SWOswo]/.test(h) ? -v : v;
  };
  return check(value(dm[1], dm[2], dm[3], dm[4]), value(dm[5], dm[6], dm[7], dm[8]));

  /** @param {number} lat @param {number} lon */
  function check(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { latUdeg: Math.round(lat * 1e6), lonUdeg: Math.round(lon * 1e6) };
  }
}

/** Maps app link for a position ("Open in Maps"): the system's geo: link on Android. */
export function mapsLink(/** @type {number} */ latUdeg, /** @type {number} */ lonUdeg, /** @type {string} */ name) {
  const lat = latUdeg / 1e6;
  const lon = lonUdeg / 1e6;
  return `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(name)})`;
}

export { logbook };
