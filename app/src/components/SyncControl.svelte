<script>
  // @ts-check
  // "Sync now" as the side menu and Account offer it: the plain button while
  // sync is automatic; a split button while it is manual, whose chevron offers
  // to switch to automatic sync and to see the changes not sent yet (they are
  // marked on the dives of the Logbook, which opens).
  import SyncButton from './SyncButton.svelte';
  import SplitButton from './SplitButton.svelte';
  import MenuItem from './MenuItem.svelte';
  import { logbook, setAutoSync } from '../lib/logbook.svelte.js';
  import { closeMenu, showSection } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';
</script>

{#if logbook.autoSync}
  <SyncButton />
{:else}
  <SplitButton label={t('account.syncOptions')}>
    {#snippet lead()}<SyncButton />{/snippet}
    {#snippet menu()}
      <MenuItem icon="cloud" text={t('account.syncGoAuto')} onclick={() => setAutoSync(true)} />
      <MenuItem
        icon="logbook"
        text={t('account.syncShowPending')}
        onclick={() => {
          closeMenu();
          showSection('logbook');
        }}
      />
    {/snippet}
  </SplitButton>
{/if}
