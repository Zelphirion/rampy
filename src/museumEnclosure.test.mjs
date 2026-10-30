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
import { register } from 'node:module';

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const { MUSEUM_HALL, ATRIUM, EXHIBIT } = await import('./levels/museum/layout.js');
const { worldXLo, worldXHi, worldZLo, worldZHi } = await import('./modules/world.js');

// The city-side museum is a CDN three.js module; the house shim loads it headless
// so its roof rectangle and the door/stair geometry can be measured for real.
register('./levels/house/threeShim.mjs', import.meta.url);
const { MUSEUM_ROOF, MUSEUM_DOOR, MUSEUM_STAIR } = await import('./cityOuter.js');
const outerSrc = readFileSync(new URL('./cityOuter.js', import.meta.url), 'utf8');

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

test('the museum roof plaza keeps the collider walls switched on', () => {
  // The gallery masses rise 2-14 m above the roof garden while every one of their
  // colliders reports the garden's own ROOF height, so the city's "a car on a
  // rooftop ignores colliders" rule let a player drive off the garden straight
  // into a mass's empty shell. main.js must switch that rule off inside
  // MUSEUM_ROOF, for both cars, or the building is not solid up there.
  assert.match(src, /const onMuseumRoof = worldState === 'city' &&/,
    'main.js no longer detects the museum roof plaza');
  assert.match(src, /buildingTopAt\(car\.position\.x, car\.position\.z\) > 0 && car\.position\.y > 0\.5 && !onMuseumRoof/,
    'a car on the museum roof still ignores the masses it can drive into');
  assert.match(src, /!\(worldState === 'city' &&\s*nextX > MUSEUM_ROOF\.x0 && nextX < MUSEUM_ROOF\.x1 &&\s*nextZ > MUSEUM_ROOF\.z0 && nextZ < MUSEUM_ROOF\.z1\)\)/,
    'the twin still drives through the museum masses on the roof');
  // The garden's own floor is `top`-capped at the roof, or the car would be
  // walled in by the very slab it stands on.
  assert.match(outerSrc, /colliders\.push\(\{ x: cx, z: 176, halfW: 20, halfD: 10, h: ROOF, top: ROOF \}\)/,
    'the rear block under the garden is no longer capped at roof height');
});

test('the museum roof rectangle covers the massing, not the flight', () => {
  // The garden and the doors are inside the plaza, so driving at them keeps the
  // walls on...
  for (const z of [MUSEUM_ROOF.z0 + 1, MUSEUM_DOOR.z, MUSEUM_ROOF.z1 - 1]) {
    assert.ok(z > MUSEUM_ROOF.z0 && z < MUSEUM_ROOF.z1,
      `the plaza stops short of the garden at z=${z}`);
  }
  assert.ok(MUSEUM_DOOR.x > MUSEUM_ROOF.x0 && MUSEUM_DOOR.x < MUSEUM_ROOF.x1,
    'the pavilion doors stand outside the roof plaza');
  // ...while the flight and the forecourt are outside it, so the climb keeps the
  // ordinary rooftop rules it was tuned with.
  assert.ok(MUSEUM_STAIR.x0 > MUSEUM_ROOF.x1,
    'the roof plaza reaches down the grand flight');
  assert.ok(MUSEUM_ROOF.x0 < MUSEUM_DOOR.x - 5,
    'the plaza does not reach far enough back over the gallery masses');
});

test('the building masses are solid boxes at ground level', () => {
  // One collider per mass, each a full-height box: the city's museum must not
  // be drivable-through at street level either.
  assert.match(outerSrc, /for \(const m of \[mA, mB, mC, mD\]\) \{\s*colliders\.push\(\{ x: m\.x, z: m\.z, halfW: m\.w \/ 2, halfD: m\.d \/ 2, h: ROOF \}\);/,
    'the museum masses are no longer solid boxes');
});

test('the pavilion glass is solid, so the door bay is the only way in', () => {
  // A car that sidestepped the leaves used to sail through the clear glazing
  // beside them, or through a flank, and into the lantern. Every pane is a wall
  // now; the entrance cut starts on the nose reaching the door plane, so the
  // car never needs to pass through the bay.
  assert.match(outerSrc, /const pvSolid = \(lx, lz, w, d\) => colliders\.push\(\{/,
    'the pavilion no longer contributes colliders');
  assert.match(outerSrc, /const DOOR_HALF = 3\.7;/,
    'the door bay width changed; check the trigger still covers it');
  assert.match(outerSrc, /pvSolid\(frontFace - GLASS_T \/ 2/,
    'the glazing either side of the doors is open again');
  assert.match(outerSrc, /pvSolid\(0, sgn \* \(sideFace - GLASS_T \/ 2\), PW, GLASS_T\)/,
    'a pavilion flank is open again');
  assert.match(outerSrc, /pvSolid\(backFace - GLASS_T \/ 2, 0, GLASS_T, PD\)/,
    'the back of the pavilion is open again');
  // The bay has to sit INSIDE the bump trigger, or a car nosing a leaf could
  // reach the solid jamb before the cut starts.
  const bay = 3.7;
  assert.ok(MUSEUM_DOOR.z - bay > MUSEUM_DOOR.trigger.z0 &&
    MUSEUM_DOOR.z + bay < MUSEUM_DOOR.trigger.z1,
    'the door bay pokes outside the entrance trigger');
  // ...and the trigger has to start before the glass, or the car would be
  // stopped by the pane before the cut could take the wheel.
  assert.ok(MUSEUM_DOOR.x - 0.2 > MUSEUM_DOOR.trigger.x0,
    'the trigger begins past the door plane, behind the glass');
});

test('either player can drive through the museum doors', () => {
  // Player 2 could not enter the museum: the roof trigger only looked at P1's
  // car and both cut scenes drove P1. The trigger and the cuts now carry a
  // rider, and the twin's physics stands down while a cut owns the frame.
  assert.match(src, /function startMuseumCine\(rider = 0\)/,
    'the entrance cut does not take a rider');
  assert.match(src, /function startMuseumOutCine\(rider = 0\)/,
    'the exit cut does not take a rider');
  assert.match(src, /startMuseumCine\(p1OnRoof \? 0 : 1\)/,
    'the roof trigger never starts the cut for Player 2');
  assert.match(src, /startMuseumOutCine\(1\)/,
    'Player 2 cannot start the drive-out shot');
  assert.match(src, /museumCine\.rider = rider === 1 && car2 \? 1 : 0;/,
    'the entrance cut never records who is driving');
  assert.match(src, /const rc = museumRiderCar\(museumCine\.rider\);/,
    'the entrance cut still drives P1\'s car whatever the rider');
  assert.match(src, /const riderIsP2 = museumCine\.rider === 1 && !!car2;/,
    'the swap still only moves P1 into the museum');
  assert.match(src, /if \(museumCine\.active \|\| museumOutCine\.active\) \{/,
    'the twin is not frozen while a museum cut owns the frame');
});
