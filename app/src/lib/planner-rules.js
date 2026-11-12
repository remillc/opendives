// @ts-check
// The planner's pure rules, apart from the screens so that they can be tested
// without a browser (tests/app/): the unit conversions between what the diver
// types and what the core takes (mm, ml, mbar), and the two alarms of the
// result. No import: nothing here depends on the page, the language or the core.

/** Millimetres in a foot. */
export const MM_PER_FT = 304.8;
/** Millibars in a psi. */
export const MBAR_PER_PSI = 68.947572932;
/** Millilitres in a cubic foot. */
export const ML_PER_CUFT = 28316.8466;

/**
 * A depth typed in metres or feet, for the core, in mm.
 * @param {number} value
 * @param {boolean} feet
 */
export const depthToMm = (value, feet) => Math.round(feet ? value * MM_PER_FT : value * 1000);

/**
 * A depth of the core, mm, in metres or feet (not rounded).
 * @param {number} mm
 * @param {boolean} feet
 */
export const mmToDepth = (mm, feet) => (feet ? mm / MM_PER_FT : mm / 1000);

/**
 * A gas volume typed in litres or cubic feet, for the core, in ml.
 * @param {number} value
 * @param {boolean} cuft
 */
export const carriedToMl = (value, cuft) => Math.round(cuft ? value * ML_PER_CUFT : value * 1000);

/**
 * A gas volume of the core, ml, in litres or cubic feet (not rounded).
 * @param {number} ml
 * @param {boolean} cuft
 */
export const mlToCarried = (ml, cuft) => (cuft ? ml / ML_PER_CUFT : ml / 1000);

/**
 * A pressure typed in bar or psi, for the core, in mbar.
 * @param {number} value
 * @param {boolean} psi
 */
export const pressureToMbar = (value, psi) => Math.round(psi ? value * MBAR_PER_PSI : value * 1000);

/**
 * A pressure of the core, mbar, in bar or psi (not rounded).
 * @param {number} mbar
 * @param {boolean} psi
 */
export const mbarToPressure = (mbar, psi) => (psi ? mbar / MBAR_PER_PSI : mbar / 1000);

/**
 * The volume a gas needs: what is breathed plus its reserve, ml.
 * @param {{ gasUsedMl: number, reserveMl: number }} cylinder
 */
export const gasTotalMl = (cylinder) => cylinder.gasUsedMl + cylinder.reserveMl;

/**
 * The alarm of the bottom gas: it is too rich for the deepest point of the plan
 * at the ppO2 for the bottom (`bottomModMm`, 0 or less when the gas has none).
 * @param {number} maxDepthMm
 * @param {number} bottomModMm
 */
export const modAlarm = (maxDepthMm, bottomModMm) => bottomModMm > 0 && maxDepthMm > bottomModMm;

/**
 * Oxygen and helium together: oxygen 1 to 100, helium 0 to 99, 100 % at most
 * in all.
 * @param {number} o2
 * @param {number} he
 */
export const gasValid = (o2, he) => o2 >= 1 && o2 <= 100 && he >= 0 && he <= 99 && o2 + he <= 100;

// --- Dropdown choices of the gas, SAC and altitude fields ----------------------

/** @param {number} from @param {number} to */
const range = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/**
 * Every oxygen fraction the menu offers, % (Christian, 11 November 2026: every
 * value from 5 to 100, by 1, all of them; a mix above 100 % with the helium is
 * shown as an error on the fields, not hidden).
 */
export const O2_CHOICES = range(5, 100);

/** Every helium fraction the menu offers, %: 0 to 95, by 1, all of them. */
export const HE_CHOICES = range(0, 95);
/** The usual altitudes, in feet or in metres (the diver's depth unit). @param {boolean} feet */
export const altitudePresets = (feet) => (feet ? [0, 1000, 2000, 3000, 5000, 7000, 10000] : [0, 300, 600, 1000, 1500, 2000, 3000]);

/**
 * A typed number: "12,5" or "12.5"; NaN when empty or not a number.
 * @param {string} text
 */
export const parseNumber = (text) => (String(text).trim() === '' ? NaN : Number(String(text).trim().replace(',', '.')));

/**
 * The values of a dropdown: the usual ones, and above them the current value
 * when it is not one of them (33 % read from a dive), so that it shows in the
 * field and is checked in the menu. Nothing is added for an empty or invalid
 * entry.
 * @param {number[]} presets
 * @param {number} current
 * @returns {number[]}
 */
export function choiceValues(presets, current) {
  return Number.isFinite(current) && !presets.includes(current) ? [current, ...presets] : [...presets];
}

/** The SAC step: 0.01 cuft/min or 0.5 L/min, in ml/min. @param {boolean} cuft */
export const sacStepMl = (cuft) => (cuft ? 0.01 * ML_PER_CUFT : 500);

/**
 * A SAC rounded to its step (two decimals in cuft/min, 0.5 L/min), in ml/min:
 * what a dive measured is shown and used, never "0.355".
 * @param {number} ml
 * @param {boolean} cuft
 */
export function roundSacMl(ml, cuft) {
  if (cuft) return Math.round((Math.round((ml / ML_PER_CUFT) * 100) / 100) * ML_PER_CUFT);
  return Math.round(ml / 500) * 500;
}

/**
 * The SAC values of a menu, in ml/min: the steps around the current value (20
 * each side), within 0.04 to 3.5 cuft/min or 1 to 99 L/min, and the current
 * value itself when it is off them.
 * @param {number} currentMl
 * @param {boolean} cuft
 */
export function sacChoices(currentMl, cuft) {
  const step = sacStepMl(cuft);
  const min = cuft ? 0.04 * ML_PER_CUFT : 1000;
  const max = cuft ? 3.5 * ML_PER_CUFT : 99000;
  const base = Math.round(currentMl / step);
  /** @type {number[]} */
  const values = [];
  for (let k = base - 20; k <= base + 20; k++) {
    const ml = Math.round(k * step);
    if (ml >= min && ml <= max) values.push(ml);
  }
  if (!values.includes(currentMl)) values.push(currentMl);
  return values.sort((a, b) => a - b);
}
