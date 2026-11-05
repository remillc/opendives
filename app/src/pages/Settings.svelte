<script>
  // @ts-check
  // Settings (spec, section 3: they open from the Logbook). Not built yet.
  import { Page, Navbar, Link, Block } from 'framework7-svelte';
  import { t } from '../lib/i18n.js';
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
  <Block><p>{t('settings.comingSoon')}</p></Block>
</Page>
