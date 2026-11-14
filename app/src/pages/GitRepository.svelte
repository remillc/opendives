<script>
  // @ts-check
  // "Dépôt git" (docs/mockups/git-config-android.dc.html,
  // git-config-adresse-android.dc.html, git-config-erreur-android.dc.html;
  // spec, section 4, "Own git repository instead of the cloud"): the logbook
  // in the user's own git repository, in the editorial layout of the account
  // flow (EditorialPage): the fields in its card, "Connecter" its main action.
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
  import { showSnackbar } from '../lib/snackbar.js';
  import { onMount } from 'svelte';
  import AccountField from '../components/AccountField.svelte';
  import EditorialPage from '../components/EditorialPage.svelte';
  import SelectField from '../components/SelectField.svelte';
  import Icon from '../components/Icon.svelte';
  import { errorCode } from '../lib/account.js';
  import { normaliseGitUrl, validGitToken, validGitUsername } from '../lib/account-validation.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { accountReady, logbook, repositoryChanged, syncNow } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean, edit?: boolean }} */
  let { f7router, welcome = false, edit = false } = $props();


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
  // The form of each field is checked as the diver types (lib/account-validation.js); what
  // only the server knows (the repository exists, the token is accepted) comes after.
  const addressLive = liveError(
    () => url,
    (text) => (!/^https:\/\//i.test(text.trim()) ? t('gitRepo.addressNotHttps') : normaliseGitUrl(text) ? '' : t('gitRepo.addressInvalid')),
  );
  const addressShown = $derived(addressError || addressLive.error);
  const usernameLive = liveError(() => username, (text) => (validGitUsername(text.trim()) ? '' : t('gitRepo.usernameInvalid')));
  const usernameError = $derived(usernameLive.error);
  const tokenLive = liveError(() => token, (text) => (validGitToken(text.trim()) ? '' : t('gitRepo.tokenInvalid')));
  const tokenError = $derived(accessState === 'denied' ? t('gitRepo.tokenDenied') : tokenLive.error);
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
    if (!name || !validGitUsername(name) || (secret ? !validGitToken(secret) : !edit)) return;
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
      // "owner/repository", from the address that was just accepted.
      const repository = new URL(url.trim()).pathname.replace(/^\/|\.git$|\/$/g, '');
      showSnackbar(t('gitRepo.connected', { repository }));
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

<EditorialPage class="od-git-repository"
  title={t('gitRepo.title')}
  heading={t('gitRepo.heading')}
  intro={t('gitRepo.intro')}
  action={t('gitRepo.connect')}
  busyLabel={t('gitRepo.connecting')}
  {busy}
  actionDisabled={!canConnect}
  onaction={connect}
>
  <AccountField
    label={t('gitRepo.address')}
    rowLabel={t('gitRepo.address')}
    bind:value={url}
    error={addressShown}
    disabled={busy}
    position="single"
    onchange={checkAddress}
  />
  {#if addressState === 'checking'}
    <p class="od-git-repository--status">{t('gitRepo.addressChecking')}</p>
  {:else if addressState === 'public' || addressState === 'publicEmpty'}
    <p class="od-git-repository--status od-git-repository--ok"><Icon name="check" size={16} />{t(addressState === 'public' ? 'gitRepo.addressPublic' : 'gitRepo.addressPublicEmpty')}</p>
  {:else if addressState === 'private'}
    <p class="od-git-repository--status"><Icon name="info" size={16} />{t('gitRepo.addressPrivate')}</p>
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
  <a href="/git/token" class="od-git-repository--help" onclick={openHelp}>{t('gitRepo.tokenHow')}</a>

  <SelectField
    label={t('gitRepo.branch')}
    bind:value={branch}
    options={branches.map((b) => ({ value: b, label: b }))}
    supporting={branchHelper}
    disabled={accessState !== 'ok' || busy}
  />

  {#if formError}<p class="od-git-repository--form-error" role="alert"><Icon name="error" size={18} />{formError}</p>{/if}

  <p class="od-git-repository--note">{t('gitRepo.note')}</p>
</EditorialPage>

<style>
  @layer od.components {
    .od-git-repository--status {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      gap: 6px;

      /* The one green of the theme (the check mark of a found repository). */
      &.od-git-repository--ok :global(svg) {
        color: var(--od-oxygen);
      }

      :global(.ios) & {
        margin: 4px 32px 0;
      }
    }

    .od-git-repository--help {
      margin: 8px 0 0;
      padding: 8px 16px;
      display: inline-block;
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text);
      text-decoration: underline;

      :global(.ios) & {
        margin: 8px 16px 0;
        padding: 8px 0;
      }
    }

    .od-git-repository--form-error {
      margin: 16px 16px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-alarm);
      display: flex;
      align-items: flex-start;
      gap: 8px;

      :global(.ios) & {
        margin: 16px 24px 0;
      }
    }

    /* The note: plain text, no background. */
    .od-git-repository--note {
      margin: 16px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);

      :global(.ios) & {
        margin: 24px 24px 0;
      }
    }
  }
</style>
