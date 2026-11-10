<script>
  // @ts-check
  // New account: the confirmation code mailed by the server (docs/mockups/
  // compte-code-*.dc.html; spec, section 4, "Sign in and new account"), as
  // the PIN screen of Subsurface-mobile: cloud_verify_pin. "Renvoyer le
  // code" sits right under the field (outlined on Android, tinted grey on
  // iOS). From first launch, then "Reprendre votre carnet ?"; from Account,
  // the logbook of this device becomes the account's first logbook.
  import { OpenDivesCore } from 'opendives-core';
  import AccountField from '../components/AccountField.svelte';
  import EditorialPage from '../components/EditorialPage.svelte';
  import Icon from '../components/Icon.svelte';
  import { accountFlow, errorCode, finishAccount, showFailure, toast } from '../lib/account.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean, email?: string }} */
  let { f7router, welcome = false, email = '' } = $props();

  let code = $state('');
  let busy = $state(false);
  let codeError = $state('');

  async function confirm() {
    busy = true;
    codeError = '';
    try {
      const result = await OpenDivesCore.verifyPin({ pin: code.trim() });
      if (result.status !== 'verified') {
        codeError = t('confirmCode.wrong');
        return;
      }
      accountFlow.confirmedEmail = email;
      if (welcome) {
        f7router.navigate('/welcome/import');
      } else {
        // From Account: the dives of this device are sent to the new account.
        await OpenDivesCore.createLog({ source: 'device' });
        finishAccount(f7router, false);
      }
    } catch (e) {
      const code = errorCode(e);
      if (code === 'INVALID_PIN') codeError = t('confirmCode.wrong');
      else showFailure(code);
    } finally {
      busy = false;
    }
  }

  async function resend() {
    busy = true;
    try {
      await OpenDivesCore.resendCode();
      toast(t('confirmCode.resent', { email }));
    } catch (e) {
      showFailure(errorCode(e));
    } finally {
      busy = false;
    }
  }
</script>

<EditorialPage class="od-confirm-code"
  title={t('createAccount.title')}
  step={t('createAccount.step1')}
  heading={t('confirmCode.heading')}
  intro={t('confirmCode.intro', { email })}
  action={t('confirmCode.submit')}
  busyLabel={t('confirmCode.busy')}
  {busy}
  actionDisabled={!code.trim()}
  onaction={confirm}
>
  <div class="od-confirm-code--fields">
    <AccountField
      label={t('confirmCode.code')}
      rowLabel={t('confirmCode.codeRow')}
      autocomplete="one-time-code"
      bind:value={code}
      error={codeError}
      disabled={busy}
      required
    />
    <div class="od-confirm-code--resend">
      <button type="button" disabled={busy} onclick={resend}><Icon name="refresh" size={18} weight={2} />{t('confirmCode.resend')}</button>
    </div>
  </div>
</EditorialPage>

<style>
  @layer od.components {
    .od-confirm-code--fields {
      margin: 6px 0 0;

      :global(.ios) & {
        margin: 0;
      }
    }

    /* MD3 outlined button with a leading icon (18 dp); iOS: a grey tinted button. */
    .od-confirm-code--resend {
      margin: 8px 16px 0;

      button {
        width: auto;
        height: 40px;
        padding: 0 24px 0 16px;
        border: 1px solid var(--od-text-2);
        border-radius: 20px;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.1px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;

        &:disabled {
          opacity: 0.38;
        }
      }

      :global(.ios) & {
        margin: 12px 16px 0;

        button {
          height: 44px;
          padding: 0 16px;
          border: none;
          border-radius: 12px;
          background: var(--od-tint);
          color: var(--od-on-tint);
          font-size: 17px;
          font-weight: 400;
          letter-spacing: 0;
        }
      }
    }
  }
</style>
