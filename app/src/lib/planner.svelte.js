// @ts-check
// Dive planner state (spec, section 4, "Planner"), shared by the planner
// screen and its settings screen. The plan itself always comes from the core
// (planDive, Subsurface's planner); nothing here is ever written to the
// logbook.
//
// - The dive to plan: depth, bottom time, the gas and its cylinder, SAC. From a
//   logbook dive they are taken from that dive (gas, cylinder, start pressure,
//   measured SAC); otherwise Subsurface's planner defaults.
// - The planner-only settings (rates, reserve, ppO2, last stop, gas switches),
//   kept on this device, as Subsurface-mobile's "Dive planner setup".
// - The deco model, gradient factors and VPM-B conservatism are not here: the
//   core reads them from the shared preferences (Settings, "Décompression").
import { OpenDivesCore } from 'opendives-core';

/** @typedef {import('opendives-core').PlannerSetup} PlannerSetup */
/** @typedef {import('opendives-core').DiveDetail} DiveDetail */

const STORAGE_KEY = 'od.planner';

/** Planner-only settings, as stored: the PlannerSetup keys the request may set. */
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

/** @returns {Record<string, number|boolean>} */
function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

/**
 * @typedef {Object} PlanSource
 * @property {number} id
 * @property {string} date
 * @property {string} site
 * @property {number} maxDepthMm
 * @property {number[]} profile
 */

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
  /** SAC at the bottom, ml/min; at deco, in the settings. */
  bottomSacMlMin: 20000,
  /** Planner-only settings changed on this device (the rest: core defaults). */
  settings: /** @type {Record<string, number|boolean>} */ (readStored()),
  /** The settings as the core holds them (plannerSetup), once read. */
  setup: /** @type {PlannerSetup|null} */ (null),
  /** Increases at each change, so that the plan is computed again. */
  version: 0,
});

/** Reads the core's planner settings once. */
export async function loadSetup() {
  planner.setup = await OpenDivesCore.plannerSetup();
  return planner.setup;
}

/**
 * A planner-only setting: the one chosen on this device, else the core's.
 * @param {typeof SETTING_KEYS[number]} key
 * @returns {number|boolean}
 */
export function setting(key) {
  const stored = planner.settings[key];
  if (stored !== undefined) return stored;
  return planner.setup ? planner.setup[key] : 0;
}

/**
 * @param {typeof SETTING_KEYS[number]} key
 * @param {number|boolean} value
 */
export function setSetting(key, value) {
  planner.settings = { ...planner.settings, [key]: value };
  planner.version++;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(planner.settings));
  } catch {
    // Not fatal: the setting lasts until the app closes.
  }
}

/** Back to the core's planner settings (Subsurface's defaults). */
export function resetSettings() {
  planner.settings = {};
  planner.version++;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not fatal.
  }
}

/**
 * Starts a plan from a logbook dive: its first breathed open-circuit gas and
 * cylinder, its start pressure and its measured SAC; the depth is the dive's
 * maximum depth, rounded down to the metre (or foot).
 * @param {DiveDetail} dive
 * @param {PlanSource} source
 * @param {boolean} feet
 */
export function startFromDive(dive, source, feet) {
  planner.source = source;
  const step = feet ? 304.8 : 1000;
  if (dive.maxDepthMm > 0) planner.depthMm = Math.max(step, Math.floor(dive.maxDepthMm / step) * step);
  const cylinder =
    dive.cylinders.find((c) => c.used && c.use === 'OC-gas') ?? dive.cylinders.find((c) => c.used) ?? dive.cylinders[0];
  if (cylinder) {
    // The core stores air as 0 per mille.
    planner.o2Permille = cylinder.o2Permille || 209;
    planner.hePermille = cylinder.hePermille;
    if (cylinder.sizeMl > 0) planner.sizeMl = cylinder.sizeMl;
    const start = cylinder.startMbar || cylinder.workingPressureMbar;
    if (start > 0) planner.startMbar = start;
  }
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
  planner.version++;
}

/** The request for the core's planner. @returns {import('opendives-core').PlanRequest} */
export function planRequest() {
  /** @type {Record<string, number|boolean>} */
  const settings = {};
  for (const key of SETTING_KEYS) settings[key] = setting(key);
  return {
    ...settings,
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
    ],
  };
}
