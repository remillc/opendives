// @ts-check
// Where the vector tiles of the maps come from (spec, "Offline maps"): the
// downloaded PMTiles package that covers the tile, else OpenFreeMap online,
// else nothing (the simplified world map, drawn by the style, shows through).
//
// MapLibre asks for `odtiles://<channel>/{z}/{x}/{y}`. The channel names the
// map asking (the visible map, or the off-screen drawer of site-image.js), so
// that each can follow its own tiles.
import { PMTiles } from 'pmtiles';
import { OpenDivesCore } from 'opendives-core';
import { offlineMaps } from './offline-maps.svelte.js';

export const TILE_PROTOCOL = 'odtiles';
/** Highest zoom of the packages and of OpenFreeMap's tiles. */
export const TILE_MAX_ZOOM = 14;
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const ONLINE_TIMEOUT_MS = 15000;

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

/** @param {string} b64 */
function bytesOfBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * A package on the device, read by ranges through the native plugin.
 * @param {string} id
 * @returns {import('pmtiles').Source}
 */
function packageSource(id) {
  return {
    getKey: () => id,
    getBytes: async (offset, length) => {
      const core = /** @type {any} */ (OpenDivesCore);
      const { base64 } = await core.mapsReadRange({ id, offset, length });
      const bytes = bytesOfBase64(base64);
      return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    },
  };
}

/** @type {Map<string, PMTiles>} by id and version: an update opens a new archive */
const archives = new Map();

/** @param {import('./offline-maps.svelte.js').Region} region */
function archiveOf(region) {
  const key = `${region.id}@${region.version}`;
  let archive = archives.get(key);
  if (!archive) {
    for (const k of [...archives.keys()]) if (k.startsWith(`${region.id}@`)) archives.delete(k);
    archives.set(key, (archive = new PMTiles(packageSource(region.id))));
  }
  return archive;
}

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

/** @param {[number, number, number, number]} a @param {[number, number, number, number]} b */
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * The downloaded packages that cover a tile.
 * @param {number} z @param {number} x @param {number} y
 */
function regionsOfTile(z, x, y) {
  const bounds = tileBounds(z, x, y);
  return offlineMaps.regions.filter((r) => (r.status === 'ready' || r.status === 'updating') && overlap(bounds, r.bbox));
}

/** @type {Promise<string>|undefined} OpenFreeMap's current tile address, once per session */
let templatePromise;

function onlineTemplate() {
  templatePromise ??= fetch(TILEJSON_URL, { signal: AbortSignal.timeout(ONLINE_TIMEOUT_MS) })
    .then((r) => {
      if (!r.ok) throw new Error(`TileJSON: HTTP ${r.status}`);
      return r.json();
    })
    .then((json) => String(json.tiles[0]));
  templatePromise.catch(() => (templatePromise = undefined));
  return templatePromise;
}

/**
 * One tile: the package, else the network, else nothing.
 * @param {string} channel
 * @param {number} z @param {number} x @param {number} y
 * @param {AbortSignal} signal
 * @returns {Promise<ArrayBuffer>}
 */
async function fetchTile(channel, z, x, y, signal) {
  const regions = regionsOfTile(z, x, y);
  for (const region of regions) {
    try {
      const tile = await archiveOf(region).getZxy(z, x, y, signal);
      if (tile) {
        report(channel, 'local');
        return tile.data;
      }
    } catch (e) {
      // A package that cannot be read (deleted, damaged) is skipped.
      console.warn('Map package', region.id, e);
    }
  }
  // In a package's area, a tile it does not hold is empty (open sea): not a reason to ask the network.
  if (regions.length) {
    report(channel, 'local');
    return new ArrayBuffer(0);
  }
  if (navigator.onLine) {
    try {
      const url = (await onlineTemplate()).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      const response = await fetch(url, { signal });
      if (response.status === 404 || response.status === 204) {
        report(channel, 'online');
        return new ArrayBuffer(0);
      }
      if (!response.ok) throw new Error(`Tile: HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      report(channel, 'online');
      return data;
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
