// Source-wiring test for the city → beach scallop cut. main.js is not importable
// in a headless test (it touches the DOM at import time), so this checks the
// parts that are easy to lose in a refactor: the near trigger, the frozen live
// camera, the scripted drive onto the bowl and the shrink/fade ordering.
//
// Run: node --test src/shellPortal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSrc = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

test('the park shell triggers on real proximity', () => {
  assert.match(mainSrc, /const SHELL_NEAR_R = 3\.2;/, 'the near radius is gone');
  assert.match(mainSrc, /shellNear[\s\S]{0,180}clamShell\.x/,
    'the near trigger no longer reads the shell position');
  assert.match(mainSrc, /clamInsideShell\(car\.position\.x, car\.position\.z\) \|\| shellNear/,
    'the fan trigger and the near radius are no longer combined');
});

test('the shell cut freezes the live camera instead of cutting away', () => {
  assert.match(mainSrc, /shellPortal\.cine = !riderIsP2;/,
    'the shell no longer takes the camera');
  assert.match(mainSrc, /shellPortal\.camPos\.copy\(camera\.position\)[\s\S]{0,80}shellPortal\.camQuat\.copy\(camera\.quaternion\)/,
    'the trigger does not snapshot the live camera');
  assert.match(mainSrc, /shellPortal\.cine[\s\S]{0,120}camera\.position\.copy\(shellPortal\.camPos\)/,
    'updateCamera does not hold the frozen shell shot');
});

test('the car is scripted onto the shell itself, shrinking as it goes', () => {
  assert.match(mainSrc, /shellPortal\.targetX = clamShell\.x;/,
    'the drive target is no longer the shell centre');
  assert.match(mainSrc, /shellPortal\.targetZ = clamShell\.z;/);
  assert.match(mainSrc, /const shrink = 1 - e \* \(1 - PORTAL_CAR_SHRINK\);/,
    'the script no longer shrinks the car as it drives in');
  assert.match(mainSrc, /const e = u \* u \* \(3 - 2 \* u\);/,
    'the drive-in is no longer smoothed');
  assert.match(mainSrc, /clamShell\.shut && u >= 1 && shellPortal\.fadeTimer < 0/,
    'the fade no longer waits for both the drive and the valves');
});
