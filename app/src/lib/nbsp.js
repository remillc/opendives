// @ts-check
// A number and its unit never part at the end of a line (docs/ui-writing.md, task
// 2026-11-13-116): « 27,6 m », « 1,6 bar », « 302 Mo », « 90 % », « 14 h 30 », « 9 plongées ».
// Pure functions, without the catalogs, so that tests can run them in any locale.

/** U+00A0, the non-breaking space between a number and its unit. */
export const NBSP = ' ';

/** A digit, then a plain or thin space, then a unit or a word: « 27,6 m », « 9 plongées ». */
const UNIT_AFTER = /(\d)[  ](?=[\p{L}%°′″‰µ])/gu;

/** The second number of a time or a duration: « 14 h 30 », « 1 min 05 s ». */
const CLOCK = /(\d[  ]\p{L}{1,3})[  ](?=\d)/gu;

/**
 * The text with U+00A0 between each number and the unit or noun that follows it. The
 * thousands separator (U+202F between digits) and every other space stay as they are.
 * @param {string} text
 * @returns {string}
 */
export function keepUnits(text) {
  return text.replace(UNIT_AFTER, `$1${NBSP}`).replace(CLOCK, `$1${NBSP}`);
}
