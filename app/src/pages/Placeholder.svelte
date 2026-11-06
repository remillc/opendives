<script>
  // @ts-check
  // Screens not built yet: Tools, the planner.
  import { Page, Navbar, Block } from 'framework7-svelte';
  import MenuButton from '../components/MenuButton.svelte';

  /** @type {{ title: string, text: string }} */
  let { title, text } = $props();
</script>

<Page>
  <Navbar large {title}>
    {#snippet left()}<MenuButton />{/snippet}
  </Navbar>
  <Block>
    <p>{text}</p>
  </Block>
</Page>
