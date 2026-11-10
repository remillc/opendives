<script>
  // @ts-check
  // Free filter (docs/mockups/ios-filtre.dc.html; spec, section 4, "Filters",
  // and section 5, "Filter criteria"). Full screen: Cancel, the title, "Clear
  // all"; a field that filters the criteria; the dive mode first; the
  // equipment; the other criteria in groups that open; at the bottom, "Show
  // the N dives", whose count follows the criteria. Each criterion opens its
  // own screen. A criterion that applies to no dive of the logbook is not
  // shown. Never offered: weight, weight type, start and end pressures, water
  // density, nitrogen percentage. The filters saved in the logbook come first;
  // "Save this filter" keeps the criteria under a name (Subsurface's filter
  // presets, one undoable step each). Android follows
  // docs/mockups/filtre-android.dc.html; iOS keeps its inset lists.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, List, ListItem, Searchbar, f7, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import Md3Dialog from '../components/Md3Dialog.svelte';
  import TextField from '../components/TextField.svelte';
  import { logbook, undoLastChange } from '../lib/logbook.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { showSnackbar } from '../lib/snackbar.js';
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
    isEmpty,
    combinedRows,
    gearRows,
    gearValue,
    rowCriteria,
    loadPresets,
    savePreset,
    deletePreset,
    presetCriteria,
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
    loadPresets();
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

  /** The dive mode is a choice only when the logbook has more than one mode. */
  const showMode = $derived(!!filter.options && filter.options.modes.length > 1);

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

  // "Save this filter": a name, then one undoable step.
  let naming = $state(false);
  let presetName = $state('');
  let saveError = $state('');

  function startSaving() {
    presetName = filter.draft.preset?.name ?? '';
    saveError = '';
    naming = true;
  }

  /** @param {string} text */
  function undoToast(text) {
    offerUndo(text, () => loadPresets());
  }

  async function confirmSave() {
    const name = presetName.trim();
    if (!name) {
      saveError = t('filter.nameRequired');
      return;
    }
    try {
      await savePreset(name, filter.draft, logbook.prefs);
      naming = false;
      undoToast(t('filter.saved', { name }));
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Save a filter', code);
      saveError = code.startsWith('NOT_IN_PRESET')
        ? t('filter.notInPreset')
        : code.startsWith('WRITE_LOCKED')
          ? t('edit.writeLocked')
          : t('filter.saveFailed');
    }
  }

  /** @param {import('opendives-core').FilterPreset} p */
  async function deleteNow(p) {
    try {
      await deletePreset(p.index);
      undoToast(t('filter.deleted', { name: p.name }));
    } catch (e) {
      console.error('Delete a filter', e);
      showSnackbar(t('filter.deleteFailed'));
    }
  }

  /** Android: at once, with Undo. iOS: after a confirmation. @param {import('opendives-core').FilterPreset} p */
  function removePreset(p) {
    if (!theme.ios) {
      deleteNow(p);
      return;
    }
    confirmAction({
      title: t('filter.deleteTitle', { name: p.name }),
      text: t('filter.deleteText'),
      action: t('filter.delete'),
      onConfirm: () => deleteNow(p),
    });
  }

  /** The saved filter whose criteria are exactly those on the page. */
  const appliedPreset = $derived.by(() => {
    const draft = JSON.stringify(filter.draft);
    return filter.presets.find((p) => JSON.stringify(presetCriteria(p, logbook.prefs)) === draft)?.name ?? null;
  });

  /** @param {import('opendives-core').FilterPreset} p */
  function applyPreset(p) {
    filter.draft = presetCriteria(p, logbook.prefs);
  }

  /** @param {{ key: keyof import('../lib/filter.svelte.js').Criteria }} k */
  const criterionValue = (k) => valueText(k.key, filter.draft, logbook.prefs, (id) => tripNames.get(id) ?? id);

  const showText = $derived(
    filter.draftCount === null ? t('filter.show') : t('filter.showCount', { n: filter.draftCount }),
  );
</script>

{#snippet criterionRow(/** @type {string} */ row, /** @type {string} */ title, /** @type {string} */ value, /** @type {boolean} */ active, nested = false)}
  <a href="/filter/{row}" class="od-filter--row" class:od-filter--row-set={active} class:od-filter--row-nested={nested}>
    <span class="od-filter--row-text">
      <span class="od-filter--row-title">{title}</span>
      <span class="od-filter--row-value">{value}</span>
    </span>
    <span class="od-filter--row-icon"><Icon name="chevron" size={20} /></span>
  </a>
{/snippet}

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
      <Link class="od-filter--clear" onClick={clearAll}>{t('filter.clearAll')}</Link>
    {/snippet}
  </Navbar>

  {#if theme.ios}
    <Searchbar
      inline
      customSearch
      disableButton={false}
      placeholder={t('filter.searchCriterion')}
      onSearchbarSearch={(/** @type {any} */ _sb, /** @type {string} */ q) => (search = q)}
      onSearchbarClear={() => (search = '')}
    />
  {:else}
    <label class="od-filter--search">
      <Icon name="search" />
      <input type="search" aria-label={t('filter.searchCriterion')} placeholder={t('filter.searchCriterion')} bind:value={search} />
    </label>
  {/if}

  {#if filter.presets.length && !search.trim()}
    <h2 class="od-filter--group-title">{t('filter.savedFilters')}</h2>
    {#if theme.ios}
      <List inset strong dividers class="od-filter--criteria">
        {#each filter.presets as p (p.name)}
          <li class:od-filter--set={appliedPreset === p.name}>
            <div class="item-content od-filter--preset-row">
              <button type="button" class="od-filter--preset-ios" aria-pressed={appliedPreset === p.name} onclick={() => applyPreset(p)}>
                <span class="od-filter--preset-name-ios">{p.name}</span>
                {#if appliedPreset === p.name}<Icon name="check" size={20} weight={2} />{/if}
              </button>
              <button type="button" class="od-icon-button" aria-label={t('filter.deleteNamed', { name: p.name })} onclick={() => removePreset(p)}>
                <Icon name="close" size={20} />
              </button>
            </div>
          </li>
        {/each}
      </List>
    {:else}
      <div class="od-filter--card">
        {#each filter.presets as p (p.name)}
          {@const on = appliedPreset === p.name}
          <div class="od-filter--preset" class:od-filter--preset-on={on}>
            <button type="button" class="od-filter--preset-apply" aria-pressed={on} onclick={() => applyPreset(p)}>
              {#if on}<Icon name="check" size={20} weight={2.2} />{/if}
              <span class="od-filter--preset-name">{p.name}</span>
            </button>
            <button type="button" class="od-filter--preset-delete" aria-label={t('filter.deleteNamed', { name: p.name })} onclick={() => removePreset(p)}>
              <Icon name="close" size={20} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if showMode && !search.trim()}
    <h2 class="od-filter--group-title" id="od-filter-mode">{t('filter.mode')}</h2>
    <div class="od-filter--mode">
      <!-- iOS segmented control; Android, MD3 segmented buttons (check mark on the selected one). -->
      <div class="od-filter--segmented-choice" role="radiogroup" aria-labelledby="od-filter-mode">
        {#each modes as mode (mode)}
          <button
            type="button"
            role="radio"
            class:od-filter--selected={filter.draft.mode === mode}
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

  {#if !theme.ios}
    {@const gear = shown.find((g) => g.group === 'gear')}
    {@const others = shown.filter((g) => g.group !== 'gear' && g.keys.length)}
    {#if gear?.keys.length}
      <h2 class="od-filter--group-title">{t('filter.groups.gear')}</h2>
      <div class="od-filter--card">
        {#each gearRows(gear.keys) as row (row)}
          {@render criterionRow(
            row,
            row in combinedRows ? t(`filter.combined.${row}`) : label(row),
            gearValue(row, filter.options, filter.draft, logbook.prefs),
            rowCriteria(row, filter.options).some((k) => isSet(k, filter.draft)),
          )}
        {/each}
      </div>
    {/if}
    {#if others.length}
      <h2 class="od-filter--group-title">{t('filter.otherCriteria')}</h2>
      <div class="od-filter--card">
        {#each others as g (g.group)}
          {@const open = opened[g.group] || !!search.trim()}
          <div class="od-filter--group">
            <button type="button" class="od-filter--row" aria-expanded={open} onclick={() => (opened[g.group] = !opened[g.group])}>
              <span class="od-filter--row-text">
                <span class="od-filter--row-title">
                  {t(`filter.groups.${g.group}`)}
                  {#if setInGroup(g.group)}<span class="od-filter--group-count">{t('filter.setCount', { n: setInGroup(g.group) })}</span>{/if}
                </span>
                <span class="od-filter--row-value">{hint(g.group)}</span>
              </span>
              <span class="od-filter--row-icon" class:od-filter--row-icon-up={open}><Icon name="expand" size={20} /></span>
            </button>
            {#if open}
              {#each g.keys as k (k.key)}
                {@render criterionRow(k.key, label(k.key), criterionValue(k), isSet(k.key, filter.draft), true)}
              {/each}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#each theme.ios ? shown : [] as g (g.group)}
    {#if g.keys.length}
      {#if g.group === 'gear'}
        <h2 class="od-filter--group-title">{t('filter.groups.gear')}</h2>
        <List inset={theme.ios} strong={theme.ios} dividers={theme.ios} class="od-filter--criteria">
          {#each g.keys as k (k.key)}
            <ListItem
              link="/filter/{k.key}"
              title={label(k.key)}
              after={valueText(k.key, filter.draft, logbook.prefs, (id) => tripNames.get(id) ?? id)}
              class={isSet(k.key, filter.draft) ? 'od-filter--set' : ''}
            />
          {/each}
        </List>
      {:else}
        {#if g.group === 'when'}<h2 class="od-filter--group-title">{t('filter.otherCriteria')}</h2>{/if}
        <List inset={theme.ios} strong={theme.ios} dividers={theme.ios} class="od-filter--criteria od-filter--groups">
          <li class="od-filter--group-ios" class:od-filter--open={opened[g.group] || !!search.trim()}>
            <button
              type="button"
              class="od-filter--group-button"
              aria-expanded={opened[g.group] || !!search.trim()}
              onclick={() => (opened[g.group] = !opened[g.group])}
            >
              <span class="od-filter--group-text">
                <span class="od-filter--group-label">
                  {t(`filter.groups.${g.group}`)}
                  {#if setInGroup(g.group)}<span class="od-filter--group-count">{t('filter.setCount', { n: setInGroup(g.group) })}</span>{/if}
                </span>
                <span class="od-filter--group-hint">{hint(g.group)}</span>
              </span>
              <span class="od-filter--expand"><Icon name="expand" size={20} /></span>
            </button>
          </li>
          {#if opened[g.group] || search.trim()}
            {#each g.keys as k (k.key)}
              <ListItem
                link="/filter/{k.key}"
                title={label(k.key)}
                after={valueText(k.key, filter.draft, logbook.prefs, (id) => tripNames.get(id) ?? id)}
                class={isSet(k.key, filter.draft) ? 'od-filter--set od-filter--in-group' : 'od-filter--in-group'}
              />
            {/each}
          {/if}
        </List>
      {/if}
    {/if}
  {/each}

  {#snippet fixedContent()}
    <div class="od-filter--bottom">
      <button type="button" class="od-filter--show" onclick={show} disabled={filter.draftCount === 0}>{showText}</button>
      <button type="button" class="od-text-button od-filter--save" onclick={startSaving} disabled={isEmpty(filter.draft)}>{t('filter.save')}</button>
    </div>
  {/snippet}
</Page>

{#if naming}
  <Md3Dialog class="od-filter" title={t('filter.saveTitle')} text={t('filter.saveText')} oncancel={() => (naming = false)}>
    <div class="od-filter--name-field">
      <TextField label={t('filter.name')} bind:value={presetName} invalid={!!saveError} supporting={saveError} />
    </div>
    {#snippet actions()}
      <button type="button" onclick={() => (naming = false)}>{t('dialog.cancel')}</button>
      <button type="button" onclick={confirmSave}>{t('filter.saveConfirm')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    :global(.od-filter .page-content) {
      padding-bottom: 160px;
    }

    .od-filter--group-title {
      margin: 20px 16px 8px;
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text-2);

      :global(.ios) & {
        margin: 18px 16px 6px 32px;
        font-size: 13px;
        font-weight: 400;
      }
    }

    .od-filter--search {
      margin: 8px 16px 0;
      height: 56px;
      padding: 0 16px;
      border-radius: 28px;
      background: var(--od-surface-2);
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      gap: 16px;

      input {
        flex: 1;
        min-width: 0;
        height: 100%;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--od-text);
        font: inherit;
        font-size: 16px;
        outline: none;
      }
    }

    .od-filter--card {
      margin: 0 16px;
      border-radius: 16px;
      background: var(--od-surface);
      overflow: hidden;

      & > :global(* + *) {
        border-top: 1px solid var(--od-separator);
      }
    }

    .od-filter--group > :global(* + *) {
      border-top: 1px solid var(--od-separator);
    }

    .od-filter--row {
      width: 100%;
      min-height: 56px;
      padding: 8px 20px 8px 16px;
      box-sizing: border-box;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }

    button.od-filter--row {
      border: none;
    }

    :global(.md .od-filter--clear) {
      font-size: 14px;
      font-weight: 600;
    }

    .od-filter--row-nested {
      padding-inline-start: 32px;
    }

    .od-filter--row-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-filter--row-title {
      font-size: 16px;
      line-height: 24px;
    }

    .od-filter--row-value {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-filter--row-set {
      background: var(--od-surface-2);

      .od-filter--row-value {
        color: var(--od-text);
        font-weight: 600;
      }
    }

    .od-filter--row-icon {
      flex: none;
      display: flex;
      color: var(--od-text-2);
      transition: transform 0.2s;
    }

    .od-filter--row-icon-up {
      transform: rotate(180deg);
    }

    .od-filter--preset {
      min-height: 56px;
      padding: 4px 8px 4px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .od-filter--preset-on {
      background: var(--od-surface-2);

      .od-filter--preset-name {
        font-weight: 600;
      }
    }

    .od-filter--preset-apply {
      flex: 1;
      min-width: 0;
      min-height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }

    .od-filter--preset-name {
      flex: 1;
      font-size: 16px;
      line-height: 24px;
    }

    .od-filter--preset-delete {
      flex: none;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .od-filter--mode {
      margin: 0 16px;
    }

    .od-filter--segmented-choice {
      display: grid;
      grid-template-columns: 1fr 1.4fr 1.2fr;
      border: 1px solid var(--od-chip-outline);
      border-radius: 20px;
      overflow: hidden;

      button {
        min-height: 40px;
        padding: 0 8px;
        border: none;
        border-radius: 0;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.1px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;

        & + button {
          border-inline-start: 1px solid var(--od-chip-outline);
        }

        &.od-filter--selected {
          background: var(--od-tint);
          color: var(--od-on-tint);
        }
      }

      :global(.ios) & {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        padding: 2px;
        border: none;
        border-radius: 9px;
        background: var(--od-surface-2);

        button {
          min-height: 40px;
          border: none;
          border-inline-start: none;
          border-radius: 7px;
          font-size: 15px;
          font-weight: 400;
          letter-spacing: 0;

          &.od-filter--selected {
            background: var(--od-surface);
            font-weight: 600;
            box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
          }
        }
      }
    }

    /* A set criterion: its value in ink and bold (iOS board), on a tint. */
    :global(.od-filter .od-filter--criteria .od-filter--set .item-after) {
      color: var(--od-text);
      font-weight: 600;
    }

    :global(.od-filter .od-filter--criteria .item-after) {
      max-width: 55%;
      white-space: normal;
      text-align: end;
    }

    :global(.od-filter .od-filter--criteria .od-filter--in-group .item-content) {
      padding-inline-start: 32px;
    }

    .od-filter--group-button {
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

    .od-filter--group-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-filter--group-label {
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .od-filter--group-count {
      margin-inline-start: 8px;
      font-size: 14px;
      font-weight: 600;
    }

    .od-filter--group-hint {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 13px;
      }
    }

    .od-filter--expand {
      color: var(--od-text-2);
      transition: transform 0.2s;
    }

    .od-filter--open .od-filter--expand {
      transform: rotate(180deg);
    }

    .od-filter--preset-row {
      padding-inline-end: 4px;
      gap: 4px;
    }

    .od-filter--preset-ios {
      flex: 1;
      min-height: 56px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .od-filter--preset-name-ios {
      flex: 1;
    }

    .od-filter--save {
      display: flex;
      margin: 4px auto 0;

      :global(.md) & {
        font-weight: 600;
        color: var(--od-text);
      }
    }

    .od-filter--name-field {
      --od-field-margin: 24px;
    }

    .od-filter--bottom {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      z-index: 10;
      padding: 12px 16px calc(20px + var(--f7-safe-area-bottom, 0px));
      background: var(--od-background);
      border-top: 1px solid var(--od-separator);

      :global(.ios) & {
        padding-bottom: calc(16px + var(--f7-safe-area-bottom, 0px));
      }
    }

    /* The screen's main action: MD3 filled button, iOS large filled button. */
    .od-filter--show {
      width: 100%;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 16px;
      font-weight: 600;
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
