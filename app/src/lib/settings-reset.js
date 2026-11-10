// @ts-check
// What "Réinitialiser tous les réglages" touches (docs/ui-specification.md,
// "Settings, Réinitialiser tous les réglages asks first"). Pure functions, so
// node tests can check the list.

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

/** App settings that belong to the planner ("Conditions par défaut"): kept by the reset. */
export const PLANNER_APP_KEYS = /** @type {const} */ (['defaultWater', 'defaultAltitudeMm']);

/**
 * The core values to set back to Subsurface's defaults: all but the planner's.
 * @param {Record<string, unknown>} defaults
 * @returns {Record<string, unknown>}
 */
export function coreResetChanges(defaults) {
  const planner = /** @type {readonly string[]} */ (SETTING_KEYS);
  return Object.fromEntries(Object.entries(defaults).filter(([key]) => !planner.includes(key)));
}

/**
 * The device's remembered core values after the reset: only the planner's stay.
 * @param {Record<string, unknown>} stored
 * @returns {Record<string, unknown>}
 */
export function storedAfterReset(stored) {
  const planner = /** @type {readonly string[]} */ (SETTING_KEYS);
  return Object.fromEntries(Object.entries(stored).filter(([key]) => planner.includes(key)));
}

/**
 * The app's own settings after the reset: their defaults, except the planner's.
 * @template {Record<string, unknown>} T
 * @param {T} current
 * @param {T} appDefaults
 * @returns {T}
 */
export function appSettingsAfterReset(current, appDefaults) {
  const kept = /** @type {readonly string[]} */ (PLANNER_APP_KEYS);
  return /** @type {T} */ ({ ...appDefaults, ...Object.fromEntries(Object.entries(current).filter(([key]) => kept.includes(key))) });
}
