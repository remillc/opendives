<script>
  // @ts-check
  // /settings/maps/: "Cartes hors ligne" (spec, section 4, "Offline maps";
  // docs/mockups/android-cartes-hors-ligne.dc.html and its variants, iPhone
  // ios-cartes-hors-ligne.dc.html, tablets android-tablette-cartes.dc.html and
  // tablette-cartes.dc.html). The summary, the downloads in progress, the
  // regions, the two settings. Android: a ⋮ menu per region and an extended
  // button; iPhone: an "Actualiser" button per region, a swipe to delete and a
  // "+" in the bar; tablet: the list and the add pane side by side.
  import { Page, Navbar, Link, List, Popover, f7 } from 'framework7-svelte';
  import { tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import MapsRow from '../components/MapsRow.svelte';
  import { t } from '../lib/i18n.js';
  import { ios, layout } from '../lib/layout.svelte.js';
  import { formatMapSize, formatMapDate } from '../lib/maps-format.js';
  import {
    offlineMaps,
    visibleRegions,
    readyList,
    downloadsList,
    updatesCount,
    regionName,
    activity,
    tilesPercent,
    floor,
    refreshSpace,
    setCellular,
    askCellular,
    askDelete,
    retryRegion,
    removeDownload,
    updateRegion,
    updateAll,
    viewRegion,
    go,
  } from '../lib/offline-maps.svelte.js';

  const downloads = $derived(downloadsList());
  const ready = $derived(readyList());
  const empty = $derived(!downloads.length && !ready.length);
  const readyBytes = $derived(ready.reduce((sum, r) => sum + r.sizeBytes, 0));
  const usedPercent = $derived(Math.min(100, Math.round((readyBytes / offlineMaps.capBytes) * 100)));
  const updates = $derived(updatesCount());
  const split = $derived(!layout.phone && layout.split);

  /** The region whose ⋮ menu is open. */
  let menuId = $state('');
  const menuRegion = $derived(visibleRegions().find((r) => r.id === menuId));

  /** @param {MouseEvent} e @param {string} id */
  async function openMenu(e, id) {
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    menuId = id;
    await tick();
    f7.popover.open('.od-maps-menu', target);
  }

  /** @param {import('../lib/offline-maps.svelte.js').Region} r */
  function failureReason(r) {
    return t(`maps.failure.${r.error || 'server'}`);
  }

  /** A download interrupted by a lost network keeps what it received. @param {import('../lib/offline-maps.svelte.js').Region} r */
  const interrupted = (r) => !offlineMaps.online && r.bytesReceived > 0 && ['queued', 'downloading', 'paused', 'waiting-wifi'].includes(r.status);

  /** @param {import('../lib/offline-maps.svelte.js').Region} r @returns {'pause'|'download'} */
  const icon = (r) => (['waiting-wifi', 'paused'].includes(r.status) ? 'pause' : 'download');
</script>

{#snippet refreshIcon()}
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6 M20 4v5h-5" /></svg>
{/snippet}

{#snippet summary()}
  <div class="summary">
    <span class="line">
      <span class="count">{t('maps.summary.regions', { n: ready.length })}</span>
      <span class="usage">{t('maps.summary.usage', { used: formatMapSize(readyBytes), cap: formatMapSize(offlineMaps.capBytes) })}</span>
    </span>
    <span
      class="bar"
      role="progressbar"
      aria-label={t('maps.summary.usageLabel', { used: formatMapSize(readyBytes), cap: formatMapSize(offlineMaps.capBytes) })}
      aria-valuenow={usedPercent}
      aria-valuemin="0"
      aria-valuemax="100"><span style:width="{usedPercent}%"></span></span
    >
    {#if offlineMaps.totalBytes}<span class="free">{t(ios ? 'maps.summary.freeShort' : 'maps.summary.free', { free: formatMapSize(offlineMaps.freeBytes) })}</span>{/if}
  </div>
{/snippet}

{#snippet downloadRow(/** @type {import('../lib/offline-maps.svelte.js').Region} */ r)}
  {@const name = regionName(r)}
  <MapsRow icon={icon(r)}>
    {#snippet body()}
      <span>{name}</span>
      {#if r.status === 'failed'}
        <span class="status error">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 7.5v5.5M12 16.5h.01" /></svg>{t('maps.failure.title')}
        </span>
        <span class="supporting">{failureReason(r)}</span>
        <span class="actions">
          {#if r.error !== 'limit'}<button type="button" onclick={() => retryRegion(r.id)}>{t('maps.failure.retry')}</button>{/if}
          <button type="button" onclick={() => removeDownload(r.id)}>{t('maps.failure.remove')}</button>
        </span>
      {:else if interrupted(r)}
        <span class="supporting">{t('maps.download.interrupted', { done: r.tilesDone, total: r.tilesTotal })}</span>
        <span class="note">{t('maps.download.resumesOnline')}</span>
      {:else if r.pausedReason === 'space'}
        <span class="supporting">{t('maps.download.pausedAt', { done: r.tilesDone, total: r.tilesTotal })}</span>
        <span class="status muted">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15h18 M7 18h.01" /></svg>{t('maps.download.noSpace')}
        </span>
        <span class="note">{t('maps.download.resumesWhen', { floor: formatMapSize(floor()) })}</span>
        <span class="actions"><button type="button" onclick={() => (offlineMaps.dialog = { kind: 'manage' })}>{t('maps.download.manage')}</button></span>
      {:else if r.status === 'waiting-wifi'}
        <span class="supporting">{t('maps.download.waitingWifi', { total: r.tilesTotal })}</span>
        <span class="actions"><button type="button" onclick={() => askCellular(r.id)}>{t('maps.download.now')}</button></span>
      {:else if r.status === 'paused'}
        <span class="supporting">{t('maps.download.pausedAt', { done: r.tilesDone, total: r.tilesTotal })}</span>
      {:else if r.status === 'queued'}
        <span class="supporting">{t('maps.download.queued', { total: r.tilesTotal })}</span>
      {:else}
        <span class="supporting">{t('maps.download.progress', { done: r.tilesDone, total: r.tilesTotal, percent: tilesPercent(r) })}</span>
        <span
          class="progress"
          role="progressbar"
          aria-label={t('maps.download.progressLabel', { name })}
          aria-valuenow={tilesPercent(r)}
          aria-valuemin="0"
          aria-valuemax="100"><span style:width="{tilesPercent(r)}%"></span></span
        >
      {/if}
    {/snippet}
    {#snippet trailing()}
      {#if r.status !== 'failed'}
        <button type="button" class="maps-icon-button" aria-label={t('maps.download.stop')} onclick={() => removeDownload(r.id)}><Icon name="close" /></button>
      {/if}
    {/snippet}
  </MapsRow>
{/snippet}

{#snippet regionRow(/** @type {import('../lib/offline-maps.svelte.js').Region} */ r)}
  {@const name = regionName(r)}
  {@const act = activity(r)}
  <MapsRow icon="crop">
    {#snippet body()}
      <span>{name}</span>
      {#if r.status === 'updating'}
        {#if act === 'waiting-wifi'}
          <span class="supporting">{t('maps.download.updatingWifi')}</span>
          <span class="actions"><button type="button" onclick={() => askCellular(r.id)}>{t('maps.download.now')}</button></span>
        {:else}
          <span class="supporting">{t('maps.download.updating', { done: r.tilesDone, total: r.tilesTotal })}</span>
          <span
            class="progress"
            role="progressbar"
            aria-label={t('maps.download.progressLabel', { name })}
            aria-valuenow={tilesPercent(r)}
            aria-valuemin="0"
            aria-valuemax="100"><span style:width="{tilesPercent(r)}%"></span></span
          >
        {/if}
        <span class="note">{t('maps.download.oldStays')}</span>
      {:else}
        <span class="supporting">
          {t(r.maxZoom === 12 ? 'maps.region.lessDetail' : 'maps.region.fullDetail', { size: formatMapSize(r.sizeBytes), date: formatMapDate(r.downloadedAt) })}
        </span>
        {#if r.update}
          <span class="status">{@render refreshIcon()}{t('maps.region.updateAvailable')}</span>
          {#if ios}
            <span class="actions"><button type="button" onclick={() => updateRegion(r.id)}>{t('maps.region.update')}</button></span>
          {/if}
        {/if}
      {/if}
    {/snippet}
    {#snippet trailing()}
      {#if !ios}
        <button type="button" class="maps-icon-button" aria-haspopup="menu" aria-label={t('maps.region.options', { name })} onclick={(e) => openMenu(e, r.id)}>
          <Icon name="more" />
        </button>
      {/if}
    {/snippet}
  </MapsRow>
{/snippet}

{#snippet settingsGroup()}
  <h2 class="maps-title">{t('maps.sections.settings')}</h2>
  <div class="maps-surface" role="list">
    <div role="listitem">
      <label class="set-row">
        <span class="texts">
          <span class="label">{t(ios ? 'maps.cellular.labelShort' : 'maps.cellular.label')}</span>
          <span class="supporting">{t('maps.cellular.text')}</span>
        </span>
        <span class="toggle">
          <input type="checkbox" checked={offlineMaps.cellular} onchange={(e) => setCellular(e.currentTarget.checked)} />
          <span class="toggle-icon"></span>
        </span>
      </label>
    </div>
    <div role="listitem">
      <button type="button" class="set-row" aria-haspopup="dialog" onclick={() => (offlineMaps.dialog = { kind: 'limit' })}>
        <span class="texts">
          <span class="label">{t(ios ? 'maps.limit.labelShort' : 'maps.limit.label')}</span>
          {#if !ios}<span class="supporting">{formatMapSize(offlineMaps.capBytes)}</span>{/if}
        </span>
        {#if ios}<span class="value">{formatMapSize(offlineMaps.capBytes)}</span>{/if}
        <Icon name="chevron" size={20} />
      </button>
    </div>
  </div>
{/snippet}

{#snippet listPane()}
  {#if !offlineMaps.online}
    <p class="no-network" role="status"><Icon name="offline" size={20} /><span>{t('maps.noNetwork')}</span></p>
  {/if}

  {#if empty}
    <div class="empty">
      <span class="illustration" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14" /></svg>
      </span>
      <h2>{t('maps.empty.title')}</h2>
      <p>{t('maps.empty.text')}</p>
      {#if !split}<button type="button" class="filled" onclick={() => go('/settings/maps/area')}>{t('maps.add')}</button>{/if}
    </div>
  {:else}
    {@render summary()}
  {/if}

  {#if downloads.length}
    <h2 class="maps-title">{t('maps.sections.downloads')}</h2>
    <div class="maps-surface" role="list">
      {#each downloads as r (r.id)}<div role="listitem">{@render downloadRow(r)}</div>{/each}
    </div>
    {#if downloads.some((r) => r.status === 'downloading' || r.status === 'queued')}<p class="maps-note">{t('maps.download.background')}</p>{/if}
  {/if}

  {#if ready.length}
    <div class="section-head">
      <h2 class="maps-title">{t('maps.sections.regions')}</h2>
      {#if updates > 0}<button type="button" class="text-action" onclick={updateAll}>{t('maps.updateAll')}</button>{/if}
    </div>
    <div class="maps-surface" role="list">
      {#each ready as r (r.id)}
        {#if ios}
          <!-- iPhone: a swipe to the left deletes (Framework7 swipeout). -->
          <div role="listitem" class="swipeout no-swipeback">
            <div class="swipeout-content">{@render regionRow(r)}</div>
            <div class="swipeout-actions-right">
              <a href="#delete" class="swipeout-close delete" onclick={(e) => { e.preventDefault(); askDelete(r.id); }}>{t('maps.menu.delete')}</a>
            </div>
          </div>
        {:else}
          <div role="listitem">{@render regionRow(r)}</div>
        {/if}
      {/each}
      {#if ios}
        <div role="listitem">
          <button type="button" class="set-row add-row" onclick={() => go('/settings/maps/area')}>
            <span class="texts"><span class="label">{t('maps.add')}</span></span>
            <Icon name="chevron" size={20} />
          </button>
        </div>
      {/if}
    </div>
    {#if ios}<p class="maps-note">{t('maps.region.swipeHint')}</p>{/if}
  {/if}

  {@render settingsGroup()}
  <div class="bottom"></div>
{/snippet}

<Page class="od-maps-page" onPageBeforeIn={refreshSpace}>
  <Navbar title={t('maps.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      {#if ios && !split}
        <Link iconOnly onClick={() => go('/settings/maps/area')}>
          <Icon name="plus" />
          <span class="od-sr-only">{t('maps.add')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  {#if split}
    <div class="panes">
      <div class="pane list-pane">{@render listPane()}</div>
      <div class="pane add-pane">
        <h2 class="add-title">{t('maps.add')}</h2>
        <p class="maps-note add-text">{t('maps.empty.text')}</p>
        <button type="button" class="filled" onclick={() => go('/settings/maps/area')}>{t('maps.area.choose')}</button>
      </div>
    </div>
  {:else}
    {@render listPane()}
  {/if}

  <!-- The ⋮ menu of a region (android-cartes-menu.dc.html). -->
  <Popover class="od-menu od-maps-menu" backdrop={false}>
    <List noChevron>
      {#if menuRegion?.update && menuRegion.status === 'ready'}
        <MenuItem icon="refresh" text={t('maps.menu.update')} onclick={() => updateRegion(menuRegion.id)} />
      {/if}
      {#if menuRegion}<MenuItem icon="place" text={t('maps.menu.view')} onclick={() => viewRegion(menuRegion.id)} />{/if}
      {#if menuRegion}<MenuItem icon="delete" text={t('maps.menu.delete')} destructive onclick={() => askDelete(menuRegion.id)} />{/if}
    </List>
  </Popover>

  {#snippet fixedContent()}
    {#if !ios && !split && !empty}
      <!-- Extended floating button, written by hand as in the Logbook. -->
      <div class="fab fab-right-bottom fab-extended od-fab-add">
        <a href="/settings/maps/area">
          <i class="icon"><Icon name="plus" /></i>
          <div class="fab-text">{t('maps.add')}</div>
        </a>
      </div>
    {/if}
  {/snippet}
</Page>

<style>
  @layer od.components {
    .no-network {
      margin: 8px 16px 0;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--od-surface-2);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text);

      :global(svg) {
        flex: none;
        margin-top: 1px;
      }
    }

    .summary {
      margin: 8px 16px 0;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-variant-numeric: tabular-nums;

      .line {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .count {
        flex: 1;
        font-size: 16px;
        line-height: 24px;
      }

      .usage {
        font-size: 14px;
        color: var(--od-text-2);
      }

      .bar {
        height: 8px;
        border-radius: 4px;
        background: var(--od-primary-container);
        overflow: hidden;

        > span {
          display: block;
          height: 100%;
          border-radius: 4px;
          background: var(--od-text);
        }
      }

      .free {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }
    }

    .section-head {
      display: flex;
      align-items: center;
      padding-right: 8px;

      .maps-title {
        flex: 1;
      }
    }

    .text-action {
      flex: none;
      width: auto;
      height: 40px;
      margin-top: 12px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.1px;
      cursor: pointer;
    }

    .empty {
      margin: 24px 24px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;

      .illustration {
        width: 96px;
        height: 96px;
        border-radius: 48px;
        background: var(--od-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;

        svg {
          fill: none;
          stroke: var(--od-text);
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      }

      h2 {
        margin: 20px 0 8px;
        font-size: 20px;
        line-height: 28px;
        font-weight: 600;
      }

      p {
        margin: 0 0 20px;
        font-size: 15px;
        line-height: 22px;
        color: var(--od-text-2);
      }
    }

    .filled {
      width: auto;
      height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: 24px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    .set-row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      .texts {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .label {
        font-size: 16px;
        line-height: 24px;
      }

      .supporting {
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }

      .value {
        flex: none;
        font-size: 14px;
        color: var(--od-text-2);
      }

      :global(svg) {
        flex: none;
        color: var(--od-text-2);
      }

      .toggle {
        flex: none;
      }
    }

    /* iPhone: the swipeout action. */
    .swipeout {
      position: relative;
      overflow: hidden;
    }

    .delete {
      background: var(--od-error);
      color: var(--od-on-error);
      font-weight: 600;
    }

    /* Tablet: the list and the add pane side by side (the add pane on a surface container on Android). */
    .panes {
      display: flex;
      align-items: flex-start;
      min-height: 100%;
    }

    .pane {
      min-width: 0;
    }

    .list-pane {
      flex: 1 1 0;
    }

    .add-pane {
      flex: 1 1 0;
      align-self: stretch;
      background: var(--od-surface-2);
      border-radius: 28px 0 0 28px;
      padding-top: 8px;
      --od-field-margin: 12px;
    }

    :global(.ios) .add-pane {
      background: var(--od-background);
      border-radius: 0;
      border-left: 1px solid var(--od-separator);
    }

    .add-pane .filled {
      margin: 16px 20px 0;
    }

    .add-title {
      margin: 0;
      padding: 16px 20px 4px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }

    .bottom {
      height: 96px;
    }
  }
</style>
