// "Ardoise pour l’eau" (task 2026-11-12-76): the requests of the extra plans, the sizes by
// paper, the matching of rows between plans, the card layout and its text. Nothing here
// computes decompression: the extra plans are requests for the core's planner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignRows,
  cardHtml,
  decoGasIndexes,
  slateLayout,
  slatePageHtml,
  slateSize,
  slateSizes,
  slateText,
  variantRequests,
  FEET_STEP_MM,
  METRE_STEP_MM,
} from '../../app/src/lib/slate.js';

const request = {
  levels: [
    { depthMm: 15000, durationSeconds: 600 },
    { depthMm: 30000, durationSeconds: 1200 },
  ],
  bottomSacMlMin: 20000,
  cylinders: [{ o2Permille: 320, hePermille: 0 }, { o2Permille: 500, hePermille: 0 }, { o2Permille: 1000, hePermille: 0 }],
};
const all = { plus5: true, plusDepth: true, without: [1, 2], feet: false };

test('the extra plans, in the order of the columns', () => {
  const v = variantRequests(request, request.levels, all);
  assert.deepEqual(v.map((x) => x.id), ['plus5', 'plusDepth', 'without-1', 'without-2']);
});

test('plus 5 min lengthens the deepest level only', () => {
  const [v] = variantRequests(request, request.levels, { ...all, plusDepth: false, without: [] });
  assert.deepEqual(v.request.levels, [{ depthMm: 15000, durationSeconds: 600 }, { depthMm: 30000, durationSeconds: 1500 }]);
});

test('plus 3 m or plus 10 ft deepens every level and keeps the times', () => {
  const m = variantRequests(request, request.levels, { ...all, plus5: false, without: [] })[0];
  assert.deepEqual(m.request.levels.map((l) => l.depthMm), [15000 + METRE_STEP_MM, 30000 + METRE_STEP_MM]);
  const ft = variantRequests(request, request.levels, { ...all, plus5: false, without: [], feet: true })[0];
  assert.deepEqual(ft.request.levels.map((l) => l.depthMm), [15000 + FEET_STEP_MM, 30000 + FEET_STEP_MM]);
  assert.deepEqual(ft.request.levels.map((l) => l.durationSeconds), [600, 1200]);
});

test('without a gas removes that cylinder and nothing else', () => {
  const v = variantRequests(request, request.levels, { plus5: false, plusDepth: false, without: [2], feet: false });
  assert.equal(v.length, 1);
  assert.deepEqual(v[0].request.cylinders.map((c) => c.o2Permille), [320, 500]);
  assert.deepEqual(v[0].request.levels, request.levels);
  assert.equal(v[0].request.bottomSacMlMin, 20000);
});

test('the bottom gas is never offered to be lost; only the deco gases', () => {
  assert.deepEqual(decoGasIndexes(request.cylinders), [1, 2]);
  const v = variantRequests(request, request.levels, { plus5: false, plusDepth: false, without: [0, 1], feet: false });
  assert.deepEqual(v.map((x) => x.cylinder), [1]);
});

test("the requests leave the plan's own request alone", () => {
  const before = JSON.stringify(request);
  variantRequests(request, request.levels, all);
  assert.equal(JSON.stringify(request), before);
});

test('without levels (a measured profile not simplified) there are no plus plans', () => {
  const v = variantRequests({ cylinders: request.cylinders }, null, all);
  assert.deepEqual(v.map((x) => x.id), ['without-1', 'without-2']);
});

test('sizes by paper region, the default first', () => {
  const us = slateSizes(true);
  assert.deepEqual(us.map((s) => [s.id, s.widthMm, s.heightMm]), [['standard', 101.6, 152.4], ['small', 76.2, 127], ['full', 215.9, 279.4]]);
  const eu = slateSizes(false);
  assert.deepEqual(eu.map((s) => [s.id, s.widthMm, s.heightMm]), [['standard', 105, 148], ['small', 74, 105], ['full', 210, 297]]);
  assert.equal(slateSize(false, 'nonsense').id, 'standard');
  assert.equal(slateSize(true, 'small').widthMm, 76.2);
});

const row = (kind, depth, end, extra = {}) => ({ kind, depthMm: depth * 1000, surface: depth === 0, startMinutes: 0, durationMinutes: 1, endMinutes: end, gas: null, breathed: null, speedMmMin: null, ...extra });
const base = [row('descent', 30, 2), row('level', 30, 22), row('ascent', 6, 25), row('stop', 6, 28), row('ascent', 0, 29)];

test('rows are matched by order for the levels and by depth for the stops', () => {
  const plus = [row('descent', 33, 2), row('level', 33, 22), row('ascent', 6, 26), row('stop', 6, 30), row('ascent', 0, 31)];
  const lines = alignRows(base, [plus]);
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.map((l) => l.ends[0]), [2, 22, 26, 30, 31]);
  assert.ok(lines.every((l) => l.inBase));
});

test('a stop only an extra plan has is inserted after the row before it', () => {
  const longer = [row('descent', 30, 2), row('level', 30, 27), row('ascent', 9, 29), row('stop', 9, 31), row('ascent', 6, 32), row('stop', 6, 35), row('ascent', 0, 36)];
  const lines = alignRows(base, [longer]);
  assert.deepEqual(lines.map((l) => [l.row.depthMm / 1000, l.inBase, l.ends[0]]), [
    [30, true, 2], [30, true, 27], [9, false, 29], [9, false, 31], [6, true, 32], [6, true, 35], [0, true, 36],
  ]);
});

test('a stop the extra plan lacks has no Fin, a failed plan has none anywhere', () => {
  const shorter = [row('descent', 30, 2), row('level', 30, 20), row('ascent', 0, 23)];
  const lines = alignRows(base, [shorter, null]);
  assert.deepEqual(lines.map((l) => l.ends), [[2, null], [20, null], [null, null], [null, null], [23, null]]);
});

test('two extra plans share the inserted row', () => {
  const a = [row('descent', 30, 2), row('level', 30, 27), row('ascent', 9, 29), row('stop', 9, 31), row('ascent', 0, 33)];
  const b = [row('descent', 30, 2), row('level', 30, 28), row('ascent', 9, 30), row('stop', 9, 33), row('ascent', 0, 35)];
  const lines = alignRows(base, [a, b]);
  assert.equal(lines.filter((l) => !l.inBase).length, 2);
  assert.deepEqual(lines.filter((l) => !l.inBase).map((l) => l.ends), [[29, 30], [31, 33]]);
});

test('the layout never goes under 5 pt and a larger card allows a larger font', () => {
  const small = slateLayout({ widthMm: 74, heightMm: 105 }, 30, 4, 10);
  assert.equal(small.fontPt, 5);
  const full = slateLayout({ widthMm: 215.9, heightMm: 279.4 }, 10, 2);
  assert.equal(full.fontPt, 10);
  const std = slateLayout({ widthMm: 101.6, heightMm: 152.4 }, 8, 2);
  assert.ok(std.fontPt <= 8 && std.fontPt >= 5);
  const more = slateLayout({ widthMm: 101.6, heightMm: 152.4 }, 8, 4, 10);
  assert.ok(more.fontPt <= std.fontPt);
  assert.equal(std.widthMm, 101.6);
});

const card = {
  title: 'Épave & <Lac>',
  subtitle: '12 nov. 2026 · Bühlmann ZH-L16, GF 30/75 · Eau de mer',
  gasLine: 'EAN32 au fond · EAN50 à 21 m',
  headers: { depth: 'Palier', gas: 'Gaz', duration: 'Durée', end: 'Fin' },
  extraHeaders: ['+5 min'],
  rows: [
    { symbol: '↓', depth: '30 m', gas: 'EAN32', gasChange: false, duration: '2', end: '2', extra: ['2'] },
    { symbol: '–', depth: '6 m', gas: 'EAN50', gasChange: true, duration: '3', end: '28', extra: ['–'] },
  ],
  note: 'Fin en minutes depuis la mise à l’eau.',
  gasNeeded: 'Gaz nécessaire : EAN32 2 000 L',
  oxygen: 'CNS 22 % · 52 OTU',
  footer: 'Créé avec OpenDives.',
};

test('the text aligns the table and keeps every line of the card', () => {
  const lines = slateText(card).split('\n');
  assert.equal(lines[0], card.title);
  assert.equal(lines[2], card.gasLine);
  const table = lines.slice(4, 7);
  assert.ok(table[0].includes('Palier') && table[0].includes('+5 min'));
  assert.ok(table[1].includes('30 m') && table[2].includes('EAN50'));
  assert.deepEqual(lines.slice(-4), [card.note, card.gasNeeded, card.oxygen, card.footer]);
});

test('the card html escapes the texts, writes the sizes in mm and underlines the gas changes', () => {
  const layout = slateLayout({ widthMm: 101.6, heightMm: 152.4 }, 2, 1);
  const html = cardHtml(card, layout);
  assert.ok(html.includes('Épave &amp; &lt;Lac&gt;'));
  assert.ok(html.includes('width:101.6mm;height:152.4mm'));
  assert.equal(html.match(/text-decoration:underline/g).length, 1);
});

test('the sheet is one page of the paper, with cut marks unless the card fills the page', () => {
  const std = slateLayout({ widthMm: 101.6, heightMm: 152.4 }, 2, 1);
  const html = slatePageHtml(card, std, true, 'fr');
  assert.ok(html.includes('size: letter'));
  assert.equal(html.match(/background:#000000/g).length, 8);
  const full = slateLayout({ widthMm: 210, heightMm: 297 }, 2, 1);
  const a4 = slatePageHtml(card, full, false, 'fr');
  assert.ok(a4.includes('size: A4'));
  assert.equal(a4.match(/background:#000000/g), null);
});
