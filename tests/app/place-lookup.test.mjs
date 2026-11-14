// Place of a position: Nominatim with a cache, the one-second spacing and the offline
// fallback (app/src/lib/place-lookup.js). The network is a stub.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { placeAt, parseAddress, reverseAddressUrl, resetPlaceLookup } from '../../app/src/lib/place-lookup.js';
import { resetPlacesSearch } from '../../app/src/lib/area-search.js';

const answer = (address) => ({ status: 200, body: JSON.stringify({ name: 'x', address }) });
const offlineHit = async () => ({ country: 'Canada', region: 'Ontario' });
const noOffline = async () => null;

beforeEach(() => {
  resetPlaceLookup();
  resetPlacesSearch();
});

test('the request: reverse address lookup with six decimals, the language and address details', () => {
  assert.equal(
    reverseAddressUrl(-35448500, 174732000, 'fr'),
    'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=-35.448500&lon=174.732000&accept-language=fr',
  );
});

test('address fields: country, region (state, province, region, state district), county, city (town, village...)', () => {
  assert.deepEqual(
    parseAddress(JSON.stringify({ address: { country: 'France', state: 'Bretagne', state_district: 'x', county: 'Finistère', town: 'Camaret', village: 'v' } })),
    { country: 'France', region: 'Bretagne', county: 'Finistère', city: 'Camaret' },
  );
  assert.equal(parseAddress(JSON.stringify({ address: { province: 'Alberta' } })).region, 'Alberta');
  assert.equal(parseAddress(JSON.stringify({ address: { region: 'R', state_district: 'S' } })).region, 'R');
  assert.equal(parseAddress(JSON.stringify({ address: { state_district: 'S' } })).region, 'S');
  assert.equal(parseAddress(JSON.stringify({ address: { hamlet: 'H', municipality: 'M' } })).city, 'H');
  assert.equal(parseAddress(JSON.stringify({ address: { municipality: 'M' } })).city, 'M');
  assert.equal(parseAddress(JSON.stringify({ address: { city: 'C', town: 'T' } })).city, 'C');
  // Escaped characters are decoded.
  assert.equal(parseAddress('{"address":{"country":"C\\"te d\\u00e9"}}').country, 'C"te dé');
});

test('no address (open sea), no value or an unreadable answer: no place', () => {
  assert.equal(parseAddress(JSON.stringify({ error: 'Unable to geocode' })), null);
  assert.equal(parseAddress(JSON.stringify({ address: { postcode: '1' } })), null);
  assert.equal(parseAddress('<html>'), null);
});

test('online: the place from the server, not offline', async () => {
  const urls = [];
  const get = async (url) => (urls.push(url), answer({ country: 'New Zealand', state: 'Northland', town: 'Tutukaka' }));
  const place = await placeAt(-35448500, 174732000, 'en', { get, now: () => 0, sleep: async () => {}, offlineLookup: noOffline });
  assert.deepEqual(place, { country: 'New Zealand', region: 'Northland', county: '', city: 'Tutukaka', offline: false });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /lat=-35\.448500&lon=174\.732000&accept-language=en$/);
});

test('cache: the same position and language is asked once; another language is asked again', async () => {
  let calls = 0;
  const get = async () => (calls++, answer({ country: 'Canada', state: 'Ontario' }));
  const deps = { get, now: () => 0, sleep: async () => {}, offlineLookup: noOffline };
  const first = await placeAt(45421500, -75697200, 'en', deps);
  const second = await placeAt(45421500, -75697200, 'en', deps);
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  await placeAt(45421500, -75697200, 'fr', deps);
  assert.equal(calls, 2);
});

test('rate limit: requests are spaced by more than one second', async () => {
  let clock = 10_000;
  const starts = [];
  const sleep = async (ms) => {
    clock += ms;
  };
  const get = async () => (starts.push(clock), answer({ country: 'Canada' }));
  const deps = { get, now: () => clock, sleep, offlineLookup: noOffline };
  await placeAt(1000000, 1000000, 'en', deps);
  await placeAt(2000000, 2000000, 'en', deps);
  await placeAt(3000000, 3000000, 'en', deps);
  assert.equal(starts.length, 3);
  assert.ok(starts[1] - starts[0] >= 1000, `gap ${starts[1] - starts[0]}`);
  assert.ok(starts[2] - starts[1] >= 1000, `gap ${starts[2] - starts[1]}`);
});

test('network failure: country and region from the offline file, flagged offline, not cached', async () => {
  let calls = 0;
  const get = async () => {
    calls++;
    throw new Error('NETWORK');
  };
  const deps = { get, now: () => 0, sleep: async () => {}, offlineLookup: offlineHit };
  const place = await placeAt(45421500, -75697200, 'en', deps);
  assert.deepEqual(place, { country: 'Canada', region: 'Ontario', county: '', city: '', offline: true });
  await placeAt(45421500, -75697200, 'en', deps);
  assert.equal(calls, 2);
});

test('an error status or an answer without address also falls back to the offline file', async () => {
  for (const reply of [{ status: 429, body: '' }, { status: 200, body: '{"error":"Unable to geocode"}' }]) {
    const get = async () => reply;
    const place = await placeAt(1, 1, 'fr', { get, now: () => 0, sleep: async () => {}, offlineLookup: offlineHit });
    assert.equal(place.offline, true);
  }
});

test('neither the server nor the offline file knows the position: null', async () => {
  const get = async () => {
    throw new Error('NETWORK');
  };
  assert.equal(await placeAt(30000000, -40000000, 'en', { get, now: () => 0, sleep: async () => {}, offlineLookup: noOffline }), null);
});
