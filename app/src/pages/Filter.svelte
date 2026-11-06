<script>
  // @ts-check
  // Free filter (docs/mockups/ios-filtre.dc.html; spec, section 4, "Filters",
  // and section 5, "Filter criteria"). Full screen: Cancel, the title, "Clear
  // all"; a field that filters the criteria; the dive mode first; the
  // equipment; the other criteria in groups that open; at the bottom, "Show
  // the N dives", whose count follows the criteria. Each criterion opens its
  // own screen. A criterion that applies to no dive of the logbook is not
  // shown. Never offered: weight, weight type, start and end pressures, water
  // density, nitrogen percentage.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, List, ListItem, Searchbar, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import {
    filter,
    groups,
    applies,
    startDraft,
    countDraft,
    applyFilter,
    emptyCriteria,
    valueText,
    isSet,
  } from '../lib/filter.svelte.js';
  import { t } from '../lib/i18n.js';
  import { formatLongDate } from '../lib/format.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  let search = $state('');
  /** Groups opened, by name. */
  let opened = $state(/** @type {Record<string, boolean>} */ ({}));

  onMount(() => {
    startDraft();
  });

  // The count follows every change of the draft.
  $effect(() => {
    JSON.stringify(filter.draft);
    countDraft(logbook.prefs);
  });

  /** Trip names, from the logbook list (identifiers of this load). */
  const tripNames = $derived.by(() => {
    /** @type {Map<string, string>} */
    const names = new Map();
    for (const d of [...logbook.dives].sort((a, b) => a.date.localeCompare(b.date))) {
      if (d.trip && !names.has(String(d.trip.id)))
        names.set(String(d.trip.id), d.trip.location || t('trip.startingOn', { date: formatLongDate(d.date) }));
    }
    return names;
  });

  /** Rebreather modes in the logbook: only then is the dive mode a choice. */
  const showMode = $derived(
    !filter.options || filter.options.modes.some((m) => m === 'CCR' || m === 'PSCR'),
  );

  /** @param {string} key */
  const label = (key) => t(`filter.criteria.${key}`);
  /** @param {string} key */
  const hint = (key) => t(`filter.hints.${key}`);

  /** Criteria shown in a group: those that apply, and that match the search. */
  const shown = $derived(
    groups.map((g) => ({
      group: g.group,
      keys: g.keys.filter((k) => {
        if (k.key === 'trips' && tripNames.size === 0) return false;
        if (!applies(k, filter.options)) return false;
        const q = search.trim().toLocaleLowerCase();
        return !q || label(k.key).toLocaleLowerCase().includes(q) || t(`filter.groups.${g.group}`).toLocaleLowerCase().includes(q);
      }),
    })),
  );

  /** @param {string} group */
  const setInGroup = (group) => shown.find((g) => g.group === group)?.keys.filter((k) => isSet(k.key, filter.draft)).length ?? 0;

  /** @type {import('../lib/filter.svelte.js').Criteria['mode'][]} */
  const modes = ['all', 'oc', 'rebreather'];

  /** @param {import('../lib/filter.svelte.js').Criteria['mode']} mode */
  function setMode(mode) {
    filter.draft.mode = mode;
  }

  function clearAll() {
    filter.draft = emptyCriteria();
  }

  async function show() {
    await applyFilter(filter.draft, logbook.prefs);
    f7router.back();
  }

  const showText = $derived(
    filter.draftCount === null ? t('filter.show') : t('filter.showCount', { n: filter.draftCount }),
  );
</script>

<Page class="od-filter">
  <Navbar title={t('filter.title')}>
    {#snippet left()}
      {#if theme.ios}
        <Link back>{t('filter.cancel')}</Link>
      {:else}
        <Link back iconOnly><Icon name="close" /><span class="od-sr-only">{t('filter.cancel')}</span></Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={clearAll}>{t('filter.clearAll')}</Link>
    {/snippet}
  </Navbar>

  <Searchbar
    inline
    customSearch
    disableButton={false}
    placeholder={t('filter.searchCriterion')}
    onSearchbarSearch={(/** @type {any} */ _sb, /** @type {string} */ q) => (search = q)}
    onSearchbarClear={() => (search = '')}
  />

  {#if showMode && !search.trim()}
    <h2 class="group-title" id="od-filter-mode">{t('filter.mode')}</h2>
    <div class="mode">
      <!-- iOS segmented control; Android, MD3 segmented buttons (check mark on the selected one). -->
      <div class="segmented-choice" role="radiogroup" aria-labelledby="od-filter-mode">
        {#each modes as mode (mode)}
          <button
            type="button"
            role="radio"
            class:selected={filter.draft.mode === mode}
            aria-checked={filter.draft.mode === mode}
            onclick={() => setMode(mode)}
          >
            {#if !theme.ios && filter.draft.mode === mode}<Icon name="check" size={18} weight={2} />{/if}
            {t(`filter.modes.${mode}`)}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#each shown as g (g.group)}
    {#if g.keys.length}
      {#if g.group === 'gear'}
        <h2 class="group-title">{t('filter.groups.gear')}</h2>
        <List inset={theme.ios} strong={theme.ios} dividers={theme.ios} class="criteria">
          {#each g.keys as k (k.key)}
            <ListItem
              link="/filter/{k.key}/"
              title={label(k.key)}
              after={valueText(k.key, filter.draft, logbook.prefs, (id) => tripNames.get(id) ?? id)}
              class={isSet(k.key, filter.draft) ? 'set' : ''}
            />
          {/each}
        </List>
      {:else}
        {#if g.group === 'when'}<h2 class="group-title">{t('filter.otherCriteria')}</h2>{/if}
        <List inset={theme.ios} strong={theme.ios} dividers={theme.ios} class="criteria groups">
          <li class="group" class:open={opened[g.group] || !!search.trim()}>
            <button
              type="button"
              class="group-button"
              aria-expanded={opened[g.group] || !!search.trim()}
              onclick={() => (opened[g.group] = !opened[g.group])}
            >
              <span class="group-text">
                <span class="group-label">
                  {t(`filter.groups.${g.group}`)}
                  {#if setInGroup(g.group)}<span class="group-count">{t('filter.setCount', { n: setInGroup(g.group) })}</span>{/if}
                </span>
                <span class="group-hint">{hint(g.group)}</span>
              </span>
              <span class="expand"><Icon name="expand" size={20} /></span>
            </button>
          </li>
          {#if opened[g.group] || search.trim()}
            {#each g.keys as k (k.key)}
              <ListItem
                link="/filter/{k.key}/"
                title={label(k.key)}
                after={valueText(k.key, filter.draft, logbook.prefs, (id) => tripNames.get(id) ?? id)}
                class={isSet(k.key, filter.draft) ? 'set in-group' : 'in-group'}
              />
            {/each}
          {/if}
        </List>
      {/if}
    {/if}
  {/each}

  {#snippet fixedContent()}
    <div class="bottom">
      <button type="button" class="show" onclick={show} disabled={filter.draftCount === 0}>{showText}</button>
    </div>
  {/snippet}
</Page>

<style>
  @layer od.components {
    :global(.od-filter .page-content) {
      padding-bottom: 112px;
    }

    .group-title {
      margin: 18px 16px 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text-2);

      :global(.ios) & {
        margin-left: 32px;
        font-size: 13px;
        font-weight: 400;
      }
    }

    .mode {
      margin: 0 16px;
    }

    .segmented-choice {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));

      button {
        min-height: 40px;
        padding: 0 8px;
        border: 1px solid var(--od-text-2);
        border-inline-start-width: 0;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.1px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;

        &:first-child {
          border-inline-start-width: 1px;
          border-start-start-radius: 20px;
          border-end-start-radius: 20px;
        }

        &:last-child {
          border-start-end-radius: 20px;
          border-end-end-radius: 20px;
        }

        &.selected {
          background: var(--od-tint);
          color: var(--od-on-tint);
        }
      }

      :global(.ios) & {
        padding: 2px;
        border-radius: 9px;
        background: var(--od-surface-2);

        button {
          min-height: 40px;
          border: none;
          border-radius: 7px;
          font-size: 15px;
          font-weight: 400;
          letter-spacing: 0;

          &.selected {
            background: var(--od-surface);
            font-weight: 600;
            box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
          }
        }
      }
    }

    /* A set criterion: its value in ink and bold (iOS board), on a tint. */
    :global(.od-filter .criteria .set .item-after) {
      color: var(--od-text);
      font-weight: 600;
    }

    :global(.od-filter .criteria .item-after) {
      max-width: 55%;
      white-space: normal;
      text-align: end;
    }

    :global(.od-filter .criteria .in-group .item-content) {
      padding-inline-start: 32px;
    }

    .group-button {
      width: 100%;
      min-height: 56px;
      padding: 6px 12px 6px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .group-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .group-label {
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .group-count {
      margin-inline-start: 8px;
      font-size: 14px;
      font-weight: 600;
    }

    .group-hint {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 13px;
      }
    }

    .expand {
      color: var(--od-text-2);
      transition: transform 0.2s;
    }

    .open .expand {
      transform: rotate(180deg);
    }

    .bottom {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      z-index: 10;
      padding: 12px 16px calc(16px + var(--f7-safe-area-bottom, 0px));
      background: var(--od-background);
      border-top: 1px solid var(--od-separator);
    }

    /* The screen's main action: MD3 filled button, iOS large filled button. */
    .show {
      width: 100%;
      height: 40px;
      border: none;
      border-radius: 20px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      cursor: pointer;

      &:disabled {
        opacity: 0.38;
      }

      :global(.ios) & {
        height: 50px;
        border-radius: 12px;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0;
      }
    }
  }
</style>
