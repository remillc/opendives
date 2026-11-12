<script>
  // @ts-check
  // The rebreather seen from the back, for the "Gas" card of a closed-circuit
  // dive (docs/mockups/detail3-android-ccr.dc.html, task 2026-11-12-78): a narrow
  // dark scrubber canister with its head and two breathing hoses, a small stand,
  // the diluent cylinder on its left ("DIL") and the oxygen on its right ("O₂"),
  // valves down. Other cylinders (bailout, stages) stand beside the unit,
  // open-circuit style, with their use written vertically. The fill marks are
  // those of CylinderDrawing: pale band between end and start, water gradient,
  // dashed levels. Decorative: the card carries the accessible name.

  /** @typedef {{ ratio: number, startRatio: number|null }} Fill */

  /** @type {{ diluent?: Fill|null, oxygen?: Fill|null, others?: Fill[], marks: { diluent: string, oxygen: string, bailout: string } }} */
  let { diluent = null, oxygen = null, others = [], marks } = $props();

  const id = `od-rebreather-drawing-${Math.random().toString(36).slice(2, 9)}`;
  const HEIGHT = 200;
  // Cylinders in the unit: tall, valve at the bottom.
  const UNIT = { top: 6, height: 164, width: 36, rx: 17.3 };
  // Cylinders beside the unit: open-circuit style, valve on top.
  const SIDE = { top: 58, height: 130, width: 40, rx: 19.2, x: 252, step: 64 };
  const width = $derived(others.length === 0 ? 218 : 326 + SIDE.step * (others.length - 1));

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
    const level = item ? Math.min(1, Math.max(0, item.ratio)) : 0;
    const start = item && item.startRatio !== null ? Math.min(1, Math.max(level, item.startRatio)) : null;
    /** @param {number} r */
    const y = (r) => g.top + g.height * (1 - r);
    // A dashed line at the very top or bottom of the body stays inside it.
    /** @param {number} v */
    const lineY = (v) => Math.min(bottom - 0.75, Math.max(g.top + 0.75, v));
    return {
      key,
      x,
      ...g,
      bottom,
      side,
      startY: start !== null && start > 0 ? y(start) : null,
      endY: level > 0 ? y(level) : null,
      lineStartY: start !== null && start > 0 ? lineY(y(start)) : 0,
      lineEndY: level > 0 && start !== null ? lineY(y(level)) : null,
    };
  }

  const shapes = $derived([
    shape('dil', 48, UNIT, diluent, false),
    shape('oxy', 134, UNIT, oxygen, false),
    ...others.map((item, i) => shape(`side${i}`, SIDE.x + SIDE.step * i, SIDE, item, true)),
  ]);
</script>

<svg class="od-rebreather-drawing" viewBox="0 0 {width} {HEIGHT}" aria-hidden="true">
  <defs>
    <linearGradient id="{id}-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="od-rebreather-drawing--water-top" />
      <stop offset="1" class="od-rebreather-drawing--water-bottom" />
    </linearGradient>
    {#each shapes as s (s.key)}
      <clipPath id="{id}-{s.key}"><rect x={s.x} y={s.top} width={s.width} height={s.height} rx={s.rx} /></clipPath>
    {/each}
  </defs>

  <!-- Breathing hoses to the shoulders, and the stand. -->
  <path d="M98 30 C 94 16, 80 10, 58 8" class="od-rebreather-drawing--hose" />
  <path d="M120 30 C 124 16, 138 10, 160 8" class="od-rebreather-drawing--hose" />
  <path d="M100 174 L 92 196 L 126 196 L 118 174" class="od-rebreather-drawing--stand" />

  <!-- Diluent (left) and oxygen (right), valve and first stage at the bottom; the others beside the unit. -->
  {#each shapes as s (s.key)}
    <rect x={s.x} y={s.top} width={s.width} height={s.height} rx={s.rx} class="od-rebreather-drawing--body" />
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
    <rect x={s.x} y={s.top} width={s.width} height={s.height} rx={s.rx} class="od-rebreather-drawing--outline" vector-effect="non-scaling-stroke" />
    {#if s.side}
      <rect x={s.x + 14} y={s.top - 9} width="12" height="9" rx="2" class="od-rebreather-drawing--side-valve" />
      <text
        x={s.x + s.width / 2}
        y={s.top + s.height / 2 - 6}
        text-anchor="middle"
        class="od-rebreather-drawing--mark od-rebreather-drawing--mark-side"
        transform="rotate(-90 {s.x + s.width / 2} {s.top + s.height / 2 - 6})">{marks.bailout}</text>
    {:else}
      <rect x={s.x + 13} y="168" width="10" height="10" rx="2" class="od-rebreather-drawing--valve" />
      <rect x={s.x + 7} y="175" width="22" height="7" rx="3" class="od-rebreather-drawing--first-stage" />
    {/if}
  {/each}

  <!-- The scrubber canister, between the two cylinders, with its head. -->
  <rect x="86" y="24" width="46" height="152" rx="7" class="od-rebreather-drawing--canister" />
  <rect x="86" y="24" width="46" height="18" rx="6" class="od-rebreather-drawing--head" />
  <rect x="103" y="66" width="12" height="20" rx="2" class="od-rebreather-drawing--display" />
  <text x="66" y="112" text-anchor="middle" class="od-rebreather-drawing--mark">{marks.diluent}</text>
  <text x="152" y="112" text-anchor="middle" class="od-rebreather-drawing--mark">{marks.oxygen}</text>
</svg>

<style>
  @layer od.components {
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
      stop-color: var(--od-loading-indicator-top);
    }

    .od-rebreather-drawing--water-bottom {
      stop-color: var(--od-loading-indicator-bottom);
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
