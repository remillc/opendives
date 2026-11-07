// @ts-check
// Main sections and the side menu of the phone layout (spec, section 3).
import { f7 } from 'framework7-svelte';
import { layout } from './layout.svelte.js';

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
  /** Counts the presses of the rail's "+" button; the Logbook offers its choices on each. */
  addRequests: 0,
  /** Identifier of the dive shown beside the list (tablet), or null. */
  dive: /** @type {string|null} */ (null),
});

/** Element that opened the menu; it gets the focus back on close. */
/** @type {HTMLElement|null} */
let opener = null;

/** @param {Section} section */
export function showSection(section) {
  f7.tab.show(`#view-${section}`);
}

/** Settings open over the current section, from the side menu or the tablet navigation. */
export function openSettings() {
  const router = f7.views.current?.router;
  if (router && router.currentRoute?.path !== '/settings/') router.navigate('/settings/');
}

/** The "+" button of the Android rail: shows the Logbook, which offers the choices. */
export function requestAdd() {
  showSection('logbook');
  navigation.addRequests += 1;
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

/**
 * Phone: a swipe left or right on the first screen of a main section shows
 * the next or previous section, in the order of the menu. Not on what has
 * its own gestures (map, profile, charts, fields, anything that scrolls
 * sideways), nor while a menu, a dialog, a search or the logbook's selection
 * is open.
 */
export function enableSectionSwipes() {
  let x = 0;
  let y = 0;
  let at = 0;
  let tracking = false;

  /** @param {HTMLElement} el */
  function hasOwnGesture(el) {
    if (el.closest('.maplibregl-map, .profile, canvas, input, textarea, select, .panel, .modal-in, .fab, .selection-bar')) return true;
    for (let n = /** @type {HTMLElement|null} */ (el); n && n !== document.body; n = n.parentElement) {
      const overflow = getComputedStyle(n).overflowX;
      if ((overflow === 'auto' || overflow === 'scroll') && n.scrollWidth > n.clientWidth) return true;
    }
    return false;
  }

  function atSectionRoot() {
    const view = f7.views.current;
    const section = /** @type {Section} */ (view?.el?.id?.replace('view-', ''));
    return (
      layout.phone &&
      sections.includes(section) &&
      view.router.history.length === 1 &&
      !document.querySelector('.panel-in, .modal-in, .searchbar-enabled, .selection-bar')
    );
  }

  document.addEventListener(
    'touchstart',
    (e) => {
      tracking = e.touches.length === 1 && atSectionRoot() && !hasOwnGesture(/** @type {HTMLElement} */ (e.target));
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
      at = e.timeStamp;
    },
    { passive: true },
  );
  document.addEventListener(
    'touchend',
    (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - x;
      const dy = e.changedTouches[0].clientY - y;
      if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) / 2 || e.timeStamp - at > 700) return;
      const step = dx < 0 ? 1 : -1;
      const next = sections[sections.indexOf(navigation.section) + step];
      if (!next) return;
      slideToSection(next, step > 0 ? 'next' : 'previous');
    },
    { passive: true },
  );
}

/** Length of the slide between two sections, in ms (theme.css, od-tab-*). */
const SLIDE_MS = 280;

/**
 * Shows a section by sliding: the section left goes out on one side while
 * the new one comes in from the other, following it (theme.css, od-tab-*).
 * @param {Section} next
 * @param {'next'|'previous'} direction
 */
function slideToSection(next, direction) {
  const from = document.querySelector('.views > .view.tab-active');
  const to = document.getElementById(`view-${next}`);
  const views = from?.parentElement;
  if (!from || !to || !views || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showSection(next);
    return;
  }
  views.classList.add('od-tab-sliding');
  from.classList.add('od-tab-leaving', `od-tab-out-${direction}`);
  to.classList.add(`od-tab-in-${direction}`);
  showSection(next);
  setTimeout(() => {
    views.classList.remove('od-tab-sliding');
    from.classList.remove('od-tab-leaving', `od-tab-out-${direction}`);
    to.classList.remove(`od-tab-in-${direction}`);
  }, SLIDE_MS);
}
