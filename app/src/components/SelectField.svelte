<script>
  // @ts-check
  import DropdownArrow from './DropdownArrow.svelte';
  import Icon from './Icon.svelte';
  // One value chosen in a short list: the MD3 filled field with a ▾ at the end
  // (spec, section 1, "Text fields"), on the system's own choice list. The
  // label is always small above the value.

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   options: { value: string, label: string }[],
   *   supporting?: string,
   *   disabled?: boolean,
   *   onchange?: (value: string) => void,
   *   clearLabel?: string,
   * }}
   */
  let { label, value = $bindable(), options, supporting = '', disabled = false, onchange, clearLabel = '' } = $props();

  /** With `clearLabel` and a value: a ✕ sets the field back to the empty choice. */
  function clear() {
    value = '';
    onchange?.(value);
  }

  const id = `od-select-${Math.random().toString(36).slice(2, 9)}`;
</script>

<div class="od-select-field od-select-field--field" class:disabled>
  <div class="od-select-field--box">
    <label class="od-select-field--label" for={id}>{label}</label>
    <select {id} {disabled} class:od-select-field--clearable={clearLabel && value} bind:value onchange={() => onchange?.(value)}>
      {#each options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
    </select>
    {#if clearLabel && value}
      <button type="button" class="od-select-field--clear" aria-label={clearLabel} onclick={clear}><Icon name="close" size={20} /></button>
    {/if}
    <span class="od-select-field--arrow"><DropdownArrow /></span>
  </div>
  {#if supporting}<p class="od-select-field--supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .od-select-field--field {
      margin: 18px var(--od-field-margin, 16px) 0;
    }

    .od-select-field--field.disabled {
      opacity: 0.38;
    }

    .od-select-field--box {
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

    .od-select-field--label {
      position: absolute;
      left: 16px;
      top: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
      pointer-events: none;
    }

    select {
      width: 100%;
      height: 100%;
      padding: 24px 48px 6px 16px;
      box-sizing: border-box;
      border: none;
      outline: none;
      background: none;
      appearance: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      line-height: 24px;

      &.od-select-field--clearable {
        padding-right: 92px;
      }
    }

    /* 48 dp target, 20 dp icon, before the arrow. */
    .od-select-field--clear {
      position: absolute;
      right: 40px;
      top: 4px;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-select-field--arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      pointer-events: none;
      color: var(--od-text-2);
    }

    .od-select-field--supporting {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }
  }
</style>
