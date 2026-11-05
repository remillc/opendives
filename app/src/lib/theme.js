// @ts-check
// Color themes compared on the phone (development only, see Settings).
// The values live in theme.css; this module only switches <html data-theme>,
// remembers the choice on the device and gives Framework7 its primary color.

/** @typedef {'pine'|'black-white'|'black-blocks'|'data-color'} ThemeId */

/** @type {{ id: ThemeId, labelKey: string }[]} */
export const themes = [
  { id: 'pine', labelKey: 'settings.themes.pine' },
  { id: 'black-white', labelKey: 'settings.themes.blackWhite' },
  { id: 'black-blocks', labelKey: 'settings.themes.blackBlocks' },
  { id: 'data-color', labelKey: 'settings.themes.dataColor' },
];

const STORAGE_KEY = 'opendives.theme';

/** The saved theme, or the default one (finalist 3, colour only in the profile). @returns {ThemeId} */
export function savedTheme() {
  const id = localStorage.getItem(STORAGE_KEY);
  return themes.some((theme) => theme.id === id) ? /** @type {ThemeId} */ (id) : 'data-color';
}

/** Sets the theme on the document, before or after Framework7 starts. @param {ThemeId} id */
export function setDocumentTheme(id) {
  document.documentElement.dataset.theme = id;
}

/** The --od-action color of the current theme, for Framework7's colors.primary. */
export function actionColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--od-action').trim();
}

/**
 * Applies a theme at once, without restarting, and remembers it on the device.
 * @param {ThemeId} id
 * @param {{ setColorTheme: (color: string) => void }} app the Framework7 app
 */
export function applyTheme(id, app) {
  setDocumentTheme(id);
  localStorage.setItem(STORAGE_KEY, id);
  app.setColorTheme(actionColor());
}
