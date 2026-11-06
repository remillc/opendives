<script>
  // @ts-check
  // A choice of the "+" button that this version cannot do yet: downloading
  // from the dive computer (Bluetooth), importing a file (file picker), logging
  // a dive by hand (creating a dive in the core), taking a divelogs.de logbook.
  // Says so plainly, what does not change, and what works meanwhile.
  import { Page, Navbar, Block, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { what: string } } }} */
  let { f7route } = $props();
  const what = ['download', 'import', 'manual', 'divelogs'].includes(f7route.params.what) ? f7route.params.what : 'download';
  /** @type {Record<string, 'download'|'file'|'edit'>} */
  const icons = { download: 'download', import: 'file', manual: 'edit', divelogs: 'download' };
</script>

<Page>
  <Navbar title={t(`addUnavailable.${what}.title`)} backLink={t('common.back')} backLinkShowText={theme.ios} />
  <Block>
    <div class="icon" aria-hidden="true"><Icon name={icons[what]} size={32} /></div>
    <h1 class="od-state-title">{t('addUnavailable.heading')}</h1>
    <p>{t(`addUnavailable.${what}.text`)}</p>
    <p>{t('addUnavailable.nothingChanged')}</p>
    {#if logbook.email && what !== 'divelogs'}<p>{t('addUnavailable.meanwhileCloud')}</p>{/if}
  </Block>
</Page>

<style>
  @layer od.components {
    .icon {
      margin-top: 24px;
      color: var(--od-text-2);
    }
  }
</style>
