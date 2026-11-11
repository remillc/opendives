// @ts-check
// History of the detail pane on a tablet (system design, section 7, "Back arrow
// in the detail pane"). Framework7's master-detail view keeps the list as its
// first page and stacks what opens beside it: a row of the list replaces the
// stack with one "detail root" page, a screen opened from inside the pane is
// pushed over it. The pane therefore has history exactly when the page shown
// in it is not a detail root. Kept free of Framework7 so it can be tested.

/**
 * What the pane shows, read from the classes Framework7 puts on its pages.
 * @typedef {object} PaneState
 * @property {boolean} masterDetail the view shows the list and the detail side by side
 * @property {boolean} detail a page is shown in the detail pane
 * @property {boolean} detailRoot that page is the first of the pane (a row of the list opened it)
 */

/**
 * @param {PaneState} pane
 * @returns {boolean} a screen opened from inside the pane is shown, so there is a screen to go back to
 */
export function paneHasHistory(pane) {
  return pane.masterDetail && pane.detail && !pane.detailRoot;
}

/**
 * What the system Back key does once nothing modal, no selection and no
 * search is left to close.
 * - `pane`: back one screen in the detail pane only.
 * - `page`: back one page of the view (a view without a pane, or the phone layout).
 * - `logbook`: from another section, to the Logbook.
 * - `exit`: from the Logbook, the app goes to the background.
 * The selection of the list is never the only thing cleared: at the first
 * screen of the pane, Back does what it does on the list alone.
 * @param {PaneState & { historyLength: number, logbook: boolean }} state
 * @returns {'pane'|'page'|'logbook'|'exit'}
 */
export function backTarget(state) {
  if (state.masterDetail) {
    if (paneHasHistory(state)) return 'pane';
    // The list is the view's first page: nothing below it in the view.
    return state.logbook ? 'exit' : 'logbook';
  }
  if (state.historyLength > 1) return 'page';
  return state.logbook ? 'exit' : 'logbook';
}

/**
 * Reads the pane of a view.
 * @param {HTMLElement|null|undefined} viewEl
 * @returns {PaneState}
 */
export function readPane(viewEl) {
  const masterDetail = !!viewEl?.classList.contains('view-master-detail');
  const page = masterDetail ? viewEl?.querySelector(':scope > .page-current.page-master-detail') : null;
  return {
    masterDetail,
    detail: !!page,
    detailRoot: !!page?.classList.contains('page-master-detail-root'),
  };
}
