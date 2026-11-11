// The detail pane of a tablet has its own history (inbox task 2026-11-11-31):
// ← only when it has a screen to go back to, and what system Back does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { backTarget, paneHasHistory, readPane } from '../../app/src/lib/pane-history.js';

const firstScreen = { masterDetail: true, detail: true, detailRoot: true };
const deeper = { masterDetail: true, detail: true, detailRoot: false };
const noDetail = { masterDetail: true, detail: false, detailRoot: false };

test('a row of the list opens the first screen of the pane: no history', () => {
  assert.equal(paneHasHistory(firstScreen), false);
  assert.equal(paneHasHistory(noDetail), false);
});

test('a screen opened from inside the pane gives it history', () => {
  assert.equal(paneHasHistory(deeper), true);
});

test('without two panes there is no pane history', () => {
  assert.equal(paneHasHistory({ masterDetail: false, detail: false, detailRoot: false }), false);
});

test('Back goes back one screen in the pane while it has history, in any section', () => {
  assert.equal(backTarget({ ...deeper, historyLength: 3, logbook: true }), 'pane');
  assert.equal(backTarget({ ...deeper, historyLength: 4, logbook: false }), 'pane');
});

test('Back at the first screen of the pane does what it does on the list alone', () => {
  // Logbook: leave the app, never only clear the selection.
  assert.equal(backTarget({ ...firstScreen, historyLength: 2, logbook: true }), 'exit');
  // Another section: back to the Logbook.
  assert.equal(backTarget({ ...firstScreen, historyLength: 2, logbook: false }), 'logbook');
  assert.equal(backTarget({ ...noDetail, historyLength: 1, logbook: true }), 'exit');
  assert.equal(backTarget({ ...noDetail, historyLength: 1, logbook: false }), 'logbook');
});

test('a view without a pane (phone, other sections) goes back page by page', () => {
  const single = { masterDetail: false, detail: false, detailRoot: false };
  assert.equal(backTarget({ ...single, historyLength: 3, logbook: true }), 'page');
  assert.equal(backTarget({ ...single, historyLength: 1, logbook: true }), 'exit');
  assert.equal(backTarget({ ...single, historyLength: 1, logbook: false }), 'logbook');
});

test('the pane is read from the classes of Framework7', () => {
  const page = (classes) => ({ classList: { contains: (c) => classes.includes(c) } });
  const view = (viewClasses, current) => ({
    classList: { contains: (c) => viewClasses.includes(c) },
    querySelector: () => current,
  });
  assert.deepEqual(readPane(view(['view-master-detail'], page(['page-master-detail', 'page-master-detail-root']))), firstScreen);
  assert.deepEqual(readPane(view(['view-master-detail'], page(['page-master-detail']))), deeper);
  assert.deepEqual(readPane(view(['view-master-detail'], null)), noDetail);
  assert.equal(readPane(view([], page(['page-master-detail']))).masterDetail, false);
  assert.equal(readPane(null).masterDetail, false);
});

test('the first screen hides its ←, a deeper one keeps it (App.svelte)', () => {
  const css = readFileSync(new URL('../../app/src/App.svelte', import.meta.url), 'utf8');
  // The download panes are excluded: they keep their ✕ (task 2026-11-10-30).
  assert.match(css, /\.view-master-detail \.page-master-detail-root(:not\([^)]*\))? \.navbar \.left \.back\)/);
  assert.doesNotMatch(css, /\.view-master-detail \.page-master-detail \.navbar \.left/);
});

test('the Back key uses the pane decision', () => {
  const src = readFileSync(new URL('../../app/src/lib/back-button.js', import.meta.url), 'utf8');
  assert.match(src, /backTarget\(/);
});
