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
    if (modal) {
      if (modal.classList.contains('actions-modal')) f7.actions.close();
      else if (modal.classList.contains('dialog')) f7.dialog.close();
      else if (modal.classList.contains('sheet-modal')) f7.sheet.close();
      else if (modal.classList.contains('popup')) f7.popup.close();
      else if (modal.classList.contains('popover')) f7.popover.close();
      return;
    }
    // 4. An active search closes.
    const search = document.querySelector('.searchbar-enabled');
    if (search) {
      f7.searchbar.disable(/** @type {HTMLElement} */ (search));
      return;
    }
    // 5. Back to the previous screen of the section.
    const view = f7.views.current;
    if (view && view.router.history.length > 1) {
      view.router.back();
      return;
    }
    // 6. From another section, back to the Logbook.
    if (view && view.el?.id !== 'view-logbook') {
      f7.tab.show('#view-logbook');
      return;
    }
    // 7. From the Logbook: the app goes to the background, as on Android.
    CapacitorApp.minimizeApp();
  });
}
