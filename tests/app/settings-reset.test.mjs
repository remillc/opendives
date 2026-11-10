// "Réinitialiser tous les réglages": the planner's values stay (spec, Settings reset).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SETTING_KEYS, coreResetChanges, storedAfterReset, appSettingsAfterReset } from '../../app/src/lib/settings-reset.js';

test('no planner value is set back to its default', () => {
  const defaults = { length: 'm', gfLow: 30, sacFactor: 400, reserveMbar: 40000, bottomPo2Mbar: 1400, lastStop6m: false, theme: 'x' };
  const changes = coreResetChanges(defaults);
  assert.deepEqual(Object.keys(changes).sort(), ['gfLow', 'length', 'theme']);
  for (const key of SETTING_KEYS) assert.ok(!(key in changes), key);
});

test('the device keeps its planner values and forgets the others', () => {
  const stored = { length: 'ft', gfLow: 20, sacFactor: 300, ascent75MmMin: 12000 };
  assert.deepEqual(storedAfterReset(stored), { sacFactor: 300, ascent75MmMin: 12000 });
});

test('app settings go back to their defaults except the planner conditions', () => {
  const defaults = { theme: 'system', language: 'system', defaultWater: 'salt', defaultAltitudeMm: 0 };
  const current = { theme: 'dark', language: 'fr', defaultWater: 'fresh', defaultAltitudeMm: 1500 };
  assert.deepEqual(appSettingsAfterReset(current, defaults), { theme: 'system', language: 'system', defaultWater: 'fresh', defaultAltitudeMm: 1500 });
});
