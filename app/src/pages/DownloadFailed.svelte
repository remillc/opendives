<script>
  // @ts-check
  // Download failed (docs/mockups/android-etat-echec.dc.html,
  // ios-etat-echec.dc.html; spec, section 6, "Error"): what happened, what did
  // not change, what to check as a numbered list, then Retry. Never the raw
  // text of a core error. Shown by the download from the dive computer, which
  // is not built yet (Bluetooth): ?computer=<model name>&reason=notFound.
  import { Page, Navbar, Link, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { query: { computer?: string, reason?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  const computer = f7route.query?.computer ?? '';
  const reason = 'notFound';
  const checks = ['on', 'near', 'otherApp'];
</script>

<Page class="od-download-failed">
  <Navbar title={t('downloadFailed.title')}>
    {#snippet left()}
      {#if theme.ios}
        <Link back>{t('downloadFailed.close')}</Link>
      {:else}
        <Link back iconOnly><Icon name="close" /><span class="od-sr-only">{t('downloadFailed.close')}</span></Link>
      {/if}
    {/snippet}
  </Navbar>

  <div class="content">
    <h1>{computer ? t(`downloadFailed.${reason}.title`, { computer }) : t(`downloadFailed.${reason}.titleNoName`)}</h1>
    <p class="text">{t(`downloadFailed.${reason}.text`)} {t('downloadFailed.nothingChanged')}</p>
    <h2>{t('downloadFailed.check')}</h2>
    <ol>
      {#each checks as c, i (c)}
        <li><span class="number" aria-hidden="true">{i + 1}</span><span>{t(`downloadFailed.checks.${c}`)}</span></li>
      {/each}
    </ol>
  </div>

  {#snippet fixedContent()}
    <div class="actions">
      <a href="/settings/" class="od-text-button">{t('downloadFailed.otherComputer')}</a>
      <button type="button" class="retry" onclick={() => f7router.back()}>{t('downloadFailed.retry')}</button>
    </div>
  {/snippet}
</Page>

<style>
  @layer od.components {
    .content {
      margin: 16px 24px 0;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;

      :global(.ios) & {
        font-size: 28px;
        line-height: 34px;
        font-weight: 700;
      }
    }

    .text {
      margin: 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 17px;
      }
    }

    h2 {
      margin: 16px 0 0;
      min-height: 48px;
      display: flex;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;

      :global(.ios) & {
        font-size: 13px;
        font-weight: 400;
        color: var(--od-text-2);
      }
    }

    ol {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      gap: 16px;
      padding: 10px 0;
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .number {
      flex: none;
      width: 24px;
      height: 24px;
      border-radius: 12px;
      background: var(--od-tint);
      color: var(--od-on-tint);
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .actions {
      position: absolute;
      inset-inline: 24px;
      bottom: calc(32px + var(--f7-safe-area-bottom, 0px));
      z-index: 10;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
    }

    /* MD3 filled button; iOS large filled button. */
    .retry {
      height: 40px;
      padding: 0 24px;
      border: none;
      border-radius: 20px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;

      :global(.ios) & {
        height: 50px;
        border-radius: 12px;
        font-size: 17px;
        font-weight: 600;
      }
    }
  }
</style>
