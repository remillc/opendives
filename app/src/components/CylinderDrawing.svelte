<script>
  // @ts-check
  // A drawn cylinder (docs/mockups/android-edition.dc.html, "Gaz"): the valve on
  // top, an ink outline, and the body filled from the bottom with the water
  // gradient up to `ratio` (end pressure over working pressure, 0..1). With
  // `startRatio` (the start pressure, same scale) a solid pale band shows what
  // was breathed between the end and the start level, and a dashed line marks
  // each level (task 46). Decorative: the text next to it says the same.

  /** @type {{ ratio?: number, startRatio?: number|null, width?: number, stroke?: number }} */
  let { ratio = 0, startRatio = null, width = 44, stroke = 2 } = $props();

  const id = `od-cylinder-drawing-${Math.random().toString(36).slice(2, 9)}`;
  const BODY_TOP = 12;
  const BODY_HEIGHT = 62;
  const level = $derived(Math.min(1, Math.max(0, ratio)));
  const fillTop = $derived(BODY_TOP + BODY_HEIGHT * (1 - level));
  const startLevel = $derived(startRatio === null ? null : Math.min(1, Math.max(level, startRatio)));
  const startTop = $derived(startLevel === null ? 0 : BODY_TOP + BODY_HEIGHT * (1 - startLevel));
  // A dashed line at the very top or bottom of the body is kept inside it (half its width).
  /** @param {number} y */
  const lineY = (y) => Math.min(BODY_TOP + BODY_HEIGHT - 0.75, Math.max(BODY_TOP + 0.75, y));
</script>

<svg class="od-cylinder-drawing" {width} height={(width * 76) / 44} viewBox="0 0 44 76" aria-hidden="true">
  <defs>
    <linearGradient id="{id}-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="od-cylinder-drawing--water-top" />
      <stop offset="1" class="od-cylinder-drawing--water-bottom" />
    </linearGradient>
    <clipPath id="{id}-clip"><rect x="6" y={BODY_TOP} width="32" height={BODY_HEIGHT} rx="14" /></clipPath>
  </defs>
  <rect x="16" y="2" width="12" height="10" rx="2" class="od-cylinder-drawing--valve" />
  <rect x="6" y={BODY_TOP} width="32" height={BODY_HEIGHT} rx="14" class="od-cylinder-drawing--body" />
  {#if startLevel !== null && startLevel > 0}
    <rect x="6" y={startTop} width="32" height={BODY_TOP + BODY_HEIGHT - startTop} class="od-cylinder-drawing--start-fill" clip-path="url(#{id}-clip)" />
    <line x1="7" y1={lineY(startTop)} x2="37" y2={lineY(startTop)} class="od-cylinder-drawing--level" clip-path="url(#{id}-clip)" />
  {/if}
  {#if level > 0}
    <rect x="6" y={fillTop} width="32" height={BODY_TOP + BODY_HEIGHT - fillTop} fill="url(#{id}-water)" clip-path="url(#{id}-clip)" />
    {#if startLevel !== null}
      <line x1="7" y1={lineY(fillTop)} x2="37" y2={lineY(fillTop)} class="od-cylinder-drawing--level" clip-path="url(#{id}-clip)" />
    {/if}
  {/if}
  <rect x="6" y={BODY_TOP} width="32" height={BODY_HEIGHT} rx="14" class="od-cylinder-drawing--outline" stroke-width={stroke} vector-effect="non-scaling-stroke" />
</svg>

<style>
  @layer od.components {
    .od-cylinder-drawing {
      flex: none;
    }

    .od-cylinder-drawing--valve {
      fill: var(--od-text);
    }

    .od-cylinder-drawing--body {
      fill: var(--od-surface);
    }

    .od-cylinder-drawing--outline {
      fill: none;
      stroke: var(--od-text);
    }

    /* The water gradient: sand to rust (dark: honey to amber). */
    .od-cylinder-drawing--water-top {
      stop-color: var(--od-cylinder-water-top);
    }

    .od-cylinder-drawing--water-bottom {
      stop-color: var(--od-cylinder-water-bottom);
    }

    /* Between the end and the start pressure: what was breathed. */
    .od-cylinder-drawing--start-fill {
      fill: var(--od-cylinder-breathed);
    }

    .od-cylinder-drawing--level {
      stroke: var(--od-cylinder-level);
      stroke-width: 1.5;
      stroke-dasharray: 3 2;
    }
  }
</style>
