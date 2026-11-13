// @ts-check
// Tools section (docs/ui-specification.md, section 1, "Tools"). Every value
// comes from the core; only the wait before flying is OpenDives' own rule.

import { t } from './i18n.js';
import { formatNumber } from './format.js';

/** Hours to wait before flying after a single dive, and after several dives in a day. */
export const FLIGHT_WAIT_HOURS = { single: 12, several: 18 };

/**
 * The choices of the "Attente avant l'avion" setting (task 2026-11-13-98): "auto" is
 * "Selon les plongées" (12 h after one dive, 18 h after several dives in the day), the
 * others a fixed number of hours.
 * @typedef {'auto'|'12'|'18'|'24'} FlightWaitMode
 */
/** @type {readonly FlightWaitMode[]} */
export const FLIGHT_WAIT_MODES = ['auto', '12', '18', '24'];

/** The name of a choice of the setting: "Selon les plongées", "12 h". @param {FlightWaitMode} mode */
export function flightWaitName(mode) {
  return mode === 'auto' ? t('settings.flight.auto') : t('settings.flight.hours', { h: mode });
}

/**
 * OpenDives' recommendation (not computed by the core), counted from the end (surfacing)
 * of the last dive. "Selon les plongées" (`mode` "auto"): 18 hours when the day of that
 * dive had several dives, else 12 hours. "The same day" means the same calendar day of
 * the dives' start (local wall-clock date): the dives that start the same day as the last
 * one. A fixed mode ("12", "18", "24") gives that number of hours. A recommendation,
 * never a guarantee.
 * @param {{date: string, endDate: string}[]} dives the dives the calculation uses, oldest first
 * @param {string} now local time of the calculation (ISO, no time zone)
 * @param {FlightWaitMode} [mode]
 * @returns {{hours: number, several: boolean, remainingSeconds: number, endsAt: string}|null} null without dives
 */
export function flightWait(dives, now, mode = 'auto') {
  if (!dives.length) return null;
  const last = dives[dives.length - 1];
  const day = last.date.slice(0, 10);
  const several = dives.filter((d) => d.date.slice(0, 10) === day).length > 1;
  const fixed = Number(mode);
  const hours = fixed > 0 ? fixed : several ? FLIGHT_WAIT_HOURS.several : FLIGHT_WAIT_HOURS.single;
  // Dive times are local wall-clock times: compare them as UTC, never shifted.
  const end = Date.parse(`${last.endDate}Z`);
  const endsAt = end + hours * 3600_000;
  const remaining = (endsAt - Date.parse(`${now}Z`)) / 1000;
  return { hours, several, remainingSeconds: Math.max(0, Math.round(remaining)), endsAt: new Date(endsAt).toISOString().slice(0, 19) };
}

/**
 * The dives of the logbook that count for the wait before flying: the last dive that
 * started before now (planned dives are not in the logbook's list) and the other dives
 * that started the same calendar day, oldest first, with the end of each.
 * @param {{date: string, durationSeconds: number}[]} logbookDives in any order
 * @param {string} now local time (ISO, no time zone)
 * @returns {{date: string, endDate: string}[]}
 */
export function flightDives(logbookDives, now) {
  let latest = '';
  for (const d of logbookDives) if (d.date <= now && d.date > latest) latest = d.date;
  if (!latest) return [];
  const day = latest.slice(0, 10);
  return logbookDives
    .filter((d) => d.date <= now && d.date.slice(0, 10) === day)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((d) => ({ date: d.date, endDate: new Date(Date.parse(`${d.date}Z`) + d.durationSeconds * 1000).toISOString().slice(0, 19) }));
}

/**
 * The wait before flying counted from the logbook (the banner and the reminder).
 * @param {{date: string, durationSeconds: number}[]} logbookDives
 * @param {FlightWaitMode} mode
 * @param {string} now local time (ISO, no time zone)
 */
export function flightWaitFor(logbookDives, mode, now) {
  return flightWait(flightDives(logbookDives, now), now, mode);
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

/** The name of the "water type of downloaded dives" choice. @param {string} id 'none' or a water type */
export function downloadWaterName(id) {
  return id === 'none' ? t('settings.downloadWater.none') : waterTypeName(id);
}

/**
 * The salinity sent to the core with a download (defaultSalinity): 0 for 'none', which leaves the
 * dives as the computer gave them.
 * @param {string} id
 */
export function downloadSalinity(id) {
  return WATER_TYPES.find((w) => w.id === id)?.salinity ?? 0;
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
 * Altitude of a surface pressure, mm (Subsurface's pressure_to_altitude, core/units.cpp).
 * @param {number} mbar
 */
export function pressureToAltitudeMm(mbar) {
  return Math.trunc(Math.log(1013 / mbar) * 7800000);
}

/**
 * A number typed by the user ("12,5" or "12.5"), NaN when it is not one.
 * @param {string} text
 */
export function parseDecimal(text) {
  const clean = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN;
}
