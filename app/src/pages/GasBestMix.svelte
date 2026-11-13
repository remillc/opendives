<script module>
  // Kept while the app runs, so that the tool shows the last values again.
  const saved = { po2: 1400, depth: '', water: '', waterDefault: '' };
</script>

<script>
  // @ts-check
  // Best mix (docs/ui-specification.md, section 1, "Tools page and gas tools";
  // task 2026-11-13-91, docs/mockups/outils-meilleur-melange-android.dc.html and
  // outils-meilleur-melange-trimix-android.dc.html). Two tabs, Nitrox by
  // default: the best nitrox for a depth and a pO2, or the best trimix for a
  // depth, a pO2 and a maximum END, from the core (toolQuery 'gas': best_o2
  // rounded down, best_he rounded up). Depth, water type and pO2 are shared by
  // the tabs; the maximum END, trimix only, starts at the value of Settings,
  // Décompression, and is changed for this calculation only.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import Po2Field from '../components/Po2Field.svelte';
  import GasResults from '../components/GasResults.svelte';
  import ButtonGroup from '../components/ButtonGroup.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { depthUnit, formatNumber } from '../lib/format.js';
  import { WATER_TYPES, waterTypeName, salinityOfWaterType, parseDecimal } from '../lib/tools.js';
  import { t } from '../lib/i18n.js';

  const MODES = /** @type {const} */ (['nitrox', 'trimix']);
  let mode = $state(/** @type {'nitrox'|'trimix'} */ ('nitrox'));
  const trimix = $derived(mode === 'trimix');
  const feet = logbook.prefs.length === 'ft';
  const mmPerUnit = feet ? 304.8 : 1000;
  let po2 = $state(saved.po2);
  let depth = $state(saved.depth || (feet ? '100' : '30'));
  // The water type of Settings, until changed here or in Settings.
  if (saved.waterDefault !== settings.defaultWater) saved.water = saved.waterDefault = settings.defaultWater;
  let water = $state(saved.water);
  // The Settings value, in the unit of the depth.
  let maxEnd = $state(formatNumber(logbook.prefs.bestMixEndMm / mmPerUnit, feet ? 0 : 1));
  let result = $state(/** @type {import('opendives-core').GasResult|null} */ (null));

  const depthValue = $derived(parseDecimal(depth));
  const depthInvalid = $derived(!(depthValue > 0 && depthValue < (feet ? 1000 : 300)));
  const endValue = $derived(parseDecimal(maxEnd));
  const endInvalid = $derived(!(endValue >= 0 && endValue < (feet ? 1000 : 300)));

  $effect(() => {
    Object.assign(saved, { po2, depth, water });
    // The maximum END only matters for the trimix.
    if (depthInvalid || (trimix && endInvalid)) {
      result = null;
      return;
    }
    // The gas only matters for the MOD, which is not shown here: air.
    OpenDivesCore.toolQuery({
      kind: 'gas',
      o2: 210,
      he: 0,
      po2,
      depth: Math.round(depthValue * mmPerUnit),
      args: [trimix ? Math.round(endValue * mmPerUnit) : -1, salinityOfWaterType(water)],
    })
      .then((/** @type {import('opendives-core').GasResult} */ r) => {
        result = r;
      })
      .catch((e) => {
        console.error('Best mix', e);
        result = null;
      });
  });

  /** One result row: the tab's mix. */
  const rows = $derived.by(() => {
    const title = t(trimix ? 'tools.trimix' : 'tools.nitrox');
    if (!result) return [{ title, sub: '', value: '—' }];
    const o2 = formatNumber(result.bestO2 / 10, 0);
    const he = formatNumber(result.bestHe / 10, 0);
    return trimix
      ? [{ title, sub: t('tools.trimixSub', { o2, he }), value: `${o2}/${he}` }]
      : [{ title, sub: t('tools.nitroxSub', { o2 }), value: `EAN${o2}` }];
  });
</script>

<Page class="od-gas-best-mix">
  <Navbar title={t('tools.bestMixTool')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('common.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="od-gas-best-mix--modes">
    <ButtonGroup ariaLabel={t('tools.blendMode')} value={mode} options={MODES.map((choice) => ({ value: choice, label: t(`tools.${choice}`) }))} onchange={(choice) => (mode = /** @type {any} */ (choice))} />
  </div>

  <div class="od-gas-best-mix--pair">
    <div class="od-gas-best-mix--cell">
      <TextField label={t('tools.depth')} bind:value={depth} inputmode="decimal" invalid={depthInvalid} supporting={depthInvalid ? t('tools.depthInvalid') : ''}>
        {#snippet trailing()}<span class="od-gas-best-mix--unit">{depthUnit(logbook.prefs)}</span>{/snippet}
      </TextField>
    </div>
    <div class="od-gas-best-mix--cell">
      <SelectField label={t('tools.waterType')} bind:value={water} options={WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) }))} />
    </div>
  </div>

  <div class="od-gas-best-mix--gap"></div>
  <!-- The pO2 takes one column; the trimix adds the maximum END in the other. -->
  <div class="od-gas-best-mix--pair">
    <div class="od-gas-best-mix--cell"><Po2Field bind:value={po2} /></div>
    <div class="od-gas-best-mix--cell">
      {#if trimix}
        <TextField label={t('tools.maxEnd')} bind:value={maxEnd} inputmode="decimal" invalid={endInvalid} supporting={endInvalid ? t('tools.depthInvalid') : t('tools.maxEndHelp')}>
          {#snippet trailing()}<span class="od-gas-best-mix--unit">{depthUnit(logbook.prefs)}</span>{/snippet}
        </TextField>
      {/if}
    </div>
  </div>

  <GasResults title={t('tools.bestMixResults')} {rows} />
  <p class="od-gas-best-mix--caption">
    {t(trimix ? (logbook.prefs.o2narcotic ? 'tools.bestMixNoteNarcotic' : 'tools.bestMixNoteNotNarcotic') : 'tools.bestMixNoteNitrox')}
  </p>
</Page>

<style>
  @layer od.components {
    .od-gas-best-mix--pair {
      display: flex;
      gap: 12px;
      margin: 0 16px;
      align-items: flex-start;

      :global(.od-text-field--field) {
        flex: 1;
        min-width: 0;
        margin-left: 0;
        margin-right: 0;
      }
    }

    .od-gas-best-mix--modes {
      margin: 8px 16px 0;
    }

    /* Each half of a row; the fields inside take its whole width. */
    .od-gas-best-mix--cell {
      flex: 1;
      min-width: 0;
      --od-field-margin: 0;
    }

    .od-gas-best-mix--gap {
      height: 16px;
    }

    .od-gas-best-mix--unit {
      display: block;
      padding: 24px 8px 0 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.od-text-field--field:not(.od-text-field--floated)) & {
        visibility: hidden;
      }
    }

    .od-gas-best-mix--caption {
      margin: 8px 20px 32px;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }
  }
</style>
