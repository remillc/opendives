<script>
  // @ts-check
  // Settings (spec, section 3: they open from the Logbook). Not built yet.
  import { Page, Navbar, Link, Block } from 'framework7-svelte';
  import { t } from '../lib/i18n.js';
  import { settings, setExtraConditions } from '../lib/settings.svelte.js';
</script>

<Page>
  <Navbar title={t('settings.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>
  <div class="list list-strong inset list-dividers">
    <ul>
      <li>
        <label class="item-content">
          <div class="item-inner">
            <div class="item-title">
              {t('settings.extraConditions')}
              <div class="item-footer" style:white-space="normal">{t('settings.extraConditionsText')}</div>
            </div>
            <div class="item-after">
              <span class="toggle">
                <input type="checkbox" checked={settings.extraConditions} onchange={(e) => setExtraConditions(e.currentTarget.checked)} />
                <span class="toggle-icon"></span>
              </span>
            </div>
          </div>
        </label>
      </li>
    </ul>
  </div>
  <Block><p>{t('settings.comingSoon')}</p></Block>
</Page>
