<script>
  // @ts-check
  // "Sync now", wherever it is offered (side menu, Account): a tonal button
  // whose background fills from left to right with the sync's progress
  // (lib/sync-progress.js), its label unchanged so that it keeps its size and
  // nothing around it moves; then a snackbar says it is done, or why not.
  // Until the core gives a first stage (and when there is nothing to
  // exchange, it may give none), a bar sweeps across the button; at the end
  // it fills to 100 % for a moment, so that a quick sync is seen too.
  import { showSnackbar } from '../lib/snackbar.js';
  import { logbook, syncNow } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** From the tap to the snackbar: this button's own sync. */
  let busy = $state(false);
  /** The last moment, filled to 100 %. */
  let finishing = $state(false);

  const running = $derived(busy || logbook.sync === 'syncing');
  const fraction = $derived(finishing ? 1 : (logbook.syncProgress?.fraction ?? 0));
  const known = $derived(finishing || (logbook.sync === 'syncing' && !!logbook.syncProgress));
  const percent = $derived(Math.round(fraction * 100));

  const wait = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

  async function sync() {
    busy = true;
    const started = Date.now();
    const outcome = await syncNow();
    // Seen at least a moment, then full when it succeeded.
    await wait(Math.max(0, 500 - (Date.now() - started)));
    if (outcome === 'done') {
      finishing = true;
      await wait(350);
    }
    busy = false;
    finishing = false;
    showSnackbar(t(`sync.outcome.${outcome}`), { timeout: outcome === 'done' ? 4000 : 6000 });
  }
</script>

<button
  type="button"
  class="od-tonal-button sync-button"
  disabled={logbook.loading || running}
  aria-busy={running}
  onclick={sync}
>
  {#if running}
    {#if known}
      <span class="fill" style:width="{percent}%" aria-hidden="true"></span>
    {:else}
      <span class="sweep" aria-hidden="true"></span>
    {/if}
  {/if}
  <span class="label">{t('account.syncNow')}</span>
  {#if running}<span class="od-sr-only">, {known ? `${percent} %` : t('sync.syncing')}</span>{/if}
</button>

<style>
  @layer od.components {
    .sync-button {
      position: relative;
      overflow: hidden;

      /* Running: shown as busy, not as unavailable. */
      &:disabled[aria-busy='true'] {
        opacity: 1;
      }
    }

    .fill,
    .sweep {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      background: color-mix(in srgb, var(--od-on-tint) 24%, transparent);
    }

    .fill {
      transition: width 200ms linear;
    }

    /* Before the first stage: a bar a third as wide sweeps across. */
    .sweep {
      width: 35%;
      background: linear-gradient(
        90deg,
        transparent,
        color-mix(in srgb, var(--od-on-tint) 24%, transparent) 30%,
        color-mix(in srgb, var(--od-on-tint) 24%, transparent) 70%,
        transparent
      );
      animation: od-sync-sweep 1100ms ease-in-out infinite;
    }

    @keyframes od-sync-sweep {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(290%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .sweep {
        animation: none;
        width: 100%;
        opacity: 0.5;
      }
    }

    .label {
      position: relative;
    }
  }
</style>
