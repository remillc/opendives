<script>
  // @ts-check
  // Main navigation (spec, section 3): bottom navigation bar with four
  // sections; the Logbook opens the dive detail full screen.
  import { onMount } from 'svelte';
  import { App, Views, View, Toolbar, Link } from 'framework7-svelte';
  import Logbook from './pages/Logbook.svelte';
  import DiveDetail from './pages/DiveDetail.svelte';
  import Placeholder from './pages/Placeholder.svelte';
  import Icon from './components/Icon.svelte';
  import AdaptiveLabel from './components/AdaptiveLabel.svelte';
  import { loadLogbook } from './lib/logbook.svelte.js';
  import { enableBackButton } from './lib/back-button.js';
  import { enableAccessibility } from './lib/accessibility.js';
  import { t } from './lib/i18n.js';

  const f7params = {
    name: 'OpenDives',
    theme: 'auto',
    darkMode: 'auto',
    colors: { primary: '#1E4D3A' },
    routes: [
      { path: '/', component: Logbook },
      { path: '/dive/:id/', component: DiveDetail },
      {
        path: '/sites/',
        component: Placeholder,
        options: { props: { title: t('tabs.sites'), text: t('placeholders.sitesText') } },
      },
      {
        path: '/statistics/',
        component: Placeholder,
        options: { props: { title: t('tabs.statistics'), text: t('placeholders.statisticsText') } },
      },
      {
        path: '/tools/',
        component: Placeholder,
        options: { props: { title: t('tabs.tools'), text: t('placeholders.toolsText') } },
      },
    ],
  };

  onMount(() => {
    enableBackButton();
    enableAccessibility();
    loadLogbook();
  });
</script>

<App {...f7params}>
  <Views tabs class="safe-areas">
    <Toolbar tabbar icons bottom>
      <Link tabLink="#view-logbook" tabLinkActive text={t('tabs.logbook')}><i class="icon"><Icon name="logbook" /></i></Link>
      <Link tabLink="#view-sites" text={t('tabs.sites')}><i class="icon"><Icon name="sites" /></i></Link>
      <Link tabLink="#view-statistics">
        <i class="icon"><Icon name="statistics" /></i>
        <AdaptiveLabel full={t('tabs.statistics')} short={t('tabs.statisticsShort')} />
      </Link>
      <Link tabLink="#view-tools" text={t('tabs.tools')}><i class="icon"><Icon name="tools" /></i></Link>
    </Toolbar>
    <View id="view-logbook" main tab tabActive url="/" />
    <View id="view-sites" tab url="/sites/" />
    <View id="view-statistics" tab url="/statistics/" />
    <View id="view-tools" tab url="/tools/" />
  </Views>
</App>
