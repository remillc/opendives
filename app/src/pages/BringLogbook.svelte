<script>
  // @ts-check
  // New account, step 2 of 2: bring a logbook into it (docs/mockups/
  // android-compte-import.dc.html, ios-compte-import.dc.html; spec, section 4).
  // From divelogs.de (one-off download, credentials only in this screen's
  // memory, never stored), from a file, or an empty logbook. None of the
  // three is built yet (divelogs.de download, file picker, account
  // creation): the action says so. Until account creation exists, this
  // screen is only reached as a preview (?preview=1), which it states.
  import TextField from '../components/TextField.svelte';
  import AccountStep from '../components/AccountStep.svelte';
  import { notAvailableYet } from '../lib/not-available.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: any }} */
  let { f7route } = $props();
  const preview = $derived(f7route.query?.preview === '1');

  /** @type {'divelogs'|'file'|'empty'} */
  let source = $state('divelogs');
  let user = $state('');
  let password = $state('');

  // divelogs.de credentials are forgotten as soon as another source is chosen.
  $effect(() => {
    if (source !== 'divelogs') {
      user = '';
      password = '';
    }
  });

  const action = $derived(
    source === 'divelogs' ? t('bringLogbook.download') : source === 'file' ? t('bringLogbook.chooseFile') : t('bringLogbook.start'),
  );

  function run() {
    if (source === 'divelogs') {
      user = '';
      password = '';
      notAvailableYet(t('notAvailable.divelogs'));
    } else if (source === 'file') {
      notAvailableYet(t('notAvailable.file'));
    } else {
      notAvailableYet(t('notAvailable.empty'));
    }
  }
</script>

<AccountStep
  title={t('createAccount.title')}
  step={t('createAccount.step2')}
  heading={t('bringLogbook.heading')}
  intro={preview ? t('bringLogbook.previewIntro') : t('bringLogbook.intro')}
  {action}
  actionDisabled={source === 'divelogs' && (!user.trim() || !password)}
  onaction={run}
>
  <div class="sources" role="radiogroup" aria-label={t('bringLogbook.sourceLabel')}>
    <label class="source">
      <span class="radio"><input type="radio" name="od-source" value="divelogs" bind:group={source} /><i class="icon-radio"></i></span>
      <span class="text">
        <span class="label">{t('bringLogbook.divelogs')}</span>
        <span class="consequence">{t('bringLogbook.divelogsText')}</span>
      </span>
    </label>
    {#if source === 'divelogs'}
      <div class="credentials">
        <TextField label={t('bringLogbook.user')} bind:value={user} autocomplete="username" />
        <TextField
          label={t('bringLogbook.password')}
          type="password"
          autocomplete="current-password"
          bind:value={password}
          supporting={t('bringLogbook.credentialsNote')}
        />
      </div>
    {/if}
    <label class="source">
      <span class="radio"><input type="radio" name="od-source" value="file" bind:group={source} /><i class="icon-radio"></i></span>
      <span class="text">
        <span class="label">{t('bringLogbook.file')}</span>
        <span class="consequence">{t('bringLogbook.fileText')}</span>
      </span>
    </label>
    <label class="source">
      <span class="radio"><input type="radio" name="od-source" value="empty" bind:group={source} /><i class="icon-radio"></i></span>
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
