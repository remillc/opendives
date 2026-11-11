// @ts-check
// Pure logic of the "Gas" group of "Edit dive" (components/GasSummary.svelte,
// CylinderSheet.svelte, CylinderDeleteDialog.svelte): how full a drawn
// cylinder is, the gas changes that use a cylinder, what deleting one means,
// and the line under the gas in the delete confirmation.

/**
 * How much of the drawn cylinder is filled: the end pressure relative to the
 * working pressure, clamped to 0..1. Without a working pressure the start
 * pressure stands in for it; 0 when the end pressure or both are unknown.
 * @param {number} endMbar
 * @param {number} workingPressureMbar
 * @param {number} [startMbar]
 */
export function fillRatio(endMbar, workingPressureMbar, startMbar = 0) {
  const full = workingPressureMbar > 0 ? workingPressureMbar : startMbar > 0 ? startMbar : 0;
  if (!(endMbar > 0) || !(full > 0)) return 0;
  return Math.min(1, Math.max(0, endMbar / full));
}

/**
 * The moments of the dive at which the diver switches to a cylinder: the gas
 * changes after the start that go to it (the start gas is not a moment).
 * @param {{ type: string, timeSeconds: number, cylinder: number }[]} events the dive's events
 * @param {number} index the cylinder's index in the dive (below 0: not in the dive yet)
 */
export function gasChangeMoments(events, index) {
  if (index < 0) return 0;
  return events.filter((e) => e.type === 'gaschange' && e.cylinder === index && e.timeSeconds > 0).length;
}

/**
 * What deleting a cylinder does. The core refuses to remove a cylinder the
 * profile uses (`protected`, CYLINDER_IN_USE), so nothing destructive is offered
 * for it; otherwise the gas changes that go to it would disappear from the
 * profile, which the dialog says; otherwise it is a plain removal.
 * @param {{ protected: boolean, moments: number }} cylinder
 * @returns {'refused'|'moments'|'plain'}
 */
export function deletionOutcome({ protected: isProtected, moments }) {
  if (isProtected) return 'refused';
  return moments > 0 ? 'moments' : 'plain';
}

/**
 * The line under the gas in the delete confirmation: the cylinder type and its
 * size ("Dil2, 16 cuft HP"); the use when the cylinder has no type.
 * @param {string} typeName
 * @param {string} sizeHelper
 * @param {string} useLabel
 */
export function typeLine(typeName, sizeHelper, useLabel) {
  return [typeName || useLabel, sizeHelper].filter(Boolean).join(', ');
}
