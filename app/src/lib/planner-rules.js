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
 * The alarm of "Volume transporté": the diver gave the volume carried (above
 * zero) and it is less than the volume needed.
 * @param {number} carriedMl 0: not given
 * @param {number} totalMl
 */
export const isShort = (carriedMl, totalMl) => carriedMl > 0 && carriedMl < totalMl;

/**
 * The alarm of the bottom gas: it is too rich for the deepest point of the plan
 * at the ppO2 for the bottom (`bottomModMm`, 0 or less when the gas has none).
 * @param {number} maxDepthMm
 * @param {number} bottomModMm
 */
export const modAlarm = (maxDepthMm, bottomModMm) => bottomModMm > 0 && maxDepthMm > bottomModMm;
