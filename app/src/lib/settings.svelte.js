// @ts-check
// Settings kept on this device (not in the logbook).

/** @param {string} key @param {boolean} fallback */
function readFlag(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

export const settings = $state({
  /**
   * "Wave size, surge and chill" (spec, section 4, "Conditions"): off by
   * default, as Subsurface's extraEnvironmentalDefault. On, editing adds these
   * three conditions; the detail shows filled-in conditions either way.
   */
  extraConditions: readFlag('od.extraConditions', false),
});

/** @param {boolean} value */
export function setExtraConditions(value) {
  settings.extraConditions = value;
  try {
    localStorage.setItem('od.extraConditions', String(value));
  } catch {
    // Not fatal: the setting lasts until the app closes.
  }
}
