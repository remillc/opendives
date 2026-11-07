// @ts-check
// Android Back key (spec, section 3: the system back works everywhere).
// Framework7 does not use the browser history: without this bridge, Back would
// close the application.
import { App as CapacitorApp } from '@capacitor/app';
import { f7 } from 'framework7-svelte';

export function enableBackButton() {
  CapacitorApp.addListener('backButton', () => {
    // 1. The side menu closes.
    if (document.querySelector('.panel.panel-in')) {
      f7.panel.close();
      return;
    }
    // 2. The choices of the "+" button close.
    if (document.querySelector('.fab-opened')) {
      f7.fab.close();
      return;
    }
    // 3. An open sheet or dialog closes.
    const modal = document.querySelector('.modal-in');
    // First launch waits for a choice: Back returns to the three choices,
    // then sends the app to the background.
    if (modal?.classList.contains('od-welcome')) {
      const welcome = /** @type {any} */ (f7.views).welcome;
      if (welcome && welcome.router.history.length > 1) welcome.router.back();
      else CapacitorApp.minimizeApp();
      return;
    }
    if (modal) {
      // OpenDives' own dialogs (components/Md3Dialog.svelte) cancel themselves.
      if (modal.classList.contains('od-dialog')) modal.dispatchEvent(new CustomEvent('od-cancel'));
      else if (modal.classList.contains('actions-modal')) f7.actions.close();
      else if (modal.classList.contains('dialog')) f7.dialog.close();
      else if (modal.classList.contains('sheet-modal')) f7.sheet.close();
      else if (modal.classList.contains('popup')) f7.popup.close();
      else if (modal.classList.contains('popover')) f7.popover.close();
      return;
    }
    // 4. The logbook's selection mode is left.
    const selection = document.querySelector('.selection-bar');
    if (selection) {
      selection.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 5. An active search closes.
    const search = document.querySelector('.searchbar-enabled');
    if (search) {
      f7.searchbar.disable(/** @type {HTMLElement} */ (search));
      return;
    }
    // 6. Back to the previous screen of the section.
    const view = f7.views.current;
    if (view && view.router.history.length > 1) {
      view.router.back();
      return;
    }
    // 7. From another section, back to the Logbook.
    if (view && view.el?.id !== 'view-logbook') {
      f7.tab.show('#view-logbook');
      return;
    }
    // 8. From the Logbook: the app goes to the background, as on Android.
    CapacitorApp.minimizeApp();
  });
}
