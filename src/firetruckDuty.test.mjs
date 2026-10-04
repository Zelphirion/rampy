// You can now drive the fire engine (it is in the car picker), so the city's
// AI engine has to stand down while you are in the seat.
//
// The failure this guards against is a ghost truck: the AI engine's mesh hidden
// but its behaviour still running, or - worse - its collider left in place. The
// second one is the nasty case, because a parked-but-solid engine walls off the
// station apron and the player cannot even see what is blocking them.
//
// firetruck.js imports three from the CDN, so it cannot be CALLED headless. The
// rule is therefore asserted against the source, the same way
// fireStation.fire.test.mjs pins the station's collider flags.
//
// Every check is `assert.ok(re.test(...))` rather than `assert.match`, because a
// failing match against a 500KB module dumps the whole file into the report.
//
// Run: node --test src/firetruckDuty.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const truckSrc = fs.readFileSync(path.join(here, 'firetruck.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const carsSrc = fs.readFileSync(path.join(here, 'cars.js'), 'utf8');

test('the fire truck is offered as a drivable ride', () => {
  assert.ok(/export function createFiretruck\(/.test(carsSrc),
    'createFiretruck() is not exported from cars.js, so the picker cannot build one');
  const entry = mainSrc.match(/\{ id: 'firetruck'[^\n]*\n[^\n]*\n/);
  assert.ok(entry, 'the fire truck is missing from the car picker');
  assert.ok(/label: 'Fire Truck'/.test(entry[0]), 'the picker entry has no label');
  // It is the same model the AI drives, not a lookalike, so the ladder, the deck
  // gun and the lightbar are all real.
  assert.ok(/build: \(\) => createFiretruck\(\)/.test(entry[0]),
    'the picker builds something other than the engine model');
  // It faces -X like every other car, so it must NOT be quarter-turned.
  assert.ok(!/faceZ/.test(entry[0]),
    'the engine already faces -X; faceZ would turn it sideways to the cars');
});

test('standing the engine down stops its behaviour, not the city fires', () => {
  // The stand-down return has to sit AFTER the flame/smoke loop and BEFORE the
  // road-state machine. Before it and the fires freeze mid-flicker; after it and
  // the engine keeps answering calls while invisible.
  const firesLoop = truckSrc.indexOf('for (const f of fires) {');
  const standDown = truckSrc.indexOf('if (!onDuty) {');
  const roadStates = truckSrc.indexOf('Which road state should the engine be in?');
  assert.ok(firesLoop > -1 && standDown > -1 && roadStates > -1,
    'could not find the fires loop, the stand-down return or the state machine');
  assert.ok(standDown > firesLoop,
    'the stand-down return fires before the flames and smoke are updated');
  assert.ok(standDown < roadStates,
    'the stand-down return fires after the road-state machine, so the engine still drives');
});

test('the parked engine is not a solid, invisible wall', () => {
  // Every place the AI engine used to push the player around has to ask whether
  // it is on duty first.
  assert.ok(/if \(worldState !== 'city'\) return false;(?:\s*\/\/[^\n]*\n)+\s*if \(!firetruck\.duty\(\)\) return false;/.test(mainSrc),
    'isPositionBlockedByFiretruck still blocks the player with a stood-down engine');
  assert.ok(/if \(a\.offDuty \|\| b\.offDuty\) continue;/.test(mainSrc),
    'the car-collision pass still shoves traffic around a hidden engine');
  assert.ok(/if \(firetruck\.duty\(\)\) \{[\s\S]{0,320}?aheadDist\(mx, mz, t\.dir, t\.axis, firetruck\.truck\.position/.test(mainSrc),
    'traffic still brakes for an engine that is parked out of sight');
  assert.ok(/if \(firetruck\.duty\(\)\) \{[\s\S]{0,320}?#ff8800/.test(mainSrc),
    'the minimap still plots a dot for an engine you cannot see');
});

test('the lightbar only burns while the engine is rolling', () => {
  // An engine parked in the street with its beacons going reads as a call it is
  // not answering, so the flash is gated on there being some speed.
  assert.ok(/playerFiretruck[\s\S]{0,600}?moving \? 2\.4 : 0\.05/.test(mainSrc),
    'the player engine beacons do not dim when it stops');
  // And the frame loop needs the lightbar halves the flash reads.
  assert.ok(/car\.userData\.firetruckLights = kind === 'firetruck' \? newMesh\.userData\.warningLights : null;/.test(mainSrc),
    'the swap does not carry the lightbar over to the player mesh');
});

test('handing the seat back resumes from the bay', () => {
  // Not from wherever the AI happened to be: an engine mid-run that stops being
  // driven should be back in its garage, lights off, or it reappears in the
  // middle of the street.
  assert.ok(/standDown: \(off\) => \{[\s\S]*?truck\.position\.set\(home\.x, 0\.15, home\.z\)/.test(truckSrc),
    'standing down does not park the engine in its bay');
  assert.ok(/state\.mode = home \? 'parked' : 'patrol';/.test(truckSrc),
    'coming back on duty does not reset the engine to its starting state');
  // And the beacons are dark for a stood-down engine, by the same rule as a
  // parked one.
  assert.ok(/const stowed = !onDuty \|\| state\.mode === 'parked';/.test(truckSrc),
    'a stood-down engine keeps its beacons lit in the bay');
});