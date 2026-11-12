<script>
  // @ts-check
  import NumberComboField from './NumberComboField.svelte';
  import { locale } from '../lib/format.js';
  import { sacPresets, sacPresetText, parseSac, sacText } from '../lib/sac-field.js';
  // A SAC (task 71; mock-up android-planificateur-sac): the editable dropdown
  // (NumberComboField) with the SAC rules of lib/sac-field.js. The value is in ml/min.

  /**
   * @type {{
   *   label: string,
   *   value: number,
   *   cuft: boolean,
   *   unit: string,
   *   ariaLabel: string,
   *   helper: string,
   *   openLabel: string,
   *   onchange: (ml: number) => void,
   * }}
   */
  let { label, value, cuft, unit, ariaLabel, helper, openLabel, onchange } = $props();

  const presets = $derived(sacPresets(cuft));
</script>

<NumberComboField
  {label}
  {value}
  presets={presets.map((p) => p.ml)}
  parse={(text) => parseSac(text, cuft)}
  toText={(ml) => sacText(ml, cuft, locale)}
  presetText={(ml) => sacPresetText(presets.find((p) => p.ml === ml)?.unit ?? 0, cuft, locale)}
  {unit}
  {ariaLabel}
  {helper}
  {openLabel}
  {onchange}
/>
