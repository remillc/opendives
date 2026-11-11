<script>
  // @ts-check
  // <ActiveFilter> (spec, section 4): while a filter is applied, a row at the
  // top of the section recalls it, one chip per criterion with a button that
  // removes it ("Suit: dry suit"), then the number of matching dives. The
  // filter is the same in the Logbook, the Statistics and the map.
  import Icon from './Icon.svelte';
  import { filter, activeKeys, valueText, removeCriterion, clearFilter } from '../lib/filter.svelte.js';
  import { formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   prefs: import('opendives-core').Prefs,
   *   dives: import('opendives-core').Dive[],
   *   shown: number,
   * }}
   * `dives`: the logbook (trip names); `shown`: dives matching.
   */
  let { prefs, dives, shown } = $props();

  const keys = $derived(activeKeys(filter.applied));

  /** @param {string} id */
  function tripName(id) {
    const d = dives.find((x) => String(x.trip?.id) === id);
    return d?.trip ? d.trip.location || t('trip.startingOn', { date: formatLongDate(d.date) }) : id;
  }

  /** @param {any} key */
  function chipText(key) {
    if (key === 'preset') return t('filter.chip', { name: t('filter.savedFilter'), value: filter.applied.preset?.name ?? '' });
    if (key === 'unsent') return t('filter.unsentChip');
    if (key === 'mode') return t('filter.chip', { name: t('filter.mode'), value: t(`filter.modes.${filter.applied.mode}`) });
    return t('filter.chip', { name: t(`filter.criteria.${key}`), value: valueText(key, filter.applied, prefs, tripName) });
  }
</script>

{#if keys.length}
  <div class="od-active-filter" role="group" aria-label={t('filter.activeLabel')}>
    {#each keys as key (key)}
      <span class="chip od-active-filter--chip">
        <span>{chipText(key)}</span>
        <button
          type="button"
          class="od-active-filter--remove"
          aria-label={t('filter.removeCriterion', { name: chipText(key) })}
          onclick={() => removeCriterion(key === 'mode' ? 'mode' : key, prefs)}
        >
          <Icon name="close" size={18} weight={2} />
        </button>
      </span>
    {/each}
    <span class="od-active-filter--count od-value" role="status">{t('filter.matching', { n: shown, total: dives.length })}</span>
    {#if keys.length > 1}
      <button type="button" class="od-text-button od-active-filter--clear" onclick={() => clearFilter(prefs)}>{t('filter.clear')}</button>
    {/if}
  </div>
{/if}

<style>
  @layer od.components {
    .od-active-filter {
      margin: 8px 16px 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    /* MD3 input chip: 32 dp, 8 dp corners, a trailing remove button. */
    .od-active-filter--chip {
      min-height: 32px;
      box-sizing: border-box;
      padding: 0 4px 0 12px;
      border-radius: 8px;
      background: var(--od-tint);
      color: var(--od-on-tint);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;

      :global(.ios) & {
        border-radius: 16px;
        font-size: 15px;
        font-weight: 400;
      }
    }

    /* 24 dp button in the chip; its touch area is widened by padding. */
    .od-active-filter--remove {
      width: 32px;
      height: 32px;
      margin: -4px 0;
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .od-active-filter--count {
      font-size: 14px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
      }
    }

    .od-active-filter--clear {
      margin-inline-start: auto;
    }
  }
</style>
