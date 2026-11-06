// @ts-check
// Launch screen: once the WebView has painted the first content (text), the
// native launch screen (splash) can go. Android only; elsewhere the call
// does nothing. The paint entry, not a frame callback, is the proof that
// pixels are on screen: before it the WebView shows the empty shell.
import { OpenDivesCore } from 'opendives-core';
import { mark } from './perf.js';

/** Tells the native side to remove the launch screen, once the first content is painted. */
export function releaseLaunchScreen() {
  const release = () => {
    mark('launchScreenReleased');
    try {
      OpenDivesCore.contentShown().catch(() => {});
    } catch {
      // No native layer (browser): nothing to tell.
    }
  };
  try {
    const observer = new PerformanceObserver((list) => {
      if (list.getEntries().some((e) => e.name === 'first-contentful-paint')) {
        observer.disconnect();
        release();
      }
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch {
    release();
  }
}
