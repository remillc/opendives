<script>
  // @ts-check
  // One cylinder of "Edit dive" in a modal bottom sheet
  // (docs/mockups/android-edition-bouteille.dc.html): its drawing, "Cylinder N"
  // and its gas in a chip, the fields (the page's own, passed as content), then
  // "Delete cylinder" on the left and "OK" on the right. It edits the page's
  // form state: nothing is saved before the edit task's Save. Moved under
  // <body> like Md3Dialog, so that it also opens inside the tablet's edit
  // dialog; Escape, the scrim and the system Back close it (lib/back-button.js).
  import CylinderIcon from './CylinderIcon.svelte';
  import { t } from '../lib/i18n.js';
  import { reducedMotion } from '../lib/reduced-motion.js';
  import { dismissesSheet, sheetOffset } from '../lib/sheet-drag.js';

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
      dismiss();
    }
  }

  // Closing: the sheet slides down, then the page closes it. With "Remove
  // animations" it closes at once.
  /** @type {HTMLElement|undefined} */
  let surface = $state();
  let surfaceHeight = $state(0);
  let offset = $state(0);
  let dragging = $state(false);
  let leaving = $state(false);
  /** A drag moved the sheet: the click that ends it does not also close it. */
  let moved = false;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  function dismiss() {
    if (leaving) return;
    if (reducedMotion() || !surface) {
      onclose();
      return;
    }
    leaving = true;
    offset = surface.offsetHeight;
    setTimeout(onclose, 200);
  }

  /**
   * The handle's touches stay its own: Framework7 follows every touch on the
   * document, and after one that moved without a click (a drag) it drops the
   * next click anywhere, so the next tap after closing the sheet did nothing.
   * @param {HTMLElement} node
   */
  function ownTouches(node) {
    /** @param {TouchEvent} e */
    const stop = (e) => e.stopPropagation();
    const kinds = /** @type {const} */ (['touchstart', 'touchmove', 'touchend', 'touchcancel']);
    for (const kind of kinds) node.addEventListener(kind, stop, { passive: true });
    return {
      destroy() {
        for (const kind of kinds) node.removeEventListener(kind, stop);
      },
    };
  }

  /** @param {PointerEvent} e */
  function dragStart(e) {
    if (leaving) return;
    /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
    dragging = true;
    moved = false;
    surfaceHeight = surface?.offsetHeight ?? 0;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
  }

  /** @param {PointerEvent} e */
  function dragMove(e) {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 6) moved = true;
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = e.timeStamp;
    offset = sheetOffset(dy);
  }

  /** @param {PointerEvent} e */
  function dragEnd(e) {
    if (!dragging) return;
    dragging = false;
    if (moved && dismissesSheet(e.clientY - startY, velocity, surfaceHeight)) dismiss();
    else offset = 0;
    // The click that follows a drag is ignored; the next tap closes again.
    setTimeout(() => (moved = false), 0);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="od-cylinder-sheet modal-in" use:portal onkeydown={keydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="od-cylinder-sheet--scrim" onclick={dismiss} style:opacity={dragging ? 1 - Math.min(1, Math.max(0, offset) / (surfaceHeight || 1)) : undefined}></div>
  <div
    class="od-cylinder-sheet--surface"
    class:od-cylinder-sheet--dragging={dragging}
    class:od-cylinder-sheet--leaving={leaving}
    role="dialog"
    aria-modal="true"
    aria-labelledby={id}
    tabindex="-1"
    bind:this={surface}
    style:transform={offset ? `translateY(${offset}px)` : undefined}
  >
    <!-- The M3 drag handle: a tap closes the sheet, a drag down closes it too. -->
    <button
      type="button"
      class="od-cylinder-sheet--grab"
      aria-label={t('dialog.close')}
      onclick={() => {
        if (!moved) dismiss();
      }}
      onpointerdown={dragStart}
      onpointermove={dragMove}
      onpointerup={dragEnd}
      onpointercancel={dragEnd}
      use:ownTouches
    >
      <span class="od-cylinder-sheet--handle" aria-hidden="true"></span>
    </button>
    <div class="od-cylinder-sheet--body">
      <div class="od-cylinder-sheet--head">
        <CylinderIcon />
        <h2 {id} class="od-cylinder-sheet--title">{t('edit.cylinderTitle', { n })}</h2>
        <span class="od-cylinder-sheet--gas od-value">{gas}</span>
      </div>
      <div class="od-cylinder-sheet--fields">{@render children()}</div>
    </div>
    <div class="od-cylinder-sheet--actions">
      <button type="button" class="od-cylinder-sheet--delete" onclick={ondelete}>{t('edit.deleteCylinder')}</button>
      <span class="od-cylinder-sheet--spacer"></span>
      <button type="button" class="od-cylinder-sheet--ok" onclick={dismiss}>{t('dialog.ok')}</button>
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

    /* Back to its place, or down off screen when closing. */
    .od-cylinder-sheet--surface {
      transition: transform 0.2s var(--od-motion-spatial-fast, ease-out);

      &.od-cylinder-sheet--dragging {
        transition: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-cylinder-sheet--surface {
        transition: none;
      }
    }

    /* The handle's touch target: 48 dp high across the top of the sheet. */
    .od-cylinder-sheet--grab {
      flex: none;
      align-self: center;
      width: 96px;
      height: 36px;
      margin: -8px 0 4px;
      padding: 0;
      border: none;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      cursor: grab;

      &:focus-visible {
        outline: 2px solid var(--od-text);
        outline-offset: -2px;
        border-radius: 8px;
      }
    }

    .od-cylinder-sheet--handle {
      width: 32px;
      height: 4px;
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
