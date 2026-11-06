<script>
  // @ts-check
  // Account screen (docs/mockups/compte-*.dc.html; docs/agent-inbox.md, task
  // 2026-11-06-02): the Subsurface cloud account, or the choices to get one.
  // Change password, sign out, delete, create and sign in are shown but not
  // wired yet: their behaviour in Subsurface is still to be checked.
  import { Page, Navbar, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import { logbook, setAutoSync, signOut, syncNow } from '../lib/logbook.svelte.js';
  import { showSection } from '../lib/navigation.svelte.js';
  import { formatDateTime, formatNumber, formatTimeOfDay } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  const signedIn = $derived(!!logbook.email);
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
    const text = pending ? t('signOut.textPending', { n: pending }) : t('signOut.textNone');
    const content = `
      <p class="od-signout-text">${escape(text)}</p>
      <label class="od-signout-copy${pending ? ' disabled' : ''}">
        <span class="checkbox"><input type="checkbox"${pending ? ' disabled' : ''}><i class="icon-checkbox"></i></span>
        <span>${escape(t('signOut.deleteCopy'))}${pending ? `<span class="od-signout-hint">${escape(t('signOut.deleteCopyHint'))}</span>` : ''}</span>
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
    f7.dialog.create({ title: t('signOut.title'), content, buttons, verticalButtons: pending > 0, cssClass: 'od-signout' }).open();
  }

  /** @param {boolean} deleteCopy */
  async function runSignOut(deleteCopy) {
    try {
      await signOut({ deleteCopy });
      showSection('logbook');
    } catch (err) {
      console.error('Signing out', err);
      f7.toast.create({ text: t('signOut.failed'), closeTimeout: 3000, position: 'center' }).open();
    }
  }

  async function syncThenSignOut() {
    await syncNow();
    if (logbook.pending > 0) {
      f7.toast.create({ text: t('signOut.syncFailed'), closeTimeout: 3000, position: 'center' }).open();
      return;
    }
    await runSignOut(false);
  }

  /** Actions whose behaviour in Subsurface is still to be checked. */
  function notAvailable(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    f7.toast.create({ text: t('account.notAvailable'), closeTimeout: 2500, position: 'center' }).open();
  }
</script>

<Page>
  <Navbar large title={t('account.title')}>
    {#snippet left()}<MenuButton />{/snippet}
  </Navbar>

  {#if signedIn}
    <div class="identity">
      <span class="avatar"><Icon name="account" size={28} /></span>
      <span class="text">
        <span class="name">{logbook.email}</span>
        <span class="status"><Icon name="cloud" size={16} />{t('account.verified')}</span>
      </span>
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
                <div class="item-after od-value" class:pending={logbook.pending > 0}>{formatNumber(logbook.pending)}</div>
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
              <div class="item-title">{t('account.cloudDives')}</div>
              <div class="item-after od-value">{formatNumber(count)}</div>
            </div>
          </div>
        </li>
        <li class="sync-now">
          <button type="button" class="od-tonal-button" disabled={logbook.loading} onclick={() => syncNow()}>{t('account.syncNow')}</button>
        </li>
      </ul>
    </div>

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

    <div class="block-title">{t('account.leaveGroup')}</div>
    <!-- Leaving the account: buttons, each with its consequence (spec, section 4). -->
    <div class="leave">
      <button type="button" class="od-outlined-button" onclick={confirmSignOut}>{t('account.signOut')}</button>
      <span class="consequence">{t('account.signOutText')}</span>
    </div>
    <div class="leave">
      <button type="button" class="od-outlined-button danger" onclick={() => f7.views.current?.router.navigate('/account/delete/')}>
        {t('account.delete')}
      </button>
      <span class="consequence">{t('account.deleteText')}</span>
    </div>

    {#if serverCaption}<p class="caption">{serverCaption}</p>{/if}
  {:else}
    <div class="identity">
      <span class="avatar"><Icon name="device" size={26} /></span>
      <span class="text">
        <span class="name">{t('account.noAccount')}</span>
        <span class="status">{t('account.deviceDives', { n: count })}</span>
      </span>
    </div>
    <p class="pitch">{t('account.pitch')}</p>
    <div class="choices">
      <a href="#create" class="choice primary external" role="button" onclick={notAvailable}>
        <span class="label">{t('account.create')}</span>
        <span class="consequence">{t('account.createText', { n: count })}</span>
      </a>
      <a href="#sign-in" class="choice external" role="button" onclick={notAvailable}>
        <span class="label">{t('account.signIn')}</span>
        <span class="consequence">{t('account.signInText', { n: count })}</span>
      </a>
    </div>
  {/if}
</Page>

<style>
  @layer od.components {
    .identity {
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

    .avatar {
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

    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .name {
      font-size: 17px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .status {
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
    .sync-now {
      padding: 12px 16px 14px;
      display: flex;
      justify-content: center;
    }

    .pending {
      color: var(--od-pending);
    }

    /* Sign-out dialog (outside this page in the document): fully global selectors. */
    :global(.od-signout .od-signout-text) {
      margin: 0 0 12px;
    }

    :global(.od-signout .od-signout-copy) {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      text-align: start;
    }

    /* The check box keeps its 18 dp: never shrunk by the text beside it. */
    :global(.od-signout .od-signout-copy .checkbox) {
      flex: none;
      margin-top: 2px;
    }

    :global(.od-signout .od-signout-copy.disabled) {
      opacity: 0.55;
    }

    :global(.od-signout .od-signout-hint) {
      display: block;
      font-size: 13px;
      color: var(--od-text-2);
    }

    .leave {
      margin: 0 16px 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;

      .consequence {
        max-width: 300px;
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
        text-align: center;
      }
    }

    .caption {
      margin: 14px 20px 24px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .pitch {
      margin: 18px 20px 0;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .choices {
      margin: 16px 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .choice {
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

      &.primary {
        border-color: var(--od-primary-action);
        background: var(--od-primary-action);
        color: var(--od-on-primary-action);

        .consequence {
          color: inherit;
          opacity: 0.85;
        }
      }
    }

    .label {
      font-size: 17px;
      font-weight: 700;
    }

    .consequence {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }
  }
</style>
