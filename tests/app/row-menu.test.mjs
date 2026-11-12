// Settings row menu: height, width, side and direction.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuHeight, placeRowMenu } from '../../app/src/lib/row-menu.js';

const phone = { width: 400, height: 800 };

test('height: 48 dp options, 56 dp with a help line, 8 dp padding', () => {
  assert.equal(menuHeight([{}, {}, {}]), 16 + 144);
  assert.equal(menuHeight([{ example: 'a' }, {}]), 16 + 56 + 48);
});

test('opens under the row, right-aligned, 280 wide', () => {
  const p = placeRowMenu({ top: 100, bottom: 148, right: 384 }, phone, 160);
  assert.equal(p.up, false);
  assert.equal(p.width, 280);
  assert.equal(p.left, 104);
  assert.equal(p.top, 152);
});

test('opens above when there is no room below', () => {
  const p = placeRowMenu({ top: 600, bottom: 648, right: 384 }, phone, 300);
  assert.equal(p.up, true);
  assert.equal(p.bottom, 800 - 600 + 4);
  assert.equal(p.top, undefined);
});

test('stays below when there is no room above either, or more room below', () => {
  assert.equal(placeRowMenu({ top: 300, bottom: 348, right: 384 }, phone, 300).up, false);
  assert.equal(placeRowMenu({ top: 40, bottom: 88, right: 384 }, phone, 900).up, false);
});

test('never wider than the screen minus 16 dp margins', () => {
  const p = placeRowMenu({ top: 100, bottom: 148, right: 300 }, { width: 300, height: 800 }, 160);
  assert.equal(p.width, 268);
  assert.equal(p.left, 16);
});

test('a card wider than the screen does not push the menu out', () => {
  const p = placeRowMenu({ top: 100, bottom: 148, right: 900 }, phone, 160);
  assert.equal(p.left + p.width, 384);
});

test('tablet pane: the menu follows the pane card', () => {
  const p = placeRowMenu({ top: 100, bottom: 148, right: 700 }, { width: 1280, height: 800 }, 160);
  assert.equal(p.left, 420);
});
