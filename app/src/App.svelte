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
  import SettingsBailout from './pages/SettingsBailout.svelte';
  import Plans from './pages/Plans.svelte';
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
  import DiveNoSiteProfile from './pages/DiveNoSiteProfile.svelte';
  import SitesCleanup from './pages/SitesCleanup.svelte';
  import SitesUnplaced from './pages/SitesUnplaced.svelte';
  import Statistics from './pages/Statistics.svelte';
  import StatisticsResult from './pages/StatisticsResult.svelte';
  import StatisticsDives from './pages/StatisticsDives.svelte';
  import StatisticNew from './pages/StatisticNew.svelte';
  import Tools from './pages/Tools.svelte';
  import Desaturation from './pages/Desaturation.svelte';
  import GasEadMod from './pages/GasEadMod.svelte';
  import GasBestMix from './pages/GasBestMix.svelte';
  import GasBlender from './pages/GasBlender.svelte';
  import Planner from './pages/Planner.svelte';
  import PlannerSettings from './pages/PlannerSettings.svelte';
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
  import SyncFailureSheet from './components/SyncFailureSheet.svelte';
  import ConflictHost from './components/ConflictHost.svelte';
  import Welcome from './components/Welcome.svelte';
  import { layout, ios, listWidth, splitBreakpoint } from './lib/layout.svelte.js';
  import { trackSection, enableSectionSwipes, enableFullSwipeBack } from './lib/navigation.svelte.js';
  import { applyMotionTokens } from './lib/motion.js';
  import { TAP_SLOP } from './lib/tap.js';
  import { enableBackButton } from './lib/back-button.js';
  import { enableDeepLinks } from './lib/open-link.js';
  import { startFlightReminder } from './lib/flight-reminder.svelte.js';
  import { enableAccessibility } from './lib/accessibility.js';
  import { enableDetailPageCleanup } from './lib/detail-pages.js';
  import { enableModalCleanup } from './lib/modal-cleanup.js';
  import { schedulePreparingSiteMaps } from './lib/site-image.js';
  import { logbook } from './lib/logbook.svelte.js';
  import { t } from './lib/i18n.js';
  import { mark } from './lib/perf.js';
  import { settings } from './lib/settings.svelte.js';
  import CylinderTypes from './pages/CylinderTypes.svelte';
  import LogbookComputers from './pages/LogbookComputers.svelte';
  import LogbookComputer from './pages/LogbookComputer.svelte';
  import CylinderType from './pages/CylinderType.svelte';
  import About from './pages/About.svelte';
  import AboutText from './pages/AboutText.svelte';
  import AboutLibraries from './pages/AboutLibraries.svelte';
  import GitRepository from './pages/GitRepository.svelte';
  import TokenHelp from './pages/TokenHelp.svelte';
  import SettingsMaps from './pages/SettingsMaps.svelte';
  import SettingsMapsArea from './pages/SettingsMapsArea.svelte';
  import MapsDialogs from './components/MapsDialogs.svelte';
  import { startOfflineMaps } from './lib/offline-maps.svelte.js';

  // Addresses: a resource has no trailing slash, a collection has one (AGENTS.md).
  const appRoutes = [
    { path: '/dives/new', component: NewDive },
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
    { path: '/settings/bailout', component: SettingsBailout },
    { path: '/settings/computers/', component: LogbookComputers },
    { path: '/settings/computers/edit', component: LogbookComputer },
    { path: '/settings/cylinders/', component: CylinderTypes },
    { path: '/settings/cylinders/new', component: CylinderType },
    { path: '/settings/cylinders/type', component: CylinderType },
    // Offline maps: the list, adding a region (a rectangle drawn on the map).
    { path: '/settings/maps/', component: SettingsMaps },
    { path: '/settings/maps/area', component: SettingsMapsArea },
    { path: '/account', component: Account },
    { path: '/account/delete', component: DeleteAccount },
    // Signing in and creating an account, from the Account screen without an account.
    { path: '/account/sign-in', component: SignIn },
    { path: '/account/create', component: CreateAccount },
    { path: '/account/code', component: ConfirmCode },
    { path: '/account/import', component: BringLogbook },
    { path: '/account/importing', component: ImportProgress },
    // The logbook in the user's own git repository (Modifier le dépôt).
    { path: '/account/git', component: GitRepository, options: { props: { edit: true } } },
    { path: '/account/git/token', component: TokenHelp },
    // First launch, in the view of its popup (components/Welcome.svelte).
    { path: '/welcome', component: WelcomeStart },
    { path: '/welcome/sign-in', component: SignIn, options: { props: { welcome: true } } },
    { path: '/welcome/create', component: CreateAccount, options: { props: { welcome: true } } },
    { path: '/welcome/code', component: ConfirmCode, options: { props: { welcome: true } } },
    { path: '/welcome/import', component: BringLogbook },
    { path: '/welcome/importing', component: ImportProgress },
    { path: '/welcome/git', component: GitRepository, options: { props: { welcome: true } } },
    { path: '/welcome/git/token', component: TokenHelp },
    // Phone: a full screen. Tablet: a sheet (iPad) or a pane (Android) over the
    // list and the dive, chosen when the screen opens (EditDive.svelte).
    {
      path: '/dives/:id/edit',
      async: (/** @type {{ resolve: Function }} */ { resolve }) => resolve(!layout.rail ? { component: EditDive } : { popup: { component: EditDive } }),
    },
    // A dive opened from another section (site, tools) or from a trip: the
    // same screen, without the master-detail routing of the Logbook, which
    // would put a second Logbook in the history.
    { path: '/dives/:id', component: DiveDetail },
    { path: '/trips/:id', component: Trip },
    { path: '/trips/:trip/dives/:id', component: DiveDetail },
    // Planned dives, and a saved plan reopened.
    { path: '/plans/', component: Plans },
    { path: '/plans/:id', component: Planner, options: { props: { reopen: true } } },
    // The planner: /plan/new for a new dive, /plan/<dive id> from a logbook dive.
    // The planner's settings, a screen of their own (task 2026-11-08-01, to-do #3 U3).
    { path: '/settings/planner', component: PlannerSettings },
    { path: '/plan/:id', component: Planner },
    { path: '/sites/', component: Sites },
    { path: '/sites/without/', component: DivesWithoutSite },
    { path: '/sites/without-site/:diveId', component: DiveNoSiteProfile },
    { path: '/sites/cleanup', component: SitesCleanup },
    { path: '/sites/unplaced/', component: SitesUnplaced },
    { path: '/sites/new', component: SiteEdit },
    { path: '/sites/:uuid', component: SiteSheet },
    { path: '/sites/:uuid/edit', component: SiteEdit },
    { path: '/statistics/', component: Statistics },
    { path: '/statistics/result', component: StatisticsResult },
    { path: '/statistics/dives/', component: StatisticsDives },
    // Android: a full-screen dialog; iPhone: a sheet (the popup pushes the view back).
    { path: '/statistics/new', popup: { component: StatisticNew } },
    { path: '/tools/', component: Tools },
    { path: '/tools/desaturation', component: Desaturation },
    { path: '/tools/ead-mod', component: GasEadMod },
    { path: '/tools/best-mix', component: GasBestMix },
    { path: '/tools/blender', component: GasBlender },
  ];

  /**
   * The Logbook view's routes: the Logbook is the master of a master-detail
   * pair, so a dive (/dives/<id>) opens beside the list on a wide enough
   * tablet, and full screen otherwise. Only this view has it, before the
   * other routes; /dives/new comes first, or it would be taken for a dive.
   */
  const logbookRoutes = [
    appRoutes[0],
    { path: '/', component: Logbook, master: true, detailRoutes: [{ path: '/dives/:id', component: DiveDetail }] },
    ...appRoutes,
  ];

  /**
   * The Statistics view's routes (tablet): the list of statistics is the
   * master, a result opens beside it (as the Logbook, above).
   */
  const statisticsRoutes = [
    {
      path: '/statistics/',
      component: Statistics,
      master: true,
      detailRoutes: [
        { path: '/statistics/result', component: StatisticsResult },
        { path: '/statistics/dives/', component: StatisticsDives },
      ],
    },
    ...appRoutes,
  ];

  /** The Tools view's routes (tablet): the list of tools is the master, the tool opens beside it. */
  const toolsRoutes = [
    {
      path: '/tools/',
      component: Tools,
      master: true,
      detailRoutes: [
        { path: '/plans/', component: Plans },
        { path: '/plans/:id', component: Planner, options: { props: { reopen: true } } },
        { path: '/plan/:id', component: Planner },
        { path: '/tools/desaturation', component: Desaturation },
        { path: '/tools/ead-mod', component: GasEadMod },
        { path: '/tools/best-mix', component: GasBestMix },
        { path: '/tools/blender', component: GasBlender },
      ],
    },
    ...appRoutes,
  ];

  /** Widths of the lists beside a result (Statistics) and beside a tool (Tools), from the tablet mock-ups. */
  const statisticsListWidth = ios ? 420 : 400;
  const toolsListWidth = 360;

  const f7params = {
    name: 'OpenDives',
    theme: ios ? 'ios' : 'md',
    // Settings, Display, Theme: the device's, or light or dark.
    darkMode: settings.theme === 'system' ? 'auto' : settings.theme === 'dark',
    // Framework7 derives its palette from --od-action (theme.css); the mapped
    // variables in theme.css then take precedence.
    colors: { primary: getComputedStyle(document.documentElement).getPropertyValue('--od-action').trim() },
    // A fingertip tap moves a little: past 5 px (Framework7's default) the tap
    // was dropped, so a button or a menu entry did nothing now and then.
    touch: { touchClicksDistanceThreshold: TAP_SLOP },
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
      // From anywhere, the gesture must not take a tap whose finger slid a little.
      mdSwipeBackThreshold: TAP_SLOP,
      iosSwipeBackThreshold: TAP_SLOP,
      // On Android the pages only slide, like the sections (enableFullSwipeBack).
      mdSwipeBackAnimateOpacity: false,
      mdSwipeBackAnimateShadow: false,
    },
    routes: appRoutes,
  };

  // Each time the logbook is loaded, the maps of its new sites are prepared.
  $effect(() => {
    if (logbook.dives.length) schedulePreparingSiteMaps();
  });

  onMount(() => {
    applyMotionTokens();
    enableBackButton();
    enableDeepLinks();
    startFlightReminder();
    enableAccessibility();
    enableDetailPageCleanup();
    enableModalCleanup();
    trackSection();
    enableSectionSwipes();
    enableFullSwipeBack();
    // The settings are applied and the logbook is loaded from main.js, before
    // the screens are built.
    mark('onMount');
    // Offline maps: follows the downloads and checks for updates (at most once a day).
    startOfflineMaps();
  });
</script>

<App {...f7params}>
  {#if layout.rail}<NavRail />{:else}<NavMenu />{/if}
  <SyncFailureSheet />
  <ConflictHost />
  <MapsDialogs />
  {#if showRoute}<RouteBadge />{/if}
  <Welcome />
  <Views tabs class="safe-areas {layout.rail ? 'od-tablet' : ''}" style="--f7-page-master-width: {listWidth}px; --od-no-dive: '{t('tablet.noDive')}'">
    <View id="view-logbook" main tab tabActive url="/" routes={logbookRoutes} masterDetailBreakpoint={splitBreakpoint} />
    <View id="view-sites" tab url="/sites/" />
    <View
      id="view-statistics"
      tab
      url="/statistics/"
      routes={statisticsRoutes}
      masterDetailBreakpoint={splitBreakpoint}
      style="--f7-page-master-width: {statisticsListWidth}px; --od-no-dive: '{t('tablet.noStatistic')}'"
    />
    <View
      id="view-tools"
      tab
      url="/tools/"
      routes={toolsRoutes}
      masterDetailBreakpoint={splitBreakpoint}
      style="--f7-page-master-width: {toolsListWidth}px; --od-no-dive: '{t('tablet.noTool')}'"
    />
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

    /* Android download panes: the computers are white cards on the page background. */
    :global(.md .view-master-detail .page-master-detail:is(.od-download, .od-download-failed)) {
      background: var(--od-background);

      :global(.navbar-bg) {
        background: var(--od-background);
      }
    }

    /* First screen of the detail pane (what a row of the list opened): no Back button, the list stays on screen.
       The download pages keep their ✕: it closes the task (back to the previous pane).
       A screen opened from inside the pane keeps its ← (lib/pane-history.js). */
    :global(.view-master-detail .page-master-detail-root:not(.od-download, .od-download-failed) .navbar .left .back) {
      display: none;
    }

    /* No ☰ button on a tablet and no Back button beside the list: no empty button bubble (iOS). */
    :global(.views.od-tablet .navbar .left:not(:has(a, button))),
    :global(.view-master-detail .page-master-detail-root:not(.od-download, .od-download-failed) .navbar .left) {
      display: none;
    }

    /* Without a button before it, the title keeps the side margin of the pane. */
    :global(.views.od-tablet .navbar .left:not(:has(a, button)) + .title),
    :global(.view-master-detail .page-master-detail-root:not(.od-download, .od-download-failed) .navbar .left + .title) {
      margin-left: 16px;
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
