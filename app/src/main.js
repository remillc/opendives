// @ts-check
import { mount } from 'svelte';
import Framework7 from 'framework7/lite-bundle';
import Framework7Svelte from 'framework7-svelte';
import 'framework7/css/bundle';
import App from './App.svelte';

Framework7.use(Framework7Svelte);

mount(App, { target: /** @type {HTMLElement} */ (document.getElementById('app')) });
