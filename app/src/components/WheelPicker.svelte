<script>
  // @ts-check
  import { onMount } from 'svelte';
  // Vertical wheel picker (spec, section 4, "Settings: what each row does";
  // docs/mockups/reglages-nombre-android.dc.html): the current value centred
  // between two lines, larger and bold, the neighbours fading above and below;
  // scrolling changes it, no typing. For screen readers and the keyboard it is
  // a spin button: arrows up and down, Page up and down, Home and End.

  /**
   * @type {{
   *   label: string,
   *   values: string[],
   *   index: number,
   *   defaultText?: string,
   *   inline?: boolean,
   * }}
   */
  let { label, values, index = $bindable(), defaultText = '', inline = false } = $props();

  const ITEM = 40;
  const id = `od-wheel-${Math.random().toString(36).slice(2, 9)}`;
  /** @type {HTMLDivElement|undefined} */
  let scroller = $state();
  // svelte-ignore state_referenced_locally
  let position = $state(index); // fractional index under the lines, while scrolling
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let settle;

  /** Scrolls to the value, without waiting for a scroll event. */
  function show() {
    if (!scroller) return;
    scroller.scrollTop = index * ITEM;
    position = index;
  }

  // At first display (once the dialog is laid out), then when the value
  // changes from outside (Default values).
  onMount(() => requestAnimationFrame(show));
  $effect(() => {
    if (scroller && Math.round(scroller.scrollTop / ITEM) !== index) show();
  });

  function onscroll() {
    if (!scroller) return;
    position = scroller.scrollTop / ITEM;
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (!scroller) return;
      index = Math.max(0, Math.min(values.length - 1, Math.round(scroller.scrollTop / ITEM)));
    }, 80);
  }

  /** @param {number} next */
  function go(next) {
    index = Math.max(0, Math.min(values.length - 1, next));
    scroller?.scrollTo({ top: index * ITEM, behavior: 'smooth' });
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
    if (step) go(index + step);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(values.length - 1);
    else return;
    e.preventDefault();
  }
</script>

<div class="od-wheel-picker od-wheel-picker--wheel no-swipeback" class:od-wheel-picker--inline={inline}>
  <span class="od-wheel-picker--label" class:od-sr-only={inline} id={id}>{label}</span>
  <div
    class="od-wheel-picker--window"
    role="spinbutton"
    tabindex="0"
    aria-labelledby={id}
    aria-valuenow={index}
    aria-valuemin={0}
    aria-valuemax={values.length - 1}
    aria-valuetext={values[index]}
    onkeydown={keydown}
  >
    <div class="od-wheel-picker--lines" aria-hidden="true"></div>
    <div class="od-wheel-picker--scroller" bind:this={scroller} {onscroll} aria-hidden="true">
      {#each values as text, i (i)}
        {@const distance = Math.abs(i - position)}
        <div
          class="od-wheel-picker--item"
          class:od-wheel-picker--current={distance < 0.5}
          style:opacity={distance < 0.5 ? 1 : distance < 1.5 ? 0.6 : distance < 2.5 ? 0.3 : 0.15}
        >
          {text}
        </div>
      {/each}
    </div>
  </div>
  {#if defaultText}<span class="od-wheel-picker--default">{defaultText}</span>{/if}
</div>

<style>
  @layer od.components {
    .od-wheel-picker--wheel {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .od-wheel-picker--label {
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .od-wheel-picker--window {
      position: relative;
      width: 100%;
      height: 200px;
      border-radius: 8px;

      &:focus-visible {
        outline: 2px solid var(--od-action);
      }
    }

    .od-wheel-picker--lines {
      position: absolute;
      left: 8px;
      right: 8px;
      top: 80px;
      height: 40px;
      box-sizing: border-box;
      border-top: 2px solid var(--od-text);
      border-bottom: 2px solid var(--od-text);
      pointer-events: none;
    }

    .od-wheel-picker--scroller {
      height: 100%;
      overflow-y: auto;
      scroll-snap-type: y mandatory;
      scrollbar-width: none;
      overscroll-behavior: contain;

      &::before,
      &::after {
        content: '';
        display: block;
        height: 80px;
      }

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .od-wheel-picker--item {
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      scroll-snap-align: center;
      font-size: 18px;
      font-variant-numeric: tabular-nums;
      color: var(--od-text);

      &.od-wheel-picker--current {
        font-size: 22px;
        font-weight: 600;
      }
    }

    /* Inline (the gas tools' pO2 wheel): three values visible, the current one
       framed, on a white surface; docs/mockups/outils-ead-mod-android.dc.html. */
    .od-wheel-picker--inline {
      flex: none;
      width: 96px;

      .od-wheel-picker--window {
        height: 120px;
        overflow: hidden;
      }

      .od-wheel-picker--lines {
        left: 4px;
        right: 4px;
        top: 40px;
      }

      .od-wheel-picker--scroller::before,
      .od-wheel-picker--scroller::after {
        height: 40px;
      }

      .od-wheel-picker--item {
        font-size: 17px;

        &.od-wheel-picker--current {
          font-size: 22px;
        }
      }
    }

    .od-wheel-picker--default {
      font-size: 12px;
      color: var(--od-text-2);
    }
  }
</style>
