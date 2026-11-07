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

/** About opens over the current section, from the side menu or the tablet navigation. */
export function openAbout() {
  const router = f7.views.current?.router;
  if (router && router.currentRoute?.path !== '/about/') router.navigate('/about/');
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
 * Phone: a swipe left or right goes to the next or previous entry of the
 * menu, in its order: the four sections, Account, then Settings and About.
 * Between sections the section follows the finger, the next one coming in
 * beside it; lifted past a fifth of the width (or flicked), the next one takes
 * the screen, otherwise both go back. From Account a swipe left opens
 * Settings, and from Settings it opens About, as pages over the section: the
 * screen only gives a little under the finger, and a swipe right on them goes
 * back like on every page with a back arrow. Not on what has its own gestures
 * (map, profile, fields, anything that scrolls sideways), nor while a menu, a
 * dialog, a search or the logbook's selection is open.
 */
export function enableSectionSwipes() {
  /** The menu entries a swipe goes through, in order: the sections are tabs. */
  const swipeOrder = [...sections, 'account'];

  /** Where the swipe started: a section's first screen, or the Settings page. */
  /** @type {null|{ kind: 'tab', section: string }|{ kind: 'settings' }} */
  let start = null;
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

  /** @returns {typeof start} */
  function startingPoint() {
    if (!layout.phone || document.querySelector('.panel-in, .modal-in, .searchbar-enabled, .selection-bar')) return null;
    const view = f7.views.current;
    const section = view?.el?.id?.replace('view-', '');
    if (!swipeOrder.includes(section)) return null;
    if (view.router.history.length === 1) return { kind: 'tab', section };
    if (view.router.currentRoute?.path === '/settings/') return { kind: 'settings' };
    return null;
  }

  /**
   * What a swipe of `dx` leads to: a section (tab), a page to open (route),
   * or nothing; a swipe right on Settings is left to the back gesture.
   * @param {number} dx
   * @returns {null|{ tab: Section }|{ route: string }}
   */
  function toward(dx) {
    if (!start) return null;
    if (start.kind === 'settings') return dx < 0 ? { route: '/about/' } : null;
    const i = swipeOrder.indexOf(start.section);
    if (dx < 0 && start.section === 'account') return { route: '/settings/' };
    const next = swipeOrder[i + (dx < 0 ? 1 : -1)];
    return next ? { tab: /** @type {Section} */ (next) } : null;
  }

  /** @param {HTMLElement|null} el */
  function release(el) {
    if (!el) return;
    el.classList.remove('od-tab-peek');
    el.style.transform = '';
    el.style.transition = '';
  }

  horizontalSwipe(document, {
    accept(e) {
      if (settling || hasOwnGesture(/** @type {HTMLElement} */ (e.target))) return false;
      start = startingPoint();
      return !!start;
    },
    move(dx) {
      if (!start) return;
      if (!from) {
        from = /** @type {HTMLElement|null} */ (document.querySelector('.views > .view.tab-active'));
        views = from?.parentElement ?? null;
        if (!from || !views) return;
        width = views.clientWidth;
        views.classList.add('od-tab-sliding');
      }
      const next = toward(dx);
      const el = next && 'tab' in next ? document.getElementById(`view-${next.tab}`) : null;
      if (neighbour !== el) {
        release(neighbour);
        neighbour = el;
      }
      // Towards another section the screen follows the finger; towards a page
      // to open, or at the end of the menu, it only gives a little. A swipe
      // right on Settings belongs to the back gesture.
      const shown = el ? dx : start.kind === 'settings' && dx > 0 ? 0 : dx / 3;
      from.style.transform = shown ? `translateX(${shown}px)` : '';
      if (el) {
        el.classList.add('od-tab-peek');
        el.style.transform = `translateX(${shown + (dx < 0 ? width : -width)}px)`;
      }
    },
    end(dx, velocity) {
      if (!from || !views) {
        start = null;
        return;
      }
      const next = toward(dx);
      const goes = swipeGoesThrough(dx, velocity, width);
      const left = from;
      const coming = neighbour;
      const container = views;
      start = null;
      from = null;
      neighbour = null;
      views = null;
      if (next && 'route' in next && goes) {
        left.style.transform = '';
        container.classList.remove('od-tab-sliding');
        f7.views.current?.router.navigate(next.route);
        return;
      }
      const through = !!next && 'tab' in next && !!coming && goes;
      settling = true;
      const transition = `transform ${SETTLE_MS}ms ease-out`;
      left.style.transition = transition;
      if (coming) coming.style.transition = transition;
      left.style.transform = through ? `translateX(${dx < 0 ? -width : width}px)` : '';
      if (coming) coming.style.transform = through ? 'translateX(0)' : `translateX(${dx < 0 ? width : -width}px)`;
      setTimeout(() => {
        if (through && next && 'tab' in next) showSection(next.tab);
        left.style.transform = '';
        left.style.transition = '';
        release(coming);
        container.classList.remove('od-tab-sliding');
        settling = false;
      }, SETTLE_MS);
    },
  });
}

/** Time for the sections to settle once the finger is lifted, in ms. */
const SETTLE_MS = 180;
