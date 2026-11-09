// @ts-check
// The map behind the header of a dive (spec, "Dive detail, site map behind the
// header"): the base map of the Sites screen, drawn off screen as a picture and
// kept on the device. The pictures are prepared ahead, on Wi-Fi, so that a site
// shows at once, offline too.
import { OpenDivesCore } from 'opendives-core';
import { MAP_STYLE } from './map-style.js';

const CACHE = 'od-site-maps-v3';
const ZOOM = 13;
/** The picture, centred on the site, CSS pixels: wide enough for any screen, cropped when shown. */
export const DRAW_WIDTH = 1000;
export const HALF_HEIGHT = 300;
/** Longer than this for one site, the map is not coming. */
const TIMEOUT_MS = 20000;
/**
 * OpenFreeMap's terms allow offline downloads of 3,000 tiles or 50 MB at most.
 * At about 100 KB a tile, this stays under both; the rest follows at the next
 * load of the logbook. One site at a time, so never more than 4 requests by far.
 */
const MAX_TILES_PER_RUN = 500;
const PAUSE_MS = 200;

/** @param {number} latUdeg @param {number} lonUdeg */
const keyOf = (latUdeg, lonUdeg) => `https://localhost/site-map/${latUdeg}/${lonUdeg}`;

/**
 * An off-screen map that draws one site after the other.
 * @param {() => void} [onTile] called for each tile asked
 */
async function createDrawer(onTile) {
  const module = await import('maplibre-gl');
  /** @type {typeof import('maplibre-gl')} */
  const maplibregl = /** @type {any} */ (module).default ?? module;
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-${DRAW_WIDTH + 100}px;top:0;width:${DRAW_WIDTH}px;height:${HALF_HEIGHT * 2}px`;
  document.body.append(container);
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLE,
    center: [0, 0],
    zoom: ZOOM,
    pixelRatio: 2,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    transformRequest: (url) => {
      if (url.endsWith('.pbf')) onTile?.();
      return { url };
    },
  });
  const close = () => {
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
   * The picture of a site; an error when it cannot be complete.
   * @param {number} latUdeg
   * @param {number} lonUdeg
   * @returns {Promise<Blob>}
   */
  function draw(latUdeg, lonUdeg) {
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
        done(() => map.getCanvas().toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Site map: no picture'))), 'image/webp', 0.8)),
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
    const blob = await drawer.draw(latUdeg, lonUdeg);
    await keep(cache, key, blob);
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
      await keep(cache, key, await drawer.draw(site.latUdeg, site.lonUdeg));
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
