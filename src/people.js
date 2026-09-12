import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { rectCircleIntersect } from './modules/world.js';

// ===== Pedestrians =====
// Simple low-poly people whose legs/arms swing while they walk. The model's
// front faces +Z, so rotation.y = atan2(dx, dz) points it toward its target.
// Each person patrols a list of waypoints (ping-pong), or loops them (park).

const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 0.9 });

function makePerson(shirtColor, pantsColor) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.26), shirtMat);
  torso.position.y = 0.98;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), skinMat);
  head.position.y = 1.42;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), hairMat);
  hair.position.y = 1.5;
  hair.scale.set(1, 0.55, 1);
  group.add(hair);

  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.68, 0);
  const legLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.17), pantsMat);
  legLMesh.position.y = -0.31;
  legL.add(legLMesh);
  group.add(legL);

  const legR = new THREE.Group();
  legR.position.set(0.11, 0.68, 0);
  const legRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.17), pantsMat);
  legRMesh.position.y = -0.31;
  legR.add(legRMesh);
  group.add(legR);

  const armL = new THREE.Group();
  armL.position.set(-0.32, 1.16, 0);
  const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.12), shirtMat);
  armLMesh.position.y = -0.28;
  armL.add(armLMesh);
  group.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.32, 1.16, 0);
  const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.12), shirtMat);
  armRMesh.position.y = -0.28;
  armR.add(armRMesh);
  group.add(armR);

  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  return group;
}

const SHIRTS = [0x3f7d41, 0xd05a3a, 0x3a5ba0, 0xb8a13a, 0x7d3a6b, 0x3a8f8f, 0xd98c3a, 0x5a3d8f, 0xc23b3b, 0x2f8f6f];
const PANTS = [0x2b3a4a, 0x3a2b28, 0x232323, 0x4a3a2b, 0x2f3a2f];

// Panic behaviour: how close the player car / robot has to get, how fast they
// sprint while fleeing, and how long they keep running once the coast is clear.
// Arcade logic: when afraid they really book it — twice as fast as the player
// car's top speed (14), so they genuinely get away from you.
const FLEE_PLAYER_TRIGGER = 8;
const FLEE_ROBOT_TRIGGER = 14;   // the robot is bigger and scarier
const FLEE_SPEED = 28;           // panic sprint speed — 2x the car's top speed
const FLEE_TIME = 2.0;           // seconds to keep panicking after safe

export function addPeople(scene) {
  const people = [];
  let shirtIdx = 0;

  // (x, z) start position, waypoints, speed; loop=true keeps circling.
  const add = (x, z, path, speed, loop = false) => {
    const person = makePerson(SHIRTS[shirtIdx % SHIRTS.length], PANTS[(shirtIdx * 7) % PANTS.length]);
    shirtIdx++;
    person.position.set(x, 0, z);
    scene.add(person);
    people.push({
      mesh: person,
      path,
      waypoint: 0,
      step: 1,
      speed,
      loop,
      phase: Math.random() * Math.PI * 2,
      flee: null,   // { dirX, dirZ, timer } while panicking, else null
    });
  };

  // Sidewalk promenades (patrol back and forth) — the z=42 walk detours north
  // around the mine pit (x -61..-49, z 32..44) so nobody walks into the hole.
  const promenade = [
    { x: -70, z: 42 }, { x: -62, z: 42 }, { x: -62, z: 46 },
    { x: -48, z: 46 }, { x: -48, z: 42 }, { x: 70, z: 42 },
  ];
  add(-40, 42, promenade, 1.5);
  add(5, 42, promenade, 1.1);
  add(55, 42, promenade, 1.7);
  add(-30, -42, [{ x: -70, z: -42 }, { x: 70, z: -42 }], 1.3);
  add(15, -42, [{ x: -70, z: -42 }, { x: 70, z: -42 }], 1.6);
  add(50, -42, [{ x: -70, z: -42 }, { x: 70, z: -42 }], 1.2);
  add(42, 30, [{ x: 42, z: 70 }, { x: 42, z: -70 }], 1.4);
  add(42, -25, [{ x: 42, z: 70 }, { x: 42, z: -70 }], 1.8);
  add(-42, -15, [{ x: -42, z: 70 }, { x: -42, z: -70 }], 1.3);
  add(-42, 40, [{ x: -42, z: 70 }, { x: -42, z: -70 }], 1.6);

  // Park goers circle the pond
  const parkPath = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parkPath.push({ x: 62 + Math.cos(a) * 7, z: 62 + Math.sin(a) * 7 });
  }
  add(69, 62, parkPath, 1.2, true);
  add(62, 55, parkPath, 1.5, true);

  // Someone crossing the parking lot
  add(-62, -60, [{ x: -76, z: -60 }, { x: -48, z: -60 }], 1.4);

  function update(delta, threats = {}) {
    for (const p of people) {
      // Find the nearest threat close enough to scare them (player car or robot)
      let closest = null;
      const consider = (pos, trigger) => {
        if (!pos) return;
        const dx = pos.x - p.mesh.position.x;
        const dz = pos.z - p.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < trigger && (!closest || d < closest.dist)) closest = { dx, dz, dist: d };
      };
      consider(threats.player, FLEE_PLAYER_TRIGGER);
      consider(threats.robot, FLEE_ROBOT_TRIGGER);

      if (closest) {
        if (!p.flee) {
          // Kick off a sprint — scatter angle so they don't all run in one line
          const ang = Math.atan2(-closest.dx, -closest.dz) + (Math.random() - 0.5) * 1.6;
          p.flee = {
            dirX: Math.sin(ang),
            dirZ: Math.cos(ang),
            timer: FLEE_TIME + Math.random() * 1.2,
          };
        } else {
          // Keep re-aiming away from the moving threat while it's near
          const ang = Math.atan2(-closest.dx, -closest.dz) + Math.sin(p.phase * 3) * 0.2;
          p.flee.dirX = Math.sin(ang);
          p.flee.dirZ = Math.cos(ang);
          p.flee.timer = Math.max(p.flee.timer, 0.5);
        }
      }

      if (p.flee) {
        // Panicked sprint directly away from the threat — they really book it,
        // outrunning even the player car at full throttle
        const move = FLEE_SPEED * delta;
        p.mesh.position.x += p.flee.dirX * move;
        p.mesh.position.z += p.flee.dirZ * move;
        p.mesh.rotation.y = Math.atan2(p.flee.dirX, p.flee.dirZ);
        // Fast run cycle — legs kick hard, arms THROWN UP in the air and
        // waving while they bolt (that's how you know they're scared)
        p.phase += delta * 18;   // sprint cadence
        p.mesh.userData.legL.rotation.x = Math.sin(p.phase) * 0.95;
        p.mesh.userData.legR.rotation.x = Math.sin(p.phase + Math.PI) * 0.95;
        p.mesh.userData.armL.rotation.x = Math.PI + Math.sin(p.phase * 4) * 0.2;
        p.mesh.userData.armR.rotation.x = Math.PI + Math.sin(p.phase * 4 + Math.PI) * 0.2;
        // Wind down once the threat is gone
        if (!closest) {
          p.flee.timer -= delta;
          if (p.flee.timer <= 0) p.flee = null;
        }
      } else {
        // Normal patrol along waypoints
        const target = p.path[p.waypoint];
        const dx = target.x - p.mesh.position.x;
        const dz = target.z - p.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.08) {
          p.waypoint += p.step;
          if (p.waypoint >= p.path.length) {
            if (p.loop) p.waypoint = 0;
            else { p.waypoint = p.path.length - 1; p.step = -1; }
          } else if (p.waypoint < 0) {
            p.waypoint = 0;
            p.step = 1;
          }
          continue;
        }
        const move = Math.min(p.speed * delta, dist);
        const nx = p.mesh.position.x + (dx / dist) * move;
        const nz = p.mesh.position.z + (dz / dist) * move;
        // Never walk into the mine pit (aiOnly colliders) — stop at the edge.
        const aiOnly = threats.aiOnly || [];
        if (!aiOnly.some((c) => rectCircleIntersect(nx, nz, c, 0.4))) {
          p.mesh.position.x = nx;
          p.mesh.position.z = nz;
        }
        p.mesh.rotation.y = Math.atan2(dx, dz);   // model front is +Z
        // Walk cycle — legs and arms swing out of phase
        p.phase += delta * p.speed * 3.2;
        p.mesh.userData.legL.rotation.x = Math.sin(p.phase) * 0.6;
        p.mesh.userData.legR.rotation.x = Math.sin(p.phase + Math.PI) * 0.6;
        p.mesh.userData.armL.rotation.x = Math.sin(p.phase + Math.PI) * 0.45;
        p.mesh.userData.armR.rotation.x = Math.sin(p.phase) * 0.45;
      }

      // Keep everyone on the map (fleeing can push people toward the edge)
      p.mesh.position.x = Math.max(-88, Math.min(88, p.mesh.position.x));
      p.mesh.position.z = Math.max(-88, Math.min(88, p.mesh.position.z));
    }
  }

  return { people, update };
}
