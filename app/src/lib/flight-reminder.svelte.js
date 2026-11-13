// @ts-check
// "Me prévenir quand je peux prendre l'avion" (task 2026-11-13-98): one local notification at
// the end of the wait before flying, counted from the last dive of the logbook (lib/tools.js).
//
// It is scheduled, cancelled or moved each time what it depends on changes: the dives of the
// logbook (a download, an import, a manual entry, a sync that brings dives, a deletion), the
// wait setting, the switch. At start the same code runs once the logbook is read, so that a
// reinstall or a reboot keeps it right. The notification is inexact (no exact alarm
// permission): it may come a few minutes late.
import { untrack } from 'svelte';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { logbook } from './logbook.svelte.js';
import { settings, setAppSetting } from './settings.svelte.js';
import { flightDives } from './tools.js';
import { flightNotice, FLIGHT_LINK } from './flight-notice.js';
import { localNowIso } from './format.js';
import { confirmAction } from './dialogs.js';
import { showSnackbar } from './snackbar.js';
import { handleLink } from './open-link.js';
import { t } from './i18n.js';

/** The one notification of the app: replaced, never added to. */
const NOTIFICATION_ID = 9801;
const CHANNEL_ID = 'flight';

const native = () => Capacitor.isNativePlatform();

/** Changes are applied one after the other, in the order they were asked. */
let queue = Promise.resolve();

/** True when the system lets the app show notifications. */
async function allowed() {
  try {
    return (await LocalNotifications.checkPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/** Schedules, moves or cancels the notification from the logbook and the settings. */
async function apply() {
  if (!native()) return;
  const cancel = () => LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  try {
    const now = localNowIso();
    const notice = settings.flightNotify ? flightNotice(flightDives(logbook.dives, now), settings.flightWait, now) : null;
    if (!notice || !(await allowed())) {
      await cancel();
      return;
    }
    if (Capacitor.getPlatform() === 'android') {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: t('flight.channel.name'),
        description: t('flight.channel.description'),
        importance: 3,
        visibility: 1,
      });
    }
    // Replace the pending one: the same id, scheduled again.
    await cancel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: notice.title,
          body: notice.body,
          channelId: CHANNEL_ID,
          smallIcon: 'ic_stat_flight',
          // Inexact on purpose: a few minutes late does not matter (no exact alarm permission).
          schedule: { at: notice.at, allowWhileIdle: false },
          extra: { link: FLIGHT_LINK },
        },
      ],
    });
  } catch (e) {
    console.error('Flight reminder', e);
  }
}

/** Applies the reminder after the changes already asked. */
export function refreshFlightReminder() {
  queue = queue.then(apply);
  return queue;
}

/**
 * Turns the switch on or off. On: a short explanation, then the system's permission
 * question (Android 13 and later: POST_NOTIFICATIONS); a refusal turns the switch back off
 * with a message. The caller's switch shows `settings.flightNotify`.
 * @param {boolean} on
 */
export async function setFlightNotify(on) {
  if (!on) {
    setAppSetting('flightNotify', false);
    return;
  }
  // On at once: the switch stays where the diver put it while the questions are asked.
  setAppSetting('flightNotify', true);
  if (!native() || (await allowed())) return;
  const agreed = await new Promise((resolve) =>
    confirmAction({
      title: t('flight.permission.title'),
      text: t('flight.permission.text'),
      action: t('flight.permission.action'),
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  );
  let granted = false;
  if (agreed) {
    try {
      granted = (await LocalNotifications.requestPermissions()).display === 'granted';
    } catch (e) {
      console.error('Notification permission', e);
    }
  }
  if (granted) {
    refreshFlightReminder();
    return;
  }
  setAppSetting('flightNotify', false);
  if (agreed) showSnackbar(t('flight.permission.denied'));
}

/**
 * Starts following the logbook and the settings, and the tap on the notification. Called once,
 * when the app is built.
 */
export function startFlightReminder() {
  if (native()) {
    LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const link = event.notification?.extra?.link;
      handleLink(typeof link === 'string' ? link : FLIGHT_LINK);
    });
  }
  $effect.root(() => {
    // What the reminder depends on, as one text: the last day's dives, the choice, the switch.
    // Nothing before the logbook is read (the first dives may come from the cache, then be replaced).
    const key = $derived(
      logbook.loading || logbook.welcome
        ? null
        : `${settings.flightNotify}|${settings.flightWait}|${flightDives(logbook.dives, localNowIso())
            .map((d) => `${d.date}/${d.endDate}`)
            .join(',')}`,
    );
    $effect(() => {
      if (key !== null) untrack(() => refreshFlightReminder());
    });
  });
}
