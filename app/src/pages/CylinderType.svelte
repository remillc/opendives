<script>
  // @ts-check
  // Sheet of a cylinder type (spec, section 4, "Cylinder types sub-screen"):
  // name, volume and working pressure, and "Remove" for a type of the device's
  // library. As Subsurface's cylinder-type manager: renaming also renames the
  // cylinders of that type in the logbook (one undoable step); resizing or
  // removing changes the device's list only, never existing dives.

  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import { t } from '../lib/i18n.js';
  import { logbook, renameCylinderType } from '../lib/logbook.svelte.js';
  import { keepCylinderLibrary } from '../lib/settings.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { formatNumber, locale } from '../lib/format.js';

  /** @type {{ f7route: { query: { name?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  // svelte-ignore state_referenced_locally
  const original = f7route.query?.name ?? '';
  const editing = !!original;

  /** @type {import('opendives-core').CylinderType|null} */
  let type = $state(null);
  let name = $state(original);
  let volume = $state('');
  let pressure = $state('');
  let error = $state('');
  let saving = $state(false);

  const cuft = $derived(logbook.prefs.volume === 'cuft');
  const psi = $derived(logbook.prefs.pressure === 'psi');
  const PSI_MBAR = 68.947572932;
  const CUFT_ML = 28316.8466;

  /** @param {number} value @param {number} decimals */
  const number = (value, decimals) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, useGrouping: false }).format(value);

  /** A number typed with a comma or a point; NaN when invalid. @param {string} text */
  const parse = (text) => (text.trim() === '' ? 0 : Number(text.trim().replace(',', '.')));

  onMount(async () => {
    if (!editing) return;
    try {
      const { types } = await OpenDivesCore.cylinderTypes({ action: 'list' });
      type = types.find((ty) => ty.name === original) ?? null;
      if (!type) return;
      pressure = type.mbar ? number(psi ? type.mbar / PSI_MBAR : type.mbar / 1000, 0) : '';
      // In cubic feet, the gas volume at working pressure, as Subsurface shows it.
      volume = type.ml ? number(cuft ? (type.ml / CUFT_ML) * (type.mbar / 1013.25) : type.ml / 1000, cuft ? 0 : 1) : '';
    } catch (e) {
      console.error('Reading the cylinder type', e);
    }
  });

  /** The size typed, in ml and mbar; null with `error` set when invalid. */
  function typedSize() {
    const p = parse(pressure);
    const v = parse(volume);
    if (Number.isNaN(p) || p < 0) {
      error = t('settings.cylinders.pressureInvalid');
      return null;
    }
    const mbar = Math.round(psi ? p * PSI_MBAR : p * 1000);
    if (Number.isNaN(v) || v <= 0 || (cuft && !mbar)) {
      error = t('settings.cylinders.volumeInvalid');
      return null;
    }
    const ml = Math.round(cuft ? (v * CUFT_ML) / (mbar / 1013.25) : v * 1000);
    return { ml, mbar };
  }

  /** @param {unknown} e */
  function failure(e) {
    const code = String(/** @type {any} */ (e)?.message ?? e);
    if (code.includes('NAME_IN_USE')) {
      error = t('settings.cylinders.nameInUse');
    } else {
      console.error('Saving the cylinder type', e);
      showSnackbar(t('settings.error'));
    }
  }

  async function save() {
    error = '';
    const trimmed = name.trim();
    if (!trimmed) {
      error = t('settings.cylinders.nameMissing');
      return;
    }
    const size = typedSize();
    if (!size) return;
    saving = true;
    try {
      if (!editing) {
        keepCylinderLibrary((await OpenDivesCore.cylinderTypes({ action: 'add', name: trimmed, ...size })).library);
      } else {
        let current = original;
        if (trimmed !== original) {
          await renameCylinderType(original, trimmed);
          current = trimmed;
        }
        if (!type || size.ml !== type.ml || size.mbar !== type.mbar)
          keepCylinderLibrary((await OpenDivesCore.cylinderTypes({ action: 'size', name: current, ...size })).library);
      }
      f7router.back();
    } catch (e) {
      failure(e);
    } finally {
      saving = false;
    }
  }

  /** "Type standard, utilisé dans 3 plongées." and what a change does. */
  const usageNote = $derived.by(() => {
    if (!type) return '';
    const n = type.dives;
    const use = t(n === 0 ? 'settings.cylinders.usedInNoDive' : n === 1 ? 'settings.cylinders.usedInOneDive' : 'settings.cylinders.usedInDives', { n: formatNumber(n, 0) });
    return t(type.standard ? 'settings.cylinders.noteStandard' : 'settings.cylinders.noteYours', { use });
  });

  function remove() {
    confirmAction({
      title: t('settings.cylinders.deleteTitle', { name: original }),
      text: t('settings.cylinders.deleteText'),
      action: t('settings.cylinders.deleteAction'),
      onConfirm: async () => {
        try {
          keepCylinderLibrary((await OpenDivesCore.cylinderTypes({ action: 'remove', name: original })).library);
          f7router.back();
        } catch (e) {
          failure(e);
        }
      },
    });
  }
</script>

<Page class="od-cylinder-type">
  <Navbar title={editing ? t('settings.cylinders.editTitle') : t('settings.cylinders.newTitle')}>
    {#snippet left()}
      <Link back iconOnly>
        <Icon name="close" />
        <span class="od-sr-only">{t('plan.chooseClose')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t('edit.save')}</Link>
    {/snippet}
  </Navbar>

  <div class="od-form-surface">
    <TextField label={t('settings.cylinders.name')} bind:value={name} supporting={error || t('settings.cylinders.nameHelp')} invalid={!!error} />
    <div class="od-cylinder-type--pair">
      <TextField label={t('settings.cylinders.volume')} bind:value={volume} inputmode="decimal">
        {#snippet trailing()}<span class="od-cylinder-type--unit">{t(cuft ? 'units.cubicFeet' : 'units.liters')}</span>{/snippet}
      </TextField>
      <TextField label={t('settings.cylinders.pressure')} bind:value={pressure} inputmode="decimal">
        {#snippet trailing()}<span class="od-cylinder-type--unit">{t(psi ? 'units.psi' : 'units.bar')}</span>{/snippet}
      </TextField>
    </div>
  </div>
  <p class="od-cylinder-type--note od-cylinder-type--first">{t(cuft ? 'settings.cylinders.volumeNoteCuft' : 'settings.cylinders.volumeNoteLitres')}</p>
  {#if usageNote}<p class="od-cylinder-type--note">{usageNote}</p>{/if}

  {#if editing && type}
    {#if type.library}
      <div class="od-cylinder-type--action">
        <button type="button" class="od-outlined-button od-danger" onclick={remove}>{t('settings.cylinders.delete')}</button>
      </div>
    {:else}
      <p class="od-cylinder-type--note">{t('settings.cylinders.fromLogbook')}</p>
    {/if}
  {/if}
</Page>

<style>
  @layer od.components {
    .od-cylinder-type--pair {
      display: flex;
      gap: 16px;

      & > :global(*) {
        flex: 1;
        min-width: 0;
      }
    }

    .od-cylinder-type--unit {
      padding-inline-end: 12px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-cylinder-type--action {
      margin-top: 24px;
      display: flex;
      justify-content: center;
    }

    .od-cylinder-type--note.od-cylinder-type--first {
      margin-top: 12px;
    }

    .od-cylinder-type--note {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
