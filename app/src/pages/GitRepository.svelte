<script>
  // @ts-check
  // "Dépôt git" (docs/mockups/git-config-android.dc.html,
  // git-config-adresse-android.dc.html, git-config-erreur-android.dc.html;
  // spec, section 4, "Own git repository instead of the cloud"): the logbook
  // in the user's own git repository. Full screen: X, title, "Connecter".
  // - When the address field loses its focus, the server is asked for the
  //   references of the repository (git ls-remote): found / private or missing
  //   / no git answer.
  // - With the user name and the token, the same question authenticated (as
  //   for a push) confirms the repository and the right to write, and lists
  //   the branches; refused: the token field is in error. An empty repository
  //   offers "main". The branch list is dimmed until then.
  // - Opened from Account ("Modifier le dépôt"), the fields hold the
  //   connected repository; the token stays empty to keep the saved one.
  // The token stays in this field: it is only passed to the plugin, never
  // kept, stored or logged here.
  import { OpenDivesCore } from 'opendives-core';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { onMount } from 'svelte';
  import AccountField from '../components/AccountField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import Icon from '../components/Icon.svelte';
  import { errorCode } from '../lib/account.js';
  import { accountReady, logbook, repositoryChanged, syncNow } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean, edit?: boolean }} */
  let { f7router, welcome = false, edit = false } = $props();

  const ios = f7.theme === 'ios';
  const USERNAME = /^[A-Za-z0-9._-]+$/;

  let url = $state('');
  let username = $state('');
  let token = $state('');
  let branch = $state('');
  /** @type {string[]} */
  let branches = $state([]);
  let emptyRepo = $state(false);
  /** The branch of the connected repository, preselected when editing. */
  let currentBranch = '';

  let addressState = $state(/** @type {'idle'|'checking'|'public'|'publicEmpty'|'private'|'none'|'notHttps'|'invalid'} */ ('idle'));
  let accessState = $state(/** @type {'idle'|'checking'|'ok'|'denied'} */ ('idle'));
  let formError = $state('');
  let busy = $state(false);
  /** Increases at each question, so that an answer that arrives late is ignored. */
  let ticket = 0;

  const addressFailed = $derived(addressState === 'none' || addressState === 'notHttps' || addressState === 'invalid');
  const addressError = $derived(
    addressState === 'none'
      ? t('gitRepo.addressNone')
      : addressState === 'notHttps'
        ? t('gitRepo.addressNotHttps')
        : addressState === 'invalid'
          ? t('gitRepo.addressInvalid')
          : '',
  );
  const usernameError = $derived(username && !USERNAME.test(username.trim()) ? t('gitRepo.usernameInvalid') : '');
  const tokenError = $derived(accessState === 'denied' ? t('gitRepo.tokenDenied') : '');
  const canConnect = $derived(accessState === 'ok' && !!branch && !busy);

  /** The address field lost its focus (or was filled): the anonymous question. */
  async function checkAddress() {
    const mine = ++ticket;
    resetAccess();
    const address = url.trim();
    if (!address) {
      addressState = 'idle';
      return;
    }
    if (!/^https:\/\//i.test(address)) {
      addressState = 'notHttps';
      return;
    }
    addressState = 'checking';
    try {
      const found = await OpenDivesCore.gitCheck({ url: address });
      if (mine !== ticket) return;
      addressState =
        found.status === 'public' ? (found.empty ? 'publicEmpty' : 'public') : found.status === 'auth' ? 'private' : 'none';
    } catch (e) {
      if (mine !== ticket) return;
      addressState = errorCode(e) === 'BAD_ADDRESS' ? 'invalid' : 'none';
    }
    if (!addressFailed) await checkAccess();
  }

  /** Address, user name or token changed: the access has to be checked again. */
  function resetAccess() {
    accessState = 'idle';
    branches = [];
    emptyRepo = false;
    branch = '';
    formError = '';
  }

  /**
   * The authenticated question, once the address holds a repository, and the
   * user name and the token are there: confirms the access and lists the
   * branches.
   */
  async function checkAccess() {
    resetAccess();
    const name = username.trim();
    const secret = token.trim();
    if (addressFailed || addressState === 'idle' || addressState === 'checking') return;
    if (!name || !USERNAME.test(name) || (!secret && !edit)) return;
    const mine = ++ticket;
    accessState = 'checking';
    try {
      const found = await OpenDivesCore.gitCheck({ url: url.trim(), username: name, token: secret, useStored: edit && !secret });
      if (mine !== ticket) return;
      if (found.status === 'ok') {
        emptyRepo = found.empty;
        branches = found.empty ? ['main'] : found.branches;
        branch = branches.includes(currentBranch) ? currentBranch : branches.includes('main') ? 'main' : (branches[0] ?? '');
        accessState = 'ok';
      } else if (found.status === 'denied') {
        accessState = 'denied';
      } else {
        accessState = 'idle';
        addressState = 'none';
      }
    } catch (e) {
      if (mine !== ticket) return;
      accessState = 'idle';
      formError = errorCode(e) === 'BAD_CREDENTIALS' ? t('gitRepo.tokenDenied') : t('gitRepo.errorNetwork');
    }
  }

  async function connect() {
    if (!canConnect) return;
    if (edit && logbook.pending > 0) {
      await syncNow();
      if (logbook.pending > 0) {
        formError = t('gitRepo.pending');
        return;
      }
    }
    busy = true;
    formError = '';
    try {
      await OpenDivesCore.gitConnect({ url: url.trim(), username: username.trim(), token: token.trim(), branch, empty: emptyRepo });
      token = '';
      if (edit) {
        f7router.back(f7router.history[0], { force: true });
        repositoryChanged();
      } else {
        accountReady();
      }
    } catch (e) {
      const code = errorCode(e);
      if (code === 'DENIED') accessState = 'denied';
      else if (code === 'NETWORK') formError = t('gitRepo.errorNetwork');
      else if (code === 'NO_LOG' || code === 'LOG_EXISTS' || code === 'NOT_EMPTY') {
        formError = t('gitRepo.errorNoLog');
        accessState = 'idle';
      } else formError = t('gitRepo.errorFailed');
    } finally {
      busy = false;
    }
  }

  /** @param {MouseEvent} e */
  function openHelp(e) {
    e.preventDefault();
    f7router.navigate(`${welcome ? '/welcome' : '/account'}/git/token`);
  }

  onMount(async () => {
    if (!edit) return;
    try {
      const saved = await OpenDivesCore.gitConfig();
      url = saved.url;
      username = saved.username;
      currentBranch = saved.branch;
      await checkAddress();
    } catch (e) {
      console.error('Reading the connected repository', e);
    }
  });

  const branchList = $derived(branches.join(', '));
  const branchHelper = $derived(
    accessState !== 'ok'
      ? t('gitRepo.branchWaiting')
      : emptyRepo
        ? t('gitRepo.branchEmpty', { name: 'main' })
        : t('gitRepo.branchesRead', { n: branches.length, list: branchList }),
  );
</script>

<Page class="od-git-repository">
  <Navbar title={t('gitRepo.title')}>
    {#snippet left()}
      {#if ios}
        <Link back>{t('accountStep.cancel')}</Link>
      {:else}
        <Link back iconOnly>
          <Icon name="close" />
          <span class="od-sr-only">{t('accountStep.close')}</span>
        </Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <button type="button" class="od-text-button connect" disabled={!canConnect} aria-busy={busy} onclick={connect}>
        {busy ? t('gitRepo.connecting') : t('gitRepo.connect')}
      </button>
    {/snippet}
  </Navbar>

  {#if busy && !ios}
    <div class="linear" role="progressbar" aria-label={t('gitRepo.connecting')}><span></span></div>
  {/if}

  <form class="body" novalidate onsubmit={(e) => e.preventDefault()}>
    <p class="intro">{t('gitRepo.intro')}</p>

    <div class="fields">
      <AccountField
        label={t('gitRepo.address')}
        rowLabel={t('gitRepo.address')}
        bind:value={url}
        error={addressError}
        disabled={busy}
        position="single"
        onchange={checkAddress}
      />
      {#if addressState === 'checking'}
        <p class="status">{t('gitRepo.addressChecking')}</p>
      {:else if addressState === 'public' || addressState === 'publicEmpty'}
        <p class="status ok"><Icon name="check" size={16} />{t(addressState === 'public' ? 'gitRepo.addressPublic' : 'gitRepo.addressPublicEmpty')}</p>
      {:else if addressState === 'private'}
        <p class="status"><Icon name="info" size={16} />{t('gitRepo.addressPrivate')}</p>
      {/if}

      <AccountField
        label={t('gitRepo.username')}
        rowLabel={t('gitRepo.username')}
        autocomplete="username"
        bind:value={username}
        error={usernameError}
        disabled={busy}
        position="first"
        onchange={checkAccess}
      />
      <AccountField
        label={t('gitRepo.token')}
        rowLabel={t('gitRepo.token')}
        type="password"
        autocomplete="off"
        bind:value={token}
        supporting={accessState === 'checking' ? t('gitRepo.tokenChecking') : edit ? t('gitRepo.tokenKeep') : t('gitRepo.tokenHelper')}
        error={tokenError}
        disabled={busy}
        position="last"
        onchange={checkAccess}
      />
      <a href="/git/token" class="help" onclick={openHelp}>{t('gitRepo.tokenHow')}</a>

      <SelectField
        label={t('gitRepo.branch')}
        bind:value={branch}
        options={branches.map((b) => ({ value: b, label: b }))}
        supporting={branchHelper}
        disabled={accessState !== 'ok' || busy}
      />
    </div>

    {#if formError}<p class="form-error" role="alert"><Icon name="error" size={18} />{formError}</p>{/if}

    <p class="note">{t('gitRepo.note')}</p>
  </form>
</Page>

<style>
  @layer od.components {
    .body {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      padding-bottom: calc(var(--f7-safe-area-bottom) + 24px);
    }

    .intro {
      margin: 8px 24px 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);

      :global(.ios) & {
        margin: 16px 32px 0;
        font-size: 15px;
        line-height: 21px;
        letter-spacing: 0;
      }
    }

    .fields {
      margin-top: 6px;
    }

    /* "Connecter" in the top bar, at the end. */
    .connect {
      margin-right: 4px;
    }

    .connect:disabled {
      color: color-mix(in srgb, var(--od-text) 38%, transparent);
    }

    .status {
      margin: 4px 32px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      gap: 6px;

      /* The one green of the theme (the check mark of a found repository). */
      &.ok :global(svg) {
        color: var(--od-oxygen);
      }
    }

    .help {
      margin: 8px 16px 0;
      padding: 8px 0;
      display: inline-block;
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text);
      text-decoration: underline;
    }

    .form-error {
      margin: 16px 24px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-alarm);
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .note {
      margin: 24px 24px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    /* MD3 linear progress indicator, indeterminate, under the top bar. */
    .linear {
      position: absolute;
      z-index: 600;
      left: 0;
      right: 0;
      top: calc(var(--f7-safe-area-top) + var(--f7-navbar-height));
      height: 4px;
      overflow: hidden;
      background: var(--od-separator);

      span {
        position: absolute;
        top: 0;
        width: 40%;
        height: 4px;
        border-radius: 2px;
        background: var(--od-primary-action);
        animation: od-git-linear 1.4s linear infinite;
      }
    }

    @keyframes od-git-linear {
      from {
        left: -40%;
      }

      to {
        left: 100%;
      }
    }
  }
</style>
