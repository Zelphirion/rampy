import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== Flame Lizard =====
// A small fire-salamander that scurries around town and sets buildings on
// fire. It is the only thing that relights doused buildings — the fire engine
// fights them, the lizard re-lights them. It flees the giant robot (and the
// player car) so it scampers out of harm's way, then comes back to work.
// The model's front faces +Z, so rotation.y = atan2(dx, dz) points it toward
// its target (same convention as the robot and the people).

// Flame materials — the body glows, the mane/tail/breath are unlit so they
// pop against the night scene.
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8482c, emissive: 0xff3c00, emissiveIntensity: 1.0, roughness: 0.55 });
const bellyMat = new THREE.MeshStandardMaterial({ color: 0xff8c42, emissive: 0xff6a1f, emissiveIntensity: 0.7, roughness: 0.6 });
const spikeMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });   // flame mane / tail / breath
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff88 });
const clawMat = new THREE.MeshStandardMaterial({ color: 0x2a1410, roughness: 0.9 });

// Behaviour
const MAX_FIRES = 2;      // keep the same cap as before: 2 buildings burn at once
const SCURRY_SPEED = 11;  // hurrying to a building to set it alight
const ROAM_SPEED = 6;     // idly wandering while the fires are already lit
const FLEE_SPEED = 16;    // sprinting away from the robot / player
const FLEE_ROBOT_R = 7;   // the robot's feet are scary
const FLEE_PLAYER_R = 5;  // and it really doesn't want to be run over
const IGNITE_TIME = 0.9;  // how long it breathes fire before the building catches
const ARRIVE_DIST = 0.7;

function makeLizard() {
  const g = new THREE.Group();

  // Torso — a low, stretched fire-salamander body
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), bodyMat);
  torso.position.y = 0.55;
  torso.scale.set(1.05, 0.62, 1.7);
  g.add(torso);

  // Belly (lighter) peeking under the torso
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), bellyMat);
  belly.position.y = 0.34;
  belly.scale.set(0.95, 0.55, 1.35);
  g.add(belly);

  // Head (nods while it runs)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.74, 0.88);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), bodyMat);
  skull.scale.set(1.1, 0.9, 1.0);
  headPivot.add(skull);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), bodyMat);
  snout.position.set(0, -0.06, 0.2);
  headPivot.add(snout);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
  eyeL.position.set(-0.17, 0.1, 0.16);
  headPivot.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.17;
  headPivot.add(eyeR);
  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), bodyMat);
  hornL.position.set(-0.24, 0.18, 0.02);
  headPivot.add(hornL);
  const hornR = hornL.clone();
  hornR.position.x = 0.24;
  headPivot.add(hornR);
  g.add(headPivot);

  // Flame mane running down the spine (unlit, flickers in update)
  const mane = [];
  for (let i = 0; i < 4; i++) {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), spikeMat);
    fl.position.set(0, 0.98, -0.55 + i * 0.38);
    fl.rotation.x = -0.2;
    g.add(fl);
    mane.push(fl);
  }

  // Tail — three tapering segments + a flame at the tip; whips while running
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.52, -0.95);
  const segs = [[0.16, -0.28], [0.13, -0.6], [0.1, -0.88]];
  for (const [r, z] of segs) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), bodyMat);
    s.position.z = z;
    tailPivot.add(s);
  }
  const tailFlame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), spikeMat);
  tailFlame.position.set(0, 0.08, -1.0);
  tailFlame.rotation.x = Math.PI / 2 - 0.4;   // flame licks out the tail tip
  tailPivot.add(tailFlame);
  g.add(tailPivot);

  // Four little legs that scurry (front & hind pairs alternate)
  const legDefs = [
    ['legFL', -0.42, 0.32, 0.55],
    ['legFR', 0.42, 0.32, 0.55],
    ['legBL', -0.42, 0.32, -0.55],
    ['legBR', 0.42, 0.32, -0.55],
  ];
  const legs = {};
  for (const [name, lx, ly, lz] of legDefs) {
    const leg = new THREE.Group();
    leg.position.set(lx, ly, lz);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.3, 0.2), bodyMat);
    upper.position.y = -0.13;
    leg.add(upper);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.32), clawMat);
    foot.position.set(0, -0.3, 0.06);
    leg.add(foot);
    g.add(leg);
    legs[name] = leg;
  }

  // Warm glow so it reads as a creature of fire at night
  const light = new THREE.PointLight(0xff5500, 7, 10, 2);
  light.position.set(0, 0.8, 0);
  g.add(light);

  // Flame breath from the mouth (hidden until it ignites a building)
  const breath = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 6), spikeMat);
  breath.rotation.x = -Math.PI / 2;   // cone tip toward +Z
  breath.position.set(0, 0.6, 1.25);
  breath.visible = false;
  g.add(breath);

  g.userData = { headPivot, tailPivot, tailFlame, mane, breath, light, legs };
  return g;
}

function countActive(fires) {
  let n = 0;
  for (const f of fires) if (f.active) n++;
  return n;
}

function dist2(mesh, wrapDeltaX, wrapDeltaZ, x, z) {
  const dx = wrapDeltaX(mesh.position.x, x);
  const dz = wrapDeltaZ(mesh.position.z, z);
  return dx * dx + dz * dz;
}

// A random wander target that isn't inside a building.
function randomRoam(colliders) {
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() * 2 - 1) * 170;
    const z = (Math.random() * 2 - 1) * 170;
    let blocked = false;
    for (const c of colliders) {
      if (c.aiOnly) continue;   // the lizard can walk over the mine pit
      if (Math.abs(x - c.x) < c.halfW + 0.5 && Math.abs(z - c.z) < c.halfD + 0.5) { blocked = true; break; }
    }
    if (!blocked) return { x, z };
  }
  return { x: 0, z: 0 };
}

export function addLizard(scene) {
  const mesh = makeLizard();
  mesh.position.set(0, 0, -20);
  mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);

  const st = {
    mode: 'roam',               // roam | scurry | ignite | flee
    phase: Math.random() * Math.PI * 2,
    time: 0,
    t: 0,                       // ignite timer
    target: null,               // the fire object being ignited
    roamTarget: null,
    lastIgnited: null,          // avoids re-lighting the same building back-to-back
  };

  // Stand just outside a building's +X/+Z corner and breathe fire at it.
  function ignitePoint(f) {
    return { x: f.x + f.w / 2 + 0.8, z: f.z + f.d / 2 + 0.8 };
  }

  function update(delta, ctx) {
    st.time += delta;
    const run = st.mode === 'scurry' || st.mode === 'flee';
    st.phase += delta * (run ? 18 : 12);
    const p = st.phase;

    // ---- animation (always on) ----
    const { legs, headPivot, tailPivot, tailFlame, mane, breath, light } = mesh.userData;
    legs.legFL.rotation.x = Math.sin(p) * 0.95;
    legs.legBR.rotation.x = Math.sin(p) * 0.95;
    legs.legFR.rotation.x = Math.sin(p + Math.PI) * 0.95;
    legs.legBL.rotation.x = Math.sin(p + Math.PI) * 0.95;
    tailPivot.rotation.y = Math.sin(p * 0.6) * 0.4;
    headPivot.rotation.x = Math.sin(p * 2) * 0.12;
    const t = st.time;
    for (let i = 0; i < mane.length; i++) mane[i].scale.y = 1 + Math.sin(t * 20 + i * 1.7) * 0.3;
    tailFlame.scale.y = 1 + Math.sin(t * 24) * 0.3;
    light.intensity = 7 + Math.sin(t * 23) * 2;

    // ---- flee check (robot feet + player car) ----
    let fleeing = false;
    let fdx = 0, fdz = 0;
    const rdx = ctx.wrapDeltaX(mesh.position.x, ctx.robot.x);
    const rdz = ctx.wrapDeltaZ(mesh.position.z, ctx.robot.z);
    if (rdx * rdx + rdz * rdz < FLEE_ROBOT_R * FLEE_ROBOT_R) {
      const d = Math.max(0.001, Math.hypot(rdx, rdz));
      fdx = -rdx / d; fdz = -rdz / d; fleeing = true;
    } else {
      const pdx = ctx.wrapDeltaX(mesh.position.x, ctx.player.x);
      const pdz = ctx.wrapDeltaZ(mesh.position.z, ctx.player.z);
      if (pdx * pdx + pdz * pdz < FLEE_PLAYER_R * FLEE_PLAYER_R) {
        const d = Math.max(0.001, Math.hypot(pdx, pdz));
        fdx = -pdx / d; fdz = -pdz / d; fleeing = true;
      }
    }
    if (fleeing) st.mode = 'flee';

    let move = null;
    if (fleeing) {
      move = { x: mesh.position.x + fdx, z: mesh.position.z + fdz, speed: FLEE_SPEED };
    } else if (st.mode === 'ignite') {
      // Face the building and breathe a growing tongue of fire at it.
      const f = st.target;
      const fx = ctx.wrapDeltaX(mesh.position.x, f.x);
      const fz = ctx.wrapDeltaZ(mesh.position.z, f.z);
      mesh.rotation.y = Math.atan2(fx, fz);
      breath.visible = true;
      breath.scale.set(1 + st.t * 2, 1 + st.t * 3, 1);
      st.t += delta;
      if (st.t >= IGNITE_TIME) {
        ctx.ignite(st.target);          // the building bursts into flames
        st.lastIgnited = st.target;
        st.target = null;
        st.mode = 'roam';
        breath.visible = false;
      }
    } else {
      breath.visible = false;
      const nActive = countActive(ctx.fires);
      if (nActive < MAX_FIRES) {
        // Find the nearest inactive building — prefer one we didn't just light.
        let best = null, bestD = Infinity;
        let alt = null, altD = Infinity;
        for (const f of ctx.fires) {
          if (f.active) continue;
          const pt = ignitePoint(f);
          const d2 = dist2(mesh, ctx.wrapDeltaX, ctx.wrapDeltaZ, pt.x, pt.z);
          if (f === st.lastIgnited) {
            if (d2 < altD) { alt = f; altD = d2; }
          } else if (d2 < bestD) {
            best = f; bestD = d2;
          }
        }
        const choice = best || alt;
        if (choice) { st.target = choice; st.mode = 'scurry'; }
        else st.mode = 'roam';
      } else {
        st.target = null;
        st.mode = 'roam';
      }
      if (st.mode === 'scurry' && st.target) {
        const pt = ignitePoint(st.target);
        if (dist2(mesh, ctx.wrapDeltaX, ctx.wrapDeltaZ, pt.x, pt.z) < ARRIVE_DIST * ARRIVE_DIST) {
          st.mode = 'ignite';
          st.t = 0;
        } else {
          move = { x: pt.x, z: pt.z, speed: SCURRY_SPEED };
        }
      } else if (st.mode === 'roam') {
        if (!st.roamTarget || dist2(mesh, ctx.wrapDeltaX, ctx.wrapDeltaZ, st.roamTarget.x, st.roamTarget.z) < ARRIVE_DIST * ARRIVE_DIST) {
          st.roamTarget = randomRoam(ctx.colliders);
        }
        move = { x: st.roamTarget.x, z: st.roamTarget.z, speed: ROAM_SPEED };
      }
    }

    if (move) {
      const dx = ctx.wrapDeltaX(mesh.position.x, move.x);
      const dz = ctx.wrapDeltaZ(mesh.position.z, move.z);
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, move.speed * delta);
      if (d > 0.0001) {
        mesh.position.x = ctx.wrapX(mesh.position.x + (dx / d) * step);
        mesh.position.z = ctx.wrapZ(mesh.position.z + (dz / d) * step);
        mesh.rotation.y = Math.atan2(dx, dz);
      }
    }

    // little body bob while it runs
    mesh.position.y = Math.abs(Math.sin(p)) * 0.05;
  }

  return { mesh, update };
}
