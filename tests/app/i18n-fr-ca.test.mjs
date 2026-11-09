// fr-CA: the override catalog, the lookup order and the device language choice.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fr from '../../app/src/i18n/fr.json' with { type: 'json' };
import frCA from '../../app/src/i18n/fr-CA.json' with { type: 'json' };
import { catalogChain, pickLanguage, t } from '../../app/src/lib/i18n.js';

/** Leaves of a catalog: a string, or a plural object (a key set of one/other...). */
const isPlural = (v) =>
  v !== null && typeof v === 'object' && Object.keys(v).length > 0 && Object.keys(v).every((k) => ['zero', 'one', 'two', 'few', 'many', 'other'].includes(k));

function leaves(node, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !isPlural(v) && !Array.isArray(v)) leaves(v, path, out);
    else out.set(path, v);
  }
  return out;
}

const shape = (v) => (Array.isArray(v) ? 'array' : isPlural(v) ? `plural:${Object.keys(v).sort().join(',')}` : typeof v);

test('fr-CA only has keys that fr has, with the same shape', () => {
  const frLeaves = leaves(fr);
  for (const [path, value] of leaves(frCA)) {
    assert.ok(frLeaves.has(path), `fr-CA has "${path}", which fr does not have: remove it from fr-CA`);
    assert.equal(shape(value), shape(frLeaves.get(path)), `fr-CA "${path}" has a different shape than in fr`);
  }
});

test('fr-CA holds overrides only: no text identical to fr', () => {
  const frLeaves = leaves(fr);
  for (const [path, value] of leaves(frCA)) {
    assert.notDeepEqual(value, frLeaves.get(path), `fr-CA "${path}" is the same as fr: remove it`);
  }
});

test('lookup order is fr-CA, fr, en', () => {
  assert.deepEqual(catalogChain('fr-CA'), ['fr-CA', 'fr', 'en']);
  assert.deepEqual(catalogChain('fr'), ['fr', 'en']);
  assert.deepEqual(catalogChain('en'), ['en']);
});

test('the device tag fr-CA picks fr-CA, any case; other fr-* pick fr', () => {
  assert.equal(pickLanguage(['fr-CA']), 'fr-CA');
  assert.equal(pickLanguage(['fr-ca']), 'fr-CA');
  assert.equal(pickLanguage(['FR-CA', 'en-US']), 'fr-CA');
  assert.equal(pickLanguage(['fr-FR']), 'fr');
  assert.equal(pickLanguage(['fr-BE']), 'fr');
  assert.equal(pickLanguage(['fr']), 'fr');
  assert.equal(pickLanguage(['en-CA']), 'en');
  assert.equal(pickLanguage(['de-DE', 'fr-CA']), 'fr-CA');
  assert.equal(pickLanguage(['de-DE']), 'en');
  assert.equal(pickLanguage([]), 'en');
});

test('t() without a chosen language still answers (device language of the test run)', () => {
  assert.equal(typeof t('logbook.title'), 'string');
});
