import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAskReview, MIN_DIVES, MIN_AGE_DAYS, MIN_INTERVAL_DAYS } from '../../app/src/lib/review-prompt.js';

const DAY = 86400000;
const now = Date.UTC(2026, 10, 13);
/** @param {object} [o] */
const ok = (o = {}) => ({
  now,
  firstOpen: now - 30 * DAY,
  lastRequest: null,
  dives: 20,
  storeBuild: true,
  downloadOk: true,
  ...o,
});

test('asks when every condition holds', () => {
  assert.ok(shouldAskReview(ok()));
});

test('dive count: at least 5', () => {
  assert.ok(!shouldAskReview(ok({ dives: MIN_DIVES - 1 })));
  assert.ok(shouldAskReview(ok({ dives: MIN_DIVES })));
});

test('age: first opened at least 7 days ago', () => {
  assert.ok(!shouldAskReview(ok({ firstOpen: now - MIN_AGE_DAYS * DAY + 1 })));
  assert.ok(shouldAskReview(ok({ firstOpen: now - MIN_AGE_DAYS * DAY })));
});

test('never on the first launch (no first-open date, or one in the future)', () => {
  assert.ok(!shouldAskReview(ok({ firstOpen: null })));
  assert.ok(!shouldAskReview(ok({ firstOpen: now + DAY })));
  assert.ok(!shouldAskReview(ok({ firstOpen: now })));
});

test('interval: at most once every 120 days', () => {
  assert.ok(!shouldAskReview(ok({ lastRequest: now - MIN_INTERVAL_DAYS * DAY + 1 })));
  assert.ok(shouldAskReview(ok({ lastRequest: now - MIN_INTERVAL_DAYS * DAY })));
  assert.ok(!shouldAskReview(ok({ lastRequest: now })));
});

test('never in a build not installed from a store', () => {
  assert.ok(!shouldAskReview(ok({ storeBuild: false })));
});

test('only after a successful download', () => {
  assert.ok(!shouldAskReview(ok({ downloadOk: false })));
});

test('never after an error or with a sync conflict', () => {
  assert.ok(!shouldAskReview(ok({ error: true })));
  assert.ok(!shouldAskReview(ok({ conflict: true })));
});
