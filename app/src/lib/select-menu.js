// @ts-check
// Pure logic of the exposed dropdown menu (components/SelectField.svelte).

/** @typedef {{ value: string, label: string }} MenuOption */

/**
 * The options of the menu: a value that is not in the list (read from a dive,
 * typed earlier) heads it, as it shows in the field. An empty value is never
 * added.
 * @param {MenuOption[]} options
 * @param {string} value
 * @returns {MenuOption[]}
 */
export function menuOptions(options, value) {
  if (value === '' || options.some((o) => o.value === value)) return options;
  return [{ value, label: value }, ...options];
}

/** Lower case without accents, for matching ("Carrière" ~ "carriere"). @param {string} s */
export const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/**
 * The options holding every word typed in the menu's search field, in any
 * order, case and accents aside; all of them for an empty search.
 * @param {MenuOption[]} options
 * @param {string} query
 * @returns {MenuOption[]}
 */
export function filterOptions(options, query) {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  return words.length ? options.filter((o) => words.every((w) => fold(o.label).includes(w))) : options;
}

/**
 * The option the keyboard moves to: arrows step (without wrapping), Home and
 * End jump; -1 when there is nothing to reach.
 * @param {number} active the current index, -1 for none
 * @param {string} key
 * @param {number} length
 */
export function moveActive(active, key, length) {
  if (length === 0) return -1;
  if (key === 'ArrowDown') return Math.min(length - 1, active + 1);
  if (key === 'ArrowUp') return active < 0 ? length - 1 : Math.max(0, active - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return active;
}

/**
 * Whether the menu opens upwards: not enough room below for its height and
 * more above.
 * @param {number} below space under the field, px
 * @param {number} above space over the field, px
 * @param {number} height the menu's height, px
 */
export const opensUp = (below, above, height) => below < height && above > below;

/** The maximum pO2 offered by the gas tools, in mbar: 1,0 to 1,6 bar by 0,1. */
export const po2Choices = () => Array.from({ length: 7 }, (_, i) => 1000 + i * 100);

