<script>
  // @ts-check
  import { addDeviceDives } from '../lib/account.js';
  // Account screen (docs/mockups/compte-*.dc.html; docs/agent-inbox.md, task
  // 2026-11-06-02): the Subsurface cloud account, or the choices to get one.
  // Change password is shown but not wired yet. Create and sign in open the
  // screens of first launch, whose actions are not built yet.
  import { Page, Navbar, f7 } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import Icon from '../components/Icon.svelte';
  import SyncControl from '../components/SyncControl.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { logbook, setAutoSync, signOut, syncNow, deviceDiveCount } from '../lib/logbook.svelte.js';
  import { showSection } from '../lib/navigation.svelte.js';
  import { formatDateTime, formatNumber, formatTimeOfDay } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  const signedIn = $derived(!!logbook.email);
  /** The logbook lives in the user's own git repository, not in the Subsurface cloud. */
  const git = $derived(logbook.mode === 'git');

  /** Branch of the connected repository (never its token). */
  let gitBranch = $state('');
  $effect(() => {
    if (!git) return;
    OpenDivesCore.gitConfig().then(
      (saved) => (gitBranch = saved.branch),
      (e) => console.error('Reading the connected repository', e),
    );
  });
  /** "owner/name", then "host · branch main" (spec, section 4, Compte in git mode). */
  const gitName = $derived(logbook.repository.split('/').slice(1).join('/').replace(/\.git$/, ''));
  const gitHost = $derived(logbook.repository.split('/')[0]);

  /** Dives logged on this device without an account, which the account can take (0: none). */
  let deviceCount = $state(0);
  $effect(() => {
    if (signedIn && !logbook.loading) deviceDiveCount().then((n) => (deviceCount = n));
  });
  const count = $derived(logbook.dives.length);

  /** "today, 06:58", or the full date for an older sync. */
  const lastSync = $derived.by(() => {
    if (!logbook.lastSync) return t('account.lastSyncNever');
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return logbook.lastSync.startsWith(today)
      ? t('account.todayAt', { time: formatTimeOfDay(logbook.lastSync) })
      : formatDateTime(logbook.lastSync);
  });

  /** "Connected through the Europe server (ssrf-cloud-eu)": the host actually in use. */
  const serverCaption = $derived.by(() => {
    if (!logbook.server) return '';
    const host = logbook.server.split('.')[0];
    const code = host.match(/^ssrf-cloud-(\w+)$/)?.[1];
    const region = code ? tIfExists(`account.regions.${code}`) : undefined;
    return region ? t('account.server', { region, host }) : t('account.serverHost', { host });
  });

  /** @param {string} s */
  const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

  /**
   * "Sign out" (spec, section 4): always confirmed. With changes not sent, the
   * dialog says so and offers to sync first; deleting the device copy is only
   * possible once everything is sent.
   * @param {MouseEvent} e
   */
  function confirmSignOut(e) {
    e?.preventDefault();
    const pending = logbook.pending;
    const text = pending ? t(git ? 'signOut.textPendingGit' : 'signOut.textPending', { n: pending }) : t(git ? 'signOut.textNoneGit' : 'signOut.textNone');
    const content = `
      <p class="od-account--signout-text">${escape(text)}</p>
      <label class="od-account--signout-copy${pending ? ' disabled' : ''}">
        <span class="checkbox"><input type="checkbox"${pending ? ' disabled' : ''}><i class="icon-checkbox"></i></span>
        <span>${escape(t('signOut.deleteCopy'))}${pending ? `<span class="od-account--signout-hint">${escape(t('signOut.deleteCopyHint'))}</span>` : ''}</span>
      </label>`;
    /** @param {any} dialog */
    const deleteCopy = (dialog) => !pending && dialog.$el.find('input[type="checkbox"]')[0]?.checked === true;
    const buttons = pending
      ? [
          { text: t('signOut.syncThenSignOut'), bold: true, onClick: () => syncThenSignOut() },
          { text: t('signOut.signOutAnyway'), onClick: () => runSignOut(false) },
          { text: t('signOut.cancel') },
        ]
      : [
          { text: t('signOut.cancel') },
          { text: t('signOut.confirm'), bold: true, onClick: (/** @type {any} */ dialog) => runSignOut(deleteCopy(dialog)) },
        ];
    f7.dialog.create({ title: t(git ? 'signOut.titleGit' : 'signOut.title'), content, buttons, verticalButtons: pending > 0, cssClass: 'od-account--signout' }).open();
  }

  /** @param {boolean} deleteCopy */
  async function runSignOut(deleteCopy) {
    try {
      await signOut({ deleteCopy });
      showSection('logbook');
    } catch (err) {
      console.error('Signing out', err);
      showSnackbar(t('signOut.failed'));
    }
  }

  async function syncThenSignOut() {
    await syncNow();
    if (logbook.pending > 0) {
      showSnackbar(t('signOut.syncFailed'));
      return;
    }
    await runSignOut(false);
  }

  /** Actions whose behaviour in Subsurface is still to be checked. */
  function notAvailable(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    showSnackbar(t('account.notAvailable'));
  }
</script>

<Page class="od-account">
  <Navbar class="od-band-bar" title={t('account.title')}>
    {#snippet left()}<MenuButton />{/snippet}
  </Navbar>

  <SectionBand summary={t(signedIn ? (git ? 'account.bandGit' : 'account.bandSignedIn') : 'account.bandNone')} />

  {#if signedIn}
    <div class="od-account--identity">
      {#if git}
        <span class="od-account--avatar"><Icon name="git" size={28} /></span>
        <span class="od-account--text">
          <span class="od-account--name">{gitName}</span>
          <span class="od-account--status">{t('account.gitCaption', { host: gitHost, branch: gitBranch })}</span>
        </span>
      {:else}
        <span class="od-account--avatar"><Icon name="account" size={28} /></span>
        <span class="od-account--text">
          <span class="od-account--name">{logbook.email}</span>
          <span class="od-account--status"><Icon name="cloud" size={16} />{t('account.verified')}</span>
        </span>
      {/if}
    </div>

    <div class="block-title">{t('account.syncGroup')}</div>
    <div class="list list-strong inset list-dividers">
      <ul>
        <li>
          <label class="item-content">
            <div class="item-inner">
              <div class="item-title">
                {t('account.autoSync')}
                <div class="item-footer">{t(logbook.autoSync ? 'account.autoSyncText' : 'account.autoSyncOff')}</div>
              </div>
              <div class="item-after">
                <span class="toggle">
                  <input type="checkbox" checked={logbook.autoSync} onchange={(e) => setAutoSync(e.currentTarget.checked)} />
                  <span class="toggle-icon"></span>
                </span>
              </div>
            </div>
          </label>
        </li>
        {#if !logbook.autoSync}
          <li>
            <div class="item-content">
              <div class="item-inner">
                <div class="item-title">{t('account.pending')}</div>
                <div class="item-after od-value" class:od-account--pending={logbook.pending > 0}>{formatNumber(logbook.pending)}</div>
              </div>
            </div>
          </li>
        {/if}
        <li>
          <div class="item-content">
            <div class="item-inner">
              <div class="item-title">{t('account.lastSync')}</div>
              <div class="item-after od-value">{lastSync}</div>
            </div>
          </div>
        </li>
        <li>
          <div class="item-content">
            <div class="item-inner">
              <div class="item-title">{t(git ? 'account.gitDives' : 'account.cloudDives')}</div>
              <div class="item-after od-value">{formatNumber(count)}</div>
            </div>
          </div>
        </li>
        {#if deviceCount}
          <li>
            <a href="#device-dives" class="item-link item-content external" role="button" onclick={(e) => { e.preventDefault(); addDeviceDives(); }}>
              <div class="item-inner">
                <div class="item-title">
                  {t('account.addDeviceDives')}
                  <div class="item-footer">{t('account.addDeviceDivesText', { n: deviceCount })}</div>
                </div>
              </div>
            </a>
          </li>
        {/if}
        <li class="od-account--sync-now">
          <SyncControl />
        </li>
      </ul>
    </div>

    {#if git}
      <div class="block-title">{t('account.gitGroup')}</div>
      <div class="list list-strong inset list-dividers">
        <ul>
          <li>
            <a href="/account/git" class="item-link item-content" role="button">
              <div class="item-inner">
                <div class="item-title">
                  {t('account.gitEdit')}
                  <div class="item-footer">{t('account.gitEditText')}</div>
                </div>
              </div>
            </a>
          </li>
        </ul>
      </div>
    {:else}
      <div class="block-title">{t('account.subsurfaceGroup')}</div>
      <div class="list list-strong inset list-dividers">
        <ul>
          <li>
            <a href="#password" class="item-link item-content external" role="button" onclick={notAvailable}>
              <div class="item-inner">
                <div class="item-title">
                  {t('account.changePassword')}
                  <div class="item-footer">{t('account.changePasswordText')}</div>
                </div>
              </div>
            </a>
          </li>
        </ul>
      </div>
    {/if}

    <div class="block-title">{t('account.leaveGroup')}</div>
    <!-- Leaving the account: buttons, each with its consequence (spec, section 4). -->
    <div class="od-account--leave">
      <button type="button" class="od-outlined-button" onclick={confirmSignOut}>{t(git ? 'account.gitSignOut' : 'account.signOut')}</button>
      <span class="od-account--consequence">{t(git ? 'account.gitSignOutText' : 'account.signOutText')}</span>
    </div>
    {#if !git}
      <div class="od-account--leave">
        <button type="button" class="od-outlined-button od-danger" onclick={() => f7.views.current?.router.navigate('/account/delete')}>
          {t('account.delete')}
        </button>
        <span class="od-account--consequence">{t('account.deleteText')}</span>
      </div>
    {/if}

    {#if serverCaption && !git}<p class="od-account--caption">{serverCaption}</p>{/if}
  {:else}
    <div class="od-account--identity">
      <span class="od-account--avatar"><Icon name="device" size={26} /></span>
      <span class="od-account--text">
        <span class="od-account--name">{t('account.noAccount')}</span>
        <span class="od-account--status">{t('account.deviceDives', { n: count })}</span>
      </span>
    </div>
    <p class="od-account--pitch">{t('account.pitch')}</p>
    <div class="od-account--choices">
      <a href="/account/create" class="od-account--choice od-account--primary">
        <span class="od-account--label">{t('account.create')}</span>
        <span class="od-account--consequence">{t('account.createText', { n: count })}</span>
      </a>
      <a href="/account/sign-in" class="od-account--choice">
        <span class="od-account--label">{t('account.signIn')}</span>
        <span class="od-account--consequence">{t('account.signInText', { n: count })}</span>
      </a>
    </div>
  {/if}
</Page>

<style>
  @layer od.components {
    .od-account--identity {
      margin: 16px 16px 0;
      padding: 16px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      gap: 14px;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .od-account--avatar {
      flex: none;
      width: 52px;
      height: 52px;
      border-radius: 26px;
      background: var(--od-surface-2);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-account--text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .od-account--name {
      font-size: 17px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .od-account--status {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .item-footer {
      white-space: normal;
    }

    /* "Sync now": a real button centred in its row (style: .od-tonal-button). */
    .od-account--sync-now {
      padding: 12px 16px 14px;
      display: flex;
      justify-content: center;
    }

    .od-account--pending {
      color: var(--od-pending);
    }

    /* Sign-out dialog (outside this page in the document): fully global selectors. */
    :global(.od-account--signout .od-account--signout-text) {
      margin: 0 0 12px;
    }

    :global(.od-account--signout .od-account--signout-copy) {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      text-align: start;
    }

    /* The check box keeps its 18 dp: never shrunk by the text beside it. */
    :global(.od-account--signout .od-account--signout-copy .checkbox) {
      flex: none;
      margin-top: 2px;
    }

    :global(.od-account--signout .od-account--signout-copy.disabled) {
      opacity: 0.55;
    }

    :global(.od-account--signout .od-account--signout-hint) {
      display: block;
      font-size: 13px;
      color: var(--od-text-2);
    }

    .od-account--leave {
      margin: 0 16px 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;

      .od-account--consequence {
        max-width: 300px;
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
        text-align: center;
      }
    }

    .od-account--caption {
      margin: 14px 20px 24px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-account--pitch {
      margin: 18px 20px 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);
    }

    .od-account--choices {
      margin: 16px 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .od-account--choice {
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--od-separator);
      background: var(--od-surface);
      color: var(--od-text);
      text-decoration: none;
      display: flex;
      flex-direction: column;
      gap: 3px;

      :global(.ios) & {
        border-radius: 10px;
      }

      &.od-account--primary {
        border-color: var(--od-primary-action);
        background: var(--od-primary-action);
        color: var(--od-on-primary-action);

        .od-account--consequence {
          color: inherit;
          opacity: 0.85;
        }
      }
    }

    .od-account--label {
      font-size: 17px;
      font-weight: 700;
    }

    .od-account--consequence {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }
  }
</style>
