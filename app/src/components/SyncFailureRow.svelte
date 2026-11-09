<script>
  // @ts-check
  // The sync failure in the Logbook's status row and the side menu's sync card
  // (spec, "Sync failures"): touching it opens <SyncFailureSheet>.
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  const text = $derived.by(() => {
    if (logbook.syncFailure !== 'server') return t(`sync.failure.${logbook.syncFailure}.row`);
    return logbook.retryMinutes ? t('sync.failure.server.row', { n: logbook.retryMinutes }) : t('sync.failure.server.rowManual');
  });
</script>

<button type="button" class="failure" aria-haspopup="dialog" onclick={() => (logbook.syncFailureOpen = true)}>
  <Icon name="warning" size={18} weight={2} />
  <span class="text">{text}</span>
  <Icon name="chevron" size={18} weight={2} />
</button>

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
