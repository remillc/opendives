<script>
  // @ts-check
  // Settings (spec, section 3: they open from the Logbook). For now only the
  // "Development" section, shown in debug builds: the color theme picker.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, List, ListItem, BlockTitle, BlockFooter, Block, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { themes, savedTheme, applyTheme } from '../lib/theme.js';
  import { t } from '../lib/i18n.js';

  let debug = $state(false);
  let current = $state(savedTheme());

  onMount(async () => {
    try {
      debug = (await OpenDivesCore.getAppInfo()).debug;
    } catch (e) {
      console.error('App information', e);
    }
  });

  /** @param {import('../lib/theme.js').ThemeId} id */
  function choose(id) {
    current = id;
    applyTheme(id, f7);
  }
</script>

<Page>
  <Navbar title={t('settings.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if debug}
    <BlockTitle>{t('settings.development')}</BlockTitle>
    <List>
      {#each themes as theme (theme.id)}
        <ListItem
          radio
          name="theme"
          value={theme.id}
          title={t(theme.labelKey)}
          checked={current === theme.id}
          onChange={() => choose(theme.id)}
        />
      {/each}
    </List>
    <BlockFooter>{t('settings.developmentNote')}</BlockFooter>
  {:else}
    <Block><p>{t('settings.comingSoon')}</p></Block>
  {/if}
</Page>
