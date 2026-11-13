// @ts-check
// Pure logic of the graphic gas summaries (components/CylinderDrawing.svelte,
// GasSummary.svelte, the "Gas" section of pages/DiveDetail.svelte): the two
// levels drawn in a cylinder, the sentence about the gas changes and the
// accessible names of the Gas group and the Equipment card.

import { gasKind } from './cylinder-card.js';

/**
 * The levels drawn in a cylinder, both relative to the working pressure and
 * capped at full (without a working pressure the start pressure stands in for
 * it). `end` is the top of the full water gradient, `start` the top of the pale
 * band (what was breathed). Without both pressures (one or none known), the
 * cylinder is hatched in grey, with no level, no band and no line: `hatched`
 * (Christian's decision of 13 November 2026). The start is never drawn below the end.
 * @param {number} startMbar
 * @param {number} endMbar
 * @param {number} workingPressureMbar
 * @returns {{ start: number|null, end: number, hatched: boolean }}
 */
export function fillLevels(startMbar, endMbar, workingPressureMbar) {
  if (!(startMbar > 0) || !(endMbar > 0)) return { start: null, end: 0, hatched: true };
  const full = workingPressureMbar > 0 ? workingPressureMbar : startMbar;
  /** @param {number} mbar */
  const level = (mbar) => Math.min(1, mbar / full);
  const end = level(endMbar);
  return { start: Math.max(end, level(startMbar)), end, hatched: false };
}

/**
 * The depth of the last sample at or before a time (the first one if none).
 * @param {{ timeSeconds: number[], depthMm: number[] }} samples
 * @param {number} seconds
 */
export function depthAt(samples, seconds) {
  const times = samples.timeSeconds;
  if (!times.length) return 0;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= seconds) lo = mid;
    else hi = mid - 1;
  }
  return samples.depthMm[lo] ?? 0;
}

/**
 * The gas changes of a dive, in time order: the gas switched to and the depth at
 * which it happened, read from the profile samples at that moment. The start gas
 * (time 0) is not a change.
 * @param {{ type: string, timeSeconds: number, cylinder: number }[]} events
 * @param {{ timeSeconds: number[], depthMm: number[] }} samples
 * @param {{ o2Permille: number, hePermille: number }[]} cylinders the dive's cylinders, as the events number them
 * @returns {{ kind: 'air'|'oxygen'|'nitrox'|'trimix', o2: number, he: number, depthMm: number }[]}
 */
export function gasChanges(events, samples, cylinders) {
  return events
    .filter((e) => e.type === 'gaschange' && e.timeSeconds > 0 && cylinders[e.cylinder])
    .sort((a, b) => a.timeSeconds - b.timeSeconds)
    .map((e) => {
      const c = cylinders[e.cylinder];
      return { ...gasKind(c.o2Permille, c.hePermille), depthMm: depthAt(samples, e.timeSeconds) };
    });
}

/**
 * The line under the cylinders: "Switch to air at 222 ft." or, for several,
 * "Switch to air at 222 ft, then to EAN50 at 70 ft." Empty when there is none.
 * @param {{ kind: 'air'|'oxygen'|'nitrox'|'trimix', o2: number, he: number, depthMm: number }[]} changes
 * @param {(depthMm: number) => string} formatDepth in the diver's unit
 * @param {{ line: string, item: string, then: string, to: Record<string, string> }} words
 *   line: "Switch {list}." wrapper; item: "{to} at {depth}"; then: the separator;
 *   to: per kind ("to air", "to EAN{o2}", "to trimix {o2}/{he}")
 */
export function gasChangeLine(changes, formatDepth, words) {
  if (!changes.length) return '';
  const list = changes
    .map((c) =>
      words.item
        .replace('{to}', words.to[c.kind].replace('{o2}', String(c.o2)).replace('{he}', String(c.he)))
        .replace('{depth}', formatDepth(c.depthMm)),
    )
    .join(words.then);
  return words.line.replace('{list}', list);
}

/**
 * The accessible name of the Gas group: "Gas: Trimix 16/45 from 2 683 to 1 885
 * psi, oxygen from ..., air from ...". A cylinder without both pressures keeps
 * only its gas.
 * @param {{ gas: string, start: string, end: string }[]} items start and end as shown, the unit on the end ("1 885 psi")
 * @param {{ group: string, cylinder: string, cylinderGas: string, join: string }} words
 *   group: "Gas: {list}"; cylinder: "{gas} from {start} to {end}"; cylinderGas: "{gas}"; join: ", "
 */
export function gasGroupLabel(items, words) {
  const list = items
    .map((i) => (i.start && i.end ? words.cylinder : words.cylinderGas).replace('{gas}', i.gas).replace('{start}', i.start).replace('{end}', i.end))
    .join(words.join);
  return words.group.replace('{list}', list);
}

/**
 * The accessible name of the Equipment card: "Equipment: dry suit, weights 35
 * lb. Show details" (the suit only when there is one).
 * @param {{ suit: string, weight: string, computer?: string, open: boolean, opens?: boolean }} state
 * @param {{ both: string, weightOnly: string, suitOnly: string, show: string, hide: string, computer?: string, computerOnly?: string }} words
 *   both: "Equipment: {suit}, weights {weight}"; weightOnly: "Equipment: weights {weight}";
 *   suitOnly: "Equipment: {suit}"; show / hide: the action appended ("Show details");
 *   computer: ", computer {name}" appended; computerOnly: "Equipment: computer {name}"
 */
export function equipmentLabel({ suit, weight, computer = '', open, opens = true }, words) {
  let base;
  if (!suit && !weight && computer) base = (words.computerOnly ?? '').replace('{name}', computer);
  else {
    base = (suit && weight ? words.both : weight ? words.weightOnly : words.suitOnly).replace('{suit}', suit).replace('{weight}', weight);
    if (computer) base += (words.computer ?? '').replace('{name}', computer);
  }
  return opens ? `${base}. ${open ? words.hide : words.show}` : base;
}

/**
 * Whether a cylinder of a dive is listed (task 2026-11-12-56): all of them
 * with "Afficher les bouteilles inutilisées" on, otherwise the core's rule
 * (`used`: pressure drop, gas switch to it, CCR oxygen).
 * @param {{ used: boolean }} cylinder
 * @param {boolean} includeUnused
 */
export const cylinderListed = (cylinder, includeUnused) => includeUnused || cylinder.used;

/**
 * How a listed cylinder that was not used shows (task 2026-11-12-56): drawn
 * full, without the pale band or the end line, its pressure line "Non
 * utilisée" without pressures, or the one pressure when start equals end.
 * Null for a cylinder that was used (the core's rule) or whose pressure drops.
 * @param {{ used: boolean, startMbar: number, endMbar: number }} cylinder
 * @returns {null|{ pressureMbar: number }}
 */
export function unusedShown(cylinder) {
  const { used, startMbar, endMbar } = cylinder;
  if (used || (startMbar > 0 && endMbar > 0 && startMbar > endMbar)) return null;
  return { pressureMbar: startMbar > 0 ? startMbar : endMbar > 0 ? endMbar : 0 };
}

/**
 * Whether opening the Equipment card shows something more than the total
 * (Christian, 12 November 2026: no chevron when it would change nothing):
 * several weights, one whose location is known, or several dive computers
 * (task 2026-11-12-60: the open card lists them all).
 * @param {{ description?: string }[]} weights the weights that are set
 * @param {number} [computers] how many dive computers the dive has
 */
export const equipmentOpens = (weights, computers = 0) =>
  weights.length > 1 || (weights.length === 1 && !!weights[0].description && weights[0].description !== 'unknown') || computers > 1;
