import test from 'node:test';
import assert from 'node:assert/strict';
import { readGauges, numberTokens, printedUnit, toMbar, isPlausible, MIN_CONFIDENCE } from '../../app/src/lib/gauge-reading.js';

/** A block at the given position, 0.3 wide and 0.15 high unless given. */
const block = (text, left, top = 0.4, w = 0.3, h = 0.15, confidence = 0.95) => ({ text, left, top, right: left + w, bottom: top + h, confidence });

test('number tokens: digits, decimal comma or point, thousands space', () => {
  assert.deepEqual(numberTokens('2950'), [2950]);
  assert.deepEqual(numberTokens('2 950'), [2950]);
  assert.deepEqual(numberTokens('207,5 bar'), [207.5]);
  assert.deepEqual(numberTokens('PSI'), []);
  assert.deepEqual(numberTokens('12 34'), [12, 34]);
});

test('printed unit', () => {
  assert.equal(printedUnit('PSI'), 'psi');
  assert.equal(printedUnit('210 Bar'), 'bar');
  assert.equal(printedUnit('barometer'), null);
  assert.equal(printedUnit('210'), null);
});

test('conversion and plausibility', () => {
  assert.equal(toMbar(200, 'bar'), 200000);
  assert.equal(toMbar(3000, 'psi'), 206843);
  assert.ok(isPlausible(350, 'bar'));
  assert.ok(!isPlausible(351, 'bar'));
  assert.ok(isPlausible(5000, 'psi'));
  assert.ok(!isPlausible(5001, 'psi'));
  assert.ok(!isPlausible(0, 'bar'));
});

test('one digital gauge with a printed unit', () => {
  const r = readGauges([block('2950', 0.3), block('PSI', 0.4, 0.6, 0.1, 0.05)], { userUnit: 'bar' });
  assert.equal(r.length, 1);
  assert.equal(r[0].unit, 'psi');
  assert.equal(r[0].value, 2950);
  assert.equal(r[0].mbar, toMbar(2950, 'psi'));
});

test('no printed unit: above 400 is psi, else the diver unit', () => {
  assert.equal(readGauges([block('3000', 0.3)], { userUnit: 'bar' })[0].unit, 'psi');
  assert.equal(readGauges([block('210', 0.3)], { userUnit: 'bar' })[0].unit, 'bar');
  assert.equal(readGauges([block('210', 0.3)], { userUnit: 'psi' })[0].unit, 'psi');
});

test('implausible values are dropped', () => {
  assert.deepEqual(readGauges([block('9999', 0.3)], { userUnit: 'bar' }), []);
  assert.deepEqual(readGauges([block('400 bar', 0.3)], { userUnit: 'bar' }), []);
  assert.deepEqual(readGauges([block('0', 0.3)], { userUnit: 'bar' }), []);
});

test('low confidence is not shown', () => {
  assert.deepEqual(readGauges([block('210', 0.3, 0.4, 0.3, 0.15, MIN_CONFIDENCE - 0.01)], { userUnit: 'bar' }), []);
  assert.equal(readGauges([block('210', 0.3, 0.4, 0.3, 0.15, MIN_CONFIDENCE)], { userUnit: 'bar' }).length, 1);
});

test('two gauges: ordered left to right whatever the input order', () => {
  const r = readGauges([block('2950', 0.62, 0.4, 0.25), block('2680', 0.05, 0.4, 0.25)], { userUnit: 'psi' });
  assert.deepEqual(r.map((x) => x.value), [2680, 2950]);
  assert.ok(r[0].x < r[1].x);
});

test('two gauges keep their own printed unit', () => {
  const r = readGauges(
    [block('200', 0.02, 0.4, 0.2), block('BAR', 0.05, 0.6, 0.1, 0.05), block('2900', 0.7, 0.4, 0.25), block('PSI', 0.75, 0.6, 0.1, 0.05)],
    { userUnit: 'bar' },
  );
  assert.deepEqual(r.map((x) => x.unit), ['bar', 'psi']);
});

test('a small number beside a gauge does not make a third gauge, the biggest number wins', () => {
  const r = readGauges([block('210', 0.1, 0.4, 0.3, 0.2), block('3', 0.45, 0.45, 0.04, 0.05)], { userUnit: 'bar' });
  assert.equal(r.length, 1);
  assert.equal(r[0].value, 210);
});

test('three separate gauges: only the two biggest are kept', () => {
  const r = readGauges([block('100', 0.0, 0.4, 0.1), block('200', 0.4, 0.4, 0.2), block('150', 0.8, 0.4, 0.19)], { userUnit: 'bar' });
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.value), [200, 150]);
});

test('nothing read when there is no number', () => {
  assert.deepEqual(readGauges([block('PSI', 0.3)], { userUnit: 'bar' }), []);
  assert.deepEqual(readGauges([], { userUnit: 'bar' }), []);
});
