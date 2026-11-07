// @ts-check
// Main sections and the side menu of the phone layout (spec, section 3).
import { f7 } from 'framework7-svelte';
import { layout } from './layout.svelte.js';
import { horizontalSwipe, swipeGoesThrough } from './swipe.js';

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
 * the next or previous section, in the order of the menu. The section follows
 * the finger, the next one coming in beside it; lifted past a quarter of the
 * width (or flicked), the next one takes the screen, otherwise both go back.
 * Not on what has its own gestures (map, profile, fields, anything that
 * scrolls sideways), nor while a menu, a dialog, a search or the logbook's
 * selection is open.
 */
export function enableSectionSwipes() {
  /** @type {HTMLElement|null} */
  let from = null;
  /** @type {HTMLElement|null} */
  let neighbour = null;
  /** @type {HTMLElement|null} */
  let views = null;
  let width = 0;
  let settling = false;

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

  /** @param {number} dx */
  const sectionToward = (dx) => sections[sections.indexOf(navigation.section) + (dx < 0 ? 1 : -1)];

  /** @param {HTMLElement|null} el */
  function release(el) {
    if (!el) return;
    el.classList.remove('od-tab-peek');
    el.style.transform = '';
    el.style.transition = '';
  }

  horizontalSwipe(document, {
    accept: (e) => !settling && atSectionRoot() && !hasOwnGesture(/** @type {HTMLElement} */ (e.target)),
    move(dx) {
      if (!from) {
        from = /** @type {HTMLElement|null} */ (document.querySelector('.views > .view.tab-active'));
        views = from?.parentElement ?? null;
        if (!from || !views) return;
        width = views.clientWidth;
        views.classList.add('od-tab-sliding');
      }
      const next = sectionToward(dx);
      const el = next ? document.getElementById(`view-${next}`) : null;
      if (neighbour !== el) {
        release(neighbour);
        neighbour = el;
      }
      // At the end of the menu, the section only gives a little.
      const shown = el ? dx : dx / 3;
      from.style.transform = `translateX(${shown}px)`;
      if (el) {
        el.classList.add('od-tab-peek');
        el.style.transform = `translateX(${shown + (dx < 0 ? width : -width)}px)`;
      }
    },
    end(dx, velocity) {
      if (!from || !views) return;
      const next = sectionToward(dx);
      const through = !!next && !!neighbour && swipeGoesThrough(dx, velocity, width);
      const left = from;
      const coming = neighbour;
      const container = views;
      settling = true;
      const transition = `transform ${SETTLE_MS}ms ease-out`;
      left.style.transition = transition;
      if (coming) coming.style.transition = transition;
      left.style.transform = through ? `translateX(${dx < 0 ? -width : width}px)` : '';
      if (coming) coming.style.transform = through ? 'translateX(0)' : `translateX(${dx < 0 ? width : -width}px)`;
      setTimeout(() => {
        if (through && next) showSection(next);
        left.style.transform = '';
        left.style.transition = '';
        release(coming);
        container.classList.remove('od-tab-sliding');
        settling = false;
      }, SETTLE_MS);
      from = null;
      neighbour = null;
      views = null;
    },
  });
}

/** Time for the sections to settle once the finger is lifted, in ms. */
const SETTLE_MS = 180;
