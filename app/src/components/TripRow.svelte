<script>
  // @ts-check
  // <TripRow> (spec, section 4, "LigneVoyage"): a collapsed trip. Four
  // thumbnails in a 2 × 2 grid, the trip name, then "4 dives, 21.8 to 28.7 m";
  // a tap expands the trip.
  import Icon from './Icon.svelte';
  import ProfileThumbnail from './ProfileThumbnail.svelte';
  import { depthValue, formatDepth, formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   dives: import('opendives-core').Dive[],
   *   location: string,
   *   prefs: import('opendives-core').Prefs,
   *   expanded: boolean,
   *   ontoggle: () => void,
   * }}
   */
  let { dives, location, prefs, expanded, ontoggle } = $props();

  // Dives arrive from the most recent to the oldest.
  const start = $derived(dives[dives.length - 1].date);
  const title = $derived(location || t('trip.startingOn', { date: formatLongDate(start) }));
  const summary = $derived.by(() => {
    const diveCount = t('trip.dives', { n: dives.length });
    // A zero depth means "unknown": it is left out of the range.
    const depths = dives.map((d) => d.maxDepthMm).filter((mm) => mm > 0);
    if (!depths.length) return diveCount;
    const min = Math.min(...depths);
    const max = Math.max(...depths);
    return min === max
      ? t('trip.summarySingle', { dives: diveCount, depth: formatDepth(max, prefs) })
      : t('trip.summaryRange', { dives: diveCount, min: depthValue(min, prefs), max: formatDepth(max, prefs) });
  });
  const preview = $derived(dives.slice(0, 4));

  /** @param {MouseEvent} e */
  function toggle(e) {
    e.preventDefault();
    ontoggle();
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ontoggle();
    }
  }
</script>

<li class="trip-row">
  <div
    class="item-link item-content no-chevron"
    role="button"
    tabindex="0"
    aria-expanded={expanded}
    onclick={toggle}
    onkeydown={onKey}
  >
    <div class="item-media">
      <div class="grid" aria-hidden="true">
        {#each preview as d (d.id)}
          <ProfileThumbnail profile={d.profile} maxDepthMm={d.maxDepthMm} {prefs} small />
        {/each}
      </div>
    </div>
    <div class="item-inner">
      <div class="item-title-row">
        <div class="item-title">{title}</div>
        <div class="item-after"><span class="arrow" class:expanded><Icon name="expand" /></span></div>
      </div>
      <div class="item-text od-value">{summary}</div>
      {#if location}<div class="item-text">{t('trip.startingOn', { date: formatLongDate(start) })}</div>{/if}
    </div>
  </div>
</li>

<style>
  @layer od.components {
    .grid {
      width: 56px;
      height: 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 2px;
    }

    .item-title {
      white-space: normal;
    }

    .arrow {
      display: block;

      &.expanded {
        transform: rotate(180deg);
      }
    }
  }
</style>
