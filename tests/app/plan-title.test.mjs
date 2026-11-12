import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPlanTitle, defaultPlanTitle, planRowTitle, PLAN_TITLE_MAX } from '../../app/src/lib/plan-title.js';

test('cleanPlanTitle trims and flattens blanks', () => {
  assert.equal(cleanPlanTitle('  Wreck   trip \n 2 '), 'Wreck trip 2');
  assert.equal(cleanPlanTitle('   '), '');
  assert.equal(cleanPlanTitle(undefined), '');
  assert.equal(cleanPlanTitle(null), '');
});

test('cleanPlanTitle cuts a long title', () => {
  assert.equal(cleanPlanTitle('a'.repeat(PLAN_TITLE_MAX + 20)).length, PLAN_TITLE_MAX);
});

test('defaultPlanTitle is the site of the starting dive', () => {
  assert.equal(defaultPlanTitle({ site: ' Lac de Bromont ' }), 'Lac de Bromont');
  assert.equal(defaultPlanTitle({ site: '' }), '');
  assert.equal(defaultPlanTitle(null), '');
});

test('planRowTitle falls back to the dated text when empty', () => {
  assert.deepEqual(planRowTitle('Cave', 'Plan du 9 nov. 2026'), { text: 'Cave', isFallback: false });
  assert.deepEqual(planRowTitle('  ', 'Plan du 9 nov. 2026'), { text: 'Plan du 9 nov. 2026', isFallback: true });
  assert.deepEqual(planRowTitle(undefined, 'x'), { text: 'x', isFallback: true });
});
