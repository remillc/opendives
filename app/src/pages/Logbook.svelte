<script>
  // @ts-check
  // Logbook screen (spec, sections 3 to 6, "Carnet"): list by trip, search,
  // free filter, dive count, sync status, "+" button, and the states: loading,
  // error, empty logbook, offline with pending changes, sync conflict. A log can hold thousands of dives:
  // the list is virtual, only the rows near the screen are in the document.
  import { onDestroy, tick, untrack } from 'svelte';
  import { Page, Navbar, NavRight, Link, Subnavbar, Searchbar, List, ListItem, Block, Button, f7, theme } from 'framework7-svelte';
  import SyncStatus from '../components/SyncStatus.svelte';
  import DiveRow from '../components/DiveRow.svelte';
  import TripRow from '../components/TripRow.svelte';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import ActiveFilter from '../components/ActiveFilter.svelte';
  import ConflictSheet from '../components/ConflictSheet.svelte';
  import { logbook, loadLogbook, importFile, undoLastChange, resolveConflict } from '../lib/logbook.svelte.js';
  import { filter, loadOptions, applyFilter, isEmpty } from '../lib/filter.svelte.js';
  import { formatDateTime } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('opendives-core').Dive} Dive */
  /**
   * @typedef {{ type: 'dive', key: string, dive: Dive }
   *   | { type: 'trip', key: string, location: string, dives: Dive[] }} Entry
   */
  /**
   * A row of the virtual list. `kind` groups rows of the same layout, hence of
   * the same probable height.
   * @typedef {{ kind: 'dive'|'inTrip', key: string, index: number, dive: Dive }
   *   | { kind: 'trip', key: string, index: number, id: number, location: string, dives: Dive[] }} Row
   */

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  let query = $state('');
  /** Expanded trips, by trip identifier of the current load. */
  let expanded = $state(/** @type {Record<number, boolean>} */ ({}));

  const all = $derived([...logbook.dives].sort((a, b) => b.date.localeCompare(a.date)));
  /** The dives that match the free filter (all of them without one). */
  const sorted = $derived(filter.ids ? all.filter((d) => filter.ids?.has(d.id)) : all);
  const filtered = $derived(!!filter.ids);

  // Each load gives new dive identifiers and maybe new values: the criteria
  // are read again and the filter applied again.
  $effect(() => {
    logbook.dives;
    if (logbook.loading || logbook.error) return;
    untrack(() => {
      loadOptions();
      if (!isEmpty(filter.applied)) applyFilter(filter.applied, logbook.prefs);
    });
  });

  /** Dives outside trips and trips, from the most recent to the oldest. */
  const entries = $derived.by(() => {
    /** @type {Entry[]} */
    const list = [];
    /** @type {Map<number, Extract<Entry, {type: 'trip'}>>} */
    const trips = new Map();
    for (const dive of sorted) {
      if (!dive.trip) {
        list.push({ type: 'dive', key: `d${dive.id}`, dive });
        continue;
      }
      let trip = trips.get(dive.trip.id);
      if (!trip) {
        trip = { type: 'trip', key: `t${dive.trip.id}`, location: dive.trip.location, dives: [] };
        trips.set(dive.trip.id, trip);
        list.push(trip);
      }
      trip.dives.push(dive);
    }
    return list;
  });

  /** Search: site, trip, number or date; flat result. */
  const results = $derived.by(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return null;
    return sorted.filter(
      (d) =>
        d.site.toLocaleLowerCase().includes(q) ||
        (d.trip?.location ?? '').toLocaleLowerCase().includes(q) ||
        String(d.number) === q ||
        formatDateTime(d.date).toLocaleLowerCase().includes(q),
    );
  });

  /** Rows shown: the search results, or the dives and trips with the expanded trips' dives. */
  const rows = $derived.by(() => {
    /** @type {Row[]} */
    const list = [];
    if (results) {
      for (const dive of results) list.push({ kind: 'dive', key: `d${dive.id}`, index: list.length, dive });
      return list;
    }
    for (const entry of entries) {
      if (entry.type === 'dive') {
        list.push({ kind: 'dive', key: entry.key, index: list.length, dive: entry.dive });
        continue;
      }
      const id = entry.dives[0].trip?.id ?? 0;
      list.push({ kind: 'trip', key: entry.key, index: list.length, id, location: entry.location, dives: entry.dives });
      if (expanded[id]) {
        for (const dive of entry.dives) list.push({ kind: 'inTrip', key: `d${dive.id}`, index: list.length, dive });
      }
    }
    return list;
  });

  /** Number of dives shown: follows the search (the filter row counts the filter). */
  const count = $derived(
    results
      ? t('logbook.countFiltered', { n: results.length, total: all.length })
      : t('logbook.count', { n: sorted.length }),
  );

  // --- Virtual list (Framework7). Row heights depend on the text size and on
  // long site names that wrap: each rendered row is measured and its height
  // kept by key, so that expanding a trip does not lose what was measured.

  /** @type {HTMLElement|undefined} */
  let listEl = $state();
  /** @type {any} */
  let vl = null;
  let visible = $state({ items: /** @type {Row[]} */ ([]), topPosition: 0 });
  /** @type {Map<string, number>} */
  const measured = new Map();
  /** Height of a row not measured yet: the last one measured of the same kind. */
  const typical = { dive: 72, inTrip: 72, trip: 96 };

  /** @param {Row} row */
  function rowHeight(row) {
    return measured.get(row.key) ?? typical[row.kind];
  }

  async function measure() {
    await tick();
    if (!vl || !listEl) return;
    let changed = false;
    for (const li of listEl.querySelectorAll('ul > li[data-virtual-list-index]')) {
      const row = vl.items[Number(li.getAttribute('data-virtual-list-index'))];
      const height = /** @type {HTMLElement} */ (li).offsetHeight;
      if (!row || !height || rowHeight(row) === height) continue;
      measured.set(row.key, height);
      typical[/** @type {Row} */ (row).kind] = height;
      changed = true;
    }
    if (changed) vl.update();
  }

  function forgetHeights() {
    measured.clear();
    vl?.update();
  }

  $effect(() => {
    const items = rows;
    // The list leaves the document with an empty search: its instance goes with it.
    if (vl && vl.el !== listEl) {
      vl.destroy();
      vl = null;
    }
    if (!listEl) return;
    if (!vl) {
      vl = f7.virtualList.create({
        el: listEl,
        items,
        height: rowHeight,
        renderExternal: (/** @type {any} */ _vl, /** @type {{items: Row[], topPosition: number}} */ data) => {
          visible = { items: data.items, topPosition: data.topPosition };
          measure();
        },
      });
    } else {
      vl.replaceAllItems(items);
    }
  });

  // The text size or the width changed: every height is to be measured again.
  if (typeof window !== 'undefined') window.addEventListener('resize', forgetHeights);
  onDestroy(() => {
    window.removeEventListener('resize', forgetHeights);
    vl?.destroy();
    vl = null;
  });

  /**
   * The three choices of the "+" button (spec, section 3). None can be done
   * by this version yet: each opens a screen that says so.
   * @type {{ key: string, icon: 'download'|'file'|'edit', text: string }[]}
   */
  const addChoices = [
    { key: 'download', icon: 'download', text: t('logbook.addDownload') },
    { key: 'import', icon: 'file', text: t('logbook.addImport') },
    { key: 'manual', icon: 'edit', text: t('logbook.addManual') },
  ];

  /**
   * The empty logbook (spec, section 6, "Empty"): pair a dive computer,
   * import a file, download from divelogs.de, log by hand.
   * @type {{ key: string, icon: 'download'|'file'|'edit', text: string }[]}
   */
  const emptyChoices = [
    { key: 'download', icon: 'download', text: t('logbook.emptyPair') },
    { key: 'import', icon: 'file', text: t('logbook.addImport') },
    { key: 'divelogs', icon: 'download', text: t('logbook.emptyDivelogs') },
    { key: 'manual', icon: 'edit', text: t('logbook.addManual') },
  ];

  /** Where each choice leads; download from the dive computer is not built yet. */
  const routes = /** @type {Record<string, string>} */ ({
    download: '/add/download/',
    manual: '/dive/new/',
    divelogs: '/welcome/import/',
  });

  /** @param {string} key download, import, manual, divelogs */
  function choose(key) {
    if (key === 'import') fileInput?.click();
    else f7router.navigate(routes[key]);
  }

  // Import a file: the WebView's own file picker, no native code; the core
  // reads the file and merges it into the logbook as one undoable step.
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();
  let importing = $state(false);

  /** @param {string} text */
  function toast(text) {
    f7.toast.create({ text, closeTimeout: 4000, position: 'bottom' }).open();
  }

  async function fileChosen() {
    const file = fileInput?.files?.[0];
    if (!file || !fileInput) return;
    fileInput.value = '';
    importing = true;
    try {
      const n = await importFile(file);
      f7.toast
        .create({
          text: t('logbook.imported', { n }),
          closeButton: true,
          closeButtonText: t('edit.undo'),
          closeTimeout: 5000,
          position: 'bottom',
          on: {
            closeButtonClick: async () => {
              try {
                await undoLastChange();
                toast(t('edit.undone'));
              } catch (e) {
                console.error('Undo', e);
                toast(t('edit.undoFailed'));
              }
            },
          },
        })
        .open();
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Import a file', code);
      const key = code.startsWith('NO_NEW_DIVES')
        ? 'logbook.importNothingNew'
        : code.startsWith('NO_DIVES')
          ? 'logbook.importNoDives'
          : code.startsWith('WRITE_LOCKED')
            ? 'edit.writeLocked'
            : 'logbook.importFailed';
      f7.dialog.create({ title: t('logbook.importTitle'), text: t(key), buttons: [{ text: t('dialog.ok') }] }).open();
    } finally {
      importing = false;
    }
  }

  /** iOS "+": the choices in an action sheet. */
  function add() {
    f7.actions
      .create({
        buttons: [
          [
            { text: t('logbook.add'), label: true },
            ...addChoices.map((c) => ({ text: c.text, onClick: () => choose(c.key) })),
          ],
          [{ text: t('logbook.cancel'), bold: true }],
        ],
      })
      .open();
  }

  // Android "+": a floating button that opens its choices above it. The links
  // are "external" (no routing), which Framework7's own click handling skips:
  // the button and the choices open and close it here; Framework7 closes it
  // on the scrim. Its state is followed for screen readers.
  /** @type {HTMLElement|undefined} */
  let fabEl = $state();
  let fabOpen = $state(false);
  $effect(() => {
    const el = fabEl;
    if (!el) return;
    const opened = () => (fabOpen = true);
    const closed = () => (fabOpen = false);
    el.addEventListener('fab:open', opened);
    el.addEventListener('fab:close', closed);
    return () => {
      el.removeEventListener('fab:open', opened);
      el.removeEventListener('fab:close', closed);
    };
  });
</script>

<Page>
  <Navbar large title={t('logbook.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      {#if logbook.dives.length}
        <Link iconOnly href="/filter/" class={filtered ? 'filter-on' : ''}>
          <Icon name="filter" /><span class="od-sr-only">{t(filtered ? 'logbook.filterOn' : 'logbook.filter')}</span>
        </Link>
      {/if}
      {#if theme.ios}
        <Link iconOnly onClick={add}><Icon name="plus" /><span class="od-sr-only">{t('logbook.add')}</span></Link>
      {/if}
    </NavRight>
    <Subnavbar inner={false}>
      <Searchbar
        customSearch
        disableButtonText={t('logbook.cancel')}
        placeholder={t('logbook.search')}
        onSearchbarSearch={(/** @type {any} */ _sb, /** @type {string} */ q) => (query = q)}
        onSearchbarClear={() => (query = '')}
      />
    </Subnavbar>
  </Navbar>

  <!-- While loading, the count and the status are not known yet: nothing is shown. -->
  {#if !logbook.loading && !logbook.error}
    {#if filtered}
      <ActiveFilter prefs={logbook.prefs} dives={logbook.dives} shown={results ? results.length : sorted.length} />
    {:else if sorted.length}
      <p class="count od-value" role="status">{count}</p>
    {/if}
    {#if filter.failed}<p class="count failed" role="status">{t('logbook.filterFailed')}</p>{/if}
    <!--
      Only offline or in manual synchronisation, when the logbook may be out of
      date; the side menu shows every state.
    -->
    {#if logbook.sync === 'offline' || logbook.sync === 'manual'}<SyncStatus sync={logbook.sync} pending={logbook.pending} />{/if}
  {/if}

  {#if logbook.loading}
    <!--
      Loading (spec, section 6): greyed bars in the place and the layout of the
      real rows, with no spinner in the middle; screen readers hear "Loading
      the logbook". Each bar is one line of text high, so that the rows keep
      their height when the dives arrive.
    -->
    <div class="loading skeleton-effect-wave" aria-busy="true" aria-label={t('logbook.loading')} role="status">
      <div aria-hidden="true">
        <p class="count"><span class="skeleton-block bar" style:width="7.5em"></span></p>
        <List mediaList dividers class="chevron-center">
          {#each Array(14) as _, i (i)}
            <li>
              <!-- item-link: the same chevron space as the real rows. -->
              <div class="item-content item-link">
                <div class="item-media"><div class="skeleton-block skeleton-thumbnail"></div></div>
                <div class="item-inner od-row">
                  <div class="od-row-text">
                    <div class="item-title"><span class="skeleton-block bar" style:width="{40 + ((i * 17) % 35)}%"></span></div>
                    <div class="item-text"><span class="skeleton-block bar" style:width="9em"></span></div>
                  </div>
                  <div class="skeleton-values">
                    <span class="value"><span class="skeleton-block bar" style:width="3em"></span></span>
                    <span class="duration"><span class="skeleton-block bar" style:width="2.5em"></span></span>
                  </div>
                </div>
              </div>
            </li>
          {/each}
        </List>
      </div>
    </div>
  {:else if logbook.error}
    <Block>
      <h2 class="od-state-title">{t('logbook.errorTitle')}</h2>
      <p>{t('logbook.errorNothingChanged')}</p>
      <p>{t('logbook.errorCheck')}</p>
      <ol>
        <li>{t('logbook.errorInternet')}</li>
        <li>{t('logbook.errorStorage')}</li>
      </ol>
      <Button fill class="od-primary-action" onClick={() => loadLogbook()}>{t('logbook.retry')}</Button>
    </Block>
  {:else if logbook.dives.length === 0}
    <!-- Empty logbook (docs/mockups/*-etat-vide): the choices of "+" directly. -->
    {#if logbook.email}<p class="count">{t('logbook.emptyCloud')}</p>{/if}
    <div class="empty">
      <h2 class="od-state-title">{t('logbook.emptyTitle')}</h2>
      <p class="empty-text">{t('logbook.emptyText')}</p>
    </div>
    {#if theme.ios}
      <List inset strong dividers class="empty-choices">
        {#each emptyChoices as c, i (c.key)}
          <ListItem link="#" title={c.text} class={i === 0 ? 'first' : ''} noChevron onClick={() => choose(c.key)}>
            {#snippet media()}<Icon name={c.icon} size={22} />{/snippet}
          </ListItem>
        {/each}
      </List>
    {:else}
      <div class="empty-buttons">
        <a href="/add/download/" class="filled">
          <Icon name="download" size={18} weight={2} />{t('logbook.emptyPair')}
        </a>
        <button type="button" class="od-outlined-button" onclick={() => choose('import')}>{t('logbook.addImport')}</button>
        <a href="/welcome/import/" class="od-outlined-button">{t('logbook.emptyDivelogs')}</a>
        <a href="/dive/new/" class="od-text-button">{t('logbook.addManual')}</a>
      </div>
    {/if}
    <p class="empty-note">{t('logbook.emptyNote')}</p>
  {:else if results && results.length === 0}
    <Block><p>{t('logbook.noResults', { query })}</p></Block>
  {:else if filtered && sorted.length === 0}
    <Block><p>{t('logbook.noFilterResults')}</p></Block>
  {/if}

  {#if !logbook.loading && !logbook.error && rows.length}
    <div class="list media-list chevron-center dividers virtual-list" bind:this={listEl}>
      <ul>
        {#each visible.items as row (row.key)}
          {#if row.kind === 'trip'}
            <TripRow
              dives={row.dives}
              location={row.location}
              prefs={logbook.prefs}
              expanded={!!expanded[row.id]}
              ontoggle={() => (expanded[row.id] = !expanded[row.id])}
              index={row.index}
              top={visible.topPosition}
            />
          {:else}
            <DiveRow
              dive={row.dive}
              prefs={logbook.prefs}
              inTrip={row.kind === 'inTrip'}
              index={row.index}
              top={visible.topPosition}
              pending={row.dive.number ? (logbook.pendingByDive[row.dive.number] ?? []) : []}
            />
          {/if}
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Not reported by the core yet: logbook.conflict stays null (see the report). -->
  <ConflictSheet conflict={logbook.conflict} onchoose={resolveConflict} />

  <!-- The file picker of "Import a file" (hidden; any file: the core tells what it can read). -->
  <input type="file" class="od-sr-only" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
  {#if importing}<p class="od-sr-only" role="status">{t('logbook.importing')}</p>{/if}

  {#snippet fixedContent()}
    {#if !theme.ios && logbook.dives.length}
      <!--
        Written by hand: the Fab component of framework7-svelte 9 calls onclick
        twice and leaves the link without a name for screen readers.
      -->
      <div class="fab-backdrop"></div>
      <div class="fab fab-right-bottom od-fab-add" bind:this={fabEl}>
        <a
          href="#add"
          class="external"
          role="button"
          aria-expanded={fabOpen}
          aria-controls="od-add-choices"
          onclick={(e) => {
            e.preventDefault();
            f7.fab.toggle(fabEl);
          }}
        >
          <i class="icon"><Icon name="plus" /></i>
          <i class="icon"><Icon name="close" /></i>
          <span class="od-sr-only">{t('logbook.add')}</span>
        </a>
        <div class="fab-buttons fab-buttons-top" id="od-add-choices">
          {#each addChoices as choice (choice.key)}
            <a
              href="#{choice.key}"
              class="external fab-label-button"
              role="button"
              onclick={(e) => {
                e.preventDefault();
                f7.fab.close(fabEl);
                choose(choice.key);
              }}
            >
              <span><Icon name={choice.icon} /></span>
              <span class="fab-label">{choice.text}</span>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  {/snippet}
</Page>

<style>
  @layer od.components {
    .count {
      margin: 8px 16px 0;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .failed {
      color: var(--od-alarm);
    }

    /* The filter button says when a filter is applied: a tinted circle. */
    :global(.navbar .filter-on) {
      background: var(--od-tint);
      border-radius: 50%;
    }

    .empty {
      margin: 48px 24px 0;

      :global(.ios) & {
        margin-inline: 32px;
      }
    }

    .empty-text {
      margin: 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .empty-buttons {
      margin: 24px 24px 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;

      a {
        display: inline-flex;
        align-items: center;
        box-sizing: border-box;
        text-decoration: none;
      }
    }

    /* MD3 filled button with a leading icon: 16 dp before it, 24 dp after the label. */
    .filled {
      height: 40px;
      padding: 0 24px 0 16px;
      gap: 8px;
      border-radius: 20px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
    }

    :global(.empty-choices .first .item-title) {
      font-weight: 600;
    }

    .empty-note {
      margin: 16px 24px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);

      :global(.ios) & {
        margin: 8px 32px 0;
        font-size: 13px;
        line-height: 18px;
        letter-spacing: 0;
      }
    }

    .skeleton-thumbnail {
      width: 56px;
      height: 40px;
      border-radius: 8px;
    }

    /* Depth and duration on the right, as in <DiveRow>. */
    .skeleton-values {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex: 0 0 auto;

      .value {
        line-height: 22px;
      }

      .duration {
        line-height: 18px;
      }
    }

    /* A greyed bar one line of text high. */
    .bar {
      display: inline-block;
      height: 0.8em;
      max-width: 100%;
      border-radius: 4px;
      vertical-align: middle;
    }

  }
</style>
