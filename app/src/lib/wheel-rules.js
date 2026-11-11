// @ts-check
// The pure rules of a wheel field (<WheelField>): the steps of a range, where a
// value sits between them, what a turn does. No import, so that tests/app/ can
// run them without a browser.

/** A value is "on a step" when it is within this share of a step of one. */
export const ON_STEP_TOLERANCE = 0.02;

/** Decimals needed to write a step: 0.01 gives 2, 0.5 gives 1, 5 gives 0. @param {number} step */
export function decimalsOf(step) {
  let d = 0;
  while (d < 6 && Math.abs(Math.round(step * 10 ** d) / 10 ** d - step) > 1e-9) d++;
  return d;
}

/** Rounds away floating-point noise (0.1 + 0.2). @param {number} value @param {number} step */
const tidy = (value, step) => {
  const d = decimalsOf(step);
  return Math.round(value * 10 ** d) / 10 ** d;
};

/** The step closest to a value, as a fractional index from `min`. @param {number} value @param {number} min @param {number} step */
const position = (value, min, step) => (value - min) / step;

/**
 * Whether a value is one of the steps min, min + step, ... (within a small
 * tolerance: a SAC kept in millilitres comes back a hair off).
 * @param {number} value @param {number} min @param {number} step
 */
export function isOnStep(value, min, step) {
  const p = position(value, min, step);
  return Math.abs(p - Math.round(p)) <= ON_STEP_TOLERANCE;
}

/**
 * The value a turn gives: from a step, the next step in that direction; from
 * a value between two steps, the nearest step in that direction. Kept in
 * [min, max]; null when the turn goes nowhere (already at the end).
 * @param {number} value
 * @param {1|-1} direction
 * @param {number} min @param {number} max @param {number} step
 * @returns {number|null}
 */
export function turn(value, direction, min, max, step) {
  const p = position(value, min, step);
  const onStep = Math.abs(p - Math.round(p)) <= ON_STEP_TOLERANCE;
  let index;
  if (onStep) index = Math.round(p) + direction;
  else index = direction > 0 ? Math.ceil(p) : Math.floor(p);
  const last = Math.round((max - min) / step);
  index = Math.max(0, Math.min(last, index));
  const next = tidy(min + index * step, step);
  if (onStep ? next === tidy(min + Math.round(p) * step, step) : false) return null;
  if (!onStep && Math.abs(next - value) < 1e-9) return null;
  return next;
}

/**
 * The values shown above and below the current one: the steps around it, null
 * past the ends. From a value between steps, the step below and the step above.
 * @param {number} value
 * @param {number} min @param {number} max @param {number} step
 * @returns {{ before: number|null, after: number|null }}
 */
export function neighbours(value, min, max, step) {
  const before = turn(value, -1, min, max, step);
  const after = turn(value, 1, min, max, step);
  return { before: before !== null && before < value ? before : null, after: after !== null && after > value ? after : null };
}

/** A value kept in [min, max]. @param {number} value @param {number} min @param {number} max */
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Steps made by a drag of `dy` pixels (positive: down) at `rowPx` pixels a
 * step; dragging down brings the previous values, so the value decreases.
 * @param {number} dy @param {number} rowPx
 */
export const stepsOfDrag = (dy, rowPx) => 0 - Math.trunc(dy / rowPx);

/**
 * Extra steps of a fling: the release speed in px/ms (positive: down) carries
 * on a little, 1 step per 0.6 px/ms beyond 0.5 px/ms, at most 12.
 * @param {number} velocity
 */
export function flingSteps(velocity) {
  const v = Math.abs(velocity);
  if (v < 0.5) return 0;
  const n = Math.min(12, Math.round(v / 0.6) * 2);
  return velocity > 0 ? -n : n;
}
