// @ts-check
// The altitude fields (task 72): an editable dropdown, any whole value typed,
// clamped to 0 .. 4500 m (15000 ft). Pure rules, run under node:test.

/** The highest altitude, in the diver's unit. @param {boolean} feet */
export const altitudeMax = (feet) => (feet ? 15000 : 4500);

/**
 * What the diver typed, as a whole foot or metre, clamped; null while it is not
 * a number ("", "-", "abc"). A decimal part is rounded away.
 * @param {string} text
 * @param {boolean} feet
 * @returns {number|null}
 */
export function parseAltitude(text, feet) {
  const s = String(text).trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Math.min(altitudeMax(feet), Math.max(0, Math.round(Number(s))));
}

/**
 * A whole altitude as the field and the list show it: plain digits,
 * written by the language.
 * @param {number} value
 * @param {string} locale
 */
export function altitudeText(value, locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: false }).format(value);
}
