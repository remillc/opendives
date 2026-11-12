// @ts-check
// The title of a saved plan (task 37): kept with the planned dive as extra data
// "OpenDives title" (core: save_plan, list_plans). Pure rules, no Framework7.

/** Longest title kept, in characters. */
export const PLAN_TITLE_MAX = 100;

/**
 * The title as it is saved: blanks around it dropped, line breaks and runs of
 * blanks made one space, cut at PLAN_TITLE_MAX. An empty result means no title.
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function cleanPlanTitle(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLAN_TITLE_MAX)
    .trim();
}

/**
 * The title a new plan starts with: the site of the dive it starts from, none
 * for a plan without a starting dive.
 * @param {{ site?: string }|null|undefined} source
 * @returns {string}
 */
export function defaultPlanTitle(source) {
  return cleanPlanTitle(source?.site);
}

/**
 * What a list row shows: the title, or the fallback text ("Plan du 9 nov. 2026")
 * in the variant colour when there is none.
 * @param {string|null|undefined} title
 * @param {string} fallback the fallback text, already translated and dated
 * @returns {{ text: string, isFallback: boolean }}
 */
export function planRowTitle(title, fallback) {
  const clean = cleanPlanTitle(title);
  return clean ? { text: clean, isFallback: false } : { text: fallback, isFallback: true };
}
