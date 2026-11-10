<script>
  // @ts-check
  // <DiveRow> (spec, section 4, "LignePlongee"): thumbnail, site (or "site not
  // set"), date and time; on the right the maximum depth, then the duration.
  import { theme } from 'framework7-svelte';
  import ProfileThumbnail from './ProfileThumbnail.svelte';
  import { formatDateTime, formatDepth, formatDuration } from '../lib/format.js';
  import { layout } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
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
   *   pending?: string[],
   *   selecting?: boolean,
   *   checked?: boolean,
   *   appear?: boolean,
   *   tripFirst?: boolean,
   *   tripLast?: boolean,
   * }}
   * `pending`: fields edited and not sent yet; the date gives way to them.
   * `selecting`: the logbook's selection mode, a check box before the row;
   * the logbook handles the taps (data-dive gives the dive).
   * `appear`: the row of a trip just expanded slides into place (accordion).
   * `tripFirst`, `tripLast`: the ends of the white surface of an expanded trip.
   */
  let { dive, prefs, inTrip = false, index = undefined, top = undefined, pending = [], selecting = false, checked = false, appear = false, tripFirst = false, tripLast = false } = $props();

  // "Notes edited, waiting to be sent" (spec, section 4, <DiveRow>).
  const pendingText = $derived(
    pending.length === 0
      ? ''
      : pending.length === 1
        ? t('dive.pending', { what: t(`dive.pendingFields.${pending[0]}`) })
        : t('dive.pendingSeveral'),
  );

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
  const label = $derived([number, details, pendingText].filter(Boolean).join(', '));
</script>

<li class="od-dive-row" data-trip={inTrip ? dive.trip?.id : undefined} class:od-dive-row--in-trip={inTrip} class:od-dive-row--trip-first={tripFirst} class:od-dive-row--trip-last={tripLast} class:od-dive-row--appear={appear} class:od-dive-row--selected={layout.split && navigation.dive === String(dive.id)} data-virtual-list-index={index} style:top={top === undefined ? undefined : `${top}px`}>
  <!-- data-reload-detail: beside the list (tablet), the dive replaces the one shown. -->
  <a
    href="/dives/{dive.id}"
    data-reload-detail="true"
    data-dive={dive.id}
    draggable="false"
    class="item-link item-content od-dive-row--link"
    class:no-chevron={selecting}
    role={selecting ? 'checkbox' : undefined}
    aria-checked={selecting ? checked : undefined}
    aria-label={label}
  >
    {#if selecting}
      <span class="checkbox" aria-hidden="true"><input type="checkbox" {checked} tabindex="-1" /><i class="icon-checkbox"></i></span>
    {/if}
    <div class="item-media">
      <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} {prefs} />
    </div>
    <div class="item-inner od-row">
      <div class="od-row-text">
        <div class="item-title">
          {#if dive.site}{dive.site}{:else}<span class="od-dive-row--not-set">{t('dive.siteNotSet')}</span>{/if}
        </div>
        <div class="item-text">{#if number}{number}<span class="od-dive-row--separator" aria-hidden="true">·</span>{/if}{formatDateTime(dive.date)}</div>
        {#if pendingText}<div class="item-text od-dive-row--pending">{pendingText}</div>{/if}
      </div>
      <div class="od-dive-row--values od-value">
        {#if theme.ios}
          {#if dive.maxDepthMm}<strong>{formatDepth(dive.maxDepthMm, prefs)}</strong>{/if}
          <span>{formatDuration(dive.durationSeconds)}</span>
        {:else}
          <!-- Android: the duration above the depth (spec, "Dive rows, duration above depth"). -->
          <strong>{formatDuration(dive.durationSeconds)}</strong>
          {#if dive.maxDepthMm}<span>{formatDepth(dive.maxDepthMm, prefs)}</span>{/if}
        {/if}
      </div>
    </div>
  </a>
</li>

<style>
  @layer od.components {
    /* iOS: shifted on the left only, values and chevron aligned with the other
       rows. Android: a white surface, in theme.css. */
    :global(.ios) .od-dive-row--in-trip .item-content {
      padding-left: calc(32px + var(--f7-safe-area-left));
    }

    /* Beside the list (tablet), the row of the dive shown. */
    .od-dive-row--selected {
      background: var(--od-tint);
      color: var(--od-on-tint);
    }

    /* A trip just expanded: its dives slide down into place. */
    .od-dive-row--appear {
      animation: od-row-appear 220ms ease-out;
    }

    @keyframes od-row-appear {
      from {
        opacity: 0;
        transform: translateY(-16px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-dive-row--appear {
        animation: none;
      }
    }

    /* Selection mode: the check box before the thumbnail. */
    .checkbox {
      flex: none;
      margin-right: 16px;
      pointer-events: none;

      /* Android: the row's own 16 dp gap. */
      :global(.md) & {
        margin-right: 0;
      }
    }

    .od-dive-row--separator {
      margin: 0 0.4em;
    }

    .item-text.od-dive-row--pending {
      color: var(--od-pending);
    }

    .od-dive-row--not-set {
      color: var(--od-text-2);
      font-weight: normal;
    }

    /* The first value strong, the second small under it; both centred on the row. */
    .od-dive-row--values {
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

      /* Android: docs/mockups/android-carnet.dc.html. */
      :global(.md) & {
        gap: 2px;

        strong {
          font-size: 16px;
          line-height: 24px;
          font-weight: 500;
        }

        span {
          font-size: 14px;
          line-height: 20px;
        }
      }
    }
  }
</style>
