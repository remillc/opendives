<script>
  // @ts-check
  // Log a dive by hand (spec, section 3, "Add"; the fields of the quick entry
  // board docs/mockups/ios-saisie.dc.html): date and time, duration, maximum
  // depth, site, buddies, rating, notes. Full-screen form: close at the left,
  // "Save" as a text button at the right. Saving adds the dive as one
  // undoable step, with the simple profile Subsurface-mobile makes from the
  // depth and the duration, then opens it; everything else is edited there.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7, theme } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import StarsInput from '../components/StarsInput.svelte';
  import { logbook, addDive, undoLastChange } from '../lib/logbook.svelte.js';
  import { parseNumber } from '../lib/filter.svelte.js';
  import { depthUnit, formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** Now, to the minute, in the form's format. */
  function now() {
    const d = new Date();
    const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  let date = $state(now());
  let duration = $state('');
  let depth = $state('');
  let buddies = $state('');
  let notes = $state('');
  let rating = $state(0);
  let siteSearch = $state('');
  let site = $state(0);
  let saving = $state(false);
  let tried = $state(false);
  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);

  onMount(async () => {
    try {
      sites = await OpenDivesCore.siteQuery({ kind: 'list' });
    } catch (e) {
      console.error('Reading the sites', e);
    }
  });

  /** "YYYY-MM-DD HH:MM" → "YYYY-MM-DDTHH:MM", or null. */
  const isoDate = $derived.by(() => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2})[:h](\d{2})$/.exec(date.trim());
    if (!m || Number(m[2]) > 12 || Number(m[3]) > 31 || Number(m[4]) > 23 || Number(m[5]) > 59) return null;
    const p = (/** @type {string} */ s) => s.padStart(2, '0');
    return `${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4])}:${m[5]}`;
  });
  const minutes = $derived(parseNumber(duration));
  const depthValue = $derived(parseNumber(depth));
  const durationOk = $derived(minutes > 0 && minutes < 48 * 60);
  const depthOk = $derived(depthValue > 0 && depthValue <= (logbook.prefs.length === 'ft' ? 1640 : 500));

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

  async function save() {
    tried = true;
    if (saving || !isoDate || !durationOk || !depthOk) return;
    saving = true;
    try {
      const mm = Math.round(logbook.prefs.length === 'ft' ? depthValue * 304.8 : depthValue * 1000);
      /** @type {Record<string, string|number|string[]>} */
      const fields = {
        date: isoDate,
        durationSeconds: Math.round(minutes * 60),
        maxDepthMm: mm,
        site,
        rating,
      };
      const names = buddies.split(',').map((b) => b.trim()).filter(Boolean);
      if (names.length) fields.buddies = names;
      if (notes.trim()) fields.notes = notes;
      const id = await addDive(fields);
      f7router.navigate(id ? `/dive/${id}/` : '/', { reloadCurrent: true });
      f7.toast
        .create({
          text: t('newDive.saved'),
          closeButton: true,
          closeButtonText: t('edit.undo'),
          closeTimeout: 5000,
          position: 'bottom',
          on: {
            closeButtonClick: async () => {
              try {
                await undoLastChange();
                f7router.navigate('/', { reloadCurrent: true });
              } catch (e) {
                console.error('Undo', e);
              }
            },
          },
        })
        .open();
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
    <TextField
      label={t('newDive.dateTime')}
      bind:value={date}
      invalid={tried && !isoDate}
      supporting={tried && !isoDate ? t('newDive.dateInvalid') : t('newDive.dateHint')}
    />
    <TextField
      label={t('newDive.duration')}
      bind:value={duration}
      inputmode="decimal"
      invalid={tried && !durationOk}
      supporting={tried && !durationOk ? t('newDive.required') : ''}
    />
    <TextField
      label={t('newDive.depth', { unit: depthUnit(logbook.prefs) })}
      bind:value={depth}
      inputmode="decimal"
      invalid={tried && !depthOk}
      supporting={tried && !depthOk ? t('newDive.required') : t('newDive.profileHint')}
    />
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
