// Module hooks that let Node's test runner load the app's own source files,
// without a bundler and without a new dependency:
//  - *.svelte.js (Svelte 5 runes) are compiled with svelte/compiler's
//    compileModule, from the app's own node_modules;
//  - *.json is loaded as a default export (the translations);
//  - 'opendives-core' (the native plugin) is replaced by a stub: the tests
//    never call the core, they test what is sent to it and what is shown;
//  - OD_JS_MUTATE=<name> changes a constant or a rule in the source as it is
//    loaded (a wrong psi factor, a wrong comparison...): the tests must then
//    fail. It is how tests/release-check.sh proves that these tests detect errors.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../../app');
const appRequire = createRequire(path.join(appDir, 'package.json'));
const stub = pathToFileURL(path.join(here, 'opendives-core-stub.mjs')).href;
const srcPrefix = pathToFileURL(path.join(appDir, 'src')).href;

/** The mutations: [file name, text in the source, text put in its place]. */
const MUTATIONS = {
  psi: ['', '68.947572932', '68.9'],
  cuft: ['', '28316.8466', '28000'],
  ft: ['', '304.8', '300'],
  alarm: ['planner-rules.js', 'carriedMl > 0 && carriedMl < totalMl', 'carriedMl > 0 && carriedMl <= totalMl'],
  mod: ['planner-rules.js', 'bottomModMm > 0 && maxDepthMm > bottomModMm', 'bottomModMm > 0 && maxDepthMm >= bottomModMm'],
  decomodel: ['planner.svelte.js', "decoModel: deco.decoModel === 'vpmb' ? 1 : 0,", "decoModel: deco.decoModel === 'vpmb' ? 0 : 1,"],
  carried: ['planner.svelte.js', '...(g.carriedMl > 0 ? { carriedMl: Math.round(g.carriedMl) } : {}),', '...{ carriedMl: Math.round(g.carriedMl) },'],
};

function mutate(url, source) {
  const name = process.env.OD_JS_MUTATE;
  if (!name || !url.startsWith(srcPrefix)) return source;
  const m = MUTATIONS[name];
  if (!m) throw new Error(`unknown mutation ${name}`);
  if (m[0] && !url.endsWith('/' + m[0])) return source;
  return source.split(m[1]).join(m[2]);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'opendives-core') return { url: stub, shortCircuit: true };
  if (specifier === 'svelte' || specifier.startsWith('svelte/')) {
    return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(appDir, 'package.json')).href });
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json') && url.startsWith(srcPrefix)) {
    const text = await readFile(fileURLToPath(url), 'utf8');
    return { format: 'module', source: `export default ${text};`, shortCircuit: true };
  }
  if (url.startsWith(srcPrefix) && url.endsWith('.js')) {
    let source = mutate(url, await readFile(fileURLToPath(url), 'utf8'));
    if (url.endsWith('.svelte.js')) {
      const { compileModule } = appRequire('svelte/compiler');
      source = compileModule(source, { filename: fileURLToPath(url), generate: 'client' }).js.code;
    }
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
