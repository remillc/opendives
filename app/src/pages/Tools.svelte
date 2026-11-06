<script module>
  // Kept while the app runs, so that the calculator shows the last gas again.
  const saved = { o2: '32', he: '0', po2: 1400, depth: '', cylinder: '' };
</script>

<script>
  // @ts-check
  // Tools section (docs/ui-specification.md, section 1, "Tools";
  // docs/mockups/android-outils.dc.html, ios-outils.dc.html): the planner, the
  // desaturation, then the gas calculator aligned on Subsurface-mobile's. Every
  // result comes from the core (toolQuery 'gas'): MOD, EAD and END at the MOD,
  // best mix for the planned depth. Sea water, 1013 mbar.
  import { Page, Navbar } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import MenuButton from '../components/MenuButton.svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { depthUnit, formatGas, formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  const PO2_CHOICES = [1200, 1400, 1600];

  let o2 = $state(saved.o2);
  let he = $state(saved.he);
  let po2 = $state(saved.po2);
  let depth = $state(saved.depth);
  let cylinder = $state(saved.cylinder);
  /** @type {string[]} */
  let cylinders = $state([]);
  let result = $state(/** @type {import('opendives-core').GasResult|null} */ (null));

  const feet = $derived(logbook.prefs.length === 'ft');
  /** Planned depth shown when the field is empty: 30 m, or 100 ft. */
  const defaultDepth = $derived(feet ? '100' : '30');

  /** @param {string} text */
  const percent = (text) => (/^\s*\d{1,3}\s*$/.test(text) ? Number(text) : NaN);
  const o2Value = $derived(percent(o2));
  const heValue = $derived(he.trim() === '' ? 0 : percent(he));
  const gasInvalid = $derived(!(o2Value >= 1 && o2Value <= 100 && heValue >= 0 && o2Value + heValue <= 100));
  const depthText = $derived(depth.trim() === '' ? defaultDepth : depth.trim().replace(',', '.'));
  const depthValue = $derived(/^\d+(\.\d+)?$/.test(depthText) ? Number(depthText) : NaN);
  const depthMm = $derived(Math.round(feet ? depthValue * 304.8 : depthValue * 1000));
  const depthInvalid = $derived(!(depthValue > 0 && depthValue < (feet ? 1000 : 300)));

  // Read again when the logbook changes: its cylinders are part of the list.
  $effect(() => {
    if (logbook.loading) return;
    OpenDivesCore.toolQuery({ kind: 'cylinders' })
      .then((/** @type {import('opendives-core').CylinderTypes} */ list) => {
        cylinders = list.types.map((c) => c.name);
        if (!cylinder || !cylinders.includes(cylinder)) {
          cylinder = cylinders.includes(list.default) ? list.default : cylinders.includes('AL80') ? 'AL80' : (cylinders[0] ?? '');
        }
      })
      .catch((e) => console.error('Cylinder types', e));
  });

  $effect(() => {
    Object.assign(saved, { o2, he, po2, depth, cylinder });
    if (gasInvalid || depthInvalid) {
      result = null;
      return;
    }
    const request = { kind: /** @type {const} */ ('gas'), o2: o2Value * 10, he: heValue * 10, po2, depth: depthMm };
    OpenDivesCore.toolQuery(request)
      .then((/** @type {import('opendives-core').GasResult} */ r) => {
        result = r;
      })
      .catch((e) => {
        console.error('Gas calculator', e);
        result = null;
      });
  });

  /** Whole metres or feet: the core rounds the MOD to the metre. @param {number} mm */
  function wholeDepth(mm) {
    return `${formatNumber(feet ? mm / 304.8 : mm / 1000, 0)} ${depthUnit(logbook.prefs)}`;
  }

  /** @param {number} mbar */
  const bar = (mbar) => formatNumber(mbar / 1000, 1);

  const gasName = $derived(result ? formatGas(result.o2, result.he) : '');
</script>

<Page>
  <Navbar title={t('tools.title')}>
    {#snippet left()}<MenuButton />{/snippet}
  </Navbar>

  <div class="list media-list tools-list">
    <ul>
      <li>
        <a href="/plan/new/" class="item-link item-content">
          <div class="item-inner">
            <div class="item-title">{t('tools.planner')}</div>
            <div class="item-text">{t('tools.plannerText')}</div>
          </div>
        </a>
      </li>
      <li>
        <a href="/tools/desaturation/" class="item-link item-content">
          <div class="item-inner">
            <div class="item-title">{t('tools.desaturation')}</div>
            <div class="item-text">{t('tools.desaturationText')}</div>
          </div>
        </a>
      </li>
    </ul>
  </div>

  <h2 class="section">{t('tools.gasCalculator')}</h2>

  <TextField label={t('tools.oxygen')} bind:value={o2} inputmode="numeric" invalid={gasInvalid}>
    {#snippet trailing()}<span class="unit">{t('units.percent')}</span>{/snippet}
  </TextField>
  <TextField label={t('tools.helium')} bind:value={he} inputmode="numeric" invalid={gasInvalid} supporting={gasInvalid ? t('tools.gasInvalid') : ''}>
    {#snippet trailing()}<span class="unit">{t('units.percent')}</span>{/snippet}
  </TextField>

  <div class="field filled-value dropdown">
    <label class="flabel" for="od-cylinder-type">{t('tools.cylinderType')}</label>
    <select id="od-cylinder-type" bind:value={cylinder}>
      {#each cylinders as name (name)}<option value={name}>{name}</option>{/each}
    </select>
    <span class="dropdown-icon"><Icon name="expand" /></span>
  </div>

  <div class="po2-row">
    <span id="od-po2-label" class="po2-label">{t('tools.maxPo2')}</span>
    <div class="segmented-po2" role="radiogroup" aria-labelledby="od-po2-label">
      {#each PO2_CHOICES as choice (choice)}
        <button
          type="button"
          role="radio"
          aria-checked={po2 === choice}
          class:selected={po2 === choice}
          onclick={() => (po2 = choice)}
        >
          {#if po2 === choice}<span class="check"><Icon name="check" size={18} weight={2.4} /></span>{/if}
          <span class="od-value">{bar(choice)}</span>
        </button>
      {/each}
    </div>
  </div>

  <TextField
    label={t('tools.plannedDepth')}
    bind:value={depth}
    inputmode="decimal"
    invalid={depthInvalid}
    supporting={depthInvalid ? t('tools.depthInvalid') : t('tools.plannedDepthHelp', { depth: `${defaultDepth} ${depthUnit(logbook.prefs)}` })}
  >
    {#snippet trailing()}<span class="unit">{depthUnit(logbook.prefs)}</span>{/snippet}
  </TextField>

  <div class="results" aria-live="polite">
    <div class="result">
      <span class="result-text">
        <span class="result-title">{t('tools.mod')}</span>
        <span class="result-sub">{result ? t('tools.modSub', { gas: gasName, po2: bar(result.po2Mbar) }) : ''}</span>
      </span>
      <span class="result-value od-value">{result ? wholeDepth(result.modMm) : '—'}</span>
    </div>
    <div class="result">
      <span class="result-text">
        <span class="result-title">{t('tools.ead')}</span>
        <span class="result-sub">{t('tools.eadSub')}</span>
      </span>
      <span class="result-value od-value">{result ? wholeDepth(result.eadMm) : '—'}</span>
    </div>
    <div class="result">
      <span class="result-text">
        <span class="result-title">{t('tools.end')}</span>
        <span class="result-sub">{result && !result.o2Narcotic ? t('tools.endSubNotNarcotic') : t('tools.endSub')}</span>
      </span>
      <span class="result-value od-value">{result ? wholeDepth(result.endMm) : '—'}</span>
    </div>
    <div class="result">
      <span class="result-text">
        <span class="result-title">{t('tools.bestMix')}</span>
        <span class="result-sub">
          {#if result}
            {result.bestHe
              ? t('tools.bestMixSubEnd', { depth: wholeDepth(result.plannedDepthMm), po2: bar(result.po2Mbar), end: wholeDepth(result.bestMixEndMm) })
              : t('tools.bestMixSub', { depth: wholeDepth(result.plannedDepthMm), po2: bar(result.po2Mbar) })}
          {/if}
        </span>
      </span>
      <span class="result-value od-value">{result ? formatGas(result.bestO2, result.bestHe) : '—'}</span>
    </div>
  </div>

  <p class="caption">{t('tools.calculatorNote')}</p>
</Page>

<style>
  @layer od.components {
    .tools-list {
      margin: 0;
    }

    .section {
      margin: 8px 16px 0;
      height: 48px;
      display: flex;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      color: var(--od-text);

      :global(.ios) & {
        margin: 24px 20px 0;
        height: auto;
        font-size: 13px;
        font-weight: 400;
        color: var(--od-text-2);
        text-transform: uppercase;
      }
    }

    /* Material 3 filled text field (spec, "Text fields"). */
    .field {
      position: relative;
      margin: 16px 16px 0;
      height: 56px;
      padding: 0 16px;
      box-sizing: border-box;
      border-radius: 4px 4px 0 0;
      border-bottom: 1px solid var(--od-text-2);
      background: var(--od-surface-2);
      display: flex;
      align-items: center;
      gap: 8px;

      &:focus-within {
        border-bottom: 2px solid var(--od-action);
      }

      select {
        flex: 1;
        min-width: 0;
        height: 100%;
        padding: 24px 0 6px;
        box-sizing: border-box;
        border: none;
        outline: none;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 16px;
        line-height: 24px;
        font-variant-numeric: tabular-nums;
      }

      select {
        appearance: none;
        padding-right: 40px;
      }

      :global(.ios) & {
        border-radius: 10px;
        border-bottom: none;
        background: var(--od-surface);
      }
    }

    /* Label: full size inside the empty field, small above the value on focus or once filled. */
    .flabel {
      position: absolute;
      left: 16px;
      top: 16px;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);
      pointer-events: none;
      transition:
        top 0.15s,
        font-size 0.15s;

      .field:focus-within &,
      .filled-value & {
        top: 8px;
        font-size: 12px;
        line-height: 16px;
      }

      .field:focus-within & {
        color: var(--od-text);
      }

    }

    /* MD3 suffix: on the value's line, shown with the value. */
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

    .dropdown-icon {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      pointer-events: none;
      color: var(--od-text);
    }

    .po2-row {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 56px;
      margin-top: 8px;
      padding: 0 16px;
    }

    .po2-label {
      flex: 1;
      font-size: 16px;
    }

    /* Material 3 segmented buttons; on iOS, a segmented control. */
    .segmented-po2 {
      flex: none;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      width: 210px;

      button {
        height: 40px;
        min-width: 48px;
        padding: 0 12px;
        border: 1px solid var(--od-text-2);
        border-left: none;
        background: transparent;
        color: var(--od-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;

        &:first-child {
          border-left: 1px solid var(--od-text-2);
          border-radius: 20px 0 0 20px;
        }

        &:last-child {
          border-radius: 0 20px 20px 0;
        }

        &.selected {
          background: var(--od-tint);
          color: var(--od-on-tint);
        }
      }

      .check {
        display: flex;
        flex: none;
      }

      :global(.ios) & {
        padding: 2px;
        border-radius: 9px;
        background: var(--od-surface-2);
        gap: 2px;

        button,
        button:first-child,
        button:last-child {
          height: 32px;
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 500;
        }

        button.selected {
          background: var(--od-surface);
          color: var(--od-text);
        }

        .check {
          display: none;
        }
      }
    }

    .results {
      margin: 16px 16px 0;
      padding: 4px 0;
      border-radius: 12px;
      background: var(--od-surface-2);

      :global(.ios) & {
        background: var(--od-surface);
      }
    }

    .result {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 64px;
      padding: 0 16px;
    }

    .result-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .result-title {
      font-size: 16px;
      line-height: 24px;
    }

    .result-sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .result-value {
      flex: none;
      font-size: 24px;
      line-height: 32px;

      :global(.ios) & {
        font-size: 22px;
        font-weight: 600;
      }
    }

    .caption {
      margin: 8px 16px 32px;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);

      :global(.ios) & {
        margin: 8px 20px 32px;
        font-size: 13px;
        letter-spacing: 0;
      }
    }
  }
</style>
