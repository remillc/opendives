// Desaturation: when the wait before flying ends, and the relative days.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flightWait } from '../../app/src/lib/tools.js';
import { formatDateTime, formatRelativeDateTime } from '../../app/src/lib/format.js';

const dive = (date, endDate) => ({ date, endDate });

test('after one dive, the wait ends 12 hours after surfacing', () => {
  const w = flightWait([dive('2026-11-06T13:40:00', '2026-11-06T14:35:00')], '2026-11-07T10:00:00');
  assert.equal(w.remainingSeconds, 0);
  assert.equal(w.endsAt, '2026-11-07T02:35:00');
});

test('after several dives in a day, 18 hours', () => {
  const w = flightWait([dive('2026-11-06T09:12:00', '2026-11-06T10:00:00'), dive('2026-11-06T13:40:00', '2026-11-06T14:35:00')], '2026-11-06T15:35:00');
  assert.equal(w.endsAt, '2026-11-07T08:35:00');
  assert.equal(w.remainingSeconds, 17 * 3600);
});

test('today and yesterday are relative, older dates are not', () => {
  const now = '2026-11-07T10:00:00';
  const today = formatRelativeDateTime('2026-11-07T08:35:00', now);
  const yesterday = formatRelativeDateTime('2026-11-06T13:40:00', now);
  assert.notEqual(today, formatDateTime('2026-11-07T08:35:00'));
  assert.notEqual(yesterday, formatDateTime('2026-11-06T13:40:00'));
  assert.equal(today.charAt(0), today.charAt(0).toLocaleUpperCase());
  assert.equal(formatRelativeDateTime('2026-11-05T13:40:00', now), formatDateTime('2026-11-05T13:40:00'));
});

test('in the middle of a sentence, no capital', () => {
  const text = formatRelativeDateTime('2026-11-07T08:35:00', '2026-11-07T10:00:00', false);
  assert.equal(text.charAt(0), text.charAt(0).toLocaleLowerCase());
});
