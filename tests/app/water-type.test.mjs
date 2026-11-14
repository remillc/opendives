// The water type named from the core's salinity (plugins/opendives-core/water-type.js), with
// the thresholds of Subsurface's get_water_type_string(), as the façade applied them before
// 14 November 2026.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waterTypeOf } from '../../plugins/opendives-core/water-type.js';

test('unknown salinity: no type', () => {
  assert.equal(waterTypeOf(0), '');
  assert.equal(waterTypeOf(-1), '');
  assert.equal(waterTypeOf(Number.NaN), '');
});

test('the thresholds: fresh < 10050 ≤ brackish < 10190 ≤ EN 13319 < 10210 ≤ salt', () => {
  assert.equal(waterTypeOf(10000), 'fresh');
  assert.equal(waterTypeOf(10049), 'fresh');
  assert.equal(waterTypeOf(10050), 'brackish');
  assert.equal(waterTypeOf(10189), 'brackish');
  assert.equal(waterTypeOf(10190), 'en13319');
  assert.equal(waterTypeOf(10209), 'en13319');
  assert.equal(waterTypeOf(10210), 'salt');
  assert.equal(waterTypeOf(10300), 'salt');
});
