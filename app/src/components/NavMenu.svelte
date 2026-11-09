<script>
  // @ts-check
  // Side menu of the phone layout (spec, section 3, "Side menu" and "Side menu
  // and section headers, identity"): the identity band with the account card,
  // the four sections, Settings and About, then the sync card. A modal
  // navigation drawer on Android (MD3); on iOS a panel drawn for the project,
  // as iOS has none. Opens only with the ☰ button: the panel follows a swipe
  // to close, never an edge swipe to open, which stays iOS's swipe back.
  import { onDestroy } from 'svelte';
  import { Panel } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import SyncButton from './SyncButton.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { navigation, sections, showSection, closeMenu, restoreFocus, openSettings, openAbout } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {Record<string, 'logbook'|'sites'|'statistics'|'tools'>} */
  const icons = { logbook: 'logbook', sites: 'sites', statistics: 'statistics', tools: 'tools' };

  const PROFILE = 'M0 30 L20 38 L45 70 L70 92 L95 96 L120 88 L140 94 L165 80 L185 62 L210 58 L235 50 L255 46 L275 40 L300 36';

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

  onDestroy(() => setBackgroundInert(false));

  /** The row of the screen shown: Settings or About over a section, else the section. */
  const current = $derived(navigation.page || navigation.section);
  const accountName = $derived(logbook.email || t('menu.noAccount'));
  const accountLine = $derived(t(logbook.email ? 'menu.cloudDives' : 'menu.localDives', { n: logbook.dives.length }));
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
    <div class="band">
      <svg class="profile" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
        <path d="{PROFILE} V140 H0 Z" class="area" />
        <path d={PROFILE} class="line" />
      </svg>
      <div class="brand">
        <img src="logo-light.svg" alt="" width="44" height="44" />
        <span class="name">{t('menu.title')}</span>
      </div>
      <a href="#account" class="account" aria-label={t('menu.accountLabel', { name: accountName })} onclick={(e) => choose(e, () => showSection('account'))}>
        <Icon name="account" />
        <span class="texts">
          <span class="address">{accountName}</span>
          <span class="line-2">{accountLine}</span>
        </span>
        <Icon name="chevron" size={20} />
      </a>
      <svg class="wave" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
    </div>

    {#each sections as section (section)}
      <a href="#{section}" class="item" aria-current={current === section ? 'page' : undefined} onclick={(e) => choose(e, () => showSection(section))}>
        <Icon name={icons[section]} />
        <span>{t(`tabs.${section}`)}</span>
      </a>
    {/each}
    <div class="separator" role="separator"></div>
    <a href="#settings" class="item" aria-current={current === 'settings' ? 'page' : undefined} onclick={(e) => choose(e, openSettings)}>
      <Icon name="settings" />
      <span>{t('settings.title')}</span>
    </a>
    <a href="#about" class="item" aria-current={current === 'about' ? 'page' : undefined} onclick={(e) => choose(e, openAbout)}>
      <Icon name="info" />
      <span>{t('about.title')}</span>
    </a>
    <div class="spacer"></div>
    {#if !logbook.loading && !logbook.error}
      <div class="status">
        <!-- The button stays in place while it runs and shows its progress (to-do #2). -->
        {#if logbook.email}<SyncButton />{/if}
        <SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
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
      padding-bottom: calc(var(--f7-safe-area-bottom) + 16px);
      color: var(--od-text);
    }

    .band {
      position: relative;
      overflow: hidden;
      margin-bottom: 12px;
      padding: calc(var(--f7-safe-area-top) + 16px) 20px 40px;
      border-radius: 0 16px 0 0;
      background-image: var(--od-band-gradient);
      display: flex;
      flex-direction: column;
      gap: 18px;
      color: var(--od-on-band);
    }

    .profile {
      position: absolute;
      left: 0;
      bottom: 2px;
      width: 100%;
      height: 34px;

      .area {
        fill: rgb(255 255 255 / 0.1);
      }

      .line {
        fill: none;
        stroke: rgb(31 33 36 / 0.22);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }
    }

    .wave {
      position: absolute;
      left: 0;
      bottom: -1px;
      width: 100%;
      height: 18px;
      display: block;

      path {
        fill: var(--f7-panel-bg-color);
      }
    }

    .brand {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;

      .name {
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
      }
    }

    .account {
      position: relative;
      padding: 10px 10px 10px 12px;
      border-radius: 16px;
      background: rgb(255 255 255 / 0.72);
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--od-on-band);
      text-decoration: none;

      .texts {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .address {
        font-size: 14px;
        line-height: 20px;
        font-weight: 500;
        letter-spacing: 0.1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .line-2 {
        font-size: 12px;
        line-height: 16px;
        letter-spacing: 0.4px;
        color: var(--od-on-band-2);
      }
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
        background: var(--od-water-top);
        color: var(--od-on-band);
        font-weight: 700;

        :global(svg) {
          fill: currentColor;
        }
      }
    }

    .separator {
      height: 1px;
      margin: 8px 28px;
      background: var(--od-separator);
    }

    .spacer {
      flex: 1;
      min-height: 12px;
    }

    /* The sync card: the button and the state, centred. */
    .status {
      margin: 0 12px;
      padding: 12px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;

      :global(.sync-status),
      :global(.sync-status .line) {
        justify-content: center;
        text-align: center;
      }
    }

    /* iOS: 48 pt rows with a rounded highlight. */
    :global(.ios) {
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
    }
  }
</style>
