<script>
  // @ts-check
  // One row of a choice of one item among several (docs/system-design.md,
  // section 8, "No radio buttons on Android"). Android: no radio button; the
  // chosen row sits on the selected tint with 12 dp corners and a 24 dp check at
  // the start, the others are plain with an empty 24 dp slot so the texts line
  // up. iOS keeps its native radio row (Framework7). Put the rows in a
  // role="radiogroup" element: the arrow keys move and select, as in a radio
  // group.
  import Icon from './Icon.svelte';
  import { theme } from 'framework7-svelte';

  /**
   * `name`: group name of the native radios (iOS).
   * `tinted`: false when a parent paints the selected tint (a row followed by
   * its fields, account import).
   * `class`: extra class of the row.
   * @type {{
   *   selected: boolean,
   *   onselect: () => void,
   *   name: string,
   *   disabled?: boolean,
   *   tinted?: boolean,
   *   class?: string,
   *   children: import('svelte').Snippet,
   * }}
   */
  let { selected, onselect, name, disabled = false, tinted = true, class: extra = '', children } = $props();

  /** Arrow keys move to the next or previous row and select it. */
  function keydown(/** @type {KeyboardEvent} */ event) {
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    if (!forward && !backward) return;
    const row = /** @type {HTMLElement} */ (event.currentTarget);
    const rows = /** @type {HTMLElement[]} */ ([...(row.closest('[role="radiogroup"]')?.querySelectorAll('[role="radio"]') ?? [])]).filter(
      (r) => !r.hasAttribute('disabled'),
    );
    const at = rows.indexOf(row);
    if (at < 0 || rows.length < 2) return;
    event.preventDefault();
    const next = rows[(at + (forward ? 1 : rows.length - 1)) % rows.length];
    next.focus();
    next.click();
  }
</script>

{#if theme.ios}
  <label class="od-choice-row od-choice-row--ios {extra}">
    <span class="radio"><input type="radio" {name} checked={selected} {disabled} onchange={onselect} /><i class="icon-radio"></i></span>
    {@render children()}
  </label>
{:else}
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    {disabled}
    tabindex={selected ? 0 : -1}
    class="od-choice-row {extra}"
    class:od-choice-row--selected={selected && tinted}
    onclick={onselect}
    onkeydown={keydown}
  >
    <span class="od-choice-row--check" aria-hidden="true">{#if selected}<Icon name="check" size={24} weight={2} />{/if}</span>
    {@render children()}
  </button>
{/if}

<style>
  @layer od.components {
    .od-choice-row {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      min-height: 48px;
      box-sizing: border-box;
      padding: 8px;
      border: none;
      border-radius: 12px;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      &:disabled {
        cursor: default;
        opacity: 0.7;
      }

      &:focus-visible {
        outline: 2px solid var(--od-text);
        outline-offset: 2px;
      }

      &.od-choice-row--ios {
        gap: 12px;
        border-radius: 0;
      }
    }

    .od-choice-row--selected {
      background: var(--od-surface-container-highest);
    }

    .od-choice-row--check {
      flex: none;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-text);
    }
  }
</style>
