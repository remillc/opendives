// Offline country and region of a position (app/src/lib/offline-region.js), against the real
// data file core/data/regions.txt. Same cases as the façade's former tests/regions_test.cpp.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { offlineRegion, parseRegions, findRegion, resetOfflineRegion } from '../../app/src/lib/offline-region.js';

const file = new URL('../../core/data/regions.txt', import.meta.url);
const loadText = () => readFile(file, 'utf8');
const at = (lat, lon, lang) => offlineRegion(Math.trunc(lat * 1e6), Math.trunc(lon * 1e6), lang, { loadText });

// Ottawa. Natural Earth (1:10 million) is only accurate to about a kilometre: along a narrow
// border river a site may fall on the wrong side. Nominatim, online, is exact.
const cases = [
  [45.4215, -75.6972, 'en', 'Canada', 'Ontario'],
  [45.4215, -75.6972, 'fr', 'Canada', 'Ontario'],
  [-35.4485, 174.732, 'en', 'New Zealand', 'Northland'], // Northern Arch, offshore
  [20.35, -87.03, 'fr', 'Mexique', 'Quintana Roo'], // off Cozumel
  [48.8566, 2.3522, 'fr', 'France', 'Île-de-France'], // région, not département
  [30.0, -40.0, 'en', null, null], // mid-Atlantic
];

for (const [lat, lon, lang, country, region] of cases) {
  test(`offline region ${lat} ${lon} ${lang}`, async () => {
    resetOfflineRegion();
    const found = await at(lat, lon, lang);
    assert.deepEqual(found, country ? { country, region } : null);
  });
}

test('the file is read once, on the first call', async () => {
  resetOfflineRegion();
  let reads = 0;
  const counting = async () => {
    reads++;
    return loadText();
  };
  assert.equal(reads, 0);
  await offlineRegion(45421500, -75697200, 'en', { loadText: counting });
  await offlineRegion(48856600, 2352200, 'en', { loadText: counting });
  assert.equal(reads, 1);
});

test('a file that cannot be read gives null and is tried again', async () => {
  resetOfflineRegion();
  const failing = async () => {
    throw new Error('offline');
  };
  assert.equal(await offlineRegion(45421500, -75697200, 'en', { loadText: failing }), null);
  assert.deepEqual(await at(45.4215, -75.6972, 'en'), { country: 'Canada', region: 'Ontario' });
});

test('parseRegions: absolute first point, differences after, CRLF lines, language and reach', () => {
  const data = parseRegions(
    ['C\tXX\tAland\tAlande', 'R\t0\tNorth\t\t0\t0\t10\t10', 'P\t0,0,10,0,0,10,-10,0', ''].join('\r\n'),
  );
  assert.equal(data.regions.length, 1);
  assert.deepEqual([...data.regions[0].rings[0]], [0, 0, 10, 0, 10, 10, 0, 10]);
  // 5000 micro-degrees = 5 thousandths of a degree: inside the square.
  assert.deepEqual(findRegion(data, 5000, 5000, 'en'), { country: 'Aland', region: 'North' });
  // A missing French name falls back to the English one.
  assert.deepEqual(findRegion(data, 5000, 5000, 'fr'), { country: 'Alande', region: 'North' });
  // Within 30 km of the outline (270 thousandths of a degree of latitude), then farther.
  assert.notEqual(findRegion(data, 5000, 200000, 'en'), null);
  assert.equal(findRegion(data, 5000, 400000, 'en'), null);
});
