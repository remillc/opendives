<script>
  // @ts-check
  // <SyncStatus> (spec, section 4, "EtatSynchro"): one line under the Logbook
  // title, never a window. An icon always goes with the color.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   sync: import('../lib/logbook.svelte.js').SyncState,
   *   live?: boolean,
   *   pending?: number,
   * }}
   * `live`: announced when it changes; false for the copy in the side menu.
   * `pending`: changes not sent, for the manual synchronisation state.
   */
  let { sync, live = true, pending = 0 } = $props();

  /** @type {Record<string, {icon: 'check'|'offline'|'device'|'sync'|'cloud', text: string, pending: boolean}>} */
  const states = $derived({
    manual: { icon: 'cloud', text: t('sync.manual', { n: pending }), pending: true },
    syncing: { icon: 'sync', text: t('sync.syncing'), pending: false },
    cloud: { icon: 'check', text: t('sync.cloud'), pending: false },
    offline: { icon: 'offline', text: t('sync.offline'), pending: true },
    local: { icon: 'device', text: t('sync.local'), pending: false },
  });
  const state = $derived(states[sync]);
</script>

<div class="sync-status" class:pending={state.pending} role={live ? 'status' : undefined}>
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
