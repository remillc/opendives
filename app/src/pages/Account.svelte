<script>
  // @ts-check
  // Account screen (docs/mockups/compte-*.dc.html; docs/agent-inbox.md, task
  // 2026-11-06-02): the Subsurface cloud account, or the choices to get one.
  // Change password, sign out, delete, create and sign in are shown but not
  // wired yet: their behaviour in Subsurface is still to be checked.
  import { Page, Navbar, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import { logbook, loadLogbook } from '../lib/logbook.svelte.js';
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

  // Not stored by the core yet: the app syncs at every launch for now.
  let autoSync = $state(readAutoSync());

  function readAutoSync() {
    try {
      return localStorage.getItem('od.autoSync') !== 'false';
    } catch {
      return true;
    }
  }

  function setAutoSync(/** @type {boolean} */ value) {
    autoSync = value;
    try {
      localStorage.setItem('od.autoSync', String(value));
    } catch {
      // Not fatal.
    }
  }

  function syncNow() {
    if (!logbook.loading) loadLogbook();
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
                <div class="item-footer">{t('account.autoSyncText')}</div>
              </div>
              <div class="item-after">
                <span class="toggle">
                  <input type="checkbox" checked={autoSync} onchange={(e) => setAutoSync(e.currentTarget.checked)} />
                  <span class="toggle-icon"></span>
                </span>
              </div>
            </div>
          </label>
        </li>
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
          <button type="button" disabled={logbook.loading} onclick={syncNow}>{t('account.syncNow')}</button>
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
    <div class="list list-strong inset list-dividers">
      <ul>
        <li>
          <a href="#sign-out" class="item-link item-content external no-chevron" role="button" onclick={notAvailable}>
            <div class="item-inner">
              <div class="item-title">
                {t('account.signOut')}
                <div class="item-footer">{t('account.signOutText')}</div>
              </div>
            </div>
          </a>
        </li>
        <li>
          <a href="#delete" class="item-link item-content external no-chevron" role="button" onclick={notAvailable}>
            <div class="item-inner">
              <div class="item-title">
                <span class="danger">{t('account.delete')}</span>
                <div class="item-footer">{t('account.deleteText')}</div>
              </div>
            </div>
          </a>
        </li>
      </ul>
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

    /*
     * "Sync now": a real button centred in its row. Android: MD3 tonal button
     * (40 dp, 24 dp side padding, fully rounded); iOS: 44 pt bordered button
     * with 12 pt corners.
     */
    .sync-now {
      padding: 12px 16px 14px;
      display: flex;
      justify-content: center;

      /* Framework7 stretches buttons in a list: this one keeps its own width. */
      button {
        width: auto;
        text-align: center;
        height: 40px;
        padding: 0 24px;
        border: none;
        border-radius: 20px;
        background: var(--od-tint);
        color: var(--od-on-tint);
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.1px;
        cursor: pointer;

        &:disabled {
          opacity: 0.5;
        }

        :global(.ios) & {
          height: 44px;
          border-radius: 12px;
          font-size: 17px;
          letter-spacing: 0;
        }
      }
    }

    .danger {
      color: var(--od-alarm);
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
