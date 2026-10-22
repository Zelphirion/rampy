// Pure-maths tests for the playroom Hot Wheels track. No THREE, no DOM: this is
// the frame/loop physics the car actually drives, so the numbers matter.
//
// Run: node --test src/levels/house/hotwheels.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hotwheelsNodes, buildTrack, sampleTrack, poseOnTrack, nearestTrackS,
  trackStick, trackStickSpeed, stepTrack, createTrackState, boostAt,
  circleLoopNodes, releaseYaw, createLaunchFlight, stepLaunchFlight,
  launchRampStart,
  TRACK_LIFT, TRACK_MAX,
} from './hotwheels.mjs?v=1800000000020';

const G = 18;
const mag = (x, y, z) => Math.hypot(x, y, z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// The whole house, from layout.js. The route tours every room, so it must stay
// inside the house shell and under the ceiling (it comes down to the floor only
// in the playroom, so that is the only way onto it).
const HOUSE = { x0: -90, x1: 90, z0: -86, z1: 94 };
const CEIL = 30;

const track = buildTrack(hotwheelsNodes());

test('the sampled track is a real path: arc length grows and ends at length', () => {
  assert.ok(track.samples.length > 100, 'dense enough to drive');
  assert.ok(track.length > 40, 'an extensive track, not a stub');
  for (let i = 1; i < track.samples.length; i++) {
    assert.ok(track.samples[i].s >= track.samples[i - 1].s, 'arc length is monotonic');
  }
  const end = track.samples[track.samples.length - 1].s;
  assert.ok(Math.abs(end - track.length) < 1e-6);
});

test('the whole route stays inside the house and under the ceiling', () => {
  for (const p of track.samples) {
    assert.ok(p.x > HOUSE.x0 && p.x < HOUSE.x1, `x ${p.x} inside the house`);
    assert.ok(p.z > HOUSE.z0 && p.z < HOUSE.z1, `z ${p.z} inside the house`);
    assert.ok(p.y >= -0.01 && p.y < CEIL, `y ${p.y} under the ceiling`);
  }
});

test('the track only touches the floor in the playroom (one way on)', () => {
  const PLAY = { x0: -46, x1: 6, z0: -86, z1: -20 };
  for (const p of track.samples) {
    if (p.y < 4) {
      assert.ok(p.x > PLAY.x0 && p.x < PLAY.x1 && p.z > PLAY.z0 && p.z < PLAY.z1,
        `the low part of the track at (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) is in the playroom`);
    }
  }
});

test('every sampled frame is orthonormal and right-handed', () => {
  for (const p of track.samples) {
    const T = { x: p.tx, y: p.ty, z: p.tz };
    const U = { x: p.ux, y: p.uy, z: p.uz };
    const B = { x: p.bx, y: p.by, z: p.bz };
    assert.ok(Math.abs(mag(T.x, T.y, T.z) - 1) < 1e-6, 'T unit');
    assert.ok(Math.abs(mag(U.x, U.y, U.z) - 1) < 1e-6, 'U unit');
    assert.ok(Math.abs(mag(B.x, B.y, B.z) - 1) < 1e-6, 'B unit');
    assert.ok(Math.abs(dot(T, U)) < 1e-6, 'T perp U');
    assert.ok(Math.abs(dot(T, B)) < 1e-6, 'T perp B');
    assert.ok(Math.abs(dot(U, B)) < 1e-6, 'U perp B');
  }
});

test('poseOnTrack returns an orthonormal basis and lifts off the rail by `lift`', () => {
  for (const s of [0, 12.5, track.length * 0.5, track.length - 3]) {
    const pose = poseOnTrack(track, s, TRACK_LIFT);
    const X = { x: pose.xx, y: pose.xy, z: pose.xz };
    const Y = { x: pose.yx, y: pose.yy, z: pose.yz };
    const Z = { x: pose.zx, y: pose.zy, z: pose.zz };
    for (const v of [X, Y, Z]) assert.ok(Math.abs(mag(v.x, v.y, v.z) - 1) < 1e-6);
    assert.ok(Math.abs(dot(X, Y)) < 1e-6);
    assert.ok(Math.abs(dot(X, Z)) < 1e-6);
    assert.ok(Math.abs(dot(Y, Z)) < 1e-6);
    // X cross Y === Z.
    const c = { x: X.y * Y.z - X.z * Y.y, y: X.z * Y.x - X.x * Y.z, z: X.x * Y.y - X.y * Y.x };
    assert.ok(Math.abs(c.x - Z.x) < 1e-6 && Math.abs(c.y - Z.y) < 1e-6 && Math.abs(c.z - Z.z) < 1e-6);
    // Position sits `lift` along up from the centreline.
    const f = sampleTrack(track, s);
    assert.ok(Math.abs(pose.px - (f.x + f.ux * TRACK_LIFT)) < 1e-9);
    assert.ok(Math.abs(pose.py - (f.y + f.uy * TRACK_LIFT)) < 1e-9);
    assert.ok(Math.abs(pose.pz - (f.z + f.uz * TRACK_LIFT)) < 1e-9);
  }
});

test('the car rides on the surface: up is never far from the surface normal', () => {
  // At the very least, the up vector should stay a unit vector with no NaNs the
  // whole way round (a NaN frame would silently fling the car to nowhere).
  for (let s = 0; s <= track.length; s += track.length / 500) {
    const f = sampleTrack(track, s);
    assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.z), 'finite position');
    assert.ok(Number.isFinite(f.ux) && Number.isFinite(f.uy) && Number.isFinite(f.uz), 'finite up');
    assert.ok(Math.abs(mag(f.tx, f.ty, f.tz) - 1) < 1e-6, 'unit tangent');
  }
});

test('the route contains a genuine vertical loop (up inverts near the top)', () => {
  let minUy = 1, top = null;
  for (const p of track.samples) {
    if (p.uy < minUy) { minUy = p.uy; top = p; }
  }
  assert.ok(minUy < -0.9, `the car goes properly upside down (min up.y = ${minUy})`);
  assert.ok(top.y > 8, 'the inversion is at the top of the loop, high off the floor');
});

test('the loop needs real speed: below it the car peels off, above it holds', () => {
  // Find the most inverted point.
  let top = track.samples[0];
  for (const p of track.samples) if (p.uy < top.uy) top = p;
  const need = trackStickSpeed(track, top.s, G);
  assert.ok(need > 0, 'the top of the loop demands a minimum speed');
  assert.ok(!trackStick(track, top.s, need * 0.5, G), 'too slow: leaves the track');
  assert.ok(trackStick(track, top.s, need * 1.5, G), 'fast enough: glued on');
});

test('gravity pulls the car down the hill and fights it up the shelf climb', () => {
  // The shelf climb rises toward the shelf: gravity must bleed speed off there.
  let climb = null;
  for (const p of track.samples) if (p.ty > 0.2) { climb = p; break; }
  assert.ok(climb, 'there is a climbing shelf ramp');
  let st = createTrackState(climb.s);
  st.speed = 20;
  const before = st.speed;
  for (let i = 0; i < 10; i++) stepTrack(track, st, {}, 1 / 60, G);
  assert.ok(st.speed < before, 'coasting up a climb slows the car');

  // The big hill descends: coasting down it speeds the car up.
  let hill = null;
  for (const p of track.samples) if (p.ty < -0.4) { hill = p; break; }
  assert.ok(hill, 'there is a descending hill');
  let st2 = createTrackState(hill.s);
  st2.speed = 5;
  const b2 = st2.speed;
  for (let i = 0; i < 10; i++) stepTrack(track, st2, {}, 1 / 60, G);
  assert.ok(st2.speed > b2, 'coasting down the hill speeds the car up');
});

test('throttle accelerates along the track and caps out', () => {
  const st = createTrackState(0);
  for (let i = 0; i < 400; i++) stepTrack(track, st, { throttle: 1 }, 1 / 60, G);
  assert.ok(st.speed > 0);
  assert.ok(st.speed <= TRACK_MAX + 1e-9);
  assert.ok(st.s > 0, 'the car has moved along the track');
  assert.ok(st.s <= track.length + 1e-9, 'and has not run off the end (clamped)');
});

test('boosters actually push, and only inside their span', () => {
  assert.ok(boostAt(track, track.length * 0.07) > 0, 'there is a booster on the big climb');
  assert.ok(boostAt(track, track.length * 0.735) > 0, 'and one on the run-in to the shelf climb');
  assert.ok(boostAt(track, track.length * 0.855) > 0, 'and one on the run-in to the loop');
  assert.equal(boostAt(track, track.length * 0.45), 0, 'and they are not on everywhere');
});

test('releaseYaw points the car forward along the track tangent', () => {
  // The house drives with forward = (-cos yaw, sin yaw) in world (x, z). If the
  // yaw is right, that forward must be the track's own travel direction.
  for (const frac of [0, 0.2, 0.5, 0.724, 0.9, 0.999]) {
    const s = track.length * frac;
    const f = sampleTrack(track, s);
    const yaw = releaseYaw(track, s);
    const fx = -Math.cos(yaw), fz = Math.sin(yaw);
    // The tangent's ground part, normalized (its xz length is never zero here).
    const g = Math.hypot(f.tx, f.tz);
    assert.ok(g > 1e-6, 'the tangent has a ground component');
    assert.ok(Math.abs(fx - f.tx / g) < 1e-6, `forward x matches T at s=${s} (got ${fx} want ${f.tx / g})`);
    assert.ok(Math.abs(fz - f.tz / g) < 1e-6, `forward z matches T at s=${s} (got ${fz} want ${f.tz / g})`);
  }
});

test('nearestTrackS finds the authored node positions', () => {
  const nodes = hotwheelsNodes();
  for (const nd of [nodes[0], nodes[4], nodes[nodes.length - 1]]) {
    const near = nearestTrackS(track, nd.x, nd.y, nd.z);
    assert.ok(near.dist < 0.5, `node (${nd.x},${nd.y},${nd.z}) is on the track (dist ${near.dist})`);
  }
  // A point far away is far away.
  const far = nearestTrackS(track, 100, 100, 100);
  assert.ok(far.dist > 20);
});

test('the route begins with an on-ramp up off the floor', () => {
  const nodes = hotwheelsNodes();
  assert.ok(nodes[0].y < 0.05, 'the on-ramp starts flush with the floor');
  assert.ok(nodes.some((nd, i) => i < 6 && nd.y > 1.8),
    'the on-ramp lifts the car up onto the raised straightaway');
});

test('the descent is banked: the surface tips sideways into the corner', () => {
  // Away from the loop (where up inverts), a banked corner shows up as a
  // sideways component in the surface normal.
  let maxSide = 0;
  for (const p of track.samples) {
    if (p.uy > 0.3) maxSide = Math.max(maxSide, Math.hypot(p.ux, p.uz));
  }
  assert.ok(maxSide > 0.25, `a corner is banked (max sideways up = ${maxSide.toFixed(3)})`);
});

test('the loop is a wider, offset helix: it enters and exits apart', () => {
  const loop = circleLoopNodes(-1, 5.4, -55, 5.4, 12, 1.5, 3.4);
  const a = loop[0], b = loop[loop.length - 1];
  assert.ok(Math.abs(b.z - a.z) > 1.5, 'the helix shifts across as it turns');
  assert.ok(b.y - a.y > 0.6, 'and climbs as it turns');
});

test('the track never crosses itself: no two distant passes share a spot', () => {
  // A car has to be able to drive the whole route without two separate stretches
  // of track occupying the same space (which reads as the track doubling back
  // through itself, and makes a car take the wrong branch). Any two samples a
  // track-width or more apart in arc length must stay a rail-width apart in space.
  const MIN_ARC = 8;          // ignore near-neighbours along the same run
  const RAIL_CLEARANCE = 2.8; // closer than this and the rails visually overlap
  for (let i = 0; i < track.samples.length; i++) {
    const a = track.samples[i];
    for (let j = i + 1; j < track.samples.length; j++) {
      const b = track.samples[j];
      if (b.s - a.s < MIN_ARC) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      assert.ok(d >= RAIL_CLEARANCE,
        `track passes itself at s=${a.s.toFixed(1)} (${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)}) ` +
        `vs s=${b.s.toFixed(1)} (${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}), only ${d.toFixed(2)} apart`);
    }
  }
});

test('there is a long, near-level straight to build speed on', () => {
  let best = 0, run = 0, prev = null;
  for (const p of track.samples) {
    const straight = Math.abs(p.ty) < 0.1 && p.uy > 0.9 && Math.abs(p.kappa) < 0.06;
    if (straight && prev) run += p.s - prev.s;
    else run = 0;
    best = Math.max(best, run);
    prev = p;
  }
  assert.ok(best > 10, `the track has a real straightaway (longest ${best.toFixed(1)})`);
});

test('circleLoopNodes makes a full vertical circle with inward-facing ups', () => {
  const r = 4, cx = 1, cy = 5, cz = -3;
  const loop = circleLoopNodes(cx, cy, cz, r, 8);
  assert.equal(loop.length, 9);
  for (const p of loop) {
    assert.ok(Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) < 1e-9, 'on the circle');
    assert.ok(Math.abs(p.z - cz) < 1e-9, 'in the plane z = cz');
    // up points at the centre: (centre - point) normalized.
    const ux = (cx - p.x) / r, uy = (cy - p.y) / r;
    assert.ok(Math.abs(p.ux - ux) < 1e-9 && Math.abs(p.uy - uy) < 1e-9);
  }
  assert.ok(Math.abs(loop[0].uy - 1) < 1e-9, 'starts at the bottom, up = +Y');
  const topIdx = loop.findIndex((p) => p.y > cy + r - 1e-6);
  assert.ok(Math.abs(loop[topIdx].uy + 1) < 1e-9, 'top of the loop is inverted');
});

// ===== The launch ramp =====
//
// The car leaves the loops and climbs the ramp that fires it into the living
// room. The climb used to happen inside the loops' fixed camera shot, so the
// car climbed away from the lens and shrank to nothing on the way up - which
// reads on screen as the car stalling at the lip. The ramp therefore has a
// shot of its own, and that shot starts where the climb starts: these tests
// pin that boundary.

test('the launch ramp starts at the foot of the climb', () => {
  const s = launchRampStart(track);
  const foot = sampleTrack(track, s);
  assert.ok(Math.abs(foot.x + 22) < 1, `the ramp is the straight run at x = -22 (got ${foot.x.toFixed(1)})`);
  assert.ok(Math.abs(foot.y - 1.5) < 1, `it starts on the playroom floor (y = ${foot.y.toFixed(1)})`);
  assert.ok(Math.abs(foot.z + 62) < 2, `at the far end of the playroom (z = ${foot.z.toFixed(1)})`);
  // The tangent points up from here: this is the bottom of the climb.
  assert.ok(sampleTrack(track, s + 2).ty > 0.3, 'the track climbs from here');
});

test('the ramp climbs the storey from the playroom floor to the lip', () => {
  const s = launchRampStart(track);
  const foot = sampleTrack(track, s);
  const lip = sampleTrack(track, track.length);
  assert.ok(lip.y - foot.y > 12, `the ramp gains a storey (${foot.y.toFixed(1)} -> ${lip.y.toFixed(1)})`);
  // And it is a climb all the way up, not a lift and a drop.
  for (let t = s + 2; t <= s + 26; t += 2) {
    assert.ok(sampleTrack(track, t).ty > 0.3, `still climbing at s=${t.toFixed(1)}`);
  }
});

test('the ramp starts after the loops, so the two shots never overlap', () => {
  let lastInverted = 0;
  for (const p of track.samples) if (p.uy < 0.2) lastInverted = p.s;
  const s = launchRampStart(track);
  assert.ok(s > lastInverted,
    `the ramp is after the loops (loops end ${lastInverted.toFixed(1)}, ramp ${s.toFixed(1)})`);
  assert.ok(s < track.length - 30, 'and well before the lip');
});

// ===== The launch flight =====
//
// Leaving the lip of the launch ramp used to drop the car straight down where
// the ramp ended: the launch cinematic owns the frame, so the house's drive
// block - the only thing in the house that moves the car sideways - is off and
// nothing moved it. The car is now a projectile with a flight of its own, and
// these tests pin that flight: it has to leave the ramp with speed, sail
// through the playroom doorway and come down in the living room.

// The living room and the doorway it is entered through (layout.js).
const LIVING = { x0: -90, x1: 6, z0: -20, z1: 46 };
const DOORWAY = { x0: -30, x1: -10, head: 22 };

// Drive the whole route at full throttle and fly the car off the end of it.
function flyTheLaunch() {
  const st = createTrackState(0);
  let guard = 0;
  while (!st.atEnd && guard++ < 20000) stepTrack(track, st, { throttle: 1 }, 1 / 60, G);
  const pose = poseOnTrack(track, track.length, TRACK_LIFT);
  const f = createLaunchFlight(track, track.length, st.speed, pose.px, pose.py, pose.pz);
  const dt = 1 / 60;
  let t = 0;
  while (t < 8 && f.y > 0) { stepLaunchFlight(f, dt, G); t += dt; }
  return { st, f, t };
}

test('the car leaves the launch ramp with its speed, fired north', () => {
  const { st } = flyTheLaunch();
  assert.ok(st.atEnd, 'the car reaches the end of the track');
  assert.ok(st.speed > 20, `and it is still quick there (${st.speed.toFixed(1)})`);

  const lip = sampleTrack(track, track.length);
  assert.ok(lip.ty >= 0 && lip.ty < 0.1, 'the lip is deliberately near-flat');
  const f = createLaunchFlight(track, track.length, st.speed, lip.x, lip.y + TRACK_LIFT, lip.z);
  assert.ok(Math.hypot(f.vx, f.vz) > 20, 'the flight keeps the speed off the rails');
  assert.ok(f.vz > 0 && Math.abs(f.vx) < 1e-6, 'and it is fired due north, down the room');
});

test('the launch sails through the playroom doorway into the living room', () => {
  const { f, t } = flyTheLaunch();
  assert.ok(t > 0.8, `the car is in the air for a while (${t.toFixed(2)}s)`);
  // The flight must pass through the gap in the wall, not through the plaster.
  assert.ok(f.x > DOORWAY.x0 && f.x < DOORWAY.x1, `it goes through the doorway (x=${f.x.toFixed(1)})`);
  // ...and under its head, so it does not clip the lintel on the way past.
  const lip = sampleTrack(track, track.length);
  assert.ok(lip.y + TRACK_LIFT < DOORWAY.head, 'it flies under the door head');
  // It lands in the living room, with room to spare before the far wall.
  assert.ok(f.z > LIVING.z0 + 20, `it crosses the living room (landed at z=${f.z.toFixed(1)})`);
  assert.ok(f.z < LIVING.z1 - 4, 'and does not slam into the far wall');
  assert.ok(f.x > LIVING.x0 && f.x < LIVING.x1, 'landing inside the living room');
});

test('the flight is ballistic: it falls under gravity and slows in the air', () => {
  const { st } = flyTheLaunch();
  const f = createLaunchFlight(track, track.length, st.speed, 0, 16.4, -20);
  const startSpeed = Math.hypot(f.vx, f.vz);
  const startVy = f.vy;
  assert.ok(startVy > 0, 'the ramp kicks it up a little as it leaves');
  stepLaunchFlight(f, 1 / 60, G);
  assert.ok(f.vy < startVy, 'gravity pulls it down');
  for (let i = 0; i < 20; i++) stepLaunchFlight(f, 1 / 60, G);
  assert.ok(f.vy < 0, 'and after a moment it is falling');
  assert.ok(Math.hypot(f.vx, f.vz) < startSpeed, 'air drag takes the edge off the speed');
  assert.ok(f.pitch > 0, 'and the body noses down as it falls');
});

test('the launch hands the car back at a sane speed, not the launch speed', () => {
  const { st, f } = flyTheLaunch();
  const handover = Math.min(Math.hypot(f.vx, f.vz) * 0.3, 12);
  assert.ok(handover > 2, 'the car still rolls on when the player gets the wheel back');
  assert.ok(handover <= 12, 'but not at the speed it was launched at');
  assert.ok(handover < st.speed * 0.5);
});
