// Durations: one way of writing hours and minutes across the app.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration, formatHours } from '../../app/src/lib/format.js';

const plain = (text) => text.replace(/\u00a0/g, ' ');

test('from one hour, automatic reads as the totals do', () => {
  assert.equal(plain(formatDuration(4260, 'mixed')), '1 h 11');
  assert.equal(formatDuration(4260, 'mixed'), formatHours(4260));
});

test('under one hour, automatic stays in minutes', () => {
  assert.equal(plain(formatDuration(2700, 'mixed')), '45 min');
});

test('always hours and minutes', () => {
  assert.equal(plain(formatDuration(2700, 'hours')), '0 h 45');
});

test('always minutes', () => {
  assert.equal(plain(formatDuration(4320, 'minutes')), '72 min');
});
