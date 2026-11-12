import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altitudeMax, altitudeText, parseAltitude } from '../../app/src/lib/altitude-field.js';

test('any whole value is allowed, clamped to 0..4500 m or 0..15000 ft', () => {
  assert.equal(altitudeMax(false), 4500);
  assert.equal(altitudeMax(true), 15000);
  assert.equal(parseAltitude('1250', false), 1250);
  assert.equal(parseAltitude(' 450 ', false), 450);
  assert.equal(parseAltitude('9000', false), 4500);
  assert.equal(parseAltitude('20000', true), 15000);
  assert.equal(parseAltitude('-30', false), 0);
  assert.equal(parseAltitude('0', true), 0);
  assert.equal(parseAltitude('1 500', false), 1500, 'a typed group separator is ignored');
});

test('a decimal is rounded to a whole value', () => {
  assert.equal(parseAltitude('1200,6', false), 1201);
  assert.equal(parseAltitude('1200.4', false), 1200);
});

test('text that is not a number yet gives null', () => {
  for (const text of ['', ' ', '-', ',', 'abc', '1e3', '1,,5']) assert.equal(parseAltitude(text, false), null, JSON.stringify(text));
});

test('the text shown reads back unchanged', () => {
  for (const v of [0, 300, 1000, 4500, 15000]) assert.equal(parseAltitude(altitudeText(v, 'fr'), false) === Math.min(4500, v), true);
  assert.equal(altitudeText(1000, 'fr'), '1000');
});
