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
import { SEA_WATER_SALINITY, salinityOfWaterType } from './tools.js';

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
  'dropStone',
  'reserveMbar',
  'problemSolvingMinutes',
  'sacFactor',
  'decoSacMlMin',
  'bottomSacMlMin',
]);

/**
 * @typedef {Object} PlanSource
 * @property {number} id
 * @property {number} number the dive's number; 0 when it has none
 * @property {number} durationSeconds
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
  /** Water type as a salinity in kg per 10000 l (the dive's when it has one, else sea water). */
  salinity: 10300,
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

/**
 * The planner's defaults in the user's units, round in each system as
 * Subsurface's M_OR_FT: 15 m or 45 ft, 200 bar or 3000 psi, 9 m/min or
 * 30 ft/min, 18 m/min or 60 ft/min, a 40 bar or 500 psi reserve.
 * @param {{ length: string, pressure: string }} prefs
 */
export function plannerDefaults(prefs) {
  const ft = prefs.length === 'ft';
  const psi = prefs.pressure === 'psi';
  return {
    depthMm: ft ? 45 * 304.8 : 15000,
    startMbar: psi ? Math.round(3000 * 68.947572932) : 200000,
    ascentMmMin: ft ? 30 * 304.8 : 9000,
    descentMmMin: ft ? 60 * 304.8 : 18000,
    reserveMbar: psi ? Math.round(500 * 68.947572932) : 40000,
  };
}

/** Same rate, as the core keeps it: whole mm/s. @param {number} a @param {number} b */
const sameRate = (a, b) => Math.floor(a / 60) === Math.floor(b / 60);

/**
 * A setting never changed by the user still holds a default: when it is the
 * other unit system's, it takes this system's, so that 18 m/min shows as
 * 60 ft/min and not 59. Read the setup first.
 * @param {{ length: string, pressure: string }} prefs
 */
export async function adoptUnitDefaults(prefs) {
  const s = planner.setup;
  if (!s) return;
  const mine = plannerDefaults(prefs);
  const other = plannerDefaults({ length: prefs.length === 'ft' ? 'm' : 'ft', pressure: prefs.pressure === 'psi' ? 'bar' : 'psi' });
  /** @type {Record<string, number>} */
  const changes = {};
  if (ASCENT_KEYS.every((k) => sameRate(Number(s[k]), other.ascentMmMin)) && !sameRate(other.ascentMmMin, mine.ascentMmMin)) {
    for (const k of ASCENT_KEYS) changes[k] = Math.round(mine.ascentMmMin);
  }
  if (sameRate(s.descentMmMin, other.descentMmMin) && !sameRate(other.descentMmMin, mine.descentMmMin)) {
    changes.descentMmMin = Math.round(mine.descentMmMin);
  }
  if (s.reserveMbar === other.reserveMbar && other.reserveMbar !== mine.reserveMbar) changes.reserveMbar = mine.reserveMbar;
  if (Object.keys(changes).length) {
    await setCorePrefs(changes);
    await loadSetup();
  }
}

/** Subsurface reads four ascent rates, by depth band: OpenDives sets them all at once. */
export const ASCENT_KEYS = /** @type {const} */ (['ascent75MmMin', 'ascent50MmMin', 'ascentStopsMmMin', 'ascentLast6mMmMin']);

/** The single ascent rate (spec, "Planner settings"), 9 m/min by default. */
export const DEFAULT_ASCENT_MM_MIN = 9000;

/** The ascent rate shown: the first band's, which "Remontée" writes to all four. */
export function ascentRate() {
  return Number(setting('ascent75MmMin')) || DEFAULT_ASCENT_MM_MIN;
}

/**
 * "Remontée": one rate for Subsurface's four depth bands (task 2026-11-08-03).
 * @param {number} mmMin
 */
export async function setAscentRate(mmMin) {
  await setCorePrefs(Object.fromEntries(ASCENT_KEYS.map((k) => [k, mmMin])));
  await loadSetup();
  planner.version++;
}

/**
 * Back to Subsurface's values for the planner-only settings, with the single
 * ascent rate and the round defaults of the user's units.
 * @param {{ length: string, pressure: string }} prefs
 */
export async function resetSettings(prefs) {
  const d = plannerDefaults(prefs);
  await resetCorePrefs([...SETTING_KEYS]);
  await setCorePrefs({
    ...Object.fromEntries(ASCENT_KEYS.map((k) => [k, Math.round(d.ascentMmMin)])),
    descentMmMin: Math.round(d.descentMmMin),
    reserveMbar: d.reserveMbar,
  });
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
  // The dive's water type when it has one, else sea water.
  planner.salinity = salinityOfWaterType(dive.waterType);
  planner.version++;
}

/**
 * A new dive, with Subsurface's planner defaults in the user's units, and
 * the default cylinder of Settings when there is one.
 * @param {{ length: string, pressure: string }} prefs
 * @param {number} [cylinderMl] water volume of the default cylinder
 */
export function startNewDive(prefs, cylinderMl = 0) {
  const d = plannerDefaults(prefs);
  planner.source = null;
  planner.depthMm = d.depthMm;
  planner.bottomTimeSeconds = 20 * 60;
  planner.o2Permille = 209;
  planner.hePermille = 0;
  planner.salinity = SEA_WATER_SALINITY;
  planner.sizeMl = cylinderMl > 0 ? cylinderMl : 12000;
  planner.startMbar = d.startMbar;
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
    salinity: planner.salinity,
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
