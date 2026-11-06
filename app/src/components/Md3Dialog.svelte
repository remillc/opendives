<script>
  // @ts-check
  // Basic dialog of Material 3, as the Settings mock-ups draw it
  // (docs/mockups/reglages-*-android.dc.html): 28 dp corners, a 24 sp headline,
  // the content, then text buttons at the bottom right. Moved under <body> so
  // that no page transform can clip it; Escape and the system Back cancel it
  // (lib/back-button.js). On iOS the same dialog with the system's corners.

  /**
   * @type {{
   *   title: string,
   *   text?: string,
   *   oncancel: () => void,
   *   children: import('svelte').Snippet,
   *   actions: import('svelte').Snippet,
   * }}
   */
  let { title, text = '', oncancel, children, actions } = $props();

  const id = `od-dialog-${Math.random().toString(36).slice(2, 9)}`;

  /** @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      oncancel();
    };
    node.addEventListener('od-cancel', cancel);
    // The dialog takes the focus (a screen reader reads its title); Tab then
    // reaches the selected choice, without a focus ring drawn at opening.
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('[role="dialog"]'))?.focus({ preventScroll: true }));
    return {
      destroy() {
        node.removeEventListener('od-cancel', cancel);
        node.remove();
        previous?.focus?.();
      },
    };
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="od-dialog modal-in" use:portal onkeydown={keydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="scrim" onclick={oncancel}></div>
  <div class="surface" role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1">
    <h2 {id}>{title}</h2>
    {#if text}<p class="text">{text}</p>{/if}
    <div class="content">{@render children()}</div>
    <div class="actions">{@render actions()}</div>
  </div>
</div>

<style>
  @layer od.components {
    .od-dialog {
      position: fixed;
      inset: 0;
      z-index: 13500;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
    }

    .scrim {
      position: absolute;
      inset: 0;
      background: var(--od-scrim);
    }

    .surface {
      position: relative;
      box-sizing: border-box;
      width: min(560px, calc(100% - 48px));
      max-height: calc(100% - 96px);
      display: flex;
      flex-direction: column;
      padding: 24px 0 24px;
      border-radius: 28px;
      background: var(--od-dialog);
      color: var(--od-text);
      outline: none;
    }

    h2 {
      margin: 0 24px 16px;
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;
    }

    .text {
      margin: -8px 24px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .actions {
      margin: 10px 12px 0 24px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .actions :global(button) {
      /* Framework7 stretches buttons: text buttons keep their own width. */
      width: auto;
      flex: none;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      white-space: nowrap;
      cursor: pointer;
    }

    .actions :global(.start) {
      margin-right: auto;
    }

    :global(.ios) .surface {
      width: min(400px, calc(100% - 48px));
      border-radius: 14px;
    }

    :global(.ios) h2 {
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
      text-align: center;
    }

    :global(.ios) .actions :global(button) {
      font-size: 17px;
      letter-spacing: 0;
    }
  }
</style>
