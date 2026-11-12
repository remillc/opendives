// Choosing a section in the side menu or the rail closes Settings or About
// opened over a section (bug of 12 November 2026: Carnet chosen from Settings,
// opened over the Carnet, did nothing).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('the menu and the rail go through goToSection', () => {
  for (const file of ['components/NavMenu.svelte', 'components/NavRail.svelte']) {
    const src = read(file);
    assert.match(src, /goToSection\(/, file);
    assert.doesNotMatch(src, /choose\(e, \(\) => showSection\(/, file);
  }
});

test('goToSection closes the screens opened over the current and the chosen section', () => {
  const src = read('lib/navigation.svelte.js');
  assert.match(src, /export function goToSection[\s\S]*closeOverPages\(f7\.views\.current\)[\s\S]*showSection\(section\)[\s\S]*closeOverPages\(/);
  assert.match(src, /path\.startsWith\('\/settings\/'\) \|\| path === '\/about'/);
});
