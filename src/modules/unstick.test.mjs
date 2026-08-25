import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rectPushOut,
  circlePushOut,
  resolveStuck,
  wallNormal,
} from './unstick.js';

const R = 2.2;   // player car radius used throughout

test('rectPushOut separates along the least-penetrated axis', () => {
  // Building south face at z=13; car centre 0.5 inside the body band ->
  // escape along -z by the 1.7 units of overlap.
  const p = rectPushOut(0, 12.5, 0, 27, 14, 14, R);
  assert.ok(p);
  assert.equal(p.dx, 0);
  assert.ok(Math.abs(p.dz + (R - 0.5)) < 1e-9);
  // North side escapes the other way.
  const q = rectPushOut(0, 41.5, 0, 27, 14, 14, R);
  assert.ok(q && Math.abs(q.dz - (R - 0.5)) < 1e-9);
});

test('rectPushOut returns null when clear of the rect', () => {
  assert.equal(rectPushOut(0, 10, 0, 27, 14, 14, R), null);   // 3 > 2.2 gap
  assert.equal(rectPushOut(100, 100, 0, 27, 14, 14, R), null);
});

test('rectPushOut handles a centre exactly inside the footprint', () => {
  const p = rectPushOut(56, 27, 56, 27, 14, 14, R);
  assert.ok(p);
  // Dead centre: escapes along the smaller half-extent axis (tie -> z here).
  assert.equal(Math.abs(p.dx), 0);
  assert.ok(Math.abs(Math.abs(p.dz) - (14 + R)) < 1e-9);
});

test('circlePushOut pushes radially apart', () => {
  const p = circlePushOut(3, 0, 0, 0, 4);
  assert.ok(p);
  assert.ok(Math.abs(p.dx - 1) < 1e-9);   // needs 1 more unit along +x
  assert.equal(circlePushOut(10, 0, 0, 0, 4), null);
  // Dead-centre overlap still resolves instead of dividing by zero.
  const q = circlePushOut(0, 0, 0, 0, 4);
  assert.ok(q && Math.hypot(q.dx, q.dz) >= 4 - 1e-6);
});

test('resolveStuck frees a point wedged between two buildings', () => {
  const solids = [
    { kind: 'rect', x: 0, z: 0, hw: 6, hd: 6 },
    { kind: 'rect', x: 16, z: 0, hw: 6, hd: 6 },   // gap faces at x=6 and x=10
  ];
  // Dropped dead centre of the slot, overlapping both walls.
  const fix = resolveStuck(8, 0, solids, R);
  assert.equal(fix.moved, true);
  for (const s of solids) {
    const p = rectPushOut(fix.x, fix.z, s.x, s.z, s.hw, s.hd, R);
    assert.equal(p, null);   // clear of everything afterwards
  }
  // Normal is a unit "away from the wall" direction.
  assert.ok(Math.abs(Math.hypot(fix.nx, fix.nz) - 1) < 1e-6);
});

test('resolveStuck is a no-op when not stuck', () => {
  const fix = resolveStuck(50, 50, [{ kind: 'rect', x: 0, z: 0, hw: 6, hd: 6 }], R);
  assert.equal(fix.moved, false);
  assert.equal(fix.x, 50);
  assert.equal(fix.z, 50);
});

test('resolveStuck clears circles (fire engine / robot)', () => {
  const solids = [{ kind: 'circle', x: 0, z: 0, r: 2.0 + R }];
  const fix = resolveStuck(2, 0, solids, R);
  assert.equal(fix.moved, true);
  assert.ok(Math.hypot(fix.x, fix.z) >= 2.0 + R - 1e-6);
  assert.ok(Math.abs(fix.nx - 1) < 1e-6);
});

test('wallNormal points away from the deepest surface', () => {
  const solids = [
    { kind: 'rect', x: 56, z: 27, hw: 14, hd: 14 },   // south face at z=13
    { kind: 'circle', x: 40, z: 40, r: 4 },
  ];
  // Grazing the building face by 0.7 while far from the circle.
  const n = wallNormal(56, 11.5, solids, R);
  assert.ok(n);
  assert.equal(n.nx, 0);
  assert.ok(Math.abs(n.nz + 1) < 1e-6);   // push back toward -z (away)
  assert.equal(wallNormal(0, 0, solids, R), null);
});
