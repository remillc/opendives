// @ts-check
// "Remove animations" (Android) and "Reduce Motion" (iOS) reach the web view
// as prefers-reduced-motion.

/** @returns {boolean} */
export function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Calls `fn` now and whenever the preference changes.
 * @param {(reduced: boolean) => void} fn
 * @returns {() => void} stops listening
 */
export function watchReducedMotion(fn) {
  fn(reducedMotion());
  if (typeof matchMedia !== 'function') return () => {};
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const listener = () => fn(query.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
