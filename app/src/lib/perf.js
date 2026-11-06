// @ts-check
// Start-up timeline: marks are written to the log (tag Capacitor/Console) as
// milliseconds since the WebView navigation started.

/** @param {string} name */
export function mark(name) {
  console.log(`[perf] ${name} ${Math.round(performance.now())}`);
}

/** Paint entries of the WebView, once. */
export function observePaints() {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) console.log(`[perf] ${e.name} ${Math.round(e.startTime)}`);
    }).observe({ type: 'paint', buffered: true });
  } catch {
    // Not available: only the marks are logged.
  }
}
