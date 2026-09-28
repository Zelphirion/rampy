// Unit tests for the Pneumatic Express Tube path math. Run:
//   node --test src/modules/expressTube.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPRESS_TUBE,
  SLAB_BOUNDS,
  CEIL_Y,
  expressTubeSamples,
  expressTubePoint,
  expressTubeTangent,
  expressTubeNearest,
  expressTubeLength,
} from './expressTube.js';

const EPS = 1e-9;

test('samples are evenly spaced in arc length, s ∈ [0,1]', () => {
  const S = expressTubeSamples();
  assert.ok(S.length > 100, 'must be finely sampled');
  assert.equal(S[0].s, 0);
  assert.equal(S[S.length - 1].s, 1);
  for (let i = 1; i < S.length; i++) {
    const d = Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y, S[i].z - S[i - 1].z);
    assert.ok(d > 0, `zero-length segment at ${i}`);
    assert.ok(S[i].s > S[i - 1].s, 's must be monotonic');
  }
});

test('both mouths sit on the floor (bidirectional boarding pads)', () => {
  const p0 = expressTubePoint(0);
  const p1 = expressTubePoint(1);
  assert.ok(Math.abs(p0.y) < 0.5, 'intake must be at floor level');
  assert.ok(Math.abs(p1.y) < 0.5, 'exit must be at floor level so a return ride can board it');
  assert.ok(Math.abs(p0.x - 12) < 1 && Math.abs(p0.z - 113) < 1,
    `intake must sit at world (12,113) (got (${p0.x.toFixed(1)},${p0.z.toFixed(1)}))`);
  assert.ok(Math.abs(p1.x - (-53)) < 4, `exit must land near x=-53 (got x=${p1.x.toFixed(1)})`);
  assert.ok(Math.abs(p1.z - (-28)) < 4, `exit must land near z=-28 (got z=${p1.z.toFixed(1)})`);
  // The exit faces the empty SW corner: tangent points west and south.
  const t = expressTubeTangent(1);
  assert.ok(t.tx < -0.5 && t.tz < -0.05, `exit must face the corner SW (got tx=${t.tx.toFixed(2)}, tz=${t.tz.toFixed(2)})`);
});

test('the whole tube stays inside the cavern slab', () => {
  for (const p of expressTubeSamples()) {
    assert.ok(p.x >= SLAB_BOUNDS.minX && p.x <= SLAB_BOUNDS.maxX, `x=${p.x.toFixed(1)} out of bounds`);
    assert.ok(p.z >= SLAB_BOUNDS.minZ && p.z <= SLAB_BOUNDS.maxZ, `z=${p.z.toFixed(1)} out of bounds`);
  }
});

test('the tube never enters the Glass City band (stays under the course tiles)', () => {
  // The route no longer climbs over the Glass City (z ≥ 132); instead it hugs
  // the underside of the checkerboard ceiling over the obstacle course.
  for (const p of expressTubeSamples()) {
    assert.ok(p.z < 132, `tube reaches the Glass City band at s≈${p.s.toFixed(2)} (z=${p.z.toFixed(1)})`);
  }
});

test('the tube clears the ceiling magnet at (55,0) by a wide margin', () => {
  // The giant magnet hangs from the ceiling at (55,0) (holdY 27, reach r=9).
  // The tube must thread around it, not through it.
  let minD = Infinity;
  for (const p of expressTubeSamples()) {
    if (p.y > 5) {   // only the elevated run matters — descending tube is far away
      const d = Math.hypot(p.x - 55, p.z - 0);
      if (d < minD) minD = d;
    }
  }
  assert.ok(minD > 10, `tube passes ${minD.toFixed(1)} from the magnet (need > 10)`);
});

test('everywhere below the ceiling region (z<48) the tube fits under the tiles', () => {
  for (const p of expressTubeSamples()) {
    if (p.z < 48) {
      assert.ok(p.y + EXPRESS_TUBE.R <= CEIL_Y,
        `tube top ${(p.y + EXPRESS_TUBE.R).toFixed(1)} would pass through the ceiling at s≈${p.s.toFixed(2)}`);
    }
  }
});

test('nearest-point query snaps to the intake at (12,113) and never to the boonies', () => {
  const n0 = expressTubeNearest(12, 113);
  assert.ok(n0.horizDist < 0.1, 'intake must be on/near the first samples');
  assert.ok(n0.s < 0.05, 'intake is at the mouth of the tube');
  const far = expressTubeNearest(0, 170);
  assert.ok(far.horizDist > 20, 'a point far from the tube reports a large gap');
});

test('tangent is unit length and consistent with finite-difference of points', () => {
  for (const s of [0, 0.15, 0.4, 0.7, 0.99]) {
    const t = expressTubeTangent(s);
    const l = Math.hypot(t.tx, t.ty, t.tz);
    assert.ok(Math.abs(l - 1) < 1e-6, `tangent not unit at s=${s}`);
    const a = expressTubePoint(Math.max(0, s - 0.001));
    const b = expressTubePoint(Math.min(1, s + 0.001));
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    assert.ok(Math.abs(dx / dl - t.tx) < 0.1, `tangent tx drift at s=${s}`);
    assert.ok(Math.abs(dz / dl - t.tz) < 0.1, `tangent tz drift at s=${s}`);
  }
});

test('length is positive and points at s stay within the sampled polyline', () => {
  assert.ok(expressTubeLength() > 50, 'tube must be a long ride');
  for (let k = 0; k <= 100; k += 7) {
    const p = expressTubePoint(k / 100);
    assert.ok(p.s >= 0 && p.s <= 1);
  }
});

test('the tube never strikes the Holy Mountain or its summit', () => {
  // Holy Mountain centre (-100, 8), base radius 34 (plus the tube radius).
  const MOUNT = { cx: -100, cz: 8, baseR: 34 };
  let minD = Infinity;
  for (const p of expressTubeSamples()) {
    const d = Math.hypot(p.x - MOUNT.cx, p.z - MOUNT.cz);
    if (d < minD) minD = d;
  }
  assert.ok(minD > MOUNT.baseR + EXPRESS_TUBE.R,
    `tube passes ${minD.toFixed(1)} from the mountain (need > ${(MOUNT.baseR + EXPRESS_TUBE.R).toFixed(1)})`);
});

test('both tube mouths are grab windows (bidirectional ride); the mid-tube is not', () => {
  // The tube is a two-way ride: the car can be caught at EITHER mouth and
  // carried to the far end, so grab windows sit at both s≈0 and s≈1. main.js
  // additionally gates grabs by the vertical window and a post-exit cooldown.
  const intake = expressTubeNearest(12, 113);
  const exit = expressTubeNearest(-53, -28);
  assert.ok(intake.s < EXPRESS_TUBE.GRAB_S_MAX, 'intake mouth must be inside the grab window');
  assert.ok(exit.s > 1 - EXPRESS_TUBE.GRAB_S_MAX,
    'exit mouth must be inside the grab window so a return ride can start there');
  // Mid-tube locations must never snap to a mouth: a car half-way along the
  // path (or on the floor beneath it) gets an s that excludes it from both
  // windows, so it can never be sucked in spuriously.
  for (const s of [0.25, 0.5, 0.75]) {
    const p = expressTubePoint(s);
    const n = expressTubeNearest(p.x, p.z);
    assert.ok(n.s > EXPRESS_TUBE.GRAB_S_MAX && n.s < 1 - EXPRESS_TUBE.GRAB_S_MAX,
      `mid-tube at s=${s} must sit outside both grab windows (snapped to s=${n.s.toFixed(3)})`);
  }
});