<script>
  // @ts-check
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
   *   onchange?: (value: string) => void,
   * }}
   */
  let { label, value = $bindable(), options, supporting = '', onchange } = $props();

  const id = `od-select-${Math.random().toString(36).slice(2, 9)}`;
</script>

<div class="field">
  <div class="box">
    <label class="label" for={id}>{label}</label>
    <select {id} bind:value onchange={() => onchange?.(value)}>
      {#each options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
    </select>
    <span class="arrow"><Icon name="expand" /></span>
  </div>
  {#if supporting}<p class="supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .field {
      margin: 18px var(--od-field-margin, 16px) 0;
    }

    .box {
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

    .label {
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
    }

    .arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      pointer-events: none;
      color: var(--od-text-2);
    }

    .supporting {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }
  }
</style>
