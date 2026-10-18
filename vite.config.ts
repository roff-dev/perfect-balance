import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { forGame } from './src/data/game-fields.ts';

const CATALOGUE = new URL('./src/data/catalogue.json', import.meta.url);

/** `virtual:catalogue` is catalogue.json without the sources and quotes, which only the research needs. */
function gameCatalogue(): Plugin {
  const id = '\0virtual:catalogue';
  return {
    name: 'game-catalogue',
    resolveId: (source) => (source === 'virtual:catalogue' ? id : undefined),
    load(loaded) {
      if (loaded !== id) return undefined;
      this.addWatchFile(CATALOGUE.pathname.replace(/^\/(\w:)/, '$1'));
      const entries = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')) as object[];
      return `export default ${JSON.stringify(entries.map(forGame))};`;
    },
  };
}

export default defineConfig({
  plugins: [svelte(), gameCatalogue()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
