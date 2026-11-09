// @ts-check
// A sheet shown under an {#if} leaves the document while still open once its
// condition turns false. Framework7 then keeps the shared backdrop and a click
// handler for a modal that no longer exists: the whole app stops responding.
import { f7, f7ready } from 'framework7-svelte';

export function enableModalCleanup() {
  f7ready(() => {
    f7.on(/** @type {any} */ ('modalBeforeDestroy'), (/** @type {any} */ modal) => {
      if (!modal.opened) return;
      const el = modal.el;
      modal.close(false);
      // Closing puts the element back where it was opened from.
      setTimeout(() => el?.remove(), 0);
    });
  });
}
