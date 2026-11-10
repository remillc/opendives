// Carnet: month grouping and the header kept on top (spec, "Carnet, month headers that stay on top").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthKey, groupByMonth, monthName, yearText, stickyHeader } from '../../app/src/lib/carnet-months.js';

/** @param {number} id @param {string} date @param {number} [trip] */
const dive = (id, date, trip) => ({ id, date, trip: trip ? { id: trip, location: `Trip ${trip}` } : null });

test('monthKey reads the month of a local ISO date', () => {
  assert.equal(monthKey('2014-04-09T10:05:00'), '2014-04');
  assert.equal(monthKey(''), '');
});

test('dives are grouped by month, newest first, with their counts', () => {
  const groups = groupByMonth([dive(5, '2014-04-09T10:00:00'), dive(4, '2014-04-02T10:00:00'), dive(3, '2014-03-30T10:00:00'), dive(2, '2013-12-01T10:00:00')]);
  assert.deepEqual(
    groups.map((g) => [g.key, g.year, g.month, g.count]),
    [['2014-04', 2014, 4, 2], ['2014-03', 2014, 3, 1], ['2013-12', 2013, 12, 1]],
  );
});

test('no dives, no groups', () => {
  assert.deepEqual(groupByMonth([]), []);
});

test('a trip stays one group under the month of its first dive', () => {
  // Trip 7 runs from 28 March to 3 April; a solo dive on 1 April is in April.
  const groups = groupByMonth([
    dive(6, '2014-04-05T10:00:00'),
    dive(5, '2014-04-03T10:00:00', 7),
    dive(4, '2014-04-01T10:00:00'),
    dive(3, '2014-03-30T10:00:00', 7),
    dive(2, '2014-03-28T10:00:00', 7),
    dive(1, '2014-03-20T10:00:00'),
  ]);
  assert.deepEqual(groups.map((g) => g.key), ['2014-04', '2014-03']);
  assert.deepEqual(groups[0].entries.map((e) => e.key), ['d6', 'd4']);
  assert.equal(groups[0].count, 2);
  // In March the trip comes first (its latest dive is the newest of the month) and counts its 3 dives.
  assert.deepEqual(groups[1].entries.map((e) => e.key), ['t7', 'd1']);
  assert.equal(groups[1].count, 4);
  const trip = groups[1].entries[0];
  assert.equal(trip.type === 'trip' && trip.dives.length, 3);
});

test('a trip inside one month sits where its newest dive is', () => {
  const groups = groupByMonth([dive(4, '2014-04-20T10:00:00'), dive(3, '2014-04-12T10:00:00', 9), dive(2, '2014-04-10T10:00:00', 9), dive(1, '2014-04-02T10:00:00')]);
  assert.deepEqual(groups[0].entries.map((e) => e.key), ['d4', 't9', 'd1']);
});

test('a trip of one dive is drawn as that dive', () => {
  const groups = groupByMonth([dive(2, '2014-04-20T10:00:00', 3), dive(1, '2014-03-02T10:00:00')]);
  assert.deepEqual(groups.flatMap((g) => g.entries.map((e) => e.type)), ['dive', 'dive']);
});

test('flat grouping (search results) forms no trips', () => {
  const groups = groupByMonth([dive(3, '2014-04-20T10:00:00', 9), dive(2, '2014-04-10T10:00:00', 9), dive(1, '2014-03-02T10:00:00')], true);
  assert.deepEqual(groups.map((g) => [g.key, g.count, g.entries.map((e) => e.key)]), [['2014-04', 2, ['d3', 'd2']], ['2014-03', 1, ['d1']]]);
});

test('month names and years follow the locale', () => {
  assert.equal(monthName(4, 'fr-FR'), 'Avril');
  assert.equal(monthName(4, 'en-US'), 'April');
  assert.equal(monthName(12, 'fr'), 'Décembre');
  assert.equal(monthName(0, 'en'), '');
  assert.equal(yearText(2014, 'fr-FR'), '2014');
  assert.equal(yearText(2014, 'ar-EG'), '٢٠١٤');
});

// Rows of 44 (headers) and 72, from `top`; the bar ends at 100 and the kept header is 50 high.
/** @param {[string, boolean, number, number][]} spec */
const rows = (spec) => spec.map(([month, header, top, h]) => ({ month, header, top, bottom: top + h }));

test('nothing is kept while the first header is still below the band', () => {
  const r = rows([['2014-04', true, 200, 44], ['2014-04', false, 244, 72]]);
  assert.deepEqual(stickyHeader(r, 100, 50), { month: null, shift: 0 });
});

test('the first header scrolled under the bar is kept', () => {
  const r = rows([['2014-04', true, 90, 44], ['2014-04', false, 134, 72]]);
  assert.deepEqual(stickyHeader(r, 100, 50), { month: '2014-04', shift: 0 });
});

test('the kept month is the one of the row at the bar, inside a month', () => {
  const r = rows([['2014-04', false, 60, 72], ['2014-04', false, 132, 72], ['2014-04', false, 204, 72]]);
  assert.deepEqual(stickyHeader(r, 100, 50), { month: '2014-04', shift: 0 });
});

test('the next header pushes the kept one out, then replaces it', () => {
  // Header top at 160, kept header ends at 150: not touching yet.
  const pushing = rows([['2014-04', false, 60, 72], ['2014-03', true, 160, 44]]);
  assert.deepEqual(stickyHeader(pushing, 100, 50), { month: '2014-04', shift: 0 });
  const touching = rows([['2014-04', false, 40, 72], ['2014-03', true, 130, 44]]);
  assert.deepEqual(stickyHeader(touching, 100, 50), { month: '2014-04', shift: -20 });
  // Header just under the bar: the kept one is almost out and the next is about to take over.
  const gone = rows([['2014-04', false, 30, 72], ['2014-03', true, 102, 44]]);
  assert.deepEqual(stickyHeader(gone, 100, 50), { month: '2014-04', shift: -48 });
  const replaced = rows([['2014-04', false, -50, 72], ['2014-03', true, 99, 44]]);
  assert.deepEqual(stickyHeader(replaced, 100, 50), { month: '2014-03', shift: 0 });
});

test("inside a long open trip the band keeps the trip's month", () => {
  const r = rows([['2014-03', false, 60, 72], ['2014-03', false, 132, 72], ['2014-03', false, 204, 72]]);
  assert.equal(stickyHeader(r, 100, 50).month, '2014-03');
});

test('no rows below the bar, nothing is kept', () => {
  assert.deepEqual(stickyHeader([], 100, 50), { month: null, shift: 0 });
  assert.deepEqual(stickyHeader(rows([['2014-04', false, 0, 50]]), 100, 50), { month: null, shift: 0 });
});
