// @ts-check
// The pure rules of the snackbar (docs/ui-foundations.md, section 8): how long
// it stays and which classes it carries. No Framework7 here, so that the rules
// run under node:test; `snackbar.js` applies them.

/** A snackbar without an action stays at least 4 s. */
export const SNACKBAR_MIN_MS = 4000;
/** With an action ("Annuler"), at least 6 s. */
export const SNACKBAR_MIN_WITH_ACTION_MS = 6000;

/**
 * How long the snackbar stays. A caller may ask for longer (8 s for the
 * conflict choice, 10 s after deleting a dive), never for less than the floor.
 * @param {number|undefined} requested ms asked by the caller
 * @param {boolean} hasAction
 * @returns {number} ms
 */
export function snackbarTimeout(requested, hasAction) {
  const floor = hasAction ? SNACKBAR_MIN_WITH_ACTION_MS : SNACKBAR_MIN_MS;
  const asked = typeof requested === 'number' && Number.isFinite(requested) ? requested : 0;
  return Math.max(floor, asked);
}

/**
 * The CSS classes of the snackbar's element.
 * @param {{ hasFab?: boolean, undoable?: boolean }} [options]
 *   hasFab: the screen has a FAB, the snackbar floats above it;
 *   undoable: the undo history can clear it (see undo.js)
 * @returns {string}
 */
export function snackbarClasses({ hasFab = false, undoable = false } = {}) {
  return ['od-snackbar', hasFab ? 'od-snackbar-above-fab' : '', undoable ? 'od-undo-toast' : ''].filter(Boolean).join(' ');
}
