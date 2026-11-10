// @ts-check
// The dives beside the one shown, ready before a swipe (spec, "Dive detail",
// swipe to the next or previous dive): their detail read from the core and
// their site's map picture decoded, so that the next screen comes in whole
// instead of filling in during the slide.
import { OpenDivesCore } from 'opendives-core';
import { sharedSiteMap } from './site-image.js';

/** @typedef {import('opendives-core').DiveDetail} DiveDetail */

/** A few details: the one shown and its neighbours, with some margin. */
const KEPT = 6;
/** @type {Map<number, DiveDetail>} id → detail, the most recent last */
const details = new Map();
/** @type {Map<number, Promise<DiveDetail>>} */
const reading = new Map();

/** @param {number} id @param {DiveDetail} dive */
export function keepDive(id, dive) {
  details.delete(id);
  details.set(id, dive);
  while (details.size > KEPT) details.delete(details.keys().next().value);
}

/**
 * The detail of a dive read a moment ago, at once; else null. The screen still
 * reads it again, in case it changed meanwhile.
 * @param {number} id
 */
export function readyDive(id) {
  return details.get(id) ?? null;
}

/** Forgets a dive (deleted, or changed in a way the screen does not follow). @param {number} id */
export function forgetDive(id) {
  details.delete(id);
}

/** @param {number} id */
function read(id) {
  let promise = reading.get(id);
  if (!promise) {
    promise = OpenDivesCore.getDive({ id })
      .then((dive) => {
        keepDive(id, dive);
        return dive;
      })
      .finally(() => reading.delete(id));
    reading.set(id, promise);
  }
  return promise;
}

/**
 * Prepares the dives a swipe can lead to: their detail, then their site's
 * picture. Quietly gives up on anything that fails (the swipe then loads it
 * as before).
 * @param {number[]} ids
 */
export async function preloadDives(ids) {
  for (const id of ids) {
    try {
      const dive = details.get(id) ?? (await read(id));
      const c = dive.siteCoordinates;
      if (c) await sharedSiteMap(c.latUdeg, c.lonUdeg).catch(() => {});
    } catch (e) {
      console.warn('Preparing a dive', id, e);
    }
  }
}
