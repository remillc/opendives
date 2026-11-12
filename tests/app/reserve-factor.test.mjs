// The reserve factor: stress x divers given to the core, and the migration (task 2026-11-12-74).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coreSacFactor, reserveSettings, bottomVolumeKey } from '../../app/src/lib/reserve-factor.js';

test('the core receives the product, x100', () => {
  assert.equal(coreSacFactor(100, 1), 100);
  assert.equal(coreSacFactor(100, 2), 200);
  assert.equal(coreSacFactor(150, 2), 300);
  assert.equal(coreSacFactor(250, 4), 1000);
  assert.equal(coreSacFactor(110, 3), 330);
});

test('nothing stored: 1.0 x 1', () => {
  assert.deepEqual(reserveSettings({}, undefined), { stressFactor: 100, reserveDivers: 1 });
  assert.deepEqual(reserveSettings({}, null), { stressFactor: 100, reserveDivers: 1 });
});

test('a stored 200 is the old default, never changed: 1.0 x 1', () => {
  assert.deepEqual(reserveSettings({}, 200), { stressFactor: 100, reserveDivers: 1 });
});

test('any other stored value is the diver\'s own stress factor, with one diver', () => {
  assert.deepEqual(reserveSettings({}, 300), { stressFactor: 300, reserveDivers: 1 });
  assert.deepEqual(reserveSettings({}, 400), { stressFactor: 400, reserveDivers: 1 });
  assert.deepEqual(reserveSettings({}, 100), { stressFactor: 100, reserveDivers: 1 });
});

test('once the app has its own values they are the source of truth', () => {
  assert.deepEqual(reserveSettings({ stressFactor: 100, reserveDivers: 2 }, 200), { stressFactor: 100, reserveDivers: 2 });
  assert.deepEqual(reserveSettings({ stressFactor: 200, reserveDivers: 1 }, 400), { stressFactor: 200, reserveDivers: 1 });
});

test('divers out of range fall back to 1', () => {
  assert.equal(reserveSettings({ stressFactor: 100, reserveDivers: 9 }, 0).reserveDivers, 1);
  assert.equal(reserveSettings({ stressFactor: 100, reserveDivers: 0 }, 0).reserveDivers, 1);
});

test('result text: nothing more with one diver, two or N otherwise', () => {
  assert.equal(bottomVolumeKey(1), 'plan.volumeDeco');
  assert.equal(bottomVolumeKey(2), 'plan.volumeBottomTwo');
  assert.equal(bottomVolumeKey(3), 'plan.volumeBottomMany');
  assert.equal(bottomVolumeKey(4), 'plan.volumeBottomMany');
});
