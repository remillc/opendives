<script>
  // @ts-check
  // Trip screen (docs/mockups/voyage-android.dc.html; spec, section 4, "Trip"):
  // dates, place, number of dives and whether the core grouped them; place and
  // notes editable; a menu per dive (remove it from the trip, split the trip
  // there) and a top menu (merge with another trip, add dives, ungroup). Each
  // change is one undoable step, as Subsurface's trip commands. The trip id is
  // that of the current load: never stored.
  import { onMount, tick } from 'svelte';
  import { Page, Navbar, Link, List, Popover, f7 } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import MenuItem from '../components/MenuItem.svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import { logbook, tripChange, undoLastChange } from '../lib/logbook.svelte.js';
  import { formatDateRange, formatDateTime, formatDuration, formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';

  /** @type {{ f7route: { params: { id: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  /** @type {import('opendives-core').TripDetail|null} */
  let trip = $state(null);
  let tripId = $state(Number(f7route.params.id));

  onMount(async () => {
    trip = await OpenDivesCore.getTrip({ tripId });
  });

  // After an undo of a trip change, show the trip again.
  $effect(() => {
    const changed = logbook.editedTrip;
    if (changed && changed.tripId === tripId) trip = changed;
  });

  const range = $derived(
    trip && trip.dives.length ? formatDateRange(trip.dives[0].date, trip.dives[trip.dives.length - 1].date) : '',
  );

  /** @param {string} text */
  function toast(text) {
    showSnackbar(text);
  }

  /**
   * Runs one trip change, then offers Undo for a few seconds.
   * @param {Parameters<typeof tripChange>[0]} options
   */
  async function change(options) {
    try {
      const result = await tripChange(options);
      const next = result.trip;
      if (!next || next.tripId === 0) {
        f7router.back(); // the trip no longer exists (ungrouped)
      } else {
        tripId = next.tripId;
        trip = next;
      }
      offerUndo(t('tripScreen.done'), (undone) => {
        if (undone.trip && undone.trip.tripId) {
          tripId = undone.trip.tripId;
          trip = undone.trip;
        }
      });
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Trip change', code);
      toast(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
    }
  }

  /** @param {'location'|'notes'} field */
  function editField(field) {
    if (!trip) return;
    const current = field === 'location' ? trip.location : trip.notes;
    f7.dialog.prompt(
      field === 'location' ? t('tripScreen.placePrompt') : t('tripScreen.notesPrompt'),
      field === 'location' ? t('tripScreen.place') : t('tripScreen.notes'),
      (/** @type {string} */ value) => change({ action: field, tripId, value: value.trim() }),
      undefined,
      current,
    );
  }

  /** The dive whose ⋮ menu is open, and its place in the trip. */
  let menuDive = $state(/** @type {{ id: number, index: number }|null} */ (null));

  /**
   * A dive's ⋮ menu, under its button.
   * @param {MouseEvent} e @param {{id: number}} dive @param {number} index
   */
  async function diveMenu(e, dive, index) {
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    menuDive = { id: dive.id, index };
    await tick();
    f7.popover.open('.od-trip-dive-menu', target);
  }

  /** Trips of the logbook other than this one, the closest in time first. */
  function otherTrips() {
    if (!trip || !trip.dives.length) return [];
    const start = new Date(trip.dives[0].date).getTime();
    /** @type {Map<number, {id: number, location: string, date: string, count: number}>} */
    const trips = new Map();
    for (const d of logbook.dives) {
      if (!d.trip || d.trip.id === tripId) continue;
      const entry = trips.get(d.trip.id) ?? { id: d.trip.id, location: d.trip.location, date: d.date, count: 0 };
      entry.count++;
      if (d.date < entry.date) entry.date = d.date;
      trips.set(d.trip.id, entry);
    }
    return [...trips.values()]
      .sort((a, b) => Math.abs(new Date(a.date).getTime() - start) - Math.abs(new Date(b.date).getTime() - start))
      .slice(0, 8);
  }

  /** Dives in no trip, the closest in time first. */
  function looseDives() {
    if (!trip || !trip.dives.length) return [];
    const start = new Date(trip.dives[0].date).getTime();
    return logbook.dives
      .filter((d) => !d.trip)
      .sort((a, b) => Math.abs(new Date(a.date).getTime() - start) - Math.abs(new Date(b.date).getTime() - start))
      .slice(0, 8);
  }

  function chooseTripToMerge() {
    const trips = otherTrips();
    if (!trips.length) return toast(t('tripScreen.noOtherTrip'));
    f7.actions
      .create({
        buttons: [
          [
            { text: t('tripScreen.mergeWith'), label: true },
            ...trips.map((other) => ({
              text: `${other.location || t('tripScreen.placeToSpecify')} · ${formatLongDate(other.date)}`,
              onClick: () => change({ action: 'merge', tripId, otherId: other.id }),
            })),
          ],
          [{ text: t('logbook.cancel'), bold: true }],
        ],
      })
      .open();
  }

  function chooseDiveToAdd() {
    const dives = looseDives();
    if (!dives.length) return toast(t('tripScreen.noLooseDive'));
    f7.actions
      .create({
        buttons: [
          [
            { text: t('tripScreen.addDive'), label: true },
            ...dives.map((d) => ({
              text: `${formatDateTime(d.date)} · ${d.site || t('dive.siteNotSet')}`,
              onClick: () => change({ action: 'add', tripId, diveIds: [d.id] }),
            })),
          ],
          [{ text: t('logbook.cancel'), bold: true }],
        ],
      })
      .open();
  }

  function confirmUngroup() {
    confirmAction({
      title: t('tripScreen.ungroupTitle'),
      text: t('tripScreen.ungroupText'),
      action: t('tripScreen.ungroupConfirm'),
      onConfirm: () => change({ action: 'ungroup', tripId }),
    });
  }
</script>

<Page>
  <Navbar>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      <Link iconOnly onClick={() => editField('location')}>
        <Icon name="edit" weight={2.2} /><span class="od-sr-only">{t('tripScreen.edit')}</span>
      </Link>
      <Link iconOnly popoverOpen=".od-trip-menu">
        <Icon name="more" weight={4} /><span class="od-sr-only">{t('detail.moreOptions')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if trip && trip.tripId}
    <header class="head">
      <p class="kicker od-value">{t('tripScreen.kicker', { range })}</p>
      <h1 class:not-set={!trip.location}>{trip.location || t('tripScreen.placeToSpecify')}</h1>
      <p class="sub">{t(trip.autogen ? 'tripScreen.divesAuto' : 'tripScreen.dives', { n: trip.dives.length })}</p>
    </header>

    <div class="block-title">{t('tripScreen.trip')}</div>
    <div class="list list-strong inset list-dividers">
      <ul>
        <li>
          <a href="#place" class="item-link item-content external" role="button" onclick={(e) => { e.preventDefault(); editField('location'); }}>
            <div class="item-inner">
              <div class="item-title">
                {t('tripScreen.place')}
                <div class="item-footer">{trip.location || t('tripScreen.addPlace')}</div>
              </div>
            </div>
          </a>
        </li>
        <li>
          <a href="#notes" class="item-link item-content external" role="button" onclick={(e) => { e.preventDefault(); editField('notes'); }}>
            <div class="item-inner">
              <div class="item-title">
                {t('tripScreen.notes')}
                <div class="item-footer notes">{trip.notes || t('tripScreen.addNotes')}</div>
              </div>
            </div>
          </a>
        </li>
      </ul>
    </div>

    <div class="block-title">{t('tripScreen.divesTitle')}</div>
    <div class="list list-strong inset list-dividers">
      <ul>
        {#each trip.dives as dive, i (dive.id)}
          <li class="item-content">
            <div class="item-inner">
              <div class="item-title">
                <span class="od-value">{formatDateTime(dive.date)}</span>
                <div class="item-footer">{formatDuration(dive.durationSeconds)} · {dive.site || t('dive.siteNotSet')}</div>
              </div>
              <div class="item-after">
                <button type="button" class="more" onclick={(e) => diveMenu(e, dive, i)}>
                  <Icon name="more" weight={4} /><span class="od-sr-only">{t('detail.moreOptions')}</span>
                </button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- The ⋮ menus (components/MenuItem.svelte): the trip's, and a dive's. -->
  <Popover class="od-menu od-trip-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon="merge" text={t('tripScreen.merge')} onclick={chooseTripToMerge} />
      <MenuItem icon="plus" text={t('tripScreen.addDives')} onclick={chooseDiveToAdd} />
      <MenuItem icon="ungroup" text={t('tripScreen.ungroup')} destructive onclick={confirmUngroup} />
    </List>
  </Popover>
  <Popover class="od-menu od-trip-dive-menu" backdrop={false}>
    <List noChevron>
      {#if menuDive}
        {@const d = menuDive}
        <MenuItem icon="arrowRight" text={t('tripScreen.openDive')} onclick={() => f7router.navigate(`/trips/${tripId}/dives/${d.id}`)} />
        <MenuItem icon="remove" text={t('tripScreen.removeDive')} onclick={() => change({ action: 'remove', diveId: d.id })} />
        {#if d.index > 0}
          <MenuItem icon="split" text={t('tripScreen.splitHere')} onclick={() => change({ action: 'split', diveId: d.id })} />
        {/if}
      {/if}
    </List>
  </Popover>
</Page>

<style>
  @layer od.components {
    .head {
      padding: 16px 20px 0;

      h1 {
        margin: 4px 0 0;
        font-size: 28px;
        line-height: 34px;
        font-weight: 800;

        &.not-set {
          color: var(--od-text-2);
        }
      }
    }

    .kicker,
    .sub {
      margin: 0;
      font-size: 15px;
      color: var(--od-text-2);
    }

    .sub {
      margin-top: 4px;
    }

    .item-footer {
      white-space: normal;

      &.notes {
        white-space: pre-line;
      }
    }

    .more {
      width: 48px;
      height: 48px;
      margin-right: -12px;
      border: none;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

  }
</style>
