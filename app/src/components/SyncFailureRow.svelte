<script>
  // @ts-check
  // The sync failure in the Logbook's header band and the side menu's sync card
  // (spec, "Sync failures"): touching it opens <SyncFailureSheet>. With `conflict`, the
  // same row says that sync is stopped by a conflict left for later; touching it
  // closes the menu and reopens the conflict dialog (spec, "Sync conflict dialog").
  import Icon from './Icon.svelte';
  import SyncPill from './SyncPill.svelte';
  import { logbook, reopenConflict } from '../lib/logbook.svelte.js';
  import { conflictDiveCount } from '../lib/conflict-choices.js';
  import { closeMenu } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ pill?: boolean, conflict?: boolean }} */
  let { pill = false, conflict = false } = $props();

  function open() {
    if (!conflict) {
      logbook.syncFailureOpen = true;
      return;
    }
    closeMenu();
    reopenConflict();
  }

  const text = $derived.by(() => {
    if (conflict) {
      const dives = conflictDiveCount(logbook.conflict);
      return dives ? t('conflict.stoppedDives', { n: dives }) : t('conflict.stopped');
    }
    if (logbook.syncFailure !== 'server') return t(`sync.failure.${logbook.syncFailure}.row`);
    return logbook.retryMinutes ? t('sync.failure.server.row', { n: logbook.retryMinutes }) : t('sync.failure.server.rowManual');
  });
</script>

{#if pill}
  <SyncPill icon={conflict ? 'sync' : 'warning'} {text} onclick={open} />
{:else}
  <button type="button" class="failure" aria-haspopup="dialog" onclick={open}>
    <Icon name={conflict ? 'sync' : 'warning'} size={18} weight={2} />
    <span class="text">{text}</span>
    <Icon name="chevron" size={18} weight={2} />
  </button>
{/if}

<style>
  @layer od.components {
    .failure {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 40px;
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: var(--od-pending);
      font: inherit;
      font-size: 14px;
      line-height: 20px;
      text-align: left;
      cursor: pointer;

      :global(.ios) & {
        font-size: 13px;
      }
    }

    .text {
      flex: 1;
      min-width: 0;
    }
  }
</style>
