// @ts-check
// Android Back key (spec, section 3: the system back works everywhere).
// Framework7 does not use the browser history: without this bridge, Back would
// close the application.
import { App as CapacitorApp } from '@capacitor/app';
import { f7 } from 'framework7-svelte';
import { backTarget, readPane } from './pane-history.js';

export function enableBackButton() {
  CapacitorApp.addListener('backButton', () => {
    // 0. An open dropdown menu (components/SelectField.svelte) closes first.
    const dropdown = document.querySelector('.od-select-field--open');
    if (dropdown) {
      dropdown.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 1. The side menu closes.
    if (document.querySelector('.panel.panel-in')) {
      f7.panel.close();
      return;
    }
    // 2. The choices of the "+" button close.
    const fabMenu = document.querySelector('.od-fab-menu--open');
    if (fabMenu) {
      fabMenu.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
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
      if (modal.classList.contains('od-md3-dialog')) modal.dispatchEvent(new CustomEvent('od-cancel'));
      else if (modal.classList.contains('actions-modal')) f7.actions.close();
      else if (modal.classList.contains('dialog')) f7.dialog.close();
      else if (modal.classList.contains('sheet-modal')) f7.sheet.close();
      else if (modal.classList.contains('popup')) f7.popup.close();
      else if (modal.classList.contains('popover')) f7.popover.close();
      return;
    }
    // 4. The logbook's selection mode is left.
    const selection = document.querySelector('.od-logbook--selection-bar');
    if (selection) {
      selection.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 4b. The Sites search closes (pages/Sites.svelte).
    const sitesSearch = document.querySelector('.od-sites--search.od-sites--open');
    if (sitesSearch) {
      sitesSearch.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 5. An active search of the screen shown closes. Only that screen's: the
    // Logbook's search stays active under an opened dive, and Back then
    // returns to the list with its search, like the back arrow.
    const view = f7.views.current;
    const search = view?.el?.querySelector(
      ':scope > .page-current .searchbar-enabled, :scope.view-master-detail > .page-master .searchbar-enabled',
    );
    if (search) {
      f7.searchbar.disable(/** @type {HTMLElement} */ (search));
      return;
    }
    // 6. Back: one screen of the detail pane (tablet), one page of the section,
    // the Logbook, or the background (lib/pane-history.js).
    const target = backTarget({
      ...readPane(view?.el),
      historyLength: view?.router.history.length ?? 1,
      logbook: view?.el?.id === 'view-logbook' || !view,
    });
    if (target === 'pane' || target === 'page') view.router.back();
    else if (target === 'logbook') f7.tab.show('#view-logbook');
    else CapacitorApp.minimizeApp();
  });
}
