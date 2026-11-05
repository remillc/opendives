// @ts-check
// Formats et unités (docs/specification-interface.md, section 2).
// Les valeurs arrivent du cœur en unités SI entières ; la conversion se fait
// ici, au moment de l'affichage, jamais dans les données.

/** @typedef {import('opendives-core').Prefs} Prefs */

/** Langue de l'appareil ; les formats en découlent (virgule décimale en français). */
export const locale = typeof navigator !== 'undefined' ? navigator.language : 'fr';

const NBSP = ' ';
const fr = locale.toLowerCase().startsWith('fr');
const FEET = fr ? 'pi' : 'ft';
const CUFT = fr ? 'pi³' : 'cu ft';
/** @type {Map<string, Intl.NumberFormat>} */
const formats = new Map();

/** @param {number} decimals */
function numberFormat(decimals) {
  const key = String(decimals);
  let f = formats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formats.set(key, f);
  }
  return f;
}

/**
 * @param {number} value
 * @param {number} decimals
 */
export function formatNumber(value, decimals = 0) {
  return numberFormat(decimals).format(value);
}

/** @type {Prefs} */
export const defaultPrefs = { length: 'm', temperature: 'C', pressure: 'bar', volume: 'l', weight: 'kg' };

/**
 * Profondeur : 1 décimale en mètres, entier en pieds.
 * @param {number} mm
 * @param {Prefs} prefs
 */
export function depthValue(mm, prefs) {
  return prefs.length === 'ft' ? formatNumber(mm / 304.8, 0) : formatNumber(mm / 1000, 1);
}

/** @param {Prefs} prefs */
export function depthUnit(prefs) {
  return prefs.length === 'ft' ? FEET : 'm';
}

/**
 * @param {number} mm
 * @param {Prefs} prefs
 */
export function formatDepth(mm, prefs) {
  return `${depthValue(mm, prefs)}${NBSP}${depthUnit(prefs)}`;
}

/** Durée de plongée : minutes entières. @param {number} seconds */
export function formatDuration(seconds) {
  return `${formatNumber(Math.round(seconds / 60), 0)}${NBSP}min`;
}

/** Temps dans le profil : min:s. @param {number} seconds */
export function formatMinSec(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Température : 1 décimale. 0 mK signifie « inconnue » dans le cœur.
 * @param {number} mk
 * @param {Prefs} prefs
 * @returns {string|null}
 */
export function formatTemperature(mk, prefs) {
  if (!mk) return null;
  const c = (mk - 273150) / 1000;
  return prefs.temperature === 'F'
    ? `${formatNumber(c * 9 / 5 + 32, 1)}${NBSP}°F`
    : `${formatNumber(c, 1)}${NBSP}°C`;
}

/**
 * Pression : entier.
 * @param {number} mbar
 * @param {Prefs} prefs
 */
export function formatPressure(mbar, prefs) {
  return prefs.pressure === 'psi'
    ? `${formatNumber(mbar / 68.947572932, 0)}${NBSP}psi`
    : `${formatNumber(mbar / 1000, 0)}${NBSP}bar`;
}

/**
 * Consommation (SAC) : 1 décimale, par minute.
 * @param {number} mlPerMin
 * @param {Prefs} prefs
 */
export function formatSac(mlPerMin, prefs) {
  return prefs.volume === 'cuft'
    ? `${formatNumber(mlPerMin / 28316.8466, 1)}${NBSP}${CUFT}/min`
    : `${formatNumber(mlPerMin / 1000, 1)}${NBSP}l/min`;
}

/**
 * Volume d'une bouteille : 1 décimale. En pieds cubes, comme Subsurface, le
 * volume de gaz à la pression de service.
 * @param {number} ml
 * @param {number} workingPressureMbar
 * @param {Prefs} prefs
 * @returns {string|null}
 */
export function formatCylinderSize(ml, workingPressureMbar, prefs) {
  if (!ml) return null;
  if (prefs.volume === 'cuft') {
    if (!workingPressureMbar) return null;
    return `${formatNumber((ml / 28316.8466) * (workingPressureMbar / 1013.25), 1)}${NBSP}${CUFT}`;
  }
  return `${formatNumber(ml / 1000, 1)}${NBSP}l`;
}

/** Pourcentage depuis un pour mille. @param {number} permille */
export function formatPercent(permille) {
  return `${formatNumber(permille / 10, 0)}${NBSP}%`;
}

// Le cœur donne l'heure locale de la plongée, sans fuseau : on la lit et on
// l'affiche en UTC pour qu'elle ne soit jamais décalée.
const dateTimeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const longDateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });

/** @param {string} iso */
function toDate(iso) {
  return new Date(`${iso}Z`);
}

/** Date et heure courtes, pour une ligne de liste. @param {string} iso */
export function formatDateTime(iso) {
  return dateTimeFormat.format(toDate(iso));
}

/** Date longue, sans l'heure : « 2 février 2013 », « 1er juillet 2016 ». @param {string} iso */
export function formatLongDate(iso) {
  return premier(longDateFormat.format(toDate(iso)));
}

/** Intl écrit « 1 juillet » ; l'usage français est « 1er juillet ». @param {string} texte */
function premier(texte) {
  return fr ? texte.replace(/(^|\s)1 (?=\p{L})/u, '$11er ') : texte;
}

/** Date complète, pour le détail. @param {string} iso */
export function formatFullDate(iso) {
  return premier(fullFormat.format(toDate(iso)));
}
