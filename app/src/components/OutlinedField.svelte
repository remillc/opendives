<script>
  // @ts-check
  // Material 3 outlined text field, as drawn in the Android mock-ups
  // (sites-edition-android): the label sits on the outline, an optional
  // element at the end (a button, or "automatic"), and a supporting text
  // below, in the alarm colour when the value is invalid.

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   placeholder?: string,
   *   multiline?: boolean,
   *   supporting?: string,
   *   invalid?: boolean,
   *   inputmode?: 'text'|'decimal'|'numeric',
   *   onchange?: () => void,
   *   trailing?: import('svelte').Snippet,
   * }}
   */
  let { label, value = $bindable(), placeholder = '', multiline = false, supporting = '', invalid = false, inputmode = 'text', onchange, trailing } = $props();

  const id = `od-field-${Math.random().toString(36).slice(2, 9)}`;
</script>

<div class="field" class:invalid>
  <div class="box">
    <label class="label" for={id}>{label}</label>
    {#if multiline}
      <textarea {id} rows="2" {placeholder} bind:value {onchange} aria-invalid={invalid}></textarea>
    {:else}
      <input {id} type="text" {inputmode} {placeholder} bind:value {onchange} aria-invalid={invalid} />
    {/if}
    {#if trailing}{@render trailing()}{/if}
  </div>
  {#if supporting}<p class="supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .field {
      margin: 18px 16px 0;
    }

    .box {
      position: relative;
      min-height: 56px;
      padding: 0 12px 0 16px;
      box-sizing: border-box;
      border: 1px solid var(--od-text-2);
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 8px;

      &:focus-within {
        border: 2px solid var(--od-text);
        padding: 0 11px 0 15px;
      }

      .invalid & {
        border-color: var(--od-alarm);
      }
    }

    .label {
      position: absolute;
      left: 12px;
      top: -9px;
      padding: 0 4px;
      background: var(--od-background);
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);

      .box:focus-within & {
        left: 11px;
        top: -10px;
        color: var(--od-text);
      }

      .invalid & {
        color: var(--od-alarm);
      }
    }

    input,
    textarea {
      flex: 1;
      min-width: 0;
      padding: 16px 0;
      border: none;
      outline: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      line-height: 24px;
      font-variant-numeric: tabular-nums;

      &::placeholder {
        color: var(--od-text-2);
        opacity: 0.8;
      }
    }

    textarea {
      resize: none;
      field-sizing: content;
      min-height: 24px;
    }

    .supporting {
      margin: 4px 0 0;
      padding-left: 16px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);

      .invalid & {
        color: var(--od-alarm);
      }
    }
  }
</style>
