import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Le plugin local est un lien vers ../plugins : ses imports se résolvent ici.
  resolve: { dedupe: ['@capacitor/core'] },
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
