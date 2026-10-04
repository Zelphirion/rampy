// Every object in the catalogue has to BUILD.
//
// The catalogue is ~100 hand-written model builders, and the Objects browser
// calls them to put a spinning miniature in every grid tile. A builder that
// throws takes its tile away; one that builds nothing leaves a tile with a name
// and no model in it. Neither is visible to `node --check`, and neither is worth
// finding by clicking through five levels' worth of categories by hand.
//
// So: run the real catalogue.js against a stub three and call every builder.
//
// Run: node --test src/objects/catalogBuild.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Evaluate the real catalogue with the CDN three swapped for the local stub, so
// this exercises the builders rather than a copy of them.
const source = fs.readFileSync(path.join(here, 'catalog.js'), 'utf8')
  .replace(/import\s+\*\s+as\s+THREE\s+from\s+'https:[^']*';/,
    "import * as THREE from './three-stub.mjs';");
assert.ok(!/https:\/\/cdn/.test(source), 'the CDN three import was not swapped out');

const built = path.join(here, '__catalog_under_test.mjs');
fs.writeFileSync(built, source);
process.on('exit', () => { try { fs.unlinkSync(built); } catch { /* already gone */ } });

const { LEVELS, categoriesForLevel, findObject } = await import(pathToFileURL(built).href);

// Every object in the catalogue, flattened, tagged with where it came from.
function everyObject() {
  const all = [];
  for (const lvl of LEVELS) {
    for (const cat of categoriesForLevel(lvl.id)) {
      for (const o of cat.objects) all.push({ level: lvl.id, category: cat.id, ...o });
    }
  }
  return all;
}

test('the catalogue is not empty and covers every level', () => {
  assert.ok(LEVELS.length >= 4, `only ${LEVELS.length} levels are catalogued`);
  const all = everyObject();
  assert.ok(all.length > 50, `only ${all.length} objects in the whole catalogue`);
  for (const lvl of LEVELS) {
    const cats = categoriesForLevel(lvl.id);
    assert.ok(cats.length > 0, `${lvl.label} has no categories, so its Objects button lands on nothing`);
    for (const cat of cats) {
      assert.ok(cat.objects.length > 0, `${lvl.label} / ${cat.name} is empty`);
    }
  }
});

test('every object builds, and builds something', () => {
  const all = everyObject();
  const broken = [];
  const empty = [];
  for (const o of all) {
    let model;
    try {
      model = o.build();
    } catch (e) {
      broken.push(`${o.level}/${o.category}/${o.name}: threw ${e.message}`);
      continue;
    }
    // A builder that returns a group with nothing in it is as broken as one
    // that throws: the tile shows a name over an empty box.
    let meshes = 0;
    if (model && typeof model.traverse === 'function') {
      model.traverse((n) => { if (n.isMesh) meshes++; });
    } else {
      empty.push(`${o.level}/${o.category}/${o.name}: build() returned ${typeof model}`);
      continue;
    }
    if (meshes === 0) empty.push(`${o.level}/${o.category}/${o.name}: no meshes`);
  }
  assert.equal(broken.length, 0, `builders that threw:\n  ${broken.join('\n  ')}`);
  assert.equal(empty.length, 0, `builders that made nothing:\n  ${empty.join('\n  ')}`);
});

test('builders hand back a fresh model every call', () => {
  // The browser builds each object twice - once for the grid tile, once for the
  // big stage - and swaps one for another while both are on screen. A builder
  // that returned a cached group would re-parent the live one, and the tile
  // would empty itself the moment you clicked it.
  const all = everyObject();
  const shared = [];
  for (const o of all) {
    let a, b;
    try {
      a = o.build();
      b = o.build();
    } catch {
      continue;   // already reported by the build test above
    }
    if (a === b) shared.push(`${o.level}/${o.category}/${o.name}: returned the same object twice`);
  }
  assert.equal(shared.length, 0, `builders that cache their model:\n  ${shared.join('\n  ')}`);
});

test('every object has a name and a world position to jump to', () => {
  // "View in context" teleports the car to these two numbers, so they have to
  // be real coordinates and finite - a NaN here drops the car out of the world
  // and never brings it back.
  const all = everyObject();
  const bad = [];
  for (const o of all) {
    if (!o.name || !String(o.name).trim()) bad.push(`${o.level}/${o.category}: an object has no name`);
    if (!Number.isFinite(o.x) || !Number.isFinite(o.z)) {
      bad.push(`${o.level}/${o.category}/${o.name}: position is (${o.x}, ${o.z})`);
    }
  }
  assert.equal(bad.length, 0, `unusable catalogue entries:\n  ${bad.join('\n  ')}`);
});

test('names are unique inside a category, which is what the URL can carry', () => {
  // ?objects=<name> identifies an object by name, so two objects sharing one
  // inside a category makes the back button and a refresh ambiguous.
  for (const lvl of LEVELS) {
    for (const cat of categoriesForLevel(lvl.id)) {
      const seen = new Map();
      for (const o of cat.objects) {
        if (seen.has(o.name)) {
          assert.fail(`${lvl.label} / ${cat.name} has two objects called "${o.name}"`);
        }
        seen.set(o.name, true);
      }
    }
  }
});

test('findObject finds an object by the name the URL carries', () => {
  const all = everyObject();
  for (const o of all.slice(0, 12)) {
    const hit = findObject(o.name);
    assert.ok(hit, `"${o.name}" is not findable`);
    // It may legitimately match a different level's object of the same name, but
    // it must never match nothing when asked about one that exists.
    assert.ok(hit.level && hit.category && hit.object,
      `findObject("${o.name}") returned something without a level/category/object`);
  }
});