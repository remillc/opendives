// @ts-check
// Main sections and the side menu of the phone layout (spec, section 3).
import { f7 } from 'framework7-svelte';

/** @typedef {'logbook'|'sites'|'statistics'|'tools'|'account'} Section */

/** The four main sections, in the order of the menu. */
/** @type {Section[]} */
export const sections = ['logbook', 'sites', 'statistics', 'tools'];

/** Every section shown by the menu: the main ones, then Account after the separator. */
const allSections = [...sections, 'account'];

export const navigation = $state({
  /** @type {Section} */
  section: 'logbook',
  menuOpen: false,
});

/** Element that opened the menu; it gets the focus back on close. */
/** @type {HTMLElement|null} */
let opener = null;

/** @param {Section} section */
export function showSection(section) {
  f7.tab.show(`#view-${section}`);
}

/** Follows the visible tab, whatever showed it (menu, Back key, tablet bar). */
export function trackSection() {
  f7.on('tabShow', (/** @type {HTMLElement} */ el) => {
    const section = /** @type {Section} */ (el.id?.replace('view-', ''));
    if (allSections.includes(section)) navigation.section = section;
  });
}

/** @param {HTMLElement|null} from */
export function openMenu(from) {
  opener = from;
  f7.panel.open('#od-menu');
}

export function closeMenu() {
  f7.panel.close('#od-menu');
}

/** Focus back on the ☰ button, or the one of the screen now shown. */
export function restoreFocus() {
  const target =
    opener?.isConnected && opener.offsetParent
      ? opener
      : /** @type {HTMLElement|null} */ (document.querySelector('.view.tab-active .page-current .od-menu-button'));
  target?.focus();
  opener = null;
}
