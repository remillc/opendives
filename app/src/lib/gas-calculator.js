// SPDX-License-Identifier: GPL-2.0
// @ts-check
// Gas calculator of the Tools section: MOD, EAD, END, best nitrox and best
// trimix. Derived from Subsurface, and written so that every figure equals the
// one the core gave before this code moved to JavaScript (integer arithmetic,
// truncations and the rounding of lrint() kept as they are):
//   - dive::gas_mod(), dive::best_o2(), dive::best_he(), dive::depth_to_mbar(),
//     dive::depth_to_atm(), dive::rel_mbar_to_depth() (third_party/subsurface/core/dive.cpp);
//   - get_o2(), get_he(), get_n2(), gasmix_is_air(), sanitize_gasmix() (core/gas.cpp, gas.h);
//   - the equivalent depth at the MOD of DivePlannerPointsModel::calculateGasInfo()
//     (qt-models/diveplannermodel.cpp, Subsurface-mobile).
// A planner dive: 1013 mbar at the surface, one water type for every depth.

/** Oxygen of air in per mille, read by the core for a mix whose oxygen is 0 (units.h O2_IN_AIR). */
const O2_IN_AIR = 209;
/** Nitrogen of air in per mille (units.h N2_IN_AIR). */
const N2_IN_AIR = 781;
/** The core's atmosphere in mbar (units.h, 1_atm). */
const ATM_MBAR = 1013;
/** Default water type: sea water, kg per 10000 l. */
export const SEAWATER_SALINITY = 10300;

/**
 * C's lrint() in the default rounding mode: to the nearest integer, halves to even.
 * @param {number} x
 * @returns {number}
 */
export function lrint(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  const rounded = diff < 0.5 ? floor : diff > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
  return rounded === 0 ? 0 : rounded;
}

/**
 * The same as `Math.trunc`, without a negative zero.
 * @param {number} x
 * @returns {number}
 */
function trunc(x) {
  const t = Math.trunc(x);
  return t === 0 ? 0 : t;
}

/**
 * The oxygen the core reads for a mix: an oxygen of 0 means air (get_o2()).
 * @param {number} o2Permille
 * @returns {number} per mille
 */
export function coreO2(o2Permille) {
  return o2Permille ? o2Permille : O2_IN_AIR;
}

/**
 * The oxygen the core keeps after sanitize_gasmix(): 20.8 to 21 % without helium is air, stored as 0
 * and read back as 20.9 %.
 * @param {number} o2Permille
 * @param {number} hePermille
 * @returns {number} per mille, as get_o2() returns it
 */
function sanitizedO2(o2Permille, hePermille) {
  const air = hePermille === 0 && o2Permille >= O2_IN_AIR - 1 && o2Permille <= O2_IN_AIR + 1;
  return air ? O2_IN_AIR : coreO2(o2Permille);
}

/**
 * Ambient pressure at a depth (dive::depth_to_mbar()), rounded to a whole mbar.
 * @param {number} depthMm
 * @param {number} salinity kg per 10000 l
 * @returns {number} mbar
 */
function depthToMbar(depthMm, salinity) {
  return lrint(ATM_MBAR + depthMm * ((salinity * 0.981) / 100000.0));
}

/**
 * Depth for a pressure above the surface (dive::mbar_to_depth()).
 * @param {number} mbar absolute
 * @param {number} salinity kg per 10000 l
 * @returns {number} mm
 */
function mbarToDepth(mbar, salinity) {
  return lrint((mbar - ATM_MBAR) / ((salinity * 0.981) / 100000.0));
}

/**
 * MOD in whole metres (dive::gas_mod() with a rounding of 1 m): from 0.9 of a metre it rounds up, which
 * lets the oxygen switch happen at 6 m.
 * @param {number} o2Permille oxygen as the core reads it
 * @param {number} po2Mbar
 * @param {number} salinity
 * @returns {number} mm
 */
function gasMod(o2Permille, po2Mbar, salinity) {
  const depth = mbarToDepth(trunc((po2Mbar * 1000) / o2Permille), salinity);
  return trunc(depth / 1000 + 0.1) * 1000;
}

/**
 * Equivalent depth at a depth, for one choice of oxygen narcotic: true gives the END (oxygen and nitrogen
 * narcotic), false the EAD (nitrogen only).
 * @param {number} n2Permille nitrogen of the mix as the core reads it
 * @param {number} o2Permille oxygen of the request
 * @param {number} depthMm
 * @param {boolean} o2IsNarcotic
 * @param {number} salinity
 * @returns {number} mm
 */
function equivalentDepth(n2Permille, o2Permille, depthMm, o2IsNarcotic, salinity) {
  const narcotic = o2IsNarcotic ? n2Permille + o2Permille : n2Permille;
  const ambientAtm = depthToMbar(depthMm, salinity) / ATM_MBAR;
  const pNarcotic = (ambientAtm * narcotic) / 1000.0;
  let mm = 0;
  if (narcotic > 0) {
    const eadAtm = pNarcotic / (o2IsNarcotic ? 1.0 : 0.79);
    mm = trunc((eadAtm - 1.0) * 10000.0);
    if (mm < 0) mm = 0;
  }
  return mm;
}

/**
 * The preferences of the core the gas calculator reads.
 * @typedef {Object} GasCalculatorPrefs
 * @property {boolean} o2narcotic oxygen counted as narcotic for the END
 * @property {number} bestMixEndMm maximum END of the best mix, mm
 */

/**
 * @typedef {Object} GasResult
 * @property {number} o2 per mille
 * @property {number} he per mille
 * @property {number} po2Mbar
 * @property {number} modMm MOD, rounded to 1 m
 * @property {number} eadMm equivalent air depth at the MOD
 * @property {number} endMm equivalent narcotic depth at the MOD
 * @property {number} eadPlannedMm EAD at the planned depth
 * @property {number} endPlannedMm END at the planned depth
 * @property {boolean} o2Narcotic oxygen counted as narcotic in endMm
 * @property {number} plannedDepthMm
 * @property {number} bestO2 per mille, best mix for the planned depth at po2Mbar, rounded down to 1 %
 * @property {number} bestHe per mille, for the best-mix END, rounded up to 1 %
 * @property {number} bestMixEndMm the END limit used
 * @property {number} nitroxEndMm END of the best nitrox alone (no helium) at the planned depth
 */

/**
 * Calculates MOD, EAD, END, the best nitrox and the best trimix.
 * @param {number} o2Permille oxygen of the mix, 1 to 1000
 * @param {number} hePermille helium of the mix
 * @param {number} po2Mbar partial pressure of oxygen for the MOD and the best mix
 * @param {number} plannedDepthMm
 * @param {GasCalculatorPrefs} prefs the preferences read from the core
 * @param {number} [bestMixEndMm] when not negative, replaces prefs.bestMixEndMm for this calculation
 * @param {number} [salinity] water type, kg per 10000 l (10000 fresh to 10300 sea water)
 * @returns {GasResult}
 * @throws {Error} BAD_REQUEST when the water type, the gas or the pO2 is out of range
 */
export function gasCalculator(o2Permille, hePermille, po2Mbar, plannedDepthMm, prefs, bestMixEndMm = -1, salinity = SEAWATER_SALINITY) {
  if (salinity < 9900 || salinity > 10500) throw new Error('BAD_REQUEST: salinity out of range');
  if (o2Permille <= 0 || o2Permille > 1000 || hePermille < 0 || o2Permille + hePermille > 1000 || po2Mbar <= 0 || plannedDepthMm < 0) {
    throw new Error('BAD_REQUEST: gas or pO2 out of range');
  }
  const o2 = sanitizedO2(o2Permille, hePermille);
  const n2 = 1000 - o2 - hePermille;
  const o2Narcotic = !!prefs.o2narcotic;

  const mod = gasMod(o2, po2Mbar, salinity);
  const ead = equivalentDepth(n2, o2Permille, mod, false, salinity);
  const end = equivalentDepth(n2, o2Permille, mod, o2Narcotic, salinity);
  // The same two figures at the planned depth (EAD and MOD screen).
  const eadPlanned = equivalentDepth(n2, o2Permille, plannedDepthMm, false, salinity);
  const endPlanned = equivalentDepth(n2, o2Permille, plannedDepthMm, o2Narcotic, salinity);

  // Best mix for the planned depth, at the chosen pO2 (dive::best_o2(), integer arithmetic:
  // rounded down to a whole percent).
  const plannedMbar = depthToMbar(plannedDepthMm, salinity);
  const po2 = trunc((po2Mbar / 1000.0) * 1000.0);
  let bestO2 = trunc((po2 * 100) / plannedMbar) * 10;
  if (bestO2 > 1000) bestO2 = 1000;
  // Best helium (dive::best_he()): the END limit may be replaced for this calculation only.
  const bestEnd = bestMixEndMm >= 0 ? bestMixEndMm : prefs.bestMixEndMm;
  const pNarcotic = depthToMbar(bestEnd, salinity);
  let bestHe = o2Narcotic
    ? (100 - trunc((100 * pNarcotic) / plannedMbar)) * 10
    : 1000 - bestO2 - trunc((N2_IN_AIR * pNarcotic) / plannedMbar);
  if (bestHe < 0) bestHe = 0;
  // The nitrox alone (no helium) at the planned depth: its END, to compare with the limit.
  const nitroxEnd = equivalentDepth(1000 - coreO2(bestO2), bestO2, plannedDepthMm, o2Narcotic, salinity);

  return {
    o2,
    he: hePermille,
    po2Mbar,
    modMm: mod,
    eadMm: ead,
    endMm: end,
    eadPlannedMm: eadPlanned,
    endPlannedMm: endPlanned,
    o2Narcotic,
    plannedDepthMm,
    bestO2,
    bestHe,
    bestMixEndMm: bestEnd,
    nitroxEndMm: nitroxEnd,
  };
}
