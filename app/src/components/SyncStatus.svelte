<script>
  // @ts-check
  // <SyncStatus> (spec, section 4, "EtatSynchro"): one line under the Logbook
  // title, never a window. An icon always goes with the color.
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   sync: import('../lib/logbook.svelte.js').SyncState,
   *   live?: boolean,
   *   pending?: number,
   *   progress?: import('../lib/sync-progress.js').SyncProgress|null,
   *   steady?: boolean,
   * }}
   * `live`: announced when it changes; false for the copy in the side menu.
   * `pending`: changes not sent, for the manual and offline states.
   * `progress`: while syncing, the stage and a determinate bar (to-do #12),
   * in the bottom padding: the line keeps its height (to-do #2).
   * `steady`: room for two lines of text, whatever the state says, so that
   * what is under it never moves (narrow side menu).
   */
  let { sync, live = true, pending = 0, progress = null, steady = false } = $props();

  const showProgress = $derived(sync === 'syncing' && !!progress);
  const percent = $derived(progress ? Math.round(progress.fraction * 100) : 0);

  /** @type {Record<string, {icon: 'check'|'offline'|'device'|'sync'|'cloud', text: string, pending: boolean}>} */
  const states = $derived({
    manual: { icon: 'cloud', text: t('sync.manual', { n: pending }), pending: true },
    syncing: { icon: 'sync', text: t(logbook.mode === 'git' ? 'sync.syncingGit' : 'sync.syncing'), pending: false },
    cloud: { icon: 'check', text: t(logbook.mode === 'git' ? 'sync.cloudGit' : 'sync.cloud'), pending: false },
    offline: {
      icon: 'offline',
      text: pending ? t('sync.offlinePending', { n: pending }) : t('sync.offline'),
      pending: true,
    },
    local: { icon: 'device', text: t('sync.local'), pending: false },
  });
  const state = $derived(states[sync]);
</script>

<div class="od-sync-status" class:od-sync-status--pending={state.pending} class:od-sync-status--steady={steady} role={live ? 'status' : undefined}>
  <div class="od-sync-status--line">
    <Icon name={state.icon} size={18} />
    <!-- The stage is announced, not each percent: the bar carries the value. -->
    <span>{showProgress && progress ? t(`sync.stages.${progress.stage}${progress.stage === 'connect' && logbook.mode === 'git' ? 'Git' : ''}`) : state.text}</span>
    {#if showProgress}<span class="od-sync-status--percent od-value" aria-hidden="true">{percent}&nbsp;%</span>{/if}
  </div>
  {#if showProgress}
    <!-- MD3 linear progress indicator, determinate: 4 dp, rounded. -->
    <div class="od-sync-status--bar" role="progressbar" aria-label={t('sync.syncing')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
      <div class="od-sync-status--fill" style:width="{percent}%"></div>
    </div>
  {/if}
</div>

<style>
  @layer od.components {
    .od-sync-status {
      position: relative;
      padding: 8px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--f7-md-on-surface-variant, var(--f7-list-item-text-text-color));

      :global(.ios) & {
        font-size: 13px;
        color: var(--f7-list-item-text-text-color);
      }

      &.od-sync-status--pending {
        color: var(--od-pending);
      }
    }

    .od-sync-status--line {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Two lines of text in any state: nothing under it moves. */
    .od-sync-status--steady .od-sync-status--line {
      min-height: 40px;
    }

    .od-sync-status--percent {
      margin-left: auto;
    }

    /* In the bottom padding, under the text: the line keeps its height. */
    .od-sync-status--bar {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 2px;
      height: 4px;
      border-radius: 2px;
      background: var(--od-surface-2);
      overflow: hidden;
    }

    .od-sync-status--fill {
      height: 100%;
      border-radius: 2px;
      background: var(--od-action);
      transition: width 200ms linear;
    }
  }
</style>
