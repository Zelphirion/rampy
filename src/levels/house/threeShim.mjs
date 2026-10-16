// Redirects the CDN three.js import at the house stub.
//
// The house build tests import the real playroom builders, which pull the real
// `train.js` (the locomotive) and `spaceport.js` (the ship). Both import three by
// its CDN URL, which Node cannot fetch. Registering this resolve hook (see
// houseHarness.mjs) points every one of those imports at the house stub, so the
// whole transitive graph loads headless with no per-module rewriting.
//
// The stub is the one the rest of the house tests use, because the furniture
// audit reads box sizes off the stub's recorded geometry `params`.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const stub = pathToFileURL(path.join(here, 'three-stub.mjs')).href;

export async function resolve(specifier, context, nextResolve) {
  if (/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@/.test(specifier)) {
    return { url: stub, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
