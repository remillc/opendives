// @ts-check
// Tools section (docs/ui-specification.md, section 1, "Tools"). Every value
// comes from the core; only the wait before flying is OpenDives' own rule.

import { t } from './i18n.js';
import { formatNumber } from './format.js';

/** Hours to wait before flying after a single dive, and after several dives in a day. */
export const FLIGHT_WAIT_HOURS = { single: 12, several: 18 };

/**
 * OpenDives' recommendation (not computed by the core): 18 hours after the
 * end of the last dive when the day of that dive had several dives, else 12
 * hours. A recommendation, never a guarantee.
 * @param {{date: string, endDate: string}[]} dives the dives the core used, oldest first
 * @param {string} now local time of the calculation (ISO, no time zone)
 * @returns {{hours: number, several: boolean, remainingSeconds: number}|null} null without dives
 */
export function flightWait(dives, now) {
  if (!dives.length) return null;
  const last = dives[dives.length - 1];
  const day = last.date.slice(0, 10);
  const several = dives.filter((d) => d.date.slice(0, 10) === day).length > 1;
  const hours = several ? FLIGHT_WAIT_HOURS.several : FLIGHT_WAIT_HOURS.single;
  // Dive times are local wall-clock times: compare them as UTC, never shifted.
  const end = Date.parse(`${last.endDate}Z`);
  const remaining = (end + hours * 3600_000 - Date.parse(`${now}Z`)) / 1000;
  return { hours, several, remainingSeconds: Math.max(0, Math.round(remaining)) };
}

/** A wait such as "17 h 05". @param {number} seconds */
export function formatHoursMinutes(seconds) {
  const minutes = Math.ceil(seconds / 60);
  return t('tools.hoursMinutes', {
    h: formatNumber(Math.floor(minutes / 60), 0),
    m: String(minutes % 60).padStart(2, '0'),
  });
}

/**
 * Subsurface's water types, with their salinity in kg per 10000 l as the core
 * keeps it (core/units.h: FRESHWATER_SALINITY, BRACKISH_SALINITY,
 * EN13319_SALINITY, SEAWATER_SALINITY). `id` is the core's `waterType`.
 */
export const WATER_TYPES = /** @type {const} */ ([
  { id: 'fresh', salinity: 10000 },
  { id: 'brackish', salinity: 10100 },
  { id: 'en13319', salinity: 10200 },
  { id: 'salt', salinity: 10300 },
]);

export const SEA_WATER_SALINITY = 10300;

/** The name of a water type, e.g. "Eau de mer". @param {string} id */
export function waterTypeName(id) {
  return t(`tools.waterTypes.${id}`);
}

/** Salinity of a dive's water type (empty or unknown: sea water). @param {string|undefined} id */
export function salinityOfWaterType(id) {
  return WATER_TYPES.find((w) => w.id === id)?.salinity ?? SEA_WATER_SALINITY;
}

/** The water type of a salinity (the nearest one). @param {number} salinity */
export function waterTypeOfSalinity(salinity) {
  return WATER_TYPES.reduce((best, w) => (Math.abs(w.salinity - salinity) < Math.abs(best.salinity - salinity) ? w : best)).id;
}

/**
 * Surface pressure at an altitude, mbar (Subsurface's altitude_to_pressure,
 * core/units.h).
 * @param {number} altitudeMm altitude above sea level, mm
 */
export function altitudeToPressureMbar(altitudeMm) {
  return Math.round(1013 * Math.exp(-altitudeMm / 7800000));
}

/**
 * A number typed by the user ("12,5" or "12.5"), NaN when it is not one.
 * @param {string} text
 */
export function parseDecimal(text) {
  const clean = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN;
}
