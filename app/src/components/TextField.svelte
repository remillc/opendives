<script>
  // @ts-check
  // Text field (spec, section 4, "Text fields"): the MD3 filled variant.
  // Surface-container-highest background (--od-surface-2), 4 dp top corners,
  // a 1 dp bottom indicator, 2 dp in the primary colour on focus. The label is
  // inside the field: full size when the field is empty and not focused (no
  // placeholder), small above the value on focus or once there is a value.
  // Helper text under the field; an optional plain icon button at the end.
  // Side margins: 16 dp on the page, 12 dp inside a white surface (set
  // --od-field-margin on the surface).

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   multiline?: boolean,
   *   supporting?: string,
   *   invalid?: boolean,
   *   inputmode?: 'text'|'decimal'|'numeric',
   *   type?: 'text'|'password',
   *   autocomplete?: import('svelte/elements').FullAutoFill,
   *   onchange?: () => void,
   *   trailing?: import('svelte').Snippet,
   * }}
   */
  let {
    label,
    value = $bindable(),
    multiline = false,
    supporting = '',
    invalid = false,
    inputmode = 'text',
    type = 'text',
    autocomplete,
    onchange,
    trailing,
  } = $props();

  let focused = $state(false);
  /** @type {HTMLInputElement|HTMLTextAreaElement|undefined} */
  let input = $state();
  const id = `od-field-${Math.random().toString(36).slice(2, 9)}`;
  const floated = $derived(focused || !!value);
</script>

<div class="field" class:focused class:invalid class:floated class:multiline>
  <!-- A tap anywhere in the field focuses the input. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="box" onclick={() => input?.focus()}>
    <div class="text">
      <label class="label" for={id}>{label}</label>
      {#if multiline}
        <textarea {id} bind:this={input} bind:value {onchange} onfocus={() => (focused = true)} onblur={() => (focused = false)} aria-invalid={invalid}></textarea>
      {:else}
        <input
          {id}
          bind:this={input}
          {type}
          {inputmode}
          {autocomplete}
          bind:value
          {onchange}
          onfocus={() => (focused = true)}
          onblur={() => (focused = false)}
          aria-invalid={invalid}
        />
      {/if}
    </div>
    {#if trailing}<div class="trailing">{@render trailing()}</div>{/if}
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
      min-height: 56px;
      padding: 8px 12px 8px 16px;
      box-sizing: border-box;
      border-radius: 4px 4px 0 0;
      background: var(--od-surface-2);
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: text;

      /* Bottom indicator: 1 dp, then 2 dp in the primary colour on focus. */
      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: var(--od-text-2);
      }

      .focused &::after {
        height: 2px;
        background: var(--od-primary-action);
      }

      .invalid &::after {
        height: 2px;
        background: var(--od-alarm);
      }

      .multiline & {
        min-height: 104px;
        align-items: flex-start;
      }
    }

    /* Room for the small label above the value: 16 + 24 = 40, in 56. */
    .text {
      position: relative;
      flex: 1;
      min-width: 0;
      padding-top: 16px;
    }

    .label {
      position: absolute;
      left: 0;
      top: 16px;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);
      pointer-events: none;
      transition:
        top 150ms,
        font-size 150ms,
        line-height 150ms;

      .floated & {
        top: 0;
        font-size: 12px;
        line-height: 16px;
      }

      .focused & {
        color: var(--od-primary-action);
      }

      .invalid & {
        color: var(--od-alarm);
      }

      /* Multi-line, at rest: on the first line, as the mock-up. */
      .multiline:not(.floated) & {
        top: 8px;
      }
    }

    input,
    textarea {
      display: block;
      width: 100%;
      height: 24px;
      padding: 0;
      border: none;
      outline: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      line-height: 24px;
      font-variant-numeric: tabular-nums;
    }

    textarea {
      height: auto;
      min-height: 72px;
      resize: none;
      field-sizing: content;
    }

    /* Plain icon button at the end (spec: no filled background). */
    .trailing {
      flex: none;
      margin: -8px -8px -8px 0;
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
