// @ts-check
// An action whose core or network function is not built yet: a dialog says
// so and states that nothing was sent, created or kept.
import { f7 } from 'framework7-svelte';
import { t } from './i18n.js';

/**
 * @param {string} text what is not built, and what did not happen
 * @param {{ text: string, onClick: () => void }} [other] a second button
 */
export function notAvailableYet(text, other) {
  const buttons = other ? [{ text: other.text, onClick: other.onClick }, { text: t('dialog.ok') }] : [{ text: t('dialog.ok') }];
  f7.dialog.create({ title: t('notAvailable.title'), text, buttons }).open();
}
