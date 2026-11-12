// The partial pressure unit (task 2026-11-12-52): rules and display.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { impliedPpUnit, systemAfterPpUnit, ppUnitAfterReset } from '../../app/src/lib/pp-unit.js';
import { settings, setAppSetting } from '../../app/src/lib/settings.svelte.js';
import { formatPartialPressure, ppUnitLabel } from '../../app/src/lib/format.js';

test('Métrique implies bar, Impérial ATA, Personnalisé nothing', () => {
  assert.equal(impliedPpUnit('metric'), 'bar');
  assert.equal(impliedPpUnit('imperial'), 'ata');
  assert.equal(impliedPpUnit('personalize'), null);
});

test('a hand choice that differs from the system makes it Personnalisé', () => {
  assert.equal(systemAfterPpUnit('metric', 'ata'), 'personalize');
  assert.equal(systemAfterPpUnit('imperial', 'bar'), 'personalize');
  assert.equal(systemAfterPpUnit('metric', 'bar'), 'metric');
  assert.equal(systemAfterPpUnit('imperial', 'ata'), 'imperial');
  assert.equal(systemAfterPpUnit('personalize', 'ata'), 'personalize');
  assert.equal(systemAfterPpUnit('personalize', 'bar'), 'personalize');
});

test('the reset follows the reset unit system', () => {
  assert.equal(ppUnitAfterReset('metric'), 'bar');
  assert.equal(ppUnitAfterReset('imperial'), 'ata');
  assert.equal(ppUnitAfterReset(undefined), 'bar');
});

test('the label changes, the number does not', () => {
  assert.equal(settings.ppUnit, 'bar');
  const nbsp = String.fromCharCode(160);
  assert.match(formatPartialPressure(1.4, 1), /1[.,]4 bar$/);
  setAppSetting('ppUnit', 'ata');
  assert.equal(ppUnitLabel(), 'ATA');
  assert.match(formatPartialPressure(1.4, 1), /1[.,]4 ATA$/);
  assert.match(formatPartialPressure(0.21, 2), /0[.,]21 ATA$/);
  assert.ok(nbsp);
  setAppSetting('ppUnit', 'bar');
});
