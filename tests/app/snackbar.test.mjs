// The snackbar (ui-foundations, section 8): durations, classes, contrast, and
// the guarantee that nothing opens a toast around lib/snackbar.js.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { snackbarClasses, snackbarTimeout } from '../../app/src/lib/snackbar-logic.js';

test('a message without action stays at least 4 s, with an action at least 6 s', () => {
  assert.equal(snackbarTimeout(undefined, false), 4000);
  assert.equal(snackbarTimeout(undefined, true), 6000);
  assert.equal(snackbarTimeout(2000, false), 4000);
  assert.equal(snackbarTimeout(3000, true), 6000);
  assert.equal(snackbarTimeout(NaN, true), 6000);
});

test('longer durations are kept: 6 s message, 8 s conflict, 10 s dive deletion', () => {
  assert.equal(snackbarTimeout(6000, false), 6000);
  assert.equal(snackbarTimeout(8000, true), 8000);
  assert.equal(snackbarTimeout(10000, true), 10000);
});

test('classes: always od-snackbar, above the FAB and undoable on request', () => {
  assert.equal(snackbarClasses(), 'od-snackbar');
  assert.equal(snackbarClasses({ hasFab: true }), 'od-snackbar od-snackbar-above-fab');
  assert.equal(snackbarClasses({ undoable: true }), 'od-snackbar od-undo-toast');
  assert.equal(snackbarClasses({ hasFab: true, undoable: true }), 'od-snackbar od-snackbar-above-fab od-undo-toast');
});

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** @param {string} a @param {string} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync('app/src/theme.css', 'utf8');
/** @param {string} block @param {string} name */
const token = (block, name) => new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block)?.[1] ?? '';
const darkAt = css.indexOf('html.dark {');
const light = css.slice(0, darkAt);
const dark = css.slice(darkAt);

test('the snackbar tokens meet WCAG AA (4.5:1) for the text and the action, light and dark', () => {
  for (const [mode, block] of [['light', light], ['dark', dark]]) {
    const surface = token(block, '--od-inverse-surface');
    assert.ok(surface, `${mode}: --od-inverse-surface is declared`);
    assert.ok(contrast(token(block, '--od-inverse-on-surface'), surface) >= 4.5, `${mode}: text`);
    assert.ok(contrast(token(block, '--od-inverse-primary'), surface) >= 4.5, `${mode}: action`);
  }
});

test('no code opens a Framework7 toast except lib/snackbar.js', () => {
  /** @param {string} dir @returns {string[]} */
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(js|svelte)$/.test(e.name) ? [join(dir, e.name)] : []));
  for (const file of walk('app/src')) {
    if (file.endsWith('snackbar.js')) continue;
    const source = readFileSync(file, 'utf8');
    assert.ok(!/f7\.toast\.(create|show)/.test(source), `${file} opens a toast itself`);
  }
});
