<script>
  // @ts-check
  // Bar chart of the Statistics section (spec, section 1, "Statistics"),
  // drawn in SVG: one bar per dive or per year, from the bottom. Colours come
  // from the --od-* tokens only: a depth bar takes the water colour of its
  // depth (same scale as the dive profile), any other bar is in ink. Labels
  // under the bars only when there are few of them.
  import { waterBottomColor } from '../lib/water-column.js';

  /**
   * @type {{
   *   bars: {value: number, label?: string}[],
   *   label: string,
   *   depth?: boolean,
   *   height?: number,
   * }}
   * `value`: millimetres for a depth chart (`depth`), else any positive number.
   */
  let { bars, label, depth = false, height = 110 } = $props();

  let width = $state(0);

  const LABEL_HEIGHT = 16;
  const MAX_LABELS = 8;

  const showLabels = $derived(bars.length <= MAX_LABELS && bars.some((b) => b.label));
  const rects = $derived.by(() => {
    const n = bars.length;
    if (!n || !width) return [];
    const max = Math.max(...bars.map((b) => b.value), 1);
    const plot = height - (showLabels ? LABEL_HEIGHT : 0);
    // A gap between bars while they stay readable; a dense chart becomes a silhouette.
    const gap = n <= 40 ? Math.min(6, (width / n) * 0.22) : 0;
    const barWidth = (width - gap * (n - 1)) / n;
    return bars.map((b, i) => {
      const h = b.value > 0 ? Math.max(2, (b.value / max) * plot) : 0;
      return {
        x: i * (barWidth + gap),
        y: plot - h,
        w: barWidth,
        h,
        fill: depth ? waterBottomColor(b.value) : 'var(--od-text)',
        label: b.label ?? '',
      };
    });
  });
  const rx = $derived(rects.length && rects[0].w >= 8 ? 3 : 0);
</script>

<div class="chart" style:height="{height}px" bind:clientWidth={width}>
  {#if width}
    <svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
      {#each rects as r, i (i)}
        <rect x={r.x} y={r.y} width={r.w} height={r.h} {rx} style:fill={r.fill} />
        {#if showLabels}
          <text x={r.x + r.w / 2} y={height - 3} class="label">{r.label}</text>
        {/if}
      {/each}
    </svg>
  {/if}
</div>

<style>
  @layer od.components {
    .chart {
      width: 100%;
    }

    svg {
      display: block;
    }

    .label {
      font-size: 10px;
      fill: var(--od-text-2);
      text-anchor: middle;
      font-variant-numeric: tabular-nums;
    }
  }
</style>
