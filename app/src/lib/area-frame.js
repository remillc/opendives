// @ts-check
// "Choisir sur la carte" with a fixed frame: the pure rules (no DOM, no map).
// The frame stays still on the screen; the diver moves and zooms the map under
// it, and the downloaded area is what the frame covers. The map's zoom limits
// keep that area between about 20 km across and the largest square that fits
// OpenFreeMap's limit of 3,000 tiles at full detail (zoom 14).

import { MAX_TILES, MAX_REGION_BYTES, countTiles, checkTiles, bboxSizeKm, normalizeBbox, rectAround } from './maps-logic.js';

/** Regions are always downloaded at full detail. */
const DETAIL_ZOOM = 14;
/** Side of the frame on a normal screen, dp (CSS px). */
export const FRAME_DP = 300;
/** Smallest area the frame may cover, km across. */
export const MIN_FRAME_KM = 20;
/** Smallest frame side on a very small visible area, px. */
const MIN_SIDE = 120;
const EQUATOR_KM = 40075.017;
/** MapLibre draws its tiles at 512 px. */
const TILE_PX = 512;
/**
 * Mean size of a vector tile of OpenFreeMap, bytes, for the estimate. Two real
 * regions measured on the device: 484 tiles at zoom 14 weighed 4.7 MB (9.7 kB
 * a tile) and 463 tiles weighed 2.7 MB (5.8 kB a tile). 8 kB sits between the
 * two; the figure shown is only ever "about".
 */
export const BYTES_PER_TILE = 8000;
/** The zoom limits keep this share of the largest frame, because a square on screen is not exactly a square in km at its edges (Mercator). */
const SAFETY = 0.9;

/** Side of the frame, px: 300 dp, smaller when the visible part of the map is. @param {number} width @param {number} visibleHeight */
export function frameSide(width, visibleHeight) {
  return Math.max(MIN_SIDE, Math.floor(Math.min(FRAME_DP, width - 32, visibleHeight - 16)));
}

/** Kilometres in one CSS px of the map at a latitude and zoom. @param {number} lat @param {number} zoom */
export function kmPerPx(lat, zoom) {
  return (EQUATOR_KM * Math.cos((clampLat(lat) * Math.PI) / 180)) / (TILE_PX * 2 ** zoom);
}

/** @param {number} lat */
const clampLat = (lat) => Math.max(-80, Math.min(80, lat));

/** The map zoom at which a frame of `sidePx` covers `km`. @param {number} lat @param {number} km @param {number} sidePx */
export function zoomForFrameKm(lat, km, sidePx) {
  return Math.log2((sidePx * EQUATOR_KM * Math.cos((clampLat(lat) * Math.PI) / 180)) / (TILE_PX * km));
}

/**
 * The largest square (km across) centred here whose tiles up to zoom 14 stay
 * within the limit. It depends on latitude: a degree of longitude is shorter
 * towards the poles, but a tile is too, so the same km hold more tiles there.
 * @param {number} lng @param {number} lat
 */
export function maxFrameKm(lng, lat) {
  let lo = MIN_FRAME_KM;
  let hi = 3000;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const half = mid / 2;
    if (countTiles(rectAround(lng, lat, [half, half]), DETAIL_ZOOM) <= MAX_TILES) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The map's zoom limits for a frame of `sidePx` at this centre: the frame may
 * cover from about 20 km across to the largest area the limit allows.
 * @param {number} lng @param {number} lat @param {number} sidePx
 * @returns {{ minZoom: number, maxZoom: number }}
 */
export function zoomLimits(lng, lat, sidePx) {
  const maxKm = Math.max(MIN_FRAME_KM * 1.5, maxFrameKm(lng, lat) * SAFETY);
  const minZoom = Math.max(0, zoomForFrameKm(lat, maxKm, sidePx));
  const maxZoom = Math.max(minZoom + 0.5, zoomForFrameKm(lat, MIN_FRAME_KM, sidePx));
  return { minZoom, maxZoom };
}

/** A zoom brought inside the limits. @param {number} zoom @param {{ minZoom: number, maxZoom: number }} limits */
export function clampZoom(zoom, { minZoom, maxZoom }) {
  return Math.max(minZoom, Math.min(maxZoom, zoom));
}

/**
 * The rectangle a frame covers, from the map's own projection of the frame's
 * top-left and bottom-right corners (`map.unproject`). Longitudes past the
 * antimeridian are brought back; a box that then runs west to east across it
 * keeps west > east, as everywhere else in the app.
 * @param {{ lng: number, lat: number }} topLeft @param {{ lng: number, lat: number }} bottomRight
 * @returns {[number, number, number, number]}
 */
export function frameBbox(topLeft, bottomRight) {
  const limit = 85.0511287798066;
  const south = Math.max(-limit, bottomRight.lat);
  const north = Math.min(limit, topLeft.lat);
  return normalizeBbox([topLeft.lng, south, bottomRight.lng, north]);
}

/**
 * Size of what a frame covers. `maxZoom` is null when the area is over the
 * limit of 3,000 tiles at full detail: no download.
 * @param {number[]} bbox
 * @returns {{ maxZoom: 14|null, count: number, fits: boolean, km: [number, number], bytes: number }}
 */
export function frameDetail(bbox) {
  const c = checkTiles(bbox);
  const fits = c.count14 <= MAX_TILES;
  return { maxZoom: fits ? DETAIL_ZOOM : null, count: c.count14, fits, km: bboxSizeKm(bbox), bytes: estimateBytes(c.count14) };
}

/** The estimated download, bytes: never above the 50 MB at which a download stops. @param {number} tileCount */
export function estimateBytes(tileCount) {
  return Math.min(MAX_REGION_BYTES, tileCount * BYTES_PER_TILE);
}
