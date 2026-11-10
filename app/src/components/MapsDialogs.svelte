<script>
  // @ts-check
  // Dialogs of the offline maps (spec, section 4, "Offline maps"): mobile
  // data, not enough space, limit reached, replace the map, delete, the limit
  // choice. Driven by offlineMaps.dialog (lib/offline-maps.svelte.js), so that
  // any screen can open them; mounted once, in App.svelte.
  import Md3Dialog from './Md3Dialog.svelte';
  import ChoiceDialog from './ChoiceDialog.svelte';
  import { t } from '../lib/i18n.js';
  import { CAP_CHOICES, MAX_REGION_BYTES } from '../lib/maps-logic.js';
  import { formatMapSize } from '../lib/maps-format.js';
  import { offlineMaps, findRegion, regionName, usedBytes, floor, downloadOverCellular, updateRegion, deleteRegion, setCap, go } from '../lib/offline-maps.svelte.js';

  const dialog = $derived(offlineMaps.dialog);
  const close = () => (offlineMaps.dialog = null);

  /** @param {string} id */
  const regionOf = (id) => findRegion(id);
</script>

{#if dialog?.kind === 'cellular'}
  {@const r = regionOf(dialog.id)}
  {@const id = dialog.id}
  <Md3Dialog class="od-maps-dialogs" title={t('maps.dialogs.cellular.title')} text={t('maps.dialogs.cellular.text', { name: r ? regionName(r) : '', size: formatMapSize(MAX_REGION_BYTES) })} oncancel={close}>
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button type="button" onclick={close}>{t('maps.dialogs.cellular.wait')}</button>
      <button type="button" onclick={() => downloadOverCellular(id)}>{t('maps.dialogs.cellular.go')}</button>
    {/snippet}
  </Md3Dialog>
{:else if dialog?.kind === 'space'}
  <Md3Dialog class="od-maps-dialogs"
    title={t('maps.dialogs.space.title')}
    text={t('maps.dialogs.space.text', { name: dialog.name, size: formatMapSize(dialog.sizeBytes), remaining: formatMapSize(dialog.remainingBytes), floor: formatMapSize(floor()) })}
    oncancel={close}
  >
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button type="button" onclick={close}>{t('dialog.ok')}</button>
    {/snippet}
  </Md3Dialog>
{:else if dialog?.kind === 'manage'}
  <Md3Dialog class="od-maps-dialogs"
    title={t('maps.dialogs.manage.title')}
    text={t('maps.dialogs.manage.text', { free: formatMapSize(offlineMaps.freeBytes), floor: formatMapSize(floor()) })}
    oncancel={close}
  >
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button type="button" onclick={close}>{t('dialog.ok')}</button>
    {/snippet}
  </Md3Dialog>
{:else if dialog?.kind === 'cap'}
  <Md3Dialog class="od-maps-dialogs"
    title={t('maps.dialogs.cap.title')}
    text={t('maps.dialogs.cap.text', { name: dialog.name, size: formatMapSize(dialog.sizeBytes), used: formatMapSize(dialog.usedBytes), cap: formatMapSize(dialog.capBytes) })}
    oncancel={close}
  >
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button
        type="button"
        onclick={() => {
          close();
          go('/settings/maps/');
        }}>{t('maps.dialogs.cap.view')}</button
      >
      <button type="button" onclick={() => (offlineMaps.dialog = { kind: 'limit' })}>{t('maps.dialogs.cap.change')}</button>
    {/snippet}
  </Md3Dialog>
{:else if dialog?.kind === 'replace'}
  {@const r = regionOf(dialog.id)}
  {@const id = dialog.id}
  <Md3Dialog class="od-maps-dialogs"
    title={t('maps.dialogs.replace.title')}
    text={t('maps.dialogs.replace.text', { name: r ? regionName(r) : '', size: formatMapSize(MAX_REGION_BYTES) })}
    oncancel={close}
  >
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button type="button" onclick={close}>{t('dialog.cancel')}</button>
      <button
        type="button"
        onclick={() => {
          close();
          updateRegion(id, { replace: true });
        }}>{t('maps.dialogs.replace.confirm')}</button
      >
    {/snippet}
  </Md3Dialog>
{:else if dialog?.kind === 'delete'}
  {@const r = regionOf(dialog.id)}
  {@const id = dialog.id}
  <Md3Dialog class="od-maps-dialogs"
    title={t('maps.dialogs.delete.title', { name: r ? regionName(r) : '' })}
    text={t('maps.dialogs.delete.text', { size: formatMapSize(r?.sizeBytes ?? 0) })}
    oncancel={close}
  >
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button type="button" onclick={close}>{t('dialog.cancel')}</button>
      <button type="button" onclick={() => deleteRegion(id)}>{t('maps.dialogs.delete.confirm')}</button>
    {/snippet}
  </Md3Dialog>
{:else if dialog?.kind === 'limit'}
  <ChoiceDialog
    title={t('maps.limit.label')}
    options={CAP_CHOICES.map((bytes) => ({ value: String(bytes), label: formatMapSize(bytes) }))}
    value={String(offlineMaps.capBytes)}
    note={t('maps.limit.text', { used: formatMapSize(usedBytes()), floor: formatMapSize(floor()) })}
    oncancel={close}
    onselect={(v) => {
      close();
      setCap(Number(v));
    }}
  />
{/if}
