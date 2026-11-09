// @ts-check
// The gas a plan from a logbook dive starts on.

/**
 * The cylinder the bottom of the plan is breathed from: the first open-circuit
 * gas used. A rebreather dive that never left the loop has none: its diluent,
 * never its oxygen, which cannot be breathed at depth; null if nothing else.
 * @template {{ used: boolean, use: string }} C
 * @param {C[]} cylinders
 * @returns {C|null}
 */
export function bottomCylinder(cylinders) {
  const breathed = cylinders.find((c) => c.used && c.use === 'OC-gas');
  if (breathed) return breathed;
  const usable = cylinders.filter((c) => c.use !== 'oxygen' && c.use !== 'not used');
  return usable.find((c) => c.used && c.use === 'diluent') ?? usable.find((c) => c.use === 'diluent') ?? usable.find((c) => c.used) ?? usable[0] ?? null;
}
