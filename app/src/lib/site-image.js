// @ts-check
// The aerial view behind the header of a dive (spec, "Dive detail, site map
// behind the header"): Sentinel-2 cloudless 2016 by EOX, the one year under
// CC BY 4.0, so usable in an app that is sold. Credited in About. The tiles are
// kept on the device, so that a site seen once also shows offline.

const LAYER = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g';
const CACHE = 'od-site-images-v1';
/** The layer's finest level, about 10 m per pixel at the equator. */
const ZOOM = 14;
const SIZE = 256;
/** How far the view reaches around the site, above and below it, in CSS pixels. */
const ABOVE = 130;
const BELOW = 340;

/**
 * The tiles covering the view, with their position from the site.
 * @param {number} latUdeg
 * @param {number} lonUdeg
 * @param {number} width of the view, CSS pixels
 * @returns {{ url: string, left: number, top: number }[]}
 */
export function tilesAround(latUdeg, lonUdeg, width) {
  const count = 2 ** ZOOM;
  const world = SIZE * count;
  const lat = (latUdeg / 1e6) * (Math.PI / 180);
  const cx = ((lonUdeg / 1e6 + 180) / 360) * world;
  const cy = ((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * world;
  const list = [];
  for (let y = Math.floor((cy - ABOVE) / SIZE); y <= Math.floor((cy + BELOW) / SIZE); y++) {
    if (y < 0 || y >= count) continue;
    for (let x = Math.floor((cx - width / 2) / SIZE); x <= Math.floor((cx + width / 2) / SIZE); x++) {
      const column = ((x % count) + count) % count;
      list.push({ url: `${LAYER}/${ZOOM}/${y}/${column}.jpg`, left: Math.round(x * SIZE - cx), top: Math.round(y * SIZE - cy) });
    }
  }
  return list;
}

/** A tile from the device, else from the provider, then kept. @param {string} url */
async function tileBlob(url) {
  const cache = typeof caches === 'undefined' ? null : await caches.open(CACHE);
  const kept = await cache?.match(url);
  if (kept) return kept.blob();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Tile: ${response.status}`);
  await cache?.put(url, response.clone());
  return response.blob();
}

/**
 * The view's tiles as local addresses, all of them or an error: a view with
 * holes is not shown. The caller frees them (releaseTiles).
 * @param {number} latUdeg
 * @param {number} lonUdeg
 * @param {number} width
 */
export async function loadSiteTiles(latUdeg, lonUdeg, width) {
  return Promise.all(
    tilesAround(latUdeg, lonUdeg, width).map(async (tile) => ({
      src: URL.createObjectURL(await tileBlob(tile.url)),
      left: tile.left,
      top: tile.top,
    })),
  );
}

/** @param {{ src: string }[]} tiles */
export function releaseTiles(tiles) {
  for (const tile of tiles) URL.revokeObjectURL(tile.src);
}
