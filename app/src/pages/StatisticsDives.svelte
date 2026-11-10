<script>
  // @ts-check
  // The dives of one row of the Statistics section
  // (docs/mockups/android-stats-plongees.dc.html): the row's title, its section
  // and figures, then its dives, newest first, as flat Logbook rows. The row's
  // criteria arrive in the address (?section=…&title=…&c=…); the core counts
  // them with the free filter in force, so the list matches the row.
  import { untrack } from 'svelte';
  import { Page, Navbar, Link, theme } from 'framework7-svelte';
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

  // A row can hold over a thousand dives: the page opens at once, the rest follows in steps.
  const STEP = 60;
  let limit = $state(STEP);
  $effect(() => {
    if (limit >= dives.length) return;
    const timer = setTimeout(() => (limit += STEP), 60);
    return () => clearTimeout(timer);
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

  <div class="list media-list {theme.ios ? 'chevron-center od-statistics-dives--dividers' : ''} od-dive-list od-statistics-dives--list">
    <ul>
      {#each dives.slice(0, limit) as dive (dive.id)}
        <DiveRow {dive} prefs={logbook.prefs} />
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
