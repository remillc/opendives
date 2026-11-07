<script>
  // @ts-check
  // Tools section (docs/ui-specification.md, section 1, "Tools page and gas
  // tools"; docs/mockups/android-outils.dc.html): only a list of links, in two
  // groups, on white surfaces like Settings. Each tool has its own screen.
  import { Page, Navbar } from 'framework7-svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ title: string, rows: { href: string, icon: 'plan'|'desaturation'|'depthGauge'|'bestMix'|'blender', name: string, text: string }[] }[]} */
  const groups = $derived([
    {
      title: t('tools.groupDive'),
      rows: [
        { href: '/plan/new/', icon: 'plan', name: t('tools.planner'), text: t('tools.plannerText') },
        { href: '/tools/desaturation/', icon: 'desaturation', name: t('tools.desaturation'), text: t('tools.desaturationText') },
      ],
    },
    {
      title: t('tools.groupGas'),
      rows: [
        { href: '/tools/ead-mod/', icon: 'depthGauge', name: t('tools.eadMod'), text: t('tools.eadModText') },
        { href: '/tools/best-mix/', icon: 'bestMix', name: t('tools.bestMixTool'), text: t('tools.bestMixText') },
        { href: '/tools/blender/', icon: 'blender', name: t('tools.blender'), text: t('tools.blenderText') },
      ],
    },
  ]);
</script>

<Page class="od-tools">
  <Navbar title={t('tools.title')}>
    {#snippet left()}<MenuButton />{/snippet}
  </Navbar>

  {#each groups as group (group.title)}
    <h2 class="title">{group.title}</h2>
    <div class="surface" role="list">
      {#each group.rows as row (row.href)}
        <div role="listitem">
          <a class="row" href={row.href}>
            <span class="icon"><Icon name={row.icon} /></span>
            <span class="texts">
              <span class="label">{row.name}</span>
              <span class="supporting">{row.text}</span>
            </span>
            <span class="chevron"><Icon name="chevron" size={24} weight={2} /></span>
          </a>
        </div>
      {/each}
    </div>
  {/each}
  <div class="bottom"></div>
</Page>

<style>
  @layer od.components {
    /* As Settings: titles on the page background, groups as rounded white surfaces. */
    .title {
      margin: 0;
      padding: 22px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
      color: var(--od-text);
    }

    .surface {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .row {
      box-sizing: border-box;
      width: 100%;
      min-height: 72px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--od-text);
      text-decoration: none;
    }

    .icon {
      flex: none;
      display: flex;
      color: var(--od-text);
    }

    .texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .label {
      font-size: 16px;
      line-height: 22px;
    }

    .supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .bottom {
      height: 24px;
    }
  }
</style>
