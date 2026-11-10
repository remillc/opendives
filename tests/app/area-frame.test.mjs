// "Choisir sur la carte" fixed frame: zoom limits, covered rectangle, detail, estimate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameSide, kmPerPx, zoomForFrameKm, maxFrameKm, zoomLimits, clampZoom, frameBbox, frameDetail, estimateBytes, MIN_FRAME_KM, BYTES_PER_TILE } from '../../app/src/lib/area-frame.js';
import { MAX_TILES, MAX_REGION_BYTES, countTiles, bboxSizeKm } from '../../app/src/lib/maps-logic.js';

/** The frame a MapLibre map (512 px tiles, Web Mercator) shows, as the corners map.unproject would give. */
function cover(lng, lat, zoom, side) {
  const world = 512 * 2 ** zoom;
  const cx = ((lng + 180) / 360) * world;
  const cy = (0.5 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / (2 * Math.PI)) * world;
  const toLng = (x) => (x / world) * 360 - 180;
  const toLat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI;
  return frameBbox({ lng: toLng(cx - side / 2), lat: toLat(cy - side / 2) }, { lng: toLng(cx + side / 2), lat: toLat(cy + side / 2) });
}

test('frame side: 300 dp, smaller on a small visible area', () => {
  assert.equal(frameSide(390, 500), 300);
  assert.equal(frameSide(390, 250), 234);
  assert.equal(frameSide(320, 600), 288);
  assert.equal(frameSide(100, 100), 120);
});

test('kmPerPx and zoomForFrameKm agree', () => {
  const z = zoomForFrameKm(40, 20, 300);
  assert.ok(Math.abs(kmPerPx(40, z) * 300 - 20) < 1e-9);
});

test('the largest frame depends on latitude and stays within 3,000 tiles at zoom 14', () => {
  const equator = maxFrameKm(10.3, 0);
  const north = maxFrameKm(10.3, 65);
  assert.ok(equator > 100 && equator < 130, String(equator));
  assert.ok(north < equator);
  for (const lat of [-60, -35, 0, 20, 48, 65]) {
    const km = maxFrameKm(7.7, lat);
    const half = km / 2;
    const rect = [7.7 - half / (111.32 * Math.cos((lat * Math.PI) / 180)), lat - half / 110.57, 7.7 + half / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + half / 110.57];
    assert.ok(countTiles(rect, 14) <= MAX_TILES, `${lat}: ${countTiles(rect, 14)}`);
  }
});

test('at the zoom limits the frame covers 20 km at most zoomed in, and never more than 3,000 tiles zoomed out', () => {
  for (const side of [300, 234]) {
    for (const lat of [-55, -20, 0, 15, 45, 62]) {
      const lng = 3.3;
      const { minZoom, maxZoom } = zoomLimits(lng, lat, side);
      assert.ok(minZoom < maxZoom);
      const [w] = bboxSizeKm(cover(lng, lat, maxZoom, side));
      assert.ok(Math.abs(w - MIN_FRAME_KM) < 1.5, `${lat}: ${w}`);
      const out = cover(lng, lat, minZoom, side);
      assert.ok(countTiles(out, 14) <= MAX_TILES, `${lat}: ${countTiles(out, 14)} tiles`);
      assert.equal(clampZoom(0, { minZoom, maxZoom }), minZoom);
      assert.equal(clampZoom(30, { minZoom, maxZoom }), maxZoom);
    }
  }
});

test('the frame across the antimeridian gives west > east', () => {
  const box = cover(179.9, 0, 9, 300);
  assert.ok(box[0] > 0 && box[2] < 0, JSON.stringify(box));
  assert.ok(Math.abs(bboxSizeKm(box)[0] - bboxSizeKm(cover(10, 0, 9, 300))[0]) < 0.5);
});

test('frameBbox keeps latitudes inside Web Mercator', () => {
  const box = frameBbox({ lng: 0, lat: 89 }, { lng: 10, lat: -89 });
  assert.ok(box[3] < 85.06 && box[1] > -85.06);
});

test('full detail when it fits, else no download', () => {
  const small = frameDetail(cover(2, 48, 9.5, 300));
  assert.equal(small.maxZoom, 14);
  assert.ok(small.fits && small.count <= MAX_TILES);
  // Fits 3,000 tiles only at a lower zoom: not offered any more.
  const medium = frameDetail([10, -1.5, 13, 1.5]);
  assert.equal(medium.maxZoom, null);
  assert.equal(medium.fits, false);
  const large = frameDetail([10, -5, 20, 5]);
  assert.equal(large.maxZoom, null);
  assert.equal(large.fits, false);
});

test('the estimate follows the tile count and never passes 50 MB', () => {
  assert.equal(estimateBytes(1000), 1000 * BYTES_PER_TILE);
  assert.equal(estimateBytes(10 ** 7), MAX_REGION_BYTES);
  // The two measured regions bracket the figure used.
  assert.ok(2.7e6 / 463 < BYTES_PER_TILE && BYTES_PER_TILE < 4.7e6 / 484);
});
