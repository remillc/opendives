<script>
  // @ts-check
  // New Subsurface cloud account, step 1 of 2 (docs/mockups/
  // compte-creation-*.dc.html; spec, section 4, "Sign in and new account").
  // The email and password are checked with Subsurface's own rules, then
  // cloud_create_account: the server mails a code (next screen,
  // ConfirmCode). An email that already has an account with this password
  // signs in instead. Creating an account writes to the cloud: refused, for
  // now, except on the test account (write lock).
  import { OpenDivesCore } from 'opendives-core';
  import AccountField from '../components/AccountField.svelte';
  import AccountStep from '../components/AccountStep.svelte';
  import { notAvailableYet } from '../lib/not-available.js';
  import { errorCode, finishAccount, showFailure, validEmail, validPassword } from '../lib/account.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean }} */
  let { f7router, welcome = false } = $props();

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let emailError = $state('');
  let passwordError = $state('');

  async function create() {
    emailError = validEmail(email.trim()) ? '' : t('createAccount.invalidEmail');
    passwordError = validPassword(password) ? '' : t('createAccount.passwordText');
    if (emailError || passwordError) return;
    busy = true;
    try {
      const result = await OpenDivesCore.createAccount({ email: email.trim(), password });
      if (result.status === 'need_pin') {
        password = '';
        f7router.navigate(`${welcome ? '/welcome' : '/account'}/code/`, { props: { email: result.email } });
      } else if (result.status === 'verified') {
        // The account exists with this password: sign in to it.
        const signedIn = await OpenDivesCore.signIn({ email: email.trim(), password });
        password = '';
        if (signedIn.exists) finishAccount(f7router, welcome);
        else f7router.navigate(`${welcome ? '/welcome' : '/account'}/import/`);
      } else {
        passwordError = t('signIn.incorrect');
      }
    } catch (e) {
      const code = errorCode(e);
      if (code === 'WRITE_LOCKED') notAvailableYet(t('notAvailable.createLocked'));
      else if (code === 'INVALID_CREDENTIALS') passwordError = t('createAccount.passwordText');
      else showFailure(code);
    } finally {
      busy = false;
    }
  }
</script>

<AccountStep
  title={t('createAccount.title')}
  step={t('createAccount.step1')}
  heading={t('createAccount.heading')}
  intro={t('createAccount.intro')}
  action={t('createAccount.submit')}
  busyLabel={t('createAccount.busy')}
  {busy}
  actionDisabled={!email.trim() || !password}
  onaction={create}
>
  <div class="fields">
    <AccountField
      label={t('createAccount.email')}
      rowLabel={t('accountStep.emailRow')}
      type="email"
      autocomplete="email"
      bind:value={email}
      error={emailError}
      disabled={busy}
    />
    <AccountField
      label={t('createAccount.password')}
      rowLabel={t('createAccount.password')}
      type="password"
      autocomplete="new-password"
      bind:value={password}
      supporting={t('createAccount.passwordText')}
      error={passwordError}
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
