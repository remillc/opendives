<script>
  // @ts-check
  // Logbook screen (spec, sections 3 to 6, "Carnet"): list by trip, search,
  // dive count, sync status, "+" button. A log can hold thousands of dives:
  // the list is virtual, only the rows near the screen are in the document.
  import { onDestroy, tick } from 'svelte';
  import { Page, Navbar, NavRight, Link, Subnavbar, Searchbar, List, Block, Button, f7, theme } from 'framework7-svelte';
  import SyncStatus from '../components/SyncStatus.svelte';
  import DiveRow from '../components/DiveRow.svelte';
  import TripRow from '../components/TripRow.svelte';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import { logbook, loadLogbook } from '../lib/logbook.svelte.js';
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

  let query = $state('');
  /** Expanded trips, by trip identifier of the current load. */
  let expanded = $state(/** @type {Record<number, boolean>} */ ({}));

  const sorted = $derived([...logbook.dives].sort((a, b) => b.date.localeCompare(a.date)));

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

  /** Number of dives shown: follows the search. */
  const count = $derived(
    results
      ? t('logbook.countFiltered', { n: results.length, total: sorted.length })
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
   * The three choices of the "+" button (spec, section 3). No action yet.
   * @type {{ key: string, icon: 'download'|'file'|'edit', text: string }[]}
   */
  const addChoices = [
    { key: 'download', icon: 'download', text: t('logbook.addDownload') },
    { key: 'import', icon: 'file', text: t('logbook.addImport') },
    { key: 'manual', icon: 'edit', text: t('logbook.addManual') },
  ];

  /** iOS "+" and the empty logbook: the choices in an action sheet. */
  function add() {
    f7.actions
      .create({
        buttons: [
          [{ text: t('logbook.add'), label: true }, ...addChoices.map((c) => ({ text: c.text }))],
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
    {#if theme.ios}
      <NavRight>
        <Link iconOnly onClick={add}><Icon name="plus" /><span class="od-sr-only">{t('logbook.add')}</span></Link>
      </NavRight>
    {/if}
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
    {#if sorted.length}<p class="count od-value" role="status">{count}</p>{/if}
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
    <Block>
      <h2 class="od-state-title">{t('logbook.emptyTitle')}</h2>
      <p>{t('logbook.emptyText')}</p>
      <Button tonal onClick={add}>{t('logbook.add')}</Button>
    </Block>
  {:else if results && results.length === 0}
    <Block><p>{t('logbook.noResults', { query })}</p></Block>
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
            <DiveRow dive={row.dive} prefs={logbook.prefs} inTrip={row.kind === 'inTrip'} index={row.index} top={visible.topPosition} />
          {/if}
        {/each}
      </ul>
    </div>
  {/if}

  {#snippet fixedContent()}
    {#if !theme.ios}
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
