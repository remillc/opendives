// Planner chart labels never overlap and stay inside the chart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeLevelLabels } from '../../app/src/lib/chart-labels.js';

test('the longest level keeps its label, an overlapping short one is left out', () => {
  const kept = placeLevelLabels([
    { left: 50, top: 80, text: 'long', span: 60 },
    { left: 60, top: 75, text: 'short', span: 5 },
  ]);
  assert.deepEqual(kept.map((k) => k.text), ['long']);
});

test('labels far apart are all kept, and a label at the edge is moved inside', () => {
  const kept = placeLevelLabels([
    { left: 2, top: 40, text: 'first', span: 5 },
    { left: 80, top: 40, text: 'last', span: 10 },
  ]);
  assert.deepEqual(kept.map((k) => k.text), ['first', 'last']);
  assert.equal(kept[0].left, 15);
});
