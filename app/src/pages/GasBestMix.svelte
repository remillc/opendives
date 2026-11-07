<script module>
  // Kept while the app runs, so that the tool shows the last values again.
  const saved = { po2: 1400, depth: '', water: 'salt' };
</script>

<script>
  // @ts-check
  // Best mix (docs/ui-specification.md, section 1, "Tools page and gas tools";
  // docs/mockups/outils-meilleur-melange-android.dc.html). The nitrox, then
  // the trimix, for a depth, a pO2 and a maximum END, from the core (toolQuery
  // 'gas': best_o2 rounded down, best_he rounded up). The maximum END starts at
  // the value of Settings, Décompression, and is changed for this calculation
  // only.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import Po2Wheel from '../components/Po2Wheel.svelte';
  import GasResults from '../components/GasResults.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { depthUnit, formatNumber } from '../lib/format.js';
  import { WATER_TYPES, waterTypeName, salinityOfWaterType, parseDecimal } from '../lib/tools.js';
  import { t } from '../lib/i18n.js';

  const feet = logbook.prefs.length === 'ft';
  const mmPerUnit = feet ? 304.8 : 1000;
  let po2 = $state(saved.po2);
  let depth = $state(saved.depth || (feet ? '100' : '30'));
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
    if (depthInvalid || endInvalid) {
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
      args: [Math.round(endValue * mmPerUnit), salinityOfWaterType(water)],
    })
      .then((/** @type {import('opendives-core').GasResult} */ r) => {
        result = r;
      })
      .catch((e) => {
        console.error('Best mix', e);
        result = null;
      });
  });

  /** @param {number} mm */
  function wholeDepth(mm) {
    return `${formatNumber(mm / mmPerUnit, 0)} ${depthUnit(logbook.prefs)}`;
  }

  const rows = $derived.by(() => {
    if (!result) return [{ title: t('tools.nitrox'), sub: '', value: '—' }];
    const over = result.nitroxEndMm > Math.round(endValue * mmPerUnit);
    /** @type {{ title: string, sub: string, value: string, alarm?: boolean }[]} */
    const list = [
      {
        title: t('tools.nitrox'),
        sub: t(over ? 'tools.nitroxEndOver' : 'tools.nitroxEnd', { end: wholeDepth(result.nitroxEndMm) }),
        value: `EAN${formatNumber(result.bestO2 / 10, 0)}`,
        alarm: over,
      },
    ];
    if (result.bestHe > 0) {
      list.push({
        title: t('tools.trimix'),
        sub: t('tools.trimixSub', { o2: formatNumber(result.bestO2 / 10, 0), he: formatNumber(result.bestHe / 10, 0) }),
        value: `${formatNumber(result.bestO2 / 10, 0)}/${formatNumber(result.bestHe / 10, 0)}`,
      });
    }
    return list;
  });
</script>

<Page>
  <Navbar title={t('tools.bestMixTool')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('common.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="pair">
    <TextField label={t('tools.depth')} bind:value={depth} inputmode="decimal" invalid={depthInvalid} supporting={depthInvalid ? t('tools.depthInvalid') : ''}>
      {#snippet trailing()}<span class="unit">{depthUnit(logbook.prefs)}</span>{/snippet}
    </TextField>
    <SelectField label={t('tools.waterType')} bind:value={water} options={WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) }))} />
  </div>

  <div class="gap"></div>
  <Po2Wheel bind:value={po2} />

  <TextField label={t('tools.maxEnd')} bind:value={maxEnd} inputmode="decimal" invalid={endInvalid} supporting={endInvalid ? t('tools.depthInvalid') : t('tools.maxEndHelp')}>
    {#snippet trailing()}<span class="unit">{depthUnit(logbook.prefs)}</span>{/snippet}
  </TextField>

  <GasResults title={t('tools.bestMixResults')} {rows} />
  <p class="caption">{t(logbook.prefs.o2narcotic ? 'tools.bestMixNoteNarcotic' : 'tools.bestMixNoteNotNarcotic')}</p>
</Page>

<style>
  @layer od.components {
    .pair {
      display: flex;
      gap: 12px;
      margin: 0 16px;
      align-items: flex-start;

      :global(.field) {
        flex: 1;
        min-width: 0;
        margin-left: 0;
        margin-right: 0;
      }
    }

    .gap {
      height: 16px;
    }

    .unit {
      display: block;
      padding: 24px 8px 0 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.field:not(.floated)) & {
        visibility: hidden;
      }
    }

    .caption {
      margin: 8px 20px 32px;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }
  }
</style>
