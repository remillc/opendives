// "Not duplicates" marks: dropped when either site changes name or position.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDismissed, parseMarks, withMark, withoutMark, pairKey } from '../../app/src/lib/site-dismissed.js';

const a = { uuid: 7, name: 'Reef', hasLocation: true, latUdeg: 1000, lonUdeg: 2000 };
const b = { uuid: 3, name: 'reef', hasLocation: false, latUdeg: 0, lonUdeg: 0 };

test('the key does not depend on the order', () => {
  assert.equal(pairKey(7, 3), pairKey(3, 7));
});

test('a marked pair stays dismissed, in either order', () => {
  const marks = withMark({}, a, b);
  assert.ok(isDismissed(marks, a, b));
  assert.ok(isDismissed(marks, b, a));
});

test('a rename or a move of either site drops the mark', () => {
  const marks = withMark({}, a, b);
  assert.ok(!isDismissed(marks, { ...a, name: 'Reef 2' }, b));
  assert.ok(!isDismissed(marks, a, { ...b, name: 'Other' }));
  assert.ok(!isDismissed(marks, { ...a, latUdeg: 1001 }, b));
  assert.ok(!isDismissed(marks, a, { ...b, hasLocation: true, latUdeg: 5, lonUdeg: 5 }));
});

test('undo removes the mark', () => {
  assert.ok(!isDismissed(withoutMark(withMark({}, a, b), a, b), a, b));
});

test('the first stored format (array of keys) is still read', () => {
  const marks = parseMarks('["3-7"]');
  assert.ok(isDismissed(marks, a, b));
  assert.deepEqual(parseMarks('garbage'), {});
  assert.deepEqual(parseMarks(null), {});
});
