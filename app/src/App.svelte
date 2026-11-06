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
  import DeleteAccount from './pages/DeleteAccount.svelte';
  import EditDive from './pages/EditDive.svelte';
  import Trip from './pages/Trip.svelte';
  import Sites from './pages/Sites.svelte';
  import SiteSheet from './pages/SiteSheet.svelte';
  import SiteEdit from './pages/SiteEdit.svelte';
  import DivesWithoutSite from './pages/DivesWithoutSite.svelte';
  import SitesCleanup from './pages/SitesCleanup.svelte';
  import Icon from './components/Icon.svelte';
  import AdaptiveLabel from './components/AdaptiveLabel.svelte';
  import NavMenu from './components/NavMenu.svelte';
  import Welcome from './components/Welcome.svelte';
  import { layout } from './lib/layout.svelte.js';
  import { trackSection } from './lib/navigation.svelte.js';
  import { logbook, loadLogbook } from './lib/logbook.svelte.js';
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
    // Framework7's own dialog buttons are in English.
    dialog: { buttonOk: t('dialog.ok'), buttonCancel: t('dialog.cancel') },
    routes: [
      { path: '/', component: Logbook },
      { path: '/dive/:id/', component: DiveDetail },
      { path: '/settings/', component: Settings },
      { path: '/account/', component: Account },
      { path: '/account/delete/', component: DeleteAccount },
      // Not built yet: the planner prefilled from a dive.
      { path: '/dive/:id/edit/', component: EditDive },
      { path: '/trip/:id/', component: Trip },
      {
        path: '/plan/:id/',
        component: Placeholder,
        options: { props: { title: t('detail.plan'), text: t('placeholders.planText') } },
      },
      { path: '/sites/', component: Sites },
      { path: '/sites/without/', component: DivesWithoutSite },
      { path: '/sites/cleanup/', component: SitesCleanup },
      { path: '/site/new/', component: SiteEdit },
      { path: '/site/:uuid/', component: SiteSheet },
      { path: '/site/:uuid/edit/', component: SiteEdit },
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
    // After signing out, first launch is shown and nothing is loaded until a choice.
    if (!logbook.welcome) loadLogbook();
  });
</script>

<App {...f7params}>
  {#if layout.phone}<NavMenu />{/if}
  <Welcome />
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
