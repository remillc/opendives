// @ts-check
// Water column (docs/specification-interface.md, section 4): vertical gradient
// from the top water color to a mix of the top and bottom water colors, in the
// ratio max depth / 60 m, capped at 1. The same scale applies to every dive.

const DARKEST_DEPTH_MM = 60000;

/**
 * Color of the bottom of the water column, as CSS (no hard-coded value).
 * @param {number} maxDepthMm
 */
export function waterBottomColor(maxDepthMm) {
  const ratio = Math.min(1, Math.max(0, maxDepthMm / DARKEST_DEPTH_MM));
  const percent = Math.round(ratio * 1000) / 10;
  return `color-mix(in srgb, var(--od-pine) ${percent}%, var(--od-pine-light))`;
}
