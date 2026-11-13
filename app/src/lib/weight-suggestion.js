// @ts-check
// The suggested weight (task 2026-11-13-99): the total weight of the most
// recent other dive of the logbook with the same suit, the same cylinder
// type(s) and the same water type that has a weight, adjusted by how that
// weight felt ("Ce lest était"): too light adds 2 lb (1 kg), too heavy removes
// 2 lb (1 kg). Pure: the dives are read by the caller.
import { feedbackOf } from './weight-feedback.js';

const G_PER_LB = 453.59237;

/**
 * How much a "too light" or "too heavy" dive moves the suggestion, in grams.
 * @param {'kg'|'lbs'} unit
 */
export const adjustmentGrams = (unit) => (unit === 'lbs' ? 2 * G_PER_LB : 1000);

/**
 * Whether two weights show as the same number in the unit (0.1 shown).
 * @param {number} a grams
 * @param {number} b grams
 * @param {'kg'|'lbs'} unit
 */
export function sameWeight(a, b, unit) {
  const per = unit === 'lbs' ? G_PER_LB : 1000;
  return Math.round((a / per) * 10) === Math.round((b / per) * 10);
}

/**
 * The cylinder types of a dive, as a comparable key (order does not matter).
 * @param {{ description: string }[]} cylinders
 */
export const cylinderKey = (cylinders) => cylinders.map((c) => c.description.trim()).sort().join('\n');

/**
 * What a dive has to say for the rule.
 * @typedef {{
 *   id: number, number?: number, date: string, suit: string, waterType: string,
 *   cylinders: { description: string }[], tags: string[], weights: { grams: number, description: string }[],
 * }} WeightSource
 */

/**
 * @typedef {{
 *   grams: number,
 *   adjusted: 'too-light'|'too-heavy'|'',
 *   from: { id: number, date: string },
 *   weights: { description: string, grams: number }[],
 * }} WeightSuggestion
 * grams: the suggested total; weights: the locations of the earlier dive, the
 * adjustment applied to the largest one, so that they add up to grams.
 */

const total = (/** @type {{ grams: number }[]} */ weights) => weights.reduce((sum, w) => sum + Math.max(0, w.grams), 0);

/** Whether a dive is a possible source for these. @param {WeightSource} dive @param {{ id: number, suit: string, waterType: string, cylinders: { description: string }[] }} current */
export const matches = (dive, current) =>
  dive.id !== current.id &&
  dive.suit.trim() === current.suit.trim() &&
  dive.waterType === current.waterType &&
  cylinderKey(dive.cylinders) === cylinderKey(current.cylinders) &&
  total(dive.weights) > 0;

/** The most recent first. @param {{ date: string, number?: number }} a @param {{ date: string, number?: number }} b */
export const mostRecentFirst = (a, b) => (a.date === b.date ? (b.number ?? 0) - (a.number ?? 0) : a.date < b.date ? 1 : -1);

/**
 * The suggestion for a dive, or null.
 * @param {{ id: number, suit: string, waterType: string, cylinders: { description: string }[] }} current
 * @param {WeightSource[]} dives candidates, any order
 * @param {'kg'|'lbs'} unit
 * @returns {WeightSuggestion|null}
 */
export function suggestWeight(current, dives, unit) {
  const source = [...dives].sort(mostRecentFirst).find((d) => matches(d, current));
  if (!source) return null;
  const feedback = feedbackOf(source.tags);
  const delta = feedback === 'too-light' ? adjustmentGrams(unit) : feedback === 'too-heavy' ? -adjustmentGrams(unit) : 0;
  const weights = source.weights.filter((w) => w.grams > 0).map((w) => ({ description: w.description, grams: w.grams }));
  const base = total(weights);
  const grams = base + delta;
  if (grams <= 0) return null;
  const largest = weights.reduce((best, w, i) => (w.grams > weights[best].grams ? i : best), 0);
  // An adjustment larger than the largest weight: one weight at its location.
  const shown = weights[largest].grams + delta > 0 ? weights.map((w, i) => (i === largest ? { ...w, grams: w.grams + delta } : w)) : [{ description: weights[largest].description, grams }];
  return {
    grams,
    adjusted: feedback === 'too-light' || feedback === 'too-heavy' ? feedback : '',
    from: { id: source.id, date: source.date },
    weights: shown,
  };
}

/**
 * Whether the card is shown: the dive has no weight yet, or a total that
 * shows differently from the suggestion.
 * @param {WeightSuggestion|null} suggestion
 * @param {number} currentGrams the dive's total now
 * @param {'kg'|'lbs'} unit
 */
export const showSuggestion = (suggestion, currentGrams, unit) =>
  !!suggestion && (currentGrams <= 0 || !sameWeight(currentGrams, suggestion.grams, unit));
