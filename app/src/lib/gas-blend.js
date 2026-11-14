// SPDX-License-Identifier: GPL-2.0
// @ts-check
// Gas blender of the Tools section: partial pressure blending with real-gas
// behaviour. The compressibility factor is Subsurface's gas_compressibility_factor()
// (third_party/subsurface/core/gas-model.cpp), copied with its coefficients; the blend
// itself moved here from the C++ façade (gas_blend()) with the same arithmetic.
//
// For a cylinder of fixed volume at a fixed (cooled) temperature, the amount of gas is
// n = P V / (Z R T), Z = the compressibility factor of the mix at pressure P. R, T and V
// are common to every term, so amounts are kept as n_hat = P / Z, in bar (the pressure
// the same amount would read if the gas were ideal).
//
// Wanted final mix F at Pf: n_f = Pf / Z(F, Pf), each component must end at its fraction
// of n_f. The residual gas (n_r = P0 / Z(R, P0)) and the nitrox top-up gas (no helium)
// bring the rest:
//   He : n_r*he_r + a_he                 = he_f * n_f
//   N2 : n_r*n2_r + t * n2_t             = n2_f * n_f
//   O2 : n_r*o2_r + a_o2 + t * o2_t      = o2_f * n_f
// which gives a_he, t (top-up) and a_o2, each of which must be >= 0. The pressure after
// each step solves P / Z(mix, P) = n_hat of the mix then (bisection, P / Z increases with
// P). When one is negative the residual gas is bled down: the conditions are linear in
// n_r, so the largest n_r that satisfies them is found and converted back to a pressure
// of the residual mix.

import { lrint, coreO2 } from './gas-calculator.js';

/**
 * "Virial minus one": the virial cubic form without the initial 1.0 (gas-model.cpp virial_m1()).
 * @param {readonly number[]} coeff
 * @param {number} x
 * @returns {number}
 */
function virialM1(coeff, x) {
  return x * coeff[0] + x * x * coeff[1] + x * x * x * coeff[2];
}

// Cubic virial least-square coefficients for O2, N2 and He, from Perry's Chemical
// Engineers' Handbook (7th edition), curve fitting by Lubomir (gas-model.cpp). The helium
// coefficients are a linear mix of the 323 K and 273 K isotherms, to be at 300 K.
const O2_COEFFICIENTS = [-7.18092073703e-4, +2.81852572808e-6, -1.50290620492e-9];
const N2_COEFFICIENTS = [-2.19260353292e-4, +2.92844845532e-6, -2.07613482075e-9];
const HE_COEFFICIENTS = [+4.87320026468e-4, -8.83632921053e-8, +5.33304543646e-11];

/**
 * Z = pV/nRT of a mix, at a pressure (gas_compressibility_factor()). The fit covers 0 to 500 bar;
 * a pressure outside is clamped. An oxygen of 0 is read as air, as the core does.
 * @param {number} o2Permille
 * @param {number} hePermille
 * @param {number} bar
 * @returns {number}
 */
export function compressibilityFactor(o2Permille, hePermille, bar) {
  bar = Math.min(Math.max(bar, 0.0), 500.0);
  const o2 = coreO2(o2Permille);
  const he = hePermille;
  const z = virialM1(O2_COEFFICIENTS, bar) * o2 + virialM1(HE_COEFFICIENTS, bar) * he + virialM1(N2_COEFFICIENTS, bar) * (1000 - o2 - he);
  // The 1.0 is added at the very end: the linear mixing of the three 1.0 terms is 1.0
  // whatever the mix; the * 0.001 is because the mixing used the raw permille values.
  return z * 0.001 + 1.0;
}

/**
 * Z of a mix given in fractions, rounded to a permille of each gas as the core's mix is.
 * An oxygen of 0 is read by the core as air, which is wrong for helium alone: Z is linear in
 * the fractions, so it is extrapolated from 1 and 2 permille of oxygen (the nitrogen
 * fraction goes slightly negative, which the core's linear formula accepts).
 * @param {number} o2 fraction
 * @param {number} he fraction
 * @param {number} bar
 * @returns {number}
 */
function blendZ(o2, he, bar) {
  const o2Permille = lrint(o2 * 1000);
  const hePermille = lrint(he * 1000);
  if (o2Permille === 0 && hePermille > 0) {
    const g1 = lrint(0.001 * 1000);
    const g2 = lrint(0.002 * 1000);
    return 2.0 * compressibilityFactor(g1, hePermille, bar) - compressibilityFactor(g2, hePermille, bar);
  }
  return compressibilityFactor(o2Permille, hePermille, bar);
}

/**
 * The amount of gas of a mix at a pressure, as the pressure it would read as an ideal gas.
 * @param {number} o2
 * @param {number} he
 * @param {number} bar
 * @returns {number} bar
 */
function blendNhat(o2, he, bar) {
  return bar <= 0 ? 0.0 : bar / blendZ(o2, he, bar);
}

/**
 * Pressure (bar) at which the cylinder holds `nHat` of the mix.
 * @param {number} o2
 * @param {number} he
 * @param {number} nHat
 * @returns {number}
 */
function blendPressure(o2, he, nHat) {
  if (nHat <= 0) return 0.0;
  let lo = 0.0;
  let hi = 600.0;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (blendNhat(o2, he, mid) < nHat) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * @typedef {Object} GasBlend
 * @property {boolean} feasible
 * @property {''|'RESIDUAL_TOO_HIGH'|'TOPUP_TOO_RICH'} error
 * @property {number} startMbar
 * @property {number} [bleedToMbar] RESIDUAL_TOO_HIGH: bleed the cylinder down to this; the steps start from it
 * @property {{gas: 'he'|'o2'|'topup', toMbar: number, addedMbar: number, volumeMl: number}[]} steps
 */

/**
 * Partial pressure blending of nitrox and trimix: helium, then oxygen (or the reverse), then a
 * nitrox top-up gas (air is 210). Wanted mix and top-up gas in per mille, pressures in mbar,
 * cylinder volume in ml; a start pressure of 0 is an empty cylinder (its mix is then ignored).
 * @param {number} o2Permille wanted mix
 * @param {number} hePermille wanted mix
 * @param {number} finalMbar wanted final pressure
 * @param {number} cylinderMl
 * @param {number} startMbar pressure in the cylinder before the fill
 * @param {number} startO2Permille mix in the cylinder
 * @param {number} startHePermille mix in the cylinder
 * @param {number} topupO2Permille top-up gas, 1 to 999
 * @param {boolean} [oxygenFirst] oxygen before helium
 * @returns {GasBlend}
 * @throws {Error} BAD_REQUEST when an argument is out of range
 */
export function gasBlend(o2Permille, hePermille, finalMbar, cylinderMl, startMbar, startO2Permille, startHePermille, topupO2Permille, oxygenFirst = false) {
  if (
    o2Permille <= 0 || o2Permille > 1000 || hePermille < 0 || o2Permille + hePermille > 1000 ||
    finalMbar <= 0 || finalMbar > 500000 || cylinderMl <= 0 || startMbar < 0 || startMbar > 500000 ||
    startO2Permille < 0 || startHePermille < 0 || startO2Permille + startHePermille > 1000 ||
    topupO2Permille <= 0 || topupO2Permille >= 1000
  ) {
    throw new Error('BAD_REQUEST: blend out of range');
  }
  const eps = 1e-6;
  const o2F = o2Permille / 1000.0, heF = hePermille / 1000.0, n2F = 1.0 - o2F - heF;
  const o2T = topupO2Permille / 1000.0, n2T = 1.0 - o2T;
  const o2R = startO2Permille / 1000.0, heR = startHePermille / 1000.0, n2R = 1.0 - o2R - heR;
  const finalBar = finalMbar / 1000.0;
  let startBar = startMbar / 1000.0;
  const nF = blendNhat(o2F, heF, finalBar);
  let nR = blendNhat(o2R, heR, startBar);

  /** @type {''|'RESIDUAL_TOO_HIGH'|'TOPUP_TOO_RICH'} */
  let reason = '';
  // Oxygen to add from an empty cylinder: negative when the top-up gas is too rich for the
  // wanted mix, whatever is bled.
  const a0 = o2F * nF - (o2T * n2F * nF) / n2T;
  if (a0 < -eps) {
    reason = 'TOPUP_TOO_RICH';
  } else {
    // Largest residual amount every condition allows.
    let limit = nF; // the cylinder cannot start with more than it ends with
    if (heR > 0) limit = Math.min(limit, (heF * nF) / heR);
    if (n2R > 0) limit = Math.min(limit, (n2F * nF) / n2R);
    const b = o2R - (o2T * n2R) / n2T;
    if (b > 0) limit = Math.min(limit, a0 / b);
    if (nR > limit + eps) {
      reason = 'RESIDUAL_TOO_HIGH';
      // Bleed pressure rounded down to 1 mbar, so as never to keep too much.
      startBar = Math.floor(blendPressure(o2R, heR, Math.max(0.0, limit)) * 1000.0) / 1000.0;
      nR = blendNhat(o2R, heR, startBar);
    }
  }

  /** @type {GasBlend} */
  const result = { feasible: reason === '', error: reason, startMbar, steps: [] };
  if (reason === 'RESIDUAL_TOO_HIGH') result.bleedToMbar = lrint(startBar * 1000.0);
  if (reason === 'TOPUP_TOO_RICH') return result;

  // The fill from the (possibly bled) residual gas.
  const aHe = Math.max(0.0, heF * nF - nR * heR);
  const t = Math.max(0.0, (n2F * nF - nR * n2R) / n2T);
  const aO2 = Math.max(0.0, o2F * nF - nR * o2R - t * o2T);

  // Mix and pressure after the first gas added, then after the second (the amounts to add do
  // not depend on the order, only the pressures read).
  const heN = nR * heR, o2N = nR * o2R, n2N = nR * n2R;
  /**
   * @param {number} heAmount
   * @param {number} o2Amount
   * @returns {number}
   */
  const pressureOf = (heAmount, o2Amount) => {
    const total = heAmount + o2Amount + n2N;
    return total > 0 ? blendPressure(o2Amount / total, heAmount / total, total) : 0.0;
  };
  let p1, p2;
  if (oxygenFirst) {
    p1 = pressureOf(heN, o2N + aO2);
    p2 = pressureOf(heN + aHe, o2N + aO2);
  } else {
    p1 = pressureOf(heN + aHe, o2N);
    p2 = pressureOf(heN + aHe, o2N + aO2);
  }
  const p3 = blendPressure(o2F, heF, nF); // the final pressure

  // Gas used, at 1 bar: n_hat * cylinder volume * Z of the pure gas at 1 bar.
  /**
   * @param {number} nHat
   * @param {number} o2
   * @param {number} he
   * @returns {number}
   */
  const ml = (nHat, o2, he) => lrint(nHat * cylinderMl * blendZ(o2, he, 1.0));
  /** @param {number} bar */
  const mbar = (bar) => lrint(bar * 1000.0);
  /**
   * @param {'he'|'o2'|'topup'} gas
   * @param {number} from
   * @param {number} to
   * @param {number} volume
   */
  const step = (gas, from, to, volume) => ({ gas, toMbar: mbar(to), addedMbar: mbar(to - from), volumeMl: volume });

  const heStep = oxygenFirst ? step('he', p1, p2, ml(aHe, 0, 1)) : step('he', startBar, p1, ml(aHe, 0, 1));
  const o2Step = oxygenFirst ? step('o2', startBar, p1, ml(aO2, 1, 0)) : step('o2', p1, p2, ml(aO2, 1, 0));
  result.steps = oxygenFirst ? [o2Step, heStep] : [heStep, o2Step];
  result.steps.push(step('topup', p2, p3, ml(t, o2T, 0)));
  return result;
}
