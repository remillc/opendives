<script>
  // @ts-check
  // New account: the import in progress, then the logbook, or the failure
  // (docs/mockups/compte-import-encours-*.dc.html,
  // compte-import-echec-*.dc.html; spec, section 4, "Sign in and new
  // account"). divelogs.de: download (divelogs_download), read the dives
  // (import_count, read-only) and save in the account (cloud_create_log, the
  // only step that writes to it). A picked file: the same without the
  // download. "Annuler l'import" stops before the last step and nothing is
  // sent. The credentials were checked on step 2: the failure only covers
  // the import itself, with "Réessayer"; they live only in this screen, for
  // that, and are never stored.
  // The core reports no progress inside a step: the running step shows a
  // spinner (the loading indicator on Android), without the "128 sur 214" bar
  // of the mock-up.
  import { onDestroy } from 'svelte';
  import { f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import EditorialPage from '../components/EditorialPage.svelte';
  import Icon from '../components/Icon.svelte';
  import LoadingIndicator from '../components/LoadingIndicator.svelte';
  import { errorCode, finishAccount, showFailure } from '../lib/account.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{ f7router: any, f7route: any, source?: 'divelogs'|'file', user?: string, password?: string, path?: string }}
   */
  let { f7router, f7route, source = 'divelogs', user = '', password = '', path: picked = '' } = $props();
  const welcome = $derived(String(f7route.path ?? '').startsWith('/welcome'));
  const ios = f7.theme === 'ios';

  /** @typedef {'download'|'read'|'save'} StepKey */
  /** @typedef {'waiting'|'running'|'done'|'failed'|'notStarted'} StepState */
  /** @type {{ key: StepKey, state: StepState, text: string }[]} */
  let steps = $state([]);
  /** @type {'running'|'failed'} */
  let phase = $state('running');
  let cancelled = false;
  let saving = $state(false);
  let busy = $state(false);
  // The values handed over when the screen opened: the credentials are kept
  // for "Réessayer" only and forgotten with the screen; a picked file stays
  // in the app's cache until the screen closes.
  // svelte-ignore state_referenced_locally
  let credentials = { user, password };
  // svelte-ignore state_referenced_locally
  const fromFile = source === 'file';
  // svelte-ignore state_referenced_locally
  let path = picked;

  onDestroy(() => {
    // Left with Back: stops like "Annuler l'import" (not once saving began).
    cancelled = true;
    credentials = { user: '', password: '' };
    discard();
  });

  function discard() {
    if (path) OpenDivesCore.discardImport({ path }).catch(() => {});
    path = '';
  }

  /** @param {StepKey} key @param {StepState} state @param {string} [text] */
  function set(key, state, text = '') {
    steps = steps.map((s) => (s.key === key ? { key, state, text } : s));
  }

  /** @param {string} code @param {StepKey} step */
  function message(code, step) {
    if (code === 'NETWORK' || code === 'NETWORK_LOST') return t('importProgress.offline');
    if (code === 'WRITE_LOCKED') return t('notAvailable.createLocked');
    if (step === 'download') return t('importProgress.downloadFailed');
    if (step === 'read') return fromFile ? t('importProgress.fileFailed') : t('importProgress.readFailed');
    return t('importProgress.saveFailed');
  }

  async function run() {
    phase = 'running';
    cancelled = false;
    /** @type {{ key: StepKey, state: StepState, text: string }[]} */
    const all = [
      { key: 'download', state: 'running', text: '' },
      { key: 'read', state: fromFile ? 'running' : 'waiting', text: fromFile ? '' : t('importProgress.waiting') },
      { key: 'save', state: 'waiting', text: t('importProgress.waiting') },
    ];
    steps = fromFile ? all.slice(1) : all;
    /** @type {StepKey} */
    let current = fromFile ? 'read' : 'download';
    try {
      if (!fromFile) {
        const downloaded = await OpenDivesCore.divelogsDownload(credentials);
        path = downloaded.path;
        if (cancelled) return stop();
        set('download', 'done', t('importProgress.received', { n: downloaded.dives }));
        current = 'read';
        set('read', 'running');
      }
      const read = path ? await OpenDivesCore.importCount({ path }) : { dives: 0 };
      if (cancelled) return stop();
      set('read', 'done', t('importProgress.read', { n: read.dives }));

      current = 'save';
      saving = true;
      set('save', 'running');
      const result = path
        ? await OpenDivesCore.createLog({ source: 'import', path })
        : await OpenDivesCore.createLog({ source: 'empty' });
      path = '';
      set('save', 'done');
      console.info('First logbook created, dives imported:', result.imported);
      credentials = { user: '', password: '' };
      finishAccount(f7router, welcome);
    } catch (e) {
      const code = errorCode(e);
      // A downloaded file is fetched again by "Réessayer"; a picked one is kept.
      if (!fromFile) discard();
      const order = ['download', 'read', 'save'];
      steps = steps.map((s) =>
        s.key === current
          ? { ...s, state: 'failed', text: message(code, current) }
          : order.indexOf(s.key) > order.indexOf(current)
            ? { ...s, state: 'notStarted', text: t('importProgress.notStarted') }
            : s,
      );
      phase = 'failed';
    } finally {
      saving = false;
    }
  }

  /** Cancelled: nothing was sent; back to the choices of step 2. */
  function stop() {
    discard();
    if (String(f7router.currentRoute?.path ?? '').endsWith('/importing/')) f7router.back();
  }

  async function emptyLogbook() {
    busy = true;
    try {
      await OpenDivesCore.createLog({ source: 'empty' });
      finishAccount(f7router, welcome);
    } catch (e) {
      showFailure(errorCode(e));
    } finally {
      busy = false;
    }
  }

  run();
</script>

<EditorialPage class="od-import-progress"
  title={t('createAccount.title')}
  step={t('createAccount.step2')}
  heading={phase === 'failed' ? t('importProgress.failedTitle') : t('importProgress.title')}
  intro={phase === 'failed' ? t('importProgress.failedText') : t('importProgress.text')}
  action={phase === 'failed' ? t('importProgress.retry') : ''}
  {busy}
  onaction={run}
  secondary={phase === 'failed'
    ? { label: ios ? t('importProgress.emptyLong') : t('importProgress.empty'), onclick: emptyLogbook, disabled: busy }
    : {
        label: t('importProgress.cancel'),
        onclick: () => {
          cancelled = true;
        },
        disabled: saving,
      }}
  secondaryEnd
  closable={false}
>
  <ol class="od-import-progress--steps" aria-label={t('importProgress.stepsLabel')}>
    {#each steps as step (step.key)}
      <li class="od-import-progress--state-{step.state}">
        <span class="od-import-progress--mark" aria-hidden="true">
          {#if step.state === 'done'}
            <span class="od-import-progress--done"><Icon name="check" size={18} weight={2.2} /></span>
          {:else if step.state === 'running'}
            {#if ios}<span class="od-import-progress--spinner"></span>{:else}<LoadingIndicator size={24} label={t('importProgress.running')} />{/if}
          {:else if step.state === 'failed'}
            <span class="od-import-progress--failed"><Icon name="error" /></span>
          {:else}
            <svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" /></svg>
          {/if}
        </span>
        <span class="od-import-progress--text">
          <span class="od-import-progress--label">{t(`importProgress.steps.${step.key}`)}</span>
          {#if step.text || step.state === 'running'}
            <span class="od-import-progress--detail">{step.text || t('importProgress.running')}</span>
          {/if}
        </span>
      </li>
    {/each}
  </ol>
</EditorialPage>

<style>
  @layer od.components {
    .od-import-progress--steps {
      list-style: none;
      margin: 16px 0 0;
      padding: 0;

      :global(.ios) & {
        margin: 20px 16px 0;
        border-radius: 20px;
        overflow: hidden;
        background: var(--od-surface);
      }
    }

    li {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      padding: 12px 24px 12px 16px;

      :global(.ios) & {
        padding: 12px 16px;

        & + li {
          box-shadow: inset 0 0.5px 0 var(--od-separator);
        }
      }
    }

    .od-import-progress--mark {
      flex: none;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;

      svg circle {
        fill: none;
        stroke: var(--od-text-2);
        stroke-width: 1.6;
        stroke-dasharray: 2.5 2.5;
      }
    }

    .od-import-progress--done {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--od-surface-2);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-import-progress--failed {
      display: flex;
      color: var(--od-alarm);
    }

    .od-import-progress--spinner {
      width: 20px;
      height: 20px;
      border: 2.5px solid var(--od-text);
      border-right-color: transparent;
      border-radius: 50%;
      box-sizing: border-box;
      animation: od-step-spin 0.9s linear infinite;
    }

    @keyframes od-step-spin {
      to {
        transform: rotate(360deg);
      }
    }

    .od-import-progress--text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-import-progress--label {
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .od-import-progress--detail {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      .od-import-progress--state-failed & {
        color: var(--od-alarm);
      }

      :global(.ios) & {
        font-size: 15px;
      }
    }
  }
</style>
