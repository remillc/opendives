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
 * Both panes of a list and detail pair show from the width where the detail
 * keeps at least 400 px beside the navigation and the list: 836 px on
 * Android (Material 3's 840 dp breakpoint), 960 px on iPad. Narrower (iPad in
 * portrait, a foldable half open), the detail replaces the list.
 */
export const splitBreakpoint = navWidth + listWidth + 400;

const query = typeof matchMedia === 'function' ? matchMedia('(max-width: 767.98px)') : null;
const splitQuery = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${splitBreakpoint}px)`) : null;

export const layout = $state({
  phone: query ? query.matches : true,
  /** Tablet layout with room for the list and the detail side by side. */
  split: splitQuery ? splitQuery.matches : false,
});

query?.addEventListener('change', (e) => {
  layout.phone = e.matches;
});
splitQuery?.addEventListener('change', (e) => {
  layout.split = e.matches;
});
