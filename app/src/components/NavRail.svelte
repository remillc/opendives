<script>
  // @ts-check
  // Main navigation of the tablet layout (spec, section 3): the 220 px sidebar
  // on iPad, the 96 px navigation rail on Android (no "+": it is the floating button of the
  // Logbook, spec section 7). Sections, then Account and Settings at the bottom. The phone layout
  // has the side menu instead (NavMenu.svelte).
  import Icon from './Icon.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { ios } from '../lib/layout.svelte.js';
  import { navigation, sections, showSection, openSettings, openAbout } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';
  import { tolerantTaps } from '../lib/tap.js';

  /**
   * @param {MouseEvent} e
   * @param {() => void} go
   */
  function choose(e, go) {
    e.preventDefault();
    go();
  }
</script>

<nav class="od-nav-rail od-nav-rail--rail" class:ios aria-label={t('menu.sections')} use:tolerantTaps>
  {#if ios}
    <p class="od-nav-rail--title">{t('menu.title')}</p>
  {/if}
  {#each sections as section (section)}
    <a
      href="#{section}"
      class="od-nav-rail--item"
      aria-current={navigation.section === section ? 'page' : undefined}
      onclick={(e) => choose(e, () => showSection(section))}
    >
      <span class="od-nav-rail--icon"><Icon name={section} size={ios ? 22 : 24} /></span>
      <span class="od-nav-rail--label">{t(`tabs.${section}`)}</span>
    </a>
  {/each}
  <div class="od-nav-rail--spacer"></div>
  <a
    href="#account"
    class="od-nav-rail--item od-nav-rail--bottom"
    aria-current={navigation.section === 'account' ? 'page' : undefined}
    onclick={(e) => choose(e, () => showSection('account'))}
  >
    <span class="od-nav-rail--icon"><Icon name="account" size={ios ? 22 : 24} /></span>
    <span class="od-nav-rail--label" class:od-sr-only={!ios}>{t('account.title')}</span>
  </a>
  <a href="#settings" class="od-nav-rail--item od-nav-rail--bottom" onclick={(e) => choose(e, openSettings)}>
    <span class="od-nav-rail--icon"><Icon name="settings" size={ios ? 22 : 24} /></span>
    <span class="od-nav-rail--label" class:od-sr-only={!ios}>{t('settings.title')}</span>
  </a>
  <a href="#about" class="od-nav-rail--item" onclick={(e) => choose(e, openAbout)}>
    <span class="od-nav-rail--icon"><Icon name="info" size={ios ? 22 : 24} /></span>
    <span class="od-nav-rail--label" class:od-sr-only={!ios}>{t('about.title')}</span>
  </a>
  {#if ios && !logbook.loading && !logbook.error}
    <div class="od-nav-rail--status"><SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} /></div>
  {/if}
</nav>

<style>
  @layer od.components {
    /* Android: Material 3 navigation rail. */
    .od-nav-rail--rail {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 6000;
      /* It also covers the left safe area (camera cut-out in landscape). */
      width: calc(var(--od-nav-width) + env(safe-area-inset-left));
      box-sizing: border-box;
      padding: calc(var(--f7-safe-area-top) + 24px) 0 calc(var(--f7-safe-area-bottom) + 16px) env(safe-area-inset-left);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      background: var(--od-background);
      color: var(--od-text);
    }

    .od-nav-rail--item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 56px;
      color: var(--od-text-2);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.5px;
      text-decoration: none;

      .od-nav-rail--icon {
        width: 56px;
        height: 32px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      &[aria-current='page'] {
        color: var(--od-text);
        font-weight: 600;

        .od-nav-rail--icon {
          background: var(--od-tint);
          color: var(--od-on-tint);
        }
      }

      /* Account and Settings: icons only in the rail, in 48 dp targets. */
      &.od-nav-rail--bottom {
        gap: 0;

        .od-nav-rail--icon {
          width: 48px;
          height: 48px;
          border-radius: 24px;
        }
      }
    }

    .od-nav-rail--spacer {
      flex: 1;
    }

    .od-nav-rail--title,
    .od-nav-rail--status {
      display: none;
    }

    /* iPad: sidebar with 44 pt rows and a rounded highlight. */
    .od-nav-rail--rail.ios {
      align-items: stretch;
      gap: 2px;
      padding: calc(var(--f7-safe-area-top) + 32px) 12px calc(var(--f7-safe-area-bottom) + 16px)
        calc(12px + env(safe-area-inset-left));
      border-right: 0.5px solid var(--od-separator);

      .od-nav-rail--title {
        display: block;
        margin: 0;
        padding: 0 10px 14px;
        font-size: 22px;
        font-weight: 700;
      }

      .od-nav-rail--item,
      .od-nav-rail--item.od-nav-rail--bottom {
        height: 44px;
        flex-direction: row;
        gap: 10px;
        padding: 0 10px;
        border-radius: 10px;
        color: var(--od-text);
        font-size: 17px;
        font-weight: 400;
        letter-spacing: normal;

        .od-nav-rail--icon,
        &.od-nav-rail--bottom .od-nav-rail--icon {
          width: 22px;
          height: 22px;
          border-radius: 0;
          background: none;
        }

        &[aria-current='page'] {
          background: var(--od-tint);
          font-weight: 600;

          .od-nav-rail--icon {
            background: none;
          }
        }
      }

      .od-nav-rail--status {
        display: block;
        margin: 6px 10px 0;
      }
    }
  }
</style>
