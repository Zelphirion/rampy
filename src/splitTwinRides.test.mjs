// Split-screen's Player 2 is a condensed twin of Player 1's step, so every
// per-world ride rule has to be added to it twice — and three of them had not
// been. The twin's museum run never sampled the ramp (so it stayed flat on the
// slope), its chase camera clamped its look target at y=0.8 (so it could not
// follow the car down onto the exhibit floor), and the legged rides (the giant
// robot above all) neither quarter-turned nor animated, so Player 2's mech drove
// sideways with frozen legs from a camera parked inside its shin.
//
// These are engine-side, so — like museumEnclosure.test.mjs — they are source
// checks against the lifted function bodies rather than a headless drive.
//
// Run: node --test src/splitTwinRides.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

function grab(name) {
  const at = src.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `${name} is missing from main.js`);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const stepTwo = grab('stepTwoPlayer');
const followTwo = grab('followCameraTwo');
const dressTwo = grab('applyPlayerTwoCar');
const gait = grab('updateTwoRideGait');

test('the twin rides the museum ramp, not just its floor', () => {
  const museum = stepTwo.slice(stepTwo.indexOf("} else if (worldState === 'museum') {"), stepTwo.indexOf("} else if (worldState === 'cornfield') {"));
  assert.ok(museum.length > 0, 'the twin has no museum branch any more');
  // The ramp is a roof as well as a road: without the twin's own height a car
  // under the overhang is yanked up onto the slope.
  assert.match(museum, /museumWorld\.surfaceAt\(carTwo\.position\.x, carTwo\.position\.z, carTwo\.position\.y\)/,
    'the twin asks the museum for the surface without its own height, so it cannot drive under the ramp');
  assert.match(museum, /pitchSurface2 = \(x, z\) => museumWorld\.surfaceAt\(x, z, carTwo\.position\.y\)/,
    'the twin never samples the museum ramp, so Player 2 stays flat on the slope');
});

test('the twin rides the house heightfield and its bathroom slopes', () => {
  const house = stepTwo.slice(stepTwo.indexOf("} else if (worldState === 'house') {"), stepTwo.indexOf("} else if (worldState === 'museum') {"));
  assert.match(house, /houseSurfaceY\(surfs2/, 'the twin is still pinned to a flat house floor');
  assert.match(house, /pitchSurface2/, 'the twin never tips on the bath dish / boogie board');
});

test('the twin falls the museum ledge instead of teleporting down it', () => {
  assert.match(stepTwo, /carTwo\.position\.y - groundY2 > \(worldState === 'museum' \? MUSEUM_LEDGE_DROP : 1\.0\)[\s\S]{0,200}?inAir = true/,
    'the twin snaps to the exhibit floor in one frame when it drives off the atrium lip');
});

test('the twin camera follows below the y=0 datum', () => {
  assert.match(followTwo, /\(worldState === 'underground' \|\| worldState === 'beach' \|\| worldState === 'museum'\)\s*\n?\s*&& pcar\.position\.y < 0\.8\)\s*\n?\s*\? pcar\.position\.y\s*\n?\s*: Math\.max\(0\.8, pcar\.position\.y\)/,
    'the twin camera clamps its target at 0.8, so it never follows the car down onto the exhibit floor (or into a skate bowl)');
});

test('the twin camera is kept inside the museum shell', () => {
  assert.match(followTwo, /MUSEUM_HALL\.ceil - 4/, 'the twin camera is not held under the museum ceiling');
  assert.match(followTwo, /EXHIBIT\.floorY \+ 0\.6/, 'the twin camera is not held off the exhibit floor');
});

test('the giant robot is held back and aimed at its chest in the twin view', () => {
  assert.match(followTwo, /p\.kind === 'robot'\) camRadius2 = 18/, 'the twin camera still sits inside the 14-tall mech');
  assert.match(followTwo, /targetLift/, 'the twin camera does not aim up at the mech\'s chest');
});

test('the twin quarter-turns the robot onto the cars\' forward axis', () => {
  assert.match(dressTwo, /if \(isRobot \|\| entry\.faceZ\) inner\.rotation\.y = -Math\.PI \/ 2/,
    'Player 2\'s mech drives sideways (its model faces +Z, the cars face -X)');
});

test('the twin climbs the museum staircase into the museum', () => {
  // The grand flight outside the museum is climbed through the ordinary rooftop
  // path (the treads are soft colliders). Without this branch Player 2's ride —
  // the giant robot above all — stops dead at the first riser and never reaches
  // the museum doors.
  assert.match(stepTwo, /const roof2 = buildingTopAt\(carTwo\.position\.x, carTwo\.position\.z\)/,
    'the twin never reads building tops, so it cannot climb the museum stairs');
  assert.match(stepTwo, /onMuseumStair2 = worldState === 'city' && museumStairAt\(carTwo\.position\.x, carTwo\.position\.z\) >= 0/,
    'the twin never recognises the museum flight');
  assert.match(stepTwo, /onMuseumStair2 && !j2\.inAir/,
    'the twin never pitches its body to the staircase treads');
  assert.match(stepTwo, /\(worldState === 'museum' \|\| worldState === 'house' \|\| worldState === 'city'\)/,
    'the twin snaps down instead of falling off the museum roof edge');
});

test('the twin animates the legged rides instead of spinning phantom wheels', () => {
  assert.match(stepTwo, /p\.kind === 'robot' \|\| p\.kind === 'tarantula' \|\| p\.kind === 'crab'/,
    'the twin never reaches the walk cycle, so the robot/tarantula/crab slide with frozen legs');
  assert.match(stepTwo, /updateTwoRideGait\(p, dt\)/, 'the twin\'s gait updater is never called');
  assert.match(gait, /legL\.rotation\.x = swing/, 'the robot rig is not swung');
  assert.match(gait, /crabLegs\[i\]\.rotation\.x/, 'the crab rig is not scuttled');
});
