<script>
  // @ts-check
  // Frame of the account screens (spec, section 4, "Sign in and new
  // account"; docs/mockups/compte-*.dc.html, android-compte-import.dc.html).
  // Android: an X at the left of the top bar and the bar title, the step in
  // the body, the screen title and its text, the content, then the main
  // button at the bottom right (a text button may sit at the bottom left).
  // iOS: "Annuler" at the left of the bar, the step at the right, a large
  // title, then a full-width main button at the bottom. While a request runs
  // (busy), the button is disabled with a spinner and its busy label, and on
  // Android a linear progress indicator runs under the top bar.
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   title: string,
   *   step?: string,
   *   heading: string,
   *   intro: string,
   *   action?: string,
   *   busyLabel?: string,
   *   busy?: boolean,
   *   actionDisabled?: boolean,
   *   onaction?: () => void,
   *   secondary?: { label: string, onclick: () => void, disabled?: boolean },
   *   secondaryEnd?: boolean,
   *   previous?: boolean,
   *   closable?: boolean,
   *   children: import('svelte').Snippet,
   *   class?: string,
   * }}
   * No action: no main button. secondaryEnd: the text button sits next to
   * the main button (Android) instead of at the left. closable false: no
   * close button (an import that runs). previous: the text button is
   * "Précédent" (iOS: a tonal button beside the main one).
   */
  let {
    title,
    step = '',
    heading,
    intro,
    action = '',
    busyLabel = '',
    busy = false,
    actionDisabled = false,
    onaction = () => {},
    secondary,
    secondaryEnd = false,
    previous = false,
    closable = true,
    children,
    class: extraClass = '',
  } = $props();

  const ios = f7.theme === 'ios';
</script>

<Page class="od-account-step {extraClass}">
  <Navbar {title}>
    {#snippet left()}
      {#if !closable}
        <span></span>
      {:else if ios}
        <Link back>{t('accountStep.cancel')}</Link>
      {:else}
        <Link back iconOnly>
          <Icon name="close" />
          <span class="od-sr-only">{t('accountStep.close')}</span>
        </Link>
      {/if}
    {/snippet}
    {#snippet right()}
      {#if step && ios}<span class="od-account-step--bar-step">{step}</span>{/if}
    {/snippet}
  </Navbar>

  {#if busy && !ios}
    <div class="od-account-step--linear" role="progressbar" aria-label={busyLabel || action}><span></span></div>
  {/if}

  <form
    class="od-account-step--body"
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      if (!actionDisabled && !busy) onaction();
    }}
  >
    <div class="od-account-step--heading">
      {#if step && !ios}<p class="od-account-step--step">{step}</p>{/if}
      <h1>{heading}</h1>
      <p class="od-account-step--intro">{intro}</p>
    </div>

    {@render children()}

    <div class="od-account-step--actions" class:od-account-step--end={secondaryEnd} class:od-account-step--previous={previous}>
      {#if secondary}
        <button
          type="button"
          class="od-text-button od-account-step--secondary"
          disabled={secondary.disabled ?? busy}
          onclick={secondary.onclick}>{secondary.label}</button
        >
      {/if}
      {#if action}
        <button type="submit" class="od-account-step--filled" disabled={actionDisabled || busy} aria-busy={busy}>
          {#if busy}<span class="od-account-step--spinner" aria-hidden="true"></span>{busyLabel || action}{:else}{action}{/if}
        </button>
      {/if}
    </div>
  </form>
</Page>

<style>
  @layer od.components {
    .od-account-step--body {
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .od-account-step--heading {
      padding: 8px 24px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;

      p {
        margin: 0;
        color: var(--od-text-2);
      }

      .od-account-step--step {
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

      .od-account-step--intro {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
      }

      :global(.ios) & {
        padding: 20px 32px 0;
        gap: 6px;

        h1 {
          font-size: 28px;
          line-height: 34px;
          font-weight: 700;
        }

        .od-account-step--intro {
          font-size: 15px;
          line-height: 21px;
          letter-spacing: 0;
        }
      }
    }

    .od-account-step--bar-step {
      padding-right: 8px;
      font-size: 15px;
      color: var(--od-text-2);
      white-space: nowrap;
    }

    /* MD3 linear progress indicator, indeterminate, under the top bar. */
    .od-account-step--linear {
      position: absolute;
      z-index: 600;
      left: 0;
      right: 0;
      top: calc(var(--f7-safe-area-top) + var(--f7-navbar-height));
      height: 4px;
      overflow: hidden;
      background: var(--od-separator);

      span {
        position: absolute;
        top: 0;
        width: 40%;
        height: 4px;
        border-radius: 2px;
        background: var(--od-primary-action);
        animation: od-linear 1.4s linear infinite;
      }
    }

    @keyframes od-linear {
      from {
        left: -40%;
      }

      to {
        left: 100%;
      }
    }

    /* The action stays at the bottom of the screen, above the content when it is long. */
    .od-account-step--actions {
      margin-top: auto;
      padding: 24px 24px calc(var(--f7-safe-area-bottom) + 32px);
      display: flex;
      align-items: center;
      justify-content: flex-end;

      .od-account-step--secondary {
        margin: 0 auto 0 -12px;
      }

      &.od-account-step--end {
        gap: 8px;

        .od-account-step--secondary {
          margin: 0;
        }
      }

      :global(.ios) & {
        padding: 24px 16px calc(var(--f7-safe-area-bottom) + 40px);
        flex-direction: column;
        align-items: stretch;
        gap: 8px;

        .od-account-step--secondary {
          margin: 0;
          justify-content: center;
        }

        /* iOS: the main button first, the text button under it. */
        &.od-account-step--end .od-account-step--secondary {
          order: 1;
        }

        /* iOS: "Précédent", a tonal button beside the main one. */
        &.od-account-step--previous {
          flex-direction: row;
          gap: 12px;

          .od-account-step--secondary {
            flex: none;
            width: 128px;
            height: 52px;
            border-radius: 14px;
            background: var(--od-tint);
            color: var(--od-on-tint);
            font-weight: 600;
          }

          .od-account-step--filled {
            flex: 1;
            width: auto;
          }
        }
      }
    }

    .od-account-step--filled {
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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;

      /* MD3 disabled: on-surface at 12 % behind, 38 % (here 60 % with the spinner) in front. */
      &:disabled {
        background: color-mix(in srgb, var(--od-text) 12%, transparent);
        color: color-mix(in srgb, var(--od-text) 60%, transparent);
        cursor: default;
      }

      :global(.ios) & {
        width: 100%;
        height: 52px;
        border-radius: 14px;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0;
        gap: 10px;

        &:disabled {
          background: var(--od-primary-action);
          color: var(--od-on-primary-action);
          opacity: 0.5;
        }
      }
    }

    .od-account-step--spinner {
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      box-sizing: border-box;
      animation: od-spin 0.9s linear infinite;

      :global(.ios) & {
        width: 18px;
        height: 18px;
      }
    }

    @keyframes od-spin {
      to {
        transform: rotate(360deg);
      }
    }
  }
</style>
