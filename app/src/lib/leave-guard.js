// @ts-check
// Leaving a form with unsaved changes (spec, "Leaving a form with unsaved
// changes"). Every full-screen form with "Enregistrer" compares a snapshot of
// its values taken at opening with the current values; only when they differ
// does leaving (← or ✕, the Android Back key, the iOS swipe back) ask first.
// The dialog and the wiring of one form are in components/LeaveGuard.svelte;
// this file holds the comparison and the registry the Back key looks in.

/**
 * Whether two snapshots hold the same values: plain data compared by content
 * (objects without regard to key order, arrays in order). A change undone by
 * hand gives the same values again, so it counts as no change.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameValues(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValues(x, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValues(/** @type {any} */ (a)[k], /** @type {any} */ (b)[k]));
}

/**
 * The form changed since it opened.
 * @param {unknown} opened snapshot taken at opening
 * @param {unknown} current snapshot of the values now
 */
export const isDirty = (opened, current) => !sameValues(opened, current);

/**
 * @typedef {object} Guard
 * @property {HTMLElement|null} marker an element inside the form's page
 * @property {() => boolean} dirty
 * @property {() => void} attempt leaves at once, or asks first when dirty
 */

/** @type {Guard[]} Forms on screen, the latest opened last. */
const guards = [];

/**
 * @param {Guard} guard
 * @returns {() => void} unregisters it
 */
export function registerGuard(guard) {
  guards.push(guard);
  return () => {
    const i = guards.indexOf(guard);
    if (i >= 0) guards.splice(i, 1);
  };
}

/** Whether a form on screen has unsaved changes (a link must not close it over the diver's head). */
export function anyDirty() {
  return guards.some((guard) => guard.dirty());
}

/**
 * The Android Back key: when the form shown has unsaved changes, asks and
 * returns true (Back is handled); otherwise false and Back goes on as usual.
 * @param {Element|null} [modal] the topmost open modal, if any: a form in a
 *   popup (tablet) is the shown one only when that popup is the topmost modal
 */
export function backThroughGuard(modal = null) {
  for (let i = guards.length - 1; i >= 0; i--) {
    const guard = guards[i];
    const page = guard.marker?.closest('.page');
    // The page shown: the current one of its view, and its view (a tab, a popup) on screen.
    if (!page || !page.classList.contains('page-current') || !page.getClientRects().length) continue;
    if (page.closest('.popup') !== modal) continue;
    if (!guard.dirty()) return false;
    guard.attempt();
    return true;
  }
  return false;
}
