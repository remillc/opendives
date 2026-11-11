// The handle of a bottom sheet (cylinder sheet of "Modifier la plongée"):
// dragged down far enough or fast enough, the sheet closes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dismissesSheet, sheetOffset } from '../../app/src/lib/sheet-drag.js';

test('pulled past a third of the sheet or 96 px, it closes', () => {
  assert.equal(dismissesSheet(100, 0, 600), true);
  assert.equal(dismissesSheet(90, 0, 600), false);
  assert.equal(dismissesSheet(70, 0, 200), true);
});

test('a fast fling down closes it, a short slow drag does not', () => {
  assert.equal(dismissesSheet(20, 0.8, 600), true);
  assert.equal(dismissesSheet(20, 0.1, 600), false);
});

test('dragged up, it never closes and barely moves', () => {
  assert.equal(dismissesSheet(-150, -2, 600), false);
  assert.equal(sheetOffset(-80), -10);
  assert.equal(sheetOffset(40), 40);
});
