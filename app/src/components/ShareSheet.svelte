<script>
  // @ts-check
  // "Partager" (docs/mockups/partage-android.dc.html; spec, section 4,
  // "Dive detail"): an MD3 modal bottom sheet over the dive detail, with two
  // rows of 72 dp, each icon in a 40 dp circle of the water's top colour:
  // the one-page PDF sheet, or a short text with the profile image. The
  // system's share sheet follows.
  import { Sheet } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * The texts of the rows default to those of a dive.
   * @type {{ onpdf: () => void, onsummary: () => void, onclose: () => void, pdfText?: string, summaryLabel?: string, summaryText?: string }}
   */
  let { onpdf, onsummary, onclose, pdfText = t('share.pdfText'), summaryLabel = t('share.summary'), summaryText = t('share.summaryText') } = $props();
</script>

<Sheet opened swipeToClose backdrop class="od-share-sheet" style="height: auto" onSheetClosed={onclose}>
  <div class="sheet" role="dialog" aria-labelledby="od-share-title">
    <div class="handle" aria-hidden="true"></div>
    <h2 id="od-share-title" class="title">{t('share.title')}</h2>
    <button type="button" class="row" onclick={onpdf}>
      <span class="circle" aria-hidden="true"><Icon name="document" size={22} weight={2} /></span>
      <span class="texts"><span class="headline">{t('share.pdf')}</span><span class="supporting">{pdfText}</span></span>
    </button>
    <button type="button" class="row" onclick={onsummary}>
      <span class="circle" aria-hidden="true"><Icon name="image" size={22} weight={2} /></span>
      <span class="texts"><span class="headline">{summaryLabel}</span><span class="supporting">{summaryText}</span></span>
    </button>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.od-share-sheet) {
      border-radius: 28px 28px 0 0;
      background: var(--od-dialog);
      overflow: hidden;
    }

    .sheet {
      padding: 8px 0 calc(16px + var(--f7-safe-area-bottom, 0px));
    }

    .handle {
      width: 32px;
      height: 4px;
      margin: 8px auto 12px;
      border-radius: 2px;
      background: var(--od-text-2);
      opacity: 0.4;
    }

    .title {
      margin: 0 24px 8px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
      color: var(--od-text);
    }

    .row {
      width: 100%;
      min-height: 72px;
      padding: 8px 24px 8px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    /* The icon in a 40 dp circle of the water's top colour. */
    .circle {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-share-circle);
      color: var(--od-share-icon);
    }

    .texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .headline {
      font-size: 16px;
      line-height: 24px;
    }

    .supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
