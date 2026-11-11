// @ts-check
// Material 3 Expressive motion scheme for Android: the spring tokens of the
// Material library, sampled into CSS `linear()` easings (see spring.js) and
// exposed as --od-motion-* custom properties on <html> (docs/system-design.md,
// section 8, "Motion").
//
// Spatial springs (position, size, scale) may overshoot; effects springs
// (opacity, colour) never do. "Anchored" is OpenDives' own variant for
// surfaces fixed to a screen edge (drawer, sheets, popups): the spatial
// stiffness with a damping ratio of 1, so they never leave the edge.

import { springEasing } from './spring.js';

/**
 * Stiffness and damping ratio of each token.
 * @type {Record<string, { stiffness: number, damping: number }>}
 */
export const SPRINGS = {
  'spatial-fast': { stiffness: 800, damping: 0.6 },
  'spatial-default': { stiffness: 380, damping: 0.8 },
  'spatial-slow': { stiffness: 200, damping: 0.8 },
  'effects-fast': { stiffness: 3800, damping: 1 },
  'effects-default': { stiffness: 1600, damping: 1 },
  'effects-slow': { stiffness: 800, damping: 1 },
  'anchored-fast': { stiffness: 800, damping: 1 },
  'anchored-default': { stiffness: 380, damping: 1 },
};

/** Settled within 0.5 % of the target: keeps the tail of the spring short. */
const TOLERANCE = 0.005;
const STEPS = 32;

/**
 * @param {string} name a key of SPRINGS
 * @returns {{ css: string, ms: number }} the `linear()` easing and its duration
 */
export function motionSpring(name) {
  const spring = SPRINGS[name];
  if (!spring) throw new Error(`Unknown motion token: ${name}`);
  return springEasing(spring.stiffness, spring.damping, TOLERANCE, STEPS);
}

/**
 * The custom properties: --od-motion-<name> (easing) and --od-motion-<name>-ms
 * (duration).
 * @returns {Record<string, string>}
 */
export function motionVariables() {
  /** @type {Record<string, string>} */
  const vars = {};
  for (const name of Object.keys(SPRINGS)) {
    const { css, ms } = motionSpring(name);
    vars[`--od-motion-${name}`] = css;
    vars[`--od-motion-${name}-ms`] = `${ms}ms`;
  }
  return vars;
}

/**
 * Declares the tokens on the root element, on Android only (Framework7's `md`
 * class). iOS keeps Framework7's own curves.
 * @param {HTMLElement} [root]
 */
export function applyMotionTokens(root = document.documentElement) {
  if (!root.classList.contains('md')) return;
  for (const [name, value] of Object.entries(motionVariables())) root.style.setProperty(name, value);
}
