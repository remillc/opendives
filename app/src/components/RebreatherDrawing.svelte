<script>
  // @ts-check
  // The rebreather seen from the back, for the "Gas" card of a closed-circuit
  // dive (docs/mockups/detail3-android-ccr.dc.html, task 2026-11-12-78): a narrow
  // dark scrubber canister with its head and two breathing hoses, a small stand,
  // the diluent cylinder on its left ("DIL") and the oxygen on its right ("O₂"),
  // valves down. Other cylinders (bailout, stages) stand beside the unit,
  // open-circuit style, with their use written vertically. The fill marks are
  // those of CylinderDrawing: pale band between end and start, water gradient,
  // dashed levels. A cylinder without both its start and end pressures is hatched in grey, with no
  // level (task 2026-11-13-84). Decorative: the card carries the accessible name.
  //
  // Sizes (task 2026-11-13-84, docs/mockups/detail3-android-ccr.dc.html): the
  // drawing is 140 tall; the unit is drawn at 68.4 % and the cylinders beside it
  // at 93.5 %, so that both are 134 tall with their bottoms aligned. The DIL and
  // O₂ marks stay outside the scaling, at their 11 px size.

  import { REBREATHER_COLUMN, rebreatherWidth } from '../lib/rebreather-gas.js';

  /** @typedef {{ ratio: number, startRatio: number|null, hatched?: boolean }} Fill */

  /** @type {{ diluent?: Fill|null, oxygen?: Fill|null, others?: Fill[], marks: { diluent: string, oxygen: string, bailout: string } }} */
  let { diluent = null, oxygen = null, others = [], marks } = $props();

  const id = `od-rebreather-drawing-${Math.random().toString(36).slice(2, 9)}`;
  const HEIGHT = 140;
  // Cylinders in the unit: tall, valve at the bottom.
  const UNIT = { top: 6, height: 164, width: 36, rx: 17.3 };
  // Cylinders beside the unit: open-circuit style, valve on top.
  // One step = REBREATHER_COLUMN once scaled: each cylinder beside the unit is
  // centred in its own text column (lib/rebreather-gas.js).
  const SIDE = { top: 58, height: 130, width: 40, rx: 19.2, x: 252, step: REBREATHER_COLUMN / 0.935 };
  // The two scalings, in the drawing's own units (the mock-up's values).
  const UNIT_SCALE = { x: 34.42, y: -0.1, k: 0.684 };
  const SIDE_SCALE = { x: 17.7, y: -41.8, k: 0.935 };
  /** Where a point of the unit lands once scaled. @param {number} x @param {number} y */
  const unitPoint = (x, y) => ({ x: UNIT_SCALE.x + x * UNIT_SCALE.k, y: UNIT_SCALE.y + y * UNIT_SCALE.k });
  // At the middle of their cylinder (48..84 and 134..170 wide, 6..170 tall),
  // centred on the text (task 2026-11-13-88).
  const dilMark = unitPoint(66, 88);
  const oxyMark = unitPoint(152, 88);
  const width = $derived(rebreatherWidth(others.length));

  /**
   * One cylinder with its drawn levels: the end level (full gradient) and the
   * start level (pale band), each as a y position, or null when not drawn.
   * @param {string} key
   * @param {number} x
   * @param {{ top: number, height: number, width: number, rx: number }} g
   * @param {Fill|null|undefined} item
   * @param {boolean} side
   */
  function shape(key, x, g, item, side) {
    const bottom = g.top + g.height;
    const hatched = !!item?.hatched;
    const level = item && !hatched ? Math.min(1, Math.max(0, item.ratio)) : 0;
    const start = item && !hatched && item.startRatio !== null ? Math.min(1, Math.max(level, item.startRatio)) : null;
    /** @param {number} r */
    const y = (r) => g.top + g.height * (1 - r);
    // A dashed line at the very top or bottom of the body stays inside it.
    /** @param {number} v */
    const lineY = (v) => Math.min(bottom - 0.75, Math.max(g.top + 0.75, v));
    return {
      // The geometry first: SIDE has its own x (the first cylinder's), which must not win over this one's.
      ...g,
      key,
      x,
      bottom,
      side,
      hatched,
      startY: start !== null && start > 0 ? y(start) : null,
      endY: level > 0 ? y(level) : null,
      lineStartY: start !== null && start > 0 ? lineY(y(start)) : 0,
      lineEndY: level > 0 && start !== null ? lineY(y(level)) : null,
    };
  }

  const unitShapes = $derived([shape('dil', 48, UNIT, diluent, false), shape('oxy', 134, UNIT, oxygen, false)]);
  const sideShapes = $derived(others.map((item, i) => shape(`side${i}`, SIDE.x + SIDE.step * i, SIDE, item, true)));
  const shapes = $derived([...unitShapes, ...sideShapes]);
</script>

{#snippet cylinder(/** @type {ReturnType<typeof shape>} */ s)}
  <rect x={s.x} y={s.top} width={s.width} height={s.height} rx={s.rx} class="od-rebreather-drawing--body" style:fill={s.hatched ? `url(#${id}-hatch)` : null} />
  {#if s.startY !== null}
    <rect x={s.x} y={s.startY} width={s.width} height={s.bottom - s.startY} class="od-rebreather-drawing--start-fill" clip-path="url(#{id}-{s.key})" />
    <line x1={s.x + 1} y1={s.lineStartY} x2={s.x + s.width - 1} y2={s.lineStartY} class="od-rebreather-drawing--level" clip-path="url(#{id}-{s.key})" />
  {/if}
  {#if s.endY !== null}
    <rect x={s.x} y={s.endY} width={s.width} height={s.bottom - s.endY} fill="url(#{id}-water)" clip-path="url(#{id}-{s.key})" />
    {#if s.lineEndY !== null}
      <line x1={s.x + 1} y1={s.lineEndY} x2={s.x + s.width - 1} y2={s.lineEndY} class="od-rebreather-drawing--level" clip-path="url(#{id}-{s.key})" />
    {/if}
  {/if}
  <rect x={s.x} y={s.top} width={s.width} height={s.height} rx={s.rx} class="od-rebreather-drawing--outline" />
{/snippet}

<svg class="od-rebreather-drawing" viewBox="0 0 {width} {HEIGHT}" aria-hidden="true">
  <defs>
    <linearGradient id="{id}-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="od-rebreather-drawing--water-top" />
      <stop offset="1" class="od-rebreather-drawing--water-bottom" />
    </linearGradient>
    {#each shapes as s (s.key)}
      <clipPath id="{id}-{s.key}"><rect x={s.x} y={s.top} width={s.width} height={s.height} rx={s.rx} /></clipPath>
    {/each}
    <!-- No pressure data: grey diagonal stripes, 8 wide, at 45°. -->
    <pattern id="{id}-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" class="od-rebreather-drawing--hatch-ground" />
      <rect width="4" height="8" class="od-rebreather-drawing--hatch-stripe" />
    </pattern>
  </defs>

  <g transform="translate({UNIT_SCALE.x} {UNIT_SCALE.y}) scale({UNIT_SCALE.k})">
    <!-- Breathing hoses to the shoulders, and the stand. -->
    <path d="M98 30 C 94 16, 80 10, 58 8" class="od-rebreather-drawing--hose" />
    <path d="M120 30 C 124 16, 138 10, 160 8" class="od-rebreather-drawing--hose" />
    <path d="M100 174 L 92 196 L 126 196 L 118 174" class="od-rebreather-drawing--stand" />

    <!-- Diluent (left) and oxygen (right), valve and first stage at the bottom. -->
    {#each unitShapes as s (s.key)}
      {@render cylinder(s)}
      <rect x={s.x + 13} y="168" width="10" height="10" rx="2" class="od-rebreather-drawing--valve" />
      <rect x={s.x + 7} y="175" width="22" height="7" rx="3" class="od-rebreather-drawing--first-stage" />
    {/each}

    <!-- The scrubber canister, between the two cylinders, with its head. -->
    <rect x="86" y="24" width="46" height="152" rx="7" class="od-rebreather-drawing--canister" />
    <rect x="86" y="24" width="46" height="18" rx="6" class="od-rebreather-drawing--head" />
    <rect x="103" y="66" width="12" height="20" rx="2" class="od-rebreather-drawing--display" />
  </g>
  <text x={dilMark.x} y={dilMark.y} text-anchor="middle" dominant-baseline="central" class="od-rebreather-drawing--mark">{marks.diluent}</text>
  <text x={oxyMark.x} y={oxyMark.y} text-anchor="middle" dominant-baseline="central" class="od-rebreather-drawing--mark">{marks.oxygen}</text>

  <!-- The others beside the unit, valve on top. -->
  {#if sideShapes.length}
    <g transform="translate({SIDE_SCALE.x} {SIDE_SCALE.y}) scale({SIDE_SCALE.k})">
      {#each sideShapes as s (s.key)}
        {@render cylinder(s)}
        <rect x={s.x + 14} y={s.top - 9} width="12" height="9" rx="2" class="od-rebreather-drawing--side-valve" />
        <text
          x={s.x + s.width / 2}
          y={s.top + s.height / 2}
          text-anchor="middle"
          dominant-baseline="central"
          class="od-rebreather-drawing--mark od-rebreather-drawing--mark-side"
          transform="rotate(-90 {s.x + s.width / 2} {s.top + s.height / 2})">{marks.bailout}</text>
      {/each}
    </g>
  {/if}
</svg>

<style>
  @layer od.components {
    /* As wide as its box, which the card keeps at most the drawing's own width
       (140 tall, task 2026-11-13-84), so that the text columns line up with it. */
    .od-rebreather-drawing {
      display: block;
      width: 100%;
      height: auto;
    }

    .od-rebreather-drawing--hose {
      fill: none;
      stroke: var(--od-rebreather-hose);
      stroke-width: 8;
      stroke-linecap: round;
      stroke-dasharray: 2.5 1.2;
    }

    .od-rebreather-drawing--stand {
      fill: none;
      stroke: var(--od-rebreather-hardware);
      stroke-width: 4;
      stroke-linejoin: round;
    }

    .od-rebreather-drawing--body {
      fill: var(--od-surface);
    }

    .od-rebreather-drawing--outline {
      fill: none;
      stroke: var(--od-text);
      stroke-width: 2;
    }

    .od-rebreather-drawing--valve {
      fill: var(--od-rebreather-valve);
      stroke: var(--od-text);
      stroke-width: 1.5;
    }

    .od-rebreather-drawing--first-stage {
      fill: var(--od-rebreather-hardware);
      stroke: var(--od-text);
      stroke-width: 1.5;
    }

    .od-rebreather-drawing--side-valve {
      fill: var(--od-text);
    }

    .od-rebreather-drawing--canister {
      fill: var(--od-rebreather-canister);
      stroke: var(--od-text);
      stroke-width: 2;
    }

    .od-rebreather-drawing--head {
      fill: var(--od-rebreather-head);
    }

    .od-rebreather-drawing--display {
      fill: var(--od-text-2);
    }

    .od-rebreather-drawing--mark {
      fill: var(--od-text);
      font-size: 11px;
      font-weight: 700;
    }

    .od-rebreather-drawing--mark-side {
      font-weight: 600;
      letter-spacing: 1px;
    }

    .od-rebreather-drawing--water-top {
      stop-color: var(--od-cylinder-water-top);
    }

    .od-rebreather-drawing--water-bottom {
      stop-color: var(--od-cylinder-water-bottom);
    }

    .od-rebreather-drawing--hatch-ground {
      fill: var(--od-cylinder-no-pressure);
    }

    .od-rebreather-drawing--hatch-stripe {
      fill: var(--od-cylinder-no-pressure-stripe);
    }

    .od-rebreather-drawing--start-fill {
      fill: var(--od-cylinder-breathed);
    }

    .od-rebreather-drawing--level {
      stroke: var(--od-cylinder-level);
      stroke-width: 1.5;
      stroke-dasharray: 3 2;
    }
  }
</style>
