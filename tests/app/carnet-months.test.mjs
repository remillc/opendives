// Carnet: month grouping and the header kept on top (spec, "Carnet, month headers that stay on top").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthKey, groupByMonth, monthYearLabel, stickyMonth } from '../../app/src/lib/carnet-months.js';

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
  assert.equal(monthYearLabel(2014, 4, 'fr-FR'), 'Avril 2014');
  assert.equal(monthYearLabel(2014, 4, 'en-US'), 'April 2014');
  assert.equal(monthYearLabel(2013, 12, 'fr'), 'Décembre 2013');
  assert.equal(monthYearLabel(2014, 0, 'en'), '');
  assert.equal(monthYearLabel(0, 4, 'en'), '');
});

// Rows of 44 (headers) and 72, from `top`; the bar ends at 100 and the kept header is 50 high.
/** @param {[string, boolean, number, number][]} spec */
const rows = (spec) => spec.map(([month, header, top, h]) => ({ month, header, top, bottom: top + h }));

const at = (month, top, bottom) => ({ month, top, bottom });

test('no month while the first row of the list is below the line', () => {
  assert.equal(stickyMonth([at('2014-04', 300, 370), at('2014-04', 370, 440)], 100, 50), null);
});

test('the month is the one of the row at the bottom of the line', () => {
  assert.equal(stickyMonth([at('2014-04', 20, 90), at('2014-04', 90, 160), at('2014-03', 160, 230)], 100, 50), '2014-04');
  assert.equal(stickyMonth([at('2014-04', 20, 140), at('2014-03', 140, 230)], 100, 50), '2014-03');
});

test('the first row of the list passing the line shows its month', () => {
  assert.equal(stickyMonth([at('2014-04', 120, 190)], 100, 50), '2014-04');
});

test('no rows below the line, no month', () => {
  assert.equal(stickyMonth([], 100, 50), null);
  assert.equal(stickyMonth([at('2014-04', 0, 50)], 100, 50), null);
});
