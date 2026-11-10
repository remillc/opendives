// @ts-check
// The map behind the header of a dive (spec, "Dive detail, site map behind the
// header"): the base map of the Sites screen, drawn off screen as a picture and
// kept on the device. The pictures are prepared ahead, on Wi-Fi, so that a site
// shows at once, offline too.
import { OpenDivesCore } from 'opendives-core';
import { buildMapStyle } from './map-style.js';
import { onTileOrigin } from './offline-tiles.js';

const CACHE = 'od-site-maps-v4';
const ZOOM = 12;
/** The picture, centred on the site, CSS pixels: wide enough for any screen, cropped when shown. */
export const DRAW_WIDTH = 1000;
export const HALF_HEIGHT = 300;
/** Longer than this for one site, the map is not coming. */
const TIMEOUT_MS = 20000;
/**
 * OpenFreeMap's terms allow offline downloads of 3,000 tiles or 50 MB at most,
 * with 4 requests at a time (offline-tiles.js holds that limit for every tile
 * asked of the network). A site's picture needs about 6 to 12 tiles of zoom 12,
 * at 100 KB at the very most: counted after each site, a run stops at 300 tiles
 * plus the last site (about 312 tiles, 31 MB), a tenth of the 3,000 tiles; the
 * rest follows at the next load of the logbook.
 */
const MAX_TILES_PER_RUN = 300;
const PAUSE_MS = 200;

/** @param {number} latUdeg @param {number} lonUdeg */
const keyOf = (latUdeg, lonUdeg) => `https://localhost/site-map/${latUdeg}/${lonUdeg}`;

let drawers = 0;

/**
 * An off-screen map that draws one site after the other. The tiles come from a
 * downloaded package, else the network (see map-style.js).
 * @param {() => void} [onTile] called for each tile asked of the network
 */
async function createDrawer(onTile) {
  const module = await import('maplibre-gl');
  /** @type {typeof import('maplibre-gl')} */
  const maplibregl = /** @type {any} */ (module).default ?? module;
  const channel = `draw${++drawers}`;
  const { style, degraded } = await buildMapStyle(maplibregl, channel);
  // A picture is kept as the site's map only when nothing was missing.
  let missing = 0;
  const stopListening = onTileOrigin(channel, (origin) => {
    if (origin === 'online') onTile?.();
    else if (origin === 'missing') missing++;
  });
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-${DRAW_WIDTH + 100}px;top:0;width:${DRAW_WIDTH}px;height:${HALF_HEIGHT * 2}px`;
  document.body.append(container);
  const map = new maplibregl.Map({
    container,
    style,
    center: [0, 0],
    zoom: ZOOM,
    pixelRatio: 2,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  const close = () => {
    stopListening();
    map.remove();
    container.remove();
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Site map: timeout')), TIMEOUT_MS);
      map.once('error', (e) => {
        clearTimeout(timer);
        reject(e.error ?? new Error('Site map'));
      });
      map.once('load', () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
  } catch (e) {
    close();
    throw e;
  }
  // No place names: they would run under the text of the header.
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol') map.setLayoutProperty(layer.id, 'visibility', 'none');
  }

  /**
   * The picture of a site, and whether it is complete (worth keeping): not
   * when the simplified map was used or a tile could not be had.
   * @param {number} latUdeg
   * @param {number} lonUdeg
   * @returns {Promise<{ blob: Blob, complete: boolean }>}
   */
  function draw(latUdeg, lonUdeg) {
    missing = 0;
    return new Promise((resolve, reject) => {
      /** @param {{ error?: Error }} e */
      const failed = (e) => done(() => reject(e.error ?? new Error('Site map')));
      /** @param {() => void} then */
      const done = (then) => {
        clearTimeout(timer);
        map.off('error', failed);
        then();
      };
      const timer = setTimeout(() => done(() => reject(new Error('Site map: timeout'))), TIMEOUT_MS);
      map.on('error', failed);
      map.once('idle', () =>
        done(() =>
          map
            .getCanvas()
            .toBlob((blob) => (blob ? resolve({ blob, complete: !degraded && missing === 0 }) : reject(new Error('Site map: no picture'))), 'image/webp', 0.8),
        ),
      );
      map.jumpTo({ center: [lonUdeg / 1e6, latUdeg / 1e6] });
      map.triggerRepaint();
    });
  }

  return { draw, close };
}

/** @param {Cache|null} cache @param {string} key @param {Blob} blob */
async function keep(cache, key, blob) {
  await cache?.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }));
}

const openCache = async () => (typeof caches === 'undefined' ? null : caches.open(CACHE));

/**
 * The map's picture as a local address, from the device or drawn and kept. The
 * caller frees it (URL.revokeObjectURL).
 * @param {number} latUdeg
 * @param {number} lonUdeg
 */
export async function loadSiteMap(latUdeg, lonUdeg) {
  const cache = await openCache();
  const key = keyOf(latUdeg, lonUdeg);
  const kept = await cache?.match(key);
  if (kept) return URL.createObjectURL(await kept.blob());
  const drawer = await createDrawer();
  try {
    const { blob, complete } = await drawer.draw(latUdeg, lonUdeg);
    if (complete) await keep(cache, key, blob);
    return URL.createObjectURL(blob);
  } finally {
    drawer.close();
  }
}

/** Never on mobile data, nor with the app in the background. */
async function canPrepare() {
  if (document.hidden || !navigator.onLine) return false;
  return OpenDivesCore.networkStatus().then(
    (status) => status.wifi,
    () => false,
  );
}

let running = false;

/** Prepares the pictures still missing, the sites of the latest dives first. */
async function prepareSiteMaps() {
  if (running) return;
  running = true;
  /** @type {Awaited<ReturnType<typeof createDrawer>>|undefined} */
  let drawer;
  let tiles = 0;
  try {
    const cache = await openCache();
    if (!cache || !(await canPrepare())) return;
    /** @type {{ hasLocation: boolean, latUdeg: number, lonUdeg: number, dives: number, lastDate: string }[]} */
    const sites = await OpenDivesCore.siteQuery({ kind: 'list' });
    const wanted = sites.filter((s) => s.hasLocation && s.dives > 0).sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''));
    for (const site of wanted) {
      const key = keyOf(site.latUdeg, site.lonUdeg);
      if (await cache.match(key)) continue;
      if (tiles >= MAX_TILES_PER_RUN || !(await canPrepare())) break;
      drawer ??= await createDrawer(() => tiles++);
      const { blob, complete } = await drawer.draw(site.latUdeg, site.lonUdeg);
      if (!complete) break; // the map server does not answer: the next load tries again
      await keep(cache, key, blob);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  } catch (e) {
    // The map server is unavailable: the next load tries again.
    console.warn('Preparing the site maps', e);
  } finally {
    drawer?.close();
    running = false;
  }
}

/** @type {ReturnType<typeof setTimeout>|undefined} */
let timer;

/** After the logbook is loaded, once the start-up is over. */
export function schedulePreparingSiteMaps() {
  clearTimeout(timer);
  timer = setTimeout(prepareSiteMaps, 8000);
}
