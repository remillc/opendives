// @ts-check
// The planner's reserve factor (task 2026-11-12-74). OpenDives keeps two
// values on the device: the stress factor and the number of divers on the gas.
// The core knows one factor only (Subsurface's sacfactor, stored x100): it
// receives their product. Pure functions, so node tests can check them.

/** Stress factor x100 by default: 1.0. */
export const DEFAULT_STRESS_FACTOR = 100;
/** Divers on the gas by default. */
export const DEFAULT_DIVERS = 1;
export const MIN_DIVERS = 1;
export const MAX_DIVERS = 4;
/** The core factor OpenDives used to set by default (2.0, x100): treated as never changed. */
export const OLD_DEFAULT_SAC_FACTOR = 200;

/**
 * The core's sacfactor, x100: stress factor (x100) times divers.
 * @param {number} stressX100
 * @param {number} divers
 * @returns {number}
 */
export function coreSacFactor(stressX100, divers) {
  return Math.round(stressX100 * divers);
}

/**
 * The two values at start. The app's own values win once they exist. Before
 * that, the core factor stored on this device is migrated: absent or 200 (the
 * old OpenDives default) means never changed, so 1.0 x 1; any other value is
 * the diver's own stress factor, with one diver.
 * @param {{ stressFactor?: unknown, reserveDivers?: unknown }} app the app's raw stored settings
 * @param {unknown} storedSacFactor the core value kept on this device, x100
 * @returns {{ stressFactor: number, reserveDivers: number }}
 */
export function reserveSettings(app, storedSacFactor) {
  const stress = Number(app.stressFactor);
  if (app.stressFactor != null && Number.isFinite(stress) && stress > 0) {
    const divers = Math.round(Number(app.reserveDivers));
    return { stressFactor: Math.round(stress), reserveDivers: divers >= MIN_DIVERS && divers <= MAX_DIVERS ? divers : DEFAULT_DIVERS };
  }
  const old = Number(storedSacFactor);
  if (storedSacFactor != null && Number.isFinite(old) && old > 0 && old !== OLD_DEFAULT_SAC_FACTOR) {
    return { stressFactor: Math.round(old), reserveDivers: DEFAULT_DIVERS };
  }
  return { stressFactor: DEFAULT_STRESS_FACTOR, reserveDivers: DEFAULT_DIVERS };
}

/**
 * The i18n key of the supporting text of the bottom gas row of the planner
 * result (the reserve is for that gas): nothing more with one diver, "to
 * ascend as two" with two, "to ascend as N" with more.
 * @param {number} divers
 * @returns {'plan.volumeDeco'|'plan.volumeBottomTwo'|'plan.volumeBottomMany'}
 */
export function bottomVolumeKey(divers) {
  if (divers === 2) return 'plan.volumeBottomTwo';
  return divers > 2 ? 'plan.volumeBottomMany' : 'plan.volumeDeco';
}

/**
 * The i18n key of the reserve's legend under a gas bar (task 2026-11-13-93):
 * "Réserve à deux" / "Réserve à N" for the bottom gas when the reserve is for
 * several divers, "Réserve" otherwise.
 * @param {number} divers
 * @param {boolean} bottom whether the row is the bottom gas
 * @returns {'plan.legendReserve'|'plan.legendReserveTwo'|'plan.legendReserveMany'}
 */
export function reserveLegendKey(divers, bottom) {
  if (!bottom) return 'plan.legendReserve';
  if (divers === 2) return 'plan.legendReserveTwo';
  return divers > 2 ? 'plan.legendReserveMany' : 'plan.legendReserve';
}
