// @ts-check
// The reminder of the end of the wait before flying (task 2026-11-13-98): what is shown and
// when. Pure: the scheduling itself is in flight-reminder.svelte.js.
import { t } from './i18n.js';
import { formatLongDate } from './format.js';
import { flightWait } from './tools.js';

/** Where a tap on the notification goes: the Desaturation tool (lib/deep-link.js). */
export const FLIGHT_LINK = 'opendives://tools/desaturation';

/**
 * A local wall-clock time ("2026-11-07T08:35:00") as a moment of the device clock.
 * @param {string} iso
 */
export function localDate(iso) {
  const [y, mo, d, h, mi, s] = iso.split(/[-T:]/).map(Number);
  return new Date(y, mo - 1, d, h, mi, s || 0);
}

/**
 * The notification for the end of the wait: null when there is no dive or the wait is over.
 * @param {{date: string, endDate: string}[]} dives the dives that count (tools.js flightDives), oldest first
 * @param {import('./tools.js').FlightWaitMode} mode
 * @param {string} now local time (ISO, no time zone)
 * @returns {{at: Date, title: string, body: string}|null}
 */
export function flightNotice(dives, mode, now) {
  const wait = flightWait(dives, now, mode);
  if (!wait || wait.remainingSeconds <= 0) return null;
  const last = dives[dives.length - 1];
  // Day of the dives compared with the day the notification arrives, by calendar days.
  const DAY = 86400000;
  const days = Math.floor(Date.parse(`${wait.endsAt}Z`) / DAY) - Math.floor(Date.parse(`${last.date}Z`) / DAY);
  const when =
    days === 0 ? t('flight.notice.today') : days === 1 ? t('flight.notice.yesterday') : t('flight.notice.date', { date: formatLongDate(last.date) });
  return {
    at: localDate(wait.endsAt),
    title: t('flight.notice.title'),
    body: t('flight.notice.body', {
      hours: String(wait.hours),
      dives: t(wait.several ? 'flight.notice.several' : 'flight.notice.single'),
      when,
    }),
  };
}
