// @ts-check
// Material 3 Expressive motion springs as CSS easings: a damped spring
// (stiffness, damping ratio, unit mass) sampled into `linear()`, with the time
// it takes to settle, so the CSS transition follows the same curve as the
// Material library's spring specs.

/**
 * @param {number} stiffness
 * @param {number} damping damping ratio
 * @returns {{ css: string, ms: number }} a `linear()` easing and the duration to give the transition
 */
export function springEasing(stiffness, damping) {
  const w0 = Math.sqrt(stiffness);
  /** Position from 0 to 1 at time t (s), released at rest. @param {number} t */
  const at = (t) => {
    if (damping < 1) {
      const wd = w0 * Math.sqrt(1 - damping * damping);
      return 1 - Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + ((damping * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  // Settled once it stays within 0.1 % of the target.
  let end = 0.01;
  while (end < 3 && Math.abs(1 - at(end)) > 0.001) end += 0.005;
  const steps = 24;
  const points = [];
  for (let i = 0; i <= steps; i++) points.push(+at((end * i) / steps).toFixed(4));
  points[steps] = 1;
  return { css: `linear(${points.join(', ')})`, ms: Math.round(end * 1000) };
}
