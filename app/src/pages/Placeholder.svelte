<script>
  // @ts-check
  // Sections not built yet: Sites, Statistics, Tools.
  import { Page, Navbar, Block } from 'framework7-svelte';

  /** @type {{ title: string, text: string }} */
  let { title, text } = $props();
</script>

<Page>
  <Navbar large {title} />
  <Block>
    <p>{text}</p>
  </Block>
</Page>
