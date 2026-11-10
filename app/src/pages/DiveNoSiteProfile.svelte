<script>
  // @ts-check
  // The profile of a dive without a site
  // (docs/mockups/sites-sans-site-profil-android.dc.html): its key figures, the
  // full profile, the computer, and the same two actions as its row in the
  // list; both end back on the list.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import DiveFigures from '../components/DiveFigures.svelte';
  import DiveProfile from '../components/DiveProfile.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { chooseDiveSite } from '../lib/dive-site.js';
  import { formatDateTime } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { diveId: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  const diveId = Number(f7route.params.diveId);

  let dive = $state(/** @type {import('opendives-core').DiveDetail|null} */ (null));
  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);

  onMount(async () => {
    try {
      dive = await OpenDivesCore.getDive({ id: diveId });
      sites = await OpenDivesCore.siteQuery({ kind: 'list' });
    } catch (e) {
      console.error('Dive without a site', e);
    }
  });

  const subtitle = $derived(
    dive ? t('sites.noSiteSubtitle', { mode: tIfExists(`detail.computerModes.${dive.divemode}`) ?? dive.divemode }) : '',
  );
  const facts = $derived.by(() => {
    if (!dive) return '';
    const computer = dive.diveComputers?.[0];
    const model = computer?.nickname || computer?.model;
    return [model && t('sites.profileComputer', { model }), !dive.siteCoordinates && t('sites.noGps')].filter(Boolean).join(' · ');
  });
</script>

<Page class="od-dive-no-site-profile">
  <Navbar title={dive ? formatDateTime(dive.date) : ''} {subtitle}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  {#if dive}
    <DiveFigures {dive} prefs={logbook.prefs} />
    <DiveProfile
      samples={dive.samples}
      cylinders={dive.cylinders}
      divemode={dive.divemode}
      maxDepthMm={dive.maxDepthMm}
      durationSeconds={dive.durationSeconds}
      prefs={logbook.prefs}
    />
    {#if facts}<p class="od-dive-no-site-profile--facts">{facts}</p>{/if}
    <div class="od-dive-no-site-profile--end"></div>
  {/if}

  {#snippet fixedContent()}
    {#if dive}
      <div class="od-dive-no-site-profile--bar">
        <button type="button" class="od-dive-no-site-profile--action od-dive-no-site-profile--filled" onclick={() => chooseDiveSite(diveId, sites, () => f7router.back())}>{t('sites.chooseSite')}</button>
        <!-- Replaces this screen, so that saving the new site ends on the list. -->
        <button type="button" class="od-dive-no-site-profile--action" onclick={() => f7router.navigate(`/sites/new?dive=${diveId}`, { reloadCurrent: true })}>{t('sites.newSite')}</button>
      </div>
    {/if}
  {/snippet}
</Page>

<style>
  @layer od.components {
    .od-dive-no-site-profile--facts {
      margin: 14px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    /* Room for the fixed bar. */
    .od-dive-no-site-profile--end {
      height: 104px;
    }

    .od-dive-no-site-profile--bar {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      z-index: 10;
      padding: 12px 16px calc(24px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      gap: 8px;
      border-top: 1px solid var(--od-separator);
      background: var(--od-background);
    }

    .od-dive-no-site-profile--action {
      flex: 1;
      width: auto;
      height: 48px;
      border: 1px solid var(--od-text-2);
      border-radius: 24px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;

      &.od-dive-no-site-profile--filled {
        border: none;
        background: var(--od-primary-action);
        color: var(--od-on-primary-action);
      }

      :global(.ios) & {
        height: 50px;
        border-radius: 12px;
        font-size: 17px;
      }
    }
  }
</style>
