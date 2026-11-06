<script>
  // @ts-check
  // Edit a dive (docs/mockups/android-edition.dc.html; spec, section 4, "Full
  // editing and settings" and "Conditions"; docs/editing-and-sync-plan.md,
  // sections 1 and 7). Editable for now: guides, buddies, tags, notes, suit,
  // rating and conditions (rating, visibility and current; wave size, surge and
  // chill with the setting). The other fields stay visible but read only.
  // Save applies one undoable step, saves locally and closes; Undo is offered.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import ChipsField from '../components/ChipsField.svelte';
  import { logbookValues } from '../lib/people.js';
  import StarsInput from '../components/StarsInput.svelte';
  import { logbook, saveDiveChanges, undoLastChange } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import {
    formatDateTime,
    formatDepth,
    formatFullDate,
    formatMinSec,
    formatNumber,
    formatTemperature,
    formatWeight,
  } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { id: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  /** @type {import('opendives-core').DiveDetail|null} */
  let dive = $state(null);
  let failed = $state(false);
  let saving = $state(false);
  const prefs = $derived(logbook.prefs);

  // Edited values.
  /** @type {string[]} */
  let guides = $state([]);
  /** @type {string[]} */
  let buddies = $state([]);
  /** @type {string[]} */
  let tags = $state([]);
  /** People and tags already in the logbook, proposed while typing. */
  let known = $state({ guide: /** @type {string[]} */ ([]), buddy: /** @type {string[]} */ ([]), tag: /** @type {string[]} */ ([]) });
  let notes = $state('');
  let suit = $state('');
  /** @type {Record<string, number>} */
  let stars = $state({ rating: 0, visibility: 0, current: 0, wavesize: 0, surge: 0, chill: 0 });

  let conditionsOpen = $state(true);
  let equipmentOpen = $state(false);

  onMount(async () => {
    try {
      const d = await OpenDivesCore.getDive({ id: Number(f7route.params.id) });
      dive = d;
      guides = [...d.guides];
      buddies = [...d.buddies];
      tags = [...d.tags];
      const [guide, buddy, tag] = await Promise.all([logbookValues('guide'), logbookValues('buddy'), logbookValues('tag')]);
      known = { guide, buddy, tag };
      notes = d.notes;
      suit = d.suit;
      stars = {
        rating: d.rating,
        visibility: d.visibility,
        current: d.conditions?.current ?? 0,
        wavesize: d.conditions?.wavesize ?? 0,
        surge: d.conditions?.surge ?? 0,
        chill: d.conditions?.chill ?? 0,
      };
    } catch (e) {
      console.error('Edit dive', e);
      failed = true;
    }
  });

  const sameList = (/** @type {string[]} */ a, /** @type {string[]} */ b) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  /** Star fields: rating, visibility and current; the three others with the setting. */
  const starFields = $derived(
    ['rating', 'visibility', 'current', ...(settings.extraConditions ? ['wavesize', 'surge', 'chill'] : [])].map((key) => ({
      key,
      name: key === 'rating' ? t('edit.rating') : t(`detail.conditionNames.${key}`),
    })),
  );

  /** Only the fields that changed; empty when nothing did. */
  const changes = $derived.by(() => {
    if (!dive) return {};
    /** @type {Record<string, string|number|string[]>} */
    const out = {};
    if (!sameList(guides, dive.guides)) out.diveguide = [...guides];
    if (!sameList(buddies, dive.buddies)) out.buddies = [...buddies];
    if (!sameList(tags, dive.tags)) out.tags = [...tags];
    if (notes !== dive.notes) out.notes = notes;
    if (suit !== dive.suit) out.suit = suit;
    const old = { rating: dive.rating, visibility: dive.visibility, ...(dive.conditions ?? {}) };
    for (const key of Object.keys(stars)) if (stars[key] !== (old[key] ?? 0)) out[key] = stars[key];
    return out;
  });

  const conditionsSummary = $derived.by(() => {
    if (!dive) return '';
    return [
      stars.rating > 0 && t('edit.summaryRating', { n: stars.rating }),
      ...['visibility', 'current', 'wavesize', 'surge', 'chill']
        .filter((key) => stars[key] > 0)
        .map((key) => t('edit.summaryCondition', { name: t(`detail.conditionNames.${key}`).toLocaleLowerCase(), n: stars[key] })),
      formatTemperature(dive.airTempMk, prefs) && t('edit.summaryAir', { value: formatTemperature(dive.airTempMk, prefs) }),
      formatTemperature(dive.waterTempMk, prefs) && t('edit.summaryWater', { value: formatTemperature(dive.waterTempMk, prefs) }),
      dive.waterType && t('edit.summaryWaterType', { type: tIfExists(`detail.waterTypes.${dive.waterType}`) ?? '' }),
    ]
      .filter(Boolean)
      .join(' · ');
  });

  const equipmentSummary = $derived.by(() => {
    if (!dive) return '';
    const cylinders = dive.cylinders.filter((c) => c.used).length;
    const weight = dive.weights.reduce((sum, w) => sum + w.grams, 0);
    return [
      tIfExists(`detail.modes.${dive.divemode}`) ?? dive.divemode,
      suit,
      cylinders > 0 && t('edit.cylinders', { n: cylinders }),
      weight > 0 && t('edit.summaryWeight', { value: formatWeight(weight, prefs) }),
    ]
      .filter(Boolean)
      .join(' · ');
  });

  /** @param {string} text */
  function toast(text) {
    f7.toast.create({ text, closeTimeout: 3000, position: 'center' }).open();
  }

  async function save() {
    if (!dive || saving) return;
    if (!Object.keys(changes).length) {
      f7router.back();
      return;
    }
    saving = true;
    try {
      await saveDiveChanges(dive.id, changes);
      f7router.back();
      // Undo, offered for a few seconds (Android snackbar).
      offerUndo(t('edit.saved'));
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Save dive', code);
      toast(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
    } finally {
      saving = false;
    }
  }
</script>

<Page>
  <Navbar title={t('edit.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t('edit.save')}</Link>
    {/snippet}
  </Navbar>

  {#if failed}
    <div class="block"><p>{t('detail.errorText')}</p></div>
  {:else if dive}
    <p class="subtitle od-value">
      {[dive.number ? t('detail.number', { number: String(dive.number) }) : '', dive.site, formatFullDate(dive.date)].filter(Boolean).join(' · ')}
    </p>

    <div class="block-title">{t('edit.diveGroup')}</div>
    <div class="list list-strong inset list-dividers readonly">
      <ul>
        <li class="item-content"><div class="item-inner"><div class="item-title">{t('edit.number')}</div><div class="item-after od-value">{dive.number || '–'}</div></div></li>
        <li class="item-content"><div class="item-inner"><div class="item-title">{t('edit.dateTime')}</div><div class="item-after od-value">{formatDateTime(dive.date)}</div></div></li>
        <li class="item-content">
          <div class="item-inner">
            <div class="item-title">{t('edit.duration')}<div class="item-footer">{t('edit.durationNote')}</div></div>
            <div class="item-after od-value">{formatMinSec(dive.durationSeconds)}</div>
          </div>
        </li>
        <li class="item-content"><div class="item-inner"><div class="item-title">{t('edit.site')}</div><div class="item-after">{dive.site || t('dive.siteNotSet')}</div></div></li>
        <li class="item-content"><div class="item-inner"><div class="item-title">{t('edit.trip')}</div><div class="item-after">{dive.trip?.location || t('edit.none')}</div></div></li>
      </ul>
    </div>

    <div class="block-title">{t('edit.peopleGroup')}</div>
    <div class="od-form-surface people">
      <ChipsField label={t('edit.guides')} bind:values={guides} suggestions={known.guide} supporting={t('chips.peopleHint')} />
      <ChipsField label={t('edit.buddies')} bind:values={buddies} suggestions={known.buddy} supporting={t('chips.buddiesHint')} />
      <ChipsField label={t('edit.tags')} bind:values={tags} suggestions={known.tag} supporting={t('chips.tagsHint')} />
      <TextField label={t('edit.notes')} bind:value={notes} multiline />
    </div>

    <div class="list list-strong inset list-dividers group">
      <ul>
        <li>
          <button type="button" class="disclosure" aria-expanded={conditionsOpen} onclick={() => (conditionsOpen = !conditionsOpen)}>
            <span class="text"><span class="title">{t('edit.conditionsGroup')}</span><span class="summary">{conditionsSummary}</span></span>
            <span class="arrow" class:open={conditionsOpen}><Icon name="expand" /></span>
          </button>
        </li>
        {#if conditionsOpen}
          {#each starFields as field (field.key)}
            <li class="item-content">
              <div class="item-inner">
                <div class="item-title">{field.name}</div>
                <div class="item-after">
                  <StarsInput value={stars[field.key]} label={field.name} onchange={(v) => (stars[field.key] = v)} />
                </div>
              </div>
            </li>
          {/each}
          {#if formatTemperature(dive.airTempMk, prefs)}
            <li class="item-content readonly"><div class="item-inner"><div class="item-title">{t('detail.airTemperature')}</div><div class="item-after od-value">{formatTemperature(dive.airTempMk, prefs)}</div></div></li>
          {/if}
          {#if formatTemperature(dive.waterTempMk, prefs)}
            <li class="item-content readonly"><div class="item-inner"><div class="item-title">{t('detail.water')}</div><div class="item-after od-value">{formatTemperature(dive.waterTempMk, prefs)}</div></div></li>
          {/if}
        {/if}
      </ul>
    </div>

    <div class="list list-strong inset list-dividers group">
      <ul>
        <li>
          <button type="button" class="disclosure" aria-expanded={equipmentOpen} onclick={() => (equipmentOpen = !equipmentOpen)}>
            <span class="text"><span class="title">{t('edit.equipmentGroup')}</span><span class="summary">{equipmentSummary}</span></span>
            <span class="arrow" class:open={equipmentOpen}><Icon name="expand" /></span>
          </button>
        </li>
        {#if equipmentOpen}
          <li class="suit"><TextField label={t('detail.suitRow')} bind:value={suit} /></li>
          {#each dive.cylinders.filter((c) => c.used) as cylinder, i (i)}
            <li class="item-content readonly">
              <div class="item-inner">
                <div class="item-title">{cylinder.description || cylinder.gas}</div>
                <div class="item-after od-value">{cylinder.switchDepthMm ? formatDepth(cylinder.switchDepthMm, prefs) : ''}</div>
              </div>
            </li>
          {/each}
        {/if}
      </ul>
    </div>

    {#if dive.diveComputers.length}
      <div class="block-title">{t('edit.computersGroup')}</div>
      <div class="list list-strong inset list-dividers readonly">
        <ul>
          {#each dive.diveComputers as computer, i (i)}
            <li class="item-content"><div class="item-inner"><div class="item-title">{computer.model}{i === 0 ? t('edit.mainSuffix') : ''}</div></div></li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if dive.surfacePressureMbar > 0}
      <div class="block-title">{t('edit.advancedGroup')}</div>
      <div class="list list-strong inset list-dividers readonly">
        <ul>
          <li class="item-content"><div class="item-inner"><div class="item-title">{t('detail.surfacePressure')}</div><div class="item-after od-value">{formatNumber(dive.surfacePressureMbar, 0)}&nbsp;mbar</div></div></li>
        </ul>
      </div>
    {/if}

    <p class="note">{t('edit.readOnlyNote')}</p>
  {/if}
</Page>

<style>
  @layer od.components {
    /* The suit field inside the equipment list. */
    .suit {
      padding-bottom: 12px;
    }

    .subtitle {
      margin: 12px 20px 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    /* Fields not editable yet: visible, in secondary text. */
    .readonly .item-title,
    .readonly .item-after,
    li.readonly .item-title,
    li.readonly .item-after {
      color: var(--od-text-2);
    }

    .item-footer {
      white-space: normal;
    }

    .group {
      margin-top: 18px;
    }

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

    .note {
      margin: 16px 20px 32px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
