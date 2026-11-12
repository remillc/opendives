// The rows of the plan table (task 73): which waypoints of the core's plan make a
// row, and the minutes written on them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planRows, roundMinutes } from '../../app/src/lib/plan-rows.js';

const air = { o2Permille: 209, hePermille: 0 };
const ean50 = { o2Permille: 500, hePermille: 0 };
const setup = { descentMmMin: 18000, ascent75MmMin: 9000, ascent50MmMin: 9000, ascentStopsMmMin: 9000, ascentLast6mMmMin: 3000 };
const seg = (timeSeconds, depthMm, cylinder, entered) => ({ timeSeconds, depthMm, cylinder, entered });
const summary = (rows) => rows.map((r) => [r.kind, r.depthMm / 1000, r.startMinutes, r.durationMinutes, r.endMinutes, r.gas ? r.gas.o2Permille : null]);

test('minutes are rounded as the plan notes do', () => {
  assert.equal(roundMinutes(29), 0);
  assert.equal(roundMinutes(30), 1);
  assert.equal(roundMinutes(89), 1);
  assert.equal(roundMinutes(90), 2);
});

test('a square plan without deco: descent, level, final ascent', () => {
  const rows = planRows({
    cylinders: [air],
    setup,
    segments: [
      seg(100, 30000, 0, true), // descent at 18 m/min
      seg(700, 30000, 0, true), // the level
      seg(860, 6000, 0, false), // calculated ascent, a transit: no row of its own
      seg(980, 0, 0, false), // last 6 m
    ],
  });
  assert.deepEqual(summary(rows), [
    ['descent', 30, 0, 2, 2, 209],
    ['level', 30, 2, 10, 12, null],
    ['ascent', 0, 12, 4, 16, null],
  ]);
  assert.equal(rows[0].speedMmMin, 18000);
  assert.equal(rows[1].speedMmMin, null);
  assert.equal(rows[2].speedMmMin, 3000);
  assert.equal(rows[2].surface, true);
  assert.equal(rows[0].surface, false);
});

test('a deco plan with two stops: the short ascent between them is counted in the next stop', () => {
  const rows = planRows({
    cylinders: [air],
    setup,
    segments: [
      seg(133, 40000, 0, true),
      seg(1500, 40000, 0, true),
      seg(1707, 9000, 0, false), // ascent to the first stop
      seg(1947, 9000, 0, false), // stop at 9 m
      seg(2007, 6000, 0, false), // ascent between the stops: no row
      seg(2427, 6000, 0, false), // stop at 6 m
      seg(2547, 0, 0, false),
    ],
  });
  assert.deepEqual(summary(rows), [
    ['descent', 40, 0, 2, 2, 209],
    ['level', 40, 2, 23, 25, null],
    ['ascent', 9, 25, 3, 28, null],
    ['stop', 9, 28, 4, 32, null],
    ['stop', 6, 32, 8, 40, null],
    ['ascent', 0, 40, 2, 42, null],
  ]);
  assert.equal(rows[2].speedMmMin, 9000);
  assert.equal(rows[3].speedMmMin, null);
  // Début + Durée = Fin up to the rounding of Subsurface, and the surface row ends at the total.
  assert.equal(rows.at(-1).endMinutes, roundMinutes(2547));
  for (const r of rows) assert.ok(Math.abs(r.startMinutes + r.durationMinutes - r.endMinutes) <= 1);
});

test('two levels and a gas switch: the gas is written on the first row and where it changes', () => {
  const rows = planRows({
    cylinders: [air, ean50],
    setup,
    segments: [
      seg(100, 30000, 0, true),
      seg(1000, 30000, 0, true),
      seg(1080, 18000, 0, true), // entered ascent to the second level
      seg(2280, 18000, 0, true),
      seg(2340, 9000, 1, false), // calculated ascent, on EAN50
      seg(2640, 9000, 1, false),
      seg(2820, 0, 1, false),
    ],
  });
  assert.deepEqual(summary(rows), [
    ['descent', 30, 0, 2, 2, 209],
    ['level', 30, 2, 15, 17, null],
    ['ascent', 18, 17, 1, 18, null],
    ['level', 18, 18, 20, 38, null],
    ['ascent', 9, 38, 1, 39, 500],
    ['stop', 9, 39, 5, 44, null],
    ['ascent', 0, 44, 3, 47, null],
  ]);
  assert.equal(rows[2].speedMmMin, 9000);
});

test('a plan without waypoints has no row', () => {
  assert.deepEqual(planRows({ cylinders: [], segments: [] }), []);
});

test('every row names its gas; the change marker stays where the gas changes (addendum)', async () => {
  const { planRows } = await import('../../app/src/lib/plan-rows.js');
  const plan = {
    setup: { descentMmMin: 18000, ascent75MmMin: 9000, ascent50MmMin: 9000, ascentStopsMmMin: 9000, ascentLast6mMmMin: 9000 },
    cylinders: [{ o2Permille: 210, hePermille: 0 }],
    segments: [
      { timeSeconds: 120, depthMm: 20000, cylinder: 0, entered: true },
      { timeSeconds: 1320, depthMm: 20000, cylinder: 0, entered: true },
      { timeSeconds: 1500, depthMm: 0, cylinder: 0, entered: false },
    ],
  };
  const rows = planRows(plan);
  assert.ok(rows.length >= 2);
  for (const r of rows) assert.deepEqual(r.breathed, { o2Permille: 210, hePermille: 0 });
  assert.equal(rows.filter((r) => r.gas).length, 1);
});
