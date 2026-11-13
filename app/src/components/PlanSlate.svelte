<script>
  // @ts-check
  // "Ardoise pour l’eau" (docs/mockups/android-planificateur-ardoise.dc.html, -taille, -fichier;
  // spec, section 4, "Sharing a plan"): a full-screen task over the planner. Which extra plans
  // to include, the size and the file, and a live preview of the card. Each extra plan is the
  // plan's request with one change, planned again by the core (the same planDive call as the
  // planner screen): nothing about decompression is computed here (lib/slate.js).
  import { onMount } from 'svelte';
  import { Popup, Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import RowMenu from './RowMenu.svelte';
  import { formatDepth, formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { simplifyProfile } from '../lib/profile-levels.js';
  import { letterPaper, planGas } from '../lib/share.js';
  import { settings, setAppSetting } from '../lib/settings.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { buildCard, layoutOf, shareSlate } from '../lib/slate-share.js';
  import { EXTRA_BOTTOM_SECONDS, FEET_STEP_MM, METRE_STEP_MM, cardHtml, decoGasIndexes, slateSize, slateSizes, slateText, variantRequests } from '../lib/slate.js';

  /**
   * @type {{
   *   result: import('opendives-core').PlanResult,
   *   request: import('opendives-core').PlanRequest,
   *   prefs: import('opendives-core').Prefs,
   *   title: string,
   *   onclose: () => void,
   * }}
   */
  let { result, request, prefs, title, onclose } = $props();

  const feet = $derived(prefs.length === 'ft');
  const letter = $derived(letterPaper());
  const sizes = $derived(slateSizes(letter));
  const size = $derived(slateSize(letter, settings.slateSize));
  /** The paper's name in the sentences: Lettre or A4. */
  const paperName = $derived(t(letter ? 'settings.paperSize.letter' : 'settings.paperSize.a4'));
  const decoGases = $derived(decoGasIndexes(request.cylinders));

  /** Deco gases to lose, by cylinder index: none by default. */
  let without = $state(/** @type {number[]} */ ([]));
  /** The plan's levels: its own, or those of the measured profile it starts from, simplified. */
  let levels = $state(/** @type {{ depthMm: number, durationSeconds: number }[]|null} */ (null));
  /** The core's plans by variant id: a result, null when the core could not plan it. */
  let computed = $state(/** @type {Record<string, import('opendives-core').PlanResult|null>} */ ({}));
  let menu = $state(/** @type {null|{ kind: 'size'|'file', anchor: HTMLElement }} */ (null));
  let sharing = $state(false);

  onMount(async () => {
    if (request.levels?.length) {
      levels = request.levels;
    } else if (request.sourceDiveId) {
      // A measured profile: the extra plans start from its simplified levels ("Simplifier le profil").
      try {
        const dive = await OpenDivesCore.getDive({ id: request.sourceDiveId });
        const simple = simplifyProfile(dive.samples);
        levels = simple.length ? simple : [{ depthMm: result.maxDepthMm, durationSeconds: Math.max(60, Math.round(result.runtimeSeconds / 60) * 60) }];
      } catch (e) {
        console.error('Slate levels', e);
      }
    }
  });

  const variants = $derived(variantRequests(request, levels, { plus5: settings.slatePlus5, plusDepth: settings.slatePlusDepth, without, feet }));

  // Each extra plan is planned by the core once; a change of choice only asks for the new ones.
  $effect(() => {
    for (const v of variants) {
      if (v.id in computed) continue;
      OpenDivesCore.planDive(v.request)
        .then((r) => (computed[v.id] = r))
        .catch((e) => {
          console.error('Slate plan', v.id, e);
          computed[v.id] = null;
        });
    }
  });

  const pending = $derived(variants.some((v) => !(v.id in computed)));
  const card = $derived(buildCard({ result, request, variants: variants.map((variant) => ({ variant, result: computed[variant.id] ?? null })), prefs, title }));
  const layout = $derived(layoutOf(card, size));
  const failed = $derived(variants.some((v) => v.id in computed && (computed[v.id] === null || computed[v.id]?.error)));

  const PREVIEW_PX = 300;
  /** CSS pixels per mm at 96 dpi, and the factor that fits the card in the preview's width. */
  const PX_PER_MM = 96 / 25.4;
  const scale = $derived(Math.min(1, PREVIEW_PX / (layout.widthMm * PX_PER_MM)));

  /** @param {number} seconds */
  const minutesText = (seconds) => `${formatNumber(Math.round(seconds / 60), 0)}\u00A0${t('units.minutes')}`;
  const deepest = $derived(
    levels?.length ? levels.reduce((a, l) => (l.depthMm > a.depthMm ? l : a), levels[0]) : null,
  );
  const stepMm = $derived(feet ? FEET_STEP_MM : METRE_STEP_MM);

  /** @param {number} cylinder */
  const gasOf = (cylinder) => planGas(request.cylinders[cylinder].o2Permille, request.cylinders[cylinder].hePermille);

  /** @param {number} cylinder */
  function toggleWithout(cylinder) {
    without = without.includes(cylinder) ? without.filter((c) => c !== cylinder) : [...without, cylinder];
  }

  /** @param {'size'|'file'} kind @param {MouseEvent} e */
  function openMenu(kind, e) {
    menu = { kind, anchor: /** @type {HTMLElement} */ (e.currentTarget) };
  }

  /** The label of a size, and its value on the row: the full page names the paper. @param {import('../lib/slate.js').SlateSize} s */
  const sizeName = (s) => t(s.nameKey);
  /** @param {import('../lib/slate.js').SlateSize} s */
  const sizeValue = (s) => (s.id === 'full' ? t('slate.sizeFull', { name: t(s.nameKey), paper: paperName }) : t(s.nameKey));

  const sizeOptions = $derived(sizes.map((s) => ({ value: s.id, label: sizeName(s), example: t(s.noteKey) })));
  const fileOptions = $derived(
    /** @type {const} */ (['pdf', 'png', 'text']).map((f) => ({ value: f, label: t(`slate.files.${f}`), example: t(`slate.files.${f}Note`) })),
  );

  async function share() {
    if (sharing || pending) return;
    sharing = true;
    try {
      await shareSlate({ card, result, size: size.id, file: settings.slateFile });
    } catch (e) {
      console.error('Sharing the slate', e);
      showSnackbar(t('slate.failed'));
    } finally {
      sharing = false;
    }
  }
</script>

<Popup opened onPopupClosed={onclose} class="od-plan-slate">
  <Page>
    <Navbar title={t('slate.title')}>
      {#snippet left()}
        <Link popupClose iconOnly>
          <Icon name="close" /><span class="od-sr-only">{t('slate.close')}</span>
        </Link>
      {/snippet}
      {#snippet right()}
        <Link class={pending || sharing ? 'disabled' : ''} onClick={share}>{t('slate.share')}</Link>
      {/snippet}
    </Navbar>

    <h2 class="od-plan-slate--title">{t('slate.plans')}</h2>
    <div class="od-plan-slate--surface">
      <div class="od-plan-slate--row" role="checkbox" aria-checked="true" aria-disabled="true">
        <span class="od-plan-slate--check od-plan-slate--check-on od-plan-slate--check-locked" aria-hidden="true"><Icon name="check" size={14} weight={3} /></span>
        <span class="od-plan-slate--texts"><span class="od-plan-slate--label">{t('slate.planned')}</span><span class="od-plan-slate--supporting">{t('slate.always')}</span></span>
      </div>
      {#if deepest}
        <button type="button" class="od-plan-slate--row" role="checkbox" aria-checked={settings.slatePlus5} onclick={() => setAppSetting('slatePlus5', !settings.slatePlus5)}>
          <span class="od-plan-slate--check" class:od-plan-slate--check-on={settings.slatePlus5} aria-hidden="true">{#if settings.slatePlus5}<Icon name="check" size={14} weight={3} />{/if}</span>
          <span class="od-plan-slate--texts">
            <span class="od-plan-slate--label">{t('slate.plus5Row')}</span>
            <span class="od-plan-slate--supporting">{t('slate.levelText', { depth: formatDepth(deepest.depthMm, prefs), time: minutesText(deepest.durationSeconds + EXTRA_BOTTOM_SECONDS) })}</span>
          </span>
        </button>
        <button type="button" class="od-plan-slate--row" role="checkbox" aria-checked={settings.slatePlusDepth} onclick={() => setAppSetting('slatePlusDepth', !settings.slatePlusDepth)}>
          <span class="od-plan-slate--check" class:od-plan-slate--check-on={settings.slatePlusDepth} aria-hidden="true">{#if settings.slatePlusDepth}<Icon name="check" size={14} weight={3} />{/if}</span>
          <span class="od-plan-slate--texts">
            <span class="od-plan-slate--label">{t('slate.plusDepthRow', { depth: formatDepth(stepMm, prefs) })}</span>
            <span class="od-plan-slate--supporting">{t('slate.levelText', { depth: formatDepth(deepest.depthMm + stepMm, prefs), time: minutesText(deepest.durationSeconds) })}</span>
          </span>
        </button>
      {/if}
      {#each decoGases as cylinder (cylinder)}
        {@const on = without.includes(cylinder)}
        <button type="button" class="od-plan-slate--row" role="checkbox" aria-checked={on} onclick={() => toggleWithout(cylinder)}>
          <span class="od-plan-slate--check" class:od-plan-slate--check-on={on} aria-hidden="true">{#if on}<Icon name="check" size={14} weight={3} />{/if}</span>
          <span class="od-plan-slate--texts">
            <span class="od-plan-slate--label">{t('slate.withoutRow', { gas: gasOf(cylinder) })}</span>
            <span class="od-plan-slate--supporting">{t('slate.withoutText')}</span>
          </span>
        </button>
      {/each}
    </div>
    <p class="od-plan-slate--note">{t('slate.plansNote')}</p>
    {#if failed}<p class="od-plan-slate--note od-plan-slate--alarm" role="status">{t('slate.unplannable')}</p>{/if}

    <h2 class="od-plan-slate--title">{t('slate.print')}</h2>
    <div class="od-plan-slate--surface">
      <button type="button" class="od-plan-slate--row od-plan-slate--menu-row" onclick={(e) => openMenu('size', e)} aria-haspopup="listbox">
        <span class="od-plan-slate--label od-plan-slate--grow">{t('slate.sizeLabel')}</span>
        <span class="od-plan-slate--value">{sizeValue(size)}</span>
        <Icon name="expand" size={18} weight={2} />
      </button>
      <button type="button" class="od-plan-slate--row od-plan-slate--menu-row" onclick={(e) => openMenu('file', e)} aria-haspopup="listbox">
        <span class="od-plan-slate--label od-plan-slate--grow">{t('slate.fileLabel')}</span>
        <span class="od-plan-slate--value">{t(`slate.files.${settings.slateFile}`)}</span>
        <Icon name="expand" size={18} weight={2} />
      </button>
    </div>
    <p class="od-plan-slate--note">
      {settings.slateFile === 'pdf' ? t('slate.noteSheet', { paper: paperName }) : settings.slateFile === 'png' ? t('slate.noteImage') : t('slate.noteText')}
    </p>

    <h2 class="od-plan-slate--title">{t('slate.preview')}</h2>
    <div class="od-plan-slate--preview" aria-busy={pending}>
      {#if settings.slateFile === 'text'}
        <pre class="od-plan-slate--text" aria-label={t('slate.previewLabel')}>{slateText(card)}</pre>
      {:else}
        <div
          class="od-plan-slate--paper"
          role="img"
          aria-label={t('slate.previewLabel')}
          style:width="{layout.widthMm * PX_PER_MM * scale}px"
          style:height="{layout.heightMm * PX_PER_MM * scale}px"
        >
          <div class="od-plan-slate--card" style:transform="scale({scale})">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- the card's own markup, its texts escaped (slate.js) -->
            {@html cardHtml(card, layout)}
          </div>
        </div>
      {/if}
    </div>
    <div class="od-plan-slate--bottom"></div>
  </Page>
</Popup>

{#if menu}
  <RowMenu
    anchor={menu.anchor}
    label={t(menu.kind === 'size' ? 'slate.sizeLabel' : 'slate.fileLabel')}
    options={menu.kind === 'size' ? sizeOptions : fileOptions}
    value={menu.kind === 'size' ? size.id : settings.slateFile}
    onclose={() => (menu = null)}
    onselect={(v) => (menu?.kind === 'size' ? setAppSetting('slateSize', /** @type {'standard'|'small'|'full'} */ (v)) : setAppSetting('slateFile', /** @type {'pdf'|'png'|'text'} */ (v)))}
  />
{/if}

<style>
  @layer od.components {
    .od-plan-slate--title {
      margin: 0;
      padding: 22px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
      color: var(--od-text);
    }

    .od-plan-slate--surface {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-plan-slate--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 72px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      border-top: 1px solid var(--od-row-divider);
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      &:first-child {
        border-top: none;
      }
    }

    .od-plan-slate--menu-row {
      min-height: 56px;
      gap: 12px;
    }

    .od-plan-slate--grow {
      flex: 1;
    }

    .od-plan-slate--check {
      flex: none;
      width: 18px;
      height: 18px;
      margin: 0 11px;
      box-sizing: border-box;
      border-radius: 2px;
      border: 2px solid var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-on-primary);
    }

    .od-plan-slate--check-on {
      border: none;
      background: var(--od-primary);
    }

    .od-plan-slate--check-locked {
      background: var(--od-star-summary);
    }

    .od-plan-slate--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-plan-slate--label {
      font-size: 16px;
      line-height: 24px;
    }

    .od-plan-slate--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-plan-slate--value {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-plan-slate--note {
      margin: 8px 32px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }

    .od-plan-slate--alarm {
      color: var(--od-alarm);
    }

    .od-plan-slate--preview {
      padding: 8px 0 24px;
      display: flex;
      justify-content: center;
    }

    /* The card is white on any theme, as it prints. */
    .od-plan-slate--paper {
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    }

    .od-plan-slate--card {
      transform-origin: top left;
      width: max-content;
    }

    .od-plan-slate--text {
      box-sizing: border-box;
      max-width: calc(100% - 32px);
      margin: 0;
      padding: 12px;
      overflow-x: auto;
      border-radius: 12px;
      background: var(--od-surface);
      color: var(--od-text);
      font: 12px/16px monospace;
      font-variant-numeric: tabular-nums;
    }

    .od-plan-slate--bottom {
      height: calc(24px + var(--f7-safe-area-bottom, 0px));
    }

    :global(.ios) .od-plan-slate--row {
      min-height: 56px;
    }
  }
</style>
