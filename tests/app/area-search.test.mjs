// "Choisir sur la carte" search: site filter, default rectangle, Nominatim helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReverse, placeNameAt, resetPlacesSearch as resetForReverse, foldText, filterSites, rectForPoint, waitBeforeRequest, placesUrl, placesKey, parsePlaces, NOMINATIM_GAP_MS } from '../../app/src/lib/area-search.js';
import { checkTiles, bboxSizeKm } from '../../app/src/lib/maps-logic.js';

const site = (name, country, lat, lon, hasLocation = true) => ({ name, country, hasLocation, latUdeg: lat * 1e6, lonUdeg: lon * 1e6 });
const sites = [
  site('Lake Coleridge', 'New Zealand', -43.3, 171.5),
  site('Île d\'Yeu', 'France', 46.7, -2.35),
  site('Coleraine reef', 'Ireland', 55.1, -6.7),
  site('Nowhere', 'France', 0, 0, false),
  site('Blue Hole Dahab', 'Egypt', 28.57, 34.54),
];

test('foldText drops accents and case', () => {
  assert.equal(foldText('  Île  D\'Yeu '), 'ile d\'yeu');
});

test('filterSites: word starts on name or country, no position left out', () => {
  assert.deepEqual(filterSites('cole', sites).map((s) => s.name), ['Coleraine reef', 'Lake Coleridge']);
  assert.deepEqual(filterSites('ile', sites).map((s) => s.name), ['Île d\'Yeu']);
  assert.deepEqual(filterSites('france', sites).map((s) => s.name), ['Île d\'Yeu']);
  assert.deepEqual(filterSites('lake cole', sites).map((s) => s.name), ['Lake Coleridge']);
  assert.deepEqual(filterSites('', sites), []);
  assert.deepEqual(filterSites('nowh', sites), []);
});

test('filterSites: prefix of the name first, converts micro-degrees, limit', () => {
  const r = filterSites('cole', sites);
  assert.equal(r[0].detail, 'Ireland');
  const lake = filterSites('lake', sites)[0];
  assert.equal(lake.lat, -43.3);
  assert.equal(lake.lng, 171.5);
  assert.equal(filterSites('cole', sites, 1).length, 1);
  const many = Array.from({ length: 20 }, (_, i) => site(`Reef ${i}`, 'X', 1, 1));
  assert.equal(filterSites('reef', many).length, 5);
});

test('rectForPoint: 40 x 40 km where it fits the limit at zoom 14, smaller towards the poles', () => {
  const [w, h] = bboxSizeKm(rectForPoint(171.5, -43.3));
  assert.ok(Math.abs(w - 40) < 0.5 && Math.abs(h - 40) < 0.5);
  assert.ok(checkTiles(rectForPoint(171.5, -43.3)).fits14);
  for (const lat of [0, 30, 60, 70, 78, 84]) {
    assert.ok(checkTiles(rectForPoint(10, lat)).fits14, `fits at ${lat}`);
  }
  const [w84] = bboxSizeKm(rectForPoint(10, 84));
  assert.ok(w84 < 40);
});

test('waitBeforeRequest keeps requests at least a second apart', () => {
  assert.ok(NOMINATIM_GAP_MS >= 1000);
  assert.equal(waitBeforeRequest(1000, 1200), NOMINATIM_GAP_MS - 200);
  assert.equal(waitBeforeRequest(1000, 5000), 0);
});

test('placesUrl and placesKey', () => {
  const url = new URL(placesUrl('  Dahab ', 'fr'));
  assert.equal(url.hostname, 'nominatim.openstreetmap.org');
  assert.equal(url.searchParams.get('q'), 'Dahab');
  assert.equal(url.searchParams.get('accept-language'), 'fr');
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(placesKey('  ÎLE ', 'fr'), placesKey('ile', 'fr'));
});

test('searchPlaces: one request a second apart, answers cached', async () => {
  const { searchPlaces, resetPlacesSearch } = await import('../../app/src/lib/area-search.js');
  resetPlacesSearch();
  let clock = 10_000;
  const calls = [];
  const deps = {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchFn: async (url) => {
      calls.push(clock);
      return { ok: true, json: async () => [{ lat: '1', lon: '2', display_name: `${url.length}, X` }] };
    },
  };
  await searchPlaces('dahab', 'en', deps);
  await searchPlaces('sharm', 'en', deps);
  await searchPlaces('Dahab', 'en', deps); // cached
  assert.equal(calls.length, 2);
  assert.ok(calls[1] - calls[0] >= 1000);
  const failing = { ...deps, fetchFn: async () => ({ ok: false, status: 429 }) };
  await assert.rejects(searchPlaces('x', 'en', failing));
});

test('parsePlaces', () => {
  const json = [
    { lat: '28.5', lon: '34.5', name: 'Dahab', display_name: 'Dahab, South Sinai, Egypt' },
    { lat: 'x', lon: '1', display_name: 'Bad' },
    { lat: '89', lon: '1', display_name: 'Pole' },
  ];
  assert.deepEqual(parsePlaces(json), [{ name: 'Dahab', detail: 'South Sinai, Egypt', lng: 34.5, lat: 28.5 }]);
  assert.deepEqual(parsePlaces(null), []);
});

test('the name of a place comes from the reverse answer', () => {
  assert.equal(parseReverse({ name: 'Bonaire' }), 'Bonaire');
  assert.equal(parseReverse({ display_name: 'Kralendijk, Bonaire' }), 'Kralendijk');
  assert.equal(parseReverse({ error: 'Unable to geocode' }), null);
});

test('a failed reverse request gives no name', async () => {
  resetForReverse();
  const deps = { now: () => 0, sleep: async () => {} };
  assert.equal(await placeNameAt(1, 2, 'fr', { ...deps, fetchFn: async () => { throw new Error('offline'); } }), null);
  resetForReverse();
  assert.equal(await placeNameAt(1, 2, 'fr', { ...deps, fetchFn: async () => ({ ok: false, status: 500, json: async () => ({}) }) }), null);
});
