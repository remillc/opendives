<script>
  // @ts-check
  // <DiveRow> (spec, section 4, "LignePlongee"): thumbnail, site (or "site not
  // set"), date and time; on the right the maximum depth, then the duration.
  import ProfileThumbnail from './ProfileThumbnail.svelte';
  import { formatDateTime, formatDepth, formatDuration } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * `inTrip`: the row belongs to an expanded trip and is shifted to the right.
   * `index` and `top`: position in the logbook's virtual list.
   * @type {{
   *   dive: import('opendives-core').Dive,
   *   prefs: import('opendives-core').Prefs,
   *   inTrip?: boolean,
   *   index?: number,
   *   top?: number,
   * }}
   */
  let { dive, prefs, inTrip = false, index = undefined, top = undefined } = $props();

  // Dive number as in the detail ("N° 1234"); 0 means not numbered.
  const number = $derived(dive.number ? t('detail.number', { number: String(dive.number) }) : '');

  // Name read by TalkBack and VoiceOver: number, site, date, then the values.
  // A zero depth means "unknown" in the core: it is not read.
  const details = $derived(
    t(dive.maxDepthMm ? 'dive.screenReader' : 'dive.screenReaderNoDepth', {
      site: dive.site || t('dive.siteNotSet'),
      date: formatDateTime(dive.date),
      depth: formatDepth(dive.maxDepthMm, prefs),
      duration: formatDuration(dive.durationSeconds),
    }),
  );
  const label = $derived(number ? `${number}, ${details}` : details);
</script>

<li class:in-trip={inTrip} data-virtual-list-index={index} style:top={top === undefined ? undefined : `${top}px`}>
  <a href="/dive/{dive.id}/" class="item-link item-content dive-row" aria-label={label}>
    <div class="item-media">
      <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} {prefs} />
    </div>
    <div class="item-inner od-row">
      <div class="od-row-text">
        <div class="item-title">
          {#if dive.site}{dive.site}{:else}<span class="not-set">{t('dive.siteNotSet')}</span>{/if}
        </div>
        <div class="item-text">{#if number}{number}<span class="separator" aria-hidden="true">·</span>{/if}{formatDateTime(dive.date)}</div>
      </div>
      <div class="values od-value">
        {#if dive.maxDepthMm}<strong>{formatDepth(dive.maxDepthMm, prefs)}</strong>{/if}
        <span>{formatDuration(dive.durationSeconds)}</span>
      </div>
    </div>
  </a>
</li>

<style>
  @layer od.components {
    /* Shifted on the left only: values and chevron stay aligned with the other rows. */
    .in-trip .item-content {
      padding-left: calc(32px + var(--f7-safe-area-left));
    }

    .separator {
      margin: 0 0.4em;
    }

    .not-set {
      color: var(--f7-list-item-text-text-color, var(--f7-md-on-surface-variant));
      font-weight: normal;
    }

    /* Depth first, the duration small under it; both centred on the row. */
    .values {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: right;
      flex-shrink: 0;

      strong {
        font-size: 17px;
        line-height: 22px;
        font-weight: 700;
        color: var(--od-text);
      }

      span {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }
    }
  }
</style>
