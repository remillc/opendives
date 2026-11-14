// @ts-check
// Width decides the layout, not the type of device (spec, section 3): below
// 768 px, phone layout. A foldable therefore changes layout without restarting.

/** Debug override of the platform look: `?theme=ios` or `?theme=md`. */
const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('theme') : null;

/** The iOS look is used on iPhone and iPad, the Material look elsewhere. */
export const ios =
  forced === 'ios' ||
  (forced !== 'md' &&
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)));

/** Width of the tablet navigation, in px: the iPad sidebar, the Android rail (spec, section 3). */
export const navWidth = ios ? 220 : 96;

// Read by the rail and by the views (App.svelte).
if (typeof document !== 'undefined') document.documentElement.style.setProperty('--od-nav-width', `${navWidth}px`);

/** Width of the list pane of a list and detail pair (spec, section 3). */
export const listWidth = 340;

/**
 * Both panes of a list and detail pair show from 768 px, as soon as the
 * tablet layout starts (Christian's choice, 7 November 2026): iPad in
 * portrait included, the detail then narrower beside the navigation and the
 * list. Below, the phone layout: the detail replaces the list.
 */
export const splitBreakpoint = 768;

/**
 * The navigation rail (Android) shows from 1000 dp only (spec, section 7,
 * "Android tablet in portrait: no rail"): below it, a tablet in portrait uses
 * the phone's side menu and floating "+". The iPad sidebar stays from 768.
 */
export const railBreakpoint = ios ? splitBreakpoint : 1000;

const query = typeof matchMedia === 'function' ? matchMedia('(max-width: 767.98px)') : null;
const railQuery = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${railBreakpoint}px)`) : null;
const splitQuery = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${splitBreakpoint}px)`) : null;

export const layout = $state({
  phone: query ? query.matches : true,
  /** Rail (Android) or sidebar (iPad) on screen; otherwise the ☰ button and the side menu. */
  rail: railQuery ? railQuery.matches : false,
  /** Tablet layout with room for the list and the detail side by side. */
  split: splitQuery ? splitQuery.matches : false,
});

query?.addEventListener('change', (e) => {
  layout.phone = e.matches;
});

/**
 * Android phone: the four sections are reached from the bottom navigation bar, and the top
 * bars of the sections have no ☰ (task 2026-11-14-120). iPhone and tablets keep their menu,
 * sidebar or rail.
 * @returns {boolean}
 */
export const bottomNav = () => !ios && layout.phone;
railQuery?.addEventListener('change', (e) => {
  layout.rail = e.matches;
});
splitQuery?.addEventListener('change', (e) => {
  layout.split = e.matches;
});
