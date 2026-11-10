// The choices of the sync conflict dialog (spec, "Sync conflict dialog,
// redesigned"). Pure functions, tested in tests/app/conflict-choices.test.mjs.

/** @typedef {'device'|'cloud'} Side */

/**
 * The version kept for each item, by path of its file in the git log. With
 * "same choice for all", one side applies to every item and the per-item
 * choices are ignored. An item the diver did not touch keeps the phone's version.
 * @param {{ path: string }[]} items
 * @param {Record<string, Side>} choices
 * @param {boolean} forAll
 * @param {Side} allSide
 * @returns {Record<string, Side>}
 */
export function conflictChoices(items, choices, forAll, allSide) {
  /** @type {Record<string, Side>} */
  const all = {};
  for (const item of items) all[item.path] = forAll ? allSide : (choices[item.path] ?? 'device');
  return all;
}

/**
 * The number of dives in a conflict (the logbook's settings file is not a dive).
 * @param {{ items: { diveId?: number, date?: string }[] }|null|undefined} conflict
 */
export function conflictDiveCount(conflict) {
  return (conflict?.items ?? []).filter((item) => item.diveId || item.date).length;
}

/**
 * The dialog shown for a conflict: the full-screen list when several items
 * are in conflict (one card each), the single-item dialog otherwise.
 * @param {number} itemCount
 */
export function conflictLayout(itemCount) {
  return itemCount > 1 ? 'list' : 'single';
}
