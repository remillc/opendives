<script>
  // @ts-check
  // Maximum pO2 of the gas tools: an exposed dropdown menu from 1,0 to 1,6 bar by
  // 0,1 ("1,4 bar"), as docs/mockups/outils-ead-mod-android.dc.html (spec, section 8).
  import SelectField from './SelectField.svelte';
  import { formatNumber } from '../lib/format.js';
  import { po2Choices } from '../lib/select-menu.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ value: number }} the pO2 in mbar */
  let { value = $bindable() } = $props();

  const options = $derived(po2Choices().map((mbar) => ({ value: String(mbar), label: `${formatNumber(mbar / 1000, 1)} ${t('units.bar')}` })));
  // svelte-ignore state_referenced_locally
  let choice = $state(String(value));
  $effect(() => {
    choice = String(value);
  });
</script>

<SelectField label={t('tools.maxPo2')} bind:value={choice} {options} onchange={(v) => (value = Number(v))} />
