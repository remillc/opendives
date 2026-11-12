import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameValues, isDirty, registerGuard, backThroughGuard } from '../../app/src/lib/leave-guard.js';

test('sameValues compares by content', () => {
  assert.ok(sameValues(1, 1));
  assert.ok(sameValues('a', 'a'));
  assert.ok(!sameValues('1', 1));
  assert.ok(!sameValues(null, undefined));
  assert.ok(sameValues(NaN, NaN));
  assert.ok(sameValues({ a: 1, b: [1, 2, { c: 'x' }] }, { b: [1, 2, { c: 'x' }], a: 1 }));
  assert.ok(!sameValues({ a: 1 }, { a: 1, b: undefined }));
  assert.ok(!sameValues({ a: 1 }, { b: 1 }));
  assert.ok(!sameValues([1, 2], [2, 1]));
  assert.ok(!sameValues([], {}));
  assert.ok(!sameValues([1], [1, 2]));
  assert.ok(!sameValues({ a: null }, null));
});

test('a change undone by hand is no change', () => {
  const opened = { name: 'Wreck', depth: '30', gases: [{ o2: '21' }] };
  const now = structuredClone(opened);
  assert.equal(isDirty(opened, now), false);
  now.depth = '31';
  now.gases[0].o2 = '32';
  assert.equal(isDirty(opened, now), true);
  now.depth = '30';
  assert.equal(isDirty(opened, now), true);
  now.gases[0].o2 = '21';
  assert.equal(isDirty(opened, now), false);
  // Typing a character then deleting it.
  assert.equal(isDirty({ name: 'a' }, { name: 'ab'.slice(0, 1) }), false);
  assert.equal(isDirty({ name: 'a' }, { name: 'a ' }), true);
});

/** A marker inside a page, as the Back key sees it. */
const marker = (/** @type {{ current?: boolean, shown?: boolean, popup?: object|null }} */ o = {}) => {
  const page = {
    closest: (/** @type {string} */ sel) => (sel === '.popup' ? (o.popup ?? null) : null),
    classList: { contains: () => o.current ?? true },
    getClientRects: () => (o.shown === false ? [] : [{}]),
  };
  return /** @type {any} */ ({ closest: () => page });
};
const guardOn = (/** @type {any} */ el, /** @type {boolean} */ dirty, /** @type {string[]} */ log, name = 'g') =>
  registerGuard({ marker: el, dirty: () => dirty, attempt: () => log.push(name) });

test('Back asks when the form shown is dirty, and only then', () => {
  /** @type {string[]} */
  const log = [];
  const off = guardOn(marker(), true, log);
  assert.equal(backThroughGuard(null), true);
  assert.deepEqual(log, ['g']);
  off();
  assert.equal(backThroughGuard(null), false);
  const clean = guardOn(marker(), false, log);
  assert.equal(backThroughGuard(null), false);
  clean();
  assert.deepEqual(log, ['g']);
});

test('Back ignores a form that is not the page shown', () => {
  /** @type {string[]} */
  const log = [];
  const offs = [
    guardOn(marker({ current: false }), true, log, 'covered'),
    guardOn(marker({ shown: false }), true, log, 'hidden tab'),
    guardOn(marker({ popup: { id: 'p' } }), true, log, 'in a popup'),
  ];
  assert.equal(backThroughGuard(null), false);
  assert.deepEqual(log, []);
  offs.forEach((off) => off());
});

test('Back asks for the form of the popup on top', () => {
  /** @type {string[]} */
  const log = [];
  const popup = { id: 'popup' };
  const below = guardOn(marker(), true, log, 'below');
  const above = guardOn(marker({ popup }), true, log, 'popup');
  assert.equal(backThroughGuard(/** @type {any} */ (popup)), true);
  assert.deepEqual(log, ['popup']);
  above();
  below();
});
