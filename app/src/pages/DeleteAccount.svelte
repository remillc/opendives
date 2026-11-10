<script>
  // @ts-check
  // Delete the account (docs/mockups/compte-android-suppression.dc.html;
  // spec, section 4, "Delete the account"). Unsent changes are synced first;
  // the account is reported deleted only if the server confirms it. The
  // request is never sent by automated tests.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import { logbook, accountDeleted, syncNow } from '../lib/logbook.svelte.js';
  import { OpenDivesCore } from 'opendives-core';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  let keepDives = $state(true);
  let password = $state('');
  let busy = $state(false);
  const offline = $derived(logbook.sync === 'offline');

  /** @param {string} text */
  function toast(text) {
    showSnackbar(text);
  }

  /** "Export a copy of the logbook" (.ssrf): file export does not exist yet. */
  function exportCopy() {
    toast(t('account.notAvailable'));
  }

  async function deleteAccount() {
    if (busy || offline || !password) return;
    busy = true;
    try {
      // Unsent changes first, so that the copy kept is complete.
      if (logbook.pending > 0) await syncNow();
      if (logbook.pending > 0) {
        toast(t('deleteAccount.notDeleted'));
        return;
      }
      const result = await OpenDivesCore.deleteAccount({ password, keepDives });
      // The server's replies are not documented: kept in the log for the report.
      console.info('Delete account: HTTP', result.status, JSON.stringify(result.reply));
      if (!result.deleted) {
        toast(t('deleteAccount.notDeleted'));
        return;
      }
      await accountDeleted({ keepDives });
      toast(t('deleteAccount.deleted'));
      f7router.back();
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Delete account', code);
      toast(code.startsWith('WRONG_PASSWORD') ? t('deleteAccount.wrongPassword') : t('deleteAccount.notDeleted'));
    } finally {
      password = '';
      busy = false;
    }
  }
</script>

<Page class="od-delete-account">
  <Navbar title={t('account.delete')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('deleteAccount.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="od-delete-account--warning" role="note">
    <span class="od-delete-account--title"><Icon name="warning" size={22} />{t('deleteAccount.definitive')}</span>
    <p>{t('deleteAccount.consequence', { email: logbook.email, n: logbook.dives.length })}</p>
  </div>

  <label class="od-delete-account--keep">
    <span class="checkbox"><input type="checkbox" bind:checked={keepDives} /><i class="icon-checkbox"></i></span>
    <span class="od-delete-account--text">
      <span class="od-delete-account--label">{t('deleteAccount.keep')}</span>
      <span class="od-delete-account--hint">{t('deleteAccount.keepText')}</span>
    </span>
  </label>

  <div class="od-delete-account--export">
    <button type="button" class="od-delete-account--outlined" onclick={exportCopy}><Icon name="download" size={18} />{t('deleteAccount.export')}</button>
    <span class="od-delete-account--hint">{t('deleteAccount.exportText')}</span>
  </div>

    <TextField
      label={t('deleteAccount.password')}
      type="password"
      autocomplete="current-password"
      bind:value={password}
      supporting={t('deleteAccount.passwordText')}
    />


  <p class="od-delete-account--note">{t('deleteAccount.note')}</p>

  <div class="od-delete-account--actions">
    <button type="button" class="od-delete-account--danger" disabled={busy || offline || !password} onclick={deleteAccount}>
      {offline ? t('deleteAccount.connectionNeeded') : t('deleteAccount.confirm')}
    </button>
    <button type="button" class="od-delete-account--cancel" onclick={() => f7router.back()}>{t('signOut.cancel')}</button>
  </div>
</Page>

<style>
  @layer od.components {
    .od-delete-account--warning {
      margin: 16px 16px 0;
      padding: 16px;
      border-radius: 16px;
      background: var(--od-surface);

      .od-delete-account--title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 17px;
        font-weight: 700;
        color: var(--od-alarm);
      }

      p {
        margin: 8px 0 0;
        font-size: 15px;
        line-height: 21px;
      }
    }

    .od-delete-account--keep {
      margin: 20px 16px 0;
      min-height: 48px;
      box-sizing: border-box;
      padding: 4px 0;
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }

    .od-delete-account--text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-delete-account--label {
      font-size: 16px;
    }

    .od-delete-account--hint {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-delete-account--export {
      margin: 18px 16px 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .od-delete-account--outlined {
      width: auto;
      height: 40px;
      padding: 0 20px 0 16px;
      border: 1px solid var(--od-text-2);
      border-radius: 20px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .od-delete-account--note {
      margin: 16px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-delete-account--actions {
      margin: 20px 16px 32px;
      display: flex;
      flex-direction: column;
      gap: 8px;

      /* MD3 buttons: 40 dp, fully rounded, 24 dp side padding, 14 sp medium. */
      button {
        width: 100%;
        height: 40px;
        padding: 0 24px;
        border: none;
        border-radius: 20px;
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.1px;
      }

      .od-delete-account--danger {
        background: var(--od-alarm);
        color: var(--od-on-action);

        &:disabled {
          opacity: 0.5;
        }
      }

      .od-delete-account--cancel {
        background: none;
        color: var(--od-text);
        font-weight: 500;
      }
    }
  }
</style>
