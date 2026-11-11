<script module>
  // Kept while the app runs, so that the tool shows the last gas again.
  const saved = { o2: '32', he: '0', po2: 1400, depth: '', water: '', waterDefault: '' };
</script>

<script>
  // @ts-check
  // EAD and MOD (docs/ui-specification.md, section 1, "Tools page and gas
  // tools"; docs/mockups/outils-ead-mod-android.dc.html). Every result comes
  // from the core (toolQuery 'gas'): MOD for the pO2, EAD and END at the
  // planned depth. The water type changes every depth to pressure conversion.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import Po2Field from '../components/Po2Field.svelte';
  import GasResults from '../components/GasResults.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { depthUnit, formatMixName, formatNumber } from '../lib/format.js';
  import { WATER_TYPES, waterTypeName, salinityOfWaterType, parseDecimal } from '../lib/tools.js';
  import { t } from '../lib/i18n.js';

  const feet = $derived(logbook.prefs.length === 'ft');
  let o2 = $state(saved.o2);
  let he = $state(saved.he);
  let po2 = $state(saved.po2);
  let depth = $state(saved.depth || (logbook.prefs.length === 'ft' ? '100' : '30'));
  // The water type of Settings, until changed here or in Settings.
  if (saved.waterDefault !== settings.defaultWater) saved.water = saved.waterDefault = settings.defaultWater;
  let water = $state(saved.water);
  let result = $state(/** @type {import('opendives-core').GasResult|null} */ (null));

  /** @param {string} text */
  const percent = (text) => (/^\s*\d{1,3}\s*$/.test(text) ? Number(text) : NaN);
  const o2Value = $derived(percent(o2));
  const heValue = $derived(he.trim() === '' ? 0 : percent(he));
  const gasInvalid = $derived(!(o2Value >= 1 && o2Value <= 100 && heValue >= 0 && o2Value + heValue <= 100));
  const depthValue = $derived(parseDecimal(depth));
  const depthMm = $derived(Math.round(feet ? depthValue * 304.8 : depthValue * 1000));
  const depthInvalid = $derived(!(depthValue > 0 && depthValue < (feet ? 1000 : 300)));

  $effect(() => {
    Object.assign(saved, { o2, he, po2, depth, water });
    if (gasInvalid || depthInvalid) {
      result = null;
      return;
    }
    OpenDivesCore.toolQuery({ kind: 'gas', o2: o2Value * 10, he: heValue * 10, po2, depth: depthMm, args: [-1, salinityOfWaterType(water)] })
      .then((/** @type {import('opendives-core').GasResult} */ r) => {
        result = r;
      })
      .catch((e) => {
        console.error('EAD and MOD', e);
        result = null;
      });
  });

  /** Whole metres or feet: the core rounds the MOD to the metre. @param {number} mm */
  function wholeDepth(mm) {
    return `${formatNumber(feet ? mm / 304.8 : mm / 1000, 0)} ${depthUnit(logbook.prefs)}`;
  }

  const rows = $derived(
    result
      ? [
          { title: t('tools.mod'), sub: t('tools.modSub', { gas: formatMixName(result.o2, result.he), po2: formatNumber(result.po2Mbar / 1000, 1) }), value: wholeDepth(result.modMm) },
          { title: t('tools.ead'), sub: t('tools.eadSub', { depth: wholeDepth(depthMm) }), value: wholeDepth(result.eadPlannedMm) },
          { title: t('tools.end'), sub: t(result.o2Narcotic ? 'tools.endSub' : 'tools.endSubNotNarcotic'), value: wholeDepth(result.endPlannedMm) },
        ]
      : [
          { title: t('tools.mod'), sub: '', value: '—' },
          { title: t('tools.ead'), sub: '', value: '—' },
          { title: t('tools.end'), sub: '', value: '—' },
        ],
  );
</script>

<Page class="od-gas-ead-mod">
  <Navbar title={t('tools.eadMod')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('common.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="od-gas-ead-mod--pair">
      <TextField label={t('tools.oxygen')} bind:value={o2} inputmode="numeric" invalid={gasInvalid} supporting={gasInvalid ? t('tools.gasInvalid') : ''}>
        {#snippet trailing()}<span class="od-gas-ead-mod--unit">{t('units.percent')}</span>{/snippet}
      </TextField>
      <TextField label={t('tools.helium')} bind:value={he} inputmode="numeric" invalid={gasInvalid}>
        {#snippet trailing()}<span class="od-gas-ead-mod--unit">{t('units.percent')}</span>{/snippet}
      </TextField>
  </div>

  <div class="od-gas-ead-mod--gap"></div>
  <Po2Field bind:value={po2} />

  <TextField
    label={t('tools.plannedDepth')}
    bind:value={depth}
    inputmode="decimal"
    invalid={depthInvalid}
    supporting={depthInvalid ? t('tools.depthInvalid') : t('tools.plannedDepthHelp')}
  >
    {#snippet trailing()}<span class="od-gas-ead-mod--unit">{depthUnit(logbook.prefs)}</span>{/snippet}
  </TextField>
  <SelectField label={t('tools.waterType')} bind:value={water} options={WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) }))} />

  <GasResults title={t('tools.results')} {rows} />
  <p class="od-gas-ead-mod--caption">{t('tools.eadNote')}</p>
</Page>

<style>
  @layer od.components {
    .od-gas-ead-mod--pair {
      display: flex;
      gap: 12px;
      margin: 0 16px;

      :global(.od-text-field--field) {
        flex: 1;
        min-width: 0;
        margin-left: 0;
        margin-right: 0;
      }
    }

    .od-gas-ead-mod--gap {
      height: 16px;
    }

    .od-gas-ead-mod--unit {
      display: block;
      padding: 24px 8px 0 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.od-text-field--field:not(.od-text-field--floated)) & {
        visibility: hidden;
      }
    }

    .od-gas-ead-mod--caption {
      margin: 8px 20px 32px;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }
  }
</style>
