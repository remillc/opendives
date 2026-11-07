<script>
  // @ts-check
  // Logbook screen (spec, sections 3 to 6, "Carnet"): list by trip, search,
  // free filter, dive count, sync status, "+" button, and the states: loading,
  // error, empty logbook, offline with pending changes, sync conflict. A log can hold thousands of dives:
  // the list is virtual, only the rows near the screen are in the document.
  import { onDestroy, tick, untrack } from 'svelte';
  import { Page, Navbar, NavRight, Link, Subnavbar, Searchbar, List, ListItem, Block, Button, Popover, f7, theme } from 'framework7-svelte';
  import SyncStatus from '../components/SyncStatus.svelte';
  import DiveRow from '../components/DiveRow.svelte';
  import TripRow from '../components/TripRow.svelte';
  import Icon from '../components/Icon.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import ActiveFilter from '../components/ActiveFilter.svelte';
  import ConflictSheet from '../components/ConflictSheet.svelte';
  import { logbook, loadLogbook, importFile, undoLastChange, resolveConflict, deleteDives, tripChange } from '../lib/logbook.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { filter, loadOptions, applyFilter, isEmpty } from '../lib/filter.svelte.js';
  import { layout } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { formatDateTime } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { mark } from '../lib/perf.js';
  import { buildSnapshot, saveSnapshot } from '../lib/snapshot.js';
  import { offerUndo } from '../lib/undo.js';
  import { Capacitor } from '@capacitor/core';

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

  /** Download from the dive computer: Android only for now (Bluetooth). */
  const downloadRoute = Capacitor.getPlatform() === 'android' ? '/download/' : '/add/download/';

  let query = $state('');
  /** Expanded trips, by trip identifier of the current load. */
  let expanded = $state(/** @type {Record<number, boolean>} */ ({}));
  /** The trip just expanded: its dives slide into place (DiveRow `appear`). */
  let appearing = $state(0);
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let appearTimer;

  /** @param {number} id */
  function toggleTrip(id) {
    if (!id) return;
    if (!expanded[id]) {
      appearing = id;
      clearTimeout(appearTimer);
      // Only while it opens: rows scrolled into view later do not slide.
      appearTimer = setTimeout(() => (appearing = 0), 400);
    }
    expanded[id] = !expanded[id];
  }

  const all = $derived([...logbook.dives].sort((a, b) => b.date.localeCompare(a.date)));
  /** The dives that match the free filter (all of them without one). */
  const sorted = $derived(filter.ids ? all.filter((d) => filter.ids?.has(d.id)) : all);
  const filtered = $derived(!!filter.ids);

  // The top of the list is kept for the next start (lib/snapshot.js), once the
  // dives are loaded and the screen is at rest.
  $effect(() => {
    if (logbook.loading || logbook.error) return;
    const list = all;
    const prefs = logbook.prefs;
    const timer = setTimeout(() => saveSnapshot(list.length ? buildSnapshot(list, $state.snapshot(prefs)) : null), 1500);
    return () => clearTimeout(timer);
  });

  /**
   * A tap on the start snapshot, kept until the real list is there: the
   * snapshot's dive identifiers are of the previous load, so the dive is
   * found again by its date and number.
   * @type {{ date: string, number: number, expand: boolean }|null}
   */
  let heldTap = null;

  /** @param {MouseEvent} e */
  function holdTap(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = /** @type {HTMLElement} */ (e.target);
    const li = target.closest('li');
    const index = li ? [...(li.parentElement?.children ?? [])].indexOf(li) : -1;
    const entry = logbook.preview?.entries[index];
    if (!entry) return;
    const dive = entry.type === 'trip' ? entry.dives[0] : entry.dive;
    heldTap = { date: dive.date, number: dive.number, expand: entry.type === 'trip' && !!target.closest('.expand') };
  }

  // The held tap is replayed on the real row once the dives are loaded.
  $effect(() => {
    if (logbook.loading || !heldTap) return;
    const tap = heldTap;
    heldTap = null;
    const dive = logbook.dives.find((d) => d.date === tap.date && d.number === tap.number);
    if (!dive) return;
    tick().then(() => {
      // At start, only the logbook holds links to dives and trips.
      const href = dive.trip ? `/trip/${dive.trip.id}/` : `/dive/${dive.id}/`;
      const link = /** @type {HTMLElement|null} */ (document.querySelector(`a[href="${href}"]`));
      /** @type {HTMLElement|null} */ (tap.expand ? link?.querySelector('.expand') : link)?.click();
    });
  });

  // --- Selection mode: a long press on a dive shows a check box before every
  // dive, the pressed one checked. A tap then checks or unchecks a dive; the
  // ✕ of the top bar, Android's Back or unchecking the last dive leaves it.

  let selecting = $state(false);
  /** Checked dives, by identifier of the current load. */
  let checked = $state(/** @type {Record<number, boolean>} */ ({}));
  const checkedCount = $derived(Object.values(checked).filter(Boolean).length);
  const LONG_PRESS_MS = 500;

  /** @param {number} id */
  function startSelection(id) {
    checked = { [id]: true };
    selecting = true;
    if (fabEl) f7.fab.close(fabEl);
    closeMenu();
  }

  function endSelection() {
    if (selecting) closeMenu();
    selecting = false;
    checked = {};
  }

  /** The ⋮ menu is placed for its items when it opens: it closes when the selection starts or ends. */
  function closeMenu() {
    f7.popover.close('.od-logbook-menu', false);
  }

  /** @param {number} id */
  function toggleChecked(id) {
    checked[id] = !checked[id];
    if (!Object.values(checked).some(Boolean)) endSelection();
  }

  const checkedIds = $derived(Object.keys(checked).filter((id) => checked[Number(id)]).map(Number));

  /**
   * The trips just above and below the checked dives, when these are dives
   * outside trips that follow one another in the list: "Add to the trip
   * above / below" (the list goes from the most recent to the oldest).
   */
  const neighbourTrips = $derived.by(() => {
    /** @type {{ above: number|null, below: number|null }} */
    const none = { above: null, below: null };
    if (!checkedIds.length) return none;
    const positions = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.type === 'trip') {
        if (e.dives.some((d) => checked[d.id])) return none;
      } else if (checked[e.dive.id]) positions.push(i);
    }
    if (positions.length !== checkedIds.length) return none;
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (last - first + 1 !== positions.length) return none;
    /** @param {Entry|undefined} e */
    const tripOf = (e) => (e?.type === 'trip' ? (e.dives[0].trip?.id ?? null) : null);
    return { above: tripOf(entries[first - 1]), below: tripOf(entries[last + 1]) };
  });

  /** @param {unknown} e */
  function changeFailed(e) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('Logbook selection', code);
    f7.dialog
      .create({
        text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('logbook.selectionFailed'),
        buttons: [{ text: t('dialog.ok') }],
      })
      .open();
  }

  function deleteChecked() {
    const ids = checkedIds;
    const n = ids.length;
    confirmAction({
      title: t('logbook.deleteTitle', { n }),
      text: t('logbook.deleteText', { n }),
      action: t('logbook.deleteAction'),
      onConfirm: async () => {
        try {
          await deleteDives(ids);
          endSelection();
          offerUndo(t('logbook.deleted', { n }));
        } catch (e) {
          changeFailed(e);
        }
      },
    });
  }

  async function createTrip() {
    try {
      const result = await tripChange({ action: 'create', diveIds: checkedIds });
      endSelection();
      const id = result.trip?.tripId;
      if (id) expanded[id] = true;
      offerUndo(t('logbook.tripCreated'));
    } catch (e) {
      changeFailed(e);
    }
  }

  /** @param {number} tripId */
  async function addToTrip(tripId) {
    const n = checkedIds.length;
    try {
      await tripChange({ action: 'add', tripId, diveIds: checkedIds });
      endSelection();
      expanded[tripId] = true;
      offerUndo(t('logbook.addedToTrip', { n }));
    } catch (e) {
      changeFailed(e);
    }
  }

  // Items of the open menu come and go with the dives checked (Add to the
  // trip above or below): it is placed again for its new size.
  $effect(() => {
    neighbourTrips;
    tick().then(() => /** @type {any} */ (f7.popover.get('.od-logbook-menu'))?.resize());
  });

  // A new load gives new identifiers: the selection is left.
  $effect(() => {
    logbook.dives;
    untrack(endSelection);
  });

  // The long press and the taps of the selection mode, on the list itself
  // (its rows come and go with the scrolling).
  $effect(() => {
    const el = listEl;
    if (!el) return;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    let startX = 0;
    let startY = 0;
    /** The press became a long press: the click that follows is dropped. */
    let pressed = false;
    const cancel = () => clearTimeout(timer);

    /** @param {Event} e */
    const diveOf = (e) => /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a.dive-row'));

    /** @param {PointerEvent} e */
    function down(e) {
      pressed = false;
      const row = diveOf(e);
      if (!row || selecting) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        pressed = true;
        startSelection(Number(row.dataset.dive));
      }, LONG_PRESS_MS);
    }
    /** @param {PointerEvent} e */
    function move(e) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
    }
    /**
     * On the window, in the capture phase: Framework7 follows the links from
     * the document's own capture phase, which would open the dive.
     * @param {MouseEvent} e
     */
    function click(e) {
      if (!el?.contains(/** @type {Node} */ (e.target))) return;
      if (pressed) {
        pressed = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // A trip's arrow expands it in place (accordion), without opening it:
      // its button sits in the row's link, which Framework7 would follow.
      const arrow = /** @type {HTMLElement} */ (e.target).closest('.trip-row .expand');
      if (arrow) {
        e.preventDefault();
        e.stopPropagation();
        toggleTrip(Number(/** @type {HTMLElement|null} */ (arrow.closest('li'))?.dataset.trip));
        return;
      }
      if (!selecting) return;
      const row = diveOf(e);
      // In selection mode a dive is checked, not opened; a trip only expands.
      if (row) toggleChecked(Number(row.dataset.dive));
      e.preventDefault();
      e.stopPropagation();
    }
    /** @param {Event} e The WebView's own long-press menu is not wanted. */
    const menu = (e) => diveOf(e) && e.preventDefault();

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    window.addEventListener('click', click, true);
    el.addEventListener('contextmenu', menu);
    return () => {
      cancel();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', cancel);
      el.removeEventListener('pointercancel', cancel);
      window.removeEventListener('click', click, true);
      el.removeEventListener('contextmenu', menu);
    };
  });

  // Android's Back leaves the selection (lib/back-button.js).
  /** @type {HTMLElement|undefined} */
  let selectionBar = $state();
  $effect(() => {
    const el = selectionBar;
    if (!el) return;
    el.addEventListener('od-cancel', endSelection);
    return () => el.removeEventListener('od-cancel', endSelection);
  });

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
  let rowsMarked = false;
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
          if (data.items.length && !rowsMarked) {
            rowsMarked = true;
            mark('rowsRender');
            requestAnimationFrame(() => requestAnimationFrame(() => mark('rowsPainted')));
          }
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

  /**
   * Where each choice leads. The download from the dive computer is built
   * for Android only: elsewhere it still says it is not available.
   */
  const routes = /** @type {Record<string, string>} */ ({
    download: downloadRoute,
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
      offerUndo(t('logbook.imported', { n }));
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

  // Android tablet: the "+" button of the rail asks for the choices (an action sheet).
  let seenRequests = navigation.addRequests;
  $effect(() => {
    const n = navigation.addRequests;
    if (n === seenRequests) return;
    seenRequests = n;
    add();
  });

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

<Page class="od-logbook">
  <Navbar large title={t('logbook.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      {#if logbook.dives.length || logbook.preview}
        <Link iconOnly popoverOpen=".od-logbook-menu" class={logbook.dives.length ? '' : 'disabled'}>
          {#if theme.ios}<Icon name="moreCircle" />{:else}<Icon name="more" weight={4} />{/if}
          <span class="od-sr-only">{t('detail.moreOptions')}</span>
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
      <p class="count od-value" role="status">{count}{#if selecting}<span class="separator" aria-hidden="true">·</span><span class="count-selected">{t('logbook.selected', { n: checkedCount })}</span>{/if}</p>
    {/if}
    {#if filter.failed}<p class="count failed" role="status">{t('logbook.filterFailed')}</p>{/if}
    <!--
      Only offline or in manual synchronisation, when the logbook may be out of
      date; the side menu shows every state.
    -->
    {#if logbook.sync === 'offline' || logbook.sync === 'manual'}<SyncStatus sync={logbook.sync} pending={logbook.pending} />{/if}
  {/if}

  {#if logbook.loading && logbook.preview}
    <!--
      Start: the top of the list as it was at the last load, drawn while the
      core reads the log. A tap is held and replayed on the real row when
      the list replaces them (their identifiers are of the previous load).
    -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="preview" aria-busy="true" aria-label={t('logbook.loading')} role="status" onclickcapture={holdTap}>
      <div aria-hidden="true">
        <p class="count od-value">{t('logbook.count', { n: logbook.preview.total })}</p>
        <div class="list media-list chevron-center dividers dives">
          <ul>
            {#each logbook.preview.entries as entry, i (i)}
              {#if entry.type === 'trip'}
                <TripRow dives={entry.dives} location={entry.location} prefs={logbook.preview.prefs} expanded={false} ontoggle={() => {}} />
              {:else}
                <DiveRow dive={entry.dive} prefs={logbook.preview.prefs} />
              {/if}
            {/each}
          </ul>
        </div>
      </div>
    </div>
  {:else if logbook.loading}
    <!--
      Loading (spec, section 6): greyed bars in the place and the layout of the
      real rows, with no spinner in the middle; screen readers hear "Loading
      the logbook". Each bar is one line of text high, so that the rows keep
      their height when the dives arrive.
    -->
    <div class="loading skeleton-effect-wave" aria-busy="true" aria-label={t('logbook.loading')} role="status">
      <div aria-hidden="true">
        <p class="count"><span class="skeleton-block bar" style:width="7.5em"></span></p>
        <List mediaList dividers class="chevron-center dives">
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
        <a href={downloadRoute} class="filled">
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

  <!--
    Overflow menu: Filter, and with a selection Delete, Create a trip, Add to
    the trip above / below.
  -->
  <Popover class="od-menu od-logbook-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon="filter" text={t(filtered ? 'logbook.menuFilterOn' : 'logbook.menuFilter')} link="/filter/" />
      {#if selecting}
        <MenuItem icon="delete" text={t('logbook.menuDelete')} destructive onclick={deleteChecked} />
        <MenuItem icon="plus" text={t('logbook.menuCreateTrip')} onclick={createTrip} />
        {#if neighbourTrips.above}
          {@const id = neighbourTrips.above}
          <MenuItem icon="arrowUp" text={t('logbook.menuAddAbove', { n: checkedCount })} onclick={() => addToTrip(id)} />
        {/if}
        {#if neighbourTrips.below}
          {@const id = neighbourTrips.below}
          <MenuItem icon="arrowDown" text={t('logbook.menuAddBelow', { n: checkedCount })} onclick={() => addToTrip(id)} />
        {/if}
      {/if}
    </List>
  </Popover>

  {#if !logbook.loading && !logbook.error && rows.length}
    <div class="list media-list chevron-center dividers virtual-list dives" bind:this={listEl}>
      <ul>
        {#each visible.items as row (row.key)}
          {#if row.kind === 'trip'}
            <TripRow
              dives={row.dives}
              location={row.location}
              prefs={logbook.prefs}
              expanded={!!expanded[row.id]}
              ontoggle={() => toggleTrip(row.id)}
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
              {selecting}
              checked={!!checked[row.dive.id]}
              appear={row.kind === 'inTrip' && row.dive.trip?.id === appearing}
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
    {#if selecting}
      <!-- Selection mode: the top bar gives way to the number of dives checked. -->
      <div class="selection-bar" bind:this={selectionBar}>
        <button type="button" class="od-icon-button" onclick={endSelection}>
          <Icon name="close" /><span class="od-sr-only">{t('logbook.selectionClose')}</span>
        </button>
        <span class="selection-count od-value" role="status">{t('logbook.selected', { n: checkedCount })}</span>
        <a href="#" class="link icon-only popover-open selection-more" data-popover=".od-logbook-menu" role="button">
          {#if theme.ios}<Icon name="moreCircle" />{:else}<Icon name="more" weight={4} />{/if}
          <span class="od-sr-only">{t('detail.moreOptions')}</span>
        </a>
      </div>
    {/if}
    {#if !theme.ios && layout.phone && logbook.dives.length && !selecting}
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
  /*
   * Android: a shorter large title (less space above "Logbook") and a taller
   * search band, for some air under the search box. Outside the layers:
   * Framework7's own variables are set without one.
   */
  :global(.md .od-logbook) {
    --f7-navbar-large-title-height: 64px;
    --f7-subnavbar-height: 76px;
  }

  /* The title and the search box at the top of their bands: the room is under the search box. */
  :global(.md .od-logbook .title-large),
  :global(.md .od-logbook .subnavbar) {
    align-items: flex-start;
  }

  @layer od.components {
    .count {
      margin: 8px 16px 0;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .count .separator {
      margin: 0 0.4em;
    }

    /* Selection mode: the number of dives checked, beside the total. */
    .count-selected {
      color: var(--od-text);
      font-weight: 500;
    }

    .failed {
      color: var(--od-alarm);
    }

    /* The snapshot of the start: a tap is held until the real list is there. */
    .preview {
      user-select: none;
    }

    /* Selection mode: over the top bar, the same height. */
    .selection-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 600;
      height: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
      padding: var(--f7-safe-area-top) 8px 0 4px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--od-surface-2);
    }

    .selection-count {
      font-size: 22px;
      line-height: 28px;
      color: var(--od-text);
    }

    .selection-more {
      margin-left: auto;
    }

    /* The dives follow the count and the sync status closely. */
    :global(.list.dives) {
      margin-top: 0;
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
