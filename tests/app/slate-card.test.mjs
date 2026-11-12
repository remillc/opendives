// "Ardoise pour l’eau": the card written from the core's plans, in the diver's units.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCard, layoutOf } from '../../app/src/lib/slate-share.js';
import { slateSize } from '../../app/src/lib/slate.js';

const cyl = (o2, extra = {}) => ({ o2Permille: o2, hePermille: 0, sizeMl: 0, startMbar: 0, endMbar: 0, gasUsedMl: 40000, decoGasUsedMl: 0, reserveMl: 20000, decoPressureMbar: 0, switchDepthMm: 0, bottomModMm: 0, warning: '', ...extra });
const seg = (timeSeconds, depthMm, cylinder, entered) => ({ timeSeconds, depthMm, cylinder, entered });
const setup = { descentMmMin: 18000, ascent75MmMin: 9000, ascent50MmMin: 9000, ascentStopsMmMin: 9000, ascentLast6mMmMin: 3000 };
const base = {
  error: '',
  setup,
  when: 1794000000,
  runtimeSeconds: 1740,
  maxDepthMm: 30000,
  cns: 12,
  otu: 30,
  cylinders: [cyl(320), cyl(500, { switchDepthMm: 21000 })],
  segments: [seg(100, 30000, 0, true), seg(1300, 30000, 0, true), seg(1600, 6000, 1, false), seg(1700, 6000, 1, false), seg(1740, 0, 1, false)],
};
const request = { levels: [{ depthMm: 30000, durationSeconds: 1200 }], salinity: 10300, decoModel: 0, gfLow: 30, gfHigh: 75, cylinders: [{ o2Permille: 320, hePermille: 0 }, { o2Permille: 500, hePermille: 0 }] };
const prefs = { length: 'm', volume: 'l', pressure: 'bar', temperature: 'c', weight: 'kg' };

test('the card has the plan, its gases and one Fin column per extra plan', () => {
  const longer = { ...base, runtimeSeconds: 2040, segments: [seg(100, 30000, 0, true), seg(1600, 30000, 0, true), seg(1900, 6000, 1, false), seg(2000, 6000, 1, false), seg(2040, 0, 1, false)] };
  const card = buildCard({
    result: base,
    request,
    variants: [
      { variant: { id: 'plus5', kind: 'plus5', request }, result: longer },
      { variant: { id: 'without-1', kind: 'without', cylinder: 1, request }, result: null },
    ],
    prefs,
    title: 'Épave',
  });
  assert.equal(card.title, 'Épave');
  assert.equal(card.extraHeaders.length, 2);
  assert.equal(card.extraHeaders[0], '+5 min');
  assert.ok(card.gasLine.includes('21'), card.gasLine);
  assert.ok(card.rows.length >= 3);
  const last = card.rows[card.rows.length - 1];
  assert.equal(last.end, '29');
  assert.equal(last.extra[0], '34');
  // The extra plan the core could not compute has no Fin anywhere.
  assert.ok(card.rows.every((r) => r.extra[1] === '–'));
  assert.equal(card.rows.length, card.rows.filter((r) => r.extra.length === 2).length);
});

test('the layout of the card follows its size', () => {
  const card = buildCard({ result: base, request, variants: [], prefs, title: 'x' });
  const std = layoutOf(card, slateSize(false, 'standard'));
  const full = layoutOf(card, slateSize(false, 'full'));
  assert.equal(std.widthMm, 105);
  assert.ok(full.fontPt >= std.fontPt);
});
