<script>
  // @ts-check
  // Frame of the account screens of first launch (sign in, new account and
  // its two steps), after docs/mockups/android-compte-import.dc.html and
  // ios-compte-import.dc.html: a small top bar with Back and the title, the
  // step ("Step 2 of 2": in the body on Android, at the right of the bar on
  // iOS), a heading and its text, the content, then the action at the
  // bottom (Android: a filled button on the right; iOS: full width).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   title: string,
   *   step?: string,
   *   heading: string,
   *   intro: string,
   *   action: string,
   *   actionDisabled?: boolean,
   *   onaction: () => void,
   *   children: import('svelte').Snippet,
   * }}
   */
  let { title, step = '', heading, intro, action, actionDisabled = false, onaction, children } = $props();
</script>

<Page class="od-account-step">
  <Navbar {title}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('accountStep.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      {#if step}<span class="bar-step">{step}</span>{/if}
    {/snippet}
  </Navbar>

  <form
    class="body"
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      if (!actionDisabled) onaction();
    }}
  >
    <div class="heading">
      {#if step}<p class="step">{step}</p>{/if}
      <h1>{heading}</h1>
      <p class="intro">{intro}</p>
    </div>

    {@render children()}

    <div class="actions">
      <button type="submit" class="filled" disabled={actionDisabled}>{action}</button>
    </div>
  </form>
</Page>

<style>
  @layer od.components {
    .body {
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .heading {
      padding: 8px 24px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;

      p {
        margin: 0;
        color: var(--od-text-2);
      }

      .step {
        font-size: 12px;
        line-height: 16px;
        letter-spacing: 0.4px;
      }

      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 32px;
        font-weight: 400;
      }

      .intro {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
      }

      :global(.ios) & {
        padding: 20px 32px 0;
        gap: 6px;

        .step {
          display: none;
        }

        h1 {
          font-size: 28px;
          line-height: 34px;
          font-weight: 700;
        }

        .intro {
          font-size: 15px;
          line-height: 21px;
          letter-spacing: 0;
        }
      }
    }

    .bar-step {
      display: none;

      :global(.ios) & {
        display: inline;
        padding-right: 8px;
        font-size: 15px;
        color: var(--od-text-2);
      }
    }

    /* The action stays at the bottom of the screen, above the content when it is long. */
    .actions {
      margin-top: auto;
      padding: 24px 24px calc(var(--f7-safe-area-bottom) + 32px);
      display: flex;
      justify-content: flex-end;

      :global(.ios) & {
        padding: 24px 16px calc(var(--f7-safe-area-bottom) + 40px);
      }
    }

    .filled {
      width: auto;
      height: 40px;
      padding: 0 24px;
      border: none;
      border-radius: 20px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      white-space: nowrap;
      cursor: pointer;

      &:disabled {
        opacity: 0.38;
        cursor: default;
      }

      :global(.ios) & {
        width: 100%;
        height: 52px;
        border-radius: 14px;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0;
      }
    }
  }
</style>
