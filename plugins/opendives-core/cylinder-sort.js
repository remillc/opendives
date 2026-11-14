// @ts-check
// The cylinder types sorted for the screen, in JavaScript (AGENTS.md, « JavaScript first »):
// by name, ignoring the case of A-Z, ties in the core's order, as Subsurface's TankInfoModel
// shows its table (the façade sorted it with std::stable_sort until 14 November 2026).

/**
 * The name with A-Z in lower case, other characters as they are (C's tolower, as the façade did).
 * @param {string} name
 * @returns {string}
 */
const folded = (name) => name.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * The types sorted by name, ignoring case; a stable sort keeps equal names in the core's order.
 * @template {{ name: string }} T
 * @param {T[]} types
 * @returns {T[]} a new array
 */
export function sortCylinderTypes(types) {
  return [...types].sort((a, b) => {
    const x = folded(a.name);
    const y = folded(b.name);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
