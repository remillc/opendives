<script>
  // @ts-check
  // Log a dive by hand (spec, section 3, "Add"; the fields of the quick entry
  // board docs/mockups/ios-saisie.dc.html): date and time (wheel pickers, as
  // in Settings), duration, maximum depth, water temperature, the cylinder
  // (type, start and end pressures, oxygen and helium), site, buddies, rating,
  // notes. Full-screen form: close at the left, "Save" as a text button at the
  // right. Saving adds the dive as one undoable step, with the simple profile
  // Subsurface-mobile makes from the depth and the duration, then opens it.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7, theme } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import StarsInput from '../components/StarsInput.svelte';
  import WheelDialog from '../components/WheelDialog.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import { logbook, addDive, renumberDives, renumberPlanFrom } from '../lib/logbook.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { parseNumber } from '../lib/filter.svelte.js';
  import { depthUnit, formatCylinderSize, formatLongDate, locale } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { offerUndo } from '../lib/undo.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  const prefs = $derived(logbook.prefs);
  const start = new Date();
  // Date and time of the dive, local; now, to the minute, at first.
  let year = $state(start.getFullYear());
  let month = $state(start.getMonth()); // 0 to 11
  let day = $state(start.getDate());
  let hour = $state(start.getHours());
  let minute = $state(start.getMinutes());
  /** @type {'date'|'time'|'cylinder'|null} */
  let dialog = $state(null);

  let duration = $state('');
  let depth = $state('');
  let water = $state('');
  let cylinderType = $state('');
  let startPressure = $state('');
  let endPressure = $state('');
  let o2 = $state('');
  let he = $state('');
  let buddies = $state('');
  let notes = $state('');
  let rating = $state(0);
  let siteSearch = $state('');
  let site = $state(0);
  let saving = $state(false);
  let tried = $state(false);
  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  /** @type {import('opendives-core').CylinderType[]} */
  let cylinderTypes = $state([]);

  onMount(async () => {
    try {
      sites = await OpenDivesCore.siteQuery({ kind: 'list' });
    } catch (e) {
      console.error('Reading the sites', e);
    }
    try {
      cylinderTypes = (await OpenDivesCore.cylinderTypes({ action: 'list' })).types;
    } catch (e) {
      console.error('Reading the cylinder types', e);
    }
  });

  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const daysIn = (/** @type {number} */ y, /** @type {number} */ m) => new Date(y, m + 1, 0).getDate();
  const dateText = $derived(new Date(year, month, day).toLocaleDateString(locale, { dateStyle: 'long' }));
  const timeText = $derived(new Date(2000, 0, 1, hour, minute).toLocaleTimeString(locale, { timeStyle: 'short' }));
  const isoDate = $derived(`${year}-${two(month + 1)}-${two(Math.min(day, daysIn(year, month)))}T${two(hour)}:${two(minute)}`);

  // Wheels: day, month, year; hour, minute.
  const years = Array.from({ length: start.getFullYear() + 2 - 1950 }, (_, i) => 1950 + i);
  const monthNames = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(locale, { month: 'short' }));
  const dateWheels = $derived([
    { label: t('newDive.day'), values: Array.from({ length: 31 }, (_, i) => String(i + 1)), index: day - 1, defaultIndex: start.getDate() - 1 },
    { label: t('newDive.month'), values: monthNames, index: month, defaultIndex: start.getMonth() },
    { label: t('newDive.year'), values: years.map(String), index: years.indexOf(year), defaultIndex: years.indexOf(start.getFullYear()) },
  ]);
  const timeWheels = $derived([
    { label: t('newDive.hour'), values: Array.from({ length: 24 }, (_, i) => two(i)), index: hour, defaultIndex: start.getHours() },
    { label: t('newDive.minute'), values: Array.from({ length: 60 }, (_, i) => two(i)), index: minute, defaultIndex: start.getMinutes() },
  ]);

  const minutes = $derived(parseNumber(duration));
  const depthValue = $derived(parseNumber(depth));
  const durationOk = $derived(minutes > 0 && minutes < 48 * 60);
  const depthOk = $derived(depthValue > 0 && depthValue <= (prefs.length === 'ft' ? 1640 : 500));
  /** An optional number: empty, or valid within [min, max]. @param {string} text @param {number} min @param {number} max */
  const optionalOk = (text, min, max) => !text.trim() || (parseNumber(text) >= min && parseNumber(text) <= max);
  const waterOk = $derived(optionalOk(water, prefs.temperature === 'F' ? 28 : -2, prefs.temperature === 'F' ? 110 : 45));
  const maxPressure = $derived(prefs.pressure === 'psi' ? 7000 : 500);
  const startOk = $derived(optionalOk(startPressure, 0, maxPressure));
  const endOk = $derived(optionalOk(endPressure, 0, maxPressure));
  const gasOk = $derived(
    optionalOk(o2, 5, 100) && optionalOk(he, 0, 95) && (parseNumber(o2) || 21) + (parseNumber(he) || 0) <= 100,
  );

  const pressureUnit = $derived(prefs.pressure === 'psi' ? t('units.psi') : t('units.bar'));
  const temperatureUnit = $derived(prefs.temperature === 'F' ? t('units.fahrenheit') : t('units.celsius'));
  /** @param {string} text */
  const toMbar = (text) => Math.round(prefs.pressure === 'psi' ? parseNumber(text) * 68.9476 : parseNumber(text) * 1000);

  const cylinderOptions = $derived([
    { value: '', label: t('newDive.defaultCylinder') },
    ...cylinderTypes.map((c) => ({ value: c.name, label: c.name, example: formatCylinderSize(c.ml, c.mbar, prefs) ?? undefined })),
  ]);

  /** Sites offered: the most recent first; the search filters by name. */
  const shownSites = $derived.by(() => {
    const q = siteSearch.trim().toLocaleLowerCase();
    const list = [...sites]
      .filter((s) => s.name && (!q || s.name.toLocaleLowerCase().includes(q)))
      .sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));
    const chosen = list.find((s) => s.uuid === site);
    const first = list.slice(0, 6);
    return chosen && !first.includes(chosen) ? [chosen, ...first.slice(0, 5)] : first;
  });

  /** @param {{ ids: number[], start: number }} plan @param {() => void} back */
  function renumberAfterAdd(plan, back) {
    return async () => {
      try {
        await renumberDives(plan.ids, plan.start);
        // The dive page shows the number it had: open it again.
        f7router.navigate(`/dive/${plan.ids[0]}/`, { reloadCurrent: true });
        offerUndo(t('renumber.done'), back);
      } catch (e) {
        console.error('Renumber', e);
        f7.toast.create({ text: t('renumber.failed'), closeTimeout: 4000 }).open();
      }
    };
  }

  async function save() {
    tried = true;
    if (saving || !durationOk || !depthOk || !waterOk || !startOk || !endOk || !gasOk) return;
    saving = true;
    try {
      /** @type {Record<string, string|number|string[]>} */
      const fields = {
        date: isoDate,
        durationSeconds: Math.round(minutes * 60),
        maxDepthMm: Math.round(prefs.length === 'ft' ? depthValue * 304.8 : depthValue * 1000),
        site,
        rating,
      };
      if (water.trim()) {
        const w = parseNumber(water);
        fields.waterTempMk = Math.round(((prefs.temperature === 'F' ? ((w - 32) * 5) / 9 : w) + 273.15) * 1000);
      }
      if (cylinderType) fields.cylinderType = cylinderType;
      if (startPressure.trim()) fields.startMbar = toMbar(startPressure);
      if (endPressure.trim()) fields.endMbar = toMbar(endPressure);
      if (o2.trim() || he.trim()) {
        fields.o2Permille = Math.round((parseNumber(o2) || 21) * 10);
        fields.hePermille = Math.round((parseNumber(he) || 0) * 10);
      }
      const names = buddies.split(',').map((b) => b.trim()).filter(Boolean);
      if (names.length) fields.buddies = names;
      if (notes.trim()) fields.notes = notes;
      const id = await addDive(fields);
      f7router.navigate(id ? `/dive/${id}/` : '/', { reloadCurrent: true });
      const back = () => f7router.navigate('/', { reloadCurrent: true });
      // A dive logged between others has no number (0): offer to renumber the
      // logbook from its date onward, as Subsurface's Renumber does.
      const plan = id && logbook.dives.find((d) => d.id === id)?.number === 0 ? renumberPlanFrom(id) : null;
      if (plan)
        confirmAction({
          title: t('newDive.renumberTitle'),
          text: t('newDive.renumberText', { count: plan.ids.length - 1, start: plan.start }),
          action: t('renumber.action'),
          cancel: t('newDive.renumberLater'),
          onConfirm: renumberAfterAdd(plan, back),
          onCancel: () => offerUndo(t('newDive.saved'), back),
        });
      else offerUndo(t('newDive.saved'), back);
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Log a dive', code);
      f7.toast
        .create({ text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('newDive.failed'), closeTimeout: 4000 })
        .open();
    } finally {
      saving = false;
    }
  }
</script>

<Page class="od-new-dive">
  <Navbar title={t('newDive.title')}>
    {#snippet left()}
      {#if theme.ios}
        <Link back>{t('newDive.cancel')}</Link>
      {:else}
        <Link back iconOnly><Icon name="close" /><span class="od-sr-only">{t('newDive.cancel')}</span></Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t('newDive.save')}</Link>
    {/snippet}
  </Navbar>

  <div class="od-form-surface">
    <button type="button" class="row" onclick={() => (dialog = 'date')}>
      <span class="row-label">{t('newDive.date')}</span>
      <span class="row-value">{dateText}</span>
      <Icon name="chevron" size={18} />
    </button>
    <button type="button" class="row" onclick={() => (dialog = 'time')}>
      <span class="row-label">{t('newDive.time')}</span>
      <span class="row-value">{timeText}</span>
      <Icon name="chevron" size={18} />
    </button>
    <TextField
      label={t('newDive.duration')}
      bind:value={duration}
      inputmode="decimal"
      invalid={tried && !durationOk}
      supporting={tried && !durationOk ? t('newDive.required') : ''}
    />
    <TextField
      label={t('newDive.depth', { unit: depthUnit(prefs) })}
      bind:value={depth}
      inputmode="decimal"
      invalid={tried && !depthOk}
      supporting={tried && !depthOk ? t('newDive.required') : t('newDive.profileHint')}
    />
    <TextField
      label={t('newDive.water', { unit: temperatureUnit })}
      bind:value={water}
      inputmode="decimal"
      invalid={tried && !waterOk}
      supporting={tried && !waterOk ? t('newDive.invalid') : ''}
    />
  </div>

  <h2 class="group-title">{t('newDive.cylinder')}</h2>
  <div class="od-form-surface">
    <button type="button" class="row" onclick={() => (dialog = 'cylinder')}>
      <span class="row-label">{t('newDive.cylinderType')}</span>
      <span class="row-value">{cylinderType || t('newDive.defaultCylinder')}</span>
      <Icon name="chevron" size={18} />
    </button>
    <div class="pair">
      <TextField
        label={t('newDive.startPressure', { unit: pressureUnit })}
        bind:value={startPressure}
        inputmode="decimal"
        invalid={tried && !startOk}
      />
      <TextField
        label={t('newDive.endPressure', { unit: pressureUnit })}
        bind:value={endPressure}
        inputmode="decimal"
        invalid={tried && !endOk}
      />
    </div>
    <div class="pair">
      <TextField label={t('newDive.o2')} bind:value={o2} inputmode="decimal" invalid={tried && !gasOk} />
      <TextField label={t('newDive.he')} bind:value={he} inputmode="decimal" invalid={tried && !gasOk} />
    </div>
    <p class="note">{tried && !gasOk ? t('newDive.gasInvalid') : t('newDive.gasHint')}</p>
  </div>

  <h2 class="group-title" id="od-new-site">{t('newDive.site')}</h2>
  <div class="od-form-surface">
    {#if sites.length > 6}<TextField label={t('newDive.searchSite')} bind:value={siteSearch} />{/if}
    <div class="sites" role="radiogroup" aria-labelledby="od-new-site">
      <label class="site">
        <input type="radio" name="od-new-site" value={0} bind:group={site} />
        <span class="site-text"><span>{t('newDive.noSite')}</span></span>
      </label>
      {#each shownSites as s (s.uuid)}
        <label class="site">
          <input type="radio" name="od-new-site" value={s.uuid} bind:group={site} />
          <span class="site-text">
            <span>{s.name}</span>
            {#if s.lastDate}<span class="hint">{t('newDive.lastDive', { date: formatLongDate(s.lastDate) })}</span>{/if}
          </span>
        </label>
      {/each}
    </div>
    <p class="note">{t('newDive.newSiteNote')}</p>
  </div>

  <h2 class="group-title">{t('newDive.more')}</h2>
  <div class="od-form-surface">
    <TextField label={t('newDive.buddies')} bind:value={buddies} supporting={t('edit.listHint')} />
    <div class="rating">
      <span>{t('newDive.rating')}</span>
      <StarsInput value={rating} label={t('newDive.rating')} onchange={(n) => (rating = n)} />
    </div>
    <TextField label={t('newDive.notes')} bind:value={notes} multiline />
  </div>
</Page>

{#if dialog === 'date'}
  <WheelDialog
    title={t('newDive.date')}
    wheels={dateWheels}
    oncancel={() => (dialog = null)}
    onconfirm={([d, m, y]) => {
      year = years[y];
      month = m;
      day = Math.min(d + 1, daysIn(years[y], m));
      dialog = null;
    }}
  />
{:else if dialog === 'time'}
  <WheelDialog
    title={t('newDive.time')}
    wheels={timeWheels}
    oncancel={() => (dialog = null)}
    onconfirm={([h, m]) => {
      hour = h;
      minute = m;
      dialog = null;
    }}
  />
{:else if dialog === 'cylinder'}
  <ChoiceDialog
    title={t('newDive.cylinderType')}
    options={cylinderOptions}
    value={cylinderType}
    oncancel={() => (dialog = null)}
    onselect={(v) => {
      cylinderType = v;
      dialog = null;
    }}
  />
{/if}

<style>
  @layer od.components {
    :global(.od-new-dive .page-content) {
      padding-bottom: 32px;
    }

    .group-title {
      margin: 24px 16px 0 28px;
      font-size: 18px;
      font-weight: 700;

      :global(.ios) & {
        font-size: 13px;
        font-weight: 400;
        color: var(--od-text-2);
      }
    }

    /* A value row, as in Settings: label, value, then a small chevron; it opens a dialog. */
    .row {
      width: 100%;
      min-height: 56px;
      padding: 0 12px;
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

      .row-label {
        flex: 1;
      }

      .row-value {
        color: var(--od-text-2);
        font-variant-numeric: tabular-nums;
      }

      :global(.od-icon) {
        color: var(--od-text-2);
      }
    }

    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .sites {
      display: flex;
      flex-direction: column;
      padding: 4px 0;
    }

    .site {
      min-height: 56px;
      padding: 8px 12px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 16px;

      input {
        flex: none;
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: var(--od-action);
      }
    }

    .site-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 16px;

      .hint {
        font-size: 14px;
        color: var(--od-text-2);
      }
    }

    .note {
      margin: 4px 12px 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .rating {
      min-height: 56px;
      padding: 0 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      font-size: 16px;
    }
  }
</style>
