// Points the CDN three.js import at the local npm copy, so node can load the
// game's real modules (they all do `import * as THREE from 'https://cdn...').
//
//   node --import ./src/objects/nodeShims.mjs \
//        --loader ./src/objects/threeLoader.mjs --test src/...
//
// Only the three CDN URLs are redirected; every other specifier passes through.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const localThree = pathToFileURL(
  path.resolve(fileURLToPath(import.meta.url), '../../../node_modules/three/build/three.module.js'),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@/.test(specifier)) {
    return { url: localThree, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
