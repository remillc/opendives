// @ts-check
// Taps that survive a sliding fingertip. The WebView sends no click once the
// finger has moved past its own small slop (about 8 px on Android tablets), as
// it takes the touch for a scroll; a navigation entry then did nothing, now
// and then. With this action, a touch lifted less than TAP_SLOP px from where
// it started, on a link or button, is a tap: the browser's own click goes
// through when it comes, and when it does not come, the action clicks the
// element itself, a moment later.

/** How far a finger may slide during a tap, in px (also Framework7's threshold, App.svelte). */
export const TAP_SLOP = 12;

/** How long to wait for the browser's own click before giving it, in ms. */
const CLICK_WAIT_MS = 300;

/**
 * Svelte action for a container of links and buttons.
 * @param {HTMLElement} node
 */
export function tolerantTaps(node) {
  // Touch events, not pointer events: once the WebView takes the touch for a
  // scroll it cancels the pointer (no pointerup), but touchend still comes.
  /** @type {null|{ id: number, x: number, y: number, origin: Element }} */
  let touch = null;
  /** The element first touched, for a tap whose click has not come yet. */
  /** @type {Element|null} */
  let pending = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  /** When the action last clicked by itself: a late click of the browser is then dropped. */
  let clickedAt = -Infinity;

  /** @param {TouchEvent} e */
  function down(e) {
    const first = e.changedTouches[0];
    const origin = /** @type {Element} */ (e.target);
    const link = e.touches.length === 1 ? origin.closest('a, button') : null;
    touch = link && node.contains(link) ? { id: first.identifier, x: first.clientX, y: first.clientY, origin } : null;
  }

  /** @param {TouchEvent} e */
  function up(e) {
    const start = touch;
    touch = null;
    const end = start && [...e.changedTouches].find((t) => t.identifier === start.id);
    if (!start || !end || Math.hypot(end.clientX - start.x, end.clientY - start.y) > TAP_SLOP) return;
    pending = start.origin;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const origin = pending;
      pending = null;
      if (!origin?.isConnected) return;
      clickedAt = performance.now();
      // On the element first touched: Framework7 drops a click on any other
      // element until the touch's own click has come (and here it never does).
      origin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }, CLICK_WAIT_MS);
  }

  /** @param {MouseEvent} e */
  function click(e) {
    if (!e.isTrusted) return;
    if (pending) {
      // The browser's own click came: it is the tap.
      pending = null;
      clearTimeout(timer);
    } else if (performance.now() - clickedAt < 800) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  const forget = () => (touch = null);
  node.addEventListener('touchstart', down, { passive: true });
  node.addEventListener('touchend', up, { passive: true });
  node.addEventListener('touchcancel', forget, { passive: true });
  node.addEventListener('click', click, true);
  return {
    destroy() {
      clearTimeout(timer);
      node.removeEventListener('touchstart', down);
      node.removeEventListener('touchend', up);
      node.removeEventListener('touchcancel', forget);
      node.removeEventListener('click', click, true);
    },
  };
}
