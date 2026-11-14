<script>
  // @ts-check
  // Android phone: the account avatar at the right of a section's top bar, before the page's ⋮
  // (task 2026-11-14-120). A 32 dp circle with the account's initial (the generic account icon
  // without an account) in a 48 dp target; it opens the account sheet. A small badge says that
  // something waits: changes not sent or a map update (tertiary), a sync error (alarm).
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { bottomNav } from '../lib/layout.svelte.js';
  import { updatesCount } from '../lib/offline-maps.svelte.js';
  import { t } from '../lib/i18n.js';

  const initial = $derived(logbook.email ? logbook.email.trim().charAt(0).toLocaleUpperCase() : '');
  /** '' when nothing waits; else the badge's role. */
  const badge = $derived(
    logbook.syncFailure || (logbook.conflict && logbook.conflictLater) ? 'alarm' : logbook.pending > 0 || updatesCount() > 0 ? 'waiting' : '',
  );
  const label = $derived(t('nav.accountLabel', { name: logbook.email || t('menu.noAccount') }));
</script>

{#if bottomNav()}
  <button type="button" class="od-account-avatar" aria-label={label} aria-haspopup="dialog" onclick={() => (navigation.accountOpen = true)}>
    <span class="od-account-avatar--circle">
      {#if initial}{initial}{:else}<Icon name="account" size={20} weight={2} />{/if}
    </span>
    {#if badge}<span class="od-account-avatar--badge od-account-avatar--{badge}" aria-hidden="true"></span>{/if}
  </button>
{/if}

<style>
  @layer od.components {
    .od-account-avatar {
      position: relative;
      flex: none;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      border-radius: 24px;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .od-account-avatar--circle {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      background: var(--od-band-control);
      color: var(--od-nav-avatar-ink);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
      font-weight: 600;
    }

    /* A small dot at the top right of the circle; its meaning is also in the sheet, in words. */
    .od-account-avatar--badge {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 10px;
      height: 10px;
      border-radius: 5px;
      box-shadow: 0 0 0 2px var(--od-band-control);

      &.od-account-avatar--waiting {
        background: var(--od-tertiary);
      }

      &.od-account-avatar--alarm {
        background: var(--od-alarm);
      }
    }
  }
</style>
