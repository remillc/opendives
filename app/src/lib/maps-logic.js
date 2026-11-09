// @ts-check
// Offline maps: the rules that need no screen and no device (spec, section 4,
// "Offline maps"). Storage guards, the zones that contain the diver's sites,
// the update check, the estimate of a drawn region. offline-maps.svelte.js
// applies them to the device; tests/app/maps-logic.test.mjs checks them.

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
/**
 * Estimate for a region drawn on the map: bytes per km2. From the first
 * mock-up (150 x 140 km, about 24 Mo); to be replaced by a measure on real
 * packages.
 */
export const BYTES_PER_KM2 = 1143;
/** Half size of the rectangle first drawn around a point, km (150 x 140 km). */
export const DEFAULT_HALF_KM = /** @type {[number, number]} */ ([75, 70]);

/**
 * @typedef {Object} CataloguePackage
 * @property {string} id
 * @property {'zone'|'country'} kind
 * @property {{fr?: string, en?: string}} names
 * @property {string} country country code
 * @property {[number, number, number, number]} bbox [west, south, east, north]
 * @property {number} sizeBytes
 * @property {string|number} version
 * @property {string} sha256
 * @property {string} url
 */

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
 * Bytes the maps take, or will take: a ready package at its size; a download
 * at its final size (reserved); an update on top of the old package.
 * @param {{ status: string, sizeBytes: number, bytesReceived?: number, update?: { sizeBytes: number }|null }[]} regions
 */
export function usedBytes(regions) {
  let sum = 0;
  for (const r of regions) {
    if (r.status === 'ready') sum += r.sizeBytes;
    else if (r.status === 'updating') sum += r.sizeBytes + (r.update?.sizeBytes ?? 0);
    else if (r.status === 'failed') sum += r.bytesReceived ?? 0;
    else sum += r.sizeBytes;
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

/** Approximate area of a box, km2. @param {number[]} bbox */
export function bboxAreaKm2(bbox) {
  const [w, s, e, n] = bbox;
  const width = (w <= e ? e - w : e - w + 360) * 111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180);
  return Math.abs(width) * (n - s) * 110.57;
}

/** Width and height of a box, km. @param {number[]} bbox @returns {[number, number]} */
export function bboxSizeKm(bbox) {
  const [w, s, e, n] = bbox;
  const midLat = (s + n) / 2;
  return [(w <= e ? e - w : e - w + 360) * 111.32 * Math.cos((midLat * Math.PI) / 180), (n - s) * 110.57];
}

/** Estimated size of a drawn region, bytes. @param {number[]} bbox */
export function estimateBytes(bbox) {
  return Math.round(bboxAreaKm2(bbox) * BYTES_PER_KM2);
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

/**
 * What contains a point: the smallest dive zone, else the smallest country.
 * @param {number} lng @param {number} lat @param {CataloguePackage[]} catalogue
 */
export function packageForPoint(lng, lat, catalogue) {
  for (const kind of /** @type {const} */ (['zone', 'country'])) {
    const found = catalogue.filter((p) => p.kind === kind && inBbox(lng, lat, p.bbox)).sort((a, b) => bboxAreaKm2(a.bbox) - bboxAreaKm2(b.bbox));
    if (found.length) return found[0];
  }
  return null;
}

/**
 * "Depuis votre carnet": the dive zones that contain sites of the logbook.
 * Zones of a trip come first (most recent trip first, as `trips` is given),
 * then the others by number of sites.
 * @param {{
 *   sites: { name: string, lng: number, lat: number, dives?: number }[],
 *   trips: { name: string, date?: string, sites: { name: string, lng: number, lat: number }[] }[],
 *   catalogue: CataloguePackage[],
 * }} o
 * @returns {{ pkg: CataloguePackage, trips: { name: string, date?: string }[], sites: { name: string, dives: number }[] }[]}
 */
export function suggestZones({ sites, trips, catalogue }) {
  const zones = catalogue.filter((p) => p.kind === 'zone');
  /** @type {Map<string, { pkg: CataloguePackage, trips: { name: string, date?: string }[], sites: Map<string, number>, firstTrip: number }>} */
  const found = new Map();
  /** @param {CataloguePackage} pkg */
  const entry = (pkg) => {
    let e = found.get(pkg.id);
    if (!e) found.set(pkg.id, (e = { pkg, trips: [], sites: new Map(), firstTrip: Infinity }));
    return e;
  };
  /** The smallest zone containing the point. @param {number} lng @param {number} lat */
  const zoneAt = (lng, lat) => zones.filter((z) => inBbox(lng, lat, z.bbox)).sort((a, b) => bboxAreaKm2(a.bbox) - bboxAreaKm2(b.bbox))[0];

  for (const s of sites) {
    const zone = zoneAt(s.lng, s.lat);
    if (zone) entry(zone).sites.set(s.name, s.dives ?? 0);
  }
  trips.forEach((trip, index) => {
    for (const s of trip.sites) {
      const zone = zoneAt(s.lng, s.lat);
      if (!zone) continue;
      const e = entry(zone);
      if (!e.sites.has(s.name)) e.sites.set(s.name, 0);
      if (!e.trips.some((x) => x.name === trip.name && x.date === trip.date)) e.trips.push({ name: trip.name, date: trip.date });
      e.firstTrip = Math.min(e.firstTrip, index);
    }
  });
  return [...found.values()]
    .sort((a, b) => a.firstTrip - b.firstTrip || b.sites.size - a.sites.size || a.pkg.id.localeCompare(b.pkg.id))
    .map((e) => ({ pkg: e.pkg, trips: e.trips, sites: [...e.sites].map(([name, dives]) => ({ name, dives })) }));
}

/**
 * Name of a package in the language, else English, else the first one.
 * @param {{ names?: { fr?: string, en?: string } }} pkg @param {string} language
 */
export function packageName(pkg, language) {
  const names = /** @type {Record<string, string|undefined>} */ (pkg.names ?? {});
  return names[language] || names.en || Object.values(names).find(Boolean) || '';
}

/**
 * The text typed in the search field matches the name (any language) or the country code.
 * @param {CataloguePackage} pkg @param {string} query
 */
export function matchesSearch(pkg, query) {
  const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(query.trim());
  if (!q) return true;
  return [...Object.values(pkg.names ?? {}), pkg.country].filter(Boolean).some((n) => fold(String(n)).includes(q));
}
