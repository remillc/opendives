// @ts-check
// Dive planner state (spec, section 4, "Planner, redesigned"), shared by the
// planner screen and its settings screen. The plan itself always comes from
// the core (planDive, Subsurface's planner); it reaches the logbook only when
// the diver saves it (savePlan, as a planned dive).
//
// - The dive to plan: levels (a new dive) or the profile of a logbook dive,
//   the gases, the SAC at the bottom, the water and the altitude.
// - The decompression model and gradient factors start from Settings and are
//   the plan's own: changing them never changes Settings.
// - The planner-only settings (rates, reserve, ppO2, last stop, gas switches,
//   SAC during the ascent) are the core's preferences, as Subsurface-mobile's
//   "Dive planner setup": set through setPrefs and kept as this device's
//   settings (settings.svelte.js), read back with plannerSetup.
import { OpenDivesCore } from 'opendives-core';
import { settings, setCorePrefs, resetCorePrefs } from './settings.svelte.js';
import { altitudeToPressureMbar, salinityOfWaterType } from './tools.js';

/** @typedef {import('opendives-core').PlannerSetup} PlannerSetup */
/** @typedef {import('opendives-core').DiveDetail} DiveDetail */
/** @typedef {import('opendives-core').PlanRequest} PlanRequest */
/** @typedef {import('opendives-core').PlannedDive} PlannedDive */

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

/** @typedef {{ depthMm: number, durationSeconds: number }} Level */

/**
 * A gas of the plan. `sourceCylinder`: the cylinder of the logbook dive it
 * stands for. `carriedMl`: the volume the diver carries, optional (0: not given).
 * @typedef {{ o2Permille: number, hePermille: number, carriedMl: number, sourceCylinder?: number }} PlanGas
 */

/** @typedef {{ decoModel: 'buehlmann'|'vpmb', gfLow: number, gfHigh: number, vpmbConservatism: number }} PlanDeco */

export const planner = $state({
  /** The logbook dive the plan starts from, or null for a new dive. */
  source: /** @type {PlanSource|null} */ (null),
  /** The planned dive reopened (saving replaces it), or 0. */
  planId: 0,
  /** Local time of the plan, seconds; 0 until the core has chosen one. */
  when: 0,
  levels: /** @type {Level[]} */ ([{ depthMm: 15000, durationSeconds: 20 * 60 }]),
  /** The first one is the bottom gas. */
  gases: /** @type {PlanGas[]} */ ([{ o2Permille: 209, hePermille: 0, carriedMl: 0 }]),
  /** Water type as a salinity in kg per 10000 l. */
  salinity: 10300,
  surfacePressureMbar: 1013,
  /** SAC at the bottom, ml/min (the measured one from a dive). */
  bottomSacMlMin: 20000,
  deco: /** @type {PlanDeco} */ ({ decoModel: 'buehlmann', gfLow: 30, gfHigh: 75, vpmbConservatism: 3 }),
  /** The planner settings as the core's preferences hold them, once read. */
  setup: /** @type {PlannerSetup|null} */ (null),
  /** Increases at each change, so that the plan is computed again. */
  version: 0,
  /** Increases when another plan is loaded, so that the fields are filled again. */
  loaded: 0,
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
 * Subsurface's M_OR_FT: 15 m or 45 ft, 9 m/min or 30 ft/min, 18 m/min or
 * 60 ft/min, a 40 bar or 500 psi reserve.
 * @param {{ length: string, pressure: string }} prefs
 */
export function plannerDefaults(prefs) {
  const ft = prefs.length === 'ft';
  const psi = prefs.pressure === 'psi';
  return {
    depthMm: ft ? 45 * 304.8 : 15000,
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
 * The decompression settings of Settings, as a plan starts from them.
 * @param {{ decoModel?: string, gfLow?: number, gfHigh?: number, vpmbConservatism?: number }} prefs
 * @returns {PlanDeco}
 */
function decoOfSettings(prefs) {
  return {
    decoModel: prefs.decoModel === 'vpmb' ? 'vpmb' : 'buehlmann',
    gfLow: prefs.gfLow ?? 30,
    gfHigh: prefs.gfHigh ?? 75,
    vpmbConservatism: prefs.vpmbConservatism ?? 3,
  };
}

/** The core stores air as 0 per mille. @param {{ o2Permille: number }} c */
const o2Of = (c) => c.o2Permille || 209;

/**
 * Starts a plan from a logbook dive: its profile, its first breathed
 * open-circuit gas and the richer ones after it, its measured SAC, its water
 * and surface pressure. Times and depths stay the dive's.
 * @param {DiveDetail} dive
 * @param {PlanSource} source
 * @param {Parameters<typeof decoOfSettings>[0]} prefs
 */
export function startFromDive(dive, source, prefs) {
  planner.source = source;
  planner.when = 0;
  const breathed = dive.cylinders.filter((c) => c.used && c.use === 'OC-gas');
  const bottom = breathed[0] ?? dive.cylinders.find((c) => c.used) ?? dive.cylinders[0];
  planner.gases = bottom
    ? [bottom, ...breathed.filter((c) => c !== bottom && o2Of(c) > o2Of(bottom))].map((c) => ({
        o2Permille: o2Of(c),
        hePermille: c.hePermille,
        carriedMl: 0,
        sourceCylinder: dive.cylinders.indexOf(c),
      }))
    : [{ o2Permille: 209, hePermille: 0, carriedMl: 0 }];
  if (dive.sacMlMin > 0) planner.bottomSacMlMin = dive.sacMlMin;
  else planner.bottomSacMlMin = planner.setup?.bottomSacMlMin ?? 20000;
  // The dive's water type when it has one, else sea water.
  planner.salinity = salinityOfWaterType(dive.waterType);
  planner.surfacePressureMbar = dive.surfacePressureMbar || 1013;
  planner.deco = decoOfSettings(prefs);
  planner.loaded++;
  planner.version++;
}

/**
 * A new dive: one level at Subsurface's default depth, air, the conditions and
 * the decompression settings of Settings.
 * @param {{ length: string, pressure: string } & Parameters<typeof decoOfSettings>[0]} prefs
 */
export function startNewDive(prefs) {
  planner.source = null;
  planner.when = 0;
  planner.levels = [{ depthMm: plannerDefaults(prefs).depthMm, durationSeconds: 20 * 60 }];
  planner.gases = [{ o2Permille: 209, hePermille: 0, carriedMl: 0 }];
  planner.salinity = salinityOfWaterType(settings.defaultWater);
  planner.surfacePressureMbar = altitudeToPressureMbar(settings.defaultAltitudeMm);
  planner.bottomSacMlMin = planner.setup?.bottomSacMlMin ?? 20000;
  planner.deco = decoOfSettings(prefs);
  planner.loaded++;
  planner.version++;
}

/**
 * The request of a saved plan: as OpenDives saved it, or rebuilt from the
 * planned dive when it was made elsewhere or changed since.
 * @param {PlannedDive} plan
 * @param {Parameters<typeof decoOfSettings>[0]} prefs
 * @returns {PlanRequest}
 */
export function requestOfPlan(plan, prefs) {
  /** @type {PlanRequest|null} */
  let stored = null;
  try {
    stored = plan.request ? JSON.parse(plan.request) : null;
  } catch {
    stored = null;
  }
  const same = (/** @type {Level[]} */ a, /** @type {Level[]} */ b) =>
    a.length === b.length && a.every((l, i) => l.depthMm === b[i].depthMm && Math.abs(l.durationSeconds - b[i].durationSeconds) <= 60);
  if (stored && (stored.sourceDiveId || same(stored.levels ?? [], plan.levels))) return stored;
  const deco = decoOfSettings(prefs);
  return {
    when: plan.when,
    levels: plan.levels.length ? plan.levels : [{ depthMm: plan.maxDepthMm, durationSeconds: 20 * 60 }],
    salinity: plan.salinity || 10300,
    surfacePressureMbar: plan.surfacePressureMbar || 1013,
    bottomSacMlMin: planner.setup?.bottomSacMlMin ?? 20000,
    decoModel: deco.decoModel === 'vpmb' ? 1 : 0,
    gfLow: deco.gfLow,
    gfHigh: deco.gfHigh,
    vpmbConservatism: deco.vpmbConservatism,
    cylinders: plan.gases.map((g) => ({ o2Permille: g.o2Permille || 209, hePermille: g.hePermille })),
  };
}

/**
 * Reopens a saved plan.
 * @param {PlanRequest} request
 * @param {number} planId
 * @param {PlanSource|null} source
 */
export function applyRequest(request, planId, source) {
  planner.planId = planId;
  planner.source = source;
  planner.when = request.when ?? 0;
  planner.levels = request.levels?.length ? request.levels.map((l) => ({ ...l })) : planner.levels;
  planner.gases = request.cylinders.map((c) => ({
    o2Permille: c.o2Permille,
    hePermille: c.hePermille,
    carriedMl: c.carriedMl ?? 0,
    ...(c.sourceCylinder !== undefined ? { sourceCylinder: c.sourceCylinder } : {}),
  }));
  planner.salinity = request.salinity ?? 10300;
  planner.surfacePressureMbar = request.surfacePressureMbar ?? 1013;
  planner.bottomSacMlMin = request.bottomSacMlMin ?? planner.setup?.bottomSacMlMin ?? 20000;
  planner.deco = {
    decoModel: request.decoModel === 1 ? 'vpmb' : 'buehlmann',
    gfLow: request.gfLow ?? 30,
    gfHigh: request.gfHigh ?? 75,
    vpmbConservatism: request.vpmbConservatism ?? 3,
  };
  planner.loaded++;
  planner.version++;
}

/** The next gas added: EAN50, then oxygen. @returns {PlanGas} */
export function nextGas() {
  const has50 = planner.gases.some((g) => g.o2Permille === 500);
  return { o2Permille: has50 ? 1000 : 500, hePermille: 0, carriedMl: 0 };
}

/**
 * The request for the core's planner. The planner-only settings are not
 * sent: the core reads them from its preferences.
 * @returns {PlanRequest}
 */
export function planRequest() {
  const deco = planner.deco;
  return {
    ...(planner.source
      ? { sourceDiveId: planner.source.id }
      : { levels: planner.levels.map((l) => ({ depthMm: Math.round(l.depthMm), durationSeconds: Math.round(l.durationSeconds) })) }),
    ...(planner.when ? { when: planner.when } : {}),
    bottomSacMlMin: Math.round(planner.bottomSacMlMin),
    salinity: planner.salinity,
    surfacePressureMbar: planner.surfacePressureMbar,
    decoModel: deco.decoModel === 'vpmb' ? 1 : 0,
    gfLow: deco.gfLow,
    gfHigh: deco.gfHigh,
    vpmbConservatism: deco.vpmbConservatism,
    cylinders: planner.gases.map((g) => ({
      o2Permille: g.o2Permille,
      hePermille: g.hePermille,
      ...(g.carriedMl > 0 ? { carriedMl: Math.round(g.carriedMl) } : {}),
      ...(g.sourceCylinder !== undefined ? { sourceCylinder: g.sourceCylinder } : {}),
    })),
  };
}
