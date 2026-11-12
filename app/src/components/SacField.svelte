<script>
  // @ts-check
  import { tick } from 'svelte';
  import DropdownArrow from './DropdownArrow.svelte';
  import { opensUp, moveActive } from '../lib/select-menu.js';
  import { locale } from '../lib/format.js';
  import { sacPresets, sacPresetText, parseSac, sacText } from '../lib/sac-field.js';
  // A SAC (task 71; mock-up android-planificateur-sac): the MD3 filled field with
  // its downward chevron, but editable. A combobox: the chevron or a tap opens
  // the list of presets (0 to 2 cuft/min, 0 to 60 L/min), typing is allowed. A
  // typed value is kept with up to two decimals and clamped to the presets' range
  // (lib/sac-field.js); it need not be a preset. While the list is open, the helper
  // text says so. The value is in ml/min.

  /**
   * @type {{
   *   label: string,
   *   value: number,
   *   cuft: boolean,
   *   unit: string,
   *   ariaLabel: string,
   *   helper: string,
   *   openLabel: string,
   *   onchange: (ml: number) => void,
   * }}
   * unit: shown after the number ("cuft/min"). ariaLabel: the name with the
   * current value. openLabel: the name of the chevron button.
   */
  let { label, value, cuft, unit, ariaLabel, helper, openLabel, onchange } = $props();

  const id = `od-sac-${Math.random().toString(36).slice(2, 9)}`;
  let open = $state(false);
  let focused = $state(false);
  let text = $state('');
  let active = $state(-1);
  let place = $state({ left: 0, width: 0, top: /** @type {number|undefined} */ (undefined), bottom: /** @type {number|undefined} */ (undefined), maxHeight: 336 });
  /** @type {HTMLDivElement|undefined} */
  let root = $state();
  /** @type {HTMLDivElement|undefined} */
  let box = $state();
  /** @type {HTMLUListElement|undefined} */
  let menu = $state();
  /** @type {HTMLInputElement|undefined} */
  let input = $state();

  const presets = $derived(sacPresets(cuft));

  // The text follows the value, except while it is being typed.
  $effect(() => {
    const ml = value;
    if (!focused) text = sacText(ml, cuft, locale);
  });

  async function show() {
    if (open) return;
    active = presets.findIndex((p) => p.ml === value);
    open = true;
    await tick();
    position();
  }

  function position() {
    const rect = box?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const height = menu?.offsetHeight || presets.length * 48 + 16;
    const up = opensUp(below, above, height);
    place = {
      left: rect.left,
      width: rect.width,
      top: up ? undefined : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: Math.max(120, Math.min(336, (up ? above : below) - 4)),
    };
  }

  /** @param {HTMLElement} node */
  function portal(node) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function close() {
    open = false;
  }

  /** The typed value is kept: the text shows what was kept. */
  function commit() {
    const ml = parseSac(text, cuft);
    if (ml !== null && ml !== value) onchange(ml);
    text = sacText(ml ?? value, cuft, locale);
  }

  /** A valid text updates the plan as it is typed, the text itself stays as typed. */
  function typed() {
    const ml = parseSac(text, cuft);
    if (ml !== null && ml !== value) onchange(ml);
    if (!open) show();
  }

  /** @param {number} ml */
  function pick(ml) {
    close();
    if (ml !== value) onchange(ml);
    text = sacText(ml, cuft, locale);
    input?.focus();
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) show();
      else active = moveActive(active, e.key, presets.length);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0) pick(presets[active].ml);
      else {
        commit();
        close();
      }
    } else if (e.key === 'Tab') {
      close();
    }
  }

  /** @param {PointerEvent} e */
  function outside(e) {
    const target = /** @type {Node} */ (e.target);
    if (open && !root?.contains(target) && !menu?.contains(target)) close();
  }

  /** @param {Event} e */
  function moved(e) {
    if (open && !(e.target instanceof Node && menu?.contains(e.target))) position();
  }

  // The system Back key (lib/back-button.js) closes the list.
  $effect(() => {
    const el = root;
    if (!el) return;
    const cancel = () => close();
    el.addEventListener('od-cancel', cancel);
    return () => el.removeEventListener('od-cancel', cancel);
  });
</script>

<svelte:window onpointerdown={outside} onresize={moved} />
<svelte:document onscrollcapture={moved} />

<div class="od-sac-field od-sac-field--field" class:od-sac-field--open={open} class:od-sac-field--focused={focused} bind:this={root}>
  <div class="od-sac-field--box" bind:this={box}>
    <label class="od-sac-field--label" for={id}>{label}</label>
    <input
      {id}
      bind:this={input}
      bind:value={text}
      class="od-sac-field--input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls="{id}-list"
      aria-autocomplete="none"
      aria-label={ariaLabel}
      onfocus={() => (focused = true)}
      onblur={() => {
        focused = false;
        commit();
      }}
      onclick={show}
      oninput={typed}
      onkeydown={keydown}
    />
    <span class="od-sac-field--unit" aria-hidden="true">{unit}</span>
    <button type="button" class="od-sac-field--chevron" tabindex="-1" aria-label={openLabel} onmousedown={(e) => e.preventDefault()} onclick={() => (open ? close() : (input?.focus(), show()))}>
      <span class="od-sac-field--arrow"><DropdownArrow /></span>
    </button>
    {#if open}
      <ul
        class="od-sac-field--menu"
        id="{id}-list"
        role="listbox"
        aria-label={ariaLabel}
        use:portal
        bind:this={menu}
        style:left="{place.left}px"
        style:width="{place.width}px"
        style:top={place.top === undefined ? 'auto' : place.top + 'px'}
        style:bottom={place.bottom === undefined ? 'auto' : place.bottom + 'px'}
        style:max-height="{place.maxHeight}px"
      >
        {#each presets as preset, i (preset.unit)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            role="option"
            aria-selected={preset.ml === value}
            class="od-sac-field--option"
            class:od-sac-field--active={i === active}
            onmousedown={(e) => e.preventDefault()}
            onclick={() => pick(preset.ml)}
          >{sacPresetText(preset.unit, cuft, locale)} {unit}</li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if open}<p class="od-sac-field--helper">{helper}</p>{/if}
</div>

<style>
  @layer od.components {
    .od-sac-field--field {
      margin: 18px var(--od-field-margin, 16px) 0;
      min-width: 0;
    }

    .od-sac-field--box {
      position: relative;
      height: 56px;
      box-sizing: border-box;
      border-radius: 4px 4px 0 0;
      background: var(--od-surface-2);

      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: var(--od-text-2);
      }

      .od-sac-field--open &::after,
      &:focus-within::after {
        height: 2px;
        background: var(--od-primary-action);
      }

      :global(.ios) & {
        border-radius: 10px;
        background: var(--od-surface);

        &::after {
          display: none;
        }
      }
    }

    .od-sac-field--label {
      position: absolute;
      left: 16px;
      top: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
      pointer-events: none;
    }

    .od-sac-field--open .od-sac-field--label,
    .od-sac-field--focused .od-sac-field--label {
      color: var(--od-primary-action);
    }

    .od-sac-field--input {
      display: block;
      width: 100%;
      height: 100%;
      /* Room at the end for the unit and the chevron. */
      padding: 24px 110px 6px 16px;
      box-sizing: border-box;
      border: none;
      border-radius: inherit;
      outline: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      line-height: 24px;
    }

    .od-sac-field--unit {
      position: absolute;
      right: 52px;
      bottom: 6px;
      font-size: 14px;
      line-height: 24px;
      color: var(--od-text-2);
      pointer-events: none;
    }

    .od-sac-field--chevron {
      position: absolute;
      right: 0;
      top: 4px;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-sac-field--arrow {
      display: flex;
      transition: transform 150ms;

      .od-sac-field--open & {
        transform: rotate(180deg);
      }
    }

    /* The exposed dropdown menu, as SelectField draws it (spec, section 8). */
    .od-sac-field--menu {
      position: fixed;
      z-index: 14000;
      box-sizing: border-box;
      margin: 0;
      padding: 8px 0;
      list-style: none;
      overflow-y: auto;
      overscroll-behavior: contain;
      border-radius: 4px;
      background: var(--od-surface);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15);
    }

    .od-sac-field--option {
      min-height: 48px;
      padding: 0 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text);
      cursor: pointer;

      &.od-sac-field--active {
        background: var(--od-surface-2);
      }

      &[aria-selected='true'] {
        background: var(--od-surface-container-highest);
      }
    }

    .od-sac-field--helper {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }
  }
</style>
