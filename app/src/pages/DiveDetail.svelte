<script>
  // @ts-check
  // Dive detail screen, reworked after the "Détail d'une plongée, repensé"
  // mock-ups: number and date, site as the large title, three key figures,
  // profile, secondary facts in a three-column grid, gases, buddies and tags
  // as pills. Edit and an overflow menu ("Plan from this dive") in the navbar.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, List, ListItem, Block, Popover, theme } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import DiveProfile from '../components/DiveProfile.svelte';
  import Icon from '../components/Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import {
    formatDepth,
    formatDiveDay,
    formatDuration,
    formatGas,
    formatNumber,
    formatSac,
    formatTemperature,
    formatTimeOfDay,
  } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { id: string } } }} */
  let { f7route } = $props();

  const uid = $props.id();
  const menuId = `dive-menu-${uid}`;
  const diveId = $derived(f7route.params.id);

  /** @type {import('opendives-core').DiveDetail|null} */
  let dive = $state(null);
  let failed = $state(false);
  const prefs = $derived(logbook.prefs);

  onMount(async () => {
    try {
      dive = await OpenDivesCore.getDive({ id: Number(diveId) });
    } catch (e) {
      console.error('Dive detail', e);
      failed = true;
    }
  });

  /** Key figures under the title; a figure without a value is left out. */
  const figures = $derived.by(() => {
    if (!dive) return [];
    const water = formatTemperature(dive.waterTempMk, prefs);
    return [
      dive.maxDepthMm ? { value: formatDepth(dive.maxDepthMm, prefs), label: t('detail.figureMaxDepth') } : null,
      { value: formatDuration(dive.durationSeconds), label: t('detail.figureDuration') },
      water ? { value: water, label: t('detail.figureWater') } : null,
    ].filter((f) => f !== null);
  });

  /** Secondary facts in a three-column grid; a fact without a value is hidden. */
  const facts = $derived.by(() => {
    if (!dive) return [];
    /** @type {[string, string|null|undefined|false][]} */
    // Order chosen by the project owner: times and mean depth first, then mode,
    // computer and oxygen exposure.
    const list = [
      [t('detail.entry'), formatTimeOfDay(dive.date)],
      [t('detail.exit'), dive.durationSeconds > 0 && formatTimeOfDay(dive.date, dive.durationSeconds)],
      [t('detail.meanDepth'), dive.meanDepthMm > 0 && formatDepth(dive.meanDepthMm, prefs)],
      [t('detail.mode'), tIfExists(`detail.modes.${dive.divemode}`) ?? dive.divemode],
      [t('detail.computer'), dive.computer],
      [t('detail.cns'), dive.cns > 0 && `${formatNumber(dive.cns, 0)} %`],
      [t('detail.otu'), dive.otu > 0 && formatNumber(dive.otu, 0)],
      [t('detail.sac'), dive.sacMlMin > 0 && formatSac(dive.sacMlMin, prefs)],
      [t('detail.suit'), dive.suit],
      [t('detail.trip'), dive.trip?.location],
    ];
    return list.filter(([, value]) => value).map(([label, value]) => ({ label, value: String(value) }));
  });

  /**
   * Gases as pills. On a rebreather, the diluents and oxygen are the
   * rebreather gases and the open-circuit cylinders are bailout (outlined).
   */
  const gasGroups = $derived.by(() => {
    if (!dive) return [];
    const used = dive.cylinders.filter((c) => c.used);
    /** @param {import('opendives-core').Cylinder[]} cylinders */
    const names = (cylinders) => [...new Set(cylinders.map((c) => formatGas(c.o2Permille, c.hePermille)))];
    const rebreather = dive.divemode === 'CCR' || dive.divemode === 'PSCR';
    if (!rebreather) return [{ label: t('detail.gases'), names: names(used), bailout: false }];
    return [
      { label: t('detail.rebreatherGases'), names: names(used.filter((c) => c.use !== 'OC-gas')), bailout: false },
      { label: t('detail.bailout'), names: names(used.filter((c) => c.use === 'OC-gas')), bailout: true },
    ].filter((group) => group.names.length);
  });

  const people = $derived(
    dive ? [...dive.buddies, ...dive.guides.map((name) => t('detail.guide', { name }))] : [],
  );
</script>

<Page>
  <Navbar>
    <!-- Named back link: in MD3, Framework7 hides its text and TalkBack would read "#". -->
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      {#if theme.ios}
        <Link href="/dive/{diveId}/edit/">{t('detail.edit')}</Link>
        <Link iconOnly popoverOpen="#{menuId}">
          <Icon name="moreCircle" /><span class="od-sr-only">{t('detail.moreOptions')}</span>
        </Link>
      {:else}
        <Link iconOnly href="/dive/{diveId}/edit/">
          <Icon name="edit" weight={2.2} /><span class="od-sr-only">{t('detail.edit')}</span>
        </Link>
        <Link iconOnly popoverOpen="#{menuId}">
          <Icon name="more" weight={4} /><span class="od-sr-only">{t('detail.moreOptions')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  <!-- Overflow menu (MD3 menu on Android, pull-down menu on iOS). One item for now. -->
  <Popover id={menuId} class="dive-menu" backdrop={false}>
    <List noChevron>
      <ListItem link="/plan/{diveId}/" popoverClose title={t('detail.plan')}>
        {#snippet media()}<Icon name="plan" weight={2} />{/snippet}
      </ListItem>
    </List>
  </Popover>

  {#if failed}
    <Block>
      <h2 class="od-state-title">{t('detail.errorTitle')}</h2>
      <p>{t('detail.errorText')}</p>
    </Block>
  {:else if !dive}
    <div class="skeleton-text" aria-busy="true" aria-label={t('detail.loading')}>
      <div class="head" aria-hidden="true">
        <p class="day">––––––––––––––</p>
        <h1 class="site">––––––––</h1>
      </div>
      <div class="skeleton-block skeleton-profile"></div>
    </div>
  {:else}
    <header class="head">
      <p class="day od-value">
        {#if dive.number}<strong>{t('detail.number', { number: String(dive.number) })}</strong>&emsp;{/if}{formatDiveDay(dive.date)}
      </p>
      <h1 class="site" class:not-set={!dive.site}>{dive.site || t('dive.siteNotSet')}</h1>
    </header>

    <div class="figures od-value">
      {#each figures as figure (figure.label)}
        <span class="figure"><span class="value">{figure.value}</span><span class="label">{figure.label}</span></span>
      {/each}
    </div>

    <DiveProfile
      samples={dive.samples}
      cylinders={dive.cylinders}
      divemode={dive.divemode}
      maxDepthMm={dive.maxDepthMm}
      durationSeconds={dive.durationSeconds}
      {prefs}
    />

    {#if facts.length}
      <dl class="facts">
        {#each facts as fact (fact.label)}
          <div class="fact"><dt>{fact.label}</dt><dd class="od-value">{fact.value}</dd></div>
        {/each}
      </dl>
    {/if}

    {#each gasGroups as group (group.label)}
      <section class="group">
        <h2 class="group-label">{group.label}</h2>
        <ul class="pills od-value">
          {#each group.names as name (name)}<li class="pill" class:outlined={group.bailout}>{name}</li>{/each}
        </ul>
      </section>
    {/each}

    {#if people.length}
      <section class="group row">
        <h2 class="group-label">{t('detail.buddies', { n: people.length })}</h2>
        <ul class="pills">
          {#each people as name (name)}<li class="pill large">{name}</li>{/each}
        </ul>
      </section>
    {/if}

    {#if dive.tags.length}
      <section class="group row">
        <h2 class="group-label">{t('detail.tags', { n: dive.tags.length })}</h2>
        <ul class="pills">
          {#each dive.tags as tag (tag)}<li class="pill large outlined">{tag}</li>{/each}
        </ul>
      </section>
    {/if}

    {#if dive.notes.trim()}
      <section class="group">
        <h2 class="group-label">{t('detail.notes')}</h2>
        <p class="notes">{dive.notes}</p>
      </section>
    {/if}
    <div class="end" aria-hidden="true"></div>
  {/if}
</Page>

<style>
  @layer od.components {
    .head {
      padding: 0 20px;
    }

    .day {
      margin: 0;
      font-size: 15px;
      color: var(--od-text-2);

      strong {
        font-weight: 800;
        color: var(--od-text);
      }
    }

    .site {
      margin: 2px 0 0;
      font-size: 34px;
      line-height: 38px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: var(--od-text);

      &.not-set {
        color: var(--od-text-2);
      }
    }

    .figures {
      padding: 14px 20px 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .figure {
      display: flex;
      flex-direction: column;

      .value {
        font-size: 28px;
        line-height: 34px;
        font-weight: 800;
        color: var(--od-text);
      }

      .label {
        font-size: 13px;
        color: var(--od-text-2);
      }
    }

    .skeleton-profile {
      height: 180px;
      margin: 14px 16px 0;
      border-radius: 16px;
    }

    .facts {
      margin: 8px 20px 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      column-gap: 12px;
    }

    .fact {
      padding: 10px 0;
      border-bottom: 1px solid var(--od-separator);
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;

      dt {
        font-size: 13px;
        color: var(--od-text-2);
      }

      dd {
        margin: 0;
        font-size: 17px;
        font-weight: 600;
        color: var(--od-text);
        overflow-wrap: anywhere;
      }
    }

    .group {
      margin: 14px 20px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;

      &.row {
        flex-direction: row;
        align-items: flex-start;
        gap: 10px;
      }

    }

    .group-label {
      margin: 0;
      font-size: 13px;
      font-weight: 400;
      color: var(--od-text-2);

      .row & {
        flex: 0 0 92px;
        padding-top: 7px;
      }
    }

    .pills {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .pill {
      height: 28px;
      padding: 0 10px;
      border-radius: 14px;
      background: var(--od-tint);
      color: var(--od-on-tint);
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;

      &.large {
        height: 32px;
        padding: 0 14px;
        border-radius: 16px;
        font-size: 15px;
        font-weight: 400;
      }

      &.outlined {
        background: none;
        color: var(--od-text);
        box-shadow: inset 0 0 0 1.5px var(--od-text);
      }
    }

    /* Space after the last block, so that it never touches the bottom bar. */
    .end {
      height: 32px;
    }

    .notes {
      margin: 0;
      white-space: pre-wrap;
      color: var(--od-text);
    }

    /* MD3 menu, as in the mock-up: small corners, no backdrop, width of its label (280 px at most). */
    :global(.popover.dive-menu) {
      --f7-popover-width: max-content;
      --f7-popover-border-radius: 4px;
      min-width: 112px;
      max-width: 280px;
      background: var(--od-surface);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15);
    }

    :global(.dive-menu .list) {
      margin: 8px 0;
    }

    :global(.dive-menu .item-content) {
      min-height: 48px;
      padding-left: 12px;
    }

    :global(.dive-menu .item-media) {
      min-width: 24px;
      color: var(--od-text);
    }

    :global(.dive-menu .item-title) {
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: visible;
      color: var(--od-text);
    }
  }
</style>
