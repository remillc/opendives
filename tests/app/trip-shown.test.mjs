// "Retirer du voyage" only for a trip the diver sees as a trip (task 2026-11-12-67).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shownTrip } from '../../app/src/lib/trip-shown.js';

const manual1 = { id: 1, location: '', autogen: false };
const auto2 = { id: 2, location: 'Lock 21', autogen: true };
const dives = [
  { id: 10, trip: null },
  { id: 11, trip: manual1 },
  { id: 12, trip: auto2 },
  { id: 13, trip: auto2 },
];

test('a dive outside any trip has no trip to leave', () => {
  assert.equal(shownTrip(dives[0], dives), null);
});

test('a trip of one dive, even made by hand and unnamed, is not shown (the case of dive 88554)', () => {
  assert.equal(shownTrip(dives[1], dives), null);
});

test('an automatic trip of two dives is shown, so its dives can leave it', () => {
  assert.equal(shownTrip(dives[2], dives), auto2);
});
