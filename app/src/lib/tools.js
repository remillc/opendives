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
