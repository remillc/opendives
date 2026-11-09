// @ts-check
// The map behind the header of a dive (spec, "Dive detail, site map behind the
// header"): the base map of the Sites screen, drawn once off screen as a
// picture and kept on the device, so that a site seen once also shows offline.
import { MAP_STYLE } from './map-style.js';

const CACHE = 'od-site-maps-v2';
const ZOOM = 13;
/** The picture is centred on the site and reaches this far above and below it, CSS pixels. */
export const HALF_HEIGHT = 340;
/** Longer than this, the map is not coming: the plain header stays. */
const TIMEOUT_MS = 20000;

/**
 * Draws the map as a picture; an error when it cannot be complete.
 * @param {number} latUdeg
 * @param {number} lonUdeg
 * @param {number} width
 * @returns {Promise<Blob>}
 */
async function drawMap(latUdeg, lonUdeg, width) {
  const module = await import('maplibre-gl');
  /** @type {typeof import('maplibre-gl')} */
  const maplibregl = /** @type {any} */ (module).default ?? module;
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-${width + 100}px;top:0;width:${width}px;height:${HALF_HEIGHT * 2}px`;
  document.body.append(container);
  /** @type {import('maplibre-gl').Map|undefined} */
  let map;
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Site map: timeout')), TIMEOUT_MS);
      const m = new maplibregl.Map({
        container,
        style: MAP_STYLE,
        center: [lonUdeg / 1e6, latUdeg / 1e6],
        zoom: ZOOM,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      map = m;
      m.on('error', (e) => {
        clearTimeout(timer);
        reject(e.error ?? new Error('Site map'));
      });
      // No place names: they would run under the text of the header.
      m.once('load', () => {
        for (const layer of m.getStyle().layers) {
          if (layer.type === 'symbol') m.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      });
      m.once('idle', () => {
        clearTimeout(timer);
        m.getCanvas().toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Site map: no picture'))), 'image/webp', 0.85);
      });
    });
  } finally {
    map?.remove();
    container.remove();
  }
}

/**
 * The map's picture as a local address, from the device or drawn and kept. The
 * caller frees it (URL.revokeObjectURL).
 * @param {number} latUdeg
 * @param {number} lonUdeg
 * @param {number} width of the view, CSS pixels
 */
export async function loadSiteMap(latUdeg, lonUdeg, width) {
  const cache = typeof caches === 'undefined' ? null : await caches.open(CACHE);
  const key = `https://localhost/site-map/${latUdeg}/${lonUdeg}/${width}`;
  const kept = await cache?.match(key);
  if (kept) return URL.createObjectURL(await kept.blob());
  const blob = await drawMap(latUdeg, lonUdeg, width);
  await cache?.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }));
  return URL.createObjectURL(blob);
}
