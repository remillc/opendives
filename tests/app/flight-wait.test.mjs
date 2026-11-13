// The wait before flying (task 2026-11-13-98): the rule, the choices of the setting, the dives
// taken from the logbook, and the notification at the end of the wait.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flightWait, flightDives, flightWaitFor, flightWaitName, FLIGHT_WAIT_MODES } from '../../app/src/lib/tools.js';
import { flightNotice, localDate, FLIGHT_LINK } from '../../app/src/lib/flight-notice.js';
import { formatDayAt } from '../../app/src/lib/format.js';

const dive = (date, endDate) => ({ date, endDate });
/** A logbook dive: start and duration in minutes. */
const logged = (date, minutes) => ({ date, durationSeconds: minutes * 60 });

test('the choices are "Selon les plongées" and 12, 18, 24 hours', () => {
  assert.deepEqual([...FLIGHT_WAIT_MODES], ['auto', '12', '18', '24']);
  assert.equal(new Set(FLIGHT_WAIT_MODES.map(flightWaitName)).size, 4);
});

test('Selon les plongées: 12 hours after one dive, counted from the surfacing time', () => {
  const w = flightWait([dive('2026-11-06T13:40:00', '2026-11-06T14:35:00')], '2026-11-06T15:35:00', 'auto');
  assert.equal(w.hours, 12);
  assert.equal(w.several, false);
  assert.equal(w.endsAt, '2026-11-07T02:35:00');
  assert.equal(w.remainingSeconds, 11 * 3600);
});

test('Selon les plongées: 18 hours after several dives the same day, from the last surfacing', () => {
  const w = flightWait(
    [dive('2026-11-06T09:12:00', '2026-11-06T10:00:00'), dive('2026-11-06T13:40:00', '2026-11-06T14:35:00')],
    '2026-11-06T15:35:00',
    'auto',
  );
  assert.equal(w.hours, 18);
  assert.equal(w.several, true);
  assert.equal(w.endsAt, '2026-11-07T08:35:00');
  assert.equal(w.remainingSeconds, 17 * 3600);
});

test('the default is Selon les plongées', () => {
  const dives = [dive('2026-11-06T13:40:00', '2026-11-06T14:35:00')];
  assert.deepEqual(flightWait(dives, '2026-11-06T15:00:00'), flightWait(dives, '2026-11-06T15:00:00', 'auto'));
});

test('fixed choices: 12, 18 and 24 hours, whatever the number of dives', () => {
  const one = [dive('2026-11-06T13:40:00', '2026-11-06T14:35:00')];
  const two = [dive('2026-11-06T09:12:00', '2026-11-06T10:00:00'), ...one];
  const now = '2026-11-06T15:35:00';
  for (const hours of [12, 18, 24]) {
    for (const dives of [one, two]) {
      const w = flightWait(dives, now, /** @type {any} */ (String(hours)));
      assert.equal(w.hours, hours);
      assert.equal(w.endsAt, new Date(Date.parse('2026-11-06T14:35:00Z') + hours * 3600_000).toISOString().slice(0, 19));
    }
  }
  assert.equal(flightWait(two, now, '24').remainingSeconds, 23 * 3600);
});

test('a wait that is over gives 0 seconds, no dive gives null', () => {
  const w = flightWait([dive('2026-11-06T13:40:00', '2026-11-06T14:35:00')], '2026-11-08T10:00:00', '12');
  assert.equal(w.remainingSeconds, 0);
  assert.equal(flightWait([], '2026-11-06T15:35:00', 'auto'), null);
});

test('the same day means the same calendar day of the start: yesterday evening does not count', () => {
  const now = '2026-11-07T10:00:00';
  const dives = flightDives([logged('2026-11-06T22:00:00', 40), logged('2026-11-07T08:00:00', 45)], now);
  assert.equal(dives.length, 1);
  assert.equal(flightWait(dives, now, 'auto').hours, 12);
});

test('flightDives: the last day only, oldest first, with the end of each dive', () => {
  const now = '2026-11-07T20:00:00';
  const dives = flightDives(
    [logged('2026-11-07T14:00:00', 50), logged('2026-11-05T09:00:00', 30), logged('2026-11-07T09:30:00', 45)],
    now,
  );
  assert.deepEqual(dives, [dive('2026-11-07T09:30:00', '2026-11-07T10:15:00'), dive('2026-11-07T14:00:00', '2026-11-07T14:50:00')]);
});

test('flightDives: a dive that starts after now is ignored; no dive gives nothing', () => {
  assert.deepEqual(flightDives([logged('2026-11-09T09:00:00', 30)], '2026-11-07T20:00:00'), []);
  assert.deepEqual(flightDives([], '2026-11-07T20:00:00'), []);
  const dives = flightDives([logged('2026-11-07T09:00:00', 30), logged('2026-11-09T09:00:00', 30)], '2026-11-07T20:00:00');
  assert.equal(dives.length, 1);
});

test('flightWaitFor: the rule on the logbook, for each choice', () => {
  const book = [logged('2026-11-06T09:12:00', 48), logged('2026-11-06T13:40:00', 55), logged('2026-11-01T10:00:00', 40)];
  const now = '2026-11-06T15:35:00';
  assert.equal(flightWaitFor(book, 'auto', now).hours, 18);
  assert.equal(flightWaitFor(book, '12', now).hours, 12);
  assert.equal(flightWaitFor(book, '24', now).endsAt, '2026-11-07T14:35:00');
  assert.equal(flightWaitFor([], 'auto', now), null);
});

test('the notification: at the end of the wait, with the hours, and it moves with a new dive', () => {
  const now = '2026-11-06T15:35:00';
  const first = flightNotice(flightDives([logged('2026-11-06T13:40:00', 55)], now), 'auto', now);
  assert.equal(first.at.getTime(), localDate('2026-11-07T02:35:00').getTime());
  assert.ok(first.body.includes('12'));
  const both = flightNotice(flightDives([logged('2026-11-06T09:12:00', 48), logged('2026-11-06T13:40:00', 55)], now), 'auto', now);
  assert.equal(both.at.getTime(), localDate('2026-11-07T08:35:00').getTime());
  assert.ok(both.body.includes('18'));
  assert.notEqual(both.body, first.body);
  assert.equal(both.title, first.title);
});

test('the notification: the day of the dives follows the day it arrives', () => {
  // Dives of the evening of the 6th, 18 h: arrives on the 7th, "yesterday's dives".
  const yesterday = flightNotice(flightDives([logged('2026-11-06T09:00:00', 40), logged('2026-11-06T17:00:00', 40)], '2026-11-06T18:00:00'), 'auto', '2026-11-06T18:00:00');
  // A dive of the early morning, 12 h: arrives the same day.
  const today = flightNotice(flightDives([logged('2026-11-06T06:00:00', 40)], '2026-11-06T07:00:00'), 'auto', '2026-11-06T07:00:00');
  assert.notEqual(yesterday.body, today.body);
  assert.ok(today.body.includes('12') && yesterday.body.includes('18'));
});

test('the notification: none when the wait is over or without dives', () => {
  const now = '2026-11-08T10:00:00';
  assert.equal(flightNotice(flightDives([logged('2026-11-06T13:40:00', 55)], now), 'auto', now), null);
  assert.equal(flightNotice([], 'auto', now), null);
  assert.equal(flightNotice(flightDives([logged('2026-11-07T13:40:00', 55)], now), '12', now), null);
  assert.ok(flightNotice(flightDives([logged('2026-11-07T13:40:00', 55)], now), '24', now));
});

test('tapping the notification opens the Desaturation tool', () => {
  assert.equal(FLIGHT_LINK, 'opendives://tools/desaturation');
});

test('a time in words: tomorrow, today, yesterday; further away as a date', () => {
  const now = '2026-11-07T10:00:00';
  const tomorrow = formatDayAt('2026-11-08T08:35:00', now);
  const today = formatDayAt('2026-11-07T20:35:00', now);
  assert.notEqual(tomorrow, today);
  assert.ok(!tomorrow.includes('flight.at'));
  assert.notEqual(formatDayAt('2026-11-04T08:35:00', now), formatDayAt('2026-11-06T08:35:00', now));
});
