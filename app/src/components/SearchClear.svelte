<script>
  // @ts-check
  // The clear button of a search field (docs/system-design.md, « Search fields: the clear
  // button », task 2026-11-13-113): shown as soon as the field holds a character, focus or
  // not; the Material « close » icon, 24 dp in a 48 dp target. A tap empties the field and
  // keeps the focus in it (the field: the nearest input around the button).
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ onclear: () => void }} */
  let { onclear } = $props();

  /** @param {MouseEvent & { currentTarget: HTMLButtonElement }} e */
  function clear(e) {
    onclear();
    let box = e.currentTarget.parentElement;
    while (box && !box.querySelector('input')) box = box.parentElement;
    box?.querySelector('input')?.focus();
  }
</script>

<!-- pointerdown kept from the field: the keyboard stays open while the button is tapped. -->
<button type="button" class="od-search-clear" onpointerdown={(e) => e.preventDefault()} onclick={clear}>
  <Icon name="close" /><span class="od-sr-only">{t('searchField.clear')}</span>
</button>

<style>
  @layer od.components {
    .od-search-clear {
      flex: none;
      width: 48px;
      height: 48px;
      margin: -12px -12px -12px 0;
      padding: 12px;
      box-sizing: border-box;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
  }
</style>
