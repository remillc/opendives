// @ts-check
// Material 3 Expressive motion springs as CSS easings: a damped spring
// (stiffness, damping ratio, unit mass) sampled into `linear()`, with the time
// it takes to settle, so the CSS transition follows the same curve as the
// Material library's spring specs. A spring can start moving (`velocity`): a
// screen released by the finger then goes on at the finger's speed.

/**
 * @param {number} stiffness
 * @param {number} damping damping ratio
 * @param {number} [tolerance] distance from the target under which the spring counts as settled
 * @param {number} [steps] number of segments of the `linear()` curve
 * @param {number} [velocity] speed at the start, in distances to the target per second
 *   (negative: away from the target)
 * @returns {{ css: string, ms: number }} a `linear()` easing and the duration to give the transition
 */
export function springEasing(stiffness, damping, tolerance = 0.001, steps = 24, velocity = 0) {
  const w0 = Math.sqrt(stiffness);
  /** Position from 0 to 1 at time t (s), released at `velocity`. @param {number} t */
  const at = (t) => {
    if (damping < 1) {
      const wd = w0 * Math.sqrt(1 - damping * damping);
      return 1 - Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + ((damping * w0 - velocity) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + (w0 - velocity) * t);
  };
  // Settled once it is within the tolerance of the target (0.1 % by default).
  // Underdamped springs cross the tolerance band on the way up, then overshoot:
  // the settle time is the last moment outside the band.
  let end = 0.01;
  for (let t = 0.01; t < 3; t += 0.005) if (Math.abs(1 - at(t)) > tolerance) end = t + 0.005;
  const points = [];
  for (let i = 0; i <= steps; i++) points.push(+at((end * i) / steps).toFixed(4));
  points[steps] = 1;
  return { css: `linear(${points.join(', ')})`, ms: Math.round(end * 1000) };
}
