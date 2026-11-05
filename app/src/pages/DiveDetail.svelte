<script>
  // @ts-check
  // Dive detail screen (spec, sections 4 to 6, "Détail d'une plongée"): profile,
  // facts, cylinders and gases, buddies and tags in two separate blocks, notes,
  // "Plan from this dive".
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, List, ListItem, BlockTitle, Block, Button } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import DiveProfile from '../components/DiveProfile.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import {
    formatCylinderSize,
    formatDepth,
    formatDuration,
    formatFullDate,
    formatPressure,
    formatSac,
    formatTemperature,
  } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { id: string } } }} */
  let { f7route } = $props();

  /** @type {import('opendives-core').DiveDetail|null} */
  let dive = $state(null);
  let failed = $state(false);
  const prefs = $derived(logbook.prefs);

  onMount(async () => {
    try {
      dive = await OpenDivesCore.getDive({ id: Number(f7route.params.id) });
    } catch (e) {
      console.error('Dive detail', e);
      failed = true;
    }
  });

  // Dive mode and cylinder use: translated when the key exists, otherwise as the core gives them.
  /** @param {string} mode */
  const modeName = (mode) => tIfExists(`detail.modes.${mode}`) ?? mode;
  /** @param {string} use */
  const useName = (use) => tIfExists(`detail.uses.${use}`) ?? '';

  const cylinders = $derived(dive ? dive.cylinders.filter((c) => c.used) : []);
  const title = $derived(dive ? dive.site || t('dive.siteNotSet') : '');

  /** @param {import('opendives-core').Cylinder} c */
  function pressures(c) {
    if (c.startMbar && c.endMbar)
      return t('detail.pressures', { start: formatPressure(c.startMbar, prefs), end: formatPressure(c.endMbar, prefs) });
    if (c.startMbar) return t('detail.startPressure', { pressure: formatPressure(c.startMbar, prefs) });
    return '';
  }

  /** @param {import('opendives-core').Cylinder} c */
  function cylinderDetails(c) {
    return [c.description, formatCylinderSize(c.sizeMl, c.workingPressureMbar, prefs), useName(c.use)]
      .filter(Boolean)
      .join(', ');
  }
</script>

<Page>
  <Navbar {title}>
    <!-- Named back link: in MD3, Framework7 hides its text and TalkBack would read "#". -->
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if failed}
    <Block>
      <h2 class="od-state-title">{t('detail.errorTitle')}</h2>
      <p>{t('detail.errorText')}</p>
    </Block>
  {:else if !dive}
    <div class="skeleton-text" aria-busy="true" aria-label={t('detail.loading')}>
      <div class="skeleton-block skeleton-profile"></div>
      <List>
        {#each Array(5) as _, i (i)}
          <ListItem title="––––––––––––––" after="––––––" aria-hidden="true" />
        {/each}
      </List>
    </div>
  {:else}
    <DiveProfile
      samples={dive.samples}
      cylinders={dive.cylinders}
      divemode={dive.divemode}
      maxDepthMm={dive.maxDepthMm}
      durationSeconds={dive.durationSeconds}
      {prefs}
    />

    <List dividers class="facts">
      <ListItem title={t('detail.date')} after={formatFullDate(dive.date)} />
      {#if dive.number}<ListItem title={t('detail.number')} after={String(dive.number)} />{/if}
      {#if dive.maxDepthMm}<ListItem title={t('detail.maxDepth')} after={formatDepth(dive.maxDepthMm, prefs)} />{/if}
      {#if dive.meanDepthMm}<ListItem title={t('detail.meanDepth')} after={formatDepth(dive.meanDepthMm, prefs)} />{/if}
      <ListItem title={t('detail.duration')} after={formatDuration(dive.durationSeconds)} />
      {#if formatTemperature(dive.waterTempMk, prefs)}
        <ListItem title={t('detail.waterTemperature')} after={formatTemperature(dive.waterTempMk, prefs) ?? ''} />
      {/if}
      <ListItem title={t('detail.mode')} after={modeName(dive.divemode)} />
      {#if dive.sacMlMin}<ListItem title={t('detail.sac')} after={formatSac(dive.sacMlMin, prefs)} />{/if}
      {#if dive.suit}<ListItem title={t('detail.suit')} after={dive.suit} />{/if}
      <ListItem
        title={t('detail.computer')}
        after={dive.computer
          ? dive.computers > 1
            ? t('detail.computerOthers', { model: dive.computer, n: dive.computers - 1 })
            : dive.computer
          : t('detail.notSet')}
      />
      {#if dive.trip?.location}<ListItem title={t('detail.trip')} after={dive.trip.location} />{/if}
    </List>

    {#if cylinders.length}
      <BlockTitle>{t('detail.cylinders')}</BlockTitle>
      <List dividers>
        {#each cylinders as c, i (i)}
          <ListItem title={c.gas} after={pressures(c)} footer={cylinderDetails(c)} />
        {/each}
      </List>
    {/if}

    <BlockTitle>{t('detail.buddies')}</BlockTitle>
    <Block>
      {#if dive.buddies.length || dive.guides.length}
        <ul class="chips" aria-label={t('detail.buddies')}>
          {#each dive.buddies as name (name)}<li class="person">{name}</li>{/each}
          {#each dive.guides as name (name)}<li class="person">{t('detail.guide', { name })}</li>{/each}
        </ul>
      {:else}
        <p class="absent">{t('detail.noBuddy')}</p>
      {/if}
    </Block>

    <BlockTitle>{t('detail.tags')}</BlockTitle>
    <Block>
      {#if dive.tags.length}
        <ul class="chips" aria-label={t('detail.tags')}>
          {#each dive.tags as tag (tag)}<li class="person outlined">{tag}</li>{/each}
        </ul>
      {:else}
        <p class="absent">{t('detail.noTags')}</p>
      {/if}
    </Block>

    {#if dive.notes.trim()}
      <BlockTitle>{t('detail.notes')}</BlockTitle>
      <Block><p class="notes">{dive.notes}</p></Block>
    {/if}

    <Block>
      <!-- No action yet: the planner will come later. -->
      <Button fill large class="od-primary-action">{t('detail.plan')}</Button>
    </Block>
  {/if}
</Page>

<style>
  @layer od.components {
    .skeleton-profile {
      height: 180px;
      margin: 32px 16px 8px;
      border-radius: 8px;
    }

    /* Facts list: values on the right, tabular figures (spec, section 2). */
    :global(.facts .item-after) {
      font-variant-numeric: tabular-nums;
      white-space: normal;
      text-align: right;
      max-width: 60%;
    }

    .chips {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .person {
      min-height: 32px;
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-radius: 8px;
      background: var(--od-tint);
      color: var(--od-on-tint);
      font-size: 14px;

      &.outlined {
        background: none;
        color: inherit;
        border: 1px solid var(--f7-md-outline, var(--f7-list-item-border-color));
      }
    }

    .absent {
      color: var(--f7-md-on-surface-variant, var(--f7-list-item-text-text-color));
      margin: 0;
    }

    .notes {
      white-space: pre-wrap;
      margin: 0;
    }
  }
</style>
