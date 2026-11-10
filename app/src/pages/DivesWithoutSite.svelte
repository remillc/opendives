<script>
  // @ts-check
  // Dives without a site (docs/mockups/sites-sans-site-android.dc.html): each
  // dive opens its profile, with "Choose a site" and "New site" apart, and a
  // suggestion from the site of the other dives of the same trip.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { chooseDiveSite, setDiveSite } from '../lib/dive-site.js';
  import { formatDateTime } from '../lib/format.js';
  import { diveLines } from '../lib/sites.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** @type {{id: number, number: number, date: string, durationSeconds: number, suggestedSite: number}[]} */
  let dives = $state([]);
  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);

  async function load() {
    // The latest dive first, as in the logbook.
    dives = (await OpenDivesCore.siteQuery({ kind: 'without' })).sort((/** @type {any} */ a, /** @type {any} */ b) => b.date.localeCompare(a.date));
    sites = await OpenDivesCore.siteQuery({ kind: 'list' });
    diveLines(dives, (l) => (lines = l), ', ');
  }

  /** Second line of each dive ("55 min, recycleur"), by dive id. */
  let lines = $state(/** @type {Record<number, string>} */ ({}));

  /**
   * How many dives of the same trip are at the suggested site.
   * @param {number} diveId
   * @param {number} uuid
   */
  function sameTrip(diveId, uuid) {
    const trip = logbook.dives.find((d) => d.id === diveId)?.trip?.id;
    const name = siteName(uuid);
    return trip ? logbook.dives.filter((d) => d.trip?.id === trip && d.site === name).length : 0;
  }

  $effect(() => {
    logbook.sitesVersion;
    load();
  });

  const siteName = (/** @type {number} */ uuid) => sites.find((s) => s.uuid === uuid)?.name || t('sites.noName');

  /** The logbook's dives, for the profile thumbnails. */
  const byId = $derived(new Map(logbook.dives.map((d) => [d.id, d])));
</script>

<Page>
  <Navbar title={t('sites.withoutTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  <p class="od-intro">{t('sites.withoutIntro', { n: dives.length })}</p>

  {#if dives.length}
    <!-- All the dives in one white surface, with dividers. -->
    <ul class="surface">
      {#each dives as dive (dive.id)}
        {@const listed = byId.get(dive.id)}
        <li class="dive">
          <a href="/sites/without-site/{dive.id}" class="od-no-site-open" aria-label={t('sites.seeProfile')}>
            {#if listed}<ProfileThumbnail profile={listed.profile} maxDepthMm={listed.maxDepthMm} prefs={logbook.prefs} />{/if}
            <span class="od-no-site-text">
              <span class="date od-value">{formatDateTime(dive.date)}</span>
              <span class="sub od-value">{lines[dive.id] ?? ''}</span>
            </span>
            <span class="od-no-site-chevron"><Icon name="chevron" size={20} /></span>
          </a>
          <span class="actions">
            {#if dive.suggestedSite}
              <!-- The suggested site first, as a filled tonal chip. -->
              <button type="button" class="small tonal" onclick={() => setDiveSite(dive.id, dive.suggestedSite)}>
                {siteName(dive.suggestedSite)}
              </button>
            {/if}
            <button type="button" class="small" onclick={() => chooseDiveSite(dive.id, sites)}>{t('sites.chooseSite')}</button>
            <button type="button" class="small" onclick={() => f7router.navigate(`/sites/new?dive=${dive.id}`)}>{t('sites.newSite')}</button>
          </span>
          {#if dive.suggestedSite}
            <span class="why">{t('sites.suggestionLine', { n: sameTrip(dive.id, dive.suggestedSite), site: siteName(dive.suggestedSite) })}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Page>

<style>
  @layer od.components {
    .surface {
      margin: 14px 16px 24px;
      padding: 0;
      list-style: none;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .dive {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;

      & + .dive {
        border-top: 1px solid var(--od-separator);
      }
    }

    /* The thumbnail and the text: one tappable area, apart from the buttons. */
    .od-no-site-open {
      margin: -4px -8px;
      padding: 4px 8px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: inherit;
      text-decoration: none;
    }

    .od-no-site-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-no-site-chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .date {
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
    }

    .sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .actions {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Small outlined buttons: 32 dp, 8 dp corners, 48 dp touch target. */
    .small {
      position: relative;
      width: auto;
      height: 32px;
      padding: 0 12px;
      border: 1px solid var(--od-text-2);
      border-radius: 8px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;

      &::after {
        content: '';
        position: absolute;
        inset: -8px 0;
      }

      /* The suggested site: a filled tonal chip. */
      &.tonal {
        border-color: transparent;
        background: var(--od-tint);
        color: var(--od-on-tint);
      }
    }

    .why {
      margin-top: 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
