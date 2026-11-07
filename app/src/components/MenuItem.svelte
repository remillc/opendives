<script>
  // @ts-check
  // One item of an overflow menu (a Framework7 Popover with the "od-menu"
  // class, styled in theme.css): an MD3 menu item on Android, icon before the
  // label; an iOS pull-down menu item, label then icon at the end. Tapping it
  // closes the menu.
  import { ListItem, theme } from 'framework7-svelte';
  import Icon from './Icon.svelte';

  /**
   * `link`: a route to open; otherwise `onclick` runs.
   * `destructive`: in the alarm colour on iOS (Human Interface Guidelines).
   * @type {{
   *   icon: import('svelte').ComponentProps<typeof Icon>['name'],
   *   text: string,
   *   link?: string,
   *   onclick?: () => void,
   *   destructive?: boolean,
   * }}
   */
  let { icon, text, link = '#', onclick = undefined, destructive = false } = $props();
</script>

<ListItem {link} popoverClose title={text} class={destructive ? 'destructive' : ''} onClick={onclick}>
  {#snippet media()}{#if !theme.ios}<Icon name={icon} weight={2} />{/if}{/snippet}
  {#snippet after()}{#if theme.ios}<Icon name={icon} />{/if}{/snippet}
</ListItem>
