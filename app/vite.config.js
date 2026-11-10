import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

// The app's version, from package.json (the one source, Semantic Versioning).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Its release date, from the heading of CHANGELOG.md (updated at each release); none before the release.
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const heading = changelog.split(/\r?\n/).find((line) => line.startsWith(`## [${version}] - `));
const releaseDate = heading?.slice(`## [${version}] - `.length).trim() ?? '';

export default defineConfig({
  plugins: [svelte()],
  // The local plugin is a link to ../plugins: its imports resolve here.
  resolve: { dedupe: ['@capacitor/core'] },
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version), __APP_RELEASE_DATE__: JSON.stringify(releaseDate) },
  build: { outDir: 'dist', emptyOutDir: true },
});
