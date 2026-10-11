import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimForCode,
  claimableCodes,
  makeClaimState,
  tryClaim,
  cancelClaims,
  claimStatePlayers,
  MAX_PLAYERS,
  NO_PAD,
} from './claim.js';

test('claimForCode maps each unambiguous driving key to exactly one half', () => {
  assert.deepEqual(claimForCode('KeyW'), { device: 'kb-wasd', code: 'KeyW' });
  assert.deepEqual(claimForCode('KeyA'), { device: 'kb-wasd', code: 'KeyA' });
  assert.deepEqual(claimForCode('KeyS'), { device: 'kb-wasd', code: 'KeyS' });
  assert.deepEqual(claimForCode('KeyD'), { device: 'kb-wasd', code: 'KeyD' });
  assert.deepEqual(claimForCode('ArrowUp'), { device: 'kb-arrows', code: 'ArrowUp' });
  assert.deepEqual(claimForCode('ArrowDown'), { device: 'kb-arrows', code: 'ArrowDown' });
  assert.deepEqual(claimForCode('ArrowLeft'), { device: 'kb-arrows', code: 'ArrowLeft' });
  assert.deepEqual(claimForCode('ArrowRight'), { device: 'kb-arrows', code: 'ArrowRight' });
});

test('the shift boost keys are never claimable (they sit in both halves)', () => {
  assert.equal(claimForCode('ShiftLeft'), null);
  assert.equal(claimForCode('ShiftRight'), null);
  assert.ok(!claimableCodes('kb-wasd').includes('ShiftLeft'));
  assert.ok(!claimableCodes('kb-arrows').includes('ShiftRight'));
});

test('keys outside the two halves and empty codes claim nothing', () => {
  assert.equal(claimForCode('KeyH'), null);     // horn — global, not driving
  assert.equal(claimForCode('Space'), null);
  assert.equal(claimForCode(''), null);
  assert.equal(claimForCode(null), null);
  assert.equal(claimForCode(undefined), null);
});

test('input #1 claims player 0, input #2 claims player 1 (order)', () => {
  let s = makeClaimState();
  let r = tryClaim(s, { code: 'KeyW' });
  assert.equal(r.ok, true);
  assert.equal(r.player, 0);
  assert.deepEqual(r.claim, { device: 'kb-wasd', code: 'KeyW' });

  r = tryClaim(r.state, { code: 'ArrowUp' });
  assert.equal(r.ok, true);
  assert.equal(r.player, 1);
  assert.deepEqual(r.claim, { device: 'kb-arrows', code: 'ArrowUp' });
});

test('a pad claim uses the pad index and keeps its own slot', () => {
  let s = makeClaimState();
  s = tryClaim(s, { padIndex: 0 }).state;          // P1 takes pad 0
  const r = tryClaim(s, { padIndex: 1 });          // P2 takes pad 1
  assert.equal(r.ok, true);
  assert.deepEqual(r.claim, { device: 'pad:1', padIndex: 1 });
  assert.equal(r.player, 1);
});

test('duplicate keyboard half is rejected with reason duplicate', () => {
  let s = makeClaimState();
  s = tryClaim(s, { code: 'KeyW' }).state;                 // WASD taken
  const r = tryClaim(s, { code: 'KeyD' });                 // P2 presses D — same half
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'duplicate');
  assert.equal(r.device, 'kb-wasd');
  assert.equal(r.state.claims.length, 1, 'the failed claim must not be added');
});

test('duplicate pad index is rejected', () => {
  let s = makeClaimState();
  s = tryClaim(s, { padIndex: 0 }).state;                  // pad 0 taken
  const r = tryClaim(s, { padIndex: 0 });                  // pad 0 again
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'duplicate');
  assert.equal(r.device, 'pad:0');
});

test('after both players claim, further inputs are rejected as full', () => {
  let s = makeClaimState();
  s = tryClaim(s, { code: 'KeyW' }).state;
  s = tryClaim(s, { code: 'ArrowUp' }).state;
  const r = tryClaim(s, { code: 'KeyA' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'full');
});

test('ignored inputs never mutate the state', () => {
  const s = makeClaimState();
  const r = tryClaim(s, { code: 'KeyB' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ignored');
  assert.equal(s.claims.length, 0);
});

test('cancelClaims returns a fresh empty state (Esc / pad B)', () => {
  let s = makeClaimState();
  s = tryClaim(s, { code: 'KeyW' }).state;
  const fresh = cancelClaims();
  assert.notEqual(fresh, s);
  assert.equal(fresh.claims.length, 0);
});

test('claimStatePlayers maps each claimed input onto a concrete device', () => {
  let s = makeClaimState();
  // P1 claims WASD, P2 claims a second pad. The keyboard player must not fold
  // in any pad (NO_PAD), or a shared pad 0 would drive both cars at once.
  s = tryClaim(s, { code: 'KeyW' }).state;
  s = tryClaim(s, { padIndex: 1 }).state;
  assert.deepEqual(claimStatePlayers(s), [
    { device: 'kb-wasd', padIndex: NO_PAD },
    { device: 'kb-arrows', padIndex: 1 },
  ]);
  // All-pad: P1 pad 0, P2 pad 1 keeps both controllers distinct.
  let p = makeClaimState();
  p = tryClaim(p, { padIndex: 0 }).state;
  p = tryClaim(p, { padIndex: 1 }).state;
  assert.deepEqual(claimStatePlayers(p), [
    { device: 'kb-wasd', padIndex: 0 },
    { device: 'kb-arrows', padIndex: 1 },
  ]);
  // Keyboard + keyboard: WASD + arrows, neither folds in a pad.
  let k = makeClaimState();
  k = tryClaim(k, { code: 'KeyW' }).state;
  k = tryClaim(k, { code: 'ArrowLeft' }).state;
  assert.deepEqual(claimStatePlayers(k), [
    { device: 'kb-wasd', padIndex: NO_PAD },
    { device: 'kb-arrows', padIndex: NO_PAD },
  ]);
});

test('MAX_PLAYERS is 2', () => {
  assert.equal(MAX_PLAYERS, 2);
});