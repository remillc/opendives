<script>
  // @ts-check
  // <DiveProfile> (spec, section 4, "Profil", "Axes" and "Temperature curve"):
  // depth over time, surface at the top; water column; graduated depth and
  // time axes; finger cursor; filter chips for the layers: water temperature
  // (on by default when the dive has temperature samples) and gas. The other
  // layers (ceiling, ppO2, tissues) will come later.
  import Icon from './Icon.svelte';
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
  const MARGIN_LEFT = 30;
  const MARGIN_TOP = 8;
  const MARGIN_BOTTOM = 26;
  const BAND = 22;

  const times = $derived(samples.timeSeconds);
  const depths = $derived(samples.depthMm);
  const tMax = $derived(Math.max(1, times.length ? times[times.length - 1] : durationSeconds));
  const dMax = $derived(Math.max(1, ...depths, maxDepthMm));

  // Depth axis: a labelled graduation with a grid line every 40 ft (10 m),
  // the first label with the unit; a 5 px tick every 10 ft (2 m).
  const ticks = $derived.by(() => {
    const feet = prefs.length === 'ft';
    const mmPerUnit = feet ? 304.8 : 1000;
    const major = feet ? 40 : 10;
    const minor = feet ? 10 : 2;
    const end = Math.max(minor, Math.ceil(dMax / mmPerUnit / minor) * minor);
    /** @type {{ value: number, mm: number, major: boolean }[]} */
    const list = [];
    for (let v = 0; v <= end + 1e-9; v += minor) list.push({ value: v, mm: v * mmPerUnit, major: v % major === 0 });
    return { list, endMm: end * mmPerUnit };
  });

  // Time axis: labelled ticks every 20 min (10 or 5 for short dives), the
  // last label with the unit; minor ticks in between.
  const timeTicks = $derived.by(() => {
    const minutes = tMax / 60;
    const major = minutes >= 40 ? 20 : minutes >= 15 ? 10 : 5;
    const minor = major / 2;
    /** @type {{ m: number, major: boolean }[]} */
    const list = [];
    for (let m = 0; m * 60 <= tMax + 1e-9; m += minor) list.push({ m, major: m % major === 0 });
    const lastMajor = [...list].reverse().find((tick) => tick.major)?.m ?? 0;
    return { list, lastMajor };
  });

  // Water temperature: the samples (0 where unknown) in the display unit,
  // on their own scale, labelled on the right.
  const temperature = $derived.by(() => {
    const mk = samples.temperatureMk;
    if (!mk || !mk.some((v) => v > 0)) return null;
    const fahrenheit = prefs.temperature === 'F';
    /** @param {number} v */
    const unit = (v) => {
      const c = v / 1000 - 273.15;
      return fahrenheit ? (c * 9) / 5 + 32 : c;
    };
    const values = mk.filter((v) => v > 0).map(unit);
    let lo = Math.floor(Math.min(...values));
    let hi = Math.ceil(Math.max(...values));
    if (hi - lo < 2) {
      lo -= 1;
      hi = lo + 2;
    }
    return { mk, unit, lo, hi, symbol: fahrenheit ? '°F' : '°C' };
  });
  const temperatureAvailable = $derived(temperature !== null);
  let temperatureLayer = $state(true);
  const showTemperature = $derived(temperatureAvailable && temperatureLayer);

  const MARGIN_RIGHT = $derived(showTemperature ? 34 : 8);
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

  const temperaturePath = $derived.by(() => {
    if (!temperature) return '';
    const { mk, unit, lo, hi } = temperature;
    let d = '';
    let pen = false;
    for (let i = 0; i < times.length; i++) {
      if (!(mk[i] > 0)) {
        pen = false;
        continue;
      }
      const yy = MARGIN_TOP + ((hi - unit(mk[i])) / (hi - lo)) * plotHeight;
      d += `${pen ? 'L' : 'M'}${x(times[i]).toFixed(1)},${yy.toFixed(1)}`;
      pen = true;
    }
    return d;
  });
  const temperatureLabels = $derived.by(() => {
    if (!temperature) return [];
    const { lo, hi, symbol } = temperature;
    const mid = (lo + hi) / 2;
    return [
      { y: MARGIN_TOP + 4, text: `${hi}${symbol}` },
      { y: MARGIN_TOP + plotHeight / 2 + 4, text: `${Number.isInteger(mid) ? mid : mid.toFixed(1)}°` },
      { y: MARGIN_TOP + plotHeight + 2, text: `${lo}°` },
    ];
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
        {#if tick.major}
          <line class="grid" x1={MARGIN_LEFT} x2={MARGIN_LEFT + plotWidth} y1={y(tick.mm)} y2={y(tick.mm)} />
          <text class="tick od-value" x={MARGIN_LEFT - 4} y={y(tick.mm) + 4} text-anchor="end"
            >{tick.value === 0 ? `0 ${depthUnit(prefs)}` : tick.value}</text
          >
        {:else}
          <line class="axis" x1={MARGIN_LEFT} x2={MARGIN_LEFT + 5} y1={y(tick.mm)} y2={y(tick.mm)} />
        {/if}
      {/each}

      {#if paths}
        <path d={paths.water} fill="url(#water-{uid})" />
        <path d={paths.line} class="trace-outline" />
        <path d={paths.line} class="trace" />
      {/if}

      <line class="axis" x1={MARGIN_LEFT} x2={MARGIN_LEFT + plotWidth} y1={MARGIN_TOP + plotHeight} y2={MARGIN_TOP + plotHeight} />
      {#each timeTicks.list as tick (tick.m)}
        {@const tx = x(tick.m * 60)}
        <line class="axis" x1={tx} x2={tx} y1={MARGIN_TOP + plotHeight} y2={MARGIN_TOP + plotHeight + (tick.major ? 6 : 4)} />
        {#if tick.major}
          <text class="tick od-value" x={tx} y={MARGIN_TOP + plotHeight + 17} text-anchor="middle"
            >{tick.m === timeTicks.lastMajor && tick.m > 0 ? `${tick.m} ${t('units.minutes')}` : tick.m}</text
          >
        {/if}
      {/each}

      {#if showTemperature}
        <path d={temperaturePath} class="temperature" />
        {#each temperatureLabels as label (label.y)}
          <text class="temperature-label od-value" x={MARGIN_LEFT + plotWidth + 4} y={label.y}>{label.text}</text>
        {/each}
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

  {#if temperatureAvailable || gasAvailable}
    <div class="layers" role="group" aria-label={t('profile.layers')}>
      <!-- MD3 filter chips, 48 px targets around 32 px chips (spec, section 3); the row scrolls sideways. -->
      {#if temperatureAvailable}
        <button type="button" class="filter" aria-pressed={temperatureLayer} onclick={() => (temperatureLayer = !temperatureLayer)}>
          <span class="chip" class:chip-outline={!temperatureLayer}>
            {#if temperatureLayer}<Icon name="check" size={18} weight={2.4} />{/if}<span class="chip-label">{t('profile.temperature')}</span>
          </span>
        </button>
      {/if}
      {#if gasAvailable}
        <button type="button" class="filter" aria-pressed={gasLayer} onclick={() => (gasLayer = !gasLayer)}>
          <span class="chip" class:chip-outline={!gasLayer}>
            {#if gasLayer}<Icon name="check" size={18} weight={2.4} />{/if}<span class="chip-label">{t('profile.gas')}</span>
          </span>
        </button>
      {/if}
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
      stroke: var(--od-chart-grid);
      stroke-width: 1;
    }

    .axis {
      stroke: var(--od-text-2);
      stroke-width: 1;
    }

    .temperature {
      fill: none;
      stroke: var(--od-temperature);
      stroke-width: 2;
      stroke-linejoin: round;
    }

    .temperature-label {
      font-size: 10px;
      fill: var(--od-temperature);
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
      flex-wrap: nowrap;
      gap: 8px;
      padding: 0 0 4px;
      overflow-x: auto;
    }

    .chip {
      gap: 4px;
    }

    .filter {
      flex: none;
      width: auto;
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
