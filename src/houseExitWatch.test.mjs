// The house portal plays a HELD SHOT in both directions, and this file runs it.
//
// Coming in from the city, the camera stands out on the driveway and watches the
// car back up into the brown-roofed bay. Coming out of the dark garage, the
// camera stands back INSIDE and watches the car drive out toward the light. Both
// are the same shot with a different fixed camera, and the second one is the one
// that was missing: the exit used to cut to black the instant the nose crossed
// the trigger, so "drive out of the garage" was a teleport.
//
// The interesting bug here is not a number, it is a DIRECTION. The watch is
// started in one place and finished in another, in a per-frame function, and the
// completion used to be hardcoded to "go to the house". A house->city trip that
// still hands you to the house, or one that skips the shot entirely, both pass
// every static reading of this code. So these tests drive it: real fake time, a
// real car, and an assertion on which world you end up in.
//
// Run: node --test src/houseExitWatch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HOUSE, HOUSE_EXIT, HOUSE_START } from './levels/house/layout.js';

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

// three comes from a CDN at runtime, so the test fetches the exact build main.js
// pins and caches it. main.js is a top-level-await browser entrypoint and cannot
// be imported directly, so the functions under test are pulled out by name and
// eval'd against stubs below.
const THREE_URL = (src.match(/from '(https:\/\/[^']*three[^']*)'/) || [])[1];
if (!THREE_URL) throw new Error('cannot find the three.js CDN URL in main.js');
const cacheDir = join(tmpdir(), 'opencode', 'threecache');
const cacheFile = join(cacheDir, 'three.module.js');
if (!existsSync(cacheFile)) {
  mkdirSync(cacheDir, { recursive: true });
  const res = await fetch(THREE_URL);
  if (!res.ok) throw new Error(`could not fetch three.js for the test: HTTP ${res.status}`);
  writeFileSync(cacheFile, await res.text());
}
const THREE = await import(pathToFileURL(cacheFile).href);

// Pull a top-level function out of main.js by name, brace-matched, so a comment
// edit inside an unrelated function cannot shift the window and silently change
// what is under test.
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

// The camera override is not a named function - it is an `if` block buried in the
// middle of the big updateCamera. Slice it out by its opening marker, same
// brace-matching trick.
//
// The marker has to be the inner `if (w.hasCam)`, not the outer
// `if (housePortal.watch.active)`: the outer text also opens the watch block in
// updateHousePortal, which sits earlier in the file, so indexOf would find that
// one and the test would then be evaluating the portal's own per-frame code.
// Anchoring on the inner test finds it exactly once.
const CAMERA_OVERRIDE = 'if (w.hasCam) {';
function grabBlock(marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `the camera override ${marker} is missing from main.js`);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces in the camera override');
}

// A stand-in for the brown-roofed bay's exported trigger, with the fields
// completeHouseSwap and houseFadeSwap actually read.
const CITY_TRIGGER = {
  x0: -16, x1: -8, z0: -50, z1: -44, cx: -12, cz: -47,
  camX: -12, camY: 5, camZ: -40,
  mouthX: -12, mouthZ: -43.25,
  apronX: -12, apronZ: -37,
  exitYaw: Math.PI, yaw: 0,
};

function harness() {
  const car = {
    position: new THREE.Vector3(71, 0, 70),
    rotation: new THREE.Euler(),
    visible: true,
  };
  const housePortal = {
    trigger: CITY_TRIGGER,
    side: null,
    swapping: false,
    watch: {
      active: false, t: 0, hold: 0.6, speed: 5.5,
      cam: new THREE.Vector3(),
      hasCam: false,
      toHouse: true,
    },
  };
  const calls = { resetKnockables: 0, resetHydrantSprays: 0, ashReset: 0, catReset: 0, raf: 0 };

  const state = {
    THREE,
    housePortal,
    car,
    calls,
    playerCarRadius: 3,
    HOUSE,
    HOUSE_EXIT,
    HOUSE_START,
    velocity: { value: 0 },
    steering: { value: 0 },
    jumpState: { inAir: false, yVelocity: 0 },
    groundHeight: 0,
    portalGrace: 0,
    wasOnRamp: null,
    currentRamp: null,
    playerKnock: null,
    scene: { add() {}, remove() {} },
    houseScene: { add() {}, remove() {} },
    houseCat: { reset() { calls.catReset++; } },
    _fadeOverlay: { style: {} },
    // Both of these run their callback straight away: the test is stepping time
    // by hand, so there is no browser to defer to.
    requestAnimationFrame(fn) { calls.raf++; fn(); },
    setTimeout(fn) { fn(); },
    createFlatCarState: () => ({}),
    resetKnockables() { calls.resetKnockables++; },
    resetHydrantSprays() { calls.resetHydrantSprays++; },
    // Leaving the house drops the fire soot — see resetHouseAsh in main.js.
    resetHouseAsh() { calls.ashReset++; },
    // houseFadeSwap clears globalDarkness on every fade, so the eval'd body needs
    // both the flag and the applier or the swap throws before the shot starts.
    globalDarkness: false,
    applyGlobalDarkness() { state.globalDarkness = false; },
  };

  // `worldState` is a module-scope `let` in main.js, so it has to be a `let` in
  // the eval'd body too - a frozen parameter could not be observed changing.
  const body = [
    'let worldState = "city";',
    'const worldStateOf = () => worldState;',
    'const setWorldState = (v) => { worldState = v; };',
    grab('houseGarageInCity'),
    grab('completeHouseSwap'),
    grab('houseFadeSwap'),
    grab('enterHouseWorld'),
    grab('exitHouseWorld'),
    grab('updateHousePortal'),
    'return { enterHouseWorld, exitHouseWorld, updateHousePortal, worldStateOf, setWorldState };',
  ].join('\n\n');

  const api = new Function(...Object.keys(state), body)(...Object.values(state));
  return { ...api, car, housePortal, velocity: state.velocity, calls };
}

// Run the shot to completion, in frames, so the test exercises the per-frame
// accumulation rather than jumping straight to the end.
function playShot(h, step = 1 / 60, maxSeconds = 6) {
  for (let t = 0; t < maxSeconds; t += step) h.updateHousePortal(step);
}

test('leaving the house plays a held shot, not an instant cut', () => {
  const h = harness();
  h.setWorldState('house');
  // The car is in the dark garage, nose at the exit box.
  h.car.position.set(HOUSE_EXIT.x0 + 2, 0, 72);

  h.exitHouseWorld();

  assert.equal(h.housePortal.watch.active, true,
    'leaving the house cut straight to black instead of holding the shot');
  assert.equal(h.housePortal.watch.toHouse, false,
    'the exit shot is tagged as going IN, so the swap lands in the wrong world');
  assert.ok(h.housePortal.watch.hold > 0.2,
    `the exit shot is only ${h.housePortal.watch.hold}s long; that is a cut, not a shot`);
  assert.equal(h.worldStateOf(), 'house', 'the world changed before the shot played');
});

test('the exit shot holds the camera back inside the garage', () => {
  const h = harness();
  h.setWorldState('house');
  h.car.position.set(HOUSE_EXIT.x0 + 2, 0, 72);
  h.exitHouseWorld();

  const c = h.housePortal.watch.cam;
  assert.equal(h.housePortal.watch.hasCam, true, 'the exit shot has no fixed camera');
  // Behind the roll: the camera stands off to the east of the car, and the car
  // drives west, so the last thing on screen is the back of the car and the light
  // it is driving away from.
  assert.ok(c.x > HOUSE_EXIT.x0,
    `the exit camera at x=${c.x} is not inside the garage, so it cannot watch the car leave`);
  assert.equal(c.y, HOUSE_EXIT.camY);
  assert.equal(c.z, HOUSE_EXIT.camZ);
  // And it must NOT be the city bay's camera, which is what this used to use.
  assert.notEqual(c.x, CITY_TRIGGER.camX,
    'the exit shot is using the city bay camera while the car is still in the house');
});

test('the exit shot ends in the city, out on the brown bay apron', () => {
  const h = harness();
  h.setWorldState('house');
  h.car.position.set(HOUSE_EXIT.x0 + 2, 0, 72);
  h.exitHouseWorld();
  playShot(h);

  assert.equal(h.worldStateOf(), 'city',
    'the exit shot finished but left the car in the house');
  assert.equal(h.car.position.x, CITY_TRIGGER.apronX);
  assert.equal(h.car.position.z, CITY_TRIGGER.apronZ);
  assert.equal(h.car.rotation.y, CITY_TRIGGER.exitYaw,
    'the car is not facing back out of the bay');
  assert.equal(h.calls.catReset, 0, 'the house cat was reset on the way OUT');
  // The city keeps per-frame state that would otherwise be left mid-thought.
  assert.equal(h.calls.resetKnockables, 1);
  assert.equal(h.calls.resetHydrantSprays, 1);
  // The car's soot tint lives on materials the city shares, so it has to come off
  // on the way out or a sooted car rolls into the street.
  assert.equal(h.calls.ashReset, 1, 'leaving the house did not drop the fire soot');
});

test('entering the house still plays its shot, and lands in the foyer', () => {
  const h = harness();
  h.setWorldState('city');
  h.car.position.set(CITY_TRIGGER.x0 + 2, 0, CITY_TRIGGER.cz);
  h.enterHouseWorld();

  assert.equal(h.housePortal.watch.active, true, 'entering the house no longer holds a shot');
  assert.equal(h.housePortal.watch.toHouse, true);
  assert.ok(h.housePortal.watch.hold > 0.2);
  assert.equal(h.housePortal.watch.cam.x, CITY_TRIGGER.camX,
    'the entry shot is not using the driveway camera');

  playShot(h);
  assert.equal(h.worldStateOf(), 'house');
  assert.equal(h.car.position.x, HOUSE_START.x);
  assert.equal(h.car.position.z, HOUSE_START.z);
  assert.equal(h.calls.catReset, 1, 'the house cat is not reset on the way in');
});

test('the shot keeps the car rolling rather than stopping it dead', () => {
  const h = harness();
  h.setWorldState('house');
  h.car.position.set(HOUSE_EXIT.x0 + 2, 0, 72);
  h.exitHouseWorld();

  // The shot pins the speed rather than merely raising it, so a cat swat cannot
  // lift the car out of the take, and momentum carried in from the approach
  // cannot make it overshoot the doorway.
  h.updateHousePortal(1 / 60);
  assert.equal(h.velocity.value, h.housePortal.watch.speed);
  assert.equal(h.housePortal.watch.t > 0, true, 'the shot clock is not running');
  assert.equal(h.housePortal.watch.active, true, 'one frame ended the shot');
});

test('a round trip returns the car where it started', () => {
  const h = harness();
  h.setWorldState('city');
  h.car.position.set(CITY_TRIGGER.x0 + 2, 0, CITY_TRIGGER.cz);
  h.enterHouseWorld();
  playShot(h);
  assert.equal(h.worldStateOf(), 'house');

  h.exitHouseWorld();
  playShot(h);
  assert.equal(h.worldStateOf(), 'city');
  assert.equal(h.car.position.x, CITY_TRIGGER.apronX);
  // The swap has to have finished, or the next frames are swallowed.
  assert.ok(h.housePortal.swapping === false, 'the swap never finished');
  // ...and the city must NOT re-catch the car on its first frame back and dump it
  // inside the house again, which is exactly this bug one frame early. The apron
  // is clear of the trigger box, so the 'out' latch releases and the car is free
  // to be driven straight back in.
  for (let i = 0; i < 60; i++) h.updateHousePortal(1 / 60);
  assert.equal(h.worldStateOf(), 'city',
    'the city caught the car on the apron and pulled it back into the house');
  assert.notEqual(h.housePortal.side, 'in',
    'the car is still latched as going IN after a round trip');
  // And the reverse direction really does re-arm it, or "you can drive back in"
  // would be a one-way door.
  h.car.position.set(CITY_TRIGGER.x0 + 2, 0, CITY_TRIGGER.cz);
  h.updateHousePortal(1 / 60);
  assert.equal(h.worldStateOf(), 'city', 'the world changed the instant the trigger was touched');
  playShot(h);
  assert.equal(h.worldStateOf(), 'house', 'driving back into the bay no longer works');
});

test('the camera override follows the SHOT, not the city trigger', () => {
  // The override is a buried `if`, not a named function, so it is exercised on
  // its own here: fed a shot that is playing the house camera, it must put the
  // camera there. If this went back to reading housePortal.trigger, the exit
  // shot would fly the camera to the city bay while the car sat in the house -
  // and no amount of testing the portal would notice.
  const car = { position: new THREE.Vector3(HOUSE_EXIT.x0, 0, 72) };
  const st = {
    THREE,
    car,
    delta: 1 / 60,
    cameraTarget: new THREE.Vector3(),
    desiredOffset: new THREE.Vector3(),
    _lookTarget: new THREE.Vector3(),
    _camHousePos: new THREE.Vector3(),
    _camHouseLook: new THREE.Vector3(),
    _camHouseAim: new THREE.Vector3(),
    _camDbg: {},
    housePortal: {
      trigger: CITY_TRIGGER,
      watch: {
        active: true,
        cam: new THREE.Vector3(HOUSE_EXIT.camX, HOUSE_EXIT.camY, HOUSE_EXIT.camZ),
        hasCam: true,
      },
    },
    worldState: 'house',
    minePortal: { active: false },
  };
  // `w` is declared by the OUTER if in main.js, so the extracted inner block does
  // not have it. It is prepended here rather than widening the marker, because
  // widening the marker back to `if (housePortal.watch.active) {` drags in the
  // mine-dive branch after it and the test would then depend on that too.
  const body = `const w = housePortal.watch;\n${grabBlock(CAMERA_OVERRIDE)}`;
  new Function(...Object.keys(st), body)(...Object.values(st));

  assert.equal(st._camDbg.overrideRan, true, 'the watch shot did not claim the camera');
  // desiredOffset is camera-minus-target, so its x is the camera's x when the
  // car is the target. The car is at x=-88 and the camera at x=-54.
  assert.ok(Math.abs(st.desiredOffset.x - (HOUSE_EXIT.camX - car.position.x)) < 1e-6,
    `the override put the camera at x=${st.desiredOffset.x + car.position.x}, ` +
    `not the shot's x=${HOUSE_EXIT.camX}`);
  assert.ok(Math.abs(st.desiredOffset.y - HOUSE_EXIT.camY) < 1e-6,
    `the override put the camera at y=${st.desiredOffset.y + car.position.y}, ` +
    `not the shot's y=${HOUSE_EXIT.camY}`);
});
