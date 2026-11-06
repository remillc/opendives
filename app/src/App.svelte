<script>
  // @ts-check
  // Main navigation (spec, section 3). Phone layout: a top bar on each screen
  // and a side menu with the four sections and Settings. Tablet layout: the
  // bottom bar stands in until the iPad sidebar and the Android rail exist.
  import { onMount } from 'svelte';
  import { App, Views, View, Toolbar, Link } from 'framework7-svelte';
  import Logbook from './pages/Logbook.svelte';
  import DiveDetail from './pages/DiveDetail.svelte';
  import Placeholder from './pages/Placeholder.svelte';
  import Settings from './pages/Settings.svelte';
  import Account from './pages/Account.svelte';
  import Icon from './components/Icon.svelte';
  import AdaptiveLabel from './components/AdaptiveLabel.svelte';
  import NavMenu from './components/NavMenu.svelte';
  import { layout } from './lib/layout.svelte.js';
  import { trackSection } from './lib/navigation.svelte.js';
  import { loadLogbook } from './lib/logbook.svelte.js';
  import { enableBackButton } from './lib/back-button.js';
  import { enableAccessibility } from './lib/accessibility.js';
  import { t } from './lib/i18n.js';

  const f7params = {
    name: 'OpenDives',
    theme: 'auto',
    darkMode: 'auto',
    // Framework7 derives its palette from --od-action (theme.css); the mapped
    // variables in theme.css then take precedence.
    colors: { primary: getComputedStyle(document.documentElement).getPropertyValue('--od-action').trim() },
    routes: [
      { path: '/', component: Logbook },
      { path: '/dive/:id/', component: DiveDetail },
      { path: '/settings/', component: Settings },
      { path: '/account/', component: Account },
      // Not built yet: editing a dive, and the planner prefilled from a dive.
      {
        path: '/dive/:id/edit/',
        component: Placeholder,
        options: { props: { title: t('detail.edit'), text: t('placeholders.editText') } },
      },
      {
        path: '/plan/:id/',
        component: Placeholder,
        options: { props: { title: t('detail.plan'), text: t('placeholders.planText') } },
      },
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
    trackSection();
    loadLogbook();
  });
</script>

<App {...f7params}>
  {#if layout.phone}<NavMenu />{/if}
  <Views tabs class="safe-areas">
    {#if !layout.phone}
    <Toolbar tabbar icons bottom>
      <Link tabLink="#view-logbook" tabLinkActive text={t('tabs.logbook')}><i class="icon"><Icon name="logbook" /></i></Link>
      <Link tabLink="#view-sites" text={t('tabs.sites')}><i class="icon"><Icon name="sites" /></i></Link>
      <Link tabLink="#view-statistics">
        <i class="icon"><Icon name="statistics" /></i>
        <AdaptiveLabel full={t('tabs.statistics')} short={t('tabs.statisticsShort')} />
      </Link>
      <Link tabLink="#view-tools" text={t('tabs.tools')}><i class="icon"><Icon name="tools" /></i></Link>
    </Toolbar>
    {/if}
    <View id="view-logbook" main tab tabActive url="/" />
    <View id="view-sites" tab url="/sites/" />
    <View id="view-statistics" tab url="/statistics/" />
    <View id="view-tools" tab url="/tools/" />
    <View id="view-account" tab url="/account/" />
  </Views>
</App>
