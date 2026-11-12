import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ML_PER_CUFT } from '../../app/src/lib/planner-rules.js';
import { parseSac, sacMax, sacPresets, sacPresetText, sacText } from '../../app/src/lib/sac-field.js';

test('presets: 0 to 2 cuft/min by 0.5, 10 to 30 L/min by 5 (typing up to 60 L/min)', () => {
  assert.deepEqual(sacPresets(true).map((p) => p.unit), [0, 0.5, 1, 1.5, 2]);
  assert.deepEqual(sacPresets(false).map((p) => p.unit), [10, 15, 20, 25, 30]);
  assert.equal(sacPresets(false)[2].ml, 20000);
  assert.equal(sacPresets(true)[1].ml, Math.round(0.5 * ML_PER_CUFT));
  assert.equal(sacMax(true), 2);
  assert.equal(sacMax(false), 60);
});

test('presets are shown with one decimal in cuft/min, whole in litres', () => {
  assert.equal(sacPresetText(0.5, true, 'fr'), '0,5');
  assert.equal(sacPresetText(0, true, 'fr'), '0,0');
  assert.equal(sacPresetText(2, true, 'en'), '2.0');
  assert.equal(sacPresetText(15, false, 'fr'), '15');
});

test('a typed value: comma or point, two decimals, clamped', () => {
  assert.equal(parseSac('0,36', true), Math.round(0.36 * ML_PER_CUFT));
  assert.equal(parseSac('0.355', true), Math.round(0.36 * ML_PER_CUFT), 'rounded to two decimals');
  assert.equal(parseSac(' 17,25 ', false), 17250);
  assert.equal(parseSac('17.254', false), 17250);
  assert.equal(parseSac('3', true), Math.round(2 * ML_PER_CUFT), 'clamped to 2 cuft/min');
  assert.equal(parseSac('99', false), 60000, 'clamped to 60 L/min');
  assert.equal(parseSac('-4', false), 0, 'not below 0');
  assert.equal(parseSac('0', false), 0, '0 is a value');
});

test('text that is not a number yet gives null', () => {
  for (const text of ['', ' ', '-', ',', '0,,5', 'abc', '1e3', '1 2']) assert.equal(parseSac(text, false), null, JSON.stringify(text));
  assert.equal(parseSac('0,', false), 0, 'a trailing comma still reads');
  assert.equal(parseSac('.5', false), 500);
});

test('the field text: up to two decimals, the language decimal mark', () => {
  assert.equal(sacText(Math.round(0.36 * ML_PER_CUFT), true, 'fr'), '0,36');
  assert.equal(sacText(Math.round(0.5 * ML_PER_CUFT), true, 'en'), '0.5');
  assert.equal(sacText(20000, false, 'fr'), '20');
  assert.equal(sacText(17250, false, 'fr'), '17,25');
  assert.equal(sacText(0, false, 'en'), '0');
});

test('what is shown can be typed back unchanged', () => {
  for (const ml of [0, 10194, 17250, 20000, 56634]) {
    for (const cuft of [true, false]) {
      const kept = parseSac(sacText(ml, cuft, 'fr'), cuft);
      assert.equal(parseSac(sacText(kept, cuft, 'fr'), cuft), kept);
    }
  }
});
