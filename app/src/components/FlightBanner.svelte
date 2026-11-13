<script>
  // @ts-check
  // The logbook banner while a wait before flying is running (task 2026-11-13-98,
  // docs/mockups/android-carnet-avion.dc.html): "Avion dans 17 h 05", "Permis demain à 8 h 35".
  // It opens the Desaturation tool and disappears when the wait is over. Tertiary: what waits
  // for the diver (docs/system-design.md).
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { flightWaitFor, formatHoursMinutes } from '../lib/tools.js';
  import { formatDayAt, localNowIso } from '../lib/format.js';
  import { FLIGHT_LINK } from '../lib/flight-notice.js';
  import { handleLink } from '../lib/open-link.js';
  import { t } from '../lib/i18n.js';

  // The remaining time moves: read the clock again every 30 seconds.
  let now = $state(localNowIso());
  $effect(() => {
    const timer = setInterval(() => (now = localNowIso()), 30000);
    return () => clearInterval(timer);
  });

  const wait = $derived(logbook.loading ? null : flightWaitFor(logbook.dives, settings.flightWait, now));
  const running = $derived(wait && wait.remainingSeconds > 0 ? wait : null);
</script>

{#if running}
  <button type="button" class="od-flight-banner ripple" onclick={() => handleLink(FLIGHT_LINK)}>
    <span class="od-flight-banner--icon"><Icon name="plane" size={24} /></span>
    <span class="od-flight-banner--text">
      <span class="od-flight-banner--title od-value">{t('flight.banner.title', { time: formatHoursMinutes(running.remainingSeconds) })}</span>
      <span class="od-flight-banner--when">{t('flight.banner.allowed', { when: formatDayAt(running.endsAt, now) })}</span>
    </span>
    <span class="od-flight-banner--chevron"><Icon name="chevron" size={20} /></span>
  </button>
{/if}

<style>
  @layer od.components {
    .od-flight-banner {
      position: relative;
      overflow: hidden;
      width: calc(100% - 32px);
      margin: 8px 16px 4px;
      min-height: 64px;
      padding: 10px 12px 10px 16px;
      box-sizing: border-box;
      border: none;
      border-radius: 16px;
      background: var(--od-tertiary-container);
      color: var(--od-on-tertiary-container);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-flight-banner--icon {
      flex: none;
      display: flex;
      color: var(--od-tertiary);
    }

    .od-flight-banner--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-flight-banner--title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .od-flight-banner--when {
      font-size: 13px;
      line-height: 18px;
    }

    .od-flight-banner--chevron {
      flex: none;
      display: flex;
    }
  }
</style>
