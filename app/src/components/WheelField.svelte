<script>
  // @ts-check
  import { onDestroy, tick } from 'svelte';
  import { locale } from '../lib/format.js';
  import { clamp, decimalsOf, flingSteps, isOnStep, neighbours, stepsOfDrag, turn } from '../lib/wheel-rules.js';
  // A number on a short wheel inside a filled field (docs/system-design.md,
  // section 8; docs/mockups/android-planificateur-roulettes.dc.html): the label
  // on the left, then a narrow vertical wheel with the current value between two
  // thin lines and the values around it, then the unit. A vertical drag or fling
  // turns it, one step each 24 px, with a light tick; a tap on the value opens
  // the numeric keyboard on the same field. For assistive technologies it is a
  // spin button: arrow keys, Page up and down, Home and End step it; the label
  // is its accessible name.

  /**
   * @type {{
   *   label: string,
   *   ariaLabel?: string,
   *   value: number,
   *   min: number,
   *   max: number,
   *   step: number,
   *   typeMin?: number,
   *   typeMax?: number,
   *   unit?: string,
   *   valueText?: (value: number) => string,
   *   wheelWidth?: number,
   *   onchange: (value: number) => boolean | void,
   * }}
   * min, max, step: the wheel's range. typeMin, typeMax: what can be typed (the
   * wheel's range by default). valueText: the spoken value with its unit.
   * onchange: the page takes the value (and may refuse it with false: a rule
   * between fields, such as oxygen plus helium).
   */
  let { label, ariaLabel, value, min, max, step, typeMin, typeMax, unit = '', valueText, wheelWidth = 48, onchange } = $props();

  const ROW = 24; // pixels dragged for one step
  const decimals = $derived(decimalsOf(step));
  const onStep = $derived(isOnStep(value, min, step));
  const around = $derived(neighbours(value, min, max, step));
  // Reduced motion: no settling animation, no fling.
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** @param {number} n @param {number} extra */
  const fmt = (n, extra = 0) => new Intl.NumberFormat(locale, { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: decimals + extra }).format(n);
  const current = $derived(fmt(value, onStep ? 0 : 1));
  const spoken = $derived(valueText ? valueText(value) : fmt(value, onStep ? 0 : 1));

  /** One step in a direction, with its tick. @param {1|-1} direction @returns {boolean} */
  function move(direction) {
    const next = turn(value, direction, min, max, step);
    if (next === null || next === value) return false;
    if (onchange(next) === false) return false;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
    return true;
  }

  /** @param {number} next */
  function jump(next) {
    if (next !== value && onchange(next) !== false && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
  }

  // --- Drag, fling, tap -----------------------------------------------------

  let offset = $state(0); // visual shift of the values while dragging, px
  let settling = $state(false);
  let gesture = /** @type {{ y: number, anchor: number, t: number, moved: number, samples: { y: number, t: number }[] } | null} */ (null);
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let flingTimer;

  /** @param {PointerEvent} e */
  function down(e) {
    clearTimeout(flingTimer);
    settling = false;
    gesture = { y: e.clientY, anchor: e.clientY, t: e.timeStamp, moved: 0, samples: [{ y: e.clientY, t: e.timeStamp }] };
    /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
  }

  /** @param {PointerEvent} e */
  function pointermove(e) {
    if (!gesture) return;
    gesture.moved = Math.max(gesture.moved, Math.abs(e.clientY - gesture.y));
    gesture.samples.push({ y: e.clientY, t: e.timeStamp });
    if (gesture.samples.length > 6) gesture.samples.shift();
    let dy = e.clientY - gesture.anchor;
    while (Math.abs(dy) >= ROW) {
      const steps = stepsOfDrag(dy, ROW); // -1 or 1 (down brings smaller values)
      if (!move(steps > 0 ? 1 : -1)) {
        gesture.anchor = e.clientY; // at the end of the range: the values do not move on
        dy = 0;
        break;
      }
      gesture.anchor += steps > 0 ? -ROW : ROW;
      dy = e.clientY - gesture.anchor;
    }
    offset = clamp(dy, -ROW / 2, ROW / 2);
  }

  /** @param {PointerEvent} e */
  function up(e) {
    const g = gesture;
    gesture = null;
    if (!g) return;
    settling = !reduced;
    offset = 0;
    if (g.moved < 6 && e.timeStamp - g.t < 600) {
      edit();
      return;
    }
    const first = g.samples[0];
    const dt = e.timeStamp - first.t;
    const n = dt > 0 && dt < 120 && !reduced ? flingSteps((e.clientY - first.y) / dt) : 0;
    if (n) fling(n > 0 ? 1 : -1, Math.abs(n));
  }

  /** The release speed carries on: some more steps, slowing down. @param {1|-1} direction @param {number} left @param {number} delay */
  function fling(direction, left, delay = 40) {
    if (left <= 0 || !move(direction)) return;
    flingTimer = setTimeout(() => fling(direction, left - 1, delay + 18), delay);
  }

  onDestroy(() => clearTimeout(flingTimer));

  // --- Keyboard and accessibility -------------------------------------------

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (editing) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'PageUp') for (let i = 0; i < 5 && move(1); i++);
    else if (e.key === 'PageDown') for (let i = 0; i < 5 && move(-1); i++);
    else if (e.key === 'Home') jump(min);
    else if (e.key === 'End') jump(max);
    else if (e.key === 'Enter') edit();
    else return;
    e.preventDefault();
  }

  // --- Typing a value -------------------------------------------------------

  let editing = $state(false);
  let text = $state('');
  let invalid = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let input = $state();
  /** @type {HTMLDivElement|undefined} */
  let box = $state();

  async function edit() {
    text = fmt(value, onStep ? 0 : 1).replace(/\s/g, '');
    invalid = false;
    editing = true;
    await tick();
    input?.focus();
    input?.select();
  }

  /** Each keystroke: a good value goes to the plan at once, as the text fields did. */
  function typing() {
    const n = Number(text.trim().replace(',', '.'));
    const good = text.trim() !== '' && Number.isFinite(n) && n >= (typeMin ?? min) && n <= (typeMax ?? max);
    invalid = !(good && onchange(n) !== false);
  }

  /** Leaving the field: the wheel comes back with the last good value. */
  function done() {
    editing = false;
    invalid = false;
  }

  /** @param {KeyboardEvent} e */
  async function inputKey(e) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // the box would take this Enter for "open the keyboard"
      done();
      await tick();
      box?.focus(); // keyboard and screen reader users stay on the field
    }
  }
</script>

<div class="od-wheel-field od-wheel-field--field" class:od-wheel-field--invalid={invalid}>
  <div
    bind:this={box}
    class="od-wheel-field--box no-swipeback"
    role={editing ? undefined : 'spinbutton'}
    tabindex={editing ? undefined : 0}
    aria-label={editing ? undefined : (ariaLabel ?? label)}
    aria-valuemin={editing ? undefined : min}
    aria-valuemax={editing ? undefined : max}
    aria-valuenow={editing ? undefined : value}
    aria-valuetext={editing ? undefined : spoken}
    onkeydown={keydown}
  >
    <span class="od-wheel-field--label">{label}</span>
    {#if editing}
      <input
        class="od-wheel-field--input"
        bind:this={input}
        bind:value={text}
        inputmode="decimal"
        aria-label={ariaLabel ?? label}
        aria-invalid={invalid}
        style:width="{wheelWidth + 12}px"
        oninput={typing}
        onblur={done}
        onkeydown={inputKey}
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="od-wheel-field--wheel"
        aria-hidden="true"
        style:width="{wheelWidth}px"
        onpointerdown={down}
        onpointermove={pointermove}
        onpointerup={up}
        onpointercancel={() => {
          gesture = null;
          offset = 0;
        }}
      >
        <span class="od-wheel-field--stack" class:od-wheel-field--settling={settling} style:transform="translateY({offset}px)" ontransitionend={() => (settling = false)}>
          <span class="od-wheel-field--around">{around.before === null ? '' : fmt(around.before)}</span>
          <span class="od-wheel-field--current">{current}</span>
          <span class="od-wheel-field--around">{around.after === null ? '' : fmt(around.after)}</span>
        </span>
        <span class="od-wheel-field--lines"></span>
      </span>
    {/if}
    {#if unit}<span class="od-wheel-field--unit">{unit}</span>{/if}
  </div>
</div>

<style>
  @layer od.components {
    .od-wheel-field--field {
      margin: 18px var(--od-field-margin, 16px) 0;
    }

    .od-wheel-field--box {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 56px;
      box-sizing: border-box;
      padding: 0 12px 1px 16px;
      border-radius: 4px 4px 0 0;
      background: var(--od-surface-2);
      overflow: hidden;
      touch-action: none;

      /* Bottom indicator: 1 dp, 2 dp in the primary colour on focus, in the alarm colour when a typed value is refused. */
      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: var(--od-outline);
      }

      &:focus-within::after {
        height: 2px;
        background: var(--od-primary-action);
      }

      &:focus-visible {
        outline: 2px solid var(--od-primary-action);
        outline-offset: -2px;
      }

      .od-wheel-field--invalid &::after {
        height: 2px;
        background: var(--od-alarm);
      }

      :global(.ios) & {
        border-radius: 10px;
        background: var(--od-surface);

        &::after {
          display: none;
        }
      }
    }

    .od-wheel-field--label {
      flex: 1;
      min-width: 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);

      .od-wheel-field--invalid & {
        color: var(--od-alarm);
      }
    }

    .od-wheel-field--wheel {
      position: relative;
      flex: none;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-variant-numeric: tabular-nums;
      cursor: ns-resize;
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 35%, #000 65%, transparent 100%);
      mask-image: linear-gradient(to bottom, transparent 0, #000 35%, #000 65%, transparent 100%);
    }

    .od-wheel-field--stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;

      &.od-wheel-field--settling {
        transition: transform 120ms ease-out;
      }
    }

    .od-wheel-field--around {
      height: 16px;
      font-size: 13px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-wheel-field--current {
      height: 24px;
      font-size: 20px;
      line-height: 24px;
      font-weight: 600;
      color: var(--od-text);
    }

    /* The two thin lines around the current value. */
    .od-wheel-field--lines {
      position: absolute;
      left: 0;
      right: 0;
      top: 16px;
      height: 24px;
      border-top: 1px solid var(--od-wheel-line);
      border-bottom: 1px solid var(--od-wheel-line);
      pointer-events: none;
    }

    .od-wheel-field--input {
      flex: none;
      box-sizing: border-box;
      height: 40px;
      padding: 0 4px;
      border: none;
      border-radius: 4px;
      outline: none;
      background: var(--od-surface);
      color: var(--od-text);
      font: inherit;
      font-size: 20px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: center;

      &[aria-invalid='true'] {
        color: var(--od-alarm);
      }
    }

    .od-wheel-field--unit {
      flex: none;
      font-size: 14px;
      color: var(--od-text-2);
    }
  }
</style>
