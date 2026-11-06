<script>
  // @ts-check
  // New account, step 2 of 2: bring a logbook into it (docs/mockups/
  // android-compte-import.dc.html, ios-compte-import.dc.html,
  // compte-import-identifiants-*.dc.html; spec, section 4). The main button,
  // "Continuer", acts on the selected choice: divelogs.de first checks the
  // credentials with divelogs.de (divelogs_check), stays here with the error
  // if they are refused, then opens the import screen (ImportProgress; the
  // credentials are handed to it in memory and cleared here, never stored);
  // file opens the picker, then the import screen without the download;
  // empty logbook creates the account's empty logbook and opens it.
  // "Précédent" goes back to step 1, which then only shows the email of the
  // account already created. Also reached when signing in to an account
  // that has no logbook yet.
  import { OpenDivesCore } from 'opendives-core';
  import TextField from '../components/TextField.svelte';
  import AccountStep from '../components/AccountStep.svelte';
  import { notAvailableYet } from '../lib/not-available.js';
  import { accountFlow, errorCode, finishAccount, showFailure } from '../lib/account.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, f7route: any }} */
  let { f7router, f7route } = $props();
  const welcome = $derived(String(f7route.path ?? '').startsWith('/welcome/'));
  const base = $derived(welcome ? '/welcome' : '/account');

  /** @type {'divelogs'|'file'|'empty'} */
  let source = $state('divelogs');
  let user = $state('');
  let password = $state('');
  let busy = $state(false);
  let refused = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();

  // divelogs.de credentials are forgotten as soon as another source is chosen.
  $effect(() => {
    if (source !== 'divelogs') {
      user = '';
      password = '';
      refused = false;
    }
  });

  async function run() {
    if (source === 'file') {
      fileInput?.click();
      return;
    }
    busy = true;
    refused = false;
    try {
      if (source === 'divelogs') {
        const credentials = { user: user.trim(), password };
        await OpenDivesCore.divelogsCheck(credentials);
        // Back here from the import ("Précédent" or a cancel), the fields are empty.
        user = '';
        password = '';
        f7router.navigate(`${base}/importing/`, { props: { source: 'divelogs', ...credentials } });
        return;
      }
      await OpenDivesCore.createLog({ source: 'empty' });
      finishAccount(f7router, welcome);
    } catch (e) {
      const code = errorCode(e);
      if (code === 'LOGIN_FAILED') refused = true;
      else if (code === 'WRITE_LOCKED') notAvailableYet(t('notAvailable.createLocked'));
      else showFailure(code);
    } finally {
      busy = false;
    }
  }

  /** The picked file goes to the app's cache, then to the import screen without the download. */
  async function fileChosen() {
    const file = fileInput?.files?.[0];
    if (!fileInput || !file) return;
    fileInput.value = '';
    busy = true;
    try {
      /** @type {string} */
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const { path } = await OpenDivesCore.stageImport({ name: file.name, data: base64 });
      f7router.navigate(`${base}/importing/`, { props: { source: 'file', path } });
    } catch (e) {
      showFailure(errorCode(e));
    } finally {
      busy = false;
    }
  }

  /** Back to step 1; after a creation it only shows the account's email. */
  function previous() {
    if (accountFlow.confirmedEmail) f7router.back(`${base}/create/`, { force: true });
    else f7router.back();
  }
</script>

<AccountStep
  title={t('createAccount.title')}
  step={t('createAccount.step2')}
  heading={t('bringLogbook.heading')}
  intro={t('bringLogbook.intro')}
  action={t('bringLogbook.continue')}
  busyLabel={source === 'divelogs' ? t('bringLogbook.checking') : t('bringLogbook.creating')}
  {busy}
  actionDisabled={source === 'divelogs' && (!user.trim() || !password)}
  onaction={run}
  secondary={{ label: t('bringLogbook.previous'), onclick: previous }}
  previous
>
  <input type="file" class="od-sr-only" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
  <div class="sources" role="radiogroup" aria-label={t('bringLogbook.sourceLabel')}>
    <label class="source">
      <span class="radio"><input type="radio" name="od-source" value="divelogs" bind:group={source} disabled={busy} /><i class="icon-radio"></i></span>
      <span class="text">
        <span class="label">{t('bringLogbook.divelogs')}</span>
        <span class="consequence">{t('bringLogbook.divelogsText')}</span>
      </span>
    </label>
    {#if source === 'divelogs'}
      <div class="credentials">
        <TextField label={t('bringLogbook.user')} bind:value={user} autocomplete="username" disabled={busy} />
        <TextField
          label={t('bringLogbook.password')}
          type="password"
          autocomplete="current-password"
          bind:value={password}
          disabled={busy}
          invalid={refused}
          supporting={refused ? t('bringLogbook.refused') : t('bringLogbook.credentialsNote')}
        />
      </div>
    {/if}
    <label class="source">
      <span class="radio"><input type="radio" name="od-source" value="file" bind:group={source} disabled={busy} /><i class="icon-radio"></i></span>
      <span class="text">
        <span class="label">{t('bringLogbook.file')}</span>
        <span class="consequence">{t('bringLogbook.fileText')}</span>
      </span>
    </label>
    <label class="source">
      <span class="radio"><input type="radio" name="od-source" value="empty" bind:group={source} disabled={busy} /><i class="icon-radio"></i></span>
      <span class="text">
        <span class="label">{t('bringLogbook.empty')}</span>
      </span>
    </label>
  </div>
</AccountStep>

<style>
  @layer od.components {
    /* Android: plain rows on the page, radio buttons 20 dp (never shrunk). */
    .sources {
      margin: 12px 16px 0;
      display: flex;
      flex-direction: column;
    }

    .source {
      display: flex;
      gap: 16px;
      padding: 8px;
      min-height: 48px;
      box-sizing: border-box;
      align-items: flex-start;
      cursor: pointer;

      .radio {
        margin-top: 2px;
      }
    }

    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .label {
      font-size: 16px;
      line-height: 24px;
    }

    .consequence {
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);
    }

    /* Under the divelogs.de choice, aligned with its text. */
    .credentials {
      margin: 0 8px 8px 44px;
      --od-field-margin: 0;
    }

    /* iOS: a white inset group, a check mark for the choice. */
    :global(.ios) .sources {
      margin-top: 16px;
      border-radius: 10px;
      overflow: hidden;
      background: var(--od-surface);

      .source {
        gap: 12px;
        padding: 12px 16px;

        & + .source,
        .credentials + & {
          box-shadow: inset 0 0.5px 0 var(--od-separator);
        }

        .radio {
          margin-top: 1px;
        }
      }

      .text {
        gap: 3px;
      }

      .label {
        font-size: 17px;
        font-weight: 600;
      }

      .consequence {
        font-size: 13px;
        line-height: 18px;
        letter-spacing: 0;
      }

      .credentials {
        margin: 0 16px 12px 50px;
      }
    }
  }
</style>
