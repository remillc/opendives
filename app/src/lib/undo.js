// @ts-check
// The "Undo" message offered for a few seconds after each change of the
// logbook (Android snackbar). An undo is a change like any other: saved, then
// synced. The undo history survives a sync that only sends this device's
// changes; when a sync brings changes from the cloud, the logbook is read
// again and the history is gone: the logbook says so with the
// "od-undo-cleared" event, and every message still open closes at once, so
// that none offers an undo that would do nothing.
import { f7 } from 'framework7-svelte';
import { t } from './i18n.js';

/** @param {string} text */
function toast(text) {
  f7.toast.create({ text, closeTimeout: 4000, position: 'bottom' }).open();
}

/**
 * @param {string} text what was done ("Dive saved")
 * @param {(result: import('opendives-core').EditResult) => void|Promise<void>} [after] once undone
 * @param {number} [timeout] ms the message stays (10 s after deleting a dive)
 */
export async function offerUndo(text, after, timeout = 6000) {
  const { undoLastChange } = await import('./logbook.svelte.js');
  f7.toast
    .create({
      text,
      cssClass: 'od-undo-toast',
      closeButton: true,
      closeButtonText: t('edit.undo'),
      closeTimeout: timeout,
      position: 'bottom',
      on: {
        closeButtonClick: async () => {
          try {
            const result = await undoLastChange();
            if (after) await after(result);
            toast(t('edit.undone'));
          } catch (e) {
            console.error('Undo', e);
            toast(t('edit.undoFailed'));
          }
        },
      },
    })
    .open();
}

if (typeof window !== 'undefined') {
  window.addEventListener('od-undo-cleared', () => {
    for (const el of document.querySelectorAll('.toast.od-undo-toast')) f7.toast.close(/** @type {HTMLElement} */ (el));
  });
}
