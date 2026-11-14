// @ts-check
// Offline country and region of a position, from Natural Earth's states and
// provinces (core/data/regions.txt, built by tools/build-regions.mjs). Used
// when Nominatim cannot be reached. Ported from the façade's regions.cpp
// (AGENTS.md, « JavaScript first »): same file, same integer arithmetic, same
// answers.
//
// The file is loaded on the first lookup, not at start: it weighs about 1 MB.

/**
 * @typedef {Object} Region
 * @property {number} country index in the countries
 * @property {string} en
 * @property {string} fr
 * @property {number} minx bounding box, thousandths of a degree
 * @property {number} miny
 * @property {number} maxx
 * @property {number} maxy
 * @property {Int32Array[]} rings x0, y0, x1, y1, ... absolute, thousandths of a degree
 */

/**
 * @typedef {Object} RegionData
 * @property {{ en: string, fr: string }[]} countries
 * @property {Region[]} regions
 */

/**
 * Reads the text of regions.txt: "C" lines (country: code, English, French),
 * "R" lines (region: country index, English, French, bounding box), "P" lines
 * (one outline of the last region, the first point absolute and the others as
 * differences).
 * @param {string} text
 * @returns {RegionData}
 */
export function parseRegions(text) {
  /** @type {RegionData} */
  const data = { countries: [], regions: [] };
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.length < 2 || line[1] !== '\t') continue;
    if (line[0] === 'C') {
      const f = line.split('\t');
      if (f.length >= 4) data.countries.push({ en: f[2], fr: f[3] });
    } else if (line[0] === 'R') {
      const f = line.split('\t');
      if (f.length < 8) continue;
      data.regions.push({
        country: parseInt(f[1], 10),
        en: f[2],
        fr: f[3],
        minx: parseInt(f[4], 10),
        miny: parseInt(f[5], 10),
        maxx: parseInt(f[6], 10),
        maxy: parseInt(f[7], 10),
        rings: [],
      });
    } else if (line[0] === 'P' && data.regions.length > 0) {
      const values = line.slice(2).split(',');
      const ring = new Int32Array(values.length);
      let x = 0;
      let y = 0;
      for (let i = 0; i < values.length; i++) {
        const n = parseInt(values[i], 10);
        if (i % 2 === 0) ring[i] = x = i < 2 ? n : x + n;
        else ring[i] = y = i < 2 ? n : y + n;
      }
      data.regions[data.regions.length - 1].rings.push(ring);
    }
  }
  return data;
}

/**
 * Even-odd rule over all the rings of a region: holes need no marking.
 * @param {Region} r @param {number} x @param {number} y
 */
function contains(r, x, y) {
  let inside = false;
  for (const ring of r.rings) {
    const n = ring.length >> 1;
    if (n === 0) continue;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[2 * i], yi = ring[2 * i + 1], xj = ring[2 * j], yj = ring[2 * j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Distance to the outline of a region, in thousandths of a degree of latitude.
 * @param {Region} r @param {number} x @param {number} y @param {number} xscale
 */
function distance(r, x, y, xscale) {
  let best = Number.MAX_VALUE;
  for (const ring of r.rings) {
    const n = ring.length >> 1;
    if (n === 0) continue;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = ring[2 * j] * xscale, ay = ring[2 * j + 1];
      const bx = ring[2 * i] * xscale, by = ring[2 * i + 1];
      const px = x * xscale, dx = bx - ax, dy = by - ay;
      const len = dx * dx + dy * dy;
      let t = len > 0 ? ((px - ax) * dx + (y - ay) * dy) / len : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - px, ey = ay + t * dy - y;
      best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
    }
  }
  return best;
}

/**
 * The country and region of a position.
 * @param {RegionData} data
 * @param {number} latUdeg latitude, micro-degrees
 * @param {number} lonUdeg longitude, micro-degrees
 * @param {string} lang "fr" for French (any "fr..."), else English
 * @returns {{ country: string, region: string } | null} null when no region is near
 */
export function findRegion(data, latUdeg, lonUdeg, lang) {
  const x = lonUdeg / 1000;
  const y = latUdeg / 1000;
  /** @type {Region | null} */
  let found = null;
  for (const r of data.regions) {
    if (x >= r.minx && x <= r.maxx && y >= r.miny && y <= r.maxy && contains(r, x, y)) {
      found = r;
      break;
    }
  }
  if (!found) {
    // Dive sites are often off the coast: the nearest region within 30 km
    // (270 thousandths of a degree of latitude).
    const reach = 270;
    const xscale = Math.cos(((latUdeg / 1e6) * Math.PI) / 180);
    const degreeReach = reach / Math.max(xscale, 0.1);
    let best = reach;
    for (const r of data.regions) {
      if (x < r.minx - degreeReach || x > r.maxx + degreeReach || y < r.miny - reach || y > r.maxy + reach) continue;
      const d = distance(r, x, y, xscale);
      if (d < best) {
        best = d;
        found = r;
      }
    }
  }
  if (!found || found.country < 0 || found.country >= data.countries.length) return null;
  const fr = lang.startsWith('fr');
  const c = data.countries[found.country];
  return {
    country: fr && c.fr ? c.fr : c.en,
    region: fr && found.fr ? found.fr : found.en,
  };
}

/** @type {Promise<RegionData> | null} */
let loading = null;

/**
 * The file of the app, fetched on first use (Vite emits it as an asset).
 * @returns {Promise<string>}
 */
async function fetchRegionsText() {
  // @ts-ignore: a Vite asset import, resolved by the bundler only.
  const { default: url } = await import('../../../core/data/regions.txt?url');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`regions.txt ${response.status}`);
  return response.text();
}

/**
 * The country and region of a position, without the network. The file is read
 * once, on the first call.
 * @param {number} latUdeg @param {number} lonUdeg @param {string} lang
 * @param {{ loadText?: () => Promise<string> }} [deps] the source of the file's text (tests)
 * @returns {Promise<{ country: string, region: string } | null>} null when the file cannot be read or no region is near
 */
export async function offlineRegion(latUdeg, lonUdeg, lang, deps = {}) {
  const { loadText = fetchRegionsText } = deps;
  loading ??= loadText().then(parseRegions);
  try {
    return findRegion(await loading, latUdeg, lonUdeg, lang);
  } catch (e) {
    // A failed read is tried again at the next call.
    loading = null;
    console.info('Offline regions not available', String(/** @type {any} */ (e)?.message ?? e));
    return null;
  }
}

/** For the tests: forgets the loaded file. */
export function resetOfflineRegion() {
  loading = null;
}
