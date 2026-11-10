<script>
  // @ts-check
  // One row of the free filter: a criterion, or on Android a row of "Matériel"
  // that holds several (cylinder type and size, oxygen and helium). Back
  // returns to the Filter screen.
  import { Page, Navbar, theme } from 'framework7-svelte';
  import FilterCriterionBody from '../components/FilterCriterionBody.svelte';
  import { filter, combinedRows, rowCriteria } from '../lib/filter.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { key: string } } }} */
  let { f7route } = $props();
  const row = f7route.params.key;
  const keys = $derived(rowCriteria(row, filter.options));
  const title = row in combinedRows ? t(`filter.combined.${row}`) : t(`filter.criteria.${row}`);
</script>

<Page class="od-filter-criterion">
  <Navbar {title} backLink={t('filter.title')} backLinkShowText={theme.ios} />

  {#each keys as key (key)}
    {#if keys.length > 1}<h2 class="od-criterion-heading">{t(`filter.criteria.${key}`)}</h2>{/if}
    <FilterCriterionBody criterion={key} />
  {/each}
</Page>

<style>
  @layer od.components {
    .od-criterion-heading {
      margin: 20px 16px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: var(--od-text-2);
    }
  }
</style>
