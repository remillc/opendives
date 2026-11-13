// @ts-check
// Pure logic of the rebreather drawing in the "Gas" section of a closed-circuit
// dive (components/RebreatherDrawing.svelte, task 2026-11-12-78): which
// cylinder goes in the unit and which is drawn beside it, and the accessible
// name of the card.

/**
 * The drawing's layout, in its own units (1 unit = 1 px at its full 140 height):
 * the unit takes 218, split at its centre into the diluent's and the oxygen's
 * text columns; each cylinder beside it takes REBREATHER_COLUMN, centred on it.
 */
export const REBREATHER_UNIT = 218;
export const REBREATHER_COLUMN = 108;

/** The drawing's width with `others` cylinders beside the unit. @param {number} others */
export const rebreatherWidth = (others) => REBREATHER_UNIT + REBREATHER_COLUMN * others;

/**
 * The text columns under the drawing, as CSS grid tracks: the two halves of the
 * unit, then one track per cylinder beside it ("109fr 109fr 108fr").
 * @param {number} others
 */
export const rebreatherTracks = (others) => `${REBREATHER_UNIT / 2}fr ${REBREATHER_UNIT / 2}fr${` ${REBREATHER_COLUMN}fr`.repeat(others)}`;

/**
 * The item shown in each text column, in the order of rebreatherTracks: the
 * diluent, the oxygen, then the cylinders beside the unit; -1 leaves a column
 * empty (no such cylinder, or the oxygen is the diluent).
 * @param {{ diluent: number, oxygen: number, others: number[] }} layout
 */
export const rebreatherCells = (layout) => [layout.diluent, layout.oxygen === layout.diluent ? -1 : layout.oxygen, ...layout.others];

/**
 * Split the cylinders of a CCR dive by their use. The first "diluent" goes on
 * the left of the unit, the first "oxygen" on the right; every other cylinder
 * (bailout, stages, a second diluent or oxygen) is drawn beside the unit, in
 * their original order. Returns indices into the given list.
 * @param {{ use?: string }[]} cylinders
 * @returns {{ diluent: number, oxygen: number, others: number[] }} -1 when the dive has none of that kind
 */
export function rebreatherLayout(cylinders) {
  const diluent = cylinders.findIndex((c) => c.use === 'diluent');
  const oxygen = cylinders.findIndex((c) => c.use === 'oxygen');
  /** @type {number[]} */
  const others = [];
  cylinders.forEach((_, i) => {
    if (i !== diluent && i !== oxygen) others.push(i);
  });
  return { diluent, oxygen, others };
}

/**
 * The accessible name of the editing screen's gas card in rebreather mode (task
 * 2026-11-13-86): "Gas: rebreather with diluent Trimix 16/45 and oxygen, bailout:
 * air. Open the details". A part is left out when the dive has no such cylinder.
 * @param {{ gas: string }[]} items every cylinder, in the dive's order
 * @param {{ diluent: number, oxygen: number, others: number[] }} layout
 * @param {{ card: string, diluent: string, oxygen: string, and: string, bailout: string, join: string }} words
 *   card: "Gas: rebreather with {list}. Open the details"; diluent: "diluent {gas}";
 *   oxygen: "oxygen"; and: " and "; bailout: "bailout: {list}"; join: ", "
 */
export function rebreatherSummaryLabel(items, layout, words) {
  const unit = [];
  if (layout.diluent >= 0) unit.push(words.diluent.replace('{gas}', items[layout.diluent].gas));
  if (layout.oxygen >= 0) unit.push(words.oxygen);
  const parts = unit.length ? [unit.join(words.and)] : [];
  if (layout.others.length) parts.push(words.bailout.replace('{list}', layout.others.map((i) => items[i].gas.toLocaleLowerCase()).join(words.join)));
  return words.card.replace('{list}', parts.join(words.join));
}

/**
 * The accessible name: "Rebreather gas: diluent Trimix 16/45 from 2 683 to
 * 1 885 psi, oxygen from 2 756 to 1 885 psi. Bailout: air from 3 002 to 2 901
 * psi". A part is left out when the dive has no such cylinder.
 * @param {{ gas: string, start: string, end: string, noPressure?: boolean }[]} items every cylinder, in the dive's order
 * @param {{ diluent: number, oxygen: number, others: number[] }} layout
 * @param {{ group: string, diluent: string, oxygen: string, bailout: string, cylinder: string, cylinderGas: string, range: string, join: string, noPressure?: string }} words
 *   group: "Rebreather gas: {list}"; diluent: "diluent {cylinder}"; oxygen: "oxygen {cylinder}";
 *   bailout: "Bailout: {list}"; cylinder: "{gas} from {start} to {end}"; cylinderGas: "{gas}";
 *   range: "from {start} to {end}"; join: ", "; noPressure: "No pressure data" (task 2026-11-13-84):
 *   when no cylinder has pressures it ends the name as a sentence; when only some lack them,
 *   it follows each of those, lower-cased ("oxygen, no pressure data").
 */
export function rebreatherLabel(items, layout, words) {
  const used = [layout.diluent, layout.oxygen, ...layout.others].filter((i) => i >= 0).map((i) => items[i]);
  const none = used.length > 0 && used.every((i) => i.noPressure);
  /** @param {{ gas: string, start: string, end: string, noPressure?: boolean }} i @param {boolean} withGas */
  const phrase = (i, withGas) => {
    const both = i.start && i.end;
    const template = withGas ? (both ? words.cylinder : words.cylinderGas) : both ? words.range : '';
    return template.replace('{gas}', i.gas).replace('{start}', i.start).replace('{end}', i.end);
  };
  /** @param {string} text @param {{ noPressure?: boolean }} i */
  const noted = (text, i) => (i.noPressure && !none && words.noPressure ? `${text}${words.join}${words.noPressure.toLocaleLowerCase()}` : text);
  const unit = [];
  if (layout.diluent >= 0) unit.push(noted(words.diluent.replace('{cylinder}', phrase(items[layout.diluent], true)).trim(), items[layout.diluent]));
  if (layout.oxygen >= 0) unit.push(noted(words.oxygen.replace('{cylinder}', phrase(items[layout.oxygen], false)).trim(), items[layout.oxygen]));
  let label = words.group.replace('{list}', unit.join(words.join));
  if (layout.others.length) label += `. ${words.bailout.replace('{list}', layout.others.map((i) => noted(phrase(items[i], true), items[i])).join(words.join))}`;
  if (none && words.noPressure) label += `. ${words.noPressure}`;
  return label;
}
