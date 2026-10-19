import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { forGame } from './src/data/game-fields.ts';

const CATALOGUE = new URL('./src/data/catalogue.json', import.meta.url);
const JOLT_WASM = new URL('./node_modules/jolt-physics/dist/jolt-physics.wasm.wasm', import.meta.url);
const MODELS = new URL('./src/assets/models/', import.meta.url);

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

/**
 * `virtual:downloads` is the physics engine's address and the size of it and every model, so the
 * first load can count real bytes. They're the unpacked sizes: the server may compress the files,
 * but a fetch hands over the bytes unpacked.
 */
function downloads(): Plugin {
  const id = '\0virtual:downloads';
  return {
    name: 'downloads',
    resolveId: (source) => (source === 'virtual:downloads' ? id : undefined),
    load(loaded) {
      if (loaded !== id) return undefined;
      const models = Object.fromEntries(
        fs
          .readdirSync(MODELS)
          .filter((f) => f.endsWith('.glb'))
          .map((f) => [f.slice(0, -4), fs.statSync(new URL(f, MODELS)).size]),
      );
      const wasm = fileURLToPath(JOLT_WASM).replaceAll('\\', '/');
      return [
        `export { default as wasmUrl } from ${JSON.stringify(`${wasm}?url`)};`,
        `export const WASM_BYTES = ${fs.statSync(JOLT_WASM).size};`,
        `export const MODEL_BYTES = ${JSON.stringify(models)};`,
      ].join('\n');
    },
  };
}

export default defineConfig({
  plugins: [svelte(), gameCatalogue(), downloads()],
  worker: { format: 'es', plugins: () => [downloads()] },
  build: { target: 'es2022' },
});
