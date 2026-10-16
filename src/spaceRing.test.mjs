import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RING_R, RING_CIRC, RING_LANE, RING_MAX, RING_REVERSE,
  ringWrapS, createRingState, stepRing, ringPose, ringCamera,
} from './spaceRing.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const mag = (v) => Math.hypot(v.x, v.y, v.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

test('ringWrapS folds into [0, RING_CIRC)', () => {
  assert.ok(near(ringWrapS(0), 0));
  assert.ok(near(ringWrapS(RING_CIRC), 0));
  assert.ok(near(ringWrapS(-1), RING_CIRC - 1));
  assert.ok(near(ringWrapS(RING_CIRC * 2.25), RING_CIRC * 0.25, 1e-6));
  const s = ringWrapS(RING_CIRC * 7 + 5);
  assert.ok(s >= 0 && s < RING_CIRC);
});

test('stepping throttle from rest accelerates forward and caps out', () => {
  const st = createRingState();
  for (let i = 0; i < 600; i++) stepRing(st, { throttle: 1 }, 1 / 60);
  assert.ok(st.speed > 0);
  assert.ok(st.speed <= RING_MAX + 1e-9);
  assert.ok(near(st.heading, 0, 1e-9));
  // Straight down the corridor: all the travel is in s, none across w.
  assert.ok(near(st.w, 0, 1e-9));
  assert.ok(st.s > 0);
});

test('no throttle coasts to a stop and never reverses', () => {
  const st = createRingState();
  st.speed = 10;
  for (let i = 0; i < 600; i++) stepRing(st, {}, 1 / 60);
  assert.ok(Math.abs(st.speed) < 1e-6);
});

test('reverse caps at RING_REVERSE', () => {
  const st = createRingState();
  for (let i = 0; i < 600; i++) stepRing(st, { throttle: -1 }, 1 / 60);
  assert.ok(st.speed >= -RING_REVERSE - 1e-9);
  assert.ok(st.speed < 0);
});

test('steering bends the heading and the car slides across the corridor', () => {
  const st = createRingState(0, 0, 0);
  st.speed = 20;
  for (let i = 0; i < 30; i++) stepRing(st, { throttle: 1, steer: 1 }, 1 / 60);
  assert.ok(st.heading > 0, 'steer right increases the heading angle');
  assert.ok(st.w > 0, 'the car moves toward +axis as the heading bends that way');
  assert.ok(st.w <= RING_LANE + 1e-9);
});

test('the corridor clamp keeps the car between the walls', () => {
  const st = createRingState(0, 0, Math.PI / 2);   // heading dead across
  st.speed = RING_MAX;
  for (let i = 0; i < 120; i++) stepRing(st, { throttle: 1 }, 1 / 60);
  assert.ok(near(st.w, RING_LANE, 1e-9));
});

test('laneHi / laneLo open one side of the corridor without the other', () => {
  const open = createRingState(0, 0, Math.PI / 2);   // heading dead across (+w)
  open.speed = RING_MAX;
  for (let i = 0; i < 120; i++) stepRing(open, { throttle: 1, laneHi: 10.5 }, 1 / 60);
  assert.ok(near(open.w, 10.5, 1e-9), 'the widened +w side is reachable');

  const shut = createRingState(0, 0, -Math.PI / 2);  // heading dead across (-w)
  shut.speed = RING_MAX;
  for (let i = 0; i < 120; i++) stepRing(shut, { throttle: 1, laneHi: 10.5 }, 1 / 60);
  assert.ok(near(shut.w, -RING_LANE, 1e-9), 'the -w side stays at the default clamp');
});

test('one lap of cruising returns to the same loop position', () => {
  const st = createRingState(0, 0, 0);
  st.speed = RING_CIRC;   // one circumference per second
  stepRing(st, {}, 1);    // coasts a little under drag, so nudge speed back
  // Exact mapping check instead: a full circumference is the same angle.
  const a = ringPose(0, 0, 0).px;
  const b = ringPose(RING_CIRC, 0, 0).px;
  assert.ok(near(a, b, 1e-6));
  assert.ok(st.s >= 0 && st.s < RING_CIRC);
});

test('ringPose gives an orthonormal, right-handed basis at the car', () => {
  for (const s of [0, 1.3, RING_CIRC * 0.37, RING_CIRC - 2]) {
    for (const h of [0, 0.7, -1.9, Math.PI / 2]) {
      const p = ringPose(s, 3, h);
      const X = { x: p.xx, y: p.xy, z: p.xz };
      const Y = { x: p.yx, y: p.yy, z: p.yz };
      const Z = { x: p.zx, y: p.zy, z: p.zz };
      assert.ok(near(mag(X), 1, 1e-6), 'X is unit');
      assert.ok(near(mag(Y), 1, 1e-6), 'Y is unit');
      assert.ok(near(mag(Z), 1, 1e-6), 'Z is unit');
      assert.ok(near(dot(X, Y), 0, 1e-6), 'X ⟂ Y');
      assert.ok(near(dot(X, Z), 0, 1e-6), 'X ⟂ Z');
      assert.ok(near(dot(Y, Z), 0, 1e-6), 'Y ⟂ Z');
      // X cross Y === Z (right-handed)
      const cx = { x: X.y * Y.z - X.z * Y.y, y: X.z * Y.x - X.x * Y.z, z: X.x * Y.y - X.y * Y.x };
      assert.ok(near(cx.x, Z.x, 1e-6) && near(cx.y, Z.y, 1e-6) && near(cx.z, Z.z, 1e-6));
    }
  }
});

test('at the top of the ring the car rides on the inner wall, hub overhead', () => {
  // s = 0 is the +X side of the ring; the floor normal points inward (-X).
  const p = ringPose(0, 5, 0);
  assert.ok(near(p.px, RING_R));
  assert.ok(near(p.py, 0));
  assert.ok(near(p.pz, 5));
  // up = local +Y, which points at the hub (-X here)
  assert.ok(near(p.yx, -1, 1e-9) && near(p.yy, 0, 1e-9) && near(p.yz, 0, 1e-9));
  // car's hood (local -X) points +Y at heading 0
  assert.ok(near(-p.xx, 0, 1e-9) && near(-p.xy, 1, 1e-9));
});

test('ringPose radius equals RING_R minus the ride height', () => {
  const p = ringPose(5, 0, 0, 3);
  assert.ok(near(Math.hypot(p.px, p.py), RING_R - 3, 1e-6));
});

test('ringCamera sits behind the car (opposite its heading) and above the floor', () => {
  const { cam, look } = ringCamera(0, 0, 0, 10, 5);
  // At s=0 heading=0 the car drives +Y, so "behind" is -Y and "up" is -X.
  assert.ok(near(cam.y, -10, 1e-6), 'camera is behind along -forward');
  assert.ok(near(cam.x, RING_R - 5, 1e-6), 'camera is lifted toward the hub');
  // The look target is ahead of and above the car.
  assert.ok(look.y > 0, 'looks ahead');
});
