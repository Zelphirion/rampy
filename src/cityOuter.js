import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { onRoad } from './cityRoads.js';

// ============================================================================
// The outer belt: boundary wall, scenery, parking lots and the nature area
// ============================================================================
// The city grew to 4x its old area (see modules/world.js) but the original town
// and its railway ring stayed exactly where they were. Everything the player
// asked for OUTSIDE the tracks lives out here in the new belt:
//
//   * a solid brick wall closing the whole rectangle, so the map is finite and
//     you cannot drive off an edge;
//   * a few empty parking lots (tarmac + painted bays, no cars);
//   * a nature area: rolling hills and scattered trees, with the city park
//     (lawn, lake and playground) relocated into the belt beside it.
//
// The wall's colliders are pushed into the shared buildingColliders list, so the
// wall is an ordinary physics obstacle - you hit it exactly like a building and
// cannot pass. That is what makes "finite" real rather than cosmetic.
// ============================================================================

export const OUTER = {
  // The wall's INNER face lines up with the world bounds, so the clamped player
  // (worldXHi etc.) never ends up standing inside the bricks.
  innerX: 180,
  innerZlo: -180,
  innerZhi: 246,
  wallT: 3,
  wallH: 5.2,
  capH: 0.6,
};

// Rolling hills, placed clear of the roads, the lots, the park and the two
// feature sites relocated into the belt (the spaceport and the cul-de-sac).
const HILLS = [
  { x: 124, z: -66, r: 22, h: 8 },
  { x: 124, z: 150, r: 22, h: 9 },
  { x: 60, z: -172, r: 20, h: 7 },
  { x: -110, z: 154, r: 20, h: 8 },
  { x: -138, z: 128, r: 16, h: 7 },
];

// Regions the nature pass must keep clear for things other modules drop in
// out here: the spaceport yard (SW belt) and the cul-de-sac of houses (east
// belt). Exported so those builders can share the exact same rectangles.
export const RESERVED = [
  { id: 'spaceport', x0: -138, x1: -102, z0: -130, z1: -88 },
  { id: 'culdesac', x0: 98, x1: 156, z0: 40, z1: 86 },
  { id: 'park', x0: -148, x1: -98, z0: 16, z1: 106 },
  // The city portal tree stands against the west wall inside the strip of land
  // the ring road's inward move opened up — keep the pine scatter off it.
  { id: 'portal-tree', x0: -180, x1: -164, z0: 48, z1: 72 },
];

const brickMat = new THREE.MeshStandardMaterial({ color: 0x8a3b2e, roughness: 0.95 });
const capMat = new THREE.MeshStandardMaterial({ color: 0xb9b1a3, roughness: 0.9 });
const grassMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3f, roughness: 1 });
const hillMat = new THREE.MeshStandardMaterial({ color: 0x357038, roughness: 1 });
const barkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2b, roughness: 1 });
const crownMat = new THREE.MeshStandardMaterial({ color: 0x3f7d41, roughness: 0.9 });

// A brick wall segment with a pale concrete cap — the cap overhangs a little so
// the wall reads as built rather than as a naked box.
function wallSegment(scene, w, d, x, z, alongX) {
  const { wallH, capH } = OUTER;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), brickMat);
  body.position.set(x, wallH / 2, z);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  const capW = alongX ? w + 0.8 : w + 0.8;
  const capD = alongX ? d + 0.8 : d + 0.8;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(capW, capH, capD), capMat);
  cap.position.set(x, wallH + capH / 2, z);
  cap.castShadow = true;
  cap.receiveShadow = true;
  scene.add(cap);
}

function buildWall(scene, buildingColliders) {
  const { innerX, innerZlo, innerZhi, wallT, wallH } = OUTER;
  const cx = innerX + wallT / 2;                     // 181.5
  const southZ = innerZlo - wallT / 2;               // -181.5
  const northZ = innerZhi + wallT / 2;               // 247.5
  const midZ = (innerZlo + innerZhi) / 2;            // 33
  const spanX = innerX * 2 + wallT * 2;              // 366
  const spanZ = (innerZhi - innerZlo) + wallT * 2;   // 432

  // South / north run east-west along x.
  wallSegment(scene, spanX, wallT, 0, southZ, true);
  wallSegment(scene, spanX, wallT, 0, northZ, true);
  // West / east run north-south along z.
  wallSegment(scene, wallT, spanZ, -cx, midZ, false);
  wallSegment(scene, wallT, spanZ, cx, midZ, false);

  // Four ordinary box colliders. They overlap at the corners, which is fine.
  buildingColliders.push(
    { x: 0, z: southZ, halfW: spanX / 2, halfD: wallT / 2, h: wallH },
    { x: 0, z: northZ, halfW: spanX / 2, halfD: wallT / 2, h: wallH },
    { x: -cx, z: midZ, halfW: wallT / 2, halfD: spanZ / 2, h: wallH },
    { x: cx, z: midZ, halfW: wallT / 2, halfD: spanZ / 2, h: wallH },
  );
}

// Empty parking lots: tarmac with white bays painted across it, nothing parked.
// Declared x0..x1 / z0..z1 like the roads so they read the same way.
export const LOTS = [
  { id: 'lot-north', x0: -74, x1: -18, z0: 148, z1: 172 },
  { id: 'lot-east', x0: 118, x1: 142, z0: -42, z1: 22 },
  { id: 'lot-south', x0: 20, x1: 78, z0: -122, z1: -98 },
];

const ROAD_Y = 0.13;

function parkingLot(scene, lot) {
  const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;

  const tarmac = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d),
    new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 1 }));
  tarmac.position.set(cx, ROAD_Y, cz);
  tarmac.receiveShadow = true;
  scene.add(tarmac);

  // Bays run off the LONG axis, spaced 5 apart with a small margin at each end.
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 1 });
  const alongX = w >= d;
  const run = alongX ? w : d;
  const cross = alongX ? d : w;
  const n = Math.max(2, Math.floor((run - 6) / 5));
  const step = (run - 6) / n;
  for (let i = 0; i <= n; i++) {
    const t = -run / 2 + 3 + i * step;
    const line = alongX
      ? new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, cross - 3), stripeMat)
      : new THREE.Mesh(new THREE.BoxGeometry(cross - 3, 0.02, 0.24), stripeMat);
    line.position.set(alongX ? cx + t : cx, ROAD_Y + 0.1, alongX ? cz : cz + t);
    scene.add(line);
  }
}

// The nature area: rolling hills and scattered trees.
function buildNature(scene) {
  // --- Hills ------------------------------------------------------------
  for (const h of HILLS) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(h.r, h.h, 32), hillMat);
    hill.position.set(h.x, h.h / 2, h.z);
    hill.castShadow = true;
    hill.receiveShadow = true;
    scene.add(hill);
  }

  // --- Trees ------------------------------------------------------------
  const inReserved = (x, z) => RESERVED.some((r) => x > r.x0 - 2 && x < r.x1 + 2 && z > r.z0 - 2 && z < r.z1 + 2);
  // Deterministic scatter (no Math.random) so the belt looks the same every
  // load. Trees only go in the outer belt, and never on a road, a parking lot,
  // a hill or on a reserved feature site.
  const inLot = (x, z) => LOTS.some((l) => x > l.x0 - 2 && x < l.x1 + 2 && z > l.z0 - 2 && z < l.z1 + 2);
  const nearHill = (x, z) => HILLS.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 3);

  for (let gx = -170; gx <= 170; gx += 18) {
    for (let gz = -170; gz <= 238; gz += 18) {
      // Only the belt outside the railway ring.
      if (Math.abs(gx) <= 102 && gz >= -100 && gz <= 138) continue;
      // Deterministic jitter so the rows do not read as a grid.
      const x = gx + Math.sin(gx * 0.7 + gz * 1.3) * 5;
      const z = gz + Math.cos(gx * 1.1 - gz * 0.6) * 5;
      if (Math.abs(x) > 178 || z < -178 || z > 244) continue;
      if (onRoad(x, z, 3) || inLot(x, z) || nearHill(x, z) || inReserved(x, z)) continue;

      const group = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.8, 8), barkMat);
      trunk.position.y = 0.9;
      trunk.castShadow = true;
      group.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 8), crownMat);
      crown.position.y = 2.2;
      crown.castShadow = true;
      group.add(crown);
      group.position.set(x, 0, z);
      scene.add(group);
    }
  }
}

// Build the whole outer belt. `buildingColliders` receives the wall so the wall
// stops the car like any other solid.
export function addCityOuter(scene, buildingColliders) {
  const group = new THREE.Group();
  group.name = 'cityOuter';
  scene.add(group);

  buildWall(scene, buildingColliders);
  for (const lot of LOTS) parkingLot(scene, lot);
  buildNature(scene);
}
