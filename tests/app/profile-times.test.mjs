// Entry and exit times and the average-depth label of the profile chart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entryExitTimes, meanLabelY } from '../../app/src/lib/profile-times.js';

/** A 24-hour formatter like formatTimeOfDay. */
function fmt(iso, after = 0) {
  const d = new Date(`${iso}Z`);
  d.setTime(d.getTime() + after * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

test('the exit is the entry plus the length of the profile, not the file duration', () => {
  // The mock-up: entry 10:00, profile of 82:50 -> 11:23 (rounded to the minute).
  assert.deepEqual(entryExitTimes('2026-11-12T10:00:00', 82 * 60 + 50, fmt), { entry: '10:00', exit: '11:23' });
  assert.equal(entryExitTimes('2026-11-12T10:00:40', 82 * 60 + 10, fmt)?.exit, '11:23');
  assert.deepEqual(entryExitTimes('2026-11-12T10:00:00', 78 * 60, fmt), { entry: '10:00', exit: '11:18' });
});

test('the exit may fall on the next day', () => {
  assert.equal(entryExitTimes('2026-11-12T23:30:00', 3600, fmt)?.exit, '00:30');
});

test('without a start there is nothing to write', () => {
  assert.equal(entryExitTimes(undefined, 600, fmt), null);
});

test('the mean label stays at the line height when no depth label is near', () => {
  assert.equal(meanLabelY(70, [10, 40, 100], 10, 150), 70);
});

test('the mean label moves to the nearest free place beside a depth label', () => {
  const y = meanLabelY(72, [70, 130], 10, 150);
  assert.equal(y, 81);
  assert.ok(Math.abs(y - 70) >= 11);
});

test('the mean label stays inside the plot', () => {
  assert.equal(meanLabelY(2, [], 10, 150), 10);
  assert.equal(meanLabelY(200, [], 10, 150), 150);
});
