<script>
  // @ts-check
  // <DiveRow> (spec, section 4, "LignePlongee"): thumbnail, site (or "site not
  // set"), date and time; on the right the maximum depth, then the duration.
  import ProfileThumbnail from './ProfileThumbnail.svelte';
  import { formatDateTime, formatDepth, formatDuration } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * `inTrip`: the row belongs to an expanded trip and is shifted to the right.
   * `highlight`: the latest dive, shown as a block (dark in the "black blocks" theme).
   * @type {{ dive: import('opendives-core').Dive, prefs: import('opendives-core').Prefs, inTrip?: boolean, highlight?: boolean }}
   */
  let { dive, prefs, inTrip = false, highlight = false } = $props();

  // Name read by TalkBack and VoiceOver: site, date, then the values.
  // A zero depth means "unknown" in the core: it is not read.
  const label = $derived(
    t(dive.maxDepthMm ? 'dive.screenReader' : 'dive.screenReaderNoDepth', {
      site: dive.site || t('dive.siteNotSet'),
      date: formatDateTime(dive.date),
      depth: formatDepth(dive.maxDepthMm, prefs),
      duration: formatDuration(dive.durationSeconds),
    }),
  );
</script>

<li class:in-trip={inTrip} class:od-block={highlight}>
  <a href="/dive/{dive.id}/" class="item-link item-content dive-row" aria-label={label}>
    <div class="item-media">
      <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} {prefs} />
    </div>
    <div class="item-inner">
      <div class="item-title-row">
        <div class="item-title">
          {#if dive.site}{dive.site}{:else}<span class="not-set">{t('dive.siteNotSet')}</span>{/if}
        </div>
        <div class="item-after values od-value">
          {#if dive.maxDepthMm}<strong>{formatDepth(dive.maxDepthMm, prefs)}</strong>{/if}
          <span>{formatDuration(dive.durationSeconds)}</span>
        </div>
      </div>
      <div class="item-text">{formatDateTime(dive.date)}</div>
    </div>
  </a>
</li>

<style>
  @layer od.components {
    .in-trip {
      --f7-list-item-padding-horizontal: 32px;
    }

    .item-title {
      white-space: normal;
    }

    .not-set {
      color: var(--f7-list-item-text-text-color, var(--f7-md-on-surface-variant));
      font-weight: normal;
    }

    .values {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: right;
      flex-shrink: 0;
      margin-left: 12px;

      strong {
        color: var(--f7-list-item-title-text-color, inherit);
      }
    }
  }
</style>
