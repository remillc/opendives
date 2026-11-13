<script>
  // @ts-check
  // "Partager par code QR" (docs/mockups/partage-qr-android.dc.html; inbox task 2026-11-13-102):
  // a full-screen task over the dive or the planner. The dive summary, a large QR code on a
  // white card, the page dots and "Code 3 sur 8", the help and "Terminé". The codes of one
  // transfer (lib/qr-transfer.js) scroll about three times a second, so a missed code is read
  // on the next pass; a plan that fits one code stays still, with no dots and no counter.
  // The screen stays on and at full brightness while it is open.
  import { onDestroy, onMount } from 'svelte';
  import { Popup, Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { qrPath } from '../lib/qr-draw.js';
  import { transferOf } from '../lib/qr-send.js';

  /** Codes per second. */
  const RATE = 3;
  /** Past this many codes the dots would be too small to read: the counter alone stays. */
  const MAX_DOTS = 16;

  /**
   * @type {{
   *   id: number,
   *   kind: 'd'|'p',
   *   summary: string,
   *   onclose: () => void,
   * }}
   */
  let { id, kind, summary, onclose } = $props();

  /** @type {{size: number, d: string}[]} */
  let codes = $state([]);
  let shown = $state(0);
  let failed = $state(false);
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let timer;

  const current = $derived(codes[shown]);
  const several = $derived(codes.length > 1);

  onMount(async () => {
    OpenDivesCore.keepScreenAwake({ on: true }).catch((e) => console.error('Keep the screen awake', e));
    try {
      const texts = await transferOf(id, kind);
      codes = texts.map(qrPath);
      if (texts.length > 1) timer = setInterval(() => (shown = (shown + 1) % codes.length), 1000 / RATE);
    } catch (e) {
      console.error('QR share', e);
      failed = true;
    }
  });

  onDestroy(() => {
    clearInterval(timer);
    OpenDivesCore.keepScreenAwake({ on: false }).catch((e) => console.error('Release the screen', e));
  });
</script>

<Popup opened onPopupClosed={onclose} class="od-qr-share">
  <Page>
    <Navbar title={t('qr.shareTitle')}>
      {#snippet left()}
        <Link popupClose iconOnly>
          <Icon name="close" /><span class="od-sr-only">{t('qr.close')}</span>
        </Link>
      {/snippet}
    </Navbar>

    <p class="od-qr-share--summary">{summary}</p>

    {#if failed}
      <p class="od-qr-share--failed" role="alert">{t('qr.failed')}</p>
    {:else if current}
      <div class="od-qr-share--card" role="img" aria-label={t('qr.imageLabel', { n: String(shown + 1), total: String(codes.length) })}>
        <svg class="od-qr-share--code" viewBox="-4 -4 {current.size + 8} {current.size + 8}" shape-rendering="crispEdges" aria-hidden="true"><path d={current.d}></path></svg>
      </div>
      {#if several}
        {#if codes.length <= MAX_DOTS}
          <div class="od-qr-share--dots" aria-hidden="true">
            {#each codes as _, i}<span class="od-qr-share--dot" class:od-qr-share--dot-on={i === shown}></span>{/each}
          </div>
        {/if}
        <p class="od-qr-share--counter" aria-live="off">{t('qr.codeOf', { n: String(shown + 1), total: String(codes.length) })}</p>
      {/if}
      <p class="od-qr-share--help">{several ? t('qr.helpDive') : t('qr.helpPlan')}</p>
    {:else}
      <p class="od-qr-share--help">{t('qr.preparing')}</p>
    {/if}

    <div class="od-qr-share--actions">
      <Link popupClose class="od-qr-share--done">{t('qr.done')}</Link>
    </div>
  </Page>
</Popup>

<style>
  @layer od.components {
    :global(.od-qr-share .page) {
      background: var(--od-background);
    }

    .od-qr-share--summary {
      margin: 4px 24px 0;
      font-size: 15px;
      color: var(--od-text-2);
    }

    /* White 20 dp card: the code is always black on white, whatever the mode. */
    .od-qr-share--card {
      box-sizing: border-box;
      width: min(310px, calc(100% - 48px));
      aspect-ratio: 1;
      margin: 24px auto 0;
      padding: 20px;
      border-radius: 24px;
      background: var(--od-qr-paper);
    }

    .od-qr-share--code {
      display: block;
      width: 100%;
      height: 100%;
      fill: var(--od-qr-ink);
    }

    .od-qr-share--dots {
      margin-top: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 6px;
    }

    .od-qr-share--dot {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      background: var(--od-separator);
    }

    .od-qr-share--dot-on {
      width: 20px;
      background: var(--od-action);
    }

    .od-qr-share--counter {
      margin: 10px 0 0;
      text-align: center;
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--od-text);
    }

    .od-qr-share--help,
    .od-qr-share--failed {
      margin: 20px 32px 0;
      text-align: center;
      font-size: 15px;
      line-height: 22px;
      color: var(--od-text-2);
    }

    .od-qr-share--failed {
      color: var(--od-alarm);
    }

    .od-qr-share--actions {
      margin: 32px 0 calc(24px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      justify-content: center;
    }

    :global(.od-qr-share--done) {
      height: 48px;
      padding: 0 32px;
      border-radius: 24px;
      background: var(--od-action);
      color: var(--od-on-action);
      font-size: 16px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
    }
  }
</style>
