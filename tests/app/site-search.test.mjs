// Sites search: matching on name and country, ignoring case and accents; highlighting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSite, highlightParts, normalise } from '../../app/src/lib/site-search.js';

test('normalise: no accents, lower case, trimmed', () => {
  assert.equal(normalise('  Île d’Yeu '), 'ile d’yeu');
});

test('a site matches on its name or its country', () => {
  const site = { name: 'Lake Coleridge', country: 'New Zealand' };
  assert.ok(matchesSite(site, 'cole'));
  assert.ok(matchesSite(site, 'ZEAL'));
  assert.ok(!matchesSite(site, 'arch'));
  assert.ok(matchesSite(site, '   '), 'an empty search keeps every site');
});

test('accents do not matter', () => {
  assert.ok(matchesSite({ name: 'Épave du Liban', country: '' }, 'epave'));
  assert.ok(matchesSite({ name: 'Epave', country: '' }, 'épave'));
});

test('highlight: the matched part, with the name kept as typed', () => {
  assert.deepEqual(highlightParts('Lake Coleridge', 'cole'), [
    { text: 'Lake ', match: false },
    { text: 'Cole', match: true },
    { text: 'ridge', match: false },
  ]);
  assert.deepEqual(highlightParts('Épave', 'epa'), [
    { text: 'Épa', match: true },
    { text: 've', match: false },
  ]);
});

test('highlight: nothing to mark', () => {
  assert.deepEqual(highlightParts('Lake', ''), [{ text: 'Lake', match: false }]);
  assert.deepEqual(highlightParts('Lake', 'zzz'), [{ text: 'Lake', match: false }]);
  assert.deepEqual(highlightParts('', 'a'), [{ text: '', match: false }]);
});
