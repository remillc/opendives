// @ts-check
import { mount } from 'svelte';
import Framework7 from 'framework7/lite-bundle';
import Framework7Svelte from 'framework7-svelte';
// Framework7's CSS is imported by theme.css, in the "framework7" layer.
import './theme.css';
import App from './App.svelte';
import { savedTheme, setDocumentTheme } from './lib/theme.js';

// The theme is set before Framework7 starts, so that its primary color matches.
setDocumentTheme(savedTheme());
Framework7.use(Framework7Svelte);

mount(App, { target: /** @type {HTMLElement} */ (document.getElementById('app')) });
