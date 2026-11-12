// The graphic gas summaries: drawn levels, gas change line, accessible names.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { depthAt, equipmentLabel, fillLevels, gasChangeLine, gasChanges, gasGroupLabel } from '../../app/src/lib/gas-summary.js';

test('levels are relative to the working pressure', () => {
  assert.deepEqual(fillLevels(200000, 100000, 200000), { start: 1, end: 0.5 });
  assert.deepEqual(fillLevels(150000, 50000, 200000), { start: 0.75, end: 0.25 });
});

test('levels are capped at full', () => {
  assert.deepEqual(fillLevels(250000, 220000, 200000), { start: 1, end: 1 });
});

test('without a working pressure the start pressure stands in', () => {
  assert.deepEqual(fillLevels(200000, 50000, 0), { start: 1, end: 0.25 });
});

test('an unknown start gives no start level; an unknown end fills to the start in full colour', () => {
  assert.deepEqual(fillLevels(0, 100000, 200000), { start: null, end: 0.5 });
  assert.deepEqual(fillLevels(200000, 0, 200000), { start: null, end: 1 });
  assert.deepEqual(fillLevels(150000, 0, 200000), { start: null, end: 0.75 });
  assert.deepEqual(fillLevels(0, 0, 0), { start: null, end: 0 });
});

test('the start level is never below the end level', () => {
  assert.deepEqual(fillLevels(100000, 150000, 200000), { start: 0.75, end: 0.75 });
});

const samples = { timeSeconds: [0, 60, 120, 180], depthMm: [0, 10000, 20000, 15000] };
const cylinders = [
  { o2Permille: 0, hePermille: 0 },
  { o2Permille: 500, hePermille: 0 },
  { o2Permille: 1000, hePermille: 0 },
  { o2Permille: 160, hePermille: 450 },
];

test('depthAt reads the last sample at or before the time', () => {
  assert.equal(depthAt(samples, 0), 0);
  assert.equal(depthAt(samples, 100), 10000);
  assert.equal(depthAt(samples, 180), 15000);
  assert.equal(depthAt(samples, 999), 15000);
  assert.equal(depthAt({ timeSeconds: [], depthMm: [] }, 5), 0);
});

test('gas changes: after the start only, in time order, with their depth', () => {
  const events = [
    { type: 'gaschange', timeSeconds: 120, cylinder: 0 },
    { type: 'gaschange', timeSeconds: 0, cylinder: 3 },
    { type: 'gaschange', timeSeconds: 60, cylinder: 1 },
    { type: 'other', timeSeconds: 70, cylinder: 2 },
    { type: 'gaschange', timeSeconds: 70, cylinder: 9 },
  ];
  const out = gasChanges(events, samples, cylinders);
  assert.deepEqual(
    out.map((c) => [c.kind, c.depthMm]),
    [
      ['nitrox', 10000],
      ['air', 20000],
    ],
  );
});

const words = {
  line: 'Switch {list}.',
  item: '{to} at {depth}',
  then: ', then ',
  to: { air: 'to air', oxygen: 'to oxygen', nitrox: 'to EAN{o2}', trimix: 'to trimix {o2}/{he}' },
};
const fmt = (/** @type {number} */ mm) => `${mm / 1000} m`;

test('the gas change line: none, one, several', () => {
  assert.equal(gasChangeLine([], fmt, words), '');
  assert.equal(gasChangeLine([{ kind: 'air', o2: 21, he: 0, depthMm: 67000 }], fmt, words), 'Switch to air at 67 m.');
  assert.equal(
    gasChangeLine(
      [
        { kind: 'trimix', o2: 16, he: 45, depthMm: 60000 },
        { kind: 'nitrox', o2: 50, he: 0, depthMm: 21000 },
        { kind: 'oxygen', o2: 100, he: 0, depthMm: 6000 },
      ],
      fmt,
      words,
    ),
    'Switch to trimix 16/45 at 60 m, then to EAN50 at 21 m, then to oxygen at 6 m.',
  );
});

test('the Gas group name', () => {
  const w = { group: 'Gas: {list}', cylinder: '{gas} from {start} to {end}', cylinderGas: '{gas}', join: ', ' };
  assert.equal(
    gasGroupLabel(
      [
        { gas: 'Trimix 16/45', start: '2 683', end: '1 885 psi' },
        { gas: 'Air', start: '', end: '' },
      ],
      w,
    ),
    'Gas: Trimix 16/45 from 2 683 to 1 885 psi, Air',
  );
});

test('the Equipment card name', () => {
  const w = {
    both: 'Equipment: {suit}, weights {weight}',
    weightOnly: 'Equipment: weights {weight}',
    suitOnly: 'Equipment: {suit}',
    show: 'Show details',
    hide: 'Hide details',
  };
  assert.equal(equipmentLabel({ suit: 'dry suit', weight: '35 lb', open: false }, w), 'Equipment: dry suit, weights 35 lb. Show details');
  assert.equal(equipmentLabel({ suit: '', weight: '35 lb', open: true }, w), 'Equipment: weights 35 lb. Hide details');
  assert.equal(equipmentLabel({ suit: 'dry suit', weight: '', open: false }, w), 'Equipment: dry suit. Show details');
});

test('the Equipment card opens only when it would show more than the total', async () => {
  const { equipmentOpens, equipmentLabel } = await import('../../app/src/lib/gas-summary.js');
  assert.equal(equipmentOpens([{ description: 'unknown' }]), false);
  assert.equal(equipmentOpens([{ description: '' }]), false);
  assert.equal(equipmentOpens([{ description: 'belt' }]), true);
  assert.equal(equipmentOpens([{ description: 'belt' }, { description: 'ankle' }]), true);
  const words = { both: '{suit}, {weight}', weightOnly: '{weight}', suitOnly: '{suit}', show: 'Show', hide: 'Hide' };
  assert.equal(equipmentLabel({ suit: 'dry', weight: '7 lb', open: false, opens: false }, words), 'dry, 7 lb');
  assert.equal(equipmentLabel({ suit: 'dry', weight: '7 lb', open: false }, words), 'dry, 7 lb. Show');
});

test('the Equipment card also opens with several dive computers, and its name adds the computer', async () => {
  const { equipmentOpens, equipmentLabel } = await import('../../app/src/lib/gas-summary.js');
  assert.equal(equipmentOpens([], 1), false);
  assert.equal(equipmentOpens([{ description: 'unknown' }], 1), false);
  assert.equal(equipmentOpens([], 2), true);
  assert.equal(equipmentOpens([{ description: 'unknown' }], 2), true);
  const words = { both: 'Equipment: {suit}, weights {weight}', weightOnly: 'Equipment: weights {weight}', suitOnly: 'Equipment: {suit}', show: 'Show', hide: 'Hide', computer: ', computer {name}', computerOnly: 'Equipment: computer {name}' };
  assert.equal(equipmentLabel({ suit: 'dry', weight: '7 lb', computer: 'Perdix', open: false, opens: false }, words), 'Equipment: dry, weights 7 lb, computer Perdix');
  assert.equal(equipmentLabel({ suit: '', weight: '', computer: 'Perdix', open: true }, words), 'Equipment: computer Perdix. Hide');
});

test('unused cylinders: listed with the setting on, drawn full with "not used" or their one pressure', async () => {
  const { cylinderListed, unusedShown } = await import('../../app/src/lib/gas-summary.js');
  assert.equal(cylinderListed({ used: false }, true), true);
  assert.equal(cylinderListed({ used: false }, false), false);
  assert.equal(cylinderListed({ used: true }, false), true);
  assert.deepEqual(unusedShown({ used: false, startMbar: 0, endMbar: 0 }), { pressureMbar: 0 });
  assert.deepEqual(unusedShown({ used: false, startMbar: 207000, endMbar: 207000 }), { pressureMbar: 207000 });
  assert.equal(unusedShown({ used: true, startMbar: 0, endMbar: 0 }), null);
  assert.equal(unusedShown({ used: false, startMbar: 200000, endMbar: 150000 }), null);
});
