import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { buildMap, updateHoveringRings, PORTAL_HILL, portalHillHeightAt } from './map.js?v=1787160950001';
import { addProps, updateFountains, updateMineGems, updateHydrantSprays, resetHydrantSprays, POTHOLE, LAKE, standingCones, MINE_ADIT_PROFILE } from './props.js?v=1787180000003';
import { createCar, createLittleCar, createChevy57Taxi, createSteamroller, createVWBug, createMonsterTruck, createSchoolBus, createIndyCar, createSkateboarder, createRaccoonHotRod, addTrafficCars } from './cars.js?v=1790448808379';
import { addFiretruck } from './firetruck.js?v=1787510500000';
import { cityFireSpots, updateCityBuildings } from './cityBuildings.js';
import { addPeople } from './people.js?v=1790448808372';
import { addRobot, buildRobotModel } from './robot.js?v=1790400453800';
import { addTrain, makeLocomotive, buildFreightCars, SPACING } from './train.js?v=1790445221394';
import { addLizard } from './lizard.js';
import { makeTarantula, addRampTarantula, updateTarantulaNpc, wakeTarantula } from './modules/tarantula.js?v=1790448808376';
import { updateKnockables, knockAt, resetKnockables, snapKnockables } from './physics.js';
import { createFlatCarState, getFlatCarScaleY, stepFlatCarState } from './carFlatMode.mjs';
import { createTaffyState, getTaffyScale, stepTaffyState } from './carTaffyMode.mjs';
import { EXPRESS_TUBE, expressTubeLength, expressTubeNearest, expressTubePoint, expressTubeTangent } from './modules/expressTube.js?v=1790448808372';
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
} from './modules/portalRules.js?v=1789754556173';
import { resolveStuck, wallNormal } from './modules/unstick.js';
import { buildRampWorld, buildRampWorldProps, createClouds, createWheelOfDeath, buildRampWorldRamps, createVortex, rampWorldFeatures, wheelOfDeathDef, wheelOfDeathPaddles, buildHammers, createTrebuchet, createRollingBoulder } from './levels/rampworld/index.js';
import { addUnderground, UNDERGROUND_Y, TUNNEL, tunnelPoint, CEIL_Y } from './levels/underground/index.js?v=1790448808373';

// ===== Real loading progress =====
// The loader (index.html) is driven by actual build progress. Heavy world
// building is split into chunks below; before each chunk we call __loaderYield
// which (a) reports the fraction done + the piece being built to the loader and
// (b) waits two animation frames so the browser can paint the loader at that
// % while the next chunk runs. The loader bar only ever moves TOWARD a real
// reported fraction, so it can never be stuck at a number no real work backs.
const __loaderYield = (frac, label) =>
  new Promise((resolve) => {
    if (window.__loadingProgress) {
      try { window.__loadingProgress(frac, label); } catch (e) {}
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });

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
const SPIDER_CAM_DIST = 55;       // giant tarantula within this many units starts zooming out
const TARANTULA_CAM_MAX_RADIUS = 34;  // fully zoomed distance so the whole spider fits the frame
// User yaw offset (radians) added to the car's heading for the chase cam
let cameraYawOffset = 0;
const cameraTarget = new THREE.Vector3(0, 0.6, 0);
// Eased offset from the locomotive to the middle of the whole consist (the
// AABB of every trailing car), so the train camera dollies to the halfway
// point as the chain snakes instead of yanking along the loco's heading.
const trainCamShift = new THREE.Vector3();
const trainCamDesired = new THREE.Vector3();
const _camTempV = new THREE.Vector3();
const _camZeroV = new THREE.Vector3();
// Underground train camera: keep the lens under the checkerboard ceiling when
// the whole-consist zoom-out would otherwise push the camera up through the
// colorful tiles and hide the locomotive.
const UG_TILE_UNDER = 30.15;     // checkerboard underside (CEIL_Y + 0.15)
const UG_TRAIN_CAM_MAX_Y = 29.4; // tallest spot that still clears the tiles
const CAMERA_MANUAL_HOLD = 10;
const CAMERA_RETURN_SPEED = 4;
let cameraManualTimer = 0;
// Hole-fall cinematic: when the car drops through a crumbled checkerboard
// tile in the underground ceiling, the camera zooms in close and follows it
// down through the hole, then eases back out once it lands.
let holeFallActive = false;
let holeFallTimer = 0;
const HOLE_FALL_CAM_RADIUS = 3.0;   // tight close-up while falling
const HOLE_FALL_CAM_PHI = 1.38;     // tilt down to watch the drop
const HOLE_FALL_MAX_TIME = 6;       // safety: force end after this long
const _lookTarget = new THREE.Vector3(0, 0.6, 0);      // persistent across frames
const _mineCamTarget = new THREE.Vector3();   // reused each frame during mine dive
const _mineLookTarget = new THREE.Vector3();
const _levCamTarget = new THREE.Vector3();    // reused each frame during levitation
const _levLookTarget = new THREE.Vector3();
const _spiralCamTarget = new THREE.Vector3(); // reused each frame during the spiral-arrival shot
const _spiralLookTarget = new THREE.Vector3();
const _postCineCamPos = new THREE.Vector3();  // saved tripod position for the post-cinematic ease
const _postCineLookPos = new THREE.Vector3(); // saved look target for the post-cinematic ease
let _postCineTimer = 0;                       // counts down during the ease-in to chase view
let _postCineHandoff = false;                  // true for one frame after ease ends — syncs camOffset
const _mineAscentCamPos = new THREE.Vector3();  // emergence-shot camera position (mine ascent)
const _mineAscentLookPos = new THREE.Vector3(); // emergence-shot look target (mine ascent)
const _tunnelAscentCamTarget = new THREE.Vector3();  // tunnel-ascent camera target (underground → city)
const _tunnelAscentLookTarget = new THREE.Vector3(); // tunnel-ascent look target
const _chamberCam = new THREE.Vector3();             // holy-chamber cinematic camera position
const _chamberLook = new THREE.Vector3();            // holy-chamber cinematic look target
let _camDbg = {};   // TEMP debug: populated by updateCamera each frame
// Fade-to-black overlay for the mine-shaft dive → underground transition.
// Cuts to black when the car is about halfway sunk, then fades back in
// once the underground world is loaded.
const _fadeOverlay = document.createElement('div');
_fadeOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:9999;opacity:0;pointer-events:none';
document.body.appendChild(_fadeOverlay);
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
// Pinch-to-zoom state: tracks every touch/pen pointer that lands on the
// canvas so a second finger switches from orbit-drag into zoom (the touch
// twin of the scroll-wheel zoom below). `pinchPointers` is keyed by
// pointerId; `dragPointerId` marks the single pointer driving the orbit drag.
const pinchPointers = new Map();   // pointerId -> { x, y } (client coords)
let dragPointerId = null;          // pointerId currently driving the orbit drag
let pinchActive = false;
let pinchStartDist = 1;            // finger spacing when the pinch began
let pinchStartRadius = cameraOrbit.radius;

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
await __loaderYield(0.04, 'the city streets');
const { buildingColliders, ramps } = buildMap(scene);
await __loaderYield(0.08, 'the traffic lights');
const { trafficLights, fountains, mineColliders, mineGems } = addProps(scene);
await __loaderYield(0.12, 'the traffic cars');
const traffic = addTrafficCars(scene);
await __loaderYield(0.16, 'the pedestrians');
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

function isPositionBlocked(x, z, radius, ignoreAIOnly = false) {
  const list = worldState === 'underground' ? ugColliders : colliders;
  // `soft` colliders (staircase steps, the checkerboard ceiling) never block
  // driving — they only feed buildingTopAt so you can land on / ride them.
  // `aiOnly` colliders (the mine pit) block AI traffic but not the player car.
  // `soapy` colliders (the car wash lattice walls) never hard-block either —
  // the wash's soap-glide owns their containment (smooth recentring to the
  // lane centre instead of a knock).
  return list.some((collider) =>
    !collider.soft &&
    !collider.soapy &&
    !(ignoreAIOnly && collider.aiOnly) &&
    rectCircleIntersect(x, z, collider, radius));
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
  // City prop — only exists in the city world. Without this gate its street
  // position leaks into the underground and invisibly walls off course props
  // that share the same x/z.
  if (worldState !== 'city') return false;
  const dx = wrappedDeltaX(x, firetruck.truck.position.x);
  const dz = wrappedDeltaZ(z, firetruck.truck.position.z);
  return dx * dx + dz * dz <= (radius + firetruckColliderR) * (radius + firetruckColliderR);
}

// And the giant robot is a colossal moving obstacle — you can't drive through
// its legs (unless it's currently holding you in its claw).
function isPositionBlockedByRobot(x, z, radius) {
  // City prop — same world-gate as the firetruck above.
  if (worldState !== 'city') return false;
  const dx = wrappedDeltaX(x, robot.mesh.position.x);
  const dz = wrappedDeltaZ(z, robot.mesh.position.z);
  return dx * dx + dz * dz <= (radius + robot.radius) * (radius + robot.radius);
}

// ===== Anti-stuck =====
// Every solid thing the grounded car can be wedged against: the active
// world's solid colliders (soft ones never block driving) plus the two city
// obstacles that block movement (fire engine, robot). Circle centres are
// pre-wrapped into the car's unwrapped space so the pure math sees them.
function playerSolids() {
  const list = worldState === 'underground' ? ugColliders : colliders;
  const solids = [];
  for (const c of list) {
    // soapy (car wash lattice) colliders are excluded too — the wash's
    // soap-glide clamps the car to the bay smoothly instead of the anti-stuck
    // pass shoving it out along the shortest escape (a "jerk" inside the wash).
    if (!c.soft && !c.soapy) solids.push({ kind: 'rect', x: c.x, z: c.z, hw: c.halfW, hd: c.halfD });
  }
  if (worldState === 'city') {
    solids.push({
      kind: 'circle',
      x: car.position.x + wrappedDeltaX(car.position.x, firetruck.truck.position.x),
      z: car.position.z + wrappedDeltaZ(car.position.z, firetruck.truck.position.z),
      r: playerCarRadius + firetruckColliderR,
    });
    solids.push({
      kind: 'circle',
      x: car.position.x + wrappedDeltaX(car.position.x, robot.mesh.position.x),
      z: car.position.z + wrappedDeltaZ(car.position.z, robot.mesh.position.z),
      r: playerCarRadius + robot.radius,
    });
  }
  return solids;
}

// True when the car body currently overlaps something solid (the same tests
// that block driving — callers exempt airborne / rooftop / ramp-world cars,
// which legitimately sit "inside" collider footprints from the map's view).
function carIsOverlappingSolid() {
  return isPositionBlocked(car.position.x, car.position.z, playerCarRadius, true) ||
    isPositionBlockedByFiretruck(car.position.x, car.position.z, playerCarRadius) ||
    isPositionBlockedByRobot(car.position.x, car.position.z, playerCarRadius);
}

// Car-following: target following gap and hard-stop gap behind the car ahead.
// Traffic are good drivers — they keep at least two car lengths between their
// bumpers so they never touch. `ahead` is measured centre-to-centre, and a car
// body is 4.3 units long (see trafficHalfLen below), so a two-car-length
// bumper gap (8.6) means a centre-to-centre gap of 8.6 + 4.3 = 12.9.
const TRAFFIC_CAR_LEN = 4.3;   // createCar body length (matches trafficHalfLen below)
const CAR_FOLLOW_STOP = TRAFFIC_CAR_LEN * 3;   // 12.9 centre-to-centre = 2 car lengths of bumper gap (never closer)
const CAR_FOLLOW_GAP = TRAFFIC_CAR_LEN * 4;    // 17.2 centre-to-centre = 3 car lengths of bumper gap (start easing off)

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
  // Steamrollers drive over the player — don't brake for them. And when the
  // PLAYER is the steamroller, traffic doesn't brake for it either: the roller
  // plows straight through and the smash collision knocks cars aside (below).
  if (!t.isSteamroller && !playerSteamroller) {
    const p = aheadDist(mx, mz, t.dir, t.axis, car.position.x, car.position.z);
    if (p < best) best = p;
  }
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
      // The steamroller is a ghost — it may overlap other cars without
      // either being removed.
      if (a.isSteamroller || b.isSteamroller) continue;
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
  if (!robot.playerCaptured) list.push({ mesh: car, radius: playerCarRadius, kind: 'player', steamroller: playerSteamroller });
  if (!robot.bumperCaptured) list.push({ mesh: bumperCar, radius: aiCarRadius, kind: 'bumper' });
  list.push({ mesh: firetruck.truck, radius: firetruckColliderR, kind: 'firetruck' });
  for (const t of traffic) {
    // The steamroller is a ghost — it drives right over the player car (and
    // everything else) without bumping or shoving anything, so it never
    // joins the collision pass.
    if (t.isSteamroller) continue;
    list.push({ mesh: t.mesh, radius: trafficCarRadius, kind: 'traffic', t });
  }
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
function applyBounce(me, nx, nz, foeKind, foeSteamroller) {
  if (me.kind === 'player') {
    // Recoil the player's scalar speed: shoved forward if hit from behind,
    // knocked backward if hit head-on. Hitting a light car barely slows you
    // (it gets shoved out of the way); only the heavy truck stops you hard.
    const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
    dir.y = 0;
    dir.normalize();
    const align = dir.x * nx + dir.z * nz;
    const heavy = foeKind === 'firetruck';
    // A steamroller barely feels light traffic — it runs them over (tiny
    // recoil, less velocity bleed); only the fire engine really slows it.
    let knock;
    if (me.steamroller) {
      knock = heavy ? (align >= 0 ? 3.2 : -3.8) : (align >= 0 ? 0.5 : -0.3);
    } else {
      knock = heavy ? (align >= 0 ? 3.2 : -3.8) : (align >= 0 ? 2.2 : -1.0);
    }
    velocity.value = THREE.MathUtils.clamp(velocity.value * (me.steamroller ? 0.85 : 0.5) + knock, -6, 6);
    shake.intensity = Math.max(shake.intensity, heavy ? 0.15 : 0.07);
  } else if (me.kind === 'traffic') {
    const t = me.t;
    // Run over by the player's steamroller: a much heavier knock + spin so
    // cars go tumbling out of the way (and don't brake for it, either).
    const smash = foeKind === 'player' && foeSteamroller;
    if (!t.knock && (foeKind === 'player' || foeKind === 'firetruck')) {
      // A hard hit: knock the car aside with a spin (the end you hit swings
      // away first), then it eases back to its lane and heading. Only the
      // first contact counts — a car already tumbling isn't re-knocked.
      const power = smash ? 32 : (foeKind === 'player' ? 12 : 9);
      const spin = smash ? 7 : (foeKind === 'player' ? 3.6 : 2.8);
      t.knock = makeKnock(t.mesh, trafficHalfLen, trafficHalfWid, nx, nz, power, spin);
      if (smash) shake.intensity = Math.max(shake.intensity, 0.25);
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
    // discrete knock per hit, no compounding while it's still tumbling. A
    // steamroller sends it flying like everything else.
    const smash = foeKind === 'player' && foeSteamroller;
    if (!bumperKnock && (foeKind === 'player' || foeKind === 'firetruck')) {
      const power = smash ? 30 : (foeKind === 'player' ? 13 : 10);
      const spin = smash ? 8 : (foeKind === 'player' ? 4.2 : 3.2);
      bumperKnock = makeKnock(bumperCar, bumperHalfLen, bumperHalfWid, nx, nz, power, spin);
      if (smash) shake.intensity = Math.max(shake.intensity, 0.25);
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
      // foeSteamroller tells a victim it was run over by the player's roller,
      // which turns the nudge into a full smash.
      applyBounce(a, -nx, -nz, b.kind, b.steamroller);
      applyBounce(b, nx, nz, a.kind, a.steamroller);
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
await __loaderYield(0.19, 'the player car');
const car = createCar(0xa61e1e);
car.position.set(0, 0.15, 0);
scene.add(car);

// Autonomous fire engine: patrols the roads and douses roof fires on its own.
// It is handed the city's fire-tagged colliders so the fires always sit on real
// roofs of buildings that are actually standing.
await __loaderYield(0.21, 'the fire engine');
const firetruck = addFiretruck(scene, cityFireSpots(buildingColliders));

// Giant eating robot: stomps around the city, chases down cars, picks them
// up and eats them. The player gets eaten too (and respawns).
await __loaderYield(0.23, 'the giant eating robot');
const robot = addRobot(scene);

// Freight train circling the town on rails outside it: locomotive + 4 boxcars
// + caboose. Knockable / wobbles when you run into it, but never derails.
await __loaderYield(0.25, 'the freight train');
const train = addTrain(scene);

// Small flame lizard: scurries around town and sets buildings on fire. It is
// the only thing that relights doused buildings, so it keeps the fire engine
// busy. Flees the robot and the player car.
await __loaderYield(0.27, 'the flame lizard');
const lizard = addLizard(scene);

await __loaderYield(0.29, 'the steamroller');
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
let ugDbg = null;   // ?debug: which underground physics branch ran last frame
// Player's previous-frame end position — feeds the vert-pop "outward travel"
// gate. Captured at the end of each underground physics pass so the gate can
// tell rolling-in from genuinely driving up and out over a pipe lip.
let playerPrevX = 0, playerPrevZ = 0;
const gravity = 18;
const groundHeight = 0.15;
let flatCarState = createFlatCarState(false);
// 2026-09-23 factory-floor attraction states.
let taffyState = createTaffyState();          // car-squash noodle stretch (taffy pullers)
let bubbleWobble = 0;                          // steering wobble while freshly popped
let magnetHold = null;                         // { t } while a magnet yanks the car up
// Riding the pneumatic express tube. `dir` +1 = glass-city intake → skate-park
// exit, -1 = the return ride; `cooldown` blocks an instant re-grab right after
// an exit drop (the landing spot is a grab window at either mouth); `lastDir`
// remembers which way the last completed ride went so the post-ride montage
// can watch the right landing.
let expressState = { active: false, s: 0, dir: 1, cooldown: 0, lastDir: 1 };
let expressCinT = 0;  // hold time left for the express-tube camera montage AFTER
                      // the ride pops the car out (watches the landing, then a
                      // post-cine ease slides the camera back onto the chase view)
// Express-tube cinematic cameras — the FIXED positions the montage cuts between
// (world coords; y is the float height). Consumed by updateCamera (the cut
// timeline). s-units: s = 0.268 ≈ 3.0s into the ride (RIDE_SPEED 26 / len ≈290.9).
const EXPRESS_CAM_SHOTS = [
  { lo: 0.268, hi: 0.62, x: 86, y: 1.8, z: 100, n: 1 },   // ground — past the staircase, eastbound run (holds through the westbound transit)
  { lo: 0.62,  hi: 1.01, x: -42, y: 16, z: -14, n: 2 },   // air (under tiles) — watches the dive out, from a bit earlier
];
let lastGrounded = 0;                          // clock the car last sat on the floor
let wasOnRamp = null;   // { runX, runZ } of the ramp the car just drove off
let currentRamp = null; // ramp the car is ON right now (for body tilt)
// Ramp-world terrain pitch target: the car rides the dirt on its FRONT and
// REAR axles separately, so the nose rocks up as the front wheels crest a
// bump and the tail rocks up as the rear wheels follow (instead of the whole
// car rising flat and level). Recomputed every frame on grounded terrain.
let terrainPitch = 0;
// Tunnel interior floor state: active when the car is riding inside the
// spiral tube in the underground world.
let tunnelFloorState = { active: false, slope: 0, tanX: 0, tanZ: 0 };
// Staircase climb state (underground): onStairs is true while the car rides
// the big stepped staircase, stairPrevY tracks the last step height so a
// riser climb can fire a small bump shake.
let onStairs = false;
let stairPrevY = 0;

// ===== Hilltop portal levitation =====
// 1.2 seconds after driving inside the big open-front hall, the car levitates
// upward through the roof, then teleports to the ramp world once it has
// floated well clear — long enough for the ground-level camera to watch it go.
const buildingLevitate = {
  active: false,
  timer: 0,          // counts up from 0 once car enters the rings
  levitating: false,  // true once the 1.2s delay is over and the car rises
  levitateTime: 0,    // time since levitation started
  x: PORTAL_HILL.x, z: PORTAL_HILL.z,
  w: PORTAL_HILL.topRadius * 2, d: PORTAL_HILL.topRadius * 2,
  h: PORTAL_HILL.height + 8,
};

function cityGroundHeightAt(x, z) {
  return groundHeight + portalHillHeightAt(x, z);
}

// ===== Mine shaft portal (entrance at -55,50, tunnel faces north) =====
// Driving deep into the mine tunnel triggers a dive animation: first the
// car's nose tips forward/down as if descending into the earth, then the
// rest of the car follows it under — about 2 seconds end to end — before
// it cuts to the underground world's spiral-tunnel arrival cinematic.
//
// v2 (descending adit): the dive is now a REAL drive down the excavated
// channel at the mine mouth. The car travels forward-and-down along the
// graded adit (z 34 → 54, dropping ~10.5 units) while a FIXED camera parked
// directly behind the car watches it drive away, sink below the bench
// crests, and vanish into the jewelled dark — then the fade-cut swaps to
// the underground.
const minePortal = {
  active: false,       // true when the car is inside the trigger zone
  timer: 0,            // counts up once active — teleport at diveTotal
  baseY: 0,            // car's ground height when the dive started
  diveTotal: 3.1,      // seconds of visible forward-and-down travel (2× speed)
  // Descending-adit path (world coords, matches MINE_ADIT_PROFILE):
  //   z0/z1 = channel run, y0/y1 = grade → buried depth.
  z0: 34, z1: 54,
  y0: 0, y1: -10.5,
  triggerX: -55,       // X centre of the tunnel
  triggerXHalf: 2.2,   // half-width of the trigger zone in X
  triggerZ: 34,        // Z threshold — END of the flat lead-in; the car
                       // drives the level runway manually, THEN the dive
                       // takes over and the descent begins.
  triggerZ1: 44,       // Z upper bound — the BACK WALL of the open pit (where
                       // the quarried banks end, matching CH_MAX in props.js).
                       // The zone is only the visible channel (34..44); past it
                       // the tunnel crown is sealed meadow, so a car on the
                       // grass behind/over the shaft never launches the dive.
                       // The back of the shaft (z 44..54) exists only inside the
                       // scripted dive and needs no trigger.
  camZ: 26,            // Z threshold for the fixed behind-the-car camera to
                       // park (start of the approach corridor)
  // Camera glide: when the car commits to the approach, the camera eases
  // from the chase position to the fixed tripod over `camBlend` seconds
  // (smoothstep) instead of snapping — no jarring jump.
  camBlend: 1.0,       // seconds to glide to the fixed position
  camBlendT: 0,        // blend progress
  camBlending: false,  // true while gliding
  camFromX: 0, camFromY: 0, camFromZ: 0,       // start position
  camFromLX: 0, camFromLY: 0, camFromLZ: 0,    // start look target
  // Fixed camera parked DIRECTLY BEHIND the car on the channel axis, gazing
  // down the adit so the car departs foreground and dwindles into the
  // gemlit depths. No lateral offset — the view is dead-centre on the mine.
  cam: {
    x: -55, y: 3.5, z: 18,
    lx: -55, ly: -2, lz: 45,
  },
};

// Mine-shaft centering (anti-stuck helper): while the car drives into the
// mine approach corridor it is gently pulled onto the tunnel axis (x=-55)
// so lining up with the narrow entrance is easy — no more scraping the dirt
// banks on the way in. CAPTURE = how far off-axis (in X) the corridor still
// grabs the car; PULL = convergence rate (1/s) toward the centre.
const MINE_CENTER_CAPTURE = 10;
const MINE_CENTER_PULL = 3.0;

// True when the car is in the mine approach corridor — heading roughly north
// toward the shaft, inside the capture band, and not in a cinematic. Shared
// by the mine-shaft centering and the mine wall-guide (which turns the nose
// toward the tunnel axis instead of bouncing away from it).
function isInMineApproach() {
  if (worldState !== 'city' || minePortal.active || jumpState.inAir ||
      buildingLevitate.levitating) return false;
  const p = minePortal;
  return Math.sin(car.rotation.y) > 0.3 &&
    car.position.z > p.camZ && car.position.z < p.triggerZ + 4 &&
    Math.abs(car.position.x - p.triggerX) < MINE_CENTER_CAPTURE;
}

// Depth of the descending adit bed at world-z — interpolates the SAME
// station profile the props carve (MINE_ADIT_PROFILE), so the car's path
// and the visible bed can never drift apart. Flat lead-in (z 30–34) then a
// gentle toe-off that gathers into a sustained plunge.
function mineAditDropAt(zz) {
  const prof = MINE_ADIT_PROFILE;
  if (zz <= prof[0][0]) return prof[0][1];
  if (zz >= prof[prof.length - 1][0]) return prof[prof.length - 1][1];
  for (let i = 1; i < prof.length; i++) {
    if (zz <= prof[i][0]) {
      const za = prof[i - 1][0], zb = prof[i][0];
      const ya = prof[i - 1][1], yb = prof[i][1];
      const tt = (zz - za) / (zb - za);
      return ya + (yb - ya) * tt;
    }
  }
  return prof[prof.length - 1][1];
}

// True once the car commits to the mine approach corridor (aligned on the
// channel axis, past the meadow).  Currently unused for the camera (the
// chase cam now always follows the car through the mine entrance), but
// kept as a utility in case other systems need to know.
function isMineCamActive() {
  if (worldState !== 'city') return false;
  const p = minePortal;
  return Math.abs(car.position.x - p.triggerX) < p.triggerXHalf + 1.5 && car.position.z > p.camZ;
}

// ===== Mine-ascent cinematic (underground → city) =====
// Reverse of the dive: the car appears at the buried throat of the mine
// shaft (z=54, y=-10.5) and drives UP the adit to the surface (z=34, y=0),
// then shoots out of the mine entrance and flies clear before control
// returns. No more dropping from the sky into the trigger zone.
const mineAscent = {
  active: false,
  timer: 0,
  driveTotal: 2.8,     // seconds driving up the adit (z 54 → 34)
  launchTotal: 1.88,   // seconds of ballistic flight out of the shaft (lands at y≈0.15)
  triggerX: -55,
  // Launch trajectory out of the mine entrance (z=34, y=0), heading south.
  launchVh: 15,        // horizontal speed (south, -z)
  launchVv: 17,        // vertical speed (up)
  gravity: 18,
};
// Seconds the car stays perfectly level after the mine-ascent landing — the
// body-lean code normally pitches the hood down a touch under acceleration,
// which looks wrong right after the car bursts out of the shaft. During the
// settle the car drives flat (like it does at game start) before normal lean
// physics resumes.
let mineAscentSettle = 0;

// ===== Mine-ascent explosion FX =====
// Just before the car shoots out of the mine shaft, a fireball erupts deep
// inside the mine; flames and smoke shoot up the adit and out of the
// entrance behind the car, then clear up leaving a little drifting smoke.
const MINE_BLAST_TRIGGER = 2.65;   // seconds into the ascent — a split second before the car jumps
const mineBlast = {
  active: false,
  timer: 0,
  fireball: null,        // glowing sphere deep in the shaft
  fireballLight: null,   // flash light
  flames: [],            // { mesh, base, phase, freq, amp, born, life }
  smoke: [],             // { sprite, x0, y0, z0, driftX, driftZ, rise, size, opacity, life, born, wob }
};

// Soft radial-gradient smoke texture for the blast plume (canvas-generated,
// same idea as the burning-building smoke in firetruck.js).
const mineSmokeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(120,120,135,0.55)');
  grad.addColorStop(0.55, 'rgba(105,105,120,0.28)');
  grad.addColorStop(1, 'rgba(90,90,105,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

// Shared flame cone geometries for the blast (reused across ascents; each
// flame mesh gets its own material so they can fade independently).
const blastFlameOuterGeo = new THREE.ConeGeometry(1.6, 4.2, 10);
const blastFlameCoreGeo = new THREE.ConeGeometry(0.8, 2.4, 8);
const blastFlameBigGeo = new THREE.ConeGeometry(2.4, 6.0, 12);
const blastFlameSmallGeo = new THREE.ConeGeometry(1.2, 4.0, 8);

// ===== Spiral-tunnel arrival cinematic =====
// After the mine-dive swap we no longer spawn the car over the cavern.
// Instead the camera CUTS to a single continuous arc around the lit spiral
// tunnel while the car is "still riding it down": it opens high over the back
// of the coil (where the underground fades in from black), then ONE smooth
// sweep carrying it down and around the tunnel axis to the watch point east
// of the exit, settling there exactly as the car bursts out of the foot.
// Control hands back the moment it exits onto the cavern floor.
const spiralCine = {
  active: false,
  timer: 0,
  hold: 1.15,      // seconds the camera stays planted on the opening shot (the
                   // underground fades in from black ~1.1s; this keeps the timer
                   // at 0 so the sweep we recognise as "the start" is on screen)
  orbitDur: 0,     // kept at 0 — the car path drives the whole duration
  driveDur: 5.0,   // the single top→exit camera arc spans driveDur + watchDur
  watchDur: 1.5,   // (tail of the arc's easing — the camera settles at the
                   //  exit as the car bursts out, no separate watch instruction)
  sStart: 0.08,    // path parameter (0 = top entrance, 1 = foot) where the car starts
};

// ===== Tunnel-ascent cinematic (underground → city) =====
// When the car gets near the tunnel foot in the underground, instead of just
// driving up into the tunnel with the chase cam, we play the reverse of the
// arrival's "car inside the tunnel" shot: the camera follows the car up the
// spiral tunnel from behind (headlights facing away from us), then cuts to
// the mine-ascent emergence where the car shoots out of the mine shaft.
const tunnelAscentCine = {
  active: false,
  timer: 0,
  s: 1,          // current path parameter (1 = foot → sStart = near the top)
  driveDur: 3.5, // seconds driving up the tunnel from foot to near the top
  sStart: 0.08,  // path parameter where the car ends (near the top)
};

// ===== Holy-chamber cinematic (drop through the summit skylight) =====
// The chamber is too small to drive around, so rolling into the open summit
// skylight plays a staged sequence (fall → pan → lift → flight): the car
// drops in beside the man and his goats, the camera pans around the shrine,
// then the mountain's light surges and the car is mysteriously lifted back
// OUT through the skylight, arcing over the cone to land on the open floor
// outside the base. Control hands back the moment it lands. There is no
// other exit — the cave mouth is walled shut, so this is the only way in
// AND the only way out.
const chamberCine = {
  active: false,
  phase: 'fall',      // 'fall' → 'pan' → 'lift' → 'flight'
  timer: 0,
  fallDur: 1.7,       // drop through the shaft onto the chamber floor
  panDur: 5.0,        // orbit the holy man and his goats
  liftDur: 2.4,       // light surges; the car floats up through the skylight
  flightDur: 2.1,     // ballistic arc out of the summit, over the cone
  // Ejection: launch at the summit (y = peakY + 1) under the global gravity;
  // fade down onto the open floor just east-south of the cone's base.
  landX: -66, landZ: -6,
  vx: 16.2, vy: 6.0, vz: -6.68,
};
// Arc geometry for the arrival shot: the camera opens at the BACK of the
// spiral — north-west, the far side of the coil as seen from the rainbow
// course — high above the top coil, LOOKING at the rainbow ceiling tiles
// across the spiral. From there a single smooth formula sweeps it around the
// tunnel axis (opposite to the tube's own winding), easing it down while
// turning its gaze onto the exit, ending exactly at the watch point east of
// the mouth as the car bursts out. No waypoints, no segments — one arc.
const SPIRAL_PIVOT_R = 38;               // the big pivot radius (tube outer rim is at ~26)
const SPIRAL_PIVOT_ANG = Math.PI * 0.75; // 135° = north-west = the BACK of the coil
const SPIRAL_START_Y = 26;               // establishing height: low enough that the tunnel mouth
                                         // fills the frame and the mouth cloud bank stays out of view
// The camera ALWAYS faces the tunnel while it spirals: it aims straight at the
// axis, so its gaze rides the arc around the coil (back → side → front) instead
// of staring one way and having to swing around at the end. The opening glance
// sits high over the top coil on the axis; it descends to the exit framing
// height as the camera comes down.
const SPIRAL_LOOK = { x: TUNNEL.cx, y: 20, z: TUNNEL.cz };   // opening axis glance (top of the coil)
const SPIRAL_FOOT_Y = 1.5;              // exit glance height — just above the tunnel floor
function smooth01(s) { return s * s * (3 - 2 * s); }

// Watch tripod for the arrival shot: fixed EAST of the tunnel exit (in front
// of the opening), looking west at the exit so the car comes out toward the
// camera. The orbit sweeps counterclockwise (opposite to the tunnel's spin)
// and ENDS exactly here — the camera settles at this spot to watch the car
// burst out, then eases smoothly to behind the car.
function spiralWatchPose() {
  const p = tunnelPoint(1);
  const q = tunnelPoint(0.994);
  let ex = p.x - q.x, ez = p.z - q.z;
  const elen = Math.hypot(ex, ez) || 1;
  ex /= elen; ez /= elen;
  // Park the camera ahead of the mouth ON the car's exit line (same tangent
  // finishSpiralCine launches the car along): the exit tangent drifts north
  // as it leaves the coil, so a due-east camera sits off to the side and the
  // burst-out reads off-centre. Following the tangent keeps the car centred.
  const watchX = p.x + ex * 30;   // ahead of the exit along the car's heading
  const watchY = 8;               // camera height — above the car's exit path
  const watchZ = p.z + ez * 30;
  const watchAngle = Math.atan2(watchZ - TUNNEL.cz, watchX - TUNNEL.cx);
  const watchRadius = Math.hypot(watchX - TUNNEL.cx, watchZ - TUNNEL.cz);
  return { watchX, watchY, watchZ, watchAngle, watchRadius };
}
// Pose of a car driving the spiral at path parameter s: position in the
// underground scene's local space (tunnelPoint heights are pre-offset by
// UNDERGROUND_Y), heading from the path tangent, pitched nose-down while
// descending and levelling out as it nears the foot.
function spiralPoseAt(s) {
  const p = tunnelPoint(s);
  const q = tunnelPoint(Math.min(1, s + 0.008));
  const dx = q.x - p.x, dz = q.z - p.z;
  const flat = Math.hypot(dx, dz) || 1e-6;
  return {
    x: p.x,
    y: Math.max(0, p.y - UNDERGROUND_Y),
    z: p.z,
    heading: Math.atan2(dz / flat, -dx / flat),
    pitch: -Math.atan2(q.y - p.y, flat),
  };
}
// Pose of a car driving UP the spiral tunnel at path parameter s — the
// reverse of the arrival descent. Position in the underground scene's local
// space, heading back up the tunnel (away from the foot), nose-up while
// climbing. The car's headlights point up the tunnel, so a camera behind it
// sees the tail.
function spiralPoseAtUp(s) {
  const a = tunnelPoint(Math.max(0, s - 0.008));
  const b = tunnelPoint(Math.min(1, s + 0.008));
  const p = tunnelPoint(s);
  const tx = b.x - a.x, tz = b.z - a.z;
  const flat = Math.hypot(tx, tz) || 1e-6;
  return {
    x: p.x,
    y: Math.max(0, p.y - UNDERGROUND_Y),
    z: p.z,
    heading: Math.atan2(-tz, tx),
    pitch: Math.atan2(b.y - a.y, flat),
  };
}

function flattenCarFromRock() {
  if (playerRobot) return;   // a giant mech can't be squashed into a pancake
  if (playerCarKind === 'skateboarder') return;   // the skater is a person, not a car — never a pancake
  if (flatCarState.phase === 'bounce') return;
  flatCarState.active = true;
  flatCarState.phase = 'flat';
  flatCarState.timer = 0;
}

function updateFlatCarState(delta) {
  // The boulder (ramp world), the steamroller (city) and the underground's
  // steam press all flatten the car; once flat, driving for a while pops it
  // back up in every world.
  const isDriving = (worldState === 'ramp' || worldState === 'city' || worldState === 'underground') && flatCarState.active && flatCarState.phase === 'flat' && Math.abs(velocity.value) > 0.8;
  flatCarState = stepFlatCarState(flatCarState, delta, isDriving);
  const scaleY = flatCarState.active ? getFlatCarScaleY(flatCarState) : 1;
  // The underground's taffy pullers also distort the car: it stretches LONG
  // (sx > 1) and THIN (sz < 1) while hooked, then springs back with a
  // (brief) overshoot on release. Composes with the flatten so a flattened
  // noodle still lies low. Stepped in every world so a stretch started
  // underground finishes gracefully even if the player portals out mid-way.
  if (taffyState.active) {
    taffyState = stepTaffyState(taffyState, delta);
    const s = getTaffyScale(taffyState);
    car.scale.set(s.sx, scaleY, s.sz);
  } else {
    car.scale.set(1, scaleY, 1);
  }
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

await __loaderYield(0.31, 'the ramp world hills');
const rampWorld = buildRampWorld(rampScene);
const terrainHeightAt = rampWorld.terrainHeightAt;

// A GIANT tarantula sleeps in the velodrome bowl of the ramp world — it stays
// still with dimmed eyes until you bump it, then wakes up with blazing red
// eyes and scrambles around for a while before dozing off again.
const rampTarantula = addRampTarantula(rampScene, terrainHeightAt, { x: -48, z: 5 });

// Ramp-world fun: launch ramps scattered over the hills + the swirling vortex
// you can drive around. These exist ONLY in the ramp world — the city keeps
// its own separate ramp set (buildMap) and has no vortex.
await __loaderYield(0.35, 'the launch ramps');
const { ramps: rampWorldRamps } = buildRampWorldRamps(rampScene, terrainHeightAt);
const vortex = createVortex(rampScene, 40, 40, terrainHeightAt);
// Drive under the vortex (within this horizontal radius of its centre) to
// warp back to the city — the ramp world's way home.
const vortexReturnRadius = 10;
// Soft drifting clouds + the spinning wheel of death — ramp world only.
await __loaderYield(0.38, 'the vortex');
const clouds = createClouds(rampScene);
const wheelOfDeath = createWheelOfDeath(rampScene, wheelOfDeathDef.x, wheelOfDeathDef.z, terrainHeightAt);

// Ramp-world knockable props: bowling pins, a linked domino run, barrels you
// shove aside and a timber yard of wobbling logs — all via the shared
// knockable system (physics.js).
await __loaderYield(0.41, 'the bowling pins and dominoes');
const rampWorldProps = buildRampWorldProps(rampScene, terrainHeightAt);
rampWorldFeatures.props = rampWorldProps;

// ===== Tier 3 — the moving stuff =====
// Giant swinging hammers on the flattened straightaway, a trebuchet you drive
// into, and a rolling boulder that chases you. All animated + tested against
// the car in updateRampWorldDanger() (ramp world only).
await __loaderYield(0.44, 'the swinging hammers and trebuchet');
const hammers = buildHammers(rampScene, terrainHeightAt);
const trebuchet = createTrebuchet(rampScene, rampWorldFeatures.trebuchet.x, rampWorldFeatures.trebuchet.z, terrainHeightAt);
const boulder = createRollingBoulder(rampScene, rampWorldFeatures.boulder.x, rampWorldFeatures.boulder.z, terrainHeightAt);
// The wheel of death gains a rim knock (see updateRampWorldDanger).
wheelOfDeath.cooldown = 0;

// ===== Underground world (the mine shaft portal destination) =====
// A third scene for the cavern beneath the map.  The mine shaft at (-55,50)
// is the portal entry — driving deep into the tunnel triggers a short dive,
// then the camera cuts to the lit spiral tunnel for an arrival cinematic
// that ends with the car bursting out of the tunnel foot.  Driving into the
// tunnel foot again returns to the city.
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

// ===== Tiny WebAudio synth (task #34) — synthesized, no asset files =====
// Lazily created/resumed on first use; every play is wrapped so a blocked
// or unsupported AudioContext can never break gameplay.
let ugAudio = null;
function ugAudioCtx() {
  try {
    if (!ugAudio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ugAudio = new AC();
    }
    if (ugAudio.state === 'suspended') ugAudio.resume().catch(() => {});
    return ugAudio;
  } catch (e) { return null; }
}
// Trampoline boing: a springy upward chirp with a quick wobble.
function playBoing() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(720, t + 0.16);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.34);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.42);
}
// Car horn (H): a short two-tone blast; also wakes the shrine (idea #24).
function playHorn() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const f of [330, 392]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.02);
    g.gain.setValueAtTime(0.08, t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.42);
  }
}
// Crystal-cluster pop (idea #25): a bright glassy shatter chime.
function playCrystalPop() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [f, d] of [[1180, 0], [1620, 0.03], [2380, 0.06]]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t + d);
    o.frequency.exponentialRampToValueAtTime(f * 1.25, t + d + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.09, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + d + 0.26);
    o.connect(g).connect(ctx.destination);
    o.start(t + d); o.stop(t + d + 0.3);
  }
}
// Statue topple (idea #31): a stony crash — a low thud plus a gravel tumble.
function playStatueCrash() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.62);
  const len = Math.floor(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.16, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  src.connect(ng).connect(ctx.destination);
  src.start(t); src.stop(t + 0.36);
}
// Picker grab clank (2026-09-22): a bright metallic BANG as the robot's giant
// steel jaws snap shut — a short ringing metal hit when it clamps on a car.
function playClank() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 1900;
  hp.Q.value = 1.4;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  src.connect(hp).connect(ng).connect(ctx.destination);
  src.start(t); src.stop(t + 0.32);
  for (const f of [1300, 1850]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.12, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og).connect(ctx.destination);
    o.start(t); o.stop(t + 0.24);
  }
}
// Bubble wrap THWACK (2026-09-23): a farty elastic POCK when the car rolls a
// bubble flat — a quick upward chirp that snaps down, plus a tiny noise tick.
function playBubblePop() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.11);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.15);
}
// Taffy snap (2026-09-23): a stretchy rubber POING as the rubber arm hooks the
// car and the car gets pulled long + thin.
function playTaffySnap() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.14);
  o.frequency.exponentialRampToValueAtTime(620, t + 0.28);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.42);
}
// Express tube suction FWOOSH (2026-09-23): a deep windy intake whoosh as the
// car is sucked up the glass tube.
function playFwoosh() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.6);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const e = 1 - i / len;
    d[i] = (Math.random() * 2 - 1) * e;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(250, t + 0.55);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.28, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.58);
  src.connect(f).connect(ng).connect(ctx.destination);
  src.start(t); src.stop(t + 0.6);
}
// Express-tube electrical hum (2026-09-24): a low buzzing drone that runs for
// the whole forced ride — a detuned saw + square through a lowpass reads as
// high-voltage power lines. Fades in on grab and ramps out when the car is
// spat out (also stopped on any ride-cancelling reset).
let tubeHum = null;   // { o1, o2, gain } while buzzing
function startTubeHum() {
  const ctx = ugAudioCtx();
  if (!ctx || tubeHum) return;
  const t = ctx.currentTime;
  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = 56;
  const o2 = ctx.createOscillator();
  o2.type = 'square';
  o2.frequency.value = 84;        // beats against the 56 to add grit
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 340;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(TUBE_HUM_BASE, t + 0.35);   // soft fade-in
  o1.connect(f); o2.connect(f); f.connect(gain).connect(ctx.destination);
  o1.start(t); o2.start(t);
  tubeHum = { o1, o2, gain };
}
function stopTubeHum() {
  const hum = tubeHum;
  tubeHum = null;
  if (!hum) return;
  const ctx = ugAudioCtx();
  const t = (ctx && ctx.currentTime) || hum.gain.context.currentTime;
  hum.gain.gain.cancelScheduledValues(t);
  hum.gain.gain.setValueAtTime(Math.max(0.0001, hum.gain.gain.value), t);
  hum.gain.gain.linearRampToValueAtTime(0.0001, t + 0.3);   // quick fade-out
  hum.o1.stop(t + 0.32); hum.o2.stop(t + 0.32);
}
// Distance fade: the buzz's volume tracks how far the current camera sits from
// the car — loud while the chase cam rides the hood, then quieter up as the
// fixed montage tripods stand further off the tube line (and loud again each
// time a shot cuts in close). Called every frame after the camera moves.
const TUBE_HUM_BASE = 0.082;   // full volume at the reference distance below
const TUBE_HUM_REF = 35;       // camera→car distance (world units) that plays full
function updateTubeHum() {
  if (!tubeHum) return;
  const d = camera.position.distanceTo(car.position);
  const vol = TUBE_HUM_BASE * THREE.MathUtils.clamp(TUBE_HUM_REF / Math.max(1, d), 0.15, 1.15);
  tubeHum.gain.gain.setTargetAtTime(vol, tubeHum.gain.context.currentTime, 0.12);
}
// Ground-floor finish gate (2026-09-18): a bright three-note "ta-da"
// arpeggio bursts when the car crosses the FINISH banner.
function playFinishFanfare() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [f, d] of [[523.25, 0], [659.25, 0.09], [783.99, 0.18], [1046.5, 0.27]]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.14, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0005, t + d + 0.34);
    o.connect(g).connect(ctx.destination);
    o.start(t + d); o.stop(t + d + 0.36);
  }
}
// Mine-blast boom: a deep rumble + noise splash, bigger than the pole hit.
function playMineBlast() {
  const ctx = ugAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 1.2);
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  src.connect(ng).connect(ctx.destination);
  src.start(t);
}

await __loaderYield(0.46, 'the spiral tunnel');
// Shared builder options for the underground world — reused verbatim whenever
// the level is rebuilt from scratch (leaving via the tunnel resets it, so a
// re-entry presents a fully pristine cavern: tiles, glowing spheres, statues
// and everything else all start fresh).
const ugBuildOpts = {
  // Real loader progress: the underground is one enormous build, so it reports
  // its own internal phases. Map its local 0..1 progress onto the loader's
  // remaining band (0.48 → 0.97) and let the loader paint between sections.
  onUndergroundPhase: (frac, label) =>
    window.__loadingProgress ? window.__loadingProgress(0.48 + 0.49 * frac, label) : null,
  // Candy waterfall: gem hits slam the car back down the grand ramp.
  // weight = 1 for full-weight big gems (power 42 ≈ 7 units @60fps),
  // 25/42 for light big gems (power 25 ≈ 4 units), or 1/21 for regular
  // candy gems (power 2 ≈ 0.3 units) — a tiny nudge.
  onGemSlam: (dirX, dirZ, weight) => knockPlayerAway(dirX, dirZ, 42 * weight, 2.0 * weight, 1.5 * weight),
  // Trampoline launch pads: punt the car straight up hard enough to reach the
  // second roof (vy 35 → apex ≈ 34, above the 31.3 tile-top) so it lands on
  // the colorful tiles. Boing + a healthy shake sell the bounce.
  onTrampoline: () => {
    playBoing();
    jumpState.inAir = true;
    jumpState.yVelocity = 35;
    shake.intensity = Math.max(shake.intensity, 0.4);
  },
  // Glass City crystal cluster popped by the car (idea #25).
  onGlassPop: () => playCrystalPop(),
  // Statue tagged by a fast car on the second roof (idea #31).
  onStatueTopple: () => {
    playStatueCrash();
    shake.intensity = Math.max(shake.intensity, 0.28);
  },
  // Ground-floor finish gate: crossing the FINISH banner completes a run —
  // a bright ta-da arpeggio plus a little celebratory shake.
  onFinishLine: () => {
    playFinishFanfare();
    shake.intensity = Math.max(shake.intensity, 0.2);
  },
  // Conveyor picker: the robot's giant jaws just clamped onto the car — a
  // real metal clank and a hard shove off the belt (dirX/dirZ come from the
  // claw pointing along the belt with a northward flick).
  onPickerGrab: (dirX, dirZ) => {
    playClank();
    shake.intensity = Math.max(shake.intensity, 0.5);
    knockPlayerAway(dirX, dirZ, 26, 1.6, 1.2);
  },
  // Bubble wrap strip: a bubble gets popped underneath the car — THWACK, a
  // tiny haptic rumble and (via the physics hook) a momentary steering wobble.
  onBubblePop: () => {
    playBubblePop();
    shake.intensity = Math.max(shake.intensity, 0.18);
    bubbleWobble = Math.min(1.2, bubbleWobble + 0.5);
  },
};
// The underground lives inside its own root group so the whole level can be
// disposed and hot-swapped when it's rebuilt.
let ugRoot = new THREE.Group();
undergroundScene.add(ugRoot);
let undergroundWorld = await addUnderground(ugRoot, ugBuildOpts);
let ugColliders = undergroundWorld.colliders;
let ugRamps = undergroundWorld.ramps || [];
// Blue-wave halfpipe footprint constants (cx/cz/len + wall-run width) so the
// airborne branch can air-lock rim pops back inside the pipe.
let ugPipe = undergroundWorld.halfpipe || null;
let ugSunkHoleAt = undergroundWorld.sunkHoleAt || (() => false);   // pit-opening test (fall-in, never float)
// Holy Mountain summit helpers for the little car: the skylight in the crown
// is a hole it would fall into (the open square between the four rim planks),
// the same class of hazard as a crumbled ceiling tile but higher up. These
// mirror the mountain module's MOUNT numbers so the little follower steers
// around the gap instead of dropping into the chamber.
let UG_MOUNT = (undergroundWorld.holy && undergroundWorld.holy.MOUNT) ? undergroundWorld.holy.MOUNT : null;
let UG_SKY_HALF = UG_MOUNT ? UG_MOUNT.skylightR + 0.6 : 0;
let UG_SKY_SUMMIT_Y = UG_MOUNT ? UG_MOUNT.peakY - 2.5 : Infinity;
function ugSkylightHoleAt(x, z) {
  return UG_MOUNT && Math.abs(x - UG_MOUNT.cx) < UG_SKY_HALF && Math.abs(z - UG_MOUNT.cz) < UG_SKY_HALF;
}
// Underground reset (leaving via the tunnel → pristine re-entry):
// startTunnelAscentCine() kicks off a background rebuild of the whole world;
// once it's finished the finished build waits in ugPendingRoot and
// maybeSwapUnderground() hot-swaps it in the first frame the underground is
// OFF camera (worldState is 'city'), so the swap is never visible and
// re-entering the mine portal shows a completely fresh cavern — ceiling tiles
// back at their dark shades, guide dots green again, statues standing, glowing
// surfaces lit, every counter at zero.
let ugPendingRoot = null;
let ugPendingWorld = null;
let ugRebuildBusy = false;
async function resetUndergroundBuild() {
  if (ugRebuildBusy || ugPendingRoot) return;   // one rebuild at a time
  ugRebuildBusy = true;
  try {
    const fresh = new THREE.Group();
    const freshWorld = await addUnderground(fresh, ugBuildOpts);
    ugPendingRoot = fresh;
    ugPendingWorld = freshWorld;
  } catch (e) {
    console.warn('underground rebuild failed:', e);
  } finally {
    ugRebuildBusy = false;
  }
}
function maybeSwapUnderground() {
  if (!ugPendingRoot) return;
  if (worldState === 'underground') return;   // never swap while on camera
  const oldRoot = ugRoot;
  const oldWorld = undergroundWorld;
  ugRoot = ugPendingRoot;
  ugPendingRoot = null;
  undergroundScene.add(ugRoot);
  undergroundWorld = ugPendingWorld;
  ugPendingWorld = null;
  ugColliders = undergroundWorld.colliders;
  ugRamps = undergroundWorld.ramps || [];
ugPipe = undergroundWorld.halfpipe || null;
  ugSunkHoleAt = undergroundWorld.sunkHoleAt || (() => false);
  UG_MOUNT = (undergroundWorld.holy && undergroundWorld.holy.MOUNT) ? undergroundWorld.holy.MOUNT : null;
  UG_SKY_HALF = UG_MOUNT ? UG_MOUNT.skylightR + 0.6 : 0;
  UG_SKY_SUMMIT_Y = UG_MOUNT ? UG_MOUNT.peakY - 2.5 : Infinity;
  undergroundScene.remove(oldRoot);
  if (oldWorld && oldWorld.dispose) oldWorld.dispose(oldRoot);
}
// Task #35: how long the car has been ghosting inside an extended pyramid
// tier at floor level (reset whenever it isn't), plus a counter of cars
// recovered after being knocked clean OFF the cavern slab (there's no wall
// at the slab edge — a big pipe/sweeter/pole hit can hurl the car past it
// onto invisible floor).
let stairGhostTimer = 0;
let ugRecoveries = 0;

await __loaderYield(0.95, 'the little car follower');

// ===== Little car follower (underground) =====
// A small car that follows the player into the underground: ~30s after the
// player arrives it rides the spiral tunnel down and bursts out of the foot
// the same way the player did, then follows the player around the course.
// No camera involvement — you only see it if you happen to be near the
// tunnel exit when it comes out.
const LITTLE_CAR_DELAY = 30;        // seconds after entering underground before it appears
const LITTLE_CAR_TUNNEL_DUR = 5.0;  // seconds riding the spiral (matches the player's arrival)
const LITTLE_CAR_FOLLOW_SPEED = 9;  // cruise speed while following the player
const LITTLE_CAR_STOP_DIST = 9;     // stop following this close to the player
const LITTLE_CAR_RADIUS = 1.2;      // collision radius (scaled-down car)
const LITTLE_CAR_HALF_LEN = 2.15 * 0.55;   // for knock spin (createCar body × scale 0.55)
const LITTLE_CAR_HALF_WID = 0.9 * 0.55;
const LITTLE_CAR_GRAV = 30;         // fall acceleration dropped through a crumbled roof tile (hole)
const LITTLE_CAR_FALL_MAX = 18;     // terminal fall speed under that gravity
const littleCar = {
  mesh: null,
  phase: 'idle',   // 'idle' | 'waiting' | 'tunnel' | 'following'
  timer: 0,
  s: 0,
  falling: false,  // dropping through a roof hole (crumbled checkerboard tile)
  fallVy: 0,
  stuckT: 0,       // accumulating timer while stranded far from the player
  knock: null,     // traffic-style shove state while the player car hits it
};
// Player-path trail the little car follows (underground only). The player's
// position is recorded every few frames; the little car drives along the
// trail, which lets it follow you up the ramps and around obstacles exactly
// as you drove, instead of trying to navigate on its own (which gets stuck
// against long walls like the grand ramp's side skirts).
const littleCarTrail = [];
let littleCarTrailTimer = 0;
const LITTLE_CAR_TRAIL_STEP = 0.2;      // seconds between recorded points
const LITTLE_CAR_TRAIL_MAX = 4000;      // ring-buffer cap (~13 min of driving)
const LITTLE_CAR_TRAIL_CATCH = 1.5;     // how close before popping a point

function spawnLittleCar() {
  if (littleCar.mesh) return;
  littleCar.mesh = createLittleCar(0x1e7ea6);   // same blue as the city's little blue car
  littleCar.mesh.visible = false;
  undergroundScene.add(littleCar.mesh);
}

// Remove the little car entirely (used when the player leaves the
// underground — it stays behind in the cavern).
function resetLittleCar() {
  if (littleCar.mesh) {
    undergroundScene.remove(littleCar.mesh);
    littleCar.mesh = null;
  }
  littleCar.phase = 'idle';
  littleCar.timer = 0;
  littleCar.s = 0;
  littleCar.falling = false;
  littleCar.fallVy = 0;
  littleCar.knock = null;
  littleCarTrail.length = 0;
  littleCarTrailTimer = 0;
  littleCarWasOnRamp = false;
}

// Called when the player enters the underground: arm the 30s countdown.
function startLittleCar() {
  spawnLittleCar();
  littleCar.phase = 'waiting';
  littleCar.timer = 0;
  littleCar.falling = false;
  littleCar.fallVy = 0;
  littleCar.knock = null;
  littleCarTrail.length = 0;
  littleCarTrailTimer = 0;
  littleCarWasOnRamp = false;
}

// Record the player's path for the little car to follow. Runs every frame
// while the player is in the underground; the trail is cleared when the
// player leaves.
function recordLittleCarTrail(delta) {
  if (worldState !== 'underground') {
    littleCarTrail.length = 0;
    return;
  }
  littleCarTrailTimer -= delta;
  if (littleCarTrailTimer <= 0) {
    littleCarTrailTimer = LITTLE_CAR_TRAIL_STEP;
    littleCarTrail.push({ x: car.position.x, z: car.position.z });
    if (littleCarTrail.length > LITTLE_CAR_TRAIL_MAX) littleCarTrail.shift();
  }
}

// Terrain height the little car should ride at (x, z), given its current
// height. Mirrors the player's underground ground handling: course ramps
// (the grand ramp / candy waterfall, the staircase's sibling ramps) first,
// then soft surfaces (staircase steps, the checkerboard ceiling), then the
// cavern floor. The same proximity gates keep it from
// snapping up to a surface it isn't near (e.g. the ceiling from the floor
// below) or being yanked down off the ceiling by a ramp sitting underneath
// it. On the ceiling, a crumbled tile is a hole — hold the current height
// instead of dropping through; the steering logic nudges it sideways off
// the gap.
let littleCarWasOnRamp = false;   // was the little car riding a ramp last frame?
// Solid-collider check for the little car, gated by HEIGHT: a collider only
// blocks the little car when it actually reaches the height the little car is
// driving at. The underground stacks three driving surfaces (floor, stair
// steps, the checkerboard ceiling) so a 2D-only check makes floor props (the
// padded pole, conduit posts, ramp skirts) act as invisible walls high up on
// the colorful tiles — exactly the "stuck" the little car was hitting.
function littleCarBlockedAt(x, z, y) {
  for (const c of ugColliders) {
    if (c.soft) continue;   // stairs / ceiling never block driving
    // Ai-only (the mine pit) blocks AI traffic but not the player car; the
    // little car is AI traffic, so it stays blocked. Missing h (or h at the
    // feet of a prop) blocks like before.
    if (c.h !== undefined && c.h < y - 2.4) continue;
    if (rectCircleIntersect(x, z, c, LITTLE_CAR_RADIUS)) return true;
  }
  return false;
}

function littleCarGroundY(x, z, currentY) {
  const r = ugRampRideAt(x, z, currentY);
  if (r !== null) return r.baseY + r.height * r.s;
  const eTop = ugElevatorTopAt(x, z, currentY);
  if (eTop > 0.05 && Math.abs(currentY - eTop) < 1.4) return eTop;
  // Just drove off the top of a ramp that reaches the ceiling (the grand
  // ramp / candy waterfall): snap up onto the ceiling instead of dropping
  // through the ramp-top seam. The little car's y can lag the ramp surface
  // near the top (fast trail points / a big frame delta), leaving it just
  // below the 1.4 snap gate — without this it would fall to the floor. Only
  // snaps onto a SOLID tile: a crumbled tile is a hole, and the falling logic
  // in updateLittleCar drops the car straight through it (never hold it on
  // air).
  if (littleCarWasOnRamp && currentY > CEIL_Y - 1.0 && eTop > 0.05) return eTop;
  // Pit awareness: over a carved-out feature hole with nothing to ride, never
  // snap to the y=0 floor (that's the invisible-glass hover). Past the rim
  // (currentY <= 0) fall through to the feature's sunken surface below
  // instead, so a drop-in keeps descending until it lands in the bowl.
  if (ugSunkHoleAt(x, z) && currentY <= 0) {
    const s = ugRampSurfaceY(x, z);
    if (s > -Infinity) return s;
  }
  return 0;
}

// Park the little car back beside the player on clear level ground and resume
// following. Used after a long gameplay gap strands it (the holy-mountain
// ejection leaves it grinding against the mountain while the player rolls
// away). The goat herd follows the LITTLE CAR, so pulling it back to the
// player is what brings the goats home too.
function relaunchLittleCarNear(px, pz) {
  if (!littleCar.mesh) return;
  const lc = littleCar;
  lc.phase = 'following';
  lc.timer = 0;
  lc.falling = false;
  lc.fallVy = 0;
  lc.stuckT = 0;
  littleCarTrail.length = 0;
  littleCarTrailTimer = 0;
  littleCarWasOnRamp = false;
  // Fan out a handful of candidate spots around the player and take the first
  // clear level one (not under the machine bridge, not blocked, on the slab).
  const spots = [[8, 0], [-8, 0], [0, -8], [0, 8], [14, 4], [-12, -6], [18, 0], [6, -12]];
  let sx = px + 8, sz = pz;
  for (const [ox, oz] of spots) {
    const x = px + ox, z = pz + oz;
    if (ugMachineTopAt(x, z) > 0) continue;
    if (Math.abs(x) > 145 || z < -97 || z > 178) continue;
    if (littleCarBlockedAt(x, z, 0)) continue;
    sx = x; sz = z;
    break;
  }
  lc.mesh.position.set(sx, littleCarGroundY(sx, sz, 0), sz);
  lc.mesh.rotation.y = Math.atan2(car.position.z - sz, -(car.position.x - sx));
  lc.mesh.visible = true;
}

// Advance the little car's state machine. Runs every frame while the player
// is in the underground.
function updateLittleCar(delta) {
  const lc = littleCar;
  if (!lc.mesh) return;

  // Knocked by the player car (traffic-style): slide + spin out of the way,
  // overriding its normal AI until the knock settles, then it resumes
  // following. Same one-discrete-knock rule as the city traffic cars.
  if (lc.knock) {
    const k = lc.knock;
    lc.mesh.position.x += k.vx * delta;
    lc.mesh.position.z += k.vz * delta;
    lc.mesh.rotation.y += k.w * delta;
    const slide = (Math.abs(k.vx) + Math.abs(k.vz)) * delta;
    for (const w of lc.mesh.userData.wheels) w.rotation.y += slide * 2.6;
    k.vx *= KNOCK_DECAY;
    k.vz *= KNOCK_DECAY;
    k.w *= KNOCK_DECAY;
    k.t -= delta;
    if (k.t <= 0) lc.knock = null;
    return;
  }

  if (lc.phase === 'waiting') {
    // Count down the 30s, then start riding the spiral tunnel down.
    lc.timer += delta;
    if (lc.timer >= LITTLE_CAR_DELAY) {
      lc.phase = 'tunnel';
      lc.timer = 0;
      lc.s = spiralCine.sStart;
      lc.mesh.visible = true;
    }
  } else if (lc.phase === 'tunnel') {
    // Ride the spiral from near the top to the foot — the same path the
    // player's arrival cinematic uses. The opaque tube hides it while it's
    // deep inside; it becomes visible as it rounds the corner toward the
    // exit, then bursts out of the foot.
    lc.timer += delta;
    const u = Math.min(lc.timer / LITTLE_CAR_TUNNEL_DUR, 1);
    lc.s = spiralCine.sStart + (1 - spiralCine.sStart) * u;
    const pose = spiralPoseAt(lc.s);
    lc.mesh.position.set(pose.x, pose.y, pose.z);
    lc.mesh.rotation.set(0, pose.heading, pose.pitch);
    const spin = 13 * delta * 2.6;
    for (const w of lc.mesh.userData.wheels) w.rotation.y += spin;
    if (u >= 1) {
      // Burst out of the tunnel foot along its exit tangent, exactly like
      // finishSpiralCine does for the player.
      const p = tunnelPoint(1);
      const q = tunnelPoint(0.994);
      let ex = p.x - q.x, ez = p.z - q.z;
      const elen = Math.hypot(ex, ez) || 1;
      ex /= elen; ez /= elen;
      lc.mesh.position.set(p.x + ex * 2.5, 0, p.z + ez * 2.5);
      lc.mesh.rotation.set(0, Math.atan2(ez, -ex), 0);
      // Trim the player-path trail to start from the point nearest the
      // little car, so it follows the path FORWARD from where it is (not
      // from the very beginning of the recording, which is the top of the
      // spiral — chasing that would run it into the tunnel tube).
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < littleCarTrail.length; i++) {
        const tp = littleCarTrail[i];
        const d = Math.hypot(tp.x - lc.mesh.position.x, tp.z - lc.mesh.position.z);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (littleCarTrail.length > 0) littleCarTrail.splice(0, bestI);
      lc.phase = 'following';
      lc.timer = 0;
    }
  } else if (lc.phase === 'following') {
    // Follow the player's recorded trail so the little car drives the same
    // path you did — up the ramps, around obstacles, onto the ceiling.
    // Drop trail points the little car has already reached, then drive
    // toward the next one. If the trail is empty (e.g. right after a
    // teleport), fall back to driving straight at the player. On the
    // checkerboard ceiling, a crumbled tile is a hole — steer around it
    // too, so the little car doesn't fall through a gap the player opened.
    const onCeiling = lc.mesh.position.y > CEIL_Y + 0.5;
    const atSummit = lc.mesh.position.y > UG_SKY_SUMMIT_Y;
    // A crumbled tile under the little car on (or just off the top of) the
    // roof is a hole it now falls through — exactly like the player. Drop
    // with gravity to the floor (or onto a ramp slope / soft surface below)
    // instead of riding on air; while falling it stops steering and just
    // drops straight down the gap.
    // A carved-out park feature hole (the halfpipe, vert pit, foam bowl...) is
    // the same kind of hole as a crumbled ceiling tile: once the little car is
    // over it at rim height with nothing to ride, it should DROP into it, not
    // snap to the y=0 floor above it like invisible glass. Mirrors the
    // player's sunk-fall drop in the underground physics.
    const pitDrop = ugSunkHoleAt(lc.mesh.position.x, lc.mesh.position.z) &&
      lc.mesh.position.y <= 0.05 &&
      ugRampRideAt(lc.mesh.position.x, lc.mesh.position.z, lc.mesh.position.y) === null &&
      ugElevatorTopAt(lc.mesh.position.x, lc.mesh.position.z, lc.mesh.position.y) <= 0.05;
    if (lc.falling || pitDrop || (ugTileGoneAt(lc.mesh.position.x, lc.mesh.position.z) && lc.mesh.position.y > CEIL_Y - 1.5)) {
      if (!lc.falling) {
        lc.falling = true;
        lc.fallVy = 0;
        littleCarWasOnRamp = false;
      }
      lc.fallVy = Math.max(lc.fallVy - LITTLE_CAR_GRAV * delta, -LITTLE_CAR_FALL_MAX);
      lc.mesh.position.y += lc.fallVy * delta;
      // Landing: snap onto the highest surface at/below the car (a ramp
      // slope, a stair step/elevator pad) or the cavern floor itself.
      const landY = littleCarGroundY(lc.mesh.position.x, lc.mesh.position.z, lc.mesh.position.y);
      if (lc.mesh.position.y <= landY + 0.001) {
        lc.mesh.position.y = landY;
        lc.falling = false;
        lc.fallVy = 0;
      }
      return;
    }
    while (littleCarTrail.length > 0) {
      const p = littleCarTrail[0];
      // Skip trail points that sit over a crumbled ceiling tile (a hole) —
      // the little car can't drive onto them, and chasing one leaves it
      // stuck oscillating at the hole's edge. Target the next clear point
      // instead so it drives around the gap.
      const overHole = (onCeiling && ugTileGoneAt(p.x, p.z)) || (atSummit && ugSkylightHoleAt(p.x, p.z));
      if (overHole || Math.hypot(p.x - lc.mesh.position.x, p.z - lc.mesh.position.z) < LITTLE_CAR_TRAIL_CATCH) {
        littleCarTrail.shift();
      } else {
        break;
      }
    }
    let tx = car.position.x, tz = car.position.z;
    if (littleCarTrail.length > 0) {
      tx = littleCarTrail[0].x;
      tz = littleCarTrail[0].z;
    }
    const dx = tx - lc.mesh.position.x;
    const dz = tz - lc.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const pdx = car.position.x - lc.mesh.position.x;
    const pdz = car.position.z - lc.mesh.position.z;
    const pdy = car.position.y - lc.mesh.position.y;
    // 3D distance to the player (not just 2D): if the player is on the
    // ceiling and the little car is still on the floor, the height gap keeps
    // it following instead of stopping far below.
    const distToPlayer = Math.hypot(pdx, pdz, pdy);
    const clear = (px, pz) => !littleCarBlockedAt(px, pz, lc.mesh.position.y) && !(onCeiling && ugTileGoneAt(px, pz)) && !(atSummit && ugSkylightHoleAt(px, pz));
    // Keep the usual follow gap from the player; while the player is further
    // away, drive toward the next trail point even if it's close — the stop
    // distance only applies to the player, not to intermediate trail points.
    if (distToPlayer > LITTLE_CAR_STOP_DIST && dist > 0.15) {
      const nx = dx / dist, nz = dz / dist;
      const move = LITTLE_CAR_FOLLOW_SPEED * delta;
      const nextX = lc.mesh.position.x + nx * move;
      const nextZ = lc.mesh.position.z + nz * move;
      if (clear(nextX, nextZ)) {
        lc.mesh.position.x = nextX;
        lc.mesh.position.z = nextZ;
      } else {
        // Direct line blocked — try sliding sideways around it, fanning out
        // wider if the tight step is still inside the obstacle so a face-on
        // prop (statue, pole base) gets crabbed around instead of freezing
        // the little car forever against the wall.
        const perpX = nz, perpZ = -nx;
        const tryR = { x: lc.mesh.position.x + perpX * move, z: lc.mesh.position.z + perpZ * move };
        const tryL = { x: lc.mesh.position.x - perpX * move, z: lc.mesh.position.z - perpZ * move };
        if (clear(tryR.x, tryR.z)) {
          lc.mesh.position.x = tryR.x;
          lc.mesh.position.z = tryR.z;
        } else if (clear(tryL.x, tryL.z)) {
          lc.mesh.position.x = tryL.x;
          lc.mesh.position.z = tryL.z;
        } else {
          const wideStep = move * 3;
          const wR = { x: lc.mesh.position.x + perpX * wideStep, z: lc.mesh.position.z + perpZ * wideStep };
          const wL = { x: lc.mesh.position.x - perpX * wideStep, z: lc.mesh.position.z - perpZ * wideStep };
          if (clear(wR.x, wR.z)) {
            lc.mesh.position.x = wR.x;
            lc.mesh.position.z = wR.z;
          } else if (clear(wL.x, wL.z)) {
            lc.mesh.position.x = wL.x;
            lc.mesh.position.z = wL.z;
          }
        }
      }
      // Plow a still-standing statue over, same as the player car does on the
      // roof — the statue's collider drops and the little car drives on
      // through where it stood instead of wedging against it.
      if (onCeiling) undergroundWorld.knockStatueAt(lc.mesh.position.x, lc.mesh.position.z, LITTLE_CAR_FOLLOW_SPEED);
      // Face the player (car forward = local -X, so heading = atan2(nz, -nx)).
      lc.mesh.rotation.y = Math.atan2(nz, -nx);
    } else if (onCeiling && ugTileGoneAt(lc.mesh.position.x, lc.mesh.position.z)) {
      // Parked on a crumbled tile (a hole) — nudge sideways off it so we
      // don't fall through.
      const ad = dist || 1;
      const perpX = dz / ad, perpZ = -dx / ad;
      const nudge = LITTLE_CAR_FOLLOW_SPEED * delta;
      for (const s of [1, -1]) {
        const tx = lc.mesh.position.x + perpX * nudge * s;
        const tz = lc.mesh.position.z + perpZ * nudge * s;
        if (clear(tx, tz)) {
          lc.mesh.position.x = tx;
          lc.mesh.position.z = tz;
          break;
        }
      }
    } else if (atSummit && ugSkylightHoleAt(lc.mesh.position.x, lc.mesh.position.z)) {
      // Parked on the summit skylight hole — nudge sideways off it, same as a
      // crumbled ceiling tile.
      const ad = dist || 1;
      const perpX = dz / ad, perpZ = -dx / ad;
      const nudge = LITTLE_CAR_FOLLOW_SPEED * delta;
      for (const s of [1, -1]) {
        const tx = lc.mesh.position.x + perpX * nudge * s;
        const tz = lc.mesh.position.z + perpZ * nudge * s;
        if (clear(tx, tz)) {
          lc.mesh.position.x = tx;
          lc.mesh.position.z = tz;
          break;
        }
      }
    }
    // Safety: if the little car still ends up centred over the summit skylight
    // hole (e.g. right after a trail jump), nudge it sideways off the open
    // square before the ground-snap would set its height to the rim.
    if (atSummit && ugSkylightHoleAt(lc.mesh.position.x, lc.mesh.position.z)) {
      const ad = dist || 1;
      const pX = dz / ad, pZ = -dx / ad;
      const nudge = LITTLE_CAR_FOLLOW_SPEED * delta;
      for (const s of [1, -1]) {
        const tx = lc.mesh.position.x + pX * nudge * s;
        const tz = lc.mesh.position.z + pZ * nudge * s;
        if (clear(tx, tz)) {
          lc.mesh.position.x = tx;
          lc.mesh.position.z = tz;
          break;
        }
      }
    }
    // Stranded catch-up: if the player has rolled far away at ground level (e.g.
    // after the holy-mountain ejection) and the trail is exhausted while the
    // little car is stuck at the floor, stop grinding along and pull it back
    // beside the player so it — and the goat herd that follows it — stays in
    // the scene with the car.
    const bothOnFloor = !chamberCine.active && car.position.y < 2 && lc.mesh.position.y < 2;
    lc.stuckT = bothOnFloor && distToPlayer > 120 && littleCarTrail.length === 0
      ? (lc.stuckT || 0) + delta
      : Math.max(0, (lc.stuckT || 0) - delta * 3);
    if (lc.stuckT > 6) {
      relaunchLittleCarNear(car.position.x, car.position.z);
    }
    // Ride the terrain like the player: course ramps (the candy waterfall),
    // soft surfaces (staircase steps, the checkerboard ceiling), or the cavern
    // floor. The little car ALSO advances the checkerboard tile colors over
    // the roof (the underground update feeds it the follower position).
    lc.mesh.position.y = littleCarGroundY(lc.mesh.position.x, lc.mesh.position.z, lc.mesh.position.y);
    // Remember whether the little car is riding a ramp, so the ground-height
    // helper can snap it onto the ceiling when it drives off a ramp's top
    // (instead of falling through the ramp-top/ceiling seam).
    const rNow = ugRampRideAt(lc.mesh.position.x, lc.mesh.position.z, lc.mesh.position.y);
    littleCarWasOnRamp = rNow !== null;
    const spin = 13 * delta * 2.6;
    for (const w of lc.mesh.userData.wheels) w.rotation.y += spin;
  }
}

// The little car gets shoved around physically when the player runs into it,
// exactly like a city traffic car — it spins out, slides, then resumes
// following once the knock settles. Runs only in the underground while the
// little car is actually driving around in the following phase.
function resolveLittleCarCollision(delta) {
  const lc = littleCar;
  if (!lc.mesh || !lc.mesh.visible || lc.phase !== 'following') return;
  // Hop over the flat car / boulder physics while the player is temporarily
  // squashed into a pancake (it shouldn't wheel around and shove anything).
  if (flatCarState.active && flatCarState.phase !== 'bounce') return;
  const dx = car.position.x - lc.mesh.position.x;
  const dz = car.position.z - lc.mesh.position.z;
  const minDist = playerCarRadius + LITTLE_CAR_RADIUS;
  const dist2 = dx * dx + dz * dz;
  if (dist2 >= minDist * minDist) return;
  // Same-surface gate: collision is 2D (altitude-blind), but the player can
  // be on the checkerboard ceiling or a ramp while the little car is on the
  // floor far below. Only nudge each other when they're near the same height.
  if (Math.abs(car.position.y - lc.mesh.position.y) > 2.5) return;
  const dist = Math.sqrt(dist2) || 0.001;
  // nx/nz point FROM the little car TO the player. The player is heaviest so
  // the little car yields the most, shoving IT away (−nx, the player barely
  // budges +nx) — exactly the mass-split of the city traffic, NOT toward each
  // other (pushing both inward per frame is what made it jitter in place).
  const nx = dx / dist, nz = dz / dist;
  const overlap = minDist - dist;
  car.position.x += nx * overlap * 0.3;
  car.position.z += nz * overlap * 0.3;
  lc.mesh.position.x -= nx * overlap * 0.7;
  lc.mesh.position.z -= nz * overlap * 0.7;
  // Knock the little car aside with a spin (the end you hit peels away first)
  // — one discrete knock per hit, not re-knocked while it's still tumbling.
  // Same power/spin as the traffic bumper car so it feels identical.
  if (!lc.knock && !jumpState.inAir) {
    const power = 13;
    const spin = 4.2;
    lc.knock = makeKnock(lc.mesh, LITTLE_CAR_HALF_LEN, LITTLE_CAR_HALF_WID, -nx, -nz, power, spin);
    shake.intensity = Math.max(shake.intensity, 0.07);
  }
  // Recoil the player's scalar speed, mirrored from the traffic behaviour:
  // the little car is light so the player barely slows, just a firm shove.
  if (!jumpState.inAir) {
    const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
    dir.y = 0;
    dir.normalize();
    const align = dir.x * nx + dir.z * nz;
    velocity.value = THREE.MathUtils.clamp(velocity.value * 0.5 + (align >= 0 ? 2.2 : -1.0), -6, 6);
  }
}

// ===== Perf pass (task #36): cap shadow casting to key props =====
// Every mesh that casts a shadow costs shadow-map fill rate, but tiny props
// (glow bulbs, marker dots, edge stripes, debris) produce shadows nobody can
// see. After all scenes are built, strip castShadow from any mesh whose
// bounding sphere is smaller than the car's smallest visible part — big
// scenery (buildings, trees, ramps, pillars, the car itself) keeps its
// shadow, sub-unit decorations stop paying for one.
const MIN_SHADOW_RADIUS = 1.1;
function capShadowCasters(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    if (o.geometry.boundingSphere && o.geometry.boundingSphere.radius < MIN_SHADOW_RADIUS) {
      o.castShadow = false;
    }
  });
}
capShadowCasters(scene);
capShadowCasters(rampScene);
capShadowCasters(undergroundScene);

await __loaderYield(0.96, 'the underground GPU pre-warm');

// ===== Underground GPU pre-warm =====
// The underground world is built eagerly above (mesh + geometry + materials),
// but three.js/WebGL compiles shaders and uploads buffers LAZILY on the first
// actual render of the scene. That first render only happens when the player
// enters the mine at the bottom of the shaft — so the mine-dive handoff
// stalled for the whole underground's shader-compile + buffer-upload cost,
// eating the opening of the spiral-arrival cinematic. Pre-render the
// underground a couple times into a tiny offscreen target right now (while
// the city is on screen) so its programs, geometry buffers and shadow maps
// are already on the GPU before the player ever drops in. Frustum culling is
// temporarily disabled so the WHOLE map (not just one camera's wedge) gets
// warmed in one pass.
{
  const warmRT = new THREE.WebGLRenderTarget(8, 8);
  const wideCam = new THREE.PerspectiveCamera(100, 1, 0.1, 400);
  wideCam.position.set(TUNNEL.cx - 120, 95, TUNNEL.cz + 120);
  wideCam.lookAt(TUNNEL.cx, 10, TUNNEL.cz);
  wideCam.updateProjectionMatrix();
  const unculled = [];
  undergroundScene.traverse((o) => {
    if (o.isMesh && o.frustumCulled) {
      unculled.push(o);
      o.frustumCulled = false;
    }
  });
  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(warmRT);
  renderer.render(undergroundScene, wideCam);
  renderer.render(undergroundScene, wideCam);
  renderer.setRenderTarget(prevTarget);
  for (const o of unculled) o.frustumCulled = true;
  warmRT.dispose();
}

await __loaderYield(0.97, 'the portals and ramps');

// ===== Portals =====
// The hilltop rings at (56,27) are the city's gateway to the ramp world.
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
  return info ? groundHeight + info.height * info.s : cityGroundHeightAt(px, pz);
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

// True when (x,z) lies on a collider's footprint. A collider carrying `r` is a
// DISC and is tested as one; everything else falls back to its halfW/halfD box.
//
// The one round collider today is the underground's giant spinning platter
// (underground/index.js PLATTER). Its mesh is a cylinder, so the box that
// covers the circle overhangs the rim by ~41% at each corner — a car in a
// corner would be seated on, and carried around by, a shelf of air. Every
// footprint test that can see a surface has to go through here so a round deck
// stops reporting standable floor past its rim.
function onColliderFootprint(c, x, z) {
  if (c.r !== undefined) {
    const dx = x - c.x;
    const dz = z - c.z;
    return dx * dx + dz * dz <= c.r * c.r;
  }
  return Math.abs(x - c.x) <= c.halfW && Math.abs(z - c.z) <= c.halfD;
}

// Highest rooftop surface (building top + roof lip) whose footprint contains
// the point, or 0 over open ground. Lets the car land on top of buildings
// when it flies (mega ramp) instead of sinking through them, and lets it drop
// off a roof edge back onto the street.
function buildingTopAt(x, z) {
  let top = 0;
  const list = worldState === 'underground' ? ugColliders : colliders;
  for (const c of list) {
    // `noRoof` colliders (e.g. the grand ramp's side walls) are barriers,
    // not surfaces — they block driving but must never report a rooftop, or
    // the elevated check would let the car drive straight through them.
    if (c.noRoof) continue;
    if (onColliderFootprint(c, x, z)) {
      // In the underground, a crumbled checkerboard tile leaves a hole — the
      // ceiling collider must not report a floor there, or the car would
      // drive on air over the gap.
      if (worldState === 'underground' && c.ceiling) {
        const ck = undergroundWorld.checker;
        const tx = Math.floor((x - ck.minX) / ck.tileSz);
        const tz = Math.floor((z - ck.minZ) / ck.tileSz);
        if (tx >= 0 && tx < ck.tilesX && tz >= 0 && tz < ck.tilesZ) {
          if (ck.gone[tz * ck.tilesX + tx]) continue;
        }
      }
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
      // baseY lets a ramp stand on raised ground (e.g. the pyramid peak pad)
      // instead of always rising from the cavern floor.
      return { runX: r.runX, runZ: r.runZ, s, height: r.height, len: r.len, boost: r.boost, baseY: r.baseY || 0, def: r };
    }
  }
  return null;
}
// Surface height of an underground ramp under a point (for landing on the
// slope mid-air). -Infinity off a ramp so a max() with the floor picks y=0.
function ugRampSurfaceY(px, pz) {
  const info = ugRampInfoAt(px, pz);
  return info ? info.baseY + info.height * info.s : -Infinity;
}

// The RIDEABLE underground ramp at (px, pz) for a body at height carY, or
// null. ugRampInfoAt returns the FIRST footprint match, but overlapping ramps
// at very different heights can mask the one the car is actually on: the holy
// mountain's spiral road is registered before the direct-climb cone skin, and
// on the south arc its early wedges (already y≈2–6.5 high) lap onto the cone
// face's gentle foot band — so a floor-level car used to match the steep road
// surface (>2.0 above it), fail the ride gate, and drive INSIDE the mountain's
// rock base until a skirt box trapped it. Scanning for the first ramp whose
// own surface is within the ride range attaches the car to the surface it is
// genuinely near (the cone skin at the base), so the whole face mounts cleanly
// on every azimuth.
function ugRampRideAt(px, pz, carY) {
  for (const r of ugRamps) {
    const dx = px - r.x;
    const dz = pz - r.z;
    const along = dx * r.runX + dz * r.runZ;
    const perp = -dx * r.runZ + dz * r.runX;
    if (along >= -r.len / 2 && along <= r.len / 2 && Math.abs(perp) < r.width / 2) {
      const surf = (r.baseY || 0) + r.height * ((along + r.len / 2) / r.len);
      if (Math.abs(carY - surf) < 2.0) {
        return { runX: r.runX, runZ: r.runZ, s: (along + r.len / 2) / r.len, height: r.height, len: r.len, boost: r.boost, baseY: r.baseY || 0, def: r };
      }
    }
  }
  return null;
}

// Current top of any soft underground surface (staircase steps, the checkerboard
// ceiling) at (x,z), else 0. The level rewrites soft colliders' `h` every frame,
// so this tracks standing-on machines exactly. Surfaces more than
// 1.2 above the car are ignored — the cavern ceiling (h=31) spans the whole
// course, and without this filter it would mask the stair-step heights below
// it. (1.2 < the 1.4 snap gate, so the moment the ceiling becomes visible the
// car can always snap up onto it.)
function ugElevatorTopAt(px, pz, carY) {
  let top = 0;
  for (const c of ugColliders) {
    if (c.soft && onColliderFootprint(c, px, pz)) {
      // Skip the ceiling collider over a crumbled tile (a hole) so the car
      // falls through instead of riding on air.
      if (c.ceiling) {
        const ck = undergroundWorld.checker;
        const tx = Math.floor((px - ck.minX) / ck.tileSz);
        const tz = Math.floor((pz - ck.minZ) / ck.tileSz);
        if (tx >= 0 && tx < ck.tilesX && tz >= 0 && tz < ck.tilesZ) {
          if (ck.gone[tz * ck.tilesX + tx]) continue;
        }
      }
      // The ceiling collider's h is the checkerboard's underside ride height;
      // the tiles' top face sits 0.3 higher (CEIL_Y + 1.3), so report that
      // (matching buildingTopAt's +0.3) or the car's wheels sink into the
      // tiles. The visibility filter still uses the raw h so the ceiling
      // becomes reachable at the same height as before.
      // Bridge colliders (the factory machine's drivable roof) always report
      // their top, no matter how far above the car — a car flying onto the
      // machine must snap onto its roof from any height, while a car driving
      // on the floor underneath just sees it as an overhead ceiling.
      if (c.bridge || c.h <= carY + 1.2) top = Math.max(top, c.ceiling ? c.h + 0.3 : c.h);
    }
  }
  return top;
}

// Top of the factory machine's drivable "bridge" roof collider at (x,z), else
// 0. The machine's roof reports its height here so the airborne landing math
// can use it as a catch surface — the normal buildingTopAt gate only seats
// surfaces within 0.4 of the car, which would otherwise let a flying car fall
// into the machine's open belly.
function ugMachineTopAt(x, z) {
  let top = 0;
  for (const c of ugColliders) {
    if (c.bridge && Math.abs(x - c.x) <= c.halfW && Math.abs(z - c.z) <= c.halfD) {
      top = Math.max(top, c.h);
    }
  }
  return top;
}

// True if the checkerboard tile under (x, z) has crumbled away (a hole the
// car can fall through). Used by the hole-fall camera to detect the drop.
function ugTileGoneAt(x, z) {
  const ck = undergroundWorld.checker;
  const tx = Math.floor((x - ck.minX) / ck.tileSz);
  const tz = Math.floor((z - ck.minZ) / ck.tileSz);
  if (tx >= 0 && tx < ck.tilesX && tz >= 0 && tz < ck.tilesZ) {
    return ck.gone[tz * ck.tilesX + tx] === 1;
  }
  return false;
}

// ===== Tunnel interior floor (underground spiral tube) =====
// The spiral tube that connects the cavern to the surface is a visual mesh
// with no colliders.  These helpers let the car ride the tube's interior floor
// so it genuinely drives UP the tunnel instead of ghosting through it on the
// cavern floor below.

// Tunnel floor height at (px, pz) in local space — no vertical proximity
// check; used for airborne landing (the caller gates on floor <= carY).
function tunnelFloorYRaw(px, pz) {
  const dx = px - TUNNEL.cx;
  const dz = pz - TUNNEL.cz;
  const distXZ = Math.sqrt(dx * dx + dz * dz);
  if (Math.abs(distXZ - TUNNEL.R) > TUNNEL.tubeR) return null;
  let theta = Math.atan2(dz, dx);
  // The tunnel arc crosses the ±π boundary of atan2 (theta0+sweep ≈ 4.85 > π),
  // so near the foot the raw angle wraps negative. Unwrap it so s maps
  // correctly onto [0,1] (foot = 1, top = 0).
  if (theta < TUNNEL.theta0) theta += 2 * Math.PI;
  let s = (theta - TUNNEL.theta0) / TUNNEL.sweep;
  if (s < -0.05 || s > 1.05) return null;
  s = Math.max(0, Math.min(1, s));
  return tunnelPoint(s).y - UNDERGROUND_Y;
}

// Tunnel floor at (px, pz) for a grounded car: returns { y, slope, tanX,
// tanZ } when the car is inside the tube AND the floor is near the car's
// current height (prevents snapping up when driving under the tunnel on the
// cavern floor).
function tunnelFloorAt(px, pz, carY) {
  const dx = px - TUNNEL.cx;
  const dz = pz - TUNNEL.cz;
  const distXZ = Math.sqrt(dx * dx + dz * dz);
  if (Math.abs(distXZ - TUNNEL.R) > TUNNEL.tubeR) return null;
  let theta = Math.atan2(dz, dx);
  // The tunnel arc crosses the ±π boundary of atan2 (theta0+sweep ≈ 4.85 > π),
  // so near the foot the raw angle wraps negative. Unwrap it so s maps
  // correctly onto [0,1] (foot = 1, top = 0).
  if (theta < TUNNEL.theta0) theta += 2 * Math.PI;
  let s = (theta - TUNNEL.theta0) / TUNNEL.sweep;
  if (s < -0.05 || s > 1.05) return null;
  s = Math.max(0, Math.min(1, s));
  const p = tunnelPoint(s);
  const floorY = p.y - UNDERGROUND_Y;
  // Floor must be at or below the car (with a small margin) — prevents
  // snapping up when the car is on the cavern floor under the elevated tube.
  if (floorY > carY + 1.5) return null;
  // Slope for body pitch
  const ds = 0.002;
  const s1 = Math.max(0, s - ds), s2 = Math.min(1, s + ds);
  const p1 = tunnelPoint(s1), p2 = tunnelPoint(s2);
  const hDist = (s2 - s1) * TUNNEL.R * TUNNEL.sweep;
  const slope = (p2.y - p1.y) / hDist;
  // Path tangent for heading correction
  const th = TUNNEL.theta0 + TUNNEL.sweep * s;
  return { y: floorY, slope, tanX: -Math.sin(th), tanZ: Math.cos(th), s };
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
// Ramp world: a wild monster truck roams the hills, launches off the ramps
// and flattens the player when it drives over them. It never chases and
// never knocks props over.
let monsterTruck = null;        // the mesh, once spawned
let monsterInRamp = false;
let monsterRampTimer = 0;
let monsterPatrol = 0;          // index into MONSTER_WAYPOINTS
let monsterAir = false;         // ballistic jump state
let monsterVy = 0;
let monsterWasRamp = null;
const MONSTER_RAMP_DELAY = 10;  // seconds after entering the ramp world before it shows up
const MONSTER_SPEED = 19;       // full throttle for the biggest ramp jumps
const playerKnockRadius = 2.6;      // how far the player shoves props
const aiKnockRadius = 1.5;          // how far the blue car shoves props
const shake = { intensity: 0 };
// Pothole / lake wobble — set when driving over the pothole or into the park
// lake; `zone` remembers which one triggered it so the bump direction matches.
const potholeWobble = { active: false, t: 0, zone: null };

// ===== Park lake splashes =====
// Tiny water droplets spat up when the car drives into the shallow lake in the
// NE park. Each droplet is a small sphere with its own velocity + gravity and
// fades out as it falls; a drop that lands on the "water" bounces once and
// slows. They live in the city scene and are cleared on world swaps.
const splashDrops = [];
const splashGeo = new THREE.SphereGeometry(0.07, 6, 6);
const splashMaterial = () => new THREE.MeshBasicMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.95 });

function spawnLakeSplash(cx, cz, px, pz) {
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(splashGeo, splashMaterial());
    m.position.set(px + (Math.random() - 0.5) * 0.9, 0.24, pz + (Math.random() - 0.5) * 0.9);
    const a = Math.random() * Math.PI * 2;
    const sp = 1.2 + Math.random() * 2.4;
    scene.add(m);
    splashDrops.push({
      mesh: m,
      vx: Math.cos(a) * sp,
      vy: 2.2 + Math.random() * 2.6,
      vz: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.45,
      maxLife: 0.5 + Math.random() * 0.45,
    });
  }
}

function updateLakeSplashes(delta) {
  for (let i = splashDrops.length - 1; i >= 0; i--) {
    const d = splashDrops[i];
    d.life -= delta;
    if (d.life <= 0) {
      scene.remove(d.mesh);
      d.mesh.material.dispose();
      splashDrops.splice(i, 1);
      continue;
    }
    d.vy -= 9.8 * delta;
    d.mesh.position.x += d.vx * delta;
    d.mesh.position.y += d.vy * delta;
    d.mesh.position.z += d.vz * delta;
    if (d.mesh.position.y <= 0.2) {
      d.mesh.position.y = 0.2;
      d.vy = Math.abs(d.vy) * 0.35;
      d.vx *= 0.6;
      d.vz *= 0.6;
    }
    d.mesh.material.opacity = 0.95 * (d.life / d.maxLife);
  }
}

function clearLakeSplashes() {
  for (const d of splashDrops) {
    scene.remove(d.mesh);
    d.mesh.material.dispose();
  }
  splashDrops.length = 0;
}
// Tier 3 knock impulse: a hammer / wheel-rim / boulder hit slides the car in
// world space AND spins it (like the bumper car's knock), plus a hop.
let playerKnock = null;
// The wheel of death (rim or a paddle) flings the car TWICE as far as a
// hammer does (hammers use power 130 → ~21 units; this → ~43 units).
const WHEEL_KNOCK_POWER = 260;

// Launch the player car sideways + spin + hop, away from a hit. nx/nz is the
// (unit) direction away from the thing that hit you. Adds a small random fan
// so no two hits feel identical.
// A knock with a tiny hop (e.g. the candy-waterfall's regular gems, hop
// ≈ 0.07) is a nudge, not a launch — setting inAir would switch the car to
// airborne physics and it would float above the ramp surface instead of
// riding it down. Only go airborne when the hop is actually meaningful.
const KNOCK_AIRBORNE_HOP = 0.3;
function knockPlayerAway(nx, nz, power, spin, hop) {
  const px = -nz, pz = nx;                   // perpendicular
  const j = (Math.random() - 0.5) * 0.5;     // small random sideways fan
  nx = nx + px * j;
  nz = nz + pz * j;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len; nz /= len;
  playerKnock = makeKnock(car, 2.15, 0.9, nx, nz, power, spin);
  if (hop > KNOCK_AIRBORNE_HOP) {
    jumpState.inAir = true;
    jumpState.yVelocity = hop;
  }
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
    if (isPositionBlocked(c.x, c.z, playerCarRadius, true)) continue;  // inside a building
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
  taffyState = createTaffyState(false);
  magnetHold = null;
  expressState.active = false;
  expressState.dir = 1;
  expressState.cooldown = 0;
  stopTubeHum();
  expressCinT = 0;
  bubbleWobble = 0;
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
  bumperCar.scale.set(1, 1, 1);
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
  clearLakeSplashes();   // no water left in the ramp world
  // The blue car will chase you in here after ~20 seconds.
  bumperInRamp = false;
  bumperRampTimer = BUMPER_RAMP_DELAY;
  bumperKnock = null;
  // A wild monster truck may also show up and start ramp-jumping.
  monsterInRamp = false;
  monsterRampTimer = MONSTER_RAMP_DELAY;
  reparentTrainCars();
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
    reparentChaseTrainConsist();
  }
  // The ramp-world monster truck stays behind on the hills.
  if (monsterInRamp) {
    rampScene.remove(monsterTruck);
    monsterInRamp = false;
  }
  reparentTrainCars();
  car.position.set(0, 40, 0);   // high above the town centre intersection
  car.rotation.set(0, -Math.PI / 2, 0);   // face -Z (south) — steer while falling
  shake.intensity = Math.max(shake.intensity, 0.5);
}

// City → Underground (mine shaft portal at -55,50). The world swap hides
// behind a cut: the camera jumps straight to the spiral-tunnel orbit while
// the car is still "in transit", and control only returns when the car
// bursts out of the tunnel foot at the end of the cinematic.
function enterUndergroundWorld() {
  scene.remove(car);
  undergroundScene.add(car);
  worldState = 'underground';
  resetKnockables();
  resetHydrantSprays();
  portalGrace = spiralCine.orbitDur + spiralCine.driveDur + 1.2;
  velocity.value = 0;
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  flatCarState = createFlatCarState(false);
  taffyState = createTaffyState(false);
  magnetHold = null;
  expressState.active = false;
  expressState.dir = 1;
  expressState.cooldown = 0;
  stopTubeHum();
  expressCinT = 0;
  bubbleWobble = 0;
  reparentTrainCars();
  // The little car follows you in: arm its 30s countdown so it comes out of
  // the tunnel a little while after you do.
  startLittleCar();
  // Park the car at the top of the spiral — the cine update owns
  // positioning until the handoff at the tunnel foot. The car is genuinely
  // in the tunnel the whole time: the opaque tube hides it while it's deep
  // inside, and it becomes visible as it comes around the corner toward the
  // exit.
  const pose = spiralPoseAt(spiralCine.sStart);
  car.position.set(pose.x, pose.y, pose.z);
  car.rotation.set(0, pose.heading, pose.pitch);
  car.visible = true;
  // Start the arrival cinematic and plant the camera at the orbit start:
  // high up, looking at the centre axis, ready to sweep counterclockwise
  // (opposite to the tunnel's spin) down to the watch tripod.
  spiralCine.active = true;
  spiralCine.timer = 0;
  spiralCine.hold = 1.15;   // keep the opening shot on screen through the fade-in
  camera.position.set(
    TUNNEL.cx + SPIRAL_PIVOT_R * Math.cos(SPIRAL_PIVOT_ANG), SPIRAL_START_Y,
    TUNNEL.cz + SPIRAL_PIVOT_R * Math.sin(SPIRAL_PIVOT_ANG)
  );
  _lookTarget.set(SPIRAL_LOOK.x, SPIRAL_LOOK.y, SPIRAL_LOOK.z);
  camera.lookAt(_lookTarget);
  camera.fov = 60;
  camera.updateProjectionMatrix();
  shake.intensity = 0;
  // Reset mine portal state
  minePortal.active = false;
  minePortal.timer = 0;
  // Fade in from black once the underground is loaded — smooth transition
  // from the cut-to-black that fired during the dive.
  setTimeout(() => {
    _fadeOverlay.style.transition = 'opacity 0.8s';
    _fadeOverlay.style.opacity = '0';
  }, 300);
}

// End of the arrival cinematic: drop the car out of the tunnel foot along
// its exit tangent, already up to speed, and hand control back.
function finishSpiralCine() {
  spiralCine.active = false;
  car.visible = true;
  camera.fov = 60;                  // drop the arrival-shot FOV kick back to base
  camera.updateProjectionMatrix();
  // Save the camera's current tripod position so the post-cinematic ease
  // can smoothly interpolate from here to the chase view.
  _postCineCamPos.copy(camera.position);
  _postCineLookPos.copy(_lookTarget);
  _postCineTimer = 3.5;   // seconds for the slow ease-in to chase view
  const p = tunnelPoint(1);
  const q = tunnelPoint(0.994);
  let ex = p.x - q.x, ez = p.z - q.z;
  const elen = Math.hypot(ex, ez) || 1;
  ex /= elen; ez /= elen;
  car.position.set(p.x + ex * 2.5, 0, p.z + ez * 2.5);
  car.rotation.set(0, Math.atan2(ez, -ex), 0);
  velocity.value = 13;          // zip out onto the land
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  portalGrace = 2.5;            // time to clear the return-zone radius
  shake.intensity = 0.25;
}

// Underground → City (drive into the tunnel foot in the underground)
// The car drives UP the spiral tunnel (reverse of the arrival descent) while
// the camera follows from behind — headlights facing away from us — then
// cuts to the mine-ascent emergence where the car shoots out of the shaft.
function startTunnelAscentCine() {
  portalGrace = tunnelAscentCine.driveDur + mineAscent.driveTotal + mineAscent.launchTotal + 2.0;
  // Leaving via the tunnel = the underground gets torn down and rebuilt in
  // the background, so the next trip down the mine shaft starts pristine.
  resetUndergroundBuild();
  velocity.value = 0;
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  flatCarState = createFlatCarState(false);
  // Park the car at the tunnel foot facing up the tunnel — the cine update
  // owns positioning until the cut to the mine ascent.
  const pose = spiralPoseAtUp(1);
  car.position.set(pose.x, pose.y, pose.z);
  car.rotation.set(0, pose.heading, pose.pitch);
  car.visible = true;
  tunnelAscentCine.active = true;
  tunnelAscentCine.timer = 0;
  tunnelAscentCine.s = 1;
  // Fade the tube translucent so the camera can see the car driving up
  // inside the tunnel, then cut to black for the mine-ascent emergence.
  if (undergroundWorld.spiralTubeMat) {
    undergroundWorld.spiralTubeMat.transparent = true;
    undergroundWorld.spiralTubeMat.opacity = 0.74;
  }
  shake.intensity = 0;
}

// Underground → City (drive into the tunnel foot in the underground)
// The car drives UP the mine shaft and shoots out of the entrance — the
// reverse of the dive. It appears at the buried throat, drives up the adit
// to the surface, then launches out of the mine entrance and flies clear
// before control returns.
function startMineAscent() {
  undergroundScene.remove(car);
  scene.add(car);
  worldState = 'city';
  resetKnockables();
  resetHydrantSprays();
  // The little car stays behind in the underground — it doesn't follow you
  // back up the mine shaft.
  resetLittleCar();
  portalGrace = mineAscent.driveTotal + mineAscent.launchTotal + 2.0;
  velocity.value = 0;
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  flatCarState = createFlatCarState(false);
  // Park the car at the buried throat of the mine shaft — the ascent
  // cinematic owns positioning until the car shoots clear of the entrance.
  car.position.set(mineAscent.triggerX, -10.5, 54);
  car.rotation.set(0, -Math.PI / 2, 0);   // heading south, up the adit
  car.visible = true;
  mineAscent.active = true;
  mineAscent.timer = 0;
  mineAscentSettle = 0;   // no stale leveling from a previous ascent
  // Fade in from black once the city is loaded — smooth transition from the
  // cut-to-black that fired when the car drove into the tunnel foot.
  _fadeOverlay.style.transition = 'none';
  _fadeOverlay.style.opacity = '1';
  setTimeout(() => {
    _fadeOverlay.style.transition = 'opacity 0.8s';
    _fadeOverlay.style.opacity = '0';
  }, 200);
  // Plant the camera off to the side (east of the shaft) so we see the
  // explosion and the car streaking through the air in profile.
  _mineAscentCamPos.set(-42, 4.5, 28);
  _mineAscentLookPos.set(-55, 0, 34);
  shake.intensity = 0;
}

// End of the ascent cinematic: the car has shot clear of the mine shaft and
// landed on the road south of it — hand control back with forward speed.
function finishMineAscent() {
  mineAscent.active = false;
  // Land clear of the mine shaft, facing south, already rolling.
  const landZ = 34 - mineAscent.launchVh * mineAscent.launchTotal;
  car.position.set(mineAscent.triggerX, groundHeight, landZ);
  car.rotation.set(0, -Math.PI / 2, 0);
  // Extra step: keep the car level as it drives away from the shaft — the
  // body-lean code would otherwise pitch the hood down under acceleration.
  mineAscentSettle = 4.0;
  velocity.value = 12;          // keep rolling south after the landing
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  portalGrace = 2.0;            // time to clear the mine trigger zone
  shake.intensity = 0.3;
  // Ease the camera from the emergence shot to the chase view.
  _postCineCamPos.copy(camera.position);
  _postCineLookPos.copy(_lookTarget);
  _postCineTimer = 3.5;
}

// Start the holy-chamber drop: snag the car inside the skylight shaft (just
// under the summit rim) and grip it through the staged sequence — fall into
// the chamber, pan around the man and goats, mysterious lift back out, then
// the ballistic arc to the ground outside the mountain.
function startChamberCine() {
  const M = undergroundWorld.holy.MOUNT;
  chamberCine.active = true;
  chamberCine.phase = 'fall';
  chamberCine.timer = 0;
  velocity.value = 0;
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  flatCarState = createFlatCarState(false);
  shake.intensity = 0;
  // Snag the car into the shaft centre, just under the summit rim.
  car.position.set(M.cx, M.peakY - 1.7, M.cz);
}

// End of the chamber cinematic: the car landed on open ground outside the
// mountain — hand control back, already rolling AWAY from the mountain.
function finishChamberCine() {
  const M = undergroundWorld.holy.MOUNT;
  chamberCine.active = false;
  if (undergroundWorld.holy) {
    undergroundWorld.holy.flare = 1;
    // The car was just mysteriously kicked back out over the cone — the level
    // reads this one-shot to start the 30 s goat-pilgrimage countdown.
    undergroundWorld.holy.ejectFlag = true;
  }
  car.position.set(chamberCine.landX, 0.02, chamberCine.landZ);
  // The little car (and the goats that follow it) were left stranded up by the
  // mountain while the player was inside the chamber — pull it back here
  // beside the landing spot so it follows again on the way out.
  relaunchLittleCarNear(chamberCine.landX, chamberCine.landZ);
  // Face directly AWAY from the mountain so the car rolls off across the open
  // floor instead of roaming back up the pilgrim's road for a second lap.
  const fxA = car.position.x - M.cx, fzA = car.position.z - M.cz;
  car.rotation.set(0, Math.atan2(fzA, -fxA), 0);
  mineAscentSettle = 4.0;   // stay level right after the scripted launch
  velocity.value = 12;      // keep rolling toward the climb
  steering.value = 0;
  jumpState.inAir = false;
  jumpState.yVelocity = 0;
  wasOnRamp = null;
  currentRamp = null;
  playerKnock = null;
  portalGrace = 2.0;
  shake.intensity = 0.3;
  // Ease the camera from the exterior shot back to the chase view.
  _postCineCamPos.copy(camera.position);
  _postCineLookPos.copy(_lookTarget);
  _postCineTimer = 3.5;
}

// Drive the chamber cinematic timeline and place the car every frame. The
// phases own the car completely (the physics gate is off while it runs).
function updateChamberCine(delta) {
  const M = undergroundWorld.holy.MOUNT;
  const P = chamberCine;
  P.timer += delta;
  const t = P.timer;

  // Phase transitions (move on to the next phase once the current one ends).
  if (P.phase === 'fall' && t >= P.fallDur) { P.phase = 'pan'; P.timer = 0; }
  else if (P.phase === 'pan' && t >= P.panDur) { P.phase = 'lift'; P.timer = 0; }
  else if (P.phase === 'lift' && t >= P.liftDur) { P.phase = 'flight'; P.timer = 0; }
  else if (P.phase === 'flight' && t >= P.flightDur) { finishChamberCine(); return; }

  const pT = P.timer;
  const smoothp = (u) => u * u * (3 - 2 * u);
  // Where the car settles on the chamber floor: south-east of the dais, at a
  // worshipful distance — ~3 units back from the pedestal's edge (the shrine
  // box is ±3.6), so the car beholds the holy man and his goats from afar
  // instead of nudging the pedestal. Still inside the fall camera's frame with
  // the man + goats behind it, and clear of the chamber wall ring (r 12.5).
  const lA = (75 * Math.PI) / 180;
  const landR = 6.8;
  const lx = M.cx + landR * Math.cos(lA);
  const lz = M.cz + landR * Math.sin(lA);

  if (P.phase === 'fall') {
    const e = smoothp(Math.min(pT / P.fallDur, 1));
    car.position.set(
      THREE.MathUtils.lerp(M.cx, lx, e),
      THREE.MathUtils.lerp(M.peakY - 1.7, 0.3, e),
      THREE.MathUtils.lerp(M.cz, lz, e)
    );
    // Face the holy man at the centre.
    car.rotation.set(0, Math.atan2(M.cz - car.position.z, -(M.cx - car.position.x)), 0);
  } else if (P.phase === 'pan') {
    car.position.set(lx, 0.3, lz);
    car.rotation.set(0, Math.atan2(M.cz - car.position.z, -(M.cx - car.position.x)), 0);
    for (const w of car.userData.wheels) w.rotation.y += 0.2;   // idle
  } else if (P.phase === 'lift') {
    const e = smoothp(Math.min(pT / P.liftDur, 1));
    // Float up off the floor, drift to the axis, and rise through the
    // oculus/shaft out the open summit.
    car.position.set(
      THREE.MathUtils.lerp(lx, M.cx, e),
      THREE.MathUtils.lerp(0.3, M.peakY + 1, e),
      THREE.MathUtils.lerp(lz, M.cz, e)
    );
    car.rotation.set(
      THREE.MathUtils.lerp(0, -0.3, e),
      Math.atan2(M.cz - car.position.z, -(M.cx - car.position.x)),
      0
    );
    for (const w of car.userData.wheels) w.rotation.y += 0.6;
  } else if (P.phase === 'flight') {
    // Ballistic arc: out of the summit overs the cone, landing on the open
    // floor east-south of the base (same param style as the mine ascent).
    car.position.set(
      M.cx + P.vx * pT,
      M.peakY + 1 + P.vy * pT - 0.5 * gravity * pT * pT,
      M.cz + P.vz * pT
    );
    const vy = P.vy - gravity * pT;
    const v2d = Math.hypot(P.vx, P.vz);
    car.rotation.set(
      THREE.MathUtils.clamp(Math.atan2(vy, v2d) * 0.6, -0.5, 0.9),
      Math.atan2(P.vz, -P.vx),
      0
    );
    for (const w of car.userData.wheels) w.rotation.y += 0.8;
  }

  // The mountain's mysterious light surges as the car is taken up and cast
  // back out (the level's pulse multiplies this flare in).
  const H = undergroundWorld.holy;
  if (P.phase === 'lift') {
    H.flare = 1 + 1.6 * smoothp(Math.min(pT / P.liftDur, 1));
  } else if (P.phase === 'flight') {
    H.flare = Math.max(1, 3.0 * (1 - pT / P.flightDur));
  } else {
    H.flare = 1;
  }
}

// ===== Mine-ascent explosion FX =====
// One flame cone in the blast: its own material so it can fade out on its
// own schedule (the shared geometries are never disposed).
function addBlastFlame(geo, color, x, y, z, rx, born, base, freq, amp) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.x = rx || 0;
  m.scale.setScalar(base);
  scene.add(m);
  mineBlast.flames.push({ mesh: m, base, phase: Math.random() * Math.PI * 2, freq, amp, born, life: 1.7 });
}

// One smoke puff in the blast plume (billboard sprite with its own material).
function addBlastSmoke(o) {
  const mat = new THREE.SpriteMaterial({
    map: mineSmokeTex, transparent: true, opacity: 0, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.position.set(o.x0, o.y0, o.z0);
  s.scale.set(o.size, o.size, 1);
  scene.add(s);
  mineBlast.smoke.push({
    sprite: s, x0: o.x0, y0: o.y0, z0: o.z0,
    driftX: o.driftX, driftZ: o.driftZ, rise: o.rise,
    size: o.size, opacity: o.opacity, life: o.life, born: o.born,
    wob: Math.random() * Math.PI * 2,
  });
}

// Fire the mine blast: a fireball deep in the shaft, flames rushing up the
// adit and bursting out of the entrance, smoke shooting out behind the car.
function spawnMineBlast() {
  const AXIS_X = -55;
  // Clean up any leftovers from a previous blast (shouldn't normally happen —
  // the effect fully disposes before deactivating).
  for (const f of mineBlast.flames) { scene.remove(f.mesh); f.mesh.material.dispose(); }
  for (const p of mineBlast.smoke) { scene.remove(p.sprite); p.sprite.material.dispose(); }
  if (mineBlast.fireball) {
    scene.remove(mineBlast.fireball);
    mineBlast.fireball.geometry.dispose();
    mineBlast.fireball.material.dispose();
  }
  if (mineBlast.fireballLight) scene.remove(mineBlast.fireballLight);
  mineBlast.active = true;
  mineBlast.timer = 0;
  mineBlast.flames = [];
  mineBlast.smoke = [];

  // Fireball deep in the shaft — a bright sphere that swells and fades, plus
  // a flash light that lights the whole mine.
  const fb = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffa040, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  fb.position.set(AXIS_X, -1.5, 44);
  fb.scale.setScalar(0.8);
  scene.add(fb);
  mineBlast.fireball = fb;
  const fl = new THREE.PointLight(0xff6a1f, 0, 45, 2);
  fl.position.set(AXIS_X, -1.5, 44);
  scene.add(fl);
  mineBlast.fireballLight = fl;

  // Flame cones along the adit (deep → shallow), staggered so the fire reads
  // as rushing up the shaft toward the entrance, behind the car.
  const stations = [42, 39.5, 37.5];
  stations.forEach((z, i) => {
    const bedY = mineAditDropAt(z);
    const born = i * 0.07;   // deepest first
    addBlastFlame(blastFlameOuterGeo, 0xff5a1f, AXIS_X, bedY + 2.0, z, 0, born, 1, 7 + i * 0.6, 0.18);
    addBlastFlame(blastFlameCoreGeo, 0xfff3c4, AXIS_X, bedY + 1.1, z, 0, born, 1, 9 + i * 0.6, 0.22);
  });

  // Entrance burst — flames shooting out of the mouth behind the car.
  addBlastFlame(blastFlameBigGeo, 0xff5a1f, AXIS_X, 0.4, 34, -0.4, 0.12, 1.25, 6.5, 0.2);
  addBlastFlame(blastFlameBigGeo, 0xfff3c4, AXIS_X, 0.4, 34, -0.4, 0.12, 0.7, 8.5, 0.25);
  addBlastFlame(blastFlameSmallGeo, 0xff9e2c, AXIS_X - 1.7, 0.4, 34, -0.5, 0.18, 1, 7, 0.22);
  addBlastFlame(blastFlameSmallGeo, 0xff9e2c, AXIS_X + 1.7, 0.4, 34, -0.5, 0.18, 1, 7.5, 0.22);
  addBlastFlame(blastFlameSmallGeo, 0xff5a1f, AXIS_X, 1.4, 32.4, -0.85, 0.26, 1.1, 7, 0.25);
  addBlastFlame(blastFlameSmallGeo, 0xff9e2c, AXIS_X - 1.2, 1.1, 33.2, -0.75, 0.26, 0.9, 8, 0.25);
  addBlastFlame(blastFlameSmallGeo, 0xff9e2c, AXIS_X + 1.2, 1.1, 33.2, -0.75, 0.26, 0.9, 8.5, 0.25);

  // Smoke — a burst that shoots out of the mouth with the flames...
  for (let i = 0; i < 10; i++) {
    addBlastSmoke({
      x0: AXIS_X + (Math.random() - 0.5) * 3,
      y0: 0.5 + Math.random() * 1.5,
      z0: 34 - Math.random() * 1.5,
      driftX: (Math.random() - 0.5) * 6,
      driftZ: -(1.5 + Math.random() * 3),
      rise: 3 + Math.random() * 4,
      size: 2.5 + Math.random() * 2.5,
      opacity: 0.5,
      life: 2.2 + Math.random() * 0.8,
      born: 0.1 + Math.random() * 0.3,
    });
  }
  // ...then a little residual smoke that lingers after the flames clear and
  // slowly dissipates.
  for (let i = 0; i < 6; i++) {
    addBlastSmoke({
      x0: AXIS_X + (Math.random() - 0.5) * 2.5,
      y0: 0.3,
      z0: 34,
      driftX: (Math.random() - 0.5) * 3,
      driftZ: -(0.5 + Math.random() * 1.5),
      rise: 2 + Math.random() * 3,
      size: 2 + Math.random() * 2,
      opacity: 0.35,
      life: 4.5 + Math.random() * 2,
      born: 1.4 + Math.random() * 0.6,
    });
  }

  // Small camera kick + low boom to sell the blast.
  shake.intensity = Math.max(shake.intensity, 0.35);
  playMineBlast();
}

// Animate the blast: fireball swells then fades, flames flicker and burn
// out, smoke shoots out and dissipates — leaving only a little drifting
// smoke that slowly clears.
function updateMineBlast(delta) {
  if (!mineBlast.active) return;
  mineBlast.timer += delta;
  const t = mineBlast.timer;

  // Fireball: swell fast, then fade out.
  if (mineBlast.fireball) {
    const grow = Math.min(t / 0.35, 1);
    const s = 0.8 + (4.5 - 0.8) * (1 - (1 - grow) * (1 - grow));
    mineBlast.fireball.scale.setScalar(s);
    const fade = Math.max(0, 1 - Math.max(0, t - 0.35) / 0.55);
    mineBlast.fireball.material.opacity = fade;
    if (mineBlast.fireballLight) {
      mineBlast.fireballLight.intensity = 45 * fade * (0.5 + 0.5 * Math.random());
    }
    if (t >= 0.9) {
      scene.remove(mineBlast.fireball);
      mineBlast.fireball.geometry.dispose();
      mineBlast.fireball.material.dispose();
      mineBlast.fireball = null;
      if (mineBlast.fireballLight) {
        scene.remove(mineBlast.fireballLight);
        mineBlast.fireballLight = null;
      }
    }
  }

  // Flames: flicker, then fade out once their life elapses.
  for (let i = mineBlast.flames.length - 1; i >= 0; i--) {
    const f = mineBlast.flames[i];
    const age = t - f.born;
    if (age < 0) continue;
    if (age >= f.life) {
      scene.remove(f.mesh);
      f.mesh.material.dispose();
      mineBlast.flames.splice(i, 1);
      continue;
    }
    const k = age / f.life;
    const flicker = 1 + Math.sin(age * f.freq + f.phase) * f.amp;
    f.mesh.scale.setScalar(f.base * flicker * (1 - k * 0.45));
    f.mesh.material.opacity = 1 - k * k;
  }

  // Smoke: shoot out, drift, grow and dissipate.
  for (let i = mineBlast.smoke.length - 1; i >= 0; i--) {
    const p = mineBlast.smoke[i];
    const age = t - p.born;
    if (age < 0) continue;
    if (age >= p.life) {
      scene.remove(p.sprite);
      p.sprite.material.dispose();
      mineBlast.smoke.splice(i, 1);
      continue;
    }
    const k = age / p.life;
    p.sprite.position.set(
      p.x0 + p.driftX * k + Math.sin(age * 1.3 + p.wob) * 0.6,
      p.y0 + p.rise * k,
      p.z0 + p.driftZ * k
    );
    const sz = p.size * (0.6 + 1.6 * k);
    p.sprite.scale.set(sz, sz, 1);
    p.sprite.material.opacity = p.opacity * Math.sin(k * Math.PI);
  }

  // All gone — the blast is finished.
  if (!mineBlast.fireball && !mineBlast.fireballLight &&
      mineBlast.flames.length === 0 && mineBlast.smoke.length === 0) {
    mineBlast.active = false;
  }
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
  } else if (worldState === 'underground') {
    // Feature markers (idea #29): the cavern is large and dark, so drop a
    // marker at each landmark from the level's exported mapFeatures list —
    // a HOLLOW square per built feature (same faint outline style as the
    // city-building footprints). The mountain keeps its round ring.
    // Labels are drawn later, after the mirror is undone, so the text isn't
    // flipped.
    const feats = undergroundWorld.mapFeatures || [];
    for (const f of feats) {
      const fx = mmCenter + f.x * mmScale;
      const fz = mmCenter + f.z * mmScale;
      ctx.strokeStyle = f.color;
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.3;
      const s = Math.max(2.2, f.r * mmScale);
      if (f.kind === 'mountain' || f.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(fx, fz, s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fx, fz, 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeRect(fx - s, fz - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
    }
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

  // Feature labels (idea #29), drawn un-mirrored so the text reads normally.
  if (worldState === 'underground') {
    ctx.font = '6px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of (undergroundWorld.mapFeatures || [])) {
      if (!f.label) continue;
      let lx = 160 - (mmCenter + f.x * mmScale);
      let lz = 160 - (mmCenter + f.z * mmScale) - Math.max(2.2, f.r * mmScale) - 4;
      // The skate-park square pokes off the canvas's right edge (it sits west
      // of the mapped region), so clamp its label onto the visible square.
      if (f.kind === 'park') {
        lx = Math.max(8, Math.min(148, lx));
        lz = Math.max(6, Math.min(150, lz));
      }
      if (lx < 8 || lx > 152 || lz < 6 || lz > 154) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(f.label, lx + 0.6, lz + 0.6);
      ctx.fillStyle = f.color;
      ctx.fillText(f.label, lx, lz);
    }
  }

  

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
  // minimap and the touch joystick; they come back when you unpause. Ignored
  // while the car-showroom screen is open (the game is already paused).
  if (event.code === 'Space' && !selectMode) {
    event.preventDefault();
    setPaused(!isPaused);
  }
  // Car-showroom keys (gear screen): ←/→ carousel the cars, Enter drives the
  // car on show (returns to the game), Esc backs out without changing.
  if (selectMode) {
    if (event.code === 'ArrowLeft') { event.preventDefault(); cycleCar(-1); }
    else if (event.code === 'ArrowRight') { event.preventDefault(); cycleCar(1); }
    else if (event.code === 'Enter') { event.preventDefault(); exitSelectMode(true); }
    else if (event.code === 'Escape') { event.preventDefault(); exitSelectMode(false); }
  }
  // H: car horn. Also makes the Holy Mountain shrine react (idea #24).
  if (event.code === 'KeyH') {
    playHorn();
    if (undergroundWorld.holy && undergroundWorld.holy.honk) undergroundWorld.holy.honk();
  }
  // U: instant teleport into the underground (no mine-dive, no spiral arrival).
  // event.code is the physical key, so Shift/case doesn't matter. Park the car
  // at the tunnel foot and hand control back immediately.
  if (event.code === 'KeyU') {
    if (worldState !== 'underground') {
      enterUndergroundWorld();
      if (spiralCine.active) finishSpiralCine();
    }
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

// ===== Settings menu (gear icon, top-left) =====
// A gear button in the top-left opens the settings panel — currently a single
// "change car" setting that leads to a car picker. Picking a car swaps the
// player's mesh in place: `car` keeps its transform and its scene parenting
// (survives the enter*World world switches), only the visible children change.
// Every traffic-car body is available plus the little car; playing as the
// steamroller lets you smash traffic (see the traffic collision code below).
const CAR_KINDS = [
  { id: 'classic', label: 'Crankshaft', color: '#a61e1e', scale: 1, build: () => createCar(0xa61e1e) },
  { id: 'city', label: 'City Car', color: '#33415c', scale: 1, build: () => createCar(0x33415c) },
  { id: 'bug', label: 'VW Bug', color: '#2d6a4f', scale: 1, build: () => createVWBug(0x2d6a4f) },
  { id: 'taxi', label: "'57 Taxi", color: '#f5c518', scale: 1, build: () => createChevy57Taxi() },
  { id: 'little', label: 'Rampy', color: '#1e7ea6', scale: 0.55, build: () => createLittleCar(0x1e7ea6) },
  // A purple lifted monster truck — huge knobby tires. Drives over traffic and
  // squashes it flat exactly like the steamroller (it shares the same heavy
  // crush path), and an AI copy patrols the ramp world taking huge ramp jumps.
  { id: 'monstertruck', label: 'Monster Truck', color: '#7b2fbf', scale: 1, build: () => createMonsterTruck() },
  // A kid on a skateboard. `faceZ` tells the swap code the model's front is +Z
  // (like the robot) so it's quarter-turned onto the cars' -X forward axis.
  // `show` bumps it up a touch in the showroom since the figure is small.
  { id: 'skateboarder', label: 'Skater', color: '#d05a3a', scale: 1, faceZ: true, show: 1.5, build: () => createSkateboarder() },
  // The raccoon hot rod — a little red rod with a raccoon driver, engine rumble
  // and fire-spitting tailpipes (animated in the frame loop via
  // `car.userData.effects`). Builds -X-facing like the other cars, so NO faceZ.
  { id: 'hotrod', label: 'Hot Rod', color: '#c7362b', scale: 1, build: () => createRaccoonHotRod() },
  // The freight-train locomotive from train.js — the same 1869 steamer that
  // pulls the NPC consist around the city's rail loop. It faces +Z (like the
  // robot/skater), so `faceZ` quarter-turns it onto the cars' -X forward.
  { id: 'train', label: 'Train', color: '#2c323d', scale: 1, faceZ: true, build: () => makeLocomotive() },
  { id: 'bus', label: 'School Bus', color: '#f5a623', scale: 1, build: () => createSchoolBus() },
  // An open-wheel Indy racer that tops out 1.5× faster than every other car
  // (see the pedals below).
  { id: 'indy', label: 'Indy 500', color: '#1f5af5', scale: 1, build: () => createIndyCar() },
  { id: 'steamroller', label: 'Steamroller', color: '#f2b705', scale: 1, build: () => createSteamroller() },
  // The drivable giant robot. `show` is an extra showroom shrink so its full
  // 15-tall body fits on the stage; when driven it's the same height (14-ish),
  // stomping along on the car's ground pivot with its legs swinging.
  { id: 'robot', label: 'Giant Robot', color: '#9aa3ad', scale: 1, show: 0.42, build: () => buildRobotModel() },
  // The giant tarantula — a lurching ball of fur with eight striding legs and
  // two hot red eyes. Faces +Z like the robot, so `faceZ` quarter-turns it
  // onto the cars' -X forward axis; `show` shrinks it for the showroom stage.
  { id: 'tarantula', label: 'Giant Tarantula', color: '#3a2c1c', scale: 2.5, faceZ: true, show: 0.3, build: () => makeTarantula() },
];
let playerCarKind = CAR_KINDS[0].id;
// Gear screen: which tab is on show ('player' swaps your ride, 'chase' swaps
// the car that hounds you). The chase defaults to the little blue utility car
// — same as the original AI chaser — but you can hand it ANY ride from the
// list, giant tarantula included.
let pickerTab = 'player';
let chaseCarKind = 'little';
// Each tab remembers its own armed-but-not-committed pick, so previewing a car
// on one screen and hopping to the other never discards (or commits) it.
let playerPreview = CAR_KINDS[0].id;
let chasePreview = chaseCarKind;
let playerSteamroller = false;
let playerRobot = false;
let playerMonster = false;
let playerIndy = false;
let playerTrain = false;
let playerTarantula = false;
// Stride phase + walk updater for the giant tarantula (its 8 legs scissor in
// an alternating diagonal gait instead of spinning wheels).
let playerTarantulaPhase = 0;
function updatePlayerTarantulaWalk(delta, speed) {
  if (!car.userData.robotAnim) return;
  playerTarantulaPhase += delta * (0.6 + Math.abs(speed) * 1.6);
  const t = THREE.MathUtils.clamp(Math.abs(speed) / 1.2, 0, 1);
  const s = Math.sin(playerTarantulaPhase) * 0.5 * (0.25 + t * 0.75);  // trembles a touch at rest
  const a = car.userData.robotAnim;
  if (a && a.legs) {
    const A = [0, 3, 4, 7];   // front-left + the two cross-diagonals move together
    for (let i = 0; i < a.legs.length; i++) {
      const drive = (A.indexOf(i) >= 0 ? 1 : -1) * s
        + 0.06 * Math.sin(playerTarantulaPhase * 1.7 + i * 1.4);
      a.legs[i].rotation.y = drive;
    }
  }
}
// The drivable locomotive's trailing freight consist — copies of the exact
// cars that trail the circling NPC train (boxcars, hoppers, gondolas,
// tankers, flatcars, autorack, well car, reefer, coil car, stock car,
// caboose). They follow wherever you drive and never collide.
let trainCars = [];
let selectMode = false;
let selectWasPaused = false;
let selectPreview = CAR_KINDS[0].id;

// Leg/arm swing for the drivable robot, driven by how fast you're moving.
// Phase only advances with speed so the mech stands perfectly still at rest.
let playerRobotPhase = 0;
function updatePlayerRobotWalk(delta, speed) {
  if (!car.userData.robotAnim) return;
  playerRobotPhase += delta * (0.5 + Math.abs(speed) * 1.15);
  const t = THREE.MathUtils.clamp(Math.abs(speed) / 1.2, 0, 1);   // 0 at rest → 1 at a jog
  const swing = Math.sin(playerRobotPhase) * 0.62 * t;
  const a = car.userData.robotAnim;
  a.legL.rotation.x = swing;
  a.legR.rotation.x = -swing;
  a.armL.rotation.x = -swing * 0.55;
  a.armR.rotation.x = swing * 0.55;
}

// Swap the chasing car's visible body for any picker car, same way swapPlayerCar
// dresses the player ride: children go into an inner group scaled to the pick,
// and the frame loop keeps driving bumperCar's position/rotation as usual. The
// outer scale stays 1 — the tiny blue sedan it originally packed got folded
// into the 'little' pick — so respawnBumper's reset never mis-sizes the swap.
function applyChaseCar(kind) {
  const entry = CAR_KINDS.find((k) => k.id === kind);
  if (!entry) return;
  const newMesh = entry.build();
  const inner = new THREE.Group();
  if (entry.scale !== 1) inner.scale.setScalar(entry.scale);
  while (newMesh.children.length > 0) inner.add(newMesh.children[0]);
  if (entry.faceZ) inner.rotation.y = -Math.PI / 2;
  while (bumperCar.children.length > 0) bumperCar.remove(bumperCar.children[0]);
  bumperCar.add(inner);
  bumperCar.scale.set(1, 1, 1);
  chaseCarKind = kind;
  // A chase train must be the WHOLE train — the locomotive plus its trailing
  // freight consist. Any other chaser drops its own consist.
  if (kind === 'train') spawnChaseTrainConsist();
  else clearChaseTrainConsist();
}

// Swap the player's visible body for one of the picker cars. The model's
// children move into a small wrapper group scaled to the car's intended size —
// the frame loop owns the outer `car.scale` (flat / taffy squash), so the
// "little car" stays little via the inner group instead.
function swapPlayerCar(kind) {
  const entry = CAR_KINDS.find((k) => k.id === kind);
  if (!entry) return;
  const newMesh = entry.build();
  const inner = new THREE.Group();
  if (entry.scale !== 1) inner.scale.setScalar(entry.scale);
  while (newMesh.children.length > 0) inner.add(newMesh.children[0]);
  const isRobot = kind === 'robot';
  // The robot and the skateboarder models face +Z; the cars' forward is -X,
  // so quarter-turn the model onto the axis you actually drive along.
  if (isRobot || entry.faceZ) inner.rotation.y = -Math.PI / 2;
  if (isRobot) {
    // The mech just stomps — the frame loop animates its legs through the
    // userData refs instead of spinning wheels.
    car.userData.robotAnim = newMesh.userData;
    car.userData.wheels = [];
    car.userData.wheelPivots = [];
    car.userData.effects = null;
  } else {
    car.userData.robotAnim = null;
    car.userData.wheels = newMesh.userData.wheels;
    // Not every model steers (the train has no wheelPivots) — empty is fine.
    car.userData.wheelPivots = newMesh.userData.wheelPivots || [];
    // Only the hot rod ships an effects rig (rumbling engine + exhaust flame
    // pops) — everything else animates wheels and steers.
    car.userData.effects = newMesh.userData.effects || null;
  }
  // Playing as the giant tarantula: store its leg pivots in the same slot the
  // robot uses (nothing else references robotAnim there), so the frame loop
  // can stride its legs rather than spin wheels.
  if (kind === 'tarantula') car.userData.robotAnim = newMesh.userData;
  while (car.children.length > 0) car.remove(car.children[0]);
  car.add(inner);
  playerCarKind = kind;
  // The monster truck shares the steamroller's heavy crush path (drives over
  // traffic, squashes it flat, traffic doesn't brake for it).
  playerSteamroller = kind === 'steamroller' || kind === 'monstertruck';
  playerMonster = kind === 'monstertruck';
  playerIndy = kind === 'indy';
  playerRobot = isRobot;
  playerTarantula = kind === 'tarantula';
  // The locomotive pulls its freight consist along; any other ride packs the
  // cars away.
  if (playerTrain && kind !== 'train') {
    removeTrainCars();
    playerTrain = false;
  } else if (kind === 'train' && !playerTrain) {
    spawnTrainCars();
    playerTrain = true;
  }
  if (isRobot) car.scale.set(1, 1, 1);   // no taffy/flat squash
  // Riding as the skater (or the robot) — a person can't be a flattened car, so
  // clear any pancake left over from the ride you just swapped out of.
  if (isRobot || kind === 'skateboarder') flatCarState = createFlatCarState(false);
}

// ===== Drivable locomotive — trailing freight consist =====
// When you drive the train you drag a copy of the NPC freight train's cars
// behind you: 15 units chaining off the locomotive's rear, each chasing a
// point `SPACING` units behind the one ahead (wrapped deltas keep the whole
// consist following across the map seam). They're cosmetic — they never
// collide, and they ride whatever surface the player is on in the current
// world.
// The surface a freeride freight car rides. `state` is the WORLD the consist
// itself sits in (not always the player's — the chase consist is keyed to the
// bumper car's world via bumperInRamp). City: mirror the player's own surface
// — the ramp slope when the consist is ON a board/wedge ramp (the giant mega
// ramp), the street otherwise, and any rooftop the chain drives across.
// `probeY` is the LOCOMOTIVE's height: a trailing car's own height is still
// at street level when it reaches the board's base (it hasn't caught up yet),
// and probing with that low value trips the mega ramp's "under the plank"
// gate, dumping every car back to the street instead of riding up. Ship the
// loco's height so the WHOLE consist commits to the board the moment the
// locomotive does.
function trainCarY(x, z, probeY, state) {
  if (state === 'ramp') return Math.max(terrainHeightAt(x, z) + groundHeight, rampRampSurfaceY(x, z));
  if (state === 'underground') return car.position.y;   // hover beside the loco
  return Math.max(rampSurfaceY(x, z, probeY), buildingTopAt(x, z));
}

function spawnTrainCars() {
  if (trainCars.length) return;
  const fwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
  fwd.y = 0;
  fwd.normalize();
  // The freight models are long along +Z, and the chain heads back toward
  // the loco (dir = fwd), so point each car's +Z nose along `fwd`.
  const yaw = Math.atan2(fwd.x, fwd.z);
  let bx = car.position.x;
  let bz = car.position.z;
  const parent = worldState === 'ramp' ? rampScene : worldState === 'underground' ? undergroundScene : scene;
  for (const mesh of buildFreightCars()) {
    mesh.position.set(bx - fwd.x * SPACING, trainCarY(bx - fwd.x * SPACING, bz - fwd.z * SPACING, car.position.y, worldState), bz - fwd.z * SPACING);
    mesh.rotation.y = yaw;
    const rig = new THREE.Group();
    mesh.add(rig);
    mesh.userData.wobble = { t: Infinity, axis: new THREE.Vector3(1, 0, 0), dir: new THREE.Vector3(1, 0, 0), rig, tiltQ: new THREE.Quaternion(), pitch: 0, fallVy: 0 };
    parent.add(mesh);
    trainCars.push(mesh);
    bx -= fwd.x * SPACING;
    bz -= fwd.z * SPACING;
  }
}

function removeTrainCars() {
  for (const mesh of trainCars) {
    scene.remove(mesh);
    rampScene.remove(mesh);
    undergroundScene.remove(mesh);
  }
  trainCars = [];
}

// When the player portals between worlds, move the trailing consist into the
// scene the car just entered so it follows there.
function reparentTrainCars() {
  if (!trainCars.length) return;
  const parent = worldState === 'ramp' ? rampScene : worldState === 'underground' ? undergroundScene : scene;
  for (const mesh of trainCars) {
    if (mesh.parent && mesh.parent !== parent) mesh.parent.remove(mesh);
    if (mesh.parent !== parent) parent.add(mesh);
  }
}

// Shared freeride chain: every car in `cars` chases a point `SPACING` behind
// the one ahead (wrapped deltas keep it following across the map seam), rolls
// its wheels, and points its +Z nose along the chain. Heights are NOT owned
// here — rideConsistSurfaces() gives every car gravity + surfaces so it falls
// and lands exactly like the player car (see the bump/ride/tilt block below).
function stepConsist(cars, leadX, leadZ, leadY, delta) {
  let prevX = leadX;
  let prevZ = leadZ;
  for (let i = 0; i < cars.length; i++) {
    const mesh = cars[i];
    // Delta from the point ahead, shortest way around the wrap seam.
    let dx = wrappedDeltaX(prevX, mesh.position.x);
    let dz = wrappedDeltaZ(prevZ, mesh.position.z);
    const d = Math.hypot(dx, dz);
    let step = 0;
    if (d >= SPACING) {
      // Chase the point ahead: faster when stretched, gentle when close.
      step = Math.min(d - SPACING, Math.max(4 * delta, d * 2.6 * delta));
    }
    if (step > 0) {
      dx /= d;
      dz /= d;
      // Pull back toward the point ahead (`-dx/step` closes the gap).
      mesh.position.x = wrapCoordX(mesh.position.x - dx * step);
      mesh.position.z = wrapCoordZ(mesh.position.z - dz * step);
      // Point the car's +Z nose along the chain toward the point ahead
      // (-dx, -dz): R_y(yaw)·(0,0,1) = (sin yaw, cos yaw) must equal it.
      const targetYaw = Math.atan2(-dx, -dz);
      let dy = targetYaw - mesh.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      mesh.rotation.y += dy * Math.min(1, 5 * delta);
      // Roll the car's wheels; the freight wheels have radius 0.5.
      const roll = step / 0.5;
      for (const w of mesh.userData.wheels) w.rotation.y += roll;
    }
    prevX = mesh.position.x;
    prevZ = mesh.position.z;
  }
}

function updateTrainCars(delta) {
  if (!playerTrain || trainCars.length === 0) return;
  stepConsist(trainCars, car.position.x, car.position.z, car.position.y, delta);
  // The player bumps the trailing cars into a wobble, just like on the tracks.
  bumpConsistWith(CONSIST_THREAT, trainCars);
  for (const mesh of trainCars) tickConsistWobble(mesh, delta);
  rideConsistSurfaces(trainCars, car.position.y, delta, worldState);
  tiltConsistCars(trainCars, car.position.y, worldState);
}

// When the CHASE ride is the locomotive, it drags the identical 15-car freight
// consist behind it too — so a full train hounds you through the city and the
// ramp world. Cosmetic like the player's consist; the bumper's collider stays
// just the locomotive.
let chaseTrainCars = [];
function spawnChaseTrainConsist() {
  clearChaseTrainConsist();
  const ry = bumperCar.rotation.y;
  const fwd = new THREE.Vector3(-Math.cos(ry), 0, Math.sin(ry));   // -X nose
  const yaw = Math.atan2(fwd.x, fwd.z);
  let bx = bumperCar.position.x;
  let bz = bumperCar.position.z;
  const parent = bumperInRamp ? rampScene : scene;
  for (const mesh of buildFreightCars()) {
    mesh.position.set(bx - fwd.x * SPACING, trainCarY(bx - fwd.x * SPACING, bz - fwd.z * SPACING, bumperCar.position.y, bumperInRamp ? 'ramp' : 'city'), bz - fwd.z * SPACING);
    mesh.rotation.y = yaw;
    const rig = new THREE.Group();
    mesh.add(rig);
    mesh.userData.wobble = { t: Infinity, axis: new THREE.Vector3(1, 0, 0), dir: new THREE.Vector3(1, 0, 0), rig, tiltQ: new THREE.Quaternion(), pitch: 0, fallVy: 0 };
    parent.add(mesh);
    chaseTrainCars.push(mesh);
    bx -= fwd.x * SPACING;
    bz -= fwd.z * SPACING;
  }
}

function clearChaseTrainConsist() {
  for (const mesh of chaseTrainCars) {
    scene.remove(mesh);
    rampScene.remove(mesh);
  }
  chaseTrainCars = [];
}

// Keep the chase consist in the same world as the bumper car.
function reparentChaseTrainConsist() {
  if (!chaseTrainCars.length) return;
  const parent = bumperInRamp ? rampScene : scene;
  for (const mesh of chaseTrainCars) {
    if (mesh.parent && mesh.parent !== parent) mesh.parent.remove(mesh);
    if (mesh.parent !== parent) parent.add(mesh);
  }
}

function updateChaseTrainCars(delta) {
  if (chaseTrainCars.length === 0) return;
  stepConsist(chaseTrainCars, bumperCar.position.x, bumperCar.position.z, bumperCar.position.y, delta);
  bumpConsistWith(CONSIST_THREAT, chaseTrainCars);
  for (const mesh of chaseTrainCars) tickConsistWobble(mesh, delta);
  rideConsistSurfaces(chaseTrainCars, bumperCar.position.y, delta, bumperInRamp ? 'ramp' : 'city');
  tiltConsistCars(chaseTrainCars, bumperCar.position.y, bumperInRamp ? 'ramp' : 'city');
}

// Running into a freeride consist rock the cars exactly like the NPC train's
// cars do on the tracks: the hit car tilts around a horizontal axis facing
// the shove and eases back to upright, and the player car is bounced out of
// the car body. Kept cosmetic — the chain still follows the locomotive.
const CONSIST_R = 1.7;   // per-car collision radius (train.js UNIT_R)
const CONSIST_UP = new THREE.Vector3(0, 1, 0);
const CONSIST_THREAT = { p: car, r: playerCarRadius };
function bumpConsistWith(threat, cars) {
  for (const mesh of cars) {
    const w = mesh.userData.wobble;
    if (!w) continue;
    if (Math.abs(threat.p.position.y - mesh.position.y) > 6) continue;
    const dx = wrappedDeltaX(mesh.position.x, threat.p.position.x);
    const dz = wrappedDeltaZ(mesh.position.z, threat.p.position.z);
    const min = threat.r + CONSIST_R;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2) || 0.001;
    const nx = dx / d, nz = dz / d;      // mesh -> threat
    w.t = 0;
    w.dir.set(-nx, 0, -nz);              // the car shoves away from the hit
    w.axis.crossVectors(CONSIST_UP, w.dir);
    if (w.axis.lengthSq() < 1e-4) w.axis.set(1, 0, 0);
    w.axis.normalize();
    // Bounce the player car out of the car body, like a real solid train.
    threat.p.position.x += nx * (min - d);
    threat.p.position.z += nz * (min - d);
  }
}
// One wobble tick: rock the tilt rig around the hit axis, easing back to
// level. The rock lives on a child rig so it never fights the chain steering
// (which owns the car's rotation.y / position via stepConsist).
function tickConsistWobble(mesh, delta) {
  const w = mesh.userData.wobble;
  if (!w || w.t >= 1e9) return;
  w.t += delta;
  const decay = Math.exp(-3 * w.t);
  if (decay < 0.02) {
    w.t = Infinity;
    w.tiltQ.identity();
    return;
  }
  const tilt = Math.sin(w.t * 9) * 0.6 * decay;
  w.tiltQ.setFromAxisAngle(w.axis, tilt);
  mesh.position.x += w.dir.x * 0.3 * decay;
  mesh.position.z += w.dir.z * 0.3 * decay;
}

// Ride the ground/ramp/rooftop like the player does instead of snapping Y to
// a surface: while a trailing car is above its floor it falls with real
// gravity and only lands once it actually reaches the ground. Driving off the
// top of the mega ramp therefore arcs every car off the edge and down after
// the locomotive, just like the player's own airborne physics. `leadY` is the
// locomotive's height, which board ramps probe with (the whole consist commits
// to a plank the moment the loco does).
const CONSIST_GROUND_EPS = 0.05;
function rideConsistSurfaces(cars, leadY, delta, state) {
  for (const mesh of cars) {
    const w = mesh.userData.wobble;
    if (!w) continue;
    const surf = trainCarY(mesh.position.x, mesh.position.z, leadY, state);
    w.surf = surf;
    if (mesh.position.y <= surf + CONSIST_GROUND_EPS) {
      mesh.position.y = surf;
      w.fallVy = 0;
      w.grounded = true;
    } else {
      w.fallVy -= gravity * delta;
      w.grounded = false;
      mesh.position.y += w.fallVy * delta;
      if (mesh.position.y <= surf) {
        const impact = Math.abs(w.fallVy);
        w.fallVy = 0;
        mesh.position.y = surf;
        w.grounded = true;
        // A hard drop lands with a small rock, like the player's thud.
        if (impact > 6) {
          w.t = 0;
          w.dir.set(0, 0, 1);
          w.axis.crossVectors(CONSIST_UP, w.dir).normalize();
        }
      }
    }
  }
}

// Pitch each trailing car to its local surface slope (the mega ramp's ~40°
// climb tips the freight up to match), eased the same weighty 0.28 the player
// uses. The pitch lives on the SAME tilt rig as the knock wobble: the final
// rig pose is pitch ⊗ wobble, so a knock can't fight the climbing attitude
// and vice versa. Airborne cars level out, like the player does.
const CONSIST_PITCH_STEP = 1.5;       // nose/rail sample distance for the slope
const CONSIST_PITCH_LERP = 0.28;      // matches the player's ramp-body attitude rate
const _consistPitchQ = new THREE.Quaternion();
function tiltConsistCars(cars, leadY, state) {
  for (const mesh of cars) {
    const w = mesh.userData.wobble;
    if (!w) continue;
    let target = 0;
    if (w.grounded) {
      const yaw = mesh.rotation.y;
      const sn = Math.sin(yaw) * CONSIST_PITCH_STEP;
      const cs = Math.cos(yaw) * CONSIST_PITCH_STEP;
      const fh = trainCarY(mesh.position.x + sn, mesh.position.z + cs, leadY, state);
      const rh = trainCarY(mesh.position.x - sn, mesh.position.z - cs, leadY, state);
      target = -Math.atan2(fh - rh, CONSIST_PITCH_STEP * 2);
    }
    w.pitch += (target - w.pitch) * CONSIST_PITCH_LERP;
    _consistPitchQ.setFromEuler(new THREE.Euler(w.pitch, 0, 0));
    w.rig.quaternion.copy(_consistPitchQ).multiply(w.tiltQ);
  }
}

// ===== Car showroom (gear icon, top-left) =====
// Clicking the gear pauses the game and drops you onto a black sound stage: a
// dedicated scene renders your current car alone, spinning slowly over a blue
// glow on the main canvas (the pause already hides the minimap + joystick).
// The side arrows carousel the cars; clicking the spinning car drives that car
// and returns to the game immediately. While the showroom is up the gear icon
// turns into a return arrow — it exits without changing your ride. The car
// swap keeps `car`'s transform and scene parenting (it survives the enter*World
// switches), only the visible children change. Playing as the steamroller lets
// you smash traffic (see the traffic collision code below).
let selectScene = null;
let selectCamera = null;
let selectCarGroup = null;
let selectLastNow = 0;
// Showroom display scale — the on-screen car is half the size it would fill
// the frame at, leaving generous dark space around it on the stage.
const SELECT_CAR_SHOW_SCALE = 0.5;

// Radial blue-haze texture for the showroom stage: bright at the centre and
// fading to fully transparent, so the glow melts away instead of ending at a
// hard disc edge.
function makeGlowTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(150, 210, 255, 0.85)');
  grad.addColorStop(0.3, 'rgba(80, 160, 255, 0.45)');
  grad.addColorStop(0.6, 'rgba(40, 100, 235, 0.16)');
  grad.addColorStop(1, 'rgba(25, 60, 160, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function buildSelectScene() {
  selectScene = new THREE.Scene();
  selectScene.background = new THREE.Color(0x020407);
  selectCamera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
  selectCamera.position.set(0, 2.4, 10.5);
  selectCamera.lookAt(0, 0.95, 0);

  // Soft haze under the car: one wide additive-bright plane whose texture
  // fades out at the edges. Bigger and further from the car than a hard disc,
  // so there's breathing room all around.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  selectScene.add(glow);

  selectScene.add(new THREE.HemisphereLight(0xffffff, 0x102040, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(3, 6, 4);
  selectScene.add(key);
  const rim = new THREE.DirectionalLight(0x4aa8ff, 0.55);
  rim.position.set(-3.5, 3, -4);
  selectScene.add(rim);
  const back = new THREE.DirectionalLight(0x7ef9ff, 0.35);
  back.position.set(0, 2.5, -5);
  selectScene.add(back);
}

function refreshSelectCar(kind) {
  if (selectCarGroup) selectScene.remove(selectCarGroup);
  const entry = CAR_KINDS.find((k) => k.id === kind);
  if (!entry) return;
  const model = entry.build();
  const inner = new THREE.Group();
  // Show cars at half size on the showroom stage so they sit small within the
  // glow instead of filling the frame (the little car scales too). The robot's
  // `show` shrinks it even further — its full 15 units would tower over the
  // stage framing.
  inner.scale.setScalar(entry.scale * SELECT_CAR_SHOW_SCALE * (entry.show || 1));
  while (model.children.length > 0) inner.add(model.children[0]);
  selectCarGroup = inner;
  selectScene.add(inner);
  selectPreview = kind;
  // The arrows arm the tab you're on; the other tab's arm is left alone.
  if (pickerTab === 'chase') chasePreview = kind;
  else playerPreview = kind;
  if (carHintEl) carHintEl.textContent = entry.label;
}

function enterSelectMode() {
  if (selectMode || selectScene === null) return;
  selectWasPaused = isPaused;
  selectLastNow = performance.now();
  refreshSelectCar(pickerTab === 'chase' ? chasePreview : playerPreview);
  selectMode = true;
  document.body.classList.add('select-mode');
  gearBtn.textContent = '←';
  gearBtn.title = 'Back to the game';
  setPaused(true);   // hides the minimap + joystick and freezes the world
}

function exitSelectMode(apply) {
  if (!selectMode) return;
  selectMode = false;
  document.body.classList.remove('select-mode');
  gearBtn.textContent = '⚙';
  gearBtn.title = 'Settings';
  // Committing applies BOTH arms — the player ride you picked and the chaser
  // you picked, on whichever tab — so a click / Enter drives every choice home
  // at once. Only the ← Back button (or Esc) returns without changing anything.
  if (apply) {
    if (playerPreview !== playerCarKind) {
      swapPlayerCar(playerPreview);
      playHorn();   // audibly confirm the new ride
    }
    if (chasePreview !== chaseCarKind) {
      applyChaseCar(chasePreview);
      playHorn();   // audibly confirm the new chaser
    }
  }
  setPaused(selectWasPaused);
}

function cycleCar(dir) {
  const i = CAR_KINDS.findIndex((k) => k.id === selectPreview);
  refreshSelectCar(CAR_KINDS[(i + dir + CAR_KINDS.length) % CAR_KINDS.length].id);
}

// Switch the showroom to the PLAYER or CHASE tab — the carousel now spins and
// applies whichever kind the active tab is allowed to change.
function setPickerTab(tab) {
  pickerTab = tab;
  const tabEl = (id) => document.getElementById(id);
  const pt = tabEl('tab-player');
  const ct = tabEl('tab-chase');
  if (pt) pt.classList.toggle('active', tab === 'player');
  if (ct) ct.classList.toggle('active', tab === 'chase');
  // Restore that tab's own armed preview — the other one is left untouched.
  refreshSelectCar(tab === 'chase' ? chasePreview : playerPreview);
}

function updateSelectCar() {
  if (!selectMode || !selectCarGroup) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - selectLastNow) / 1000) || 0;
  selectLastNow = now;
  if (selectCamera.aspect !== window.innerWidth / window.innerHeight) {
    selectCamera.aspect = window.innerWidth / window.innerHeight;
    selectCamera.updateProjectionMatrix();
  }
  selectCarGroup.rotation.y += dt * 0.55;   // slow spin
}

buildSelectScene();
const gearBtn = document.getElementById('gear-btn');
if (gearBtn) gearBtn.addEventListener('click', () => (selectMode ? exitSelectMode(false) : enterSelectMode()));
const carHintEl = document.getElementById('car-hint');
const carPrevBtn = document.getElementById('car-prev');
if (carPrevBtn) carPrevBtn.addEventListener('click', () => cycleCar(-1));
const carNextBtn = document.getElementById('car-next');
if (carNextBtn) carNextBtn.addEventListener('click', () => cycleCar(1));
const tabPlayerBtn = document.getElementById('tab-player');
if (tabPlayerBtn) tabPlayerBtn.addEventListener('click', () => setPickerTab('player'));
const tabChaseBtn = document.getElementById('tab-chase');
if (tabChaseBtn) tabChaseBtn.addEventListener('click', () => setPickerTab('chase'));

// The chase defaults to the little blue car, so dress the chaser right away.
applyChaseCar(chaseCarKind);

// Clicking the spinning car itself drives it and returns to the game. Clicks
// on the arrow buttons / gear are handled above and ignored here.
const selectRay = new THREE.Raycaster();
const selectNdc = new THREE.Vector2();
window.addEventListener('pointerdown', (e) => {
  if (!selectMode) return;
  if (e.target && e.target.closest && e.target.closest('#gear-btn,button')) return;
  selectNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
  selectNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  selectRay.setFromCamera(selectNdc, selectCamera);
  if (selectCarGroup && selectRay.intersectObject(selectCarGroup, true).length > 0) {
    exitSelectMode(true);
  }
});

// Scroll-wheel camera zoom: wheel up zooms in, wheel down zooms out. Works
// paused or not, so you can zoom in on the action for a screenshot. On touch
// screens the two-finger pinch below drives the same cameraOrbit.radius.
const CAM_ZOOM_MIN = 4;
const CAM_ZOOM_MAX = 85;
window.addEventListener('wheel', (event) => {
  event.preventDefault();
  cameraManualTimer = CAMERA_MANUAL_HOLD;
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
  reparentChaseTrainConsist();
  bumperKnock = null;
  bumperState.stopped = false;
  bumperCar.visible = true;
  bumperCar.scale.set(1, 1, 1);
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
    knockAt(bumperCar.position, aiKnockRadius, 0, 0, bumperState.speed);
  }
  // Ride the terrain like a real car.
  bumperCar.position.y = terrainHeightAt(bumperCar.position.x, bumperCar.position.z) + groundHeight;
}

// ===== Wild monster truck in the ramp world =====
// A second ramp-world visitor: a huge purple monster truck that roams a loop
// of waypoints at full throttle, wiping out the launch ramps and the velodrome
// rim so it sails enormous jumps. It does NOT chase, it never knocks props
// over (knockAt is deliberately never called), but driving over the player
// squashes them flat — the same pancake the city steamroller gives out.
const MONSTER_WAYPOINTS = [
  { x: 30, z: -70 }, { x: 64, z: -45 }, { x: 82, z: -10 }, { x: 66, z: 32 },
  { x: 40, z: 82 }, { x: -2, z: 106 }, { x: -45, z: 86 }, { x: -78, z: 52 },
  { x: -70, z: 6 }, { x: -55, z: -46 },
];

// The ramp guardian's scramble trail reuses the monster truck's patrol loop.
rampTarantula.waypoints = MONSTER_WAYPOINTS;

function summonMonsterToRamp() {
  if (monsterTruck === null) monsterTruck = createMonsterTruck();
  monsterTruck.visible = true;
  monsterTruck.scale.set(1, 1, 1);
  rampScene.add(monsterTruck);
  monsterInRamp = true;
  monsterAir = false;
  monsterVy = 0;
  monsterWasRamp = null;
  // Roam starts at the first waypoint that is far from the player.
  let best = 0, bestDist = -1;
  for (let i = 0; i < MONSTER_WAYPOINTS.length; i++) {
    const w = MONSTER_WAYPOINTS[i];
    const d = Math.hypot(w.x - car.position.x, w.z - car.position.z);
    if (d > bestDist) { bestDist = d; best = i; }
  }
  monsterPatrol = best;
  const wp = MONSTER_WAYPOINTS[best];
  const tx = wp.x - 10, tz = wp.z - 10;
  const y = terrainHeightAt(tx, tz) + groundHeight;
  monsterTruck.position.set(tx, y, tz);
  const dx = wp.x - tx, dz = wp.z - tz;
  monsterTruck.rotation.set(0, Math.atan2(dz, -dx), 0);
}

function updateRampWorldMonster(delta) {
  if (worldState !== 'ramp') return;
  // Countdown before the truck shows up.
  if (!monsterInRamp) {
    monsterRampTimer -= delta;
    if (monsterRampTimer <= 0) summonMonsterToRamp();
    return;
  }
  const mt = monsterTruck;
  // Forward = (-cosθ, sinθ); rebuild from the current heading each frame so
  // mid-air drifts along the last direction.
  const yaw = mt.rotation.y;
  const fwdX = -Math.cos(yaw);
  const fwdZ = Math.sin(yaw);

  if (monsterAir) {
    // Ballistic: fall under gravity, land on terrain or a ramp top.
    monsterVy -= gravity * delta;
    mt.position.y += monsterVy * delta;
    const rGround = terrainHeightAt(mt.position.x, mt.position.z) + groundHeight;
    const info = rampRampInfoAt(mt.position.x, mt.position.z);
    const rSurf = info ? info.baseY + info.height * info.s : -Infinity;
    if (mt.position.y <= Math.max(rGround, rSurf)) {
      mt.position.y = Math.max(rGround, rSurf);
      monsterVy = 0;
      monsterAir = false;
      monsterWasRamp = null;
      shake.intensity = Math.max(shake.intensity, 0.18);
    }
    // Ease level in the air.
    mt.rotation.x += (0 - mt.rotation.x) * Math.min(1, 2 * delta);
  } else {
    // Steer toward the current waypoint at full throttle.
    const wp = MONSTER_WAYPOINTS[monsterPatrol];
    let dx = wp.x - mt.position.x;
    let dz = wp.z - mt.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 10) monsterPatrol = (monsterPatrol + 1) % MONSTER_WAYPOINTS.length;
    dx = wp.x - mt.position.x;
    dz = wp.z - mt.position.z;
    const dd = Math.hypot(dx, dz) || 1;
    const step = Math.min(MONSTER_SPEED * delta, dd);
    mt.position.x += (dx / dd) * step;
    mt.position.z += (dz / dd) * step;
    const targetYaw = Math.atan2(dz / dd, -dx / dd);
    let dy = targetYaw - yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    mt.rotation.y += dy * Math.min(1, 2.4 * delta);

    // Ramps: ride the ramp surf, launch off the high edge (the real fun part).
    const info = rampRampInfoAt(mt.position.x, mt.position.z);
    if (info) {
      mt.position.y = info.baseY + info.height * info.s;
      monsterWasRamp = { runX: info.runX, runZ: info.runZ, height: info.height, len: info.len, boost: info.boost };
      mt.rotation.x += (0 - mt.rotation.x) * Math.min(1, 4 * delta);
    } else {
      const launched =
        monsterWasRamp &&
        monsterWasRamp.boost > 0 &&
        (fwdX * monsterWasRamp.runX + fwdZ * monsterWasRamp.runZ) > 0.25;
      if (launched) {
        monsterAir = true;
        monsterVy = MONSTER_SPEED * (monsterWasRamp.height / monsterWasRamp.len) * monsterWasRamp.boost;
        shake.intensity = Math.max(shake.intensity, 0.12);
      } else {
        // Ride the bumpy dirt with a gentle nose-up/climb pitch like a car.
        const fx = mt.position.x + fwdX * 2.0;
        const fz = mt.position.z + fwdZ * 2.0;
        const rx = mt.position.x - fwdX * 2.0;
        const rz = mt.position.z - fwdZ * 2.0;
        const frontH = terrainHeightAt(fx, fz);
        const rearH = terrainHeightAt(rx, rz);
        mt.position.y = (frontH + rearH) * 0.5 + groundHeight;
        const pitch = -Math.atan2(frontH - rearH, 4);
        mt.rotation.x += (pitch - mt.rotation.x) * Math.min(1, 5 * delta);
        monsterWasRamp = null;
      }
    }

    // Drive over the player → a proper monster-truck flatten (same pancake as
    // the city steamroller, skipped for a player driving a heavy too). Raw
    // deltas — the truck patrols the open band and never chases a wrapped
    // copy of you.
    if (!monsterAir && !playerSteamroller && !playerKnock && !jumpState.inAir) {
      const pdx = mt.position.x - car.position.x;
      const pdz = mt.position.z - car.position.z;
      if (pdx * pdx + pdz * pdz < 4.4 * 4.4) flattenCarFromRock();
    }
  }

  // Spin the monster's knobby wheels as it rolls.
  const spin = MONSTER_SPEED * delta * 1.6;
  for (const w of mt.userData.wheels) w.rotation.y += spin;

  // Keep it inside the playable band (nudge back rather than wrap — the ramp
  // world doesn't wrap for this patrol).
  mt.position.x = Math.max(-90, Math.min(90, mt.position.x));
  mt.position.z = Math.max(-90, Math.min(122, mt.position.z));
}

// ===== Game loop =====
const clock = new THREE.Clock();

// Eased chase-camera positioning. Extracted from the frame update so it can
// keep running while the game is PAUSED — the scroll-wheel zoom and drag orbit
// stay live so you can frame a screenshot while the world holds perfectly
// still. (The shake decay doubles as a stabilizer: pause right after a jump
// and the camera settles flat for the shot.)
function updateCamera(delta) {
  cameraManualTimer = Math.max(0, cameraManualTimer - delta);

  // TEMP debug: raw car state at the START of updateCamera
  _camDbg = {
    carYStart: +car.position.y.toFixed(2),
    carZStart: +car.position.z.toFixed(2),
    mineStart: minePortal.active,
    overrideRan: false,
  };

  // Give manual framing a moment to settle, then ease back to the default
  // chase view so a stray drag or scroll cannot leave the player disoriented.
  if (cameraManualTimer <= 0) {
    const blend = 1 - Math.pow(0.018, delta * CAMERA_RETURN_SPEED);
    cameraYawOffset = THREE.MathUtils.lerp(cameraYawOffset, 0, blend);
    cameraOrbit.phi = THREE.MathUtils.lerp(cameraOrbit.phi, 1.25, blend);
    cameraOrbit.radius = THREE.MathUtils.lerp(cameraOrbit.radius, 8, blend);
  }

  // ===== Express-tube ride camera montage =====
  // The glass tube hugs the checkerboard ceiling (y≈28) over the obstacle
  // course, so the normal chase cam climbs ABOVE the rooftop tiles and ends up
  // staring at their backs — the car vanishes from view. The chase cam rides
  // the car up from the intake pad and keeps following for the first 3 seconds
  // (s ≈ 0.268; by then the car is past the giant staircase), then we cut
  // through the FIXED cameras in EXPRESS_CAM_SHOTS — positions placed a good
  // distance OFF the tube's line so the aim stays low (roughly 30-40° — never
  // aimed straight up or directly below): one ground-level tripod on the
  // course floor that pans — aim only, never move — at the little car flying
  // underneath the tiles (holding through the westbound transit), then one
  // aerial vantage hung below the ceiling that starts a bit earlier and
  // watches the dive and burst out at the exit. The exit drop arms a post-cine
  // ease for a smooth return to the chase cam.
  if (expressState.active || expressCinT > 0) {
    if (expressCinT > 0) expressCinT -= delta;
    // After a completed ride the montage holds on the landing: for a forward
    // (glass→skate) ride `lastDir` is +1 and s snaps to the far exit shot; for
    // a return ride it watches the intake drop instead.
    const s = expressState.active ? expressState.s : (expressState.lastDir > 0 ? 1 : 0.45);
    const shot = EXPRESS_CAM_SHOTS.find((sh) => s >= sh.lo && s <= sh.hi);
    if (shot) {
      camera.position.set(shot.x, shot.y, shot.z);
      _lookTarget.set(car.position.x, car.position.y + 0.8, car.position.z);
      camera.lookAt(_lookTarget);
      return;   // the fixed tube camera owns the frame — skip the chase cam
    }
  }

  // ===== Holy-chamber cinematic override =====
  // The staged drop, the pan around the man and goats, the mysterious lift
  // back up through the skylight, and a profile shot of the arc back out over
  // the cone. This cutscene owns the frame end-to-end (see updateChamberCine
  // for the car's path) — skip the chase cam entirely.
  if (chamberCine.active) {
    const M = undergroundWorld.holy.MOUNT;
    const P = chamberCine;
    const smoothp = (u) => u * u * (3 - 2 * u);
    const dur = P.phase === 'fall' ? P.fallDur : P.phase === 'pan' ? P.panDur : P.phase === 'lift' ? P.liftDur : P.flightDur;
    const e = smoothp(Math.max(0, Math.min(1, P.timer / dur)));
    if (P.phase === 'fall') {
      // Watch the car drop through the oculus, then ease down to the floor
      // where the man and goats stand.
      const az = Math.PI / 4;
      _chamberCam.set(
        M.cx + 12 * Math.cos(az),
        THREE.MathUtils.lerp(6.6, 4.6, e),
        M.cz + 12 * Math.sin(az)
      );
      _chamberLook.set(M.cx, THREE.MathUtils.lerp(19.5, 2.2, e), M.cz);
    } else if (P.phase === 'pan') {
      // A slow orbit (N/E → south) around the shrine at portrait height.
      const az = Math.PI / 4 + ((170 * Math.PI) / 180 - Math.PI / 4) * e;
      _chamberCam.set(M.cx + 11.5 * Math.cos(az), 2.6, M.cz + 11.5 * Math.sin(az));
      _chamberLook.set(M.cx, 1.9, M.cz);
    } else if (P.phase === 'lift') {
      // Low witness angle across the chamber, tilting up the shaft after the
      // rising car.
      const az = (288 * Math.PI) / 180;
      _chamberCam.set(M.cx + 13 * Math.cos(az), 1.7, M.cz + 13 * Math.sin(az));
      _chamberLook.set(M.cx, Math.max(1.4, car.position.y + 0.8), M.cz);
    } else {
      // Flight: side-on profile of the ejection, panning with the arc.
      _chamberCam.set(-55, 14, 18);
      const panT = 0.2 + 0.8 * e;
      _chamberLook.set(
        THREE.MathUtils.lerp(M.cx, car.position.x, panT),
        THREE.MathUtils.lerp(M.peakY, car.position.y, panT),
        THREE.MathUtils.lerp(M.cz, car.position.z, panT)
      );
    }
    camera.position.copy(_chamberCam);
    _lookTarget.copy(_chamberLook);
    camera.lookAt(_lookTarget);
    return;   // skip chase cam entirely — nothing else touches the camera
  }

  // ===== Spiral-tunnel arrival cinematic override =====
  // ONE fluid arc around the spiral tunnel, in the OPPOSITE direction to the
  // tunnel's own winding. A single smooth formula (ease 0→1 over the whole
  // top→exit duration) drives camera angle, radius, height and the look
  // target together — no waypoints, no mid-shot cutovers and no per-frame lag
  // to introduce bumps. It opens high over the BACK of the coil always facing
  // the tunnel, sweeps down and around (back → side → front) to the watch
  // point east of the exit — settled there facing the front mouth exactly as
  // the car bursts out toward it — and finishSpiralCine eases the camera onto
  // the car and into the chase view.
  if (spiralCine.active) {
    const t = spiralCine.timer;
    const dur = spiralCine.driveDur + spiralCine.watchDur;   // the arc spans the full car descent
    const u = Math.min(t / dur, 1);
    const ease = smooth01(u);
    const wp = spiralWatchPose();

    // Angle: from the opening pose (north-west, the back of the coil) sweep
    // the long way around to the watch point east of the exit, turning the
    // OPPOSITE way to the tube's own winding (so the camera spins the other
    // way past the Glass City corridors). Unwrap the end angle below the
    // opening angle so the sweep always turns one consistent direction.
    let endAng = wp.watchAngle;
    while (endAng > SPIRAL_PIVOT_ANG) endAng -= Math.PI * 2;
    const th = SPIRAL_PIVOT_ANG + (endAng - SPIRAL_PIVOT_ANG) * ease;
    const radius = THREE.MathUtils.lerp(SPIRAL_PIVOT_R, wp.watchRadius, ease);
    const orbitY = THREE.MathUtils.lerp(SPIRAL_START_Y, wp.watchY, ease);

    _spiralCamTarget.set(
      TUNNEL.cx + radius * Math.cos(th),
      orbitY,
      TUNNEL.cz + radius * Math.sin(th)
    );
    camera.position.copy(_spiralCamTarget);

    // Look: ALWAYS face the tunnel while spiralling — the opening glance sits
    // high over the top coil on the axis (SPIRAL_LOOK), and as the arc eases
    // the gaze slides DOWN AND ONTO THE EXIT MOUTH (tunnelPoint(1)), where the
    // car bursts out. The mouth is 21 units south of the axis — keeping the
    // gaze pinning the axis would leave the car right at the frame edge (or
    // off it entirely in a narrow vertical window). Ending dead on the mouth
    // centres the exiting car in ANY frame shape.
    const mouthP = tunnelPoint(1);
    _spiralLookTarget.set(
      THREE.MathUtils.lerp(SPIRAL_LOOK.x, mouthP.x, ease),
      THREE.MathUtils.lerp(SPIRAL_LOOK.y, SPIRAL_FOOT_Y, ease),
      THREE.MathUtils.lerp(SPIRAL_LOOK.z, mouthP.z, ease)
    );
    _lookTarget.copy(_spiralLookTarget);
    camera.lookAt(_lookTarget);

    // Gentle FOV swell mid-arc only (zero at both ends), no lens snaps.
    camera.fov = 60 + 8 * Math.sin(ease * Math.PI);
    camera.updateProjectionMatrix();
    return;   // skip chase cam entirely — nothing else touches the camera
  }

  // ===== Tunnel-ascent cinematic override (underground → city) =====
  // The camera follows the car up the spiral tunnel from behind, so we see
  // the car's tail (headlights facing away from us) as it drives up the
  // tunnel. The tube is translucent during the shot so the car stays visible
  // inside it.
  if (tunnelAscentCine.active) {
    const pose = spiralPoseAtUp(tunnelAscentCine.s);
    const fwd = new THREE.Vector3(-Math.cos(pose.heading), 0, Math.sin(pose.heading));
    _tunnelAscentCamTarget.set(
      pose.x - fwd.x * 7,
      pose.y + 3,
      pose.z - fwd.z * 7
    );
    _tunnelAscentLookTarget.set(pose.x, pose.y + 1.2, pose.z);
    const blend = 1 - Math.pow(0.002, delta);
    camera.position.lerp(_tunnelAscentCamTarget, blend);
    _lookTarget.lerp(_tunnelAscentLookTarget, blend);
    camera.lookAt(_lookTarget);
    return;   // skip chase cam entirely — nothing else touches the camera
  }

  // ===== Mine-ascent side-view shot =====
  // Camera parked east of the shaft for a profile view: we see the
  // explosion deep inside, then watch the car fly through the air and
  // land.  The look target starts at the entrance (framing the blast) and
  // smoothly pans south to follow the car's arc.
  if (mineAscent.active) {
    const t = mineAscent.timer;
    camera.position.copy(_mineAscentCamPos);
    _mineAscentLookPos.set(-55, 0, 34);   // mine entrance — frames the explosion
    if (t > mineAscent.driveTotal) {
      // Phase 2: car blasts out and arcs south.  Pan the look target to
      // follow it so it streaks across the frame instead of leaving view.
      const t2 = THREE.MathUtils.clamp((t - mineAscent.driveTotal) / mineAscent.launchTotal, 0, 1);
      const ease = t2 * t2 * (3 - 2 * t2);   // smoothstep
      _mineAscentLookPos.lerp(car.position, ease * 0.6);
    }
    _lookTarget.copy(_mineAscentLookPos);
    camera.lookAt(_lookTarget);
    return;   // skip chase cam entirely — nothing else touches the camera
  }

  // ===== Levitation camera override =====
  // Same smooth technique as the mine dive: bypass the chase cam and ease the
  // camera to a fixed vantage just east of the hill, tilting up to follow the car.
  if (buildingLevitate.active && buildingLevitate.levitating) {
    _levCamTarget.set(buildingLevitate.x + buildingLevitate.w / 2 + 7, PORTAL_HILL.height + 1.6, buildingLevitate.z);
    _levLookTarget.set(buildingLevitate.x, Math.max(1.5, car.position.y), buildingLevitate.z);
    const blend = 1 - Math.pow(0.004, delta);
    camera.position.lerp(_levCamTarget, blend);
    _lookTarget.lerp(_levLookTarget, blend);
    camera.lookAt(_lookTarget);
    return;   // skip chase cam entirely — nothing else touches the camera
  }

  // ===== Post-spiral-cinematic ease-in =====
  // After the arrival cinematic ends the camera sits at the tripod position
  // while the car zips out at speed.  This override eases the camera from
  // the tripod spot to the normal chase position over several seconds so
  // there's no hard cut — just a slow, cinematic drift into the driving view.
  if (_postCineTimer > 0) {
    _postCineTimer -= delta;
    const t = 1 - Math.max(0, _postCineTimer / 3.5);          // 0 → 1 over 3.5s
    const ease = t * t * (3 - 2 * t);                          // smoothstep

    // Compute the normal chase-cam position (same logic as below)
    const fwd2 = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
    fwd2.y = 0; fwd2.normalize();
    const heading2 = Math.atan2(-fwd2.z, -fwd2.x);
    const theta2 = heading2 + cameraYawOffset;
    const chaseY = Math.max(0.8, car.position.y);
    const desiredOffset2 = new THREE.Vector3(
      camRadius * Math.sin(cameraOrbit.phi) * Math.cos(theta2),
      camRadius * Math.cos(cameraOrbit.phi) + 2.2,
      camRadius * Math.sin(cameraOrbit.phi) * Math.sin(theta2)
    );
    const chaseLook = new THREE.Vector3(car.position.x, chaseY, car.position.z);
    chaseLook.addScaledVector(fwd2, THREE.MathUtils.clamp(velocity.value, 0, 14) * 0.12);

    // Smoothly blend from tripod to chase
    camera.position.lerpVectors(_postCineCamPos, new THREE.Vector3(car.position.x + desiredOffset2.x, chaseY + desiredOffset2.y, car.position.z + desiredOffset2.z), ease);
    _lookTarget.lerpVectors(_postCineLookPos, chaseLook, ease);
    camera.lookAt(_lookTarget);

    // Signal the chase cam to sync camOffset on its first frame.
    if (_postCineTimer <= 0) _postCineHandoff = true;

    return;   // skip chase cam — the ease owns the camera
  }

  // ===== Chase-cam handoff from post-cinematic ease =====
  // The ease leaves the camera at a blended position.  Snap camOffset to
  // match so the chase cam starts from the exact right spot — no jump.
  if (_postCineHandoff) {
    cameraTarget.copy(car.position);
    cameraTarget.y = Math.max(0.8, car.position.y);
    camOffset.copy(camera.position).sub(cameraTarget);
    _postCineHandoff = false;
  }

  cameraTarget.copy(car.position);
  // Follow the car up ramps / into the robot's mouth — but during the mine
  // dive the car sinks below grade, so let the camera follow it DOWN into
  // the shaft instead of clamping to the surface. The sunken skate park is
  // the same idea: the halfpipe and bowls drop 6–16 below the y=0 floor, so
  // the look target rides the car's descent instead of hanging at the 0.8
  // surface line (which left the car shrinking out of the bottom of frame).
  cameraTarget.y = minePortal.active
    ? car.position.y
    : (worldState === 'underground' && car.position.y < 0.8 ? car.position.y : Math.max(0.8, car.position.y));
  // Playing as the giant robot: aim up at the mech's chest (its head is ~14
  // tall) so the whole body fills the frame instead of the camera staring at
  // its feet.
  if (playerRobot) cameraTarget.y += 7;

  // Hole-fall cinematic: the car dropped through a crumbled checkerboard
  // tile in the underground ceiling. Arm the close-up camera while the car
  // is airborne over a hole, and keep it active until the car lands.
  const overHole = worldState === 'underground' && ugTileGoneAt(car.position.x, car.position.z);
  if (!holeFallActive && overHole && jumpState.inAir && car.position.y > 28) {
    holeFallActive = true;
    holeFallTimer = 0;
  }
  if (holeFallActive) {
    holeFallTimer += delta;
    if (!jumpState.inAir || holeFallTimer > HOLE_FALL_MAX_TIME) {
      holeFallActive = false;
    }
  }

  const fwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
  fwd.y = 0;
  fwd.normalize();
  const heading = Math.atan2(-fwd.z, -fwd.x);
  const theta = heading + cameraYawOffset;

  // Driving the train: frame the ACTUAL train instead of a point along the
  // locomotive's heading. A bounding box is built from the loco's nose, every
  // trailing car, and the caboose's tail — so as the consist snakes around
  // corners and the caboose swings off the loco's line, it STILL fits in the
  // shot. The camera dollies to the box's centre and the radius tracks its
  // extent (the max distance from that centre to any train part), eased so the
  // zoom glides instead of snapping while the chain bends.
  let trainCamRadius = 34;
  if (playerTrain && trainCars.length > 0) {
    // UNDERGROUND: the cavern ceiling is a slab of colorful checkerboard tiles
    // (underside y=30.15). The whole-consist framing below would park the
    // camera up at y≈130, INSIDE the tiles, and they'd block the locomotive.
    // So underground we never frame the consist: the camera rides a tight,
    // loco-only radius that shrinks as the loco climbs toward the roof, and
    // stays centred on the engine instead of the consist midpoint. Once the
    // loco is up ON the roof (above the slab) the normal framing returns.
    if (worldState === 'underground') {
      trainCamDesired.set(0, 0, 0);
      trainCamShift.lerp(_camZeroV, Math.min(1, 3.5 * delta));
      const undergroundPhiCos = Math.max(Math.cos(1.0), 0.06);
      const headroom = UG_TRAIN_CAM_MAX_Y - 2.2 - car.position.y;
      trainCamRadius = THREE.MathUtils.clamp(headroom / undergroundPhiCos, 8, 52);
    } else {
      const pts = [
        new THREE.Vector3(car.position.x + fwd.x * 6.5, 0, car.position.z + fwd.z * 6.5),
      ];
      const n = trainCars.length;
      for (const m of trainCars) pts.push(m.position);
      const last = trainCars[n - 1];
      const prev = n > 1 ? trainCars[n - 2] : null;
      const cdx = prev ? last.position.x - prev.position.x : -fwd.x;
      const cdz = prev ? last.position.z - prev.position.z : -fwd.z;
      const clen = Math.hypot(cdx, cdz) || 0.001;
      pts.push(new THREE.Vector3(last.position.x - (cdx / clen) * 6.5, 0, last.position.z - (cdz / clen) * 6.5));
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      let ball = 0;
      for (const p of pts) ball = Math.max(ball, Math.hypot(p.x - cx, p.z - cz));
      ball = Math.min(ball, 130);   // a snagged single car must not balloon the view
      trainCamDesired.set(cx - car.position.x, 0, cz - car.position.z);
      trainCamShift.lerp(trainCamDesired, Math.min(1, 3.5 * delta));
      cameraTarget.add(trainCamShift);
      // 1.55× + 26 keeps both ends inside the 60° frame at the phi below, with a
      // healthy margin for the near (caboose) end sitting close to the camera.
      trainCamRadius = THREE.MathUtils.clamp(ball * 1.55 + 26, 44, 240);
    }
  }

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
  // Only zoom out while the car is actually climbing a ramp or airborne —
  // standing on a high flat surface (a rooftop, the underground ceiling, a
  // building top) keeps the normal chase view, not the flight framing.
  // The underground blue-wave halfpipe is excluded: its walls are only ~16
  // tall and the fun is watching the car pump/trick inside the bowl, so the
  // flight cutaway would just yank the camera out over the coping to a far,
  // sideways vantage that can't see into the pipe. While the car is in the
  // pipe the chase cam stays right behind it, following it up the walls and
  // through vert-pops instead of parking outside and watching.
  const inHalfpipe = worldState === 'underground' && ugPipe &&
    Math.abs(car.position.z - ugPipe.cz) <= ugPipe.len / 2 + 1.6 &&
    Math.abs(car.position.x - ugPipe.cx) <= ugPipe.bottomHalf + ugPipe.wallRun + 1;
  const onRampOrAir = !inHalfpipe && (jumpState.inAir || !!currentRamp);
  // Suppressed during a hole fall — the close-up camera owns the framing.
  const flightZoomT = holeFallActive ? 0 : onRampOrAir ? THREE.MathUtils.clamp((car.position.y - groundHeight) / FLIGHT_CAM_HEIGHT, 0, 1) : 0;

  // Tarantula zoom: the whole spider — spread legs and all — must fit in view.
  // While you're PLAYING as the spider the chase cam always pulls back just far
  // enough to frame the entire creature; and in the ramp world the sleeping or
  // rampaging guardian also triggers the zoom-out when it's close, the same way
  // the robot does, so the giant lurching thing never walks out of shot.
  const tarantulaZoomT = playerTarantula
    ? 1
    : worldState === 'ramp'
      ? THREE.MathUtils.clamp(
          1 - Math.hypot(car.position.x - rampTarantula.mesh.position.x, car.position.z - rampTarantula.mesh.position.z) / SPIDER_CAM_DIST,
          0, 1
        )
      : 0;

  const zoomT = Math.max(robotZoomT, flightZoomT, tarantulaZoomT);
  // When the spider is the reason we're zoomed out it uses its OWN, tighter
  // frame — it's about a third of the robot's bulk, so the full 62-unit
  // robot/flight radius would shrink it to a speck.
  const spiderDominant = tarantulaZoomT > Math.max(robotZoomT, flightZoomT) + 0.001;
  // Driving the robot: hold the camera far enough BACK (and, via the chest
  // target above, up) that the whole 14-tall mech, head to feet, fits in view.
  const camTargetRadius = playerRobot
    ? 18
    : playerTrain
      ? trainCamRadius
      : spiderDominant
        ? cameraOrbit.radius + (TARANTULA_CAM_MAX_RADIUS - cameraOrbit.radius) * tarantulaZoomT
        : cameraOrbit.radius + (Math.max(ROBOT_CAM_MAX_RADIUS, FLIGHT_CAM_MAX_RADIUS) - cameraOrbit.radius) * zoomT;
  camRadius += (camTargetRadius - camRadius) * Math.min(1, 4.0 * delta);

  // Driving the train: lift the camera a touch higher and steeper so the whole
  // long consist (engine to caboose) sits plainly in the frame rather than the
  // receding ribbon slipping to the horizon.

  // On the big ramps the camera swings up and to the SIDE of the flight path —
  // a high "drone" shot looking down at the car — so you watch yourself launch
  // off the end of the ramp and soar over the buildings. The robot zoom keeps
  // its own behind-the-car framing whenever IT is the reason we're pulled out.
  const FLIGHT_PHI = 0.70;   // steep look-down angle (~50° above level) for the flight
  const flightDominant = flightZoomT > robotZoomT + 0.001;
  let camPhi = THREE.MathUtils.clamp(
    flightDominant
      ? cameraOrbit.phi + (FLIGHT_PHI - cameraOrbit.phi) * flightZoomT   // flight: high, looking down
      : cameraOrbit.phi + 0.30 * zoomT,                                  // robot: sit higher behind the car
    cameraOrbit.minPhi,
    cameraOrbit.maxPhi
  );

  // Mine approach: drop the camera to ground level so you look INTO the adit
  // tunnel as the car drives in, instead of over the roof. Blends in as the
  // car commits to the mine corridor (z 26 → 34). Once the dive itself
  // starts (z > 34) the dedicated override below takes over and follows the
  // car down into the shaft.
  const MINE_PHI = 1.55;   // near-flat orbit angle → camera hugs the ground
  let mineCamT = 0;
  if (worldState === 'city' && (minePortal.active || isMineCamActive())) {
    const p = minePortal;
    mineCamT = THREE.MathUtils.clamp((car.position.z - p.camZ) / (p.triggerZ - p.camZ), 0, 1);
  }
  camPhi = THREE.MathUtils.lerp(camPhi, MINE_PHI, mineCamT);
  // Driving the train: sit a touch higher than the default chase camera — but
  // NOT steep overhead. A steep look-down hides the caboose, because it sits on
  // the NEAR side (toward the camera) and dips below the bottom view edge; a
  // relatively level shot with the big zoom-out radius keeps both ends in frame.
  if (playerTrain) camPhi = THREE.MathUtils.lerp(camPhi, 1.0, Math.min(1, 2 * delta));
  // Swing the camera around perpendicular to the flight path (the side view)
  // as the flight zoom kicks in; the camOffset lerp below eases the arc.
  const camTheta = theta - (flightDominant ? (Math.PI / 2) * flightZoomT : 0);

  // Hole-fall camera: the car is dropping through a crumbled checkerboard
  // tile. Zoom in close and tilt down so you can watch it fall through the
  // hole, following it down. The camera target already tracks the car's y,
  // so the chase cam rides the fall; we just tighten the framing.
  if (holeFallActive) {
    camRadius += (HOLE_FALL_CAM_RADIUS - camRadius) * Math.min(1, 6.0 * delta);
    camPhi = THREE.MathUtils.lerp(camPhi, HOLE_FALL_CAM_PHI, Math.min(1, 6.0 * delta));
    // Keep the camera above the ceiling while the car is still near it, so
    // it doesn't clip through the checkerboard tiles as it follows the car
    // down. Blends to following the car once it's well below the roof.
    const ceilCamY = 31.5 - (camRadius * Math.cos(camPhi) + 2.2);
    const belowT = THREE.MathUtils.clamp((28 - car.position.y) / 3, 0, 1);
    cameraTarget.y = THREE.MathUtils.lerp(Math.max(ceilCamY, car.position.y), car.position.y, belowT);
  }

  // Aim the shot at the robot's head only when the ROBOT is why we zoomed out;
  // during the ramp flight the camera stays on the car so you watch yourself.
  const robotHead = new THREE.Vector3();
  robot.mesh.userData.head.getWorldPosition(robotHead);
  if (worldState === 'city') cameraTarget.lerp(robotHead, robotZoomT);

  // Driving the locomotive under the underground's checkerboard ceiling — the
  // HARD guarantee behind the tight framing above: while the loco is under the
  // colorful tiles (and NOT riding up on the roof itself), the camera NEVER
  // gets to sit inside or above the slab. The final eased camera height must
  // stay under the tile underside; if the radius or phi snuck too high, clamp
  // the radius down so the camera ducks back below the tiles. The earlier
  // target already zooms in to just the loco, so this just makes hitting the
  // ceiling impossible rather than unlikely.
  if (worldState === 'underground' && playerTrain && car.position.y < UG_TILE_UNDER) {
    const camY = cameraTarget.y + camRadius * Math.cos(camPhi) + 2.2;
    if (camY > UG_TRAIN_CAM_MAX_Y) {
      const camPhiCos = Math.max(Math.cos(camPhi), 0.06);
      const rMax = (UG_TRAIN_CAM_MAX_Y - 2.2 - cameraTarget.y) / camPhiCos;
      camRadius = Math.min(camRadius, Math.max(rMax, 8));
    }
    // Pin the framing centre to the locomotive (never the consist midpoint),
    // so the tight shot is always looking down the rails at the engine.
    trainCamShift.lerp(_camZeroV, Math.min(1, 3.5 * delta));
    _camTempV.set(car.position.x, cameraTarget.y, car.position.z);
    cameraTarget.lerp(_camTempV, Math.min(1, 3.5 * delta));
  }

  const desiredOffset = new THREE.Vector3(
    camRadius * Math.sin(camPhi) * Math.cos(camTheta),
    camRadius * Math.cos(camPhi) + 2.2,
    camRadius * Math.sin(camPhi) * Math.sin(camTheta)
  );

  // Sunken-pit framing (the skate park bowls and the blue-wave halfpipe sit
  // below floor level): stand the camera ABOVE the rim looking DOWN into the
  // bowl. Without this it parks at the y≈1 line and the far wall of the pipe
  // slides between the camera and the car (or the car drops off the bottom of
  // the frame). The lift fades out as the car crests a lip, so the height
  // eases back to the normal chase shot right at the edge of the pit.
  const sunkenLift = worldState === 'underground' && car.position.y < -0.4
    ? THREE.MathUtils.clamp((-car.position.y - 0.3) / 3.5, 0, 1)
    : 0;
  if (sunkenLift > 0) {
    desiredOffset.y += (Math.max(0, -car.position.y) + 1.6) * sunkenLift;
  }

  // Look slightly ahead of the car in the direction of travel (off when the
  // shot is focused on the robot).
  _lookTarget.copy(cameraTarget);
  _lookTarget.addScaledVector(fwd, THREE.MathUtils.clamp(velocity.value, 0, 14) * 0.12 * (1 - zoomT));

  // Mine dive: the camera drops LOW and CLOSE behind the car and follows it
  // down into the shaft — riding the adit bed so it never clips the rock.
  // (Without this the chase cam stays at ground level while the car sinks to
  // y=-10.5, so you just watch it shrink away into the distance.)
  //
  // The camera only follows for the FIRST QUARTER of the dive, then it STOPS
  // and stays parked at the mine entrance — the car keeps driving away and
  // sinking into the depths while we watch it go. The look target keeps
  // tracking the car, so the shot pans down as the car recedes into the
  // jewelled dark.
  //
  // NOTE: the camera target is computed from the DIVE STATE (minePortal.timer),
  // not from car.position — the dive code that actually moves the car runs
  // AFTER updateCamera, so at this point car.position.y is still the surface
  // height (0.3) and car.position.z can be nudged ahead by the physics step.
  if (worldState === 'city' && minePortal.active) {
    const p = minePortal;
    const t = Math.min(p.timer / p.diveTotal, 1);
    const zz = THREE.MathUtils.lerp(p.z0, p.z1, t);   // car's dive z
    const yy = p.baseY + mineAditDropAt(zz);          // car's dive y
    // Camera progress clamps at the entrance — the tripod parks there and
    // never descends further, even though the car keeps going.
    const camT = Math.min(t, 0.25);
    const camZz = THREE.MathUtils.lerp(p.z0, p.z1, camT);   // camera's dive z
    const camYy = p.baseY + mineAditDropAt(camZz);          // camera's dive y
    const behind = 5.5;                               // tight, close behind the car
    const camZ = camZz - behind;
    const camY = mineAditDropAt(camZ) + 2.2;          // ride the bed, low above it
    cameraTarget.set(p.triggerX, camYy, camZz);
    desiredOffset.set(0, camY - camYy, camZ - camZz);
    _lookTarget.set(p.triggerX, yy + 0.5, zz + 3);    // keep watching the car recede
    _camDbg.overrideRan = true;
  } else if (mineCamT > 0) {
    // Approach corridor: the car hasn't committed to the dive yet — tilt the
    // look target down to keep following it into the adit as it descends.
    _lookTarget.y = THREE.MathUtils.lerp(_lookTarget.y, car.position.y, mineCamT);
  }

  // TEMP debug capture
  _camDbg.mineActive = minePortal.active;
  _camDbg.carZ = +car.position.z.toFixed(2);
  _camDbg.carY = +car.position.y.toFixed(2);
  _camDbg.camTargetZ = +cameraTarget.z.toFixed(2);
  _camDbg.camTargetY = +cameraTarget.y.toFixed(2);
  _camDbg.robotZoomT = +robotZoomT.toFixed(3);
  _camDbg.robotHead = { x: +robotHead.x.toFixed(1), y: +robotHead.y.toFixed(1), z: +robotHead.z.toFixed(1) };
  _camDbg.camOffsetZ = +camOffset.z.toFixed(2);
  _camDbg.camOffsetY = +camOffset.y.toFixed(2);

  // Camera shake (jump / landing)
  if (shake.intensity > 0.002) {
    desiredOffset.x += (Math.random() - 0.5) * shake.intensity;
    desiredOffset.y += (Math.random() - 0.5) * shake.intensity;
    desiredOffset.z += (Math.random() - 0.5) * shake.intensity;
    shake.intensity *= 0.88;
  }

  camOffset.lerp(desiredOffset, holeFallActive ? 0.6 : 0.12);
  camera.position.copy(cameraTarget).add(camOffset);

  // Keep the chase camera OUT of the Holy Mountain. The cinematic overrides
  // above all `return` early, so this only ever runs for the free chase cam:
  // if it lands inside the cone's solid volume (below the summit and inside
  // the shell radius) slide it straight out to the rock face. The mountain is
  // solid to the CAR, so it must be solid to the camera too — otherwise the
  // view sinks through the rock whenever the car hugs the base or climbs.
  if (worldState === 'underground' && undergroundWorld.holy && undergroundWorld.holy.coneRadiusAt) {
    const M = undergroundWorld.holy.MOUNT;
    const cdx = camera.position.x - M.cx, cdz = camera.position.z - M.cz;
    const cr = Math.hypot(cdx, cdz);
    if (camera.position.y < M.peakY) {
      const shellR = undergroundWorld.holy.coneRadiusAt(Math.max(0, camera.position.y)) + 1.0;
      if (cr < shellR) {
        if (cr < 1e-3) {
          camera.position.x = M.cx + shellR;   // dead on the axis: push due east
          camera.position.z = M.cz;
        } else {
          const s = shellR / cr;
          camera.position.x = M.cx + cdx * s;
          camera.position.z = M.cz + cdz * s;
        }
      }
    }
  }

  camera.lookAt(_lookTarget);
}

function animate() {
  requestAnimationFrame(animate);

  // If a background underground rebuild finished while we were away, swap it
  // in now that the underground is off camera (already guarded inside).
  maybeSwapUnderground();

  // Paused: the whole world is frozen (no clock.getDelta(), so every
  // elapsedTime-driven animation holds still too). When the car showroom is
  // open we render its black sound stage instead of the world — the spinning
  // car over the blue glow on the main canvas. Otherwise only the camera keeps
  // updating so scroll-wheel zoom + drag orbit still work for screenshots,
  // and the frame keeps rendering so you can grab it.
  if (isPaused) {
    if (selectMode) {
      updateSelectCar();
      renderer.render(selectScene, selectCamera);
    } else {
      updateCamera(1 / 60);
      renderer.render(worldState === 'ramp' ? rampScene : worldState === 'underground' ? undergroundScene : scene, camera);
    }
    return;
  }

  const delta = clock.getDelta();
  const accel = 10 * delta;
  const turnRate = 1.7 * delta;

  // While the giant robot has the player in its claw, the player's car is
  // inert — it just rides up to the robot's mouth. Physics resume on respawn.
  // The spiral-arrival, mine-ascent, tunnel-ascent and holy-chamber
  // cinematics also own the car completely while they run.
  if (!robot.playerCaptured && !spiralCine.active && !mineAscent.active && !tunnelAscentCine.active && !chamberCine.active && !expressState.active && !magnetHold) {

  let forward = 0;
  let reverse = 0;
  if (keys['ArrowUp'] || keys['KeyW']) forward = 1;
  if (keys['ArrowDown'] || keys['KeyS']) reverse = 1;
  // Hold Shift anywhere for a nitro-style 2× boost: acceleration AND top speed
  // both double, in either direction (forward or reverse).
  const boost = (keys['ShiftLeft'] || keys['ShiftRight']) ? 2 : 1;
  if (joy.active) {
    // Analog joystick: push up = go, pull down = reverse
    const f = Math.max(0, -joy.y);
    const r = Math.max(0, joy.y);
    if (f > 0.08) forward = Math.max(forward, f);
    else if (r > 0.08) reverse = Math.max(reverse, r);
  }

  // The Indy racer tops out 1.5× faster than every other car (both directions).
  const speedMul = playerIndy ? 1.5 : 1;
  if (forward > 0) {
    velocity.value = Math.min(velocity.value + accel * 2.2 * forward * boost, 14 * boost * speedMul);
  } else if (reverse > 0) {
    velocity.value = Math.max(velocity.value - accel * 1.5 * reverse * boost, -7 * boost * speedMul);
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
  // Spinning turntable (underground): while the car is riding (or flying just
  // over) the giant platter, the disk's spin adds directly to the heading AND
  // sweeps the car's position around the platter centre by the same rotation.
  // Carrying the position keeps the contact point glued to one radius of the
  // disk, so the car parks on a single colour wedge and turns with it like a
  // car on a turntable — the pattern spins under the WHEELS' own carriage, not
  // sliding out from beneath a fixed car (which read as tyres slipping). The
  // heading rotates with the disk too, and because the movement vector is
  // rebuilt from the heading below, the car's actual driving direction follows
  // the disk instead of cutting a straight line across it.
  //
  // Two details make it read as a turntable rather than a shove:
  //  - the footprint test is onColliderFootprint, so the round deck stops
  //    carrying the car in the square corners its mesh never covers (a car that
  //    ran off the rim there used to orbit on air)
  //  - the position sweep is the SAME handedness as the heading, and both match
  //    `disk.rotation.y += a` (Three.js R_y maps a point offset (dx,dz) to
  //    (dx·cos a + dz·sin a, −dx·sin a + dz·cos a)). Sweeping the other way
  //    orbits the car against the disk's own rotation, which is the clearest
  //    possible "this isn't spinning naturally" tell.
  if (worldState === 'underground') {
    for (const c of ugColliders) {
      if (c.spin
        && Math.abs(car.position.y - c.h) < 1.5
        && onColliderFootprint(c, car.position.x, car.position.z)) {
        car.rotation.y += c.spin * delta;
        const dx = car.position.x - c.x;
        const dz = car.position.z - c.z;
        const a = c.spin * delta;
        const ca = Math.cos(a), sa = Math.sin(a);
        car.position.x = c.x + dx * ca + dz * sa;
        car.position.z = c.z - dx * sa + dz * ca;
        break;
      }
    }
  }
  const direction = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
  direction.y = 0;
  direction.normalize();

  const nextCarPos = car.position.clone().addScaledVector(direction, velocity.value * delta);
  // NOTE: traffic cars are deliberately NOT in this block list — the player
  // plows straight through them and the car-vs-car collision system shoves
  // them out of the way (they slide aside, then ease back to their lane).
  // While airborne (or up on a rooftop / any collider top) the car flies OVER
  // buildings, the fire engine and the robot instead of being stopped by
  // them — that's what lets the mega ramp hurl you across the whole town.
  // In the city you can't drive through buildings, the fire engine or the
  // robot (unless you're airborne / up on a rooftop). The ramp world is wide
  // open rolling terrain — nothing to block you.
  // buildingTopAt is world-aware, so this also covers underground surfaces
  // (soft stair tiers): standing on one lifts the wall
  // blocking exactly like a city roof, so low rim colliders can't invisibly
  // fence off the ledges floating above them.
  const elevated = jumpState.inAir || (buildingTopAt(car.position.x, car.position.z) > 0 && car.position.y > 0.5);
  const canMove =
    !buildingLevitate.levitating && (
    worldState === 'ramp' ||
    elevated ||
    (!isPositionBlocked(nextCarPos.x, nextCarPos.z, playerCarRadius, true) &&
      !isPositionBlockedByFiretruck(nextCarPos.x, nextCarPos.z, playerCarRadius) &&
      !isPositionBlockedByRobot(nextCarPos.x, nextCarPos.z, playerCarRadius)));
  if (canMove) {
    car.position.copy(nextCarPos);
  } else {
    // ===== Wall-slide (the car-wash slip, global) =====
    // A blocked hit no longer knocks the car off the wall. The intended move
    // is decomposed against the contact normal: only the part pointing INTO
    // the wall is dropped, and the tangential part carries the car forward,
    // so the car glides along the wall the same way the soapy car-wash
    // lattice slides it — no nose deflection, no velocity reversal. Speed is
    // preserved along the face (slippery), with a small drain each frame so
    // pressing straight into a wall bleeds down to a low idle instead of
    // pinning you at full throttle. Only a nearly head-on impact bounces a
    // little (so you can never get glued to a building dead-on); glancing
    // hits keep sliding.
    if (!buildingLevitate.levitating) {
      const mvX = direction.x * velocity.value * delta;
      const mvZ = direction.z * velocity.value * delta;
      // The normal query adds a small epsilon because the anti-stuck pass parks
      // the car at EXACT contact (zero penetration) — without it, resting
      // against a wall could never produce a normal and sliding would die.
      const n = wallNormal(car.position.x, car.position.z, playerSolids(), playerCarRadius + 0.06);
      if (n) {
        const into = mvX * n.nx + mvZ * n.nz;   // <0: this move heads into the wall
        if (into < 0) {
          const moveLen = Math.hypot(mvX, mvZ) + 1e-6;
          const headOn = -into / moveLen;       // 1 = dead-on, ~0 = glancing
          if (headOn > 0.7 && !isInMineApproach()) {
            // (Nearly) head-on: while forward is held, keep deflecting the
            // nose AWAY from the wall every blocked frame and pop the car
            // back a little along the face normal, until the car is angled
            // enough that the slip takes over and it slides free. The old
            // version reversed velocity — that drove the TAIL into the wall
            // (only the nose had turned), so a dead-on press turned once and
            // wedged. Forward momentum is kept so the car keeps pressing and
            // re-deflecting instead. The mine approach is excluded — it
            // guides the nose INTO the shaft instead.
            if (forward > 0.05) {
              const yaw = 0.5;
              const h = car.rotation.y;
              const away = (s) => -Math.cos(h + s * yaw) * n.nx + Math.sin(h + s * yaw) * n.nz;
              car.rotation.y += (away(1) >= away(-1) ? 1 : -1) * yaw;
              // n points away from the wall (into free space): nudge out so
              // the car isn't pinned at exact contact, letting it turn free.
              car.position.x += n.nx * 0.4;
              car.position.z += n.nz * 0.4;
              velocity.value = Math.max(1.5, Math.abs(velocity.value) * 0.8);
              shake.intensity = Math.max(shake.intensity, 0.18);
            } else {
              velocity.value *= 0.97;
            }
          } else {
            // Glancing hit: keep only the component of the move parallel to
            // the wall face.
            const slideX = car.position.x + (mvX - n.nx * into);
            const slideZ = car.position.z + (mvZ - n.nz * into);
            // Slide only where the slide position is clear too — corners and
            // wedges pinch, and there the anti-stuck pass below frees us.
            if (!isPositionBlocked(slideX, slideZ, playerCarRadius, true) &&
                !isPositionBlockedByFiretruck(slideX, slideZ, playerCarRadius) &&
                !isPositionBlockedByRobot(slideX, slideZ, playerCarRadius)) {
              car.position.x = slideX;
              car.position.z = slideZ;
            }
            velocity.value *= 0.97;
            shake.intensity = Math.max(shake.intensity, 0.1);
          }
        } else {
          velocity.value *= 0.97;
        }
      } else {
        // No discernible contact normal (e.g. pinched between two props):
        // slow gently instead of stopping dead or jittering in place.
        velocity.value *= 0.9;
      }
    } else {
      velocity.value *= 0.3;
    }
    if (isInMineApproach() && forward > 0.05 && !buildingLevitate.levitating) {
      // Mine wall-guide: nudge the nose TOWARD the tunnel axis (x=-55) so the
      // sliding car lines up with the entrance instead of gliding on past the
      // bank.
      car.rotation.y += (car.position.x < minePortal.triggerX ? 1 : -1) * 0.42;
    }
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
        // launch off it. Otherwise just ride the terrain. A ramp with
        // boost=0 (e.g. the underground grand ramp) is a drive-up ramp —
        // it must NOT launch (yVelocity would be 0 and the car would drop
        // through whatever surface it's rolling onto).
        const launched =
          wasOnRamp &&
          wasOnRamp.boost > 0 &&
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
    const __air0 = jumpState.inAir;
    let __airRan = false;
    if (jumpState.inAir) {
      ugDbg = 'airborne';
      __airRan = true;
      // Airborne in the underground: fall under gravity, land on the cavern
      // floor (local y ≈ 0 — the floor mesh top sits at y = -0.02), back on
      // a course ramp's slope, or on top of anything with a collider footprint
      // (Glass City roofs, the checkerboard ceiling — task #18).
      // The min() cap stops a high surface from snapping the car UP to it
      // when flying through its footprint below surface level.
      currentRamp = null;
      tunnelFloorState.active = false;
      onStairs = false;
      stairPrevY = 0;
      jumpState.yVelocity -= gravity * delta;
      car.position.y += jumpState.yVelocity * delta;
      // Halfpipe keep-in: no matter how the car went aloft over the trough
      // (a vert launch off the lip, a stall, steering during a trick, a knock
      // from another prop), it must ALWAYS come back down inside the pipe —
      // never out over the lip and never out an open mouth. While airborne
      // within the pipe's footprint, rein the car in to just inside each lip
      // and to the pipe's length, so its fall lands on the bowl's upper wall
      // and rolls back into the trough. Unlike the old pipeAir-gated air-lock
      // this runs for ANY airborne frame over the pipe, not just ones we popped.
      if (ugPipe) {
        const dz = car.position.z - ugPipe.cz;
        const rimHalf = ugPipe.bottomHalf + ugPipe.wallRun;   // lip x-offset from cx
        const rimLo = ugPipe.cx - rimHalf;                    // west lip
        const rimHi = ugPipe.cx + rimHalf;                    // east lip
        if (Math.abs(dz) <= ugPipe.len / 2 + 1.6 && car.position.y > 1) {
          // Mouth caps: keep a flying car within the pipe's length so it
          // drops back into the trough instead of sailing out an open end.
          const zCap = ugPipe.len / 2 - 0.5;
          if (dz > zCap) car.position.z = ugPipe.cz + zCap;
          else if (dz < -zCap) car.position.z = ugPipe.cz - zCap;
          // Lateral rein: pull a car drifting out over a lip back to a spot
          // just inside it. The wall itself is a thin ~90° face with no top
          // band to land on, so the rein parks it on the bowl's upper arc —
          // it drops there and rolls back down instead of cresting the lip.
          const inFromRim = Math.min(1.1, ugPipe.bottomHalf * 0.11);
          if (car.position.x > rimHi - inFromRim && car.position.y > 6) {
            car.position.x = rimHi - inFromRim;
            if (direction.x > 0.1) velocity.value = Math.min(velocity.value, 0);
          } else if (car.position.x < rimLo + inFromRim && car.position.y > 6) {
            car.position.x = rimLo + inFromRim;
            if (direction.x < -0.1) velocity.value = Math.min(velocity.value, 0);
          }
        }
      }
      const bTop = buildingTopAt(car.position.x, car.position.z);
      const tfloor = tunnelFloorYRaw(car.position.x, car.position.z);
      const tfloorSurface = (tfloor !== null && tfloor <= car.position.y + 0.4) ? tfloor : -Infinity;
      const machineTop = ugMachineTopAt(car.position.x, car.position.z);
      // The sunken skate park carves BELOW the cavern floor (negative y), so a
      // ramp surface here must be allowed to land the car below ground level —
      // never clamped back up to the y=0 floor plane. Off any ramp the plain
      // floor (y=0) still applies.
      const ugSurf = ugRampSurfaceY(car.position.x, car.position.z);
      const sunkenSurf = ugSurf === -Infinity ? 0 : ugSurf;
      // Sunken bowls sit BELOW the y=0 floor plane. When the falling car is
      // above a carved bowl (ugSurf finite), the plain y=0 floor term must not
      // win the max() or the car snaps back up to y=0 mid-fall — glass again.
      const floorPlane = ugSurf > -Infinity ? -Infinity : 0;
      const surface = Math.max(sunkenSurf, tfloorSurface, bTop > 0 && bTop <= car.position.y + 0.4 ? bTop : -Infinity, machineTop > 0 && car.position.y > 1.5 ? machineTop : -Infinity, floorPlane);
      if (window.__ugLog && car.position.z < 52) window.__ugLog.push({ t: 'air', yVel: +jumpState.yVelocity.toFixed(2), y: +car.position.y.toFixed(2), z: +car.position.z.toFixed(2), bTop: +bTop.toFixed(2), surf: +surface.toFixed(2), land: car.position.y <= surface });
      if (car.position.y <= surface) {
        car.position.y = surface;
        const impact = Math.abs(jumpState.yVelocity);
        jumpState.yVelocity = 0;
        jumpState.inAir = false;
        shake.intensity = Math.min(0.3 + impact * 0.05, 0.75);
      }
    } else {
      // On the ground in the underground: ride the tunnel interior floor,
      // a course ramp slope, or stay on the cavern floor.
      onStairs = false;   // only the stair branch below re-enables it
      const tf = tunnelFloorAt(car.position.x, car.position.z, car.position.y);
      if (tf) {
        // Ride the tunnel interior floor — the car is inside the tube.
        currentRamp = null;
        car.position.y = tf.y;
        tunnelFloorState.active = true;
        tunnelFloorState.slope = tf.slope;
        tunnelFloorState.tanX = tf.tanX;
        tunnelFloorState.tanZ = tf.tanZ;
        // Gentle heading correction toward the tunnel path (simulates
        // tunnel walls guiding the car around the curve). The car drives
        // INTO the tunnel (decreasing s), so the heading is the reverse of
        // the path tangent: atan2(tanX, -tanZ) — the old atan2(tanZ, -tanX)
        // pointed ~75° off the path and fought the player's steering.
        // Fade the correction to zero near s = 1 (tunnel foot / exit) so
        // the car doesn't get yanked back into the tube when bursting out.
        const headingTangent = Math.atan2(tf.tanX, -tf.tanZ);
        let headingErr = headingTangent - car.rotation.y;
        while (headingErr > Math.PI) headingErr -= 2 * Math.PI;
        while (headingErr < -Math.PI) headingErr += 2 * Math.PI;
        car.rotation.y += headingErr * 3.0 * (1 - tf.s) * delta;
        wasOnRamp = null;
      } else {
        tunnelFloorState.active = false;
        const r = ugRampRideAt(car.position.x, car.position.z, car.position.y);
        const rampSurf = r ? r.baseY + r.height * r.s : -Infinity;
        // ugRampRideAt already requires the surface to be within the ride
        // range, so the car only attaches to a ramp it is genuinely near and
        // overlapping steep ramps (e.g. the spiral road lapping the holy
        // mountain's cone face) can no longer mask the gentle foot band and
        // swallow a floor-level car.
        const onRamp = r !== null;
        currentRamp = onRamp ? r : null;
        if (onRamp) {
          ugDbg = 'ramp';
          car.position.y = rampSurf;
          wasOnRamp = { runX: r.runX, runZ: r.runZ, height: r.height, len: r.len, boost: r.boost, pipeTop: !!r.def.pipeTop, pipeLaunch: r.def.pipeLaunch || null };
          // Halfpipe: you can't park on a steep face. The car is not spiderman —
          // with no throttle it bleeds speed (~×0.92/frame) and a car that
          // stalls on the pipe's steeper banks slides back DOWN the wall toward
          // the bowl's centre instead of clinging mid-air. Only the shallow
          // bowl (< ~25°) lets you come to rest.
          if (r.def.pipeSlide && velocity.value < 2.5) {
            ugDbg = 'wall-slide';
            const steep = r.height / Math.max(0.001, r.len);   // slope gradient (tan)
            const amt = THREE.MathUtils.clamp((steep - 0.47) / 1.6, 0, 1) * 3.6 * delta;
            car.position.x -= r.runX * amt;
            car.position.z -= r.runZ * amt;
          } else if (r.def.pipeTop) {
            // Vert launch: reach the top of the vert wall with speed and you
            // take off like a rocket — straight up, float on gravity, and the
            // halfpipe keep-in above brings you back down into the bowl. The
            // launch is pure vertical (the keep-in handles lateral drift), so
            // it doesn't matter which way you're carving — the lip is never a
            // wall you scrape past. No apex cap: gravity alone decides how
            // high your speed buys you.
            //
            // Outward-travel gate: only launch when the car PHYSICALLY moved
            // out toward the lip this frame (position delta along the wall's
            // run). A heading check isn't enough — a car entering diagonally
            // down the lip faces outward while still rolling in, so the old
            // dot-product test popped it on entry at speed and the halfpipe
            // read as an invisible wall/glass. Position delta is direction-
            // and angle-proof: rolling in always moves AGAINST the run, so
            // the only way outward > 0 is genuinely driving up and out.
            const along = (car.position.x - r.x) * r.runX + (car.position.z - r.z) * r.runZ;
            const s = (along + r.len / 2) / r.len;
            const outward = (car.position.x - playerPrevX) * r.runX + (car.position.z - playerPrevZ) * r.runZ;
            if (s > 0.3 && velocity.value > 2.5 && outward > 0.02) {
              jumpState.inAir = true;
              ugDbg = 'vert-pop';
              jumpState.yVelocity = wasOnRamp.pipeLaunch
                ? Math.max(6, Math.abs(velocity.value) * wasOnRamp.pipeLaunch)
                : Math.max(6, 2 + Math.abs(velocity.value) * 0.85);
              velocity.value = -Math.max(1.0, Math.min(3, Math.abs(velocity.value) * 0.15));
              shake.intensity = Math.max(shake.intensity, 0.08);
              if (window.__ugLog && car.position.z < 52) window.__ugLog.push({ t: 'vert-pop', yVel: +jumpState.yVelocity.toFixed(2), y: +car.position.y.toFixed(2), z: +car.position.z.toFixed(2) });
            }
          }
        } else {
          // Halfpipe backstop: if the rim pop band was skipped (a heavy frame),
          // the car exits the rim wedge outward — vert-pop it straight up
          // instead of letting it drift over the edge and fall past the pipe's
          // outer face onto the floor.
          if (wasOnRamp && wasOnRamp.pipeTop &&
              (car.position.x - playerPrevX) * wasOnRamp.runX + (car.position.z - playerPrevZ) * wasOnRamp.runZ > 0.02) {
            jumpState.inAir = true;
            ugDbg = 'vert-pop';
            jumpState.yVelocity = wasOnRamp.pipeLaunch
              ? Math.max(6, Math.abs(velocity.value) * wasOnRamp.pipeLaunch)
              : Math.max(6, 2 + Math.abs(velocity.value) * 0.85);
            velocity.value = -Math.max(1.2, Math.min(5, Math.abs(velocity.value) * 0.3));
            shake.intensity = Math.max(shake.intensity, 0.08);
            if (window.__ugLog && car.position.z < 52) window.__ugLog.push({ t: 'pipeTopExit', y: +car.position.y.toFixed(2), z: +car.position.z.toFixed(2) });
          } else {
            // Drive off the far (high) edge of the ramp we were just riding:
            // launch off it, same as the city/ramp-world ramps.
            if (window.__ugLog && car.position.z < 52) window.__ugLog.push({ t: 'else', wasOnRamp: !!wasOnRamp, vel: +velocity.value.toFixed(2), dot: +(direction.x * (wasOnRamp ? wasOnRamp.runX : 0) + direction.z * (wasOnRamp ? wasOnRamp.runZ : 0)).toFixed(2), y: +car.position.y.toFixed(2), z: +car.position.z.toFixed(2), rampSurf: +rampSurf.toFixed(2) });
            const launched =
              wasOnRamp &&
              wasOnRamp.boost > 0 &&
              velocity.value > 2 &&
              (direction.x * wasOnRamp.runX + direction.z * wasOnRamp.runZ) > 0.3;
            if (launched) {
            ugDbg = 'launch';
            jumpState.inAir = true;
            jumpState.yVelocity = velocity.value * (wasOnRamp.height / wasOnRamp.len) * wasOnRamp.boost;
            shake.intensity = Math.max(shake.intensity, 0.08);
            if (window.__ugLog && car.position.z < 52) window.__ugLog.push({ t: 'launch', yVel: +jumpState.yVelocity.toFixed(2), y: +car.position.y.toFixed(2), z: +car.position.z.toFixed(2), wasOnRamp: wasOnRamp && { h: wasOnRamp.height, len: wasOnRamp.len } });
          } else {
            // Ride any soft underground surface (staircase steps, the checkerboard
            // ceiling) the car stands in — y snaps to the surface's live top
            // each frame, so climbing the staircase lifts the car with the step.
            // Mounting is proximity-gated so a high surface passing overhead
            // never yo-yos the car off the floor.
            const eTop = ugElevatorTopAt(car.position.x, car.position.z, car.position.y);
            if (ugSunkHoleAt(car.position.x, car.position.z) && car.position.y <= 0.05) {
              // Full-speed pit entry: the wall under the lip drops faster than
              // the 2.0 ride gate can follow, so the car skips the steep face
              // and would otherwise snap back to the y=0 floor — hovering over
              // the carved-out hole like invisible glass. Checked FIRST so no
              // soft-surface hook (eTop) can ever pin the car to the floor
              // plane above a pit. The descent is SELF-CONTAINED here in the
              // grounded branch — it must not rely on the airborne branch
              // (jumpState.inAir can be cleared by a per-frame touchdown reset
              // before the next pass, which left the car floating at y=0). It
              // falls straight down onto the sunken surface and lands.
              ugDbg = 'sunk-fall';
              onStairs = false;
              const sinkSurf = ugRampSurfaceY(car.position.x, car.position.z);
              const sinkLim = sinkSurf === -Infinity ? 0 : sinkSurf;
              if (car.position.y > sinkLim + 0.02) {
                jumpState.inAir = true;
                jumpState.yVelocity = Math.min(jumpState.yVelocity - gravity * delta, 0);
                car.position.y = Math.max(sinkLim, car.position.y + jumpState.yVelocity * delta);
                if (car.position.y <= sinkLim + 0.02) {
                  car.position.y = sinkLim;
                  jumpState.inAir = false;
                  jumpState.yVelocity = 0;
                  shake.intensity = Math.max(shake.intensity, 0.15);
                }
                wasOnRamp = null;
              } else {
                jumpState.inAir = false;
                jumpState.yVelocity = 0;
              }
            } else if (eTop > 0.05 && Math.abs(car.position.y - eTop) < 1.4) {
              ugDbg = 'surface';
              car.position.y = eTop;
              // Track riser bumps: when the car's height jumps up a step,
              // fire a small shake to sell the bump of climbing each stair.
              if (undergroundWorld.stairHeightAt && undergroundWorld.stairHeightAt(car.position.x, car.position.z) > -Infinity) {
                if (stairPrevY > 0 && car.position.y > stairPrevY + 0.4) {
                  shake.intensity = Math.max(shake.intensity, 0.15);
                }
                stairPrevY = car.position.y;
                onStairs = true;
              } else {
                onStairs = false;
              }
            } else if (eTop > 0.05) {
              ugDbg = 'surface-overhead';
              car.position.y = 0;   // surface is overhead — stay on the floor
              onStairs = false;
              stairPrevY = 0;
            } else if (car.position.y > 0.3) {
              // Drove off a raised surface (stair edge): become gently
              // airborne instead of teleporting down, keeping momentum.
              ugDbg = 'raised';
              jumpState.inAir = true;
              jumpState.yVelocity = 0;
              onStairs = false;
            } else {
              // A sunken surface can sit BELOW the y=0 floor plane (carved
              // pipe bowls). Never snap a car that already rests under the
              // floor back up onto it — that teleport read as invisible glass.
              const sunkBelow = ugRampSurfaceY(car.position.x, car.position.z);
              if (sunkBelow > -Infinity && car.position.y < -0.05) {
                ugDbg = 'sunk-floor';
                car.position.y = sunkBelow;
              } else {
                ugDbg = 'floor';
                car.position.y = 0;
              }
              onStairs = false;
            }
          }
          }   // end halfpipe backstop
          wasOnRamp = null;
          // Not on stairs unless the eTop branch above set onStairs.
          if (!onStairs) stairPrevY = 0;
        }
      }
      // End of the underground physics pass: record the player's position so
      // next frame's vert-pop gate can measure genuine outward travel.
      playerPrevX = car.position.x;
      playerPrevZ = car.position.z;
      // Rolling park-region trace (?debug): keep the last ~4s of physics
      // branch labels while the car is around the sunken skate park, so a
      // "glass over the pipes" report can be diagnosed after the drive from
      // one console paste.
      if (car.position.x < -105 && car.position.z < -15) {
        window.__ugTraceHistory = window.__ugTraceHistory || [];
        window.__ugTraceHistory.push({
          x: +car.position.x.toFixed(2), y: +car.position.y.toFixed(2), z: +car.position.z.toFixed(2),
          dbg: ugDbg, inAir: jumpState.inAir, air0: __air0, airRan: __airRan, eTop: +ugElevatorTopAt(car.position.x, car.position.z, car.position.y).toFixed(2),
          hole: undergroundWorld.sunkHoleAt ? undergroundWorld.sunkHoleAt(car.position.x, car.position.z) : null,
          lc: littleCar.mesh ? { x: +littleCar.mesh.position.x.toFixed(2), y: +littleCar.mesh.position.y.toFixed(2), z: +littleCar.mesh.position.z.toFixed(2) } : null,
        });
        if (window.__ugTraceHistory.length > 240) window.__ugTraceHistory.shift();
      }
    }
  } else if (jumpState.inAir) {
    ugDbg = 'airborne';
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
      // uses it to hurl the car high above the town. boost=0 ramps are
      // drive-up ramps (e.g. the underground grand ramp onto the ceiling)
      // and must roll off instead of launching with zero vertical velocity.
      const launched =
        wasOnRamp &&
        wasOnRamp.boost > 0 &&
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
          car.position.y = cityGroundHeightAt(car.position.x, car.position.z);
        }
      }
      wasOnRamp = null;
    }
  }

  // Wheel spin + front-wheel steering + body lean (skipped while driving the
  // giant robot — it stomps its legs instead, see below).
  const spin = velocity.value * delta * 2.6;
  if (!playerRobot && !playerTarantula) {
    for (const w of car.userData.wheels) w.rotation.y += spin;
    const pivs = car.userData.wheelPivots;
    for (let i = 0; i < Math.min(2, pivs.length); i++) {
      pivs[i].rotation.y = steering.value * 0.55;
    }
  } else if (playerRobot) {
    updatePlayerRobotWalk(delta, velocity.value);
  } else if (playerTarantula) {
    updatePlayerTarantulaWalk(delta, velocity.value);
  }
  // Hot-rod engine FX: the raccoon's rod rumbles and the twin tailpipes
  // breathe fire — louder and longer the faster you go, with random pops.
  if (car.userData.effects) {
    const fx = car.userData.effects;
    fx.phase += delta;
    const rev = Math.min(Math.abs(velocity.value) / 14, 1);
    fx.engine.rotation.z = Math.sin(fx.phase * 47) * 0.05 * (0.4 + rev)
      + Math.sin(fx.phase * 101 + 1.3) * 0.035;
    for (let i = 0; i < fx.flames.length; i++) {
      const fl = fx.flames[i];
      const pop = Math.sin(fx.phase * (29 + i * 9) + i * 2.4) > 0.86 ? 1 : 0;
      const l = Math.max(0.3, (0.3 + rev * 0.8) * (0.8 + Math.sin(fx.phase * 53 + i * 2.1) * 0.25) + pop * 0.55);
      fl.visible = l > 0.35;
      fl.children[0].scale.y = l;   // outer flame tongue
      fl.children[1].scale.y = Math.min(l, 0.65);   // inner core, always shy
    }
  }
  // Body lean. On a ramp the car pitches to match the slope (nose up when
  // climbing, nose down when descending) so all four tires sit on the slanted
  // ground. Off the ramp it just does the usual steering roll + accel lean.
  const targetRoll = -steering.value * 0.1;
  const accelPitch = THREE.MathUtils.clamp(velocity.value, -7, 14) * -0.004;
  if (tunnelFloorState.active) {
    const rampPitch = -Math.atan(tunnelFloorState.slope);
    car.rotation.z += (rampPitch - car.rotation.z) * 0.28;
    car.rotation.x += (0 - car.rotation.x) * 0.12;
  } else if (onStairs && worldState === 'underground') {
    // Staircase: pitch the car to the local step slope (like a ramp) but
    // bumpy — the two-point wheelbase sample makes the nose rock up as
    // the front wheels climb each riser and flatten on each tread. The
    // pitch is clamped to the stair's own slope angle so a 2-step span
    // never spikes the nose past the ramp-like tilt.
    const halfBase = 1.35;
    const fx = car.position.x + direction.x * halfBase;
    const fz = car.position.z + direction.z * halfBase;
    const rx = car.position.x - direction.x * halfBase;
    const rz = car.position.z - direction.z * halfBase;
    const fh = undergroundWorld.stairHeightAt(fx, fz);
    const rh = undergroundWorld.stairHeightAt(rx, rz);
    const frontH = Number.isFinite(fh) ? fh : car.position.y;
    const rearH = Number.isFinite(rh) ? rh : car.position.y;
    const maxPitch = Math.atan2(undergroundWorld.STAIRS.stepH, undergroundWorld.STAIRS.stepD);
    // Allow the riser bumps to overshoot the average ramp slope a little so
    // each stair reads as a distinct bump, without letting a 2-step span
    // spike the nose into a wheelie.
    const stairPitch = THREE.MathUtils.clamp(-Math.atan2(frontH - rearH, halfBase * 2), -maxPitch * 1.3, maxPitch * 1.3);
    car.rotation.z += (stairPitch - car.rotation.z) * 0.28;
    car.rotation.x += (0 - car.rotation.x) * 0.12;
  } else if (currentRamp) {
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
  } else if (mineAscentSettle > 0) {
    // Post-mine-ascent settle: keep the car perfectly level as it drives
    // away from the shaft — no accel lean or steering roll while it settles
    // onto the road, matching the level look at game start.
    car.rotation.z += (0 - car.rotation.z) * 0.12;
    car.rotation.x += (0 - car.rotation.x) * 0.12;
    mineAscentSettle -= delta;
  } else {
    car.rotation.z += (targetRoll - car.rotation.z) * 0.12;
    car.rotation.x += (accelPitch - car.rotation.x) * 0.12;
  }

  // Pothole + park lake wobble — the car rocks when driven over the pothole on
  // the main road or into the shallow lake in the NE park. Does not block
  // movement; just adds a fun visual wobble (with splashes in the lake).
  if (worldState === 'city') {
    const WATER_ZONES = [
      { x: POTHOLE.x, z: POTHOLE.z, radius: POTHOLE.radius, bump: 0.6, splash: false },
      { x: LAKE.x, z: LAKE.z, radius: LAKE.radius, bump: -0.45, splash: true },
    ];
    let activeZone = null;
    for (const zone of WATER_ZONES) {
      const dx = car.position.x - zone.x;
      const dz = car.position.z - zone.z;
      if (dx * dx + dz * dz < zone.radius * zone.radius) { activeZone = zone; break; }
    }
    if (activeZone && !potholeWobble.active) {
      potholeWobble.active = true;
      potholeWobble.t = 0;
      potholeWobble.zone = activeZone;
      if (activeZone.splash) spawnLakeSplash(activeZone.x, activeZone.z, car.position.x, car.position.z);
    }
    if (potholeWobble.active) {
      potholeWobble.t += delta;
      const wt = potholeWobble.t;
      if (wt < 1.0) {
        const decay = 1.0 - wt;
        car.rotation.z += Math.sin(wt * 18) * 0.22 * decay;
        car.rotation.x += Math.cos(wt * 22) * 0.16 * decay;
        // Vertical bump on entry — the pothole hops the car up; the lake sinks
        // it a touch into the water before it floats back out.
        if (wt < 0.3 && potholeWobble.zone) {
          car.position.y += (0.3 - wt) * potholeWobble.zone.bump;
        }
      } else {
        potholeWobble.active = false;
        potholeWobble.zone = null;
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

  // ===== Anti-stuck guarantee =====
  // A knock slide moves the car WITHOUT collision checks, and an awkward fall
  // can land the body half-inside a wall band — from there every drive
  // direction used to test as blocked, wedging the car forever. Each frame,
  // if the grounded car overlaps anything solid, push it out along the
  // shortest escape so being stuck can never persist. Airborne cars are
  // exempt (they fly over things and land ON tops via buildingTopAt), and so
  // is the ramp world (wide-open terrain, nothing solid to wedge against).
  if (worldState !== 'ramp' && !buildingLevitate.levitating && !jumpState.inAir &&
      buildingTopAt(car.position.x, car.position.z) <= 0 &&
      carIsOverlappingSolid()) {
    const fix = resolveStuck(car.position.x, car.position.z, playerSolids(), playerCarRadius);
    if (fix.moved) {
      car.position.x = fix.x;
      car.position.z = fix.z;
      shake.intensity = Math.max(shake.intensity, 0.15);
    }
  }

  // ===== Mine-shaft centering =====
  // The mine entrance is a narrow channel at x=-55 that the car drives into
  // heading north. While the car is in the approach corridor, pull it onto
  // the tunnel axis so it's easy to line up and drive in — no more scraping
  // the dirt banks on the way in. Gated on heading (roughly north) so a car
  // just driving past the meadow isn't yanked sideways, and skipped while
  // the dive cinematic owns the car.
  if (isInMineApproach()) {
    const dx = car.position.x - minePortal.triggerX;
    car.position.x += -dx * Math.min(1, MINE_CENTER_PULL * delta);
  }

  // ===== Car wash soap-glide =====
  // The wash bay's lattice walls are SOAPY: main.js never knocks or wall-bounces
  // the car against them (isPositionBlocked + playerSolids skip the soapy
  // colliders). Instead, while the car is grounded inside the bay its lateral
  // position is eased back toward the lane centre — no hard invisible stop at
  // the lattice, just a smooth soapy slide along the wall back into the middle.
  // A hard inner boundary still keeps the body from crossing the lattice.
  const washBay = undergroundWorld.carWash && undergroundWorld.carWash.bay;
  if (worldState === 'underground' && !jumpState.inAir && !buildingLevitate.levitating &&
      car.position.y < 2 && washBay &&
      Math.abs(car.position.x - washBay.cx) <= washBay.len / 2) {
    const half = washBay.wid / 2;             // wall centre-line offset from the bay centre
    const dz = car.position.z - washBay.cz;   // lateral offset off the centre lane
    // Only soap when the car is genuinely INSIDE the bay — its z must already
    // be between the two lattice walls. A car driving past beside the wash
    // (within the bay's x range but off to one side) must be left alone; the
    // old version clamped it into the lane, which read as being yanked inside.
    if (Math.abs(dz) < half) {
      const innerFace = half - 0.15;          // the lattice's inner face
      const glideBand = half * 0.5;           // beyond this, ease back to centre
      if (Math.abs(dz) > innerFace) {
        // Reaching the lattice inside the bay: hold it at the wall (a small,
        // sub-half-unit correction) while the glide below slides it free.
        car.position.z = washBay.cz + Math.sign(dz) * innerFace;
      }
      if (Math.abs(dz) > glideBand) {
        // Soapy ease back to the centre lane, frame-rate independent.
        car.position.z += -dz * Math.min(1, 2.5 * delta);
      }
    }
  }

  // Knock over props near the player. The city wraps across the seam, so its
  // knock uses the torus spans; the ramp world's props sit well inside the
  // band, so it knocks without wrap (which would otherwise let a ramp prop
  // near the edge also topple city props folded across the seam).
  if (worldState === 'city') knockAt(car.position, playerKnockRadius, worldSizeX, worldSizeZ, velocity.value);
  else if (worldState === 'ramp') knockAt(car.position, playerKnockRadius, 0, 0, velocity.value);
  else if (worldState === 'underground') knockAt(car.position, playerKnockRadius, 0, 0, velocity.value);

  }  // end !robot.playerCaptured

// ===== 2026-09-23 factory-floor attraction physics =====
  // This block runs EVERY frame (inside the robot/cinematic gate close above,
  // so it never fights a cutscene). Two attractions own the car outright:
  // the express tube ride and the magnet hold each set the
  // car position directly and are excluded from the normal physics gate above;
  // the taffy pullers and bubble wrap just poke the car (scale + wobble).
  if (worldState === 'underground' && undergroundWorld && !spiralCine.active && !mineAscent.active && !tunnelAscentCine.active && !chamberCine.active) {
    const ug = undergroundWorld;

    // ---- 5. Express tube RIDE (owns the car completely). Works BOTH ways:
    // board at the glass-city intake (s≈0, dir +1) and ride to the skate-park
    // mouth (s≈1), or board at the skate-park mouth (dir -1) and ride back to
    // the intake pad. The air-jet rings flip flow to match while a ride runs.
    if (expressState.active) {
      const len = expressTubeLength();
      expressState.s += expressState.dir * (EXPRESS_TUBE.RIDE_SPEED / len) * delta;
      const done = expressState.dir > 0 ? expressState.s >= 1 : expressState.s <= 0;
      if (done) {
        // Exit: drop off the reached mouth. Forward rides land on the empty
        // floor of the far SW corner near the skate park; return rides pop out
        // just OFF the intake pad (both mouths are grab windows now, so the
        // cooldown lets the drop settle before a mouth can catch the car on
        // the hop). A small hop lets the normal underground airborne branch
        // bring the car down onto the floor; the aerial exit shot (expressCinT)
        // holds to watch the landing, then the post-cine ease glides the
        // camera back to the chase view.
        expressState.active = false;
        expressState.lastDir = expressState.dir;
        expressState.cooldown = 2.5;
        if (ug.expressTube) ug.expressTube.dir = 1;   // rings resume normal flow
        stopTubeHum();   // the suction's over — kill the buzz as it spits out
        const ex = expressTubePoint(expressState.dir > 0 ? 1 : 0);
        const et = expressTubeTangent(expressState.dir > 0 ? 1 : 0);
        car.position.set(
          ex.x + (expressState.dir > 0 ? 0 : 2.8),
          Math.max(0.4, ex.y),
          ex.z + (expressState.dir > 0 ? 0 : 0.4)
        );
        // Spit the car OUT away from the mouth with a bit of speed so it
        // shoots clear of the glass instead of tumbling where the pipe ends —
        // forward rides aim SW over the corner, return rides shoot past the
        // pad eastward, clear of the Glass City towers.
        car.rotation.y = expressState.dir > 0
          ? Math.atan2(et.tz, -et.tx)
          : Math.atan2(-et.tz, et.tx);
        jumpState.inAir = true;
        jumpState.yVelocity = 4;
        velocity.value = 6;
        shake.intensity = Math.max(shake.intensity, 0.2);
        expressCinT = 1.6;
        _postCineCamPos.copy(camera.position);
        _postCineLookPos.copy(_lookTarget);
        _postCineTimer = 1.5;
      } else {
        const p = expressTubePoint(expressState.s);
        const t = expressTubeTangent(expressState.s);
        car.position.set(p.x, p.y, p.z);
        // Face along the travel direction: forward rides head up the rising
        // tube, return rides head back down it into the intake.
        const tx = expressState.dir > 0 ? t.tx : -t.tx;
        const tz = expressState.dir > 0 ? t.tz : -t.tz;
        const ty = expressState.dir > 0 ? t.ty : -t.ty;
        car.rotation.y = Math.atan2(tz, -tx);
        car.rotation.z = -Math.atan2(ty, Math.hypot(t.tx, t.tz));   // nose pitched along the climb/descent
        car.rotation.x = 0;
        tunnelFloorState.active = false;
        onStairs = false;
      }
    } else {
      // ---- 5b. Express tube GRAB check (either mouth) ----
      // A grounded, moving car at either open mouth (s < GRAB_S_MAX or past
      // 1 − GRAB_S_MAX) gets sucked through the whole tube toward the far end.
      // The vertical window keeps the cave floor below the elevated tube from
      // grabbing a grounded car, and `cooldown` lets an exit drop settle
      // before the mouth it landed at can catch the car again.
      if (expressState.cooldown > 0) expressState.cooldown -= delta;
      const nn = expressTubeNearest(car.position.x, car.position.z);
      const groundedTube = !jumpState.inAir && car.position.y < 2;
      const atInlet = nn.s < EXPRESS_TUBE.GRAB_S_MAX;
      const atOutlet = nn.s > 1 - EXPRESS_TUBE.GRAB_S_MAX;
      if (expressState.cooldown <= 0
        && groundedTube
        && (atInlet || atOutlet)
        && nn.horizDist < EXPRESS_TUBE.GRAB_R
        && Math.abs(nn.y - car.position.y) < 1.2
        && Math.abs(velocity.value) > 2) {
        expressState.active = true;
        expressState.dir = atInlet ? 1 : -1;
        expressState.s = nn.s;
        if (ug.expressTube) ug.expressTube.dir = expressState.dir;  // flip the air-jet rings
        playFwoosh();
        startTubeHum();   // power-line buzz for the whole suction ride
        shake.intensity = Math.max(shake.intensity, 0.4);
      }
    }

    // ---- 3. Magnet hold (owns the car while the field is on) ----
    const mag = ug.magnet;
    if (mag) {
      if (mag.active) {
        const mdx = car.position.x - mag.x, mdz = car.position.z - mag.z;
        if (magnetHold) {
          // Keep hoisting toward the ceiling coil; the car hangs there.
          const tgtY = mag.holdY - 1.6;
          car.position.y += (tgtY - car.position.y) * Math.min(1, 1.8 * delta);
          // Hold horizontally steady, wheels spinning in place reads as magnetic.
          if (Math.abs(mdx) > 0.8 || Math.abs(mdz) > 0.8) {
            car.position.x += -mdx * Math.min(1, 2.5 * delta);
            car.position.z += -mdz * Math.min(1, 2.5 * delta);
          }
          for (const w of car.userData.wheels) w.rotation.y += delta * 14;
          velocity.value *= 0.92;
        } else if (!jumpState.inAir
          && Math.abs(mdx) < mag.r
          && Math.abs(mdz) < mag.r
          && car.position.y < 1.5) {
          magnetHold = { t: 0 };
          shake.intensity = Math.max(shake.intensity, 0.28);
        }
      } else if (magnetHold) {
        // Field dropped — release the car to fall under gravity.
        magnetHold = null;
        jumpState.inAir = true;
        jumpState.yVelocity = 0;
        shake.intensity = Math.max(shake.intensity, 0.18);
      }
    }

    // ---- 2. Taffy pullers: poll the hooks (the state machine itself is
    // stepped in updateFlatCarState so a stretch survives world switches).
    const taf = ug.taffy;
    if (taf && taf.hookedAt) {
      if (!taffyState.active && taf.hookedAt(car.position.x, car.position.z)) {
        taffyState = createTaffyState(true);
        playTaffySnap();
        shake.intensity = Math.max(shake.intensity, 0.3);
      }
    }

    // ---- 1. Bubble wrap steering wobble ----
    if (bubbleWobble > 0) {
      // A fresh pop throws the car sideways a beat; the wobble decays over
      // ~half a second so popping a long strip down the lane reads as bumpy.
      const j = (Math.random() - 0.5) * 3.2 * bubbleWobble * delta;
      car.rotation.y += j;
      car.rotation.z += (Math.random() - 0.5) * 1.6 * bubbleWobble * delta;
      car.rotation.x += (Math.random() - 0.5) * 1.2 * bubbleWobble * delta;
      bubbleWobble = Math.max(0, bubbleWobble - delta * 2);
    }
  }

// ===== Holy-chamber cinematic trigger =====
  // Rolling into the open summit skylight sends the car down the shaft into
  // the chamber — but the chamber is too small to drive, so the instant the
  // car is past the rim it cuts to the staged drop-and-eject sequence. The
  // rim is a square annulus, so its open hole reaches r≈6.4 at the corners;
  // the y-gate (car must be well below the summit plane) guarantees we only
  // fire after a real drop, never out on the rim itself.
  if (worldState === 'underground' && !chamberCine.active &&
      !spiralCine.active && !mineAscent.active && !tunnelAscentCine.active) {
    const M = undergroundWorld.holy.MOUNT;
    const dxc = car.position.x - M.cx, dzc = car.position.z - M.cz;
    if (dxc * dxc + dzc * dzc < 42.5 && car.position.y < M.peakY - 1.5) {
      startChamberCine();
    }
  }

// ===== Spiral-tunnel arrival cinematic =====
  // The car drives through the opaque spiral tube from near the top to the
  // foot while the camera rides one continuous arc around it (see
  // updateCamera), settling at the exit just as the car bursts out — control
  // then hands back onto the cavern floor.
  if (spiralCine.active) {
    if (spiralCine.hold > 0) {
      // Hold the camera on the opening establishing shot while the screen
      // fades in from black — the arrival sweep (which reads as "the start")
      // only begins once the underground is actually visible.
      spiralCine.hold -= delta;
    } else {
      spiralCine.timer += delta;
    }
    const t = spiralCine.timer;
    const totalDur = spiralCine.driveDur + spiralCine.watchDur;
    if (t >= spiralCine.orbitDur) {
      const u = Math.min((t - spiralCine.orbitDur) / totalDur, 1);
      const pathPos = spiralCine.sStart + (1 - spiralCine.sStart) * u;
      const pose = spiralPoseAt(pathPos);
      car.position.set(pose.x, pose.y, pose.z);
      car.rotation.set(0, pose.heading, pose.pitch);
      // The car is genuinely driving through the tunnel the whole time —
      // the opaque tube hides it while it's deep inside, and it becomes
      // visible as it comes around the corner toward the exit.
      const spin = 13 * delta * 2.6;   // wheels spin like it's really driving
      for (const w of car.userData.wheels) w.rotation.y += spin;
      if (u >= 1) {
        finishSpiralCine();
      }
    }
  }

  // ===== Mine-ascent cinematic (underground → city) =====
  // The car drives UP the mine shaft from the buried throat, shoots out of
  // the entrance, and flies clear before control returns.
  if (mineAscent.active) {
    mineAscent.timer += delta;
    const t = mineAscent.timer;
    const spin = 13 * delta * 2.6;   // wheels spin like it's really driving
    // Just before the car shoots out of the shaft, the mine blows: a fireball
    // erupts deep inside and flames + smoke shoot out of the entrance behind
    // the car, then clear up leaving a little drifting smoke.
    if (!mineBlast.active && t >= MINE_BLAST_TRIGGER) {
      spawnMineBlast();
    }
    if (t < mineAscent.driveTotal) {
      // Phase 1: drive up the adit (z 54 → 34, y -10.5 → 0) — reverse of the
      // dive, nose-up as it climbs out of the dark.
      const u = t / mineAscent.driveTotal;
      const zz = THREE.MathUtils.lerp(54, 34, u);
      const yy = mineAditDropAt(zz);
      const slope = (mineAditDropAt(zz + 0.5) - mineAditDropAt(zz - 0.5)) / 1.0;
      const pitch = Math.atan2(slope, 1) * 0.85;   // nose-up (reverse of the dive)
      car.position.set(mineAscent.triggerX, yy, zz);
      car.rotation.set(0, -Math.PI / 2, pitch);    // heading south, nose up
    } else {
      // Phase 2: ballistic launch out of the mine entrance — the car shoots
      // out and arcs over, landing clear of the shaft.
      const t2 = t - mineAscent.driveTotal;
      const zz = 34 - mineAscent.launchVh * t2;
      const yy = mineAscent.launchVv * t2 - 0.5 * mineAscent.gravity * t2 * t2;
      car.position.set(mineAscent.triggerX, yy, zz);
      const vy = mineAscent.launchVv - mineAscent.gravity * t2;
      const pitch = THREE.MathUtils.clamp(Math.atan2(vy, mineAscent.launchVh) * 0.6, -0.5, 0.9);
      car.rotation.set(0, -Math.PI / 2, pitch);
      if (t >= mineAscent.driveTotal + mineAscent.launchTotal) {
        finishMineAscent();
      }
    }
    for (const w of car.userData.wheels) w.rotation.y += spin;
  }

  // Mine-ascent explosion FX — the fireball, flames and smoke keep animating
  // after the ascent ends so the residual smoke can dissipate.
  updateMineBlast(delta);

  // ===== Tunnel-ascent cinematic (underground → city) =====
  // The car drives UP the spiral tunnel (reverse of the arrival descent) —
  // the camera follows from behind so we see the tail (headlights facing
  // away from us) — then cuts to black and starts the mine-ascent emergence
  // where the car shoots out of the mine shaft.
  if (tunnelAscentCine.active) {
    tunnelAscentCine.timer += delta;
    const t = tunnelAscentCine.timer;
    const u = Math.min(t / tunnelAscentCine.driveDur, 1);
    tunnelAscentCine.s = 1 - (1 - tunnelAscentCine.sStart) * u;
    const pose = spiralPoseAtUp(tunnelAscentCine.s);
    car.position.set(pose.x, pose.y, pose.z);
    car.rotation.set(0, pose.heading, pose.pitch);
    const spin = 13 * delta * 2.6;   // wheels spin like it's really driving
    for (const w of car.userData.wheels) w.rotation.y += spin;
    if (u >= 1) {
      // Restore the tube, cut to black, and start the mine-ascent emergence.
      if (undergroundWorld.spiralTubeMat) {
        undergroundWorld.spiralTubeMat.transparent = false;
        undergroundWorld.spiralTubeMat.opacity = 1;
      }
      tunnelAscentCine.active = false;
      _fadeOverlay.style.transition = 'none';
      _fadeOverlay.style.opacity = '1';
      startMineAscent();
    }
  }

  // ===== Holy-chamber cinematic =====
  // Owns the car position through the drop / pan / lift / flight sequence.
  if (chamberCine.active) updateChamberCine(delta);

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
    // A crushed car runs the same flat-mode lifecycle as the player: it lies
    // low while it keeps driving, then pops back up. `t.flat` only exists
    // once the player's steamroller has flattened it (see the crush below).
    if (t.flat) {
      t.flat = stepFlatCarState(t.flat, delta, Math.abs(t.speedCur || 0) > 0.8);
      t.mesh.scale.y = getFlatCarScaleY(t.flat);
    }
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
    // If a car is already closer than the safe gap to the one ahead (e.g. the
    // player knocked it into the queue), ease it BACK to a two-car-length gap
    // instead of sitting bumper-to-bumper — good drivers re-establish their
    // spacing after an accident.
    if (ahead < CAR_FOLLOW_STOP) {
      speedCur = -Math.min(t.speed * 0.4, (CAR_FOLLOW_STOP - ahead) * 1.2);
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

    // The PLAYER's heavy rides (steamroller drum / monster truck nose) crush
    // traffic: when the front is partway over a car, that car goes flat — the
    // very same flat-mode as the player gets run over by the traveling
    // steamroller. Each car is tracked separately, so a whole row can be
    // squashed at once; a crushed car pops back up after it drives around for
    // a while.
    if (playerSteamroller && !jumpState.inAir) {
      const pfwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
      const reach = playerMonster ? 2.9 : 2.3;
      const pdrumX = car.position.x + pfwd.x * reach;
      const pdrumZ = car.position.z + pfwd.z * reach;
      const cdx = wrappedDeltaX(pdrumX, t.mesh.position.x);
      const cdz = wrappedDeltaZ(pdrumZ, t.mesh.position.z);
      if (cdx * cdx + cdz * cdz < 3.5 * 3.5 && !(t.flat && t.flat.phase === 'bounce')) {
        if (!t.flat) t.flat = createFlatCarState(false);
        t.flat.active = true;
        t.flat.phase = 'flat';
        t.flat.timer = 0;
      }
    }

    // A steamroller flattens the player car when its drum drives over it.
    // It's a ghost — no knock, no shove — the drum just rolls over the car
    // and squashes it flat. A player DRIVING a steamroller doesn't get
    // flattened (it's their shtick now).
    if (t.isSteamroller && !playerSteamroller && !playerKnock && !jumpState.inAir) {
      const fwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(t.mesh.quaternion);
      const drumX = t.mesh.position.x + fwd.x * 2.3;
      const drumZ = t.mesh.position.z + fwd.z * 2.3;
      const pdx = wrappedDeltaX(drumX, car.position.x);
      const pdz = wrappedDeltaZ(drumZ, car.position.z);
      if (pdx * pdx + pdz * pdz < 3.5 * 3.5) {
        flattenCarFromRock();
      }
    }
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
    playerIsRobot: playerRobot,
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
  updateTubeHum();   // distance-fade the express-tube buzz to the camera

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

  // Twinkling gemstones lining the mine shaft
  updateMineGems(mineGems, delta);

  // Fire hydrant water sprays
  updateHydrantSprays(delta);

  // Park lake splash droplets (city scene only — the spawn is gated above)
  updateLakeSplashes(delta);

  // Animate hovering rings in the open building
  updateHoveringRings(clock.elapsedTime);

  // Blinking alarms and beacons on the new city landmarks
  updateCityBuildings(clock.elapsedTime);

  // Small NW-corner marker arrow: spin on its axis, planted on the ground
  updateNwCornerArrow(delta);

  // Walk the pedestrians (they scream and scatter when you or the robot get close)
  updatePeople(delta, { player: car.position, robot: robot.mesh.position, aiOnly: colliders.filter((c) => c.aiOnly) });
  }  // end city ambience

  // Animate knockable props in BOTH worlds — the city's props and the ramp
  // world's pins / dominoes / barrels / logs all run through this one system.
  updateKnockables(delta);

  // The giant rolling rock can flatten the car; while flat, the car still
  // drives but settles lower to the ground and eventually rebounds taller.
  updateFlatCarState(delta);

  // Underworld animation: the Glass City's mechanical birds flap and its blue
  // trees slowly turn (the update early-outs unless you're near the city).
  // Task #35: while we're down here, also watch for the car ghosting at floor
  // level inside an extended pyramid tier (soft colliders never block, and a
  // car that entered too low to snap up just sits in the boxes). After a
  // moment it gets a gentle nudge back north out onto open floor.
  if (worldState === 'underground') {
    // Feed the little car follower position in too (only when it's actually
    // driving around — not while it's hidden waiting or inside the tunnel), so
    // it also advances the checkerboard tile colors when it drives over the
    // second roof. When the player is driving the train, every trailing car
    // advances the tiles it drives over as well.
    undergroundWorld.update(
      delta,
      car.position,
      littleCar.mesh && littleCar.mesh.visible ? littleCar.mesh.position : null,
      playerTrain && trainCars.length ? trainCars.map((m) => m.position) : null
    );
    // The underground's steam press flattens the car when it's under the head
    // while it's slammed down (same flatten/bounce as the boulder/steamroller).
    if (undergroundWorld.steamPress && undergroundWorld.steamPress.slamActive) {
      flattenCarFromRock();
    }
    // Record the player's path so the little car can follow it up the ramps
    // and onto the ceiling, then advance the little car follower: waits ~30s,
    // rides the spiral tunnel out, then follows the player around the cavern.
    // During the holy-chamber cinematic the car's scripted path goes inside
    // the mountain — don't record that so the little car can't follow into it.
    if (!chamberCine.active) recordLittleCarTrail(delta);
    updateLittleCar(delta);
    // The little car is hittable like a city traffic car — shove it out of
    // the way when the player drives into it. Skipped during cinematics so
    // the scripted spiral descent can't be thrown off course.
    if (!chamberCine.active && !spiralCine.active && !mineAscent.active && !tunnelAscentCine.active) {
      resolveLittleCarCollision(delta);
    }
    // Task #35a: off-slab recovery — the cavern floor mesh spans the slab
    // (292×276 centered at (0,41.5)) but nothing walls its edges, so a huge
    // knock can throw the car past the rim onto invisible floor. Settle it
    // back on open course ground instead of letting it drive in the void.
    if (car.position.x < -148 || car.position.x > 148 || car.position.z < -98.5 || car.position.z > 181.5) {
      car.position.set(60, 0, -15);
      car.rotation.set(0, Math.PI / 2, 0);
      velocity.value = 0;
      steering.value = 0;
      playerKnock = null;
      jumpState.inAir = false;
      jumpState.yVelocity = 0;
      wasOnRamp = null;
      stairGhostTimer = 0;
      ugRecoveries += 1;
      shake.intensity = Math.max(shake.intensity, 0.3);
    }
    // Task #35b: ghost-in-the-pyramid nudge — see stairGhostAt in the level.
    if (undergroundWorld.stairGhostAt && undergroundWorld.stairGhostAt(car.position.x, car.position.y, car.position.z)) {
      stairGhostTimer += delta;
      if (stairGhostTimer > 1.5) {
        stairGhostTimer = 0;
        knockPlayerAway(0, 1, 80, 1.6, 2.6);   // nudge away from the wall (+z)
      }
    } else {
      stairGhostTimer = 0;
    }
  }

  // Tier 3 moving dangers (hammers, trebuchet, boulder, wheel rim) — ramp
  // world only. Runs every frame; it does its own worldState gate.
  updateRampWorldDanger(delta);

  // Blue car follow in the ramp world: countdown, then chase + knock props.
  updateRampWorldBumper(delta);

  // Wild monster truck in the ramp world: patrols, ramp-jumps, flattens you.
  updateRampWorldMonster(delta);

  // A dumpling of a guardian tarantula sleeps in the velodrome bowl until you
  // bump it — contact blazes its eyes red and starts its 30-second roam.
  if (rampTarantula.mode === 'sleep') {
    const td = Math.hypot(car.position.x - rampTarantula.mesh.position.x, car.position.z - rampTarantula.mesh.position.z);
    if (td < 4.5) wakeTarantula(rampTarantula);
  }
  updateTarantulaNpc(rampTarantula, delta);

  // The freight consist follows the locomotive wherever you drive.
  updateTrainCars(delta);
  // A train chosen as the CHASE ride drags its own consist after the bumper.
  updateChaseTrainCars(delta);

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

  // ===== Hilltop portal trigger =====
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
        // Rise upward: slow start, then accelerate hard — but the WHOLE flight
        // still takes ~4 seconds (same as before), the car just ends up far
        // higher: a dot in the sky by the time the swap fires.
        buildingLevitate.levitateTime += delta;
        const t = Math.min(buildingLevitate.levitateTime / 4, 1);  // 0..1
        const speed = 70 * t * t;  // quadratic ease-in, peaks at 70 u/s
        car.position.y += speed * delta;
        // After the car has threaded a couple of rings, gently steer it toward
        // the ring column's centre so the ascent always ends dead-centre no
        // matter where the car entered the hall. The pull ramps in with height
        // (0 at the 2nd ring, full strength by mid-flight) and is strong enough
        // to converge from the hall's farthest corner before the swap fires.
        const ringCx = PORTAL_HILL.x;
        const ringCz = PORTAL_HILL.z;
        const ringPullStart = 12;   // y past the 2nd ring — begin centering
        const ringPullFull = 60;    // y where the pull reaches full strength
        if (car.position.y > ringPullStart) {
          const pull = Math.min((car.position.y - ringPullStart) / (ringPullFull - ringPullStart), 1);
          const strength = 7 * pull;   // u/s of horizontal convergence at full pull
          const dx = ringCx - car.position.x;
          const dz = ringCz - car.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.01) {
            const step = Math.min(strength * delta, dist);
            car.position.x += (dx / dist) * step;
            car.position.z += (dz / dist) * step;
          }
        }
        // Slowly fade horizontal velocity to zero
        velocity.value *= 0.95;
        // Float SO high the car is barely visible before jumping to ramp world.
        if (car.position.y > 110) {
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
  // When the car drives deep into the mine tunnel (south past z=34), it now
  // DRIVES DOWN the excavated adit: forward-and-down along the graded channel
  // (z 34 → 54, dropping ~10.5 units) while the fixed behind-the-car camera
  // watches it shrink into the jewelled dark — then the fade-cut swaps to
  // the spiral-tunnel arrival cinematic in the underground world.
  if (portalGrace <= 0 && worldState === 'city') {
    const inTunnel = isInMineDiveTrigger(car.position.x, car.position.z, minePortal) && !jumpState.inAir;
    if (inTunnel) {
      if (!minePortal.active) {
        minePortal.active = true;
        minePortal.timer = 0;
        minePortal.baseY = car.position.y;   // remember the surface height
        // Keep whatever forward speed the driver had — the adit carries it down.
      }
    } else if (minePortal.active && minePortal.timer < 0.5) {
      // Car left the trigger zone before teleport — reset, but only in the
      // opening half-second. Once active the dive scripts the car down the
      // adit; it leaves the open-pit zone (z > triggerZ1) well after this and
      // the reset must never cancel a committed run before the world swap.
      minePortal.active = false;
      minePortal.timer = 0;
      car.rotation.z = 0;    // undo any tilt
      _fadeOverlay.style.transition = 'none';
      _fadeOverlay.style.opacity = '0';
    }
    if (minePortal.active) {
      minePortal.timer += delta;
      const t = Math.min(minePortal.timer / minePortal.diveTotal, 1);

      // Forward progress along the channel: monotonic z advance, eased so the
      // car rolls off the meadow, picks up speed down the slope, then settles
      // into the throat. The car genuinely TRAVELS — it doesn't just nod in place.
      const zz = THREE.MathUtils.lerp(minePortal.z0, minePortal.z1, t);
      const yy = minePortal.baseY + mineAditDropAt(zz);

      // Gentle nose-down pitch matching the adit's slope (reads as driving
      // downhill), plus a touch of body roll for life.
      const slope = (mineAditDropAt(zz + 0.5) - mineAditDropAt(zz - 0.5)) / 1.0;
      const pitch = Math.atan2(-slope, 1) * 0.85;
      car.rotation.set(0, Math.PI / 2, pitch);   // heading +z (north), nose down

      // Keep the car centred on the channel axis (the banks guide it; no
      // steering input needed — the adit is a one-way chute).
      car.position.set(minePortal.triggerX, yy, zz);

      // Camera shake builds as the dive deepens
      shake.intensity = Math.max(shake.intensity, 0.12 + t * 0.35);
      // Fade to black as the car sinks below the bench crests — a GRADUAL
      // ramp (not a hard cut) so the car visibly vanishes into the gloom,
      // then the swap to the underground world happens under full black.
      if (t > 0.78) {
        const fadeT = THREE.MathUtils.clamp((t - 0.78) / 0.22, 0, 1);
        _fadeOverlay.style.transition = 'none';
        _fadeOverlay.style.opacity = String(fadeT);
      }
      // Swap worlds once the full dive completes — the arrival cinematic
      // takes it from there.
      if (minePortal.timer >= minePortal.diveTotal) {
        enterUndergroundWorld();
      }
    }
  }

  // Underground world: return portal (tunnel foot → city)
  // When the car gets near the tunnel foot entrance, we play the reverse of
  // the arrival's "car inside the tunnel" shot — the car drives UP the spiral
  // tunnel (headlights facing away from us) — then cut to black and start
  // the mine-ascent emergence in the city.
  // Held off during the arrival cinematic — the car exits right through this
  // zone and must not be instantly teleported back out again.
  if (portalGrace <= 0 && worldState === 'underground' && !spiralCine.active && !mineAscent.active && !tunnelAscentCine.active) {
    const tFoot = tunnelPoint(1);   // tunnel foot entrance
    if (!jumpState.inAir &&
        isInUndergroundReturnZone(car.position.x, car.position.z, tFoot.x, tFoot.z, 5)) {
      // Car touched the tunnel foot — play the reverse "drive up the tunnel"
      // cinematic, then cut to the mine-ascent emergence.
      startTunnelAscentCine();
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

await __loaderYield(0.98, 'the finish line');

// ===== Loading screen handoff =====
// Everything is built and the first frame is about to render: tell the loader
// (index.html) to snap to 100% and fade out, revealing the game.
if (window.__loadingDone) window.__loadingDone();

// ===== Dev hook (?debug in the URL) =====
// Exposes a minimal read/teleport API on window for automated testing.
// Inert during normal play.
if (location.search.includes('debug')) {
  // ?debug&stage=ug-course: auto-jump into the underground world and park the
  // car on the roof facing the G2 gate — used by headless screenshot tooling.
  if (new URLSearchParams(location.search).get('stage') === 'ug-course') {
    const t = setInterval(() => {
      try {
        const c = window.__game.car();
        if (c.world === 'underground') {
          clearInterval(t);
          setTimeout(() => { try { window.__game.placeAt(42, 31.5, 28, Math.PI); } catch (e) {} }, 800);
        } else {
          window.__game.toUnderground();
        }
      } catch (e) {}
    }, 250);
  }
  window.__game = {
    car: () => ({ x: car.position.x, y: car.position.y, z: car.position.z, rx: car.rotation.x, rz: car.rotation.z, ry: car.rotation.y, scaleY: +car.scale.y.toFixed(3), world: worldState }),
    // Gear menu: which car body the player is driving right now.
    carKind: () => ({ kind: playerCarKind, steamroller: playerSteamroller, monster: playerMonster, indy: playerIndy, train: playerTrain, robot: playerRobot, tarantula: playerTarantula }),
    setCar(kind) { swapPlayerCar(kind); },
    // TEMP DEBUG: camera position + hole-fall cinematic state.
    cam: () => ({
      x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2),
      holeFall: holeFallActive, holeFallT: +holeFallTimer.toFixed(2),
      camRadius: +camRadius.toFixed(2), camPhi: +cameraOrbit.phi.toFixed(2),
    }),
    pg: () => ({ grace: +portalGrace.toFixed(2), inAir: jumpState.inAir }),
    cine: () => ({
      robot: robot.playerCaptured, spiral: spiralCine.active, mineA: mineAscent.active,
      tunnelA: tunnelAscentCine.active,
      paused: isPaused,
    }),
    vel: () => ({ v: +velocity.value.toFixed(2), s: +steering.value.toFixed(2) }),
    monster: () => ({
      inRamp: monsterInRamp, timer: +monsterRampTimer.toFixed(2),
      patrol: monsterPatrol, air: monsterAir, vy: +monsterVy.toFixed(2),
      pos: monsterTruck ? { x: +monsterTruck.position.x.toFixed(1), y: +monsterTruck.position.y.toFixed(1), z: +monsterTruck.position.z.toFixed(1) } : null,
    }),
    // TEMP DEBUG: expose the car's quaternion and computed forward direction.
    fwd: () => {
      const d = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion);
      d.y = 0; d.normalize();
      return {
        q: { x: +car.quaternion.x.toFixed(3), y: +car.quaternion.y.toFixed(3), z: +car.quaternion.z.toFixed(3), w: +car.quaternion.w.toFixed(3) },
        fwd: { x: +d.x.toFixed(3), z: +d.z.toFixed(3) },
      };
    },
    // Small NW-corner marker arrow (read-only): live position
    nwArrow: () => ({ x: nwArrow.position.x, y: nwArrow.position.y, z: nwArrow.position.z }),
    // Place the car at exact (x, y, z) — useful for staging a ceiling-hole
    // fall without fighting the keyboard.
    placeAt(x, y, z, heading = 0) {
      car.position.set(x, y, z);
      car.rotation.set(0, heading, 0);
      velocity.value = 0;
      steering.value = 0;
      jumpState.inAir = false;
      jumpState.yVelocity = 0;
      wasOnRamp = null;
      playerKnock = null;
    },
    teleport(x, z, heading = 0) {
      car.position.set(x, groundHeight, z);
      car.rotation.set(0, heading, 0);
      velocity.value = 0;
      steering.value = 0;
      playerKnock = null;   // don't carry a stale slide into the new spot
    },
    // Surface-aware teleport (?debug only): drops the car onto whatever
    // collider top occupies (x,z) — ledges, planks, platforms, roofs — so
    // automated tests can stage directly on raised course geometry instead
    // of fighting keyboard precision.
    tp2(x, z, heading = 0) {
      const top = buildingTopAt(x, z);
      car.position.set(x, top > 0 ? top : groundHeight, z);
      car.rotation.set(0, heading, 0);
      velocity.value = 0;
      steering.value = 0;
      jumpState.inAir = false;
      jumpState.yVelocity = 0;
      wasOnRamp = null;
      playerKnock = null;   // don't carry a stale slide into the new spot
    },
    // Force-return to the city world (?debug only): moves the car back into
    // the main scene so tests can re-stage a mine dive from a clean state.
    resetToCity() {
      if (worldState === 'city') return;
      if (worldState === 'ramp') enterCityWorld();
      else if (worldState === 'underground') enterCityWorld();
    },
    // Force-enter the ramp world (?debug only): moves the car into the ramp
    // scene so tests can stage log / prop collisions directly.
    toRamp() {
      if (worldState === 'ramp') return;
      enterRampWorld();
    },
    // Force-enter the underground world (?debug only): jumps straight past
    // the mine-dive and spiral arrival so tests can stage on the course.
    toUnderground() {
      if (worldState === 'underground') return;
      enterUndergroundWorld();
      if (spiralCine.active) finishSpiralCine();
    },
    // Underground course readout (?debug only): how many runs have crossed the
    // FINISH ribbon since the level loaded.
    ugCourse: () => ({ finishCount: undergroundWorld.finishCount }),
    // Giant conveyor lane (idea #33): footprint + drag direction/speed, plus
    // whether the car is currently over the belt.
    ugConveyor: () => {
      const c = undergroundWorld.conveyor;
      const car = car.position;
      return {
        ...c,
        onBelt: Math.abs(car.x - c.cx) < c.len / 2 && Math.abs(car.z - c.cz) < c.wid / 2 && car.y < 1.5,
        gems: undergroundWorld.beltGems.filter((g) => g.active).length,
      };
    },
    // Shooting-star state (idea #15): active meteor count + positions.
    ugMeteors: () => undergroundWorld.sky.meteors
      .filter((m) => m.active)
      .map((m) => ({ x: +m.x.toFixed(1), y: +m.y.toFixed(1), z: +m.z.toFixed(1), t: +(m.life / m.maxLife).toFixed(2) })),
    // Interactive shrine state (idea #24): reaction/idle + arm & goat angles.
    ugShrine: () => ({
      react: +undergroundWorld.holy.react.toFixed(2),
      idle: +undergroundWorld.holy.idle.toFixed(2),
      armR: +undergroundWorld.holy.armR.rotation.z.toFixed(2),
      armL: +undergroundWorld.holy.armL.rotation.z.toFixed(2),
      goats: undergroundWorld.holy.goats.map((g) => +g.rotation.y.toFixed(2)),
      honk: () => undergroundWorld.holy.honk(),
    }),
    // Glass City plaza balloons: alive/respawn per balloon (pop on drive-over).
    ugCrystals: () => undergroundWorld.glassCrystals.map((c) => ({
      x: c.x, z: c.z, alive: c.alive, respawn: +Math.max(0, c.respawn).toFixed(1),
    })),
    // Checkerboard ceiling state (?debug): tile-grid dims + the color state
    // of the tile under a given (x, z) so tests can confirm the drive-over
    // neon sequence (0/1 = dark shades, 2.. = neon index, red is terminal).
    ugChecker: (x, z) => {
      const c = undergroundWorld.checker;
      const tx = Math.floor((x - c.minX) / c.tileSz);
      const tz = Math.floor((z - c.minZ) / c.tileSz);
      const idx = tz * c.tilesX + tx;
      const inBounds = tx >= 0 && tx < c.tilesX && tz >= 0 && tz < c.tilesZ;
      return {
        count: c.state.length,
        tilesX: c.tilesX,
        tilesZ: c.tilesZ,
        under: inBounds ? c.state[idx] : -1,
        gone: inBounds ? c.gone[idx] : -1,
        lit: Array.from(c.state).filter((s) => s >= 2).length,
        red: Array.from(c.state).filter((s) => s >= 2 + c.neon.length - 1).length,
        holes: Array.from(c.gone).filter((g) => g === 1).length,
        holeOutlines: c.holeCount,
        tick: c.tick,
        gridGeoBS: c.grid.geometry.boundingSphere
          ? { x: +c.grid.geometry.boundingSphere.center.x.toFixed(1), y: +c.grid.geometry.boundingSphere.center.y.toFixed(1), z: +c.grid.geometry.boundingSphere.center.z.toFixed(1), r: +c.grid.geometry.boundingSphere.radius.toFixed(1) }
          : null,
        gridObjBS: c.grid.boundingSphere
          ? { x: +c.grid.boundingSphere.center.x.toFixed(1), y: +c.grid.boundingSphere.center.y.toFixed(1), z: +c.grid.boundingSphere.center.z.toFixed(1), r: +c.grid.boundingSphere.radius.toFixed(1) }
          : null,
      };
    },
    // ?debug: force the tile under (x, z) to reach red and start crumbling —
    // for testing the hole-fall + glowing hole-outline visuals.
    ugForceCrumble: (x, z) => undergroundWorld.forceCrumble(x, z),
    // ?debug: show/hide the hole-outline frames (for verifying they render).
    ugHoleFramesVisible: (v) => {
      undergroundWorld.checker.holeFrames.visible = v;
      return undergroundWorld.checker.holeFrames.visible;
    },
    // ?debug: art deco statue states (standing / falling / landed) so tests
    // can confirm a statue topples when its tile crumbles away.
    ugStatues: () => undergroundWorld.statues.map((s) => ({
      x: +s.x.toFixed(1),
      z: +s.z.toFixed(1),
      y: +s.group.position.y.toFixed(1),
      state: s.state,
      fallT: +s.fallT.toFixed(2),
      tileGone: undergroundWorld.checker.gone[s.idx] === 1,
    })),
    // ?debug: force the tile under a statue to crumble (for testing the
    // lean-and-fall without driving over the tile 5 times).
    ugStatueCrumble: (n) => {
      const s = undergroundWorld.statues[n];
      if (!s) return false;
      return undergroundWorld.forceCrumble(s.x, s.z);
    },
    // ?debug: trace the underground physics state at the car's position.
    ugTrace: () => ({
      x: +car.position.x.toFixed(2),
      y: +car.position.y.toFixed(2),
      z: +car.position.z.toFixed(2),
      inAir: jumpState.inAir,
      yVel: +jumpState.yVelocity.toFixed(2),
      vel: +velocity.value.toFixed(2),
      bTop: +buildingTopAt(car.position.x, car.position.z).toFixed(2),
      eTop: +ugElevatorTopAt(car.position.x, car.position.z, car.position.y).toFixed(2),
      wasOnRamp: wasOnRamp ? { runX: wasOnRamp.runX, runZ: wasOnRamp.runZ, h: wasOnRamp.height, len: wasOnRamp.len } : null,
      dbg: ugDbg,
      hole: undergroundWorld && undergroundWorld.sunkHoleAt ? undergroundWorld.sunkHoleAt(car.position.x, car.position.z) : null,
      rampSurf: (() => {
        const r = ugRampInfoAt(car.position.x, car.position.z);
        return r ? +(r.baseY + r.height * r.s).toFixed(2) : null;
      })(),
    }),
    // Rolling park-region trace (?debug): branch labels + position while the
    // car is around the sunken skate park (last ~4s).
    ugParkFrames: () => (window.__ugTraceHistory || []).map((f) => `${f.x},${f.y} dbg=${f.dbg} air0=${f.air0} airRan=${f.airRan} inAir=${f.inAir} eTop=${f.eTop} hole=${f.hole}`),
    // Glowing hole-outline frames (?debug): world position of each orange
    // frame around a crumbled tile, so tests can confirm they sit exactly on
    // the hole.
    ugHoleFrames: () => {
      const c = undergroundWorld.checker;
      const out = [];
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      for (let k = 0; k < c.holeCount; k++) {
        c.holeFrames.getMatrixAt(k, m);
        p.setFromMatrixPosition(m);
        out.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
      }
      const gbs = c.holeFrames.geometry.boundingSphere;
      const obs = c.holeFrames.boundingSphere;
      return {
        frames: out,
        emissive: +c.holeFrames.material.emissiveIntensity.toFixed(3),
        color: '#' + c.holeFrames.material.emissive.getHexString(),
        frustumCulled: c.holeFrames.frustumCulled,
        geoBS: gbs ? { x: +gbs.center.x.toFixed(1), y: +gbs.center.y.toFixed(1), z: +gbs.center.z.toFixed(1), r: +gbs.radius.toFixed(1) } : null,
        objBS: obs ? { x: +obs.center.x.toFixed(1), y: +obs.center.y.toFixed(1), z: +obs.center.z.toFixed(1), r: +obs.radius.toFixed(1) } : null,
      };
    },
    // Live instance color of the tile under (x, z) — for verifying the
    // red/white crumble flash (?debug only).
    ugTileColor: (x, z) => {
      const c = undergroundWorld.checker;
      const tx = Math.floor((x - c.minX) / c.tileSz);
      const tz = Math.floor((z - c.minZ) / c.tileSz);
      const idx = tz * c.tilesX + tx;
      const col = c.grid.instanceColor;
      return {
        r: +col.getX(idx).toFixed(2),
        g: +col.getY(idx).toFixed(2),
        b: +col.getZ(idx).toFixed(2),
      };
    },
    // Solid staircase state (tasks #25–#28, simplified to a static ramp):
    // the footprint constants for the one-piece wedge + big flat roof.
    ugStairs: () => ({
      cfg: undergroundWorld.STAIRS,
    }),
    // Grand ramp + candy-waterfall state (?debug): the north ramp's footprint
    // constants and a live snapshot of the gemstone pool (active count, plus
    // a few sample positions/states for automated tests).
    ugGrand: () => ({
      cfg: undergroundWorld.GRAND,
      gems: undergroundWorld.gemstones.map((g) => ({
        active: g.active,
        x: +g.x.toFixed(2),
        y: +g.y.toFixed(2),
        z: +g.z.toFixed(2),
        knocked: g.knocked,
        big: g.big,
        heavy: g.heavy,
        color: g.mesh.material.color.getHex(),
        slamCd: +g.slamCd.toFixed(2),
      })),
    }),
    // Holy Mountain state (?debug): layout config, mystery-light pulse and
    // whether the car has discovered the hollow chamber yet.
    ugMountain: () => ({
      cfg: undergroundWorld.holy.MOUNT,
      entered: undergroundWorld.holy.entered,
      glow: +undergroundWorld.holy.light.intensity.toFixed(2),
    }),
    // Task #35 off-slab recovery counter for automated testing.
    ugRecoveries: () => ugRecoveries,
    // TEMP DEBUG: rendered geometry — checker tile bounding box, car + little
    // car wheel world positions, and the ceiling collider h.
    ugGeom: () => {
      const ck = undergroundWorld.checker;
      const grid = ck.grid;
      if (!grid.geometry.boundingBox) grid.geometry.computeBoundingBox();
      const bb = grid.geometry.boundingBox;
      const tileTop = bb.max.y;
      const carWheels = car.userData.wheels ? car.userData.wheels.map((w) => {
        const p = new THREE.Vector3();
        w.getWorldPosition(p);
        return { y: +p.y.toFixed(3) };
      }) : null;
      const lcWheels = littleCar.mesh && littleCar.mesh.userData.wheels ? littleCar.mesh.userData.wheels.map((w) => {
        const p = new THREE.Vector3();
        w.getWorldPosition(p);
        return { y: +p.y.toFixed(3) };
      }) : null;
      const ceilCollider = ugColliders.find((c) => c.ceiling);
      return {
        tileTop: +tileTop.toFixed(3),
        tileBottom: +bb.min.y.toFixed(3),
        carY: +car.position.y.toFixed(3),
        carWheels,
        lcY: littleCar.mesh ? +littleCar.mesh.position.y.toFixed(3) : null,
        lcWheels,
        ceilColliderH: ceilCollider ? ceilCollider.h : null,
      };
    },
    // Little car follower state (?debug): phase, countdown, and the little
    // car's live position/heading so tests can verify the tunnel exit event.
    littleCar: () => ({
      phase: littleCar.phase,
      timer: +littleCar.timer.toFixed(2),
      visible: littleCar.mesh ? littleCar.mesh.visible : false,
      pos: littleCar.mesh ? {
        x: +littleCar.mesh.position.x.toFixed(1),
        y: +littleCar.mesh.position.y.toFixed(1),
        z: +littleCar.mesh.position.z.toFixed(1),
        heading: +littleCar.mesh.rotation.y.toFixed(2),
      } : null,
    }),
    // Vinyl floor state (?debug): confirms the cavern floor carries the
    // 1970s vinyl kitchen-floor canvas texture (map type, repeat, and the
    // set of pattern colours actually painted on the canvas).
    ugFloor: () => {
      const f = undergroundWorld.floor;
      const mat = f.material;
      const tex = mat.map;
      const canvas = tex ? tex.image : null;
      const colors = new Set();
      if (canvas) {
        const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < img.length; i += 4) {
          colors.add(`${img[i]},${img[i + 1]},${img[i + 2]}`);
        }
      }
      return {
        hasMap: !!tex,
        mapType: tex ? tex.constructor.name : null,
        repeat: tex ? [tex.repeat.x, tex.repeat.y] : null,
        colorSpace: tex ? tex.colorSpace : null,
        uniqueColors: colors.size,
        sample: Array.from(colors).slice(0, 12),
        pattern: {
          base: colors.has('58,58,58'),        // #3a3a3a dark gray background
          rust: colors.has('184,92,56'),       // #b85c38 starburst
          gold: colors.has('217,164,65'),      // #d9a441 centre diamond
          border: colors.has('156,131,88'),    // #9c8358 frame
        },
      };
    },
    // Spiral-tunnel tube material state (?debug) — the tunnel-ascent cine
    // fades it translucent so the car is visible driving up inside it.
    ugTube: () => ({
      transparent: undergroundWorld.spiralTubeMat.transparent,
      opacity: +undergroundWorld.spiralTubeMat.opacity.toFixed(2),
    }),
    // Spiral-arrival cinematic state (?debug) for automated testing.
    spiralCine: () => ({
      active: spiralCine.active,
      timer: +spiralCine.timer.toFixed(2),
      visible: car.visible,
    }),
    // Force-finish the arrival cinematic (?debug) — lets tests skip ahead
    // to the control handoff at the tunnel foot.
    finishSpiral: () => { if (spiralCine.active) finishSpiralCine(); },
    // Mine-ascent cinematic state (?debug) for automated testing.
    mineAscent: () => ({
      active: mineAscent.active,
      timer: +mineAscent.timer.toFixed(2),
      car: mineAscent.active ? { x: +car.position.x.toFixed(1), y: +car.position.y.toFixed(1), z: +car.position.z.toFixed(1) } : null,
    }),
    // Force-finish the ascent cinematic (?debug) — lets tests skip ahead to
    // the control handoff after the car lands clear of the mine shaft.
    finishAscent: () => { if (mineAscent.active) finishMineAscent(); },
    // Force-start the ascent cinematic (?debug) — lets tests stage the
    // underground→city return without re-running the dive + spiral flow.
    startAscent: () => { if (worldState === 'underground') startMineAscent(); },
    // Mine-ascent explosion FX state (?debug) for automated testing.
    mineBlast: () => ({
      active: mineBlast.active,
      timer: +mineBlast.timer.toFixed(2),
      fireball: mineBlast.fireball ? {
        x: +mineBlast.fireball.position.x.toFixed(1),
        y: +mineBlast.fireball.position.y.toFixed(1),
        z: +mineBlast.fireball.position.z.toFixed(1),
        scale: +mineBlast.fireball.scale.x.toFixed(2),
        opacity: +mineBlast.fireball.material.opacity.toFixed(2),
      } : null,
      flames: mineBlast.flames.length,
      smoke: mineBlast.smoke.length,
    }),
    // Tunnel-ascent cinematic state (?debug) for automated testing.
    tunnelAscent: () => ({
      active: tunnelAscentCine.active,
      timer: +tunnelAscentCine.timer.toFixed(2),
      s: +tunnelAscentCine.s.toFixed(3),
      car: tunnelAscentCine.active ? { x: +car.position.x.toFixed(1), y: +car.position.y.toFixed(1), z: +car.position.z.toFixed(1) } : null,
    }),
    // Force-start the tunnel-ascent cinematic (?debug) — lets tests stage the
    // underground→city return without re-running the dive + spiral flow.
    startTunnelAscent: () => { if (worldState === 'underground') startTunnelAscentCine(); },
    // Camera readout (?debug) for verifying cinematic framing numerically.
    cam: () => ({ x: +camera.position.x.toFixed(1), y: +camera.position.y.toFixed(1), z: +camera.position.z.toFixed(1) }),
    // TEMP debug: camera internals during the mine dive.
    camDbg: () => _camDbg,
    camDebug: () => ({
      camOffset: { x: +camOffset.x.toFixed(2), y: +camOffset.y.toFixed(2), z: +camOffset.z.toFixed(2) },
      camTarget: { x: +cameraTarget.x.toFixed(2), y: +cameraTarget.y.toFixed(2), z: +cameraTarget.z.toFixed(2) },
      look: { x: +_lookTarget.x.toFixed(2), y: +_lookTarget.y.toFixed(2), z: +_lookTarget.z.toFixed(2) },
      mineActive: minePortal.active,
      mineTimer: +minePortal.timer.toFixed(2),
      postCineTimer: +_postCineTimer.toFixed(2),
      postCineHandoff: _postCineHandoff,
    }),
    // Mine-adit gem readout (?debug): positions of the excavation's facet
    // gems (octahedrons/dodecahedrons/cones) so tests can confirm they line
    // the shaft from the mouth down to the deep throat.
    mineGems: () => {
      const gems = [];
      scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const p = o.geometry.parameters;
        const isGem =
          (o.geometry.type === 'OctahedronGeometry' && p && p.radius === 0.5) ||
          (o.geometry.type === 'DodecahedronGeometry' && p && p.radius === 0.5) ||
          (o.geometry.type === 'ConeGeometry' && p && p.radius === 0.34 && p.height === 0.95);
        if (isGem) gems.push({
          x: +o.position.x.toFixed(1), y: +o.position.y.toFixed(1), z: +o.position.z.toFixed(1),
          e: +o.material.emissiveIntensity.toFixed(2),
        });
      });
      return gems;
    },
    // Mine-adit ceiling readout (?debug): positions of the descending rock
    // plates that roof the excavation, so tests can confirm the car drives
    // INTO a descending tunnel rather than below a flat plane.
    mineCeil: () => {
      const plates = [];
      scene.traverse((o) => {
        if (!o.isMesh || !o.geometry || o.geometry.type !== 'BoxGeometry') return;
        const p = o.geometry.parameters;
        if (!p || p.width !== 9.4 || p.height !== 0.5) return;
        if (Math.abs(o.position.x + 55) > 0.5) return;
        if (o.position.z < 32 || o.position.z > 55) return;
        plates.push({ y: +o.position.y.toFixed(2), z: +o.position.z.toFixed(1) });
      });
      plates.sort((a, b) => a.z - b.z);
      return plates;
    },
    // Mine-hole readout (?debug): raycasts straight down at (x,z) and reports
    // the first surface hit, so tests can confirm the meadow plane is GONE
    // over the excavation (the car descends into open shaft, not below grass).
    rayDown: (x, z) => {
      const raycaster = new THREE.Raycaster();
      raycaster.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObjects(scene.children, true);
      if (!hits.length) return null;
      const h = hits[0];
      return {
        y: +h.point.y.toFixed(2),
        color: '#' + h.object.material.color.getHexString(),
        type: h.object.geometry.type,
      };
    },
    // Ramp-world tire-pyramid state: live snapshot of every tire knockable
    // (position + knock state) for automated testing.
    tires: () => snapKnockables('tire'),
    // Live snapshot of every knockable prop (position + knock state) for
    // automated testing of knock distances.
    knockables: () => snapKnockables(),
    // Task #36 perf probe: last frame's draw calls / triangles from the
    // renderer info struct (values reset each frame by three.js).
    perf: () => ({
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
    }),
    // Task #36 audit: mesh/shadow-caster counts per world. `smallCasters`
    // counts sub-unit-radius meshes that STILL cast shadows — should stay 0
    // after capShadowCasters() runs.
    sceneStats: () => {
      const stats = {};
      for (const [name, s] of [['city', scene], ['ramp', rampScene], ['underground', undergroundScene]]) {
        let meshes = 0, casters = 0, smallCasters = 0;
        s.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          meshes += 1;
          if (!o.castShadow) return;
          casters += 1;
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
          if (o.geometry.boundingSphere && o.geometry.boundingSphere.radius < MIN_SHADOW_RADIUS) smallCasters += 1;
        });
        stats[name] = { meshes, casters, smallCasters };
      }
      return stats;
    },
    // Live traffic snapshot (?debug): every traffic car's lane, direction,
    // position and current speed so tests can verify following gaps.
    traffic: () => traffic.map((t) => ({
      axis: t.axis,
      dir: t.dir,
      x: +t.mesh.position.x.toFixed(2),
      z: +t.mesh.position.z.toFixed(2),
      speed: +t.speedCur.toFixed(2),
      knock: t.knock ? +t.knock.t.toFixed(2) : 0,
      roller: !!t.isSteamroller,
      flatY: t.flat ? +t.mesh.scale.y.toFixed(2) : 1,   // < 1 when steamrollered flat
    })),
    // Foreboding sky state (?debug): the dark dome, drifting dark clouds,
    // star field and colorful constellations above the cavern ceiling.
    // Pass a boolean to show/hide the whole sky (for render verification).
    ugSky: (v) => {
      const s = undergroundWorld.sky;
      if (typeof v === 'boolean') s.visible = v;
      const clouds = [];
      let dome = null, stars = null;
      const constellations = [];
      for (const child of s.children) {
        if (child.isMesh && child.geometry.type === 'SphereGeometry') {
          dome = { x: +child.position.x.toFixed(1), y: +child.position.y.toFixed(1), z: +child.position.z.toFixed(1), r: child.geometry.parameters.radius, fog: child.material.fog };
        } else if (child.isMesh) {
          clouds.push({ x: +child.position.x.toFixed(1), y: +child.position.y.toFixed(1), z: +child.position.z.toFixed(1) });
        } else if (child.isPoints) {
          stars = { count: child.geometry.attributes.position.count, opacity: +child.material.opacity.toFixed(2), size: child.material.size };
        } else if (child.isGroup) {
          let line = null, starCount = 0;
          child.traverse((o) => {
            if (o.isLine) line = { color: '#' + o.material.color.getHexString(), pts: o.geometry.attributes.position.count };
            if (o.isSprite) starCount += 1;
          });
          constellations.push({ line, starCount });
        }
      }
      return { visible: s.visible, dome, clouds, stars, constellations };
    },
  };
}


// ===== Camera drag / orbit + pinch-to-zoom =====
// One finger drags the orbit (same as the desktop drag); laying a second
// finger down switches to pinch-to-zoom — the camera distance scales with the
// finger spacing, exactly like the scroll-wheel zoom (same min/max clamp),
// and holds the view while your fingers are moving. `touch-action: none` on
// the canvas and body keeps the browser's own pinch/scroll out of the way so
// the gestures reach these handlers.
renderer.domElement.addEventListener('pointerdown', (event) => {
  pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinchPointers.size === 1) {
    // First finger: begin the orbit drag.
    isDragging = true;
    dragPointerId = event.pointerId;
    dragStart.x = event.clientX;
    dragStart.y = event.clientY;
    dragStart.yaw = cameraYawOffset;
    dragStart.phi = cameraOrbit.phi;
  } else if (pinchPointers.size === 2) {
    // Second finger: drop the orbit drag and start the pinch. The bare
    // detector means a mid-drag second finger cleanly takes over.
    isDragging = false;
    dragPointerId = null;
    if (!pinchActive) {
      pinchActive = true;
      const pts = [...pinchPointers.values()];
      pinchStartDist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      pinchStartRadius = cameraOrbit.radius;
      cameraManualTimer = CAMERA_MANUAL_HOLD;
    }
  }
});

window.addEventListener('pointermove', (event) => {
  if (!pinchPointers.has(event.pointerId)) return;
  pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pinchActive && pinchPointers.size >= 2) {
    // Pinch-to-zoom: scale the camera distance by the finger-spacing ratio,
    // clamped to the same bounds as the scroll-wheel zoom. Pinch out = zoom
    // out, pinch in = zoom in.
    const pts = [...pinchPointers.values()];
    const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
    const factor = dist / pinchStartDist;
    cameraOrbit.radius = THREE.MathUtils.clamp(pinchStartRadius * factor, CAM_ZOOM_MIN, CAM_ZOOM_MAX);
    cameraManualTimer = CAMERA_MANUAL_HOLD;
  } else if (isDragging && event.pointerId === dragPointerId) {
    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;
    if (deltaX !== 0 || deltaY !== 0) cameraManualTimer = CAMERA_MANUAL_HOLD;
    cameraYawOffset = dragStart.yaw - deltaX * 0.005;
    cameraOrbit.phi = THREE.MathUtils.clamp(dragStart.phi + deltaY * 0.005, cameraOrbit.minPhi, cameraOrbit.maxPhi);
  }
});

function endPointer(event) {
  pinchPointers.delete(event.pointerId);
  if (pinchActive && pinchPointers.size < 2) {
    // Pinch ended: if one finger is still down, re-arm the orbit drag from
    // the current view so lifting one finger mid-pinch keeps you in control.
    pinchActive = false;
    isDragging = false;
    dragPointerId = null;
    const first = [...pinchPointers.entries()][0];
    if (first) {
      isDragging = true;
      dragPointerId = first[0];
      dragStart.x = first[1].x;
      dragStart.y = first[1].y;
      dragStart.yaw = cameraYawOffset;
      dragStart.phi = cameraOrbit.phi;
    }
  } else if (pinchPointers.size === 0) {
    isDragging = false;
    dragPointerId = null;
  }
}

window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

// ===== Resize =====
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
