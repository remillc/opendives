<script>
  // @ts-check
  // <ProfileThumbnail> (spec, section 4, "Miniature"): a reduced profile in
  // place of an icon. The curve fills the whole height (the dive's own scale);
  // the water column follows the common scale, so depth stays readable.
  import { waterBottomColor } from '../lib/water-column.js';
  import { formatDepth } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   profile: number[],
   *   maxDepthMm: number,
   *   prefs: import('opendives-core').Prefs,
   *   small?: boolean,
   * }}
   */
  let { profile, maxDepthMm, prefs, small = false } = $props();

  const uid = $props.id();
  const W = 56;
  const H = 40;

  const shape = $derived.by(() => {
    if (profile.length < 4) return null;
    let tMax = 0;
    let dMax = 0;
    for (let i = 0; i < profile.length; i += 2) {
      tMax = Math.max(tMax, profile[i]);
      dMax = Math.max(dMax, profile[i + 1]);
    }
    if (!tMax || !dMax) return null;
    /** @type {string[]} */
    const points = [];
    for (let i = 0; i < profile.length; i += 2) {
      const x = (profile[i] / tMax) * W;
      const y = (profile[i + 1] / dMax) * (H - 1);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { line: `M${points.join('L')}`, water: `M0,0L${points.join('L')}L${W},0Z` };
  });
</script>

<svg
  class="thumbnail"
  class:small
  viewBox="0 0 {W} {H}"
  preserveAspectRatio="none"
  role={small ? undefined : 'img'}
  aria-hidden={small ? 'true' : undefined}
  aria-label={small ? undefined : t('dive.thumbnail', { depth: formatDepth(maxDepthMm, prefs) })}
>
  <defs>
    <linearGradient id="water-{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--od-water-top)" />
      <stop offset="1" style="stop-color: {waterBottomColor(maxDepthMm)}" />
    </linearGradient>
  </defs>
  {#if shape}
    <path d={shape.water} fill="url(#water-{uid})" />
    <path d={shape.line} class="line" vector-effect="non-scaling-stroke" />
  {/if}
</svg>

<style>
  @layer od.components {
    .thumbnail {
      display: block;
      width: 56px;
      height: 40px;
      border-radius: 8px;
      background: var(--od-thumbnail-background);
      overflow: hidden;
      flex-shrink: 0;

      :global(.ios) & {
        height: 36px;
        border-radius: 4px;
      }

      &.small {
        width: 100%;
        height: 100%;
        border-radius: 4px;
      }
    }

    .line {
      fill: none;
      stroke: var(--od-trace);
      stroke-width: 1.25;
      stroke-linejoin: round;

      .small & {
        stroke-width: 1;
      }
    }
  }
</style>
