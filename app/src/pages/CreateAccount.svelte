<script>
  // @ts-check
  // New Subsurface cloud account, step 1 of 2 on first launch (spec, section
  // 4: cloud_create_account, then validation with a PIN sent by email). No
  // mock-up for this step: built in the frame of step 2. The email and
  // password are checked with Subsurface's own rules (core/cloudstorage.cpp,
  // isValidEmail and isValidPassword). Creating the account is not built:
  // the action says so, nothing is sent. On first launch the dialog offers a
  // preview of step 2 (BringLogbook).
  import TextField from '../components/TextField.svelte';
  import AccountStep from '../components/AccountStep.svelte';
  import { notAvailableYet } from '../lib/not-available.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean }} */
  let { f7router, welcome = false } = $props();

  let email = $state('');
  let password = $state('');
  let checked = $state(false);

  // Ported from core/cloudstorage.cpp (isValidEmail, isValidPassword).
  const EMAIL = /^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.+_-]+\.[a-zA-Z0-9+_-]{2,}$/;
  const PASSWORD = /^[a-zA-Z0-9@.+_-]+$/;
  const emailValid = $derived(email.length <= 254 && email.indexOf('@') <= 64 && EMAIL.test(email.trim()));
  const passwordValid = $derived(PASSWORD.test(password));

  function create() {
    checked = true;
    if (!emailValid || !passwordValid) return;
    password = '';
    checked = false;
    notAvailableYet(
      t('notAvailable.create'),
      welcome ? { text: t('notAvailable.previewStep2'), onClick: () => f7router.navigate('/welcome/import/?preview=1') } : undefined,
    );
  }
</script>

<AccountStep
  title={t('createAccount.title')}
  step={welcome ? t('createAccount.step1') : ''}
  heading={t('createAccount.heading')}
  intro={t('createAccount.intro')}
  action={t('createAccount.submit')}
  actionDisabled={!email.trim() || !password}
  onaction={create}
>
  <div class="fields">
    <TextField
      label={t('createAccount.email')}
      bind:value={email}
      autocomplete="email"
      invalid={checked && !emailValid}
      supporting={checked && !emailValid ? t('createAccount.invalidEmail') : ''}
    />
    <TextField
      label={t('createAccount.password')}
      type="password"
      autocomplete="new-password"
      bind:value={password}
      invalid={checked && !passwordValid}
      supporting={t('createAccount.passwordText')}
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
