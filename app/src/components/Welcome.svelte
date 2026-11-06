<script>
  // @ts-check
  // First launch (docs/mockups/android-accueil.dc.html, ios-accueil.dc.html):
  // three choices, each with its consequence. Shown after signing out; nothing
  // is loaded until a choice is made. Signing in and creating an account are
  // not built yet: they say so.
  import { Popup, f7 } from 'framework7-svelte';
  import { logbook, startWithoutAccount } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  function notAvailable(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    f7.toast.create({ text: t('account.notAvailable'), closeTimeout: 2500, position: 'center' }).open();
  }

  function withoutAccount(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    startWithoutAccount();
  }
</script>

<Popup class="od-welcome" opened={logbook.welcome} swipeToClose={false} closeByBackdropClick={false}>
  <div class="page">
    <div class="page-content">
      <div class="welcome">
        <h1>{t('welcome.title')}</h1>
        <p class="intro">{t('welcome.intro')}</p>
        <div class="choices">
          <a href="#existing" class="choice primary external" role="button" onclick={notAvailable}>
            <span class="label">{t('welcome.existing')}</span>
            <span class="consequence">{t('welcome.existingText')}</span>
          </a>
          <a href="#create" class="choice external" role="button" onclick={notAvailable}>
            <span class="label">{t('welcome.create')}</span>
            <span class="consequence">{t('welcome.createText')}</span>
          </a>
          <a href="#no-account" class="choice external" role="button" onclick={withoutAccount}>
            <span class="label">{t('welcome.noAccount')}</span>
            <span class="consequence">{t('welcome.noAccountText')}</span>
          </a>
        </div>
      </div>
    </div>
  </div>
</Popup>

<style>
  @layer od.components {
    .welcome {
      padding: calc(var(--f7-safe-area-top) + 48px) 16px calc(var(--f7-safe-area-bottom) + 24px);
    }

    h1 {
      margin: 0 4px 8px;
      font-size: 34px;
      line-height: 41px;
      font-weight: 800;
    }

    .intro {
      margin: 0 4px 24px;
      font-size: 17px;
      line-height: 24px;
      color: var(--od-text-2);
    }

    .choices {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .choice {
      padding: 16px;
      border-radius: 16px;
      border: 1px solid var(--od-separator);
      background: var(--od-surface);
      color: var(--od-text);
      text-decoration: none;
      display: flex;
      flex-direction: column;
      gap: 4px;

      :global(.ios) & {
        border-radius: 10px;
      }

      &.primary {
        border-color: var(--od-primary-action);
        background: var(--od-primary-action);
        color: var(--od-on-primary-action);

        .consequence {
          color: inherit;
          opacity: 0.85;
        }
      }
    }

    .label {
      font-size: 17px;
      font-weight: 700;
    }

    .consequence {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
