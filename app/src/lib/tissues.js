// Tissue loading display shared by the Desaturation tool and the dive profile
// (spec, section 4): the water gradient by load, the alarm colour from 90 %.

export const ALARM_PERCENT = 90;

/**
 * Bar colour for a compartment's load: --od-water-top at 0 %, --od-water-bottom
 * at 100 %; --od-alarm from 90 %.
 * @param {number} percent
 */
export function tissueColor(percent) {
  if (percent >= ALARM_PERCENT) return 'var(--od-alarm)';
  const mix = Math.max(0, Math.min(100, percent));
  return `color-mix(in srgb, var(--od-water-bottom) ${mix}%, var(--od-water-top))`;
}
