<script>
  // @ts-check
  // <DiveProfile> (spec, section 4, "Profil"): depth over time, surface at the
  // top; water column; finger cursor; Gas layer when the dive has gas data.
  // The other layers (ceiling, ppO2, tissues) will come later.
  import { waterBottomColor } from '../lib/water-column.js';
  import { depthUnit, formatDepth, formatDuration, formatMinSec } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   samples: import('opendives-core').DiveSamples,
   *   cylinders: import('opendives-core').Cylinder[],
   *   divemode: string,
   *   maxDepthMm: number,
   *   durationSeconds: number,
   *   prefs: import('opendives-core').Prefs,
   * }}
   */
  let { samples, cylinders, divemode, maxDepthMm, durationSeconds, prefs } = $props();

  const uid = $props.id();
  let width = $state(320);
  const HEIGHT = 180;
  const MARGIN_LEFT = 40;
  const MARGIN_RIGHT = 8;
  const MARGIN_TOP = 8;
  const MARGIN_BOTTOM = 22;
  const BAND = 22;

  const times = $derived(samples.timeSeconds);
  const depths = $derived(samples.depthMm);
  const tMax = $derived(Math.max(1, times.length ? times[times.length - 1] : durationSeconds));
  const dMax = $derived(Math.max(1, ...depths, maxDepthMm));

  // Depth ticks in the display unit, at "round" steps.
  const ticks = $derived.by(() => {
    const mmPerUnit = prefs.length === 'ft' ? 304.8 : 1000;
    const max = dMax / mmPerUnit;
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => max / s <= 5) ?? 500;
    const end = Math.ceil(max / step) * step;
    const list = [];
    for (let v = 0; v <= end + 1e-9; v += step) list.push({ value: v, mm: v * mmPerUnit });
    return { list, endMm: end * mmPerUnit };
  });

  const plotWidth = $derived(Math.max(10, width - MARGIN_LEFT - MARGIN_RIGHT));
  const plotHeight = $derived(HEIGHT - MARGIN_TOP - MARGIN_BOTTOM);
  /** @param {number} s */
  const x = (s) => MARGIN_LEFT + (s / tMax) * plotWidth;
  /** @param {number} mm */
  const y = (mm) => MARGIN_TOP + (mm / ticks.endMm) * plotHeight;

  const paths = $derived.by(() => {
    if (!times.length) return null;
    let line = '';
    for (let i = 0; i < times.length; i++) line += `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(depths[i]).toFixed(1)}`;
    const last = times.length - 1;
    const water = `${line}L${x(times[last]).toFixed(1)},${y(0).toFixed(1)}L${x(times[0]).toFixed(1)},${y(0).toFixed(1)}Z`;
    return { line, water };
  });

  const timeTicks = $derived.by(() => {
    const minutes = tMax / 60;
    const step = [5, 10, 15, 20, 30, 60, 120].find((s) => minutes / s <= 5) ?? 240;
    const list = [];
    for (let m = 0; m * 60 <= tMax; m += step) list.push(m);
    return list;
  });

  // Gas layer: one band per mix, from the cylinder being breathed.
  const gasSegments = $derived.by(() => {
    /** @type {{start: number, end: number, name: string, oxygen: boolean}[]} */
    const list = [];
    const rebreather = divemode === 'CCR' || divemode === 'PSCR';
    for (let i = 0; i < times.length; i++) {
      const c = samples.cylinder[i];
      const cyl = c >= 0 ? cylinders[c] : null;
      const name = cyl ? cyl.gas : rebreather ? t('profile.rebreather') : '';
      const oxygen = cyl ? cyl.o2Permille > 210 : false;
      const previous = list[list.length - 1];
      if (previous && previous.name === name) previous.end = times[i];
      else list.push({ start: times[i], end: times[i], name, oxygen });
    }
    return list.filter((s) => s.name);
  });
  const gasAvailable = $derived(gasSegments.length > 0);
  let gasLayer = $state(false);

  // Cursor: a finger on the profile places a vertical line and shows time and depth.
  /** @type {number|null} */
  let cursor = $state(null);

  /** @param {PointerEvent} e */
  function placeCursor(e) {
    const svg = /** @type {SVGSVGElement} */ (e.currentTarget);
    const r = svg.getBoundingClientRect();
    const s = ((e.clientX - r.left - MARGIN_LEFT) / plotWidth) * tMax;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(times[lo - 1] - s) < Math.abs(times[lo] - s)) lo--;
    cursor = lo;
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (e.buttons || e.pointerType === 'touch') placeCursor(e);
  }

  const description = $derived(
    t('profile.description', { depth: formatDepth(maxDepthMm, prefs), duration: formatDuration(durationSeconds) }),
  );
</script>

<div class="profile od-block no-swipeback">
  <div class="readout od-value" aria-hidden="true">
    {#if cursor !== null}
      <span>{t('profile.time')} <strong>{formatMinSec(times[cursor])}</strong></span>
      <span>{t('profile.depth')} <strong>{formatDepth(depths[cursor], prefs)}</strong></span>
    {:else}
      <span class="hint">{t('profile.hint')}</span>
    {/if}
  </div>

  <div class="frame" bind:clientWidth={width}>
    <svg
      {width}
      height={HEIGHT + (gasLayer ? BAND + 4 : 0)}
      role="img"
      aria-label={description}
      onpointerdown={placeCursor}
      onpointermove={move}
    >
      <defs>
        <linearGradient id="water-{uid}" x1="0" y1={y(0)} x2="0" y2={y(dMax)} gradientUnits="userSpaceOnUse">
          <stop offset="0" style="stop-color: var(--od-water-top)" />
          <stop offset="1" style="stop-color: {waterBottomColor(maxDepthMm)}" />
        </linearGradient>
      </defs>

      {#each ticks.list as tick (tick.value)}
        <line class="grid" x1={MARGIN_LEFT} x2={MARGIN_LEFT + plotWidth} y1={y(tick.mm)} y2={y(tick.mm)} />
        <text class="tick od-value" x={MARGIN_LEFT - 6} y={y(tick.mm) + 4} text-anchor="end">{tick.value}</text>
      {/each}
      <text class="tick" x={4} y={MARGIN_TOP + 4}>{depthUnit(prefs)}</text>
      {#each timeTicks as m (m)}
        <text class="tick od-value" x={x(m * 60)} y={HEIGHT - 6} text-anchor="middle">{m}</text>
      {/each}
      <text class="tick" x={MARGIN_LEFT + plotWidth} y={HEIGHT - 6} text-anchor="end">{t('units.minutes')}</text>

      {#if paths}
        <path d={paths.water} fill="url(#water-{uid})" />
        <path d={paths.line} class="trace-outline" />
        <path d={paths.line} class="trace" />
      {/if}

      {#if gasLayer}
        {#each gasSegments as s, i (i)}
          {@const x1 = x(s.start)}
          {@const x2 = Math.max(x(s.end), x1 + 1)}
          <g class="gas" class:oxygen={s.oxygen}>
            <rect x={x1} y={HEIGHT + 2} width={x2 - x1} height={BAND} rx="3" />
            {#if x2 - x1 > 44}
              <text x={x1 + 6} y={HEIGHT + 2 + BAND / 2 + 4}>{s.name}</text>
            {/if}
          </g>
        {/each}
      {/if}

      {#if cursor !== null}
        <!-- Halo in the block color, so that the cursor stays visible on any water color. -->
        <line class="cursor-halo" x1={x(times[cursor])} x2={x(times[cursor])} y1={MARGIN_TOP} y2={MARGIN_TOP + plotHeight} />
        <line class="cursor" x1={x(times[cursor])} x2={x(times[cursor])} y1={MARGIN_TOP} y2={MARGIN_TOP + plotHeight} />
      {/if}
    </svg>
  </div>

  {#if gasAvailable}
    <div class="layers">
      <!-- 48 px target around a 32 px chip (spec, section 3). -->
      <button type="button" class="filter" aria-pressed={gasLayer} onclick={() => (gasLayer = !gasLayer)}>
        <span class="chip" class:chip-outline={!gasLayer}><span class="chip-label">{t('profile.gas')}</span></span>
      </button>
    </div>
  {/if}
</div>

<style>
  @layer od.components {
    /* The profile sits in a rounded block (white in the light themes). */
    .profile {
      margin: 14px 16px 0;
      padding: 8px 12px 0;
      border-radius: 16px;
      overflow: hidden;
    }

    svg {
      display: block;
    }

    .readout {
      display: flex;
      gap: 24px;
      min-height: 24px;
      align-items: baseline;
      font-size: 14px;
      color: var(--od-text-2);

      strong {
        color: var(--od-text);
      }
    }

    .hint {
      font-size: 12px;
    }

    .frame {
      width: 100%;
      touch-action: pan-y;
      user-select: none;
    }

    .grid {
      stroke: var(--f7-list-item-border-color);
      stroke-width: 1;
    }

    .tick {
      font-size: 11px;
      fill: var(--od-text-2);
    }

    /* Dark mode: a 4.5 px outline under the 2 px line keeps it readable on the bright water. */
    .trace-outline {
      fill: none;
      stroke: var(--od-trace-outline);
      stroke-width: 4.5;
      stroke-linejoin: round;
    }

    .trace {
      fill: none;
      stroke: var(--od-trace);
      stroke-width: 2;
      stroke-linejoin: round;
    }

    .cursor {
      stroke: var(--od-cursor);
      stroke-width: 2;
    }

    .cursor-halo {
      stroke: var(--od-block);
      stroke-width: 5;
    }

    .gas {
      rect {
        fill: var(--od-tint);
      }

      &.oxygen rect {
        stroke: var(--od-oxygen);
        stroke-width: 2;
      }

      text {
        font-size: 12px;
        fill: var(--od-on-tint);
      }
    }

    .layers {
      display: flex;
      gap: 8px;
      padding: 8px 0;
    }

    .filter {
      min-height: 48px;
      min-width: 48px;
      display: flex;
      align-items: center;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      font: inherit;
    }
  }
</style>
