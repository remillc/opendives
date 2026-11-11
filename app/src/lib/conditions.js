// @ts-check
// The summary of the collapsed "Conditions" section of "Modifier la plongée"
// (inbox task 2026-11-11-44): the average of the condition ratings that are
// set, shown with one decimal, and how much of each of the five stars it fills
// (the stars follow the exact average: 2.25 fills two stars and a quarter).

/**
 * Average of the ratings that are set (0 means not set and is ignored); null
 * when none is set.
 * @param {number[]} ratings
 * @returns {number|null}
 */
export function conditionsMean(ratings) {
  const set = ratings.filter((r) => r > 0);
  return set.length ? set.reduce((a, b) => a + b, 0) / set.length : null;
}

/**
 * A value rounded half up to one decimal (2.25 → 2.3). The ratings are whole
 * numbers, so the epsilon only absorbs floating point.
 * @param {number} value
 */
export const roundHalfUp1 = (value) => Math.floor(value * 10 + 0.5 + 1e-9) / 10;

/**
 * How much of star `i` (1 to 5) a value fills, from 0 to 1.
 * @param {number} value
 * @param {number} i
 */
export const starFill = (value, i) => Math.min(1, Math.max(0, value - (i - 1)));
