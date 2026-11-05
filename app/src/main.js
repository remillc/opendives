// @ts-check
import { mount } from 'svelte';
import Framework7 from 'framework7/lite-bundle';
import Framework7Svelte from 'framework7-svelte';
// Le CSS de Framework7 est importé par theme.css, dans la couche « framework7 ».
import './theme.css';
import App from './App.svelte';

Framework7.use(Framework7Svelte);

mount(App, { target: /** @type {HTMLElement} */ (document.getElementById('app')) });
