// @ts-check
// Sign in and new account (spec, section 4, "Sign in and new account"): the
// same screens open from first launch (routes /welcome/…) and from Account
// without an account (routes /account/…).
import { f7 } from 'framework7-svelte';
import { accountReady, deviceDiveCount, importDeviceDives, logbook } from './logbook.svelte.js';
import { confirmAction } from './dialogs.js';
import { offerUndo } from './undo.js';
import { t } from './i18n.js';

/**
 * The account being created: its email once the code is confirmed. Step 1
 * then only shows it ("Précédent" from step 2 never creates a second
 * account).
 */
export const accountFlow = { confirmedEmail: '' };

/**
 * The error code of a rejected plugin call: its own code, or the core's code
 * at the start of the message ("NETWORK: …").
 * @param {unknown} e
 */
export function errorCode(e) {
  const err = /** @type {{ code?: string, message?: string }} */ (e ?? {});
  if (err.code && err.code !== 'CORE_ERROR' && err.code !== 'UNIMPLEMENTED') return err.code;
  return String(err.message ?? '').split(':')[0].trim();
}

// Ported from core/cloudstorage.cpp (isValidEmail, isValidPassword).
const EMAIL = /^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.+_-]+\.[a-zA-Z0-9+_-]{2,}$/;
const PASSWORD = /^[a-zA-Z0-9@.+_-]+$/;

/** @param {string} email */
export function validEmail(email) {
  const at = email.indexOf('@');
  return email.length <= 254 && at <= 64 && EMAIL.test(email);
}

/** @param {string} password */
export function validPassword(password) {
  return PASSWORD.test(password);
}

/** @param {string} text */
export function toast(text) {
  f7.toast.create({ text, closeTimeout: 4000, position: 'center' }).open();
}

/** A failure that is not a field's: the server did not answer, or something else. */
/** @param {string} code */
export function showFailure(code) {
  const text = code === 'NETWORK' ? t('accountStep.network') : t('accountStep.failed');
  f7.dialog.create({ title: t('accountStep.failedTitle'), text, buttons: [{ text: t('dialog.ok') }] }).open();
}

/**
 * The account is ready: first launch closes (or, from Account, back to its
 * first screen) and the account's logbook is loaded.
 * @param {any} router
 * @param {boolean} welcome
 */
export function finishAccount(router, welcome, { offerDeviceDives = false } = {}) {
  accountFlow.confirmedEmail = '';
  if (!welcome) {
    const first = router.history[0];
    if (first && router.history.length > 1) router.back(first, { force: true });
  }
  const loading = accountReady();
  // Signed in to an account that has a logbook: the dives logged on this
  // device without an account are offered once, when the account's logbook
  // is there.
  if (offerDeviceDives) Promise.resolve(loading).then(() => offerDeviceDivesOnce(logbook.email));
}

/** @param {string} email */
async function offerDeviceDivesOnce(email) {
  const key = `od.deviceDivesOffered:${email}`;
  try {
    if (!email || localStorage.getItem(key)) return;
  } catch {
    return;
  }
  const n = await deviceDiveCount();
  if (!n) return;
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Offered again next time: not harmful.
  }
  confirmAction({
    title: t('deviceDives.title'),
    text: t('deviceDives.text', { n }),
    action: t('deviceDives.add'),
    cancel: t('deviceDives.keep'),
    onConfirm: addDeviceDives,
  });
}

/** Adds the device's dives to the account's logbook, then offers Undo. */
export async function addDeviceDives() {
  try {
    const n = await importDeviceDives();
    offerUndo(t('deviceDives.added', { n }));
  } catch (e) {
    const code = errorCode(e);
    if (code === 'NO_NEW_DIVES') toastText(t('deviceDives.nothingNew'));
    else if (code === 'WRITE_LOCKED') toastText(t('edit.writeLocked'));
    else showFailure(code);
  }
}

/** @param {string} text */
function toastText(text) {
  f7.toast.create({ text, closeTimeout: 4000, position: 'bottom' }).open();
}
