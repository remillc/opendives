// @ts-check
import { mount } from 'svelte';
import Framework7 from 'framework7/lite-bundle';
import Framework7Svelte from 'framework7-svelte';
// Framework7's CSS is imported by theme.css, in the "framework7" layer.
import './theme.css';
import App from './App.svelte';
import { mark, observePaints } from './lib/perf.js';
import { boot } from './lib/logbook.svelte.js';
import { releaseLaunchScreen } from './lib/launch.js';

observePaints();
mark('main');
// The core starts on the logbook now, on its own thread, while the screens are
// built: the settings of this device first, then the account and the device's
// copy of the log (on a first launch, nothing is loaded until a choice).
boot();

Framework7.use(Framework7Svelte);

mount(App, { target: /** @type {HTMLElement} */ (document.getElementById('app')) });
mark('mounted');
releaseLaunchScreen();
