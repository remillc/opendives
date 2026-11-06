<script>
  // @ts-check
  // Main navigation of the tablet layout (spec, section 3): the 220 px sidebar
  // on iPad, the 96 px navigation rail on Android with the "+" button at the
  // top. Sections, then Account and Settings at the bottom. The phone layout
  // has the side menu instead (NavMenu.svelte).
  import Icon from './Icon.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { ios } from '../lib/layout.svelte.js';
  import { navigation, sections, showSection, openSettings, requestAdd } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * @param {MouseEvent} e
   * @param {() => void} go
   */
  function choose(e, go) {
    e.preventDefault();
    go();
  }
</script>

<nav class="rail" class:ios aria-label={t('menu.sections')}>
  {#if ios}
    <p class="title">{t('menu.title')}</p>
  {:else}
    <button type="button" class="add" onclick={requestAdd}>
      <Icon name="plus" />
      <span class="od-sr-only">{t('logbook.add')}</span>
    </button>
  {/if}
  {#each sections as section (section)}
    <a
      href="#{section}"
      class="item"
      aria-current={navigation.section === section ? 'page' : undefined}
      onclick={(e) => choose(e, () => showSection(section))}
    >
      <span class="icon"><Icon name={section} size={ios ? 22 : 24} /></span>
      <span class="label">{t(`tabs.${section}`)}</span>
    </a>
  {/each}
  <div class="spacer"></div>
  <a
    href="#account"
    class="item bottom"
    aria-current={navigation.section === 'account' ? 'page' : undefined}
    onclick={(e) => choose(e, () => showSection('account'))}
  >
    <span class="icon"><Icon name="account" size={ios ? 22 : 24} /></span>
    <span class="label" class:od-sr-only={!ios}>{t('account.title')}</span>
  </a>
  <a href="#settings" class="item bottom" onclick={(e) => choose(e, openSettings)}>
    <span class="icon"><Icon name="settings" size={ios ? 22 : 24} /></span>
    <span class="label" class:od-sr-only={!ios}>{t('settings.title')}</span>
  </a>
  {#if ios && !logbook.loading && !logbook.error}
    <div class="status"><SyncStatus sync={logbook.sync} pending={logbook.pending} live={false} /></div>
  {/if}
</nav>

<style>
  @layer od.components {
    /* Android: Material 3 navigation rail. */
    .rail {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 6000;
      width: var(--od-nav-width);
      box-sizing: border-box;
      padding: calc(var(--f7-safe-area-top) + 24px) 0 calc(var(--f7-safe-area-bottom) + 16px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      background: var(--od-background);
      color: var(--od-text);
    }

    .add {
      width: 56px;
      height: 56px;
      margin-bottom: 4px;
      border: 0;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-surface-2);
      color: var(--od-text);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    }

    .item {
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

      .icon {
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

        .icon {
          background: var(--od-tint);
          color: var(--od-on-tint);
        }
      }

      /* Account and Settings: icons only in the rail, in 48 dp targets. */
      &.bottom {
        gap: 0;

        .icon {
          width: 48px;
          height: 48px;
          border-radius: 24px;
        }
      }
    }

    .spacer {
      flex: 1;
    }

    .title,
    .status {
      display: none;
    }

    /* iPad: sidebar with 44 pt rows and a rounded highlight. */
    .rail.ios {
      align-items: stretch;
      gap: 2px;
      padding: calc(var(--f7-safe-area-top) + 32px) 12px calc(var(--f7-safe-area-bottom) + 16px);
      border-right: 0.5px solid var(--od-separator);

      .title {
        display: block;
        margin: 0;
        padding: 0 10px 14px;
        font-size: 22px;
        font-weight: 700;
      }

      .item,
      .item.bottom {
        height: 44px;
        flex-direction: row;
        gap: 10px;
        padding: 0 10px;
        border-radius: 10px;
        color: var(--od-text);
        font-size: 17px;
        font-weight: 400;
        letter-spacing: normal;

        .icon,
        &.bottom .icon {
          width: 22px;
          height: 22px;
          border-radius: 0;
          background: none;
        }

        &[aria-current='page'] {
          background: var(--od-tint);
          font-weight: 600;

          .icon {
            background: none;
          }
        }
      }

      .status {
        display: block;
        margin: 6px 10px 0;
      }
    }
  }
</style>
