// The museum is an enclosed box, and two generic main.js systems did not know
// it: the overworld boundary clamp fenced the car in at x ±90 / z -90 (an
// invisible wall across the middle of a hall that is 428 x 938), and the
// cinematic camera asked for "the ground" and was told city y=0 instead of the
// exhibit floor 36 below the atrium, so every sight line read as buried.
//
// Both are engine-side, so these are source checks rather than a headless drive.
//
// Run: node --test src/museumEnclosure.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const { MUSEUM_HALL, ATRIUM, EXHIBIT } = await import('./levels/museum/layout.js');
const { worldXLo, worldXHi, worldZLo, worldZHi } = await import('./modules/world.js');

test('the museum really is bigger than the overworld rectangle', () => {
  // If this ever stops being true the clamp would be harmless and the test
  // below would be pinning nothing.
  assert.ok(MUSEUM_HALL.maxX > worldXHi || MUSEUM_HALL.minX < worldXLo,
    'the hall no longer extends past the city bounds in x');
  assert.ok(MUSEUM_HALL.minZ < worldZLo,
    'the hall no longer extends past the city bounds in z');
  assert.ok(EXHIBIT.floorY < MUSEUM_HALL.floorY,
    'the exhibit floor is not below the atrium any more');
  assert.ok(ATRIUM.maxX < MUSEUM_HALL.maxX,
    'the lobby is no longer the narrow wing of the building');
});

test('the museum is exempt from the overworld boundary clamp', () => {
  // Both the P1 and the P2 boundary blocks gate on this list of enclosed worlds.
  const gated = [...src.matchAll(
    /worldState !== 'underground' && worldState !== 'house' && worldState !== 'beach'[\s\S]{0,80}?\) \{/g)];
  assert.equal(gated.length, 2, 'expected the P1 and P2 boundary blocks in main.js');
  for (const m of gated) {
    assert.match(m[0], /worldState !== 'museum'/,
      'the overworld clamp still runs in the museum, so the car is fenced off ' +
      `at x ±${worldXHi} / z ${worldZLo} inside its own walls`);
  }
});

test('the cinematic camera reads the museum floor, not the city ground', () => {
  const fn = src.slice(src.indexOf('function worldFloorAt('));
  assert.ok(fn, 'main.js no longer has worldFloorAt');
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /worldState === 'museum'\) return museumWorld\.surfaceAt\(x, z\)/,
    'worldFloorAt answers with the city ground in the museum, so the tripod ' +
    'reads the exhibit floor as underground and never sees the car');
});

test('the tripod stays on the car\'s own storey in the museum', () => {
  // The balcony slabs have no collider, so the sight test cannot tell that a
  // vantage up on a balcony is a floor above the pit: the pick has to reject
  // those spots itself, and a held vantage has to hop down when the car drops
  // into the exhibit.
  const pick = src.slice(src.indexOf('function cinePickSpot()'));
  const pickBody = pick.slice(0, pick.indexOf('\nfunction fallbackCineSpot'));
  assert.match(pickBody, /worldState === 'museum'\) \{[\s\S]{0,600}?spotFloor > carFloor \+ 2\) continue;/,
    'cinePickSpot still accepts a vantage on a storey above the car');
  assert.match(pickBody, /cy = Math\.max\(carFloor, spotFloor\) \+ 2 \+ Math\.random\(\) \* 3;/,
    'the museum tripod is not placed low, at the car\'s own floor');

  const branch = src.slice(src.indexOf("// ===== Cinematic camera (the C key's third view) =====", src.indexOf('function updateCamera')));
  assert.match(branch.slice(0, branch.indexOf("// ===== Chase-cam handoff")),
    /offStorey[\s\S]{0,200}?cinePickSpot\(\)/,
    'a held tripod a floor away from the car never re-picks');
});
