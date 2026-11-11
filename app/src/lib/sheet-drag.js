// @ts-check
// Closing a bottom sheet by dragging its handle down (M3 bottom sheet): it
// closes when pulled past a third of its height or 96 px, whichever is less,
// or when flung down fast; otherwise it springs back.

/**
 * @param {number} dy how far down the sheet was dragged, px (up is negative)
 * @param {number} velocity speed at release, px/ms (down is positive)
 * @param {number} height the sheet's height, px
 */
export function dismissesSheet(dy, velocity, height) {
  if (dy <= 0) return false;
  return dy >= Math.min(96, height / 3) || velocity >= 0.5;
}

/** The sheet follows the finger downwards only; upwards it barely moves. @param {number} dy */
export const sheetOffset = (dy) => (dy > 0 ? dy : dy / 8);
