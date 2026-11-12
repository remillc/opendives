<script>
  // @ts-check
  // Clean up the sites (docs/mockups/sites-nettoyer-android.dc.html): possible
  // duplicates in pairs, "These are not duplicates" or "Merge" (one site keeps
  // all the dives; undoable); unused sites with check boxes and "Delete the
  // selection". Each change of the logbook is confirmed first.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import { logbook } from '../lib/logbook.svelte.js';
  import { dismissPair, pairKey, possibleDuplicates, restorePair, siteChange } from '../lib/sites.svelte.js';
  import { t } from '../lib/i18n.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { pairsGone } from '../lib/site-cleanup.js';
  import Icon from '../components/Icon.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** @type {{a: import('opendives-core').SiteSummary, b: import('opendives-core').SiteSummary, distanceM: number}[]} */
  let pairs = $state([]);
  /** @type {import('opendives-core').SiteSummary[]} */
  let unused = $state([]);
  /** @type {Record<number, boolean>} */
  let selected = $state({});

  /**
   * The pairs listed when a site editor was opened from here, and the site
   * edited. Null otherwise; any other change of the list clears it.
   * @type {{uuid: number, pairs: typeof pairs}|null}
   */
  let editing = null;

  async function load() {
    pairs = await possibleDuplicates();
    const done = editing;
    editing = null;
    if (done) await announceGone(done);
    unused = (await OpenDivesCore.siteQuery({ kind: 'list' })).filter((/** @type {any} */ s) => s.dives === 0);
  }

  /** @param {{uuid: number, pairs: typeof pairs}} done */
  async function announceGone(done) {
    if (!pairsGone(done.pairs, pairs, done.uuid).length) return;
    try {
      const site = await OpenDivesCore.siteQuery({ kind: 'site', uuid: done.uuid });
      showSnackbar(t('sites.editedNoDuplicate', { name: site.name || t('sites.noName') }), { timeout: 4000 });
    } catch (e) {
      console.error('Site edited', e);
    }
  }

  /** @param {import('opendives-core').SiteSummary} s */
  function edit(s) {
    editing = { uuid: s.uuid, pairs: [...pairs] };
    f7router.navigate(`/sites/${s.uuid}/edit`);
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

  /**
   * The two sites of a pair, the one kept by default first: more dives, then
   * a position.
   * @param {(typeof pairs)[number]} pair
   */
  const ordered = (pair) =>
    pair.b.dives > pair.a.dives || (pair.b.dives === pair.a.dives && pair.b.hasLocation && !pair.a.hasLocation)
      ? [pair.b, pair.a]
      : [pair.a, pair.b];

  /** The site chosen to keep, by pair key; the first of `ordered` otherwise. */
  /** @type {Record<string, number>} */
  let kept = $state({});

  /** @param {(typeof pairs)[number]} pair */
  function merge(pair) {
    editing = null;
    const [first, second] = ordered(pair);
    const key = pairKey(pair.a.uuid, pair.b.uuid);
    const [keep, other] = (kept[key] ?? first.uuid) === first.uuid ? [first, second] : [second, first];
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
          showSnackbar(t('edit.failed'));
        }
      },
    });
  }

  /** @param {(typeof pairs)[number]} pair */
  function notDuplicates(pair) {
    editing = null;
    dismissPair(pair.a, pair.b);
    showSnackbar(t('sites.notDuplicatesDone', { a: pair.a.name || t('sites.noName'), b: pair.b.name || t('sites.noName') }), {
      action: t('edit.undo'),
      timeout: 6000,
      onAction: () => restorePair(pair.a, pair.b),
    });
  }

  function deleteSelection() {
    const n = selection.length;
    if (!n) return;
    editing = null;
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
          showSnackbar(t('edit.failed'));
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

<Page class="od-sites-cleanup">
  <Navbar title={t('sites.cleanupTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  <p class="od-intro">{t('sites.cleanupIntro')}</p>

  <!-- One surface per possible duplicate: the site kept is chosen with a tinted, checked row (radio buttons on iOS). -->
  {#each pairs as pair (pairKey(pair.a.uuid, pair.b.uuid))}
    {@const key = pairKey(pair.a.uuid, pair.b.uuid)}
    {@const both = ordered(pair)}
    <fieldset class="od-sites-cleanup--surface">
      <legend class="od-sites-cleanup--head">
        <span class="od-sites-cleanup--name">{both[0].name || t('sites.noName')}</span>
        <span class="od-sites-cleanup--sub">{reason(pair)}</span>
      </legend>
      {#each both as s (s.uuid)}
        <div class="od-sites-cleanup--keep-row">
          <ChoiceRow class="od-sites-cleanup--keep-pick" name="keep-{key}" selected={(kept[key] ?? both[0].uuid) === s.uuid} onselect={() => (kept[key] = s.uuid)}>
            <span class="od-sites-cleanup--text"><span class="od-sites-cleanup--label">{s.name || t('sites.noName')}</span><span class="od-sites-cleanup--sub">{describe(s)}</span></span>
          </ChoiceRow>
          <button type="button" class="od-icon-button od-sites-cleanup--keep-edit" aria-label={t('sites.editSite', { name: s.name || t('sites.noName') })} onclick={() => edit(s)}>
            <Icon name="edit" />
          </button>
        </div>
      {/each}
      <div class="od-sites-cleanup--actions">
        <button type="button" class="od-text-button" onclick={() => notDuplicates(pair)}>{t('sites.notDuplicates')}</button>
        <button type="button" class="od-sites-cleanup--filled" onclick={() => merge(pair)}>{t('sites.merge')}</button>
      </div>
    </fieldset>
  {/each}

  {#if unused.length}
    <h2 class="od-sites-cleanup--section">{t('sites.unusedTitle')}</h2>
    <div class="od-sites-cleanup--surface">
      <p class="od-sites-cleanup--explain">{t('sites.unusedIntro', { n: unused.length })}</p>
      <label class="od-sites-cleanup--row od-sites-cleanup--check-row">
        <span class="checkbox">
          <input type="checkbox" checked={selection.length === unused.length} indeterminate={selection.length > 0 && selection.length < unused.length} onchange={selectAll} />
          <i class="icon-checkbox"></i>
        </span>
        <span class="od-sites-cleanup--label od-sites-cleanup--strong">{t('sites.selectAll')}</span>
      </label>
      {#each unused as s (s.uuid)}
        <label class="od-sites-cleanup--row od-sites-cleanup--check-row">
          <span class="checkbox">
            <input type="checkbox" bind:checked={selected[s.uuid]} />
            <i class="icon-checkbox"></i>
          </span>
          <span class="od-sites-cleanup--text"><span class="od-sites-cleanup--label">{s.name || t('sites.noName')}</span><span class="od-sites-cleanup--sub">{t('sites.noDive')}</span></span>
        </label>
      {/each}
      <div class="od-sites-cleanup--actions">
        <button type="button" class="od-sites-cleanup--filled" disabled={!selection.length} onclick={deleteSelection}>
          {t('sites.deleteSelection', { n: selection.length })}
        </button>
      </div>
    </div>
  {/if}
</Page>

<style>
  @layer od.components {
    .od-sites-cleanup--surface {
      margin: 0 16px 12px;
      padding: 0;
      border: none;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
      min-width: 0;
    }

    /* Header of a duplicate group: the site's name, then the reason. */
    .od-sites-cleanup--head {
      float: left;
      width: 100%;
      box-sizing: border-box;
      padding: 12px 16px 10px;
      display: flex;
      flex-direction: column;

      .od-sites-cleanup--name {
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
      }

      + * {
        clear: both;
      }
    }

    .od-sites-cleanup--sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-sites-cleanup--row {
      min-height: 48px;
      padding: 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 16px;
      border-top: 1px solid var(--od-separator);
      cursor: pointer;
    }

    /* A choice and, apart from it, the button that edits the site. */
    .od-sites-cleanup--keep-row {
      min-height: 56px;
      box-sizing: border-box;
      padding-right: 4px;
      display: flex;
      align-items: center;
      border-top: 1px solid var(--od-separator);
    }

    :global(.od-sites-cleanup--keep-pick) {
      flex: 1;
      width: auto;
      min-width: 0;
      min-height: 56px;
      padding: 8px 16px;
    }

    .od-sites-cleanup--keep-edit {
      flex: none;
      width: 48px;
    }

    .od-sites-cleanup--text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .od-sites-cleanup--label {
      font-size: 16px;
      line-height: 24px;

      &.od-sites-cleanup--strong {
        font-weight: 600;
      }
    }

    .od-sites-cleanup--actions {
      padding: 10px 16px 12px;
      border-top: 1px solid var(--od-separator);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* Filled button in ink: "Fusionner", "Supprimer la sélection". */
    .od-sites-cleanup--filled {
      width: auto;
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      cursor: pointer;

      &:disabled {
        opacity: 0.38;
      }
    }

    /* Title on the page background, as on the site sheet. */
    .od-sites-cleanup--section {
      margin: 22px 16px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .od-sites-cleanup--explain {
      margin: 0;
      padding: 12px 16px 10px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
