// The surface interval and the overlap the Desaturation tool reads from the dives the core
// used (app/src/lib/desaturation.js). The case of 13 November 2026: the same dive twice at
// 16:10, 30 minutes, which made the core return a negative interval.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlapStart, surfaceSeconds } from '../../app/src/lib/desaturation.js';

/** @param {string} date @param {number} minutes */
const dive = (date, minutes) => {
  const end = new Date(Date.parse(`${date}Z`) + minutes * 60000).toISOString().slice(0, 19);
  return { date, endDate: end };
};

test('no dive counts: -1', () => {
  assert.equal(surfaceSeconds([], '2026-11-13T18:49:00'), -1);
});

test('the interval runs from the end of the last dive', () => {
  const dives = [dive('2026-11-13T10:00:00', 45), dive('2026-11-13T16:10:00', 30)];
  assert.equal(surfaceSeconds(dives, '2026-11-13T18:49:00'), 2 * 3600 + 9 * 60);
});

test('two dives at the same time: the interval is still from the last end, not « over 48 h »', () => {
  const dives = [dive('2026-11-13T16:10:00', 30), dive('2026-11-13T16:10:00', 30)];
  assert.equal(surfaceSeconds(dives, '2026-11-13T18:49:00'), 2 * 3600 + 9 * 60);
});

test('a dive not over yet: 0, never negative', () => {
  assert.equal(surfaceSeconds([dive('2026-11-14T10:59:00', 30)], '2026-11-14T11:00:00'), 0);
});

test('the latest end counts even when a short dive starts later', () => {
  const dives = [dive('2026-11-13T09:00:00', 120), dive('2026-11-13T09:30:00', 10)];
  assert.equal(surfaceSeconds(dives, '2026-11-13T12:00:00'), 3600);
});

test('no overlap: null', () => {
  assert.equal(overlapStart([dive('2026-11-13T10:00:00', 45), dive('2026-11-13T16:10:00', 30)]), null);
  assert.equal(overlapStart([]), null);
});

test('the start of the first dive that begins before the previous one ends', () => {
  assert.equal(overlapStart([dive('2026-11-13T16:10:00', 30), dive('2026-11-13T16:10:00', 30)]), '2026-11-13T16:10:00');
  assert.equal(overlapStart([dive('2026-11-13T16:30:00', 30), dive('2026-11-13T16:10:00', 30)]), '2026-11-13T16:30:00');
});

test('back to back is not an overlap', () => {
  assert.equal(overlapStart([dive('2026-11-13T16:10:00', 30), dive('2026-11-13T16:40:00', 20)]), null);
});
