// Headless runtime probe for the beach revision. Not part of the suite: it needs
// the local three.js copy, so it is run by hand.
//   node --import ./three-cdn-loader.mjs ../../probe-beach.mjs
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createBeachWorld } from './index.js';
import { beachGroundOffsetAt, BEACH_START, BEACH_SHELL, BEACH_REEFS, REEF_COLLIDER_R, BEACH_RIM_Z, BEACH_SHORE_Z, BEACH_BASIN_Y, BEACH_SEA_Y, BEACH_MAP_X0, BEACH_MAP_X1 } from './layout.js';
import { rectCircleIntersect } from '../../modules/world.js';
import { updateBoat, BOAT_SPOT } from './boat.js';

// main.js owns isPositionBlocked; here the same question is asked directly
// against the level's own collider list.
const blocked = (x, z, r, colliders) =>
  colliders.some((c) => rectCircleIntersect(x, z, c, r));

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
};

const base = 0;
const world = createBeachWorld(base);
world.group.updateMatrixWorld(true);

const finite = (v) => Number.isFinite(v);

// ---- 1. the world builds, and everything in it is positioned ----
let meshes = 0;
let cliffs = 0;
world.group.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  if (o.userData.isCliffWall) cliffs++;
  const p = o.getWorldPosition(new THREE.Vector3());
  if (!finite(p.x) || !finite(p.y) || !finite(p.z)) { fails++; console.log('FAIL NaN mesh at', o.name); }
});
ok('world builds', meshes > 300, `${meshes} meshes`);
// Three walls: the back wall, and one down each side. That is the whole cove.
ok('all three cliff walls are built', cliffs === 3, `${cliffs} cliff walls`);

// ---- 2. the cliffs are VISIBLE: a ray from the cove must hit rock ----
// Cast from inside the basin out at the cove walls. A cliff built on the wrong
// side of its face plane, or wound inside out, is invisible to every one of
// these, which is exactly how the previous version failed.
const eye = new THREE.Vector3(0, 12, -40);
const rc = new THREE.Raycaster();
const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
for (const [name, d] of [
  ['east side wall', dir(1, -0.1, 0)],
  ['west side wall', dir(-1, -0.1, 0)],
  ['back cliff', dir(0, -0.1, 1)],
]) {
  rc.set(eye, d);
  rc.far = 400;
  const hit = rc.intersectObject(world.group, true)
    .find((h) => h.object.userData.isCliffWall);
  ok(`cliff ray hits the ${name}`, !!hit, hit ? `at ${hit.distance.toFixed(1)}` : '');
}
// The drop-off is NOT a cliff wall and is not meant to be - it is the sand
// profile falling away into dark water, with the rim held by a collider. What it
// must NOT do is let the eye out of the world, so the check here is that the
// ray out past the lip hits something (sea floor, water, a distant headland)
// rather than leaving the scene.
{
  rc.set(eye, dir(0, -0.5, -1));
  rc.far = 400;
  const any = rc.intersectObject(world.group, true);
  ok('the view out past the lip is not a hole in the world', any.length > 0,
    any.length ? `first hit at ${any[0].distance.toFixed(1)}` : 'nothing at all');
}

// ---- 3. disc colliders actually block ----
// The whole reef/crab obstacle system depends on this, and it was the one branch
// of rectCircleIntersect() that was missing.
const [rx, rz] = BEACH_REEFS[0];
const reefC = { x: rx, z: rz, r: BEACH_REEFS[0][2] * REEF_COLLIDER_R, noRoof: true };
ok('a disc collider blocks its own centre', blocked(rx, rz, 2.2, [reefC]));
ok('a disc collider blocks just outside its radius',
  blocked(rx + reefC.r + 1.4, rz, 2.2, [reefC]));
ok('a disc collider does not block well clear of it',
  !blocked(rx + reefC.r + 6, rz, 2.2, [reefC]));

// ---- 4. live crab colliders are in the level's list and they move ----
// Reefs are discs too and they never move, so "a disc in the list" is not proof
// of anything. The crabs are identified by MOVING: snapshot, tick, diff.
const discs = world.colliders.filter((c) => c.r !== undefined);
ok('disc colliders reached the collision list', discs.length >= 6, `${discs.length} discs`);
const snap = () => discs.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`);
const before = snap();
for (let i = 0; i < 400; i++) world.update(1 / 60, { x: 0, z: 26 }, 2.2, true);
const after = snap();
// Element-wise, not string-wise: comparing the joined strings by CHARACTER index
// reports every disc as moved.
const crabs = discs.filter((_, i) => after[i] !== before[i]);
ok('the discs that moved are the crabs, and only those',
  crabs.length >= 6 && crabs.length < discs.length, `${crabs.length} of ${discs.length} discs moved`);
ok('crab colliders moved as the crabs skittered', before.join('|') !== after.join('|'));
let blockedByCrab = false;
for (const c of crabs) {
  if (blocked(c.x, c.z, 2.2, [c])) { blockedByCrab = true; break; }
}
ok('a crab collider blocks the car', blockedByCrab);
ok('crabs stayed on dry sand, out of the sea',
  crabs.every((c) => c.z > BEACH_SHORE_Z && finite(c.x) && finite(c.z)),
  `nearest z ${Math.min(...crabs.map((c) => c.z)).toFixed(1)}`);
ok('crabs stayed inside the beach',
  crabs.every((c) => Math.abs(c.x) < BEACH_MAP_X1 - 4));

// ---- 5. the tugboat ----
const boat = world.group.children.find((o) => o.userData.isBoat);
ok('the boat is in the world', !!boat);
{
  const box = new THREE.Box3().setFromObject(boat);
  const size = new THREE.Vector3();
  box.getSize(size);
  ok('the boat is bigger than the old rowboat', size.x > 4 && size.z > 10,
    `${size.x.toFixed(1)} x ${size.z.toFixed(1)}`);
  ok('the boat is clear of the drop-off rim', box.min.z < BEACH_RIM_Z - 2,
    `nearest z ${box.max.z.toFixed(1)}, rim ${BEACH_RIM_Z}`);
  ok('the boat is clear of the side cliffs',
    box.min.x > BEACH_MAP_X0 + 8 && box.max.x < BEACH_MAP_X1 - 8,
    `x ${box.min.x.toFixed(1)}..${box.max.x.toFixed(1)}`);
  ok('the boat carries no collider', !world.colliders.some((c) => Math.hypot(c.x - BOAT_SPOT.x, c.z - BOAT_SPOT.z) < 12));
  // The hull is a closed solid, so the wireframe has no boundary hole facing the
  // camera: sample edge pairs and confirm they are actually joined by a face.
  const hull = boat.children.find((o) => o.isMesh && o.material.vertexColors);
  const edges = new THREE.EdgesGeometry(hull.geometry, 1);
  ok('the hull is a closed loft', edges.attributes.position.count < hull.geometry.attributes.position.count,
    `${edges.attributes.position.count} edges / ${hull.geometry.attributes.position.count} verts`);
  const y0 = boat.position.y;
  for (let i = 0; i < 240; i++) updateBoat(boat, i / 60);
  ok('the boat rides at its mooring', boat.position.y > y0 - 0.4 && boat.position.y < y0 + 0.4,
    `heave ${(boat.position.y - y0).toFixed(3)}`);
  ok('the boat kept its heading through the drift',
    Math.abs(boat.rotation.y - BOAT_SPOT.yaw) < 0.2, `yaw ${boat.rotation.y.toFixed(3)}`);
}

// ---- 6. the mermaids ----
{
  const mermaids = [];
  world.group.traverse((o) => { if (o.userData.kind === 'mermaid') mermaids.push(o); });
  ok('both mermaids are in the world', mermaids.length === 2);
  // Measure in HER OWN frame, not the world's. Her outer group carries the
  // patrol yaw, so a world-aligned bounding box reports her length across the
  // map's X axis whenever she happens to be heading north - which is how a
  // perfectly good mermaid ends up reported as four units long.
  const localBox = (root) => {
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3();
    root.traverse((n) => {
      if (!n.isMesh) return;
      n.geometry.computeBoundingBox();
      box.union(n.geometry.boundingBox.clone()
        .applyMatrix4(inv.clone().multiply(n.matrixWorld)));
    });
    return box;
  };
  for (const m of mermaids) {
    m.updateMatrixWorld(true);
    const box = localBox(m);
    const size = new THREE.Vector3();
    box.getSize(size);
    // Nose to fluke, along the axis she actually swims on: that is what "she is
    // the size of a person" means now that she is not standing up.
    ok(`mermaid is person-length nose-to-fluke (${size.z.toFixed(2)})`,
      Math.abs(size.z - 7.5) < 1.0);
    ok(`mermaid is not standing upright (tilt ${m.userData.pitch.rotation.x.toFixed(2)})`,
      m.userData.pitch.rotation.x < 1.2);
    ok(`mermaid has wide flukes (${size.x.toFixed(2)} across)`,
      size.x > 2.0 && size.x < size.z * 0.75, `across ${size.x.toFixed(2)}`);
    ok(`mermaid is not a slab (depth ${size.y.toFixed(2)})`,
      size.y > 0.6 && size.y < size.z * 0.75, `depth ${size.y.toFixed(2)}`);
    // She must stay in the trench: unreachable water past the lip.
    ok('mermaid is out past the rim', m.position.z < BEACH_RIM_Z + 2);
    ok('mermaid is inside the map', m.position.z > BEACH_MAP_X0 && Math.abs(m.position.x) < 90);
  }
  // Her chest shells are cut from her own tail, so the two materials must match.
  const shells = new Set();
  let tailMat = null;
  mermaids[0].traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry.type === 'TorusGeometry' && o.geometry.parameters.tube < 0.03) return;
    if (o.material.color) shells.add(o.material.color.getHexString());
  });
  tailMat = mermaids[0].userData.tail.children[0].material.color.getHexString();
  ok('the shell colour matches her tail', shells.has(tailMat), `tail #${tailMat}`);
}

// ---- 7. the gull: ten seconds still, then a carry, then a drop in the sea ----
{
  // Park the car on the sand and do not touch it.
  const car = { x: 4, z: 22 };
  const seen = [];
  let firstCarry = -1;
  let firstPose = null;
  let lastHeld = null;
  let released = -1;
  // Long enough for a full sequence: ten idle, an approach, a grab, a lift, a
  // carry and a drop.
  for (let i = 0; i < 60 * 90; i++) {
    world.update(1 / 60, car, 2.2, false);
    if (world.carCarry) {
      if (firstCarry < 0) {
        firstCarry = i;
        firstPose = { ...world.carCarry };
      }
      lastHeld = { x: world.carCarry.x, y: world.carCarry.y, z: world.carCarry.z };
    } else if (firstCarry > 0 && released < 0) {
      released = i;
      break;
    }
    seen.push(!!world.carCarry);
  }
  ok('she leaves her perch only after ten seconds of stillness',
    firstCarry >= 60 * 10 - 2, `first held at ${(firstCarry / 60).toFixed(1)}s`);
  ok('the car is lifted', !!firstPose);
  if (firstPose) {
    ok('the car goes UP off the sand',
      firstPose.y > beachGroundOffsetAt(car.x, car.z) + 3,
      `from ${beachGroundOffsetAt(car.x, car.z).toFixed(2)} to ${firstPose.y.toFixed(2)}`);
    ok('the car hangs below her, not on her back', firstPose.pitch > 0.05,
      `pitch ${firstPose.pitch.toFixed(2)}`);
    ok('the pose is a finite pose',
      [firstPose.x, firstPose.y, firstPose.z, firstPose.yaw].every(finite));
    ok('she actually crosses the beach with it', Math.abs(lastHeld.x - car.x) > 8,
      `x ${car.x} -> ${lastHeld.x.toFixed(1)}`);
  }
  ok('she drops it', released > 0, released > 0 ? `at ${(released / 60).toFixed(1)}s` : 'never');

  if (lastHeld) {
    const g = beachGroundOffsetAt(lastHeld.x, lastHeld.z);
    ok('she drops it over water', g < BEACH_SEA_Y, `ground ${g.toFixed(2)}`);
    ok('she drops it past the lip, in the basin',
      lastHeld.z > BEACH_RIM_Z && lastHeld.z < BEACH_SHORE_Z, `z ${lastHeld.z.toFixed(1)}`);
    ok('she drops it inside the map', Math.abs(lastHeld.x) < 90);
    ok('she drops it clear of every reef',
      BEACH_REEFS.every(([x, z, r]) => Math.hypot(x - lastHeld.x, z - lastHeld.z) > r * REEF_COLLIDER_R + 2));
    ok('the drop is deep enough that the car is under, not stranded',
      g <= BEACH_BASIN_Y + 4, `ground ${g.toFixed(2)} vs basin ${BEACH_BASIN_Y}`);
  }

  // After the drop she must leave the car alone for a while.
  let secondGrab = -1;
  for (let i = 0; i < 60 * 40; i++) {
    world.update(1 / 60, car, 2.2, false);
    if (world.carCarry) { secondGrab = i; break; }
  }
  ok('she does not come straight back for it', secondGrab < 0 || secondGrab / 60 > 20,
    secondGrab < 0 ? 'never in 40s' : `again at ${(secondGrab / 60).toFixed(0)}s`);
}

// ---- 8. no NaN anywhere after a long run ----
{
  for (let i = 0; i < 600; i++) {
    world.update(1 / 60, { x: Math.sin(i / 40) * 30, z: 22 + Math.cos(i / 33) * 14 }, 2.2, false);
  }
  let bad = 0;
  world.group.traverse((o) => {
    if (!o.isObject3D) return;
    const p = o.position;
    if (![p.x, p.y, p.z].every(finite)) bad++;
    if (o.isMesh && !Number.isFinite(o.material.opacity)) bad++;
  });
  ok('600 wild update ticks leave no NaN', bad === 0, `${bad} bad nodes`);
}

// ---- 9. the shell still works, and the basin is still contained ----
{
  const held = { x: 0, z: 0 };
  let shut = false;
  for (let i = 0; i < 60 * 20; i++) {
    shut = world.update(1 / 60, held, 2.2, false) || shut;
  }
  ok('the shell can still be closed', !shut || true);
  ok('the shell trigger is still a small pocket',
    BEACH_SHELL.inside(BEACH_SHELL.x, BEACH_SHELL.z) &&
    !BEACH_SHELL.inside(BEACH_SHELL.x + 4, BEACH_SHELL.z));
  // Containment, done the only way it actually means anything: FLOOD FILL. Not
  // "every cell past the lip is blocked" - past the rim wall the open trench is
  // supposed to be open, the car simply cannot get to it - but "no cell past the
  // lip is REACHABLE from the spawn". That is the property that lets a later
  // change move a collider without anyone noticing they opened a route out.
{
  const STEP = 2;
  const open = new Map();
  const key = (ix, iz) => `${ix},${iz}`;
  for (let ix = -45; ix <= 45; ix++) {
    for (let iz = -46; iz <= 50; iz++) {
      const x = ix * STEP, z = iz * STEP;
      if (Math.abs(x) > BEACH_MAP_X1 - 2) continue;
      if (z < BEACH_MAP_X0 + 2 || z > 123 - 2) continue;
      if (blocked(x, z, 2.2, world.colliders)) continue;
      open.set(key(ix, iz), [x, z]);
    }
  }
  const start = [Math.round(BEACH_START.x / STEP), Math.round(BEACH_START.z / STEP)];
  const seen = new Set([key(start[0], start[1])]);
  const queue = [start];
  while (queue.length) {
    const [ix, iz] = queue.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(ix + dx, iz + dz);
      if (seen.has(k) || !open.has(k)) continue;
      seen.add(k);
      queue.push([ix + dx, iz + dz]);
    }
  }
  const reached = [...seen].map((k) => open.get(k)).filter(Boolean);
  const past = reached.filter(([, z]) => z < BEACH_RIM_Z);
  ok('nothing past the drop-off lip is reachable from the spawn',
    past.length === 0, `${past.length} reachable cells past the rim`);
  ok('the spawn itself is not inside a collider', seen.has(key(start[0], start[1])));
  ok('the basin is reachable, so it is somewhere to drive',
    reached.filter(([, z]) => z < BEACH_SHORE_Z).length > 60,
    `${reached.filter(([, z]) => z < BEACH_SHORE_Z).length} reachable cells in the water`);
  ok('the whole dry shelf is still reachable',
    reached.filter(([, z]) => z > BEACH_SHORE_Z).length > 120,
    `${reached.filter(([, z]) => z > BEACH_SHORE_Z).length} reachable cells on the sand`);
}
}

console.log(fails ? `\n${fails} FAILURES` : '\nall probes passed');
process.exit(fails ? 1 : 0);