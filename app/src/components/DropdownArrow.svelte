<script>
  // @ts-check
  // The arrow of a dropdown menu: on Android, MD3's filled ▾ (a right chevron is
  // for what opens another page or a dialog); on iOS, the line chevron.
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
</script>

{#if ios}
  <Icon name="expand" />
{:else}
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10l5 5 5-5z" /></svg>
{/if}
