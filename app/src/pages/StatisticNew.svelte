<script>
  // @ts-check
  // New statistic (spec, section 1, "Statistics"; Android
  // docs/mockups/stats-nouvelle-android.dc.html as a full-screen dialog, iPhone
  // ios-stats-nouvelle.dc.html as a sheet with Annuler / Enregistrer). A
  // criterion, the values found in the logbook for it with their number of
  // dives, "Add a criterion", the live result (opening the filtered result); the
  // optional name, proposed from the criteria, comes first. "Enregistrer" adds it to My
  // statistics, on this device. No chart builder.
  import { Popup, View, Page, Navbar, Link, f7, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import SelectField from '../components/SelectField.svelte';
  import KeyFigures from '../components/KeyFigures.svelte';
  import TextField from '../components/TextField.svelte';
  import LeaveGuard from '../components/LeaveGuard.svelte';
  import { isDirty } from '../lib/leave-guard.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import {
    CRITERIA,
    computeStatistics,
    criteriaName,
    criterionValues,
    encodeCriteria,
    saveStatistic,
  } from '../lib/statistics.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {import('../lib/statistics.svelte.js').Criterion[]} */
  let criteria = $state([{ field: 'suit', values: [] }]);
  let name = $state('');
  /** The name was typed: it is no longer proposed from the criteria. */
  let nameTyped = $state(false);

  // Leaving with changes asks first (components/LeaveGuard.svelte): the values
  // chosen and a name typed, against the empty form that opened.
  const dirty = () => isDirty({ values: [], name: '' }, { values: criteria.map((c) => [...c.values]).flat(), name: nameTyped ? name : '' });
  let guard = /** @type {LeaveGuard|undefined} */ (undefined);

  let result = $state(/** @type {import('../lib/statistics.svelte.js').StatsResult|null} */ (null));

  const chosen = $derived(criteria.filter((c) => c.values.length));
  const proposed = $derived(criteriaName(chosen, logbook.dives));
  const canSave = $derived(chosen.length > 0);

  $effect(() => {
    if (!nameTyped) name = proposed;
  });

  // The whole logbook, as the values and their numbers of dives (the free
  // filter applies once the statistic is shown in the section).
  $effect(() => {
    computeStatistics($state.snapshot(chosen), { ignoreFilter: true }).then((r) => (result = r));
  });

  /** Values of each field found in the logbook, with their number of dives (the core's stats_values). */
  let valuesByField = $state(/** @type {Record<string, {key: string, label: string, dives: number}[]>} */ ({}));
  $effect(() => {
    void logbook.dives;
    for (const c of criteria) {
      const field = c.field;
      if (valuesByField[field]) continue;
      criterionValues(field, logbook.dives)
        .then((values) => (valuesByField[field] = values))
        .catch((e) => console.error('Statistic values', e));
    }
  });

  /** @param {number} index @param {string} field */
  function setField(index, field) {
    criteria[index] = { field, values: [] };
  }

  /** @param {number} index @param {string} key @param {boolean} on */
  function toggle(index, key, on) {
    const values = criteria[index].values.filter((v) => v !== key);
    criteria[index].values = on ? [...values, key] : values;
  }

  function addCriterion() {
    const used = new Set(criteria.map((c) => c.field));
    const next = CRITERIA.find((f) => !used.has(f));
    if (next) criteria = [...criteria, { field: next, values: [] }];
  }

  /** @param {number} index */
  function removeCriterion(index) {
    criteria = criteria.filter((_, i) => i !== index);
  }

  function close() {
    f7.popup.close();
  }

  /** ✕ and Back: with something chosen, ask before the popup closes. */
  const cancel = () => guard?.attempt();

  function save() {
    if (!canSave) return;
    saveStatistic(name.trim() || proposed, $state.snapshot(chosen));
    close();
  }

  /** @param {Event} e */
  function onName(e) {
    nameTyped = true;
    name = /** @type {HTMLInputElement} */ (e.currentTarget).value;
  }

  const resultHref = $derived(`/statistics/result?c=${encodeCriteria(chosen)}`);

  /** Opens the filtered result in the Statistics section, behind this dialog. */
  function openResult(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    if (!canSave) return;
    close();
    f7.views.get('#view-statistics')?.router.navigate(resultHref);
  }
</script>

<Popup class="od-statistic-new" push={theme.ios} swipeToClose={theme.ios}>
  <View>
    <Page>
      <Navbar title={t(theme.ios ? 'stats.newTitleShort' : 'stats.newTitle')}>
        {#snippet left()}
          {#if theme.ios}
            <Link onClick={cancel}>{t('dialog.cancel')}</Link>
          {:else}
            <Link iconOnly onClick={cancel}><Icon name="close" /><span class="od-sr-only">{t('stats.close')}</span></Link>
          {/if}
        {/snippet}
        {#snippet right()}
          <Link class={`od-statistic-new--save${canSave ? '' : ' disabled'}`} onClick={save}>{t('edit.save')}</Link>
        {/snippet}
      </Navbar>
      <LeaveGuard bind:this={guard} noun="statistic" {dirty} {save} leave={close} canSave={() => canSave} />

      {#if theme.ios}
        <div class="block-title">{t('stats.name')}</div>
        <div class="list list-strong inset list-dividers od-statistic-new--inline-labels">
          <ul>
            <li class="item-content item-input">
              <div class="item-inner">
                <div class="item-title item-label" aria-hidden="true">{t('stats.name')}</div>
                <div class="item-input-wrap"><input type="text" aria-label={t('stats.name')} value={name} oninput={onName} /></div>
              </div>
            </li>
          </ul>
        </div>
        <p class="od-statistic-new--note">{t('stats.nameHint')}</p>
      {:else}
        <TextField label={t('stats.name')} bind:value={name} oninput={() => (nameTyped = true)} supporting={t('stats.nameHintShort')} />
      {/if}

      {#each criteria as c, index (index)}
        {@const values = valuesByField[c.field]}
        {#if theme.ios}
          <div class="block-title">{t('stats.criterion')}</div>
          <div class="list list-strong inset list-dividers">
            <ul>
              <li>
                <label class="item-content item-link od-statistic-new--select-row">
                  <div class="item-inner">
                    <div class="item-title">{t('stats.criterion')}</div>
                    <div class="item-after">{t(`stats.criteria.${c.field}`)}</div>
                  </div>
                  <select value={c.field} onchange={(e) => setField(index, e.currentTarget.value)}>
                    {#each CRITERIA as f (f)}<option value={f}>{t(`stats.criteria.${f}`)}</option>{/each}
                  </select>
                </label>
              </li>
              {#if index > 0}
                <li><button type="button" class="item-content od-statistic-new--action-row od-statistic-new--remove-row" onclick={() => removeCriterion(index)}><div class="item-inner"><div class="item-title">{t('stats.removeCriterion')}</div></div></button></li>
              {/if}
            </ul>
          </div>
          {#if index === 0}<p class="od-statistic-new--note">{t('stats.criteriaHint')}</p>{/if}
        {:else}
          <!-- MD3 exposed dropdown menu (spec, section 8). -->
          <div class="od-statistic-new--filled-field">
            <SelectField
              label={t('stats.criterion')}
              value={c.field}
              options={CRITERIA.map((f) => ({ value: f, label: t(`stats.criteria.${f}`) }))}
              onchange={(v) => setField(index, v)}
              supporting={index === 0 ? t('stats.criteriaHint') : ''}
            />
            {#if index > 0}
              <button type="button" class="od-statistic-new--text-button" onclick={() => removeCriterion(index)}>
                <Icon name="close" size={18} weight={2} />{t('stats.removeCriterion')}
              </button>
            {/if}
          </div>
        {/if}

        <div class="block-title">{t('stats.values')}</div>
        {#if values?.length}
          <div class="list list-strong inset list-dividers od-statistic-new--values">
            <ul>
              {#each values as v (v.key)}
                {@const on = c.values.includes(v.key)}
                <li>
                  {#if theme.ios}
                    <!-- iOS: a check mark at the end of the selected rows (HIG). -->
                    <button type="button" class="item-content od-statistic-new--check-row" role="checkbox" aria-checked={on} onclick={() => toggle(index, v.key, !on)}>
                      <div class="item-inner">
                        <div class="item-title">{v.label}</div>
                        <div class="item-after od-value">{t('trip.dives', { n: v.dives })}</div>
                        <span class="od-statistic-new--check" class:od-statistic-new--on={on}><Icon name="check" size={20} weight={2.6} /></span>
                      </div>
                    </button>
                  {:else}
                    <label class="item-checkbox item-content">
                      <input type="checkbox" checked={on} onchange={(e) => toggle(index, v.key, e.currentTarget.checked)} />
                      <i class="icon icon-checkbox"></i>
                      <div class="item-inner">
                        <div class="item-title">{v.label}</div>
                        <div class="item-after od-value">{t('trip.dives', { n: v.dives })}</div>
                      </div>
                    </label>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {:else if values}
          <p class="od-statistic-new--note">{t('stats.noValues')}</p>
        {/if}
      {/each}

      {#if criteria.length < CRITERIA.length}
        {#if theme.ios}
          <div class="list list-strong inset list-dividers od-statistic-new--add">
            <ul><li><button type="button" class="item-content od-statistic-new--action-row" onclick={addCriterion}><div class="item-inner"><div class="item-title">{t('stats.addCriterionEllipsis')}</div></div></button></li></ul>
          </div>
        {:else}
          <div class="od-statistic-new--add">
            <button type="button" class="od-statistic-new--text-button" onclick={addCriterion}><Icon name="plus" size={18} weight={2} />{t('stats.addCriterion')}</button>
          </div>
        {/if}
      {/if}

      <div class="block-title">{t('stats.result')}</div>
      <!-- The result card opens the filtered result (in the Statistics section, behind this dialog). -->
      <KeyFigures figures={result?.total ?? null} prefs={logbook.prefs} href={canSave ? resultHref : undefined} onclick={openResult} />

      <p class="od-statistic-new--note od-statistic-new--rules">{theme.ios ? '' : `${t('stats.rulesValues')} `}{t('stats.rules')}</p>
      <div class="od-statistic-new--end"></div>
    </Page>
  </View>
</Popup>

<style>
  @layer od.components {
    .od-statistic-new--note {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);

      &.od-statistic-new--rules {
        margin-top: 12px;
      }
    }

    /* "Enregistrer" in the top bar: a text button (spec, "Text fields"). */
    :global(.navbar .od-statistic-new--save) {
      font-weight: 500;
    }

    .od-statistic-new--filled-field {
      display: flex;
      flex-direction: column;
      align-items: flex-start;

      :global(.od-select-field) {
        align-self: stretch;
      }

      .od-statistic-new--text-button {
        margin-inline-start: 16px;
      }
    }

    /* iOS: the criterion row opens the system's picker. */
    .od-statistic-new--select-row {
      position: relative;

      select {
        position: absolute;
        inset: 0;
        opacity: 0;
        width: 100%;
      }
    }

    /* iOS action rows: bold, in the action colour. */
    .od-statistic-new--action-row {
      width: 100%;
      border: none;
      background: none;
      font: inherit;
      text-align: start;
      cursor: pointer;

      .item-title {
        font-weight: 600;
        color: var(--od-action);
      }

      &.od-statistic-new--remove-row .item-title {
        font-weight: 400;
      }
    }

    .od-statistic-new--check-row {
      width: 100%;
      border: none;
      background: none;
      font: inherit;
      color: inherit;
      text-align: start;
      cursor: pointer;
    }

    .od-statistic-new--check {
      width: 20px;
      margin-left: 10px;
      color: var(--od-action);
      visibility: hidden;

      &.od-statistic-new--on {
        visibility: visible;
      }
    }

    .od-statistic-new--add {
      margin: 8px 8px 0;

      &.list {
        margin: 22px 0 0;
      }
    }

    /* MD3 text button (40 dp, 12 dp side padding); iOS, a 44 pt text button. */
    .od-statistic-new--text-button {
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      align-self: flex-start;
      cursor: pointer;

      :global(.ios) & {
        height: 44px;
        font-size: 17px;
        letter-spacing: 0;
      }
    }

    .od-statistic-new--end {
      height: 32px;
    }
  }
</style>
