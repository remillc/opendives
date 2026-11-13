// @ts-check
// Pure logic of the rebreather drawing in the "Gas" section of a closed-circuit
// dive (components/RebreatherDrawing.svelte, task 2026-11-12-78): which
// cylinder goes in the unit and which is drawn beside it, and the accessible
// name of the card.

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
