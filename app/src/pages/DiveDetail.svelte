<script>
  // @ts-check
  // Dive detail screen, after the detail3 mock-ups (spec, section 4, "Full dive
  // detail" and "Conditions"): number and date, site, location, trip and
  // rating; key figures; profile; facts in a three-column grid; a collapsed
  // Conditions block; people and tags; "Gas and equipment" (one entry per
  // cylinder, SAC, suit, weights per location); dive computers; photos; notes
  // in full. Edit and an overflow menu in the navbar. A row without a value is
  // never shown.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, List, ListItem, Block, Popover, f7, theme } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import DiveProfile from '../components/DiveProfile.svelte';
  import Icon from '../components/Icon.svelte';
  import Stars from '../components/Stars.svelte';
  import { logbook, deleteDive } from '../lib/logbook.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import {
    formatCylinderSize,
    formatDepth,
    formatDiveDay,
    formatDuration,
        formatGasLong,
    formatGasVolume,
    formatNumber,
    formatPressure,
    formatSac,
    formatTemperature,
    formatTimeOfDay,
    formatWeight,
  } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { id: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  const uid = $props.id();
  const menuId = `dive-menu-${uid}`;
  const diveId = $derived(f7route.params.id);

  // "Delete the dive" (⋮ menu): a confirmation, then one undoable step; back
  // to the logbook with the Undo message.
  function askDelete() {
    confirmAction({
      title: t('detail.deleteTitle'),
      text: t('detail.deleteText'),
      action: t('detail.deleteAction'),
      onConfirm: async () => {
        try {
          await deleteDive(Number(diveId));
          f7router.back();
          offerUndo(t('detail.deleted'));
        } catch (e) {
          const code = String(/** @type {any} */ (e)?.message ?? '');
          console.error('Delete a dive', code);
          f7.dialog
            .create({
              title: t('detail.deleteTitle'),
              text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('detail.deleteFailed'),
              buttons: [{ text: t('dialog.ok') }],
            })
            .open();
        }
      },
    });
  }

  /** @type {import('opendives-core').DiveDetail|null} */
  let dive = $state(null);
  let failed = $state(false);
  const prefs = $derived(logbook.prefs);

  // After an edit or an undo of this dive, show the result at once.
  $effect(() => {
    const edited = logbook.edited;
    if (edited && dive && edited.id === dive.id) dive = edited.dive;
  });

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
      // Subsurface keeps the lowest water temperature of the dive.
      water ? { value: water, label: t('detail.figureWaterMin') } : null,
    ].filter((f) => f !== null);
  });

  /** Secondary facts in a three-column grid (detail3 mock-ups); a fact without a value is hidden. */
  const facts = $derived.by(() => {
    if (!dive) return [];
    /** @type {[string, string|null|undefined|false][]} */
    const list = [
      [t('detail.entry'), formatTimeOfDay(dive.date)],
      [t('detail.exit'), dive.durationSeconds > 0 && formatTimeOfDay(dive.date, dive.durationSeconds)],
      [t('detail.meanDepth'), dive.meanDepthMm > 0 && formatDepth(dive.meanDepthMm, prefs)],
      [t('detail.airTemperature'), formatTemperature(dive.airTempMk, prefs)],
      [t('detail.water'), dive.waterType && tIfExists(`detail.waterTypes.${dive.waterType}`)],
      // Always in mbar, as Subsurface shows it.
      [t('detail.surfacePressure'), dive.surfacePressureMbar > 0 && `${formatNumber(dive.surfacePressureMbar, 0)} mbar`],
      [t('detail.mode'), tIfExists(`detail.modes.${dive.divemode}`) ?? dive.divemode],
      [t('detail.cns'), dive.cns > 0 && `${formatNumber(dive.cns, 0)} %`],
      [t('detail.otu'), dive.otu > 0 && formatNumber(dive.otu, 0)],
    ];
    return list.filter(([, value]) => value).map(([label, value]) => ({ label, value: String(value) }));
  });

  const rebreather = $derived(dive ? dive.divemode === 'CCR' || dive.divemode === 'PSCR' : false);

  /** Location line under the title, from the site's taxonomy; empty when unknown. */
  const location = $derived(
    dive?.siteLocation
      ? [dive.siteLocation.city, dive.siteLocation.region, dive.siteLocation.country].filter(Boolean).join(', ')
      : '',
  );

  /**
   * Conditions, in Subsurface's order; each 1 to 5 stars, a condition at 0
   * (not filled in) is left out (spec, section 4, "Conditions").
   */
  const conditions = $derived.by(() => {
    if (!dive) return [];
    const values = { visibility: dive.visibility, ...(dive.conditions ?? {}) };
    return ['visibility', 'wavesize', 'current', 'surge', 'chill']
      .map((key) => ({ key, name: t(`detail.conditionNames.${key}`), value: values[key] ?? 0 }))
      .filter((c) => c.value > 0);
  });

  let conditionsOpen = $state(false);

  /** Collapsed summary: "Visibility 4 of 5, chill 3 of 5, and 2 more". */
  const conditionsSummary = $derived.by(() => {
    const shown = conditions.slice(0, 2).map((c, i) => {
      const name = i === 0 ? c.name : c.name.toLocaleLowerCase();
      return t('detail.summaryItem', { name, n: c.value });
    });
    const list = shown.join(', ');
    const more = conditions.length - shown.length;
    return more > 0 ? t('detail.summaryMore', { list, n: more }) : list;
  });

  /**
   * Cylinders of the "Gas and equipment" block, one entry each: name, size and
   * use, start and end pressures, a bar of the pressure left, then working
   * pressure, switch depth and gas used. Gas used and switch depth come from
   * the core, never computed here.
   */
  const cylinders = $derived.by(() => {
    if (!dive) return [];
    return dive.cylinders
      .filter((c) => c.used)
      .map((c) => {
        const gas = formatGasLong(c.o2Permille, c.hePermille);
        const gasLower = gas.toLocaleLowerCase();
        const use =
          c.use === 'diluent'
            ? t('detail.cylinderUses.diluent', { gas: gasLower })
            : c.use === 'oxygen'
              ? t('detail.cylinderUses.oxygen')
              : rebreather
                ? t('detail.cylinderUses.bailout', { gas: gasLower })
                : gasLower;
        const left = c.startMbar > 0 && c.endMbar > 0 ? Math.round((c.endMbar / c.startMbar) * 100) : null;
        const pressureValue = (/** @type {number} */ mbar) =>
          formatNumber(mbar / (prefs.pressure === 'psi' ? 68.947572932 : 1000), 0);
        return {
          name: c.description || gas,
          subtitle: [formatCylinderSize(c.sizeMl, c.workingPressureMbar, prefs), use].filter(Boolean).join(' · '),
          pressures:
            c.startMbar > 0 && c.endMbar > 0
              ? t('detail.pressureRange', { start: pressureValue(c.startMbar), end: formatPressure(c.endMbar, prefs) })
              : c.startMbar > 0
                ? formatPressure(c.startMbar, prefs)
                : '',
          left,
          details: [
            c.workingPressureMbar > 0 && t('detail.service', { pressure: formatPressure(c.workingPressureMbar, prefs) }),
            c.switchDepthMm > 0 && t('detail.switchAt', { depth: formatDepth(c.switchDepthMm, prefs) }),
            c.gasUsedMl > 0 && t('detail.gasUsed', { volume: formatGasVolume(c.gasUsedMl, prefs) }),
          ]
            .filter(Boolean)
            .join(' · '),
        };
      });
  });

  /** SAC: only when the core computes one, never on a rebreather dive. */
  const sac = $derived(dive && !rebreather && dive.sacMlMin > 0 ? formatSac(dive.sacMlMin, prefs) : '');

  /** Weights: one line per location, no total (spec, section 4, "Full dive detail"). */
  const weights = $derived(
    (dive?.weights ?? [])
      .filter((w) => w.grams > 0)
      .map((w) => ({
        // Locations as stored by Subsurface (integrated, belt...), translated when known.
        place: w.description ? (tIfExists(`detail.weightPlaces.${w.description}`) ?? w.description) : '',
        weight: formatWeight(w.grams, prefs),
      })),
  );

  const hasEquipment = $derived(cylinders.length > 0 || !!sac || !!dive?.suit || weights.length > 0);

  /** Dive computers: the first is the main one; its mode follows. */
  const computers = $derived(
    (dive?.diveComputers ?? [])
      .filter((dc) => dc.model)
      .map((dc, i) => ({
        model: dc.model,
        role: [
          i === 0 ? t('detail.mainComputer') : t('detail.otherComputer'),
          tIfExists(`detail.computerModes.${dc.divemode}`) ?? dc.divemode,
        ].join(' · '),
      })),
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

  <!-- Overflow menu (detail2 mock-ups): an MD3 menu on Android, icon before the
       label; an iOS pull-down menu, label then icon at the end, no arrow. -->
  <Popover id={menuId} class="dive-menu" backdrop={false}>
    <List noChevron>
      {#if theme.ios}
        <ListItem link="/plan/{diveId}/" popoverClose title={t('detail.plan')}>
          {#snippet after()}<Icon name="plan" />{/snippet}
        </ListItem>
        <!-- iOS: a destructive action in the alarm colour (Human Interface Guidelines). -->
        <ListItem link="#" popoverClose title={t('detail.delete')} class="destructive" onClick={askDelete}>
          {#snippet after()}<Icon name="delete" />{/snippet}
        </ListItem>
      {:else}
        <ListItem link="/plan/{diveId}/" popoverClose title={t('detail.plan')}>
          {#snippet media()}<Icon name="plan" weight={2} />{/snippet}
        </ListItem>
        <ListItem link="#" popoverClose title={t('detail.delete')} onClick={askDelete}>
          {#snippet media()}<Icon name="delete" weight={2} />{/snippet}
        </ListItem>
      {/if}
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
      {#if location}<p class="location">{location}</p>{/if}
      {#if dive.trip?.location}<p class="location">{t('detail.tripLine', { name: dive.trip.location })}</p>{/if}
      {#if dive.rating > 0}
        <p class="rating">
          <Stars value={dive.rating} size={18} label={t('detail.ratingLabel', { n: dive.rating })} />
          <span aria-hidden="true">{t('detail.rating')}</span>
        </p>
      {/if}
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

    {#if conditions.length}
      <!-- Collapsed by default, with a summary of the filled-in conditions. -->
      <section class="section">
        <div class="group">
          <button type="button" class="disclosure" aria-expanded={conditionsOpen} onclick={() => (conditionsOpen = !conditionsOpen)}>
            <span class="text">
              <span class="title">{t('detail.conditions')}</span>
              {#if !conditionsOpen}<span class="summary">{conditionsSummary}</span>{/if}
            </span>
            <span class="arrow" class:open={conditionsOpen}><Icon name="expand" /></span>
          </button>
          {#if conditionsOpen}
            {#each conditions as condition (condition.key)}
              <div class="row">
                <span>{condition.name}</span>
                <Stars value={condition.value} label={t('detail.starsLabel', { name: condition.name, n: condition.value })} />
              </div>
            {/each}
          {/if}
        </div>
      </section>
    {/if}

    {#if dive.guides.length || dive.buddies.length}
      <section class="section">
        <h2 class="section-title">{t('detail.people')}</h2>
        <div class="group">
          {#if dive.guides.length}
            <div class="row"><span>{t('detail.guideRow', { n: dive.guides.length })}</span><span class="value">{dive.guides.join(', ')}</span></div>
          {/if}
          {#if dive.buddies.length}
            <div class="row"><span>{t('detail.buddiesRow', { n: dive.buddies.length })}</span><span class="value">{dive.buddies.join(', ')}</span></div>
          {/if}
        </div>
      </section>
    {/if}

    {#if dive.tags.length}
      <section class="section">
        <h2 class="section-title">{t('detail.tags', { n: dive.tags.length })}</h2>
        <ul class="pills">
          {#each dive.tags as tag (tag)}<li class="pill large outlined">{tag}</li>{/each}
        </ul>
      </section>
    {/if}

    {#if hasEquipment}
      <section class="section">
        <h2 class="section-title">{t('detail.gasAndEquipment')}</h2>
        <div class="group">
          {#each cylinders as cylinder, i (i)}
            <div class="cylinder">
              <div class="line">
                <span class="name"><span class="gas">{cylinder.name}</span>{#if cylinder.subtitle}<span class="type">{cylinder.subtitle}</span>{/if}</span>
                {#if cylinder.pressures}<span class="value od-value">{cylinder.pressures}</span>{/if}
              </div>
              {#if cylinder.left !== null}
                <div class="bar" role="img" aria-label={t('detail.pressureLeft', { percent: cylinder.left })}>
                  <div class="fill" style="width: {cylinder.left}%"></div>
                </div>
              {/if}
              {#if cylinder.details}<div class="secondary od-value"><span>{cylinder.details}</span></div>{/if}
            </div>
          {/each}
          {#if sac}
            <div class="row"><span>{t('detail.sacFull')}</span><span class="value od-value">{sac}</span></div>
          {/if}
          {#if dive.suit}
            <div class="row"><span>{t('detail.suitRow')}</span><span class="value">{dive.suit}</span></div>
          {/if}
          {#each weights as weight, i (i)}
            <div class="row">
              <span class="stacked"><span>{t('detail.weights')}</span>{#if weight.place}<span class="sub">{weight.place}</span>{/if}</span>
              <span class="value od-value">{weight.weight}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if computers.length}
      <section class="section">
        <h2 class="section-title">{t('detail.computers')}</h2>
        <div class="group">
          {#each computers as computer, i (i)}
            <div class="row"><span class="stacked"><span>{computer.model}</span><span class="sub">{computer.role}</span></span></div>
          {/each}
        </div>
      </section>
    {/if}

    {#if dive.pictures > 0}
      <section class="section">
        <h2 class="section-title">{t('detail.photos')}</h2>
        <div class="group">
          <div class="row">
            <span class="stacked"><span>{t('detail.photoCount', { n: dive.pictures })}</span><span class="sub">{t('detail.photoNote')}</span></span>
          </div>
        </div>
      </section>
    {/if}

    {#if dive.notes.trim()}
      <section class="section">
        <h2 class="section-title">{t('detail.notes')}</h2>
        <!-- Shown in full, line breaks kept: no "Read more". -->
        <p class="group notes">{dive.notes}</p>
      </section>
    {/if}
    <div class="end" aria-hidden="true"></div>
  {/if}
</Page>

<style>
  @layer od.components {
    /* 16 px under the top bar, as in the detail3 mock-ups. */
    .head {
      padding: 16px 20px 0;
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

    .location {
      margin: 2px 0 0;
      font-size: 15px;
      color: var(--od-text-2);
    }

    .section {
      margin: 20px 16px 0;
    }

    .section-title {
      margin: 0 0 6px 4px;
      font-size: 13px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    /* Grouped list in a rounded block, as in the mock-ups (iOS grouped list, MD3 list). */
    .group {
      border-radius: 16px;
      background: var(--od-surface);
      color: var(--od-text);
      overflow: hidden;
    }

    .cylinder {
      padding: 12px 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;

      & + & {
        border-top: 1px solid var(--od-separator);
      }
    }

    .line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }

    .name {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0 8px;

      .gas {
        font-size: 17px;
        font-weight: 700;
      }

      .type {
        font-size: 15px;
        color: var(--od-text-2);
      }
    }

    .cylinder .value {
      font-size: 17px;
      font-weight: 700;
      white-space: nowrap;
    }

    /* Share of the start pressure left. */
    .bar {
      height: 6px;
      border-radius: 3px;
      background: var(--od-tint);
      overflow: hidden;

      .fill {
        height: 6px;
        background: var(--od-text);
      }
    }

    .secondary {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: var(--od-text-2);
    }

    .row {
      box-sizing: border-box;
      min-height: 44px;
      padding: 0 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 16px;
      border-top: 1px solid var(--od-separator);

      &:first-child {
        border-top: none;
      }

      .value {
        font-weight: 600;
        text-align: right;
      }
    }

    /* A label with a second line under it (weight location, computer role, photos). */
    .stacked {
      padding: 10px 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .sub {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }
    }

    /* Overall rating under the title. */
    .rating {
      margin: 6px 0 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    /* Header of the collapsible Conditions block. */
    .disclosure {
      width: 100%;
      min-height: 56px;
      padding: 10px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;

      .text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .title {
        font-size: 16px;
        font-weight: 600;
      }

      .summary {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }

      .arrow {
        display: block;
        color: var(--od-text-2);

        &.open {
          transform: rotate(180deg);
        }
      }
    }

    .disclosure + .row {
      border-top: 1px solid var(--od-separator);
    }

    .pills {
      list-style: none;
      margin: 0;
      padding: 0 4px;
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
      padding: 12px 16px;
      font-size: 16px;
      line-height: 22px;
      white-space: pre-line;
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

    /* iOS pull-down menu: 260 pt wide, 13 pt corners, 17 pt label, icon at the end. */
    :global(.ios .popover.dive-menu) {
      --f7-popover-width: 260px;
      --f7-popover-border-radius: 13px;
      min-width: 0;
      max-width: none;
      background: color-mix(in srgb, var(--od-surface) 94%, transparent);
      backdrop-filter: blur(20px);
    }

    :global(.ios .dive-menu .popover-arrow) {
      display: none;
    }

    :global(.ios .dive-menu .list) {
      margin: 0;
    }

    :global(.ios .dive-menu .item-content) {
      min-height: 44px;
      padding-left: 16px;
    }

    :global(.ios .dive-menu .item-title) {
      font-size: 17px;
      font-weight: 400;
    }

    :global(.ios .dive-menu .destructive .item-title),
    :global(.ios .dive-menu .destructive .item-after) {
      color: var(--od-alarm);
    }

    :global(.ios .dive-menu .item-after) {
      color: var(--od-text);
    }
  }
</style>
