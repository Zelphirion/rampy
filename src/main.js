import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { buildMap, updateHoveringRings } from './map.js?v=1787160950000';
import { addProps, updateFountains, updateHydrantSprays, resetHydrantSprays, POTHOLE, standingCones } from './props.js?v=1787180000000';
import { createCar, addTrafficCars } from './cars.js';
import { addFiretruck } from './firetruck.js?v=1787162000000';
import { addPeople } from './people.js';
import { addRobot } from './robot.js';
import { addTrain } from './train.js';
import { addLizard } from './lizard.js';
import { updateKnockables, knockAt, resetKnockables } from './physics.js';
import { createFlatCarState, getFlatCarScaleY, stepFlatCarState } from './carFlatMode.mjs';
import {
  worldXLo,
  worldXHi,
  worldZLo,
  worldZHi,
  worldXHalf,
  worldZHalf,
  worldSizeX,
  worldSizeZ,
  worldXSpan,
  worldZSpan,
  wrapCoordX,
  wrapCoordZ,
  wrappedDeltaX,
  wrappedDeltaZ,
  ROAD_SPAN,
  ROAD_HALF,
  wrapRoad,
  rectCircleIntersect,
} from './modules/world.js';
import {
  isInVortexReturnZone,
  isInsideLevitationHall,
  isStillWithinLevitationHall,
  isInMineDiveTrigger,
  isInUndergroundReturnZone,
} from './modules/portalRules.js';
import { buildRampWorld, buildRampWorldProps, createClouds, createWheelOfDeath, buildRampWorldRamps, createVortex, rampWorldFeatures, wheelOfDeathDef, wheelOfDeathPaddles, buildHammers, createTrebuchet, createRollingBoulder } from './levels/rampworld/index.js';
import { addUnderground, UNDERGROUND_Y, tunnelPoint } from './levels/underground/index.js';

// ===== World bounds / wrap helpers =====
// Shared torus-map math lives in modules/world.js so main.js stays focused on
// gameplay and scene wiring.

// ===== Scene, camera, renderer =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07101c);
scene.fog = new THREE.FogExp2(0x07101c, 0.01);   // light haze so the ramp flight stays visible when the camera zooms out

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);

const cameraOrbit = {
  radius: 8,
  phi: 1.25,
  minPhi: 0.6,
  maxPhi: 1.45,
};
// Eased camera distance from the car. It pulls way out when the giant robot is
// close so its whole body — and face — stays in view the whole time.
let camRadius = cameraOrbit.radius;
const ROBOT_CAM_DIST = 55;        // robot within this many units starts zooming out
const ROBOT_CAM_MAX_RADIUS = 42;  // fully zoomed distance when the robot is right on you
// User yaw offset (radians) added to the car's heading for the chase cam
let cameraYawOffset = 0;
const cameraTarget = new THREE.Vector3(0, 0.6, 0);
const _lookTarget = new THREE.Vector3(0, 0.6, 0);      // persistent across frames
const _mineCamTarget = new THREE.Vector3();   // reused each frame during mine dive
const _mineLookTarget = new THREE.Vector3();
const _levCamTarget = new THREE.Vector3();    // reused each frame during levitation
const _levLookTarget = new THREE.Vector3();
// Initial camera sits behind the car (car faces -X at spawn)
const startX = cameraOrbit.radius * Math.sin(cameraOrbit.phi);
const startY = cameraOrbit.radius * Math.cos(cameraOrbit.phi) + 2.2;
const startZ = 0;
camera.position.set(startX, startY, startZ);
// Camera's eased offset from the car, kept in the "wrapped" frame so it stays
// small and never spans the map when the car wraps around the seam.
const camOffset = new THREE.Vector3(startX, startY - 0.8, 0);
let isDragging = false;
let dragStart = { x: 0, y: 0, yaw: 0, phi: cameraOrbit.phi };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ===== Lights =====
const hemiLight = new THREE.HemisphereLight(0xb9d7ff, 0x283322, 1.2);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff2c2, 1.3);
dirLight.position.set(18, 24, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -95;
dirLight.shadow.camera.right = 95;
dirLight.shadow.camera.top = 95;
dirLight.shadow.camera.bottom = -95;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 200;
dirLight.shadow.bias = -0.0003;
dirLight.shadow.normalBias = 0.02;   // suppresses shadow acne on the flat road/ground
scene.add(dirLight);

// ===== Build the world =====
const { buildingColliders, ramps } = buildMap(scene);
const { trafficLights, fountains, mineColliders } = addProps(scene);
const traffic = addTrafficCars(scene);
const { people, update: updatePeople } = addPeople(scene);

// ===== Small spinning arrow marking the map's top-left ("northwest") corner =====
// The minimap renders north (+z) up and east (+x) LEFT — a true view-from-
// above, so turns match the driving (see drawMinimap). On that layout the
// corner players read as "northwest" is the TOP-LEFT one: world
// (worldXHi, worldZHi) = (90, 123), the far corner of the mega-ramp grass
// field. The marker lies directly ON the ground there: a dart-like arrow
// whose tip touches the exact corner point, tail raised just enough to clear
// the grass, spinning on its own long axis. Its materials ignore the fog so
// it stays visible from anywhere on the map.
const nwCornerAim = new THREE.Vector3(worldXHi, 0, worldZHi);   // the exact corner, at grass level
const nwArrowTailDir = new THREE.Vector3(-2.8, 0.7, -2.8);      // from the tip toward the tail: into the map & slightly up
function createNwCornerArrow() {
  const group = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xff9500, emissiveIntensity: 0.55, roughness: 0.45, metalness: 0.2, fog: false });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xff4b2e, emissive: 0xd41f00, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.2, fog: false });
  const finMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0x885500, emissiveIntensity: 0.35, roughness: 0.6, side: THREE.DoubleSide, fog: false });

  // Built along +Y with the tip at the top: shaft (26 long) + head cone
  // (14 tall) = 40 units of arrow. Three fletching fins at the tail break the
  // symmetry so the spin around the long axis actually reads from a distance.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.6, 26, 20), shaftMat);
  shaft.position.y = -7;
  group.add(shaft);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 2.2, 20), shaftMat);
  collar.position.y = 6.4;
  group.add(collar);

  const head = new THREE.Mesh(new THREE.ConeGeometry(6.4, 14, 20), headMat);
  head.position.y = 13;
  group.add(head);

  const finGeo = new THREE.BoxGeometry(0.5, 9, 5.5);
  finGeo.translate(0, -13.5, 3.4);   // push each fin out from the shaft, near the tail
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.rotation.y = (i * Math.PI * 2) / 3;
    group.add(fin);
  }

  // Shrink the big-arrow build down to a small ground dart (~7 units long)
  group.scale.setScalar(0.175);

  // Plant the tip exactly ON the corner point: the group origin sits half the
  // arrow's true length back along the tail direction, and +Y (the tip
  // direction) aims straight at the corner.
  const halfLen = 20 * 0.175;
  const tailUnit = nwArrowTailDir.clone().normalize();
  group.position.copy(nwCornerAim).addScaledVector(tailUnit, halfLen);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tailUnit.clone().negate());
  scene.add(group);
  return group;
}
const nwArrow = createNwCornerArrow();
function updateNwCornerArrow(delta) {
  // Spin on its own long axis (local Y after the aim tilt)
  nwArrow.rotateY(delta * 2.4);
}

// The map is a full torus — there are NO invisible edge walls bumping you back;
// drive off any side and you wrap around to the opposite edge. Ghost building
// colliders across the wrap seams (the 8 neighboring copies of the world) keep
// collisions continuous at the edges: x ghosts are spaced one x-span (180)
// apart, z ghosts one z-span (213).
const colliders = [...buildingColliders, ...mineColliders];
for (const c of buildingColliders) {
  for (const ox of [-worldSizeX, 0, worldSizeX]) {
    for (const oz of [-worldSizeZ, 0, worldSizeZ]) {
      if (ox === 0 && oz === 0) continue;
      colliders.push({ x: c.x + ox, z: c.z + oz, halfW: c.halfW, halfD: c.halfD, h: c.h });
    }
  }
}

// ===== Collision helpers =====
const playerCarRadius = 2.2;
const aiCarRadius = 1.15;
const bumperBaseSpeed = 5;

// rectCircleIntersect is shared torus/world math — imported from modules/world.js.

function isPositionBlocked(x, z, radius) {
  const list = worldState === 'underground' ? ugColliders : colliders;
  // `soft` colliders (the underground elevator deck) never block driving —
  // they only feed buildingTopAt so you can land on / ride the moving deck.
  return list.some((collider) => !collider.soft && rectCircleIntersect(x, z, collider, radius));
}

// Traffic cars are moving obstacles: check a position against every car on the
// road (wrap-aware, so the seam behaves like a torus).
const trafficCarRadius = 1.6;
function isPositionBlockedByTraffic(x, z, radius) {
  for (const t of traffic) {
    const dx = wrappedDeltaX(x, t.mesh.position.x);
    const dz = wrappedDeltaZ(z, t.mesh.position.z);
    if (dx * dx + dz * dz <= (radius + trafficCarRadius) * (radius + trafficCarRadius)) return true;
  }
  return false;
}

// The autonomous fire engine is a big moving obstacle for the player too.
const firetruckColliderR = 2.0;
function isPositionBlockedByFiretruck(x, z, radius) {
  const dx = wrappedDeltaX(x, firetruck.truck.position.x);
  const dz = wrappedDeltaZ(z, firetruck.truck.position.z);
  return dx * dx + dz * dz <= (radius + firetruckColliderR) * (radius + firetruckColliderR);
}

// And the giant robot is a colossal moving obstacle — you can't drive through
// its legs (unless it's currently holding you in its claw).
function isPositionBlockedByRobot(x, z, radius) {
  const dx = wrappedDeltaX(x, robot.mesh.position.x);
  const dz = wrappedDeltaZ(z, robot.mesh.position.z);
  return dx * dx + dz * dz <= (radius + robot.radius) * (radius + robot.radius);
}

// Car-following: target following gap and hard-stop gap behind the car ahead.
const CAR_FOLLOW_GAP = 4.5;
const CAR_FOLLOW_STOP = 3.0;

// Distance to the nearest car ahead in the same lane (same road, same
// direction, travelling the same way). Measured along the travel direction so
// the wrap seam is handled; Infinity if the lane is clear ahead.
function distanceToCarAhead(t) {
  let best = Infinity;
  for (const u of traffic) {
    if (u === t || u.axis !== t.axis || u.dir !== t.dir) continue;
    const offT = t.axis === 'x' ? t.mesh.position.z : t.mesh.position.x;
    const offU = u.axis === 'x' ? u.mesh.position.z : u.mesh.position.x;
    if (Math.abs(offT - offU) > 0.5) continue;   // different lane offset
    const travelT = t.axis === 'x' ? t.mesh.position.x : t.mesh.position.z;
    const travelU = u.axis === 'x' ? u.mesh.position.x : u.mesh.position.z;
    const ahead = (((travelU - travelT) * t.dir) % ROAD_SPAN + ROAD_SPAN) % ROAD_SPAN;
    if (ahead > 0 && ahead < best) best = ahead;
  }
  return best;
}

// Distance ahead along a lane to another vehicle (wrapped/toroidal units), or
// Infinity if that vehicle isn't in the lane ahead. Used so traffic brakes for
// the player and the fire engine when they're standing in its lane — before,
// traffic drove straight through you.
function aheadDist(meX, meZ, meDir, meAxis, otherX, otherZ) {
  const offMe = meAxis === 'x' ? meZ : meX;
  const offOther = meAxis === 'x' ? otherZ : otherX;
  if (Math.abs(offMe - offOther) > 1.6) return Infinity;   // not in my lane
  const tMe = meAxis === 'x' ? meX : meZ;
  const tOther = meAxis === 'x' ? otherX : otherZ;
  const ahead = (((tOther - tMe) * meDir) % ROAD_SPAN + ROAD_SPAN) % ROAD_SPAN;
  return ahead > 0 ? ahead : Infinity;
}

// Everything a traffic car should brake for ahead of it: the car ahead in its
// own lane, the player, and the fire engine — whichever is nearest.
function distanceToObstacleAhead(t) {
  let best = distanceToCarAhead(t);
  const mx = t.mesh.position.x;
  const mz = t.mesh.position.z;
  const p = aheadDist(mx, mz, t.dir, t.axis, car.position.x, car.position.z);
  if (p < best) best = p;
  const f = aheadDist(mx, mz, t.dir, t.axis, firetruck.truck.position.x, firetruck.truck.position.z);
  if (f < best) best = f;
  // Traffic also brakes for the robot's legs if they're close enough to the
  // lane to actually block it (its body is much wider than a car).
  const robOff = t.axis === 'x' ? Math.abs(mz - robot.mesh.position.z) : Math.abs(mx - robot.mesh.position.x);
  if (robOff <= robot.radius + 1.0) {
    const r = aheadDist(mx, mz, t.dir, t.axis, robot.mesh.position.x, robot.mesh.position.z);
    if (r < best) best = r;
  }
  return best;
}

// Traffic de-overlap: if two cars ever end up in the same spot (e.g. both
// committed inside the intersection at the same time), remove BOTH so traffic
// never stacks up. Runs after the cars move, wrap-aware like everything else.
function deOverlapTraffic() {
  const doomed = new Set();
  for (let i = 0; i < traffic.length; i++) {
    for (let j = i + 1; j < traffic.length; j++) {
      const a = traffic[i];
      const b = traffic[j];
      const dx = wrappedDeltaX(a.mesh.position.x, b.mesh.position.x);
      const dz = wrappedDeltaZ(a.mesh.position.z, b.mesh.position.z);
      if (dx * dx + dz * dz < 2.0 * 2.0) {
        doomed.add(i);
        doomed.add(j);
      }
    }
  }
  if (doomed.size === 0) return;
  // Remove from the back so indices stay valid while splicing
  for (let i = traffic.length - 1; i >= 0; i--) {
    if (doomed.has(i)) {
      scene.remove(traffic[i].mesh);
      traffic.splice(i, 1);
    }
  }
  console.log(`[traffic] removed ${doomed.size} overlapping car(s)`);
}

// ===== Car-vs-car collisions (bounce) =====
// Every moving vehicle is treated as a circle. Each frame we push overlapping
// pairs apart along the line between them and give them a recoil so they
// visibly bounce off each other instead of driving straight through.
function carCollisionList() {
  const list = [];
  // Cars being held in the robot's claw are not driving — leave them out.
  if (!robot.playerCaptured) list.push({ mesh: car, radius: playerCarRadius, kind: 'player' });
  if (!robot.bumperCaptured) list.push({ mesh: bumperCar, radius: aiCarRadius, kind: 'bumper' });
  list.push({ mesh: firetruck.truck, radius: firetruckColliderR, kind: 'firetruck' });
  for (const t of traffic) list.push({ mesh: t.mesh, radius: trafficCarRadius, kind: 'traffic', t });
  return list;
}

// ===== Knock physics (cars get shoved aside with a spin) =====
// When the player (or the firetruck) smashes into a car, it gets a short
// rigid-body-style knock: it slides away from the hit AND spins around its
// centre, so the END that got hit swings away from you first (hit the trunk
// and the trunk end is the first to peel away). Velocity + spin both decay,
// then the car eases back to its lane and heading.
const trafficHalfLen = 2.15;   // createCar body is 4.3 x 1.8
const trafficHalfWid = 0.9;
const bumperHalfLen = 2.15 * 0.5;   // the blue car is scaled 0.5
const bumperHalfWid = 0.9 * 0.5;
const KNOCK_DECAY = 0.9;       // per-frame damping of the knock velocity/spin
const KNOCK_TIME = 0.7;        // seconds a knock lasts at most

// Build a knock state for a hit car. nx/nz = unit direction pushing it away
// from the other car; power = slide speed, spinPower = angular speed.
function makeKnock(mesh, halfLen, halfWid, nx, nz, power, spinPower) {
  const ry = mesh.rotation.y;
  const fx = -Math.cos(ry), fz = Math.sin(ry);   // the car's forward
  const rx = -fz, rz = fx;                        // the car's right
  const along = fx * nx + fz * nz;                // +front / -rear (trunk)
  const side = rx * nx + rz * nz;                 // +right / -left
  // Lever arm from the centre to the END/SIDE that got hit.
  const ex = Math.sign(along) * halfLen * fx + Math.sign(side) * halfWid * rx;
  const ez = Math.sign(along) * halfLen * fz + Math.sign(side) * halfWid * rz;
  // Spin direction: make the hit end's rotational velocity point away from
  // the hit (its angular velocity dotted with the push direction is positive).
  const dot = -ez * nx + ex * nz;
  const w = Math.abs(ex) + Math.abs(ez) < 0.01 ? 0 : (dot >= 0 ? 1 : -1) * spinPower;
  return { vx: power * nx, vz: power * nz, w, t: KNOCK_TIME };
}

// The heading (rotation.y) a traffic car should hold for its lane.
function laneHeading(t) {
  if (t.axis === 'x') return t.dir === -1 ? 0 : Math.PI;
  return t.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
}

// Recoil one car away from a collision. nx/nz = unit direction pushing it
// away from the other car.
function applyBounce(me, nx, nz, foeKind) {
  if (me.kind === 'player') {
    // Recoil the player's scalar speed: shoved forward if hit from behind,
    // knocked backward if hit head-on. Hitting a light car barely slows you
    // (it gets shoved out of the way); only the heavy truck stops you hard.
    const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
    dir.y = 0;
    dir.normalize();
    const align = dir.x * nx + dir.z * nz;
    const heavy = foeKind === 'firetruck';
    const knock = heavy ? (align >= 0 ? 3.2 : -3.8) : (align >= 0 ? 2.2 : -1.0);
    velocity.value = THREE.MathUtils.clamp(velocity.value * 0.5 + knock, -6, 6);
    shake.intensity = Math.max(shake.intensity, heavy ? 0.15 : 0.07);
  } else if (me.kind === 'traffic') {
    const t = me.t;
    if (!t.knock && (foeKind === 'player' || foeKind === 'firetruck')) {
      // A hard hit: knock the car aside with a spin (the end you hit swings
      // away first), then it eases back to its lane and heading. Only the
      // first contact counts — a car already tumbling isn't re-knocked.
      const power = foeKind === 'player' ? 12 : 9;
      const spin = foeKind === 'player' ? 3.6 : 2.8;
      t.knock = makeKnock(t.mesh, trafficHalfLen, trafficHalfWid, nx, nz, power, spin);
    } else {
      // Traffic nudging traffic: just a small along-lane recoil, no spin-out.
      const along = (t.axis === 'x' ? nx : nz) * t.dir;
      t.bounceRecoil = (along >= 0 ? 1 : -1) * 2.2;
    }
  } else if (me.kind === 'firetruck') {
    // The truck recoils along X internally (bump overrides its driving).
    firetruck.bump(nx, nz);
  } else if (me.kind === 'bumper') {
    // The little blue car gets knocked out of the way too (and spun) — its
    // AI is paused while it tumbles, then it resumes chasing. Same rule: one
    // discrete knock per hit, no compounding while it's still tumbling.
    if (!bumperKnock && (foeKind === 'player' || foeKind === 'firetruck')) {
      const power = foeKind === 'player' ? 13 : 10;
      const spin = foeKind === 'player' ? 4.2 : 3.2;
      bumperKnock = makeKnock(bumperCar, bumperHalfLen, bumperHalfWid, nx, nz, power, spin);
    }
  }
}

function resolveCarCollisions() {
  const list = carCollisionList();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      // The player is flying over everything while airborne (mega ramp), so
      // ground cars must not shove it around mid-flight — car collisions are
      // 2D (altitude-blind), which would otherwise brake the car over the
      // busy intersection before it lands.
      if ((a.kind === 'player' && jumpState.inAir) || (b.kind === 'player' && jumpState.inAir)) continue;
      const dx = wrappedDeltaX(a.mesh.position.x, b.mesh.position.x);
      const dz = wrappedDeltaZ(a.mesh.position.z, b.mesh.position.z);
      const minDist = a.radius + b.radius;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= minDist * minDist) continue;
      const dist = Math.sqrt(dist2) || 0.001;
      const nx = dx / dist;   // unit normal pointing a -> b
      const nz = dz / dist;
      const overlap = minDist - dist;
      // Split the separation by mass: the player is heaviest, then the truck;
      // smaller AI cars yield the most so they don't shove the player around.
      const aMass = a.kind === 'player' ? 3 : a.kind === 'firetruck' ? 2 : 1;
      const bMass = b.kind === 'player' ? 3 : b.kind === 'firetruck' ? 2 : 1;
      const total = aMass + bMass;
      a.mesh.position.x -= nx * overlap * (bMass / total);
      a.mesh.position.z -= nz * overlap * (bMass / total);
      b.mesh.position.x += nx * overlap * (aMass / total);
      b.mesh.position.z += nz * overlap * (aMass / total);
      // Recoil both cars so they bounce apart (foeKind lets a car know who
      // hit it — the player's hits shove light cars out of the way harder).
      applyBounce(a, -nx, -nz, b.kind);
      applyBounce(b, nx, nz, a.kind);
    }
  }
  // Re-wrap any cars the separation pushed across a map seam.
  for (const c of list) {
    c.mesh.position.x = wrapCoordX(c.mesh.position.x);
    c.mesh.position.z = wrapCoordZ(c.mesh.position.z);
  }
}

// 4-way traffic light signal for a given road axis, on a 12s cycle:
//   0-4.5  E/W green, N/S red | 4.5-5.5 E/W amber | 5.5-10 N/S green
//   10-11  N/S amber          | 11-12 all red
// Returns 0=red, 1=amber, 2=green.
function axisSignal(elapsed, axis) {
  const t = elapsed % 12;
  if (axis === 'x') {
    if (t < 4.5) return 2;
    if (t < 5.5) return 1;
    return 0;
  }
  if (t < 5.5) return 0;
  if (t < 10) return 2;
  if (t < 11) return 1;
  return 0;
}

// ===== Cars =====
const car = createCar(0xa61e1e);
car.position.set(0, 0.15, 0);
scene.add(car);

// Autonomous fire engine: patrols the roads and douses roof fires on its own.
const firetruck = addFiretruck(scene);

// Giant eating robot: stomps around the city, chases down cars, picks them
// up and eats them. The player gets eaten too (and respawns).
const robot = addRobot(scene);

// Freight train circling the town on rails outside it: locomotive + 4 boxcars
// + caboose. Knockable / wobbles when you run into it, but never derails.
const train = addTrain(scene);

// Small flame lizard: scurries around town and sets buildings on fire. It is
// the only thing that relights doused buildings, so it keeps the fire engine
// busy. Flees the robot and the player car.
const lizard = addLizard(scene);

const bumperCar = createCar(0x1e7ea6);
bumperCar.scale.set(0.5, 0.5, 0.5);
bumperCar.position.set(10, 0.15, -18);
bumperCar.rotation.y = 0;
scene.add(bumperCar);

// ===== Game state =====
const keys = {};
const velocity = { value: 0 };
const steering = { value: 0 };
const jumpState = { yVelocity: 0, inAir: false };
const gravity = 18;
const groundHeight = 0.15;
let flatCarState = createFlatCarState(false);
let wasOnRamp = null;   // { runX, runZ } of the ramp the car just drove off
let currentRamp = null; // ramp the car is ON right now (for body tilt)
// Ramp-world terrain pitch target: the car rides the dirt on its FRONT and
// REAR axles separately, so the nose rocks up as the front wheels crest a
// bump and the tail rocks up as the rear wheels follow (instead of the whole
// car rising flat and level). Recomputed every frame on grounded terrain.
let terrainPitch = 0;

// ===== Building levitation (portal building at 56,20) =====
// 1.2 seconds after driving inside the big open-front hall, the car levitates
// upward through the roof, then teleports to the ramp world once it has
// floated well clear — long enough for the ground-level camera to watch it go.
const buildingLevitate = {
  active: false,
  timer: 0,          // counts up from 0 once car enters the building
  levitating: false,  // true once the 1.2s delay is over and the car rises
  levitateTime: 0,    // time since levitation started
  x: 56, z: 20,       // building centre (open side faces EAST, away from town — a surprise)
  w: 14, d: 14, h: 10, // building dimensions — roomy, no wall-scraping
};

// ===== Mine shaft portal (entrance at -55,50, tunnel faces north) =====
// Driving deep into the mine tunnel triggers a dive animation: first the
// car's nose tips forward/down as if descending into the earth, then the
// rest of the car follows it under — about 4 seconds end to end — before
// it teleports to the underground world.
const minePortal = {
  active: false,       // true when the car is inside the trigger zone
  timer: 0,            // counts up once active — teleport at diveTotal
  baseY: 0,            // car's ground height when the dive started
  tiltTime: 1.6,       // seconds spent just dipping the nose (phase 1)
  diveTotal: 4.0,      // total seconds of dive before the underground swap
  maxTilt: 0.6,        // nose-down angle at the end of phase 1 (~34°)
  rearAxle: 1.0,       // pivot centre → rear axle distance (tilt pivot)
  triggerX: -55,       // X centre of the tunnel
  triggerXHalf: 2.2,   // half-width of the trigger zone in X
  triggerZ: 42,        // Z threshold — deep in tunnel near the crystals (south)
};

function flattenCarFromRock() {
  if (flatCarState.phase === 'bounce') return;
  flatCarState.active = true;
  flatCarState.phase = 'flat';
  flatCarState.timer = 0;
}

function updateFlatCarState(delta) {
  const isDriving = worldState === 'ramp' && flatCarState.active && flatCarState.phase === 'flat' && Math.abs(velocity.value) > 0.8;
  flatCarState = stepFlatCarState(flatCarState, delta, isDriving);
  const scaleY = flatCarState.active ? getFlatCarScaleY(flatCarState) : 1;
  car.scale.set(1, scaleY, 1);
}

// ===== Ramp world (the portal's destination — a bumpy twilight hillscape) =====
// A SECOND scene so the city stays intact in memory: while we're in the ramp
// world we stop rendering the city and switch the car over to this scene. On
// the way back we just switch it again.
let worldState = 'city';   // 'city' | 'ramp' | 'underground'
// Seconds to ignore portal triggers right after a teleport, so the car isn't
// instantly re-caught by the portal it just emerged from.
let portalGrace = 0;
const rampScene = new THREE.Scene();
rampScene.background = new THREE.Color(0x9566e8);       // bright twilight purple
// Light haze only — the ground plane is huge, and a dense fog would wash the
// whole dirt landscape into the lavender fog colour (making it look like the
// sky). At 0.0025 the dirt stays clearly visible out to the horizon.
rampScene.fog = new THREE.FogExp2(0xa87cf0, 0.0025);

const rampHemi = new THREE.HemisphereLight(0xc9b0ff, 0x5a3a6a, 1.6);
rampScene.add(rampHemi);
const rampDir = new THREE.DirectionalLight(0xffd2a0, 1.75);
rampDir.position.set(20, 30, 14);
rampDir.castShadow = true;
rampDir.shadow.mapSize.set(2048, 2048);
rampDir.shadow.camera.left = -95;
rampDir.shadow.camera.right = 95;
rampDir.shadow.camera.top = 95;
rampDir.shadow.camera.bottom = -95;
rampDir.shadow.camera.near = 0.1;
rampDir.shadow.camera.far = 200;
rampDir.shadow.bias = -0.0003;
rampDir.shadow.normalBias = 0.02;
rampScene.add(rampDir);

const rampWorld = buildRampWorld(rampScene);
const terrainHeightAt = rampWorld.terrainHeightAt;

// Ramp-world fun: launch ramps scattered over the hills + the swirling vortex
// you can drive around. These exist ONLY in the ramp world — the city keeps
// its own separate ramp set (buildMap) and has no vortex.
const { ramps: rampWorldRamps } = buildRampWorldRamps(rampScene, terrainHeightAt);
const vortex = createVortex(rampScene, 40, 40, terrainHeightAt);
// Drive under the vortex (within this horizontal radius of its centre) to
// warp back to the city — the ramp world's way home.
const vortexReturnRadius = 10;
// Soft drifting clouds + the spinning wheel of death — ramp world only.
const clouds = createClouds(rampScene);
const wheelOfDeath = createWheelOfDeath(rampScene, wheelOfDeathDef.x, wheelOfDeathDef.z, terrainHeightAt);

// Ramp-world knockable props: bowling pins, a linked domino run, barrels you
// shove aside and a timber yard of wobbling logs — all via the shared
// knockable system (physics.js).
const rampWorldProps = buildRampWorldProps(rampScene, terrainHeightAt);
rampWorldFeatures.props = rampWorldProps;

// ===== Tier 3 — the moving stuff =====
// Giant swinging hammers on the flattened straightaway, a trebuchet you drive
// into, and a rolling boulder that chases you. All animated + tested against
// the car in updateRampWorldDanger() (ramp world only).
const hammers = buildHammers(rampScene, terrainHeightAt);
const trebuchet = createTrebuchet(rampScene, rampWorldFeatures.trebuchet.x, rampWorldFeatures.trebuchet.z, terrainHeightAt);
const boulder = createRollingBoulder(rampScene, rampWorldFeatures.boulder.x, rampWorldFeatures.boulder.z, terrainHeightAt);
// The wheel of death gains a rim knock (see updateRampWorldDanger).
wheelOfDeath.cooldown = 0;

// ===== Underground world (the mine shaft portal destination) =====
// A third scene for the cavern beneath the map.  The mine shaft at (-55,50)
// is the portal entry — driving deep into the tunnel triggers a dive
// animation and teleports the car here, spawning high above the cavern
// floor so it falls in.  Driving into the tunnel foot returns to the city.
const undergroundScene = new THREE.Scene();
undergroundScene.background = new THREE.Color(0x120820);
undergroundScene.fog = new THREE.FogExp2(0x180e28, 0.003);

const ugHemi = new THREE.HemisphereLight(0x8866cc, 0x332244, 1.8);
undergroundScene.add(ugHemi);
const ugDir = new THREE.DirectionalLight(0xccbbdd, 1.2);
ugDir.position.set(10, 40, 10);
undergroundScene.add(ugDir);

// Crystal-tinted ambient — bright enough to see the cavern
const ugAmbCrystal = new THREE.PointLight(0x6644ff, 2.0, 140, 1);
ugAmbCrystal.position.set(-20, 18, 60);
undergroundScene.add(ugAmbCrystal);

// Purple sky glow from high above — gives the cavern a violet ceiling
const ugSkyGlow = new THREE.PointLight(0x9944ff, 2.5, 200, 1);
ugSkyGlow.position.set(0, 40, 40);
undergroundScene.add(ugSkyGlow);

// Additional warm fill light from above the tunnel foot area
const ugWarm = new THREE.PointLight(0xffaa66, 1.2, 110, 1);
ugWarm.position.set(-55, 8, 83);
undergroundScene.add(ugWarm);

// Far-cavern fill so the edges aren't pitch black
const ugFill = new THREE.PointLight(0x7755cc, 1.0, 160, 1);
ugFill.position.set(30, 20, 10);
undergroundScene.add(ugFill);

const undergroundWorld = addUnderground(undergroundScene, {
  // Task #13: sliding conduits shove the car along their travel direction
  // (hammer-strength slide + spin + small hop). dirX/dirZ is a unit axis.
  onPipeShove: (dirX, dirZ) => knockPlayerAway(dirX, dirZ, 120, 2.2, 3.2),
});
const ugColliders = undergroundWorld.colliders;
const ugRamps = undergroundWorld.ramps || [];

// ===== Portals =====
// The big open-front portal building at (56,20) is the city's gateway to the
// ramp world: its glowing ring doorway faces EAST (away from town), so you
// have to round the building to discover it — then roll in heading west,
// pause a moment, and the car levitates up through the roof into the sky.
// Returning from the ramp world is done by driving UNDER the vortex.

// ===== Ramp physics =====
// Find the ramp whose footprint contains (px, pz); returns { runX, runZ, s,
// height, len, boost } where s goes 0 (base, ground level) -> 1 (top, full height).
// `py` is the caller's height. A BOARD ramp (thin plank) is only a driveable
// surface near its top: if the point is more than a tolerance BELOW the
// surface (i.e. under the plank), it returns null so the car drives on the
// ground beneath it instead of being snapped up onto the board. `onRampDef`
// is the ramp the car was already riding last frame (or null) — it widens the
// tolerance while climbing so a fast climb or a dropped frame can't falsely
// drop the car into the "under the board" bucket and launch it early.
function rampInfoAt(px, pz, py, onRampDef) {
  for (const r of ramps) {
    const dx = px - r.x;
    const dz = pz - r.z;
    const along = dx * r.runX + dz * r.runZ;
    const perp = -dx * r.runZ + dz * r.runX;
    if (along >= -r.len / 2 && along <= r.len / 2 && Math.abs(perp) < r.width / 2) {
      const s = (along + r.len / 2) / r.len;
      const surf = groundHeight + r.height * s;
      if (r.board) {
        const tol = onRampDef === r ? r.stayTol : r.enterTol;
        if (py < surf - tol) return null;   // driving UNDER the plank
      }
      return { runX: r.runX, runZ: r.runZ, s, height: r.height, len: r.len, boost: r.boost, def: r };
    }
  }
  return null;
}
function rampSurfaceY(px, pz, py) {
  const info = rampInfoAt(px, pz, py);
  return info ? groundHeight + info.height * info.s : groundHeight;
}

// Ramp-world launch ramps: same footprint/surface math as the city ramps, but
// over the ramp world's own ramp list. Because that ground is bumpy, each ramp
// carries its own baseY (the terrain height under its centre), and the surface
// it presents is baseY + height*s — so the car rides the actual visible wedge.
function rampRampInfoAt(px, pz) {
  for (const r of rampWorldRamps) {
    const dx = px - r.x;
    const dz = pz - r.z;
    const along = dx * r.runX + dz * r.runZ;
    const perp = -dx * r.runZ + dz * r.runX;
    if (along >= -r.len / 2 && along <= r.len / 2 && Math.abs(perp) < r.width / 2) {
      const s = (along + r.len / 2) / r.len;
      return { runX: r.runX, runZ: r.runZ, s, height: r.height, len: r.len, boost: r.boost, baseY: r.baseY, def: r };
    }
  }
  return null;
}
// Surface height of a ramp-world ramp under a point (for landing on a ramp
// mid-air). -Infinity off a ramp so a max() with the terrain picks the terrain.
function rampRampSurfaceY(px, pz) {
  const info = rampRampInfoAt(px, pz);
  return info ? info.baseY + info.height * info.s : -Infinity;
}

// Highest rooftop surface (building top + roof lip) whose footprint contains
// the point, or 0 over open ground. Lets the car land on top of buildings
// when it flies (mega ramp) instead of sinking through them, and lets it drop
// off a roof edge back onto the street.
function buildingTopAt(x, z) {
  let top = 0;
  const list = worldState === 'underground' ? ugColliders : colliders;
  for (const c of list) {
    if (Math.abs(x - c.x) <= c.halfW && Math.abs(z - c.z) <= c.halfD) {
      top = Math.max(top, c.h + 0.3);
    }
  }
  return top;
}

// Underground course ramps: same footprint/surface math as the other ramp
// sets, but they sit on the flat cavern floor, so their base is y=0.
function ugRampInfoAt(px, pz) {
  for (const r of ugRamps) {
    const dx = px - r.x;
    const dz = pz - r.z;
    const along = dx * r.runX + dz * r.runZ;
    const perp = -dx * r.runZ + dz * r.runX;
    if (along >= -r.len / 2 && along <= r.len / 2 && Math.abs(perp) < r.width / 2) {
      const s = (along + r.len / 2) / r.len;
      return { runX: r.runX, runZ: r.runZ, s, height: r.height, len: r.len, boost: r.boost, def: r };
    }
  }
  return null;
}
// Surface height of an underground ramp under a point (for landing on the
// slope mid-air). -Infinity off a ramp so a max() with the floor picks y=0.
function ugRampSurfaceY(px, pz) {
  const info = ugRampInfoAt(px, pz);
  return info ? info.height * info.s : -Infinity;
}

// Current top of the underground elevator deck if (x,z) is inside its
// footprint, else 0. The level rewrites the deck collider's `h` every frame,
// so this tracks the moving platform exactly (task #17).
function ugElevatorTopAt(px, pz) {
  let top = 0;
  for (const c of ugColliders) {
    if (c.soft && Math.abs(px - c.x) <= c.halfW && Math.abs(pz - c.z) <= c.halfD) {
      top = Math.max(top, c.h);
    }
  }
  return top;
}
const bumperState = { speed: bumperBaseSpeed, stopped: false };
let bumperKnock = null;   // set when the player smashes the blue car aside
const bumperStopDistance = 3.4;     // ~1 foot of clearance before the blue car stops
const bumperResumeDistance = 4.6;   // drive past this and it chases you again
// Ramp world: the blue car follows you in after a short delay, knocks props
// over, and can be knocked around by you (and by the big dangers).
let bumperInRamp = false;
let bumperRampTimer = 20;   // seconds after entering the ramp world before it shows up
const BUMPER_RAMP_DELAY = 20;
const playerKnockRadius = 2.6;      // how far the player shoves props
const aiKnockRadius = 1.5;          // how far the blue car shoves props
const shake = { intensity: 0 };
// Pothole wobble — set when driving through the pothole on the main road
const potholeWobble = { active: false, t: 0 };
// Tier 3 knock impulse: a hammer / wheel-rim / boulder hit slides the car in
// world space AND spins it (like the bumper car's knock), plus a hop.
let playerKnock = null;
// The wheel of death (rim or a paddle) flings the car TWICE as far as a
// hammer does (hammers use power 130 → ~21 units; this → ~43 units).
const WHEEL_KNOCK_POWER = 260;

// Launch the player car sideways + spin + hop, away from a hit. nx/nz is the
// (unit) direction away from the thing that hit you. Adds a small random fan
// so no two hits feel identical.
function knockPlayerAway(nx, nz, power, spin, hop) {
  const px = -nz, pz = nx;                   // perpendicular
  const j = (Math.random() - 0.5) * 0.5;     // small random sideways fan
  nx = nx + px * j;
  nz = nz + pz * j;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len; nz /= len;
  playerKnock = makeKnock(car, 2.15, 0.9, nx, nz, power, spin);
  jumpState.inAir = true;
  jumpState.yVelocity = hop;
  velocity.value = Math.max(velocity.value, 4);
  shake.intensity = Math.max(shake.intensity, 0.55);
}

// The giant robot ate the player — put them back somewhere safe and out of
// its reach (the robot's post-meal cooldown also gives a moment of peace).
function respawnPlayer() {
  const candidates = [
    { x: 0, z: 30 }, { x: 40, z: 0 }, { x: 0, z: -40 }, { x: -40, z: 0 },
    { x: 30, z: 30 }, { x: -30, z: -30 }, { x: 30, z: -30 }, { x: -30, z: 30 },
    { x: 0, z: 0 },
  ];
  let spot = candidates[candidates.length - 1];
  for (const c of candidates) {
    const dx = wrappedDeltaX(c.x, robot.mesh.position.x);
    const dz = wrappedDeltaZ(c.z, robot.mesh.position.z);
    if (dx * dx + dz * dz < 30 * 30) continue;              // too close to the robot
    if (isPositionBlocked(c.x, c.z, playerCarRadius)) continue;  // inside a building
    spot = c;
    break;
  }
  car.visible = true;
  flatCarState = createFlatCarState(false);
  car.scale.set(1, 1, 1);
  car.position.set(spot.x, groundHeight, spot.z);
  car.rotation.set(0, 0, 0);
  velocity.value = 0;
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  shake.intensity = Math.max(shake.intensity, 0.3);
}

// The robot ate the blue car — drop it back in a distant corner.
function respawnBumper() {
  const candidates = [
    { x: 70, z: -40 }, { x: -70, z: 40 }, { x: 60, z: 60 }, { x: -60, z: -60 },
  ];
  let spot = candidates[0];
  for (const c of candidates) {
    const dxr = wrappedDeltaX(c.x, robot.mesh.position.x);
    const dzr = wrappedDeltaZ(c.z, robot.mesh.position.z);
    const dxp = wrappedDeltaX(c.x, car.position.x);
    const dzp = wrappedDeltaZ(c.z, car.position.z);
    if (dxr * dxr + dzr * dzr < 20 * 20) continue;
    if (dxp * dxp + dzp * dzp < 15 * 15) continue;
    if (isPositionBlocked(c.x, c.z, aiCarRadius)) continue;
    spot = c;
    break;
  }
  bumperCar.visible = true;
  bumperCar.scale.set(0.5, 0.5, 0.5);
  bumperCar.position.set(spot.x, groundHeight, spot.z);
  bumperCar.rotation.y = 0;
  bumperKnock = null;
  bumperState.stopped = false;
}

// ===== World switching (portal teleport) =====
// The car is moved between the two scenes; physics state is reset so the new
// world starts clean (the city's AI actors are all gated on worldState).
function enterRampWorld() {
  scene.remove(car);
  rampScene.add(car);
  worldState = 'ramp';
  // Leaving the city: stand every knocked-over prop back up (lamp posts,
  // benches, barrels, parked cars, ...) so the streets are tidy when you
  // come back through the portal.
  resetKnockables();
  resetHydrantSprays();
  portalGrace = 1.5;
  velocity.value = 12;
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  flatCarState = createFlatCarState(false);
  // The blue car will chase you in here after ~20 seconds.
  bumperInRamp = false;
  bumperRampTimer = BUMPER_RAMP_DELAY;
  bumperKnock = null;
  // Spawn on the rolling hills, facing +Z (north) onto the open ground (you
  // get back to the city by driving under the vortex).
  const sx = 0, sz = -45;
  car.position.set(sx, terrainHeightAt(sx, sz) + groundHeight, sz);
  car.rotation.set(0, Math.PI / 2, 0);
  shake.intensity = Math.max(shake.intensity, 0.5);
}

function enterCityWorld() {
  rampScene.remove(car);
  scene.add(car);
  worldState = 'city';
  // Leaving the ramp world: stand the bowling pins, dominoes, barrels and
  // logs back up so they're all ready to knock over again when you return.
  resetKnockables();
  resetHydrantSprays();
  // Driving under the ramp-world vortex dumps you back over the CENTRE of the
  // city: spawn high above the main intersection (0,0) and fall back down to
  // the streets (the ballistic code + flight camera handle the descent), with
  // a little forward speed so you can steer during the drop. The grace timer
  // stops the ring-building levitation from instantly re-catching the car.
  // the car as it drops.
  portalGrace = 1.5;
  velocity.value = 6;
  steering.value = 0;
  jumpState.inAir = true;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  flatCarState = createFlatCarState(false);
  // The blue car stayed behind in the ramp world — bring it back and drop it
  // in a quiet city corner.
  if (bumperInRamp) {
    rampScene.remove(bumperCar);
    scene.add(bumperCar);
    bumperInRamp = false;
    respawnBumper();
  }
  car.position.set(0, 40, 0);   // high above the town centre intersection
  car.rotation.set(0, -Math.PI / 2, 0);   // face -Z (south) — steer while falling
  shake.intensity = Math.max(shake.intensity, 0.5);
}

// City → Underground (mine shaft portal at -55,50)
function enterUndergroundWorld() {
  scene.remove(car);
  undergroundScene.add(car);
  worldState = 'underground';
  resetKnockables();
  resetHydrantSprays();
  portalGrace = 2.0;
  velocity.value = 8;
  steering.value = 0;
  jumpState.inAir = true;      // start airborne — fall from the sky
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  flatCarState = createFlatCarState(false);
  // Spawn high above the cavern, directly over the Holy Mountain centre
  // (-58, 104) so the car falls down onto the underground floor.
  const sx = -58, sz = 104;
  car.position.set(sx, 30, sz);
  car.rotation.set(0, Math.PI / 2, 0);   // face +Z (north)
  shake.intensity = Math.max(shake.intensity, 0.5);
  // Reset mine portal state
  minePortal.active = false;
  minePortal.timer = 0;
}

// Underground → City (drive into the tunnel foot in the underground)
function leaveUndergroundWorld() {
  undergroundScene.remove(car);
  scene.add(car);
  worldState = 'city';
  resetKnockables();
  resetHydrantSprays();
  portalGrace = 2.0;
  velocity.value = 6;
  steering.value = 0;
  jumpState.inAir = true;      // fall from above the mine shaft
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  flatCarState = createFlatCarState(false);
  // Spawn high above the mine shaft entrance, facing south so you land
  // on the road and can drive away.
  car.position.set(-55, 40, 31);  // above entrance (north side)
  car.rotation.set(0, -Math.PI / 2, 0);
  shake.intensity = Math.max(shake.intensity, 0.5);
}

// ===== Minimap =====
const minimap = document.getElementById('minimap');
const mmCtx = minimap.getContext('2d');
const mmScale = 0.8;
const mmCenter = 80;

function drawMinimap() {
  const ctx = mmCtx;
  ctx.clearRect(0, 0, 160, 160);

  // Ramp world backdrop: sandy terrain wash (drawn first so the debug grid
  // and crosshair stay on top).
  if (worldState === 'ramp') {
    ctx.fillStyle = 'rgba(150,110,60,0.28)';
    ctx.fillRect(0, 0, 160, 160);
  } else if (worldState === 'underground') {
    ctx.fillStyle = 'rgba(30,15,40,0.35)';
    ctx.fillRect(0, 0, 160, 160);
  }

  // ===== Orientation: rotate 180° — north up, NON-mirrored =====
  // Everything below draws with the original "+x right, +z down" maths, then
  // the whole layout is rotated 180° about the centre: +z (north) ends up at
  // the TOP and +x (east) on the LEFT.
  // Why 180° instead of a vertical mirror? This world labels +z as north,
  // which makes "north up AND east right" a MIRRORED map (the view from
  // below) — positions all looked right but every turn read backwards. A
  // 180° turn keeps the map a true view-from-above, so right turns are
  // clockwise on the map, exactly like the driving feels. Trade-off: east is
  // on the LEFT, so the SE corner sits bottom-left and NW top-right.
  // Net mapping: (x, y) -> (160 - x, 160 - y) — a 180° rotation about the
  // canvas centre (NOT translate-then-rotate, which would swing the whole
  // map off the top-left corner).
  ctx.save();
  ctx.translate(160, 160);
  ctx.scale(-1, -1);

  // ===== Debug coordinate grid: faint lines every 20 world units =====
  // x runs -90..90 (right..left after the rotation), z runs -90..123
  // (south..north; north is the TOP of the minimap, where the grass field /
  // mega ramp is).
  ctx.strokeStyle = 'rgba(150,175,215,0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let g = -80; g <= 80; g += 20) {
    const p = mmCenter + g * mmScale;
    ctx.moveTo(p, 0); ctx.lineTo(p, 160);   // constant x
    ctx.moveTo(0, p); ctx.lineTo(160, p);   // constant z
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120,120,130,0.65)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(mmCenter - 90 * mmScale, mmCenter); ctx.lineTo(mmCenter + 90 * mmScale, mmCenter);
  ctx.moveTo(mmCenter, mmCenter - 90 * mmScale); ctx.lineTo(mmCenter, mmCenter + 90 * mmScale);
  ctx.stroke();
  if (worldState === 'city') {
    ctx.fillStyle = 'rgba(190,190,200,0.5)';
    for (const c of buildingColliders) {
      const sx = mmCenter + c.x * mmScale;
      const sz = mmCenter + c.z * mmScale;
      ctx.fillRect(sx - c.halfW * mmScale, sz - c.halfD * mmScale, c.halfW * 2 * mmScale, c.halfD * 2 * mmScale);
    }
    // The mega launch ramp is intentionally NOT drawn on the minimap (it sits
    // at the north edge of the map, in the grass field that isn't shown either).
    ctx.fillStyle = '#3aa0ff';   // bumper car
    ctx.beginPath();
    ctx.arc(mmCenter + bumperCar.position.x * mmScale, mmCenter + bumperCar.position.z * mmScale, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8800';   // fire engine
    ctx.beginPath();
    ctx.arc(mmCenter + firetruck.truck.position.x * mmScale, mmCenter + firetruck.truck.position.z * mmScale, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00ffcc';   // giant robot
    ctx.beginPath();
    ctx.arc(mmCenter + robot.mesh.position.x * mmScale, mmCenter + robot.mesh.position.z * mmScale, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8a24a';   // freight train
    for (let i = 0; i < train.units.length; i++) {
      const u = train.units[i];
      ctx.beginPath();
      ctx.arc(mmCenter + u.position.x * mmScale, mmCenter + u.position.z * mmScale, i === 0 ? 3.4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff3333';   // active fires
    for (const f of firetruck.fires) {
      if (!f.active) continue;
      ctx.beginPath();
      ctx.arc(mmCenter + f.x * mmScale, mmCenter + f.z * mmScale, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff9a3c';   // flame lizard
    ctx.beginPath();
    ctx.arc(mmCenter + lizard.mesh.position.x * mmScale, mmCenter + lizard.mesh.position.z * mmScale, 2.2, 0, Math.PI * 2);
    ctx.fill();

  } else if (worldState === 'ramp') {
    // Ramp world minimap: sandy rolling terrain, the launch ramps, the vortex,
    // and the return portal
    // Launch ramps: a short line along each ramp's run (base -> high end)
    ctx.strokeStyle = '#d8b06a';
    ctx.lineWidth = 1.4;
    for (const r of rampWorldRamps) {
      const cx = mmCenter + r.x * mmScale;
      const cz = mmCenter + r.z * mmScale;
      const hx = (r.runX * r.len * 0.5) * mmScale;
      const hz = (r.runZ * r.len * 0.5) * mmScale;
      ctx.beginPath();
      ctx.moveTo(cx - hx, cz - hz);
      ctx.lineTo(cx + hx, cz + hz);
      ctx.stroke();
    }
    // The vortex: a purple ring with a small swirl mark at its centre
    ctx.strokeStyle = '#b070ff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(mmCenter + vortex.x * mmScale, mmCenter + vortex.z * mmScale, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mmCenter + vortex.x * mmScale, mmCenter + vortex.z * mmScale, 1.8, 0, Math.PI * 2);
    ctx.stroke();
    // The velodrome: a rounded banked bowl — drawn as an oval on the west side
    ctx.strokeStyle = '#9ab8d8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(
      mmCenter + rampWorldFeatures.velodrome.x * mmScale,
      mmCenter + rampWorldFeatures.velodrome.z * mmScale,
      rampWorldFeatures.velodrome.rx * mmScale,
      rampWorldFeatures.velodrome.rz * mmScale,
      0, 0, Math.PI * 2
    );
    ctx.stroke();
    // Skatepark: little dots at each half-pipe / bowl / lip
    ctx.fillStyle = '#c8d0e8';
    for (const e of rampWorldFeatures.skatepark) {
      ctx.beginPath();
      ctx.arc(mmCenter + e.x * mmScale, mmCenter + e.z * mmScale, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // The wheel of death: a big spinning hoop
    ctx.strokeStyle = '#ff5a20';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(
      mmCenter + rampWorldFeatures.wheelOfDeath.x * mmScale,
      mmCenter + rampWorldFeatures.wheelOfDeath.z * mmScale,
      rampWorldFeatures.wheelOfDeath.R * mmScale,
      0, Math.PI * 2
    );
    ctx.stroke();
    // Tier 3: the hammer gauntlet (red dots where the mallet heads hang, over
    // the road centre), the trebuchet (small amber square) and the rolling
    // boulder (grey dot that moves while it chases you).
    ctx.fillStyle = '#ff5a3a';
    for (const zz of rampWorldFeatures.hammerGauntlet.zs) {
      ctx.beginPath();
      ctx.arc(
        mmCenter + rampWorldFeatures.hammerGauntlet.side * mmScale,
        mmCenter + zz * mmScale,
        1.8, 0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.fillStyle = '#c8902a';
    ctx.fillRect(
      mmCenter + rampWorldFeatures.trebuchet.x * mmScale - 2,
      mmCenter + rampWorldFeatures.trebuchet.z * mmScale - 2,
      4, 4
    );
    ctx.fillStyle = '#9a9aa4';
    ctx.beginPath();
    ctx.arc(mmCenter + boulder.x * mmScale, mmCenter + boulder.z * mmScale, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff4444';   // player — elongated triangle pointing the way it's driving
  ctx.save();
  ctx.translate(mmCenter + car.position.x * mmScale, mmCenter + car.position.z * mmScale);
  // The car's front faces -X (car.rotation.y=0 -> -X). The 180° rotation is a
  // pure rotation (no mirroring), so the same nose angle that was correct in
  // the original unrotated maths still points the triangle along the car's
  // true screen motion after the rotate.
  ctx.rotate(Math.atan2(Math.sin(car.rotation.y), -Math.cos(car.rotation.y)));
  ctx.beginPath();
  ctx.moveTo(5.5, 0);    // nose
  ctx.lineTo(-3.5, 3);   // left rear
  ctx.lineTo(-3.5, -3);  // right rear
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Leave the mirrored space — everything from here on is TEXT, which must
  // not be drawn through the scale(1,-1) or the letters would be flipped.
  ctx.restore();

  // Axis numbers: x values along the top edge, z values down the left edge
  // (both shown in MAP coordinates: x=0 at the left edge, z=0 at the top
  // edge — the arrow's corner — counting up away from it). Ticks sit every 20
  // world units, so the numbers are offset by the corner's world position.
  // The x row counts UP left-to-right, matching screen-pixel habits.
  ctx.font = '7px sans-serif';
  ctx.fillStyle = 'rgba(160,180,220,0.55)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let g = -80; g <= 80; g += 20) ctx.fillText(String(worldXHi - g), mmCenter - g * mmScale, 1);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let g = -80; g <= 80; g += 20) ctx.fillText(String(worldZHi - g), 4, mmCenter - g * mmScale);
  ctx.fillStyle = 'rgba(160,180,220,0.65)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', 80, 1);   // north = +z = top of the minimap

  // ===== Map coordinates: (0,0) at the arrow corner (minimap top-left) =====
  // Shown as x/z to match Three.js axes: Y is UP (height) and stays reserved
  // for that, so the ground plane is x/z. Displayed map-style so it reads
  // like screen pixels: x counts UP from 0 at the LEFT edge of the minimap as
  // you drive right; z counts UP from 0 at the TOP edge as you drive down.
  // Origin = the arrow's corner, world (worldXHi, worldZHi). (Displayed x
  // grows as world x DEcreases because the minimap is a true view-from-above
  // — east renders left.) Physics, spawn and teleports keep using real world
  // coords; this is display-only.
  //   mapX = worldXHi - worldX   (0..180)
  //   mapZ = worldZHi - worldZ   (0..213)
  const mapX = Math.round(worldXHi - car.position.x);
  const mapZ = Math.round(worldZHi - car.position.z);
  const label = `x=${mapX} z=${mapZ}`;
  ctx.font = '9px sans-serif';
  const lw = ctx.measureText(label).width;
  const px0 = mmCenter - car.position.x * mmScale;
  const pz0 = mmCenter - car.position.z * mmScale;
  let lx = px0 + 7;
  if (lx + lw + 4 > 160) lx = px0 - lw - 7;   // flip to the left near the right edge
  let ly = pz0 + 10;
  if (ly + 12 > 160) ly = pz0 - 13;           // flip above the marker near the bottom edge
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(5,10,18,0.78)';
  ctx.fillRect(lx - 2, ly - 1, lw + 4, 12);
  ctx.fillStyle = '#7ef9ff';
  ctx.fillText(label, lx, ly);
}

// ===== Input =====
window.addEventListener('keydown', (event) => {
  keys[event.code] = true;
  // Spacebar pauses / unpauses the game (for screenshots). Pausing hides the
  // minimap and the touch joystick; they come back when you unpause.
  if (event.code === 'Space') {
    event.preventDefault();
    setPaused(!isPaused);
  }
});
window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

// ===== Virtual joystick (touch / pointer) =====
const joy = { active: false, x: 0, y: 0 };
const joyBase = document.getElementById('joystick');
const joyKnob = document.getElementById('joy-knob');
const joyHit = document.getElementById('joystick-hit');
const joyMax = 36;   // knob travel radius in px
let joyOrigin = null;

if (joyBase && joyKnob && joyHit) {
  const joyApply = (clientX, clientY) => {
    let dx = clientX - joyOrigin.x;
    let dy = clientY - joyOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > joyMax) {
      dx = (dx / d) * joyMax;
      dy = (dy / d) * joyMax;
    }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / joyMax;
    joy.y = dy / joyMax;
  };
  const joyRelease = () => {
    if (!joy.active) return;
    joy.active = false;
    joy.x = 0;
    joy.y = 0;
    joyKnob.style.transform = 'translate(0px, 0px)';
  };
  joyHit.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const r = joyBase.getBoundingClientRect();
    joyOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joy.active = true;
    joyApply(event.clientX, event.clientY);
    joyHit.setPointerCapture(event.pointerId);
  });
  joyHit.addEventListener('pointermove', (event) => {
    if (!joy.active) return;
    event.preventDefault();
    joyApply(event.clientX, event.clientY);
  });
  joyHit.addEventListener('pointerup', joyRelease);
  joyHit.addEventListener('pointercancel', joyRelease);
}

// ===== Pause (Spacebar) & scroll-wheel camera zoom =====
// Spacebar freezes the whole world — physics AND animations — for screenshots.
// While paused the minimap and the touch joystick hide so they don't appear in
// the shot, and the scroll wheel / drag orbit still move the camera so you can
// frame the perfect picture before you unpause.
let isPaused = false;

function setPaused(p) {
  if (p === isPaused) return;
  isPaused = p;
  minimap.style.display = p ? 'none' : '';
  if (joyBase) joyBase.style.display = p ? 'none' : '';
  if (joyHit) joyHit.style.display = p ? 'none' : '';
  if (p) {
    // Drop any in-progress joystick input so the car doesn't drive off the
    // moment you unpause.
    joy.active = false;
    joy.x = 0;
    joy.y = 0;
    if (joyKnob) joyKnob.style.transform = 'translate(0px, 0px)';
  } else {
    // Discard the time that elapsed while paused so physics don't jump on
    // resume (clock.elapsedTime stays frozen during the pause too).
    clock.getDelta();
  }
}

// Scroll-wheel camera zoom: wheel up zooms in, wheel down zooms out. Works
// paused or not, so you can zoom in on the action for a screenshot.
const CAM_ZOOM_MIN = 4;
const CAM_ZOOM_MAX = 85;
window.addEventListener('wheel', (event) => {
  event.preventDefault();
  const factor = Math.exp(event.deltaY * 0.0012);
  cameraOrbit.radius = THREE.MathUtils.clamp(cameraOrbit.radius * factor, CAM_ZOOM_MIN, CAM_ZOOM_MAX);
}, { passive: false });

// ===== Tier 3 — the moving dangers (ramp world only) =====
// Giant swinging hammers, the trebuchet, the rolling boulder and the wheel of
// death's rim all get animated AND tested against the car here each frame.
// Knocks are applied via playerKnock (a world-space slide + yaw spin + hop).
function launchTrebuchet() {
  // Sling the car: set a large vertical velocity and compute a horizontal
  // speed that will carry the player roughly half-way across the world
  // in the throw direction, based on the approximate ballistic flight time.
  jumpState.inAir = true;
  const yv = 30;
  jumpState.yVelocity = yv;
  // Approximate flight time for a symmetric vertical arc: t = 2*yv / g
  const flightTime = (2 * yv) / gravity;
  // Horizontal throw direction (world-space, flattened)
  const fwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
  fwd.y = 0; fwd.normalize();
  // Compute a half-map distance in that direction using the world's half
  // spans along X/Z so the trebuchet flings you about half the playable map.
  const desiredDist = Math.hypot(worldXHalf * Math.abs(fwd.x), worldZHalf * Math.abs(fwd.z));
  let desiredSpeed = desiredDist / Math.max(0.01, flightTime);
  // Clamp to sensible gameplay bounds so it never becomes absurd.
  desiredSpeed = THREE.MathUtils.clamp(desiredSpeed, 10, 140);
  velocity.value = Math.max(velocity.value, desiredSpeed);
  // Keep horizontal speed from decaying during the flight (small safety pad)
  jumpState.trebuchetBoost = flightTime + 0.4;
  car.rotation.z -= 0.3; // nose-up pitch as it's slung
  wasOnRamp = null;
  currentRamp = null;
  shake.intensity = Math.max(shake.intensity, 0.7);
}

// TEMP DEBUG: helpers to test the trebuchet from automated scripts. Remove
// after verification.
// (debug helpers removed)

function updateBoulder(delta) {
  const b = boulder;
  const dx = car.position.x - b.x;
  const dz = car.position.z - b.z;
  const dist = Math.hypot(dx, dz);
  const dirX = dist > 0.001 ? dx / dist : 1;
  const dirZ = dist > 0.001 ? dz / dist : 0;

  if (b.state === 'idle') {
    b.cooldown -= delta;
    if (b.cooldown <= 0 && dist < b.triggerRadius && !jumpState.inAir) {
      b.state = 'chasing';
      b.rolled = 0;
    }
  } else if (b.state === 'chasing') {
    const step = b.speed * delta;
    b.x += dirX * step;
    b.z += dirZ * step;
    b.rolled += step;
    b.group.position.set(b.x, terrainHeightAt(b.x, b.z) + b.R, b.z);
    // Roll the rock about the axis perpendicular to its travel.
    b.rock.rotateOnWorldAxis(new THREE.Vector3(-dirZ, 0, dirX), (b.speed / b.R) * delta);
    // Only flatten when the boulder is actually rolling over the car from the
    // top instead of bruising it from the side. A side scrape still knocks the
    // car away, but it does not trigger the squash mode.
    const rockOnTop = dist < b.hitRadius && Math.abs(car.position.y - b.group.position.y) < 2.4;
    if (rockOnTop && !playerKnock) {
      flattenCarFromRock();
      knockPlayerAway(dirX, dirZ, 13, 3.0, 4.6);
      b.state = 'retreat';
    } else if (b.rolled >= b.maxRoll) {
      b.state = 'retreat';   // gives up after ~100 units
    }
    // The blue car can get flattened by the boulder too.
    if (bumperInRamp && !bumperKnock) {
      const bd = Math.hypot(bumperCar.position.x - b.x, bumperCar.position.z - b.z);
      if (bd < b.hitRadius) {
        knockBumperAside(bumperCar.position.x - b.x, bumperCar.position.z - b.z, 13, 3.2);
      }
    }
  } else if (b.state === 'retreat') {
    const hx = b.homeX - b.x;
    const hz = b.homeZ - b.z;
    const hd = Math.hypot(hx, hz);
    if (hd > 0.6) {
      const step = b.speed * 0.6 * delta;
      b.x += (hx / hd) * step;
      b.z += (hz / hd) * step;
      b.group.position.set(b.x, terrainHeightAt(b.x, b.z) + b.R, b.z);
      b.rock.rotateOnWorldAxis(new THREE.Vector3(-hz / hd, 0, hx / hd), (b.speed / b.R) * delta * 0.6);
    } else {
      b.x = b.homeX; b.z = b.homeZ;
      b.group.position.set(b.x, b.homeY, b.z);
      b.state = 'idle';
      b.cooldown = 3;
    }
  }
}

function updateRampWorldDanger(delta) {
  if (worldState !== 'ramp') return;
  const vt = clock.elapsedTime;

  // --- Giant swinging mallets: animate the pendulums, knock the car on contact ---
  for (const h of hammers) {
    const ph = h.sweep * Math.sin(vt * h.freq + h.phase);
    const phDot = h.sweep * h.freq * Math.cos(vt * h.freq + h.phase);   // arc speed
    h.pivot.rotation.z = ph;   // visual (head swings in a vertical arc across the road)
    h.cooldown -= delta;
    if (h.cooldown > 0 || playerKnock) continue;
    // Mallet-head world position from the SAME swing angle (matches visual):
    // pivot + (armLen*sin(ph), -armLen*cos(ph)) — a crescent arc, tips up.
    const bx = h.x + Math.sin(ph) * h.armLen;
    const by = h.pivotY - Math.cos(ph) * h.armLen;
    const bz = h.z;
    const ddx = car.position.x - bx;
    const ddz = car.position.z - bz;
    const rr = h.headRadius + playerCarRadius + 0.4;
    // Only hit when the head is actually near the car's height (it only dips
    // to car height at the bottom of its arc — the tips fly high overhead).
    if (ddx * ddx + ddz * ddz < rr * rr && Math.abs(car.position.y - by) < h.headRadius + 2.2) {
      // Very heavy mallet: fling the car along the direction the head is
      // SWINGING (the horizontal arc tangent — across the road), no matter
      // which way the car approached. d/dt of (sin ph, -cos ph) = phDot*(cos ph, sin ph).
      if (Math.abs(phDot) < 0.05) {
        // Head is at the very end of its arc (about to reverse) — shove the
        // car horizontally away from the head.
        const len = Math.hypot(ddx, ddz) || 1;
        knockPlayerAway(ddx / len, ddz / len, 130, 5, 5.5);
      } else {
        const s = phDot > 0 ? 1 : -1;
        knockPlayerAway(s, 0, 130, 5, 5.5);
      }
      h.cooldown = 1.4;
    }
    // The blue car (if it followed you here) gets clobbered by the mallet too.
    if (bumperInRamp && !bumperKnock) {
      const bdx = bumperCar.position.x - bx;
      const bdz = bumperCar.position.z - bz;
      if (bdx * bdx + bdz * bdz < rr * rr && Math.abs(bumperCar.position.y - by) < h.headRadius + 2.2) {
        if (Math.abs(phDot) < 0.05) {
          const blen = Math.hypot(bdx, bdz) || 1;
          knockBumperAside(bdx / blen, bdz / blen, 26, 4.5);
        } else {
          const bs = phDot > 0 ? 1 : -1;
          knockBumperAside(bs, 0, 26, 4.5);
        }
        h.cooldown = 1.4;
      }
    }
  }

  // --- The trebuchet: state machine + arm animation + launch ---
  const t = trebuchet;
  if (t.state === 'idle') {
    t.arm.rotation.z = t.restAngle;
    if (!jumpState.inAir && !playerKnock) {
      // The car's NOSE entering the cup zone (the cup sits on the ground in
      // front of the machine).
      const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
      const nx = car.position.x + dir.x * 2.15;
      const nz = car.position.z + dir.z * 2.15;
      const ddx = nx - t.cupRest.x;
      const ddz = nz - t.cupRest.z;
      if (ddx * ddx + ddz * ddz < t.cupRadius * t.cupRadius) {
        t.state = 'winding';
        t.t = 0;
      }
    }
  } else if (t.state === 'winding') {
    t.t += delta;
    const e = Math.min(t.t / 0.45, 1);
    t.arm.rotation.z = t.restAngle + (t.windupAngle - t.restAngle) * e;
    if (t.t >= 0.45) {
      t.state = 'firing';
      t.t = 0;
      launchTrebuchet();   // sling at the start of the throw
    }
  } else if (t.state === 'firing') {
    t.t += delta;
    const e = Math.min(t.t / 0.3, 1);
    const ease = 1 - (1 - e) * (1 - e);   // ease-out whip
    t.arm.rotation.z = t.windupAngle + (t.throwAngle - t.windupAngle) * ease;
    if (t.t >= 0.3) {
      t.state = 'cooldown';
      t.t = 0;
    }
  } else if (t.state === 'cooldown') {
    t.t += delta;
    const e = Math.min(t.t / 2.2, 1);
    t.arm.rotation.z = t.throwAngle + (t.restAngle - t.throwAngle) * e;
    if (t.t >= 2.2) {
      t.state = 'idle';
      t.t = 0;
    }
  }

  // --- Rolling boulder chase ---
  updateBoulder(delta);

  // --- Wheel of death rim + paddles: clipping the rim or catching a paddle
  // sends you skidding — TWICE as far as a hammer does ---
  if (!playerKnock) {
    wheelOfDeath.cooldown -= delta;
    if (wheelOfDeath.cooldown <= 0) {
      const wDef = wheelOfDeathDef;
      const cx = wDef.x, cy = wheelOfDeath.spin.position.y, cz = wDef.z;
      const rxy = Math.hypot(car.position.x - cx, car.position.y - cy);
      const dz = car.position.z - cz;
      // Bare rim clip (between the paddles).
      if (Math.abs(dz) < 1.7 && Math.abs(rxy - wDef.R) < 1.5) {
        let nx = car.position.x - cx;
        let nz = dz;
        const len = Math.hypot(nx, nz);
        if (len < 0.4) {
          // Directly under the hub the radial is vertical, so the horizontal
          // knock would be ~zero. Shove the car back the way it came instead.
          const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
          nx = -dir.x; nz = -dir.z;
        } else {
          nx /= len; nz /= len;
        }
        knockPlayerAway(nx, nz, WHEEL_KNOCK_POWER, 5, 5.5);
        wheelOfDeath.cooldown = 1.5;
      }
      // The paddles bolted around the rim sweep and clobber you too — each
      // is tested as a small box in the wheel's plane (inflated by roughly
      // half the car) so a hit lands only when a blade swings through you.
      if (wheelOfDeath.cooldown <= 0 && Math.abs(dz) < 1.7) {
        const P = wheelOfDeathPaddles;
        const padR = 1.2;   // inflate the paddle box by ~half the car
        const rInner = wDef.R + P.radial - P.len / 2 - padR;
        const rOuter = wDef.R + P.radial + P.len / 2 + padR;
        const halfT = P.wid / 2 + padR;
        const spinAngle = -vt * 2.4;   // matches wheelOfDeath.spin.rotation.z
        const pdx = car.position.x - cx;
        const pdy = car.position.y - cy;
        for (let i = 0; i < P.count; i++) {
          const ph = (i / P.count) * Math.PI * 2 + spinAngle;
          const co = Math.cos(ph), si = Math.sin(ph);
          const lr = pdx * co + pdy * si;    // radial offset from the centre
          const lt = -pdx * si + pdy * co;   // tangential offset
          if (lr > rInner && lr < rOuter && Math.abs(lt) < halfT) {
            let nx = pdx, nz = dz;
            const len = Math.hypot(nx, nz);
            if (len < 0.4) { nx = 1; nz = 0; } else { nx /= len; nz /= len; }
            knockPlayerAway(nx, nz, WHEEL_KNOCK_POWER, 5, 5.5);
            wheelOfDeath.cooldown = 1.5;
            break;
          }
        }
      }
      // The blue car gets clipped by the rim too.
      if (bumperInRamp && !bumperKnock) {
        const brxy = Math.hypot(bumperCar.position.x - cx, bumperCar.position.y - cy);
        const bdz = bumperCar.position.z - cz;
        if (Math.abs(bdz) < 1.7 && Math.abs(brxy - wDef.R) < 1.5) {
          let bnx = bumperCar.position.x - cx;
          let bnz = bumperCar.position.z - cz;
          const blen = Math.hypot(bnx, bnz);
          if (blen < 0.4) { bnx = 1; bnz = 0; } else { bnx /= blen; bnz /= blen; }
          knockBumperAside(bnx, bnz, 11, 3.2);
        }
      }
    }
  }
}

// ===== Blue car in the ramp world =====
// After ~20 seconds in the ramp world the little blue car shows up just behind
// you and chases you, knocks props over as it drives, and can be knocked
// around by you (and by the hammers / boulder / wheel rim).
function summonBumperToRamp() {
  scene.remove(bumperCar);
  rampScene.add(bumperCar);
  bumperInRamp = true;
  bumperKnock = null;
  bumperState.stopped = false;
  bumperCar.visible = true;
  bumperCar.scale.set(0.5, 0.5, 0.5);
  // Drop it just behind the player so it visibly catches up and follows.
  const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
  dir.y = 0;
  dir.normalize();
  const px = car.position.x - dir.x * 16;
  const pz = car.position.z - dir.z * 16;
  bumperCar.position.set(px, terrainHeightAt(px, pz) + groundHeight, pz);
  bumperCar.rotation.y = car.rotation.y;
}

function knockBumperAside(nx, nz, power, spin) {
  if (bumperKnock) return;
  const len = Math.hypot(nx, nz) || 1;
  bumperKnock = makeKnock(bumperCar, bumperHalfLen, bumperHalfWid, nx / len, nz / len, power, spin);
}

function updateRampWorldBumper(delta) {
  if (worldState !== 'ramp') return;
  // Count down before the blue car shows up.
  if (!bumperInRamp) {
    bumperRampTimer -= delta;
    if (bumperRampTimer <= 0) summonBumperToRamp();
    return;
  }
  // The player can smash it aside (it tumbles, then resumes chasing).
  if (!bumperKnock) {
    const pdx = car.position.x - bumperCar.position.x;
    const pdz = car.position.z - bumperCar.position.z;
    const pd = Math.hypot(pdx, pdz);
    if (pd > 0.001 && pd < playerCarRadius + aiCarRadius) knockBumperAside(pdx, pdz, 13, 4.2);
  }
  if (bumperKnock) {
    // Tumble from a hit, then resume chasing once it settles.
    const k = bumperKnock;
    bumperCar.position.x += k.vx * delta;
    bumperCar.position.z += k.vz * delta;
    bumperCar.rotation.y += k.w * delta;
    k.vx *= KNOCK_DECAY;
    k.vz *= KNOCK_DECAY;
    k.w *= KNOCK_DECAY;
    k.t -= delta;
    if (k.t <= 0) bumperKnock = null;
  } else {
    // Chase the player (no wrap — the ramp world is open), stopping ~1 car
    // length away like it does in the city. The approach is clamped so it
    // stops AT the stop distance instead of overshooting into the player's
    // knock radius (which used to knock it aside instead of stopping).
    const chaseDir = new THREE.Vector3(
      car.position.x - bumperCar.position.x,
      0,
      car.position.z - bumperCar.position.z
    );
    const chaseDistance = chaseDir.length();
    if (chaseDistance < bumperStopDistance) {
      bumperState.stopped = true;
    } else if (chaseDistance > bumperResumeDistance) {
      bumperState.stopped = false;
    }
    bumperState.speed = bumperState.stopped ? 0 : bumperBaseSpeed;
    if (!bumperState.stopped && chaseDistance > 0.15) {
      chaseDir.normalize();
      // Never step closer than bumperStopDistance, so the blue car stops and
      // HOLDS a clear gap instead of crossing into the player's knock radius
      // while it's still just approaching.
      const move = Math.min(bumperState.speed * delta, Math.max(chaseDistance - bumperStopDistance, 0));
      bumperCar.position.x += chaseDir.x * move;
      bumperCar.position.z += chaseDir.z * move;
      bumperCar.lookAt(
        bumperCar.position.x + chaseDir.x,
        bumperCar.position.y,
        bumperCar.position.z + chaseDir.z
      );
      bumperCar.rotateY(Math.PI / 2);
    }
    // When stopped, hold a safe gap like the city's bumper: if the player
    // drives closer than a comfortable distance, the blue car backs off so it
    // keeps stopping a clear distance away.
    if (bumperState.stopped && chaseDistance > 0.15 && chaseDistance < bumperStopDistance * 0.65) {
      const push = bumperStopDistance * 0.65 - chaseDistance;
      bumperCar.position.addScaledVector(chaseDir.normalize(), -push);
    }
    // It knocks props over too as it drives through them.
    knockAt(bumperCar.position, aiKnockRadius, 0, 0);
  }
  // Ride the terrain like a real car.
  bumperCar.position.y = terrainHeightAt(bumperCar.position.x, bumperCar.position.z) + groundHeight;
}

// ===== Game loop =====
const clock = new THREE.Clock();

// Eased chase-camera positioning. Extracted from the frame update so it can
// keep running while the game is PAUSED — the scroll-wheel zoom and drag orbit
// stay live so you can frame a screenshot while the world holds perfectly
// still. (The shake decay doubles as a stabilizer: pause right after a jump
// and the camera settles flat for the shot.)
function updateCamera(delta) {
  // ===== Mine portal camera override =====
  // When the dive starts, bypass the entire chase cam and smoothly ease the
  // camera to a fixed ground-level position outside the mine entrance.
  if (minePortal.active) {
    const t = Math.min(minePortal.timer / minePortal.diveTotal, 1);
    const camY = THREE.MathUtils.lerp(camera.position.y, 1.2, t);  // ease Y down
    _mineCamTarget.set(-55, camY, 29);
    _mineLookTarget.set(-55, 0, 42);
    const blend = 1 - Math.pow(0.004, delta);
    camera.position.lerp(_mineCamTarget, blend);
    _lookTarget.lerp(_mineLookTarget, blend);
    camera.lookAt(_lookTarget);
    return;   // skip chase cam entirely — nothing else touches the camera
  }

  // ===== Levitation camera override =====
  // Same smooth technique as the mine dive: bypass the chase cam and ease the
  // camera to a fixed ground-level vantage just outside the portal building's
  // open (east) side, tilting up to follow the car as it floats away.
  if (buildingLevitate.active && buildingLevitate.levitating) {
    _levCamTarget.set(buildingLevitate.x + buildingLevitate.w / 2 + 9, 1.6, buildingLevitate.z);
    _levLookTarget.set(buildingLevitate.x, Math.max(1.5, car.position.y), buildingLevitate.z);
    const blend = 1 - Math.pow(0.004, delta);
    camera.position.lerp(_levCamTarget, blend);
    _lookTarget.lerp(_levLookTarget, blend);
    camera.lookAt(_lookTarget);
    return;   // skip chase cam entirely — nothing else touches the camera
  }

  cameraTarget.copy(car.position);
  cameraTarget.y = Math.max(0.8, car.position.y);   // follow the car up ramps / into the robot's mouth

  const fwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
  fwd.y = 0;
  fwd.normalize();
  const heading = Math.atan2(-fwd.z, -fwd.x);
  const theta = heading + cameraYawOffset;

  // Zoom way out whenever the giant robot is close so its whole body — and
  // face — stays in view, not just while it's eating. The robot only exists
  // in the city, so there's no robot zoom in the ramp world.
  const robotZoomT =
    worldState === 'city'
      ? THREE.MathUtils.clamp(
          1 - Math.hypot(wrappedDeltaX(car.position.x, robot.mesh.position.x), wrappedDeltaZ(car.position.z, robot.mesh.position.z)) / ROBOT_CAM_DIST,
          0, 1
        )
      : 0;

  // Flight zoom: as the car climbs the mega ramp (and while it's airborne) the
  // camera pulls way out and sits higher so you can watch yourself fly off the
  // ramp, soar over the town and come back down to land. Driven by the car's
  // height above the ground, it eases back in once you touch down.
  const FLIGHT_CAM_HEIGHT = 34;      // car height at which the camera is fully zoomed
  const FLIGHT_CAM_MAX_RADIUS = 62;  // fully-zoomed distance during the flight
  const flightZoomT = THREE.MathUtils.clamp((car.position.y - groundHeight) / FLIGHT_CAM_HEIGHT, 0, 1);

  const zoomT = Math.max(robotZoomT, flightZoomT);
  const camTargetRadius = cameraOrbit.radius + (Math.max(ROBOT_CAM_MAX_RADIUS, FLIGHT_CAM_MAX_RADIUS) - cameraOrbit.radius) * zoomT;
  camRadius += (camTargetRadius - camRadius) * Math.min(1, 4.0 * delta);

  // On the big ramps the camera swings up and to the SIDE of the flight path —
  // a high "drone" shot looking down at the car — so you watch yourself launch
  // off the end of the ramp and soar over the buildings. The robot zoom keeps
  // its own behind-the-car framing whenever IT is the reason we're pulled out.
  const FLIGHT_PHI = 0.70;   // steep look-down angle (~50° above level) for the flight
  const flightDominant = flightZoomT > robotZoomT + 0.001;
  const camPhi = THREE.MathUtils.clamp(
    flightDominant
      ? cameraOrbit.phi + (FLIGHT_PHI - cameraOrbit.phi) * flightZoomT   // flight: high, looking down
      : cameraOrbit.phi + 0.30 * zoomT,                                  // robot: sit higher behind the car
    cameraOrbit.minPhi,
    cameraOrbit.maxPhi
  );
  // Swing the camera around perpendicular to the flight path (the side view)
  // as the flight zoom kicks in; the camOffset lerp below eases the arc.
  const camTheta = theta - (flightDominant ? (Math.PI / 2) * flightZoomT : 0);

  // Aim the shot at the robot's head only when the ROBOT is why we zoomed out;
  // during the ramp flight the camera stays on the car so you watch yourself.
  const robotHead = new THREE.Vector3();
  robot.mesh.userData.head.getWorldPosition(robotHead);
  if (worldState === 'city') cameraTarget.lerp(robotHead, robotZoomT);

  const desiredOffset = new THREE.Vector3(
    camRadius * Math.sin(camPhi) * Math.cos(camTheta),
    camRadius * Math.cos(camPhi) + 2.2,
    camRadius * Math.sin(camPhi) * Math.sin(camTheta)
  );

  // Look slightly ahead of the car in the direction of travel (off when the
  // shot is focused on the robot).
  _lookTarget.copy(cameraTarget);
  _lookTarget.addScaledVector(fwd, THREE.MathUtils.clamp(velocity.value, 0, 14) * 0.12 * (1 - zoomT));

  // Camera shake (jump / landing)
  if (shake.intensity > 0.002) {
    desiredOffset.x += (Math.random() - 0.5) * shake.intensity;
    desiredOffset.y += (Math.random() - 0.5) * shake.intensity;
    desiredOffset.z += (Math.random() - 0.5) * shake.intensity;
    shake.intensity *= 0.88;
  }

  camOffset.lerp(desiredOffset, 0.12);
  camera.position.copy(cameraTarget).add(camOffset);

  camera.lookAt(_lookTarget);
}

function animate() {
  requestAnimationFrame(animate);

  // Paused: the whole world is frozen (no clock.getDelta(), so every
  // elapsedTime-driven animation holds still too). Only the camera keeps
  // updating so scroll-wheel zoom + drag orbit still work for screenshots,
  // and the frame keeps rendering so you can grab it.
  if (isPaused) {
    updateCamera(1 / 60);
    renderer.render(worldState === 'ramp' ? rampScene : worldState === 'underground' ? undergroundScene : scene, camera);
    return;
  }

  const delta = clock.getDelta();
  const accel = 10 * delta;
  const turnRate = 1.7 * delta;

  // While the giant robot has the player in its claw, the player's car is
  // inert — it just rides up to the robot's mouth. Physics resume on respawn.
  if (!robot.playerCaptured) {

  let forward = 0;
  let reverse = 0;
  if (keys['ArrowUp'] || keys['KeyW']) forward = 1;
  if (keys['ArrowDown'] || keys['KeyS']) reverse = 1;
  if (joy.active) {
    // Analog joystick: push up = go, pull down = reverse
    const f = Math.max(0, -joy.y);
    const r = Math.max(0, joy.y);
    if (f > 0.08) forward = Math.max(forward, f);
    else if (r > 0.08) reverse = Math.max(reverse, r);
  }

  if (forward > 0) {
    velocity.value = Math.min(velocity.value + accel * 2.2 * forward, 14);
  } else if (reverse > 0) {
    velocity.value = Math.max(velocity.value - accel * 1.5 * reverse, -7);
  } else {
    if (jumpState.trebuchetBoost && jumpState.trebuchetBoost > 0) {
      // During the trebuchet flight keep horizontal speed from decaying so
      // the throw carries you across the map.
      velocity.value *= 0.995;
      jumpState.trebuchetBoost = Math.max(0, jumpState.trebuchetBoost - accel / 10);
    } else {
      velocity.value *= 0.92;
    }
  }

  if (joy.active) {
    // Analog steering: push right = turn right, push left = turn left
    steering.value += (-joy.x * 0.9 - steering.value) * Math.min(1, 12 * delta);
  } else {
    if (keys['ArrowLeft'] || keys['KeyA']) {
      steering.value = Math.min(steering.value + turnRate * 1.2, 0.9);
    } else if (keys['ArrowRight'] || keys['KeyD']) {
      steering.value = Math.max(steering.value - turnRate * 1.2, -0.9);
    } else {
      steering.value *= 0.8;
    }
  }

  // Reverse steering flip: when backing up, invert the yaw so left/right stay
  // screen-relative (same feel as driving forward). Deadzone avoids flapping
  // the controls around at a standstill.
  const reverseFlip = velocity.value < -0.5 ? -1 : 1;
  car.rotation.y += steering.value * delta * 2.3 * reverseFlip;
  const direction = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
  direction.y = 0;
  direction.normalize();

  const nextCarPos = car.position.clone().addScaledVector(direction, velocity.value * delta);
  // NOTE: traffic cars are deliberately NOT in this block list — the player
  // plows straight through them and the car-vs-car collision system shoves
  // them out of the way (they slide aside, then ease back to their lane).
  // While airborne (or up on a rooftop) the car flies OVER buildings, the
  // fire engine and the robot instead of being stopped by them — that's what
  // lets the mega ramp hurl you across the whole town.
  // In the city you can't drive through buildings, the fire engine or the
  // robot (unless you're airborne / up on a rooftop). The ramp world is wide
  // open rolling terrain — nothing to block you.
  const elevated = jumpState.inAir || (worldState === 'city' && buildingTopAt(car.position.x, car.position.z) > 0);
  const canMove =
    !buildingLevitate.levitating && (
    worldState === 'ramp' ||
    elevated ||
    (!isPositionBlocked(nextCarPos.x, nextCarPos.z, playerCarRadius) &&
      !isPositionBlockedByFiretruck(nextCarPos.x, nextCarPos.z, playerCarRadius) &&
      !isPositionBlockedByRobot(nextCarPos.x, nextCarPos.z, playerCarRadius)));
  if (canMove) {
    car.position.copy(nextCarPos);
  } else {
    velocity.value *= 0.3;
    shake.intensity = Math.max(shake.intensity, 0.22);
  }

  // ===== Ramps: drive up the slope, launch off the top, fall back down =====
  // During building levitation, skip all ramp/ground physics — the car is rising.
  if (buildingLevitate.levitating) {
    // Levitating: only vertical motion is controlled by the levitation code.
  } else if (worldState === 'ramp') {
    if (jumpState.inAir) {
      // Airborne in the ramp world: fall under gravity and land on whichever
      // is higher — the bumpy terrain or the top of a launch ramp.
      currentRamp = null;
      jumpState.yVelocity -= gravity * delta;
      car.position.y += jumpState.yVelocity * delta;
      const rGround = terrainHeightAt(car.position.x, car.position.z) + groundHeight;
      const rSurf = rampRampSurfaceY(car.position.x, car.position.z);
      const surface = Math.max(rGround, rSurf);
      if (car.position.y <= surface) {
        car.position.y = surface;
        const impact = Math.abs(jumpState.yVelocity);
        jumpState.yVelocity = 0;
        jumpState.inAir = false;
        shake.intensity = Math.min(0.3 + impact * 0.05, 0.75);
      }
    } else {
      // On the ground: ride a ramp-world launch ramp if the car is on one,
      // otherwise ride the bumpy terrain.
      const r = rampRampInfoAt(car.position.x, car.position.z);
      currentRamp = r;
      if (r) {
        car.position.y = r.baseY + r.height * r.s;
        wasOnRamp = { runX: r.runX, runZ: r.runZ, height: r.height, len: r.len, boost: r.boost };
      } else {
        // Drive off the far (high) edge of the ramp we were just riding:
        // launch off it. Otherwise just ride the terrain.
        const launched =
          wasOnRamp &&
          velocity.value > 2 &&
          (direction.x * wasOnRamp.runX + direction.z * wasOnRamp.runZ) > 0.3;
        if (launched) {
          jumpState.inAir = true;
          jumpState.yVelocity = velocity.value * (wasOnRamp.height / wasOnRamp.len) * wasOnRamp.boost;
          shake.intensity = Math.max(shake.intensity, 0.08);
        } else {
          const halfBase = 1.35;   // half the wheelbase (wheels at x=±1.35)
          const fx = car.position.x + direction.x * halfBase;
          const fz = car.position.z + direction.z * halfBase;
          const rx = car.position.x - direction.x * halfBase;
          const rz = car.position.z - direction.z * halfBase;
          const frontH = terrainHeightAt(fx, fz);
          const rearH = terrainHeightAt(rx, rz);
          car.position.y = (frontH + rearH) * 0.5 + groundHeight;
          terrainPitch = -Math.atan2(frontH - rearH, halfBase * 2);
          wasOnRamp = null;
        }
      }
    }
  } else if (worldState === 'underground') {
    if (jumpState.inAir) {
      // Airborne in the underground: fall under gravity, land on the cavern
      // floor (local y ≈ 0 — the floor mesh top sits at y = -0.02), back on
      // a course ramp's slope, or on top of anything with a collider footprint
      // (pit rims, Glass City roofs, the moving elevator deck — task #18).
      // The min() cap stops a high surface from snapping the car UP to it
      // when flying through its footprint below deck level.
      currentRamp = null;
      jumpState.yVelocity -= gravity * delta;
      car.position.y += jumpState.yVelocity * delta;
      const bTop = buildingTopAt(car.position.x, car.position.z);
      const surface = Math.max(0, ugRampSurfaceY(car.position.x, car.position.z), Math.min(bTop, car.position.y + 0.4));
      if (car.position.y <= surface) {
        car.position.y = surface;
        const impact = Math.abs(jumpState.yVelocity);
        jumpState.yVelocity = 0;
        jumpState.inAir = false;
        shake.intensity = Math.min(0.3 + impact * 0.05, 0.75);
      }
    } else {
      // On the ground in the underground: ride a course ramp slope if the car
      // is on one, otherwise stay on the cavern floor.
      const r = ugRampInfoAt(car.position.x, car.position.z);
      currentRamp = r;
      if (r) {
        car.position.y = r.height * r.s;
        wasOnRamp = { runX: r.runX, runZ: r.runZ, height: r.height, len: r.len, boost: r.boost };
      } else {
        // Drive off the far (high) edge of the ramp we were just riding:
        // launch off it, same as the city/ramp-world ramps.
        const launched =
          wasOnRamp &&
          velocity.value > 2 &&
          (direction.x * wasOnRamp.runX + direction.z * wasOnRamp.runZ) > 0.3;
        if (launched) {
          jumpState.inAir = true;
          jumpState.yVelocity = velocity.value * (wasOnRamp.height / wasOnRamp.len) * wasOnRamp.boost;
          shake.intensity = Math.max(shake.intensity, 0.08);
        } else {
          // Task #17: ride the elevator deck while the car stands in its
          // footprint — y snaps to the deck's live top each frame, so the
          // car is carried up AND down with it. Mounting is proximity-gated
          // so a deck passing overhead never yo-yos the car off the floor.
          const eTop = ugElevatorTopAt(car.position.x, car.position.z);
          if (eTop > 0.05 && Math.abs(car.position.y - eTop) < 1.4) {
            car.position.y = eTop;
          } else if (eTop > 0.05) {
            car.position.y = 0;   // deck is overhead — stay on the floor
          } else if (car.position.y > 0.3) {
            // Drove off a raised surface (deck edge, pit rim): become gently
            // airborne instead of teleporting down, keeping momentum.
            jumpState.inAir = true;
            jumpState.yVelocity = 0;
          } else {
            car.position.y = 0;
          }
        }
        wasOnRamp = null;
      }
    }
  } else if (jumpState.inAir) {
    currentRamp = null;   // airborne — level back out
    // Ballistic flight — hang in the air, then fall hard.
    jumpState.yVelocity -= gravity * delta;
    car.position.y += jumpState.yVelocity * delta;
    // Land on the street — or on a rooftop if we're coming down over a building.
    const surface = Math.max(rampSurfaceY(car.position.x, car.position.z, car.position.y), buildingTopAt(car.position.x, car.position.z));
    if (car.position.y <= surface) {
      car.position.y = surface;
      const impact = Math.abs(jumpState.yVelocity);
      jumpState.yVelocity = 0;
      jumpState.inAir = false;
      // The harder you land, the heavier the thud
      shake.intensity = Math.min(0.3 + impact * 0.05, 0.75);
    }
  } else {
    // On the ground: ride the ramp slope as you climb it... (py + the ramp we
    // were already riding tell the physics whether the car is on TOP of a
    // board ramp, driving UNDER it, or just starting to climb the base)
    const r = rampInfoAt(car.position.x, car.position.z, car.position.y, currentRamp && currentRamp.def);
    currentRamp = r;
    if (r) {
      car.position.y = groundHeight + r.height * r.s;
      wasOnRamp = { runX: r.runX, runZ: r.runZ, height: r.height, len: r.len, boost: r.boost };
    } else {
      // ...and launch off the far (high) edge. Keep the current height (the
      // ramp-top) as the launch height so the car flies off the actual top,
      // not from the ground. `boost` is a kicker multiplier: the mega ramp
      // uses it to hurl the car high above the town.
      const launched =
        wasOnRamp &&
        velocity.value > 2 &&
        (direction.x * wasOnRamp.runX + direction.z * wasOnRamp.runZ) > 0.3;
      if (launched) {
        jumpState.inAir = true;
        jumpState.yVelocity = velocity.value * (wasOnRamp.height / wasOnRamp.len) * wasOnRamp.boost;
        shake.intensity = Math.max(shake.intensity, 0.08);
      } else {
        // Standing on the ground: stay up on a rooftop if we're on one, or
        // drop off the roof edge back to the street if we just drove off it.
        const roof = buildingTopAt(car.position.x, car.position.z);
        if (roof > 0) {
          car.position.y = Math.max(car.position.y, roof);
        } else if (minePortal.active) {
          // Mine dive: let the portal code control Y (sinking into the earth)
        } else if (car.position.y > groundHeight + 1) {
          jumpState.inAir = true;
          jumpState.yVelocity = 0;
        } else {
          car.position.y = groundHeight;
        }
      }
      wasOnRamp = null;
    }
  }

  // Wheel spin + front-wheel steering + body lean
  const spin = velocity.value * delta * 2.6;
  for (const w of car.userData.wheels) w.rotation.y += spin;
  for (let i = 0; i < 2; i++) {
    car.userData.wheelPivots[i].rotation.y = steering.value * 0.55;
  }
  // Body lean. On a ramp the car pitches to match the slope (nose up when
  // climbing, nose down when descending) so all four tires sit on the slanted
  // ground. Off the ramp it just does the usual steering roll + accel lean.
  const targetRoll = -steering.value * 0.1;
  const accelPitch = THREE.MathUtils.clamp(velocity.value, -7, 14) * -0.004;
  if (currentRamp) {
    const slopeAngle = Math.atan2(currentRamp.height, currentRamp.len);
    const alongRun = direction.x * currentRamp.runX + direction.z * currentRamp.runZ;
    const rampPitch = -slopeAngle * Math.sign(alongRun);   // pitch about the lateral axis
    car.rotation.z += (rampPitch - car.rotation.z) * 0.28;
    car.rotation.x += (0 - car.rotation.x) * 0.12;   // flatten the accel lean on the slope
  } else if (worldState === 'ramp' && !jumpState.inAir) {
    // Ramp-world dirt: follow the two-point terrain pitch with a weighty
    // arcade rock — nose up over the bumps, tail up after, then settle.
    car.rotation.z += (terrainPitch - car.rotation.z) * 0.25;
    car.rotation.x += (accelPitch - car.rotation.x) * 0.12;
  } else if (minePortal.active) {
    // Mine portal dive: the portal code controls car.rotation.z directly.
    // Do not touch rotation.z here — the dive code sets it each frame.
  } else {
    car.rotation.z += (targetRoll - car.rotation.z) * 0.12;
    car.rotation.x += (accelPitch - car.rotation.x) * 0.12;
  }

  // Pothole wobble — car rocks when driven through the pothole on the main road.
  // Does not block movement; just adds a fun visual wobble.
  if (worldState === 'city') {
    const pdx = car.position.x - POTHOLE.x;
    const pdz = car.position.z - POTHOLE.z;
    const overHole = pdx * pdx + pdz * pdz < POTHOLE.radius * POTHOLE.radius;
    if (overHole && !potholeWobble.active) {
      potholeWobble.active = true;
      potholeWobble.t = 0;
    }
    if (potholeWobble.active) {
      potholeWobble.t += delta;
      const wt = potholeWobble.t;
      if (wt < 1.0) {
        const decay = 1.0 - wt;
        car.rotation.z += Math.sin(wt * 18) * 0.22 * decay;
        car.rotation.x += Math.cos(wt * 22) * 0.16 * decay;
        // Small vertical bump — car hops slightly on entry
        if (wt < 0.25) car.position.y += (0.25 - wt) * 0.6;
      } else {
        potholeWobble.active = false;
      }
    }
  }

  // Tier 3 knock impulse: a hammer / wheel-rim / boulder hit slides the car
  // in world space and spins it, independent of the throttle-driven forward
  // motion (it decays each frame, same as the bumper car's knock).
  if (playerKnock) {
    const k = playerKnock;
    car.position.x += k.vx * delta;
    car.position.z += k.vz * delta;
    car.rotation.y += k.w * delta;
    k.vx *= KNOCK_DECAY;
    k.vz *= KNOCK_DECAY;
    k.w *= KNOCK_DECAY;
    k.t -= delta;
    if (k.t <= 0) playerKnock = null;
  }

  // ===== Player wrap =====
  // The whole map is a torus — no invisible edge walls, so drive off ANY edge
  // and you wrap around to the opposite side. x wraps at ±90 (span 180): off
  // the east edge -> west edge, keeping z. z wraps -90..123 (span 213): off
  // the field's far end -> south edge, off the south edge -> the field's far
  // end (the opposite side of the world).
  // Underground world has its own enclosed cavern — no wrapping needed.
  if (worldState !== 'underground') {
    const px = car.position.x;
    const pz = car.position.z;

    // East/west: wrap straight across to the opposite edge (torus), keeping z.
    if (px > worldXHi || px < worldXLo) {
      car.position.x = wrapCoordX(px);
    }

    // North/south: full torus in both directions — off the field's far end ->
    // south edge, off the south edge -> the field's far end.
    if (pz > worldZHi) {
      car.position.z = wrapCoordZ(pz);                      // ≈ -90 (south edge)
    } else if (pz < worldZLo) {
      car.position.z = wrapCoordZ(pz);                      // ≈ +123 (field far end)
    }
  }

  // Knock over props near the player. The city wraps across the seam, so its
  // knock uses the torus spans; the ramp world's props sit well inside the
  // band, so it knocks without wrap (which would otherwise let a ramp prop
  // near the edge also topple city props folded across the seam).
  if (worldState === 'city') knockAt(car.position, playerKnockRadius, worldSizeX, worldSizeZ);
  else if (worldState === 'ramp') knockAt(car.position, playerKnockRadius, 0, 0);
  else if (worldState === 'underground') knockAt(car.position, playerKnockRadius, 0, 0);

  }  // end !robot.playerCaptured

  // Bumper car AI: chases the NEAREST copy of you across the wrap seam, stops
  // ~1 foot from you, and only follows once you drive away. Skipped entirely
  // while the robot is holding the blue car in its claw — or in the ramp world.
  if (worldState === 'city' && !robot.bumperCaptured) {
  if (bumperKnock) {
    // Just got smashed by the player: tumble away with a spin, then resume
    // chasing once the knock settles.
    const k = bumperKnock;
    bumperCar.position.x += k.vx * delta;
    bumperCar.position.z += k.vz * delta;
    bumperCar.rotation.y += k.w * delta;
    k.vx *= KNOCK_DECAY;
    k.vz *= KNOCK_DECAY;
    k.w *= KNOCK_DECAY;
    k.t -= delta;
    if (k.t <= 0) bumperKnock = null;
    bumperCar.position.x = wrapCoordX(bumperCar.position.x);
    bumperCar.position.z = wrapCoordZ(bumperCar.position.z);
  } else {
  const chaseDir = new THREE.Vector3(
    wrappedDeltaX(bumperCar.position.x, car.position.x),
    0,
    wrappedDeltaZ(bumperCar.position.z, car.position.z)
  );
  const chaseDistance = chaseDir.length();
  if (chaseDistance < bumperStopDistance) {
    bumperState.stopped = true;
  } else if (chaseDistance > bumperResumeDistance) {
    bumperState.stopped = false;
  }
  bumperState.speed = bumperState.stopped ? 0 : bumperBaseSpeed;

  if (!bumperState.stopped && chaseDistance > 0.15) {
    chaseDir.normalize();
    const moveDistance = bumperState.speed * delta;
    const nextBumperPos = bumperCar.position.clone().addScaledVector(chaseDir, moveDistance);
    const blockedByBuilding =
      isPositionBlocked(nextBumperPos.x, nextBumperPos.z, aiCarRadius) ||
      isPositionBlockedByTraffic(nextBumperPos.x, nextBumperPos.z, aiCarRadius);
    const blockedByCar =
      Math.hypot(
        wrappedDeltaX(nextBumperPos.x, car.position.x),
        wrappedDeltaZ(nextBumperPos.z, car.position.z)
      ) < bumperStopDistance;

    if (!blockedByBuilding && !blockedByCar) {
      // Straight shot to the player is clear — drive toward it.
      bumperCar.position.copy(nextBumperPos);
    } else if (blockedByCar) {
      // Caught up to the player: hold still instead of orbiting around them.
      // It resumes chasing once the player drives past bumperResumeDistance.
    } else {
      // Blocked by a building or traffic (not the player): slide sideways
      // around it so the blue car doesn't get stuck.
      const perpDir = new THREE.Vector3(chaseDir.z, 0, -chaseDir.x);
      const tryRight = bumperCar.position.clone().addScaledVector(perpDir, moveDistance);
      const tryLeft = bumperCar.position.clone().addScaledVector(perpDir, -moveDistance);
      const clearOfPlayer = (p) =>
        Math.hypot(wrappedDeltaX(p.x, car.position.x), wrappedDeltaZ(p.z, car.position.z)) >= bumperStopDistance;
      if (
        !isPositionBlocked(tryRight.x, tryRight.z, aiCarRadius) &&
        !isPositionBlockedByTraffic(tryRight.x, tryRight.z, aiCarRadius) &&
        clearOfPlayer(tryRight)
      ) {
        bumperCar.position.copy(tryRight);
      } else if (
        !isPositionBlocked(tryLeft.x, tryLeft.z, aiCarRadius) &&
        !isPositionBlockedByTraffic(tryLeft.x, tryLeft.z, aiCarRadius) &&
        clearOfPlayer(tryLeft)
      ) {
        bumperCar.position.copy(tryLeft);
      }
    }

    // Face the nearest copy of the player so it steers through the seam too
    bumperCar.lookAt(
      bumperCar.position.x + chaseDir.x,
      bumperCar.position.y,
      bumperCar.position.z + chaseDir.z
    );
    bumperCar.rotateY(Math.PI / 2);
  }

  // When stopped, keep a small safe gap so it never overlaps you (and never
  // pins your velocity, so you can always drive away).
  if (bumperState.stopped && chaseDistance > 0.15 && chaseDistance < bumperStopDistance * 0.65) {
    const push = bumperStopDistance * 0.65 - chaseDistance;
    bumperCar.position.addScaledVector(chaseDir.normalize(), -push);
  }

  // Toroidal wrap for the blue car too
  bumperCar.position.x = wrapCoordX(bumperCar.position.x);
  bumperCar.position.z = wrapCoordZ(bumperCar.position.z);

  }  // end bumper knock else
  }  // end !robot.bumperCaptured

  // ===== City AI (traffic, robot, lizard, firetruck, train, collisions) =====
  // Paused entirely while the player is in the ramp world — those actors only
  // exist in the city scene.
  if (worldState === 'city') {
  // ===== Traffic: drive straight on the road, hold at red lights =====
  traffic.forEach((t) => {
    // Knocked by the player/firetruck: slide + spin out of the way. The knock
    // overrides normal lane driving until it dies down, then the car eases
    // back to its lane and straightens up to its lane heading.
    if (t.knock) {
      const k = t.knock;
      t.mesh.position.x += k.vx * delta;
      t.mesh.position.z += k.vz * delta;
      t.mesh.rotation.y += k.w * delta;
      const slide = (Math.abs(k.vx) + Math.abs(k.vz)) * delta;
      for (const w of t.mesh.userData.wheels) w.rotation.y += slide * 2.6;
      k.vx *= KNOCK_DECAY;
      k.vz *= KNOCK_DECAY;
      k.w *= KNOCK_DECAY;
      k.t -= delta;
      if (k.t <= 0) t.knock = null;
      // A knocked car stays on the road (wraps at ±80), not out in the field.
      if (t.axis === 'x') t.mesh.position.x = wrapRoad(t.mesh.position.x);
      else t.mesh.position.z = wrapRoad(t.mesh.position.z);
      t.mesh.position.x = wrapCoordX(t.mesh.position.x);
      t.mesh.position.z = wrapCoordZ(t.mesh.position.z);
      return;
    }
    const signal = axisSignal(clock.elapsedTime, t.axis);
    const travel = t.axis === 'x' ? t.mesh.position.x : t.mesh.position.z;
    // The four lanes cross at (±5.5, ±5.5), not at the road centre, so each
    // car must stop BEFORE the next perpendicular lane it would reach.
    const CROSS = 5.5;
    let nextCross = null;
    if (t.dir === 1) nextCross = travel < -CROSS ? -CROSS : (travel < CROSS ? CROSS : null);
    else nextCross = travel > CROSS ? CROSS : (travel > -CROSS ? -CROSS : null);
    let speedCur = t.speed;
    if (signal !== 2 && nextCross !== null) {
      const distToCross = (nextCross - travel) * t.dir;   // >0 => approaching
      // Stop 2.5..6 units short of the crossing; once committed (<2.5), clear it.
      if (distToCross > 2.5 && distToCross < 6) speedCur = 0;
    }
    // Car-following: ease off (or stop) as you near the car ahead in your lane
    // (and brake for the player / fire engine if they're standing in your
    // lane), so nothing drives straight through you and queues never pile up.
    const ahead = distanceToObstacleAhead(t);
    if (ahead < CAR_FOLLOW_GAP) {
      const speedCap = ((ahead - CAR_FOLLOW_STOP) / (CAR_FOLLOW_GAP - CAR_FOLLOW_STOP)) * t.speed;
      speedCur = ahead < CAR_FOLLOW_STOP ? 0 : Math.min(speedCur, Math.max(speedCap, 0));
    }
    // Collision recoil (bounce): decays each frame so a bumped car eases back
    // instead of instantly re-pressing into whatever it just hit.
    if (t.bounceRecoil) {
      t.bounceRecoil *= 0.8;
      if (Math.abs(t.bounceRecoil) < 0.1) t.bounceRecoil = 0;
      speedCur += t.bounceRecoil;
    }
    t.speedCur = speedCur;
    const step = t.speedCur * delta;
    if (t.axis === 'x') t.mesh.position.x += t.dir * step;
    else t.mesh.position.z += t.dir * step;
    // Roll the wheels
    for (const w of t.mesh.userData.wheels) w.rotation.y += step * 2.6;
    // Ease back toward the lane centre after being knocked out of the way...
    let lat = t.axis === 'x' ? t.mesh.position.z : t.mesh.position.x;
    // Pothole detour — ONLY westbound cars (approaching from the east) swerve.
    // Eastbound traffic is unaffected (the pothole is on the north edge).
    if (!t.latOff) t.latOff = 0;
    const tdx = t.mesh.position.x - POTHOLE.x;
    const tDist = Math.abs(tdx);
    const coneZone = POTHOLE.radius + 10;
    // Only trigger for eastbound (dir=1) cars at z≈5.5, approaching from the west
    const inZone = t.axis === 'x' && t.dir === 1 && tDist < coneZone && tdx < 0;
    if (inZone) {
      t.latOff = Math.max(t.latOff - 0.3 * delta, -0.2911);
    } else {
      t.latOff *= Math.pow(0.3, delta);
    }
    lat += t.latOff;
    lat = THREE.MathUtils.clamp(lat, -11, 11);
    // Only ease back to lane when detour is done — prevents jitter
    if (Math.abs(t.latOff) < 0.3) {
      lat += (t.homeLat - lat) * 1.2 * delta;
    }
    if (t.axis === 'x') t.mesh.position.z = lat;
    else t.mesh.position.x = lat;
    // ...and straighten back up to the lane heading after being spun around.
    const targetH = laneHeading(t);
    let dh = targetH - t.mesh.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));   // shortest way around
    t.mesh.rotation.y += dh * Math.min(1, 2.0 * delta);
    // Wrap at the road extent so traffic stays on the roads (it must never
    // drive out into the grass field); the lateral axis wraps with the world.
    if (t.axis === 'x') t.mesh.position.x = wrapRoad(t.mesh.position.x);
    else t.mesh.position.z = wrapRoad(t.mesh.position.z);
    t.mesh.position.x = wrapCoordX(t.mesh.position.x);
    t.mesh.position.z = wrapCoordZ(t.mesh.position.z);
  });

  // Never let two traffic cars sit in the same spot — remove both if they do
  deOverlapTraffic();

  // Giant robot: patrols the city, spots cars, chases them, picks them up and
  // eats them. It mutates the traffic array (splices victims, respawns them)
  // and may capture the player / blue car.
  robot.update(delta, {
    wrapX: wrapCoordX,
    wrapZ: wrapCoordZ,
    wrapDeltaX: wrappedDeltaX,
    wrapDeltaZ: wrappedDeltaZ,
    colliders,
    player: { mesh: car },
    bumper: { mesh: bumperCar },
    traffic,
    onPlayerEaten: respawnPlayer,
    onBumperEaten: respawnBumper,
  });

  // Flame lizard: scurries to unlit buildings and sets them alight so the
  // fire engine always has a fire to fight.
  lizard.update(delta, {
    wrapX: wrapCoordX,
    wrapZ: wrapCoordZ,
    wrapDeltaX: wrappedDeltaX,
    wrapDeltaZ: wrappedDeltaZ,
    fires: firetruck.fires,
    ignite: firetruck.ignite,
    robot: robot.mesh.position,
    player: car.position,
    colliders,
  });

  // Autonomous fire engine: patrol the roads, drive to fires, douse them
  firetruck.update(delta, {
    wrapX: wrapCoordX,
    wrapDeltaX: wrappedDeltaX,
    blocked: () => {
      for (const t of traffic) {
        const dx = wrappedDeltaX(firetruck.truck.position.x, t.mesh.position.x);
        const dz = wrappedDeltaZ(firetruck.truck.position.z, t.mesh.position.z);
        if (dx * dx + dz * dz < 4.2 * 4.2) return true;
      }
      // Don't drive straight through the player either.
      const pdx = wrappedDeltaX(firetruck.truck.position.x, car.position.x);
      const pdz = wrappedDeltaZ(firetruck.truck.position.z, car.position.z);
      if (pdx * pdx + pdz * pdz < 4.2 * 4.2) return true;
      // ...or through the giant robot's legs.
      const rdx = wrappedDeltaX(firetruck.truck.position.x, robot.mesh.position.x);
      const rdz = wrappedDeltaZ(firetruck.truck.position.z, robot.mesh.position.z);
      if (rdx * rdx + rdz * rdz < 6.0 * 6.0) return true;
      return false;
    },
  });

  // Freight train: advances along its loop of rails. Solid to the player and
  // the blue car (they bounce off) and the hit car wobbles, but it never
  // leaves the track.
  train.update(delta, {
    wrapDeltaX: wrappedDeltaX,
    wrapDeltaZ: wrappedDeltaZ,
    player: car.position,
    playerR: playerCarRadius,
    bumper: bumperCar.position,
    bumperR: aiCarRadius,
  });

  // Car-vs-car collisions: push overlapping vehicles apart and bounce them so
  // nothing drives through anything else.
  resolveCarCollisions();

  }  // end city AI (worldState === 'city')

  // Chase camera — held in updateCamera() so it can also keep running while
  // the game is paused (scroll-wheel zoom + drag orbit stay live).
  updateCamera(delta);

  // City ambience (traffic lights, props, fountains, pedestrians) — only in
  // the city; the ramp world has none of these.
  if (worldState === 'city') {
  // 4-way traffic lights: E/W (x-axis) and N/S (z-axis) alternate on a 12s
  // cycle, so crossing traffic doesn't slam into each other.
  trafficLights.forEach(({ bulbs, axis }) => {
    const active = axisSignal(clock.elapsedTime, axis);   // 0=red, 1=amber, 2=green
    bulbs.forEach((b, i) => { b.material.emissiveIntensity = i === active ? 1.5 : 0; });
  });

  // Gentle fountain splashes in the centre plaza
  updateFountains(fountains, delta);

  // Fire hydrant water sprays
  updateHydrantSprays(delta);

  // Animate hovering rings in the open building
  updateHoveringRings(clock.elapsedTime);

  // Small NW-corner marker arrow: spin on its axis, planted on the ground
  updateNwCornerArrow(delta);

  // Walk the pedestrians (they scream and scatter when you or the robot get close)
  updatePeople(delta, { player: car.position, robot: robot.mesh.position });
  }  // end city ambience

  // Animate knockable props in BOTH worlds — the city's props and the ramp
  // world's pins / dominoes / barrels / logs all run through this one system.
  updateKnockables(delta);

  // The giant rolling rock can flatten the car; while flat, the car still
  // drives but settles lower to the ground and eventually rebounds taller.
  updateFlatCarState(delta);

  // Underworld animation: the Glass City's mechanical birds flap and its blue
  // trees slowly turn (the update early-outs unless you're near the city).
  if (worldState === 'underground') {
    undergroundWorld.update(delta, car.position);
  }

  // Tier 3 moving dangers (hammers, trebuchet, boulder, wheel rim) — ramp
  // world only. Runs every frame; it does its own worldState gate.
  updateRampWorldDanger(delta);

  // Blue car follow in the ramp world: countdown, then chase + knock props.
  updateRampWorldBumper(delta);

  // ===== Portal triggers: driving under the ramp-world vortex swaps worlds =====
  // under the ramp-world vortex swaps worlds =====
  // A short grace timer (set on teleport) stops a portal/vortex from instantly
  // re-catching the car the moment it emerges on the other side.
  if (portalGrace > 0) portalGrace -= delta;
  if (portalGrace <= 0 && worldState === 'ramp') {
    // Driving UNDER the vortex (grounded, near its centre) warps you back to
    // the city — dropping you in mid-air above the town centre.
    if (!jumpState.inAir && isInVortexReturnZone(car.position.x, car.position.z, vortex.x, vortex.z, vortexReturnRadius)) {
      enterCityWorld();
    }
  }

  // ===== Building levitation trigger (portal building 56,20) =====
  if (portalGrace <= 0 && worldState === 'city') {
    const insideBuilding = isInsideLevitationHall(car.position.x, car.position.z, buildingLevitate, car.position.y);
    const stillInArea = isStillWithinLevitationHall(car.position.x, car.position.z, buildingLevitate);
    if (insideBuilding) {
      if (!buildingLevitate.active) {
        buildingLevitate.active = true;
        buildingLevitate.timer = 0;
        buildingLevitate.levitating = false;
      }
    } else if (!buildingLevitate.levitating && !stillInArea) {
      // Car drove well clear before levitation started — reset
      buildingLevitate.active = false;
      buildingLevitate.timer = 0;
    }
    if (buildingLevitate.active) {
      buildingLevitate.timer += delta;
      if (buildingLevitate.timer >= 1.2 && !buildingLevitate.levitating) {
        // Start levitation
        buildingLevitate.levitating = true;
        velocity.value = 0;
        shake.intensity = Math.max(shake.intensity, 0.3);
      }
      if (buildingLevitate.levitating) {
        // Rise upward: slow start, then accelerate over 4 seconds.
        // Use a quadratic ease-in: speed = maxSpeed * (t/4)^2 so the car
        // barely moves at first and rockets upward by the end.
        buildingLevitate.levitateTime += delta;
        const t = Math.min(buildingLevitate.levitateTime / 4, 1);  // 0..1
        const speed = 18 * t * t;  // quadratic ease-in, peaks at 18 u/s
        car.position.y += speed * delta;
        // Slowly fade horizontal velocity to zero
        velocity.value *= 0.95;
        // Keep floating well past the roof so the ground-level camera gets a
        // long look at the car drifting up into the sky before the swap.
        if (car.position.y > buildingLevitate.h + 8) {
          enterRampWorld();
          buildingLevitate.active = false;
          buildingLevitate.levitating = false;
          buildingLevitate.levitateTime = 0;
          buildingLevitate.timer = 0;
        }
      }
    }
  }

  // ===== Mine shaft portal (-55,50 → underground) =====
  // When the car drives deep into the mine tunnel (south past z=42), the nose
  // tips forward/down first, then the rest of the car sinks in after it —
  // about 4 seconds total — before it teleports to the underground world.
  if (portalGrace <= 0 && worldState === 'city') {
    const inTunnel = isInMineDiveTrigger(car.position.x, car.position.z, minePortal) && !jumpState.inAir;
    if (inTunnel) {
      if (!minePortal.active) {
        minePortal.active = true;
        minePortal.timer = 0;
        minePortal.baseY = car.position.y;   // remember the surface height
        // Don't freeze velocity — let the car coast toward the crystals
      }
    } else if (minePortal.active) {
      // Car left the trigger zone before teleport — reset
      minePortal.active = false;
      minePortal.timer = 0;
      car.rotation.z = 0;    // undo any tilt
    }
    if (minePortal.active) {
      minePortal.timer += delta;
      // Gradually slow down as the nose dips — the car coasts deeper toward
      // the crystals but eases to a stop before the teleport fires.
      velocity.value *= (1 - 1.5 * delta);

      // Two-phase dive, ~4 seconds end to end:
      //   Phase 1 (0–tiltTime): ONLY the nose tips forward/down, pivoting
      //     around the rear axle so the back wheels stay planted while the
      //     hood dips toward the dirt.
      //   Phase 2 (tiltTime–diveTotal): the REST of the car follows the nose
      //     under, sinking below the surface while holding the tilted pose.
      const tiltT = Math.min(minePortal.timer / minePortal.tiltTime, 1);
      // Smoothstep ease so the nose dip starts gently and settles smoothly.
      const tiltEase = tiltT * tiltT * (3 - 2 * tiltT);
      const tiltAngle = tiltEase * minePortal.maxTilt;
      car.rotation.z = tiltAngle;  // positive rotation.z = hood/nose dips DOWN

      if (tiltT < 1) {
        // Phase 1: keep the rear wheels grounded by dropping the body exactly
        // as far as the pivot geometry demands for the current tilt angle.
        car.position.y = minePortal.baseY - Math.sin(tiltAngle) * minePortal.rearAxle;
      } else {
        // Phase 2: sink the whole car, easing in so the hand-off from tilt
        // to sink reads as one continuous motion. Depth covers the full body
        // length by the time the teleport fires.
        const sinkT = Math.min(
          (minePortal.timer - minePortal.tiltTime) / (minePortal.diveTotal - minePortal.tiltTime), 1);
        const sinkDepth = sinkT * sinkT * 3.5;   // quadratic ease-in
        car.position.y = minePortal.baseY -
          Math.sin(minePortal.maxTilt) * minePortal.rearAxle - sinkDepth;
        // Keep tipping a touch further as it goes under for extra drama.
        car.rotation.z = minePortal.maxTilt + sinkT * 0.15;
      }

      // Camera shake builds as the dive deepens
      shake.intensity = Math.max(shake.intensity, 0.15 + tiltT * 0.4);
      // Teleport once the full dive completes (~4 seconds)
      if (minePortal.timer >= minePortal.diveTotal) {
        enterUndergroundWorld();
      }
    }
  }

  // Underground world: return portal (tunnel foot → city)
  // Driving into the tunnel foot area in the underground teleports back.
  if (portalGrace <= 0 && worldState === 'underground') {
    const tEnd = tunnelPoint(1);
    if (!jumpState.inAir && isInUndergroundReturnZone(car.position.x, car.position.z, tEnd.x, tEnd.z, 8)) {
      leaveUndergroundWorld();
    }
  }

  // Mine portal: glow pulse on crystals when the car is inside the tunnel
  if (worldState === 'city' && minePortal.active) {
    // Crystal glow is handled by the emissive materials — no extra animation needed
  }

  // Ramp-world vortex: spin the spiral arms, the shear rings, and the rising
  // funnel ribbons, and pulse the funnel. It only exists in the ramp world.
  if (worldState === 'ramp') {
    const vt = clock.elapsedTime;
    vortex.armSpin.rotation.y = vt * 1.2;
    vortex.ringSpin.rotation.y = -vt * 0.7;
    vortex.ribbonSpin.rotation.y = vt * 2.1;
    vortex.funnel.material.opacity = 0.16 + 0.08 * Math.sin(vt * 2.4);
    // Wheel of death: spin the hoop about its axle so the spokes sweep around.
    wheelOfDeath.spin.rotation.z = -vt * 2.4;
    // Clouds drift slowly across the sky and wrap around so it never empties.
    for (const c of clouds) {
      c.position.x += c.userData.speed * delta;
      if (c.position.x > 112) c.position.x = -112;
      else if (c.position.x < -112) c.position.x = 112;
    }
  }

  drawMinimap();

  renderer.render(worldState === 'ramp' ? rampScene : worldState === 'underground' ? undergroundScene : scene, camera);
}

animate();

// ===== Dev hook (?debug in the URL) =====
// Exposes a minimal read/teleport API on window for automated testing.
// Inert during normal play.
if (location.search.includes('debug')) {
  window.__game = {
    car: () => ({ x: car.position.x, y: car.position.y, z: car.position.z, rz: car.rotation.z, world: worldState }),
    // Small NW-corner marker arrow (read-only): live position
    nwArrow: () => ({ x: nwArrow.position.x, y: nwArrow.position.y, z: nwArrow.position.z }),
    teleport(x, z, heading = 0) {
      car.position.set(x, groundHeight, z);
      car.rotation.set(0, heading, 0);
      velocity.value = 0;
      steering.value = 0;
    },
    // Underground prompt-block bump state (tasks #6–#7) for automated testing.
    ugBumps: () => ({
      count: undergroundWorld.bumpCount,
      last: undergroundWorld.lastBump,
      blocks: undergroundWorld.promptBlocks.map((b) => ({
        x: b.x, y: b.y, z: b.z, armed: b.armed,
        cooldown: +b.cooldown.toFixed(2), flash: +b.flash.toFixed(2),
        emissive: +b.mat.emissiveIntensity.toFixed(2),
      })),
    }),
    // Live foam-collectible state (task #8) for automated testing.
    ugFoam: () => undergroundWorld.foamPieces.map((f) => ({
      x: +f.mesh.position.x.toFixed(1),
      y: +f.mesh.position.y.toFixed(1),
      z: +f.mesh.position.z.toFixed(1),
      bounces: f.bounces,
      age: +f.age.toFixed(2),
      scale: +f.mesh.scale.x.toFixed(2),
    })),
    // Debug-only foam spawner (task #9): lets tests drive the FOAM_MAX
    // recycle path instantly instead of waiting on real bump rates.
    ugSpawnFoam: (x, y, z) => undergroundWorld.spawnFoam(x, y, z),
    // Conduit-pipe state (tasks #11–#14) for automated testing.
    ugPipes: () => undergroundWorld.conduitPipes.map((p) => ({
      x: +p.mesh.position.x.toFixed(2),
      y: +p.mesh.position.y.toFixed(1),
      z: +p.mesh.position.z.toFixed(1),
      axis: p.axis,
      hits: p.hitCount,
      cd: +Math.max(0, p.hitCooldown).toFixed(2),
    })),
    // Elevator deck state (tasks #16–#18) for automated testing.
    ugElev: () => {
      const c = undergroundWorld.colliders.find((k) => k.soft);
      return c ? { x: c.x, z: c.z, h: +c.h.toFixed(2) } : null;
    },
  };
}


// ===== Camera drag / orbit =====
renderer.domElement.addEventListener('pointerdown', (event) => {
  isDragging = true;
  dragStart.x = event.clientX;
  dragStart.y = event.clientY;
  dragStart.yaw = cameraYawOffset;
  dragStart.phi = cameraOrbit.phi;
});

window.addEventListener('pointermove', (event) => {
  if (!isDragging) return;
  const deltaX = event.clientX - dragStart.x;
  const deltaY = event.clientY - dragStart.y;
  cameraYawOffset = dragStart.yaw - deltaX * 0.005;
  cameraOrbit.phi = THREE.MathUtils.clamp(dragStart.phi + deltaY * 0.005, cameraOrbit.minPhi, cameraOrbit.maxPhi);
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

// ===== Resize =====
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
