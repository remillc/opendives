<script>
  // @ts-check
  // First launch (docs/mockups/android-accueil.dc.html, ios-accueil.dc.html;
  // spec, section 4): three ways to start, each with its consequence. Android:
  // cards, the first one filled. iOS: an inset grouped list with chevrons.
  import { Page } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { startWithoutAccount } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  // Illustration: the profile of a dive (time in s, depth in m), as in the mock-ups.
  const POINTS = [
    [0, 0], [170, 24], [390, 46.4], [610, 57.3], [830, 59.6], [1050, 55.5], [1160, 52.9], [1380, 32.4],
    [1553, 20.7], [1632, 20.6], [1676, 21.1], [1750, 22.4], [1970, 20.7], [2190, 22.3], [2410, 24], [2630, 22.6],
    [2850, 18.2], [3070, 16.5], [3290, 16.5], [3510, 14.3], [3730, 16.2], [3950, 13.3], [4170, 10], [4390, 10.9],
    [4610, 10.5], [4830, 9.9], [5050, 7.5], [5270, 6.1], [5490, 7.6], [5710, 6.3], [5930, 4.5], [6150, 5], [6240, 0],
  ];
  const WIDTH = 390;
  const HEIGHT = 220;
  const line = 'M' + POINTS.map(([s, d]) => `${((s / 6240) * WIDTH).toFixed(1)} ${(40 + (d / 60.2) * 160).toFixed(1)}`).join(' L');
  // The water column lies between the surface and the profile line.
  const area = `${line} L${WIDTH} 0 L0 0 Z`;

  /** @param {MouseEvent} e @param {string} url */
  function go(e, url) {
    e.preventDefault();
    f7router.navigate(url);
  }

  function withoutAccount(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    startWithoutAccount();
  }
</script>

<Page class="od-welcome-start">
  <svg class="profile" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="od-welcome-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="water-top"></stop>
        <stop offset="1" class="water-bottom"></stop>
      </linearGradient>
    </defs>
    <rect class="ground" x="0" y="0" width={WIDTH} height={HEIGHT}></rect>
    <path class="water" d={area}></path>
    <path class="trace" d={line}></path>
  </svg>

  <div class="heading">
    <h1>{t('welcome.title')}</h1>
    <p>{t('welcome.intro')}</p>
  </div>

  <nav class="choices" aria-label={t('welcome.choicesLabel')}>
    <a href="/welcome/sign-in" class="choice filled" onclick={(e) => go(e, '/welcome/sign-in')}>
      <span class="text">
        <span class="label">{t('welcome.existing')}</span>
        <span class="consequence">{t('welcome.existingText')}</span>
      </span>
      <span class="chevron"><Icon name="expand" size={16} /></span>
    </a>
    <a href="/welcome/create" class="choice" onclick={(e) => go(e, '/welcome/create')}>
      <span class="text">
        <span class="label">{t('welcome.create')}</span>
        <span class="consequence">{t('welcome.createText')}</span>
      </span>
      <span class="chevron"><Icon name="expand" size={16} /></span>
    </a>
    <a href="#no-account" class="choice external" onclick={withoutAccount}>
      <span class="text">
        <span class="label">{t('welcome.noAccount')}</span>
        <span class="consequence">{t('welcome.noAccountText')}</span>
      </span>
      <span class="chevron"><Icon name="expand" size={16} /></span>
    </a>
  </nav>
</Page>

<style>
  @layer od.components {
    :global(.od-welcome-start) {
      --od-welcome-ground: var(--od-surface-2);

      :global(.ios) & {
        --f7-page-bg-color: var(--od-surface);
        --od-welcome-ground: var(--od-background);
      }

      :global(.page-content) {
        padding-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      }
    }

    .profile {
      display: block;
      width: 100%;
      height: calc(var(--f7-safe-area-top) + 196px);
    }

    .ground {
      fill: var(--od-welcome-ground);
    }

    .water-top {
      stop-color: var(--od-water-top);
    }

    .water-bottom {
      stop-color: var(--od-water-bottom);
    }

    .water {
      fill: url(#od-welcome-water);
    }

    .trace {
      fill: none;
      stroke: var(--od-trace);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }

    .heading {
      padding: 20px 24px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;

      h1 {
        margin: 0;
        font-size: 32px;
        line-height: 40px;
        font-weight: 400;
      }

      p {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        letter-spacing: 0.5px;
        color: var(--od-text-2);
      }

      :global(.ios) & {
        padding-top: 24px;

        h1 {
          font-size: 34px;
          line-height: 41px;
          font-weight: 700;
        }

        p {
          font-size: 17px;
          letter-spacing: 0;
        }
      }
    }

    /* Android: three cards, the first filled, the others outlined. */
    .choices {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .choice {
      padding: 16px;
      border-radius: 12px;
      border: 1px solid var(--od-separator);
      color: var(--od-text);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 12px;

      &.filled {
        border-color: transparent;
        background: var(--od-surface-2);

        .consequence {
          color: var(--od-text);
        }
      }
    }

    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .label {
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
      letter-spacing: 0.15px;
    }

    .consequence {
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);
    }

    .chevron {
      display: none;
    }

    /* iOS: an inset grouped list, a chevron on each row. */
    :global(.ios) .choices {
      margin-top: 20px;
      gap: 0;
      border-radius: 12px;
      overflow: hidden;
      background: var(--od-background);

      .choice {
        padding: 12px 16px;
        border: none;
        border-radius: 0;
        background: none;

        & + .choice {
          box-shadow: inset 0 0.5px 0 var(--od-separator);
        }
      }

      .text {
        gap: 3px;
      }

      .label {
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0;
      }

      .consequence {
        font-size: 13px;
        line-height: 18px;
        letter-spacing: 0;
        color: var(--od-text-2);
      }

      .chevron {
        display: flex;
        flex: none;
        color: var(--od-text-2);
        /* "expand" points down: a quarter turn makes the iOS chevron. */
        transform: rotate(-90deg);
      }
    }
  }
</style>
