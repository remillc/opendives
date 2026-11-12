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
//   settings (settings.svelte.js), read back with plannerSetup. A saved plan
//   keeps its own copy, so that reopening it gives the same result.
import { OpenDivesCore } from 'opendives-core';
import { settings, setAppSetting, setCorePrefs, resetCorePrefs } from './settings.svelte.js';
import { DEFAULT_STRESS_FACTOR, DEFAULT_DIVERS, coreSacFactor } from './reserve-factor.js';
import { SETTING_KEYS } from './settings-reset.js';
import { altitudeToPressureMbar, salinityOfWaterType } from './tools.js';
import { bottomCylinder } from './plan-gases.js';
import { defaultPlanTitle } from './plan-title.js';

/** @typedef {import('opendives-core').PlannerSetup} PlannerSetup */
/** @typedef {import('opendives-core').DiveDetail} DiveDetail */
/** @typedef {import('opendives-core').PlanRequest} PlanRequest */
/** @typedef {import('opendives-core').PlannedDive} PlannedDive */

export { SETTING_KEYS };

/** The settings a saved plan keeps; its two SACs are already fields of the plan. */
const KEPT_KEYS = SETTING_KEYS.filter((k) => k !== 'bottomSacMlMin' && k !== 'decoSacMlMin');

/** Subsurface's defaults for the two SACs, ml/min, until the planner settings are read. */
const BOTTOM_SAC_DEFAULT = 20000;
const DECO_SAC_DEFAULT = 17000;

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
 * stands for.
 * @typedef {{ o2Permille: number, hePermille: number, sourceCylinder?: number }} PlanGas
 */

/** @typedef {{ decoModel: 'buehlmann'|'vpmb', gfLow: number, gfHigh: number, vpmbConservatism: number }} PlanDeco */

export const planner = $state({
  /** The logbook dive the plan starts from, or null for a new dive. */
  source: /** @type {PlanSource|null} */ (null),
  /** The planned dive reopened (saving replaces it), or 0. */
  planId: 0,
  /** The title the plan is saved with (task 37); empty for none. */
  title: '',
  /** The plan just saved, for the list to highlight it once (id), or 0. */
  justSaved: 0,
  /** Local time of the plan, seconds; 0 until the core has chosen one. */
  when: 0,
  levels: /** @type {Level[]} */ ([{ depthMm: 15000, durationSeconds: 20 * 60 }]),
  /** A plan from a logbook dive whose measured profile was replaced by `levels` ("Simplifier le profil"). */
  simplified: false,
  /** The first one is the bottom gas. */
  gases: /** @type {PlanGas[]} */ ([{ o2Permille: 209, hePermille: 0 }]),
  /** Water type as a salinity in kg per 10000 l. */
  salinity: 10300,
  surfacePressureMbar: 1013,
  /** SAC at the bottom, ml/min (the measured one from a dive). */
  bottomSacMlMin: BOTTOM_SAC_DEFAULT,
  /** SAC during the ascent and the stops, ml/min (from the planner settings). */
  decoSacMlMin: DECO_SAC_DEFAULT,
  deco: /** @type {PlanDeco} */ ({ decoModel: 'buehlmann', gfLow: 30, gfHigh: 75, vpmbConservatism: 3 }),
  /** The settings kept with the plan reopened; null: the core's preferences apply. */
  kept: /** @type {Record<string, number>|null} */ (null),
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
 * A planner-only setting: the plan's own while a saved plan is open, else as
 * the core holds it.
 * @param {typeof SETTING_KEYS[number]} key
 * @returns {number|boolean}
 */
export function setting(key) {
  const kept = planner.kept?.[key];
  if (kept !== undefined) return kept;
  return planner.setup ? planner.setup[key] : 0;
}

/** The settings to save with a plan, as the core reads them (numbers only). */
export function planSettings() {
  if (planner.kept) return { ...planner.kept };
  const setup = planner.setup;
  if (!setup) return {};
  return Object.fromEntries(KEPT_KEYS.map((k) => [k, Math.round(Number(setup[k]))]));
}

/** A change made while a saved plan is open applies to it too. @param {Record<string, number|boolean>} changes */
function updateKept(changes) {
  if (!planner.kept) return;
  for (const [k, v] of Object.entries(changes)) if (k in planner.kept) planner.kept[k] = Number(v);
}

/**
 * Sets a planner-only setting in the core's preferences, kept on this device.
 * @param {typeof SETTING_KEYS[number]} key
 * @param {number|boolean} value
 */
export async function setSetting(key, value) {
  await setCorePrefs({ [key]: value });
  await loadSetup();
  updateKept({ [key]: value });
  planner.version++;
}

/**
 * The reserve's stress factor (x100) and divers on the gas: kept in the app's own
 * settings; the core receives their product as its one factor (task 2026-11-12-74).
 * @param {{ stressFactor?: number, reserveDivers?: number }} changes
 */
export async function setReserveFactor(changes) {
  if (changes.stressFactor != null) setAppSetting('stressFactor', changes.stressFactor);
  if (changes.reserveDivers != null) setAppSetting('reserveDivers', changes.reserveDivers);
  await setSetting('sacFactor', coreSacFactor(settings.stressFactor, settings.reserveDivers));
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
  const changes = Object.fromEntries(ASCENT_KEYS.map((k) => [k, mmMin]));
  await setCorePrefs(changes);
  await loadSetup();
  updateKept(changes);
  planner.version++;
}

/**
 * Back to Subsurface's values for the planner-only settings, with the single
 * ascent rate and the round defaults of the user's units.
 * @param {{ length: string, pressure: string }} prefs
 */
export async function resetSettings(prefs) {
  const d = plannerDefaults(prefs);
  setAppSetting('stressFactor', DEFAULT_STRESS_FACTOR);
  setAppSetting('reserveDivers', DEFAULT_DIVERS);
  await resetCorePrefs([...SETTING_KEYS]);
  await setCorePrefs({
    ...Object.fromEntries(ASCENT_KEYS.map((k) => [k, Math.round(d.ascentMmMin)])),
    descentMmMin: Math.round(d.descentMmMin),
    reserveMbar: d.reserveMbar,
    sacFactor: coreSacFactor(DEFAULT_STRESS_FACTOR, DEFAULT_DIVERS),
  });
  await loadSetup();
  if (planner.setup) updateKept(Object.fromEntries(KEPT_KEYS.map((k) => [k, Number(planner.setup?.[k])])));
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
 * open-circuit gas (the diluent of a rebreather dive) and the richer ones
 * after it, its measured SAC, its water
 * and surface pressure. Times and depths stay the dive's.
 * @param {DiveDetail} dive
 * @param {PlanSource} source
 * @param {Parameters<typeof decoOfSettings>[0]} prefs
 */
export function startFromDive(dive, source, prefs) {
  planner.source = source;
  planner.title = defaultPlanTitle(source);
  planner.simplified = false;
  planner.when = 0;
  const breathed = dive.cylinders.filter((c) => c.used && c.use === 'OC-gas');
  const bottom = bottomCylinder(dive.cylinders);
  planner.gases = bottom
    ? [bottom, ...breathed.filter((c) => c !== bottom && o2Of(c) > o2Of(bottom))].map((c) => ({
        o2Permille: o2Of(c),
        hePermille: c.hePermille,
        sourceCylinder: dive.cylinders.indexOf(c),
      }))
    : [{ o2Permille: 209, hePermille: 0 }];
  if (dive.sacMlMin > 0) planner.bottomSacMlMin = dive.sacMlMin;
  else planner.bottomSacMlMin = planner.setup?.bottomSacMlMin ?? BOTTOM_SAC_DEFAULT;
  planner.decoSacMlMin = planner.setup?.decoSacMlMin ?? DECO_SAC_DEFAULT;
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
  planner.title = '';
  planner.simplified = false;
  planner.when = 0;
  planner.levels = [{ depthMm: plannerDefaults(prefs).depthMm, durationSeconds: 20 * 60 }];
  planner.gases = [{ o2Permille: 209, hePermille: 0 }];
  planner.salinity = salinityOfWaterType(settings.defaultWater);
  planner.surfacePressureMbar = altitudeToPressureMbar(settings.defaultAltitudeMm);
  planner.bottomSacMlMin = planner.setup?.bottomSacMlMin ?? BOTTOM_SAC_DEFAULT;
  planner.decoSacMlMin = planner.setup?.decoSacMlMin ?? DECO_SAC_DEFAULT;
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
    bottomSacMlMin: planner.setup?.bottomSacMlMin ?? BOTTOM_SAC_DEFAULT,
    decoSacMlMin: planner.setup?.decoSacMlMin ?? DECO_SAC_DEFAULT,
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
 * @param {string} [title] the title the plan was saved with
 */
export function applyRequest(request, planId, source, title = '') {
  planner.planId = planId;
  planner.title = title;
  planner.source = source;
  planner.when = request.when ?? 0;
  planner.levels = request.levels?.length ? request.levels.map((l) => ({ ...l })) : planner.levels;
  planner.simplified = !!(source && request.levels?.length);
  planner.gases = request.cylinders.map((c) => ({
    o2Permille: c.o2Permille,
    hePermille: c.hePermille,
    ...(c.sourceCylinder !== undefined ? { sourceCylinder: c.sourceCylinder } : {}),
  }));
  planner.salinity = request.salinity ?? 10300;
  planner.surfacePressureMbar = request.surfacePressureMbar ?? 1013;
  planner.bottomSacMlMin = request.bottomSacMlMin ?? planner.setup?.bottomSacMlMin ?? BOTTOM_SAC_DEFAULT;
  planner.decoSacMlMin = request.decoSacMlMin ?? planner.setup?.decoSacMlMin ?? DECO_SAC_DEFAULT;
  planner.deco = {
    decoModel: request.decoModel === 1 ? 'vpmb' : 'buehlmann',
    gfLow: request.gfLow ?? 30,
    gfHigh: request.gfHigh ?? 75,
    vpmbConservatism: request.vpmbConservatism ?? 3,
  };
  // Saved by an earlier version: none, the current settings apply.
  const stored = /** @type {Record<string, number|undefined>} */ (/** @type {unknown} */ (request));
  const kept = Object.fromEntries(KEPT_KEYS.filter((k) => stored[k] !== undefined).map((k) => [k, Number(stored[k])]));
  planner.kept = Object.keys(kept).length ? kept : null;
  planner.loaded++;
  planner.version++;
}

/** The next gas added: EAN50, then oxygen. @returns {PlanGas} */
export function nextGas() {
  const has50 = planner.gases.some((g) => g.o2Permille === 500);
  return { o2Permille: has50 ? 1000 : 500, hePermille: 0 };
}

/**
 * The request for the core's planner. The planner-only settings are sent only
 * for a saved plan that kept its own: else the core reads its preferences.
 * @returns {PlanRequest}
 */
export function planRequest() {
  const deco = planner.deco;
  return {
    // A simplified plan keeps its dive (date, surface interval) and takes the levels.
    ...(planner.source ? { sourceDiveId: planner.source.id } : {}),
    ...(!planner.source || planner.simplified
      ? { levels: planner.levels.map((l) => ({ depthMm: Math.round(l.depthMm), durationSeconds: Math.round(l.durationSeconds) })) }
      : {}),
    ...(planner.when ? { when: planner.when } : {}),
    ...(planner.kept ?? {}),
    bottomSacMlMin: Math.round(planner.bottomSacMlMin),
    decoSacMlMin: Math.round(planner.decoSacMlMin),
    salinity: planner.salinity,
    surfacePressureMbar: planner.surfacePressureMbar,
    decoModel: deco.decoModel === 'vpmb' ? 1 : 0,
    gfLow: deco.gfLow,
    gfHigh: deco.gfHigh,
    vpmbConservatism: deco.vpmbConservatism,
    cylinders: planner.gases.map((g) => ({
      o2Permille: g.o2Permille,
      hePermille: g.hePermille,
      ...(g.sourceCylinder !== undefined ? { sourceCylinder: g.sourceCylinder } : {}),
    })),
  };
}

/** Whether the plan starts from a logbook dive and still uses its measured profile. */
export const canSimplify = () => !!planner.source && !planner.simplified;

/** Every field of the plan but the planner settings read back and the two counters. */
const SNAPSHOT_SKIP = new Set(['setup', 'version', 'loaded']);

/**
 * A copy of the plan as it is, to bring it back with restorePlan.
 * @returns {Record<string, any>}
 */
export function snapshotPlan() {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(planner).filter(([k]) => !SNAPSHOT_SKIP.has(k)))));
}

/** @param {Record<string, any>} snapshot from snapshotPlan */
export function restorePlan(snapshot) {
  Object.assign(planner, JSON.parse(JSON.stringify(snapshot)));
  planner.loaded++;
  planner.version++;
}

/**
 * "Simplifier le profil": the plan of a logbook dive takes levels in place of
 * the measured profile (the new-plan path), keeping the dive's date and surface
 * interval, gases, SAC and conditions.
 * @param {Level[]} levels
 * @returns {Record<string, any>} the plan as it was, for restorePlan
 */
export function simplifyPlan(levels) {
  const before = snapshotPlan();
  planner.levels = levels.map((l) => ({ depthMm: l.depthMm, durationSeconds: l.durationSeconds }));
  planner.simplified = true;
  planner.loaded++;
  planner.version++;
  return before;
}
