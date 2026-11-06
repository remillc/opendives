<script>
  // @ts-check
  // New account: the confirmation code mailed by the server (docs/mockups/
  // compte-code-*.dc.html; spec, section 4, "Sign in and new account"), as
  // the PIN screen of Subsurface-mobile: cloud_verify_pin. From first
  // launch, then "Reprendre votre carnet ?"; from Account, the logbook of
  // this device becomes the account's first logbook.
  import { OpenDivesCore } from 'opendives-core';
  import AccountField from '../components/AccountField.svelte';
  import AccountStep from '../components/AccountStep.svelte';
  import { errorCode, finishAccount, showFailure, toast } from '../lib/account.js';
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
      if (welcome) {
        f7router.navigate('/welcome/import/');
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

<AccountStep
  title={t('createAccount.title')}
  step={t('createAccount.step1')}
  heading={t('confirmCode.heading')}
  intro={t('confirmCode.intro', { email })}
  action={t('confirmCode.submit')}
  busyLabel={t('confirmCode.busy')}
  {busy}
  actionDisabled={!code.trim()}
  onaction={confirm}
  secondary={{ label: t('confirmCode.resend'), onclick: resend }}
>
  <div class="fields">
    <AccountField
      label={t('confirmCode.code')}
      rowLabel={t('confirmCode.codeRow')}
      autocomplete="one-time-code"
      bind:value={code}
      error={codeError}
      disabled={busy}
      required
    />
  </div>
</AccountStep>

<style>
  @layer od.components {
    .fields {
      margin: 6px 0 0;

      :global(.ios) & {
        margin: 0;
      }
    }
  }
</style>
