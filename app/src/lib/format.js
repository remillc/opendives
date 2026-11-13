// @ts-check
// Formats and units (docs/ui-specification.md, section 2).
// Values come from the core in integer SI units; conversion happens here, at
// display time, never in the data.

import { t, locale } from './i18n.js';
import { settings } from './settings.svelte.js';

/** Units only: the full preferences (logbook.prefs) can be passed. @typedef {import('opendives-core').Units} Prefs */

/** Locale of the formats (lib/i18n.js): the device's, or fr-CA when the interface is fr-CA. */
export { locale };

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

/**
 * Dive duration in whole minutes, as the Duration setting says (the core's
 * units.duration_units): automatic, "45 min" under an hour and from an hour
 * as the language writes it ("1 h 12", "1:12"), or always minutes ("72 min").
 * @param {number} seconds
 * @param {'mixed'|'minutes'} [mode]
 */
export function formatDuration(seconds, mode = settings.duration) {
  const minutes = Math.round(seconds / 60);
  if (mode === 'mixed' && minutes >= 60) return formatHours(seconds);
  return `${formatNumber(minutes, 0)}${NBSP}${t('units.minutes')}`;
}

/** Hours and minutes as the language writes them (units.hoursMinutes): "11 h 26", "11:26". @param {number} seconds */
export function formatHours(seconds) {
  const minutes = Math.round(seconds / 60);
  return t('units.hoursMinutes', {
    h: formatNumber(Math.floor(minutes / 60), 0),
    mm: String(minutes % 60).padStart(2, '0'),
  });
}

/**
 * A total of time under water (a sum of dive durations). Under 24 h it reads
 * as hours and minutes ("11 h 26"); from 24 h as days and hours without
 * minutes ("80 j 16 h"). Rounding: the total is rounded to the minute first
 * (as formatHours does), then the hours are rounded down, so 24 h 59 min reads
 * "1 j 0 h" and 23 h 59 min stays "23 h 59".
 * @param {number} seconds
 */
export function formatTotalTime(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 24 * 60) return formatHours(seconds);
  const hours = Math.floor(minutes / 60);
  return t('units.daysHours', { d: formatNumber(Math.floor(hours / 24), 0), h: formatNumber(hours % 24, 0) });
}

/** One duration of a statistic: "59 min" under an hour, else "1 h 06". @param {number} seconds */
export function formatLongDuration(seconds) {
  return seconds < 3570 ? formatDuration(seconds, 'minutes') : formatHours(seconds);
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
  return `${temperatureValue(mk, prefs)}${NBSP}${t(prefs.temperature === 'F' ? 'units.fahrenheit' : 'units.celsius')}`;
}

/**
 * Temperature without its unit, for a range ("4,0 à 26,0 °C").
 * @param {number} mk
 * @param {Prefs} prefs
 */
export function temperatureValue(mk, prefs) {
  const c = (mk - 273150) / 1000;
  return formatNumber(prefs.temperature === 'F' ? c * 9 / 5 + 32 : c, 1);
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

/** The label of every partial pressure: "bar" or "ATA" (Settings › Unités). */
export function ppUnitLabel() {
  return t(settings.ppUnit === 'ata' ? 'units.ata' : 'units.bar');
}

/**
 * A partial pressure given in bar, with the unit of the settings. Same number
 * whatever the unit (1 bar is taken as 1 ATA): only the label changes.
 * @param {number} bar
 * @param {number} decimals
 */
export function formatPartialPressure(bar, decimals) {
  return `${formatNumber(bar, decimals)}${NBSP}${ppUnitLabel()}`;
}

/**
 * Gas consumption (SAC), per minute: 1 decimal in litres, 2 in cubic feet (0,36 cuft/min).
 * @param {number} mlPerMin
 * @param {Prefs} prefs
 */
export function formatSac(mlPerMin, prefs) {
  return prefs.volume === 'cuft'
    ? `${formatNumber(mlPerMin / 28316.8466, 2)}${NBSP}${t('units.cubicFeetPerMinute')}`
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
const dateOnlyFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });

/** @param {string} iso */
function toDate(iso) {
  return new Date(`${iso}Z`);
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const chosenFormats = new Map();

/** @param {string} key @param {Intl.DateTimeFormatOptions} options */
function chosenFormat(key, options) {
  let f = chosenFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    chosenFormats.set(key, f);
  }
  return f;
}

/**
 * A date in one of the formats of the "Date format" setting: the device's
 * short format, 2026-11-06, 6 nov. 2026, 06/11/2026 or 11/06/2026.
 * @param {Date} date read in UTC (see toDate)
 * @param {'system'|'iso'|'medium'|'dmy'|'mdy'} choice
 */
export function formatDateChoice(date, choice) {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  if (choice === 'iso') return `${y}-${m}-${d}`;
  if (choice === 'dmy') return `${d}/${m}/${y}`;
  if (choice === 'mdy') return `${m}/${d}/${y}`;
  if (choice === 'medium') return chosenFormat('medium', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  return chosenFormat('short', { dateStyle: 'short' }).format(date);
}

/**
 * A time of day as the "Time format" setting says: the device's, 24-hour or 12-hour.
 * @param {Date} date read in UTC
 * @param {'system'|'24'|'12'} choice
 */
export function formatTimeChoice(date, choice) {
  if (choice === 'system') return timeFormat.format(date);
  return chosenFormat(`time${choice}`, { hour: 'numeric', minute: '2-digit', hour12: choice === '12' }).format(date);
}

/** Short date and time, for a list row, in the formats chosen in Settings. @param {string} iso */
export function formatDateTime(iso) {
  if (settings.dateFormat === 'system' && settings.timeFormat === 'system') return dateTimeFormat.format(toDate(iso));
  const date = toDate(iso);
  const day = settings.dateFormat === 'system' ? dateOnlyFormat.format(date) : formatDateChoice(date, settings.dateFormat);
  return `${day} ${formatTimeChoice(date, settings.timeFormat)}`;
}

/** Short date without the time, in the format chosen in Settings: "9 nov. 2026". @param {string} iso */
export function formatShortDate(iso) {
  const date = toDate(iso);
  return settings.dateFormat === 'system' ? dateOnlyFormat.format(date) : formatDateChoice(date, settings.dateFormat);
}

/** Long date without the time: "2 février 2013", "1er juillet 2016". @param {string} iso */
export function formatLongDate(iso) {
  return firstOfMonth(longDateFormat.format(toDate(iso)));
}

/** Long date and time, in the time format chosen in Settings: "24 avril 2022, 10:30". @param {string} iso */
export function formatLongDateTime(iso) {
  return `${formatLongDate(iso)}, ${formatTimeChoice(toDate(iso), settings.timeFormat)}`;
}

/** Duration in whole minutes, as in a site's dive rows: "104 min". @param {number} seconds */
export function formatMinutes(seconds) {
  return `${Math.round(seconds / 60)} ${t('units.minutes')}`;
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

const dayFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
const timeFormat = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' });

/** Date with the weekday, capitalised for the start of a line: "Dimanche 24 avril 2022". @param {string} iso */
export function formatDiveDay(iso) {
  const text = firstOfMonth(dayFormat.format(toDate(iso)));
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * Time of day, optionally some seconds after the given moment (exit time).
 * @param {string} iso
 * @param {number} [afterSeconds]
 */
export function formatTimeOfDay(iso, afterSeconds = 0) {
  return formatTimeChoice(new Date(toDate(iso).getTime() + afterSeconds * 1000), settings.timeFormat);
}

/**
 * Full gas name, for the cylinder list: "Air", "Nitrox 32", "Trimix 18/45", "Oxygen".
 * @param {number} o2Permille
 * @param {number} hePermille
 */
export function formatGasLong(o2Permille, hePermille) {
  const o2 = Math.round(o2Permille / 10);
  const he = Math.round(hePermille / 10);
  if (he > 0) return t('gasLong.trimix', { o2: String(o2), he: String(he) });
  if (o2 >= 100) return t('gasLong.oxygen');
  // The core stores air as 0 per mille (meaning 21 %).
  if (o2 === 0 || o2 === 21) return t('gasLong.air');
  return t('gasLong.nitrox', { o2: String(o2) });
}

/**
 * Gas volume at surface pressure, as computed by the core: whole liters or cubic feet.
 * @param {number} ml
 * @param {Prefs} prefs
 */
export function formatGasVolume(ml, prefs) {
  return prefs.volume === 'cuft'
    ? `${formatNumber(ml / 28316.8466, 0)}${NBSP}${t('units.cubicFeet')}`
    : `${formatNumber(ml / 1000, 0)}${NBSP}${t('units.liters')}`;
}

/**
 * Weight (ballast): up to one decimal, in kilograms or pounds.
 * @param {number} grams
 * @param {Prefs} prefs
 */
export function formatWeight(grams, prefs) {
  const value = prefs.weight === 'lbs' ? grams / 453.59237 : grams / 1000;
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return `${text}${NBSP}${t(prefs.weight === 'lbs' ? 'units.pounds' : 'units.kilograms')}`;
}

/**
 * Short gas name, as divers write it: "Air", "O2", "Nx 32", "Tx 18/45".
 * @param {number} o2Permille
 * @param {number} hePermille
 */
export function formatGas(o2Permille, hePermille) {
  const o2 = Math.round(o2Permille / 10);
  const he = Math.round(hePermille / 10);
  if (he > 0) return t('gas.trimix', { o2: String(o2), he: String(he) });
  if (o2 >= 100) return t('gas.oxygen');
  // The core stores air as 0 per mille (meaning 21 %).
  if (o2 === 0 || o2 === 21) return t('gas.air');
  return t('gas.nitrox', { o2: String(o2) });
}

/**
 * The decompression settings in a few words, for the rows that open their
 * page: "Bühlmann ZH-L16, GF 30/75" or "VPM-B, +3".
 * @param {{ decoModel?: string, gfLow?: number, gfHigh?: number, vpmbConservatism?: number }} prefs
 */
export function decoSummary(prefs) {
  return prefs.decoModel === 'vpmb'
    ? `${t('settings.deco.vpmb')}, +${prefs.vpmbConservatism ?? 0}`
    : `${t('settings.deco.buehlmann')}, GF ${prefs.gfLow ?? 30}/${prefs.gfHigh ?? 75}`;
}

/**
 * Mix name as the core writes it (gasname in Subsurface's gas.cpp): air,
 * EAN32, oxygen, (18/45).
 * @param {number} o2Permille
 * @param {number} hePermille
 */
export function formatMixName(o2Permille, hePermille) {
  const o2 = Math.round(o2Permille / 10);
  const he = Math.round(hePermille / 10);
  if (he === 0 && (o2 === 0 || o2 === 21)) return t('gas.air');
  if (he === 0 && o2 >= 100) return t('gas.oxygen');
  if (he === 0) return `EAN${o2}`;
  return `(${o2}/${he})`;
}

/** Now as a local wall-clock date, like the dates of dives: "2026-11-09T14:30:00". */
export function localNowIso() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

/**
 * Time since a local date, in days, weeks, months or years: "il y a 9 mois".
 * Days are days of the calendar: last night's dive is "hier", even under 24 h ago.
 * @param {string} iso
 */
export function formatTimeAgo(iso) {
  const DAY = 86400000;
  const days = Math.floor(toDate(localNowIso()).getTime() / DAY) - Math.floor(toDate(iso).getTime() / DAY);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (days < 7) return rtf.format(-days, 'day');
  if (days < 60) return rtf.format(-Math.floor(days / 7), 'week');
  if (days < 365) return rtf.format(-Math.floor(days / 30.44), 'month');
  return rtf.format(-Math.floor(days / 365.25), 'year');
}

/**
 * Date and time with relative days: "Aujourd'hui, 13:40", "Hier, 13:40"; older
 * dates as usual.
 * @param {string} iso
 * @param {string} [now]
 * @param {boolean} [capital] false in the middle of a sentence
 */
export function formatRelativeDateTime(iso, now = localNowIso(), capital = true) {
  const DAY = 86400000;
  const days = Math.floor(toDate(now).getTime() / DAY) - Math.floor(toDate(iso).getTime() / DAY);
  if (days !== 0 && days !== 1) return formatDateTime(iso);
  const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
  const text = capital ? day.charAt(0).toLocaleUpperCase(locale) + day.slice(1) : day;
  return `${text}, ${formatTimeChoice(toDate(iso), settings.timeFormat)}`;
}

/**
 * A moment in the middle of a sentence, with the day in words: "demain à 8 h 35",
 * "aujourd'hui à 8 h 35", "hier à 8 h 35"; another day as the date and time of a list row.
 * @param {string} iso
 * @param {string} [now]
 */
export function formatDayAt(iso, now = localNowIso()) {
  const DAY = 86400000;
  const days = Math.floor(toDate(now).getTime() / DAY) - Math.floor(toDate(iso).getTime() / DAY);
  if (days < -1 || days > 1) return formatDateTime(iso);
  const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
  return t('flight.at', { day, time: formatTimeChoice(toDate(iso), settings.timeFormat) });
}

/**
 * A range of days, e.g. "2–4 février 2013" (device format, Intl.formatRange);
 * a single day when both are the same.
 * @param {string} isoStart
 * @param {string} isoEnd
 */
export function formatDateRange(isoStart, isoEnd) {
  return firstOfMonth(longDateFormat.formatRange(toDate(isoStart), toDate(isoEnd)));
}
