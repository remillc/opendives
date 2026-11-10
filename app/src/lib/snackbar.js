// @ts-check
// The one snackbar of the app (docs/ui-foundations.md, section 8). It is
// Framework7's toast, styled by `.toast.od-snackbar` in theme.css: every
// message of the app goes through `showSnackbar`, nothing else calls
// `f7.toast`. Framework7 already closes the open toast when another opens, so
// there is one snackbar at a time; the closing callback of the old one runs then.
import { f7 } from 'framework7-svelte';
import { snackbarClasses, snackbarTimeout } from './snackbar-logic.js';

/**
 * @typedef {object} SnackbarOptions
 * @property {string} [action] the label of the one action ("Annuler")
 * @property {() => void} [onAction] the action was pressed (the snackbar then closes)
 * @property {() => void} [onClosed] the snackbar is gone, whatever the cause
 * @property {number} [timeout] ms; raised to the floor (4 s, 6 s with an action)
 * @property {boolean} [undoable] closed at once when the undo history is cleared
 */

/**
 * @param {string} text
 * @param {SnackbarOptions} [options]
 */
export function showSnackbar(text, { action, onAction, onClosed, timeout, undoable } = {}) {
  const hasFab = typeof document !== 'undefined' && !!document.querySelector('.page-current .fab');
  /** @type {Record<string, () => void>} */
  const on = {};
  if (action && onAction) on.closeButtonClick = onAction;
  if (onClosed) on.closed = onClosed;
  const toast = f7.toast.create({
    text,
    cssClass: snackbarClasses({ hasFab, undoable }),
    closeButton: !!action,
    closeButtonText: action,
    closeTimeout: snackbarTimeout(timeout, !!action),
    position: 'bottom',
    on,
  });
  // Announced by screen readers without taking the focus.
  toast.el.setAttribute('role', 'status');
  toast.open();
  return toast;
}
