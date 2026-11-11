// @ts-check
// Pure logic of the Material 3 date and time pickers (components/DatePickerDialog.svelte,
// TimePickerDialog.svelte): month grid, week start, text input, 12/24 h, dial geometry.
// Months are 0-based (like Date); no time zone is involved: only calendar arithmetic.

/** Number of days in a month. @param {number} year @param {number} month 0-based */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Day of the week of a date, 0 = Sunday. @param {number} year @param {number} month @param {number} day */
export function weekday(year, month, day) {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

/**
 * First day of the week for a locale, 0 = Sunday ... 6 = Saturday, from
 * Intl.Locale week info when the engine has it (1 = Monday ... 7 = Sunday
 * there), else a table by region (Monday by default).
 * @param {string} locale
 */
export function weekStart(locale) {
  try {
    const loc = /** @type {any} */ (new Intl.Locale(locale));
    const info = loc.getWeekInfo ? loc.getWeekInfo() : loc.weekInfo;
    if (info && typeof info.firstDay === 'number') return info.firstDay % 7;
    const region = loc.maximize().region;
    if (['US', 'CA', 'JP', 'BR', 'MX', 'IL', 'IN', 'AU', 'ZA', 'KR', 'TW', 'PH'].includes(region)) return 0;
    if (['AE', 'AF', 'BH', 'DZ', 'EG', 'IQ', 'IR', 'JO', 'KW', 'LY', 'OM', 'QA', 'SD', 'SY'].includes(region)) return 6;
    return 1;
  } catch {
    return 1;
  }
}

/**
 * The cells of a month in rows of 7: `null` for the empty cells before the 1st
 * (the leading days) and after the last day, the day numbers elsewhere.
 * @param {number} year @param {number} month @param {number} firstDay 0 = Sunday
 * @returns {(number|null)[][]}
 */
export function monthGrid(year, month, firstDay) {
  const lead = (weekday(year, month, 1) - firstDay + 7) % 7;
  /** @type {(number|null)[]} */
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth(year, month); d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  /** @type {(number|null)[][]} */
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** Weekday indexes (0 = Sunday) in display order. @param {number} firstDay */
export function weekdayOrder(firstDay) {
  return Array.from({ length: 7 }, (_, i) => (firstDay + i) % 7);
}

/** A month moved by `delta` months. @param {number} year @param {number} month @param {number} delta */
export function addMonths(year, month, delta) {
  const n = year * 12 + month + delta;
  return { year: Math.floor(n / 12), month: ((n % 12) + 12) % 12 };
}

/** A date moved by `delta` days (keyboard arrows). @param {number} year @param {number} month @param {number} day @param {number} delta */
export function addDays(year, month, day, delta) {
  const d = new Date(Date.UTC(year, month, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/**
 * The order and separator of the numeric date of a locale:
 * `{ order: ['d','m','y'], separator: '/' }`.
 * @param {string} locale
 */
export function dateInputPattern(locale) {
  /** @type {('d'|'m'|'y')[]} */
  let order = ['d', 'm', 'y'];
  let separator = '/';
  try {
    const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2000, 10, 22)));
    const found = parts.filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year');
    if (found.length === 3) order = found.map((p) => /** @type {'d'|'m'|'y'} */ (p.type === 'day' ? 'd' : p.type === 'month' ? 'm' : 'y'));
    const lit = parts.find((p) => p.type === 'literal' && p.value.trim());
    if (lit) separator = lit.value.trim();
  } catch {
    // keep the defaults
  }
  return { order, separator };
}

/** The numeric date as typed in the device's format ("22/11/2026"). @param {{year:number,month:number,day:number}} date @param {string} locale */
export function formatDateInput(date, locale) {
  const { order, separator } = dateInputPattern(locale);
  const pad = (/** @type {number} */ n, /** @type {number} */ w) => String(n).padStart(w, '0');
  return order.map((k) => (k === 'd' ? pad(date.day, 2) : k === 'm' ? pad(date.month + 1, 2) : pad(date.year, 4))).join(separator);
}

/**
 * Reads a typed date in the device's format; null when it is not a real date or
 * lies outside [minYear, maxYear]. Any run of non-digits separates the parts.
 * @param {string} text @param {string} locale @param {number} minYear @param {number} maxYear
 */
export function parseDateInput(text, locale, minYear, maxYear) {
  const parts = text.trim().split(/\D+/).filter(Boolean);
  if (parts.length !== 3) return null;
  const { order } = dateInputPattern(locale);
  /** @type {Record<string, number>} */
  const v = {};
  order.forEach((k, i) => (v[k] = Number(parts[i])));
  if (parts[order.indexOf('y')].length !== 4) return null;
  if (v.y < minYear || v.y > maxYear || v.m < 1 || v.m > 12 || v.d < 1) return null;
  if (v.d > daysInMonth(v.y, v.m - 1)) return null;
  return { year: v.y, month: v.m - 1, day: v.d };
}

/** Whether a locale's short time is 12-hour. @param {string} locale */
export function localeUses12Hour(locale) {
  try {
    return /^h1[12]$/.test(new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '');
  } catch {
    return false;
  }
}

/** 24 h to 12 h clock. @param {number} hour 0..23 */
export function to12Hour(hour) {
  return { hour: hour % 12 === 0 ? 12 : hour % 12, pm: hour >= 12 };
}

/** 12 h clock to 24 h. @param {number} hour 1..12 @param {boolean} pm */
export function to24Hour(hour, pm) {
  return (hour % 12) + (pm ? 12 : 0);
}

/**
 * Angle of a point on the dial, in degrees clockwise from 12 o'clock, 0 <= a < 360.
 * @param {number} dx right of the centre @param {number} dy below the centre
 */
export function pointAngle(dx, dy) {
  const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (a + 360) % 360;
}

/**
 * Value picked on a dial from an angle. Hours: 12 positions (30 degrees); in
 * 24-hour format the inner ring gives 0 and 13..23 (0 at the top), the outer
 * ring 12 and 1..11. Minutes: 60 positions of 6 degrees (step 1).
 * @param {'hour'|'minute'} unit
 * @param {number} angle degrees clockwise from the top
 * @param {{ twentyFour?: boolean, inner?: boolean }} [options]
 */
export function dialValue(unit, angle, options = {}) {
  const a = ((angle % 360) + 360) % 360;
  if (unit === 'minute') return Math.round(a / 6) % 60;
  const pos = Math.round(a / 30) % 12; // 0 = top
  if (options.twentyFour) return options.inner ? (pos === 0 ? 0 : pos + 12) : pos === 0 ? 12 : pos;
  return pos === 0 ? 12 : pos;
}

/**
 * Angle (degrees from the top) of a value on the dial.
 * @param {'hour'|'minute'} unit @param {number} value
 */
export function valueAngle(unit, value) {
  return unit === 'minute' ? (value % 60) * 6 : (value % 12) * 30;
}

/** Whether an hour of the 24-hour dial sits on the inner ring (0 and 13..23). @param {number} hour */
export function isInnerHour(hour) {
  return hour === 0 || hour > 12;
}

/** Hour typed in a box: a number within the format's range or null. @param {string} text @param {boolean} twelve */
export function parseHour(text, twelve) {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const n = Number(text);
  return twelve ? (n >= 1 && n <= 12 ? n : null) : n <= 23 ? n : null;
}

/** Minute typed in a box. @param {string} text */
export function parseMinute(text) {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const n = Number(text);
  return n <= 59 ? n : null;
}
