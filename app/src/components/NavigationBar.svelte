<script>
  // @ts-check
  // Android phone: the Material 3 Expressive navigation bar at the bottom, four destinations
  // (task 2026-11-14-120, docs/mockups/nav-barre-android.dc.html). Shown only on the first
  // page of a section; every other page has its back arrow and no bar. The active item has a
  // 56 × 32 dp pill in the primary container and a filled icon. Tapping the current section
  // scrolls its page to the top.
  import { t } from '../lib/i18n.js';
  import { navigation, goToSection, sections } from '../lib/navigation.svelte.js';

  /**
   * The icons of the mock-up: outlined when inactive; when active, filled parts (`fill`) and
   * inner lines (`cut`) drawn in the pill's colour.
   * @type {Record<string, { line: string, fill?: string, cut?: string, dots?: [number, number][] }>}
   */
  const ICONS = {
    logbook: { line: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', fill: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', cut: 'M5 17a3 3 0 0 1 3-3h11' },
    sites: { line: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z', fill: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z', dots: [[12, 11]] },
    statistics: { line: 'M3 20h18 M6 16v-4 M10.5 16V6 M15 16v-6 M19.5 16V9' },
    tools: { line: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8', dots: [[16, 7], [10, 17]] },
  };

  /**
   * A tap: another section opens; the current one scrolls back to its top.
   * @param {MouseEvent} e
   * @param {import('../lib/navigation.svelte.js').Section} section
   */
  function choose(e, section) {
    e.preventDefault();
    if (navigation.section !== section) {
      goToSection(section);
      return;
    }
    const content = /** @type {HTMLElement|null} */ (document.querySelector(`#view-${section} > .page-current .page-content, #view-${section} > .page-master .page-content`));
    content?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
</script>

<nav class="od-navigation-bar" aria-label={t('menu.sections')}>
  {#each sections as section (section)}
    {@const active = navigation.section === section}
    {@const icon = ICONS[section]}
    <a href="#{section}" class="od-navigation-bar--item" class:od-navigation-bar--active={active} aria-current={active ? 'page' : undefined} onclick={(e) => choose(e, section)}>
      <span class="od-navigation-bar--pill">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          {#if active && icon.fill}<path d={icon.fill} class="od-navigation-bar--filled" />{/if}
          <path d={icon.line} />
          {#if icon.cut}<path d={icon.cut} class:od-navigation-bar--cut={active} />{/if}
          {#each icon.dots ?? [] as [cx, cy] (`${cx},${cy}`)}
            <circle {cx} {cy} r="2" class:od-navigation-bar--filled={active && section === 'tools'} class:od-navigation-bar--cut-fill={active && section === 'sites'} />
          {/each}
        </svg>
      </span>
      <span class="od-navigation-bar--label">{t(`tabs.${section}`)}</span>
    </a>
  {/each}
</nav>

<style>
  @layer od.components {
    .od-navigation-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      /* Above Framework7's views (5000), under its sheets and popups (10500 and up). */
      z-index: 5100;
      box-sizing: content-box;
      height: 64px;
      padding: 0 8px env(safe-area-inset-bottom);
      background: var(--od-surface-container-high);
      box-shadow: 0 -1px 0 color-mix(in srgb, var(--od-text) 6%, transparent);
      display: flex;
    }

    .od-navigation-bar--item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--od-text-2);
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
    }

    .od-navigation-bar--pill {
      width: 56px;
      height: 32px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 150ms linear;
    }

    svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;

      .od-navigation-bar--filled {
        fill: currentColor;
      }

      .od-navigation-bar--cut {
        stroke: var(--od-nav-active-container);
      }

      .od-navigation-bar--cut-fill {
        fill: var(--od-nav-active-container);
        stroke: var(--od-nav-active-container);
      }
    }

    .od-navigation-bar--label {
      font-size: 13px;
      line-height: 16px;
      font-weight: 400;
    }

    .od-navigation-bar--active {
      color: var(--od-nav-active);

      .od-navigation-bar--pill {
        background: var(--od-nav-active-container);
      }

      .od-navigation-bar--label {
        font-weight: 600;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-navigation-bar--pill {
        transition: none;
      }
    }
  }
</style>
