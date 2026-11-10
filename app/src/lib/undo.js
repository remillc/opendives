// @ts-check
// The "Undo" message offered for a few seconds after each change of the
// logbook (Android snackbar). An undo is a change like any other: saved, then
// synced. The undo history survives a sync that only sends this device's
// changes; when a sync brings changes from the cloud, the logbook is read
// again and the history is gone: the logbook says so with the
// "od-undo-cleared" event, and every message still open closes at once, so
// that none offers an undo that would do nothing.
import { f7 } from 'framework7-svelte';
import { showSnackbar } from './snackbar.js';
import { t } from './i18n.js';

/** @param {string} text */
function toast(text) {
  showSnackbar(text);
}

/**
 * @param {string} text what was done ("Dive saved")
 * @param {(result: import('opendives-core').EditResult) => void|Promise<void>} [after] once undone
 * @param {number} [timeout] ms the message stays (10 s after deleting a dive)
 * @param {number} [steps] undoable steps the change made (the dive editor can
 *   also create a site or move the dive to a trip): Undo takes them all back
 */
export async function offerUndo(text, after, timeout = 6000, steps = 1) {
  const { undoLastChange } = await import('./logbook.svelte.js');
  showSnackbar(text, {
    undoable: true,
    action: t('edit.undo'),
    timeout,
    onAction: async () => {
      try {
        let result = await undoLastChange();
        for (let i = 1; i < steps; i++) result = await undoLastChange();
        if (after) await after(result);
        toast(t('edit.undone'));
      } catch (e) {
        console.error('Undo', e);
        toast(t('edit.undoFailed'));
      }
    },
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('od-undo-cleared', () => {
    for (const el of document.querySelectorAll('.toast.od-undo-toast')) f7.toast.close(/** @type {HTMLElement} */ (el));
  });
}
