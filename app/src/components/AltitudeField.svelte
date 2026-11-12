<script>
  // @ts-check
  import NumberComboField from './NumberComboField.svelte';
  import { locale } from '../lib/format.js';
  import { altitudePresets } from '../lib/planner-rules.js';
  import { parseAltitude, altitudeText } from '../lib/altitude-field.js';
  // An altitude (task 72; mock-up android-planificateur-altitude): the editable
  // dropdown (NumberComboField), presets in feet or metres, any whole value typed
  // within 0 to 4500 m (15000 ft). The value is a whole foot or metre.

  /**
   * @type {{
   *   label: string,
   *   value: number,
   *   feet: boolean,
   *   unit: string,
   *   ariaLabel: string,
   *   openLabel: string,
   *   onchange: (value: number) => void,
   * }}
   */
  let { label, value, feet, unit, ariaLabel, openLabel, onchange } = $props();
</script>

<NumberComboField
  {label}
  {value}
  presets={altitudePresets(feet)}
  parse={(text) => parseAltitude(text, feet)}
  toText={(v) => altitudeText(v, locale)}
  presetText={(v) => altitudeText(v, locale)}
  {unit}
  {ariaLabel}
  {openLabel}
  {onchange}
/>
