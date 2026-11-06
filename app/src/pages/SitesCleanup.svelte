<script>
  // @ts-check
  // Clean up the sites (docs/mockups/sites-nettoyer-android.dc.html): possible
  // duplicates in pairs, "These are not duplicates" or "Merge" (one site keeps
  // all the dives; undoable); unused sites with check boxes and "Delete the
  // selection". Each change of the logbook is confirmed first.
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { logbook } from '../lib/logbook.svelte.js';
  import { dismissPair, pairKey, possibleDuplicates, siteChange } from '../lib/sites.svelte.js';
  import { t } from '../lib/i18n.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';

  /** @type {{a: import('opendives-core').SiteSummary, b: import('opendives-core').SiteSummary, distanceM: number}[]} */
  let pairs = $state([]);
  /** @type {import('opendives-core').SiteSummary[]} */
  let unused = $state([]);
  /** @type {Record<number, boolean>} */
  let selected = $state({});

  async function load() {
    pairs = await possibleDuplicates();
    unused = (await OpenDivesCore.siteQuery({ kind: 'list' })).filter((/** @type {any} */ s) => s.dives === 0);
  }

  $effect(() => {
    logbook.sitesVersion;
    load();
  });

  const selection = $derived(unused.filter((s) => selected[s.uuid]).map((s) => s.uuid));

  /** @param {import('opendives-core').SiteSummary} s */
  const describe = (s) =>
    [s.dives ? t('sites.diveCount', { n: s.dives }) : t('sites.noDive'), s.country || t('sites.noCountry'), s.hasLocation ? t('sites.withPosition') : t('sites.withoutPosition')].join(', ');

  /** @param {(typeof pairs)[number]} pair */
  const reason = (pair) =>
    pair.a.name.toLocaleLowerCase() === pair.b.name.toLocaleLowerCase()
      ? pair.distanceM >= 0
        ? t('sites.sameNameAt', { n: pair.distanceM })
        : t('sites.sameName')
      : t('sites.samePlace');

  /** @param {(typeof pairs)[number]} pair */
  function merge(pair) {
    // The site with more dives (then with a position) keeps them all.
    const [keep, other] =
      pair.b.dives > pair.a.dives || (pair.b.dives === pair.a.dives && pair.b.hasLocation && !pair.a.hasLocation)
        ? [pair.b, pair.a]
        : [pair.a, pair.b];
    confirmAction({
      title: t('sites.mergeTitle'),
      text: t('sites.mergeText', { keep: keep.name || t('sites.noName'), other: other.name || t('sites.noName') }),
      action: t('sites.merge'),
      onConfirm: async () => {
        try {
          await siteChange({ action: 'merge', uuid: keep.uuid, other: other.uuid });
          offerSiteUndo();
        } catch (e) {
          console.error('Merge sites', e);
          f7.toast.create({ text: t('edit.failed'), closeTimeout: 3000 }).open();
        }
      },
    });
  }

  function deleteSelection() {
    const n = selection.length;
    if (!n) return;
    confirmAction({
      title: t('sites.deleteTitle'),
      text: t('sites.deleteText', { n }),
      action: t('sites.delete'),
      onConfirm: async () => {
        try {
          await siteChange({ action: 'delete', uuids: selection });
          selected = {};
          offerSiteUndo();
        } catch (e) {
          console.error('Delete sites', e);
          f7.toast.create({ text: t('edit.failed'), closeTimeout: 3000 }).open();
        }
      },
    });
  }

  function offerSiteUndo() {
    offerUndo(t('sites.done'));
  }

  function selectAll() {
    const all = unused.every((s) => selected[s.uuid]);
    selected = Object.fromEntries(unused.map((s) => [s.uuid, !all]));
  }
</script>

<Page>
  <Navbar title={t('sites.cleanupTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  <p class="intro">{t('sites.cleanupIntro')}</p>

  {#each pairs as pair (pairKey(pair.a.uuid, pair.b.uuid))}
    <div class="pair">
      <div class="reason">{reason(pair)}</div>
      {#each [pair.a, pair.b] as s (s.uuid)}
        <div class="site"><span class="name">{s.name || t('sites.noName')}</span><span class="sub">{describe(s)}</span></div>
      {/each}
      <div class="actions">
        <button type="button" class="od-outlined-button" onclick={() => { dismissPair(pair.a.uuid, pair.b.uuid); load(); }}>{t('sites.notDuplicates')}</button>
        <button type="button" class="od-tonal-button" onclick={() => merge(pair)}>{t('sites.merge')}</button>
      </div>
    </div>
  {/each}

  {#if unused.length}
    <div class="block-title">{t('sites.unusedTitle')}</div>
    <p class="intro">{t('sites.unusedIntro', { n: unused.length })}</p>
    <div class="list list-strong inset list-dividers">
      <ul>
        <li>
          <button type="button" class="select-all" onclick={selectAll}>{t('sites.selectAll')}</button>
        </li>
        {#each unused as s (s.uuid)}
          <li>
            <label class="item-checkbox item-content">
              <input type="checkbox" bind:checked={selected[s.uuid]} />
              <i class="icon icon-checkbox"></i>
              <div class="item-inner"><div class="item-title">{s.name || t('sites.noName')}<div class="item-footer">{t('sites.noDive')}</div></div></div>
            </label>
          </li>
        {/each}
      </ul>
    </div>
    <div class="delete">
      <button type="button" class="od-outlined-button danger" disabled={!selection.length} onclick={deleteSelection}>
        {t('sites.deleteSelection', { n: selection.length })}
      </button>
    </div>
  {/if}
</Page>

<style>
  @layer od.components {
    .intro {
      margin: 12px 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .pair {
      margin: 0 16px 12px;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .reason {
      font-size: 13px;
      color: var(--od-text-2);
    }

    .site {
      display: flex;
      flex-direction: column;

      .name {
        font-size: 16px;
        font-weight: 600;
      }

      .sub {
        font-size: 13px;
        color: var(--od-text-2);
      }
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .select-all {
      width: 100%;
      min-height: 48px;
      padding: 0 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-weight: 600;
      text-align: start;
    }

    .delete {
      margin: 12px 16px 32px;
      display: flex;
      justify-content: center;
    }
  }
</style>
