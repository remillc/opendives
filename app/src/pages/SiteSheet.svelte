<script>
  // @ts-check
  // Site sheet (docs/mockups/sites-fiche-android.dc.html): name and country,
  // map, coordinates with "Open in Maps", description, notes, region and city
  // found from the position, then the dives at this site.
  import { Page, Navbar, Link, List, Popover, f7, theme } from 'framework7-svelte';
  import FloatingToolbar from '../components/FloatingToolbar.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import ShareSheet from '../components/ShareSheet.svelte';
  import { shareLink } from '../lib/share.js';
  import { siteLink } from '../lib/deep-link.js';
  import MenuItem from '../components/MenuItem.svelte';
  import { layout } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { diveLines, formatCoordinates, mapsLink, siteChange } from '../lib/sites.svelte.js';
  import { formatLongDateTime } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { uuid: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  const uuid = Number(f7route.params.uuid);

  let site = $state(/** @type {import('opendives-core').SiteDetail|null} */ (null));
  /** Second line of each dive, by dive id. */
  let lines = $state(/** @type {Record<number, string>} */ ({}));

  $effect(() => {
    logbook.sitesVersion;
    OpenDivesCore.siteQuery({ kind: 'site', uuid }).then((s) => {
      site = s;
      if (s?.diveList) diveLines(s.diveList, (l) => (lines = l));
    });
  });

  const menuId = `od-site-menu-${Math.random().toString(36).slice(2, 9)}`;
  /** The "Merge with another site" choice is open; `others`: the sites it offers. */
  let choosingOther = $state(false);
  let others = $state(/** @type {{ uuid: number, name: string, dives: number }[]} */ ([]));

  /** "Share" open: the sheet, then the system's share sheet (one row for now: the link). */
  let sharing = $state(false);

  async function shareSiteLink() {
    sharing = false;
    if (!site) return;
    try {
      await shareLink(siteLink(site.uuid), site.name || t('sites.title'));
    } catch (e) {
      // Closing the system's share sheet without choosing is not an error.
      if (/cancel/i.test(String(/** @type {any} */ (e)?.message ?? ''))) return;
      console.error('Share a site', e);
      showSnackbar(t('share.siteFailed'));
    }
  }

  function edit() {
    f7router.navigate(`/sites/${uuid}/edit`);
  }

  /** "Open in Maps" from the toolbar: the same system link as the text button, opened by a click on it. */
  function openInMaps() {
    if (!site) return;
    const a = document.createElement('a');
    a.href = mapsLink(site.latUdeg, site.lonUdeg, site.name);
    a.click();
  }

  // As the Sites list's "Merge sites": the other site's dives come to this one,
  // which is kept; one undoable step.
  async function chooseOtherSite() {
    f7.popover.close(`#${menuId}`);
    const list = await OpenDivesCore.siteQuery({ kind: 'list' });
    others = list
      .filter((/** @type {any} */ s) => s.uuid !== uuid)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => (a.name || '').localeCompare(b.name || ''));
    if (!others.length) return showSnackbar(t('sites.noOtherSite'));
    choosingOther = true;
  }

  /** @param {string} value uuid of the site merged into this one */
  async function mergeOther(value) {
    choosingOther = false;
    try {
      await siteChange({ action: 'merge', uuid, other: Number(value) });
      offerUndo(t('sites.done'));
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Merge sites', code);
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
    }
  }

  /** As the editor's "Delete the site": confirmation, undoable, its dives stay without a site. */
  function deleteSite() {
    const n = site?.diveList.length ?? 0;
    confirmAction({
      title: t('sites.deleteSiteTitle'),
      text: n ? t('sites.deleteSiteText', { n }) : t('sites.deleteSiteTextUnused'),
      action: t('sites.delete'),
      onConfirm: async () => {
        try {
          await siteChange({ action: 'deleteSite', uuid });
          f7router.back('/sites/', { force: true });
        } catch (e) {
          const code = String(/** @type {any} */ (e)?.message ?? '');
          console.error('Delete site', code);
          showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
        }
      },
    });
  }

  const place = $derived(site ? [site.city.value, site.region.value].filter(Boolean).join(', ') : '');
  /** The latest dive first, as in the logbook. */
  const latestFirst = $derived(site ? [...site.diveList].sort((a, b) => b.date.localeCompare(a.date)) : []);
  const anyManual = $derived(!!site && (site.city.manual || site.region.manual));
  /** The logbook's dives, for the profile thumbnails. */
  const byId = $derived(new Map(logbook.dives.map((d) => [d.id, d])));
</script>

<Page class="od-site-sheet">
  <Navbar>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
    <!-- Android: the actions are in the floating toolbar; the top bar keeps only ←. -->
    {#snippet right()}
      {#if theme.ios}
        <Link iconOnly onClick={() => (sharing = true)}><Icon name="share" weight={2.2} /><span class="od-sr-only">{t('share.title')}</span></Link>
        <Link iconOnly href="/sites/{uuid}/edit"><Icon name="edit" weight={2.2} /><span class="od-sr-only">{t('sites.edit')}</span></Link>
      {/if}
    {/snippet}
  </Navbar>

  {#if !theme.ios}
    <Popover id={menuId} class="od-menu" backdrop={false}>
      <List noChevron>
        <MenuItem icon="merge" text={t('sites.mergeWithOther')} onclick={chooseOtherSite} />
        <li class="od-menu-divider" role="separator"></li>
        <MenuItem icon="delete" text={t('sites.deleteSite')} destructive onclick={deleteSite} />
      </List>
    </Popover>
  {/if}

  {#if choosingOther}
    <ChoiceDialog
      title={t('sites.mergeOtherTitle')}
      note={t('sites.mergeOtherNote')}
      options={others.map((s) => ({ value: String(s.uuid), label: s.name || t('sites.noName'), example: t('sites.diveCount', { n: s.dives }) }))}
      value={String(others[0]?.uuid ?? '')}
      onselect={mergeOther}
      oncancel={() => (choosingOther = false)}
    />
  {/if}

  {#if site && site.uuid}
    <header class="od-site-sheet--head">
      <h1>{site.name || t('sites.noName')}</h1>
      {#if site.country}<p class="od-site-sheet--sub">{site.country}</p>{/if}
    </header>

    {#if site.hasLocation}
      <!-- Inside the margins, 16 dp corners, 170 dp high (task 2026-11-07-24). -->
      <div class="od-site-sheet--map">
        <SiteMap pin={{ latUdeg: site.latUdeg, lonUdeg: site.lonUdeg }} height="170px" />
      </div>
      <div class="od-site-sheet--coords">
        <span class="od-value">{formatCoordinates(site.latUdeg, site.lonUdeg)}</span>
        <a class="external od-text-button" href={mapsLink(site.latUdeg, site.lonUdeg, site.name)}>
          {t('sites.openInMaps')}<Icon name="openInNew" size={18} /><span class="od-sr-only">, {t('sites.opensElsewhere')}</span>
        </a>
      </div>
    {/if}

    <h2 class="od-site-sheet--title">{t('sites.about')}</h2>
    <ul class="od-site-sheet--surface">
      <li class="od-site-sheet--row">
        <span class="od-site-sheet--headline">{t('sites.description')}</span>
        <span class="od-site-sheet--supporting od-site-sheet--text">{site.description || t('sites.noDescription')}</span>
      </li>
      <li class="od-site-sheet--row">
        <span class="od-site-sheet--headline">{t('sites.notes')}</span>
        <span class="od-site-sheet--supporting od-site-sheet--text">{site.notes || t('sites.noNotes')}</span>
      </li>
      {#if place}
        <li class="od-site-sheet--row">
          <span class="od-site-sheet--headline">{t('sites.regionCity')}</span>
          <span class="od-site-sheet--supporting">{place}<br />{anyManual ? t('sites.corrected') : t('sites.foundAutomatically')}</span>
        </li>
      {/if}
    </ul>

    {#if site.diveList.length}
      <h2 class="od-site-sheet--title">{t('sites.divesHere')}</h2>
      <ul class="od-site-sheet--surface">
        {#each latestFirst as dive (dive.id)}
          {@const listed = byId.get(dive.id)}
          <li>
            <a href="/dives/{dive.id}" class="od-site-sheet--row od-site-sheet--dive">
              {#if listed}
                <ProfileThumbnail profile={listed.profile} maxDepthMm={listed.maxDepthMm} prefs={logbook.prefs} />
              {/if}
              <span class="od-site-sheet--text-column">
                <span class="od-site-sheet--date od-value">{dive.number ? t('sites.diveNumberDate', { number: dive.number, date: formatLongDateTime(dive.date) }) : formatLongDateTime(dive.date)}</span>
                <span class="od-site-sheet--supporting od-value">{lines[dive.id] ?? ''}</span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#snippet fixedContent()}
    {#if !theme.ios && site && site.uuid}
      <FloatingToolbar
        label={t('sites.actions')}
        clearFab={layout.split && !layout.rail && navigation.section === 'logbook'}
        actions={[
          { key: 'edit', icon: 'edit', label: t('sites.edit'), text: t('detail.edit'), onclick: edit },
          ...(site.hasLocation ? [{ key: 'maps', icon: /** @type {const} */ ('map'), label: t('sites.openInMaps'), onclick: openInMaps }] : []),
          { key: 'share', icon: 'share', label: t('share.title'), onclick: () => (sharing = true) },
          { key: 'more', icon: 'more', label: t('sites.moreOptionsList'), menu: `#${menuId}` },
        ]}
      />
    {/if}
  {/snippet}
</Page>

{#if sharing}
  <ShareSheet
    rows={[{ id: 'link', icon: 'link', title: t('share.link'), text: t('share.siteLinkText'), onclick: shareSiteLink }]}
    onclose={() => (sharing = false)}
  />
{/if}

<style>
  @layer od.components {
    .od-site-sheet--head {
      padding: 0 20px;

      h1 {
        margin: 0;
        font-size: 32px;
        line-height: 38px;
        font-weight: 800;
        letter-spacing: -0.3px;
      }
    }

    .od-site-sheet--sub {
      margin: 2px 0 0;
      font-size: 15px;
      color: var(--od-text-2);
    }

    .od-site-sheet--map {
      margin: 14px 16px 0;
      border-radius: 16px;
      overflow: hidden;
    }

    .od-site-sheet--coords {
      margin: 4px 8px 0 20px;
      min-height: 48px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    /* Section titles of the sheet: 14 medium, as in the mock-up. */
    .od-site-sheet--title {
      margin: 22px 16px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .od-site-sheet--surface {
      margin: 0 16px;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      background: var(--od-surface);
      overflow: hidden;

      li + li,
      > li + li {
        border-top: 1px solid var(--od-separator);
      }
    }

    .od-site-sheet--row {
      min-height: 56px;
      padding: 10px 16px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
    }

    .od-site-sheet--headline {
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text);
    }

    .od-site-sheet--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-site-sheet--text {
      white-space: pre-line;
    }

    /* A dive: the profile thumbnail, the long date, then minutes, buddies, mode. */
    .od-site-sheet--dive {
      min-height: 64px;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      color: var(--od-text);
      text-decoration: none;
    }

    .od-site-sheet--text-column {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-site-sheet--date {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }
  }
</style>
