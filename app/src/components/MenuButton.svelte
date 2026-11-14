<script>
  // @ts-check
  // ☰ button on the left of a section's top bar, wherever there is no rail or sidebar (spec,
  // sections 3 and 7). Pushed screens keep their Back button instead. Goes in the
  // Navbar's `left` snippet: Framework7 only places that one on the left.
  import Icon from './Icon.svelte';
  import { layout, bottomNav } from '../lib/layout.svelte.js';
  import { navigation, openMenu } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';
</script>

<!-- Android phone: no ☰, the sections are in the bottom bar (task 2026-11-14-120). -->
{#if !layout.rail && !bottomNav()}
  <!-- Written by hand, like the "+" button: a real button name and state for screen readers. -->
  <a
    href="#menu"
    class="link icon-only external od-menu-button"
    role="button"
    aria-controls="od-menu"
    aria-expanded={navigation.menuOpen}
    onclick={(e) => {
      e.preventDefault();
      openMenu(/** @type {HTMLElement} */ (e.currentTarget));
    }}
  >
    <Icon name="menu" />
    <span class="od-sr-only">{t('menu.open')}</span>
  </a>
{/if}
