<script>
  // @ts-check
  // <SyncStatus> (spec, section 4, "EtatSynchro"): one line under the Logbook
  // title, never a window. An icon always goes with the color.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ sync: import('../lib/logbook.svelte.js').SyncState }} */
  let { sync } = $props();

  // No change is possible yet: nothing is waiting to be sent.
  /** @type {Record<string, {icon: 'check'|'offline'|'device', text: string, pending: boolean}>} */
  const states = {
    cloud: { icon: 'check', text: t('sync.cloud'), pending: false },
    offline: { icon: 'offline', text: t('sync.offline'), pending: true },
    local: { icon: 'device', text: t('sync.local'), pending: false },
  };
  const state = $derived(states[sync]);
</script>

<div class="sync-status" class:pending={state.pending} role="status">
  <Icon name={state.icon} size={18} />
  <span>{state.text}</span>
</div>

<style>
  @layer od.components {
    .sync-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--f7-md-on-surface-variant, var(--f7-list-item-text-text-color));

      :global(.ios) & {
        font-size: 13px;
        color: var(--f7-list-item-text-text-color);
      }

      &.pending {
        color: var(--od-pending);
      }
    }
  }
</style>
