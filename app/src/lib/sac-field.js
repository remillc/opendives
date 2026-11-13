// @ts-check
// The SAC fields (task 71): an editable dropdown, presets in a list or a typed
// value kept with up to two decimals, clamped to 0 .. 2 cuft/min or 0 .. 60 L/min.
// Pure rules (no Framework7), run under node:test.
import { ML_PER_CUFT } from './planner-rules.js';

// The presets, in the user's unit. Easy to change: this is the one place.
// cuft/min: every 0.01 from 0 to 2 (Christian, 13 November 2026, task 92); the
// list opens on the current value.
export const SAC_PRESETS_CUFT = Array.from({ length: 201 }, (_, i) => i / 100);
// Metric: the usual SAC of divers, 10 to 30 L/min by 5 (Christian, 12 November 2026).
export const SAC_PRESETS_LITERS = [10, 15, 20, 25, 30];
/** The largest SAC that can be typed, in the user's unit. */
export const SAC_MAX_CUFT = 2;
export const SAC_MAX_LITERS = 60;

/** The largest SAC that can be typed, in the user's unit. @param {boolean} cuft */
export const sacMax = (cuft) => (cuft ? SAC_MAX_CUFT : SAC_MAX_LITERS);

/** ml/min in the user's unit. @param {number} ml @param {boolean} cuft */
const toUnit = (ml, cuft) => ml / (cuft ? ML_PER_CUFT : 1000);

/**
 * The presets of the list, with their value in ml/min.
 * @param {boolean} cuft
 * @returns {{ unit: number, ml: number }[]}
 */
export function sacPresets(cuft) {
  return (cuft ? SAC_PRESETS_CUFT : SAC_PRESETS_LITERS).map((unit) => ({ unit, ml: Math.round(unit * (cuft ? ML_PER_CUFT : 1000)) }));
}

/**
 * What the diver typed, as a SAC in ml/min: a number with a comma or a point,
 * kept with up to two decimals, clamped to 0 .. the maximum. null when it is
 * not a number yet (empty, "-", "0,").
 * @param {string} text
 * @param {boolean} cuft
 * @returns {number|null}
 */
export function parseSac(text, cuft) {
  const s = String(text).trim().replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const value = Math.round(Number(s) * 100) / 100;
  const clamped = Math.min(sacMax(cuft), Math.max(0, value));
  return Math.round(clamped * (cuft ? ML_PER_CUFT : 1000));
}

/**
 * A SAC as the field shows it: up to two decimals, no trailing zero, the
 * decimal mark of the language.
 * @param {number} ml
 * @param {boolean} cuft
 * @param {string} locale
 */
export function sacText(ml, cuft, locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(Math.round(toUnit(ml, cuft) * 100) / 100);
}

/**
 * A preset as the list shows it: two decimals in cuft/min ("0,36"), whole litres.
 * @param {number} unit
 * @param {boolean} cuft
 * @param {string} locale
 */
export function sacPresetText(unit, cuft, locale) {
  const digits = cuft ? 2 : 0;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(unit);
}
