<script>
  // @ts-check
  // "Ordinateurs du carnet" (reglages-ordinateurs-android.dc.html; spec,
  // "Settings, logbook dive computers"): the computers the dives come from.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import { computerName, duplicatesOf, mergeTargets } from '../lib/dive-computers.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {import('opendives-core').LogbookComputer[]} */
  let computers = $state([]);

  // Again after each change of the logbook, undo included.
  $effect(() => {
    logbook.dives;
    OpenDivesCore.diveComputers().then(
      (list) => (computers = list),
      (e) => console.error('Logbook computers', e),
    );
  });

  /** @param {import('opendives-core').LogbookComputer} c */
  function details(c) {
    return [
      c.nickname ? c.model : '',
      c.serial ? t('settings.logbookComputers.serialShort', { serial: c.serial }) : t('settings.logbookComputers.noSerial'),
      t('settings.logbookComputers.dives', { n: c.dives }),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** @param {import('opendives-core').LogbookComputer} c */
  const link = (c) => `/settings/computers/edit?model=${encodeURIComponent(c.model)}&serial=${encodeURIComponent(c.serial)}`;

  const anyDuplicate = $derived(computers.some((c) => mergeTargets(c, computers).length > 0));
</script>

<Page class="od-logbook-computers">
  <Navbar title={t('settings.logbookComputers.title')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('detail.back')}</span></Link>
    {/snippet}
  </Navbar>

  <p class="od-logbook-computers--intro">{t('settings.logbookComputers.intro')}</p>
  {#if computers.length}
    <div class="od-logbook-computers--group">
      {#each computers as c (`${c.model}\n${c.serial}`)}
        <a class="od-logbook-computers--row" href={link(c)}>
          <span class="od-logbook-computers--texts">
            <span class="od-logbook-computers--name">
              <span>{computerName(c)}</span>
              {#if mergeTargets(c, computers).length}
                <span class="od-logbook-computers--tag">{t('settings.logbookComputers.duplicate')}</span>
              {:else if duplicatesOf(c, computers).length}
                <span class="od-logbook-computers--tag">{t('settings.logbookComputers.hasDuplicate')}</span>
              {/if}
            </span>
            <span class="od-logbook-computers--details od-value">{details(c)}</span>
          </span>
          <span class="od-logbook-computers--chevron"><Icon name="chevron" size={20} /></span>
        </a>
      {/each}
    </div>
    {#if anyDuplicate}<p class="od-logbook-computers--note">{t('settings.logbookComputers.duplicateNote')}</p>{/if}
  {:else}
    <p class="od-logbook-computers--note">{t('settings.logbookComputers.empty')}</p>
  {/if}
</Page>

<style>
  @layer od.components {
    .od-logbook-computers--intro {
      margin: 8px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-logbook-computers--group {
      margin: 16px 16px 0;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-logbook-computers--row {
      min-height: 64px;
      padding: 8px 24px 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--od-text);
    }

    .od-logbook-computers--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-logbook-computers--name {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 16px;
      color: var(--od-text);
    }

    .od-logbook-computers--tag {
      height: 20px;
      padding: 0 8px;
      box-sizing: border-box;
      border: 1px solid var(--od-chip-outline);
      border-radius: 6px;
      font-size: 12px;
      line-height: 18px;
      font-weight: 500;
      color: var(--od-text-2);
      white-space: nowrap;
    }

    .od-logbook-computers--details {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-logbook-computers--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-logbook-computers--note {
      margin: 10px 20px 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
