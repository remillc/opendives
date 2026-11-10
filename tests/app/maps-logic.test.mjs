// Offline maps: storage guards, updates, tile count of a rectangle (spec, "Offline maps").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MB,
  GB,
  floorBytes,
  checkStart,
  checkUpdate,
  shouldPause,
  canResume,
  updateCheckDue,
  isNewer,
  stalePartials,
  usedBytes,
  inBbox,
  rectAround,
  bboxSizeKm,
  nearestSite,
  MAX_TILES,
  MAX_REGION_BYTES,
  normalizeBbox,
  tileRange,
  countTiles,
  checkTiles,
  regionHasTile,
  bboxesOverlap,
} from '../../app/src/lib/maps-logic.js';

const base = { totalBytes: 64 * GB, freeBytes: 18 * GB, usedBytes: 0, capBytes: 1 * GB };

test('the floor is 1 Go, or 10 % of the storage when that is more', () => {
  assert.equal(floorBytes(8 * GB), 1 * GB);
  assert.equal(floorBytes(64 * GB), 6.4 * GB);
});

test('a download starts when it leaves the floor and stays under the cap', () => {
  assert.deepEqual(checkStart({ ...base, sizeBytes: 80 * MB }), { ok: true });
});

test('a download that would leave less than the floor is refused (space)', () => {
  const r = checkStart({ ...base, totalBytes: 16 * GB, freeBytes: 1.1 * GB, sizeBytes: 80 * MB });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'space');
  assert.equal(r.remainingBytes, 1.1 * GB - 80 * MB);
});

test('exactly the floor is allowed', () => {
  assert.equal(checkStart({ ...base, totalBytes: 8 * GB, freeBytes: 1 * GB + 80 * MB, sizeBytes: 80 * MB }).ok, true);
});

test('the cap refuses what would exceed it (970 Mo used of 1 Go, 80 Mo more)', () => {
  const r = checkStart({ ...base, usedBytes: 970 * MB, sizeBytes: 80 * MB });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cap');
  assert.equal(checkStart({ ...base, usedBytes: 920 * MB, sizeBytes: 80 * MB }).ok, true);
});

test('an update keeps both versions when they fit', () => {
  assert.deepEqual(checkUpdate({ ...base, newBytes: 101 * MB, oldBytes: 96 * MB, usedBytes: 302 * MB }), { mode: 'both' });
});

test('an update that fits only alone replaces the old package first', () => {
  const r = checkUpdate({ ...base, newBytes: 101 * MB, oldBytes: 96 * MB, usedBytes: 950 * MB });
  assert.deepEqual(r, { mode: 'replace' });
});

test('an update that fits even alone nowhere is blocked', () => {
  const r = checkUpdate({ ...base, capBytes: 500 * MB, newBytes: 600 * MB, oldBytes: 96 * MB, usedBytes: 300 * MB });
  assert.equal(r.mode, 'blocked');
  assert.equal(r.reason, 'cap');
});

test('a running download pauses below the floor and resumes with a margin', () => {
  assert.equal(shouldPause(0.9 * GB, 8 * GB), true);
  assert.equal(shouldPause(1 * GB, 8 * GB), false);
  assert.equal(canResume(1 * GB, 8 * GB), false);
  assert.equal(canResume(1.1 * GB, 8 * GB), true);
});

test('the catalogue is read at most once a day', () => {
  const now = Date.UTC(2026, 10, 9, 12);
  assert.equal(updateCheckDue(0, now), true);
  assert.equal(updateCheckDue(now - 3600_000, now), false);
  assert.equal(updateCheckDue(now - 25 * 3600_000, now), true);
  assert.equal(updateCheckDue(now + 1000, now), true, 'a clock set back');
});

test('versions: dates and numbers', () => {
  assert.equal(isNewer('2026-03-03', '2026-10-01'), true);
  assert.equal(isNewer('2026-10-01', '2026-03-03'), false);
  assert.equal(isNewer('2026-03-03', '2026-03-03'), false);
  assert.equal(isNewer(9, 10), true);
  assert.equal(isNewer(undefined, '1'), true);
  assert.equal(isNewer('1', undefined), false);
});

test('partial files are cleaned after 7 days', () => {
  const now = Date.UTC(2026, 10, 20);
  const day = 24 * 3600_000;
  const ids = stalePartials(
    [
      { id: 'a', status: 'failed', failedAt: now - 8 * day },
      { id: 'b', status: 'failed', failedAt: now - 6 * day },
      { id: 'c', status: 'ready', failedAt: now - 30 * day },
    ],
    now,
  );
  assert.deepEqual(ids, ['a']);
});

test('used space counts a running download at the most it can take (50 MB) and an update twice', () => {
  const used = usedBytes([
    { status: 'ready', sizeBytes: 20 * MB },
    { status: 'downloading', sizeBytes: 0, bytesReceived: 10 * MB },
    { status: 'updating', sizeBytes: 30 * MB },
    { status: 'failed', sizeBytes: 0, bytesReceived: 5 * MB },
  ]);
  assert.equal(used, 20 * MB + MAX_REGION_BYTES + (30 * MB + MAX_REGION_BYTES) + 5 * MB);
});

test('a point in a box, also across the antimeridian', () => {
  assert.equal(inBbox(174, -35, [172, -36, 175, -34]), true);
  assert.equal(inBbox(176, -35, [172, -36, 175, -34]), false);
  assert.equal(inBbox(-179, 0, [170, -10, -170, 10]), true);
  assert.equal(inBbox(0, 0, [170, -10, -170, 10]), false);
});

test('a rectangle drawn around a point is about 40 x 40 km and fits at full detail', () => {
  const box = rectAround(174, -35);
  const [w, h] = bboxSizeKm(box);
  assert.ok(Math.abs(w - 40) < 1 && Math.abs(h - 40) < 1, `${w} x ${h}`);
  assert.equal(checkTiles(box).maxZoom, 14);
});

test('the nearest site names a drawn region', () => {
  const sites = [
    { name: 'Far', lng: 10, lat: 10 },
    { name: 'Northern Arch', lng: 174.7, lat: -35.9 },
  ];
  assert.equal(nearestSite(174.6, -35.8, sites)?.name, 'Northern Arch');
  assert.equal(nearestSite(0, 0, []), null);
});

test('the whole world: 1 + 4 + 16 + 64 tiles up to zoom 3', () => {
  const world = [-180, -85.0511, 180, 85.0511];
  assert.equal(countTiles(world, 0), 1);
  assert.equal(countTiles(world, 3), 85);
  assert.equal(countTiles([-180, -90, 180, 90], 3), 85, 'latitudes are clamped to Web Mercator');
});

test('a tiny rectangle: one tile per zoom', () => {
  const box = [10.001, 20.001, 10.002, 20.002];
  assert.equal(countTiles(box, 5), 6);
});

test('tile edges are inclusive: a box touching a boundary takes both tiles', () => {
  // Longitude 0 is the boundary between columns 0 and 1 at zoom 1.
  assert.equal(tileRange([-10, 10, 0, 20], 1).count, 2 * 1, 'east edge on the boundary reaches column 1');
  assert.deepEqual(tileRange([-10, 10, -0.0001, 20], 1).columns, [[0, 0]]);
});

test('across the antimeridian the tiles are counted on both sides', () => {
  const r = tileRange([170, -10, -170, 10], 2);
  assert.deepEqual(r.columns, [[3, 3], [0, 0]]);
  assert.equal(r.count, 4);
  assert.equal(countTiles([170, -10, -170, 10], 2), 1 + 4 + 4, 'zoom 0: 1; zoom 1: both columns, both rows; zoom 2: 2 x 2');
});

test('longitudes past the antimeridian are brought back', () => {
  assert.deepEqual(normalizeBbox([170, 0, 190, 10]), [170, 0, -170, 10]);
  assert.deepEqual(normalizeBbox([-190, 0, -170, 10]), [170, 0, -170, 10]);
  assert.deepEqual(normalizeBbox([-200, 0, 200, 10]), [-180, 0, 180, 10]);
  assert.deepEqual(normalizeBbox([10, 0, 180, 10]), [10, 0, 180, 10]);
});

test('3,000 tiles: fits at full detail, else less detail, else not at all', () => {
  const small = rectAround(174, -35, [10, 10]);
  assert.deepEqual([checkTiles(small).maxZoom, checkTiles(small).lessDetail], [14, false]);

  // About 3 x 3 degrees at the equator: far over 3,000 tiles at zoom 14, under at zoom 12.
  const medium = [10, -1.5, 13, 1.5];
  const c = checkTiles(medium);
  assert.ok(c.count14 > MAX_TILES && c.count12 <= MAX_TILES, `${c.count14} / ${c.count12}`);
  assert.deepEqual([c.fits14, c.fits12, c.maxZoom, c.lessDetail], [false, true, 12, true]);

  const large = [10, -5, 20, 5];
  const l = checkTiles(large);
  assert.deepEqual([l.fits14, l.fits12, l.maxZoom, l.lessDetail], [false, false, null, false]);
});

test('a region holds a tile inside its rectangle up to its maxZoom', () => {
  const region = { bbox: [10, -1.5, 13, 1.5], maxZoom: 12 };
  const { columns, rowMin } = tileRange(region.bbox, 12);
  const x = columns[0][0] + 2;
  const y = rowMin + 2;
  assert.equal(regionHasTile(region, 12, x, y), true);
  assert.equal(regionHasTile(region, 12, columns[0][0] - 1, y), false, 'outside the rectangle');
  assert.equal(regionHasTile(region, 13, x * 2, y * 2), false, 'above maxZoom');
  assert.equal(regionHasTile({ ...region, maxZoom: 14 }, 13, x * 2, y * 2), true);
});

test('rectangles overlap, also across the antimeridian', () => {
  assert.equal(bboxesOverlap([0, 0, 10, 10], [5, 5, 15, 15]), true);
  assert.equal(bboxesOverlap([0, 0, 10, 10], [10, 0, 20, 10]), false);
  assert.equal(bboxesOverlap([170, -10, -170, 10], [-175, 0, -160, 5]), true);
  assert.equal(bboxesOverlap([170, -10, -170, 10], [0, 0, 5, 5]), false);
});

test("the version of OpenFreeMap data is the build in the tile address", async () => {
  const { versionOfTemplate } = await import("../../app/src/lib/tilejson.js");
  assert.equal(versionOfTemplate("https://tiles.openfreemap.org/planet/20261104_001001_pt/{z}/{x}/{y}.pbf"), "20261104_001001_pt");
  assert.equal(versionOfTemplate("{z}/{x}/{y}"), "{z}/{x}/{y}");
  assert.equal(isNewer("20261028_001001_pt", "20261104_001001_pt"), true);
});
