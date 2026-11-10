<script>
  // @ts-check
  // Clean up the sites (docs/mockups/sites-nettoyer-android.dc.html): possible
  // duplicates in pairs, "These are not duplicates" or "Merge" (one site keeps
  // all the dives; undoable); unused sites with check boxes and "Delete the
  // selection". Each change of the logbook is confirmed first.
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { logbook } from '../lib/logbook.svelte.js';
  import { dismissPair, pairKey, possibleDuplicates, restorePair, siteChange } from '../lib/sites.svelte.js';
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
          f7.toast.create({ text: t('edit.failed'), closeTimeout: 4000 }).open();
        }
      },
    });
  }

  /** @param {(typeof pairs)[number]} pair */
  function notDuplicates(pair) {
    dismissPair(pair.a, pair.b);
    f7.toast
      .create({
        text: t('sites.notDuplicatesDone', { a: pair.a.name || t('sites.noName'), b: pair.b.name || t('sites.noName') }),
        closeButton: true,
        closeButtonText: t('edit.undo'),
        closeTimeout: 6000,
        position: 'bottom',
        on: { closeButtonClick: () => restorePair(pair.a, pair.b) },
      })
      .open();
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
          f7.toast.create({ text: t('edit.failed'), closeTimeout: 4000 }).open();
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

  <p class="od-intro">{t('sites.cleanupIntro')}</p>

  <!-- One surface per possible duplicate: the site kept is chosen with the radio buttons. -->
  {#each pairs as pair (pairKey(pair.a.uuid, pair.b.uuid))}
    {@const key = pairKey(pair.a.uuid, pair.b.uuid)}
    {@const both = ordered(pair)}
    <fieldset class="surface">
      <legend class="head">
        <span class="name">{both[0].name || t('sites.noName')}</span>
        <span class="sub">{reason(pair)}</span>
      </legend>
      {#each both as s (s.uuid)}
        <label class="row radio-row">
          <span class="radio">
            <input type="radio" name="keep-{key}" value={s.uuid} checked={(kept[key] ?? both[0].uuid) === s.uuid} onchange={() => (kept[key] = s.uuid)} />
            <i class="icon-radio"></i>
          </span>
          <span class="text"><span class="label">{s.name || t('sites.noName')}</span><span class="sub">{describe(s)}</span></span>
        </label>
      {/each}
      <div class="actions">
        <button type="button" class="od-text-button" onclick={() => notDuplicates(pair)}>{t('sites.notDuplicates')}</button>
        <button type="button" class="filled" onclick={() => merge(pair)}>{t('sites.merge')}</button>
      </div>
    </fieldset>
  {/each}

  {#if unused.length}
    <h2 class="section">{t('sites.unusedTitle')}</h2>
    <div class="surface">
      <p class="explain">{t('sites.unusedIntro', { n: unused.length })}</p>
      <label class="row check-row">
        <span class="checkbox">
          <input type="checkbox" checked={selection.length === unused.length} indeterminate={selection.length > 0 && selection.length < unused.length} onchange={selectAll} />
          <i class="icon-checkbox"></i>
        </span>
        <span class="label strong">{t('sites.selectAll')}</span>
      </label>
      {#each unused as s (s.uuid)}
        <label class="row check-row">
          <span class="checkbox">
            <input type="checkbox" bind:checked={selected[s.uuid]} />
            <i class="icon-checkbox"></i>
          </span>
          <span class="text"><span class="label">{s.name || t('sites.noName')}</span><span class="sub">{t('sites.noDive')}</span></span>
        </label>
      {/each}
      <div class="actions">
        <button type="button" class="filled" disabled={!selection.length} onclick={deleteSelection}>
          {t('sites.deleteSelection', { n: selection.length })}
        </button>
      </div>
    </div>
  {/if}
</Page>

<style>
  @layer od.components {
    .surface {
      margin: 0 16px 12px;
      padding: 0;
      border: none;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
      min-width: 0;
    }

    /* Header of a duplicate group: the site's name, then the reason. */
    .head {
      float: left;
      width: 100%;
      box-sizing: border-box;
      padding: 12px 16px 10px;
      display: flex;
      flex-direction: column;

      .name {
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
      }

      + * {
        clear: both;
      }
    }

    .sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .row {
      min-height: 48px;
      padding: 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 16px;
      border-top: 1px solid var(--od-separator);
      cursor: pointer;
    }

    .radio-row {
      min-height: 56px;
    }

    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .label {
      font-size: 16px;
      line-height: 24px;

      &.strong {
        font-weight: 600;
      }
    }

    .actions {
      padding: 10px 16px 12px;
      border-top: 1px solid var(--od-separator);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* Filled button in ink: "Fusionner", "Supprimer la sélection". */
    .filled {
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
    .section {
      margin: 22px 16px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .explain {
      margin: 0;
      padding: 12px 16px 10px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
