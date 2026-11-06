<script>
  // @ts-check
  // New or edited site (docs/mockups/sites-edition-android.dc.html): name;
  // position by moving the pin, by typing coordinates or from the device;
  // country and region from GeoNames at each change of position (a corrected
  // value is never replaced); description and notes. A site within 100 m is
  // offered instead of a duplicate. With ?dive=<id>, the new site is set on
  // that dive (dives without a site).
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import SiteMap from '../components/SiteMap.svelte';
  import { saveDiveChanges } from '../lib/logbook.svelte.js';
  import { formatCoordinates, geocodeSite, parseCoordinates, siteChange } from '../lib/sites.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { uuid?: string }, query: { dive?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  const editing = f7route.params.uuid ? Number(f7route.params.uuid) : 0;
  const forDive = f7route.query?.dive ? Number(f7route.query.dive) : 0;

  /** @type {import('opendives-core').SiteDetail|null} */
  let original = $state(null);
  let name = $state('');
  let description = $state('');
  let notes = $state('');
  let country = $state('');
  let region = $state('');
  /** @type {{latUdeg: number, lonUdeg: number}|null} */
  let position = $state(null);
  let coordsText = $state('');
  let coordsError = $state(false);
  /** @type {import('opendives-core').SiteSummary|null} */
  let nearby = $state(null);
  let saving = $state(false);

  onMount(async () => {
    if (!editing) return;
    const s = await OpenDivesCore.siteQuery({ kind: 'site', uuid: editing });
    original = s;
    name = s.name;
    description = s.description;
    notes = s.notes;
    country = s.country;
    region = s.region.value;
    if (s.hasLocation) {
      position = { latUdeg: s.latUdeg, lonUdeg: s.lonUdeg };
      coordsText = formatCoordinates(s.latUdeg, s.lonUdeg);
    }
  });

  /** @param {{latUdeg: number, lonUdeg: number}} p */
  async function setPosition(p) {
    position = p;
    coordsText = formatCoordinates(p.latUdeg, p.lonUdeg);
    coordsError = false;
    const near = await OpenDivesCore.siteQuery({ kind: 'nearby', lat: p.latUdeg, lon: p.lonUdeg, a: 100 });
    nearby = near && near.uuid !== editing ? near : null;
  }

  function typedCoordinates() {
    if (!coordsText.trim()) {
      position = null;
      return;
    }
    const p = parseCoordinates(coordsText);
    coordsError = !p;
    if (p) setPosition(p);
  }

  function useDevicePosition() {
    if (!navigator.geolocation) return f7.toast.create({ text: t('sites.noDevicePosition'), closeTimeout: 3000 }).open();
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) }),
      () => f7.toast.create({ text: t('sites.noDevicePosition'), closeTimeout: 3000 }).open(),
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
      // Country and region from the position, then the diver's corrections.
      if (moved) await geocodeSite(uuid);
      if (country.trim() !== (original?.country ?? '')) await siteChange({ action: 'edit', uuid, field: 'country', value: country.trim() });
      if (region.trim() !== (original?.region.value ?? '')) await siteChange({ action: 'edit', uuid, field: 'region', value: region.trim() });
      if (forDive) await saveDiveChanges(forDive, { site: uuid });
      f7router.back();
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Save site', code);
      f7.toast.create({ text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'), closeTimeout: 3000 }).open();
    } finally {
      saving = false;
    }
  }

  async function useNearby() {
    if (!nearby) return;
    if (forDive) await saveDiveChanges(forDive, { site: nearby.uuid });
    f7router.back();
  }
</script>

<Page>
  <Navbar title={editing ? t('sites.editTitle') : t('sites.newSite')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t('edit.save')}</Link>
    {/snippet}
  </Navbar>

  <div class="list list-strong inset">
    <ul>
      <li class="item-content item-input">
        <div class="item-inner">
          <div class="item-title item-label">{t('sites.name')}</div>
          <div class="item-input-wrap"><input type="text" bind:value={name} /></div>
        </div>
      </li>
    </ul>
  </div>

  <SiteMap pin={position} draggable onmove={setPosition} height="220px" />
  <p class="hint">{t('sites.movePin')}</p>

  {#if nearby}
    <div class="nearby" role="status">
      <span>{t('sites.nearby')} <strong>{nearby.name || t('sites.noName')}</strong></span>
      <button type="button" class="od-tonal-button" onclick={useNearby}>{t('sites.useNearby')}</button>
    </div>
  {/if}

  <div class="list list-strong inset">
    <ul>
      <li class="item-content item-input" class:item-input-invalid={coordsError}>
        <div class="item-inner">
          <div class="item-title item-label">{t('sites.coordinates')}</div>
          <div class="item-input-wrap"><input type="text" bind:value={coordsText} onchange={typedCoordinates} /></div>
          <div class="item-footer">{coordsError ? t('sites.coordinatesInvalid') : t('sites.coordinatesHint')}</div>
        </div>
      </li>
    </ul>
  </div>
  <div class="device"><button type="button" class="od-outlined-button" onclick={useDevicePosition}>{t('sites.useDevicePosition')}</button></div>

  <p class="hint">{t('sites.geonamesHint')}</p>
  <div class="list list-strong inset">
    <ul>
      <li class="item-content item-input">
        <div class="item-inner">
          <div class="item-title item-label">{t('sites.country')}{#if original && country && !original.countryTaxonomy.manual}{` · ${t('sites.automatic')}`}{/if}</div>
          <div class="item-input-wrap"><input type="text" bind:value={country} /></div>
        </div>
      </li>
      <li class="item-content item-input">
        <div class="item-inner">
          <div class="item-title item-label">{t('sites.region')}{#if original && region && !original.region.manual}{` · ${t('sites.automatic')}`}{/if}</div>
          <div class="item-input-wrap"><input type="text" bind:value={region} /></div>
        </div>
      </li>
    </ul>
  </div>
  <p class="hint">{t('sites.correctionHint')}</p>

  <div class="list list-strong inset">
    <ul>
      <li class="item-content item-input">
        <div class="item-inner">
          <div class="item-title item-label">{t('sites.description')}</div>
          <div class="item-input-wrap"><textarea rows="3" placeholder={t('sites.descriptionPlaceholder')} bind:value={description}></textarea></div>
        </div>
      </li>
      <li class="item-content item-input">
        <div class="item-inner">
          <div class="item-title item-label">{t('sites.notes')}</div>
          <div class="item-input-wrap"><textarea rows="3" placeholder={t('sites.notesPlaceholder')} bind:value={notes}></textarea></div>
        </div>
      </li>
    </ul>
  </div>
  <div class="end"></div>
</Page>

<style>
  @layer od.components {
    .hint {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .nearby {
      margin: 12px 16px 0;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--od-surface-2);
      font-size: 14px;
      line-height: 20px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .device {
      margin: 10px 16px 0;
    }

    .end {
      height: 32px;
    }
  }
</style>
