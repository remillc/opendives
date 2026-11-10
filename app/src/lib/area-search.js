// @ts-check
// Search on "Choisir sur la carte" (docs/ui-specification.md, "Offline maps",
// Adding). Pure logic: no network, no DOM.
//
// Logbook sites are filtered live, locally. Places come from Nominatim, only on
// an explicit submit, never as the diver types (usage policy: "you must not
// implement such a service on the client side"), at most one request per
// second, with results cached.

import { OpenDivesCore } from 'opendives-core';
import { checkTiles, rectAround, DEFAULT_HALF_KM } from './maps-logic.js';

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** The policy's absolute maximum is 1 request per second; a margin on top. */
export const NOMINATIM_GAP_MS = 1100;
export const MAX_SITE_RESULTS = 5;
export const MAX_PLACE_RESULTS = 5;
export const ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';

/** Lower case, no accents, single spaces: "Île d'Yeu" matches "ile d'yeu". @param {string} text */
export function foldText(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The sites of the logbook that match what is typed: every word of the query
 * must start a word of the name or of the country. Names that start with the
 * query come first, then the alphabetical order. Sites without a position
 * cannot be shown on a map and are left out.
 * @param {string} query
 * @param {{ name: string, country?: string, hasLocation?: boolean, latUdeg: number, lonUdeg: number }[]} sites
 * @param {number} [limit]
 * @returns {{ name: string, detail: string, lng: number, lat: number }[]}
 */
export function filterSites(query, sites, limit = MAX_SITE_RESULTS) {
  const words = foldText(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  /** @type {{ name: string, detail: string, lng: number, lat: number, rank: number, key: string }[]} */
  const found = [];
  for (const s of sites) {
    if (s.hasLocation === false || !s.name) continue;
    const name = foldText(s.name);
    const hay = `${name} ${foldText(s.country ?? '')}`.split(/[\s,;()/-]+/).filter(Boolean);
    if (!words.every((w) => hay.some((h) => h.startsWith(w)))) continue;
    found.push({
      name: s.name,
      detail: s.country ?? '',
      lng: s.lonUdeg / 1e6,
      lat: s.latUdeg / 1e6,
      rank: name.startsWith(words.join(' ')) ? 0 : 1,
      key: name,
    });
  }
  found.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  return found.slice(0, limit).map(({ name, detail, lng, lat }) => ({ name, detail, lng, lat }));
}

/**
 * The default rectangle (40 x 40 km) around a point, made smaller when it would
 * not fit the tile limit at zoom 14 (towards the poles a tile covers less ground).
 * @param {number} lng @param {number} lat
 * @returns {[number, number, number, number]}
 */
export function rectForPoint(lng, lat) {
  let half = /** @type {[number, number]} */ ([...DEFAULT_HALF_KM]);
  let box = rectAround(lng, lat, half);
  for (let i = 0; i < 40 && !checkTiles(box).fits14; i++) {
    half = [half[0] * 0.9, half[1] * 0.9];
    box = rectAround(lng, lat, half);
  }
  return box;
}

/** Milliseconds to wait before the next request. @param {number} lastMs @param {number} nowMs @param {number} [gapMs] */
export function waitBeforeRequest(lastMs, nowMs, gapMs = NOMINATIM_GAP_MS) {
  return Math.max(0, lastMs + gapMs - nowMs);
}

/** @param {string} query @param {string} lang the app's language (fr, en…) */
export function placesUrl(query, lang) {
  const q = new URLSearchParams({
    q: query.trim(),
    format: 'jsonv2',
    limit: String(MAX_PLACE_RESULTS),
    addressdetails: '0',
    'accept-language': lang,
  });
  return `${NOMINATIM_URL}?${q}`;
}

/** The key of the cache of places: the same words give the same answer. @param {string} query @param {string} lang */
export function placesKey(query, lang) {
  return `${lang}|${foldText(query)}`;
}

/**
 * The request goes through the plugin, which identifies the app as Nominatim's
 * policy asks: a request of the WebView cannot set its User-Agent.
 * @param {string} url
 */
async function nativeFetch(url) {
  const { status, body } = await OpenDivesCore.placesSearch({ url });
  return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) };
}

let lastRequestMs = 0;
/** @type {Map<string, { name: string, detail: string, lng: number, lat: number }[]>} */
const cache = new Map();

/**
 * Places for a submitted query. Nominatim's policy: at most one request per
 * second for the whole app (this module is the only caller), answers cached.
 * Rejects when the server cannot be reached or answers an error.
 * @param {string} query @param {string} lang
 * @param {{ fetchFn?: (url: string) => Promise<{ ok: boolean, status: number, json: () => Promise<any> }>, now?: () => number, sleep?: (ms: number) => Promise<void> }} [deps]
 */
export async function searchPlaces(query, lang, deps = {}) {
  const { fetchFn = nativeFetch, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = deps;
  const key = placesKey(query, lang);
  const hit = cache.get(key);
  if (hit) return hit;
  // Reserve the slot before waiting, so that two searches cannot both fire after the same wait.
  const wait = waitBeforeRequest(lastRequestMs, now());
  lastRequestMs = now() + wait;
  if (wait > 0) await sleep(wait);
  const response = await fetchFn(placesUrl(query, lang));
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const places = parsePlaces(await response.json());
  cache.set(key, places);
  return places;
}

/** For the tests. */
export function resetPlacesSearch() {
  lastRequestMs = 0;
  cache.clear();
}

/**
 * Nominatim's JSON answer as a list of places. `display_name` is "Name, ..., Country":
 * the name is its first part, the rest is the detail.
 * @param {any} json
 * @returns {{ name: string, detail: string, lng: number, lat: number }[]}
 */
export function parsePlaces(json) {
  if (!Array.isArray(json)) return [];
  /** @type {{ name: string, detail: string, lng: number, lat: number }[]} */
  const out = [];
  for (const r of json) {
    const lng = Number(r?.lon);
    const lat = Number(r?.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -85 || lat > 85) continue;
    const parts = String(r.display_name ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    const name = String(r.name || parts[0] || '');
    if (!name) continue;
    const rest = parts.slice(1);
    // Keep the detail short: the last two parts (area, country).
    out.push({ name, detail: rest.slice(-2).join(', '), lng, lat });
  }
  return out.slice(0, MAX_PLACE_RESULTS);
}
