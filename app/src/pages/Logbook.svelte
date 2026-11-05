<script>
  // @ts-check
  // Logbook screen (spec, sections 3 to 6, "Carnet"): list by trip, search,
  // sync status, "+" button.
  import { Page, Navbar, NavRight, Link, Subnavbar, Searchbar, List, Block, Button, f7, theme } from 'framework7-svelte';
  import SyncStatus from '../components/SyncStatus.svelte';
  import DiveRow from '../components/DiveRow.svelte';
  import TripRow from '../components/TripRow.svelte';
  import Icon from '../components/Icon.svelte';
  import { logbook, loadLogbook } from '../lib/logbook.svelte.js';
  import { formatDateTime } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('opendives-core').Dive} Dive */
  /**
   * @typedef {{ type: 'dive', key: string, dive: Dive }
   *   | { type: 'trip', key: string, location: string, dives: Dive[] }} Entry
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

  function add() {
    // The three choices of the "+" button (spec, section 3). No action yet.
    f7.actions
      .create({
        buttons: [
          [
            { text: t('logbook.add'), label: true },
            { text: t('logbook.addDownload') },
            { text: t('logbook.addImport') },
            { text: t('logbook.addManual') },
          ],
          [{ text: t('logbook.cancel'), bold: true }],
        ],
      })
      .open();
  }
</script>

<Page>
  <Navbar large title={t('logbook.title')}>
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

  <!-- While loading, the status is not known yet: nothing is shown. -->
  {#if !logbook.loading && !logbook.error}<SyncStatus sync={logbook.sync} />{/if}

  {#if logbook.loading}
    <!-- Loading: rows keep their place, no spinner in the middle (spec, section 6). -->
    <List mediaList dividers class="skeleton-text" aria-busy="true" aria-label={t('logbook.loading')}>
      {#each Array(8) as _, i (i)}
        <!-- Greyed rows: the dashes only give the blocks a width. -->
        <li aria-hidden="true">
          <div class="item-content">
            <div class="item-media"><div class="skeleton-block skeleton-thumbnail"></div></div>
            <div class="item-inner">
              <div class="item-title-row"><div class="item-title">––––––––––––––</div><div class="item-after">––––––</div></div>
              <div class="item-text">––––––––––––––––––</div>
            </div>
          </div>
        </li>
      {/each}
    </List>
  {:else if logbook.error}
    <Block>
      <h2 class="state-title">{t('logbook.errorTitle')}</h2>
      <p>{t('logbook.errorNothingChanged')}</p>
      <p>{t('logbook.errorCheck')}</p>
      <ol>
        <li>{t('logbook.errorInternet')}</li>
        <li>{t('logbook.errorStorage')}</li>
      </ol>
      <Button fill class="od-primary-action" onClick={loadLogbook}>{t('logbook.retry')}</Button>
    </Block>
  {:else if logbook.dives.length === 0}
    <Block>
      <h2 class="state-title">{t('logbook.emptyTitle')}</h2>
      <p>{t('logbook.emptyText')}</p>
      <Button tonal onClick={add}>{t('logbook.add')}</Button>
    </Block>
  {:else if results}
    {#if results.length}
      <List mediaList dividers>
        {#each results as dive (dive.id)}
          <DiveRow {dive} prefs={logbook.prefs} />
        {/each}
      </List>
    {:else}
      <Block><p>{t('logbook.noResults', { query })}</p></Block>
    {/if}
  {:else}
    <List mediaList dividers>
      {#each entries as entry (entry.key)}
        {#if entry.type === 'dive'}
          <DiveRow dive={entry.dive} prefs={logbook.prefs} />
        {:else}
          {@const id = entry.dives[0].trip?.id ?? 0}
          <TripRow
            dives={entry.dives}
            location={entry.location}
            prefs={logbook.prefs}
            expanded={!!expanded[id]}
            ontoggle={() => (expanded[id] = !expanded[id])}
          />
          {#if expanded[id]}
            {#each entry.dives as dive (dive.id)}
              <DiveRow {dive} prefs={logbook.prefs} inTrip />
            {/each}
          {/if}
        {/if}
      {/each}
    </List>
  {/if}

  {#snippet fixedContent()}
    {#if !theme.ios}
      <!--
        Written by hand: the Fab component of framework7-svelte 9 calls onclick
        twice and leaves the link without a name for screen readers.
      -->
      <div class="fab fab-right-bottom od-fab-add">
        <a href="#add" class="external" role="button" onclick={(e) => { e.preventDefault(); add(); }}>
          <Icon name="plus" />
          <span class="od-sr-only">{t('logbook.add')}</span>
        </a>
      </div>
    {/if}
  {/snippet}
</Page>

<style>
  @layer od.components {
    .state-title {
      font-size: 22px;
      font-weight: 400;
      margin: 16px 0 8px;
    }

    .skeleton-thumbnail {
      width: 56px;
      height: 40px;
      border-radius: 8px;
    }
  }
</style>
