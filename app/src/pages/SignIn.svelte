<script>
  // @ts-check
  // Sign in to an existing Subsurface cloud account (first launch, or the
  // Account screen without an account). No mock-up: built in the frame of
  // the new account screens. Signing in with typed credentials needs a core
  // function and the keychain, which are not built: the action says so, and
  // nothing is sent or kept.
  import TextField from '../components/TextField.svelte';
  import AccountStep from '../components/AccountStep.svelte';
  import { notAvailableYet } from '../lib/not-available.js';
  import { t } from '../lib/i18n.js';

  let email = $state('');
  let password = $state('');

  function signIn() {
    password = '';
    notAvailableYet(t('notAvailable.signIn'));
  }
</script>

<AccountStep
  title={t('signIn.title')}
  heading={t('signIn.heading')}
  intro={t('signIn.intro')}
  action={t('signIn.submit')}
  actionDisabled={!email.trim() || !password}
  onaction={signIn}
>
  <div class="fields">
    <TextField label={t('signIn.email')} bind:value={email} autocomplete="username" />
    <TextField
      label={t('signIn.password')}
      type="password"
      autocomplete="current-password"
      bind:value={password}
      supporting={t('signIn.passwordText')}
    />
  </div>
</AccountStep>

<style>
  @layer od.components {
    .fields {
      margin: 8px 8px 0;
    }
  }
</style>
