// @ts-check
// Dive planner state (spec, section 4, "Planner"), shared by the planner
// screen and its settings screen. The plan itself always comes from the core
// (planDive, Subsurface's planner); nothing here is ever written to the
// logbook.
//
// - The dive to plan: depth, bottom time, the bottom gas and its cylinder,
//   SAC at the bottom, deco gases. From a logbook dive they are taken from
//   that dive (gas, cylinder, start pressure, measured SAC, richer gases as
//   deco gases); otherwise Subsurface's planner defaults.
// - The planner-only settings (rates, reserve, ppO2, last stop, gas switches,
//   SAC during the ascent) are the core's preferences, as Subsurface-mobile's
//   "Dive planner setup": set through setPrefs and kept as this device's
//   settings (settings.svelte.js), read back with plannerSetup.
// - The deco model, gradient factors and VPM-B conservatism are the shared
//   preferences of Settings, "Décompression": shown, never set here.
import { OpenDivesCore } from 'opendives-core';
import { setCorePrefs, resetCorePrefs } from './settings.svelte.js';

/** @typedef {import('opendives-core').PlannerSetup} PlannerSetup */
/** @typedef {import('opendives-core').DiveDetail} DiveDetail */

/** Planner-only settings: core preferences, set from the planner screen. */
export const SETTING_KEYS = /** @type {const} */ ([
  'bottomPo2Mbar',
  'decoPo2Mbar',
  'descentMmMin',
  'ascent75MmMin',
  'ascent50MmMin',
  'ascentStopsMmMin',
  'ascentLast6mMmMin',
  'lastStop6m',
  'safetyStop',
  'switchAtRequiredStop',
  'minSwitchSeconds',
  'o2Breaks',
  'reserveMbar',
  'problemSolvingMinutes',
  'sacFactor',
  'decoSacMlMin',
]);

/**
 * @typedef {Object} PlanSource
 * @property {number} id
 * @property {string} date
 * @property {string} site
 * @property {number} maxDepthMm
 * @property {number[]} profile
 */

/**
 * A deco gas; switchDepthMm 0: the MOD at the ppO2 for deco, as Subsurface sets it.
 * @typedef {{ o2Permille: number, hePermille: number, sizeMl: number, startMbar: number, switchDepthMm: number }} DecoGas
 */

/** Subsurface's deco gas when one is added: EAN50 in a 7 L cylinder at 200 bar. */
export const NEW_DECO_GAS = { o2Permille: 500, hePermille: 0, sizeMl: 7000, startMbar: 200000, switchDepthMm: 0 };

export const planner = $state({
  /** The logbook dive the plan starts from, or null for a new dive. */
  source: /** @type {PlanSource|null} */ (null),
  /** Depth of the bottom, mm. */
  depthMm: 15000,
  /** Bottom time, descent included, s (Subsurface's simple dive: 15 m, 20 min). */
  bottomTimeSeconds: 20 * 60,
  o2Permille: 209,
  hePermille: 0,
  sizeMl: 12000,
  startMbar: 200000,
  /** SAC at the bottom, ml/min (the measured one from a dive). */
  bottomSacMlMin: 20000,
  /** Deco gases, switched to on the ascent. */
  decoGases: /** @type {DecoGas[]} */ ([]),
  /** The planner settings as the core's preferences hold them, once read. */
  setup: /** @type {PlannerSetup|null} */ (null),
  /** Increases at each change, so that the plan is computed again. */
  version: 0,
});

/** Reads the core's planner settings (also after a change in Settings). */
export async function loadSetup() {
  planner.setup = await OpenDivesCore.plannerSetup();
  return planner.setup;
}

/**
 * A planner-only setting, as the core holds it.
 * @param {typeof SETTING_KEYS[number]} key
 * @returns {number|boolean}
 */
export function setting(key) {
  return planner.setup ? planner.setup[key] : 0;
}

/**
 * Sets a planner-only setting in the core's preferences, kept on this device.
 * @param {typeof SETTING_KEYS[number]} key
 * @param {number|boolean} value
 */
export async function setSetting(key, value) {
  await setCorePrefs({ [key]: value });
  await loadSetup();
  planner.version++;
}

/** Back to Subsurface's values for the planner-only settings. */
export async function resetSettings() {
  await resetCorePrefs([...SETTING_KEYS]);
  await loadSetup();
  planner.version++;
}

/**
 * Starts a plan from a logbook dive: its first breathed open-circuit gas and
 * cylinder, its start pressure and its measured SAC; its richer gases as deco
 * gases. The depth is the dive's maximum depth, rounded down to the metre (or
 * foot); the bottom time stays Subsurface's 20 min.
 * @param {DiveDetail} dive
 * @param {PlanSource} source
 * @param {boolean} feet
 */
export function startFromDive(dive, source, feet) {
  planner.source = source;
  const step = feet ? 304.8 : 1000;
  if (dive.maxDepthMm > 0) planner.depthMm = Math.max(step, Math.floor(dive.maxDepthMm / step) * step);
  const breathed = dive.cylinders.filter((c) => c.used && c.use === 'OC-gas');
  const bottom = breathed[0] ?? dive.cylinders.find((c) => c.used) ?? dive.cylinders[0];
  // The core stores air as 0 per mille.
  const o2 = (/** @type {{ o2Permille: number }} */ c) => c.o2Permille || 209;
  if (bottom) {
    planner.o2Permille = o2(bottom);
    planner.hePermille = bottom.hePermille;
    if (bottom.sizeMl > 0) planner.sizeMl = bottom.sizeMl;
    const start = bottom.startMbar || bottom.workingPressureMbar;
    if (start > 0) planner.startMbar = start;
  }
  planner.decoGases = breathed
    .filter((c) => c !== bottom && bottom && o2(c) > o2(bottom))
    .map((c) => ({
      o2Permille: o2(c),
      hePermille: c.hePermille,
      sizeMl: c.sizeMl || NEW_DECO_GAS.sizeMl,
      startMbar: c.startMbar || c.workingPressureMbar || NEW_DECO_GAS.startMbar,
      switchDepthMm: 0,
    }));
  if (dive.sacMlMin > 0) planner.bottomSacMlMin = dive.sacMlMin;
  planner.version++;
}

/** A new dive, with Subsurface's planner defaults. */
export function startNewDive() {
  planner.source = null;
  planner.depthMm = 15000;
  planner.bottomTimeSeconds = 20 * 60;
  planner.o2Permille = 209;
  planner.hePermille = 0;
  planner.sizeMl = 12000;
  planner.startMbar = 200000;
  planner.bottomSacMlMin = planner.setup?.bottomSacMlMin ?? 20000;
  planner.decoGases = [];
  planner.version++;
}

/** Adds a deco gas (EAN50 by default). */
export function addDecoGas() {
  planner.decoGases = [...planner.decoGases, { ...NEW_DECO_GAS }];
  planner.version++;
}

/** @param {number} index */
export function removeDecoGas(index) {
  planner.decoGases = planner.decoGases.filter((_, i) => i !== index);
  planner.version++;
}

/**
 * The request for the core's planner. The planner-only settings are not
 * sent: the core reads them from its preferences.
 * @returns {import('opendives-core').PlanRequest}
 */
export function planRequest() {
  return {
    depthMm: Math.round(planner.depthMm),
    bottomTimeSeconds: Math.round(planner.bottomTimeSeconds),
    bottomSacMlMin: Math.round(planner.bottomSacMlMin),
    cylinders: [
      {
        o2Permille: planner.o2Permille,
        hePermille: planner.hePermille,
        sizeMl: Math.round(planner.sizeMl),
        startMbar: Math.round(planner.startMbar),
      },
      ...planner.decoGases.map((g) => ({
        o2Permille: g.o2Permille,
        hePermille: g.hePermille,
        sizeMl: Math.round(g.sizeMl),
        startMbar: Math.round(g.startMbar),
        switchDepthMm: Math.round(g.switchDepthMm),
      })),
    ],
  };
}
