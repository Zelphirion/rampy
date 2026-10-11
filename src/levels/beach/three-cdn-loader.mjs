// Node ESM loader hook: point the runtime CDN specifier for three at a local
// copy, so modules that import three by URL can be exercised headless in tests.
//
// Note: `src/objects/nodeShims.mjs` registers the same redirect (via
// src/objects/threeLoader.mjs) AND installs the DOM globals the level modules
// need, so prefer `node --import ./src/objects/nodeShims.mjs <script>`.
// This file remains for scripts that only need the three redirect and want to
// choose the copy via $THREE_LOCAL.
//
// Usage: node --import ./three-cdn-loader.mjs <script>
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const THREE_LOCAL =
  process.env.THREE_LOCAL ||
  `${process.env.LOCALAPPDATA || process.env.TEMP}\\Temp\\opencode\\threecache\\three.module.js`;

register(
  'data:text/javascript,' + encodeURIComponent(`
    const LOCAL = ${JSON.stringify(pathToFileURL(THREE_LOCAL).href)};
    export async function resolve(specifier, context, next) {
      if (specifier.startsWith('https://cdn.jsdelivr.net/npm/three')) {
        return { url: LOCAL, shortCircuit: true, format: 'module' };
      }
      return next(specifier, context);
    }
  `),
  import.meta.url,
);
