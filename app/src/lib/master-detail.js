// @ts-check
// Helpers for the master pages of the tablet list-and-detail layouts
// (Statistics, Tools; the Logbook has its own copy in Logbook.svelte).

/**
 * A master route of a master-detail view is not rendered as the view's first
 * page by framework7-svelte but loaded through the router, and Framework7
 * then appends it after the end anchor of the view's page list; the pages
 * Svelte renders later would then be moved out of Svelte's reach (a frozen
 * page after going back). Put back before the anchor, the master is followed
 * by the pages Svelte adds. Same fix as the Logbook's.
 * @param {any} page Framework7's page
 */
export function keepInSvelteRange(page) {
  /** @type {HTMLElement} */
  const el = page.el;
  let anchor = el.previousSibling;
  while (anchor && anchor.nodeType === Node.TEXT_NODE) anchor = anchor.previousSibling;
  if (anchor && anchor.nodeType === Node.COMMENT_NODE && el.nextSibling === null) el.parentNode?.insertBefore(el, anchor);
}
