import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addGlassCity } from '../../glasscity.js';
// The Holy Mountain: pure layout math (cone profile, spiral road wedges,
// blocker rects) verified by holyMountain.test.mjs — this file turns it into
// meshes and colliders.
import { MOUNT, coneRadiusAt, spiralSegments, mountainBlockers, mouthFrame } from '../../modules/holyMountain.js';

export const UNDERGROUND_Y = -30;

// ---- Course build zone ----
// Rectangular zone on the 292×276 cavern slab (slab spans x ∈ [-146, 146],
// z ∈ [-96.5, 179.5] around its center (0, 41.5)). Chosen to avoid:
//   - Glass City footprint: z ∈ [132, 173] spanning x ∈ [-140, 140]
//   - support pillars at (-72, 98) and (-40, 66)
//   - tunnel foot / return portal at ≈(-55, 83) (tube radius 5; kept >60 away)
// Everything below sits in the clear south-east quadrant, with ~6 units of
// margin to the slab edges so props never hang off the cavern floor.
export const BUILD_ZONE = {
  minX: 20,
  maxX: 140,
  minZ: -90,
  maxZ: 40,
};

// Cavern slab bounds (292×276 box centered at (0, 41.5)).
export const SLAB = { minX: -146, maxX: 146, minZ: -96.5, maxZ: 179.5 };
// Underside height (local Y) of the cavern ceiling over the course zone.
export const CEIL_Y = 30;

// ---- Shared neon materials ----
// One palette + one intensity for every glowing prop on the course, so the
// neon reads consistently and identical props share material instances.
export const NEON = {
  cyan: 0x35f0ff,
  magenta: 0xff3fd8,
  amber: 0xffb84d,
  lime: 0x9dff3f,
  red: 0xff3b3b,
};
export const GLOW_INTENSITY = 0.95;

const glowMatCache = new Map();
export function makeGlowMat(color) {
  let mat = glowMatCache.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: GLOW_INTENSITY });
    glowMatCache.set(color, mat);
  }
  return mat;
}

// ---- 1970s vinyl kitchen floor ----
// The cavern floor is a plain rock slab; give it a retro printed-vinyl
// kitchen floor look. The pattern is drawn on a canvas (no image assets):
// a warm cream tile with a rust starburst, a harvest-gold centre and a thin
// border — the classic 1970s kitchen linoleum. It repeats every VINYL_TILE
// world units across the whole slab.
export const VINYL_TILE = 2;   // world units per vinyl tile
function makeVinylFloorTexture() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const cx = S / 2, cy = S / 2;

  // Dark gray base
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, S, S);

  // Rust starburst (12 points)
  const rays = 12;
  const innerR = S * 0.07;
  const outerR = S * 0.40;
  ctx.fillStyle = '#b85c38';
  ctx.beginPath();
  for (let i = 0; i < rays * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (rays * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Harvest-gold centre diamond
  ctx.fillStyle = '#d9a441';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-S * 0.055, -S * 0.055, S * 0.11, S * 0.11);
  ctx.restore();

  // Thin border frame
  ctx.strokeStyle = '#9c8358';
  ctx.lineWidth = S * 0.015;
  ctx.strokeRect(S * 0.012, S * 0.012, S * 0.976, S * 0.976);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Squared distance from point P to the segment A→B (clamped to the ends).
// Used by trigger checks so a slow frame rate (huge per-frame car steps)
// can't tunnel straight through a trigger radius between updates.
function segDistSq(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  const cz = az + dz * t - pz;
  return cx * cx + cy * cy + cz * cz;
}
function pointDistSq(px, py, pz, qx, qy, qz) {
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

// ===== Foreboding sky above the cavern ceiling =====
// A dark, ominous sky hangs over the whole cavern. A huge dome backdrop
// follows the car so the sky is always all around, above us — no visible
// edges from anywhere on the map. Slow-drifting dark clouds, a scatter of
// stars, and colorful constellations joined by thin glowing lines fill the
// sky. Purely decorative — no colliders, no physics.
const SKY_R = 250;                               // dome radius — follows the car, so the sky is always all around with no visible edges
const SKY_CX = 0, SKY_CY = 0, SKY_CZ = 0;        // dome is centred on the car each frame (local origin)
const SKY_MIN_X = -160, SKY_MAX_X = 160;         // cloud wrap bounds (whole map + margin)
const SKY_MIN_Z = -110, SKY_MAX_Z = 190;

// Canvas "foreboding sky" for the dome: near-black indigo at the zenith,
// murky violet at the horizon. A clean gradient — the 3D clouds carry the
// texture, and a clean dome avoids stretched blotches following the camera.
function makeForebodingSkyTexture() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#07040f');
  grad.addColorStop(0.5, '#120a22');
  grad.addColorStop(1, '#241536');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft round glow used for every star (field + constellation).
function makeStarTexture() {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(canvas);
}

// Dark cloud clusters: flattened puffs of dark purple-grey, one merged mesh
// per cloud so the whole sky stays cheap.
const CLOUD_DEFS = [
  { x: -120, y: 40, z: 130, s: 2.4, puffs: 6 },
  { x: -70, y: 44, z: 80, s: 2.6, puffs: 7 },
  { x: -30, y: 38, z: 150, s: 2.0, puffs: 5 },
  { x: 20, y: 42, z: 100, s: 2.3, puffs: 6 },
  { x: 80, y: 46, z: 160, s: 2.5, puffs: 7 },
  { x: 130, y: 40, z: 120, s: 2.1, puffs: 5 },
  { x: -110, y: 42, z: 20, s: 2.2, puffs: 6 },
  { x: -50, y: 38, z: -60, s: 2.4, puffs: 6 },
  { x: 10, y: 44, z: -90, s: 2.0, puffs: 5 },
  { x: 70, y: 40, z: -40, s: 2.6, puffs: 7 },
  { x: 130, y: 46, z: -20, s: 2.3, puffs: 6 },
  { x: -140, y: 40, z: -80, s: 2.1, puffs: 5 },
  { x: 100, y: 42, z: 60, s: 2.2, puffs: 6 },
  { x: -20, y: 40, z: 30, s: 2.5, puffs: 7 },
];

// Colorful constellations: bright colored stars joined by thin glowing
// lines. Each is defined by a colour, a centre, and local (x, z) points.
const CONSTELLATIONS = [
  // The Serpent — a long zigzag
  { color: 0x7ef9ff, x: 40, y: 46, z: -60, pts: [[-8, 0], [-4, 3], [0, -2], [4, 3], [8, 0], [12, -3]] },
  // The Crown — an arc
  { color: 0xffd27e, x: 100, y: 48, z: -30, pts: [[-7, 0], [-4, 4], [0, 5], [4, 4], [7, 0]] },
  // The Kite — a bowtie diamond
  { color: 0xff9ad5, x: 70, y: 44, z: 20, pts: [[-6, 0], [0, 4], [6, 0], [0, -4], [-6, 0]] },
  // The Arrow — shaft with a feathered head
  { color: 0x9dff8f, x: 120, y: 50, z: -70, pts: [[-8, 0], [-4, 0], [0, 0], [4, 0], [8, 0], [4, 3], [8, 0], [4, -3]] },
  // The Diamond — a rhombus
  { color: 0xb48cff, x: 30, y: 42, z: 30, pts: [[0, 5], [5, 0], [0, -5], [-5, 0], [0, 5]] },
  // The Fish — a small kite over the north-west
  { color: 0x7ef9ff, x: -80, y: 46, z: 120, pts: [[-6, 0], [-2, 3], [2, 3], [6, 0], [2, -3], [-2, -3], [-6, 0]] },
  // The Triangle — a simple peak over the north
  { color: 0xffd27e, x: 40, y: 48, z: 150, pts: [[-5, 0], [5, 0], [0, 6], [-5, 0]] },
  // The Cross — a plus over the south-west
  { color: 0xff9ad5, x: -60, y: 44, z: -70, pts: [[0, -5], [0, 5], [-4, 0], [4, 0]] },
];

function addUndergroundSky(parent, mergeGeoms) {
  const sky = new THREE.Group();
  parent.add(sky);

  // Dark dome backdrop — the interior of a big sphere above the ceiling.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_R, 32, 16),
    new THREE.MeshBasicMaterial({ map: makeForebodingSkyTexture(), side: THREE.BackSide, fog: false })
  );
  dome.position.set(SKY_CX, SKY_CY, SKY_CZ);
  sky.add(dome);

  // Dark clouds: flattened clusters of dark spheres, merged into one mesh
  // each. They drift slowly and wrap around so the sky never empties.
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0x241c30,
    emissive: 0x2b2040,
    emissiveIntensity: 0.35,
    roughness: 1,
  });
  const clouds = [];
  for (const d of CLOUD_DEFS) {
    const parts = [];
    for (let i = 0; i < d.puffs; i++) {
      const a = (i / d.puffs) * Math.PI * 2 + Math.random() * 0.6;
      const r = (Math.random() * 0.45 + 0.15) * d.s;
      const puff = new THREE.SphereGeometry((Math.random() * 0.6 + 0.7) * d.s, 10, 8).toNonIndexed();
      puff.translate(Math.cos(a) * r, (Math.random() - 0.5) * 0.5 * d.s, Math.sin(a) * r);
      puff.scale(1, 0.5, 1);
      parts.push(puff);
    }
    const mesh = new THREE.Mesh(mergeGeoms(parts), cloudMat);
    mesh.position.set(d.x, d.y, d.z);
    sky.add(mesh);
    for (const g of parts) g.dispose();
    clouds.push({
      mesh,
      vx: (Math.random() * 0.5 + 0.2) * (Math.random() < 0.5 ? 1 : -1),
      vz: (Math.random() * 0.3 + 0.1) * (Math.random() < 0.5 ? 1 : -1),
    });
  }

  // A scatter of small stars — one Points mesh for the whole field.
  const starTex = makeStarTexture();
  const fieldPos = [];
  for (let i = 0; i < 70; i++) {
    fieldPos.push(
      (Math.random() - 0.5) * 292,   // x across the whole map
      38 + Math.random() * 14,       // y just above the ceiling
      -96.5 + Math.random() * 276    // z across the whole map
    );
  }
  const fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute('position', new THREE.Float32BufferAttribute(fieldPos, 3));
  const fieldMat = new THREE.PointsMaterial({
    map: starTex,
    color: 0xdce6ff,
    size: 1.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const fieldPoints = new THREE.Points(fieldGeo, fieldMat);
  sky.add(fieldPoints);

  // Colorful constellations: bright colored stars joined by thin glowing
  // lines. The stars twinkle gently.
  const constellations = [];
  for (const c of CONSTELLATIONS) {
    const g = new THREE.Group();
    const pts = c.pts.map(([lx, lz]) => new THREE.Vector3(c.x + lx, c.y, c.z + lz));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: c.color,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    g.add(line);
    const stars = [];
    for (const p of pts) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starTex,
        color: c.color,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }));
      sp.position.copy(p);
      sp.scale.set(1.7, 1.7, 1);
      g.add(sp);
      stars.push({ sprite: sp, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 2 });
    }
    sky.add(g);
    constellations.push({ stars });
  }

  // Attach the per-frame animation to the group itself so the caller gets a
  // single handle (the group) that also carries its own update().
  sky.update = function update(delta, elapsed, player) {
    // Keep the dome centred on the car so the sky is always all around,
    // above us — no visible edges from anywhere on the map.
    if (player) dome.position.copy(player);
    // Drift the clouds slowly; wrap them around the sky so it never empties.
    for (const c of clouds) {
      c.mesh.position.x += c.vx * delta;
      c.mesh.position.z += c.vz * delta;
      if (c.mesh.position.x > SKY_MAX_X) c.mesh.position.x = SKY_MIN_X;
      if (c.mesh.position.x < SKY_MIN_X) c.mesh.position.x = SKY_MAX_X;
      if (c.mesh.position.z > SKY_MAX_Z) c.mesh.position.z = SKY_MIN_Z;
      if (c.mesh.position.z < SKY_MIN_Z) c.mesh.position.z = SKY_MAX_Z;
    }
    // Gentle shimmer across the whole star field.
    fieldMat.opacity = 0.7 + 0.2 * Math.sin(elapsed * 1.3);
    // Twinkle the constellation stars.
    for (const c of constellations) {
      for (const s of c.stars) {
        s.sprite.material.opacity = 0.7 + 0.3 * Math.sin(elapsed * s.speed + s.phase);
      }
    }
  };
  return sky;
}

// Exported so main.js can build the arrival-cinematic orbit around the same
// centre axis without duplicating the constants.
export const TUNNEL = {
  cx: -58, cz: 104,
  R: 21,
  halfW: 3.5,
  tubeR: 5,       // interior tube radius — must match TubeGeometry tubeR below
  theta0: 0.45,
  sweep: 1.4 * Math.PI,
  startY: 0.15,
  endY: UNDERGROUND_Y + 0.15,
};

function easeSmooth(s) { return s * s * (3 - 2 * s); }

const N = 240;
const pathSamples = [];
for (let i = 0; i <= N; i++) {
  const s = i / N;
  const th = TUNNEL.theta0 + TUNNEL.sweep * s;
  pathSamples.push({
    s,
    x: TUNNEL.cx + TUNNEL.R * Math.cos(th),
    z: TUNNEL.cz + TUNNEL.R * Math.sin(th),
    y: TUNNEL.startY + (TUNNEL.endY - TUNNEL.startY) * easeSmooth(s),
  });
}

export function tunnelPoint(s) {
  const th = TUNNEL.theta0 + TUNNEL.sweep * s;
  return {
    x: TUNNEL.cx + TUNNEL.R * Math.cos(th),
    z: TUNNEL.cz + TUNNEL.R * Math.sin(th),
    y: TUNNEL.startY + (TUNNEL.endY - TUNNEL.startY) * easeSmooth(s),
  };
}

export function addUnderground(parent, opts = {}) {
  // Optional callbacks fired from update(): onBlockBump when an airborne car
  // bumps a prompt-block (task #6), onPipeShove(dirX) when a sliding conduit
  // sweeps through the car (task #13, dirX = ±1 travel direction),
  // onSweeperHit(dirX,dirZ) when a rotating sweeper arm clips the car
  // (task #23, unit vector pointing radially away from the arm's pivot),
  // onPoleHit(nx,nz,speed) when a fast-enough car slams the padded pole
  // (task #32; nx/nz point from the pole toward the car), and
  // onGemSlam(dirX,dirZ) when the car plows into a large heavy candy gem
  // (dirX/dirZ point back down the grand ramp). Lets the callers own the
  // physics/audio response without the level knowing how.
  const onBlockBump = typeof opts.onBlockBump === 'function' ? opts.onBlockBump : null;
  const onPipeShove = typeof opts.onPipeShove === 'function' ? opts.onPipeShove : null;
  const onSweeperHit = typeof opts.onSweeperHit === 'function' ? opts.onSweeperHit : null;
  const onPoleHit = typeof opts.onPoleHit === 'function' ? opts.onPoleHit : null;
  const onGemSlam = typeof opts.onGemSlam === 'function' ? opts.onGemSlam : null;

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2b2627, roughness: 1 });
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x241f20, roughness: 1, side: THREE.DoubleSide });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3434, roughness: 1 });

  const localY = (absY) => absY - UNDERGROUND_Y;

  // Cavern floor: the whole slab is a 1970s vinyl kitchen floor. The pattern
  // tiles every VINYL_TILE units across the 292×276 slab (the box's top face
  // spans the full UV range, so repeat = slab size / tile size).
  const vinylTex = makeVinylFloorTexture();
  vinylTex.repeat.set(292 / VINYL_TILE, 276 / VINYL_TILE);
  const vinylMat = new THREE.MeshStandardMaterial({ map: vinylTex, roughness: 0.55, metalness: 0 });
  const plain = new THREE.Mesh(new THREE.BoxGeometry(292, 0.25, 276), vinylMat);
  plain.position.set(0, -0.145, 41.5);
  plain.receiveShadow = true;
  parent.add(plain);

  const pts = pathSamples.map((p) => new THREE.Vector3(p.x, localY(p.y) + TUNNEL.tubeR, p.z));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, N, TUNNEL.tubeR, 20, false), tubeMat);
  tube.castShadow = true;
  parent.add(tube);

  const markerR = TUNNEL.tubeR - 1.6;
  // Perf pass (task #36): the 60 marker dots used to be 60 separate meshes
  // (60 draw calls for a handful of pixels each). Bake them into ONE static
  // geometry instead — same look, one draw call. Plain three.js merge:
  // clone a non-indexed template sphere, translate each copy into place,
  // then concatenate position/normal/uv arrays.
  const mergeGeoms = (geos) => {
    let count = 0;
    for (const g of geos) count += g.attributes.position.count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    let off = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, off * 3);
      nor.set(g.attributes.normal.array, off * 3);
      uv.set(g.attributes.uv.array, off * 2);
      off += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  };
  {
    const markerProto = new THREE.SphereGeometry(0.18, 8, 8).toNonIndexed();
    const markerParts = [];
    for (let i = 1; i <= 30; i++) {
      const s = i / 30;
      const p = tunnelPoint(s);
      const th = TUNNEL.theta0 + TUNNEL.sweep * s;
      const nx = Math.cos(th), nz = Math.sin(th);
      for (const side of [-1, 1]) {
        const g = markerProto.clone();
        g.translate(p.x + nx * markerR * side, localY(p.y) + 0.12, p.z + nz * markerR * side);
        markerParts.push(g);
      }
    }
    markerProto.dispose();
    const markers = new THREE.Mesh(mergeGeoms(markerParts), makeGlowMat(NEON.amber));
    parent.add(markers);
    for (const g of markerParts) g.dispose();
  }

  const pillars = [
    { x: -72, z: 98 },
    { x: -40, z: 66 },
  ];
  const pillarColliders = [];
  for (const p of pillars) {
    const w = 3.0, h = 14;
    const pil = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), pillarMat);
    pil.position.set(p.x, h / 2, p.z);
    pil.castShadow = true;
    parent.add(pil);
    pillarColliders.push({ x: p.x, z: p.z, halfW: w / 2, halfD: w / 2, h });
  }

  // Cavern ceiling over the course zone (underside at CEIL_Y), clamped to the
  // slab so it never overhangs the void, plus support columns floor → ceiling
  // kept near the zone perimeter so the middle stays open for the course.
  const CEIL_MARGIN = 8;
  const ceilMinX = Math.max(SLAB.minX, BUILD_ZONE.minX - CEIL_MARGIN);
  const ceilMaxX = Math.min(SLAB.maxX, BUILD_ZONE.maxX + CEIL_MARGIN);
  const ceilMinZ = Math.max(SLAB.minZ, BUILD_ZONE.minZ - CEIL_MARGIN);
  const ceilMaxZ = Math.min(SLAB.maxZ, BUILD_ZONE.maxZ + CEIL_MARGIN);
  const ceilW = ceilMaxX - ceilMinX;
  const ceilD = ceilMaxZ - ceilMinZ;
  // The entire ceiling is a giant CHECKERBOARD of tiles — the "second roof"
  // you drive on (top face at CEIL_Y + 1.3 = the car's ride height) and the
  // cavern ceiling you see from below (bottom face at CEIL_Y). Two alternating
  // dark-gray shades when first seen (the same rock gray as before, plus an
  // even darker one — a chessboard). Driving over a tile advances it one step
  // through a neon color sequence that ends on red; red is terminal and stays
  // lit forever. One InstancedMesh = one draw call for the whole grid.
  const TILE_SZ = 4;            // tile edge length (world units)
  const TILE_H = 1.15;          // tile thickness (ceiling underside → roof top)
  const TILE_GAP = 0.08;        // hairline grout so tiles read as individual squares
  const tilesX = Math.ceil(ceilW / TILE_SZ);
  // The tile grid must END exactly at the ceiling's north edge (z = ceilMaxZ),
  // where the grand ramp meets it — otherwise the last row of tiles overhangs
  // the ramp's top edge and the car drives up through them. The grid starts a
  // little inside the slab's south edge; the leftover is a clean rock strip.
  const tilesZ = Math.floor(ceilD / TILE_SZ);
  const gridZ0 = ceilMaxZ - tilesZ * TILE_SZ;   // grid spans z ∈ [gridZ0, ceilMaxZ]
  const tileCount = tilesX * tilesZ;
  const CHECKER_DARK_A = 0x2b2627;   // same dark gray as the old rock ceiling
  const CHECKER_DARK_B = 0x1a1617;   // even darker gray (chessboard contrast)
  // Neon sequence — each drive-over advances one step; red is the last color
  // and stays permanently.
  const CHECKER_NEON = [
    0x35f0ff,   // cyan
    0x9dff3f,   // lime
    0xffb84d,   // amber
    0xff3fd8,   // magenta
    0xff3b3b,   // red (terminal)
  ];
  // Thin rock backing under the tiles so the hairline grout gaps never show
  // the surface world above the ceiling.
  const ceilingBack = new THREE.Mesh(
    new THREE.BoxGeometry(ceilW, 0.15, ceilD),
    rockMat
  );
  ceilingBack.position.set((ceilMinX + ceilMaxX) / 2, CEIL_Y + 0.075, (ceilMinZ + ceilMaxZ) / 2);
  parent.add(ceilingBack);
  const checkerGrid = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TILE_SZ - TILE_GAP, TILE_H, TILE_SZ - TILE_GAP),
    new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
    tileCount
  );
  checkerGrid.receiveShadow = true;
  parent.add(checkerGrid);
  // Per-tile state: 0 = dark-A, 1 = dark-B, 2.. = index into CHECKER_NEON.
  const checkerState = new Int32Array(tileCount);
  // Crumble state: when a tile reaches red it flashes red/white for a few
  // seconds (giving the car time to drive off), then shrinks and falls away,
  // leaving a hole the car can drop through.
  const CEIL_FLASH_TIME = 3.0;     // seconds of red/white flashing
  const CEIL_FALL_TIME = 1.0;      // seconds for the tile to shrink + fall
  const checkerCrumble = new Float32Array(tileCount); // >0 = crumble countdown
  const checkerGone = new Uint8Array(tileCount);      // 1 = tile vanished (hole)
  const crumbleActive = new Set(); // indices of tiles currently crumbling
  const _tileMat = new THREE.Matrix4();
  const _tileColor = new THREE.Color();
  const _v3a = new THREE.Vector3();
  const _v3b = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  for (let iz = 0; iz < tilesZ; iz++) {
    for (let ix = 0; ix < tilesX; ix++) {
      const idx = iz * tilesX + ix;
      _tileMat.makeTranslation(
        ceilMinX + ix * TILE_SZ + TILE_SZ / 2,
        CEIL_Y + 0.15 + TILE_H / 2,
        gridZ0 + iz * TILE_SZ + TILE_SZ / 2
      );
      checkerGrid.setMatrixAt(idx, _tileMat);
      const dark = (ix + iz) % 2 === 0 ? CHECKER_DARK_A : CHECKER_DARK_B;
      checkerState[idx] = (ix + iz) % 2 === 0 ? 0 : 1;
      _tileColor.set(dark);
      checkerGrid.setColorAt(idx, _tileColor);
    }
  }
  checkerGrid.instanceMatrix.needsUpdate = true;
  checkerGrid.instanceColor.needsUpdate = true;
  // Glowing orange hole outlines: when a tile crumbles away it leaves a hole
  // in the checkerboard ceiling. A thin glowing orange frame around the
  // hole's perimeter makes the gap obvious from both the roof (driving) and
  // the cavern floor (looking up) — otherwise a hole reads as just another
  // dark tile and the car "falls through holes that aren't there".
  //
  // Adjacent crumbled tiles merge into ONE hole: the outline only traces the
  // OUTER perimeter of the contiguous hole region, so two (or ten) touching
  // squares read as a single big hole with no internal orange borders. The
  // outline is rebuilt from scratch whenever a new tile starts falling — each
  // outer edge becomes a thin bar (unit-length bar geometry, scaled + rotated
  // per instance), one draw call for the whole outline.
  const HOLE_FRAME_T = 0.12;         // frame bar thickness (thin edge — a crisp outline, not a chunky border)
  const HOLE_FRAME_H = TILE_H;       // frame height = tile thickness (flush with tile top — no wheel clip)
  const HOLE_FRAME_COLOR = 0xff7a1a; // glowing orange
  const HOLE_FRAME_MAX = 256;        // max outline bars (one per outer edge; holes are rare)
  const holeTiles = new Uint8Array(tileCount); // 1 = tile is a hole (falling or gone)
  let holeFrameCount = 0;
  let holeFrames = null;
  let holeFrameMat = null;
  {
    // Unit-length bar along +X; vertical (Z) bars are rotated π/2 per instance.
    const holeBarGeo = new THREE.BoxGeometry(1, HOLE_FRAME_H, HOLE_FRAME_T).toNonIndexed();
    holeFrameMat = new THREE.MeshStandardMaterial({
      color: HOLE_FRAME_COLOR,
      emissive: HOLE_FRAME_COLOR,
      emissiveIntensity: GLOW_INTENSITY,
    });
    holeFrames = new THREE.InstancedMesh(holeBarGeo, holeFrameMat, HOLE_FRAME_MAX);
    // Park every unused instance far below the slab at zero scale so they
    // don't render as a pile of bars at the origin.
    for (let k = 0; k < HOLE_FRAME_MAX; k++) {
      _v3a.set(0, -1000, 0);
      _tileMat.compose(_v3a, _quat.identity(), _v3b.set(0.001, 0.001, 0.001));
      holeFrames.setMatrixAt(k, _tileMat);
    }
    holeFrames.instanceMatrix.needsUpdate = true;
    // CRITICAL: the bar geometry's local bounding sphere sits at the origin,
    // but the actual bars are placed far away on the ceiling. The renderer
    // frustum-culls InstancedMesh against that stale local sphere, so the
    // outlines were silently culled and never drawn. Disable culling — the
    // mesh is tiny (≤256 bars) so always drawing it is cheaper than
    // recomputing the sphere on every new hole.
    holeFrames.frustumCulled = false;
    parent.add(holeFrames);
  }
  // Rebuild the merged hole outline: for every hole tile, each edge whose
  // neighbour is NOT also a hole gets a bar. Collinear bars on the same
  // row/column are merged into single continuous runs, so the outline is one
  // clean perimeter with no internal borders between adjacent holes.
  const rebuildHoleOutline = () => {
    for (let k = 0; k < HOLE_FRAME_MAX; k++) {
      _v3a.set(0, -1000, 0);
      _tileMat.compose(_v3a, _quat.identity(), _v3b.set(0.001, 0.001, 0.001));
      holeFrames.setMatrixAt(k, _tileMat);
    }
    let slot = 0;
    const y = CEIL_Y + TILE_H / 2;
    const half = TILE_SZ / 2;
    const isHole = (ix, iz) => {
      if (ix < 0 || ix >= tilesX || iz < 0 || iz >= tilesZ) return false;
      return holeTiles[iz * tilesX + ix] === 1;
    };
    const placeBar = (cx, cz, len, rotY) => {
      if (slot >= HOLE_FRAME_MAX) return;
      _v3a.set(cx, y, cz);
      _quat.setFromAxisAngle(_v3b.set(0, 1, 0), rotY);
      _tileMat.compose(_v3a, _quat, _v3b.set(len, 1, 1));
      holeFrames.setMatrixAt(slot, _tileMat);
      slot++;
    };
    // Horizontal bars (along X) on north/south edges, merged into runs.
    for (let iz = 0; iz < tilesZ; iz++) {
      for (const edge of [1, -1]) {
        let ix = 0;
        while (ix < tilesX) {
          if (isHole(ix, iz) && !isHole(ix, iz + edge)) {
            let ix1 = ix;
            while (ix1 + 1 < tilesX && isHole(ix1 + 1, iz) && !isHole(ix1 + 1, iz + edge)) ix1++;
            placeBar(
              ceilMinX + (ix + ix1 + 1) * TILE_SZ / 2,
              gridZ0 + iz * TILE_SZ + TILE_SZ / 2 + edge * half,
              (ix1 - ix + 1) * TILE_SZ - TILE_GAP,
              0
            );
            ix = ix1 + 1;
          } else {
            ix++;
          }
        }
      }
    }
    // Vertical bars (along Z) on east/west edges, merged into runs.
    for (let ix = 0; ix < tilesX; ix++) {
      for (const edge of [1, -1]) {
        let iz = 0;
        while (iz < tilesZ) {
          if (isHole(ix, iz) && !isHole(ix + edge, iz)) {
            let iz1 = iz;
            while (iz1 + 1 < tilesZ && isHole(ix, iz1 + 1) && !isHole(ix + edge, iz1 + 1)) iz1++;
            placeBar(
              ceilMinX + ix * TILE_SZ + TILE_SZ / 2 + edge * half,
              gridZ0 + (iz + iz1 + 1) * TILE_SZ / 2,
              (iz1 - iz + 1) * TILE_SZ - TILE_GAP,
              Math.PI / 2
            );
            iz = iz1 + 1;
          } else {
            iz++;
          }
        }
      }
    }
    holeFrameCount = slot;
    holeFrames.instanceMatrix.needsUpdate = true;
  };
  // The ceiling top is the "second roof" — a drivable surface the elevator
  // and the big staircase deliver the car to. Soft collider at the ceiling's
  // top face (CEIL_Y + 1) so buildingTopAt/ugElevatorTopAt seat the car on it.
  const ceilingColliders = [{
    x: (ceilMinX + ceilMaxX) / 2, z: (ceilMinZ + ceilMaxZ) / 2,
    halfW: (ceilMaxX - ceilMinX) / 2, halfD: (ceilMaxZ - ceilMinZ) / 2,
    h: CEIL_Y + 1, soft: true, ceiling: true,
  }];

  const COL_W = 3.5;
  const courseColumns = [
    { x: BUILD_ZONE.minX + 10, z: BUILD_ZONE.minZ + 10 },
    { x: BUILD_ZONE.maxX - 10, z: BUILD_ZONE.minZ + 10 },
    { x: BUILD_ZONE.minX + 10, z: BUILD_ZONE.maxZ - 10 },
    { x: BUILD_ZONE.maxX - 10, z: BUILD_ZONE.maxZ - 10 },
  ];
  const columnColliders = [];
  for (const c of courseColumns) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(COL_W, CEIL_Y, COL_W), pillarMat);
    col.position.set(c.x, CEIL_Y / 2, c.z);
    col.castShadow = true;
    parent.add(col);
    columnColliders.push({ x: c.x, z: c.z, halfW: COL_W / 2, halfD: COL_W / 2, h: CEIL_Y });
  }

  // Dim neon PointLights along the course zone: enough colored light for the
  // glowing props to read against dark rock, but short-range and dim so they
  // never wash out the cool Glass City glow to the north. Each light gets a
  // small emissive bulb so its source is visible in the cavern.
  const courseLights = [
    { color: NEON.cyan,    x: 45,  z: -55, y: 10 },
    { color: NEON.magenta, x: 115, z: -55, y: 10 },
    { color: NEON.lime,    x: 45,  z: 15,  y: 10 },
    { color: NEON.amber,   x: 115, z: 15,  y: 10 },
    { color: NEON.cyan,    x: 80,  z: -20, y: 12 },
  ];
  for (const L of courseLights) {
    const light = new THREE.PointLight(L.color, 1.0, 75, 2);
    light.position.set(L.x, L.y, L.z);
    parent.add(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), makeGlowMat(L.color));
    bulb.position.copy(light.position);
    parent.add(bulb);
  }

  // ---- Test ramp + suspended prompt-block prototype (task #5) ----
  // Solid wedge on the cavern floor, same def format + shape as the surface
  // ramps: main.js rides the slope and launches off the high end via the
  // `ramps` list this level returns. Rises toward +Z (north).
  const ugRamps = [];
  const rampMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4653, roughness: 0.98 });
  function addUgRamp(def, mat = rampMaterial) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(def.len, 0);
    shape.lineTo(def.len, def.height);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: def.width, bevelEnabled: false });
    geo.translate(-def.len / 2, 0, -def.width / 2);   // center wedge on its midpoint
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = Math.atan2(-def.runZ, def.runX);   // +X (base→top) lines up with run direction
    m.position.set(def.x, def.baseY || 0, def.z);     // baseY: stand on raised ground (peak pad)
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    ugRamps.push(def);
  }

  // ---- Suspended neon prompt-blocks (tasks #5–#6) ----
  // Glowing cubes hung off the cavern ceiling by thin rods. #5 parked the
  // prototype at the test ramp's jump-apex spot; #6 adds pass-through bump
  // detection: when an AIRBORNE car enters a block's trigger radius we fire
  // `onBlockBump(block)` once per approach (each block re-arms once the car
  // leaves its radius). No collider — the car flies straight through.
  const BLOCK_SIZE = 3;
  const BLOCK_RADIUS = 4;   // ≈ block half-size (1.5) + player car radius (2.2), rounded up
  const AIRBORNE_Y = 1.2;   // cavern-floor ride height is 0; above this ⇒ airborne
  // Task #7: bump feedback — a hit flashes the block's emissive (and its glow
  // light) then fades back to base, and the block sits out a short cooldown
  // during which it can't fire again.
  const BLOCK_COOLDOWN = 0.6;   // seconds a block is un-bumpable after a hit
  const FLASH_TIME = 0.45;      // seconds for the bump flash to fade back to base
  const FLASH_EMISSIVE = 2.6;   // extra emissiveIntensity at flash peak
  const FLASH_LIGHT = 2.2;      // extra PointLight intensity at flash peak
  const promptBlocks = [];
  function addPromptBlock(x, y, z, color = NEON.magenta) {
    // Own material instance (NOT the shared makeGlowMat cache) so a future
    // bump-flash can pulse one block without touching every other prop that
    // shares the same color.
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: GLOW_INTENSITY });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);

    const rodLen = CEIL_Y - (y + BLOCK_SIZE / 2);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, rodLen, 8), pillarMat);
    rod.position.set(x, y + BLOCK_SIZE / 2 + rodLen / 2, z);
    parent.add(rod);

    // Small glow so the block reads as a light source at night-club levels.
    const glow = new THREE.PointLight(color, 0.8, 30, 2);
    glow.position.set(x, y, z);
    parent.add(glow);

    const block = { mesh, mat, glow, x, y, z, radius: BLOCK_RADIUS, armed: true, cooldown: 0, flash: 0 };
    promptBlocks.push(block);
    return block;
  }

  // ---- Foam collectibles (task #8) ----
  // Every prompt-block bump pops out a big soft-colored foam ball: it launches
  // upward with a random sideways kick, falls under the same gravity as the
  // car, bounces on the cavern floor a couple of times (damped), then shrinks
  // away and despawns. Pure decoration — no collider, nothing to pick up.
  const FOAM_COLORS = [0xffd1dc, 0xc1f0c1, 0xc1d7f0, 0xf0e6c1, 0xe6c1f0]; // pastels
  const FOAM_R = 1.4;           // big soft-looking ball radius
  const FOAM_LIFE = 3.2;        // seconds of bouncing before it shrinks
  const FOAM_SHRINK = 0.7;      // seconds the shrink-out takes
  const FOAM_GRAVITY = 18;      // same gravity main.js uses for the car
  const FOAM_BOUNCE = 0.45;     // vertical restitution per floor hit
  const FOAM_MAX = 12;          // live-piece cap — beyond this, recycle the oldest
  const foamPieces = [];
  function disposeFoamPiece(f) {
    parent.remove(f.mesh);
    f.mesh.geometry.dispose();
    f.mesh.material.dispose();
  }
  function spawnFoam(x, y, z) {
    // Task #9: hard cap on live pieces so rapid bumps on several blocks can't
    // pile up geometry forever — once at the cap, the OLDEST piece is recycled
    // (removed + disposed) immediately to make room for the new one.
    while (foamPieces.length >= FOAM_MAX) disposeFoamPiece(foamPieces.shift());
    const color = FOAM_COLORS[(Math.random() * FOAM_COLORS.length) | 0];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(FOAM_R, 18, 14), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    foamPieces.push({
      mesh,
      vx: (Math.random() - 0.5) * 6,   // random sideways kick
      vy: 6 + Math.random() * 3,       // guaranteed pop upward
      vz: (Math.random() - 0.5) * 6,
      age: 0,
      bounces: 0,
    });
  }
  // Test ramp aimed at the block row — analytic jump apex at full throttle
  // (v=14): vy = 14·(8/16)·1.2 = 8.4, apex = vy²/2g ≈ 2 above the y=8 lip
  // → y ≈ 10, ~6.5 past the lip.
  addUgRamp({ x: 80, z: -35, runX: 0, runZ: 1, len: 16, width: 8, height: 8, boost: 1.2 });

  // Task #10: a row of prompt-blocks across the open zone at varied heights.
  // Heights follow the test-ramp flight profile — tall blocks sit near the
  // apex line (z ≈ -20), shorter ones further along the descent (z ≈ -14) —
  // so different jumps (speed, mid-air steer) clip different blocks. The row
  // spans the whole zone so later features (conduit lanes, elevator ledges,
  // the pyramid launch ramp) each have targets within reach. Spacing is 16
  // units — more than double the 4-unit trigger radius, so adjacent triggers
  // never overlap.
  const BLOCK_ROW = [
    { x: 32,  y: 5,  z: -14,   color: NEON.cyan },
    { x: 48,  y: 7,  z: -17,   color: NEON.lime },
    { x: 64,  y: 9,  z: -19,   color: NEON.amber },
    { x: 80,  y: 10, z: -20.5, color: NEON.magenta }, // test-ramp apex block
    { x: 96,  y: 9,  z: -19,   color: NEON.cyan },
    { x: 112, y: 7,  z: -17,   color: NEON.lime },
    { x: 128, y: 5,  z: -14,   color: NEON.amber },
  ];
  for (const spec of BLOCK_ROW) addPromptBlock(spec.x, spec.y, spec.z, spec.color);

  // ---- Conduit pipes (tasks #11–#14) ----
  // An oversized glowing conduit spans a narrow lane at bumper height on two
  // end posts. The pipe shuttles side-to-side across its lane (animated in
  // task #12) and shoves any car it sweeps through (knockback in task #13).
  // Geometry: the pipe axis lies along Z; it slides along X. Posts stand at
  // the slide extremes so a pipe end lands flush on a post at each turn-
  // around; at mid-slide there's an `amp`-wide gap on either side to thread.
  const PIPE_R = 1.2;
  const PIPE_Y = 2.4;         // centre height — underside ≈ bumper height
  const POST_W = 1.6;
  const POST_H = 4;
  const conduitPipes = [];
  const pipePostColliders = [];
  function addConduitPipe({ cx, cz, len, amp, axis = 'z', color = NEON.cyan, phase = 0, speed = 1 }) {
    // axis 'z': pipe lies along Z, slides along X (north-south lane).
    // axis 'x': pipe lies along X, slides along Z (east-west lane).
    const postOff = amp + len / 2;   // post distance from lane centre
    for (const side of [-1, 1]) {
      const px = axis === 'x' ? cx : cx + side * postOff;
      const pz = axis === 'x' ? cz + side * postOff : cz;
      const post = new THREE.Mesh(new THREE.BoxGeometry(POST_W, POST_H, POST_W), pillarMat);
      post.position.set(px, POST_H / 2, pz);
      post.castShadow = true;
      parent.add(post);
      pipePostColliders.push({ x: px, z: pz, halfW: POST_W / 2, halfD: POST_W / 2, h: POST_H });
    }
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R, PIPE_R, len, 14), makeGlowMat(color));
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;   // cylinder Y-axis → lie along X
    else mesh.rotation.x = Math.PI / 2;                // cylinder Y-axis → lie along Z
    mesh.position.set(cx, PIPE_Y, cz);
    mesh.castShadow = true;
    parent.add(mesh);
    const pipe = { mesh, cx, cz, len, amp, axis, phase, speed, hitCooldown: 0, hitCount: 0 };
    conduitPipes.push(pipe);
    return pipe;
  }

  // Task #14: four conduits across separate lanes, each with its own speed,
  // phase and colour; lane #4 runs the perpendicular direction. Lanes are
  // spaced so no two pipes' sweep volumes can ever intersect.
  addConduitPipe({ cx: 70, cz: -60, len: 26, amp: 10, speed: 1.2, phase: 0 });                        // N-S, cyan
  addConduitPipe({ cx: 112, cz: -60, len: 24, amp: 9, speed: 1.5, phase: 4.2, color: NEON.lime });     // N-S, lime
  addConduitPipe({ cx: 40, cz: -78, len: 20, amp: 8, speed: 0.9, phase: 2.1, color: NEON.magenta });   // N-S, magenta
  addConduitPipe({ cx: 115, cz: -30, len: 26, amp: 8, speed: 1.1, phase: 1.0, color: NEON.amber, axis: 'x' }); // E-W, amber

  // ---- Foam pit (task #15) ----
  // A recessed, padded landing zone the later elevator/beams tasks play
  // into. Visual only: a dark soft-looking floor patch ringed by raised
  // padded rim walls. Rims carry colliders (their h also feeds
  // buildingTopAt, so a falling car can land ON a rim); the interior stays
  // clear so knocked cars drop through to the floor inside. A gap in the
  // west rim lets drivers roll in and reverse back out.
  const PIT = { cx: 44, cz: -33, halfW: 13, halfD: 7, rimT: 1.2, rimH: 1.6, gapW: 6 };
  const pitSegLen = (PIT.halfD * 2 - PIT.gapW) / 2;   // west-rim segment length
  const pitPadMat = new THREE.MeshStandardMaterial({ color: 0x191228, roughness: 1 });
  const pitRimMat = new THREE.MeshStandardMaterial({ color: 0x3c2b52, roughness: 1 });
  const pitPatch = new THREE.Mesh(new THREE.BoxGeometry(PIT.halfW * 2, 0.12, PIT.halfD * 2), pitPadMat);
  pitPatch.position.set(PIT.cx, 0.06, PIT.cz);
  pitPatch.receiveShadow = true;
  parent.add(pitPatch);
  const pitRimY = PIT.rimH / 2;
  for (const s of [-1, 1]) {
    // North / south rims (full width so they cap the corners)
    const nsRim = new THREE.Mesh(new THREE.BoxGeometry(PIT.halfW * 2 + PIT.rimT * 2, PIT.rimH, PIT.rimT), pitRimMat);
    nsRim.position.set(PIT.cx, pitRimY, PIT.cz + s * (PIT.halfD + PIT.rimT / 2));
    nsRim.castShadow = true;
    parent.add(nsRim);
    // West rim, split around the drive-through gap centred on cz
    const wRim = new THREE.Mesh(new THREE.BoxGeometry(PIT.rimT, PIT.rimH, pitSegLen), pitRimMat);
    wRim.position.set(PIT.cx - PIT.halfW - PIT.rimT / 2, pitRimY, PIT.cz + s * (PIT.gapW / 2 + pitSegLen / 2));
    wRim.castShadow = true;
    parent.add(wRim);
  }
  const pitEastRim = new THREE.Mesh(new THREE.BoxGeometry(PIT.rimT, PIT.rimH, PIT.halfD * 2), pitRimMat);
  pitEastRim.position.set(PIT.cx + PIT.halfW + PIT.rimT / 2, pitRimY, PIT.cz);
  pitEastRim.castShadow = true;
  parent.add(pitEastRim);
  const pitRimColliders = [
    { x: PIT.cx, z: PIT.cz + PIT.halfD + PIT.rimT / 2, halfW: PIT.halfW + PIT.rimT / 2, halfD: PIT.rimT / 2, h: PIT.rimH },
    { x: PIT.cx, z: PIT.cz - PIT.halfD - PIT.rimT / 2, halfW: PIT.halfW + PIT.rimT / 2, halfD: PIT.rimT / 2, h: PIT.rimH },
    { x: PIT.cx + PIT.halfW + PIT.rimT / 2, z: PIT.cz, halfW: PIT.rimT / 2, halfD: PIT.halfD, h: PIT.rimH },
    { x: PIT.cx - PIT.halfW - PIT.rimT / 2, z: PIT.cz - PIT.gapW / 2 - pitSegLen / 2, halfW: PIT.rimT / 2, halfD: pitSegLen / 2, h: PIT.rimH },
    { x: PIT.cx - PIT.halfW - PIT.rimT / 2, z: PIT.cz + PIT.gapW / 2 + pitSegLen / 2, halfW: PIT.rimT / 2, halfD: pitSegLen / 2, h: PIT.rimH },
  ];

  // ---- Industrial car elevator (tasks #16–#18) ----
  // A flat metal deck with a glowing hazard-stripe skirt, looping smoothly
  // up and down over the pit. Its collider entry is marked `soft`: skipped
  // by isPositionBlocked (so you can drive under/onto the deck) but read by
  // buildingTopAt, whose `h` we rewrite every frame (task #18) so landings
  // and the main.js ground-ride logic always see the live deck height.
  const ELEV = { cx: 44, cz: -31, halfW: 5, halfD: 3.5, low: 0.55, high: 31, speed: 0.5 };
  const ELEV_MID = (ELEV.low + ELEV.high) / 2;
  const ELEV_AMP = (ELEV.high - ELEV.low) / 2;
  const elevMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.6, roughness: 0.4 });
  const elevGroup = new THREE.Group();
  elevGroup.position.set(ELEV.cx, ELEV.low - 0.25, ELEV.cz);
  parent.add(elevGroup);
  const elevDeck = new THREE.Mesh(new THREE.BoxGeometry(ELEV.halfW * 2, 0.5, ELEV.halfD * 2), elevMat);
  elevDeck.castShadow = true;
  elevDeck.receiveShadow = true;
  elevGroup.add(elevDeck);
  // Hazard-stripe edge: a thin amber-glow box ringing the deck just below
  // its top surface, so the lift reads industrial from every side.
  const elevStripe = new THREE.Mesh(
    new THREE.BoxGeometry(ELEV.halfW * 2 + 0.24, 0.18, ELEV.halfD * 2 + 0.24),
    makeGlowMat(NEON.amber)
  );
  elevStripe.position.y = -0.16;
  elevGroup.add(elevStripe);
  const elevatorCollider = { x: ELEV.cx, z: ELEV.cz, halfW: ELEV.halfW, halfD: ELEV.halfD, h: ELEV.low, soft: true };
  const elevatorColliders = [elevatorCollider];

  // ---- The y=9 "roof over the elevator hub" is GONE ----
  // The ledges, balance beams and sweeper arms that used to ring the elevator
  // at its old top height (y=9) were removed so the elevator can rise all the
  // way to the cavern ceiling — the real "second roof". The sweepers array
  // stays empty so the ?debug hook (ugSweepers) keeps returning [].
  const sweepers = [];

  // ---- Big staircase up to the second roof (the cavern ceiling) ----
  // A proper stepped staircase (no moving parts, no smooth ramp) standing
  // OUTSIDE the cavern ceiling — it climbs from the open floor west of the
  // ceiling up to the ceiling's west edge, so you drive up the steps and roll
  // straight ONTO the ceiling top (the "second roof", CEIL_Y = 30, top face
  // at 31). The whole staircase sits west of x=12 (outside the ceiling), so
  // the car never drives "up through the roof". Each step is a solid box with
  // a neon front-edge strip; soft climb colliders let the car drive up it
  // step by step.
  const CEIL_TOP = CEIL_Y + 1;   // 31 — the ceiling's top face (the second roof)
  const STAIRS = {
    cx: -22,            // centre of the x-span (x ∈ [-56, 12])
    width: 12,          // z span of the steps (z ∈ [-56, -44])
    cz: -50,            // centre of the z-span (clear of the Holy Mountain)
    topX: 12,           // x of the top step's east face (meets the ceiling's west edge)
    topY: CEIL_TOP,     // 31 — the ceiling top (second roof height)
    steps: 31,          // risers; the top step reaches y = 31
    stepH: 1,           // riser height per step
    stepD: 2.2,         // tread depth per step
  };
  const PEAK_Y = STAIRS.topY;   // 31 — the ceiling top
  const stairMat = new THREE.MeshStandardMaterial({ color: 0x453f52, roughness: 0.85 });
  const stairColliders = [];    // static: step climb colliders + side skirts

  // The steps themselves: full-height boxes so the silhouette is a proper
  // staircase. They climb EAST — the top step's east face sits at topX=12
  // (the ceiling's west edge), so you drive up the steps and roll straight
  // onto the ceiling top (y=31). Colliders are `soft` — they feed
  // ugElevatorTopAt (stand/climb on them) but never wall off driving.
  const stripeColors = [NEON.cyan, NEON.magenta, NEON.amber, NEON.lime];
  for (let k = 0; k < STAIRS.steps; k++) {
    const h = (k + 1) * STAIRS.stepH;
    const cx = STAIRS.topX - (STAIRS.steps - k - 0.5) * STAIRS.stepD;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(STAIRS.stepD, h, STAIRS.width), stairMat);
    mesh.position.set(cx, h / 2, STAIRS.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    // Glow stripe along each tread's front (west) edge — reads as edge
    // lighting and marks the climbable face.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.16, STAIRS.width + 0.16),
      makeGlowMat(stripeColors[k % 4])
    );
    stripe.position.set(cx - STAIRS.stepD / 2 - 0.02, h - 0.06, STAIRS.cz);
    parent.add(stripe);
    // Soft climb collider for this step (overlapping neighbours so there's
    // never a gap the car can fall through while climbing).
    stairColliders.push({
      x: cx + STAIRS.stepD * 0.25, z: STAIRS.cz,
      halfW: STAIRS.stepD * 0.75, halfD: STAIRS.width / 2, h, soft: true,
    });
  }

  // Solid curb skirts down the north/south faces: without them a grounded car
  // could clip straight through the staircase's side (soft colliders never
  // block). They sit JUST outside the step footprints so buildingTopAt never
  // reports a phantom roof strip.
  const skirtHalfW = (STAIRS.steps * STAIRS.stepD) / 2;
  const skirtX = STAIRS.topX - skirtHalfW;
  for (const side of [-1, 1]) {
    const sz = STAIRS.cz + side * (STAIRS.width / 2 + 0.6);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(skirtHalfW * 2, 1.0, 1.2), pillarMat);
    skirt.position.set(skirtX, 0.5, sz);
    parent.add(skirt);
    stairColliders.push({ x: skirtX, z: sz, halfW: skirtHalfW, halfD: 0.6, h: 0.5 });
  }

  // ---- Grand ramp up to the second roof (NORTH side) ----
  // The staircase climbs the ceiling's WEST edge; this is its mirror on the
  // NORTH edge — a smooth wedge ramp (not steps) rising from the open floor
  // north of the ceiling up to the ceiling's north edge (z=48, y=31), facing
  // the Glass City skyline. It's HALF the staircase's footprint length, so
  // it's twice as steep — the candy waterfall pours down a much more
  // dramatic slope. Side walls just tall enough to keep the car from falling
  // off run the full length of the ramp. The ramp also doubles as a candy
  // waterfall: glowing gemstones spawn at the top, tumble down the slope in
  // a jumble, and vanish the moment they hit the cavern floor. They're
  // knockable — lighter than traffic cars — so driving up the ramp means
  // plowing through a torrent of bouncing candy (except the big heavy ones,
  // which knock YOU back).
  const GRAND = {
    x: 80,             // centre of the x-span on the ceiling's north edge
    z: 65,             // centre of the z-span (z ∈ [48, 82])
    len: 34,           // half the staircase footprint → twice as steep
    width: 12,         // same width as the staircase
    // Rises to the ceiling's drivable top. buildingTopAt reports a collider
    // top as h + 0.3, so the ramp must top out at CEIL_TOP + 0.3 (31.3) —
    // otherwise the car drives off the ramp's high edge a hair below the
    // ceiling surface and the airborne landing tolerance (0.4) misses it,
    // dumping the car back onto the cavern floor.
    height: CEIL_TOP + 0.3,
    runX: 0,           // rises toward -Z (south) to meet the ceiling's north edge
    runZ: -1,
    boost: 0,          // no launch off the top — drive up and roll onto the roof
  };
  const grandRampMat = new THREE.MeshStandardMaterial({ color: 0x453f52, roughness: 0.85 });
  const grandColliders = [];
  // The wedge + walls share one group so the tilted walls follow the slope
  // exactly. Local frame: base→top along +X, up along +Y, across along +Z.
  {
    const rampGroup = new THREE.Group();
    rampGroup.rotation.y = Math.atan2(-GRAND.runZ, GRAND.runX);
    rampGroup.position.set(GRAND.x, 0, GRAND.z);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(GRAND.len, 0);
    shape.lineTo(GRAND.len, GRAND.height);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: GRAND.width, bevelEnabled: false });
    geo.translate(-GRAND.len / 2, 0, -GRAND.width / 2);
    const wedge = new THREE.Mesh(geo, grandRampMat);
    wedge.castShadow = true;
    wedge.receiveShadow = true;
    rampGroup.add(wedge);
    // Side walls: tilted boxes running the full length of the ramp, just tall
    // enough to keep the car from falling off. Rotated by the slope angle so
    // each wall's bottom follows the ramp surface and its top stays a fixed
    // height above it.
    const theta = Math.atan2(GRAND.height, GRAND.len);
    const normal = new THREE.Vector3(-Math.sin(theta), Math.cos(theta), 0);
    const WALL_H = 1.8;   // wall height above the ramp surface
    const WALL_T = 0.6;   // wall thickness
    const RAIL_H = 0.35;  // top-rail cap height
    // The wall/rail run the FULL length of the ramp's sloped surface, not
    // its horizontal footprint — so they must be as long as the hypotenuse
    // and centred on the surface's midpoint (local x=0), otherwise they'd
    // only cover the top of the ramp and stick out past its high edge.
    const wallLen = Math.hypot(GRAND.len, GRAND.height);
    // Guardrail look: a solid dark wall body, a light top rail running the
    // full length, and vertical support posts on the outside — so the walls
    // read as barriers that keep the car from falling off the waterfall.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3434, roughness: 1 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb0a48c, roughness: 0.7, emissive: 0x6a5f4a, emissiveIntensity: 0.35 });
    for (const side of [-1, 1]) {
      // Solid wall body (tilted to follow the slope).
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wallLen, WALL_H, WALL_T), wallMat);
      wall.rotation.z = theta;
      wall.position.set(
        normal.x * (WALL_H / 2),
        GRAND.height / 2 + normal.y * (WALL_H / 2),
        side * (GRAND.width / 2 + WALL_T / 2)
      );
      wall.castShadow = true;
      rampGroup.add(wall);
      // Top rail: a light cap running the wall's full length.
      const rail = new THREE.Mesh(new THREE.BoxGeometry(wallLen, RAIL_H, WALL_T + 0.3), railMat);
      rail.rotation.z = theta;
      rail.position.set(
        normal.x * (WALL_H + RAIL_H / 2),
        GRAND.height / 2 + normal.y * (WALL_H + RAIL_H / 2),
        side * (GRAND.width / 2 + WALL_T / 2)
      );
      rail.castShadow = true;
      rampGroup.add(rail);
      // Vertical support posts on the outside face, from the ramp surface up
      // to the rail. The vertical gap between the surface and the rail is
      // constant, so every post is the same height. px runs 0..len along the
      // ramp's horizontal footprint, so the post's local x is px - len/2
      // (base at -len/2, top at +len/2) to sit on the actual ramp surface.
      const POST_COUNT = 6;
      const postH = (WALL_H + RAIL_H / 2) * Math.cos(theta);
      for (let i = 0; i <= POST_COUNT; i++) {
        const px = (GRAND.len / POST_COUNT) * i;
        const surfY = GRAND.height * (px / GRAND.len);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, postH, 0.5), railMat);
        post.position.set(px - GRAND.len / 2, surfY + postH / 2, side * (GRAND.width / 2 + WALL_T + 0.25));
        post.castShadow = true;
        rampGroup.add(post);
      }
      // Axis-aligned barrier collider along the wall's footprint. Marked
      // `noRoof` so buildingTopAt never reports it as a surface (which would
      // make the elevated check let the car drive straight through it).
      grandColliders.push({
        x: GRAND.x + side * (GRAND.width / 2 + WALL_T / 2), z: GRAND.z,
        halfW: WALL_T / 2, halfD: GRAND.len / 2, h: WALL_H, noRoof: true,
      });
    }
    parent.add(rampGroup);
    ugRamps.push(GRAND);
  }
  // Ramp surface height at world z (the ramp is axis-aligned along Z).
  function grandRampSurfaceY(pz) {
    const s = (GRAND.z + GRAND.len / 2 - pz) / GRAND.len;   // 0 at base, 1 at top
    return GRAND.height * s;
  }
  // A couple of course lights so the ramp and its candy waterfall read in
  // the dark — magenta at the top (the gemstone spawn), cyan at the base.
  const grandTopLight = new THREE.PointLight(NEON.magenta, 1.6, 70, 2);
  grandTopLight.position.set(GRAND.x, 24, GRAND.z - GRAND.len / 2 + 4);
  parent.add(grandTopLight);
  const grandBaseLight = new THREE.PointLight(NEON.cyan, 1.2, 60, 2);
  grandBaseLight.position.set(GRAND.x, 6, GRAND.z + GRAND.len / 2 - 4);
  parent.add(grandBaseLight);

  // ---- Candy waterfall (glowing gemstones) ----
  // A pool of glowing gemstones of all shapes and sizes. They spawn at the
  // top of the grand ramp, slide down the slope in a jumble, and vanish on
  // ground impact. When the car gets close they're knocked off — bounced
  // away from the car like light traffic, then they fall and vanish. A
  // fraction are BIG: they barely budge when hit and instead slam the car
  // back down the ramp (onGemSlam). Most big gems are only 1/3 weight (a
  // gentle nudge); 1 in 100 is full-weight, glows red, and really shoves
  // you back.
  const GEM_COLORS = [NEON.cyan, NEON.magenta, NEON.amber, NEON.lime];
  const GEM_POOL = 120;          // twice the spawn rate needs ~2× live gems
  const GEM_SPAWN_INTERVAL = 0.05;  // was 0.1 — twice as much candy
  const GEM_KNOCK_RADIUS = 3.0;
  const GEM_GRAVITY = 25;
  const GEM_BIG_CHANCE = 0.03;   // fraction of gems that are large & heavy
  const GEM_HEAVY_CHANCE = 0.08; // of the big gems, fraction that are full-weight (doubled 2026-09-13)
  const GRAND_SLOPE = Math.atan2(GRAND.height, GRAND.len);
  const gemGeos = [
    new THREE.OctahedronGeometry(1, 0),
    new THREE.ConeGeometry(0.8, 1.6, 6),
    new THREE.SphereGeometry(0.9, 12, 10),
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.TetrahedronGeometry(1, 0),
  ];
  const gemstones = [];
  for (let i = 0; i < GEM_POOL; i++) {
    const geo = gemGeos[(Math.random() * gemGeos.length) | 0];
    const color = GEM_COLORS[(Math.random() * GEM_COLORS.length) | 0];
    const mesh = new THREE.Mesh(geo, makeGlowMat(color));
    mesh.scale.setScalar(0.3 + Math.random() * 0.6);
    mesh.visible = false;
    parent.add(mesh);
    gemstones.push({
      mesh, baseMat: mesh.material, active: false, x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0, slideSpeed: 0, spin: 0, knocked: false, age: 0,
      big: false, heavy: false, slamCd: 0,
    });
  }
  let gemSpawnTimer = 0;
  function recycleGemstone(g) {
    g.active = false;
    g.mesh.visible = false;
  }
  function spawnGemstone() {
    const g = gemstones.find((gg) => !gg.active);
    if (!g) return;
    g.active = true;
    g.knocked = false;
    g.age = 0;
    g.big = Math.random() < GEM_BIG_CHANCE;
    // Of the big gems, only 1 in 100 is full-weight; the rest look the same
    // but weigh a third as much (they still knock the car, just gently).
    g.heavy = g.big && Math.random() < GEM_HEAVY_CHANCE;
    // Full-weight gems glow red so you can see them coming down the ramp.
    g.mesh.material = g.heavy ? makeGlowMat(NEON.red) : g.baseMat;
    g.slamCd = 0;
    // Big gems are visibly larger — heavy candy that reads at a glance.
    g.mesh.scale.setScalar(g.big ? 1.6 + Math.random() * 0.8 : 0.3 + Math.random() * 0.6);
    // Spawn near the top of the ramp, spread across its width.
    g.z = GRAND.z - GRAND.len / 2 + 1 + Math.random() * 4;   // z ≈ 49–53
    g.x = GRAND.x + (Math.random() - 0.5) * (GRAND.width - 2);
    g.y = grandRampSurfaceY(g.z) + (g.big ? 0.5 : 0.4) + Math.random() * 0.6;
    g.vx = (Math.random() - 0.5) * 2;
    g.vy = 0;
    g.vz = 0;
    g.slideSpeed = 3 + Math.random() * 3;
    g.spin = (Math.random() - 0.5) * 8;
    g.mesh.position.set(g.x, g.y, g.z);
    g.mesh.visible = true;
  }

  // ---- Padded vertical pole (tasks #31–#34) ----
  // Tall cushioned column standing on the open floor as a standalone landmark
  // (the launch ramp that used to feed it was removed). A solid small collider
  // makes ground bonks physical, while a larger pass-through TRIGGER volume
  // catches flights: slam it above POLE_BIG_SPEED and you get the reward
  // sequence (light burst here + boom/bounce via onPoleHit); below that it
  // just soft-bounces you off (main.js damps the knock).
  const POLE = { x: 95, z: -64, r: 1.6, h: 16, trigR: 5.5, bigSpeed: 8 };
  const poleBodyMat = new THREE.MeshStandardMaterial({ color: 0x2e2a38, roughness: 0.9 });
  const poleBody = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE.r, POLE.r + 0.35, POLE.h, 14),
    poleBodyMat
  );
  poleBody.position.set(POLE.x, POLE.h / 2, POLE.z);
  poleBody.castShadow = true;
  parent.add(poleBody);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1, 4.4), pillarMat);
  plinth.position.set(POLE.x, 0.5, POLE.z);
  plinth.castShadow = true;
  parent.add(plinth);
  // Cushion rings up the column — reads as padding, glows in the dark.
  [3.5, 7, 10.5, 14].forEach((ry, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(POLE.r + 0.18, 0.24, 10, 26),
      makeGlowMat(i % 2 ? NEON.magenta : NEON.cyan)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(POLE.x, ry, POLE.z);
    parent.add(ring);
  });
  // Solid core collider (h < visual height so big flights clear the tip;
  // buildingTopAt's min() cap stops it snapping cars UP from below anyway).
  stairColliders.push({ x: POLE.x, z: POLE.z, halfW: POLE.r, halfD: POLE.r, h: 14 });
  const poleState = { hits: 0, last: null };
  let poleCd = 0;

  // Task #33: explosive light show — a ring of colored PointLights flashing
  // out plus two expanding shockwave rings, all fading over ~1 second.
  const fxBursts = [];
  function spawnPoleBurst(x, y, z) {
    const cols = [NEON.cyan, NEON.magenta, NEON.amber, NEON.lime, NEON.cyan, NEON.magenta];
    const lights = [];
    for (let i = 0; i < 6; i++) {
      const L = new THREE.PointLight(cols[i], 5.5, 30, 2);
      const a = (i / 6) * Math.PI * 2;
      L.position.set(x + Math.cos(a) * 2.2, y + 1.2, z + Math.sin(a) * 2.2);
      parent.add(L);
      lights.push({ light: L, delay: i * 0.06 });
    }
    const mkRing = (rx, rz) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.15, 42),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
      );
      m.rotation.set(rx, 0, rz);
      m.position.set(x, y + 0.3, z);
      parent.add(m);
      return m;
    };
    fxBursts.push({ age: 0, life: 1.0, lights, rings: [mkRing(-Math.PI / 2, 0), mkRing(0, Math.PI / 2)] });
  }

  // Task #35 helper: is the car ghosting at floor level inside the solid
  // staircase / roof footprint? (Soft colliders never block, so a car that
  // enters a slot too low to snap up can sit inside the boxes.) main.js
  // nudges it back out to open floor after a moment.
  function stairGhostAt(x, y, z) {
    if (y > 0.45) return false;
    for (const c of stairColliders) {
      if (Math.abs(x - c.x) <= c.halfW && Math.abs(z - c.z) <= c.halfD && y < c.h - 1.2) return true;
    }
    return false;
  }

  // ---- The Holy Mountain (hollow snow-capped peak, west cavern) ----
  // A full cone rising off the open western floor: drive the pilgrim's road
  // (a spiral of wedge ramps) up to its snowy summit pad — the highest point
  // in the cavern. The mountain is HOLLOW: around on its far side (south-
  // west, away from the road start) a cave mouth opens into a torch-lit
  // chamber where a man in a huge brimmed white hat stands flanked by two
  // goats under a mysterious pulsing light. The chamber roof has an oculus
  // skylight — land on the peak-pad-adjacent roof and you can drop in.
  // All layout numbers come from the pure module (and its tests); here we
  // only shape meshes and register colliders.
  const mountColliders = [];
  const coneR = (y) => coneRadiusAt(y, MOUNT);
  const mountRockMat = new THREE.MeshStandardMaterial({ color: 0x4a4148, roughness: 1, side: THREE.DoubleSide });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fb, roughness: 0.95 });
  const caveMat = new THREE.MeshStandardMaterial({ color: 0x17131c, roughness: 1, side: THREE.DoubleSide });
  const roadStoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6470, roughness: 0.95 });
  const frame = mouthFrame();
  // Lathe phi → world angle: a lathe vertex sits at (r·sinφ, y, r·cosφ), so
  // world azimuth β = π/2 − φ. Invert for the gap placement.
  const phiForBeta = (beta) => Math.PI / 2 - beta;

  // Lower rock band (y 0 → just above the lintel), full circle MINUS the
  // mouth gap — the gap IS the cave-mouth opening.
  const bandTopY = MOUNT.archH + 0.1;
  const lowerBand = new THREE.Mesh(
    new THREE.LatheGeometry(
      [new THREE.Vector2(0.03, 0), new THREE.Vector2(MOUNT.baseR, 0), new THREE.Vector2(coneR(bandTopY), bandTopY)],
      48,
      phiForBeta(frame.betaM) + MOUNT.archHalf,
      Math.PI * 2 - MOUNT.archHalf * 2
    ),
    mountRockMat
  );
  lowerBand.castShadow = true;
  parent.add(lowerBand);

  // Upper shell (lintel → snowline → summit rim), FULL circle: it overhangs
  // the mouth gap from above, forming the arch's natural rock lintel.
  const upperShell = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(coneR(MOUNT.archH), MOUNT.archH),
        new THREE.Vector2(coneR(MOUNT.snowY), MOUNT.snowY),
        new THREE.Vector2(MOUNT.padR, MOUNT.peakY),
      ],
      48,
      0,
      Math.PI * 2
    ),
    mountRockMat
  );
  upperShell.castShadow = true;
  parent.add(upperShell);

  // Throat side walls: flat quads closing the mouth tunnel between the
  // chamber wall and the shell along each gap edge.
  for (const beta of frame.edgeBeta) {
    const dx = Math.cos(beta), dz = Math.sin(beta);
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      frame.throatInnerR * dx, 0, frame.throatInnerR * dz,
      MOUNT.baseR * dx, 0, MOUNT.baseR * dz,
      frame.throatOuterR * dx, MOUNT.archH, frame.throatOuterR * dz,
      frame.throatInnerR * dx, MOUNT.archH, frame.throatInnerR * dz,
    ]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    quad.computeVertexNormals();
    parent.add(new THREE.Mesh(quad, mountRockMat));
  }

  // The hollow chamber: dark curved walls, a ceiling ring with an open
  // oculus, and a short skylight shaft up into the peak's innards.
  const CHAMBER_R = 14;
  const CHAMBER_H = 17;
  const OCULUS_R = 9.5;
  const chamberWall = new THREE.Mesh(
    new THREE.CylinderGeometry(CHAMBER_R, CHAMBER_R, CHAMBER_H, 40, 1, true),
    caveMat
  );
  chamberWall.position.set(MOUNT.cx, CHAMBER_H / 2, MOUNT.cz);
  parent.add(chamberWall);
  const chamberCeil = new THREE.Mesh(new THREE.RingGeometry(OCULUS_R, CHAMBER_R + 0.3, 40), caveMat);
  chamberCeil.rotation.x = -Math.PI / 2;
  chamberCeil.position.set(MOUNT.cx, CHAMBER_H, MOUNT.cz);
  parent.add(chamberCeil);
  const oculusShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(OCULUS_R + 0.1, OCULUS_R + 0.1, 4, 40, 1, true),
    caveMat
  );
  oculusShaft.position.set(MOUNT.cx, CHAMBER_H + 2, MOUNT.cz);
  parent.add(oculusShaft);

  // Snow cap: a white frustum draped over everything above the snowline,
  // its flat top face BEING the summit platform the road arrives on.
  const snowBottomY = 16.9;
  const snowCap = new THREE.Mesh(
    new THREE.CylinderGeometry(MOUNT.padR + 0.4, coneR(snowBottomY) + 0.75, MOUNT.peakY - snowBottomY, 48),
    snowMat
  );
  snowCap.position.set(MOUNT.cx, (snowBottomY + MOUNT.peakY) / 2, MOUNT.cz);
  snowCap.castShadow = true;
  parent.add(snowCap);

  // The pilgrim's road: chained wedge ramps spiralling up the outside of the
  // cone (layout + soft ride colliders verified in the pure module's tests).
  const roadSegs = spiralSegments();
  for (const seg of roadSegs) {
    addUgRamp(seg, roadStoneMat);
    mountColliders.push(seg.collider);
  }
  // Lantern posts mark where the road starts, so wanderers spot the climb.
  {
    const s0 = roadSegs[0];
    const startX = s0.x - s0.runX * s0.len / 2;
    const startZ = s0.z - s0.runZ * s0.len / 2;
    const px = -s0.runZ, pz = s0.runX;   // perpendicular across the road
    for (const side of [-1, 1]) {
      const lx = startX + px * side * (MOUNT.roadHalfW + 1.1);
      const lz = startZ + pz * side * (MOUNT.roadHalfW + 1.1);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.8, 8), pillarMat);
      post.position.set(lx, 1.4, lz);
      parent.add(post);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), makeGlowMat(NEON.amber));
      lamp.position.set(lx, 3, lz);
      parent.add(lamp);
    }
  }

  // Invisible collision layout: flank rings that seal the rock against
  // ground cars (mouth sector exempt), tunnel-wall staircases, the chamber
  // wall ring, the shrine dais, plus the soft summit pad and the chamber-
  // ceiling planks around the oculus hole (land up there, roll in, drop).
  const blockers = mountainBlockers();
  for (const r of blockers.solids) mountColliders.push(r);
  for (const r of blockers.softs) mountColliders.push(r);

  // ---- The shrine: holy man, two goats, mysterious light ----
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8695, roughness: 0.9 });
  const robeMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8c9a8, roughness: 0.8 });
  const goatMat = new THREE.MeshStandardMaterial({ color: 0xdad5c9, roughness: 0.9 });
  const shrine = new THREE.Group();
  shrine.position.set(MOUNT.cx, 0, MOUNT.cz);
  // Model built facing local +Z; turn it to face out through the mouth.
  shrine.rotation.y = Math.atan2(frame.dirX, frame.dirZ);
  parent.add(shrine);
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 0.7, 24), stoneMat);
  dais.position.y = 0.35;
  dais.castShadow = true;
  dais.receiveShadow = true;
  shrine.add(dais);

  // The man: tall white robe, calm head, and the huge brimmed white hat.
  const man = new THREE.Group();
  man.position.y = 0.7;
  shrine.add(man);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.95, 2.1, 12), robeMat);
  robe.position.y = 1.05;
  robe.castShadow = true;
  man.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), skinMat);
  head.position.y = 2.42;
  man.add(head);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.1, 20), robeMat);
  brim.position.y = 2.72;
  brim.castShadow = true;
  man.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.85, 12), robeMat);
  crown.position.y = 3.22;
  crown.castShadow = true;
  man.add(crown);

  // A little goat: legs, body, alert head, curled horns, tiny tail.
  function makeGoat() {
    const g = new THREE.Group();
    for (const lx of [-0.55, 0.55]) {
      for (const lz of [-0.42, 0.42]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), goatMat);
        leg.position.set(lx, 0.25, lz);
        g.add(leg);
      }
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 1.5), goatMat);
    body.position.y = 0.86;
    body.castShadow = true;
    g.add(body);
    const gHead = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.55), goatMat);
    gHead.position.set(0, 1.12, 0.92);
    g.add(gHead);
    for (const hx of [-0.15, 0.15]) {
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.055, 8, 16, 2.0), goatMat);
      horn.position.set(hx, 1.32, 0.78);
      horn.rotation.x = -1.1;
      horn.rotation.z = hx > 0 ? -0.35 : 0.35;
      g.add(horn);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.1), goatMat);
    tail.position.set(0, 1.08, -0.78);
    tail.rotation.x = 0.5;
    g.add(tail);
    return g;
  }
  for (const side of [-1, 1]) {
    const goat = makeGoat();
    goat.position.set(side * 2.45, 0.7, 0);
    goat.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;   // face outward
    shrine.add(goat);
  }

  // Candle ring on the dais rim (shared material so they flicker together).
  const candleMat = new THREE.MeshStandardMaterial({
    color: 0xbef5e2, emissive: 0xbef5e2, emissiveIntensity: 1.6,
  });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 8), candleMat);
    candle.position.set(Math.cos(a) * 2.9, 0.91, Math.sin(a) * 2.9);
    shrine.add(candle);
  }

  // The mysterious light: a glowing orb hovering over the shrine, a wide
  // soft beam falling from the oculus, and a warm light that spills out of
  // the mouth and paints the slope — visible from clear across the cavern.
  const orbMat = new THREE.MeshStandardMaterial({ color: 0xffedbe, emissive: 0xffedbe, emissiveIntensity: 2.4 });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12), orbMat);
  orb.position.y = 6.2;
  shrine.add(orb);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 1.6, 14.5, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff3cf, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  beam.position.y = 9.95;
  beam.renderOrder = 5;
  shrine.add(beam);
  const mysteryLight = new THREE.PointLight(0xffe6ae, 2.0, 46, 2);
  mysteryLight.position.set(MOUNT.cx, 7, MOUNT.cz);
  parent.add(mysteryLight);
  const caveFill = new THREE.PointLight(0x8fd8ff, 0.5, 30, 2);
  caveFill.position.set(MOUNT.cx, 11, MOUNT.cz);
  parent.add(caveFill);

  // Live state for update() + the ?debug hook.
  const holy = {
    MOUNT,
    t: 0,
    entered: false,   // set once the car gets within 12 units of the shrine
    light: mysteryLight,
    orb,
    beam,
    candleMat,
  };

  const glassCity = addGlassCity(parent);
  const cityGlow = new THREE.PointLight(0x9fb8ff, 2.4, 190, 1);
  cityGlow.position.set(0, 26, 152);
  parent.add(cityGlow);

  // Foreboding sky above the cavern ceiling (dark dome, drifting dark
  // clouds, a scatter of stars, colorful constellations) — visible from the
  // second roof and through crumbled holes. Purely decorative.
  const sky = addUndergroundSky(parent, mergeGeoms);

  const colliders = [...pillarColliders, ...columnColliders, ...pipePostColliders, ...pitRimColliders, ...elevatorColliders, ...ceilingColliders, ...stairColliders, ...grandColliders, ...mountColliders, ...glassCity.colliders];

  let bumpCount = 0;
  let lastBump = null;
  let elapsed = 0;   // course clock for sine-animated props (conduits, …)
  let prevX = 0, prevY = 0, prevZ = 0, havePrev = false;
  let lastTileIdx = -1;   // checkerboard tile under the car last frame (edge-trigger)

  // Stair surface height at (x, z): returns the top of the step the car
  // would be standing on, or -Infinity if outside the staircase footprint.
  // Used by main.js for the bumpy pitch calculation while climbing.
  function stairHeightAt(x, z) {
    if (Math.abs(z - STAIRS.cz) > STAIRS.width / 2) return -Infinity;
    const u = (STAIRS.topX - x) / STAIRS.stepD;
    if (u < 0 || u > STAIRS.steps) return -Infinity;
    let k = Math.floor(STAIRS.steps - u);
    if (k < 0) k = 0;
    if (k > STAIRS.steps - 1) k = STAIRS.steps - 1;
    return (k + 1) * STAIRS.stepH;
  }

  const checker = {    // checkerboard ceiling: grid dims + per-tile color state
    grid: checkerGrid,
    state: checkerState,
    gone: checkerGone,
    tilesX,
    tilesZ,
    tileSz: TILE_SZ,
    minX: ceilMinX,
    minZ: gridZ0,
    neon: CHECKER_NEON,
    tick: 0,   // TEMP DEBUG: update-frame counter
    holeFrames,   // glowing orange outlines around holes (InstancedMesh)
    get holeCount() { return holeFrameCount; },
  };

  return {
    colliders,
    sky,           // foreboding sky all around the cavern (dark clouds, stars, constellations)
    ramps: ugRamps,
    floor: plain,   // cavern floor mesh (1970s vinyl kitchen floor) — for the ?debug hook
    promptBlocks,
    foamPieces,
    spawnFoam,   // exposed for the ?debug test hook (foam-cap recycling)
    conduitPipes,
    sweepers,
    STAIRS,      // footprint constants (solid ramp + big flat roof)
    GRAND,       // grand-ramp footprint constants (steeper east twin of the staircase)
    gemstones,   // candy-waterfall gemstone pool (for the ?debug hook)
    poleState,   // padded-pole hit counter + last hit info (tasks #31–#32)
    stairGhostAt, // task #35: floor-level ghost detection inside the staircase
    stairHeightAt, // bumpy stair pitch — height of the step surface at (x, z)
    holy,        // Holy Mountain live state (mystery-light pulse, entered flag)
    checker,
    // ?debug: force the tile under (x, z) to reach red and start crumbling
    // (for testing the hole-fall + hole-outline visuals without 5 drive-overs).
    forceCrumble: (x, z) => {
      const tx = Math.floor((x - ceilMinX) / TILE_SZ);
      const tz = Math.floor((z - gridZ0) / TILE_SZ);
      if (tx < 0 || tx >= tilesX || tz < 0 || tz >= tilesZ) return false;
      const idx = tz * tilesX + tx;
      if (checkerGone[idx]) return false;
      checkerState[idx] = 2 + CHECKER_NEON.length - 1;   // red (terminal)
      _tileColor.set(0xff3b3b);
      checkerGrid.setColorAt(idx, _tileColor);
      checkerGrid.instanceColor.needsUpdate = true;
      checkerCrumble[idx] = CEIL_FLASH_TIME + CEIL_FALL_TIME;
      crumbleActive.add(idx);
      return true;
    },
    spiralTubeMat: tubeMat, // arrival cinematic fades the tube translucent so the orbiting camera can see the car inside
    get bumpCount() { return bumpCount; },
    get lastBump() { return lastBump; },
    update(delta, player) {
      glassCity.update(delta, player);
      elapsed += delta;
      sky.update(delta, elapsed, player);
      // Checkerboard ceiling: when the car drives over a tile, advance it one
      // step through the neon sequence (dark → cyan → lime → amber → magenta
      // → red). Red is terminal — once a tile is red it stays lit forever.
      // Edge-triggered on the tile under the car so a tile advances once per
      // visit, not every frame while the car sits on it.
      if (player) {
        checker.tick++;
        const tx = Math.floor((player.x - ceilMinX) / TILE_SZ);
        const tz = Math.floor((player.z - gridZ0) / TILE_SZ);
        if (tx >= 0 && tx < tilesX && tz >= 0 && tz < tilesZ) {
          const idx = tz * tilesX + tx;
          if (idx !== lastTileIdx) {
            lastTileIdx = idx;
            const st = checkerState[idx];
            if (st < 2 + CHECKER_NEON.length - 1) {   // not yet red
              checkerState[idx] = st + 1;
              _tileColor.set(CHECKER_NEON[Math.max(0, st - 1)]);
              checkerGrid.setColorAt(idx, _tileColor);
              checkerGrid.instanceColor.needsUpdate = true;
              // Just reached red → start the crumble countdown: flash
              // red/white, then fall away, leaving a hole.
              if (checkerState[idx] >= 2 + CHECKER_NEON.length - 1) {
                checkerCrumble[idx] = CEIL_FLASH_TIME + CEIL_FALL_TIME;
                crumbleActive.add(idx);
              }
            }
          }
        } else {
          lastTileIdx = -1;
        }
      }
      // Crumble animation: tiles that reached red flash red/white for a few
      // seconds (giving the car time to drive off), then shrink and fall
      // through the ceiling, leaving a hole the car can drop through.
      if (crumbleActive.size > 0) {
        for (const i of crumbleActive) {
          checkerCrumble[i] -= delta;
          const t = checkerCrumble[i];
          if (t > CEIL_FALL_TIME) {
            // Flashing phase: alternate red ↔ white at ~4 Hz.
            const flashOn = Math.floor((CEIL_FLASH_TIME - (t - CEIL_FALL_TIME)) * 4) % 2 === 0;
            _tileColor.set(flashOn ? 0xff3b3b : 0xffffff);
            checkerGrid.setColorAt(i, _tileColor);
            checkerGrid.instanceColor.needsUpdate = true;
          } else if (t > 0) {
            // Falling phase: shrink and sink out of the roof, staying red.
            const fallT = 1 - t / CEIL_FALL_TIME;
            const ix = i % tilesX;
            const iz = (i - ix) / tilesX;
            _tileColor.set(0xff3b3b);
            checkerGrid.setColorAt(i, _tileColor);
            checkerGrid.instanceColor.needsUpdate = true;
            // First frame of the fall: mark the tile as a hole and rebuild
            // the merged outline. Adjacent holes share edges, so the outline
            // only traces the outer perimeter of the whole hole region.
            if (holeTiles[i] === 0) {
              holeTiles[i] = 1;
              rebuildHoleOutline();
            }
            _v3a.set(
              ceilMinX + ix * TILE_SZ + TILE_SZ / 2,
              CEIL_Y + 0.15 + TILE_H / 2 - fallT * 14,
              gridZ0 + iz * TILE_SZ + TILE_SZ / 2
            );
            _v3b.set(
              Math.max(0.001, 1 - fallT * 1.2),
              Math.max(0.001, 1 - fallT * 0.7),
              Math.max(0.001, 1 - fallT * 1.2)
            );
            _tileMat.compose(_v3a, _quat.identity(), _v3b);
            checkerGrid.setMatrixAt(i, _tileMat);
            checkerGrid.instanceMatrix.needsUpdate = true;
          } else {
            // Vanished: mark the tile gone (hole) and hide it.
            checkerGone[i] = 1;
            _v3a.set(0, -100, 0);
            _tileMat.compose(_v3a, _quat.identity(), _v3b.set(0.001, 0.001, 0.001));
            checkerGrid.setMatrixAt(i, _tileMat);
            checkerGrid.instanceMatrix.needsUpdate = true;
            crumbleActive.delete(i);
          }
        }
      }
      // Gentle pulse on the hole outlines so they read as glowing and draw
      // the eye to the gap.
      if (holeFrameCount > 0) {
        holeFrameMat.emissiveIntensity = 2.0 + Math.sin(elapsed * 3.0) * 0.6;
      }
      // Task #12: slide each conduit back and forth across its lane on a
      // sine of elapsed time — phase/speed are stored per pipe so placed
      // pipes run out of sync with each other.
      // Task #13: when a conduit overlaps the car near bumper height, fire
      // onPipeShove with the pipe's current travel direction (analytic
      // derivative of the sine slide). A short per-pipe cooldown keeps one
      // sweep from firing every frame while the car sits in the overlap.
      for (const p of conduitPipes) {
        const off = Math.sin(elapsed * p.speed + p.phase) * p.amp;
        const vel = Math.cos(elapsed * p.speed + p.phase) * p.amp * p.speed;
        if (p.axis === 'x') p.mesh.position.z = p.cz + off;
        else p.mesh.position.x = p.cx + off;
        if (p.hitCooldown > 0) p.hitCooldown -= delta;
        if (player && onPipeShove && p.hitCooldown <= 0
          && Math.abs(vel) > 0.5   // ignore the turn-around crawl
          && player.y < PIPE_Y + PIPE_R) {
          // Split the overlap test into the slide axis (thin) and the fixed
          // axis (long side of the pipe).
          const carS = p.axis === 'x' ? player.z : player.x;
          const pipeS = p.axis === 'x' ? p.mesh.position.z : p.mesh.position.x;
          const carF = p.axis === 'x' ? player.x : player.z;
          const pipeF = p.axis === 'x' ? p.cx : p.cz;
          if (Math.abs(carS - pipeS) < PIPE_R + 2.2 && Math.abs(carF - pipeF) < p.len / 2 + 2.2) {
            p.hitCooldown = 0.8;
            p.hitCount += 1;
            if (p.axis === 'x') onPipeShove(0, Math.sign(vel));
            else onPipeShove(Math.sign(vel), 0);
          }
        }
      }
      // Tasks #16–#18: loop the elevator deck vertically over the pit on a
      // sine (smooth turnarounds at both ends) and keep its collider `h`
      // synced to the live deck-top height.
      const elevH = ELEV_MID + ELEV_AMP * Math.sin(elapsed * ELEV.speed);
      elevGroup.position.y = elevH - 0.25;
      elevatorCollider.h = elevH;
      // Tasks #31–#32: padded-pole trigger. Swept segment check (previous →
      // current position) against the pole axis so a slow frame can't tunnel
      // through the trigger volume; airborne gate keeps ground drivers near
      // the base from firing it. Speed (measured over the frame) decides
      // reward slam vs soft bounce — main.js owns that response.
      if (player && onPoleHit) {
        if (poleCd > 0) poleCd -= delta;
        if (poleCd <= 0 && player.y > 0.8 && player.y < POLE.h + 2 && havePrev) {
          const midY = (prevY + player.y) / 2;
          const d2 = segDistSq(prevX, prevY, prevZ, player.x, player.y, player.z, POLE.x, midY, POLE.z);
          if (d2 <= POLE.trigR * POLE.trigR) {
            const speed = Math.hypot(player.x - prevX, player.y - prevY, player.z - prevZ) / Math.max(delta, 1e-4);
            poleCd = 1.2;
            poleState.hits += 1;
            poleState.last = { speed: +speed.toFixed(1), big: speed >= POLE.bigSpeed, at: performance.now() / 1000 };
            spawnPoleBurst(POLE.x, Math.max(2, Math.min(player.y, POLE.h - 2)), POLE.z);
            let nx = player.x - POLE.x;
            let nz = player.z - POLE.z;
            const nl = Math.hypot(nx, nz) || 1;
            onPoleHit(nx / nl, nz / nl, speed);
          }
        }
      }
      // Candy waterfall: spawn gemstones at the top of the grand ramp, let
      // them tumble down the slope, knock them off the car, and recycle them
      // on ground impact. The knock speed scales with the car's speed (like
      // the knockable props) so a slow bump barely nudges a gemstone while a
      // full-speed climb sends them bouncing. Big heavy gems are the
      // exception: they barely move and instead slam the car back down the
      // ramp (onGemSlam), on a short cooldown so a lingering overlap doesn't
      // re-fire every frame.
      // Time-based spawn: catch up any deficit so a slow frame (throttled
      // tab) can't FPS-cap the candy rate — the waterfall keeps its full 2×
      // flow even at low frame rates. The burst cap stops a long
      // backgrounded frame from dumping the whole pool at once.
      gemSpawnTimer -= delta;
      let gemBurst = 0;
      while (gemSpawnTimer <= 0 && gemBurst < 8) {
        gemSpawnTimer += GEM_SPAWN_INTERVAL;
        gemBurst++;
        spawnGemstone();
        if (Math.random() < 0.4) spawnGemstone();
      }
      const carSpeed = player && havePrev
        ? Math.hypot(player.x - prevX, player.z - prevZ) / Math.max(delta, 1e-4)
        : 0;
      const knockSpeed = 6 + 8 * THREE.MathUtils.clamp(carSpeed / 14, 0.15, 1);
      for (const g of gemstones) {
        if (!g.active) continue;
        g.age += delta;
        if (g.slamCd > 0) g.slamCd -= delta;
        if (g.knocked) {
          // Bounced off the car: ballistic flight, vanish on impact.
          g.vy -= GEM_GRAVITY * delta;
          g.x += g.vx * delta;
          g.y += g.vy * delta;
          g.z += g.vz * delta;
          g.mesh.rotation.x += g.spin * delta;
          g.mesh.rotation.z += g.spin * 0.6 * delta;
          const onRamp = g.z >= GRAND.z - GRAND.len / 2 && g.z <= GRAND.z + GRAND.len / 2;
          const surf = onRamp ? grandRampSurfaceY(g.z) : 0;
          if (g.y <= surf || g.age > 6) { recycleGemstone(g); continue; }
        } else {
          // Sliding down the ramp surface (accelerating), drifting sideways.
          g.slideSpeed += 7 * delta;
          g.z += g.slideSpeed * Math.cos(GRAND_SLOPE) * delta;
          g.x += g.vx * delta;
          g.y = grandRampSurfaceY(g.z) + (g.big ? 0.5 : 0.05);
          g.mesh.rotation.x += g.spin * delta;
          g.mesh.rotation.z += g.spin * 0.6 * delta;
          // Reached the bottom of the ramp → hit the ground → vanish.
          if (g.z >= GRAND.z + GRAND.len / 2) { recycleGemstone(g); continue; }
          // Car proximity → knock it off (bounce away from the car).
          if (player) {
            const dx = g.x - player.x;
            const dz = g.z - player.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < GEM_KNOCK_RADIUS * GEM_KNOCK_RADIUS) {
              const d = Math.sqrt(d2) || 1;
              if (g.big) {
                // Large & heavy: slam the car back down the ramp instead of
                // bouncing away. The gem itself barely budges — a small
                // sideways nudge and a wobble, then it keeps sliding. Most
                // big gems are 25/42 weight; 1 in 100 is full-weight.
                if (g.slamCd <= 0) {
                  g.slamCd = 1.0;
                  if (onGemSlam) onGemSlam(0, 1, g.heavy ? 1 : 25 / 42);   // down the ramp = +Z
                }
                g.vz += (dz / d) * 1.5;
                g.spin = (Math.random() - 0.5) * 4;
              } else {
                // Regular candy gems: bounce away like light traffic, but
                // also give the car a tiny nudge back (power 2 ≈ 0.3 units).
                g.knocked = true;
                g.vx = (dx / d) * knockSpeed + 2;
                g.vy = 3 + Math.random() * 3;
                g.vz = (dz / d) * knockSpeed;
                g.spin = (Math.random() - 0.5) * 12;
                if (g.slamCd <= 0) {
                  g.slamCd = 1.0;
                  if (onGemSlam) onGemSlam(0, 1, 1 / 21);   // tiny nudge: power 2
                }
              }
            }
          }
        }
        g.mesh.position.set(g.x, g.y, g.z);
      }
      // Task #33: animate any active impact bursts — lights flash out
      // staggered, shockwave rings expand and fade, then everything disposes.
      for (let i = fxBursts.length - 1; i >= 0; i--) {
        const b = fxBursts[i];
        b.age += delta;
        const t = b.age / b.life;
        if (t >= 1) {
          for (const L of b.lights) parent.remove(L.light);
          for (const r of b.rings) { parent.remove(r); r.geometry.dispose(); r.material.dispose(); }
          fxBursts.splice(i, 1);
          continue;
        }
        for (const { light, delay } of b.lights) {
          light.intensity = 5.5 * Math.max(0, 1 - Math.max(0, t - delay) * 1.6);
        }
        const s = 1 + 12 * (1 - (1 - t) * (1 - t));
        for (const r of b.rings) {
          r.scale.setScalar(s);
          r.material.opacity = 0.95 * (1 - t);
        }
      }
      // Task #6: pass-through bump detection on the suspended prompt-blocks.
      // Swept check (previous → current position) so a slow frame rate can't
      // step over a block's trigger radius between updates. Airborne gate:
      // only bumps in the air count; driving under a block never consumes it.
      if (player) {
        const airborne = player.y > AIRBORNE_Y;
        for (const b of promptBlocks) {
          // Task #7: fade any active bump flash back to base and count down
          // the post-bump cooldown. Runs even while the car is far away so a
          // flash never sticks on.
          if (b.flash > 0 || b.cooldown > 0) {
            b.flash = Math.max(0, b.flash - delta / FLASH_TIME);
            b.cooldown = Math.max(0, b.cooldown - delta);
            b.mat.emissiveIntensity = GLOW_INTENSITY + FLASH_EMISSIVE * b.flash;
            b.glow.intensity = 0.8 + FLASH_LIGHT * b.flash;
          }
          const d2 = havePrev
            ? segDistSq(prevX, prevY, prevZ, player.x, player.y, player.z, b.x, b.y, b.z)
            : pointDistSq(player.x, player.y, player.z, b.x, b.y, b.z);
          const inside = d2 <= b.radius * b.radius;
          if (inside && b.armed && airborne && b.cooldown <= 0) {
            b.armed = false;            // edge-triggered: one bump per approach
            b.cooldown = BLOCK_COOLDOWN;
            b.flash = 1;                // start the emissive/glow flash
            spawnFoam(b.x, b.y, b.z);   // task #8: pop out a foam collectible
            bumpCount += 1;
            lastBump = { x: b.x, y: b.y, z: b.z, at: performance.now() / 1000 };
            if (onBlockBump) onBlockBump(b);
          } else if (!inside) {
            b.armed = true;             // re-arm once the car clears the radius
          }
        }
        prevX = player.x; prevY = player.y; prevZ = player.z; havePrev = true;
      }

      // The Holy Mountain: slow pulse on the mysterious shrine light, a
      // gentle bob on the hovering orb, shimmer on the light beam, and
      // candle flicker. Also flag the moment the car first reaches the
      // hollow chamber (within 12 units of the shrine).
      holy.t += delta;
      holy.light.intensity = 1.7 + 0.9 * Math.sin(holy.t * 1.6);
      holy.orb.position.y = 6.2 + 0.35 * Math.sin(holy.t * 0.9);
      holy.beam.material.opacity = 0.11 + 0.04 * Math.sin(holy.t * 1.6 + 1.2);
      holy.candleMat.emissiveIntensity = 1.35 + 0.45 * Math.sin(holy.t * 7.3) + 0.2 * Math.sin(holy.t * 13.7 + 1.3);
      if (player && !holy.entered) {
        const dx = player.x - MOUNT.cx;
        const dz = player.z - MOUNT.cz;
        if (dx * dx + dz * dz < 144) holy.entered = true;
      }

      // Task #8: animate the foam collectibles — ballistic fall, damped floor
      // bounces, then shrink out and despawn once the shrink window ends.
      for (let i = foamPieces.length - 1; i >= 0; i--) {
        const f = foamPieces[i];
        f.age += delta;
        f.vy -= FOAM_GRAVITY * delta;
        f.mesh.position.x += f.vx * delta;
        f.mesh.position.y += f.vy * delta;
        f.mesh.position.z += f.vz * delta;
        if (f.mesh.position.y < FOAM_R && f.vy < 0) {
          // Floor contact: count a real bounce and damp it, but once the
          // impact speed gets tiny just settle the piece so it doesn't
          // micro-bounce in place for the rest of its life.
          f.mesh.position.y = FOAM_R;
          if (-f.vy > 1.5) {
            f.bounces += 1;
            f.vy = -f.vy * FOAM_BOUNCE;
            f.vx *= 0.75;
            f.vz *= 0.75;
          } else {
            f.vy = 0;
          }
        }
        f.mesh.rotation.x += f.vx * delta * 0.4;
        f.mesh.rotation.z -= f.vz * delta * 0.4;
        const left = FOAM_LIFE + FOAM_SHRINK - f.age;
        if (left <= 0) {
          disposeFoamPiece(f);
          foamPieces.splice(i, 1);
        } else if (f.age > FOAM_LIFE) {
          f.mesh.scale.setScalar(Math.max(0.001, left / FOAM_SHRINK));
        }
      }
    },
  };
}
