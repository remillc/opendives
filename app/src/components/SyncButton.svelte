<script>
  // @ts-check
  // "Sync now", wherever it is offered (side menu, Account): a tonal button
  // whose background fills from left to right with the sync's progress
  // (lib/sync-progress.js), its label unchanged so that it keeps its size and
  // nothing around it moves; then a snackbar says it is done, or why not.
  import { f7 } from 'framework7-svelte';
  import { logbook, syncNow } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  const running = $derived(logbook.sync === 'syncing');
  const percent = $derived(running ? Math.round((logbook.syncProgress?.fraction ?? 0) * 100) : 0);

  async function sync() {
    const outcome = await syncNow();
    f7.toast
      .create({
        text: t(`sync.outcome.${outcome}`),
        cssClass: 'od-sync-toast',
        closeTimeout: outcome === 'done' ? 3000 : 6000,
        position: 'bottom',
      })
      .open();
  }
</script>

<button
  type="button"
  class="od-tonal-button sync-button"
  disabled={logbook.loading || running}
  aria-busy={running}
  onclick={sync}
>
  {#if running}<span class="fill" style:width="{percent}%" aria-hidden="true"></span>{/if}
  <span class="label">{t('account.syncNow')}</span>
  {#if running}<span class="od-sr-only">, {percent}&nbsp;%</span>{/if}
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

    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      background: color-mix(in srgb, var(--od-on-tint) 16%, transparent);
      transition: width 200ms linear;
    }

    .label {
      position: relative;
    }
  }
</style>
