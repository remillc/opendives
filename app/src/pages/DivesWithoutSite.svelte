<script>
  // @ts-check
  // Dives without a site (docs/mockups/sites-sans-site-android.dc.html): each
  // dive with "Choose a site" and "New site", and a suggestion from the site
  // of the other dives of the same trip.
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { logbook, saveDiveChanges } from '../lib/logbook.svelte.js';
  import { formatDateTime, formatDuration } from '../lib/format.js';
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
  }

  $effect(() => {
    logbook.sitesVersion;
    load();
  });

  const siteName = (/** @type {number} */ uuid) => sites.find((s) => s.uuid === uuid)?.name || t('sites.noName');

  /** @param {number} diveId @param {number} uuid */
  async function setSite(diveId, uuid) {
    try {
      await saveDiveChanges(diveId, { site: uuid });
      logbook.sitesVersion++;
    } catch (e) {
      console.error('Set site', e);
      f7.toast.create({ text: t('edit.failed'), closeTimeout: 3000 }).open();
    }
  }

  /** The sites with the most dives first. */
  function chooseSite(/** @type {number} */ diveId) {
    const choices = [...sites].filter((s) => s.name).sort((a, b) => b.dives - a.dives).slice(0, 12);
    f7.actions
      .create({
        buttons: [
          [{ text: t('sites.chooseSite'), label: true }, ...choices.map((s) => ({ text: s.name, onClick: () => setSite(diveId, s.uuid) }))],
          [{ text: t('logbook.cancel') }],
        ],
      })
      .open();
  }
</script>

<Page>
  <Navbar title={t('sites.withoutTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  <p class="intro">{t('sites.withoutIntro', { n: dives.length })}</p>

  {#each dives as dive (dive.id)}
    <div class="dive">
      <div class="line od-value">{dive.number ? `${t('detail.number', { number: String(dive.number) })} · ` : ''}{formatDateTime(dive.date)}</div>
      <div class="sub od-value">{formatDuration(dive.durationSeconds)}</div>
      {#if dive.suggestedSite}
        <button type="button" class="suggestion" onclick={() => setSite(dive.id, dive.suggestedSite)}>
          {t('sites.suggestion', { site: siteName(dive.suggestedSite) })}
        </button>
      {/if}
      <div class="actions">
        <button type="button" class="od-tonal-button" onclick={() => chooseSite(dive.id)}>{t('sites.chooseSite')}</button>
        <button type="button" class="od-outlined-button" onclick={() => f7router.navigate(`/site/new/?dive=${dive.id}`)}>{t('sites.newSite')}</button>
      </div>
    </div>
  {/each}
</Page>

<style>
  @layer od.components {
    .intro {
      margin: 12px 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .dive {
      margin: 0 16px 12px;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .line {
      font-size: 17px;
      font-weight: 600;
    }

    .sub {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .suggestion {
      align-self: flex-start;
      margin-top: 6px;
      position: relative;
      min-height: 32px;
      padding: 0 12px;
      border: 1px dashed var(--od-text-2);
      /* MD3 suggestion chip: 32 dp, 8 dp corners, 48 dp touch target. */
      border-radius: 8px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;

      &::after {
        content: '';
        position: absolute;
        inset: -8px 0;
      }
    }

    .actions {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  }
</style>
