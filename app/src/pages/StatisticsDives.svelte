<script>
  // @ts-check
  // The dives of one row of the Statistics section
  // (docs/mockups/android-stats-plongees.dc.html): the row's title, its section
  // and figures, then its dives, newest first, as flat Logbook rows. The row's
  // criteria arrive in the address (?section=…&title=…&c=…); the core counts
  // them with the free filter in force, so the list matches the row.
  import { onDestroy, tick, untrack } from 'svelte';
  import { Page, Navbar, Link, theme, f7 } from 'framework7-svelte';
  import DiveRow from '../components/DiveRow.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { filter } from '../lib/filter.svelte.js';
  import { computeStatistics, decodeCriteria, summaryLine } from '../lib/statistics.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { query: { section?: string, title?: string, c?: string } } }} */
  let { f7route } = $props();

  // The route of a page does not change.
  const query = untrack(() => f7route.query);
  const title = query.title ?? '';
  const section = t(`stats.${query.section}`);
  const criteria = decodeCriteria(query.c);

  let result = $state(/** @type {import('../lib/statistics.svelte.js').StatsResult|null} */ (null));

  $effect(() => {
    void logbook.dives;
    void filter.ids;
    computeStatistics(criteria).then((r) => (result = r));
  });

  const support = $derived(result ? t('stats.rowDivesSupport', { section, summary: summaryLine(result.total) }) : section);

  /** The dives counted by the core, the newest first. */
  const dives = $derived.by(() => {
    const ids = new Set(result?.diveIds ?? []);
    return logbook.dives.filter((d) => ids.has(d.id)).sort((a, b) => b.date.localeCompare(a.date));
  });

  // A row can hold over a thousand dives: only the rows near the screen are in
  // the document (Framework7's virtual list, as in the Logbook). A row's height
  // depends on the text size and on long site names that wrap, so each rendered
  // row is measured and its height kept by dive.
  /** @type {HTMLElement|undefined} */
  let listEl = $state();
  /** @type {any} */
  let vl = null;
  let visible = $state({ items: /** @type {typeof dives} */ ([]), topPosition: 0, from: 0 });
  /** @type {Map<number, number>} */
  const measured = new Map();
  let typical = 72;

  /** @param {{ id: number }} dive */
  const rowHeight = (dive) => measured.get(dive.id) ?? typical;

  async function measure() {
    await tick();
    if (!vl || !listEl) return;
    let changed = false;
    for (const li of listEl.querySelectorAll('ul > li[data-virtual-list-index]')) {
      const dive = vl.items[Number(li.getAttribute('data-virtual-list-index'))];
      const height = /** @type {HTMLElement} */ (li).offsetHeight;
      if (!dive || !height || rowHeight(dive) === height) continue;
      measured.set(dive.id, height);
      typical = height;
      changed = true;
    }
    if (changed) vl.update();
  }

  function forgetHeights() {
    measured.clear();
    vl?.update();
  }

  $effect(() => {
    const items = dives;
    if (!listEl) return;
    if (!vl) {
      vl = f7.virtualList.create({
        el: listEl,
        items,
        height: rowHeight,
        renderExternal: (/** @type {any} */ _vl, /** @type {{ items: typeof dives, topPosition: number, fromIndex: number }} */ data) => {
          visible = { items: data.items, topPosition: data.topPosition, from: data.fromIndex };
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
</script>

<Page class="od-statistics-dives">
  <Navbar {title} subtitle={support}>
    {#snippet left()}
      <Link back iconOnly={!theme.ios}>
        <i class="icon icon-back"></i>
        {#if theme.ios}<span>{t('common.back')}</span>{:else}<span class="od-sr-only">{t('common.back')}</span>{/if}
      </Link>
    {/snippet}
  </Navbar>

  <div class="list media-list {theme.ios ? 'chevron-center od-statistics-dives--dividers' : ''} od-dive-list od-statistics-dives--list" bind:this={listEl}>
    <ul>
      {#each visible.items as dive, i (dive.id)}
        <DiveRow {dive} prefs={logbook.prefs} index={visible.from + i} top={visible.topPosition} />
      {/each}
    </ul>
  </div>
</Page>

<style>
  /* The top bar on the page background (mock-up). */
  :global(.od-statistics-dives) {
    --f7-navbar-bg-color: var(--od-background);
  }

  @layer od.components {
    .od-statistics-dives--list {
      margin-top: 12px;
    }
  }
</style>
