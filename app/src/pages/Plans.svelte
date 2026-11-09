<script>
  // @ts-check
  // "Plongées planifiées" (spec, section 4, "Planner, redesigned"; mock-ups
  // android-plans, -menu and -vide): the planned dives of the logbook, which
  // no other screen lists. A row reopens the plan, its ⋮ duplicates, shares or
  // deletes it.
  import { Page, Navbar, Link, List, Popover, f7, theme } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import ShareSheet from '../components/ShareSheet.svelte';
  import { logbook, savePlan, deleteDives } from '../lib/logbook.svelte.js';
  import { requestOfPlan, loadSetup } from '../lib/planner.svelte.js';
  import { formatDepth, formatDuration, formatGasLong, formatLongDate, formatMixName } from '../lib/format.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { sharePlanPdf, sharePlanSummary } from '../lib/share.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('opendives-core').PlannedDive} PlannedDive */

  const uid = $props.id();
  const menuId = `od-plans-menu-${uid}`;
  const prefs = $derived(logbook.prefs);

  let plans = $state(/** @type {PlannedDive[]|null} */ (null));
  let failed = $state(false);
  let current = $state(/** @type {PlannedDive|null} */ (null));
  let sharing = $state(false);

  async function load() {
    try {
      plans = await OpenDivesCore.listPlans();
      failed = false;
    } catch (e) {
      console.error('Planned dives', e);
      failed = true;
    }
  }
  loadSetup().catch((e) => console.error('Planner setup', e));

  /** @param {PlannedDive} plan */
  function title(plan) {
    if (plan.site) return plan.site;
    return requestOfPlan(plan, prefs).sourceDiveId ? t('dive.siteNotSet') : t('plan.noStartDive');
  }

  /** @param {PlannedDive} plan */
  function detail(plan) {
    const gas = plan.gases[0];
    const o2 = gas?.o2Permille ?? 209;
    const he = gas?.hePermille ?? 0;
    return [he === 0 && o2 >= 1000 ? formatGasLong(o2, he) : formatMixName(o2, he), formatLongDate(plan.date)].join(' · ');
  }

  /** @param {MouseEvent} e @param {PlannedDive} plan */
  function openMenu(e, plan) {
    e.preventDefault();
    e.stopPropagation();
    current = plan;
    f7.popover.open(`#${menuId}`, /** @type {HTMLElement} */ (e.currentTarget));
  }

  function closeMenu() {
    f7.popover.close(`#${menuId}`);
  }

  async function duplicate() {
    closeMenu();
    if (!current) return;
    try {
      await savePlan(requestOfPlan(current, prefs));
      await load();
    } catch (e) {
      console.error('Duplicating a plan', e);
      f7.toast.show({ text: t('plan.saveFailed'), closeTimeout: 4000 });
    }
  }

  function remove() {
    closeMenu();
    const plan = current;
    if (!plan) return;
    confirmAction({
      title: t('plans.deleteTitle'),
      text: t('plans.deleteText'),
      action: t('plans.delete'),
      onConfirm: async () => {
        // Off the list at once: saving and syncing take a moment.
        plans = (plans ?? []).filter((p) => p.id !== plan.id);
        try {
          await deleteDives([plan.id]);
          offerUndo(t('plans.deleted'), () => load(), 10000);
        } catch (e) {
          console.error('Deleting a plan', e);
          f7.toast.show({ text: t('plans.deleteFailed'), closeTimeout: 4000 });
          await load();
        }
      },
    });
  }

  /** @param {'pdf'|'summary'} kind */
  async function share(kind) {
    sharing = false;
    const plan = current;
    if (!plan) return;
    try {
      const request = requestOfPlan(plan, prefs);
      const result = await OpenDivesCore.planDive(request);
      if (kind === 'pdf') await sharePlanPdf(result, request, prefs, title(plan));
      else await sharePlanSummary(result, request, prefs, title(plan));
    } catch (e) {
      console.error('Sharing a plan', e);
      f7.toast.show({ text: t('plan.shareFailed'), closeTimeout: 4000 });
    }
  }
</script>

<Page onPageBeforeIn={load}>
  <Navbar title={t('plans.title')}>
    {#snippet left()}
      <Link back iconOnly={!theme.ios}>
        <i class="icon icon-back"></i>
        {#if theme.ios}<span>{t('plan.back')}</span>{:else}<span class="od-sr-only">{t('plan.back')}</span>{/if}
      </Link>
    {/snippet}
  </Navbar>

  {#if failed}
    <p class="intro">{t('plans.failed')}</p>
  {:else if plans && plans.length === 0}
    <div class="empty">
      <Icon name="plan" size={48} />
      <p class="headline">{t('plans.empty')}</p>
      <p class="text">{t('plans.emptyText')}</p>
    </div>
  {:else if plans}
    <p class="intro">{t('plans.intro')}</p>
    <div class="list">
      {#each plans as plan (plan.id)}
        <div class="row">
          <a class="open" href="/plans/{plan.id}">
            <ProfileThumbnail profile={plan.profile} maxDepthMm={plan.maxDepthMm} {prefs} />
            <span class="texts">
              <span class="name">{title(plan)}</span>
              <span class="sub">{detail(plan)}</span>
            </span>
            <span class="figures od-value">
              <span class="depth">{formatDepth(plan.maxDepthMm, prefs)}</span>
              <span class="time">{formatDuration(plan.durationSeconds)}</span>
            </span>
          </a>
          <button type="button" class="more" aria-label={t('plans.more')} onclick={(e) => openMenu(e, plan)}><Icon name="more" weight={4} /></button>
        </div>
      {/each}
    </div>
  {/if}

  <Popover id={menuId} class="od-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon="copy" text={t('plans.duplicate')} onclick={duplicate} />
      <MenuItem
        icon="share"
        text={t('plans.share')}
        onclick={() => {
          closeMenu();
          sharing = true;
        }}
      />
      <MenuItem icon="delete" text={t('plans.delete')} destructive onclick={remove} />
    </List>
  </Popover>

  {#snippet fixedContent()}
    <div class="fab fab-right-bottom fab-extended od-fab-add">
      <a href="/plan/new">
        <i class="icon"><Icon name="plus" /></i>
        <div class="fab-text">{t('plans.new')}</div>
      </a>
    </div>
  {/snippet}
</Page>

{#if sharing}
  <ShareSheet pdfText={t('plan.sharePdfText')} summaryLabel={t('plan.shareSummary')} summaryText={t('plan.shareSummaryText')} onpdf={() => share('pdf')} onsummary={() => share('summary')} onclose={() => (sharing = false)} />
{/if}

<style>
  @layer od.components {
    .intro {
      margin: 8px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .row {
      display: flex;
      align-items: center;
      min-height: 72px;
    }

    .open {
      flex: 1;
      min-width: 0;
      padding: 8px 0 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--od-text);
      text-decoration: none;
    }

    .texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .name {
      font-size: 16px;
      line-height: 24px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .figures {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;

      .depth {
        font-size: 16px;
        font-weight: 600;
      }

      .time {
        font-size: 14px;
        color: var(--od-text-2);
      }
    }

    .more {
      flex: none;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .empty {
      margin-top: 96px;
      padding: 0 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      color: var(--od-text);

      .headline {
        margin: 16px 0 4px;
        font-size: 16px;
        font-weight: 600;
      }

      .text {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }
    }
  }
</style>
