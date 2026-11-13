// @ts-check
// TRIAL (inbox task 2026-11-13-108): a paper grain over the header bands, to judge on a
// phone. On by default; the switch at the end of Réglages turns it off. To remove the trial:
// delete this file, its import in main.js, the switch in Settings.svelte, the
// `settings.paperGrain*` texts, the `--od-band-grain` token in theme.css and the
// `var(--od-band-grain)` layers of the bands.

const KEY = 'od.paperGrain';

function read() {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

export const paperGrain = $state({ on: read() });

/** The class that removes the grain layer: `html.od-no-paper-grain`. */
function apply() {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('od-no-paper-grain', !paperGrain.on);
}

/** @param {boolean} on */
export function setPaperGrain(on) {
  paperGrain.on = on;
  try {
    localStorage.setItem(KEY, String(on));
  } catch {
    // Not fatal: the choice lasts until the app closes.
  }
  apply();
}

apply();
