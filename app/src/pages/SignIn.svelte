<script>
  // @ts-check
  // Sign in to an existing Subsurface cloud account (docs/mockups/
  // compte-connexion-*.dc.html; spec, section 4, "Sign in and new account"),
  // from first launch or from Account without an account. The server checks
  // the credentials; they are then kept in the Android Keystore. An account
  // without a logbook yet goes on to "Reprendre votre carnet ?".
  // Not built yet: from Account, the dives of this device are not added to
  // the account's logbook (they stay in the device's logbook).
  import { OpenDivesCore } from 'opendives-core';
  import AccountField from '../components/AccountField.svelte';
  import AccountStep from '../components/AccountStep.svelte';
  import { errorCode, finishAccount, showFailure, validEmail, validPassword } from '../lib/account.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean, prefilledEmail?: string }} */
  let { f7router, welcome = false, prefilledEmail = '' } = $props();

  // svelte-ignore state_referenced_locally
  let email = $state(prefilledEmail);
  let password = $state('');
  let busy = $state(false);
  let emailError = $state('');
  let passwordError = $state('');

  async function signIn() {
    emailError = validEmail(email.trim()) ? '' : t('createAccount.invalidEmail');
    passwordError = !emailError && !validPassword(password) ? t('signIn.incorrect') : '';
    if (emailError || passwordError) return;
    busy = true;
    try {
      const result = await OpenDivesCore.signIn({ email: email.trim(), password });
      password = '';
      if (result.exists) finishAccount(f7router, welcome, { offerDeviceDives: true });
      else f7router.navigate(`${welcome ? '/welcome' : '/account'}/import`, { props: { signedIn: true } });
    } catch (e) {
      const code = errorCode(e);
      if (code === 'INCORRECT') passwordError = t('signIn.incorrect');
      else showFailure(code);
    } finally {
      busy = false;
    }
  }
</script>

<AccountStep
  title={t('signIn.title')}
  heading={t('signIn.heading')}
  intro={t('signIn.intro')}
  action={t('signIn.submit')}
  busyLabel={t('signIn.busy')}
  {busy}
  actionDisabled={!email.trim() || !password}
  onaction={signIn}
>
  <div class="fields">
    <AccountField
      label={t('signIn.email')}
      rowLabel={t('accountStep.emailRow')}
      type="email"
      autocomplete="email"
      bind:value={email}
      error={emailError}
      disabled={busy}
      position="first"
    />
    <AccountField
      label={t('signIn.password')}
      rowLabel={t('signIn.password')}
      type="password"
      autocomplete="current-password"
      bind:value={password}
      supporting={t('signIn.passwordText')}
      error={passwordError}
      footer={emailError || passwordError || t('signIn.passwordText')}
      footerError={!!(emailError || passwordError)}
      disabled={busy}
      position="last"
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
