import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  BEACH_HALF_W, BEACH_SEA_Y, BEACH_SHORE_Z, BEACH_RIM_Z, BEACH_BASIN_Y,
  BEACH_REEFS, beachGroundOffsetAt, clamp01,
} from './layout.js?v=1791038381904';

// ===== The gulls =====
//
// Two separate things share this file, and it matters that they do not share a
// state machine.
//
//   The flock - eight birds, small and high, circling out over the deep water
//   past the drop-off. They are set dressing. You see them from the lip, they
//   never come near you, and they exist so the sky over the water is not empty
//   and the scale of the place reads as BIG. Everything about them is tuned for
//   distance: tiny, high, slow, and always over water.
//
//   The thief - one bird, big, and interested in YOU. If you leave the car
//   sitting still for ten seconds she comes down the beach, hooks her talons
//   through the roof, lifts you and the car clear off the sand, carries you out
//   over the water, and drops you. It is the one moment on this level where the
//   world does something TO you rather than waiting to be driven at, and it only
//   ever happens to someone who has stopped caring - which is exactly when it is
//   funny.
//
// Why ten seconds. It has to be long enough that you are definitely parked on
// purpose. Any shorter and it fires while you are still swinging out of a
// corner or reading the map, which reads as the game being broken rather than
// as a gull being a gull. Ten is also about how long it takes to look away from
// the screen, so it catches the people it is meant to catch.
//
// Why she drops you over water and not anywhere. The car drives underwater here
// - that is the conceit of the level - so being dropped in the sea is a
// demotion to "back to where you were", not a death. Dropped on the dry sand
// it would be a punishment with no upside. So the drop point is chosen in the
// basin, in water deep enough to have swallowed the car, and clear of the
// reefs, which are the only things out there that could wedge it.
//
// She carries by TALONS, not by nest, so the car hangs under her and swings,
// rather than sitting on her back. That is the difference between a bird taking
// a car and a bird carrying a car, and the swing is the whole reason to watch.
//
// OWNING THE CAR. This module does not move the car itself. It publishes a pose
// on `carCarry` and main.js applies it. The rule that keeps that honest: while
// `carCarry` is non-null the car is not simulated at all, and the frame after
// the pose disappears the car is falling under real gravity from wherever she
// let go. One object owns the car's position, and it is the main loop.

const FLOCK_N = 8;
// Ten seconds of standing still, in seconds.
const IDLE_TO_THEFT = 10;
// After she drops you she flies off and leaves you alone for a while. Long
// enough that you can drive away and feel like you got away with it.
const COOLDOWN = 26;

const TAU = Math.PI * 2;

// Where she waits between jobs: high and well out over the deep water, so
// she circles in from off the map and the first you know of it is a shadow
// crossing the sand.
const PERCH = { x: -4, z: BEACH_RIM_Z - 16, y: 30 };

function makeGull(scale, tint) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.75 }));
  body.scale.set(1, 0.78, 1.55);
  g.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
  head.position.set(0, 0.16, -0.66);
  g.add(head);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.42, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8a422, roughness: 0.5 }));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.12, -1.02);
  g.add(beak);
  // The grey wingtips. On a real herring gull that dark wedge is the thing that
  // identifies it from a mile off, which is the only distance that matters here.
  const tipMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.8 });

  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.34, 0.12, -0.1);
    // Two segments, so the wing bends at the elbow instead of being a plank.
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.06, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.78 }));
    inner.position.set(sx * 0.48, 0, 0);
    pivot.add(inner);
    const outer = new THREE.Group();
    outer.position.set(sx * 0.95, 0, 0);
    const outerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.055, 0.34), tipMat);
    outerMesh.position.set(sx * 0.55, 0, 0.04);
    outer.add(outerMesh);
    pivot.add(outer);
    pivot.userData.outer = outer;
    g.add(pivot);
    wings.push(pivot);
  }
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.05, 0.62),
    new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.8 }));
  tail.position.set(0, 0.02, 0.78);
  g.add(tail);

  // Legs and talons, tucked under the body. Only the thief's are ever visible
  // doing anything, but the flock needs them too or they read as floating.
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.17, -0.22, -0.05);
    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.04, 0.5, 5),
      new THREE.MeshStandardMaterial({ color: 0xd9a03a, roughness: 0.6 }));
    shin.position.y = -0.25;
    leg.add(shin);
    // Three toes and a rear talon, as one small splayed shape. It only has to
    // read as a GRAB at the size you see it from the sand.
    const foot = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.46, 4),
      new THREE.MeshStandardMaterial({ color: 0xc98f2c, roughness: 0.55 }));
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.48, -0.16);
    leg.add(foot);
    g.add(leg);
    legs.push(leg);
  }

  g.scale.setScalar(scale);
  g.userData.wings = wings;
  g.userData.legs = legs;
  g.userData.body = body;
  return g;
}

// Flap a bird. `bank` tips it into a turn; the wings lead the body slightly,
// which is why the upstroke is faster than the downstroke - a gull's wings are
// close to an airfoil's, not a bird's.
function flap(gull, t, rate, amp = 1) {
  const p = Math.sin(t * rate);
  for (const [i, w] of gull.userData.wings.entries()) {
    const sx = i === 0 ? -1 : 1;
    w.rotation.z = sx * (p * 0.85 * amp + 0.15 * amp);
    w.rotation.y = sx * p * 0.12;
    w.userData.outer.rotation.z = sx * (p * 0.4 + 0.25) * amp;
  }
  // Tucked in flight, dropped when she is about to land on something.
  for (const [i, l] of gull.userData.legs.entries()) {
    const sx = i === 0 ? -1 : 1;
    l.rotation.x = -1.1 - Math.max(0, p) * 0.25;
    l.rotation.z = sx * 0.1;
  }
}

// Drop the legs straight down and open them, ready to take a car. Called on the
// last part of the approach so you can see her commit before she does it.
function reach(gull, k) {
  for (const [i, l] of gull.userData.legs.entries()) {
    const sx = i === 0 ? -1 : 1;
    l.rotation.x = -1.1 * (1 - k);
    l.rotation.z = sx * 0.1 + sx * 0.22 * k;
  }
}

// A place in the basin, in water deep enough that dropping the car there costs
// you the drive you made but does not break anything. Reefs are excluded with
// a margin wider than their own collider, so she does not drop you onto one and
// leave the car wedged half out of the water.
function pickDropPoint() {
  const CLEAR = 8;
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = (Math.random() * 2 - 1) * (BEACH_HALF_W - 14);
    // Well past the lip, and short of the waterline, so it is always water.
    const z = BEACH_RIM_Z + 7 + Math.random() * (BEACH_SHORE_Z - BEACH_RIM_Z - 12);
    if (beachGroundOffsetAt(x, z) > BEACH_BASIN_Y + 3) continue;
    let clear = true;
    for (const [rx, rz] of BEACH_REEFS) {
      if ((rx - x) * (rx - x) + (rz - z) * (rz - z) < CLEAR * CLEAR) { clear = false; break; }
    }
    if (clear) return { x, z };
  }
  // Every attempt blocked: the far side of the basin, which is wide and deep.
  return { x: 30, z: BEACH_RIM_Z + 14 };
}

export function createGulls(base) {
  const group = new THREE.Group();

  // ---- the flock ----
  const flock = [];
  for (let i = 0; i < FLOCK_N; i++) {
    const g = makeGull(1.1, 0x6d6f78);
    group.add(g);
    flock.push({
      g,
      cx: -30 + Math.random() * 60,
      cz: BEACH_RIM_Z - 4 - Math.random() * 18,
      r: 8 + Math.random() * 22,
      y: 26 + Math.random() * 26,
      phase: Math.random() * TAU,
      rate: 0.28 + Math.random() * 0.16,
      dir: Math.random() < 0.5 ? 1 : -1,
    });
  }

  // ---- the thief ----
  // Bigger than a flock bird on purpose: this one is a threat, and a threat you
  // can mistake for set dressing is not a threat.
  const thief = makeGull(2.4, 0x3f4149);
  thief.visible = false;
  group.add(thief);

  let t = 0;
  let idle = 0;
  let cooldown = 0;
  let lastX = 0;
  let lastZ = 0;
  let haveLast = false;
  let phase = 'perch';
  let timer = 0;
  let from = new THREE.Vector3();
  let to = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const carryPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  let drop = { x: 0, z: 0 };

  // Move her along a straight leg, easing in and out. `k` is 0..1 along it.
  const leg = (k) => k * k * (3 - 2 * k);

  // Head for a point, and record the heading so she flies the right way up.
  const steer = (g, tx, ty, tz) => {
    const dx = tx - g.position.x;
    const dz = tz - g.position.z;
    if (dx || dz) g.rotation.y = Math.atan2(dx, dz);
    g.position.y += (ty - g.position.y) * 0.08;
  };

  return {
    group,
    // The pose the main loop must apply to the car, or null when she is not
    // holding it. Read-only from outside; the update below owns it.
    carCarry: null,
    update(delta, carPos, blocked) {
      t += delta;
      const api = this;

      // ---- the flock, always ----
      for (const b of flock) {
        b.phase += delta * b.rate * b.dir;
        const px = b.cx + Math.cos(b.phase) * b.r;
        const pz = b.cz + Math.sin(b.phase) * b.r * 0.7;
        b.g.position.set(px, base + b.y + Math.sin(t * 0.5 + b.phase) * 1.4, pz);
        b.g.rotation.y = Math.atan2(
          -(b.dir * Math.sin(b.phase) * b.r),
          -(b.dir * Math.cos(b.phase) * b.r * 0.7));
        b.g.rotation.z = b.dir * 0.34;
        flap(b.g, t + b.phase, 2.4 + b.rate, 0.55);
      }

      // ---- the idle clock ----
      // Measured off the car's own movement rather than off the keys, so it
      // also resets if something else moves the car - a nudge from a crab, a
      // jolt off a rock - and it resets for the right reason: the car is where
      // you left it no longer.
      if (!blocked && carPos) {
        if (haveLast) {
          const moved = Math.hypot(carPos.x - lastX, carPos.z - lastZ);
          if (moved > 0.02) idle = 0;
        }
        lastX = carPos.x;
        lastZ = carPos.z;
        haveLast = true;
      }
      if (!blocked) idle += delta;
      if (cooldown > 0) cooldown -= delta;

      api.carCarry = null;

      // ---- the thief's state machine ----
      const HOLD_Y = 15;      // how high she cruises carrying
      const GRAB_Y = 3.1;     // talons to roof height
      switch (phase) {
        case 'perch': {
          // Circling, invisible, waiting.
          timer += delta;
          const p = t * 0.34;
          thief.position.set(
            PERCH.x + Math.cos(p) * 16,
            base + PERCH.y + Math.sin(p * 2) * 2,
            PERCH.z + Math.sin(p) * 12);
          thief.rotation.y = -p + Math.PI / 2;
          thief.rotation.z = 0.3;
          thief.visible = false;
          if (idle >= IDLE_TO_THEFT && cooldown <= 0 && carPos) {
            phase = 'approach';
            timer = 0;
            thief.visible = true;
            drop = pickDropPoint();
            // Come in from out over the water, high, so she crosses the whole
            // beach before she is over you.
            from.set(
              PERCH.x + Math.cos(p) * 16,
              base + PERCH.y + 4,
              PERCH.z + Math.sin(p) * 12);
            to.set(carPos.x, base + GRAB_Y + 9, carPos.z);
          }
          break;
        }

        case 'approach': {
          // Fly the long leg in. Legs come down for the last stretch, which is
          // the tell.
          timer += delta;
          const k = clamp01(timer / 3.4);
          thief.position.set(
            from.x + (to.x - from.x) * leg(k),
            from.y + (to.y - from.y) * leg(k),
            from.z + (to.z - from.z) * leg(k));
          steer(thief, to.x, to.y, to.z);
          thief.rotation.z = -0.22;
          reach(thief, clamp01((k - 0.72) / 0.28));
          flap(thief, t, 3.1, 1);
          if (k >= 1) { phase = 'grab'; timer = 0; }
          break;
        }

        case 'grab': {
          // Talons down onto the roof, a moment of contact, then up.
          timer += delta;
          thief.position.x += (carPos.x - thief.position.x) * 0.25;
          thief.position.z += (carPos.z - thief.position.z) * 0.25;
          thief.position.y += (base + GRAB_Y - thief.position.y) * 0.25;
          steer(thief, carPos.x, thief.position.y, carPos.z);
          thief.rotation.z = 0;
          reach(thief, 1);
          flap(thief, t, 5.5, 0.9);
          if (timer > 0.45) {
            phase = 'lift';
            timer = 0;
            from.copy(thief.position);
            to.set(carPos.x, base + HOLD_Y, carPos.z);
          }
          break;
        }

        case 'lift': {
          // Straight up out of the sand, claws closed. She is not being gentle.
          timer += delta;
          const k = clamp01(timer / 2.6);
          thief.position.lerpVectors(from, to, leg(k));
          thief.rotation.z = Math.sin(t * 2) * 0.05;
          reach(thief, 1);
          flap(thief, t, 3.4, 1);
          if (k >= 1) { phase = 'carry'; timer = 0; from.copy(thief.position); }
          break;
        }

        case 'carry': {
          // Out over the water. She banks into the turn and the car, hanging
          // free below her, swings with it - which is the whole show.
          timer += delta;
          const k = clamp01(timer / 6.5);
          // A lazy S so it is not a straight line: she does not fly like a
          // missile, she flies like something carrying a heavy thing.
          const sway = Math.sin(k * Math.PI * 2) * 9;
          const tx = drop.x + sway;
          const tz = drop.z;
          const ty = base + HOLD_Y + Math.sin(k * Math.PI) * 5;
          thief.position.set(
            from.x + (tx - from.x) * leg(k),
            from.y + (ty - from.y) * leg(k),
            from.z + (tz - from.z) * leg(k));
          // Bank into the direction of travel, from the yaw she wants to the
          // yaw she had a moment ago.
          const wantYaw = Math.atan2(tx - from.x, tz - from.z);
          let dyaw = wantYaw - thief.rotation.y;
          while (dyaw > Math.PI) dyaw -= TAU;
          while (dyaw < -Math.PI) dyaw += TAU;
          thief.rotation.z = -clamp01(Math.abs(dyaw) * 2.2) * Math.sign(dyaw || 1) * 0.55;
          reach(thief, 1);
          flap(thief, t, 2.9, 1);
          if (k >= 1) { phase = 'drop'; timer = 0; from.copy(thief.position); }
          break;
        }

        case 'drop': {
          // Claws open. From this frame on the car is not ours any more: the
          // pose stops being published and the main loop's gravity has it.
          timer += delta;
          thief.position.copy(from);
          thief.position.y += delta * 6;
          thief.position.x += Math.sin(t * 0.9) * delta * 5;
          thief.position.z += delta * 7;
          reach(thief, 0);
          thief.rotation.z = 0.25;
          flap(thief, t, 3.6, 1);
          if (timer > 1.8) { phase = 'away'; timer = 0; }
          break;
        }

        case 'away': {
          // Climb away over the deep water and go back to waiting.
          timer += delta;
          thief.position.y += delta * 9;
          thief.position.z -= delta * 12;
          thief.position.x += Math.sin(t * 0.7) * delta * 6;
          steer(thief, thief.position.x, thief.position.y, thief.position.z);
          flap(thief, t, 3.2, 1);
          if (timer > 4) {
            phase = 'perch';
            timer = 0;
            thief.visible = false;
            idle = 0;
            cooldown = COOLDOWN;
          }
          break;
        }
        default:
          break;
      }

      // ---- publish the car pose ----
      // Only while she has it: grab, lift and carry. Not on approach (she has
      // not touched it), not on drop (she has let go).
      if (phase === 'grab' || phase === 'lift' || phase === 'carry') {
        const hang = 2.5;
        // The car swings under her: it lags her motion and tilts into the
        // bank, so a hard turn visibly throws it about.
        const swing = Math.sin(t * 1.6) * 0.06 + thief.rotation.z * 0.5;
        pos.set(thief.position.x, thief.position.y - hang, thief.position.z);
        carryPose.x = pos.x;
        carryPose.y = pos.y;
        carryPose.z = pos.z;
        carryPose.yaw = thief.rotation.y + Math.PI;
        carryPose.pitch = 0.16 + swing;
        carryPose.roll = swing * 2.2;
        api.carCarry = carryPose;
      }
    },
  };
}

export const GULL_IDLE_TO_THEFT = IDLE_TO_THEFT;