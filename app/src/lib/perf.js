// @ts-check
// Start-up timeline: marks are written to the log (tag Capacitor/Console) as
// milliseconds since the WebView navigation started. Development aid: only
// when VITE_SHOW_PERF=1 (app/.env.local, not in git).

const on = /** @type {any} */ (import.meta).env?.VITE_SHOW_PERF === '1';

/** @param {string} name */
export function mark(name) {
  if (on) console.log(`[perf] ${name} ${Math.round(performance.now())}`);
}

/** Paint entries of the WebView, once. */
export function observePaints() {
  if (!on) return;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) console.log(`[perf] ${e.name} ${Math.round(e.startTime)}`);
    }).observe({ type: 'paint', buffered: true });
  } catch {
    // Not available: only the marks are logged.
  }
}
