<script>
  // @ts-check
  // Settings, "Secours (bailout), recycleur" (spec, Settings table;
  // docs/mockups/reglages-secours-android.dc.html): the cylinder types added
  // as open-circuit cylinders when a dive becomes CCR or pSCR.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import Icon from '../components/Icon.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import { settings, setAppSetting } from '../lib/settings.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { cylinderChoices } from '../lib/cylinder-choices.js';
  import { t } from '../lib/i18n.js';

  /** The row being changed, or -1 to add one. */
  let editing = $state(/** @type {number|null} */ (null));
  let options = $state(/** @type {{ value: string, label: string, example?: string }[]} */ ([]));

  const example = (/** @type {string} */ name) => options.find((o) => o.value === name)?.example ?? '';
  cylinderChoices(logbook.prefs, false)
    .then((list) => (options = list))
    .catch((e) => console.error('Cylinder types', e));

  /** @param {number} index */
  function choose(index) {
    if (options.length) editing = index;
    else showSnackbar(t('settings.error'));
  }

  /** @param {string[]} list */
  const save = (list) => setAppSetting('defaultBailout', list);

  /** @param {string} name */
  function chosen(name) {
    const list = [...settings.defaultBailout];
    if (editing === -1) list.push(name);
    else if (editing !== null) list[editing] = name;
    editing = null;
    save(list);
  }
</script>

<Page>
  <Navbar title={t('settings.defaultCylinder.bailout')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <p class="intro">{t('settings.bailout.intro')}</p>
  {#if settings.defaultBailout.length}
    <div class="surface" role="list">
      {#each settings.defaultBailout as name, i (i)}
        <div class="row" role="listitem">
          <span class="texts">
            <span class="label">{name}</span>
            {#if example(name)}<span class="supporting">{example(name)}</span>{/if}
          </span>
          <button type="button" class="change" onclick={() => choose(i)}>{t('settings.bailout.change')}</button>
          <button type="button" class="remove" aria-label={t('settings.bailout.remove', { name })} onclick={() => save(settings.defaultBailout.filter((_, k) => k !== i))}><Icon name="close" /></button>
        </div>
      {/each}
    </div>
  {/if}
  <button type="button" class="add" onclick={() => choose(-1)}><Icon name="plus" />{t('settings.bailout.add')}</button>
  <p class="note">{t('settings.bailout.note')}</p>
</Page>

{#if editing !== null}
  <ChoiceDialog
    title={t('settings.defaultCylinder.bailout')}
    {options}
    value={editing >= 0 ? settings.defaultBailout[editing] : ''}
    note={t('settings.defaultCylinder.listNote')}
    oncancel={() => (editing = null)}
    onselect={(v) => {
      if (v) chosen(v);
      else editing = null;
    }}
  />
{/if}

<style>
  @layer od.components {
    .intro,
    .note {
      margin: 8px 20px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .surface {
      margin: 8px 16px 0;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .row {
      min-height: 64px;
      padding: 6px 4px 6px 16px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .label {
      font-size: 16px;
      line-height: 22px;
    }

    .supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .change {
      width: auto;
      padding: 0 8px;
      height: 40px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .remove {
      flex: none;
      width: 44px;
      height: 44px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .add {
      width: auto;
      margin: 12px 16px 0;
      height: 40px;
      padding: 0 12px 0 8px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
  }
</style>
