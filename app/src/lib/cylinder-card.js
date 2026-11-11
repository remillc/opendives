// @ts-check
// Pure logic of the cylinder cards of "Edit dive" (pages/EditDive.svelte,
// components/CylinderCard.svelte): the gas in plain words, the size and
// pressure class shown under the Type, the pressure used, and the reordering.

const MBAR_PER_PSI = 68.947572932;

/** Working pressure from which a cylinder is "HP": 3 300 psi (about 227,5 bar), in mbar. */
export const HP_MBAR = Math.round(3300 * MBAR_PER_PSI);
/** Working pressure up to which a cylinder is "LP": 2 640 psi (about 182 bar), in mbar. */
export const LP_MBAR = Math.round(2640 * MBAR_PER_PSI);

/** The value of the Type menu that reveals the Size and Working pressure fields. */
export const OTHER_TYPE = '__other__';

/**
 * The kind of a gas, for its name in plain words. The core stores air as 0 per
 * mille of oxygen (meaning 21 %).
 * @param {number} o2Permille
 * @param {number} hePermille
 * @returns {{ kind: 'air'|'oxygen'|'nitrox'|'trimix', o2: number, he: number }}
 */
export function gasKind(o2Permille, hePermille) {
  const o2 = Math.round(o2Permille / 10);
  const he = Math.round(hePermille / 10);
  if (he > 0) return { kind: 'trimix', o2, he };
  if (o2 >= 100) return { kind: 'oxygen', o2, he };
  if (o2 === 0 || o2 === 21) return { kind: 'air', o2: 21, he };
  return { kind: 'nitrox', o2, he };
}

/**
 * The gas name of a card's chip: "Trimix 16/45", "EAN32", "Air", "Oxygen".
 * @param {number} o2Permille
 * @param {number} hePermille
 * @param {{ air: string, oxygen: string, nitrox: string, trimix: string }} words the translated templates; nitrox takes {o2}, trimix {o2} and {he}
 */
export function gasName(o2Permille, hePermille, words) {
  const { kind, o2, he } = gasKind(o2Permille, hePermille);
  return words[kind].replace('{o2}', String(o2)).replace('{he}', String(he));
}

/**
 * High pressure (3 300 psi and more), low pressure (2 640 psi and less), or
 * nothing in between and when the working pressure is not known.
 * @param {number} workingPressureMbar
 * @returns {'HP'|'LP'|''}
 */
export function pressureClass(workingPressureMbar) {
  if (!(workingPressureMbar > 0)) return '';
  if (workingPressureMbar >= HP_MBAR) return 'HP';
  if (workingPressureMbar <= LP_MBAR) return 'LP';
  return '';
}

/**
 * The size as the diver reads it, then its class: "16 cuft HP", "80 cuft",
 * "11,1 L LP". Empty when the cylinder has no size.
 * @param {string|null} size the formatted size (format.js formatCylinderSize), null when unknown
 * @param {number} workingPressureMbar
 */
export function typeHelper(size, workingPressureMbar) {
  if (!size) return '';
  return [size, pressureClass(workingPressureMbar)].filter(Boolean).join(' ');
}

/**
 * Pressure used, start minus end; 0 when one of them is missing or the end is
 * not below the start.
 * @param {number} startMbar
 * @param {number} endMbar
 */
export function pressureUsed(startMbar, endMbar) {
  return startMbar > 0 && endMbar > 0 && startMbar > endMbar ? startMbar - endMbar : 0;
}

/**
 * Whether the cylinder at `from` may move to `to`. Cylinders of the dive come
 * first, new ones (index below 0) stay after them: the core adds a new
 * cylinder after the visible ones.
 * @param {{ index: number }[]} list
 * @param {number} from
 * @param {number} to
 */
export function canMove(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return false;
  const after = moveItem(list, from, to);
  const firstNew = after.findIndex((c) => c.index < 0);
  return firstNew < 0 || after.slice(firstNew).every((c) => c.index < 0);
}

/**
 * A copy of the list with the item at `from` moved to `to`.
 * @template T
 * @param {T[]} list
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveItem(list, from, to) {
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/**
 * Where a dragged card would land: the number of the other cards whose centre
 * is above the dragged card's centre.
 * @param {number[]} centers the centres of all the cards, in order, as they were when the drag began
 * @param {number} from the dragged card
 * @param {number} dragCenter the dragged card's centre now
 */
export function dropIndex(centers, from, dragCenter) {
  let to = 0;
  centers.forEach((center, i) => {
    if (i !== from && center < dragCenter) to++;
  });
  return to;
}
