<script>
  // @ts-check
  // Logbook screen (spec, sections 3 to 6, "Carnet"): list by trip, search,
  // free filter, dive count, sync status, "+" button, and the states: loading,
  // error, empty logbook, offline with pending changes, sync conflict. A log can hold thousands of dives:
  // the list is virtual, only the rows near the screen are in the document.
  import { onDestroy, tick, untrack } from 'svelte';
  import { Page, Navbar, NavRight, Link, Searchbar, List, ListItem, Block, Button, Popover, f7, theme } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import SyncStatus from '../components/SyncStatus.svelte';
  import SyncFailureRow from '../components/SyncFailureRow.svelte';
  import SyncPill from '../components/SyncPill.svelte';
  import DiveRow from '../components/DiveRow.svelte';
  import TripRow from '../components/TripRow.svelte';
  import BandBackdrop from '../components/BandBackdrop.svelte';
  import Icon from '../components/Icon.svelte';
  import FabMenu from '../components/FabMenu.svelte';
  import { scanQr } from '../lib/qr-receive.svelte.js';
  import FloatingToolbar from '../components/FloatingToolbar.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import FlightBanner from '../components/FlightBanner.svelte';
  import ActiveFilter from '../components/ActiveFilter.svelte';
  import RenumberDialog from '../components/RenumberDialog.svelte';
  import ExportSheet from '../components/ExportSheet.svelte';
  import { exportDives } from '../lib/share.js';
  import { importErrorKey } from '../lib/deep-link.js';
  import { logbook, loadLogbook, importFile, undoLastChange, reopenConflict, deleteDives, tripChange } from '../lib/logbook.svelte.js';
  import { conflictDiveCount } from '../lib/conflict-choices.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { shownTrip } from '../lib/trip-shown.js';
  import { filter, loadOptions, applyFilter, isEmpty } from '../lib/filter.svelte.js';
  import { layout } from '../lib/layout.svelte.js';
  import { navigation, backToFirstScreen } from '../lib/navigation.svelte.js';
  import { formatDateTime, formatLongDate, formatTimeAgo, localNowIso } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { groupByMonth, stickyMonth } from '../lib/carnet-months.js';
  import { mark } from '../lib/perf.js';
  import { buildSnapshot, saveSnapshot } from '../lib/snapshot.js';
  import { offerUndo } from '../lib/undo.js';
  import { Capacitor } from '@capacitor/core';
  import { OpenDivesCore } from 'opendives-core';

  /** @typedef {import('opendives-core').Dive} Dive */
  /**
   * @typedef {{ type: 'dive', key: string, dive: Dive }
   *   | { type: 'trip', key: string, location: string, dives: Dive[] }} Entry
   */
  /**
   * A row of the virtual list. `kind` groups rows of the same layout, hence of
   * the same probable height.
   * @typedef {{ kind: 'dive'|'inTrip', key: string, index: number, month: string, dive: Dive, tripFirst?: boolean, tripLast?: boolean }
   *   | { kind: 'trip', key: string, index: number, month: string, id: number, location: string, dives: Dive[] }} Row
   */

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** Download from the dive computer: Android only for now (Bluetooth). */
  const downloadRoute = Capacitor.getPlatform() === 'android' ? '/download' : '/add/download';

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
    heldTap = { date: dive.date, number: dive.number, expand: entry.type === 'trip' && !!target.closest('.od-trip-row--expand') };
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
      const href = dive.trip ? `/trips/${dive.trip.id}` : `/dives/${dive.id}`;
      const link = /** @type {HTMLElement|null} */ (document.querySelector(`a[href="${href}"]`));
      /** @type {HTMLElement|null} */ (tap.expand ? link?.querySelector('.od-trip-row--expand') : link)?.click();
    });
  });

  /**
   * The Logbook is the master route of a master-detail view: framework7-svelte
   * does not render it as the view's first page but loads it through the
   * router, and Framework7 then appends it after the end anchor of the
   * view's page list. Every later page, rendered by Svelte before that anchor,
   * then no longer follows the Logbook: Framework7 moves it to the end too,
   * out of Svelte's reach, and going back leaves it in the view (a frozen
   * page, a second Logbook). Put back before the anchor, the Logbook is
   * followed by the pages Svelte adds, which stay where Svelte put them.
   * @param {any} page Framework7's page
   */
  function keepInSvelteRange(page) {
    /** @type {HTMLElement} */
    const el = page.el;
    let anchor = el.previousSibling;
    while (anchor && anchor.nodeType === Node.TEXT_NODE) anchor = anchor.previousSibling;
    if (anchor && anchor.nodeType === Node.COMMENT_NODE && el.nextSibling === null) el.parentNode?.insertBefore(el, anchor);
  }

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

  /** The dives of a trip. @param {number} tripId */
  const diveIdsOfTrip = (tripId) => logbook.dives.filter((d) => d.trip?.id === tripId).map((d) => d.id);

  /** The trips all of whose dives are checked: selecting a trip checks its dives. */
  const checkedTrips = $derived.by(() => {
    /** @type {Set<number>} */
    const whole = new Set(logbook.dives.flatMap((d) => (d.trip && checked[d.id] ? [d.trip.id] : [])));
    for (const d of logbook.dives) if (d.trip && !checked[d.id]) whole.delete(d.trip.id);
    return [...whole];
  });

  /** A long press on a trip, or a tap on it while selecting. @param {number} tripId */
  function selectTrip(tripId) {
    const ids = diveIdsOfTrip(tripId);
    if (!ids.length) return;
    if (!selecting) startSelection(ids[0]);
    for (const id of ids) checked[id] = true;
  }

  /** @param {number} tripId */
  function toggleTripChecked(tripId) {
    const ids = diveIdsOfTrip(tripId);
    const all = ids.every((id) => checked[id]);
    for (const id of ids) checked[id] = !all;
    if (!Object.values(checked).some(Boolean)) endSelection();
  }

  /** "Supprimer ce voyage": the trip goes, its dives stay in the logbook. One undoable step. */
  function deleteCheckedTrips() {
    const n = checkedTrips.length;
    const diveIds = checkedTrips.flatMap(diveIdsOfTrip);
    confirmAction({
      title: t('logbook.deleteTripTitle', { n }),
      text: t('logbook.deleteTripText', { n }),
      action: t('logbook.deleteTripAction'),
      onConfirm: async () => {
        try {
          await tripChange({ action: 'remove', diveIds });
          endSelection();
          offerUndo(t('logbook.tripDeleted', { n }));
        } catch (e) {
          changeFailed(e);
        }
      },
    });
  }

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
      text: t(logbook.mode === 'git' ? 'logbook.deleteTextGit' : 'logbook.deleteText', { n }),
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

  /** Checked dives that belong to a trip: "Remove from the trip". */
  /** Checked dives in a trip the logbook shows (lib/trip-shown.js): a trip of one dive is no trip. */
  const checkedInTrip = $derived(logbook.dives.filter((d) => checked[d.id] && shownTrip(d, logbook.dives)).map((d) => d.id));

  async function removeFromTrip() {
    const n = checkedInTrip.length;
    try {
      await tripChange({ action: 'remove', diveIds: checkedInTrip });
      endSelection();
      offerUndo(t('logbook.removedFromTrip', { n }));
    } catch (e) {
      changeFailed(e);
    }
  }

  /** "Renumber the dives" of the menu: Subsurface's Renumber dialog, all the dives. */
  let renumbering = $state(false);

  /**
   * Undo or Redo from the menu, one step each time: the history of this
   * session's changes, as Subsurface's Edit menu.
   * @param {boolean} redo
   */
  async function undoRedo(redo) {
    try {
      await undoLastChange(redo);
      showSnackbar(t(redo ? 'edit.redone' : 'edit.undone'));
    } catch (e) {
      changeFailed(e);
    }
  }

  /** The status row of a conflict left for later. */
  const conflictWaits = $derived(!!logbook.conflict && logbook.conflictLater);
  const offlineWaits = $derived(logbook.sync === 'offline' && logbook.pending > 0);
  /** Not simply up to date: the state goes in a pill of the header band. */
  const showPill = $derived(!logbook.loading && !logbook.error && (conflictWaits || !!logbook.syncFailure || offlineWaits));

  const stoppedText = $derived.by(() => {
    const dives = conflictDiveCount(logbook.conflict);
    return dives ? t('conflict.stoppedDives', { n: dives }) : t('conflict.stopped');
  });

  /** "Exporter au format…" open (selection mode). */
  let exporting = $state(false);

  /**
   * The checked dives exported, then the system's share sheet; the selection is kept.
   * @param {'ssrf'|'uddf'|'csv'|'csvProfiles'|'pdf'} format @param {boolean} anonymize
   */
  async function exportChecked(format, anonymize) {
    try {
      await exportDives(checkedIds, format, anonymize, logbook.prefs);
    } catch (e) {
      // Closing the system's share sheet without choosing is not an error.
      if (/cancel/i.test(String(/** @type {any} */ (e)?.message ?? ''))) return;
      console.error('Export dives', e);
      showSnackbar(t('export.failed'));
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
    checkedInTrip.length;
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
    /** After a long press on a dive: the dives a move of the finger would drag. */
    /** @type {number[]|null} */
    let dragIds = null;
    /** @type {HTMLElement|null} */
    let dragRow = null;

    /** @param {Event} e */
    const diveOf = (e) => /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a.od-dive-row--link'));

    /** The trip a long press is on: let go, it is selected. */
    let pressedTrip = 0;

    /** @param {PointerEvent} e */
    function down(e) {
      pressed = false;
      dragIds = null;
      pressedTrip = 0;
      const target = /** @type {HTMLElement} */ (e.target);
      const tripRow = /** @type {HTMLElement|null} */ (target.closest('li.od-trip-row'));
      if (tripRow && !target.closest('.od-trip-row--expand')) {
        startX = e.clientX;
        startY = e.clientY;
        timer = setTimeout(() => {
          pressed = true;
          pressedTrip = Number(tripRow.dataset.trip) || 0;
        }, LONG_PRESS_MS);
        return;
      }
      const row = diveOf(e);
      if (!row) return;
      startX = e.clientX;
      startY = e.clientY;
      const id = Number(row.dataset.dive);
      timer = setTimeout(() => {
        // A long press lifts the row; what follows decides, as on Android's
        // home screen: the finger lifted without moving selects the dive
        // (selection mode, or one more check in it); the finger moving drags
        // it to a trip or out of its own, and nothing is checked. A checked
        // dive takes the other checked dives with it, as in Gmail.
        pressed = true;
        dragIds = checked[id] ? Object.keys(checked).filter((k) => checked[Number(k)]).map(Number) : [id];
        dragRow = row.closest('li');
        dragRow?.classList.add('od-logbook--drag-lift');
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
      // While another screen slides in over the Logbook, its rows are still
      // visible: a tap then would open a dive from that screen, which
      // Framework7's master-detail routing turns into a second Logbook.
      // Beside a detail (tablet), the list stays in use while it is not "current".
      const listPage = el.closest('.page');
      if (!listPage?.classList.contains('page-current') && !listPage?.parentElement?.querySelector(':scope > .page-current.page-master-detail')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (pressed) {
        pressed = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // A trip's arrow expands it in place (accordion), without opening it:
      // its button sits in the row's link, which Framework7 would follow.
      const arrow = /** @type {HTMLElement} */ (e.target).closest('.od-trip-row .od-trip-row--expand');
      if (arrow) {
        e.preventDefault();
        e.stopPropagation();
        toggleTrip(Number(/** @type {HTMLElement|null} */ (arrow.closest('li'))?.dataset.trip));
        return;
      }
      if (!selecting) return;
      // In selection mode a dive or a trip is checked, not opened.
      const trip = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('li.od-trip-row'));
      if (trip) {
        toggleTripChecked(Number(trip.dataset.trip));
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const row = diveOf(e);
      if (!row) return;
      toggleChecked(Number(row.dataset.dive));
      e.preventDefault();
      e.stopPropagation();
    }
    /** @param {Event} e The WebView's own long-press menu is not wanted. */
    const menu = (e) => diveOf(e) && e.preventDefault();

    // --- Dragging dives after a long press: dropped on a trip (its row or one
    // of its dives), they join it; dropped on a dive in no trip, they leave
    // theirs. A floating copy of the row follows the finger with what the
    // drop would do; the list scrolls near its top and bottom.
    let dragging = false;
    let touchX = 0;
    let touchY = 0;
    /** @type {HTMLElement|null} */
    let ghost = null;
    /** @type {HTMLElement|null} */
    let label = null;
    /** @type {{ action: 'add', tripId: number } | { action: 'remove' } | null} */
    let target = null;
    let scrolling = 0;

    /** @param {number} id */
    const diveById = (id) => logbook.dives.find((d) => d.id === id);

    /**
     * As Gmail's drag: a small raised chip follows the finger, above it so the
     * row under it stays visible; it names the dive's site (or says how many
     * dives when the checked ones move together), then what the drop would do.
     */
    function beginDrag() {
      if (!dragRow) return;
      dragging = true;
      ghost = document.createElement('div');
      ghost.className = 'od-logbook--drag-chip';
      ghost.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5"/></svg>';
      label = document.createElement('span');
      ghost.append(label);
      document.body.append(ghost);
      dragRow.classList.add('od-logbook--drag-source');
      updateTarget();
      placeGhost();
      autoScroll();
    }

    function placeGhost() {
      if (!ghost) return;
      const width = ghost.offsetWidth;
      const left = Math.min(Math.max(8, touchX - width / 2), innerWidth - width - 8);
      ghost.style.left = `${left}px`;
      ghost.style.top = `${touchY - 72}px`;
    }

    /**
     * A horizontal bar on the edge of the row under the finger, the nearest
     * one, while a drop there would do something.
     * @param {HTMLElement|null} row
     */
    function placeDropLine(row) {
      let line = /** @type {HTMLElement|null} */ (document.querySelector('.od-logbook--drop-line'));
      if (!row) {
        line?.remove();
        return;
      }
      if (!line) {
        line = document.createElement('div');
        line.className = 'od-logbook--drop-line';
        document.body.append(line);
      }
      const rect = (row.querySelector('.item-content') ?? row).getBoundingClientRect();
      line.style.left = `${rect.left + 8}px`;
      line.style.width = `${rect.width - 16}px`;
      line.style.top = `${touchY < rect.top + rect.height / 2 ? rect.top : rect.bottom}px`;
    }

    function updateTarget() {
      el?.querySelectorAll('.od-logbook--drop-target').forEach((n) => n.classList.remove('od-logbook--drop-target'));
      target = null;
      const under = document.elementFromPoint(touchX, touchY);
      const li = /** @type {HTMLElement|null} */ (under?.closest('li'));
      const dragged = (dragIds ?? []).map(diveById).filter((d) => d !== undefined);
      if (li && el?.contains(li) && dragged.length) {
        const tripId = Number(li.dataset.trip) || 0;
        if (tripId && dragged.some((d) => d.trip?.id !== tripId)) {
          target = { action: 'add', tripId };
          el.querySelectorAll(`li[data-trip="${tripId}"]`).forEach((n) => n.classList.add('od-logbook--drop-target'));
        } else if (!tripId && dragged.some((d) => d.trip)) {
          target = { action: 'remove' };
        }
      }
      placeDropLine(target ? li : null);
      if (!label) return;
      if (!target) {
        label.textContent = dragged.length > 1 ? t('logbook.dragCount', { n: dragged.length }) : dragged[0]?.site || t('dive.siteNotSet');
      } else if (target.action === 'add') {
        const id = target.tripId;
        const inTrip = logbook.dives.filter((d) => d.trip?.id === id).sort((a, b) => a.date.localeCompare(b.date));
        const name = inTrip[0]?.trip?.location || (inTrip[0] ? t('trip.startingOn', { date: formatLongDate(inTrip[0].date) }) : '');
        label.textContent = t('logbook.dragAdd', { trip: name });
      } else {
        label.textContent = t('logbook.dragRemove');
      }
      ghost?.classList.toggle('od-logbook--drag-chip-target', !!target);
      placeGhost();
    }

    /** Near the top or the bottom of the screen, the list scrolls under the finger. */
    function autoScroll() {
      const content = /** @type {HTMLElement|null} */ (el?.closest('.page-content'));
      const step = () => {
        if (!dragging || !content) return;
        const rect = content.getBoundingClientRect();
        const edge = 80;
        let speed = 0;
        if (touchY < rect.top + edge + 120) speed = -Math.ceil((rect.top + edge + 120 - touchY) / 6);
        else if (touchY > rect.bottom - edge) speed = Math.ceil((touchY - (rect.bottom - edge)) / 6);
        if (speed) {
          content.scrollTop += speed;
          updateTarget();
        }
        scrolling = requestAnimationFrame(step);
      };
      scrolling = requestAnimationFrame(step);
    }

    function endDrag() {
      dragging = false;
      cancelAnimationFrame(scrolling);
      // Every chip, also one left by a drag the list reload cut short.
      document.querySelectorAll('.od-logbook--drag-chip, .od-logbook--drop-line').forEach((n) => n.remove());
      ghost = null;
      label = null;
      dragRow?.classList.remove('od-logbook--drag-source', 'od-logbook--drag-lift');
      el?.querySelectorAll('.od-logbook--drop-target').forEach((n) => n.classList.remove('od-logbook--drop-target'));
    }

    async function drop() {
      const ids = dragIds ?? [];
      const what = target;
      endDrag();
      if (!what || !ids.length) return;
      const n = ids.length;
      try {
        if (what.action === 'add') {
          await tripChange({ action: 'add', tripId: what.tripId, diveIds: ids });
          expanded[what.tripId] = true;
          offerUndo(t('logbook.addedToTrip', { n }));
        } else {
          const inTrip = ids.filter((id) => diveById(id)?.trip);
          await tripChange({ action: 'remove', diveIds: inTrip });
          offerUndo(t('logbook.removedFromTrip', { n: inTrip.length }));
        }
      } catch (e) {
        changeFailed(e);
      }
    }

    /** @param {TouchEvent} e */
    function touchMove(e) {
      if (!dragIds) return;
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
      if (!dragging) {
        if (Math.hypot(touchX - startX, touchY - startY) < 8) return;
        beginDrag();
      }
      // The list does not scroll and the sections do not slide under a drag.
      e.preventDefault();
      e.stopPropagation();
      placeGhost();
      updateTarget();
    }

    /** @param {TouchEvent} e */
    function touchEnd(e) {
      if (dragging) {
        e.stopPropagation();
        drop();
      } else {
        if (document.querySelector('.od-logbook--drag-chip')) endDrag();
        // A long press let go without moving: the selection.
        if (dragIds) {
          dragRow?.classList.remove('od-logbook--drag-lift');
          const id = dragIds[0];
          if (!selecting) startSelection(id);
          else checked[id] = true;
        }
        if (pressedTrip) selectTrip(pressedTrip);
      }
      dragIds = null;
      pressedTrip = 0;
    }

    function touchCancel() {
      if (dragging) endDrag();
      dragRow?.classList.remove('od-logbook--drag-lift');
      dragIds = null;
      pressedTrip = 0;
    }

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    window.addEventListener('click', click, true);
    el.addEventListener('contextmenu', menu);
    // On the document: the row the finger started on may leave the list while
    // it scrolls or re-renders, and its touches would no longer reach it.
    document.addEventListener('touchmove', touchMove, { capture: true, passive: false });
    document.addEventListener('touchend', touchEnd, true);
    document.addEventListener('touchcancel', touchCancel, true);
    return () => {
      cancel();
      endDrag();
      document.removeEventListener('touchmove', touchMove, true);
      document.removeEventListener('touchend', touchEnd, true);
      document.removeEventListener('touchcancel', touchCancel, true);
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

  // "Changes not sent": the list follows the pending edits; once everything is
  // sent, the criterion goes and the whole logbook is back.
  $effect(() => {
    const pending = logbook.pendingByDive;
    untrack(() => {
      if (!filter.applied.unsent) return;
      const c = Object.keys(pending).length ? filter.applied : { ...filter.applied, unsent: false };
      applyFilter(c, logbook.prefs);
    });
  });

  /** The dives by month, newest first; a trip is one group under the month of its first dive. */
  const groups = $derived(groupByMonth(sorted));
  /** Dives outside trips and trips, month after month. */
  const entries = $derived(groups.flatMap((g) => g.entries));

  // Tablet: with nothing in the detail pane, the first dive of the list. Not
  // over another screen shown there (a trip, the filter).
  let autoOpening = false;
  $effect(() => {
    if (navigation.dive !== null) {
      autoOpening = false;
      return;
    }
    if (!layout.split || navigation.section !== 'logbook' || logbook.loading || logbook.error || selecting || !listEl) return;
    const first = entries[0];
    const dive = first?.type === 'trip' ? first.dives[0] : first?.dive;
    if (!dive || autoOpening || listEl.closest('.view')?.querySelector('.page-master-detail')) return;
    autoOpening = true;
    f7router.navigate(`/dives/${dive.id}`, { reloadDetail: true });
  });

  // Tablet: a logbook emptied (signed out, data of this device deleted) keeps
  // no dive beside the list; the dive of the account that left must not stay.
  $effect(() => {
    if (!layout.split || logbook.loading || logbook.dives.length || navigation.dive === null) return;
    backToFirstScreen(f7router);
  });

  /**
   * Search, in the core: Subsurface's fulltext index (notes, buddies, dive
   * guide, suit, tags, cylinder and weight types, site name and country, trip
   * name) and the site's region and city. Asked a moment after the last key.
   */
  let searchIds = $state(/** @type {Set<number>|null} */ (null));
  $effect(() => {
    const q = query.trim();
    logbook.dives;
    if (!q) {
      searchIds = null;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        /** @type {number[]} */
        const ids = await OpenDivesCore.filterQuery({ kind: 'search', fulltext: q });
        if (query.trim() === q) searchIds = new Set(ids);
      } catch (e) {
        console.error('Search', e);
      }
    }, 150);
    return () => clearTimeout(timer);
  });

  /** Search: what the core finds, and the site, trip, number or date as shown; flat result. */
  const results = $derived.by(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return null;
    return sorted.filter(
      (d) =>
        searchIds?.has(d.id) ||
        d.site.toLocaleLowerCase().includes(q) ||
        (d.trip?.location ?? '').toLocaleLowerCase().includes(q) ||
        String(d.number) === q ||
        formatDateTime(d.date).toLocaleLowerCase().includes(q),
    );
  });
  /** The months of the list on screen; the search results are flat, without trip rows. */
  const monthGroups = $derived(results ? groupByMonth(results, true) : groups);

  /** Rows shown: the search results, or the dives and trips with the expanded trips' dives. */
  const rows = $derived.by(() => {
    /** @type {Row[]} */
    const list = [];
    for (const group of monthGroups) {
      const month = group.key;
      for (const entry of group.entries) {
        if (entry.type === 'dive') {
          list.push({ kind: 'dive', key: entry.key, index: list.length, month, dive: entry.dive });
          continue;
        }
        const id = entry.dives[0].trip?.id ?? 0;
        list.push({ kind: 'trip', key: entry.key, index: list.length, month, id, location: entry.location, dives: entry.dives });
        if (expanded[id]) {
          entry.dives.forEach((dive, i) =>
            list.push({ kind: 'inTrip', key: `d${dive.id}`, index: list.length, month, dive, tripFirst: i === 0, tripLast: i === entry.dives.length - 1 }),
          );
        }
      }
    }
    return list;
  });

  /** "9 plongées · 4 sites · dernière plongée il y a 9 mois" (the band). */
  const bandSummary = $derived.by(() => {
    if (!logbook.dives.length) return '';
    const sites = new Set(logbook.dives.map((d) => d.site).filter(Boolean)).size;
    // A dive dated in the future (a dive computer's clock) is not the last one done.
    const now = localNowIso();
    const latest = logbook.dives.reduce((a, d) => (d.date <= now && d.date > a ? d.date : a), '');
    return [t('band.dives', { n: logbook.dives.length }), t('band.sites', { n: sites }), latest ? t('band.lastDive', { ago: formatTimeAgo(latest) }) : '']
      .filter(Boolean)
      .join(' · ');
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
    scheduleSticky();
  }

  // --- The month at the top of the list, shown under the top bar only: the
  // list has no month rows. The header is a single element outside the
  // scrolling area (<BandBackdrop>). On each frame of a scroll, the rows in the
  // document (about twenty) are read to find the month at the top: no reflow
  // of the list, the cost does not grow with the size of the logbook.

  /** Height of the collapsed band (px), as in <BandBackdrop>. */
  const STICKY_HEIGHT = 64;
  /** The month shown under the top bar, null while the band is fully visible. */
  let sticky = $state(/** @type {string|null} */ (null));
  let stickyFrame = 0;
  const stickyGroup = $derived(sticky ? monthGroups.find((g) => g.key === sticky) : undefined);

  function scheduleSticky() {
    if (!stickyFrame) stickyFrame = requestAnimationFrame(updateSticky);
  }

  function updateSticky() {
    stickyFrame = 0;
    if (theme.ios || !vl || !listEl) return;
    const bar = listEl.closest('.page')?.querySelector('.navbar');
    if (!bar) return;
    const edge = bar.getBoundingClientRect().bottom;
    /** @type {{ month: string, top: number, bottom: number }[]} */
    const seen = [];
    for (const li of listEl.querySelectorAll('ul > li[data-virtual-list-index]')) {
      const row = /** @type {Row|undefined} */ (vl.items[Number(li.getAttribute('data-virtual-list-index'))]);
      if (!row) continue;
      const rect = li.getBoundingClientRect();
      seen.push({ month: row.month, top: rect.top, bottom: rect.bottom });
    }
    // Rows not drawn yet after a fast scroll: the header stays as it was.
    if (!seen.some((r) => r.bottom > edge)) return;
    const month = stickyMonth(seen, edge, STICKY_HEIGHT);
    if (month !== sticky) sticky = month;
  }

  $effect(() => {
    const content = listEl?.closest('.page-content');
    if (!content) return;
    content.addEventListener('scroll', scheduleSticky, { passive: true });
    scheduleSticky();
    return () => {
      content.removeEventListener('scroll', scheduleSticky);
      cancelAnimationFrame(stickyFrame);
      stickyFrame = 0;
    };
  });

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
   * The choices of the "+" button (spec, section 3). The Android menu unfolds upwards, so the
   * first of the list is the lowest: "Scanner un code QR" is last, at the top.
   * @type {{ key: string, icon: 'download'|'file'|'edit'|'qr', text: string }[]}
   */
  const addChoices = [
    { key: 'download', icon: 'download', text: t('logbook.addDownload') },
    { key: 'import', icon: 'file', text: t('logbook.addImport') },
    { key: 'manual', icon: 'edit', text: t('logbook.addManual') },
    { key: 'scan', icon: 'qr', text: t('logbook.addScan') },
  ];

  /**
   * The empty logbook (spec, section 6, "Empty"): pair a dive computer,
   * import a file, download from divelogs.de, log by hand.
   * @type {{ key: string, icon: 'download'|'file'|'edit'|'qr', text: string }[]}
   */
  const emptyChoices = [
    { key: 'download', icon: 'download', text: t('logbook.emptyPair') },
    { key: 'import', icon: 'file', text: t('logbook.addImport') },
    { key: 'divelogs', icon: 'download', text: t('logbook.emptyDivelogs') },
    { key: 'manual', icon: 'edit', text: t('logbook.addManual') },
    { key: 'scan', icon: 'qr', text: t('logbook.addScan') },
  ];

  /**
   * Where each choice leads. The download from the dive computer is built
   * for Android only: elsewhere it still says it is not available.
   */
  const routes = /** @type {Record<string, string>} */ ({
    download: downloadRoute,
    manual: '/dives/new',
    divelogs: '/welcome/import',
  });

  /** @param {string} key download, import, manual, divelogs */
  function choose(key) {
    if (key === 'import') fileInput?.click();
    else if (key === 'scan') scanQr();
    else f7router.navigate(routes[key]);
  }

  // Import a file: the WebView's own file picker, no native code; the core
  // reads the file and merges it into the logbook as one undoable step.
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();
  let importing = $state(false);

  /** @param {string} text */
  function toast(text) {
    showSnackbar(text);
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
      f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
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
            // "Scanner un code QR" first on iOS, where the list reads from the top.
            ...[...addChoices].sort((a, b) => Number(b.key === 'scan') - Number(a.key === 'scan')).map((c) => ({ text: c.text, onClick: () => choose(c.key) })),
          ],
          [{ text: t('logbook.cancel'), bold: true }],
        ],
      })
      .open();
  }
</script>

<Page class="od-logbook" onPageInit={keepInSvelteRange}>
  <Navbar large={theme.ios} class="od-band-bar od-band-tall{theme.ios ? '' : ' od-band-titled'} {showPill ? 'od-band-pill' : ''}" title={t('logbook.title')}>
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
  </Navbar>

  {#if !theme.ios}<BandBackdrop pill={showPill} group={stickyGroup} />{/if}
  <SectionBand tall pill={showPill} bare={!theme.ios} title={t('logbook.title')} summary={bandSummary}>
    {#if showPill}
      {#if conflictWaits}
        <SyncPill icon="sync" text={stoppedText} onclick={reopenConflict} />
      {:else if logbook.syncFailure}
        <SyncFailureRow pill />
      {:else}
        <SyncPill icon="offline" text={t('sync.offlinePending', { n: logbook.pending })} />
      {/if}
    {/if}
    {#if logbook.dives.length || logbook.loading}
      <Searchbar
        inline
        customSearch
        class="od-band-search"
        placeholder={t('logbook.search')}
        onSearchbarSearch={(/** @type {any} */ _sb, /** @type {string} */ q) => (query = q)}
        onSearchbarClear={() => (query = '')}
      />
    {/if}
  </SectionBand>

  <!-- A wait before flying is running (task 2026-11-13-98): under the search field. -->
  <FlightBanner />

  <!-- While loading, the count and the status are not known yet: nothing is shown. -->
  {#if !logbook.loading && !logbook.error}
    {#if filtered}
      <ActiveFilter prefs={logbook.prefs} dives={logbook.dives} shown={results ? results.length : sorted.length} />
    {:else if sorted.length && (results || selecting)}
      <p class="od-logbook--count od-value" role="status">{count}{#if selecting}<span class="od-logbook--separator" aria-hidden="true">·</span><span class="od-logbook--count-selected">{t('logbook.selected', { n: checkedCount })}</span>{/if}</p>
    {/if}
    {#if filter.failed}<p class="od-logbook--count od-logbook--failed" role="status">{t('logbook.filterFailed')}</p>{/if}
    <!--
      Only offline or in manual synchronisation, when the logbook may be out of
      date, and while a "Sync" runs: the line stays, only its text and
      bar change (to-do #2). The side menu shows every state.
    -->
    {#if !showPill && (logbook.sync === 'offline' || logbook.sync === 'manual' || (logbook.sync === 'syncing' && !logbook.autoSync && !!logbook.email))}
      <SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} />
    {/if}
  {/if}

  {#if logbook.loading && logbook.preview}
    <!--
      Start: the top of the list as it was at the last load, drawn while the
      core reads the log. A tap is held and replayed on the real row when
      the list replaces them (their identifiers are of the previous load).
    -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="od-logbook--preview" aria-busy="true" aria-label={t('logbook.loading')} role="status" onclickcapture={holdTap}>
      <div aria-hidden="true">
        <p class="od-logbook--count od-value">{t('logbook.count', { n: logbook.preview.total })}</p>
        <div class="list media-list {theme.ios ? 'chevron-center od-logbook--dividers' : ''} od-dive-list">
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
    <div class="od-logbook--loading skeleton-effect-wave" aria-busy="true" aria-label={t('logbook.loading')} role="status">
      <div aria-hidden="true">
        <p class="od-logbook--count"><span class="skeleton-block od-logbook--bar" style:width="7.5em"></span></p>
        <List mediaList dividers={theme.ios} class="{theme.ios ? 'chevron-center' : ''} od-dive-list">
          {#each Array(14) as _, i (i)}
            <li>
              <!-- item-link: the same chevron space as the real rows. -->
              <div class="item-content item-link">
                <div class="item-media"><div class="skeleton-block od-logbook--skeleton-thumbnail"></div></div>
                <div class="item-inner od-row">
                  <div class="od-row-text">
                    <div class="item-title"><span class="skeleton-block od-logbook--bar" style:width="{40 + ((i * 17) % 35)}%"></span></div>
                    <div class="item-text"><span class="skeleton-block od-logbook--bar" style:width="9em"></span></div>
                  </div>
                  <div class="od-logbook--skeleton-values">
                    <span class="od-logbook--value"><span class="skeleton-block od-logbook--bar" style:width="3em"></span></span>
                    <span class="od-logbook--duration"><span class="skeleton-block od-logbook--bar" style:width="2.5em"></span></span>
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
    {#if logbook.email}<p class="od-logbook--count">{t(logbook.mode === 'git' ? 'logbook.emptyGit' : 'logbook.emptyCloud')}</p>{/if}
    <div class="od-logbook--empty">
      <h2 class="od-state-title">{t('logbook.emptyTitle')}</h2>
      <p class="od-logbook--empty-text">{t('logbook.emptyText')}</p>
    </div>
    {#if theme.ios}
      <List inset strong dividers class="od-logbook--empty-choices">
        {#each emptyChoices as c, i (c.key)}
          <ListItem link="#" title={c.text} class={i === 0 ? 'od-logbook--first' : ''} noChevron onClick={() => choose(c.key)}>
            {#snippet media()}<Icon name={c.icon} size={22} />{/snippet}
          </ListItem>
        {/each}
      </List>
    {:else}
      <div class="od-logbook--empty-buttons">
        <a href={downloadRoute} class="od-logbook--filled">
          <Icon name="download" size={18} weight={2} />{t('logbook.emptyPair')}
        </a>
        <button type="button" class="od-outlined-button" onclick={() => choose('import')}>{t('logbook.addImport')}</button>
        <a href="/welcome/import" class="od-outlined-button">{t('logbook.emptyDivelogs')}</a>
        <a href="/dives/new" class="od-text-button">{t('logbook.addManual')}</a>
        <button type="button" class="od-text-button" onclick={() => choose('scan')}>{t('logbook.addScan')}</button>
      </div>
    {/if}
    <p class="od-logbook--empty-note">{t('logbook.emptyNote')}</p>
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
      <!-- Undo and Redo always come first. -->
      {#if logbook.undoText}
        <MenuItem icon="undo" text={t('logbook.menuUndo')} onclick={() => undoRedo(false)} />
      {/if}
      {#if logbook.redoText}
        <MenuItem icon="redo" text={t('logbook.menuRedo')} onclick={() => undoRedo(true)} />
      {/if}
      <MenuItem icon="filter" text={t(filtered ? 'logbook.menuFilterOn' : 'logbook.menuFilter')} link="/filter" />
      {#if !selecting}
        <MenuItem icon="renumber" text={t('logbook.menuRenumber')} onclick={() => (renumbering = true)} />
        <MenuItem icon="computer" text={t('settings.logbookComputers.title')} link="/settings/computers/" />
      {:else}
        <MenuItem icon="renumber" text={t('logbook.menuRenumberChecked', { n: checkedCount })} onclick={() => (renumbering = true)} />
      {/if}
      {#if selecting}
        {#if theme.ios}<MenuItem icon="plus" text={t('logbook.menuCreateTrip')} onclick={createTrip} />{/if}
        {#if checkedTrips.length}
          <MenuItem icon="ungroup" text={t('logbook.menuDeleteTrip', { n: checkedTrips.length })} destructive onclick={deleteCheckedTrips} />
        {/if}
        {#if checkedInTrip.some((id) => !checkedTrips.includes(logbook.dives.find((d) => d.id === id)?.trip?.id ?? 0))}
          <MenuItem icon="remove" text={t('logbook.menuRemoveFromTrip', { n: checkedInTrip.length })} onclick={removeFromTrip} />
        {/if}
        {#if neighbourTrips.above}
          {@const id = neighbourTrips.above}
          <MenuItem icon="arrowUp" text={t('logbook.menuAddAbove', { n: checkedCount })} onclick={() => addToTrip(id)} />
        {/if}
        {#if neighbourTrips.below}
          {@const id = neighbourTrips.below}
          <MenuItem icon="arrowDown" text={t('logbook.menuAddBelow', { n: checkedCount })} onclick={() => addToTrip(id)} />
        {/if}
        {#if theme.ios}
          <MenuItem
            icon="download"
            text={t('logbook.menuExport')}
            onclick={() => {
              f7.popover.close('.od-logbook-menu');
              exporting = true;
            }}
          />
          <li class="od-menu-divider" role="separator"></li>
          <MenuItem icon="delete" text={t('logbook.menuDelete')} destructive onclick={deleteChecked} />
        {/if}
      {/if}
    </List>
  </Popover>

  {#if exporting}
    <ExportSheet count={checkedCount} onexport={exportChecked} onclose={() => (exporting = false)} />
  {/if}

  {#if !logbook.loading && !logbook.error && rows.length}
    <div class="list media-list {theme.ios ? 'chevron-center od-logbook--dividers' : ''} od-logbook--virtual-list od-dive-list" bind:this={listEl}>
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
              {selecting}
              checked={checkedTrips.includes(row.id)}
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
              tripFirst={row.kind === 'inTrip' && row.tripFirst}
              tripLast={row.kind === 'inTrip' && row.tripLast}
            />
          {/if}
        {/each}
      </ul>
    </div>
  {/if}

  {#if renumbering}
    <RenumberDialog
      ids={selecting ? checkedIds : undefined}
      oncancel={() => (renumbering = false)}
      ondone={() => {
        renumbering = false;
        endSelection();
      }}
    />
  {/if}

  <!-- The file picker of "Import a file" (hidden; any file: the core tells what it can read). -->
  <input type="file" class="od-sr-only" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
  {#if importing}<p class="od-sr-only" role="status">{t('logbook.importing')}</p>{/if}

  {#snippet fixedContent()}
    {#if selecting}
      <!-- Selection mode: the top bar gives way to the number of dives checked. -->
      <div class="od-logbook--selection-bar" bind:this={selectionBar}>
        <button type="button" class="od-icon-button" onclick={endSelection}>
          <Icon name="close" /><span class="od-sr-only">{t('logbook.selectionClose')}</span>
        </button>
        <span class="od-logbook--selection-count od-value" role="status">{t('logbook.selected', { n: checkedCount })}</span>
        {#if theme.ios}
          <a href="#" class="link icon-only od-logbook--popover-open od-logbook--selection-more" data-popover=".od-logbook-menu" role="button">
            <Icon name="moreCircle" />
            <span class="od-sr-only">{t('detail.moreOptions')}</span>
          </a>
        {/if}
      </div>
      <!-- Android: the actions of the selection in a floating toolbar (Material 3 Expressive). -->
      {#if !theme.ios}
        <FloatingToolbar
          label={t('logbook.selectionActions')}
          actions={[
            { key: 'trip', icon: 'plus', label: t('logbook.menuCreateTrip'), text: t('logbook.menuCreateTrip'), onclick: createTrip },
            { key: 'export', icon: 'download', label: t('logbook.toolbarExport'), onclick: () => (exporting = true) },
            { key: 'delete', icon: 'delete', label: t('logbook.menuDelete'), onclick: deleteChecked },
            { key: 'more', icon: 'more', label: t('logbook.selectionMore'), menu: '.od-logbook-menu' },
          ]}
        />
      {/if}
    {/if}
    {#if !theme.ios && logbook.dives.length && !selecting}
      <!-- Hidden while the download pane shows: it is the task the + opened, and it covered "Retry". -->
      {#if !navigation.downloadPanes}
        <FabMenu choices={addChoices} onchoose={choose} />
      {/if}
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
    .od-logbook--count {
      margin: 8px 16px 0;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .od-logbook--count .od-logbook--separator {
      margin: 0 0.4em;
    }

    /* Selection mode: the number of dives checked, beside the total. */
    .od-logbook--count-selected {
      color: var(--od-text);
      font-weight: 500;
    }

    .od-logbook--failed {
      color: var(--od-alarm);
    }

    /* The snapshot of the start: a tap is held until the real list is there. */
    .od-logbook--preview {
      user-select: none;
    }

    /* Selection mode: over the top bar, the same height. */
    .od-logbook--selection-bar {
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

    .od-logbook--selection-count {
      font-size: 22px;
      line-height: 28px;
      color: var(--od-text);
    }

    .od-logbook--selection-more {
      margin-left: auto;
    }

    /* Dragging dives to a trip or out of it: the row lifted under the finger,
       its place faded, the trip it would join tinted. */
    :global(.od-logbook--drag-chip) {
      position: fixed;
      z-index: 9000;
      max-width: calc(100vw - 16px);
      height: 40px;
      padding: 0 16px 0 12px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 20px;
      background: var(--od-surface);
      color: var(--od-text);
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 4px 8px 3px rgb(0 0 0 / 0.15), 0 1px 3px rgb(0 0 0 / 0.3);

      span {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    /* Over a place where the dives can go: the chip in ink. */
    /* Where the drop would go: a 3 dp bar with a dot at its start. */
    :global(.od-logbook--drop-line) {
      position: fixed;
      z-index: 9999;
      height: 3px;
      margin-top: -1.5px;
      border-radius: 2px;
      background: var(--od-text);
      pointer-events: none;
    }

    :global(.od-logbook--drop-line::before) {
      content: '';
      position: absolute;
      left: -5px;
      top: -3.5px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--od-text);
    }

    :global(.od-logbook--drag-chip.od-logbook--drag-chip-target) {
      background: var(--od-text);
      color: var(--od-surface);
    }

    /* Held by a long press: the row rises a little, ready to be dragged. */
    :global(li.od-logbook--drag-lift) {
      position: relative;
      z-index: 2;
      background: var(--od-surface);
      box-shadow: 0 2px 6px 2px rgb(0 0 0 / 0.15), 0 1px 2px rgb(0 0 0 / 0.3);
      transition: box-shadow 150ms;
    }

    :global(.od-logbook--drag-source) {
      opacity: 0.35;
    }

    :global(li.od-logbook--drop-target) {
      background: var(--od-tint);
    }

    /* The dives follow the count and the sync status closely. */
    :global(.list.od-dive-list) {
      margin-top: 0;
    }

    /* The filter button says when a filter is applied: a tinted circle. */
    :global(.navbar .od-logbook--filter-on) {
      background: var(--od-tint);
      border-radius: 50%;
    }

    .od-logbook--empty {
      margin: 48px 24px 0;

      :global(.ios) & {
        margin-inline: 32px;
      }
    }

    .od-logbook--empty-text {
      margin: 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .od-logbook--empty-buttons {
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
    .od-logbook--filled {
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

    :global(.od-logbook--empty-choices .od-logbook--first .item-title) {
      font-weight: 600;
    }

    .od-logbook--empty-note {
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

    .od-logbook--skeleton-thumbnail {
      width: 56px;
      height: 40px;
      border-radius: 8px;
    }

    /* Depth and duration on the right, as in <DiveRow>. */
    .od-logbook--skeleton-values {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex: 0 0 auto;

      .od-logbook--value {
        line-height: 22px;
      }

      .od-logbook--duration {
        line-height: 18px;
      }
    }

    /* A greyed bar one line of text high. */
    .od-logbook--bar {
      display: inline-block;
      height: 0.8em;
      max-width: 100%;
      border-radius: 4px;
      vertical-align: middle;
    }

  }
</style>
