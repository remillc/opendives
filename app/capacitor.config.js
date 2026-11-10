// The app's Capacitor configuration. In JavaScript rather than JSON so that the
// version has one source, package.json: every request of the web view carries
// `OpenDives/<version>` in its User-Agent (OpenFreeMap's terms ask for an
// identifying User-Agent). No personal data.
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('@capacitor/cli').CapacitorConfig} */
export default {
  appId: 'org.opendives.app',
  appName: 'OpenDives',
  webDir: 'dist',
  loggingBehavior: 'none',
  appendUserAgent: `OpenDives/${version}`,
};
