// Node ESM loader hook: point the runtime CDN specifier for three at a local
// copy, so modules that import three by URL can be exercised headless in tests.
// Usage: node --import ./three-cdn-loader.mjs <script>
// or:    node --experimental-loader ./three-cdn-loader.mjs <script>
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
