// @ts-check
// A horizontal swipe that follows the finger: once the finger has moved more
// sideways than up or down, the vertical scroll is held and `move` receives
// the distance at each step; `end` receives the distance and the speed when
// the finger is lifted (0 when the system cancels the touch).

/**
 * @param {EventTarget} target where the touches are listened to
 * @param {{
 *   accept: (e: TouchEvent) => boolean,
 *   move: (dx: number) => void,
 *   end: (dx: number, velocity: number) => void,
 * }} handlers `velocity` in px/ms, negative towards the left
 */
export function horizontalSwipe(target, { accept, move, end }) {
  /** idle: not followed; pending: direction not known yet; h: sideways; v: vertical scroll. */
  let state = 'idle';
  let x0 = 0;
  let y0 = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let dx = 0;

  target.addEventListener(
    'touchstart',
    (event) => {
      const e = /** @type {TouchEvent} */ (event);
      if (e.touches.length !== 1 || !accept(e)) {
        state = 'idle';
        return;
      }
      x0 = lastX = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
      dx = 0;
      state = 'pending';
    },
    { passive: true },
  );

  target.addEventListener(
    'touchmove',
    (event) => {
      const e = /** @type {TouchEvent} */ (event);
      if (state === 'idle' || state === 'v') return;
      const touch = e.touches[0];
      dx = touch.clientX - x0;
      const dy = touch.clientY - y0;
      if (state === 'pending') {
        // Decided early, and a slightly slanted move still counts as sideways.
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        state = Math.abs(dx) > Math.abs(dy) * 0.8 ? 'h' : 'v';
        if (state === 'v') return;
      }
      e.preventDefault();
      // Speed over the last moves, smoothed: one late event does not hide a flick.
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = velocity * 0.4 + ((touch.clientX - lastX) / dt) * 0.6;
      lastX = touch.clientX;
      lastT = e.timeStamp;
      move(dx);
    },
    { passive: false },
  );

  target.addEventListener('touchend', () => {
    const was = state;
    state = 'idle';
    if (was === 'h') end(dx, velocity);
  });

  target.addEventListener('touchcancel', () => {
    const was = state;
    state = 'idle';
    if (was === 'h') end(0, 0);
  });
}

/**
 * Whether a swipe of `dx` px at `velocity` px/ms goes through: a fifth of the
 * width, or a quick flick in the same direction.
 * @param {number} dx
 * @param {number} velocity
 * @param {number} width
 */
export function swipeGoesThrough(dx, velocity, width) {
  return Math.abs(dx) > width / 5 || (Math.abs(velocity) > 0.25 && Math.sign(velocity) === Math.sign(dx) && Math.abs(dx) > 16);
}
