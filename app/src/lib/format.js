// @ts-check
// Formats and units (docs/specification-interface.md, section 2).
// Values come from the core in integer SI units; conversion happens here, at
// display time, never in the data.

import { t } from './i18n.js';

/** @typedef {import('opendives-core').Prefs} Prefs */

/** Device language; formats follow it (decimal comma in French). */
export const locale = typeof navigator !== 'undefined' ? navigator.language : 'fr';

const NBSP = ' '; // non-breaking space before units
const isFrench = locale.toLowerCase().startsWith('fr');
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
 * Depth: 1 decimal in meters, integer in feet.
 * @param {number} mm
 * @param {Prefs} prefs
 */
export function depthValue(mm, prefs) {
  return prefs.length === 'ft' ? formatNumber(mm / 304.8, 0) : formatNumber(mm / 1000, 1);
}

/** @param {Prefs} prefs */
export function depthUnit(prefs) {
  return prefs.length === 'ft' ? t('units.feet') : t('units.meters');
}

/**
 * @param {number} mm
 * @param {Prefs} prefs
 */
export function formatDepth(mm, prefs) {
  return `${depthValue(mm, prefs)}${NBSP}${depthUnit(prefs)}`;
}

/** Dive duration: whole minutes. @param {number} seconds */
export function formatDuration(seconds) {
  return `${formatNumber(Math.round(seconds / 60), 0)}${NBSP}${t('units.minutes')}`;
}

/** Time in the profile: min:s. @param {number} seconds */
export function formatMinSec(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Temperature: 1 decimal. 0 mK means "unknown" in the core.
 * @param {number} mk
 * @param {Prefs} prefs
 * @returns {string|null}
 */
export function formatTemperature(mk, prefs) {
  if (!mk) return null;
  const c = (mk - 273150) / 1000;
  return prefs.temperature === 'F'
    ? `${formatNumber(c * 9 / 5 + 32, 1)}${NBSP}${t('units.fahrenheit')}`
    : `${formatNumber(c, 1)}${NBSP}${t('units.celsius')}`;
}

/**
 * Pressure: integer.
 * @param {number} mbar
 * @param {Prefs} prefs
 */
export function formatPressure(mbar, prefs) {
  return prefs.pressure === 'psi'
    ? `${formatNumber(mbar / 68.947572932, 0)}${NBSP}${t('units.psi')}`
    : `${formatNumber(mbar / 1000, 0)}${NBSP}${t('units.bar')}`;
}

/**
 * Gas consumption (SAC): 1 decimal, per minute.
 * @param {number} mlPerMin
 * @param {Prefs} prefs
 */
export function formatSac(mlPerMin, prefs) {
  return prefs.volume === 'cuft'
    ? `${formatNumber(mlPerMin / 28316.8466, 1)}${NBSP}${t('units.cubicFeetPerMinute')}`
    : `${formatNumber(mlPerMin / 1000, 1)}${NBSP}${t('units.litersPerMinute')}`;
}

/**
 * Cylinder size: 1 decimal. In cubic feet, like Subsurface, the gas volume at
 * working pressure.
 * @param {number} ml
 * @param {number} workingPressureMbar
 * @param {Prefs} prefs
 * @returns {string|null}
 */
export function formatCylinderSize(ml, workingPressureMbar, prefs) {
  if (!ml) return null;
  if (prefs.volume === 'cuft') {
    if (!workingPressureMbar) return null;
    return `${formatNumber((ml / 28316.8466) * (workingPressureMbar / 1013.25), 1)}${NBSP}${t('units.cubicFeet')}`;
  }
  return `${formatNumber(ml / 1000, 1)}${NBSP}${t('units.liters')}`;
}

/** Percentage from a per-mille value. @param {number} permille */
export function formatPercent(permille) {
  return `${formatNumber(permille / 10, 0)}${NBSP}${t('units.percent')}`;
}

// The core gives the dive's local time without a time zone: it is read and
// shown in UTC so that it is never shifted.
const dateTimeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const longDateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });

/** @param {string} iso */
function toDate(iso) {
  return new Date(`${iso}Z`);
}

/** Short date and time, for a list row. @param {string} iso */
export function formatDateTime(iso) {
  return dateTimeFormat.format(toDate(iso));
}

/** Long date without the time: "2 février 2013", "1er juillet 2016". @param {string} iso */
export function formatLongDate(iso) {
  return firstOfMonth(longDateFormat.format(toDate(iso)));
}

/**
 * Intl writes "1 juillet"; French usage is "1er juillet" (dates follow the
 * device format).
 * @param {string} text
 */
function firstOfMonth(text) {
  return isFrench ? text.replace(/(^|\s)1 (?=\p{L})/u, '$11er ') : text;
}

/** Full date, for the dive detail. @param {string} iso */
export function formatFullDate(iso) {
  return firstOfMonth(fullFormat.format(toDate(iso)));
}
