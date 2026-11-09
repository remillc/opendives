<script>
  // @ts-check
  // Bar chart of the Statistics section (spec, section 1, "Statistics"),
  // drawn in SVG: one bar per dive or per year, from the bottom. Colours come
  // from the --od-* tokens only: a depth bar takes the water colour of its
  // depth (same scale as the dive profile), a count or a time is blue. Labels
  // under the bars only when there are few of them.
  import { waterBottomColor } from '../lib/water-column.js';

  /**
   * @type {{
   *   bars: {value: number, label?: string}[],
   *   label: string,
   *   depth?: boolean,
   *   height?: number,
   *   scale?: number,
   *   unit?: string,
   *   axis?: boolean,
   *   labelSize?: number,
   *   tinted?: boolean,
   * }}
   * `tinted`: the bars of a chart that is not about depth (ready-made charts
   * of the Statistics screen) go from --od-chart-low for the smallest value
   * to --od-chart-high for the largest (spec, "Statistics charts in blue").
   * `value`: millimetres for a depth chart (`depth`), else any positive number.
   * `scale`: values per unit of the y axis (60 for seconds shown in minutes,
   * 1000 or 304.8 for millimetres in metres or feet); `unit` is written after
   * the top value of the axis. `axis: false`: no axis lines nor values, the
   * bars over the whole width. `labelSize`: px of the labels under the bars.
   */
  let { bars, label, depth = false, height = 110, scale = 1, unit = '', axis: withAxis = true, labelSize = 10, tinted = false } = $props();

  /** @param {number} value @param {number} min @param {number} max */
  const tint = (value, min, max) => {
    const percent = max > min ? Math.round(((value - min) / (max - min)) * 1000) / 10 : 100;
    return `color-mix(in srgb, var(--od-chart-high) ${percent}%, var(--od-chart-low))`;
  };

  let width = $state(0);

  const LABEL_HEIGHT = $derived(labelSize + 6);
  const MAX_LABELS = 8;
  const showLabels = $derived(bars.length <= MAX_LABELS && bars.some((b) => b.label));
  /** The bottom of the bars: above the labels, or above room for the axis' "0". */
  const plot = $derived(height - (showLabels ? LABEL_HEIGHT : 7));

  /**
   * The y axis: 0 and round steps (1, 2 or 5 × 10ⁿ in the axis unit), about
   * three of them; the top step is at or above the highest bar.
   */
  const axis = $derived.by(() => {
    const top = Math.max(...bars.map((b) => b.value), 0) / scale;
    if (!(top > 0)) return { max: scale, ticks: [0] };
    const rough = top / 3;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
    const count = Math.ceil(top / step);
    const ticks = Array.from({ length: count + 1 }, (_, i) => i * step);
    return { max: count * step * scale, ticks };
  });

  /** @param {number} value in the axis unit */
  const tickText = (value) => {
    const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return value === axis.ticks[axis.ticks.length - 1] && unit ? `${text} ${unit}` : text;
  };

  /** Room on the left for the values of the y axis: the longest one, 10 px digits. */
  const AXIS_WIDTH = $derived(withAxis ? Math.max(...axis.ticks.map((v) => tickText(v).length)) * 6 + 8 : 0);

  const rects = $derived.by(() => {
    const n = bars.length;
    if (!n || !width) return [];
    const plotWidth = width - AXIS_WIDTH;
    // A gap between bars while they stay readable; a dense chart becomes a silhouette.
    const gap = n <= 40 ? Math.min(6, (plotWidth / n) * 0.22) : 0;
    const barWidth = (plotWidth - gap * (n - 1)) / n;
    const highest = Math.max(...bars.map((b) => b.value), 1);
    const lowest = Math.min(...bars.map((b) => b.value).filter((v) => v > 0), highest);
    return bars.map((b, i) => {
      // Without an axis, the tallest bar reaches the top.
      const max = withAxis ? axis.max : highest;
      const h = b.value > 0 ? Math.max(2, (b.value / max) * (plot - 6)) : 0;
      return {
        x: AXIS_WIDTH + i * (barWidth + gap),
        y: plot - h,
        w: barWidth,
        h,
        fill: depth ? waterBottomColor(b.value) : tinted ? tint(b.value, lowest, highest) : 'var(--od-text)',
        label: b.label ?? '',
      };
    });
  });
  const rx = $derived(rects.length && rects[0].w >= 8 ? 3 : 0);
</script>

<div class="chart" style:height="{height}px" bind:clientWidth={width}>
  {#if width}
    <svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
      <!-- The y axis: a thin line and the value at each round step. -->
      {#if withAxis}
        {#each axis.ticks as tick (tick)}
          {@const y = plot - (tick * scale / axis.max) * (plot - 6)}
          <line x1={AXIS_WIDTH} x2={width} y1={y} y2={y} class="grid" />
          <text x={AXIS_WIDTH - 4} {y} class="tick">{tickText(tick)}</text>
        {/each}
      {/if}
      {#each rects as r, i (i)}
        <rect x={r.x} y={r.y} width={r.w} height={r.h} {rx} style:fill={r.fill} />
        {#if showLabels}
          <text x={r.x + r.w / 2} y={height - 3} class="label" style:font-size="{labelSize}px">{r.label}</text>
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

    .grid {
      stroke: var(--od-separator);
      stroke-width: 1;
    }

    .tick {
      font-size: 10px;
      fill: var(--od-text-2);
      text-anchor: end;
      dominant-baseline: middle;
      font-variant-numeric: tabular-nums;
    }

    .label {
      font-size: 10px;
      fill: var(--od-text-2);
      text-anchor: middle;
      font-variant-numeric: tabular-nums;
    }
  }
</style>
