// The fire station is a `fire: true` target, and its engine starts parked in the
// bay with the door open.
//
// The station burned originally, and burning it again reintroduced a subtler
// bug: a `fire: true` collider is normally a SOLID footprint, and the blocking
// test is 2D and ignores height -- so a solid rect over the station's 20 x 14
// ground floor sealed its own apparatus bays. The engine could not drive out of
// its own garage to answer the call it was sitting in. The fix is `soft`, which
// feeds the fire/lizard/engine queries without blocking the car. This is the
// test that keeps the fix in place.
//
// Run: node --test src/fireStation.fire.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, 'cityBuildings.js'), 'utf8');

// Isolate the fireStation() builder.
const fnStart = SRC.indexOf('function fireStation(');
assert.ok(fnStart > -1, 'could not find fireStation() in cityBuildings.js');
const fnEnd = SRC.indexOf('\nfunction ', fnStart + 10);
const fn = SRC.slice(fnStart, fnEnd > -1 ? fnEnd : undefined);

// Every collider the station pushes.
//
// Only the flags are parsed, not the expressions. Values like
// `s * (W / 2 - WALL / 2)` contain commas and parentheses, so a naive
// key/value split mangles them; the flags this file cares about are bare
// `true` literals, which are unambiguous.
function stationColliders() {
  return [...fn.matchAll(/colliders\.push\(\{([\s\S]*?)\}\)/g)].map((m) => {
    const body = m[1];
    const flag = (name) => new RegExp(`${name}:\\s*true`).test(body);
    return { body, fire: flag('fire'), soft: flag('soft') };
  });
}

test('the fire station is a fire target', () => {
  const fires = stationColliders().filter((c) => c.fire);
  assert.equal(fires.length, 1,
    `expected exactly one fire: true collider on the station, found ${fires.length}`);
});

test('the fire collider is soft, so it cannot seal the apparatus bays', () => {
  // This is the actual bug this file guards. Collision is a 2D rect test with no
  // height term, so a solid footprint over the whole ground floor walls the bays
  // shut and the parked engine can never leave.
  const fire = stationColliders().find((c) => c.fire);
  assert.ok(fire, 'the station has no fire collider to check');
  assert.ok(fire.soft,
    'the station fire collider must be soft or it walls the bays shut');
});

test('the fire collider covers the whole building footprint', () => {
  // It has to be a whole-building footprint, or the fire burns in mid-air
  // beside the station instead of on it. The sizes are written as `W / 2` and
  // `D / 2` against the station's W = 20, D = 14.
  const fire = stationColliders().find((c) => c.fire);
  assert.match(fire.body, /halfW:\s*W\s*\/\s*2/, 'the fire collider is not the full building width');
  assert.match(fire.body, /halfD:\s*D\s*\/\s*2/, 'the fire collider is not the full building depth');
});

test('the bays are still left physically open', () => {
  // Only the shell walls get solid colliders. Nothing solid may sit over the
  // bay apertures or the interior floor.
  //
  // Four push sites, not four colliders: two of them sit inside `for (const s
  // of [-1, 1])` loops and each push twice, for a total of six — the two
  // flanks, the back, the two piers, and the centre entrance block.
  const sites = stationColliders().filter((c) => !c.fire && !c.soft);
  assert.equal(sites.length, 4,
    `expected 4 solid collider push sites on the station, found ${sites.length}; ` +
    'the bays may have been walled up');
  // Every one of them must be a thin wall run, never a floor-sized rect.
  //
  // Note the two flank walls DO span the full depth (halfD: D / 2) — that is
  // correct, they are the sides of the building, running front to back. What
  // must not exist is a collider that is BOTH full depth and full width: that
  // is a lid over the whole ground floor, and a 2D test with no height term
  // would read it as a wall across the bays.
  for (const c of sites) {
    const fullWidth = /halfW:\s*W\s*\/\s*2/.test(c.body);
    const fullDepth = /halfD:\s*D\s*\/\s*2/.test(c.body);
    assert.ok(!(fullWidth && fullDepth),
      'a solid collider spans the full building width AND depth; that is a lid over the bays');
  }
});

test('cityFireSpots only reads colliders that are marked fire', () => {
  // If this ever stops keying off the fire flag, or starts filtering on `soft`
  // as well, the soft flag stops being a way to keep a fire target without
  // blocking, and the two concerns would have to be split properly.
  const src = fs.readFileSync(path.join(here, 'cityBuildings.js'), 'utf8');
  const m = src.match(/export function cityFireSpots\([\s\S]*?\n}/);
  assert.ok(m, 'could not find cityFireSpots in cityBuildings.js');
  assert.match(m[0], /\.filter\(\(c\) => c\.fire\)/,
    'cityFireSpots no longer keys purely off the fire flag');
  assert.ok(!/\.soft/.test(m[0]),
    'cityFireSpots tests .soft, which would drop every soft fire target');
  // It reads the footprint off the same fields, so a soft collider still lands
  // a fire of the right size and place over the building.
  for (const field of ['c.x', 'c.z', 'c.halfW', 'c.halfD', 'c.h']) {
    assert.ok(m[0].includes(field), `cityFireSpots no longer reads ${field} off the collider`);
  }
});
