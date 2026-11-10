// @ts-check
// "Clean up the sites": which duplicate groups an edit made disappear.
// A pair counts only if it was in the list before the editor opened, so a
// pair that left earlier (dismissed, merged) never gives a message.

/** @param {number} a @param {number} b */
const keyOf = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * The pairs of `before` that contain the edited site and are no longer in `after`.
 * @template {{a: {uuid: number}, b: {uuid: number}}} P
 * @param {P[]} before pairs listed when the editor opened
 * @param {P[]} after pairs listed now
 * @param {number} uuid the edited site
 * @returns {P[]}
 */
export function pairsGone(before, after, uuid) {
  const now = new Set(after.map((p) => keyOf(p.a.uuid, p.b.uuid)));
  return before.filter((p) => (p.a.uuid === uuid || p.b.uuid === uuid) && !now.has(keyOf(p.a.uuid, p.b.uuid)));
}
