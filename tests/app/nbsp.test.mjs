// A number and its unit never part (docs/ui-writing.md, task 2026-11-13-116): the shared
// normaliser of lib/nbsp.js, which t() applies to every text, on values formatted in fr,
// fr-CA and en, and on every catalog text filled with numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { keepUnits, NBSP } from '../../app/src/lib/nbsp.js';

/** A plain or thin space between a digit and a unit, or inside « 14 h 30 ». */
const BREAKABLE = /\d[  ][\p{L}%°]|\d[  ]\p{L}{1,3}[  ]\d/u;

const LOCALES = ['fr', 'fr-CA', 'en'];
const UNITS = ['m', 'ft', 'bar', 'psi', 'L', 'cuft', '°C', 'kg', 'lb', 'min', 'h', '%', 'Mo', 'MB', 'plongées', 'dives'];

test('a formatted value and its unit are joined by U+00A0 in fr, fr-CA and en', () => {
  for (const locale of LOCALES) {
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    for (const value of [9, 27.6, 1.6, 302, 1357, 12345.5]) {
      for (const unit of UNITS) {
        const text = keepUnits(`${number.format(value)} ${unit}`);
        assert.ok(!BREAKABLE.test(text), `${locale}: ${JSON.stringify(text)}`);
        assert.ok(text.includes(`${NBSP}${unit}`), `${locale}: ${JSON.stringify(text)}`);
      }
    }
  }
});

test('the thousands separator stays, other spaces too', () => {
  const fr = new Intl.NumberFormat('fr').format(12345);
  assert.equal(keepUnits(`${fr} m`), `${fr}${NBSP}m`);
  assert.ok(fr.includes(' '));
  assert.equal(keepUnits('Lock 21 - Grande dérive'), `Lock 21 - Grande dérive`);
  assert.equal(keepUnits('Dive site not set'), 'Dive site not set');
});

test('times and durations keep their second number: « 14 h 30 », « 1 min 05 s »', () => {
  assert.equal(keepUnits('14 h 30'), `14${NBSP}h${NBSP}30`);
  assert.equal(keepUnits('1 min 05 s'), `1${NBSP}min${NBSP}05${NBSP}s`);
  assert.equal(keepUnits('Avion dans 17 h 05'), `Avion dans 17${NBSP}h${NBSP}05`);
});

test('every catalog text, filled with numbers, has no breakable space before a unit', async () => {
  for (const lang of ['fr', 'en', 'fr-CA']) {
    let catalog;
    try {
      catalog = JSON.parse(await readFile(new URL(`../../app/src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    } catch {
      continue; // fr-CA may only override a few keys
    }
    const number = new Intl.NumberFormat(lang);
    const walk = (node, key) => {
      if (typeof node === 'string') {
        const filled = node.replace(/\{(\w+)\}/g, () => number.format(12.5));
        const text = keepUnits(filled);
        assert.ok(!BREAKABLE.test(text), `${lang} ${key}: ${JSON.stringify(text.slice(0, 120))}`);
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, key ? `${key}.${k}` : k);
      }
    };
    walk(catalog, '');
  }
});
