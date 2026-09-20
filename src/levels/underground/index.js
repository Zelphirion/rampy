import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addGlassCity } from '../../glasscity.js';
// The Holy Mountain: pure layout math (cone profile, spiral road wedges,
// blocker rects) verified by holyMountain.test.mjs — this file turns it into
// meshes and colliders.
import { MOUNT, coneRadiusAt, coneSkinSegments, spiralSegments, mountainBlockers, mouthFrame } from '../../modules/holyMountain.js';

export const UNDERGROUND_Y = -30;

// ---- Course build zone ----
// Rectangular zone on the 292×276 cavern slab (slab spans x ∈ [-146, 146],
// z ∈ [-96.5, 179.5] around its center (0, 41.5)). Chosen to avoid:
//   - Glass City footprint: z ∈ [132, 173] spanning x ∈ [-140, 140]
//   - tunnel foot / return portal at ≈(-55, 83) (tube radius 5; kept >60 away)
//   - (support pillar at (-40, 66) — REMOVED 2026-09-18, was a plain black cube)
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

  // Shooting stars (idea #15): a small pool of meteors streaks across the sky
  // on a timer. They live well above the ceiling, so they read from the second
  // roof and through any hole in the checkerboard. Purely decorative.
  const METEOR_COLORS = [0xffffff, 0xffffff, 0xbfd8ff, 0xffe9b0, 0xcaffff, 0xffc0e8];
  const meteors = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const parts = [];
    const head = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTex, color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    head.scale.set(3.2, 3.2, 1);
    g.add(head);
    parts.push({ sprite: head, frac: 0, alpha: 1 });
    for (let k = 0; k < 4; k++) {
      const sp = new THREE.Sprite(head.material.clone());
      const s = 2.4 * (1 - k * 0.18);
      sp.scale.set(s, s, 1);
      g.add(sp);
      parts.push({ sprite: sp, frac: 0.07 + k * 0.075, alpha: 0.6 * (1 - k * 0.2) });
    }
    g.visible = false;
    sky.add(g);
    meteors.push({ group: g, parts, active: false, timer: Math.random() * 3, life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, trailLen: 16 });
  }
  let nextMeteor = 0.6 + Math.random() * 2.0;

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
    // Shooting stars: fire one every few seconds, then streak and fade. Spawned
    // around the car so they always sit inside the car-following dome.
    nextMeteor -= delta;
    if (nextMeteor <= 0) {
      nextMeteor = 1.6 + Math.random() * 3.0;
      const m = meteors.find((q) => !q.active) || meteors[0];
      m.active = true;
      m.life = 0;
      m.maxLife = 0.9 + Math.random() * 0.8;
      const ang = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 80;
      m.vx = Math.cos(ang) * speed;
      m.vz = Math.sin(ang) * speed;
      m.vy = -(24 + Math.random() * 42);
      const px = player ? player.x : 0;
      const pz = player ? player.z : 0;
      m.x = px + (Math.random() - 0.5) * 200;
      m.z = pz + (Math.random() - 0.5) * 200;
      m.y = 44 + Math.random() * 12;
      m.trailLen = 14 + Math.random() * 12;
      const c = new THREE.Color(METEOR_COLORS[(Math.random() * METEOR_COLORS.length) | 0]);
      for (const p of m.parts) p.sprite.material.color.copy(c);
      m.group.visible = true;
    }
    for (const m of meteors) {
      if (!m.active) continue;
      m.life += delta;
      m.x += m.vx * delta;
      m.y += m.vy * delta;
      m.z += m.vz * delta;
      if (m.life >= m.maxLife) {
        m.active = false;
        m.group.visible = false;
        continue;
      }
      const t = m.life / m.maxLife;
      const fade = Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) * (1 - t);
      const d = Math.hypot(m.vx, m.vy, m.vz) || 1;
      const ux = m.vx / d, uy = m.vy / d, uz = m.vz / d;
      for (const p of m.parts) {
        p.sprite.position.set(
          m.x - ux * m.trailLen * p.frac,
          m.y - uy * m.trailLen * p.frac,
          m.z - uz * m.trailLen * p.frac
        );
        p.sprite.material.opacity = Math.max(0, p.alpha * fade);
      }
    }
  };
  sky.meteors = meteors;   // exposed for the ?debug hook (idea #15)
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
function easeOutCubic(s) { return 1 - Math.pow(1 - s, 3); }
function easeInQuad(s) { return s * s; }

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
  // onPoleHit(nx,nz,speed) when a fast-enough car slams the padded pole
  // (task #32; nx/nz point from the pole toward the car), and
  // onGemSlam(dirX,dirZ) when the car plows into a large heavy candy gem
  // (dirX/dirZ point back down the grand ramp). Lets the callers own the
  // physics/audio response without the level knowing how.
  // onPlatterEject(nx,nz,s) fires when the rotating platter flings the car
  // off its edge (nx/nz = tangent of the spin at the exit point, s ∈ [0,1]
  // scaled by how fast the ride was carrying the car when it let go).
  // onTrampoline() fires when the car drives onto a launch pad; main.js sets
  // the big vertical launch that throws it onto the second roof.
  const onBlockBump = typeof opts.onBlockBump === 'function' ? opts.onBlockBump : null;
  const onPipeShove = typeof opts.onPipeShove === 'function' ? opts.onPipeShove : null;
  const onPoleHit = typeof opts.onPoleHit === 'function' ? opts.onPoleHit : null;
  const onGemSlam = typeof opts.onGemSlam === 'function' ? opts.onGemSlam : null;
  const onPlatterEject = typeof opts.onPlatterEject === 'function' ? opts.onPlatterEject : null;
  const onTrampoline = typeof opts.onTrampoline === 'function' ? opts.onTrampoline : null;
  const onStatueTopple = typeof opts.onStatueTopple === 'function' ? opts.onStatueTopple : null;
  const onFinishLine = typeof opts.onFinishLine === 'function' ? opts.onFinishLine : null;

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

  // ===== Spiral-tunnel mouth clouds + fog (2026-09-18) =====
  // The spiral tube's TOP end is an open ring centred on tunnelPoint(0) — the
  // rim of the helix, NOT the spiral axis — rising to local y≈30-40, and the
  // arrival camera orbits at mouth height, so without this you can see
  // straight down the throat from above. A rolling cloud bank seals that
  // opening and a soft luminous mist spills over the rim and down into the
  // shaft, hiding the top of the tunnel. Purely decorative — no colliders.
  const mouthPt = tunnelPoint(0);
  const mouthX = mouthPt.x, mouthZ = mouthPt.z;
  const mouthY = localY(mouthPt.y) + TUNNEL.tubeR;   // centreline y of the open end
  const spiralMouth = { group: new THREE.Group(), haze: [] };
  spiralMouth.group.position.set(mouthX, 0, mouthZ);
  {
    // Dense pile of flattened cloud puffs mounding over the opening — blocks
    // top-down sight into the tube. Outer puffs ride higher, so it mounds
    // like a rolling cloud rather than a flat lid.
    const bankMat = new THREE.MeshStandardMaterial({
      color: 0x3a3350,
      emissive: 0x453a62,
      emissiveIntensity: 0.5,
      roughness: 1,
    });
    const bankParts = [];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + Math.random() * 1.2;
      const rr = Math.cbrt(Math.random()) * 14;       // denser toward the centre
      const g = new THREE.SphereGeometry(2.2 + Math.random() * 3.8, 10, 8).toNonIndexed();
      g.scale(1, 0.55, 1);                            // flatten BEFORE placing
      g.translate(Math.cos(a) * rr, mouthY - 3 + rr * 0.55 + Math.random() * 5, Math.sin(a) * rr);
      bankParts.push(g);
    }
    // Rounder puffs stuffed down INSIDE the mouth so the throat below the rim
    // is fogged too — the car dives through them at the start of the shot.
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * 3.5;
      const g = new THREE.SphereGeometry(1.8 + Math.random() * 2.4, 8, 7).toNonIndexed();
      g.scale(1, 0.85, 1);
      g.translate(Math.cos(a) * rr, mouthY - 3 - Math.random() * 5, Math.sin(a) * rr);
      bankParts.push(g);
    }
    const bank = new THREE.Mesh(mergeGeoms(bankParts), bankMat);
    spiralMouth.group.add(bank);
    for (const g of bankParts) g.dispose();
  }
  // Soft additive haze hugging the rim — reads as fog on top of the cloud.
  // (The same radial soft-glow texture the stars and meteors use.)
  const mistTex = makeStarTexture();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.6;
    const rr = 6 + Math.random() * 10;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: mistTex,
      color: 0xb8c2ea,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    sp.position.set(Math.cos(a) * rr, mouthY - 3 + Math.random() * 9, Math.sin(a) * rr);
    sp.scale.set(16 + Math.random() * 8, 16 + Math.random() * 8, 1);
    spiralMouth.group.add(sp);
    spiralMouth.haze.push({ sprite: sp, phase: Math.random() * Math.PI * 2 });
  }
  parent.add(spiralMouth.group);

  // Cavern ceiling over the course zone (underside at CEIL_Y), clamped to the
  // slab so it never overhangs the void. (The old floor→ceiling support pillar
  // at (-40, 66) and the four course-zone columns were plain black ground cubes —
  // REMOVED 2026-09-18.)
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
  // lit forever. The color a tile turns into radiates a wave outward in
  // concentric rings: green spreads green to touching tiles, orange spreads
  // orange with blue beyond, and magenta/red spread a big three-ring circle
  // (orange, then green, then blue). Each ring bumps its tiles toward the
  // target color (or up one step if already at/past it), so the colored
  // region keeps expanding. One InstancedMesh = one draw call for the whole
  // grid.
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
  // and stays permanently. The color a tile turns into radiates a wave of
  // rings: green → touching green; orange → touching orange + blue beyond;
  // magenta → touching orange + green + blue beyond (a big circle); red →
  // the same big circle. Each ring bumps tiles toward its target color (or
  // up one step if already at/past it), so the pattern expands outward.
  const CHECKER_NEON = [
    0x35f0ff,   // cyan  (blue — first drive-over)
    0x9dff3f,   // lime  (green — second drive-over, spreads green ring)
    0xffb84d,   // amber (orange — third drive-over, spreads orange + blue rings)
    0xff3fd8,   // magenta (spreads orange + green + blue rings)
    0xff3b3b,   // red (terminal — spreads orange + green + blue rings)
  ];
  // Thin rock backing under the tiles so the hairline grout gaps never show
  // the surface world above the ceiling. It's built as ONE backing patch per
  // tile (ceilingBacks, below), and the patch is hidden with its crumbled
  // tile — so a roof hole looks straight down instead of a flat black layer.
  const checkerGrid = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TILE_SZ - TILE_GAP, TILE_H, TILE_SZ - TILE_GAP),
    new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
    tileCount
  );
  checkerGrid.receiveShadow = true;
  parent.add(checkerGrid);
  // Per-tile state: 0 = dark-A, 1 = dark-B, 2.. = index into CHECKER_NEON.
  const checkerState = new Int32Array(tileCount);
  // Advance cooldown: after a tile changes color it must wait this long
  // before it can change again — so one drive-over (front wheels, then back
  // wheels, or a boundary jitter) can't advance a tile twice in a single
  // pass. The car has to drive away and come back to trigger the next color.
  const TILE_ADVANCE_COOLDOWN = 1.0;   // seconds between color changes
  const checkerCooldown = new Float32Array(tileCount); // >0 = can't advance yet
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
  // Advance a tile toward `target` in the neon sequence: if it's below the
  // target color it jumps straight to it (dark → blue, blue → green, …), and
  // if it's already at or past the target it bumps up one more step — so the
  // spreads keep pushing already-colored tiles forward and the colored region
  // expands outward. Red is terminal and starts the crumble countdown.
  // Returns the new state (or the current state if the tile is gone/red).
  const setOrBump = (nIdx, target) => {
    if (checkerGone[nIdx]) return checkerState[nIdx];
    if (checkerCooldown[nIdx] > 0) return checkerState[nIdx];   // on cooldown → no double-dip
    const st = checkerState[nIdx];
    if (st >= 2 + CHECKER_NEON.length - 1) return st;   // already red
    const newSt = st < target ? target : st + 1;
    checkerState[nIdx] = newSt;
    checkerCooldown[nIdx] = TILE_ADVANCE_COOLDOWN;   // any color change restarts the cooldown
    _tileColor.set(CHECKER_NEON[newSt - 2]);
    checkerGrid.setColorAt(nIdx, _tileColor);
    checkerGrid.instanceColor.needsUpdate = true;
    if (newSt >= 2 + CHECKER_NEON.length - 1) {
      checkerCrumble[nIdx] = CEIL_FLASH_TIME + CEIL_FALL_TIME;
      crumbleActive.add(nIdx);
    }
    return newSt;
  };
  // Radiate a wave of colors outward from tile `idx` in concentric rings.
  // `rings` is an array of target colors, one per ring (ring 0 = the tiles
  // touching `idx`, ring 1 = the tiles touching those, etc.). Each tile is
  // bumped toward its ring's target color (or up one step if already at/past
  // it), and each tile is only affected once per wave — the center tile is
  // never re-bumped.
  const spreadRings = (idx, rings) => {
    const ix = idx % tilesX;
    const iz = (idx - ix) / tilesX;
    let frontier = [];
    for (const [nx, nz] of [[ix + 1, iz], [ix - 1, iz], [ix, iz + 1], [ix, iz - 1]]) {
      if (nx < 0 || nx >= tilesX || nz < 0 || nz >= tilesZ) continue;
      frontier.push(nz * tilesX + nx);
    }
    const touched = new Set([idx]);
    for (const target of rings) {
      const bumped = [];
      for (const fIdx of frontier) {
        if (touched.has(fIdx)) continue;
        touched.add(fIdx);
        bumped.push(fIdx);
        setOrBump(fIdx, target);
      }
      const next = [];
      for (const fIdx of bumped) {
        const fx = fIdx % tilesX;
        const fz = (fIdx - fx) / tilesX;
        for (const [nx, nz] of [[fx + 1, fz], [fx - 1, fz], [fx, fz + 1], [fx, fz - 1]]) {
          if (nx < 0 || nx >= tilesX || nz < 0 || nz >= tilesZ) continue;
          const nIdx = nz * tilesX + nx;
          if (!touched.has(nIdx)) next.push(nIdx);
        }
      }
      frontier = next;
    }
  };
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

  // Per-tile rock backing: same grid as the checkerboard, each patch slightly
  // oversized so the hairline grout gaps stay covered from below — but the
  // patch for a tile is hidden the moment that tile starts falling, so the
  // second-roof holes let you see straight down through the cavern instead
  // of a flat black backing slab (2026-09-18).
  const BACK_OVERHANG = 0.06;   // patch extends past each tile edge, covering the 0.08 grout gaps
  const backSize = TILE_SZ + BACK_OVERHANG * 2;
  const ceilingBacks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(backSize, 0.15, backSize),
    rockMat,
    tileCount
  );
  for (let iz = 0; iz < tilesZ; iz++) {
    for (let ix = 0; ix < tilesX; ix++) {
      _tileMat.makeTranslation(
        ceilMinX + ix * TILE_SZ + TILE_SZ / 2,
        CEIL_Y + 0.075,
        gridZ0 + iz * TILE_SZ + TILE_SZ / 2
      );
      ceilingBacks.setMatrixAt(iz * tilesX + ix, _tileMat);
    }
  }
  ceilingBacks.instanceMatrix.needsUpdate = true;
  ceilingBacks.frustumCulled = false;   // like holeFrames — instances sit far from the local bounding sphere
  parent.add(ceilingBacks);

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
  // The ceiling top is the "second roof" — a drivable surface the big
  // staircase (and the trampolines) deliver the car to. Soft collider at the
  // ceiling's top face (CEIL_Y + 1) so buildingTopAt/ugElevatorTopAt seat the
  // car on it.
  const ceilingColliders = [{
    x: (ceilMinX + ceilMaxX) / 2, z: (ceilMinZ + ceilMaxZ) / 2,
    halfW: (ceilMaxX - ceilMinX) / 2, halfD: (ceilMaxZ - ceilMinZ) / 2,
    h: CEIL_Y + 1, soft: true, ceiling: true,
  }];

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
  // ---- Foam that looks like foam ----
  // The bump-pop collectibles used to be plain pastel spheres. Each colour now
  // gets a canvas "foam" texture: a bubbly speckle of soft light cells on a
  // slightly darker base — so the balls read as lumpy cushion foam, not
  // balloons. One texture per colour, cached and shared by every piece.
  const foamTexCache = new Map();
  function makeFoamTexture(color) {
    const cached = foamTexCache.get(color);
    if (cached) return cached;
    const S = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    const c = new THREE.Color(color);
    const r = (c.r * 255) | 0, g = (c.g * 255) | 0, b = (c.b * 255) | 0;
    // Base: a slightly darker mid-tone so the pale bubbles pop on top.
    ctx.fillStyle = `rgb(${Math.max(0, r - 46)},${Math.max(0, g - 46)},${Math.max(0, b - 46)})`;
    ctx.fillRect(0, 0, S, S);
    // Soft pale cells scattered densely — the classic foam-in-a-ball look.
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const rad = 6 + Math.random() * 16;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(255,255,255,${0.16 + Math.random() * 0.14})`);
      grad.addColorStop(0.7, `rgba(255,255,255,${0.05 + Math.random() * 0.06})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // A few bright glints — the largest cells catch the neon light.
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const rad = 3 + Math.random() * 5;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(255,255,255,0.8)`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1.6);
    tex.colorSpace = THREE.SRGBColorSpace;
    foamTexCache.set(color, tex);
    return tex;
  }
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
    const mat = new THREE.MeshStandardMaterial({
      map: makeFoamTexture(color),
      color,
      emissive: color,
      emissiveIntensity: 0.18,
      roughness: 0.85,
    });
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
      nudgeCd: 0,   // idea #28: cooldown between car nudges
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
  // spans the whole zone so later features (conduit lanes, the foam pit,
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
  const conduitPipes = [];
  const pipePostColliders = [];
  function addConduitPipe({ cx, cz, len, amp, axis = 'z', color = NEON.cyan, phase = 0, speed = 1, pattern = 'sweep' }) {
    // axis 'z': pipe lies along Z, slides along X (north-south lane).
    // axis 'x': pipe lies along X, slides along Z (east-west lane).
    // pattern 'sweep': the original horizontal slide.
    // pattern 'guillotine': the pipe hangs in the lane and slams straight down
    // (amp = vertical travel).
    // The dark end-posts and rail frames were removed (2026-09-19): the hazard
    // is the glowing bar alone, so the lane stays completely open.
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R, PIPE_R, len, 14), makeGlowMat(color));
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;   // cylinder Y-axis → lie along X
    else mesh.rotation.x = Math.PI / 2;                // cylinder Y-axis → lie along Z
    mesh.position.set(cx, PIPE_Y, cz);
    mesh.castShadow = true;
    parent.add(mesh);
    const pipe = { mesh, cx, cz, len, amp, axis, phase, speed, pattern, hitCooldown: 0, hitCount: 0 };
    conduitPipes.push(pipe);
    return pipe;
  }

  // A double-beam X: two perpendicular beams centered on the same lane, each
  // sweeping along its own axis on opposite phases. Two beams to time, thread
  // the open middle between them (the old corner posts were removed 2026-09-19).
  function addConduitCross({ cx, cz, len, amp, color = NEON.magenta, color2 = NEON.cyan, phase = 0, speed = 1 }) {
    const a = addConduitPipe({ cx, cz, len, amp, axis: 'z', color, phase, speed });
    const b = addConduitPipe({ cx, cz, len, amp, axis: 'x', color: color2, phase: phase + Math.PI, speed });
    a.cross = b;
    b.cross = a;
    return [a, b];
  }

  // Task #14 + idea #22: one serpentine obstacle course on the open floor.
  // The pipes (sweeping arms, a double-beam X crossing, and two drop-gates /
  // guillotines) are laid out in three N-S lanes stitched by two E-W runs so
  // the car can drive the whole snake from start to finish. Sweeper pipes span
  // the lane and slide across it: when the arm is at one extreme the far side
  // of the lane is open to thread. Each hazard has its own speed + phase and
  // the volumes are spaced so no two sweeps can physically touch -- the arms
  // just drift past each other's rhythm over time.
  // Waypoints of the course centreline (the painted dashes / flags follow it):
  //   A (N-S south)  x=30   z 38→-84
  //   B (E-W east)   z=-84  x 30→92
  //   C (N-S north)  x=92   z -84→-8
  //   D (E-W east)   z=-8   x 92→112
  //   E (N-S north)  x=112  z -8→10
  //   F (E-W east)   z=10   x 112→134  (finish)
  const COURSE = [
    { x: 30, z: 40 },   // P1 below the start banner — first pedal point
    { x: 30, z: -84 },  // corridor A turn
    { x: 92, z: -84 },  // bottom run turn
    { x: 92, z: -8 },   // corridor B turn
    { x: 112, z: -8 },  // short hop east
    { x: 112, z: 10 },  // corridor C turn
    { x: 134, z: 10 },  // final straight foot
  ];

  addConduitPipe({ cx: 30, cz: 16, len: 16, amp: 8, speed: 1.2, phase: 0, color: NEON.cyan });                            // A sweeper arm #1
  addConduitPipe({ cx: 30, cz: -26, len: 12, amp: 16, speed: 1.1, phase: 0.4, color: NEON.red, axis: 'x', pattern: 'guillotine' }); // A guillotine #1
  addConduitPipe({ cx: 30, cz: -52, len: 16, amp: 8, speed: 0.9, phase: 4.2, color: NEON.magenta });                      // A sweeper arm #2
  addConduitPipe({ cx: 30, cz: -72, len: 16, amp: 8, speed: 1.5, phase: 2.1, color: NEON.lime });                         // A sweeper arm #3
  addConduitPipe({ cx: 62, cz: -84, len: 14, amp: 6, speed: 1.1, phase: 1.0, color: NEON.amber, axis: 'x' });             // bottom run sweeper #4
  addConduitCross({ cx: 92, cz: -72, len: 12, amp: 5, speed: 1.3, phase: 3.3, color: NEON.magenta, color2: NEON.cyan });  // corridor B conduit cross
  addConduitPipe({ cx: 92, cz: -44, len: 14, amp: 8, speed: 1.4, phase: 5.0, color: NEON.amber });                        // B sweeper arm #5
  addConduitPipe({ cx: 92, cz: -20, len: 14, amp: 6, speed: 1.0, phase: 1.8, color: NEON.cyan });                         // B sweeper arm #6
  addConduitPipe({ cx: 112, cz: -2, len: 12, amp: 16, speed: 1.1, phase: 0.4, color: NEON.red, axis: 'x', pattern: 'guillotine' }); // C guillotine #2
  addConduitPipe({ cx: 123, cz: 10, len: 14, amp: 5, speed: 1.2, phase: 3.0, color: NEON.magenta, axis: 'x' });           // final straight sweeper #7

  // ---- Giant conveyor lane (idea #33) ----
  // A long moving belt on the open floor: while the car is over it the belt
  // drags it along the belt direction at CONVEYOR.speed (on top of the car's
  // own motion), so you can fight it, ride it, or use it for parking tests.
  // The chevron belt texture scrolls to sell the motion; the direction is
  // purely +X here, but dirX/dirZ keep it swappable.
  const CONVEYOR = { cx: 45, cz: -8, len: 48, wid: 9, dirX: 1, dirZ: 0, speed: 6 };
  const beltRepeatX = CONVEYOR.len / 6;   // one chevron pair every 6 world units
  const beltTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#15151b';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#37e0ff';
    g.lineWidth = 7;
    g.lineJoin = 'round';
    for (let i = -1; i < 3; i++) {
      const px = i * 32;
      g.beginPath();
      g.moveTo(px, 6);
      g.lineTo(px + 22, 32);
      g.lineTo(px, 58);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(beltRepeatX, 1);
    return t;
  })();
  const beltMat = new THREE.MeshStandardMaterial({
    map: beltTex, emissive: 0x0a2a3a, emissiveIntensity: 0.7, roughness: 0.7, metalness: 0.15,
  });
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(CONVEYOR.len, CONVEYOR.wid), beltMat);
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(CONVEYOR.cx, 0.24, CONVEYOR.cz);
  belt.receiveShadow = true;
  parent.add(belt);
  const conFrameMat = new THREE.MeshStandardMaterial({ color: 0x2b2b34, roughness: 0.7, metalness: 0.5 });
  const conFrame = new THREE.Mesh(new THREE.BoxGeometry(CONVEYOR.len + 1, 0.3, CONVEYOR.wid + 1), conFrameMat);
  conFrame.position.set(CONVEYOR.cx, 0.11, CONVEYOR.cz);
  conFrame.receiveShadow = true;
  parent.add(conFrame);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(CONVEYOR.len + 1, 0.5, 0.3), makeGlowMat(NEON.amber));
    rail.position.set(CONVEYOR.cx, 0.45, CONVEYOR.cz + s * (CONVEYOR.wid / 2 + 0.35));
    parent.add(rail);
  }
  // Motor housing at the belt's downstream end.
  const conMotor = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12), conFrameMat);
  conMotor.rotation.z = Math.PI / 2;
  conMotor.position.set(CONVEYOR.cx + CONVEYOR.len / 2 + 0.8, 1.2, CONVEYOR.cz);
  conMotor.castShadow = true;
  parent.add(conMotor);

  // ---- Foam pit (task #15) ----
  // A recessed, padded landing zone built into the open western floor.
  // Pure decoration: a dark soft-looking floor patch. (The rim walls that
  // ringed the old elevator area — REMOVED 2026-09-18.)
  const PIT = { cx: 30, cz: -42, halfW: 13, halfD: 7 };
  const pitPadMat = new THREE.MeshStandardMaterial({ color: 0x191228, roughness: 1 });
  const pitPatch = new THREE.Mesh(new THREE.BoxGeometry(PIT.halfW * 2, 0.12, PIT.halfD * 2), pitPadMat);
  pitPatch.position.set(PIT.cx, 0.06, PIT.cz);
  pitPatch.receiveShadow = true;
  parent.add(pitPatch);

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
  // main.js's soft-surface helper (ugElevatorTopAt) so the car can stand/climb
  // on them, but never wall off driving.
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
    x: 24,             // centre of the x-span on the ceiling's north edge —
                       // moved west (48) so the candy waterfall sits right at
                       // the tunnel foot / return portal (≈(-55, 83)) and you
                       // see it immediately after bursting out of the tube.
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

  // ---- Conveyor candy (idea #33 follow-up) ----
  // The giant conveyor lane carries its own load of glowing gems — the same
  // candy as the waterfall, but hitching a ride on the belt. They spawn at the
  // belt's upstream end, drift downstream with the scrolling belt (a gentle
  // bob so they read as cargo), and vanish over the end. Drive into one and
  // it scatters off the belt with the same knock as the waterfall gems.
  const beltGems = [];
  for (let i = 0; i < 18; i++) {
    const geo = gemGeos[(Math.random() * gemGeos.length) | 0];
    const color = GEM_COLORS[(Math.random() * GEM_COLORS.length) | 0];
    const mesh = new THREE.Mesh(geo, makeGlowMat(color));
    mesh.scale.setScalar(0.4 + Math.random() * 0.55);
    mesh.visible = false;
    parent.add(mesh);
    beltGems.push({
      mesh, active: false, x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0, spin: 0, knocked: false, bob: Math.random() * Math.PI * 2,
    });
  }
  let beltGemTimer = 0;
  function recycleBeltGem(b) {
    b.active = false;
    b.mesh.visible = false;
  }
  function spawnBeltGem() {
    const b = beltGems.find((bb) => !bb.active);
    if (!b) return;
    b.active = true;
    b.knocked = false;
    b.x = CONVEYOR.cx - CONVEYOR.len / 2 + 1;
    b.z = CONVEYOR.cz + (Math.random() - 0.5) * (CONVEYOR.wid - 2);
    b.y = 0.8;
    b.vy = 0; b.vx = 0; b.vz = 0;
    b.spin = (Math.random() - 0.5) * 6;
    b.mesh.scale.setScalar(0.4 + Math.random() * 0.55);
    b.mesh.visible = true;
  }

  // ---- Padded vertical pole (tasks #31–#34) ----
  // Tall cushioned column standing on the open floor as a standalone landmark
  // (the launch ramp that used to feed it was removed). A solid small collider
  // makes ground bonks physical, while a larger pass-through TRIGGER volume
  // catches flights: slam it above POLE_BIG_SPEED and you get the reward
  // sequence (light burst here + boom/bounce via onPoleHit); below that it
  // just soft-bounces you off (main.js damps the knock).
  const POLE = { x: 92, z: -66, r: 1.6, h: 16, trigR: 5.5, bigSpeed: 8 };
  const poleBodyMat = new THREE.MeshStandardMaterial({ color: 0x2e2a38, roughness: 0.9 });
  const poleBody = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE.r, POLE.r + 0.35, POLE.h, 14),
    poleBodyMat
  );
  poleBody.position.set(POLE.x, POLE.h / 2, POLE.z);
  poleBody.castShadow = true;
  parent.add(poleBody);
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

  // ---- Giant rotating disco ball (idea #14) ----
  // A big faceted mirror sphere hung from the ceiling just off the padded pole.
  // It spins and carries a ring of colored point lights, throwing moving neon
  // pools across the cavern floor and walls. Bonus: fly into it and the
  // pendulum swings, then settles with a damped wobble.
  const DISCO = { x: 124, z: -40, topY: CEIL_Y, len: 12, r: 4, spin: 1.4, hitR: 6.5 };
  const disco = { ax: 0, vx: 0, az: 0, vz: 0, spin: 0, hits: 0, cd: 0 };
  const discoPivot = new THREE.Group();
  discoPivot.position.set(DISCO.x, DISCO.topY, DISCO.z);
  parent.add(discoPivot);
  // Hanger cable running up to the ceiling.
  const discoCable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, DISCO.len, 8),
    new THREE.MeshStandardMaterial({ color: 0x2e2a38, roughness: 0.7, metalness: 0.4 })
  );
  discoCable.position.set(0, -DISCO.len / 2, 0);
  discoPivot.add(discoCable);
  const discoBall = new THREE.Group();
  discoBall.position.set(0, -DISCO.len, 0);
  discoPivot.add(discoBall);
  const discoSpin = new THREE.Group();
  discoBall.add(discoSpin);
  const discoCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(DISCO.r, 2),
    new THREE.MeshStandardMaterial({ color: 0xdff2ff, metalness: 1, roughness: 0.12, flatShading: true, emissive: 0x22333f, emissiveIntensity: 0.35 })
  );
  discoCore.castShadow = true;
  discoSpin.add(discoCore);
  // Scatter tiny mirrored facets over the sphere for the classic sparkle.
  {
    const facetGeo = new THREE.PlaneGeometry(0.42, 0.42);
    const facetN = 150;
    const facets = new THREE.InstancedMesh(
      facetGeo,
      new THREE.MeshStandardMaterial({ color: 0xeaf6ff, metalness: 1, roughness: 0.05, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.25 }),
      facetN
    );
    const dummy = new THREE.Object3D();
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < facetN; i++) {
      // Fibonacci sphere for even coverage.
      const t = (i + 0.5) / facetN;
      const y = 1 - 2 * t;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * 2.399963229728653;
      const dir = new THREE.Vector3(Math.cos(phi) * rad, y, Math.sin(phi) * rad);
      dummy.position.copy(dir).multiplyScalar(DISCO.r + 0.02);
      dummy.quaternion.setFromUnitVectors(zAxis, dir);
      dummy.updateMatrix();
      facets.setMatrixAt(i, dummy.matrix);
    }
    facets.instanceMatrix.needsUpdate = true;
    discoSpin.add(facets);
  }
  // Ring of colored lights orbiting with the ball — the moving neon dots.
  [NEON.magenta, NEON.cyan, NEON.amber, NEON.lime].forEach((c, i) => {
    const L = new THREE.PointLight(c, 6.5, 46, 2);
    const a = (i / 4) * Math.PI * 2;
    L.position.set(Math.cos(a) * (DISCO.r + 0.6), 0, Math.sin(a) * (DISCO.r + 0.6));
    discoSpin.add(L);
  });

  // ---- Rotating platter (the spinning turntable) ----
  // A big bright neon turntable standing on the OPEN CAVERN FLOOR west of the
  // checkerboard ceiling (no roof overhead). While the car sits (or drives)
  // on its disk the level rotates its XZ position around the hub every frame
  // — the car is genuinely carried in a circle, fighting the spin with its
  // own steering. main.js also rotates the car's HEADING with the disk, so
  // it reads like the car is actually sitting on the turntable, not skating
  // on it. An unsteered car slowly creeps outward toward the rim; the moment
  // it crosses the edge the grip ends and the car is thrown off along the
  // tangent (onPlatterEject), so the ride always finishes with a real fling
  // instead of just stopping dead.
  const PLATTER = { cx: 124, cz: -40, r: 18, h: 0.32, spin: 2.0, slip: 1.8 };
  const platterSpin = { t: 0, disk: null };
  {
    const S = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    // Wedge pattern (like a sliced vinyl record) so the spin reads clearly —
    // near-full-opacity neon wedges on a light base so the turntable pops.
    const slots = 8;
    const cols = [NEON.cyan, NEON.magenta, NEON.amber, NEON.lime];
    for (let i = 0; i < slots; i++) {
      const c = new THREE.Color(cols[i % cols.length]);
      ctx.beginPath();
      ctx.moveTo(S / 2, S / 2);
      ctx.arc(S / 2, S / 2, S / 2, (i / slots) * Math.PI * 2, ((i + 1) / slots) * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.92)`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.fillStyle = '#0d0a16';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.07, 0, Math.PI * 2);
    ctx.fill();
    const platTex = new THREE.CanvasTexture(canvas);
    platTex.colorSpace = THREE.SRGBColorSpace;
    const platMat = new THREE.MeshStandardMaterial({
      map: platTex, color: 0xffffff, roughness: 0.45, metalness: 0.25,
      emissive: 0x0c0922, emissiveIntensity: 0.55,
    });
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(PLATTER.r, PLATTER.r + 0.4, PLATTER.h, 48), platMat);
    disk.position.set(PLATTER.cx, PLATTER.h / 2, PLATTER.cz);
    disk.receiveShadow = true;
    parent.add(disk);
    platterSpin.disk = disk;
    // Glowing trim ring around the rim so the rotation is visible from across
    // the cavern, plus a hub cap on the axis and a brighter tinted light.
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(PLATTER.r + 0.12, 0.16, 10, 48),
      makeGlowMat(NEON.amber)
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.set(PLATTER.cx, 0.34, PLATTER.cz);
    parent.add(rimRing);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 20), makeGlowMat(NEON.cyan));
    hub.position.set(PLATTER.cx, 0.62, PLATTER.cz);
    parent.add(hub);
    const platGlow = new THREE.PointLight(NEON.cyan, 9, 60, 2);
    platGlow.position.set(PLATTER.cx, 1.4, PLATTER.cz);
    parent.add(platGlow);
  }
  let platterGripped = false;

  // ---- Trampoline launch pads (idea #13) ----
  // Glowing bounce patches set into the cavern floor. Drive over one on the
  // ground and it punts the car straight up (main.js gives it a vy of 35 —
  // enough to clear the 31.3-high second roof) so it sails up through the
  // ceiling and lands on the colorful tiles: a floor→roof route that skips
  // the staircase and the grand ramp. A translucent light column marks the
  // launch line all the way up to the roof.
  const TRAMPOLINES = [
    { x: 104, z: 8, r: 3.4 },
    { x: 18, z: -86, r: 3.4 },
  ];
  const trampolines = [];
  const trampPadMat = new THREE.MeshStandardMaterial({ color: 0x203a2f, roughness: 0.6, metalness: 0.2 });
  for (const T of TRAMPOLINES) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r + 0.3, 0.5, 28), trampPadMat);
    base.position.set(T.x, 0.25, T.z);
    base.castShadow = true;
    parent.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(T.r - 0.15, 0.16, 10, 32), makeGlowMat(NEON.lime));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(T.x, 0.55, T.z);
    parent.add(ring);
    // Woven bed: crossing glow bars so the disc reads as a sprung trampoline.
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(T.r * 1.7, 0.08, 0.24),
        makeGlowMat(i % 2 ? NEON.cyan : NEON.lime)
      );
      bar.position.set(T.x, 0.52, T.z);
      bar.rotation.y = (i / 4) * Math.PI;
      parent.add(bar);
    }
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(T.r * 0.55, T.r * 0.75, CEIL_Y, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: NEON.lime, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.set(T.x, CEIL_Y / 2, T.z);
    parent.add(beam);
    const glow = new THREE.PointLight(NEON.lime, 3, 30, 2);
    glow.position.set(T.x, 1.5, T.z);
    parent.add(glow);
    trampolines.push({ x: T.x, z: T.z, r: T.r, base, ring, beam, glow, cd: 0, squash: 0 });
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

  // ---- Art Deco German Expressionist statues (colorful-tile guardians) ----
  // Abstract geometric sculptures standing on the checkerboard ceiling tiles
  // (the "second roof"). Each is a tall angular obelisk: stepped ziggurat
  // tiers (art deco), four splaying legs, sharp radiating fins, and EXTRA
  // glowing neon rings circling the body. When the tile a statue stands on
  // crumbles into a hole, the statue loses its footing — it leans over and
  // falls down to the cavern floor below.
  const TILE_TOP = CEIL_Y + 0.15 + TILE_H;   // 31.3 — top face of a ceiling tile
  const STATUE_FALL_DUR = 2.4;               // seconds for the lean + fall
  const statueColliders = [];
  const statues = [];

  function createArtDecoStatue(ringColor) {
    const group = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({
      color: 0xd8b98a, roughness: 0.35, metalness: 0.6,
      emissive: 0x4a3410, emissiveIntensity: 0.25,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x241f2b, roughness: 0.75, metalness: 0.25,
      emissive: 0x120d18, emissiveIntensity: 0.2,
    });

    // === Four angular legs splaying outward (hold the statue up) ===
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;   // offset 45° from the axes
      const dx = Math.cos(a), dz = Math.sin(a);
      // Lower segment — angled outward, ends in a small foot pad.
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 0.18), dark);
      lower.position.set(dx * 0.6, 0.85, dz * 0.6);
      lower.rotation.z = dx * 0.32;
      lower.rotation.x = -dz * 0.32;
      lower.castShadow = true;
      group.add(lower);
      // Upper segment — tapers inward toward the body.
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.9, 0.24), brass);
      upper.position.set(dx * 0.32, 2.4, dz * 0.32);
      upper.castShadow = true;
      group.add(upper);
      // Foot pad — small angular plinth at the leg tip.
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), dark);
      foot.position.set(dx * 0.78, 0.07, dz * 0.78);
      group.add(foot);
    }

    // === Central pedestal (between the legs, below the body) ===
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.85, 0.7, 8), dark);
    pedestal.position.y = 0.35;
    pedestal.castShadow = true;
    group.add(pedestal);

    // === Stepped ziggurat body (art deco tiers, alternating brass/dark) ===
    const tiers = [
      { w: 1.9, h: 1.2, d: 1.9, y: 3.5, mat: brass },
      { w: 1.55, h: 1.0, d: 1.55, y: 4.6, mat: dark },
      { w: 1.2, h: 0.9, d: 1.2, y: 5.55, mat: brass },
      { w: 0.9, h: 0.8, d: 0.9, y: 6.4, mat: dark },
    ];
    for (const t of tiers) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), t.mat);
      m.position.y = t.y;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    // === Spire — sharp expressionist obelisk on top ===
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.3, 4), brass);
    spire.position.y = 8.0;
    spire.rotation.y = Math.PI / 4;   // diamond orientation
    spire.castShadow = true;
    group.add(spire);

    // === Angular radiating fins (art deco sunburst, tilted for drama) ===
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.7, 0.72), dark);
      fin.position.set(Math.cos(a) * 0.78, 5.3, Math.sin(a) * 0.78);
      fin.rotation.y = a;
      fin.rotation.z = (i % 2 ? 0.18 : -0.18);   // slight tilt — expressionist asymmetry
      fin.castShadow = true;
      group.add(fin);
    }

    // === EXTRA glowing neon rings circling the body ===
    // A sub-group so the rings can slowly spin around the statue while it
    // stands (a living, humming feel) without rotating the whole sculpture.
    const ringGroup = new THREE.Group();
    group.add(ringGroup);
    const ringColors = [ringColor || NEON.cyan, NEON.magenta, NEON.amber, NEON.lime];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.15 + i * 0.1, 0.07, 8, 28),
        makeGlowMat(ringColors[i % ringColors.length])
      );
      ring.position.y = 3.7 + i * 0.95;
      ring.rotation.x = Math.PI / 2;
      ringGroup.add(ring);
    }
    // One extra tilted ring near the top — off-kilter for expressionist drama.
    const tiltRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.06, 8, 22),
      makeGlowMat(NEON.magenta)
    );
    tiltRing.position.y = 7.3;
    tiltRing.rotation.set(Math.PI / 3, 0.4, 0);
    ringGroup.add(tiltRing);

    return { group, ringGroup };
  }

  // ---- De Stijl / Vorticist Tree-Like Statue (Dark & Weird, with fruit-like dangling bits) ----
  // A violent, wind-torn "tree": enormous cantilevered limbs crack out of the
  // trunk at crazy angles and hang far out over the neighbouring ceiling tiles
  // — some arms shoot almost straight up, others keel out nearly flat, and all
  // of them droop back down into long overhanging branches strung with big
  // glowing fruits that swing on thin stalks. Neon rings are threaded right
  // onto the limbs (encircling each arm at its own jaunty angle), and a jagged
  // shard-burst crowns the top.
  function createVorticistTreeStatue(ringColor) {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x1d1a22, roughness: 0.8, metalness: 0.3,
      emissive: 0x0a080f, emissiveIntensity: 0.2,
    });
    const woodAccentMat = new THREE.MeshStandardMaterial({
      color: 0x8a5b3f, roughness: 0.6, metalness: 0.2,
    });
    // All rings + fruit use the tree's blue tone (NEON.cyan); the single
    // largest tip fruit is the one reddish one (NEON.red) — see the limb loop.
    const fruitColors = [NEON.cyan];
    const ringColors = [NEON.cyan];

    // Build a strut pointing outward-up at `ang` radians (0 = straight up):
    // a box whose centre sits half its length along that direction. Local
    // frame: +X = outward radial, +Y = up.
    const strut = (len, th, ang, ox, oy, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(th, len, th), mat);
      m.position.set(ox + Math.sin(ang) * (len / 2), oy + Math.cos(ang) * (len / 2), 0);
      m.rotation.z = -ang;
      m.castShadow = true;
      return m;
    };

    // === Gnarled twisted trunk: four tapering blocks, each kinked off-axis
    // so the column bends like a wind-bent tree. ===
    const trunkSegs = [
      { s: 1.1, y: 1.7, ry: 0.12 },
      { s: 0.88, y: 3.6, ry: 0.95 },
      { s: 0.7, y: 5.5, ry: 0.45 },
      { s: 0.55, y: 7.1, ry: 0.1 },
    ];
    for (const t of trunkSegs) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(t.s, 3.0, t.s), trunkMat);
      b.position.y = t.y;
      b.rotation.y = t.ry;
      b.castShadow = true;
      b.receiveShadow = true;
      group.add(b);
    }
    // A knot where the trunk starts splitting into limbs.
    const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), trunkMat);
    knot.position.y = 7.1;
    knot.scale.set(1, 1.4, 1);
    knot.castShadow = true;
    group.add(knot);

    // === Angular root-struts splaying out and clawing the ground ===
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3 + i * 0.11;
      const yaw = new THREE.Group();
      yaw.rotation.y = a;
      yaw.add(strut(3.4 + (i % 2) * 0.7, 0.2, 1.0 + (i % 2) * 0.45, 0.42, 0.3, trunkMat));
      group.add(yaw);
    }

    // === Long, overhanging cantilevered limbs ===
    // Each limb keeps its own yaw group so +X is always "outward". An arm
    // cracks out at a crazy vertical angle, then an overhang keels past the
    // arm tip and droops back down — reaching 2-3 tiles out and hanging low
    // over the tiles beside the statue. `ringT` is where the limb's three-ring
    // cluster sits (a fraction along the arm, so it can differ per limb).
    const limbDefs = [
      { y: 3.9, az: 0.18,  phi: 0.35, len: 9.5, bend: 0.50, droop: 10.5, thick: 0.40, twist: 0.10, fruit: 0.62, ringT: 0.30 },
      { y: 5.4, az: 1.22,  phi: 0.55, len: 10.5, bend: 0.42, droop: 9.0, thick: 0.36, twist: -0.16, fruit: 0.85, ringT: 0.50 },
      { y: 7.0, az: 2.35,  phi: 0.90, len: 8.5, bend: 0.36, droop: 8.5, thick: 0.30, twist: 0.18, fruit: 0.90, ringT: 0.38 },
      { y: 6.4, az: 3.05,  phi: 0.45, len: 11.5, bend: 0.50, droop: 10.0, thick: 0.32, twist: -0.22, fruit: 0.68, ringT: 0.62 },
      { y: 4.7, az: 3.55,  phi: 1.15, len: 7.5, bend: 0.30, droop: 6.5, thick: 0.26, twist: 0.12, fruit: 0.72, ringT: 0.55 },
      { y: 8.2, az: 0.75,  phi: 1.05, len: 7.0, bend: 0.40, droop: 7.0, thick: 0.28, twist: -0.10, fruit: 0.90, ringT: 0.72 },
      { y: 6.0, az: 2.04,  phi: 0.25, len: 12.5, bend: 0.55, droop: 9.5, thick: 0.34, twist: 0.06, fruit: 0.55, ringT: 0.35 },
    ];

    // The biggest of the 7 limb-tip fruits turns reddish; every other ring and
    // fruit on the tree stays blueish.
    let bigFruitLimb = 0, bigFruitSize = -1;
    for (let i = 0; i < limbDefs.length; i++) {
      if (limbDefs[i].fruit > bigFruitSize) { bigFruitSize = limbDefs[i].fruit; bigFruitLimb = i; }
    }
    for (let li = 0; li < limbDefs.length; li++) {
      const d = limbDefs[li];
      const limb = new THREE.Group();
      limb.position.set(0, d.y, 0);
      limb.rotation.y = d.az;
      limb.rotation.z = d.twist;   // fore/aft rake so the limbs spread in 3D
      group.add(limb);

      const armAng = d.phi;
      const overAng = d.phi + Math.PI / 2 + d.bend;   // past vertical: down and out
      const armEndX = Math.sin(armAng) * d.len;
      const armEndY = Math.cos(armAng) * d.len;
      const overDirX = Math.sin(overAng);
      const overDirY = Math.cos(overAng);

      // ==== Main arm: huge angular beam cracking out and up ====
      const arm = new THREE.Mesh(new THREE.BoxGeometry(d.thick, d.len, d.thick), woodAccentMat);
      arm.position.set(armEndX / 2, armEndY / 2, 0);
      arm.rotation.z = -armAng;
      arm.castShadow = true;
      limb.add(arm);

      // ==== Three neon rings clustered together on each limb ====
      // Every limb carries exactly three rings, always grouped in a tight trio
      // right next to each other (a few % of the arm length apart). The trio
      // sits at a different spot along each limb (d.ringT), but on any one
      // limb the three rings never scatter.
      for (let r = 0; r < 3; r++) {
        const rt = d.ringT + (r - 1) * 0.06;
        const limbRing = new THREE.Mesh(
          new THREE.TorusGeometry(d.thick / 2 + 0.3 + (r % 2) * 0.12, 0.07, 8, 28),
          makeGlowMat(ringColors[(Math.round(d.az * 3) + r) % ringColors.length])
        );
        limbRing.rotation.x = Math.PI / 2;
        limbRing.position.set(0, (rt - 0.5) * d.len, 0);
        arm.add(limbRing);
      }

      // Square joint where the arm turns into the overhang.
      const joint = new THREE.Mesh(
        new THREE.BoxGeometry(d.thick + 0.08, d.thick + 0.08, d.thick + 0.08),
        trunkMat
      );
      joint.position.set(armEndX, armEndY, 0);
      joint.rotation.z = -Math.PI / 4;
      joint.scale.z = 1.3;
      joint.castShadow = true;
      limb.add(joint);

      // ==== Overhang: keels past the arm tip and droops low behind it ====
      const over = new THREE.Mesh(new THREE.BoxGeometry(d.thick, d.droop, d.thick), woodAccentMat);
      over.position.set(armEndX + overDirX * (d.droop / 2), armEndY + overDirY * (d.droop / 2), 0);
      over.rotation.z = -overAng;
      over.castShadow = true;
      limb.add(over);

      // ==== Stiff twigs jabbing out along the arm ====
      const twigs = [
        { t: 0.4, rz: armAng - 0.95, len: 2.2, rx: 0.3 },
        { t: 0.65, rz: armAng + 0.75, len: 3.0, rx: -0.25 },
        { t: 0.9, rz: armAng - 1.25, len: 1.8, rx: 0.4 },
      ];
      for (const tw of twigs) {
        const twig = new THREE.Mesh(new THREE.BoxGeometry(0.13, tw.len, 0.13), trunkMat);
        twig.position.set(armEndX * tw.t, armEndY * tw.t, (tw.t - 0.5) * 1.2);
        twig.rotation.z = -tw.rz;
        twig.rotation.x = tw.rx;
        twig.castShadow = true;
        limb.add(twig);
      }

      // ==== Big glowing fruits swinging on thin stalks along the overhang ====
      for (let p = 0; p < 3; p++) {
        const t = 0.2 + p * 0.32;
        const px = armEndX + overDirX * (d.droop * t);
        const py = armEndY + overDirY * (d.droop * t) - d.thick / 2;
        const zOff = p % 2 ? 0.26 : -0.26;
        const hang = 0.8 + ((p + Math.round(d.az * 4)) % 3) * 0.5;
        const r = d.fruit * (0.34 + p * 0.16);
        const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.08, hang, 0.08), trunkMat);
        stalk.position.set(px, py - hang / 2, zOff);
        limb.add(stalk);
        const pod = new THREE.Mesh(
          new THREE.OctahedronGeometry(r, 0),
          makeGlowMat(fruitColors[(Math.round(d.az * 4) + p) % fruitColors.length])
        );
        pod.position.set(px, py - hang - r * 0.55, zOff);
        pod.scale.set(1, 2, 1);   // cancel the group's Y-halve so the pod stays round
        limb.add(pod);
      }

      // The big glowing fruit at the very tip of the limb.
      const tipPod = new THREE.Mesh(
        new THREE.DodecahedronGeometry(d.fruit, 0),
        makeGlowMat(li === bigFruitLimb ? NEON.red : NEON.cyan)
      );
      tipPod.position.set(armEndX + overDirX * d.droop, armEndY + overDirY * d.droop, 0);
      tipPod.scale.set(1, 2, 1);   // cancel the group's Y-halve so the tip fruit stays round
      limb.add(tipPod);
    }

    // === Angry shard-burst crown (abstract vorticist foliage) ===
    const crownShards = [
      { y: 8.6, rx: -0.55, rz: 0.35, s: 0.55, h: 3.2, mat: woodAccentMat },
      { y: 9.6, rx: 0.75, rz: -0.6, s: 0.45, h: 2.6, mat: trunkMat },
      { y: 9.1, rx: -0.1, rz: 1.45, s: 0.4, h: 3.4, mat: woodAccentMat },
      { y: 10.3, rx: 1.15, rz: 0.25, s: 0.35, h: 2.4, mat: trunkMat },
    ];
    for (const c of crownShards) {
      const shard = new THREE.Mesh(new THREE.BoxGeometry(c.s, c.h, c.s), c.mat);
      shard.position.set(Math.sin(c.rz) * 0.3, c.y, Math.cos(c.rz) * 0.3);
      shard.rotation.x = c.rx;
      shard.rotation.z = c.rz;
      shard.castShadow = true;
      group.add(shard);
    }
    // A big glowing gem at the peak.
    const gem = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.55, 1),
      makeGlowMat(ringColor || NEON.magenta)
    );
    gem.position.y = 12.0;
    gem.scale.set(1, 2, 1);   // cancel the group's Y-halve so the peak gem stays round
    gem.castShadow = true;
    group.add(gem);

    // ringGroup is kept for the update/fall loops in this level, but the neon
    // rings now live on the limbs themselves rather than around the trunk.
    const ringGroup = new THREE.Group();
    group.add(ringGroup);

    // The tree is half as tall as its unbent proportions: squash every piece
    // vertically (Y × 0.5) while leaving all widths untouched, so the trunk,
    // limbs and crown keep reaching just as far out but only up half as high.
    group.scale.set(1, 0.5, 1);

    return { group, ringGroup };
  }

  // ---- Cubist figure: a humanoid smashed into offset, tilted slabs. ----
  // Angular de Stijl / cubist sculpture — a body assembled from blocks that
  // don't quite line up (torso slabs sheared off-axis, a turned cube head with
  // a jutting nose, bar arms flung out at odd angles), threaded with neon
  // rings. Reads as "a person" from a distance and "broken geometry" up close.
  function createCubistFigure(ringColor) {
    const group = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.45, metalness: 0.5, emissive: 0x3a2a08, emissiveIntensity: 0.25 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x2a2333, roughness: 0.7, metalness: 0.3, emissive: 0x140f1c, emissiveIntensity: 0.2 });
    const matC = new THREE.MeshStandardMaterial({ color: 0x6a4a8a, roughness: 0.5, metalness: 0.4, emissive: 0x241038, emissiveIntensity: 0.3 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.2), matB);
    base.position.y = 0.2; base.castShadow = true; base.receiveShadow = true; group.add(base);

    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), matB);
      leg.position.set(sx * 0.5, 1.5, 0); leg.rotation.z = sx * 0.18; leg.castShadow = true; group.add(leg);
    }
    const torsoDefs = [
      { w: 1.5, h: 1.1, d: 1.0, y: 3.1, rz: 0.10, m: matC },
      { w: 1.2, h: 1.0, d: 0.9, y: 4.1, rz: -0.16, m: matA },
      { w: 0.95, h: 0.9, d: 0.8, y: 5.0, rz: 0.22, m: matB },
    ];
    for (const t of torsoDefs) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), t.m);
      b.position.set(Math.sin(t.rz) * 0.25, t.y, 0); b.rotation.z = t.rz; b.castShadow = true; group.add(b);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), matA);
    head.position.y = 5.9; head.rotation.y = Math.PI / 4; head.castShadow = true; group.add(head);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), matB);
    nose.position.set(0.42, 5.9, 0.1); nose.rotation.z = -Math.PI / 3; group.add(nose);

    const armDefs = [
      { s: 1, rz: 1.0, y: 4.4, len: 3.2 },
      { s: -1, rz: -1.35, y: 4.2, len: 2.8 },
    ];
    for (const a of armDefs) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, a.len, 0.35), matC);
      arm.position.set(a.s * (0.8 + Math.sin(Math.abs(a.rz)) * a.len * 0.5), a.y, 0);
      arm.rotation.z = a.s * a.rz; arm.castShadow = true; group.add(arm);
    }

    const ringGroup = new THREE.Group();
    group.add(ringGroup);
    const cols = [ringColor || NEON.lime, NEON.cyan, NEON.magenta];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0 + i * 0.12, 0.07, 8, 26), makeGlowMat(cols[i % cols.length]));
      ring.position.y = 3.3 + i * 1.0; ring.rotation.x = Math.PI / 2; ringGroup.add(ring);
    }
    return { group, ringGroup };
  }

  // ---- Broken column: a fluted shaft severed partway up, crown in shards. ----
  function createBrokenColumn(ringColor) {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.9, metalness: 0.05, emissive: 0x1a1814, emissiveIntensity: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.95, metalness: 0.05 });

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), dark);
    plinth.position.y = 0.25; plinth.castShadow = true; plinth.receiveShadow = true; group.add(plinth);
    const plinth2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.6), dark);
    plinth2.position.y = 0.67; plinth2.castShadow = true; group.add(plinth2);

    const segs = [
      { r: 0.62, h: 2.4, y: 2.1, ry: 0.0 },
      { r: 0.58, h: 2.2, y: 4.4, ry: 0.5 },
      { r: 0.52, h: 2.0, y: 6.5, ry: 1.0 },
    ];
    for (const s of segs) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r * 1.04, s.h, 10), stone);
      c.position.y = s.y; c.rotation.y = s.ry; c.castShadow = true; c.receiveShadow = true; group.add(c);
    }
    const shards = [
      { w: 0.9, h: 1.1, x: 0.0, z: 0.0, rx: -0.3, rz: 0.2 },
      { w: 0.6, h: 0.9, x: 0.35, z: 0.2, rx: 0.4, rz: -0.5 },
      { w: 0.5, h: 0.7, x: -0.3, z: -0.15, rx: -0.5, rz: 0.7 },
    ];
    for (const s of shards) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.w), stone);
      sh.position.set(s.x, 7.7, s.z); sh.rotation.set(s.rx, 0, s.rz); sh.castShadow = true; group.add(sh);
    }
    const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 10), stone);
    fallen.position.set(1.15, 1.0, 0.5); fallen.rotation.z = 0.7; fallen.rotation.x = 0.3; fallen.castShadow = true; group.add(fallen);

    const ringGroup = new THREE.Group(); group.add(ringGroup);
    const cols = [ringColor || NEON.cyan, NEON.amber, NEON.magenta, NEON.lime];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78 + i * 0.06, 0.06, 8, 26), makeGlowMat(cols[i % cols.length]));
      ring.position.y = 1.6 + i * 1.6; ring.rotation.x = Math.PI / 2; ringGroup.add(ring);
    }
    return { group, ringGroup };
  }

  // ---- Giant hand: a colossal up-reaching hand on a cuff stump. ----
  function createGiantHand(ringColor) {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xcaa27a, roughness: 0.55, metalness: 0.2, emissive: 0x2a1a0e, emissiveIntensity: 0.2 });
    const nail = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.4, metalness: 0.1 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0x2a2333, roughness: 0.7, metalness: 0.4, emissive: 0x140f1c, emissiveIntensity: 0.2 });

    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 2.4, 12), cuff);
    wrist.position.y = 1.2; wrist.castShadow = true; wrist.receiveShadow = true; group.add(wrist);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 1.4), skin);
    palm.position.y = 3.7; palm.castShadow = true; group.add(palm);
    const knuckles = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.8, 1.5), skin);
    knuckles.position.y = 5.0; knuckles.castShadow = true; group.add(knuckles);

    const fingers = [
      { x: -1.15, lean: -0.18, h1: 2.4, h2: 1.7 },
      { x: -0.4, lean: -0.06, h1: 2.9, h2: 2.1 },
      { x: 0.4, lean: 0.06, h1: 2.7, h2: 1.9 },
      { x: 1.15, lean: 0.18, h1: 2.1, h2: 1.5 },
    ];
    for (const f of fingers) {
      const prox = new THREE.Mesh(new THREE.BoxGeometry(0.62, f.h1, 0.62), skin);
      prox.position.set(f.x, 5.5 + f.h1 / 2, 0); prox.rotation.z = f.lean; prox.castShadow = true; group.add(prox);
      const dist = new THREE.Mesh(new THREE.BoxGeometry(0.5, f.h2, 0.5), skin);
      dist.position.set(f.x + Math.sin(f.lean) * (f.h1 + 0.3), 5.5 + f.h1 + f.h2 / 2, 0);
      dist.rotation.z = f.lean * 1.6; dist.castShadow = true; group.add(dist);
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.55), nail);
      n.position.set(f.x + Math.sin(f.lean * 1.6) * (f.h1 + f.h2 + 0.2), 5.5 + f.h1 + f.h2 + 0.15, 0);
      n.rotation.z = f.lean * 1.6; group.add(n);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.7), skin);
    thumb.position.set(-1.7, 4.2, 0.4); thumb.rotation.z = 0.95; thumb.castShadow = true; group.add(thumb);

    const ringGroup = new THREE.Group(); group.add(ringGroup);
    const cols = [ringColor || NEON.amber, NEON.cyan, NEON.magenta, NEON.lime];
    const ringDefs = [ { r: 1.25, y: 1.4 }, { r: 1.75, y: 3.7 }, { r: 1.55, y: 6.6 }, { r: 1.05, y: 9.0 } ];
    for (let i = 0; i < ringDefs.length; i++) {
      const rd = ringDefs[i];
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rd.r, 0.07, 8, 28), makeGlowMat(cols[i % cols.length]));
      ring.position.y = rd.y; ring.rotation.x = Math.PI / 2; ringGroup.add(ring);
    }
    return { group, ringGroup };
  }

  // Type -> mesh builder + footprint half-size (drives the bump collider AND
  // the radius the car must get within to knock it over, idea #31).
  const STATUE_HALF = { artdeco: 1.5, vorticist: 1.5, cubist: 1.3, column: 1.3, hand: 2.4 };
  function buildStatue(type, ringColor) {
    if (type === 'vorticist') return createVorticistTreeStatue(ringColor);
    if (type === 'cubist') return createCubistFigure(ringColor);
    if (type === 'column') return createBrokenColumn(ringColor);
    if (type === 'hand') return createGiantHand(ringColor);
    return createArtDecoStatue(ringColor);
  }

  // Tip a statue over in the given compass direction and drop its solid
  // collider (shared by the tile-crumble path and the new car-tag path).
  function startStatueFall(s, angle) {
    s.state = 'falling';
    s.fallT = 0;
    s.tipAngle = angle;
    s.tipAxis.set(Math.sin(angle), 0, -Math.cos(angle));
    const ci = colliders.indexOf(s.collider);
    if (ci >= 0) colliders.splice(ci, 1);
  }

  // Place a statue on a specific checkerboard tile (by grid index) so the
  // level can watch exactly which tile supports it. Returns the live statue
  // record (state machine + collider) for update().
  function placeStatue(tileIx, tileIz, ringColor, type = 'artdeco') {
    const idx = tileIz * tilesX + tileIx;
    const x = ceilMinX + tileIx * TILE_SZ + TILE_SZ / 2;
    const z = gridZ0 + tileIz * TILE_SZ + TILE_SZ / 2;
    const { group, ringGroup } = buildStatue(type, ringColor);
    const half = STATUE_HALF[type] || 1.5;
    group.position.set(x, TILE_TOP, z);
    parent.add(group);
    // Solid collider so the car bumps into the standing statue; removed the
    // moment the statue starts falling. `noRoof` keeps buildingTopAt from
    // reporting the statue's top as a drivable surface (the car should bump
    // into it, not stand on its head).
    const collider = { x, z, halfW: half, halfD: half, h: TILE_TOP + 9, noRoof: true };
    statueColliders.push(collider);
    const tipAngle = Math.random() * Math.PI * 2;   // random topple direction
    const statue = {
      group, ringGroup, idx, x, z, collider, type, half,
      state: 'standing',   // 'standing' | 'falling' | 'landed'
      fallT: 0,
      tipAngle,
      // Axis perpendicular to the tip direction — rotating around it tips the
      // statue toward (cos tipAngle, 0, sin tipAngle) and DOWN.
      tipAxis: new THREE.Vector3(Math.sin(tipAngle), 0, -Math.cos(tipAngle)),
    };
    statues.push(statue);
    return statue;
  }

  // Paint a readable word banner on a canvas (no image assets): a dark cloth
  // with a neon checkerboard border and big bold text. Used for the START and
  // FINISH gates.
  function makeBannerTexture(text, accent) {
    const W = 1024, H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const c1 = new THREE.Color(accent);
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, W, H);
    // Checkerboard border: one cell thick around the whole cloth.
    const rows = 4, cols = 16, cellW = W / cols, cellH = H / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r >= 1 && r < rows - 1 && c >= 1 && c < cols - 1) continue;
        ctx.fillStyle = (r + c) % 2 === 0
          ? `rgb(${(c1.r * 255) | 0},${(c1.g * 255) | 0},${(c1.b * 255) | 0})`
          : 'rgb(238,238,238)';
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
    // Dim inner panel so the text pops.
    ctx.fillStyle = 'rgba(10,8,16,0.6)';
    ctx.fillRect(cellW, cellH, W - cellW * 2, H - cellH * 2);
    ctx.font = 'bold 96px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = `rgb(${(c1.r * 255) | 0},${(c1.g * 255) | 0},${(c1.b * 255) | 0})`;
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, W / 2, H / 2 + 4);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // A waving route flag: slim dark pole with a small glowing triangular
  // pennant at the top. The pennant's long axis points +Z by default; rotate
  // the returned group's Y to aim it along the road. Each pennant is enrolled
  // in `routePennantWaves` so update() can flutter it.
  const routePennantWaves = [];   // pennants to wiggle every frame (course flags)
  const flagPoleMat = new THREE.MeshStandardMaterial({ color: 0x232030, roughness: 0.7, metalness: 0.5 });
  function makeRouteFlag(pennantColor, poleH = 4.4, pennantLen = 2.2) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, poleH, 0.16), flagPoleMat);
    pole.position.y = poleH / 2;
    pole.castShadow = true;
    group.add(pole);
    const pennant = new THREE.Mesh(new THREE.ConeGeometry(0.8, pennantLen, 3), makeGlowMat(pennantColor));
    pennant.rotation.x = -Math.PI / 2;   // cone axis lands on +Z — points "forward"
    pennant.rotation.y = 0;              // wiggle pivot (animated per frame)
    pennant.position.set(0, poleH + pennantLen * 0.32, 0);
    group.add(pennant);
    const rec = { pennant, phase: Math.random() * Math.PI * 2 };
    routePennantWaves.push(rec);
    return { group, pennant };
  }

  // A banner gate (START / FINISH): two tall poles with a hanging word banner
  // between them and a waving pennant atop each pole. Cosmetic — the car
  // passes right through (no colliders).
  const bannerMats = new Map();
  const bannerMatFor = (tex) => {
    let m = bannerMats.get(tex);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.55 });
      bannerMats.set(tex, m);
    }
    return m;
  };
  const POLE_H = 5.6;
  function makeBannerGate(xA, zA, xB, zB, text, accent, baseY = TILE_TOP) {
    const group = new THREE.Group();
    for (const [px, pz] of [[xA, zA], [xB, zB]]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.24, POLE_H, 0.24), pillarMat); 
      pole.position.set(px, baseY + POLE_H / 2, pz);
      pole.castShadow = true;
      group.add(pole);
      const top = makeRouteFlag(accent, 0.9, 1.3);
      top.group.position.set(px, baseY + POLE_H, pz);
      top.group.rotation.y = text === 'START' ? Math.PI : Math.PI / 2;
      group.add(top.group);
    }
    const tex = makeBannerTexture(text, accent);
    const mat = bannerMatFor(tex);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(xB - xA) + 1.2, 2.4, 0.16), mat);
    banner.position.set((xA + xB) / 2, baseY + 3.6, (zA + zB) / 2);
    banner.castShadow = true;
    group.add(banner);
    return { group, mat };
  }
  // A flat glowing "painted line" lying on the tiles — the gate stripe you
  // drive through. Never a collider; purely the dashed road marking.
  function addTileBar(x, z, len, orient, color, baseY = TILE_TOP) {
    const bar = new THREE.Mesh(
      orient === 'x'
        ? new THREE.BoxGeometry(len, 0.12, 0.5)
        : new THREE.BoxGeometry(0.5, 0.12, len),
      makeGlowMat(color)
    );
    bar.position.set(x, baseY + 0.06, z);
    parent.add(bar);
    return bar;
  }
  // ---- Statues scattered over the checkerboard ceiling ----
  // The statues the obstacle course had gathered into gates are back, spread
  // out sporadically over the roof again: Art Deco obelisks, Vorticist trees,
  // Cubist figures, broken columns and one giant hand — each standing on its
  // own checkerboard tile, clear of the jump line and the ramps so the car can
  // wander between them. Drive over a tile and it advances toward red and
  // crumbles into a hole; the statue on top loses its footing and topples over
  // and down to the cavern floor.
  // Placement by encounter order: the candy waterfall (grand ramp at
  // x∈[18,30]) spills the car onto the roof's north edge (z≈48), so the simple
  // broken columns greet you right there as the first statues you see, while
  // the giant hand and the Vorticist trees keep to the center and the back of
  // the roof.
  const COURSE_START = { x: 24, z: 40 };       // START banner centre
  const COURSE_FINISH_X = 134;                 // crossing this plane (heading +X) finishes
  const COURSE_FINISH_Z = 10;                  // finish gate centre z
  const COURSE_FINISH_HALF = 5.5;              // z half-span of the finish gate
  placeStatue(0, 35, NEON.cyan, 'column');        // (14, 46)   first column, west of the waterfall mouth
  placeStatue(9, 35, NEON.magenta, 'column');     // (50, 46)   second column, east of it
  placeStatue(13, 32, NEON.amber, 'artdeco');     // (66, 34)   north obelisk
  placeStatue(18, 29, NEON.lime, 'cubist');       // (86, 22)   cubist figure
  placeStatue(24, 26, NEON.cyan, 'artdeco');      // (110, 10)  east obelisk
  placeStatue(7, 18, NEON.magenta, 'hand');       // (42, -22)  giant hand, center
  placeStatue(15, 16, NEON.lime, 'vorticist');    // (74, -30)  Vorticist tree
  placeStatue(21, 12, NEON.cyan, 'vorticist');    // (98, -46)  Vorticist tree
  placeStatue(27, 8, NEON.amber, 'vorticist');    // (122, -62) Vorticist tree (back)
  placeStatue(10, 5, NEON.amber, 'artdeco');      // (54, -74)  obelisk (back)
  placeStatue(18, 2, NEON.lime, 'cubist');        // (86, -86)  cubist figure (back)
  placeStatue(29, 24, NEON.magenta, 'artdeco');   // (130, 2)   south-east obelisk

  // START gate on the ground floor south of the grand ramp: banner + poles.
  const startGate = makeBannerGate(18, 40, 30, 40, 'START', NEON.lime, 0);
  parent.add(startGate.group);
  // Painted start line straight across the ramp mouth.
  addTileBar(24, 41.6, 10.4, 'x', NEON.lime, 0);

  // FINISH gate on the ground floor in the east wing: banner + poles spanning
  // the corridor.
  const finishGate = makeBannerGate(134, 6, 134, 14, 'FINISH', NEON.amber, 0);
  parent.add(finishGate.group);
  addTileBar(132.6, 10, 8.2, 'z', NEON.amber, 0);

  // ---- Serpentine course guides ----
  // FOLLOW THE DASHES: a glowing painted centreline runs along each straight
  // of the course; route flags stand at every bend and every ~13 units along
  // the road, pennants aimed along the travel direction and coloured by lane
  // so the whole snake reads instantly from the start line to the finish gate.
  const COURSE_COLORS = [NEON.lime, NEON.cyan, NEON.amber, NEON.magenta];
  for (let i = 0; i < COURSE.length - 1; i++) {
    const a = COURSE[i], b = COURSE[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const segLen = Math.hypot(dx, dz);
    const ux = dx / segLen, uz = dz / segLen;
    const heading = Math.atan2(dx, dz);            // pennant along the road
    const dashLen = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
    const color = COURSE_COLORS[i % COURSE_COLORS.length];
    let side = i % 2 === 0 ? 1 : -1;
    for (let d = 5; d < segLen - 3; d += 6) {
      addTileBar(a.x + ux * d, a.z + uz * d, 2.6, dashLen, color, 0);
    }
    for (let d = 8; d < segLen - 4; d += 13) {
      const cx = a.x + ux * d, cz = a.z + uz * d;
      const flag = makeRouteFlag(color);
      flag.group.position.set(cx + uz * 2.6 * side, 0, cz - ux * 2.6 * side);
      flag.group.rotation.y = heading;
      parent.add(flag.group);
      side *= -1;
    }
  }
  // A flag planted on the OUTSIDE of each corner, aimed down the next straight.
  for (let i = 1; i < COURSE.length - 1; i++) {
    const inD = { x: COURSE[i].x - COURSE[i - 1].x, z: COURSE[i].z - COURSE[i - 1].z };
    const outN = { x: COURSE[i + 1].x - COURSE[i].x, z: COURSE[i + 1].z - COURSE[i].z };
    const il = Math.hypot(inD.x, inD.z), ol = Math.hypot(outN.x, outN.z);
    const outSideX = inD.x / il - outN.x / ol, outSideZ = inD.z / il - outN.z / ol;
    const oL = Math.hypot(outSideX, outSideZ) || 1;
    const flag = makeRouteFlag(COURSE_COLORS[(i - 1) % COURSE_COLORS.length]);
    flag.group.position.set(COURSE[i].x + (outSideX / oL) * 3, 0, COURSE[i].z + (outSideZ / oL) * 3);
    flag.group.rotation.y = Math.atan2(outN.x, outN.z);
    parent.add(flag.group);
  }

  // ---- The Holy Mountain (hollow snow-capped peak, west cavern) ----
  // A full cone rising off the open western floor: drive the pilgrim's road
  // (a spiral of wedge ramps) up to its snowy summit skylight rim — the
  // highest point in the cavern. The mountain is HOLLOW but has NO cave mouth:
  // its base is solid rock all the way round. The only way in is the summit's
  // OPEN skylight hole — drive up and roll over it, and the drop-in plays a
  // staged sequence: the car falls into the torch-lit chamber beside a man in a
  // huge brimmed white hat flanked by two goats under a mysterious pulsing
  // light, the camera pans around the shrine, then the light surges and the car
  // is mysteriously lifted back out through the skylight and cast over the cone
  // onto the open floor. Getting in AND out is entirely the cinematic's job, so
  // there is no exit geometry at all. All layout numbers come from the pure
  // module (and its tests); here we only shape meshes and register colliders.
  // The whole mountain is one thing at ONE place (MOUNT) — the cone shell,
  // snowcap, chamber, shrine and road share the same centre.
  const mountColliders = [];
  const coneR = (y) => coneRadiusAt(y, MOUNT);
  const mountRockMat = new THREE.MeshStandardMaterial({ color: 0x4a4148, roughness: 1, side: THREE.DoubleSide });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fb, roughness: 0.95, side: THREE.DoubleSide });
  const caveMat = new THREE.MeshStandardMaterial({ color: 0x17131c, roughness: 1, side: THREE.DoubleSide });
  const roadStoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6470, roughness: 0.95 });
  const frame = mouthFrame();

  // Lower rock band (y 0 → just above the lintel), FULL circle: the mountain
  // has no cave mouth any more — getting in and out is the cinematic's job, so
  // the base is solid rock all the way round. Its flat bottom face is the
  // chamber floor, which means the vinyl cavern floor can NOT show through
  // inside the mountain (the old mouth gap used to punch a wedge out of that
  // floor and let the tiles show through).
  const bandTopY = MOUNT.archH + 0.1;
  const lowerBand = new THREE.Mesh(
    new THREE.LatheGeometry(
      [new THREE.Vector2(0.03, 0), new THREE.Vector2(MOUNT.baseR, 0), new THREE.Vector2(coneR(bandTopY), bandTopY)],
      48,
      0,
      Math.PI * 2
    ),
    mountRockMat
  );
  lowerBand.position.set(MOUNT.cx, 0, MOUNT.cz);
  lowerBand.castShadow = true;
  parent.add(lowerBand);

  // Upper shell (base → snowline → summit rim), FULL circle: the solid rock
  // cone above the base band.
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
  upperShell.position.set(MOUNT.cx, 0, MOUNT.cz);
  upperShell.castShadow = true;
  parent.add(upperShell);

  // The hollow chamber: dark curved walls, a ceiling ring with an open
  // oculus, and a skylight shaft tapering up to the open summit hole — the
  // two holes line up, so the drop-from-the-top route is dead-straight.
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
    new THREE.CylinderGeometry(MOUNT.skylightR + 1.0, OCULUS_R + 0.1, MOUNT.peakY - CHAMBER_H, 40, 1, true),
    caveMat
  );
  oculusShaft.position.set(MOUNT.cx, CHAMBER_H + (MOUNT.peakY - CHAMBER_H) / 2, MOUNT.cz);
  parent.add(oculusShaft);

  // Snow cap: a hollow white funnel draped over the rock above the snowline.
  // Its top is OPEN (no cap) — the flat summit ring bridges the funnel rim,
  // and the centre stays a dark open skylight straight down into the chamber.
  const snowBottomY = 16.9;
  const snowTopR = MOUNT.padR + 0.4;
  const snowCap = new THREE.Mesh(
    new THREE.CylinderGeometry(snowTopR, coneR(snowBottomY) + 0.75, MOUNT.peakY - snowBottomY, 48, 1, true),
    snowMat
  );
  snowCap.position.set(MOUNT.cx, (snowBottomY + MOUNT.peakY) / 2, MOUNT.cz);
  snowCap.castShadow = true;
  parent.add(snowCap);
  // Summit skylight rim: the flat white ring the pilgrim's road lands on,
  // running from the skylight edge out to the funnel rim.
  const summitRing = new THREE.Mesh(new THREE.RingGeometry(MOUNT.skylightR, snowTopR, 48), snowMat);
  summitRing.rotation.x = -Math.PI / 2;
  summitRing.receiveShadow = true;
  summitRing.position.set(MOUNT.cx, MOUNT.peakY, MOUNT.cz);
  parent.add(summitRing);

  // The pilgrim's road: chained wedge ramps spiralling up the outside of the
  // cone (layout + soft ride colliders verified in the pure module's tests).
  const roadSegs = spiralSegments();
  for (const seg of roadSegs) {
    addUgRamp(seg, roadStoneMat);
    mountColliders.push(seg.collider);
  }
  // Direct-climb skin: invisible ride-able ramps tiling the whole mountain
  // face so you can drive straight up the rock anywhere (not just the spiral
  // road). Registered AFTER the road so the road wins where footprints
  // overlap. No meshes — the lathe cone + snowcap already supply the visuals,
  // and every skin wedge's surface matches the cone generator exactly.
  for (const s of coneSkinSegments()) {
    ugRamps.push(s);
    mountColliders.push(s.collider);
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

  // Invisible collision layout: the chamber wall ring, the shrine dais, plus
  // the soft summit skylight rim, the chamber-ceiling planks around the oculus
  // hole (ride them, roll into the open centres, and drop down into the
  // chamber) and the cone-skin colliders (overlaps the skin ramps so a falling
  // car lands on the face too).
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
  // Model built facing local +Z; turn it to face the old mouth azimuth (the
  // man gazes out across the chamber the way the cave mouth used to open).
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
  // Arms hang from shoulder pivots so idea #24 can raise them in blessing.
  function makeArm() {
    const a = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.25, 8), robeMat);
    sleeve.position.y = -0.62;
    sleeve.castShadow = true;
    a.add(sleeve);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), skinMat);
    hand.position.y = -1.3;
    a.add(hand);
    return a;
  }
  const manArmR = makeArm();
  manArmR.position.set(0.62, 2.05, 0);
  manArmR.rotation.z = 0.12;
  man.add(manArmR);
  const manArmL = makeArm();
  manArmL.position.set(-0.62, 2.05, 0);
  manArmL.rotation.z = -0.12;
  man.add(manArmL);

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
  const goats = [];
  for (const side of [-1, 1]) {
    const goat = makeGoat();
    goat.position.set(side * 2.45, 0.7, 0);
    const baseRot = side > 0 ? Math.PI / 2 : -Math.PI / 2;   // face outward
    goat.rotation.y = baseRot;
    goat.userData = { baseRot, side };
    shrine.add(goat);
    goats.push(goat);
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
    new THREE.CylinderGeometry(4.4, 1.6, 24.5, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff3cf, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  beam.position.y = 12.25;
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
    // Cone silhouette helper — main.js uses it to keep the chase camera
    // outside the solid mountain (the cinematic overrides bypass it).
    coneRadiusAt: (y) => coneRadiusAt(y, MOUNT),
    t: 0,
    entered: false,   // set once the car gets within 12 units of the shrine
    light: mysteryLight,
    orb,
    beam,
    candleMat,
    flare: 1,   // mystery-light surge (1 = calm) driven by the chamber cinematic
    // Idea #24 — interactive shrine: the man's arms and the two goats react to
    // the car arriving, honking or idling in the chamber.
    armR: manArmR,
    armL: manArmL,
    goats,
    react: 0,       // smoothed excitement 0..1 (raised arms / turned goats)
    reactT: 0,      // seconds of reaction left
    armRaise: 0,    // smoothed arm lift (radians)
    idle: 0,        // smoothed "car idling in the chamber" 0..1
    honkPulse: 0,   // short flourish after a honk (H), for a little arm wave
    honk() { this.reactT = Math.max(this.reactT, 2.2); this.honkPulse = 1; },
  };

  const glassCity = addGlassCity(parent, {
    // Idea #25: a crystal cluster popping when the car runs into it.
    onCrystalPop: typeof opts.onGlassPop === 'function' ? opts.onGlassPop : null,
  });
  const cityGlow = new THREE.PointLight(0x9fb8ff, 2.4, 190, 1);
  cityGlow.position.set(0, 26, 152);
  parent.add(cityGlow);

  // Foreboding sky above the cavern ceiling (dark dome, drifting dark
  // clouds, a scatter of stars, colorful constellations) — visible from the
  // second roof and through crumbled holes. Purely decorative.
  const sky = addUndergroundSky(parent, mergeGeoms);

  const colliders = [...pipePostColliders, ...ceilingColliders, ...stairColliders, ...grandColliders, ...mountColliders, ...statueColliders, ...glassCity.colliders];

  let bumpCount = 0;
  let lastBump = null;
  let elapsed = 0;   // course clock for sine-animated props (conduits, …)
  let prevX = 0, prevY = 0, prevZ = 0, havePrev = false;
  let lastTileIdx = -1;   // checkerboard tile under the car last frame (edge-trigger)

  // Roofline obstacle course finish tracking: `finishCount` counts completed
  // runs, `finishCooldown` stops the fanfare from retriggering every frame
  // while the car sits on the line, and `finishFlash` blazes the FINISH
  // banner's glow on a crossing so the moment reads as a celebration.
  let finishCount = 0;
  let finishCooldown = 0;
  let finishFlash = 0;

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
    STAIRS,      // footprint constants (solid ramp + big flat roof)
    GRAND,       // grand-ramp footprint constants (steeper east twin of the staircase)
    gemstones,   // candy-waterfall gemstone pool (for the ?debug hook)
    beltGems,    // conveyor-candy gem pool (idea #33 follow-up) — ?debug hook
    poleState,   // padded-pole hit counter + last hit info (tasks #31–#32)
    platter: { PLATTER, spin: platterSpin, get gripped() { return platterGripped; } },
    trampolines,   // launch pads (idea #13) — state for the ?debug hook
    conveyor: CONVEYOR,   // giant conveyor lane footprint (idea #33) — ?debug hook
    disco,         // rotating disco ball pendulum state (idea #14)
    glassCrystals: glassCity.crystals,   // Glass City crystal clusters (idea #25)
    glassSpire: glassCity.spire,         // central citadel crystal (idea #25)
    // Idea #29 — landmarks for the minimap so the big dark cavern is navigable.
    mapFeatures: [
      { kind: 'stairs', x: STAIRS.cx, z: STAIRS.cz, r: 12, color: '#8fd0ff', label: 'Stairs' },
      { kind: 'waterfall', x: GRAND.x, z: GRAND.z, r: 10, color: '#ff9a3c', label: 'Waterfall' },
      { kind: 'pole', x: POLE.x, z: POLE.z, r: 5, color: '#ffb84d', label: 'Pole' },
      { kind: 'mountain', x: MOUNT.cx, z: MOUNT.cz, r: 34, color: '#f2f6ff', label: 'Mountain' },
      { kind: 'pit', x: PIT.cx, z: PIT.cz, r: 13, color: '#ffd1dc' },
      { kind: 'platter', x: PLATTER.cx, z: PLATTER.cz, r: PLATTER.r, color: '#ff3fd8' },
      { kind: 'disco', x: DISCO.x, z: DISCO.z, r: 4, color: '#35f0ff' },
      { kind: 'tramp', x: TRAMPOLINES[0].x, z: TRAMPOLINES[0].z, r: 4, color: '#9dff3f' },
      { kind: 'tramp', x: TRAMPOLINES[1].x, z: TRAMPOLINES[1].z, r: 4, color: '#9dff3f' },
      // The serpentine ground-floor obstacle course (2026-09-19): minimap
      // markers for the START banner and the checkered FINISH gate so the
      // winding route is navigable from across the dark cavern.
      { kind: 'course', x: COURSE_START.x, z: COURSE_START.z, r: 9, color: '#9dff3f', label: 'Course start' },
      { kind: 'course', x: COURSE_FINISH_X, z: COURSE_FINISH_Z, r: 9, color: '#ff3fd8', label: 'Course finish' },
    ],
    course: { start: COURSE_START, finishX: COURSE_FINISH_X, finishZ: COURSE_FINISH_Z, finishHalf: COURSE_FINISH_HALF, gates: [], pennants: routePennantWaves.length },
    coursePennants: routePennantWaves.map((w) => w.pennant),   // live pennant meshes (debug hook)
    get finishCount() { return finishCount; },
    stairGhostAt, // task #35: floor-level ghost detection inside the staircase
    stairHeightAt, // bumpy stair pitch — height of the step surface at (x, z)
    holy,        // Holy Mountain live state (mystery-light pulse, entered flag)
    checker,
    statues,     // art deco statues on the ceiling tiles (state machine + colliders)
    // The little follower car knocks statues over too (it drives the same
    // roof the player drives): find a standing statue within tag range of a
    // point, tip it over and drop its collider, same as the player's car tag.
    knockStatueAt: (x, z, spd) => {
      for (const s of statues) {
        if (s.state !== 'standing') continue;
        const tdx = s.x - x, tdz = s.z - z;
        const tagR = s.half + 2.6;
        if (tdx * tdx + tdz * tdz < tagR * tagR) {
          startStatueFall(s, Math.atan2(tdz, tdx));
          if (onStatueTopple) onStatueTopple(s.x, s.z, spd);
          return true;
        }
      }
      return false;
    },
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
      // visit, not every frame while the car sits on it. A per-tile cooldown
      // stops the same pass (front wheels then back wheels, or a boundary
      // jitter) from advancing a tile twice — the car must drive away and
      // come back before the tile can change color again.
      if (player) {
        checker.tick++;
        // Tick down tile advance cooldowns so a tile can be re-triggered
        // once the car has driven away and come back.
        for (let i = 0; i < tileCount; i++) {
          if (checkerCooldown[i] > 0) checkerCooldown[i] -= delta;
        }
        // Only advance tiles when the car is actually driving ON the ceiling
        // (the "second roof", top face at CEIL_Y + 1.3) — not when it's on
        // the cavern floor underneath, even though the same x/z maps to a
        // ceiling tile.
        const onCeiling = player.y > CEIL_Y + 0.5;
        const tx = onCeiling ? Math.floor((player.x - ceilMinX) / TILE_SZ) : -1;
        const tz = onCeiling ? Math.floor((player.z - gridZ0) / TILE_SZ) : -1;
        if (tx >= 0 && tx < tilesX && tz >= 0 && tz < tilesZ) {
          const idx = tz * tilesX + tx;
          if (idx !== lastTileIdx) {
            lastTileIdx = idx;
            const st = checkerState[idx];
            if (st < 2 + CHECKER_NEON.length - 1 && checkerCooldown[idx] <= 0) {   // not yet red, cooldown expired
              // Advance one step: dark (0/1) → cyan (2), then cyan → lime →
              // amber → magenta → red. The two dark shades share a single
              // first step, so the SECOND drive-over is the green (lime)
              // that spreads blue to its neighbors.
              const newSt = setOrBump(idx, 2);
              // The color the tile just turned into radiates a wave outward
              // in concentric rings — each ring bumps its tiles toward a
              // target color (or up one step if already at/past it), so the
              // pattern expands outward:
              //   green  → touching tiles turn green
              //   orange → touching tiles turn orange, ring beyond turns blue
              //   magenta→ touching tiles turn orange, ring beyond green,
              //             ring beyond blue (a big circle around the tile)
              //   red    → same big circle as magenta
              if (newSt === 2 + 1) {
                spreadRings(idx, [3]);
              } else if (newSt === 2 + 2) {
                spreadRings(idx, [4, 2]);
              } else if (newSt === 2 + 3) {
                spreadRings(idx, [4, 3, 2]);
              } else if (newSt >= 2 + CHECKER_NEON.length - 1) {
                spreadRings(idx, [4, 3, 2]);
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
              // Hide this tile's backing patch so the fresh hole shows the
              // cavern below (not the old flat black backing layer).
              _v3a.set(0, -100, 0);
              _tileMat.compose(_v3a, _quat.identity(), _v3b.set(0.001, 0.001, 0.001));
              ceilingBacks.setMatrixAt(i, _tileMat);
              ceilingBacks.instanceMatrix.needsUpdate = true;
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
      // Art Deco statues: while standing, their glowing rings slowly spin
      // around the body. The moment the tile a statue stands on crumbles
      // into a hole (holeTiles flips on as the tile starts falling away),
      // the statue loses its footing — it leans over and falls to the
      // cavern floor below, drifting a little in its tip direction.
      for (const s of statues) {
        if (s.state === 'standing') {
          s.ringGroup.rotation.y += delta * 0.5;
          // Idea #31 — car tag: a fast car driving across the roof can knock a
          // statue off its plinth (not just a crumbling tile). The statue tips
          // away from the impact, and the solid collider is dropped so the car
          // drives on through where it stood.
          if (player && player.y > TILE_TOP - 1.6) {
            const tdx = s.x - player.x;
            const tdz = s.z - player.z;
            const tagR = s.half + 2.6;
            if (tdx * tdx + tdz * tdz < tagR * tagR) {
              const spd = havePrev
                ? Math.hypot(player.x - prevX, player.z - prevZ) / Math.max(delta, 1e-4)
                : 0;
              if (spd > 4) {
                startStatueFall(s, Math.atan2(tdz, tdx));
                if (onStatueTopple) onStatueTopple(s.x, s.z, spd);
              }
            }
          }
          if (s.state === 'standing' && holeTiles[s.idx]) {
            // The tile underneath has crumbled away — the statue loses its
            // footing and topples in its pre-rolled random direction.
            startStatueFall(s, s.tipAngle);
          }
        } else if (s.state === 'falling') {
          s.fallT += delta;
          const t = Math.min(1, s.fallT / STATUE_FALL_DUR);
          // Lean: tip over fast at first (ease-out), past horizontal so it
          // lands on its side.
          const lean = easeOutCubic(t) * (Math.PI / 2 + 0.25);
          // Fall: accelerate down to the cavern floor (ease-in), drifting a
          // couple of units in the tip direction as it topples.
          const groundY = 0.5;
          const drop = easeInQuad(t);
          s.group.quaternion.setFromAxisAngle(s.tipAxis, lean);
          s.group.position.set(
            s.x + Math.cos(s.tipAngle) * drop * 2.2,
            TILE_TOP + (groundY - TILE_TOP) * drop,
            s.z + Math.sin(s.tipAngle) * drop * 2.2
          );
          if (t >= 1) s.state = 'landed';
        }
      }
      // Ground-floor FINISH: crossing the FINISH banner's plane on the cavern
      // floor, over its z-span, completes a run — fanfare from the caller plus
      // a quick blaze on the FINISH banner so the moment reads as a
      // celebration. A short cooldown stops the same crossing retriggering.
      if (finishCooldown > 0) finishCooldown -= delta;
      if (finishFlash > 0) finishFlash = Math.max(0, finishFlash - delta);
      if (finishGate.mat) {
        finishGate.mat.emissiveIntensity = 0.55 + finishFlash * 3.4;
      }
      if (player && havePrev && player.y < 3 && finishCooldown <= 0) {
        if (Math.abs(player.z - COURSE_FINISH_Z) <= COURSE_FINISH_HALF
          && prevX < COURSE_FINISH_X && player.x >= COURSE_FINISH_X) {
          finishCooldown = 4.0;
          finishFlash = 0.85;
          finishCount += 1;
          if (onFinishLine) onFinishLine(player.x, player.z);
        }
      }
      // Course pennants flutter in the breeze.
      for (const w of routePennantWaves) {
        w.pennant.rotation.y = Math.sin(elapsed * 3.2 + w.phase) * 0.22;
      }
      // Spiral-tunnel mouth weather: roll the cloud bank lazily and pulse the
      // fog haze so the tunnel top reads as living cloud, not a static plug.
      if (spiralMouth) {
        spiralMouth.group.rotation.y = Math.sin(elapsed * 0.07) * 0.15;
        spiralMouth.group.position.y = 0.35 * Math.sin(elapsed * 0.5);
        for (const h of spiralMouth.haze) {
          h.sprite.material.opacity = 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(elapsed * 0.7 + h.phase));
        }
      }
      // Task #12: slide each conduit back and forth across its lane on a
      // sine of elapsed time — phase/speed are stored per pipe so placed
      // pipes run out of sync with each other.
      // Task #13: when a conduit overlaps the car near bumper height, fire
      // onPipeShove with the pipe's current travel direction (analytic
      // derivative of the sine slide). A short per-pipe cooldown keeps one
      // sweep from firing every frame while the car sits in the overlap.
      for (const p of conduitPipes) {
        if (p.pattern === 'guillotine') {
          // Vertical slam: bar rides a sine between PIPE_Y and PIPE_Y + amp.
          // Only a descending bar shoves (vel < 0), and it flings the car out
          // of the lane along the bar's perpendicular (±Z here).
          const gy = PIPE_Y + p.amp * (0.5 + 0.5 * Math.sin(elapsed * p.speed + p.phase));
          p.mesh.position.set(p.cx, gy, p.cz);
          if (p.hitCooldown > 0) p.hitCooldown -= delta;
          const gvel = Math.cos(elapsed * p.speed + p.phase) * p.amp * p.speed * 0.5;
          if (player && onPipeShove && p.hitCooldown <= 0 && gvel < -0.5
            && Math.abs(player.x - p.cx) < p.len / 2 + 2.2
            && Math.abs(player.z - p.cz) < PIPE_R + 2.2
            && gy - PIPE_R < player.y + 2.0 && gy + PIPE_R > player.y) {
            p.hitCooldown = 0.8;
            p.hitCount += 1;
            onPipeShove(0, Math.sign(player.z - p.cz) || 1);
          }
          continue;
        }
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
      // Giant conveyor lane (idea #33): scroll the chevrons and, while the car
      // is over the belt near floor level, add its drag on top of the car's
      // own motion.
      beltTex.offset.x -= CONVEYOR.dirX * CONVEYOR.speed * delta / 6;
      beltTex.offset.y += CONVEYOR.dirZ * CONVEYOR.speed * delta / 6;
      if (player
        && Math.abs(player.x - CONVEYOR.cx) < CONVEYOR.len / 2
        && Math.abs(player.z - CONVEYOR.cz) < CONVEYOR.wid / 2
        && player.y < 1.5) {
        player.x += CONVEYOR.dirX * CONVEYOR.speed * delta;
        player.z += CONVEYOR.dirZ * CONVEYOR.speed * delta;
      }
      // Rotating platter: carry any car on the disk around the hub in a
      // circle — in the SAME direction (+rotation.y) the disk texture spins,
      // so the car reads as sitting on the turntable. A small outward creep
      // (weak at the hub, strong at the rim) means an unsteered car always
      // drifts to the edge; the instant the grip ends the car is flung off
      // along the tangent of its exit point.
      if (player) {
        const pdx = player.x - PLATTER.cx;
        const pdz = player.z - PLATTER.cz;
        const pd = Math.hypot(pdx, pdz);
        const gripped = pd < PLATTER.r - 0.5 && player.y > -0.5 && player.y < PLATTER.h + 3;
        if (gripped) {
          const ang = PLATTER.spin * delta;
          const cos = Math.cos(ang), sin = Math.sin(ang);
          const rx = pdx * cos + pdz * sin;
          const rz = -pdx * sin + pdz * cos;
          const slip = PLATTER.slip * (0.35 + 0.65 * (pd / PLATTER.r)) * delta;
          const scale = pd > 1e-4 ? (pd + slip) / pd : 1;
          player.x = PLATTER.cx + rx * scale;
          player.z = PLATTER.cz + rz * scale;
        } else if (platterGripped && onPlatterEject && pd < PLATTER.r + 2) {
          // Grip just ended: throw the car along the +spin tangent, scaled by
          // how fast the platter was carrying it (the exit footspeed).
          const tlen = Math.hypot(pdz, -pdx) || 1;
          const speed = Math.hypot(player.x - prevX, player.z - prevZ) / Math.max(delta, 1e-4);
          onPlatterEject(pdz / tlen, -pdx / tlen, Math.min(1, Math.max(0.15, speed / PLATTER.r)));
        }
        platterGripped = gripped;
      }
      platterSpin.t += PLATTER.spin * delta;
      platterSpin.disk.rotation.y = platterSpin.t;
      // Trampoline pads: a grounded car rolling over one fires the big upward
      // launch (onTrampoline). The pad visibly squashes and flashes, then
      // springs back, and a short cooldown stops a re-trigger on the rebound.
      for (const T of trampolines) {
        if (T.cd > 0) T.cd -= delta;
        if (T.squash > 0) {
          T.squash = Math.max(0, T.squash - delta / 0.35);
          const s = Math.sin(T.squash * Math.PI);
          T.base.scale.y = 1 - 0.55 * s;
          T.ring.scale.setScalar(1 + 0.16 * s);
          T.glow.intensity = 3 + 8 * s;
        }
        if (player && onTrampoline && T.cd <= 0) {
          const dx = player.x - T.x;
          const dz = player.z - T.z;
          if (dx * dx + dz * dz <= (T.r + 1.6) * (T.r + 1.6) && player.y > -0.5 && player.y < 1.6) {
            T.cd = 1.0;
            T.squash = 1;
            onTrampoline();
          }
        }
      }
      // Disco ball: damped pendulum swing on two axes + constant spin. Fly
      // into the ball and it takes an impulse in the car's travel direction.
      disco.cd = Math.max(0, disco.cd - delta);
      disco.vx += -disco.ax * 5.0 * delta;
      disco.vz += -disco.az * 5.0 * delta;
      const discoDamp = Math.exp(-1.5 * delta);
      disco.vx *= discoDamp;
      disco.vz *= discoDamp;
      disco.ax += disco.vx * delta;
      disco.az += disco.vz * delta;
      discoPivot.rotation.z = disco.ax;
      discoPivot.rotation.x = disco.az;
      disco.spin += DISCO.spin * delta;
      discoSpin.rotation.y = disco.spin;
      if (player) {
        const bx = DISCO.x + Math.sin(disco.ax) * DISCO.len;
        const bz = DISCO.z + Math.sin(disco.az) * DISCO.len;
        const by = DISCO.topY - Math.cos(disco.ax) * Math.cos(disco.az) * DISCO.len;
        const hdx = player.x - bx, hdy = player.y - by, hdz = player.z - bz;
        if (disco.cd <= 0 && player.y > 2 && hdx * hdx + hdy * hdy + hdz * hdz <= DISCO.hitR * DISCO.hitR) {
          disco.cd = 0.4;
          disco.hits += 1;
          const hl = Math.max(0.001, Math.hypot(hdx, hdz));
          disco.vx += (hdx / hl) * 1.8;
          disco.vz += (hdz / hl) * 1.8;
        }
      }
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
      // Conveyor candy (idea #33): spawn gems at the belt's upstream end,
      // carry them downstream with the scrolling belt, and scatter them off
      // when the car drives through. Recycle over the downstream end.
      beltGemTimer -= delta;
      let beltBurst = 0;
      while (beltGemTimer <= 0 && beltBurst < 6) {
        beltGemTimer += 1.4;
        beltBurst++;
        spawnBeltGem();
        if (Math.random() < 0.5) spawnBeltGem();
      }
      for (const b of beltGems) {
        if (!b.active) continue;
        if (b.knocked) {
          b.vy -= GEM_GRAVITY * delta;
          b.x += b.vx * delta;
          b.y += b.vy * delta;
          b.z += b.vz * delta;
          b.mesh.rotation.x += b.spin * delta;
          b.mesh.rotation.z += b.spin * 0.6 * delta;
          if (b.y <= 0.2) { recycleBeltGem(b); continue; }
        } else {
          b.x += CONVEYOR.speed * delta;
          b.y += Math.sin(b.bob + elapsed * 3) * 0.6 * delta;
          b.mesh.rotation.x += 0.3 * delta;
          b.mesh.rotation.y += b.spin * delta;
          if (b.x >= CONVEYOR.cx + CONVEYOR.len / 2) { recycleBeltGem(b); continue; }
          if (player && player.y < 1.5) {
            const dx = b.x - player.x;
            const dz = b.z - player.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < GEM_KNOCK_RADIUS * GEM_KNOCK_RADIUS) {
              const d = Math.sqrt(d2) || 1;
              b.knocked = true;
              b.vx = (dx / d) * knockSpeed + 2;
              b.vy = 3 + Math.random() * 3;
              b.vz = (dz / d) * knockSpeed;
              b.spin = (Math.random() - 0.5) * 12;
            }
          }
        }
        b.mesh.position.set(b.x, b.y, b.z);
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
      // Idea #24 — interactive shrine. The car arriving, honking (H) or idling
      // in the chamber wakes the man (arms raised in blessing) and turns the
      // goats to face it; the oculus beam pulses with the idle.
      const shrineDx = player ? player.x - MOUNT.cx : 99;
      const shrineDz = player ? player.z - MOUNT.cz : 99;
      const shrineD = Math.hypot(shrineDx, shrineDz);
      const inChamber = player && shrineD < 15;
      if (inChamber && (carSpeed < 3 || shrineD < 9)) holy.reactT = Math.max(holy.reactT, 0.6);
      if (holy.reactT > 0) holy.reactT -= delta;
      if (holy.honkPulse > 0) holy.honkPulse = Math.max(0, holy.honkPulse - delta / 0.5);
      const reactTarget = holy.reactT > 0 || holy.honkPulse > 0 ? 1 : 0;
      holy.react += (reactTarget - holy.react) * Math.min(1, delta * 4);
      const raiseTarget = 0.12 + holy.react * 2.5;
      holy.armRaise += (raiseTarget - holy.armRaise) * Math.min(1, delta * 5);
      holy.armR.rotation.z = -holy.armRaise - holy.honkPulse * 0.3 * Math.sin(holy.t * 24);
      holy.armL.rotation.z = holy.armRaise * 0.8;
      // Goats pivot to face the car while it's in the chamber, else drift back
      // to their outward resting pose.
      const goatFace = Math.atan2(shrineDx, shrineDz) - shrine.rotation.y;
      const wrapA = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      for (const goat of holy.goats) {
        const target = inChamber ? goatFace + goat.userData.side * -0.4 : goat.userData.baseRot;
        goat.rotation.y += wrapA(target - goat.rotation.y) * Math.min(1, delta * 3);
        goat.position.y = 0.7 + 0.06 * Math.sin(holy.t * 4 + goat.userData.side) * holy.react;
      }
      const idleTarget = inChamber && carSpeed < 3 ? 1 : 0;
      holy.idle += (idleTarget - holy.idle) * Math.min(1, delta * 2.5);
      const idlePulse = 0.5 + 0.5 * Math.sin(holy.t * (2.2 + 3.5 * holy.idle));
      holy.light.intensity = (1.7 + 0.9 * Math.sin(holy.t * 1.6)) * holy.flare + 2.4 * holy.idle * idlePulse;
      holy.orb.position.y = 6.2 + 0.35 * Math.sin(holy.t * 0.9) + 0.2 * holy.idle * idlePulse;
      holy.orb.scale.setScalar(1 + 0.18 * holy.idle * idlePulse);
      holy.beam.material.opacity = (0.11 + 0.04 * Math.sin(holy.t * 1.6 + 1.2)) * holy.flare + 0.13 * holy.idle * idlePulse;
      holy.candleMat.emissiveIntensity = 1.35 + 0.45 * Math.sin(holy.t * 7.3) + 0.2 * Math.sin(holy.t * 13.7 + 1.3) + 1.2 * holy.react;
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
        // Idea #28: kickable foam. When the car drives into a piece, punt it
        // radially away from the car with a small pop so a pile scatters
        // instead of sitting untouched. A short per-piece cooldown keeps a
        // single pass from re-kicking the same ball every frame.
        if (f.nudgeCd > 0) f.nudgeCd -= delta;
        if (player && f.nudgeCd <= 0) {
          const ndx = f.mesh.position.x - player.x;
          const ndz = f.mesh.position.z - player.z;
          const nd2 = ndx * ndx + ndz * ndz;
          const reach = FOAM_R + 2.4;
          if (nd2 < reach * reach && Math.abs(f.mesh.position.y - player.y) < 2.5) {
            const nl = Math.sqrt(nd2) || 0.001;
            const kick = 3 + Math.min(carSpeed, 14) * 0.9;
            f.vx = (ndx / nl) * kick;
            f.vz = (ndz / nl) * kick;
            f.vy = Math.max(f.vy, 3 + Math.min(carSpeed, 14) * 0.35);
            f.bounces += 1;
            f.nudgeCd = 0.25;
          }
        }
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
