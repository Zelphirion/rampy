// The input-scheme resolver behind the player record, driven headless.
//
// The old single-player loop read keys[&nbsp;] and pad. state inline in
// main.js; readInput() owns that merge now, keyed by a device scheme, so two
// players on one keyboard (P1 WASD, P2 arrows) or a pad never collide. The
// tests below pin the merge so single-player behaviour is provably unchanged.
//
// Run: node --test src/modules/player.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_SCHEMES, makeInput, makePlayer, readInput } from './player.js';

const keys = (o = {}) => o;                       // the live keys{} map
const pad = (o = {}) => ({                         // the flattened pad state
  throttle: 0, reverse: 0, boost: false, steer: 0, ...o,
});
const joy = (o = {}) => ({ active: false, x: 0, y: 0, ...o });

const neutral = { forward: 0, reverse: 0, boost: false, wantLeft: false, wantRight: false, joyActive: false, joyX: 0, joyY: 0, steerPad: 0 };

const P1 = makePlayer(0, { device: 'kb-wasd' });
const P2 = makePlayer(1, { device: 'kb-arrows' });

function read(p, k = {}, pd = {}, j = {}) {
  return readInput(p, { keys: keys(k), pad: pad(pd), joy: joy(j) });
}

test('the schemes split one keyboard cleanly: P1 WASD, P2 arrows', () => {
  assert.deepEqual(read(P1, { KeyW: true }), { ...neutral, forward: 1 }, 'P1 W does not go');
  assert.deepEqual(read(P1, { KeyS: true }), { ...neutral, reverse: 1 }, 'P1 S does not reverse');
  assert.deepEqual(read(P1, { KeyA: true }), { ...neutral, wantLeft: true }, 'P1 A does not steer left');
  assert.deepEqual(read(P1, { KeyD: true }), { ...neutral, wantRight: true }, 'P1 D does not steer right');
  assert.deepEqual(read(P1, { ShiftLeft: true }), { ...neutral, boost: true }, 'P1 Shift does not boost');
  assert.deepEqual(read(P2, { ArrowUp: true }), { ...neutral, forward: 1 }, 'P2 up does not go');
  assert.deepEqual(read(P2, { ArrowDown: true }), { ...neutral, reverse: 1 }, 'P2 down does not reverse');
  assert.deepEqual(read(P2, { ArrowLeft: true }), { ...neutral, wantLeft: true }, 'P2 left does not steer');
  assert.deepEqual(read(P2, { ArrowRight: true }), { ...neutral, wantRight: true }, 'P2 right does not steer');
  assert.deepEqual(read(P2, { ShiftRight: true }), { ...neutral, boost: true }, 'P2 right-shift does not boost');
});

test('a scheme only reacts to its own keys (no bleed across players)', () => {
  assert.equal(read(P1, { ArrowUp: true }).forward, 0, 'P1 drives with the arrows');
  assert.equal(read(P1, { ArrowLeft: true }).wantLeft, false, 'P1 steers with the arrows');
  assert.equal(read(P2, { KeyW: true }).forward, 0, 'P2 drives with WASD');
  assert.equal(read(P2, { KeyA: true }).wantLeft, false, 'P2 steers with WASD');
});

test('kb-both is the single-player union (old behaviour), and defaults to it', () => {
  const solo = makePlayer(0);
  assert.equal(solo.device, 'kb-both', 'a bare player is not bound to both halves');
  assert.deepEqual(read(solo, { KeyW: true }), { ...neutral, forward: 1 }, 'W does not work solo');
  assert.deepEqual(read(solo, { ArrowUp: true }), { ...neutral, forward: 1 }, 'Up does not work solo');
  assert.deepEqual(read(solo, { KeyA: true, ArrowLeft: true }),
    { ...neutral, wantLeft: true }, 'A and left steer together solo');
  assert.deepEqual(read(solo, { ShiftLeft: true }), { ...neutral, boost: true }, 'left Shift does not boost solo');
});

test('no input at all is a clean neutral', () => {
  assert.deepEqual(read(P1), neutral, 'idle hands are not driving');
});

test('the pad folds on top of the keyboard (any half-player, same as solo)', () => {
  // Triggers take over from / add to the keys, whichever is bigger.
  assert.deepEqual(read(P1, {}, { throttle: 0.6 }), { ...neutral, forward: 0.6 }, 'RT does not go');
  assert.deepEqual(read(P1, {}, { reverse: 0.5 }), { ...neutral, reverse: 0.5 }, 'LT does not reverse');
  assert.deepEqual(read(P1, { KeyW: true }, { throttle: 0.3 }), { ...neutral, forward: 1 },
    'a keyboard press must beat a weaker trigger');
  assert.deepEqual(read(P1, {}, { throttle: 0.9, boost: true }), { ...neutral, forward: 0.9, boost: true },
    'a pad hold must boost with no Shift');
  assert.deepEqual(read(P1, {}, { steer: -0.8 }), { ...neutral, steerPad: -0.8 },
    'the stick is not passed through as steerPad');
  // Below the trigger dead band the pad is quiet.
  assert.equal(read(P1, {}, { throttle: 0.03 }).forward, 0, 'a <0.05 trigger still drives');
});

test('the touch joystick still wins when engaged, with the old dead band', () => {
  assert.deepEqual(read(P1, {}, {}, { active: true, y: -0.9 }), { ...neutral, joyActive: true, joyY: -0.9, forward: 0.9 }, 'joystick up does not go');
  assert.deepEqual(read(P1, {}, {}, { active: true, y: 0.9 }), { ...neutral, joyActive: true, joyY: 0.9, reverse: 0.9 }, 'joystick down does not reverse');
  assert.deepEqual(read(P1, {}, {}, { active: true, y: 0.05 }), { ...neutral, joyActive: true, joyY: 0.05 },
    'a slack joystick must not drive the car');
  assert.deepEqual(read(P1, { KeyW: true }, {}, { active: true, y: -0.6 }),
    { ...neutral, joyActive: true, joyY: -0.6, forward: 1 },
    'a keyboard press must beat the joystick the way it beat the pad');
  assert.deepEqual(read(P1, {}, {}, { active: true, x: 0.4 }), { ...neutral, joyActive: true, joyX: 0.4 },
    'joystick x is not mirrored into joyX for the steering ease');
});

test('every read is a fresh object, so two players cannot share one input', () => {
  const a = readInput(P1, { keys: keys(), pad: pad(), joy: joy() });
  const b = readInput(P1, { keys: keys(), pad: pad(), joy: joy() });
  assert.notEqual(a, b, 'readInput reused an input object');
  a.forward = 99;
  assert.equal(b.forward, 0, 'mutating one read corrupted another');
});

test('the player record carries the per-player state split-screen will need', () => {
  const p = makePlayer(1, { device: 'kb-arrows', padIndex: 1 });
  assert.equal(p.index, 1);
  assert.equal(p.name, 'P2');
  assert.equal(p.device, 'kb-arrows');
  assert.equal(p.padIndex, 1);
  assert.deepEqual(p.input, makeInput(), 'the record does not start with a clean input');
  assert.equal(p.velocity.value, 0, 'a fresh player is standing still');
  assert.equal(p.steering.value, 0, 'a fresh player is pointing straight');
  assert.equal(p.car, null);
  assert.equal(p.camera, null);
  assert.equal(p.marker, null);
  assert.equal(p.spawn, null);
});

test('the documented keyboard schemes cover the controls the table promises', () => {
  const wasd = INPUT_SCHEMES['kb-wasd'];
  const arrows = INPUT_SCHEMES['kb-arrows'];
  assert.ok(wasd.throttle.includes('KeyW') && wasd.reverse.includes('KeyS') &&
    wasd.left.includes('KeyA') && wasd.right.includes('KeyD'), 'WASD missing from P1');
  assert.ok(arrows.throttle.includes('ArrowUp') && arrows.reverse.includes('ArrowDown') &&
    arrows.left.includes('ArrowLeft') && arrows.right.includes('ArrowRight'), 'arrows missing from P2');
  assert.ok(wasd.boost.includes('ShiftLeft') && arrows.boost.includes('ShiftRight'),
    'the Shift boost is not bound on both halves');
});