// @ts-check
// Offline maps: the rules that need no screen and no device (spec, section 4,
// "Offline maps"). Storage guards, the update check, the tile count of a drawn
// rectangle against OpenFreeMap's limits. offline-maps.svelte.js applies them
// to the device; tests/app/maps-logic.test.mjs checks them.

export const MB = 1_000_000;
export const GB = 1_000_000_000;
const DAY_MS = 24 * 3600 * 1000;

/** "Espace maximum pour les cartes": 500 Mo, 1, 2 or 5 Go, no "unlimited". */
export const CAP_CHOICES = [500 * MB, 1 * GB, 2 * GB, 5 * GB];
export const DEFAULT_CAP = 1 * GB;
/** Free space OpenDives always leaves on the device: 1 Go, or 10 % of the storage if more. */
export const FLOOR_MIN = 1 * GB;
/** A paused download resumes this far above the floor, so that it does not pause again at once. */
export const RESUME_MARGIN = 64 * MB;
/** Partial files of failed downloads are deleted after 7 days. */
export const PARTIAL_DAYS = 7;
/** OpenFreeMap's terms (https://openfreemap.org/tos/): at most 3,000 tiles and 50 MB for an offline download. */
export const MAX_TILES = 3000;
export const MAX_REGION_BYTES = 50 * 1024 * 1024;
/** Full detail, and the "less detail" choice that allows a larger area. */
export const MAX_ZOOM_FULL = 14;
export const MAX_ZOOM_LESS = 12;
/** Half size of the rectangle first drawn around a point, km. */
export const DEFAULT_HALF_KM = /** @type {[number, number]} */ ([20, 20]);

/** @param {number} totalBytes storage of the device */
export function floorBytes(totalBytes) {
  return Math.max(FLOOR_MIN, Math.round((totalBytes || 0) * 0.1));
}

/**
 * Whether a download of `sizeBytes` may start.
 * @param {{ sizeBytes: number, freeBytes: number, totalBytes: number, usedBytes: number, capBytes: number }} o
 *   usedBytes: what the maps already take (and what the running downloads will take)
 * @returns {{ ok: true } | { ok: false, reason: 'space', remainingBytes: number, floorBytes: number }
 *   | { ok: false, reason: 'cap', usedBytes: number, capBytes: number }}
 */
export function checkStart({ sizeBytes, freeBytes, totalBytes, usedBytes, capBytes }) {
  const floor = floorBytes(totalBytes);
  const remaining = freeBytes - sizeBytes;
  if (remaining < floor) return { ok: false, reason: 'space', remainingBytes: Math.max(0, remaining), floorBytes: floor };
  if (usedBytes + sizeBytes > capBytes) return { ok: false, reason: 'cap', usedBytes, capBytes };
  return { ok: true };
}

/**
 * An update needs room for both versions. If that does not fit (floor or
 * cap), the old package can be deleted first ("Remplacer"); if even that does
 * not fit, the update is blocked.
 * @param {{ newBytes: number, oldBytes: number, freeBytes: number, totalBytes: number, usedBytes: number, capBytes: number }} o
 * @returns {{ mode: 'both' } | { mode: 'replace' } | (ReturnType<typeof checkStart> & { ok: false, mode: 'blocked' })}
 */
export function checkUpdate({ newBytes, oldBytes, freeBytes, totalBytes, usedBytes, capBytes }) {
  const both = checkStart({ sizeBytes: newBytes, freeBytes, totalBytes, usedBytes, capBytes });
  if (both.ok) return { mode: 'both' };
  const alone = checkStart({ sizeBytes: newBytes, freeBytes: freeBytes + oldBytes, totalBytes, usedBytes: Math.max(0, usedBytes - oldBytes), capBytes });
  if (alone.ok) return { mode: 'replace' };
  return { ...alone, mode: 'blocked' };
}

/** A running download pauses when free space falls below the floor. @param {number} freeBytes @param {number} totalBytes */
export function shouldPause(freeBytes, totalBytes) {
  return freeBytes < floorBytes(totalBytes);
}

/** A download paused for lack of space resumes by itself when room is back. @param {number} freeBytes @param {number} totalBytes */
export function canResume(freeBytes, totalBytes) {
  return freeBytes >= floorBytes(totalBytes) + RESUME_MARGIN;
}

/** The catalogue is read at start at most once a day. @param {number} lastCheckMs @param {number} nowMs */
export function updateCheckDue(lastCheckMs, nowMs) {
  return !lastCheckMs || nowMs - lastCheckMs >= DAY_MS || nowMs < lastCheckMs;
}

/**
 * Whether version `b` is newer than `a`: dates and numbers compare as such,
 * other texts by natural order.
 * @param {string|number|undefined|null} a @param {string|number|undefined|null} b
 */
export function isNewer(a, b) {
  if (b == null || b === '') return false;
  if (a == null || a === '') return true;
  return String(b).localeCompare(String(a), 'en', { numeric: true }) > 0;
}

/**
 * Failed downloads whose partial file is older than 7 days.
 * @param {{ id: string, status: string, failedAt?: number }[]} regions @param {number} nowMs
 */
export function stalePartials(regions, nowMs) {
  return regions.filter((r) => r.status === 'failed' && r.failedAt && nowMs - r.failedAt > PARTIAL_DAYS * DAY_MS).map((r) => r.id);
}

/**
 * Bytes the maps take, or will take: a ready region at its size; a running
 * download at the most it can take (50 MB: the download stops there); an
 * update on top of the old region.
 * @param {{ status: string, sizeBytes: number, bytesReceived?: number, transfer?: string }[]} regions
 */
export function usedBytes(regions) {
  let sum = 0;
  for (const r of regions) {
    if (r.status === 'ready') sum += r.sizeBytes;
    else if (r.status === 'updating') sum += r.sizeBytes + (r.transfer === 'failed' ? 0 : MAX_REGION_BYTES);
    else if (r.status === 'failed') sum += r.bytesReceived ?? 0;
    else sum += MAX_REGION_BYTES;
  }
  return sum;
}

// --- Geography -----------------------------------------------------------------

/** @param {number} lng @param {number} lat @param {number[]} bbox [w, s, e, n] */
export function inBbox(lng, lat, bbox) {
  const [w, s, e, n] = bbox;
  if (lat < s || lat > n) return false;
  return w <= e ? lng >= w && lng <= e : lng >= w || lng <= e; // crosses the antimeridian
}

/** Width and height of a box, km. @param {number[]} bbox @returns {[number, number]} */
export function bboxSizeKm(bbox) {
  const [w, s, e, n] = bbox;
  const midLat = (s + n) / 2;
  return [(w <= e ? e - w : e - w + 360) * 111.32 * Math.cos((midLat * Math.PI) / 180), (n - s) * 110.57];
}

/**
 * The box of `halfKm` [half width, half height] around a point, clamped to the globe.
 * @param {number} lng @param {number} lat @param {[number, number]} [halfKm]
 * @returns {[number, number, number, number]}
 */
export function rectAround(lng, lat, halfKm = DEFAULT_HALF_KM) {
  const dLat = halfKm[1] / 110.57;
  const dLng = halfKm[0] / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  return [Math.max(-180, lng - dLng), Math.max(-85, lat - dLat), Math.min(180, lng + dLng), Math.min(85, lat + dLat)];
}

/** Distance between two points, km. @param {number} lng1 @param {number} lat1 @param {number} lng2 @param {number} lat2 */
export function distanceKm(lng1, lat1, lng2, lat2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * The site closest to a point, for the name of a drawn region.
 * @template {{ lng: number, lat: number }} S
 * @param {number} lng @param {number} lat @param {S[]} sites
 * @returns {S|null}
 */
export function nearestSite(lng, lat, sites) {
  /** @type {S|null} */
  let best = null;
  let bestKm = Infinity;
  for (const s of sites) {
    const km = distanceKm(lng, lat, s.lng, s.lat);
    if (km < bestKm) {
      best = s;
      bestKm = km;
    }
  }
  return best;
}

// --- Tiles of a rectangle ------------------------------------------------------------

const MAX_LAT = 85.0511287798066;
const clampLat = (/** @type {number} */ lat) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));

/** Column of a longitude at zoom z (Web Mercator, XYZ scheme), not clamped. @param {number} lng @param {number} z */
const tileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);

/** Row of a latitude at zoom z (row 0 at the north), not clamped. @param {number} lat @param {number} z */
function tileY(lat, z) {
  const rad = (clampLat(lat) * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
}

/**
 * Longitudes brought into [-180, 180] (a map dragged past the antimeridian
 * gives 190). A box whose west is then east of its east crosses the antimeridian.
 * @param {number[]} bbox [west, south, east, north]
 * @returns {[number, number, number, number]}
 */
export function normalizeBbox([w, s, e, n]) {
  if (e - w >= 360) return [-180, s, 180, n];
  const wrap = (/** @type {number} */ lng) => ((((lng + 180) % 360) + 360) % 360) - 180;
  const east = e === 180 ? 180 : wrap(e);
  return [wrap(w), s, east, n];
}

/**
 * The tiles of a rectangle at one zoom: columns (one or two runs when it
 * crosses the antimeridian) and rows, edges included.
 * @param {number[]} bbox [west, south, east, north] @param {number} z
 * @returns {{ columns: [number, number][], rowMin: number, rowMax: number, count: number }}
 */
export function tileRange(bbox, z) {
  const [w, s, e, n] = normalizeBbox(bbox);
  const last = 2 ** z - 1;
  const clamp = (/** @type {number} */ v) => Math.max(0, Math.min(last, v));
  const x0 = clamp(tileX(w, z));
  const x1 = clamp(tileX(e, z));
  /** @type {[number, number][]} */
  const columns = w <= e ? [[x0, x1]] : x0 <= x1 + 1 ? [[0, last]] : [[x0, last], [0, x1]];
  const rowMin = clamp(tileY(n, z));
  const rowMax = clamp(tileY(s, z));
  const cols = columns.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  return { columns, rowMin, rowMax, count: cols * Math.max(0, rowMax - rowMin + 1) };
}

/**
 * Number of tiles of a rectangle for zooms 0 to maxZoom.
 * @param {number[]} bbox [west, south, east, north] @param {number} maxZoom
 */
export function countTiles(bbox, maxZoom) {
  let total = 0;
  for (let z = 0; z <= maxZoom; z++) total += tileRange(bbox, z).count;
  return total;
}

/**
 * Whether a region holds the tile (z, x, y): inside the rectangle's tiles, at a
 * zoom up to the region's maxZoom.
 * @param {{ bbox: number[], maxZoom?: number }} region @param {number} z @param {number} x @param {number} y
 */
export function regionHasTile(region, z, x, y) {
  if (z > (region.maxZoom ?? MAX_ZOOM_FULL)) return false;
  const { columns, rowMin, rowMax } = tileRange(region.bbox, z);
  return y >= rowMin && y <= rowMax && columns.some(([a, b]) => x >= a && x <= b);
}

/**
 * The tile check of a drawn rectangle, for the area screen.
 * - `maxZoom`: the detail to use (14 when it fits, else 12 when that fits, else null)
 * - `lessDetail`: it does not fit at 14 but fits at 12, so "less detail" can be offered
 * @param {number[]} bbox
 * @returns {{ count14: number, count12: number, fits14: boolean, fits12: boolean, maxZoom: 14|12|null, lessDetail: boolean }}
 */
export function checkTiles(bbox) {
  const count14 = countTiles(bbox, MAX_ZOOM_FULL);
  const count12 = countTiles(bbox, MAX_ZOOM_LESS);
  const fits14 = count14 <= MAX_TILES;
  const fits12 = count12 <= MAX_TILES;
  return { count14, count12, fits14, fits12, maxZoom: fits14 ? 14 : fits12 ? 12 : null, lessDetail: !fits14 && fits12 };
}

/** Whether two rectangles share some area, across the antimeridian too. @param {number[]} a @param {number[]} b */
export function bboxesOverlap(a, b) {
  const [aw, as, ae, an] = normalizeBbox(a);
  const [bw, bs, be, bn] = normalizeBbox(b);
  if (as >= bn || bs >= an) return false;
  /** @param {number} w @param {number} e @returns {[number, number][]} */
  const spans = (w, e) => (w <= e ? [[w, e]] : [[w, 180], [-180, e]]);
  return spans(aw, ae).some(([x0, x1]) => spans(bw, be).some(([y0, y1]) => x0 < y1 && y0 < x1));
}
