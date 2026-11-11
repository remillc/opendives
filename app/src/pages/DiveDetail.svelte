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
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import DiveProfile from '../components/DiveProfile.svelte';
  import DiveFigures from '../components/DiveFigures.svelte';
  import Icon from '../components/Icon.svelte';
  import FloatingToolbar from '../components/FloatingToolbar.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import RenumberDiveDialog from '../components/RenumberDiveDialog.svelte';
  import ShareSheet from '../components/ShareSheet.svelte';
  import SiteHeaderImage from '../components/SiteHeaderImage.svelte';
  import { sharePdf, shareSummary } from '../lib/share.js';
  import { filter } from '../lib/filter.svelte.js';
  import { horizontalSwipe, swipeGoesThrough } from '../lib/swipe.js';
  import Stars from '../components/Stars.svelte';
  import { logbook, deleteDive, tripChange } from '../lib/logbook.svelte.js';
  import { layout } from '../lib/layout.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import { readySiteMap } from '../lib/site-image.js';
  import { forgetDive, keepDive, preloadDives, readyDive } from '../lib/dive-preload.js';
  import {
    formatCylinderSize,
    formatDepth,
    formatDiveDay,
        formatGasLong,
    formatNumber,
    formatPressure,
    formatSac,
    formatTemperature,
    formatTimeOfDay,
    formatWeight,
  } from '../lib/format.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /**
   * `slide`: the dive was reached by a swipe from the next or previous one.
   * @type {{ f7route: { params: { id: string, trip?: string }, url: string }, f7router: any, slide?: 'next'|'previous' }}
   */
  let { f7route, f7router, slide = undefined } = $props();

  // --- Swipe left or right: the next (older) or previous (more recent) dive,
  // in the order of the logbook list, its filter applied. Not from the
  // profile, which reads time and depth under the finger.

  /** The dive ids of the list, from the most recent to the oldest. */
  function listOrder() {
    return [...logbook.dives]
      .filter((d) => !filter.ids || filter.ids.has(d.id))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => d.id);
  }

  /** @param {1|-1} step 1: the next (older) dive; -1: the previous one */
  function goTo(step) {
    const ids = listOrder();
    const at = ids.indexOf(Number(diveId));
    const id = at < 0 ? undefined : ids[at + step];
    if (id === undefined) return;
    // The same kind of route as this one: /dives/<id> (beside the list in the
    // Logbook) or /trips/<trip>/dives/<id>; only the dive changes.
    const base = f7route.url.replace(/[^/?]+(\?.*)?$/, '');
    f7router.navigate(`${base}${id}`, { reloadCurrent: true, props: { slide: step > 0 ? 'next' : 'previous' } });
  }

  /**
   * The page follows the finger; lifted past a quarter of the width (or
   * flicked), it goes out on that side and the next dive comes in from the
   * other; otherwise it comes back. At the first or last dive it only gives
   * a little.
   * @param {any} page Framework7's page
   */
  function watchSwipes(page) {
    const content = /** @type {HTMLElement|null} */ (page.el.querySelector('.page-content'));
    if (!content) return;
    /** @param {number} dx */
    const hasNeighbour = (dx) => {
      const ids = listOrder();
      const at = ids.indexOf(Number(diveId));
      return at >= 0 && ids[at + (dx < 0 ? 1 : -1)] !== undefined;
    };
    horizontalSwipe(content, {
      accept: (e) => !(/** @type {HTMLElement} */ (e.target).closest('.od-dive-profile--profile')) && !document.querySelector('.modal-in'),
      move(dx) {
        const shown = hasNeighbour(dx) ? dx : dx / 3;
        content.style.transition = '';
        content.style.transform = `translateX(${shown}px)`;
        content.style.opacity = String(1 - Math.min(Math.abs(shown) / content.clientWidth, 1) / 2);
      },
      end(dx, velocity) {
        const width = content.clientWidth;
        const through = hasNeighbour(dx) && swipeGoesThrough(dx, velocity, width);
        content.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
        if (through) {
          content.style.transform = `translateX(${dx < 0 ? -width : width}px)`;
          content.style.opacity = '0';
          setTimeout(() => goTo(dx < 0 ? 1 : -1), 160);
        } else {
          content.style.transform = '';
          content.style.opacity = '';
        }
      },
    });
  }


  const uid = $props.id();
  const menuId = `dive-menu-${uid}`;
  const diveId = $derived(f7route.params.id);

  // "Delete the dive" (⋮ menu, task 2026-11-07-28): no confirmation, the
  // core's undoable delete as in Subsurface, then back to the logbook with
  // "Annuler" for 10 seconds; undone, the dive is back at its place. Beside
  // the list (tablet), the next dive of the list takes its place, or the
  // empty pane when none is left.
  async function deleteNow() {
    const id = Number(diveId);
    const order = [...logbook.dives].sort((a, b) => b.date.localeCompare(a.date));
    const at = order.findIndex((d) => d.id === id);
    const next = order[at + 1] ?? order[at - 1];
    try {
      await deleteDive(id);
      forgetDive(id);
      if (layout.split && next) f7router.navigate(`/dives/${next.id}`, { reloadDetail: true });
      else f7router.back();
      offerUndo(t('detail.deleted'), undefined, 10000);
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
  }

  // The list beside it highlights the dive shown, unless it was opened from inside the
  // detail pane (from a trip): the list and its selected row do not change then.
  $effect(() => {
    const id = diveId;
    if (f7route.params.trip) return;
    navigation.dive = id;
    return () => {
      if (navigation.dive === id) navigation.dive = null;
    };
  });

  // Prepared before the swipe that led here (dive-preload.js): shown from the
  // first frame, then read again from the core in case it changed.
  // svelte-ignore state_referenced_locally
  let dive = $state(/** @type {import('opendives-core').DiveDetail|null} */ (readyDive(Number(f7route.params.id))));
  let failed = $state(false);
  const prefs = $derived(logbook.prefs);

  // After an edit or an undo of this dive, show the result at once.
  $effect(() => {
    const edited = logbook.edited;
    if (edited && dive && edited.id === dive.id) {
      dive = edited.dive;
      keepDive(edited.id, edited.dive);
    }
  });

  async function loadDive() {
    const id = Number(diveId);
    try {
      dive = await OpenDivesCore.getDive({ id });
      keepDive(id, dive);
    } catch (e) {
      console.error('Dive detail', e);
      failed = true;
      return;
    }
    // The dives a swipe can lead to, the next (older) one first.
    const ids = listOrder();
    const at = ids.indexOf(id);
    if (at >= 0) preloadDives([ids[at + 1], ids[at - 1]].filter((n) => n !== undefined));
  }
  onMount(loadDive);

  /** "Renuméroter la plongée" open. */
  let renumbering = $state(false);

  /** "Partager" open: the sheet, then the system's share sheet. */
  // The map behind the header: the top bar is see-through over it,
  // and gets its colour back as soon as the text scrolls under it.
  // True from the first frame when the picture was prepared ahead (no flash of the plain header).
  let imageShown = $state(
    (() => {
      const c = dive?.siteCoordinates;
      return !!c && readySiteMap(c.latUdeg, c.lonUdeg) !== null;
    })(),
  );
  let scrolled = $state(false);
  /** @param {HTMLElement} node */
  function watchScroll(node) {
    const scroller = node.closest('.page-content');
    if (!scroller) return;
    const update = () => (scrolled = scroller.scrollTop > 12);
    scroller.addEventListener('scroll', update, { passive: true });
    return { destroy: () => scroller.removeEventListener('scroll', update) };
  }

  let sharing = $state(false);
  /** @param {'pdf'|'summary'} kind */
  async function share(kind) {
    sharing = false;
    if (!dive) return;
    // The profile chart of this page (the current one in its view).
    const svg = /** @type {SVGSVGElement|null} */ (document.querySelector('.page-current .od-dive-profile--profile .od-dive-profile--frame svg'));
    try {
      if (kind === 'pdf') await sharePdf(dive, prefs, svg);
      else await shareSummary(dive, prefs, svg);
    } catch (e) {
      // Closing the system's share sheet without choosing is not an error.
      const message = String(/** @type {any} */ (e)?.message ?? '');
      if (/cancel/i.test(message)) return;
      console.error('Share a dive', e);
      showSnackbar(t('share.failed'));
    }
  }

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

  /** The dive can leave its trip; a trip of one dive made by the automatic grouping is no trip. */
  const removableFromTrip = $derived(
    !!dive?.trip && (!dive.trip.autogen || logbook.dives.filter((d) => d.trip?.id === dive?.trip?.id).length > 1),
  );

  // "Retirer du voyage": at once, as Subsurface's "Remove dive(s) from trip".
  // A trip left empty is deleted by the core; "Annuler" brings both back.
  async function removeFromTrip() {
    f7.popover.close(`#${menuId}`);
    const tripId = dive?.trip?.id;
    const last = logbook.dives.filter((d) => d.trip?.id === tripId).length <= 1;
    try {
      await tripChange({ action: 'remove', diveIds: [Number(diveId)] });
      await loadDive();
      offerUndo(t(last ? 'detail.removedFromTripEmpty' : 'detail.removedFromTrip'), loadDive);
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Remove from trip', code);
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('detail.removeFromTripFailed'));
    }
  }

  /** The dive's trip; a trip of one dive is no trip, as in the logbook list. */
  const trip = $derived.by(() => {
    const own = dive?.trip;
    return own?.location && logbook.dives.filter((d) => d.trip?.id === own.id).length > 1 ? own : null;
  });

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
    /** @type {Record<string, number>} */
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
        const usedMbar = c.startMbar > 0 && c.endMbar > 0 && c.startMbar >= c.endMbar ? c.startMbar - c.endMbar : null;
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
          // From 0 to the working pressure; no bar when a pressure is missing.
          bar:
            usedMbar !== null && c.workingPressureMbar > 0
              ? {
                  remaining: Math.min(100, (c.endMbar / c.workingPressureMbar) * 100),
                  used: Math.min(100, (usedMbar / c.workingPressureMbar) * 100),
                  label: t('detail.pressureBar', {
                    end: formatPressure(c.endMbar, prefs),
                    working: formatPressure(c.workingPressureMbar, prefs),
                    used: formatPressure(usedMbar, prefs),
                  }),
                }
              : null,
          details: [
            c.workingPressureMbar > 0 && t('detail.service', { pressure: formatPressure(c.workingPressureMbar, prefs) }),
            usedMbar !== null && t('detail.pressureUsed', { pressure: formatPressure(usedMbar, prefs) }),
            c.switchDepthMm > 0 && t('detail.switchAt', { depth: formatDepth(c.switchDepthMm, prefs) }),
          ]
            .filter(Boolean)
            .join(' · '),
        };
      });
  });

  /** SAC: only when the core computes one, never on a rebreather dive. */
  const sac = $derived(dive && !rebreather && dive.sacMlMin > 0 ? formatSac(dive.sacMlMin, prefs) : '');

  /**
   * Weights in the order stored by the core (spec, section 4, "Full dive
   * detail"): one entry, a row; several, the total then one line per location
   * (task 2026-11-07-27).
   */
  const weightEntries = $derived((dive?.weights ?? []).filter((w) => w.grams > 0));
  const weights = $derived(
    weightEntries.map((w) => ({
      // Locations as stored by Subsurface (integrated, belt...), translated when known.
      place: w.description ? (tIfExists(`detail.weightPlaces.${w.description}`) ?? w.description) : '',
      weight: formatWeight(w.grams, prefs),
    })),
  );
  const weightTotal = $derived(formatWeight(weightEntries.reduce((sum, w) => sum + w.grams, 0), prefs));

  const hasEquipment = $derived(cylinders.length > 0 || !!sac || !!dive?.suit || weights.length > 0);

  /** Dive computers: the first is the main one; its mode follows. */
  const computers = $derived(
    (dive?.diveComputers ?? [])
      .filter((dc) => dc.model)
      .map((dc, i) => ({
        model: dc.nickname || dc.model,
        role: [
          i === 0 ? t('detail.mainComputer') : t('detail.otherComputer'),
          tIfExists(`detail.computerModes.${dc.divemode}`) ?? dc.divemode,
        ].join(' · '),
      })),
  );
</script>

<!-- no-swipeback: here a swipe to the right shows the previous dive. -->
<Page onPageInit={watchSwipes} class="od-dive-detail no-swipeback {imageShown && !scrolled ? 'od-dive-detail--on-image' : ''} {slide ? `od-slide-${slide}` : ''}">
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
        <Link href="/dives/{diveId}/edit">{t('detail.edit')}</Link>
        <Link iconOnly popoverOpen="#{menuId}">
          <Icon name="moreCircle" /><span class="od-sr-only">{t('detail.moreOptions')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  <!-- Overflow menu (detail2 mock-ups): an MD3 menu on Android, icon before the
       label; an iOS pull-down menu, label then icon at the end, no arrow. -->
  <Popover id={menuId} class="od-menu" backdrop={false}>
    <List noChevron>
      <!-- This page's router, not a link: the menu opens at the app's root, where a
           link would use the Carnet's view even when the dive is shown in another section. -->
      {#if theme.ios}
        <MenuItem icon="plan" text={t('detail.plan')} onclick={() => f7router.navigate(`/plan/${diveId}`)} />
      {/if}
      <MenuItem
        icon="renumber"
        text={t('renumberDive.title')}
        onclick={() => {
          f7.popover.close(`#${menuId}`);
          renumbering = true;
        }}
      />
      {#if removableFromTrip}
        <MenuItem icon="tripRemove" text={t('detail.removeFromTrip')} onclick={removeFromTrip} />
      {/if}
      {#if theme.ios}
        <MenuItem
          icon="share"
          text={t('share.title')}
          onclick={() => {
            f7.popover.close(`#${menuId}`);
            sharing = true;
          }}
        />
      {/if}
      <li class="od-menu-divider" role="separator"></li>
      <!-- Alarm colour on Android (floating toolbar menu); iOS keeps ink. -->
      <MenuItem icon="delete" text={t('detail.delete')} destructive={!theme.ios} onclick={deleteNow} />
    </List>
  </Popover>

  {#if failed}
    <Block>
      <h2 class="od-state-title">{t('detail.errorTitle')}</h2>
      <p>{t('detail.errorText')}</p>
    </Block>
  {:else if !dive}
    <div class="skeleton-text" aria-busy="true" aria-label={t('detail.loading')}>
      <div class="od-dive-detail--head" aria-hidden="true">
        <p class="od-dive-detail--day">––––––––––––––</p>
        <h1 class="od-dive-detail--site">––––––––</h1>
      </div>
      <div class="skeleton-block od-dive-detail--skeleton-profile"></div>
    </div>
  {:else}
    <div class="od-dive-detail--hero" use:watchScroll>
      {#if dive.siteCoordinates}
        <SiteHeaderImage latUdeg={dive.siteCoordinates.latUdeg} lonUdeg={dive.siteCoordinates.lonUdeg} onshown={(shown) => (imageShown = shown)} />
      {/if}
    <header class="od-dive-detail--head">
      <p class="od-dive-detail--day od-value">
        {#if dive.number}<strong>{t('detail.number', { number: String(dive.number) })}</strong>&emsp;{/if}{formatDiveDay(dive.date)}
      </p>
      <h1 class="od-dive-detail--site" class:od-dive-detail--not-set={!dive.site}>{dive.site || t('dive.siteNotSet')}</h1>
      {#if location || trip}
        <p class="od-dive-detail--location">
          {location}{#if location && trip}{' · '}{/if}{#if trip}<a href="/trips/{trip.id}">{t('detail.tripLine', { name: trip.location })}</a>{/if}
        </p>
      {/if}
      {#if dive.rating > 0}
        <p class="od-dive-detail--rating">
          <Stars value={dive.rating} size={18} label={t('detail.ratingLabel', { n: dive.rating })} />
        </p>
      {/if}
    </header>
    </div>

    <DiveFigures {dive} {prefs} />

    <DiveProfile
      samples={dive.samples}
      cylinders={dive.cylinders}
      divemode={dive.divemode}
      maxDepthMm={dive.maxDepthMm}
      durationSeconds={dive.durationSeconds}
      {prefs}
    />

    {#if facts.length}
      <dl class="od-dive-detail--facts">
        {#each facts as fact (fact.label)}
          <div class="od-dive-detail--fact"><dt>{fact.label}</dt><dd class="od-value">{fact.value}</dd></div>
        {/each}
      </dl>
    {/if}

    {#if conditions.length}
      <!-- Collapsed by default, with a summary of the filled-in conditions. -->
      <section class="od-dive-detail--section">
        <div class="od-dive-detail--group">
          <button type="button" class="od-dive-detail--disclosure" aria-expanded={conditionsOpen} onclick={() => (conditionsOpen = !conditionsOpen)}>
            <span class="od-dive-detail--text">
              <span class="od-dive-detail--title">{t('detail.conditions')}</span>
              {#if !conditionsOpen}<span class="od-dive-detail--summary">{conditionsSummary}</span>{/if}
            </span>
            <span class="od-dive-detail--arrow" class:od-dive-detail--open={conditionsOpen}><Icon name="expand" size={22} weight={2} /></span>
          </button>
          {#if conditionsOpen}
            {#each conditions as condition (condition.key)}
              <div class="od-dive-detail--row">
                <span>{condition.name}</span>
                <Stars value={condition.value} label={t('detail.starsLabel', { name: condition.name, n: condition.value })} />
              </div>
            {/each}
          {/if}
        </div>
      </section>
    {/if}

    {#if dive.guides.length || dive.buddies.length}
      <section class="od-dive-detail--section">
        <h2 class="od-dive-detail--section-title">{t('detail.people')}</h2>
        <div class="od-dive-detail--group">
          {#if dive.guides.length}
            <div class="od-dive-detail--row"><span>{t('detail.guideRow', { n: dive.guides.length })}</span><span class="od-dive-detail--tags od-dive-detail--end">{#each dive.guides as name, i (i)}<span class="od-dive-detail--tag">{name}</span>{/each}</span></div>
          {/if}
          {#if dive.buddies.length}
            <div class="od-dive-detail--row"><span>{t('detail.buddiesRow', { n: dive.buddies.length })}</span><span class="od-dive-detail--tags od-dive-detail--end">{#each dive.buddies as name, i (i)}<span class="od-dive-detail--tag">{name}</span>{/each}</span></div>
          {/if}
        </div>
      </section>
    {/if}

    {#if dive.tags.length}
      <section class="od-dive-detail--section">
        <h2 class="od-dive-detail--section-title">{t('detail.tags', { n: dive.tags.length })}</h2>
        <ul class="od-dive-detail--tags">
          {#each dive.tags as tag (tag)}<li class="od-dive-detail--tag">{tag}</li>{/each}
        </ul>
      </section>
    {/if}

    {#if hasEquipment}
      <section class="od-dive-detail--section">
        <h2 class="od-dive-detail--section-title">{t('detail.gasAndEquipment')}</h2>
        <div class="od-dive-detail--group">
          {#each cylinders as cylinder, i (i)}
            <div class="od-dive-detail--cylinder">
              <div class="od-dive-detail--line">
                <span class="od-dive-detail--name"><span class="od-dive-detail--gas">{cylinder.name}</span>{#if cylinder.subtitle}<span class="od-dive-detail--type">{cylinder.subtitle}</span>{/if}</span>
                {#if cylinder.pressures}<span class="od-dive-detail--value od-value">{cylinder.pressures}</span>{/if}
              </div>
              {#if cylinder.bar}
                <div class="od-dive-detail--bar" role="img" aria-label={cylinder.bar.label}>
                  <div class="od-dive-detail--fill" style="width: {cylinder.bar.remaining}%"></div>
                  <div class="od-dive-detail--gap"></div>
                  <div class="od-dive-detail--used" style="width: {cylinder.bar.used}%"></div>
                </div>
              {/if}
              {#if cylinder.details}<div class="od-dive-detail--secondary od-value"><span>{cylinder.details}</span></div>{/if}
            </div>
          {/each}
          {#if sac}
            <div class="od-dive-detail--row"><span>{t('detail.sacFull')}</span><span class="od-dive-detail--value od-value">{sac}</span></div>
          {/if}
          {#if dive.suit}
            <div class="od-dive-detail--row"><span>{t('detail.suitRow')}</span><span class="od-dive-detail--value">{dive.suit}</span></div>
          {/if}
          {#if weights.length === 1}
            <div class="od-dive-detail--row">
              <span class="od-dive-detail--stacked"><span>{t('detail.weights')}</span>{#if weights[0].place}<span class="od-dive-detail--sub">{weights[0].place}</span>{/if}</span>
              <span class="od-dive-detail--value od-value">{weights[0].weight}</span>
            </div>
          {:else if weights.length > 1}
            <div class="od-dive-detail--weights">
              <div class="od-dive-detail--total"><span>{t('detail.weights')}</span><span class="od-value">{weightTotal}</span></div>
              <ul aria-label={t('detail.weightsByPlace')}>
                {#each weights as weight, i (i)}
                  <li class="od-value"><span>{weight.place || t('detail.weights')}</span><span>{weight.weight}</span></li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    {#if computers.length}
      <section class="od-dive-detail--section">
        <h2 class="od-dive-detail--section-title">{t('detail.computers')}</h2>
        <div class="od-dive-detail--group">
          {#each computers as computer, i (i)}
            <div class="od-dive-detail--row"><span class="od-dive-detail--stacked"><span>{computer.model}</span><span class="od-dive-detail--sub">{computer.role}</span></span></div>
          {/each}
        </div>
      </section>
    {/if}

    {#if dive.pictures > 0}
      <section class="od-dive-detail--section">
        <h2 class="od-dive-detail--section-title">{t('detail.photos')}</h2>
        <div class="od-dive-detail--group">
          <div class="od-dive-detail--row">
            <span class="od-dive-detail--stacked"><span>{t('detail.photoCount', { n: dive.pictures })}</span><span class="od-dive-detail--sub">{t('detail.photoNote')}</span></span>
          </div>
        </div>
      </section>
    {/if}

    {#if dive.notes.trim()}
      <section class="od-dive-detail--section">
        <h2 class="od-dive-detail--section-title">{t('detail.notes')}</h2>
        <!-- Shown in full, line breaks kept: no "Read more". -->
        <p class="od-dive-detail--group od-dive-detail--notes">{dive.notes}</p>
      </section>
    {/if}
    <div class="od-dive-detail--end" aria-hidden="true"></div>
  {/if}

  {#snippet fixedContent()}
    <!-- Android: the actions in a floating toolbar (Material 3 Expressive); iOS keeps the top bar. -->
    {#if !theme.ios && dive && !failed}
      <FloatingToolbar
        label={t('detail.actions')}
        clearFab={layout.split && !layout.rail && navigation.section === 'logbook'}
        actions={[
          { key: 'edit', icon: 'edit', label: t('detail.edit'), text: t('detail.edit'), onclick: () => f7router.navigate(`/dives/${diveId}/edit`) },
          { key: 'share', icon: 'share', label: t('share.title'), onclick: () => (sharing = true) },
          // This page's router, not a link: see the overflow menu.
          { key: 'plan', icon: 'plan', label: t('detail.plan'), onclick: () => f7router.navigate(`/plan/${diveId}`) },
          { key: 'more', icon: 'more', label: t('detail.moreOptionsList'), menu: `#${menuId}` },
        ]}
      />
    {/if}
  {/snippet}
</Page>

{#if sharing}
  <ShareSheet onpdf={() => share('pdf')} onsummary={() => share('summary')} onclose={() => (sharing = false)} />
{/if}

{#if renumbering && dive}
  <RenumberDiveDialog
    id={dive.id}
    number={dive.number}
    oncancel={() => (renumbering = false)}
    ondone={() => {
      renumbering = false;
      loadDive();
    }}
  />
{/if}

<style>
  @layer od.components {
    .od-dive-detail--hero {
      position: relative;
    }

    /* 16 px under the top bar, as in the detail3 mock-ups. */
    .od-dive-detail--head {
      position: relative;
      padding: 16px 20px 0;
    }

    .od-dive-detail--day {
      margin: 0;
      font-size: 15px;
      color: var(--od-text-2);

      strong {
        font-weight: 800;
        color: var(--od-text);
      }
    }

    .od-dive-detail--site {
      margin: 2px 0 0;
      font-size: 34px;
      line-height: 40px;
      font-weight: 800;
      letter-spacing: -0.4px;
      color: var(--od-text);

      &.od-dive-detail--not-set {
        color: var(--od-text-2);
      }
    }

    .od-dive-detail--skeleton-profile {
      height: 180px;
      margin: 14px 16px 0;
      border-radius: 16px;
    }

    .od-dive-detail--facts {
      margin: 8px 20px 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      column-gap: 12px;
    }

    .od-dive-detail--fact {
      padding: 9px 0;
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
        font-size: 16px;
        font-weight: 600;
        color: var(--od-text);
        /* Between words only; a word longer than the column still breaks. */
        overflow-wrap: break-word;
      }
    }

    .od-dive-detail--location {
      --f7-theme-color: var(--od-text);
      margin: 2px 0 0;
      font-size: 15px;
      color: var(--od-text-2);

      a {
        font-weight: 600;
      }
    }

    .od-dive-detail--section {
      margin: 22px 16px 0;
    }

    .od-dive-detail--section-title {
      margin: 0 0 8px;
      font-family: var(--od-title-font);
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    /* Grouped list in a rounded block, as in the mock-ups (iOS grouped list, MD3 list). */
    .od-dive-detail--group {
      border-radius: 16px;
      background: var(--od-surface);
      color: var(--od-text);
      overflow: hidden;
    }

    .od-dive-detail--cylinder {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;

      & + & {
        border-top: 1px solid var(--od-separator);
      }
    }

    .od-dive-detail--line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }

    .od-dive-detail--name {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0 4px;

      .od-dive-detail--gas {
        font-size: 16px;
        font-weight: 700;
      }

      .od-dive-detail--type {
        font-size: 14px;
        color: var(--od-text-2);
      }
    }

    .od-dive-detail--cylinder .od-dive-detail--value {
      font-size: 16px;
      font-weight: 700;
      white-space: nowrap;
    }

    /* From 0 to the working pressure: what is left, then what was used. */
    .od-dive-detail--bar {
      display: flex;
      height: 8px;
      border-radius: 4px;
      background: var(--od-gauge-track);
      overflow: hidden;

      > div {
        flex: none;
      }

      .od-dive-detail--fill {
        background: var(--od-tertiary);
      }

      .od-dive-detail--gap {
        width: 2px;
        background: var(--od-surface);
      }

      .od-dive-detail--used {
        background: var(--od-gauge-used);
      }
    }

    .od-dive-detail--secondary {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: var(--od-text-2);
    }

    .od-dive-detail--row {
      box-sizing: border-box;
      min-height: 44px;
      padding: 0 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 16px;
      border-top: 1px solid var(--od-separator);

      /* MD3: one-line list item, 56 dp. */
      :global(.md) & {
        min-height: 56px;
        padding: 10px 16px;
      }

      &:first-child {
        border-top: none;
      }

      .od-dive-detail--value {
        font-size: 14px;
        color: var(--od-text-2);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
    }

    /* A label with a second line under it (weight location, computer role, photos). */
    /* Several weights: the total, then one line per location, no dividers. */
    .od-dive-detail--weights {
      padding: 16px 16px 14px;
      border-top: 1px solid var(--od-separator);

      .od-dive-detail--total {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        font-size: 16px;
        line-height: 24px;
        color: var(--od-text);

        .od-value {
          font-weight: 600;
        }
      }

      ul {
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }
    }

    .od-dive-detail--stacked {
      padding: 10px 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      :global(.md) & {
        padding: 0;
      }

      .od-dive-detail--sub {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);

        :global(.md) & {
          font-size: 14px;
          line-height: 20px;
        }
      }
    }

    /* Overall rating under the title. */
    .od-dive-detail--rating {
      margin: 8px 0 0;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    /* Header of the collapsible Conditions block. */
    .od-dive-detail--disclosure {
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;

      .od-dive-detail--text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .od-dive-detail--title {
        font-size: 16px;
        font-weight: 600;
      }

      .od-dive-detail--summary {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }

      .od-dive-detail--arrow {
        display: block;
        color: var(--od-text-2);

        &.od-dive-detail--open {
          transform: rotate(180deg);
        }
      }
    }

    .od-dive-detail--disclosure + .od-dive-detail--row {
      border-top: 1px solid var(--od-separator);
    }

    /* Tags and people: 32 px chips on the tint. */
    .od-dive-detail--tags {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;

      &.od-dive-detail--end {
        justify-content: flex-end;
      }
    }

    .od-dive-detail--tag {
      height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      background: var(--od-tint);
      color: var(--od-on-tint);
      font-size: 14px;
      display: inline-flex;
      align-items: center;
    }

    /* Space after the last block, so that it never touches the bottom bar. */
    .od-dive-detail--end {
      height: 32px;
    }

    .od-dive-detail--notes {
      margin: 0;
      padding: 12px 16px;
      font-size: 16px;
      line-height: 22px;
      white-space: pre-line;
    }
  }

  /* Framework7's variable, outside the layers: the top bar is the page's colour on Android. */
  :global(.md .od-dive-detail > .navbar) {
    --f7-navbar-bg-color: var(--od-background);
  }

  :global(.od-dive-detail.od-dive-detail--on-image > .navbar) {
    --f7-navbar-bg-color: transparent;
  }
</style>
