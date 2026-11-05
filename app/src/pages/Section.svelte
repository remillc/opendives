<script>
  // @ts-check
  // Sections pas encore construites : Sites, Statistiques, Outils.
  import { Page, Navbar, Block } from 'framework7-svelte';

  /** @type {{ titre: string, phrase: string }} */
  let { titre, phrase } = $props();
</script>

<Page>
  <Navbar large title={titre} />
  <Block>
    <p>{phrase}</p>
  </Block>
</Page>
