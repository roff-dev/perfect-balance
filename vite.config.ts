import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { footerHtml } from './src/app/footer.ts';
import { forGame } from './src/data/game-fields.ts';

const CATALOGUE = new URL('./src/data/catalogue.json', import.meta.url);
const JOLT_WASM = new URL('./node_modules/jolt-physics/dist/jolt-physics.wasm.wasm', import.meta.url);
const MODELS = new URL('./src/assets/models/', import.meta.url);
const CREDITS = new URL('./src/data/credits.json', import.meta.url);
/** Where the game is published, for canonical links, the social card and the sitemap. */
const SITE = 'https://perfect-balance.kieronoates.workers.dev';
/** The pages beside the game, each its own HTML file with no script. */
const PAGES = ['about', 'privacy', 'terms', 'credits', '404'];

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

interface Credit {
  title: string;
  author: string;
  licence: string;
  licenceUrl: string;
  source: string;
  changes: string;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * Every model under the game's names for what it shows, grouped by its maker. CC BY ones also give
 * the work's own title and what was changed, as the licence asks.
 */
function creditsHtml(): string {
  const shows = new Map<string, string[]>();
  for (const entry of JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')) as { name: string; model: { file?: string } }[]) {
    if (entry.model.file) shows.set(entry.model.file, [...(shows.get(entry.model.file) ?? []), entry.name]);
  }
  const credits = Object.entries(JSON.parse(fs.readFileSync(CREDITS, 'utf8')) as Record<string, Credit>).map(([file, c]) => ({
    ...c,
    name: (shows.get(file) ?? [c.title]).join(', '),
  }));
  const authors = [...new Set(credits.map((c) => c.author))].sort((a, b) => credits.filter((c) => c.author === b).length - credits.filter((c) => c.author === a).length);
  return authors
    .map((author) => {
      const theirs = credits.filter((c) => c.author === author).sort((a, b) => a.name.localeCompare(b.name));
      const licences = [...new Map(theirs.map((c) => [c.licence, c.licenceUrl])).entries()].map(([name, url]) => `<a href="${url}">${name}</a>`).join(', ');
      const items = theirs
        .map((c) => {
          const changed = c.licence.startsWith('CC-BY') ? ` <span class="changed">“${escape(c.title)}”, ${escape(c.changes)}</span>` : '';
          return `<li><a href="${escape(c.source)}">${escape(c.name)}</a>${changed}</li>`;
        })
        .join('');
      return `<section><h3>${escape(author)} <span class="licence">${licences}</span></h3><ul class="models">${items}</ul></section>`;
    })
    .join('');
}

/**
 * Each page's address and social card, from its own title and description. The 404 page has
 * neither, as it isn't an address of its own.
 */
function shareTags(html: string, path: string): string {
  const page = path.replace(/^\//, '').replace(/\.html$/, '');
  if (page === '404') return '';
  const url = `${SITE}/${page === 'index' ? '' : page}`;
  const title = html.match(/<title>(.*?)<\/title>/)![1]!;
  const description = html.match(/<meta name="description" content="(.*?)"/)![1]!;
  return [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Perfect Balance" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${SITE}/og.jpg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="A brass balance scale with a stack of things on one pan, beside the words Perfect Balance." />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');
}

/** The static pages: the shared footer and, on Credits, the model list, written in at build time. */
function pages(): Plugin {
  return {
    name: 'pages',
    transformIndexHtml: (html, { path }) =>
      html
        .replace('<!--footer-->', footerHtml())
        .replace('<!--credits-->', creditsHtml())
        .replace('</head>', `  ${shareTags(html, path === '/' ? '/index.html' : path)}\n    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />\n  </head>`),
    generateBundle() {
      const urls = ['', ...PAGES.filter((p) => p !== '404')].map((p) => `  <url><loc>${SITE}/${p}</loc></url>`);
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n` });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n` });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), gameCatalogue(), downloads(), pages()],
  worker: { format: 'es', plugins: () => [downloads()] },
  build: {
    target: 'es2022',
    rollupOptions: { input: Object.fromEntries(['index', ...PAGES].map((page) => [page, fileURLToPath(new URL(`./${page}.html`, import.meta.url))])) },
  },
});
