<script>
  // @ts-check
  // Asks before a form with unsaved changes is left (spec, "Leaving a form with
  // unsaved changes"; mock-up android-planificateur-quitter). One per form,
  // inside its <Page>:
  //
  //   <LeaveGuard bind:this={guard} noun="plan" {dirty} {save} {leave} />
  //   <Link onClick={() => guard.attempt()}>   (the ← or ✕ of the top bar)
  //
  // - `dirty()`: the values differ from those at opening (lib/leave-guard.js).
  // - `save()`: the form's own "Enregistrer"; it leaves by itself when it works.
  // - `leave()`: leaves the form, as the ← did before.
  // The Android Back key goes through lib/back-button.js (backThroughGuard).
  // iOS: a dirty page takes `no-swipeback` (Framework7 cannot cancel a swipe
  // back once started), and a swipe from the left edge opens the same dialog;
  // a popup (tablet, sheets) loses its swipe-down and backdrop closing instead.
  import { onMount } from 'svelte';
  import { ios } from '../lib/layout.svelte.js';
  import Md3Dialog from './Md3Dialog.svelte';
  import { registerGuard } from '../lib/leave-guard.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   noun: 'plan'|'dive'|'cylinderType'|'computer'|'filter'|'site'|'statistic',
   *   dirty: () => boolean,
   *   save: () => void,
   *   leave: () => void,
   *   canSave?: () => boolean,
   * }}
   */
  let { noun, dirty, save, leave, canSave = () => true } = $props();

  let asking = $state(false);
  /** @type {HTMLElement|undefined} */
  let marker = $state();

  /** The ← or ✕, Back and the swipe: leave at once, or ask when something changed. */
  export function attempt() {
    if (asking) return;
    if (dirty()) asking = true;
    else leave();
  }

  function stay() {
    asking = false;
  }

  function saveAndLeave() {
    asking = false;
    save();
  }

  function discard() {
    asking = false;
    leave();
  }

  onMount(() => registerGuard({ get marker() { return marker ?? null; }, dirty, attempt }));

  const page = $derived(marker?.closest('.page') ?? null);
  const popup = $derived(/** @type {any} */ (page?.closest('.popup')) ?? null);
  const isDirty = $derived(dirty());

  // iOS swipe back and popup dismissals, off while there is something to lose.
  $effect(() => {
    if (!page) return;
    page.classList.toggle('no-swipeback', isDirty);
    const modal = popup?.f7Modal;
    if (!modal) return;
    const wasSwipe = modal.params.swipeToClose;
    const wasBackdrop = modal.params.closeByBackdropClick;
    if (isDirty) {
      modal.params.swipeToClose = false;
      modal.params.closeByBackdropClick = false;
    }
    return () => {
      modal.params.swipeToClose = wasSwipe;
      modal.params.closeByBackdropClick = wasBackdrop;
    };
  });

  // A swipe to the right from the left edge of a dirty page asks, as the swipe back would have left.
  $effect(() => {
    if (!page || !isDirty || popup || !ios) return;
    const EDGE = 40;
    const DISTANCE = 30;
    let startX = -1;
    let startY = 0;
    /** @param {TouchEvent} e */
    const down = (e) => {
      const touch = e.touches[0];
      startX = touch.clientX <= EDGE && e.touches.length === 1 ? touch.clientX : -1;
      startY = touch.clientY;
    };
    /** @param {TouchEvent} e */
    const move = (e) => {
      if (startX < 0) return;
      const touch = e.touches[0];
      if (touch.clientX - startX > DISTANCE && Math.abs(touch.clientY - startY) < touch.clientX - startX) {
        startX = -1;
        attempt();
      }
    };
    page.addEventListener('touchstart', /** @type {EventListener} */ (down), { passive: true });
    page.addEventListener('touchmove', /** @type {EventListener} */ (move), { passive: true });
    return () => {
      page.removeEventListener('touchstart', /** @type {EventListener} */ (down));
      page.removeEventListener('touchmove', /** @type {EventListener} */ (move));
    };
  });
</script>

<span class="od-leave-guard" bind:this={marker} hidden></span>

{#if asking}
  <Md3Dialog class="od-leave-guard--dialog" title={t('leave.title')} text={t(`leave.text.${noun}`)} role="alertdialog" oncancel={stay}>
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button type="button" onclick={stay}>{t('leave.stay')}</button>
      {#if canSave()}<button type="button" onclick={saveAndLeave}>{t('leave.save')}</button>{/if}
      <button type="button" class="od-leave-guard--discard" onclick={discard}>{t('leave.discard')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    :global(.od-md3-dialog--actions) .od-leave-guard--discard {
      color: var(--od-alarm);
    }
  }
</style>
