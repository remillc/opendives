// @ts-check
// Main sections and the side menu of the phone layout (spec, section 3).
import { f7 } from 'framework7-svelte';
import { layout, bottomNav } from './layout.svelte.js';
import { horizontalSwipe, swipeGoesThrough, settle } from './swipe.js';

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
  /** Settings or About when shown over a section, else empty: the row lit in the menu. */
  page: /** @type {''|'settings'|'about'} */ (''),
  /** Identifier of the dive shown beside the list (tablet), or null. */
  dive: /** @type {string|null} */ (null),
  /** Download pages open (Download, Download failed): the Logbook's floating + steps aside while one shows. */
  downloadPanes: 0,
  /**
   * The current section shows its first page (no page pushed over it): where the bottom
   * navigation bar is shown (Android phone, task 2026-11-14-120).
   */
  atRoot: true,
  /** The account sheet (Android phone): account, sync, Réglages and À propos. */
  accountOpen: false,
});

/** Whether the current view shows its first page, for the bottom navigation bar. */
function updateAtRoot() {
  const view = f7.views.current;
  const id = view?.el?.id?.replace('view-', '');
  navigation.atRoot = sections.includes(/** @type {Section} */ (id)) && (view?.router?.history?.length ?? 1) <= 1;
}

/** Element that opened the menu; it gets the focus back on close. */
/** @type {HTMLElement|null} */
let opener = null;

/** @param {Section} section */
export function showSection(section) {
  f7.tab.show(`#view-${section}`);
}

/**
 * Settings or About opened over a section (openOver): back to the section's
 * own first screen.
 * @param {any} view a Framework7 view
 */
function closeOverPages(view) {
  const router = view?.router;
  if (!router || router.history.length < 2) return;
  if (!isOverPath(router.currentRoute?.path ?? '')) return;
  // One step back when Settings or About sit right on the first screen;
  // deeper (a page of Settings), straight back to the first screen. Without
  // animation Framework7 left the first screen shifted as a previous page.
  if (router.history.length === 2) router.back();
  else backToFirstScreen(router);
}

/**
 * Back to a view's first screen, one page at a time and without animation. Not
 * `router.back(first, { force: true })`: in a view with a list-detail pair (the Logbook,
 * whose list is a master page, even on a phone), Framework7 then leaves the first screen
 * marked as a previous page, shifted to the left, and a page opened next can be dropped
 * while its route stays in the history (bug of 13 November 2026: the Logbook shifted, with
 * a white band on the right, after leaving a Réglages subpage from the side menu).
 * @param {any} router a Framework7 router
 * @returns {Promise<void>} settled when the first screen is shown
 */
export async function backToFirstScreen(router) {
  const start = Date.now();
  while (router && router.history.length > 1 && Date.now() - start < 2000) {
    // `transitioning` is not in Framework7's types: a back asked during a transition is dropped.
    if (!router.transitioning) router.back({ animate: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

/**
 * Whether a route is one of the screens opened over a section.
 * @param {string} path
 */
export const isOverPath = (path) => path.startsWith('/settings/') || path === '/about';

/**
 * A section chosen in the side menu or the navigation rail: Settings or About
 * opened over the current section close first, and the section chosen shows
 * its own screen even when it is the one under Settings (bug of 12 November
 * 2026: Carnet chosen from Settings opened over the Carnet did nothing).
 * @param {Section} section
 */
export function goToSection(section) {
  closeOverPages(f7.views.current);
  showSection(section);
  closeOverPages(f7.views.get(`#view-${section}`));
}

/**
 * Opens Settings or About over the current section. On a tablet, a section
 * with a list and a detail (Logbook, Statistics, Tools) would show it beside
 * its list: it opens full width in the Account section instead.
 * @param {string} path
 */
export function openOver(path) {
  let view = f7.views.current;
  // Réglages on a tablet: always in the Account view, where its overview and a subpage sit
  // side by side (task 2026-11-13-111).
  if (view?.el?.classList.contains('view-master-detail') || (layout.split && path === '/settings/' && view?.el?.id !== 'view-account')) {
    showSection('account');
    view = f7.views.get('#view-account');
  }
  const router = view?.router;
  if (router && router.currentRoute?.path !== path) router.navigate(path);
}

/** Settings open over the current section, from the side menu or the tablet navigation. */
export function openSettings() {
  openOver('/settings/');
}

/** About opens over the current section, from the side menu or the tablet navigation. */
export function openAbout() {
  openOver('/about');
}

/** Follows the visible tab, whatever showed it (menu, Back key, tablet bar). */
export function trackSection() {
  f7.on('tabShow', (/** @type {HTMLElement} */ el) => {
    const section = /** @type {Section} */ (el.id?.replace('view-', ''));
    if (allSections.includes(section)) navigation.section = section;
    updateAtRoot();
  });
  // A page pushed or left in any view: whether the bottom bar shows.
  f7.on('routeChanged', updateAtRoot);
  f7.on('pageAfterIn', updateAtRoot);
  f7.on('pageAfterOut', updateAtRoot);
  updateAtRoot();
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
 * The screen always moves the same way: the current one slides out under the
 * finger and the next one comes in beside it; lifted past a fifth of the width
 * (or flicked), the next one takes the screen, otherwise both go back. From
 * Account a swipe left opens Settings, and from Settings it opens About, as
 * pages over the section; a swipe right on them is the back gesture, which
 * moves the pages the same way (enableFullSwipeBack). Not on what has its own
 * gestures (map, profile, fields, anything that scrolls sideways), nor while a
 * menu, a dialog, a search or the logbook's selection is open.
 */
export function enableSectionSwipes() {
  /** The menu entries a swipe goes through, in order: the sections are tabs. */
  /** On Android phones Account is not a section: it opens from the account sheet. */
  const swipeOrder = () => (bottomNav() ? [...sections] : [...sections, 'account']);

  /** Where the swipe started: a section's first screen, or the Settings page. */
  /** @type {null|{ kind: 'tab', section: string }|{ kind: 'settings' }} */
  let start = null;
  /** Between sections: the section leaving, the one coming, their container. */
  /** @type {HTMLElement|null} */
  let from = null;
  /** @type {HTMLElement|null} */
  let neighbour = null;
  /** @type {HTMLElement|null} */
  let views = null;
  /** Towards a page: the page is opened at once and placed beside the screen. */
  /** @type {null|{ router: any, view: HTMLElement, page: HTMLElement }} */
  let push = null;
  let width = 0;
  let settling = false;

  /** @param {HTMLElement} el */
  function hasOwnGesture(el) {
    if (el.closest('.maplibregl-map, .od-dive-profile--profile, .od-planner--profile, canvas, input, textarea, select, .panel, .modal-in, .fab, .od-logbook--selection-bar')) return true;
    for (let n = /** @type {HTMLElement|null} */ (el); n && n !== document.body; n = n.parentElement) {
      const overflow = getComputedStyle(n).overflowX;
      if ((overflow === 'auto' || overflow === 'scroll') && n.scrollWidth > n.clientWidth) return true;
    }
    return false;
  }

  /** @returns {typeof start} */
  function startingPoint() {
    if (!layout.phone || document.querySelector('.panel-in, .modal-in, .searchbar-enabled, .od-sites--search.od-sites--open, .od-logbook--selection-bar')) return null;
    const view = f7.views.current;
    const section = view?.el?.id?.replace('view-', '');
    if (!swipeOrder().includes(section)) return null;
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
    if (start.kind === 'settings') return dx < 0 ? { route: '/about' } : null;
    if (dx < 0 && start.section === 'account') return { route: '/settings/' };
    const order = swipeOrder();
    const next = order[order.indexOf(start.section) + (dx < 0 ? 1 : -1)];
    return next ? { tab: /** @type {Section} */ (next) } : null;
  }

  /** @param {HTMLElement|null} el */
  function release(el) {
    if (!el) return;
    el.classList.remove('od-tab-peek');
    el.style.transform = '';
    el.style.transition = '';
  }

  /** Puts the sections back where they were, without animation. */
  function dropSections() {
    if (from) from.style.transform = '';
    release(neighbour);
    views?.classList.remove('od-tab-sliding');
    from = neighbour = views = null;
  }

  /**
   * Opens the page without animation, both pages then placed by the
   * --od-push-dx offset of the view (theme.css, od-pushing): the new page is
   * already beside the screen when it appears.
   * @param {string} route
   */
  function startPush(route) {
    const router = f7.views.current?.router;
    const view = /** @type {HTMLElement|undefined} */ (router?.el);
    const page = /** @type {HTMLElement|null|undefined} */ (view?.querySelector(':scope > .page-current'));
    if (!router || !view || !page) return null;
    width = view.clientWidth;
    page.classList.add('od-push-from');
    view.style.setProperty('--od-push-dx', '0px');
    view.classList.add('od-pushing');
    router.navigate(route, { animate: false });
    return { router, view, page };
  }

  /** @param {number} dx */
  function placePush(dx) {
    push?.view.style.setProperty('--od-push-dx', `${Math.min(dx, 0)}px`);
  }

  /**
   * @param {number} dx
   * @param {number} velocity
   */
  function endPush(dx, velocity) {
    if (!push) return;
    const { router, view, page } = push;
    push = null;
    const through = dx < 0 && swipeGoesThrough(dx, velocity, width);
    const from = Math.min(dx, 0);
    const { easing, ms } = settle(from, through ? -width : 0, from < 0 ? velocity : 0);
    settling = true;
    view.style.setProperty('--od-push-ease', easing);
    view.style.setProperty('--od-push-ms', `${ms}ms`);
    view.classList.add('od-push-settle');
    view.style.setProperty('--od-push-dx', through ? `${-width}px` : '0px');
    setTimeout(() => {
      if (!through) router.back({ animate: false });
      view.classList.remove('od-pushing', 'od-push-settle');
      view.style.removeProperty('--od-push-dx');
      view.style.removeProperty('--od-push-ease');
      view.style.removeProperty('--od-push-ms');
      page.classList.remove('od-push-from');
      settling = false;
    }, ms);
  }

  /**
   * The hidden sections keep their layout (theme.css), but one never drawn yet
   * costs a long frame the first time a swipe shows it (Sites and its map:
   * about 400 ms on the emulator). Once the app is idle, each one is drawn
   * once beside the screen, out of sight; content-visibility then keeps that
   * rendering for the swipe.
   */
  function warmSections() {
    if (!layout.phone) return;
    const ids = swipeOrder().map((s) => `view-${s}`);
    // Safari has no requestIdleCallback.
    /** @param {() => void} f @param {{ timeout: number }} o */
    const idle = (f, o) => (window.requestIdleCallback ? window.requestIdleCallback(f, o) : setTimeout(f, 300));
    const next = () => {
      const views = document.querySelector('.views');
      const el = ids.map((id) => document.getElementById(id)).find((v) => v && !v.classList.contains('tab-active'));
      if (!views || !el) return;
      ids.splice(ids.indexOf(el.id), 1);
      // Not under a finger or a settling swipe: try again at the next idle moment.
      if (start || settling || views.classList.contains('od-tab-sliding')) {
        ids.push(el.id);
        idle(next, { timeout: 2000 });
        return;
      }
      views.classList.add('od-tab-sliding');
      el.classList.add('od-tab-peek');
      el.style.transform = `translateX(${views.clientWidth}px)`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          // A swipe may have taken this section meanwhile: it is then its own.
          if (neighbour !== el) release(el);
          if (!from) views.classList.remove('od-tab-sliding');
          idle(next, { timeout: 2000 });
        }),
      );
    };
    setTimeout(() => idle(next, { timeout: 4000 }), 1500);
  }
  warmSections();

  horizontalSwipe(document, {
    accept(e) {
      if (settling || hasOwnGesture(/** @type {HTMLElement} */ (e.target))) return false;
      start = startingPoint();
      return !!start;
    },
    move(dx) {
      if (!start) return;
      if (push) {
        placePush(dx);
        return;
      }
      const next = toward(dx);
      if (next && 'route' in next) {
        dropSections();
        push = startPush(next.route);
        placePush(dx);
        return;
      }
      // A swipe right on Settings belongs to the back gesture.
      if (start.kind === 'settings') return;
      if (!from) {
        from = /** @type {HTMLElement|null} */ (document.querySelector('.views > .view.tab-active'));
        views = from?.parentElement ?? null;
        if (!from || !views) return;
        width = views.clientWidth;
        views.classList.add('od-tab-sliding');
      }
      const el = next && 'tab' in next ? document.getElementById(`view-${next.tab}`) : null;
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
      // Where the swipe leads, read before its starting point is forgotten.
      const next = toward(dx);
      start = null;
      if (push) {
        endPush(dx, velocity);
        return;
      }
      if (!from || !views) return;
      const through = !!next && 'tab' in next && !!neighbour && swipeGoesThrough(dx, velocity, width);
      const left = from;
      const coming = neighbour;
      const container = views;
      from = neighbour = views = null;
      // From where the finger left the screen, at its speed (a third of both at the end of the menu).
      const shown = coming ? dx : dx / 3;
      const { easing, ms } = settle(shown, through ? (dx < 0 ? -width : width) : 0, coming ? velocity : velocity / 3);
      settling = true;
      const transition = `transform ${ms}ms ${easing}`;
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
      }, ms);
    },
  });
}

/**
 * Android: the back gesture moves the pages like a swipe between sections,
 * the page underneath coming in beside the one leaving, over the full width
 * (Framework7 only moves it by a fifth). Framework7 places the pages right
 * after announcing the move, so the correction comes just after it.
 */
export function enableFullSwipeBack() {
  f7.on('swipebackMove', (/** @type {any} */ data) => {
    if (f7.theme !== 'md') return;
    const current = /** @type {HTMLElement} */ (data.currentPageEl);
    const previous = /** @type {HTMLElement} */ (data.previousPageEl);
    queueMicrotask(() => {
      const w = current.offsetWidth;
      previous.style.transform = `translate3d(${Math.round(data.percentage * w - w)}px,0,0)`;
    });
  });
}
