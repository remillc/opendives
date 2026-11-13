<script>
  // @ts-check
  // The small cylinder icon of the gas rows (task 2026-11-13-87: the gas detail,
  // delete-a-cylinder and one-cylinder editing screens): the shape of
  // CylinderDrawing scaled down to 20 × 32, filled, with an ink outline and no
  // levels. Decorative: the row's text names the cylinder.
</script>

<svg class="od-cylinder-icon" width="20" height="32" viewBox="0 0 20 32" aria-hidden="true">
  <path
    d="M8.64 1 L8.64 2.82 C6.14 3.27 4.09 5.55 4.09 8.73 L4.09 25.55 C4.09 28.73 6.36 31 10 31 C13.64 31 15.91 28.73 15.91 25.55 L15.91 8.73 C15.91 5.55 13.86 3.27 11.36 2.82 L11.36 1 Z"
    class="od-cylinder-icon--body"
  />
</svg>

<style>
  @layer od.components {
    .od-cylinder-icon {
      flex: none;
    }

    .od-cylinder-icon--body {
      fill: var(--od-cylinder-icon);
      stroke: var(--od-text);
      stroke-width: 1.5;
      stroke-linejoin: round;
    }
  }
</style>
