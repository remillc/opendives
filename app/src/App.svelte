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
  import WelcomeStart from './pages/WelcomeStart.svelte';
  import SignIn from './pages/SignIn.svelte';
  import CreateAccount from './pages/CreateAccount.svelte';
  import BringLogbook from './pages/BringLogbook.svelte';
  import EditDive from './pages/EditDive.svelte';
  import Trip from './pages/Trip.svelte';
  import Sites from './pages/Sites.svelte';
  import SiteSheet from './pages/SiteSheet.svelte';
  import SiteEdit from './pages/SiteEdit.svelte';
  import DivesWithoutSite from './pages/DivesWithoutSite.svelte';
  import SitesCleanup from './pages/SitesCleanup.svelte';
  import SitesUnplaced from './pages/SitesUnplaced.svelte';
  import Statistics from './pages/Statistics.svelte';
  import StatisticsYear from './pages/StatisticsYear.svelte';
  import StatisticsResult from './pages/StatisticsResult.svelte';
  import StatisticNew from './pages/StatisticNew.svelte';
  import Tools from './pages/Tools.svelte';
  import Desaturation from './pages/Desaturation.svelte';
  import Planner from './pages/Planner.svelte';
  import PlannerSetup from './pages/PlannerSetup.svelte';
  import Icon from './components/Icon.svelte';
  import AdaptiveLabel from './components/AdaptiveLabel.svelte';
  import NavMenu from './components/NavMenu.svelte';
  import Welcome from './components/Welcome.svelte';
  import { layout } from './lib/layout.svelte.js';
  import { trackSection } from './lib/navigation.svelte.js';
  import { startApp } from './lib/logbook.svelte.js';
  import { enableBackButton } from './lib/back-button.js';
  import { enableAccessibility } from './lib/accessibility.js';
  import { t } from './lib/i18n.js';
  import { settings, applyDeviceSettings } from './lib/settings.svelte.js';
  import CylinderTypes from './pages/CylinderTypes.svelte';
  import CylinderType from './pages/CylinderType.svelte';

  const f7params = {
    name: 'OpenDives',
    theme: 'auto',
    // Settings, Display, Theme: the device's, or light or dark.
    darkMode: settings.theme === 'system' ? 'auto' : settings.theme === 'dark',
    // Framework7 derives its palette from --od-action (theme.css); the mapped
    // variables in theme.css then take precedence.
    colors: { primary: getComputedStyle(document.documentElement).getPropertyValue('--od-action').trim() },
    // Framework7's own dialog buttons are in English.
    dialog: { buttonOk: t('dialog.ok'), buttonCancel: t('dialog.cancel') },
    routes: [
      { path: '/', component: Logbook },
      { path: '/dive/:id/', component: DiveDetail },
      { path: '/settings/', component: Settings },
      { path: '/settings/cylinders/', component: CylinderTypes },
      { path: '/settings/cylinders/new/', component: CylinderType },
      { path: '/settings/cylinders/type/', component: CylinderType },
      { path: '/account/', component: Account },
      { path: '/account/delete/', component: DeleteAccount },
      // Signing in and creating an account, from the Account screen without an account.
      { path: '/account/sign-in/', component: SignIn },
      { path: '/account/create/', component: CreateAccount },
      // First launch, in the view of its popup (components/Welcome.svelte).
      { path: '/welcome/', component: WelcomeStart },
      { path: '/welcome/sign-in/', component: SignIn },
      { path: '/welcome/create/', component: CreateAccount, options: { props: { welcome: true } } },
      { path: '/welcome/import/', component: BringLogbook },
      { path: '/dive/:id/edit/', component: EditDive },
      { path: '/trip/:id/', component: Trip },
      // The planner: /plan/new/ for a new dive, /plan/<dive id>/ from a logbook dive.
      { path: '/plan/setup/', component: PlannerSetup },
      { path: '/plan/:id/', component: Planner },
      { path: '/sites/', component: Sites },
      { path: '/sites/without/', component: DivesWithoutSite },
      { path: '/sites/cleanup/', component: SitesCleanup },
      { path: '/sites/unplaced/', component: SitesUnplaced },
      { path: '/site/new/', component: SiteEdit },
      { path: '/site/:uuid/', component: SiteSheet },
      { path: '/site/:uuid/edit/', component: SiteEdit },
      { path: '/statistics/', component: Statistics },
      { path: '/statistics/year/:year/', component: StatisticsYear },
      { path: '/statistics/result/', component: StatisticsResult },
      // Android: a full-screen dialog; iPhone: a sheet (the popup pushes the view back).
      { path: '/statistics/new/', popup: { component: StatisticNew } },
      { path: '/tools/', component: Tools },
      { path: '/tools/desaturation/', component: Desaturation },
    ],
  };

  onMount(() => {
    enableBackButton();
    enableAccessibility();
    trackSection();
    // The settings of this device go into the core before anything is read.
    // Then, on the first start and after signing out, first launch is shown
    // and nothing is loaded until a choice.
    applyDeviceSettings().then(() => startApp());
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
