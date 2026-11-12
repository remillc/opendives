// @ts-check
// Pure logic of the Settings row menu (components/RowMenu.svelte).
import { opensUp } from './select-menu.js';

/** Menu width in dp, and the margin kept to the screen's edges. */
export const MENU_WIDTH = 280;
export const SCREEN_MARGIN = 16;
/** Gap between the row and the menu. */
export const ROW_GAP = 4;

/**
 * Height of the menu: 8 dp padding above and below, 48 dp per option, 56 dp
 * when the option has a help line.
 * @param {{ example?: string }[]} options
 */
export const menuHeight = (options) => 16 + options.reduce((sum, o) => sum + (o.example ? 56 : 48), 0);

/**
 * Where the menu goes: right-aligned with the row's card, 280 dp wide (never
 * wider than the screen minus the margins), under the row, or above it when
 * the room below is too small and the room above is larger.
 * @param {{ top: number, bottom: number, right: number }} row the row's rectangle
 * @param {{ width: number, height: number }} viewport
 * @param {number} height the menu's natural height
 * @returns {{ left: number, width: number, up: boolean, top?: number, bottom?: number, maxHeight: number }}
 */
export function placeRowMenu(row, viewport, height) {
  const width = Math.min(MENU_WIDTH, viewport.width - 2 * SCREEN_MARGIN);
  const left = Math.max(SCREEN_MARGIN, Math.min(row.right, viewport.width - SCREEN_MARGIN) - width);
  const below = viewport.height - row.bottom - SCREEN_MARGIN;
  const above = row.top - SCREEN_MARGIN;
  const up = opensUp(below, above, height);
  const room = up ? above : below;
  const maxHeight = Math.max(120, room - ROW_GAP);
  return up
    ? { left, width, up, bottom: viewport.height - row.top + ROW_GAP, maxHeight }
    : { left, width, up, top: row.bottom + ROW_GAP, maxHeight };
}
