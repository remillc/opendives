<script>
  // @ts-check
  // Editorial layout of the account flow (docs/system-design.md, section 8,
  // "Editorial pages"; docs/mockups/compte-*-android.dc.html,
  // git-config-*-android.dc.html, android-tablette-compte-*.dc.html,
  // android-tablette-depot-git-*.dc.html).
  // Android: a bar with ✕ (or ←) only; an eyebrow naming the flow and the
  // step, a large title ending with a full stop, the introduction; the
  // content in a white card; the decorative profile; the main action as a
  // full-width pill, a text button beside it for a secondary action. Phone:
  // the profile and the actions at the bottom of the screen. Tablet: the
  // actions end the card, the profile lies at the bottom of the area behind
  // the content; in landscape the heading is on the left and the card in a
  // column on the right, in portrait both in one centred column.
  // iOS (until its own editorial look): "Annuler" and the bar title, the step
  // at the right of the bar, a large title, the content, a full-width button.
  // While a request runs (busy), the button is disabled with a spinner and its
  // busy label, and on Android a linear progress indicator runs under the bar.
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import DecorativeProfile from './DecorativeProfile.svelte';
  import { layout } from '../lib/layout.svelte.js';
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
   *   back?: boolean,
   *   children: import('svelte').Snippet,
   *   class?: string,
   * }}
   * title: the bar title on iOS, the eyebrow on Android (with the step). No
   * action: no main button. secondaryEnd: the text button sits after the
   * main button (iOS: under it). closable false: no close button (an import
   * that runs). back: ← instead of ✕ (Android). previous: the text button is
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
    back = false,
    children,
    class: extraClass = '',
  } = $props();

  const ios = f7.theme === 'ios';

  /** "Nouveau compte · étape 2 sur 2": the flow, then the step. */
  const eyebrow = $derived(step ? `${title} · ${step.charAt(0).toLocaleLowerCase()}${step.slice(1)}` : title);
  /** The title ends with a full stop, unless it is a question. */
  const shownHeading = $derived(ios || /[.?!…]$/.test(heading) ? heading : `${heading}.`);
  /** Tablet (Android): the actions are the last element of the card. */
  const actionsInCard = $derived(!ios && !layout.phone);
</script>

{#snippet actions()}
  <div class="od-editorial-page--actions" class:od-editorial-page--end={secondaryEnd} class:od-editorial-page--previous={previous}>
    {#if secondary}
      <button
        type="button"
        class="od-text-button od-editorial-page--secondary"
        disabled={secondary.disabled ?? busy}
        onclick={secondary.onclick}>{secondary.label}</button
      >
    {/if}
    {#if action}
      <button type="submit" class="od-editorial-page--filled" disabled={actionDisabled || busy} aria-busy={busy}>
        {#if busy}<span class="od-editorial-page--spinner" aria-hidden="true"></span>{busyLabel || action}{:else}{action}{/if}
      </button>
    {/if}
  </div>
{/snippet}

<Page class="od-editorial-page {extraClass}">
  <Navbar title={ios ? title : ''} class="od-editorial-page--bar">
    {#snippet left()}
      {#if !closable}
        <span></span>
      {:else if ios}
        <Link back>{t('accountStep.cancel')}</Link>
      {:else}
        <Link back iconOnly>
          <Icon name={back ? 'arrowBack' : 'close'} />
          <span class="od-sr-only">{back ? t('accountStep.back') : t('accountStep.close')}</span>
        </Link>
      {/if}
    {/snippet}
    {#snippet right()}
      {#if step && ios}<span class="od-editorial-page--bar-step">{step}</span>{/if}
    {/snippet}
  </Navbar>

  {#if busy && !ios}
    <div class="od-editorial-page--linear" role="progressbar" aria-label={busyLabel || action}><span></span></div>
  {/if}

  <form
    class="od-editorial-page--body"
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      if (!actionDisabled && !busy) onaction();
    }}
  >
    <div class="od-editorial-page--heading">
      {#if !ios}<p class="od-editorial-page--eyebrow">{eyebrow}</p>{/if}
      <h1 class="od-editorial-page--title">{shownHeading}</h1>
      <p class="od-editorial-page--intro">{intro}</p>
    </div>

    <div class="od-editorial-page--card">
      {@render children()}
      {#if actionsInCard && (action || secondary)}{@render actions()}{/if}
    </div>

    {#if !ios}<DecorativeProfile class="od-editorial-page--profile" />{/if}

    {#if !actionsInCard && (action || secondary)}{@render actions()}{/if}
  </form>
</Page>

<style>
  /* Framework7 variables, outside the layers so that they win over Framework7's own. */
  :global(.od-editorial-page) {
    --f7-page-bg-color: var(--od-background);
  }

  /* Android: the bar carries only ✕ or ←, on the page's own background. */
  :global(.md .od-editorial-page--bar) {
    --f7-navbar-bg-color: transparent;
  }

  /* Tablet: ✕ lines up with the heading (its 48 dp target 12 dp before it). */
  @media (min-width: 768px) {
    :global(.md .od-editorial-page--bar) {
      --f7-navbar-inner-padding-left: max(0px, calc((100% - 520px) / 2 - 12px));
    }
  }

  @media (min-width: 768px) and (orientation: landscape) {
    :global(.md .od-editorial-page--bar) {
      --f7-navbar-inner-padding-left: 36px;
    }
  }

  @layer od.components {
    :global(.md .od-editorial-page--bar .navbar-bg) {
      background: transparent;
    }

    :global(.md .od-editorial-page--bar .navbar-bg::after) {
      display: none;
    }

    .od-editorial-page--body {
      box-sizing: border-box;
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .od-editorial-page--heading {
      padding: 8px 24px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;

      p {
        margin: 0;
        color: var(--od-text-2);
      }
    }

    .od-editorial-page--eyebrow {
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
    }

    .od-editorial-page--title {
      margin: 0;
      font-size: 34px;
      line-height: 40px;
      font-weight: 400;
      letter-spacing: -0.4px;
    }

    .od-editorial-page--intro {
      font-size: 16px;
      line-height: 24px;
    }

    /* The content in one white card. */
    .od-editorial-page--card {
      --od-field-margin: 0;
      margin: 24px 16px 0;
      padding: 20px 16px;
      border-radius: 28px;
      background: var(--od-surface);

      /* The first field starts at the top of the card. */
      & > :global(:first-child),
      & > :global(:first-child > .od-text-field--field:first-child),
      & > :global(:first-child > .od-select-field--field:first-child) {
        margin-top: 0;
      }
    }

    /* Phone: the profile and the actions at the bottom of the screen. */
    :global(.od-editorial-page--profile) {
      flex: none;
      height: 130px;
      margin-top: auto;
      padding-top: 24px;
      box-sizing: content-box;
    }

    .od-editorial-page--actions {
      padding: 16px 24px calc(var(--f7-safe-area-bottom) + 28px);
      display: flex;
      align-items: center;
      gap: 8px;

      &.od-editorial-page--end {
        justify-content: flex-end;
      }
    }

    .od-editorial-page--filled {
      flex: 1;
      min-width: 0;
      height: 56px;
      padding: 0 24px;
      border: none;
      border-radius: 28px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 16px;
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
    }

    .od-editorial-page--secondary {
      flex: none;
    }

    /* MD3 linear progress indicator, indeterminate, under the top bar. */
    .od-editorial-page--linear {
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

    .od-editorial-page--spinner {
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      box-sizing: border-box;
      animation: od-spin 0.9s linear infinite;
    }

    @keyframes od-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /*
     * Tablet (Android): the profile lies at the bottom of the area, behind the
     * content; the actions end the card. Portrait: one centred column of
     * 520 dp, the card under the heading.
     */
    @media (min-width: 768px) {
      :global(.md) .od-editorial-page--body {
        position: relative;
        padding-bottom: 48px;
      }

      :global(.md .od-editorial-page--profile) {
        position: absolute;
        z-index: 0;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 0;
      }

      :global(.md) .od-editorial-page--heading,
      :global(.md) .od-editorial-page--card {
        position: relative;
        z-index: 1;
        box-sizing: border-box;
        width: 100%;
        max-width: 520px;
        margin-left: auto;
        margin-right: auto;
      }

      :global(.md) .od-editorial-page--heading {
        padding: 24px 0 0;
      }

      :global(.md) .od-editorial-page--title {
        font-size: 40px;
        line-height: 48px;
        letter-spacing: -0.5px;
      }

      :global(.md) .od-editorial-page--card {
        padding: 28px 24px 24px;
      }

      :global(.md) .od-editorial-page--actions {
        margin-top: 24px;
        padding: 0;
      }
    }

    /* Landscape: the heading on the left, the card in a 480 dp column on the right, centred vertically. */
    @media (min-width: 768px) and (orientation: landscape) {
      :global(.md) .od-editorial-page--body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 480px;
        grid-template-rows: auto 1fr;
        column-gap: 48px;
        padding: 0 48px 48px;
      }

      :global(.md) .od-editorial-page--heading {
        grid-column: 1;
        grid-row: 1;
        max-width: 560px;
        margin: 0;
      }

      :global(.md) .od-editorial-page--card {
        grid-column: 2;
        grid-row: 1 / span 2;
        align-self: center;
        max-width: none;
        margin: 0;
      }
    }

    /* iOS, until its own editorial look (task 2026-11-10-22). */
    :global(.ios) .od-editorial-page--heading {
      padding: 20px 32px 0;
      gap: 6px;
    }

    :global(.ios) .od-editorial-page--title {
      font-size: 28px;
      line-height: 34px;
      font-weight: 700;
      letter-spacing: 0;
    }

    :global(.ios) .od-editorial-page--intro {
      font-size: 15px;
      line-height: 21px;
    }

    :global(.ios) .od-editorial-page--card {
      --od-field-margin: 16px;
      margin: 0;
      padding: 0;
      border-radius: 0;
      background: none;
    }

    :global(.ios) .od-editorial-page--actions {
      margin-top: auto;
      padding: 24px 16px calc(var(--f7-safe-area-bottom) + 40px);
      flex-direction: column;
      align-items: stretch;

      .od-editorial-page--secondary {
        margin: 0;
        justify-content: center;
      }

      /* The main button first, the text button under it. */
      &.od-editorial-page--end .od-editorial-page--secondary {
        order: 1;
      }

      /* "Précédent", a tonal button beside the main one. */
      &.od-editorial-page--previous {
        flex-direction: row;
        gap: 12px;

        .od-editorial-page--secondary {
          width: 128px;
          height: 52px;
          border-radius: 14px;
          background: var(--od-tint);
          color: var(--od-on-tint);
          font-weight: 600;
        }

        .od-editorial-page--filled {
          flex: 1;
          width: auto;
        }
      }
    }

    :global(.ios) .od-editorial-page--filled {
      flex: none;
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

    :global(.ios) .od-editorial-page--spinner {
      width: 18px;
      height: 18px;
    }

    .od-editorial-page--bar-step {
      padding-right: 8px;
      font-size: 15px;
      color: var(--od-text-2);
      white-space: nowrap;
    }
  }
</style>
