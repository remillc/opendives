// Formats follow the locale: fr-CA times read "10 h 44", the unit labels come from the catalogs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocale } from '../../app/src/lib/i18n.js';
import fr from '../../app/src/i18n/fr.json' with { type: 'json' };
import frCA from '../../app/src/i18n/fr-CA.json' with { type: 'json' };
import en from '../../app/src/i18n/en.json' with { type: 'json' };

const at = (locale) => new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 12, 10, 44)));

test('the interface fr-CA forces the fr-CA locale, else the device tag is kept', () => {
  assert.equal(formatLocale('fr-CA', 'fr-FR'), 'fr-CA');
  assert.equal(formatLocale('fr-CA', undefined), 'fr-CA');
  assert.equal(formatLocale('fr', 'fr-FR'), 'fr-FR');
  assert.equal(formatLocale('en', 'en-US'), 'en-US');
  assert.equal(formatLocale('en', undefined), 'en');
});

test('a fr-CA time reads "10 h 44", fr-FR "10:44"', () => {
  assert.equal(at(formatLocale('fr-CA', 'fr-FR')).replace(/\s/g, ' '), '10 h 44');
  assert.equal(at('fr-FR'), '10:44');
});

test('feet: "pi" in fr-CA, "ft" in fr and en; cubic feet follow', () => {
  assert.equal(frCA.units.feet, 'pi');
  assert.equal(frCA.units.cubicFeet, 'pi³');
  assert.equal(frCA.units.cubicFeetPerMinute, 'pi³/min');
  assert.equal(fr.units.feet, 'ft');
  assert.equal(en.units.feet, 'ft');
});

test('the dive detail info grid has no entry, exit or mean depth cell', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../app/src/pages/DiveDetail.svelte', import.meta.url), 'utf8');
  for (const key of ['detail.entry', 'detail.exit', 'detail.meanDepth']) assert.ok(!source.includes(`t('${key}')`), key);
});
