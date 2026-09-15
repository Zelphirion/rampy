import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentClosestPoints, resolveLogCollision } from './logCollision.js';

// Build a log state: rotY is the yaw of the log's long axis in the XZ plane.
function log(x, z, rotY, vx = 0, vz = 0) {
  return {
    x, z,
    ax: Math.sin(rotY), az: Math.cos(rotY),
    halfLen: 6.5, radius: 2.1,
    vx, vz, rollPower: 24,
  };
}

test('segmentClosestPoints: parallel segments', () => {
  const r = segmentClosestPoints(0, 0, 10, 0, 0, 3, 10, 3);
  assert.equal(r.dist, 3);
  assert.equal(r.pax, 0); assert.equal(r.paz, 0);
  assert.equal(r.pbx, 0); assert.equal(r.pbz, 3);
});

test('segmentClosestPoints: crossing segments', () => {
  const r = segmentClosestPoints(0, 0, 10, 10, 0, 10, 10, 0);
  assert.ok(r.dist < 1e-9);
});

test('segmentClosestPoints: endpoint to segment', () => {
  const r = segmentClosestPoints(0, 0, 1, 0, 5, 2, 5, 4);
  assert.equal(r.dist, Math.hypot(4, 2));
});

test('resolveLogCollision: no overlap returns null', () => {
  const k = log(0, 0, 0, 10, 0);
  const j = log(0, 30, 0);
  assert.equal(resolveLogCollision(k, j), null);
});

test('resolveLogCollision: overlapping collinear logs separate', () => {
  // Same axis, 4 units apart in z (radii sum 4.2 → overlap 0.2).
  const k = log(0, 0, 0, 10, 0);
  const j = log(0, 4, 0);
  const r = resolveLogCollision(k, j);
  assert.ok(r);
  const d = Math.abs(r.kz - r.jz);
  assert.ok(d >= 4.2 - 1e-9, `separated distance ${d}`);
});

test('resolveLogCollision: head-on knocks standing log and bounces k', () => {
  // k rolls along +x toward a standing j; both axes along z.
  const k = log(0, 0, 0, 10, 0);
  const j = log(4, 0, 0);
  const r = resolveLogCollision(k, j);
  assert.ok(r);
  assert.equal(r.knocked, true);
  // j rolls away along +x (perpendicular to its own axis).
  assert.ok(r.jvx > 0, `jvx ${r.jvx}`);
  assert.ok(Math.abs(r.jvz) < 1e-9);
  // k bounces back (negative x velocity).
  assert.ok(r.kvx < 0, `kvx ${r.kvx}`);
  // The pair is separated so the capsules no longer overlap.
  assert.ok(r.jx - r.kx >= 4.2 - 1e-9, `gap ${r.jx - r.kx}`);
});

test('resolveLogCollision: side-on collision knocks sideways', () => {
  // k rolls along +x; j's axis is along x, so j must roll sideways (z).
  const k = log(0, 0, 0, 10, 0);
  const j = log(4, 0, Math.PI / 2);
  const r = resolveLogCollision(k, j);
  assert.ok(r);
  assert.equal(r.knocked, true);
  assert.ok(Math.abs(r.jvx) < 1e-9, `jvx ${r.jvx}`);
  assert.ok(r.jvz > 0, `jvz ${r.jvz}`);
});

test('resolveLogCollision: both rolling bounce apart', () => {
  // k rolls +x, j rolls -x toward each other.
  const k = log(0, 0, 0, 10, 0);
  const j = log(4, 0, 0, -10, 0);
  const r = resolveLogCollision(k, j);
  assert.ok(r);
  assert.equal(r.knocked, false);   // j was already rolling
  assert.ok(r.kvx < 0, `kvx ${r.kvx}`);   // k bounces back
  assert.ok(r.jvx > 0, `jvx ${r.jvx}`);   // j knocked forward
});

test('resolveLogCollision: slow bump barely nudges a standing log', () => {
  const k = log(0, 0, 0, 2, 0);   // slow roll
  const j = log(4, 0, 0);
  const r = resolveLogCollision(k, j);
  assert.ok(r);
  assert.equal(r.knocked, true);
  assert.ok(r.jvx > 0 && r.jvx < 2, `jvx ${r.jvx}`);   // ~1.7, less than k's speed
});