<script>
  // @ts-check
  // <LoadingIndicator> (docs/system-design.md, section 8): the Material 3
  // Expressive loading indicator, uncontained: a shape that morphs between
  // rounded polygons while it turns, filled with the water gradient. It
  // replaces the circular spinners on Android. With "Remove animations" it is
  // one static shape. Geometry: lib/progress-geometry.js.
  import { onMount } from 'svelte';
  import { morphPath, loadingState } from '../lib/progress-geometry.js';
  import { watchReducedMotion } from '../lib/reduced-motion.js';

  /**
   * @type {{ size?: number, label: string, class?: string }}
   * `size`: width and height in dp. `label`: what TalkBack reads (role
   * status); "" when the text beside it already says it (hidden then).
   */
  let { size = 24, label, class: extraClass = '' } = $props();

  const uid = Math.random().toString(36).slice(2, 8);
  let state = $state({ from: 0, to: 0, progress: 0, rotation: 0 });

  const d = $derived(morphPath(state.from, state.to, state.progress, state.rotation, 0.96));

  onMount(() => {
    let frame = 0;
    const stop = watchReducedMotion((reduced) => {
      cancelAnimationFrame(frame);
      if (reduced) {
        state = { from: 0, to: 0, progress: 0, rotation: 0 };
        return;
      }
      const start = performance.now();
      const tick = (/** @type {number} */ now) => {
        state = loadingState(now - start);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    return () => {
      stop();
      cancelAnimationFrame(frame);
    };
  });
</script>

<span class="od-loading-indicator {extraClass}" role={label ? 'status' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'} style:width="{size}px" style:height="{size}px">
  <svg viewBox="-1 -1 2 2" width={size} height={size} aria-hidden="true">
    <defs>
      <linearGradient id="od-loading-{uid}" x1="0" y1="-1" x2="0" y2="1" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="var(--od-loading-indicator-top)" />
        <stop offset="1" stop-color="var(--od-loading-indicator-bottom)" />
      </linearGradient>
    </defs>
    <path {d} fill="url(#od-loading-{uid})" />
  </svg>
</span>

<style>
  @layer od.components {
    .od-loading-indicator {
      display: inline-flex;
      flex: none;
      line-height: 0;

      svg {
        display: block;
      }
    }
  }
</style>
