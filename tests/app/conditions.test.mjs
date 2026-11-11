// "Conditions" collapsed in "Modifier la plongée" (inbox task 2026-11-11-44):
// average of the ratings that are set, its one-decimal text, and the fill of
// each star.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conditionsMean, roundHalfUp1, starFill } from '../../app/src/lib/conditions.js';

test('the average ignores the ratings that are not set', () => {
  assert.equal(conditionsMean([4, 0, 1, 0, 0]), 2.5);
  assert.equal(conditionsMean([2, 2, 2, 3]), 2.25);
  assert.equal(conditionsMean([5]), 5);
});

test('no rating set: no average', () => {
  assert.equal(conditionsMean([0, 0, 0]), null);
  assert.equal(conditionsMean([]), null);
});

test('the average is shown rounded half up to one decimal', () => {
  assert.equal(roundHalfUp1(2.25), 2.3);
  assert.equal(roundHalfUp1(1.75), 1.8);
  assert.equal(roundHalfUp1(7 / 3), 2.3);
  assert.equal(roundHalfUp1(4 / 3), 1.3);
  assert.equal(roundHalfUp1(5), 5);
});

test('each star is filled by its part of the exact average', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => starFill(2.25, i)), [1, 1, 0.25, 0, 0]);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => starFill(5, i)), [1, 1, 1, 1, 1]);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => starFill(0, i)), [0, 0, 0, 0, 0]);
});
