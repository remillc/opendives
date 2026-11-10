// @ts-check
// Where the vector tiles of the maps come from (spec, "Offline maps"): the
// downloaded region that holds the tile (read by the native plugin), else
// OpenFreeMap online, else nothing (the simplified world map, drawn by the
// style, shows through).
//
// MapLibre asks for `odtiles://<channel>/{z}/{x}/{y}`. The channel names the
// map asking (the visible map, or the off-screen drawer of site-image.js), so
// that each can follow its own tiles.
import { OpenDivesCore } from 'opendives-core';
import { offlineMaps } from './offline-maps.svelte.js';
import { regionHasTile, inBbox, MAX_ZOOM_FULL } from './maps-logic.js';
import { readTileSource } from './tilejson.js';

export const TILE_PROTOCOL = 'odtiles';
/** Highest zoom of the downloaded regions and of OpenFreeMap's tiles. */
export const TILE_MAX_ZOOM = MAX_ZOOM_FULL;
/** OpenFreeMap's terms: at most 4 tile requests at a time. */
export const MAX_PARALLEL_TILE_REQUESTS = 4;

/** @typedef {'local'|'online'|'missing'} TileOrigin */
/** @type {Map<string, Set<(origin: TileOrigin) => void>>} */
const listeners = new Map();

/**
 * Hears where each tile of a channel came from.
 * @param {string} channel
 * @param {(origin: TileOrigin) => void} listener
 * @returns {() => void} stops listening
 */
export function onTileOrigin(channel, listener) {
  let set = listeners.get(channel);
  if (!set) listeners.set(channel, (set = new Set()));
  set.add(listener);
  return () => set?.delete(listener);
}

/** @param {string} channel @param {TileOrigin} origin */
const report = (channel, origin) => listeners.get(channel)?.forEach((l) => l(origin));

/**
 * West, south, east, north of a tile, degrees.
 * @param {number} z @param {number} x @param {number} y
 * @returns {[number, number, number, number]}
 */
export function tileBounds(z, x, y) {
  const n = 2 ** z;
  const lat = (/** @type {number} */ row) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

/**
 * The downloaded regions that hold a tile: inside the rectangle, and at a zoom
 * up to the region's maxZoom.
 * @param {number} z @param {number} x @param {number} y
 */
function regionsOfTile(z, x, y) {
  return offlineMaps.regions.filter((r) => (r.status === 'ready' || r.status === 'updating') && regionHasTile(r, z, x, y));
}

/**
 * The highest zoom the map may show at a point. Online: the tiles' own. Offline,
 * over a region downloaded at maxZoom 12 (less detail), zoom 12: past it no tile
 * exists and the map would go blank, so it stops there. Over several regions,
 * the most detailed one counts; outside any region the simplified world map
 * shows at any zoom, as before.
 * @param {number} lng @param {number} lat
 */
export function zoomCapAt(lng, lat) {
  if (offlineMaps.online) return TILE_MAX_ZOOM;
  const here = offlineMaps.regions.filter((r) => (r.status === 'ready' || r.status === 'updating') && inBbox(lng, lat, r.bbox));
  return here.length ? Math.max(...here.map((r) => r.maxZoom ?? TILE_MAX_ZOOM)) : TILE_MAX_ZOOM;
}

/**
 * Applies the offline zoom cap to a map, for its current centre. Call it when
 * the map stops moving and when the connection or the regions change.
 * @param {import('maplibre-gl').Map} map
 */
export function applyZoomCap(map) {
  const c = map.getCenter();
  const cap = zoomCapAt(c.lng, c.lat);
  if (map.getMaxZoom() !== cap) map.setMaxZoom(cap);
}

/** @type {Promise<string>|undefined} OpenFreeMap's current tile address, once per session */
let templatePromise;

function onlineTemplate() {
  templatePromise ??= readTileSource().then((source) => source.template);
  templatePromise.catch(() => (templatePromise = undefined));
  return templatePromise;
}

/** Network tile requests running now, and those waiting for a place (at most 4 at a time). */
let running = 0;
/** @type {(() => void)[]} */
const waiting = [];

/**
 * Waits for one of the 4 places. Rejects if the request is cancelled while it waits.
 * @param {AbortSignal} signal
 */
async function acquire(signal) {
  if (running < MAX_PARALLEL_TILE_REQUESTS) {
    running++;
    return;
  }
  // The place is handed over by release(), which keeps `running` as it is.
  await new Promise((resolve, reject) => {
    const go = () => {
      signal.removeEventListener('abort', cancel);
      resolve(undefined);
    };
    const cancel = () => {
      const i = waiting.indexOf(go);
      if (i >= 0) waiting.splice(i, 1);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    waiting.push(go);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

/** @param {string} b64 */
function bytesOfBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * One tile: the downloaded region, else the network, else nothing.
 * @param {string} channel
 * @param {number} z @param {number} x @param {number} y
 * @param {AbortSignal} signal
 * @returns {Promise<ArrayBuffer>}
 */
async function fetchTile(channel, z, x, y, signal) {
  const regions = regionsOfTile(z, x, y);
  const core = /** @type {any} */ (OpenDivesCore);
  for (const region of regions) {
    try {
      const { base64 } = await core.mapsReadTile({ id: region.id, z, x, y });
      report(channel, 'local');
      return base64 ? bytesOfBase64(base64) : new ArrayBuffer(0);
    } catch (e) {
      // A region that cannot be read (deleted, damaged) or lacks the tile is skipped.
      console.warn('Map region', region.id, e);
    }
  }
  // In a region's area, a tile it does not hold is empty (open sea): not a reason to ask the network.
  if (regions.length) {
    report(channel, 'local');
    return new ArrayBuffer(0);
  }
  if (navigator.onLine) {
    try {
      const url = (await onlineTemplate()).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      await acquire(signal);
      let response;
      try {
        response = await fetch(url, { signal });
        if (response.status === 404 || response.status === 204) {
          report(channel, 'online');
          return new ArrayBuffer(0);
        }
        if (!response.ok) throw new Error(`Tile: HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        report(channel, 'online');
        return data;
      } finally {
        release();
      }
    } catch (e) {
      if (signal.aborted) throw e;
      report(channel, 'missing');
      throw e;
    }
  }
  report(channel, 'missing');
  return new ArrayBuffer(0);
}

let registered = false;

/**
 * Teaches MapLibre the `odtiles://` addresses. Once per page.
 * @param {typeof import('maplibre-gl')} maplibregl
 */
export function registerTileProtocol(maplibregl) {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(TILE_PROTOCOL, async (params, abortController) => {
    const [channel, z, x, y] = params.url.slice(`${TILE_PROTOCOL}://`.length).split('/');
    return { data: await fetchTile(channel, +z, +x, +y, abortController.signal) };
  });
}
