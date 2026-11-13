// @ts-check
// "Ce lest était": how the weight of a dive felt (task 2026-11-13-99). Stored
// as a tag of the dive, always in English whatever the app language, so that
// Subsurface shows it as an ordinary tag. At most one of the three at a time;
// OpenDives shows them as buttons, never as tag chips, suggestions or filter
// values.

/** The choice, and its tag. */
export const FEEDBACK_TAGS = /** @type {const} */ ({
  'too-light': 'weight-too-light',
  ok: 'weight-ok',
  'too-heavy': 'weight-too-heavy',
});

/** @typedef {'too-light'|'ok'|'too-heavy'} WeightFeedback */

/** The three choices, in the order of the buttons. @type {WeightFeedback[]} */
export const FEEDBACK_CHOICES = ['too-light', 'ok', 'too-heavy'];

const NAMES = new Set(Object.values(FEEDBACK_TAGS));

/** Whether a tag is one of the three. @param {string} tag */
export const isFeedbackTag = (tag) => NAMES.has(/** @type {any} */ (tag));

/**
 * The choice stored in a list of tags; empty when none (the first one when a
 * file holds several).
 * @param {string[]} tags
 * @returns {WeightFeedback|''}
 */
export function feedbackOf(tags) {
  for (const tag of tags) {
    const found = FEEDBACK_CHOICES.find((c) => FEEDBACK_TAGS[c] === tag);
    if (found) return found;
  }
  return '';
}

/**
 * The tags OpenDives lists: without the three.
 * @param {string[]} tags
 */
export const visibleTags = (tags) => tags.filter((tag) => !isFeedbackTag(tag));

/**
 * The tags with this choice set, changed or cleared: the other tags keep their
 * order, the choice comes last.
 * @param {string[]} tags
 * @param {WeightFeedback|''} choice '' clears it
 * @returns {string[]}
 */
export function withFeedback(tags, choice) {
  return [...visibleTags(tags), ...(choice ? [FEEDBACK_TAGS[choice]] : [])];
}

/**
 * The choice after a tap on a button: the selected one is cleared.
 * @param {WeightFeedback|''} current
 * @param {WeightFeedback} tapped
 * @returns {WeightFeedback|''}
 */
export const toggleFeedback = (current, tapped) => (current === tapped ? '' : tapped);

/**
 * Values of a criterion without the three tags (tag suggestions, filter, statistics).
 * @template {string|{key: string}} T
 * @param {T[]} values
 * @returns {T[]}
 */
export const withoutFeedbackTags = (values) => values.filter((v) => !isFeedbackTag(typeof v === 'string' ? v : v.key));
