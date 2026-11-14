// @ts-check
// Country, region and city of a position: OpenStreetMap's Nominatim when the
// network answers, else the country and region of the offline Natural Earth
// file (offline-region.js). Ported from the façade (edit.cpp, place_at and
// nominatim_lookup; AGENTS.md, « JavaScript first »). The façade only writes
// the result in the site's taxonomy (siteAction 'geocode').
//
// Nominatim's usage policy (operations.osmfoundation.org/policies/nominatim):
// an identifying User-Agent, at most one request per second, results cached.
// The request goes through the plugin (placesSearch), which sets the app's
// User-Agent: a WebView cannot. The one-second spacing is shared with the
// other Nominatim requests of the app (area-search.js).

import { OpenDivesCore } from 'opendives-core';
import { takeSlot, NOMINATIM_REVERSE_URL } from './area-search.js';
import { offlineRegion } from './offline-region.js';

/**
 * @typedef {Object} Place
 * @property {string} country
 * @property {string} region first level below the country (state, province...)
 * @property {string} county second level; empty when unknown, and offline
 * @property {string} city
 * @property {boolean} offline true when the answer comes from the offline file
 */

/** @typedef {(url: string) => Promise<{ status: number, body: string }>} HttpGet */

/** @type {Map<string, Place>} answers of Nominatim, by position and language */
const cache = new Map();

/** @type {HttpGet} */
const nativeGet = (url) => OpenDivesCore.placesSearch({ url });

/**
 * The first of these keys of Nominatim's "address" object that has a value.
 * @param {any} address @param {string[]} keys
 */
function firstValue(address, keys) {
  for (const key of keys) {
    const value = address?.[key];
    if (typeof value === 'string' && value) return value;
  }
  return '';
}

/**
 * The places of a Nominatim reverse answer (jsonv2, addressdetails=1).
 * Mapping as the façade's: region = state, else province, region, state district;
 * city = city, else town, village, hamlet, municipality.
 * @param {string} body
 * @returns {Omit<Place, 'offline'> | null} null when the answer has no address (open sea) or no value
 */
export function parseAddress(body) {
  /** @type {any} */
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const address = json?.address;
  if (!address || typeof address !== 'object') return null;
  const place = {
    country: firstValue(address, ['country']),
    region: firstValue(address, ['state', 'province', 'region', 'state_district']),
    county: firstValue(address, ['county']),
    city: firstValue(address, ['city', 'town', 'village', 'hamlet', 'municipality']),
  };
  return place.country || place.region || place.county || place.city ? place : null;
}

/**
 * The address of Nominatim's reverse lookup.
 * @param {number} latUdeg @param {number} lonUdeg @param {string} lang
 */
export function reverseAddressUrl(latUdeg, lonUdeg, lang) {
  const q = `lat=${(latUdeg / 1e6).toFixed(6)}&lon=${(lonUdeg / 1e6).toFixed(6)}`;
  return `${NOMINATIM_REVERSE_URL}?format=jsonv2&zoom=14&addressdetails=1&${q}&accept-language=${lang}`;
}

/**
 * Nominatim's answer for a position; null when the server did not answer, answered
 * an error, or knows no place there.
 * @param {number} latUdeg @param {number} lonUdeg @param {string} lang
 * @param {{ get: HttpGet, now: () => number, sleep: (ms: number) => Promise<void> }} io
 * @returns {Promise<Place | null>}
 */
async function nominatimLookup(latUdeg, lonUdeg, lang, io) {
  const key = `${latUdeg}|${lonUdeg}|${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;
  await takeSlot(io.now, io.sleep);
  /** @type {{ status: number, body: string }} */
  let answer;
  try {
    answer = await io.get(reverseAddressUrl(latUdeg, lonUdeg, lang));
  } catch {
    return null;
  }
  if (answer.status !== 200) return null;
  const found = parseAddress(answer.body);
  if (!found) return null;
  const place = { ...found, offline: false };
  cache.set(key, place);
  return place;
}

/**
 * The place at a position, in the language of the app: from Nominatim, else (the network
 * does not answer, or no place there) the country and region of the offline file.
 * @param {number} latUdeg @param {number} lonUdeg
 * @param {string} lang "fr", "en"...
 * @param {{ get?: HttpGet, now?: () => number, sleep?: (ms: number) => Promise<void>, offlineLookup?: typeof offlineRegion }} [deps] for the tests
 * @returns {Promise<Place | null>} null when neither source knows the position
 */
export async function placeAt(latUdeg, lonUdeg, lang, deps = {}) {
  const {
    get = nativeGet,
    now = Date.now,
    sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    offlineLookup = offlineRegion,
  } = deps;
  const online = await nominatimLookup(latUdeg, lonUdeg, lang, { get, now, sleep });
  if (online) return online;
  const local = await offlineLookup(latUdeg, lonUdeg, lang);
  return local ? { country: local.country, region: local.region, county: '', city: '', offline: true } : null;
}

/** For the tests: forgets the cached answers. */
export function resetPlaceLookup() {
  cache.clear();
}
