// Loads the REAL house builder headless, with the CDN three swapped for the
// local stub.
//
// Two files have to be rewritten, not one. `index.js` pulls three off the CDN
// itself, but it also imports `addKnockable` from `../../physics.js`, and
// physics.js pulls three off the CDN too. Patching only the builder therefore
// got as far as Node's ESM loader rejecting the `https:` specifier inside
// physics.js - ERR_UNSUPPORTED_ESM_URL_SCHEME - and all three build tests died on
// an import error rather than on anything about the house.
//
// So this rewrites physics.js first, into a scratch file sitting in ITS OWN
// directory (its `./modules/...` imports only resolve from there), and then
// points the builder's copy of that import at the scratch file. The physics
// under test is still the real physics - only its three is a stub.
//
// Both scratch files are named after this process's PID so two copies of the
// same test running side by side cannot write over each other, and both are
// removed on exit. builder.test.mjs walks the whole src/ tree looking for
// mojibake, so a scratch file that flickered in and out under a fixed name was
// making that scan throw ENOENT.
//
// Run: node --test src/levels/house/build.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', '..');   // src/

const CDN_THREE = /import\s+\*\s+as\s+THREE\s+from\s+'https:[^']*';/;
const STUB = "import * as THREE from './three-stub.mjs';";

function scratch(dir, stem, source) {
  const file = path.join(dir, `__${stem}_under_test.${process.pid}.mjs`);
  fs.writeFileSync(file, source);
  process.on('exit', () => { try { fs.unlinkSync(file); } catch { /* already gone */ } });
  return file;
}

// 1. physics.js, in src/ so its relative imports still land.
const physicsSrc = fs.readFileSync(path.join(SRC, 'physics.js'), 'utf8').replace(CDN_THREE, STUB);
assert.ok(!/https:\/\/cdn/.test(physicsSrc), 'the CDN three import was not swapped out of physics.js');
// The builder's scratch copy lives one directory down, so the stub path inside
// physics needs to climb back out of src/ and back down into levels/house/.
const physicsHere = scratch(SRC, 'physics', physicsSrc.replace(STUB, "import * as THREE from './levels/house/three-stub.mjs';"));

// 2. the builder, in its own directory so ./layout.js still resolves. The import
// specifier has to be a URL, not a Windows path - "C:/..." parses as a URL with
// the scheme "c:" and the loader rejects it.
const physicsUrl = pathToFileURL(physicsHere).href;
const builderSrc = fs.readFileSync(path.join(here, 'index.js'), 'utf8')
  .replace(CDN_THREE, STUB)
  .replace(/(['"])\.\.\/\.\.\/physics\.js\1/, `'${physicsUrl}'`);
assert.ok(!/https:\/\/cdn/.test(builderSrc), 'the CDN three import was not swapped out of index.js');
assert.ok(!/\.\.\/\.\.\/physics\.js/.test(builderSrc),
  'the builder still imports the real physics.js, which reaches the CDN');
const builderHere = scratch(here, 'builder', builderSrc);

export const { addHouse } = await import(pathToFileURL(builderHere).href);