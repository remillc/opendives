// Durations: from one hour, as each language writes hours and minutes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { formatDuration, formatHours } from '../../app/src/lib/format.js';

const plain = (text) => text.replace(/\u00a0/g, ' ');
const units = (lang) => JSON.parse(readFileSync(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8')).units.hoursMinutes;

test('each language has its own way of writing hours and minutes', () => {
  assert.equal(plain(units('fr')), '{h} h {mm}');
  assert.equal(units('en'), '{h}:{mm}');
});

test('from one hour, automatic reads as the totals do', () => {
  assert.equal(formatDuration(4260, 'mixed'), formatHours(4260));
});

test('under one hour, automatic stays in minutes', () => {
  assert.equal(plain(formatDuration(2700, 'mixed')), '45 min');
});

test('always minutes', () => {
  assert.equal(plain(formatDuration(4320, 'minutes')), '72 min');
});
