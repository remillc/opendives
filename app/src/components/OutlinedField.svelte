<script>
  // @ts-check
  // Text field (spec, section 4, "Text fields"): a Framework7 MD outline input
  // with a floating label, as in Framework7's kitchen sink. Empty and not
  // focused, the label fills the field; focused or filled, it moves onto the
  // outline. No placeholder. Helper text under the field; an optional plain
  // icon button at the end. Use inside <div class="list"><ul>…</ul></div> (on
  // the page) or a "list list-strong inset" (on a white surface): Framework7
  // gives the label the background of its container.
  //
  // The state classes (with value, focused) are set here, as Svelte fills the
  // fields without Framework7 knowing.

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
  let { label, value = $bindable(), multiline = false, supporting = '', invalid = false, inputmode = 'text', type = 'text', autocomplete, onchange, trailing } = $props();

  let focused = $state(false);
  const id = `od-field-${Math.random().toString(36).slice(2, 9)}`;
</script>

<li
  class="item-content item-input item-input-outline"
  class:item-input-with-value={!!value}
  class:item-input-focused={focused}
  class:item-input-invalid={invalid}
  class:item-input-with-info={!!supporting}
  class:with-trailing={!!trailing}
>
  <div class="item-inner">
    <label class="item-title item-floating-label" for={id}>{label}</label>
    <div class="item-input-wrap">
      {#if multiline}
        <textarea {id} class="resizable" bind:value {onchange} onfocus={() => (focused = true)} onblur={() => (focused = false)} aria-invalid={invalid}></textarea>
      {:else}
        <input {id} {type} {inputmode} {autocomplete} bind:value {onchange} onfocus={() => (focused = true)} onblur={() => (focused = false)} aria-invalid={invalid} />
      {/if}
      {#if trailing}<div class="trailing">{@render trailing()}</div>{/if}
    </div>
    {#if supporting}<div class="item-input-info">{supporting}</div>{/if}
  </div>
</li>

<style>
  @layer od.components {
    /* Room for the trailing icon button, inside the outline. */
    .with-trailing :is(input, textarea) {
      padding-right: 44px;
    }

    .trailing {
      position: absolute;
      right: 0;
      top: calc(var(--f7-input-height) / 2);
      transform: translateY(-50%);
      z-index: 2;
    }

    textarea {
      min-height: 72px;
    }

    /* The helper text sits under the outline (MD3), not inside it: the
       outline stops above the room Framework7 keeps for it. */
    li.item-input-with-info::after {
      bottom: 26px;
    }

    li.item-input-with-info .item-input-info {
      margin-top: 2px;
    }
  }
</style>
