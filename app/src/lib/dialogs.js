// @ts-check
// Confirmation before a change of the logbook: the confirm button names the
// action ("Merge", "Delete"), as Material 3 and the iOS guidelines ask, and
// Cancel comes first.
import { f7 } from 'framework7-svelte';
import { t } from './i18n.js';

/**
 * @param {{ title: string, text: string, action: string, onConfirm: () => void }} options
 */
export function confirmAction({ title, text, action, onConfirm }) {
  f7.dialog
    .create({
      title,
      text,
      buttons: [{ text: t('dialog.cancel') }, { text: action, onClick: onConfirm }],
    })
    .open();
}
