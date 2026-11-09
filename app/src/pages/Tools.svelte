<script>
  // @ts-check
  // Tools section (docs/ui-specification.md, section 1, "Tools page and gas
  // tools"; docs/mockups/android-outils.dc.html): only a list of links, in two
  // groups, on white surfaces like Settings. Each tool has its own screen.
  import { Page, Navbar } from 'framework7-svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { layout } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { keepInSvelteRange } from '../lib/master-detail.js';

  /** @type {{ f7router: { navigate: (url: string, options?: object) => void } }} */
  let { f7router } = $props();

  /** Tablet: the address of the tool shown beside the list. */
  let selected = $state('');
  let opened = false;

  // Tablet: the planner is shown beside the list as soon as the section is
  // opened (spec, section 3), instead of an empty pane.
  $effect(() => {
    if (!layout.split || navigation.section !== 'tools' || opened) return;
    opened = true;
    selected = '/plans/';
    f7router.navigate('/plans/', { reloadDetail: true });
  });

  /** @param {MouseEvent} e */
  function select(e) {
    if (!layout.split) return;
    const link = /** @type {HTMLElement} */ (e.target).closest('a[data-reload-detail]');
    if (link) selected = link.getAttribute('href') ?? '';
  }

  /** @type {{ title: string, rows: { href: string, icon: 'plan'|'desaturation'|'depthGauge'|'bestMix'|'blender', name: string, text: string }[] }[]} */
  const groups = $derived([
    {
      title: t('tools.groupDive'),
      rows: [
        { href: '/plans/', icon: 'plan', name: t('tools.planner'), text: t('tools.plannerText') },
        { href: '/tools/desaturation', icon: 'desaturation', name: t('tools.desaturation'), text: t('tools.desaturationText') },
      ],
    },
    {
      title: t('tools.groupGas'),
      rows: [
        { href: '/tools/ead-mod', icon: 'depthGauge', name: t('tools.eadMod'), text: t('tools.eadModText') },
        { href: '/tools/best-mix', icon: 'bestMix', name: t('tools.bestMixTool'), text: t('tools.bestMixText') },
        { href: '/tools/blender', icon: 'blender', name: t('tools.blender'), text: t('tools.blenderText') },
      ],
    },
  ]);
</script>

<Page class="od-tools" onPageInit={keepInSvelteRange}>
  <Navbar class="od-band-bar" title={t('tools.title')}>
    {#snippet left()}<MenuButton />{/snippet}
  </Navbar>

  <SectionBand summary={t('band.tools')} />

  {#each groups as group (group.title)}
    <h2 class="title">{group.title}</h2>
    <div class="surface" role="list">
      {#each group.rows as row (row.href)}
        <div role="listitem">
          <a class="row" class:selected={selected === row.href} href={row.href} data-reload-detail="true" onclick={select}>
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

    /* Tablet: the tool shown beside the list. */
    .row.selected {
      background: var(--od-tint);
      color: var(--od-on-tint);

      .supporting,
      .chevron {
        color: inherit;
      }
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
