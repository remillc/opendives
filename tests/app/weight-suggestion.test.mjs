// The suggested weight rule and the "Ce lest était" tags (task 2026-11-13-99).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustmentGrams, matches, sameWeight, showSuggestion, suggestWeight } from '../../app/src/lib/weight-suggestion.js';
import {
  FEEDBACK_TAGS,
  feedbackOf,
  isFeedbackTag,
  toggleFeedback,
  visibleTags,
  withFeedback,
  withoutFeedbackTags,
} from '../../app/src/lib/weight-feedback.js';

const LB = 453.59237;
const AL80 = [{ sizeMl: 11100 }];

/** A dive for the rule; override what a case needs. */
const dive = (over = {}) => ({
  id: 1,
  number: 1,
  date: '2013-02-02T10:00:00',
  suit: 'dry suit',
  waterType: 'salt',
  cylinders: AL80,
  tags: [],
  weights: [{ description: 'integrated', grams: 6 * LB }],
  ...over,
});
const current = { id: 99, suit: 'dry suit', waterType: 'salt', cylinders: AL80 };

test('a dive with the same suit, cylinder types and water type gives its total', () => {
  const s = suggestWeight(current, [dive()], 'lbs');
  assert.ok(s);
  assert.equal(Math.round(s.grams / LB), 6);
  assert.deepEqual(s.from, { id: 1, date: '2013-02-02T10:00:00' });
  assert.equal(s.adjusted, '');
  assert.deepEqual(s.weights, [{ description: 'integrated', grams: 6 * LB }]);
});

test('no matching dive: no suggestion', () => {
  assert.equal(suggestWeight(current, [], 'lbs'), null);
  assert.equal(suggestWeight(current, [dive({ suit: 'wetsuit' })], 'lbs'), null);
  assert.equal(suggestWeight(current, [dive({ waterType: 'fresh' })], 'lbs'), null);
  assert.equal(suggestWeight(current, [dive({ cylinders: [{ sizeMl: 9000 }] })], 'lbs'), null);
  assert.equal(suggestWeight(current, [dive({ cylinders: [...AL80, ...AL80] })], 'lbs'), null);
  assert.equal(suggestWeight(current, [dive({ weights: [] })], 'lbs'), null);
  assert.equal(suggestWeight(current, [dive({ weights: [{ description: 'belt', grams: 0 }] })], 'lbs'), null);
});

test('the dive itself is never its own source, and cylinder order does not matter', () => {
  assert.equal(suggestWeight(current, [dive({ id: 99 })], 'lbs'), null);
  const two = [{ sizeMl: 11100 }, { sizeMl: 5700 }];
  const s = suggestWeight({ ...current, cylinders: [two[1], two[0]] }, [dive({ cylinders: two })], 'lbs');
  assert.ok(s);
});

test('the most recent matching dive wins, and dives without a weight are skipped', () => {
  const dives = [
    dive({ id: 1, date: '2012-01-01T09:00:00', weights: [{ description: 'belt', grams: 4000 }] }),
    dive({ id: 3, date: '2014-06-01T09:00:00', weights: [] }),
    dive({ id: 2, date: '2013-05-01T09:00:00', weights: [{ description: 'belt', grams: 5000 }] }),
    dive({ id: 4, date: '2015-01-01T09:00:00', suit: 'wetsuit' }),
  ];
  const s = suggestWeight(current, dives, 'kg');
  assert.equal(s?.from.id, 2);
  assert.equal(s?.grams, 5000);
});

test('same date and time: the higher dive number is the more recent', () => {
  const s = suggestWeight(current, [dive({ id: 1, number: 7, weights: [{ description: 'a', grams: 4000 }] }), dive({ id: 2, number: 8, weights: [{ description: 'a', grams: 5000 }] })], 'kg');
  assert.equal(s?.from.id, 2);
});

test('"too light" adds 2 lb, "too heavy" removes 2 lb, in pounds', () => {
  const light = suggestWeight(current, [dive({ tags: [FEEDBACK_TAGS['too-light']] })], 'lbs');
  assert.equal(Math.round((light?.grams ?? 0) / LB), 8);
  assert.equal(light?.adjusted, 'too-light');
  const heavy = suggestWeight(current, [dive({ tags: ['reef', FEEDBACK_TAGS['too-heavy']] })], 'lbs');
  assert.equal(Math.round((heavy?.grams ?? 0) / LB), 4);
  assert.equal(heavy?.adjusted, 'too-heavy');
  const ok = suggestWeight(current, [dive({ tags: [FEEDBACK_TAGS.ok] })], 'lbs');
  assert.equal(Math.round((ok?.grams ?? 0) / LB), 6);
});

test('in kilograms the adjustment is 1 kg', () => {
  const kg = (tags) => suggestWeight(current, [dive({ tags, weights: [{ description: 'belt', grams: 6000 }] })], 'kg')?.grams;
  assert.equal(kg(['weight-too-light']), 7000);
  assert.equal(kg(['weight-too-heavy']), 5000);
  assert.equal(kg(['weight-ok']), 6000);
  assert.equal(adjustmentGrams('kg'), 1000);
  assert.ok(Math.abs(adjustmentGrams('lbs') - 2 * LB) < 1e-9);
});

test('the adjustment lands on the largest weight; the locations add up to the total', () => {
  const s = suggestWeight(
    current,
    [dive({ tags: ['weight-too-light'], weights: [{ description: 'belt', grams: 1000 }, { description: 'integrated', grams: 4000 }] })],
    'kg',
  );
  assert.deepEqual(s?.weights, [{ description: 'belt', grams: 1000 }, { description: 'integrated', grams: 5000 }]);
  assert.equal(s?.grams, 6000);
  // An adjustment larger than the largest weight: one weight at its location.
  const w = (description) => ({ description, grams: 600 });
  const one = suggestWeight(current, [dive({ tags: ['weight-too-heavy'], weights: [w('belt'), w('ankle'), w('integrated')] })], 'kg');
  assert.equal(one?.grams, 800);
  assert.deepEqual(one?.weights, [{ description: 'belt', grams: 800 }]);
});

test('a weight that would reach zero gives no suggestion', () => {
  assert.equal(suggestWeight(current, [dive({ tags: ['weight-too-heavy'], weights: [{ description: 'belt', grams: 1000 }] })], 'kg'), null);
});

test('matches: suit compared trimmed, water type and cylinders exactly', () => {
  assert.equal(matches(dive({ suit: ' dry suit ' }), current), true);
  assert.equal(matches(dive({ waterType: '' }), current), false);
  assert.equal(matches(dive(), { ...current, id: 1 }), false);
});

test('the card shows with no weight yet or a different total, in the unit shown', () => {
  const s = suggestWeight(current, [dive()], 'lbs');
  assert.equal(showSuggestion(null, 0, 'lbs'), false);
  assert.equal(showSuggestion(s, 0, 'lbs'), true);
  assert.equal(showSuggestion(s, 4 * LB, 'lbs'), true);
  assert.equal(showSuggestion(s, 6 * LB, 'lbs'), false);
  assert.equal(showSuggestion(s, 6 * LB + 5, 'lbs'), false); // shows as 6 lb as well
  assert.equal(sameWeight(2721, 2722, 'kg'), true);
  assert.equal(sameWeight(2700, 2800, 'kg'), false);
});

test('feedback tags: set, change, clear, one at a time, other tags kept', () => {
  assert.equal(feedbackOf([]), '');
  assert.equal(feedbackOf(['reef', 'weight-ok']), 'ok');
  assert.deepEqual(withFeedback(['reef'], 'too-light'), ['reef', 'weight-too-light']);
  assert.deepEqual(withFeedback(['reef', 'weight-too-light'], 'too-heavy'), ['reef', 'weight-too-heavy']);
  assert.deepEqual(withFeedback(['weight-ok', 'reef', 'weight-too-light'], 'ok'), ['reef', 'weight-ok']);
  assert.deepEqual(withFeedback(['reef', 'weight-ok'], ''), ['reef']);
  assert.equal(toggleFeedback('', 'ok'), 'ok');
  assert.equal(toggleFeedback('ok', 'too-heavy'), 'too-heavy');
  assert.equal(toggleFeedback('ok', 'ok'), '');
});

test('the three tags are English whatever the language, and hidden from lists', () => {
  assert.deepEqual(Object.values(FEEDBACK_TAGS), ['weight-too-light', 'weight-ok', 'weight-too-heavy']);
  assert.equal(isFeedbackTag('weight-ok'), true);
  assert.equal(isFeedbackTag('weight'), false);
  assert.deepEqual(visibleTags(['a', 'weight-too-light', 'b', 'weight-ok', 'weight-too-heavy']), ['a', 'b']);
  assert.deepEqual(withoutFeedbackTags(['a', 'weight-ok', 'b']), ['a', 'b']);
  assert.deepEqual(withoutFeedbackTags([{ key: 'a', dives: 1 }, { key: 'weight-ok', dives: 3 }]), [{ key: 'a', dives: 1 }]);
});

test('cylinders are compared by capacity rounded to 0.1 L, not by name', () => {
  // "AL80" and "Al 80" are the same 11.1 L; 11.14 L and 11.06 L both round to 11.1 L.
  const named = (description, sizeMl) => [{ description, sizeMl }];
  const a = suggestWeight({ ...current, cylinders: named('Al 80', 11140) }, [dive({ cylinders: named('AL80', 11060) })], 'lbs');
  assert.ok(a);
  // Two sizes that differ do not match, whatever their names.
  assert.equal(suggestWeight({ ...current, cylinders: named('AL80', 11100) }, [dive({ cylinders: named('AL80', 12000) })], 'lbs'), null);
  assert.equal(suggestWeight({ ...current, cylinders: named('AL80', 11100) }, [dive({ cylinders: named('AL80', 11300) })], 'lbs'), null);
});
