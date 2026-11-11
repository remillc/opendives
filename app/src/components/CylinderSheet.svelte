<script>
  // @ts-check
  // One cylinder of "Edit dive" in a modal bottom sheet
  // (docs/mockups/android-edition-bouteille.dc.html): its drawing, "Cylinder N"
  // and its gas in a chip, the fields (the page's own, passed as content), then
  // "Delete cylinder" on the left and "OK" on the right. It edits the page's
  // form state: nothing is saved before the edit task's Save. Moved under
  // <body> like Md3Dialog, so that it also opens inside the tablet's edit
  // dialog; Escape, the scrim and the system Back close it (lib/back-button.js).
  import CylinderDrawing from './CylinderDrawing.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   n: number,
   *   gas: string,
   *   ratio: number,
   *   onclose: () => void,
   *   ondelete: () => void,
   *   children: import('svelte').Snippet,
   * }}
   */
  let { n, gas, ratio, onclose, ondelete, children } = $props();

  const id = `od-cylinder-sheet-${Math.random().toString(36).slice(2, 9)}`;

  /** @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      onclose();
    };
    node.addEventListener('od-cancel', cancel);
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
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="od-cylinder-sheet modal-in" use:portal onkeydown={keydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="od-cylinder-sheet--scrim" onclick={onclose}></div>
  <div class="od-cylinder-sheet--surface" role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1">
    <div class="od-cylinder-sheet--handle" aria-hidden="true"></div>
    <div class="od-cylinder-sheet--body">
      <div class="od-cylinder-sheet--head">
        <CylinderDrawing {ratio} width={20} stroke={1.5} />
        <h2 {id} class="od-cylinder-sheet--title">{t('edit.cylinderTitle', { n })}</h2>
        <span class="od-cylinder-sheet--gas od-value">{gas}</span>
      </div>
      <div class="od-cylinder-sheet--fields">{@render children()}</div>
    </div>
    <div class="od-cylinder-sheet--actions">
      <button type="button" class="od-cylinder-sheet--delete" onclick={ondelete}>{t('edit.deleteCylinder')}</button>
      <span class="od-cylinder-sheet--spacer"></span>
      <button type="button" class="od-cylinder-sheet--ok" onclick={onclose}>{t('dialog.ok')}</button>
    </div>
  </div>
</div>

<style>
  @layer od.components {
    .od-cylinder-sheet {
      position: fixed;
      inset: 0;
      z-index: 13400;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      font-family: inherit;
    }

    .od-cylinder-sheet--scrim {
      position: absolute;
      inset: 0;
      background: var(--od-scrim);
    }

    .od-cylinder-sheet--surface {
      position: relative;
      box-sizing: border-box;
      width: min(640px, 100%);
      max-height: calc(100% - 48px);
      display: flex;
      flex-direction: column;
      padding: 8px 0 calc(24px + var(--f7-safe-area-bottom, 0px));
      border-radius: 28px 28px 0 0;
      background: var(--od-dialog);
      color: var(--od-text);
      outline: none;
      --od-field-margin: 0;
    }

    :global(.md) .od-cylinder-sheet--surface {
      animation: od-cylinder-sheet-rise var(--od-motion-spatial-default-ms) var(--od-motion-spatial-default) backwards;
    }

    :global(.md) .od-cylinder-sheet--scrim {
      animation: od-cylinder-sheet-fade var(--od-motion-effects-default-ms) var(--od-motion-effects-default) backwards;
    }

    @keyframes od-cylinder-sheet-rise {
      from {
        transform: translateY(100%);
      }
    }

    @keyframes od-cylinder-sheet-fade {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :global(.md) .od-cylinder-sheet--surface,
      :global(.md) .od-cylinder-sheet--scrim {
        animation: none;
      }
    }

    .od-cylinder-sheet--handle {
      flex: none;
      width: 32px;
      height: 4px;
      margin: 8px auto 16px;
      border-radius: 2px;
      background: var(--od-text-2);
      opacity: 0.4;
    }

    .od-cylinder-sheet--body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0 24px;
    }

    .od-cylinder-sheet--head {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-cylinder-sheet--title {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }

    .od-cylinder-sheet--gas {
      padding: 4px 12px;
      border-radius: 8px;
      background: var(--od-surface-container-highest);
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      white-space: nowrap;
    }

    .od-cylinder-sheet--fields {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-cylinder-sheet--actions {
      flex: none;
      margin: 20px 24px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .od-cylinder-sheet--spacer {
      flex: 1;
    }

    .od-cylinder-sheet--actions button {
      width: auto;
      flex: none;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      white-space: nowrap;
      cursor: pointer;
    }

    .od-cylinder-sheet--delete {
      color: var(--od-alarm);
    }

    .od-cylinder-sheet--actions .od-cylinder-sheet--ok {
      padding: 0 24px;
      background: var(--od-text);
      color: var(--od-background);
    }

    :global(.ios) .od-cylinder-sheet--surface {
      border-radius: 14px 14px 0 0;
    }
  }
</style>
