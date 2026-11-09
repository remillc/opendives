// Offline maps: storage guards, updates, suggestions (spec, "Offline maps").
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
  estimateBytes,
  nearestSite,
  packageForPoint,
  suggestZones,
  matchesSearch,
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

test('used space counts downloads at their final size and an update twice', () => {
  const used = usedBytes([
    { status: 'ready', sizeBytes: 96 * MB },
    { status: 'downloading', sizeBytes: 80 * MB, bytesReceived: 10 * MB },
    { status: 'updating', sizeBytes: 100 * MB, update: { sizeBytes: 110 * MB } },
    { status: 'failed', sizeBytes: 70 * MB, bytesReceived: 5 * MB },
  ]);
  assert.equal(used, 96 * MB + 80 * MB + 210 * MB + 5 * MB);
});

test('a point in a box, also across the antimeridian', () => {
  assert.equal(inBbox(174, -35, [172, -36, 175, -34]), true);
  assert.equal(inBbox(176, -35, [172, -36, 175, -34]), false);
  assert.equal(inBbox(-179, 0, [170, -10, -170, 10]), true);
  assert.equal(inBbox(0, 0, [170, -10, -170, 10]), false);
});

test('a drawn region: about 150 x 140 km is about 24 Mo', () => {
  const box = rectAround(174, -35);
  const mb = estimateBytes(box) / MB;
  assert.ok(mb > 20 && mb < 30, `${mb} Mo`);
});

test('the nearest site names a drawn region', () => {
  const sites = [
    { name: 'Far', lng: 10, lat: 10 },
    { name: 'Northern Arch', lng: 174.7, lat: -35.9 },
  ];
  assert.equal(nearestSite(174.6, -35.8, sites)?.name, 'Northern Arch');
  assert.equal(nearestSite(0, 0, []), null);
});

const north = { id: 'nz-northland', kind: 'zone', names: { fr: 'Northland', en: 'Northland' }, country: 'nz', bbox: [172.5, -36.5, 175, -34.3], sizeBytes: 80 * MB, version: 1, sha256: '', url: '' };
const canterbury = { id: 'nz-canterbury', kind: 'zone', names: { en: 'Canterbury' }, country: 'nz', bbox: [170, -44, 173, -42], sizeBytes: 96 * MB, version: 1, sha256: '', url: '' };
const nz = { id: 'nz', kind: 'country', names: { en: 'New Zealand' }, country: 'nz', bbox: [166, -48, 179, -34], sizeBytes: 640 * MB, version: 1, sha256: '', url: '' };

test('the smallest zone, else the country, contains a point', () => {
  assert.equal(packageForPoint(174, -35, [nz, north, canterbury])?.id, 'nz-northland');
  assert.equal(packageForPoint(168, -46, [nz, north, canterbury])?.id, 'nz');
  assert.equal(packageForPoint(0, 0, [nz, north, canterbury]), null);
});

test('suggestions: zones of the trips first, then by number of sites; countries are not suggested', () => {
  const out = suggestZones({
    sites: [
      { name: 'Northern Arch', lng: 174.7, lat: -35.9, dives: 1 },
      { name: 'Poor Knights', lng: 174.7, lat: -35.5, dives: 3 },
      { name: 'Lake Coleridge', lng: 171.5, lat: -43.3, dives: 2 },
      { name: 'Nowhere', lng: 0, lat: 0, dives: 1 },
    ],
    trips: [{ name: 'Canterbury', date: '2014-04-02', sites: [{ name: 'Lake Coleridge', lng: 171.5, lat: -43.3 }] }],
    catalogue: [nz, north, canterbury],
  });
  assert.deepEqual(out.map((o) => o.pkg.id), ['nz-canterbury', 'nz-northland']);
  assert.deepEqual(out[0].trips, [{ name: 'Canterbury', date: '2014-04-02' }]);
  assert.deepEqual(out[1].sites.map((s) => s.name), ['Northern Arch', 'Poor Knights']);
});

test('search ignores case and accents and finds a country code', () => {
  assert.equal(matchesSearch({ ...nz, names: { fr: 'Nouvelle-Zélande' } }, 'zelande'), true);
  assert.equal(matchesSearch(north, 'NZ'), true);
  assert.equal(matchesSearch(north, 'fiord'), false);
  assert.equal(matchesSearch(north, ''), true);
});
