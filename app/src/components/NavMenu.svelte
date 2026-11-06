<script>
  // @ts-check
  // Side menu of the phone layout (spec, section 3): the four sections, then
  // Settings, then the sync status. A modal navigation drawer on Android
  // (MD3); on iOS a panel drawn for the project, as iOS has none.
  // Opens only with the ☰ button: the panel follows a swipe to close, never
  // an edge swipe to open, which stays iOS's swipe back.
  import { onDestroy } from 'svelte';
  import { Panel, f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import { logbook, syncNow } from '../lib/logbook.svelte.js';
  import { navigation, sections, showSection, closeMenu, restoreFocus } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {Record<string, 'logbook'|'sites'|'statistics'|'tools'>} */
  const icons = { logbook: 'logbook', sites: 'sites', statistics: 'statistics', tools: 'tools' };

  /** @type {HTMLElement|undefined} */
  let menu = $state();

  /** While open, the screens behind cannot be reached, by touch or by a screen reader. */
  function setBackgroundInert(/** @type {boolean} */ inert) {
    document.querySelector('.views')?.toggleAttribute('inert', inert);
  }

  function onOpen() {
    navigation.menuOpen = true;
    setBackgroundInert(true);
  }

  function onOpened() {
    menu?.querySelector(/** @type {'a'} */ ('[aria-current="page"]'))?.focus();
  }

  function onClose() {
    navigation.menuOpen = false;
    setBackgroundInert(false);
  }

  /**
   * @param {MouseEvent} e
   * @param {() => void} go
   */
  function choose(e, go) {
    e.preventDefault();
    closeMenu();
    go();
  }

  function openSettings() {
    const router = f7.views.current?.router;
    if (router && router.currentRoute?.path !== '/settings/') router.navigate('/settings/');
  }

  onDestroy(() => setBackgroundInert(false));
</script>

<Panel
  id="od-menu"
  class="od-menu"
  left
  cover
  swipe
  swipeOnlyClose
  role="dialog"
  aria-modal="true"
  aria-label={t('menu.title')}
  onPanelOpen={onOpen}
  onPanelOpened={onOpened}
  onPanelClose={onClose}
  onPanelClosed={restoreFocus}
>
  <nav class="menu" aria-label={t('menu.sections')} bind:this={menu}>
    <p class="title">{t('menu.title')}</p>
    {#each sections as section (section)}
      <a
        href="#{section}"
        class="item"
        aria-current={navigation.section === section ? 'page' : undefined}
        onclick={(e) => choose(e, () => showSection(section))}
      >
        <Icon name={icons[section]} />
        <span>{t(`tabs.${section}`)}</span>
      </a>
    {/each}
    <div class="separator" role="separator"></div>
    <a
      href="#account"
      class="item"
      aria-current={navigation.section === 'account' ? 'page' : undefined}
      onclick={(e) => choose(e, () => showSection('account'))}
    >
      <Icon name="account" />
      <span>{t('account.title')}</span>
    </a>
    <a href="#settings" class="item" onclick={(e) => choose(e, openSettings)}>
      <Icon name="settings" />
      <span>{t('settings.title')}</span>
    </a>
    <div class="spacer"></div>
    {#if !logbook.loading && !logbook.error}
      <div class="status">
        <SyncStatus sync={logbook.sync} pending={logbook.pending} live={false} />
        {#if logbook.sync === 'manual'}
          <!-- Manual synchronisation: the exchange happens only from here or Account. -->
          <button type="button" class="od-tonal-button" disabled={logbook.loading} onclick={() => syncNow()}>
            {t('account.syncNow')}
          </button>
        {/if}
      </div>
    {/if}
  </nav>
</Panel>

<style>
  @layer od.components {
    :global(.panel.od-menu) {
      --f7-panel-width: 300px;
      --f7-panel-bg-color: var(--od-drawer);
      border-radius: 0 16px 16px 0;
      box-shadow: 0 8px 30px rgb(0 0 0 / 0.18);
    }

    :global(.ios .panel.od-menu) {
      --f7-panel-bg-color: var(--od-surface);
    }

    .menu {
      min-height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-top: var(--f7-safe-area-top);
      padding-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      color: var(--od-text);
    }

    .title {
      margin: 0;
      padding: 20px 28px 18px;
      font-size: 16px;
      font-weight: 500;
      letter-spacing: 0.1px;
    }

    /* Android: MD3 drawer item, 56 dp pill. */
    .item {
      margin: 0 12px;
      min-height: 56px;
      padding: 0 16px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--od-text);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      text-decoration: none;

      &[aria-current='page'] {
        background: var(--od-tint);
        color: var(--od-on-tint);
        font-weight: 700;
      }
    }

    .separator {
      height: 1px;
      margin: 8px 28px;
      background: var(--od-separator);
    }

    .spacer {
      flex: 1;
    }

    .status {
      padding: 0 12px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;

      /* Lined up with the status text. */
      .od-tonal-button {
        margin-left: 16px;
      }
    }

    /* iOS: large bold title, 48 pt rows with a rounded highlight. */
    :global(.ios) {
      .title {
        padding: 22px 22px 14px;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.3px;
      }

      .item {
        margin: 0 10px;
        min-height: 48px;
        padding: 0 12px;
        border-radius: 10px;
        gap: 14px;
        font-size: 17px;
        font-weight: 400;
        letter-spacing: normal;

        &[aria-current='page'] {
          font-weight: 600;
        }
      }

      .separator {
        margin: 8px 16px;
      }

      .status {
        padding: 0 6px;
      }
    }
  }
</style>
