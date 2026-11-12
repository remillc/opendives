<script>
  // @ts-check
  // <LinearWavyProgress> (docs/system-design.md, section 8): the Material 3
  // Expressive wavy linear progress indicator, for the Android operations
  // (download, import, sign-in). Determinate: a wave for the done part, a
  // 4 dp gap, the flat track and a stop dot; indeterminate: moving wave
  // segments. Geometry: lib/progress-geometry.js. With "Remove animations"
  // the wave stands still and the indeterminate one is a static half wave.
  import { onMount } from 'svelte';
  import { WAVY, determinatePieces, indeterminatePieces, piecePath } from '../lib/progress-geometry.js';
  import { watchReducedMotion } from '../lib/reduced-motion.js';

  /**
   * @type {{
   *   value?: number,
   *   indeterminate?: boolean,
   *   label: string,
   *   class?: string,
   * }}
   * `value`: 0..1, when the progress is known. `label`: what TalkBack reads.
   */
  let { value = 0, indeterminate = false, label, class: extraClass = '' } = $props();

  let width = $state(0);
  let phase = $state(0);
  let cycle = $state(0.5);
  let reduced = $state(false);

  const wavelength = $derived(indeterminate ? WAVY.wavelengthIndeterminate : WAVY.wavelengthDeterminate);
  const pieces = $derived(width > 0 ? (indeterminate ? indeterminatePieces(width, cycle) : determinatePieces(width, value)) : []);
  const centerY = WAVY.height / 2;
  const percent = $derived(Math.round(Math.min(1, Math.max(0, value)) * 100));

  onMount(() => {
    let frame = 0;
    const stopWatching = watchReducedMotion((r) => {
      reduced = r;
      cancelAnimationFrame(frame);
      if (r) {
        phase = 0;
        cycle = 0.5;
        return;
      }
      const start = performance.now();
      const tick = (/** @type {number} */ now) => {
        const ms = now - start;
        // The wave travels at 40 dp per second (Compose's default wave speed).
        phase = (ms / 1000) * 40;
        cycle = (Math.max(0, ms) % 1800) / 1800;
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    return () => {
      stopWatching();
      cancelAnimationFrame(frame);
    };
  });
</script>

<span
  class="od-linear-wavy-progress {extraClass}"
  class:od-linear-wavy-progress--reduced={reduced}
  role="progressbar"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={indeterminate ? undefined : percent}
  bind:clientWidth={width}
>
  <svg width={width} height={WAVY.height} viewBox="0 0 {width || 1} {WAVY.height}" aria-hidden="true">
    {#each pieces as piece, i (i)}
      {#if piece.kind === 'dot'}
        <circle class="od-linear-wavy-progress--dot" cx={piece.from + WAVY.dot / 2} cy={centerY} r={WAVY.dot / 2} />
      {:else}
        <path class="od-linear-wavy-progress--{piece.kind}" d={piecePath(piece, { centerY, phase, wavelength })} />
      {/if}
    {/each}
  </svg>
</span>

<style>
  @layer od.components {
    .od-linear-wavy-progress {
      display: block;
      width: 100%;
      height: 10px;
      overflow: hidden;
      line-height: 0;

      svg {
        display: block;
        fill: none;
        stroke-width: 4px;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .od-linear-wavy-progress--wave {
        stroke: var(--od-linear-wavy-progress-active, var(--od-progress-active));
      }

      .od-linear-wavy-progress--track {
        stroke: var(--od-linear-wavy-progress-track, var(--od-progress-track));
      }

      .od-linear-wavy-progress--dot {
        fill: var(--od-linear-wavy-progress-active, var(--od-progress-active));
        stroke: none;
      }
    }
  }
</style>
