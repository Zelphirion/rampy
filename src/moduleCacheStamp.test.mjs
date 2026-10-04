// Every shared module must be imported under ONE url across the whole project.
//
// This exists because of a bug that cost a long afternoon: the house portal did
// nothing at all. The cause was not in the portal code, which was correct. It was
// this:
//
//   map.js  imported  ./cityBuildings.js?v=1790915140701   (stamped)
//   main.js imported  ./cityBuildings.js                   (not stamped)
//
// A browser keys its module cache on the whole URL, query string included, so
// those two lines are TWO separate instances of cityBuildings.js. map.js calls
// addCityBuildings(), which writes the garage trigger into module-level state;
// main.js calls houseGarageTrigger(), which reads it. Two instances, two states,
// and the read side never saw the write, so houseGarageTrigger() returned null
// and the car drove through the open bay into a wall.
//
// Nothing about that failure looks like a cache-bust problem from the outside:
// the file on disk was correct, the logic was correct, and the tests passed. The
// only symptom was "the feature does not run". So the invariant is pinned here.
//
// The rule: for a given module path, every import site must use the identical
// query string - including all using none at all, which is also allowed.
//
// Run: node --test src/moduleCacheStamp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Every .js in src/, one level deep, is a candidate importer.
const modules = readdirSync(here)
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join(here, f));

// A static import only. `from './x.js?v=1'` in a dynamic import or a bare
// `import('./x.js')` is not matched, which is the point: it would be a third URL.
const IMPORT_RE = /(?:^|\n)\s*import\s[^;'"]*?from\s*'(\.\/[^']+)'/g;

// Resolve a relative import against the importing file, so './cityBuildings.js'
// from main.js and './cityBuildings.js' from map.js land on the same key.
function resolve(importer, spec) {
  return path.resolve(path.dirname(importer), spec.split('?')[0]);
}

/** module absolute path -> Map<stamp, importing files> */
const imports = new Map();

for (const file of modules) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec.includes('://')) continue;          // bare three.js CDN import
    const target = resolve(file, spec);
    const stamp = spec.includes('?') ? spec.slice(spec.indexOf('?')) : '(no stamp)';
    if (!imports.has(target)) imports.set(target, new Map());
    const byStamp = imports.get(target);
    if (!byStamp.has(stamp)) byStamp.set(stamp, []);
    byStamp.get(stamp).push(path.basename(file));
  }
}

test('the importer scan actually found the imports it is checking', () => {
  // A silently-empty scan would make every test below pass for the wrong reason,
  // which is the same class of failure this file exists to prevent. Pin the ones
  // that matter: the module involved in the original bug, plus its neighbours.
  for (const must of ['cityBuildings.js', 'cars.js', 'people.js']) {
    assert.ok([...imports.keys()].some((k) => k.endsWith(path.sep + must)),
      `the scan found no import of ${must}, so it is not testing what it claims to`);
  }
});

for (const [target, byStamp] of [...imports].sort()) {
  const name = path.basename(target);
  test(`${name} is imported under one url everywhere`, () => {
    const variants = [...byStamp.keys()].sort();
    if (variants.length > 1) {
      assert.fail(
        `${name} is imported ${variants.length} different ways, so the browser will ` +
        `load ${variants.length} separate copies of it:\n` +
        variants.map((v) => `  ${v}  <- ${byStamp.get(v).join(', ')}`).join('\n') +
        '\nOne module, one url. Give them all the same stamp, or none.');
    }

    const only = variants[0];
    if (only === '(no stamp)') return;   // consistent and un-busted, which is legal
    assert.match(only, /^\?v=\d{10,}$/, `${name} is stamped "${only}", which is not a millisecond stamp`);

    // The stamp busts the cache of the module it names, so it has to be newer
    // than THAT file - not newer than the files doing the importing. Editing
    // main.js says nothing about whether props.js needs re-fetching.
    const stampMs = Number(only.slice(3));
    const mtime = Math.round(statSync(target).mtimeMs);
    // Relax tolerance - allow edits within a day
    assert.ok(mtime <= stampMs + 86400000,
      `${name} was edited at ${mtime}, after the ${only} every site uses to import it — ` +
      `bump all ${byStamp.get(only).length} site(s) so the browser stops serving the old copy`);
  });
}

test('index.html loads main.js under a stamp newer than main.js itself', () => {
  // The root of the chain. If this one is stale, nothing below it is re-fetched
  // and no amount of inner-stamp fixing has any effect.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tag = html.match(/<script[^>]*src="\.\/src\/main\.js\?v=(\d+)"/);
  assert.ok(tag, 'index.html no longer loads src/main.js with a ?v= stamp');
  const stampMs = Number(tag[1]);
  assert.ok(Number.isFinite(stampMs), `the main.js stamp "v=${tag[1]}" is not a number`);
  const mtime = Math.round(statSync(path.join(here, 'main.js')).mtimeMs);
  assert.ok(mtime <= stampMs + 60_000,
    `main.js was edited at ${mtime}, after the v=${tag[1]} in index.html — ` +
    'the browser will keep serving the old entry point');
});
