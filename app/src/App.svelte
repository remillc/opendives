<script>
  // @ts-check
  // Main navigation (spec, section 3). Phone layout: a top bar on each screen
  // and a side menu with the four sections and Settings. Tablet layout: the
  // iPad sidebar or the Android rail and, in the Logbook, the list and the
  // dive side by side from `splitBreakpoint` (Framework7's master-detail).
  import { onMount } from 'svelte';
  import { App, Views, View } from 'framework7-svelte';
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
  import ConfirmCode from './pages/ConfirmCode.svelte';
  import ImportProgress from './pages/ImportProgress.svelte';
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
  import GasEadMod from './pages/GasEadMod.svelte';
  import GasBestMix from './pages/GasBestMix.svelte';
  import GasBlender from './pages/GasBlender.svelte';
  import Planner from './pages/Planner.svelte';
  import PlannerSetup from './pages/PlannerSetup.svelte';
  import Filter from './pages/Filter.svelte';
  import NewDive from './pages/NewDive.svelte';
  import FilterCriterion from './pages/FilterCriterion.svelte';
  import AddUnavailable from './pages/AddUnavailable.svelte';
  import DownloadFailed from './pages/DownloadFailed.svelte';
  import NavRail from './components/NavRail.svelte';
  import RouteBadge from './components/RouteBadge.svelte';
  /** Development aid: the address of the page on screen (app/.env.local, VITE_SHOW_ROUTE=1). */
  const showRoute = /** @type {any} */ (import.meta).env?.VITE_SHOW_ROUTE === '1';
  import Download from './pages/Download.svelte';
  import NavMenu from './components/NavMenu.svelte';
  import Welcome from './components/Welcome.svelte';
  import { layout, ios, listWidth, splitBreakpoint } from './lib/layout.svelte.js';
  import { trackSection, enableSectionSwipes, enableFullSwipeBack } from './lib/navigation.svelte.js';
  import { enableBackButton } from './lib/back-button.js';
  import { enableAccessibility } from './lib/accessibility.js';
  import { t } from './lib/i18n.js';
  import { mark } from './lib/perf.js';
  import { settings } from './lib/settings.svelte.js';
  import CylinderTypes from './pages/CylinderTypes.svelte';
  import CylinderType from './pages/CylinderType.svelte';
  import About from './pages/About.svelte';
  import AboutText from './pages/AboutText.svelte';
  import AboutLibraries from './pages/AboutLibraries.svelte';

  const f7params = {
    name: 'OpenDives',
    theme: ios ? 'ios' : 'md',
    // Settings, Display, Theme: the device's, or light or dark.
    darkMode: settings.theme === 'system' ? 'auto' : settings.theme === 'dark',
    // Framework7 derives its palette from --od-action (theme.css); the mapped
    // variables in theme.css then take precedence.
    colors: { primary: getComputedStyle(document.documentElement).getPropertyValue('--od-action').trim() },
    // Framework7's own dialog buttons are in English.
    dialog: { buttonOk: t('dialog.ok'), buttonCancel: t('dialog.cancel') },
    // A screen with a back arrow goes back with a swipe to the right, from
    // anywhere on it (not only from the edge); the page follows the finger.
    // Not where the swipe already means something: the dive detail (previous
    // dive), the map, the profile, the wheels (class no-swipeback).
    view: {
      mdSwipeBack: true,
      iosSwipeBack: true,
      mdSwipeBackActiveArea: 10000,
      iosSwipeBackActiveArea: 10000,
      // On Android the pages only slide, like the sections (enableFullSwipeBack).
      mdSwipeBackAnimateOpacity: false,
      mdSwipeBackAnimateShadow: false,
    },
    routes: [
      // The Logbook is the master of a master-detail pair on a wide enough tablet:
      // a dive then opens beside the list, and full screen otherwise.
      { path: '/', component: Logbook, master: true, detailRoutes: [{ path: '/dive/:id', component: DiveDetail }] },
      { path: '/dive/new', component: NewDive },
      { path: '/filter', component: Filter },
      { path: '/filter/:key', component: FilterCriterion },
      { path: '/add/:what', component: AddUnavailable },
      { path: '/download', component: Download },
      { path: '/download/failed', component: DownloadFailed },
      { path: '/settings/', component: Settings },
      { path: '/about', component: About },
      { path: '/about/notes', component: AboutText, options: { props: { which: 'notes' } } },
      { path: '/about/licence', component: AboutText, options: { props: { which: 'licence' } } },
      { path: '/about/privacy', component: AboutText, options: { props: { which: 'privacy' } } },
      { path: '/about/libraries', component: AboutLibraries },
      { path: '/settings/cylinders/', component: CylinderTypes },
      { path: '/settings/cylinders/new', component: CylinderType },
      { path: '/settings/cylinders/type', component: CylinderType },
      { path: '/account', component: Account },
      { path: '/account/delete', component: DeleteAccount },
      // Signing in and creating an account, from the Account screen without an account.
      { path: '/account/sign-in', component: SignIn },
      { path: '/account/create', component: CreateAccount },
      { path: '/account/code', component: ConfirmCode },
      { path: '/account/import', component: BringLogbook },
      { path: '/account/importing', component: ImportProgress },
      // First launch, in the view of its popup (components/Welcome.svelte).
      { path: '/welcome', component: WelcomeStart },
      { path: '/welcome/sign-in', component: SignIn, options: { props: { welcome: true } } },
      { path: '/welcome/create', component: CreateAccount, options: { props: { welcome: true } } },
      { path: '/welcome/code', component: ConfirmCode, options: { props: { welcome: true } } },
      { path: '/welcome/import', component: BringLogbook },
      { path: '/welcome/importing', component: ImportProgress },
      { path: '/dive/:id/edit', component: EditDive },
      // A dive opened from another screen than the Logbook (trip, site, tools):
      // the same screen, without the master-detail routing, which would put a
      // second Logbook in the history.
      { path: '/dives/:id', component: DiveDetail },
      { path: '/trip/:id', component: Trip },
      // The planner: /plan/new/ for a new dive, /plan/<dive id>/ from a logbook dive.
      { path: '/plan/setup', component: PlannerSetup },
      { path: '/plan/:id', component: Planner },
      { path: '/sites/', component: Sites },
      { path: '/sites/without/', component: DivesWithoutSite },
      { path: '/sites/cleanup', component: SitesCleanup },
      { path: '/sites/unplaced/', component: SitesUnplaced },
      { path: '/site/new', component: SiteEdit },
      { path: '/site/:uuid', component: SiteSheet },
      { path: '/site/:uuid/edit', component: SiteEdit },
      { path: '/statistics/', component: Statistics },
      { path: '/statistics/year/:year', component: StatisticsYear },
      { path: '/statistics/result', component: StatisticsResult },
      // Android: a full-screen dialog; iPhone: a sheet (the popup pushes the view back).
      { path: '/statistics/new', popup: { component: StatisticNew } },
      { path: '/tools/', component: Tools },
      { path: '/tools/desaturation', component: Desaturation },
      { path: '/tools/ead-mod', component: GasEadMod },
      { path: '/tools/best-mix', component: GasBestMix },
      { path: '/tools/blender', component: GasBlender },
    ],
  };

  onMount(() => {
    enableBackButton();
    enableAccessibility();
    trackSection();
    enableSectionSwipes();
    enableFullSwipeBack();
    // The settings are applied and the logbook is loaded from main.js, before
    // the screens are built.
    mark('onMount');
  });
</script>

<App {...f7params}>
  {#if layout.phone}<NavMenu />{:else}<NavRail />{/if}
  {#if showRoute}<RouteBadge />{/if}
  <Welcome />
  <Views tabs class="safe-areas {layout.phone ? '' : 'od-tablet'}" style="--f7-page-master-width: {listWidth}px; --od-no-dive: '{t('tablet.noDive')}'">
    <View id="view-logbook" main tab tabActive url="/" masterDetailBreakpoint={splitBreakpoint} />
    <View id="view-sites" tab url="/sites/" />
    <View id="view-statistics" tab url="/statistics/" />
    <View id="view-tools" tab url="/tools/" />
    <View id="view-account" tab url="/account" />
  </Views>
</App>

<style>
  @layer od.components {
    /* Tablet: the views leave room for the sidebar or the rail (NavRail.svelte). */
    :global(.views.od-tablet) {
      /* The rail or sidebar takes the left safe area (camera cut-out in
         landscape): the pages beside it must not add it again. */
      --f7-safe-area-left: 0px;
      margin-left: calc(var(--od-nav-width) + env(safe-area-inset-left));
      width: calc(100% - var(--od-nav-width) - env(safe-area-inset-left));
    }

    /* Logbook, list and dive side by side (Framework7 master-detail). */
    :global(.view-master-detail .page-master-detail) {
      background: var(--od-surface);
    }

    /* Beside the list, the dive has no Back button: the list stays on screen. */
    :global(.view-master-detail .page-master-detail .navbar .left .back) {
      display: none;
    }

    /* No ☰ button on a tablet and no Back button beside the list: no empty button bubble (iOS). */
    :global(.views.od-tablet .navbar .left:not(:has(a, button))),
    :global(.view-master-detail .page-master-detail .navbar .left) {
      display: none;
    }

    /* Nothing chosen yet. */
    :global(.view-master-detail:not(:has(.page-master-detail))::after) {
      content: var(--od-no-dive);
      position: absolute;
      inset: 0 0 0 var(--f7-page-master-width);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--od-surface);
      color: var(--od-text-2);
      font-size: 16px;
      text-align: center;
    }
  }
</style>
