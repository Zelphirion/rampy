// A portal must hand BOTH cars back at full height.
//
// The pancake state (boulder / monster truck / steamroller / steam press squash)
// belongs to the world you were just in, so no transition may carry it across.
// That guarantee used to live in each enter*World helper individually, and the
// ones that skipped it left the split-screen twin stuck flat on the far side of
// the portal: P2's state is only cleared by placePlayerTwoNearP1, which several
// exit paths never call.
//
// So the invariant is enforced structurally now — every `worldState` write goes
// through setWorldState, and setWorldState restores both cars — and these tests
// hold that shape in place. main.js cannot be imported (browser entrypoint with
// top-level await), so the functions are pulled out by name and read, the same
// way houseExitWatch.test.mjs does it.
//
// Run: node --test src/portalFlatMode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

// Pull a top-level function out of main.js by name, brace-matched, so a comment
// edit in an unrelated function cannot shift the window and silently change
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

test('no world is entered by assigning worldState directly', () => {
  // The only two legal `worldState = ` lines are the declaration itself and the
  // one inside setWorldState. Anything else is a portal that skips the restore.
  const rawWrites = src.split('\n').filter((line) =>
    /worldState\s*=\s*'/.test(line) && !/^\s*let\s/.test(line));
  assert.deepEqual(rawWrites, [],
    'these lines change world without restoring both cars — call setWorldState instead');
  assert.ok(/function setWorldState\(next\)/.test(src),
    'setWorldState is the single entry point for world changes');
});

test('setWorldState restores BOTH cars out of flat mode', () => {
  const body = grab('setWorldState');
  assert.match(body, /worldState = next;/);
  assert.match(body, /flatCarState = createFlatCarState\(false\)/,
    'P1 keeps its pancake through a portal');
  assert.match(body, /flatCar2State = createFlatCarState\(false\)/,
    'P2 keeps its pancake through a portal');
  assert.match(body, /car2\.scale\.setScalar\(1\)/,
    'the state reset alone would leave the twin visibly squashed until the next frame');
  // Re-entering the same world must not fire the restore mid-visit (a ride can
  // reassign worldState to the world it is already in).
  assert.match(body, /if \(worldState === next\) return;/);
});

test('the twin placement itself also clears the pancake', () => {
  // placePlayerTwoNearP1 is the one P2 restore every transition shares; a caller
  // that brings the twin along gets the flat reset whether it means to or not.
  assert.match(grab('placePlayerTwoNearP1'),
    /flatCar2State = createFlatCarState\(false\)/);
});

test('the mine-shaft exit lands the twin beside P1, full height', () => {
  // underground -> city was the one world change that moved P1 alone: P2 was
  // reparented into the city scene at its old cavern coordinates and kept its
  // flat state.
  const body = grab('finishMineAscent');
  assert.match(body, /placePlayerTwoNearP1\(\)/);
  assert.ok(body.indexOf('placePlayerTwoNearP1()') > body.indexOf('car.position.set('),
    'the twin must be placed from the landing pose, not the shaft pose');
});

test('a menu level jump brings the twin along too', () => {
  // travelToLevel's house / beach / space branches move P1 by hand and never
  // touched P2 at all; the tail call covers every branch (it is idempotent
  // where the enter*World helper already ran).
  const body = grab('travelToLevel');
  assert.match(body, /placePlayerTwoNearP1\(\)/);
  // The early-return path ("already in that level") exits the picker without
  // moving anything, so compare against the LAST exitSelectMode — the tail call
  // has to be before the one that hands control back.
  assert.ok(body.indexOf('placePlayerTwoNearP1()') < body.lastIndexOf('exitSelectMode'),
    'the twin must be placed before control comes back');
});

test('boarding the rocket drops the pancake before the lift', () => {
  // The arm lifts whoever rode in: a flat car would ride the whole flight as a
  // pancake and only be restored by the arrival.
  const body = grab('startRocketRide');
  assert.match(body, /flatCarState = createFlatCarState\(false\)/);
  assert.match(body, /flatCar2State = createFlatCarState\(false\)/);
});
