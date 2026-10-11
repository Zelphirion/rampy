// The crab you drive is the beach's own crab, and it travels claws-first.
//
// It was neither. The drivable crab was a second, hand-built model whose claws
// ran along +X while the swap code quarter-turned it as though it faced +Z — so
// the quarter turn put the claws on +Z, the cars' forward is -X, and the crab
// sidled across the road the whole time it was "driving". It also had its own
// gait (legs scissoring about Y) instead of the windmill the beach crabs use,
// so it did not even look like the animal it was standing in for.
//
// Both halves are pinned here: the build must be makeCrab() wrapped whole (so
// fitSize's own scale and grounding survive the swap), and the rig must be
// driven about X so the legs windmill rather than scissor.
//
// Run: node --test src/playerCrab.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const CARS = fs.readFileSync(path.join(here, 'cars.js'), 'utf8');
const CRITTERS = fs.readFileSync(path.join(here, 'levels', 'beach', 'critters.js'), 'utf8');
const BEACH = fs.readFileSync(path.join(here, 'levels', 'beach', 'index.js'), 'utf8');

// Isolate a function body by its declaration line up to the next top-level one.
function bodyOf(src, header, next = '\nfunction ') {
  const start = src.indexOf(header);
  assert.ok(start > -1, `could not find ${header}`);
  const end = src.indexOf(next, start + header.length);
  return src.slice(start, end > -1 ? end : undefined);
}

const crabKind = MAIN.match(/\{ id: 'crab',[^}]*\}/);
assert.ok(crabKind, 'could not find the crab entry in CAR_KINDS');

const createPlayerCrab = bodyOf(MAIN, 'function createPlayerCrab()');
const scuttle = bodyOf(MAIN, 'function updatePlayerCrabScuttle(');
const makeCrab = bodyOf(CRITTERS, 'export function makeCrab(');

test('the player crab IS the beach crab, not a second model of one', () => {
  assert.match(crabKind[0], /build:\s*\(\)\s*=>\s*createPlayerCrab\(\)/,
    'the crab entry no longer builds through createPlayerCrab()');
  assert.match(createPlayerCrab, /makeCrab\(0,\s*0,\s*\{\s*x:\s*0,\s*z:\s*0\s*\}\)/,
    'createPlayerCrab() does not build from the beach makeCrab()');
  // main.js must reach makeCrab through the beach's own re-export, so the crab
  // you drive and the crabs scuttling around it are one module instance.
  assert.match(BEACH, /export \{ makeCrab \};/,
    'levels/beach/index.js no longer re-exports makeCrab for main.js');
  const beachImport = MAIN.match(/import \{[^}]*\} from '\.\/levels\/beach\/index\.js\?v=\d+';?/);
  assert.ok(beachImport, 'main.js no longer imports the beach barrel');
  assert.match(beachImport[0], /\bmakeCrab\b/, 'main.js does not import makeCrab');
  // The old builder is gone, so nothing can quietly reintroduce it.
  assert.ok(!/export function createCrab\b/.test(CARS),
    'cars.js still exports its own createCrab()');
  assert.ok(!/createCrab/.test(MAIN), 'main.js still references createCrab');
});

test('the crab is built facing +Z, which is what makes faceZ point it forward', () => {
  // This is the whole sideways bug. swapPlayerCar quarter-turns a faceZ model
  // by -PI/2, which maps the model's +Z onto -X — the cars' forward axis. A
  // model that actually faces +X therefore ends up facing the cars' LEFT, and
  // sidles. The claws and the eyes have to sit on +Z.
  assert.match(crabKind[0], /faceZ:\s*true/, 'the crab is no longer marked faceZ');
  // Claws: `arm.position.set(sx * 0.9, 0.28, 0.24)` — forward is +Z, the sides
  // are +/-X.
  const claw = makeCrab.match(/arm\.position\.set\(([^)]+)\)/);
  assert.ok(claw, 'makeCrab() no longer positions its claw arms');
  const [ax, , az] = claw[1].split(',').map((s) => s.trim());
  assert.match(ax, /sx/,
    'the claws are not offset across the sides the legs use, so +Z is not unambiguously forward');
  assert.ok(Number(az) > 0,
    `the claws sit at z = ${az}, not ahead of the body, so faceZ turns them sideways`);
  // Legs sit on +/-X, so X is the width axis and +Z is unambiguously forward.
  const leg = makeCrab.match(/leg\.position\.set\(([^)]+)\)/);
  assert.ok(leg, 'makeCrab() no longer positions its legs');
  assert.match(leg[1], /sx \* 0\.4/,
    'the legs are no longer splayed across +/-X, so +Z is no longer the forward axis');
});

test('the gait is a windmill about X, not a scissor about Y', () => {
  assert.match(scuttle, /legs\[i\]\.rotation\.x\s*=/,
    'the scuttle no longer drives the legs about X');
  assert.ok(!/rotation\.y\s*=/.test(scuttle),
    'the scuttle still turns the legs about Y, which is the sideways scissor');
  // A wave, not a kick: each leg lags the one in front.
  assert.match(scuttle, /Math\.sin\(scuttle \+ i \* 1\.7\)/,
    'the legs are no longer driven as a travelling wave');
  // The claws are whole arms on this model — no jaws to pinch.
  assert.match(scuttle, /claws\[i\]\.rotation\.x\s*=/,
    'the claws are not driven about X');
  assert.ok(!/\.jaws/.test(scuttle), 'the scuttle still refers to pincer jaws this model does not have');
});

test('the whole fitted model goes into the wrapper, scale and all', () => {
  // makeCrab() runs fitSize(), which writes the group's own scale and lifts it
  // so it stands on y = 0. The swap code strips children out of whatever the
  // builder returns, so handing it the beach crab's group directly would drop
  // both and leave an unscaled crab floating.
  assert.match(createPlayerCrab, /wrap\.add\(c\.group\)/,
    'createPlayerCrab() moves the beach crab\'s children instead of nesting the group');
  assert.match(createPlayerCrab, /wrap\.userData\.crabLegs\s*=\s*c\.legs/,
    'the eight leg pivots are not published on the wrapper');
  assert.match(createPlayerCrab, /wrap\.userData\.crabClaws\s*=\s*c\.claws/,
    'the claw arms are not published on the wrapper');
  assert.match(createPlayerCrab, /wrap\.userData\.wheels\s*=\s*\[\]/,
    'the crab is being handed to the wheel animator with wheels it does not have');
});

test('the showroom crab walks instead of just turning on the stage', () => {
  assert.match(MAIN, /selectWalkRig\s*=/,
    'refreshSelectCar() never captures a walk rig for the stage');
  const update = bodyOf(MAIN, 'function updateSelectCar()');
  assert.match(update, /if \(selectWalkRig\)/,
    'updateSelectCar() does not drive the walk rig');
  assert.match(update, /r\.legs\.forEach/,
    'the stage rig does not stride its legs');
  // And it has to be dropped when the stage is emptied, or the old crab keeps
  // strutting behind a level list.
  assert.match(bodyOf(MAIN, 'function clearSelectPreview()'), /selectWalkRig\s*=\s*null/,
    'clearSelectPreview() leaves the walk rig live');
});
