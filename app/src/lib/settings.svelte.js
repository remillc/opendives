// @ts-check
// Settings of this device (docs/ui-specification.md, section 4, "Settings,
// modelled on Subsurface"). As in Subsurface, they belong to the device, not
// to the logbook: the values of the core's preferences changed by the diver
// are kept here and set again in the core at each start (applyDeviceSettings),
// before the logbook is loaded. Only trip grouping is the logbook's
// (autogroup), changed through the logbook (logbook.svelte.js).
//
// The app's own settings (language, theme, date and time formats, GPS
// coordinates, Bluetooth filter) live here only.
import { OpenDivesCore } from 'opendives-core';

const CORE_KEY = 'od.corePrefs';
const LIBRARY_KEY = 'od.cylinderLibrary';
const APP_KEY = 'od.appSettings';
/** The last dive computer used and the four remembered ones (setPrefs diveComputerList). */
const COMPUTERS_KEY = 'od.diveComputers';

/** SAC factor under stress, x100: 2.0, the planner's default. */
export const DEFAULT_SAC_FACTOR = 200;

/** @typedef {import('opendives-core').CorePrefValues} CorePrefValues */

/**
 * @typedef {Object} AppSettings
 * @property {'system'|'fr'|'fr-CA'|'en'} language
 * @property {'system'|'light'|'dark'} theme
 * @property {'system'|'iso'|'medium'|'dmy'|'mdy'} dateFormat
 * @property {'system'|'24'|'12'} timeFormat
 * @property {'decimal'|'minutes'|'seconds'} coordinatesFormat GPS coordinates, formatted by
 *   OpenDives itself (the core only knows seconds and decimal): -35.4485, 35° 26.9′ S, 35° 26′ 54.6″ S
 * @property {boolean} showAllBluetooth the Bluetooth scan shows every device, not only dive computers
 * @property {'system'|'letter'|'a4'} paperSize the PDF sheet of a dive: "system" follows the
 *   device's region (US Letter where it is used, A4 elsewhere)
 * @property {'fresh'|'salt'|'en13319'} defaultWater "Conditions par défaut": the water type a new
 *   plan and the gas calculator start from
 * @property {number} defaultAltitudeMm "Conditions par défaut": the altitude a new plan starts from, mm
 * @property {string} defaultDiluent cylinder type added as diluent when a dive becomes CCR or pSCR
 * @property {string} defaultOxygen the same for the oxygen cylinder
 * @property {string[]} defaultBailout the same for the bailout cylinders (open-circuit use)
 */

/** @type {AppSettings} */
const APP_DEFAULTS = {
  language: 'system',
  theme: 'system',
  dateFormat: 'system',
  timeFormat: 'system',
  coordinatesFormat: 'decimal',
  showAllBluetooth: false,
  paperSize: 'system',
  defaultWater: 'salt',
  defaultAltitudeMm: 0,
  defaultDiluent: '',
  defaultOxygen: '',
  defaultBailout: [],
};

/**
 * Qt format strings written in the core's date_format and time_format, as
 * Subsurface's language page stores them.
 */
export const DATE_PATTERNS = { iso: 'yyyy-MM-dd', medium: 'd MMM yyyy', dmy: 'dd/MM/yyyy', mdy: 'MM/dd/yyyy' };
export const TIME_PATTERNS = { 24: 'HH:mm', 12: 'h:mm AP' };

/** @param {string} key */
function readJson(key) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** @param {string} key @param {unknown} value */
function writeJson(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal: the setting lasts until the app closes.
  }
}

/** The core values changed on this device: {key: value}. @type {Partial<CorePrefValues>} */
const storedCore = readJson(CORE_KEY) ?? {};
// Before Settings followed Subsurface, the conditions switch had its own key.
try {
  if (!('extraEnvironmental' in storedCore) && localStorage.getItem('od.extraConditions') === 'true')
    storedCore.extraEnvironmental = true;
} catch {
  // Not fatal.
}

export const settings = $state({
  ...APP_DEFAULTS,
  ...(/** @type {Partial<AppSettings>} */ (readJson(APP_KEY) ?? {})),
  /**
   * "Surface waves, surge and chill" (spec, section 4, "Conditions"), the
   * core's extraEnvironmentalDefault: off by default. On, editing adds these
   * three conditions; the detail shows filled-in conditions either way.
   */
  extraConditions: storedCore.extraEnvironmental === true,
  /** Dive durations (the core's units.duration_units), not stored in the logbook. */
  duration: /** @type {'mixed'|'minutes'|'hours'} */ (storedCore.duration ?? 'mixed'),
});

/**
 * At start, before the logbook is loaded: the device's values go back into
 * the core, and its cylinder types library. The calls are sent at once, not
 * one after the other: the core runs them in the order they were sent, and
 * each wait would cost a turn of the busy start-up. The returned promise
 * settles when all are done.
 * @returns {Promise<void>}
 */
export function applyDeviceSettings() {
  /** @type {Promise<unknown>[]} */
  const calls = [];
  /**
   * @param {string} failure
   * @param {() => Promise<unknown>} call
   */
  const send = (failure, call) => calls.push(call().catch((/** @type {unknown} */ e) => console.error(failure, e)));
  // OpenDives' default stress factor (spec, "Planner settings") instead of the
  // core's 4.0, unless the diver has chosen one.
  storedCore.sacFactor ??= DEFAULT_SAC_FACTOR;
  // "Choisir le type d’eau dans l’éditeur" is on by default in OpenDives; the
  // depth grid is no longer a setting: the core's default.
  storedCore.salinityEdit ??= true;
  delete storedCore.threeMGrid;
  // A value refused by this core (an older version kept something else): the others are kept.
  if (Object.keys(storedCore).length) {
    send('Restoring the settings of this device', () => OpenDivesCore.setPrefs({ changes: storedCore }));
  }
  const computers = readJson(COMPUTERS_KEY);
  if (Array.isArray(computers)) {
    send('Restoring the dive computers of this device', () => OpenDivesCore.setPrefs({ changes: { diveComputerList: computers } }));
  }
  const library = readJson(LIBRARY_KEY);
  if (Array.isArray(library)) {
    send('Restoring the cylinder types of this device', () =>
      OpenDivesCore.cylinderTypes({ action: 'library', value: JSON.stringify({ library }) }),
    );
  }
  return Promise.all(calls).then(() => {});
}

/**
 * The core's preferences after the logbook was loaded or changed. Loading
 * applies the units and displays written in the log (apply_log_prefs): what was
 * chosen on this device stays; what was not follows the log.
 */
export async function prefsAfterLoad() {
  if (Object.keys(storedCore).length) {
    await OpenDivesCore.setPrefs({ changes: storedCore }).catch((/** @type {unknown} */ e) => console.error('Restoring the settings of this device', e));
  }
  return OpenDivesCore.getPrefs();
}

/**
 * Sets core preferences and keeps them as this device's values.
 * @param {Partial<CorePrefValues>} changes
 */
export async function setCorePrefs(changes) {
  await OpenDivesCore.setPrefs({ changes });
  // Changing one unit makes the system "personalize" in the core: kept too.
  const prefs = await OpenDivesCore.getPrefs();
  Object.assign(storedCore, changes);
  if (['length', 'temperature', 'pressure', 'volume', 'weight'].some((k) => k in changes)) storedCore.unitSystem = prefs.unitSystem;
  writeJson(CORE_KEY, storedCore);
  if ('extraEnvironmental' in changes) settings.extraConditions = changes.extraEnvironmental === true;
  if (changes.duration) settings.duration = changes.duration;
  return prefs;
}

/**
 * Sets core preferences back to Subsurface's defaults and forgets them as
 * this device's values (the planner's "Back to Subsurface's values").
 * @param {(keyof CorePrefValues)[]} keys
 */
export async function resetCorePrefs(keys) {
  const { defaults } = await OpenDivesCore.getPrefs();
  if (!defaults) return;
  /** @type {Partial<CorePrefValues>} */
  const changes = Object.fromEntries(keys.map((key) => [key, defaults[key]]));
  await OpenDivesCore.setPrefs({ changes });
  for (const key of keys) delete storedCore[key];
  writeJson(CORE_KEY, storedCore);
}

/** Forgets one remembered dive computer (slot 1 to 4), or all of them (0). @param {number} slot */
export async function forgetDiveComputers(slot) {
  await OpenDivesCore.setPrefs({ changes: { forgetDiveComputer: slot } });
  const prefs = await OpenDivesCore.getPrefs();
  if (prefs.diveComputerList) keepDiveComputers(prefs.diveComputerList);
  return prefs;
}

/**
 * Keeps the remembered dive computers after a download (the core updates
 * them as Subsurface does), set again at each start.
 * @param {string[]} list
 */
export function keepDiveComputers(list) {
  writeJson(COMPUTERS_KEY, list);
}

/**
 * Keeps the device's cylinder types library after a change.
 * @param {string[]} library
 */
export function keepCylinderLibrary(library) {
  writeJson(LIBRARY_KEY, library);
}

/**
 * @template {keyof AppSettings} K
 * @param {K} key
 * @param {AppSettings[K]} value
 */
export function setAppSetting(key, value) {
  /** @type {any} */ (settings)[key] = value;
  /** @type {Record<string, unknown>} */
  const app = {};
  for (const k of /** @type {(keyof AppSettings)[]} */ (Object.keys(APP_DEFAULTS))) app[k] = settings[k];
  writeJson(APP_KEY, app);
  if (key === 'language') location.reload(); // the texts are chosen at start (i18n.js)
}

/**
 * "Reset all settings": every setting of the device back to Subsurface's
 * default (the core's `defaults`) and the app's own. The planner's own
 * parameters and trip grouping (the logbook's) are not touched.
 * @param {Partial<CorePrefValues>} defaults
 */
export async function resetAllSettings(defaults) {
  await OpenDivesCore.setPrefs({ changes: { ...defaults, salinityEdit: true } });
  for (const key of Object.keys(storedCore)) delete storedCore[/** @type {keyof CorePrefValues} */ (key)];
  writeJson(CORE_KEY, null);
  // The cylinder types too: back to Subsurface's standard list (Christian's choice).
  await OpenDivesCore.cylinderTypes({ action: 'standard' });
  writeJson(LIBRARY_KEY, null);
  try {
    localStorage.removeItem('od.extraConditions');
  } catch {
    // Not fatal.
  }
  const languageChanged = settings.language !== APP_DEFAULTS.language;
  Object.assign(settings, APP_DEFAULTS, { extraConditions: defaults.extraEnvironmental === true, duration: defaults.duration ?? 'mixed' });
  writeJson(APP_KEY, null);
  if (languageChanged) location.reload();
  return OpenDivesCore.getPrefs();
}
