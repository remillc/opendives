<script>
  // @ts-check
  import { onMount } from 'svelte';
  import { App, View, Page, Navbar, List, ListItem, BlockTitle, Block, Preloader } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { groupByTrip, formatDate, formatDepth, formatDuration } from './carnet.js';

  /** @type {import('opendives-core').Dive[]} */
  let dives = $state([]);
  let loading = $state(true);
  let source = $state('');
  let error = $state('');
  const groups = $derived(groupByTrip(dives));

  const f7params = { name: 'OpenDives', theme: 'auto', colors: { primary: '#1D5C6B' } };

  onMount(async () => {
    try {
      const cloud = await OpenDivesCore.listCloudDives();
      if (cloud.available && cloud.dives) {
        dives = cloud.dives;
        source = cloud.synced
          ? `Lu depuis le cloud (${cloud.server}, ${cloud.head?.slice(0, 7)})`
          : 'Copie locale du cloud : le serveur n\'a pas répondu';
        return;
      }
      let result = await OpenDivesCore.listDives();
      if (result.exists) {
        source = 'Relu depuis le dépôt git';
      } else {
        await OpenDivesCore.importSample();
        result = await OpenDivesCore.listDives();
        source = 'Carnet d\'exemple importé dans le dépôt git';
      }
      dives = result.dives;
    } catch (e) {
      const err = /** @type {{code?: string, message?: string}} */ (e);
      error = `${err.code ?? 'ERREUR'} : ${err.message ?? String(e)}`;
    } finally {
      loading = false;
    }
  });
</script>

<App {...f7params}>
  <View main>
    <Page>
      <Navbar title="Carnet" />
      {#if loading}
        <Block class="text-align-center"><Preloader /></Block>
      {:else if error}
        <Block>{error}</Block>
      {:else}
        <Block>{dives.length} plongées. {source}.</Block>
        {#each groups as group (group.key + group.dives[0].date)}
          {#if group.title}<BlockTitle>{group.title}</BlockTitle>{/if}
          <List mediaList dividers>
            {#each group.dives as dive (dive.date + dive.number)}
              <ListItem title={dive.site || 'Site non renseigné'} subtitle={`N° ${dive.number}`} text={formatDate(dive.date)}>
                {#snippet after()}
                  <div class="dive-values">
                    <span>{formatDepth(dive.maxDepthMm)}</span>
                    <span>{formatDuration(dive.durationSeconds)}</span>
                  </div>
                {/snippet}
              </ListItem>
            {/each}
          </List>
        {/each}
      {/if}
    </Page>
  </View>
</App>

<style>
  .dive-values {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-variant-numeric: tabular-nums;
  }
</style>
