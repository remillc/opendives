// @ts-check
// When to ask for the store's in-app review (task 2026-11-13-104). The system dialog
// is the only one: OpenDives never asks "do you like the app?" first, and never
// chooses who is asked. Pure decision here; the dates live in the device's storage.
import { OpenDivesCore } from 'opendives-core';

/** The logbook holds at least this many dives. */
export const MIN_DIVES = 5;
/** The app was first opened at least this many days ago. */
export const MIN_AGE_DAYS = 7;
/** At most one request every this many days. */
export const MIN_INTERVAL_DAYS = 120;

const DAY = 86400000;
const FIRST_OPEN_KEY = 'od.firstOpen';
const LAST_REVIEW_KEY = 'od.lastReviewRequest';

/**
 * @typedef {Object} ReviewState
 * @property {number} now ms since the epoch
 * @property {number|null} firstOpen ms of the first launch, null when unknown
 * @property {number|null} lastRequest ms of the last request, null when none
 * @property {number} dives dives in the logbook
 * @property {boolean} storeBuild installed from Google Play or the App Store
 * @property {boolean} downloadOk a dive-computer download has just succeeded
 * @property {boolean} [error] an error is showing
 * @property {boolean} [conflict] a sync conflict is waiting
 */

/**
 * @param {ReviewState} s
 * @returns {boolean}
 */
export function shouldAskReview(s) {
  if (!s.storeBuild || !s.downloadOk || s.error || s.conflict) return false;
  if (s.dives < MIN_DIVES) return false;
  // Never on the first launch: no first-open date yet, or one in the future.
  if (s.firstOpen == null || s.firstOpen > s.now) return false;
  if (s.now - s.firstOpen < MIN_AGE_DAYS * DAY) return false;
  if (s.lastRequest != null && s.now - s.lastRequest < MIN_INTERVAL_DAYS * DAY) return false;
  return true;
}

/**
 * @param {string} key
 * @returns {number|null}
 */
function readDate(key) {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Stores the first-open date, once: called at every launch. */
export function noteFirstOpen() {
  try {
    if (readDate(FIRST_OPEN_KEY) == null) localStorage.setItem(FIRST_OPEN_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: the review is simply never asked.
  }
}

/**
 * After a successful dive-computer download, back on the logbook: asks the system
 * for its review dialog when the conditions hold. The store may still show nothing.
 * @param {{ dives: number, error?: boolean, conflict?: boolean }} context
 * @returns {Promise<boolean>} a request was sent
 */
export async function askReviewAfterDownload(context) {
  try {
    const { store } = await OpenDivesCore.installSource();
    const ask = shouldAskReview({
      now: Date.now(),
      firstOpen: readDate(FIRST_OPEN_KEY),
      lastRequest: readDate(LAST_REVIEW_KEY),
      dives: context.dives,
      storeBuild: store === true,
      downloadOk: true,
      error: context.error,
      conflict: context.conflict,
    });
    if (!ask) return false;
    localStorage.setItem(LAST_REVIEW_KEY, String(Date.now()));
    await OpenDivesCore.requestReview();
    return true;
  } catch (e) {
    console.error('Review request', e);
    return false;
  }
}
