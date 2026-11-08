<script>
  // @ts-check
  // New or edited site (docs/mockups/sites-edition-android.dc.html): name;
  // position by moving the pin (the map can go full screen), by typing
  // coordinates or from the device; country and region looked up at each
  // change of position (OpenStreetMap, else the offline Natural Earth file),
  // a corrected value is never replaced; description and notes. A site
  // within 100 m is offered instead of a duplicate. With ?dive=<id>, the new
  // site is set on that dive (dives without a site).
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import { logbook, saveDiveChanges } from '../lib/logbook.svelte.js';
  import { formatCoordinates, geocodeSite, parseCoordinates, siteChange } from '../lib/sites.svelte.js';
  import { language, t } from '../lib/i18n.js';
  import { confirmAction } from '../lib/dialogs.js';

  /** @type {{ f7route: { params: { uuid?: string }, query: { dive?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  const editing = f7route.params.uuid ? Number(f7route.params.uuid) : 0;
  const forDive = f7route.query?.dive ? Number(f7route.query.dive) : 0;

  let original = $state(/** @type {import('opendives-core').SiteDetail|null} */ (null));
  let name = $state('');
  let description = $state('');
  let notes = $state('');
  let country = $state('');
  let region = $state('');
  /** The values last filled in from the position: shown as "automatic". */
  let autoCountry = $state('');
  let autoRegion = $state('');
  let position = $state(/** @type {{latUdeg: number, lonUdeg: number}|null} */ (null));
  let coordsText = $state('');
  let coordsError = $state(false);
  let nearby = $state(/** @type {import('opendives-core').SiteSummary|null} */ (null));
  let saving = $state(false);
  let fullscreen = $state(false);
  let lookups = 0;

  onMount(async () => {
    if (!editing) {
      // A new site starts where the diver is (often on the boat or the
      // shore); without a position, the map stays as it is, silently.
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          if (!position) setPosition({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 },
      );
      return;
    }
    const s = await OpenDivesCore.siteQuery({ kind: 'site', uuid: editing });
    original = s;
    name = s.name;
    description = s.description;
    notes = s.notes;
    country = s.country;
    region = s.region.value;
    autoCountry = s.countryTaxonomy.manual ? '' : s.country;
    autoRegion = s.region.manual ? '' : s.region.value;
    if (s.hasLocation) {
      position = { latUdeg: s.latUdeg, lonUdeg: s.lonUdeg };
      coordsText = formatCoordinates(s.latUdeg, s.lonUdeg);
    }
  });

  /** @param {{latUdeg: number, lonUdeg: number}} p */
  async function setPosition(p) {
    const asked = ++lookups;
    position = p;
    coordsText = formatCoordinates(p.latUdeg, p.lonUdeg);
    coordsError = false;
    const near = await OpenDivesCore.siteQuery({ kind: 'nearby', lat: p.latUdeg, lon: p.lonUdeg, a: 100 });
    nearby = near && near.uuid !== editing ? near : null;
    // Country and region of the new position, unless the diver corrected them.
    const place = await OpenDivesCore.siteQuery({ kind: 'place', lat: p.latUdeg, lon: p.lonUdeg, text: language });
    // Only the answer for the latest position counts.
    if (asked !== lookups || !place) return;
    if (!country || country === autoCountry) country = autoCountry = place.country;
    if (!region || region === autoRegion) region = autoRegion = place.region;
  }

  function typedCoordinates() {
    if (!coordsText.trim()) {
      position = null;
      coordsError = false;
      return;
    }
    const p = parseCoordinates(coordsText);
    coordsError = !p;
    if (p) setPosition(p);
  }

  function useDevicePosition() {
    const failed = () => f7.toast.create({ text: t('sites.noDevicePosition'), closeTimeout: 4000 }).open();
    if (!navigator.geolocation) return failed();
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) }),
      failed,
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      let uuid = editing;
      const lat = position?.latUdeg ?? 0;
      const lon = position?.lonUdeg ?? 0;
      let moved = false;
      if (!uuid) {
        const created = await siteChange({ action: 'create', value: name.trim(), lat, lon });
        uuid = created.site?.uuid ?? 0;
        moved = !!position;
      } else if (original) {
        if (name.trim() !== original.name) await siteChange({ action: 'edit', uuid, field: 'name', value: name.trim() });
        if (lat !== original.latUdeg || lon !== original.lonUdeg) {
          await siteChange({ action: 'edit', uuid, field: 'location', lat, lon });
          moved = !!position;
        }
      }
      if (description !== (original?.description ?? '')) await siteChange({ action: 'edit', uuid, field: 'description', value: description });
      if (notes !== (original?.notes ?? '')) await siteChange({ action: 'edit', uuid, field: 'notes', value: notes });
      // Country and region found from the position, then what the diver
      // typed where it differs (kept as a correction).
      if (moved) await geocodeSite(uuid);
      const now = await OpenDivesCore.siteQuery({ kind: 'site', uuid });
      if (country.trim() !== now.country) await siteChange({ action: 'edit', uuid, field: 'country', value: country.trim() });
      if (region.trim() !== now.region.value) await siteChange({ action: 'edit', uuid, field: 'region', value: region.trim() });
      if (forDive) {
        await saveDiveChanges(forDive, { site: uuid });
        // The site lists change once the dive has its site.
        logbook.sitesVersion++;
      }
      f7router.back();
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Save site', code);
      f7.toast.create({ text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'), closeTimeout: 4000 }).open();
    } finally {
      saving = false;
    }
  }

  /**
   * Edit mode: delete the site after a confirmation (DeleteDiveSites). Its
   * dives stay in the logbook without a site; undoable. Back to the list,
   * as the site's own sheet is gone.
   */
  function deleteSite() {
    const n = original?.diveList.length ?? 0;
    confirmAction({
      title: t('sites.deleteSiteTitle'),
      text: n ? t('sites.deleteSiteText', { n }) : t('sites.deleteSiteTextUnused'),
      action: t('sites.delete'),
      onConfirm: async () => {
        try {
          await siteChange({ action: 'deleteSite', uuid: editing });
          f7router.back('/sites/', { force: true });
        } catch (e) {
          const code = String(/** @type {any} */ (e)?.message ?? '');
          console.error('Delete site', code);
          f7.toast.create({ text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'), closeTimeout: 4000 }).open();
        }
      },
    });
  }

  /** The existing site instead of a duplicate. */
  async function useNearby(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    if (!nearby) return;
    if (forDive) {
      await saveDiveChanges(forDive, { site: nearby.uuid });
      logbook.sitesVersion++;
      f7router.back();
    } else {
      f7router.navigate(`/sites/${nearby.uuid}`, { reloadCurrent: true });
    }
  }

  /**
   * Full screen: the map card moves to the end of <body>, above the pages,
   * and comes back to its place after.
   * @param {HTMLElement} node
   * @param {boolean} on
   */
  function lift(node, on) {
    const home = document.createComment('map');
    node.before(home);
    const place = (/** @type {boolean} */ up) => (up ? document.body.append(node) : home.after(node));
    place(on);
    return {
      update: place,
      destroy() {
        home.remove();
        node.remove();
      },
    };
  }
</script>

<Page>
  <Navbar title={editing ? t('sites.editTitle') : t('sites.newSite')}>
    {#snippet left()}
      <Link back iconOnly><Icon name="close" /><span class="od-sr-only">{t('sites.close')}</span></Link>
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t('edit.save')}</Link>
    {/snippet}
  </Navbar>

  <TextField label={t('sites.name')} bind:value={name} />

  <div class="map-card" class:fullscreen use:lift={fullscreen}>
    <SiteMap pin={position} editable onmove={setPosition} height={fullscreen ? '100%' : '190px'} />
    <span class="chip">{t('sites.movePin')}</span>
    <button type="button" class="map-button" onclick={() => (fullscreen = !fullscreen)}>
      <Icon name={fullscreen ? 'exitFullscreen' : 'fullscreen'} size={20} weight={2} />
      <span class="od-sr-only">{fullscreen ? t('sites.exitFullscreen') : t('sites.fullscreen')}</span>
    </button>
    {#if fullscreen && coordsText}<span class="coords od-value">{coordsText}</span>{/if}
  </div>

  {#if !editing && nearby}
    <div class="nearby" role="note">
      <span>{t('sites.nearbyShort', { site: nearby.name || t('sites.noName') })}</span>
      <button type="button" class="od-text-button use" onclick={useNearby}>{t('sites.useNearby')}</button>
    </div>
  {/if}

  <!-- Position: coordinates, then country and region found from them. -->
  <div class="od-form-surface">
    <TextField
      label={t('sites.coordinates')}
      bind:value={coordsText}
      onchange={typedCoordinates}
      invalid={coordsError}
      supporting={coordsError ? t('sites.coordinatesInvalid') : t('sites.coordinatesHint')}
    >
      {#snippet trailing()}
        <button type="button" class="od-icon-button" onclick={useDevicePosition}>
          <Icon name="locate" />
          <span class="od-sr-only">{t('sites.useDevicePosition')}</span>
        </button>
      {/snippet}
    </TextField>
    <TextField label={t('sites.country')} bind:value={country} supporting={country && country === autoCountry ? t('sites.fromPosition') : ''} />
    <TextField label={t('sites.region')} bind:value={region} supporting={region && region === autoRegion ? t('sites.fromPosition') : ''} />
    <p class="explain">{t('sites.placeExplain')}</p>
  </div>

  <div class="od-form-surface">
    <TextField label={t('sites.description')} bind:value={description} multiline />
    <TextField label={t('sites.notes')} bind:value={notes} multiline />
  </div>

  {#if editing}
    <div class="od-form-surface delete">
      <button type="button" class="od-outlined-button danger" onclick={deleteSite}>{t('sites.deleteSite')}</button>
      <p class="explain">{t('sites.deleteSiteHint')}</p>
    </div>
  {/if}
  <div class="end"></div>
</Page>

<style>
  @layer od.components {
    .map-card {
      position: relative;
      margin: 8px 16px 0;
      border-radius: 16px;
      overflow: hidden;

      &.fullscreen {
        position: fixed;
        inset: 0;
        z-index: 12000;
        margin: 0;
        border-radius: 0;
      }
    }

    .chip {
      position: absolute;
      left: 12px;
      top: 12px;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--od-surface);
      font-size: 13px;
      color: var(--od-text-2);
      pointer-events: none;

      .fullscreen & {
        top: calc(12px + env(safe-area-inset-top));
      }
    }

    .map-button {
      position: absolute;
      right: 4px;
      top: 4px;
      width: 48px;
      height: 48px;
      border: none;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-text);

      /* The visible disc, 40 dp, in a 48 dp target. */
      &::before {
        content: '';
        position: absolute;
        inset: 4px;
        border-radius: 50%;
        background: var(--od-surface);
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
      }

      :global(.od-icon) {
        position: relative;
      }

      .fullscreen & {
        top: calc(4px + env(safe-area-inset-top));
      }
    }

    .coords {
      position: absolute;
      left: 50%;
      bottom: calc(40px + env(safe-area-inset-bottom));
      transform: translateX(-50%);
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--od-surface);
      font-size: 15px;
      white-space: nowrap;
    }

    .explain {
      margin: 12px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .delete {
      padding: 16px 12px;

      .explain {
        margin: 8px 4px 0;
      }
    }

    .nearby {
      margin: 18px 16px 0;
      padding: 12px 16px 4px;
      border-radius: 12px;
      background: var(--od-surface-2);
      font-size: 14px;
      line-height: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .use {
      align-self: flex-end;
    }

    .end {
      height: 32px;
    }
  }
</style>
