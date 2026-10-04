import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addGlassCity } from '../../glasscity.js?v=1790707232562';
// The Holy Mountain: pure layout math (cone profile, spiral road wedges,
// blocker rects) verified by holyMountain.test.mjs — this file turns it into
// meshes and colliders.
import { MOUNT, coneRadiusAt, coneSkinSegments, spiralSegments, mountainBlockers, mouthFrame } from '../../modules/holyMountain.js?v=1790707232976';
// The Pneumatic Express Tube: pure path math (verified by expressTube.test.mjs).
// This file turns the sampled centre line into a glass TubeGeometry and the
// travelling air-jet rings; main.js imports the same module for the forced ride.
import { EXPRESS_TUBE, expressTubeSamples, expressTubePoint, expressTubeTangent } from '../../modules/expressTube.js?v=1790708040365';

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

export async function addUnderground(parent, opts = {}) {
  // Real loader progress: the underground is one enormous synchronous build, so
  // it reports its own internal phases to the caller (opts.onUndergroundPhase)
  // and paints a frame between major sections. Each phase's `frac` is the
  // level's OWN 0..1 scale; main.js maps it onto the loader's global scale.
  const ugPhase = async (frac, label) => {
    if (typeof opts.onUndergroundPhase === 'function') {
      try { opts.onUndergroundPhase(frac, label); } catch (e) {}
    }
    await new Promise((res) => {
      if (window.requestAnimationFrame) window.requestAnimationFrame(() => window.requestAnimationFrame(res));
      else setTimeout(res, 0);
    });
  };
  // Optional callbacks fired from update(): onGemSlam(dirX,dirZ) when the car
  // plows into a large heavy candy gem (dirX/dirZ point back down the grand
  // ramp). Lets the callers own the physics/audio response without the level
  // knowing how.
  // onTrampoline() fires when the car drives onto a launch pad; main.js sets
  // the big vertical launch that throws it onto the second roof.
  const onGemSlam = typeof opts.onGemSlam === 'function' ? opts.onGemSlam : null;
  const onTrampoline = typeof opts.onTrampoline === 'function' ? opts.onTrampoline : null;
  const onStatueTopple = typeof opts.onStatueTopple === 'function' ? opts.onStatueTopple : null;
  const onFinishLine = typeof opts.onFinishLine === 'function' ? opts.onFinishLine : null;
  const onPickerGrab = typeof opts.onPickerGrab === 'function' ? opts.onPickerGrab : null;
  const onBubblePop = typeof opts.onBubblePop === 'function' ? opts.onBubblePop : null;

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2b2627, roughness: 1 });
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x241f20, roughness: 1, side: THREE.DoubleSide });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3434, roughness: 1 });

  const localY = (absY) => absY - UNDERGROUND_Y;

  // ---- Sunken skate plaza: single source of truth ----
  // Everything in the park sits BELOW the y=0 cavern floor: each entry here
  // owns a `hole` polygon that the floor slab is cut open along (so the pit is
  // actually visible/sunken, never a floaty ramp on top), and the build
  // section further down carves the very same polygons into wedge ride
  // surfaces at negative baseY. Nothing — lip, spine, bowl — rises above the
  // floor line. Polygon samples are kept slightly UNDER the rim perimeter so
  // the floor survives as a thin overhang and a car rolling in never floats
  // over a ragged gap.
  const SS = (() => {
    const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const circlePts = (cx, cz, r, n = 22, f = 0.985) => {
      const out = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        out.push([cx + Math.cos(a) * r * f, cz + Math.sin(a) * r * f]);
      }
      return out;
    };
    // Superellipse |x/rx|^p + |z/rz|^p = 1, sampled as an n-gon scaled by f.
    const superPts = (cx, cz, rx, rz, p, n, f = 0.98) => {
      const out = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const sc = Math.pow(Math.abs(ca / rx), p) + Math.pow(Math.abs(sa / rz), p);
        const s = 1 / Math.pow(sc, 1 / p);
        out.push([cx + ca * s * f, cz + sa * s * f]);
      }
      return out;
    };
    // Compact 2026-09-25: the whole park lives in one south-west cluster
    // (x −144..−40, z −96..−42), each pit spaced ~3–10 units from its
    // neighbours so every rim is a drivable drop-in. The giant halfpipe sits
    // EAST in the corridor BETWEEN the neon staircase (west foot x=−56) and
    // the cave walls, with open floor on both sides of it; the other eleven
    // features scatter toward the south-west corner around it.
    // The relocated giant halfpipe, fully sunken (lips at y=0, trough −16.5).
    const pipe = {
      cx: -100, cz: -78, len: 34, bottomHalf: 8, wallRun: 0.35, wallRise: 8.5,
      wallThick: 0.9,
      launch: 2.0,   // the giant pipe's vert-pop is ~2x the default (the rocket)
      hole: rect(-108.35, -95, -91.65, -61),
    };
    // Mini vert pipe (sunken) — a second, tighter fullpipe.
    const vert = {
      cx: -136, cz: -88, len: 10, bottomHalf: 4, wallRun: 0.3, wallRise: 6,
      wallThick: 0.6,
      hole: rect(-140.3, -93, -131.7, -83),
    };
    // Spine: a V-trench carved along X with its crease 6 below the floor.
    const spine = {
      cx: -123, cz: -60, width: 10, tipBoost: 1.0,
      prof: [[-129, 0], [-123, -6], [-117, 0]],
      hole: rect(-129, -65, -117, -55),
    };
    // Hip: two quarter-walls meeting at an inner corner over a deep well.
    const hip = { cx: -78, cz: -52, hole: rect(-83, -57, -73, -47) };
    // Eurobox: drop-in arc → flat run → step-up shelf → exit lip, along X.
    const euro = {
      cx: -70, cz: -88, width: 10, tipBoost: 1.2,
      prof: [[-77, 0], [-76, -1.9], [-75, -3.6], [-74, -5.0], [-73, -5.8], [-72, -6.1], [-69, -6], [-67, -3.6], [-65.4, -1.8], [-64, -0.6], [-63, 0]],
      hole: rect(-77, -93, -63, -83),
    };
    // Pyramid: a near-square (p=14) funnel crater, 7 below the floor. Sat
    // south-east of the rail, clear of the neon staircase footprint (x∈[−56,12],
    // z∈[−56,−44]) with a wide drive gap on every side.
    const pyramid = {
      cx: -30, cz: -72, rx: 7, rz: 7, p: 14, depth: 7, tIn: 0.1714,
      bands: 4, sectors: 16, rimBoost: 0.8, padY: -5.8, padHalf: 1.3,
      hole: superPts(-30, -72, 7, 7, 14, 20),
    };
    // Foam pit: a wide round pool (soft vinyl bottom) with an inner kicker.
    const foam = {
      cx: -120, cz: -84, rx: 8, rz: 8, p: 2, depth: 3.3, tIn: 0.7375,
      bands: 4, sectors: 16, rimBoost: 0.9, padY: -3.31, padHalf: 6.2,
      hole: circlePts(-120, -84, 8),
    };
    // Escalator: stepped flights buried north-south, exit ramp downhill.
    const escalator = {
      cx: -84, cz: -66, width: 8, tipBoost: 1.2,
      prof: [[-74, 0], [-72.6, -1.9], [-71.4, -3.0], [-70.8, -3.0], [-70.7, -3.8], [-69.4, -3.8], [-69.3, -4.6], [-68, -4.6], [-67.9, -5.4], [-66.6, -5.4], [-66.5, -6.2], [-65.2, -6.2], [-64, -4.6], [-62.8, -3.0], [-61.6, -1.5], [-60.6, -0.6], [-58, 0]],
      hole: rect(-88, -74, -80, -58),
    };
    // Cradle: a perfect spherical bowl, rim flush at the floor. The magenta
    // rim no longer boosts (was rocket-launching on a simple dip) — the big
    // vert-pop now lives on the giant halfpipe instead.
    const cradle = {
      cx: -138, cz: -60, rx: 6, rz: 6, p: 2, depth: 6, tIn: 0.15, depth2: 6,
      bands: 6, sectors: 16, rimBoost: 0, padY: -5.94, padHalf: 1.1,
      hole: circlePts(-138, -60, 6),
    };
    // Kidney: a mellow shallow superellipse bowl.
    const kidney = {
      cx: -58, cz: -72, rx: 6.5, rz: 5, p: 2.4, depth: 3.5, tIn: 0.55,
      bands: 4, sectors: 16, rimBoost: 0.9, padY: -1.575, padHalfX: 4.05, padHalfZ: 3.1,
      hole: superPts(-58, -72, 6.5, 5, 2.4, 22),
    };
    // Kinked rail slot: a narrow north-south trench parked south-east of the
    // eurobox (prof is along Z, so addTrench is called with axisZ=true).
    const rail = {
      cx: -44, cz: -78, width: 2.4, tipBoost: 1.0,
      prof: [[-86, 0], [-85, -1.9], [-84, -3.0], [-79, -3.2], [-75, -3.2], [-74, -2.4], [-73.2, -1.5], [-72.4, -0.7], [-71.6, -0.2], [-70, 0]],
      hole: rect(-45.2, -86, -42.8, -70),
    };
    return {
      pipe, vert, spine, hip, euro, pyramid, foam, escalator, cradle, kidney, rail,
      holes: [pipe.hole, vert.hole, spine.hole, hip.hole, euro.hole, pyramid.hole,
        foam.hole, escalator.hole, cradle.hole, kidney.hole, rail.hole],
    };
  })();

  // Cavern floor: the whole slab is a 1970s vinyl kitchen floor. The pattern
  // tiles every VINYL_TILE units across the 292×276 slab. The slab is drawn
  // as a shape with every sunken-park pit punched out as a hole (SS.holes), so
  // the pits read as carved openings at floor level. The top face spans the
  // full UV range over the same slab bounds, so the tile repeat is unchanged.
  const vinylTex = makeVinylFloorTexture();
  vinylTex.repeat.set(292 / VINYL_TILE, 276 / VINYL_TILE);
  const vinylMat = new THREE.MeshStandardMaterial({
    map: vinylTex, roughness: 0.55, metalness: 0, side: THREE.DoubleSide,
  });
  let plain;
  {
    const outline = new THREE.Shape();
    outline.moveTo(-146, -96.5);
    outline.lineTo(146, -96.5);
    outline.lineTo(146, 179.5);
    outline.lineTo(-146, 179.5);
    outline.closePath();
    for (const poly of SS.holes) {
      const hp = new THREE.Path();
      hp.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) hp.lineTo(poly[i][0], poly[i][1]);
      hp.closePath();
      outline.holes.push(hp);
    }
    const geo = new THREE.ShapeGeometry(outline, 1);
    // ShapeGeometry bakes raw local coords into UVs (x/y in world units), so
    // the vinyl repeat would stretch to one tile per 146 world units instead
    // of per 2. Overwrite UVs with the normalized 0..1 slab space so the
    // kitchen pattern tiles exactly like the old box floor (repeat 146×138).
    {
      const pos = geo.attributes.position;
      const uvs = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uvs[i * 2] = (pos.getX(i) + 146) / 292;
        uvs[i * 2 + 1] = (pos.getY(i) + 96.5) / 276;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    plain = new THREE.Mesh(geo, vinylMat);
    plain.rotation.x = Math.PI / 2;      // shape (x,y) → world (x,z)
    plain.position.set(0, -0.02, 0);     // top face flush with the old slab top
    plain.receiveShadow = true;
    parent.add(plain);
  }

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

  await ugPhase(0.08, 'the spiral tunnel');

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
  // Per-car pacing for the trailing train cars: the global per-tile cooldown
  // above would otherwise starve every car behind the loco (they arrive within
  // a second of it and find each tile still locked). Instead each car guards
  // only ITS OWN triggers — move onto a tile, trigger, then wait this long
  // before that same car may trigger again (kills boundary-jitter re-dips
  // without blocking the next freight car behind it).
  const TRAIN_TILE_GUARD = 0.4;
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
  const _ringZ = new THREE.Vector3(0, 0, 1);   // torus hole axis (identity)
  const _ringT = new THREE.Vector3(0, 0, 1);   // tube tangent temp (re-set per ring)
  const _ringQuat = new THREE.Quaternion();    // per-ring orientation
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

  await ugPhase(0.2, 'the colorful ceiling tiles');

  // Dim neon PointLights along the course zone: enough colored light for the
  // glowing props to read against dark rock, but short-range and dim so they
  // never wash out the cool Glass City glow to the north. Each light gets a
  // small emissive bulb so its source is visible in the cavern.
  const courseLights = [
    { color: NEON.lime,    x: -6,   z: 84,  y: 12 },  // tundra straight under the START arch
    { color: NEON.magenta, x: 6,    z: 60,  y: 12 },  // south leg — west flank of the candy waterfall
    { color: NEON.cyan,    x: 26,   z: 40,  y: 12 },  // BEHIND the waterfall, under the roof edge
    { color: NEON.amber,   x: 44,   z: -60, y: 12 },  // under-roof corridor south
    { color: NEON.magenta, x: 88,   z: -84, y: 12 },  // bottom run
    { color: NEON.lime,    x: 116,  z: -26, y: 12 },  // east-wing ramp-canyon apex
    { color: NEON.cyan,    x: 116,  z: 24,  y: 12 },  // platter straight
    { color: NEON.amber,   x: 66,   z: 40,  y: 12 },  // under-roof west transit
    { color: NEON.magenta, x: -60,  z: -70, y: 12 },  // descent across the south-west tundra
    { color: NEON.lime,    x: -100, z: -70, y: 12 },  // final northbound straight (toward the mountain)
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

  await ugPhase(0.28, 'the course ramps');

  // ---- Giant conveyor lane (idea #33) — now part of the obstacle course ----
  // A long moving belt SITTING RIGHT ON the eastbound z=0 guide lane
  // (x∈[41,107]). The green guide dots lead the car up to it, the belt carries
  // you across the machine shop, and the dots pick up on the far side. The belt
  // now extends all the way UNDER the steam press at x=108 — if you do nothing,
  // it carries you under the press head (the slam zone is |x−108| < 6.7 and the
  // belt tips over at x=107) and you get stamped flat. The chevron texture
  // scrolls to sell the motion; direction is +X here, but dirX/dirZ keep it
  // swappable.
  const CONVEYOR = { cx: 74, cz: 0, len: 66, wid: 9, dirX: 1, dirZ: 0, speed: 6 };
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
  // The motor-cylinder housing at the belt's downstream end was REMOVED
  // (2026-09-22) at the user's request — the belt just scrolls off into the
  // frame.

  // ---- Articulated robot picker beside the conveyor (2026-09-22) ----
  // One pick-and-place robot on the belt's SOUTH flank (on the belt's WEST
  // end, so it meets cars as they're carried in), swinging its two-segment arm
  // across the lane and HAMMERING a giant mechanical claw down into the belt.
  // The claw hangs wide open while the arm raises, then SNAPS SHUT the instant
  // the arm bottoms out — and if a car is under it the clamp genuinely SHOVES
  // the car off the belt (onPickerGrab), as if the machine is really trying to
  // grab it. A soft pad under the claw still gives cars on the belt a bump.
  // The shell is OPAQUE (no ghost transparency) and compact — the arm hunkers
  // over the belt instead of towering: the ONLY device collider is the tiny
  // soft pad under the claw, so the rest of the machine stays ghostly and the
  // lane stays navigable.
  const conveyorPicker = { t: 0, pad: null, shoulder: null, elbow: null, wrist: null, level: null, jawL: null, jawR: null, grabbed: false };
  const pickerMat = new THREE.MeshStandardMaterial({
    color: 0x2fc79a, roughness: 0.4, metalness: 0.65,
    emissive: 0x0e6a4e, emissiveIntensity: 0.85,
  });
  {
    // Bolted base plate + turret standing on the south flank (z=6.0, just past
    // the belt rails at z=±4.85), short so the whole robot stays compact.
    const base = new THREE.Group();
    base.position.set(CONVEYOR.cx - CONVEYOR.len / 2 + 4, 0, 6.0);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 3.6), pickerMat);
    plate.position.y = 0.11;
    base.add(plate);
    const boltGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.32, 10);
    for (const [bx, bz] of [[-1.2, -1.45], [1.2, -1.45], [-1.2, 1.45], [1.2, 1.45]]) {
      const bolt = new THREE.Mesh(boltGeo, pickerMat);
      bolt.position.set(bx, 0.34, bz);
      base.add(bolt);
    }
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.9, 16), pickerMat);
    turret.position.y = 0.6;
    base.add(turret);
    const turretGlow = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 20), makeGlowMat(NEON.cyan));
    turretGlow.rotation.x = Math.PI / 2;
    turretGlow.position.y = 1.05;
    base.add(turretGlow);
    parent.add(base);
    // Shoulder joint on top of the turret — rotates about Y to swing the arm
    // across the lane.
    const shoulder = new THREE.Group();
    shoulder.position.y = 1.1;
    base.add(shoulder);
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7), pickerMat);
    upperArm.position.y = 1.1;
    shoulder.add(upperArm);
    const shoulderGlow = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 20), makeGlowMat(NEON.lime));
    shoulderGlow.rotation.x = Math.PI / 2;
    shoulderGlow.position.y = 0.04;
    shoulder.add(shoulderGlow);
    // Elbow joint — pitches the forearm over and DOWN into the belt (negative
    // rotation.x folds the arm from the south flank so the claw swings north
    // across the lane).
    const elbow = new THREE.Group();
    elbow.position.y = 2.2;
    shoulder.add(elbow);
    // Forearm is LONG so the folded reach carries the pincers halfway across
    // the belt (belt z∈[−4.5,4.5]). The wrist top now stands ~4.8 above the
    // elbow, and the dive folds that long stick over and down over the lane.
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.8, 0.6), pickerMat);
    forearm.position.y = 2.4;
    elbow.add(forearm);
    const elbowGlow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 18), makeGlowMat(NEON.cyan));
    elbowGlow.rotation.x = Math.PI / 2;
    elbow.add(elbowGlow);
    // Wrist + GIANT mechanical pincers: two big tapered steel claws that hang
    // from the wrist and OPEN/CLOSE about Z (spread wide across the lane, then
    // SNAP SHUT as the arm hammers down) like it's really trying to grab the
    // car. Each jaw is a tapered beam with a serrated grip edge and a hooked
    // pointy tip. When the jaws shut WHILE THE CAR IS UNDER THEM, a genuine
    // onPickerGrab() shove fires — the machine actually hits the car now.
    const wrist = new THREE.Group();
    wrist.position.y = 4.8;
    elbow.add(wrist);
    // Leveling clamp: the elbow folds the forearm over and DOWN past vertical
    // near the bottom of the dive, which would otherwise swing the claw blades
    // up-and-south onto the robot's own arm (the claws "grab the machine").
    // This counter-rotating group undoes the fold so the two claws keep
    // pointing straight down at the BELT the whole cycle — they hammer down
    // over the car that's passing on the belt instead of curling back on the
    // robot. The update loop sets clawLevel.rotation.x against the elbow.
    const clawLevel = new THREE.Group();
    clawLevel.rotation.x = 0;
    wrist.add(clawLevel);
    // Knuckle block bolting both jaws to the leveling clamp.
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.1), pickerMat);
    knuckle.position.y = -0.22;
    wrist.add(knuckle);
    const knuckleCap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 1.1), makeGlowMat(NEON.lime));
    knuckleCap.position.y = -0.5;
    wrist.add(knuckleCap);
    // One steel jaw. `side` (+1 / -1) sets which claw it is: the pincer tips
    // hang straight down at rotation 0 (JUST about to clamp); opening rotation
    // swings the tip out sideways so the pair gapes wide over the belt.
    const jawMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a2f, roughness: 0.35, metalness: 0.85,
      emissive: 0x0e6a4e, emissiveIntensity: 0.7,
    });
    function buildJaw(side) {
      const jaw = new THREE.Group();
      jaw.position.x = side * 0.85;
      jaw.rotation.z = side * 0.72;           // rest: slightly open
      // Tapered chain of boxes down the jaw, widest near the knuckle and
      // pinching to a hooked point at the tip (~1.8 long when open).
      const seg = (w, len, y, opt) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.62), jawMat);
        mesh.position.y = y;
        jaw.add(mesh);
        return mesh;
      };
      seg(0.82, 0.62, -0.86);                  // thick shoulder
      seg(0.64, 0.62, -1.47);                  // mid claw
      seg(0.44, 0.56, -2.04);                  // taper
      const tip = seg(0.2, 0.5, -2.55);        // pointy tip
      tip.rotation.x = -0.35;                  // hook the tip slightly inward
      // Serrated grip edge down the outside of the claw.
      const gripGeo = new THREE.BoxGeometry(0.13, 2.0, 0.7);
      const grip = new THREE.Mesh(gripGeo, pickerMat);
      grip.position.set(side * 0.4, -1.5, 0);
      jaw.add(grip);
      // Glowing bite-edge on the inside face (where the two claws meet).
      const bite = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.5), makeGlowMat(NEON.cyan));
      bite.position.set(side * -0.3, -1.5, 0);
      jaw.add(bite);
      clawLevel.add(jaw);
      return jaw;
    }
    const jawL = buildJaw(-1);
    const jawR = buildJaw(1);
    jawL.rotation.z = -1.2;                    // built open; update() walks them
    jawR.rotation.z = 1.2;
    shoulder.rotation.y = -0.15;
    elbow.rotation.x = -0.6;
    wrist.rotation.x = 0.1;
    conveyorPicker.shoulder = shoulder;
    conveyorPicker.elbow = elbow;
    conveyorPicker.wrist = wrist;
    conveyorPicker.level = clawLevel;
    conveyorPicker.jawL = jawL;
    conveyorPicker.jawR = jawR;
  }
  // The picker's only collider: a soft pad hanging under the claw. The update
  // loop nudges it to follow the wrist and lifts it when the claw dives low, so
  // a car rolling under a "grab" gets a gentle bump instead of being crushed or
  // picked up.
  const pickerPadColliders = [{ x: CONVEYOR.cx, z: CONVEYOR.cz, halfW: 2.0, halfD: 1.5, h: 0, soft: true }];
  conveyorPicker.pad = pickerPadColliders[0];

  // ---- Factory machinery on the course (2026-09-22) ----
  // The serpentine course now crosses a factory floor: spinning gear clusters
  // flank the lanes (the green guide dots thread the gap between each pair),
  // the articulated picker robot nudges cars over the conveyor belt, a giant
  // steam press straddles the eastbound z=0 lane (drive UNDER it — it slams
  // down and finds you flat if you're under it when it drops), and a glowing
  // car wash bay straddles the final westbound z=-30 lane just before the
  // finish ribbon. The active bits: the picker's soft grab-pad (gives the car
  // a gentle bump over the belt) and the steam press, which flags
  // `steamPress.slamActive` for main.js to read (it flattens the car and
  // bounces it back, same as the boulder/steamroller) — everything else stays
  // ghostly, so the whole course stays navigable.
  const gearSteel = new THREE.MeshStandardMaterial({ color: 0x4a3f35, roughness: 0.55, metalness: 0.6 });
  const gearToothMat = new THREE.MeshStandardMaterial({
    color: 0x74a5b5, roughness: 0.3, metalness: 0.9, emissive: 0x1c3a47, emissiveIntensity: 0.45,
  });
  const gearSpin = [];   // { mesh, speed } — spun every frame
  // A single gear wheel: a flat "coin" cylinder (wide + thin, like a big
  // coin) with little rounded bumps for teeth ringing its rim. It stands in
  // the local XY plane (facing the road) and spins about the local Z axis via
  // rotation.z.
  function makeGear(radius, depth, teeth, glowColor) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 64), gearSteel);
    body.rotation.x = Math.PI / 2;   // cylinder axis → +Z, the spin axis
    g.add(body);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, depth + 0.3, 18), makeGlowMat(glowColor));
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    // milled edge ring so the coin reads machined, like a real gear blank
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, depth * 0.42, 10, 64), gearToothMat);
    g.add(rim);
    const bumpGeo = new THREE.SphereGeometry(0.2, 12, 9);   // little rounded tooth-bump
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const b = new THREE.Mesh(bumpGeo, gearToothMat);
      const out = radius + 0.15;
      b.position.set(Math.cos(a) * out, Math.sin(a) * out, 0);
      g.add(b);
    }
    return g;
  }
  // A meshing BIG+SMALL pair bolted together. The pair stands in the local XY
  // plane; the whole group is rotated later so the gears face the road and
  // their axles point along the lane (they spin in-plane).
  function makeGearPair(bigR, smallR, depth, bigTeeth, smallTeeth, bigGlow, smallGlow) {
    const pair = new THREE.Group();
    const big = makeGear(bigR, depth, bigTeeth, bigGlow);
    const small = makeGear(smallR, depth, smallTeeth, smallGlow);
    const meshDist = (bigR + 0.15) + (smallR + 0.15);
    small.position.set(meshDist, 0, 0);
    pair.add(big, small);
    gearSpin.push({ mesh: big, speed: 0.6 });
    gearSpin.push({ mesh: small, speed: -0.6 * (bigR + 0.15) / (smallR + 0.15) });
    return pair;
  }
  // ---- GIANT bed-and-slat machine — the ONLY two sets of gears live here ----
  // The two interlocking coin-gear pairs are both bolted onto a single massive
  // factory machine sitting RIGHT ON the westbound z=17 course lane (the
  // second-long straight). The cars DRIVE OVER it like a bridge: the east ramp
  // climbs onto its roof, the west ramp drops back off, and the roof is a soft
  // "bridge" collider so the car snaps onto it from the ramps (and flyers land
  // and roll across) instead of falling through. The belly is OPEN (no slab,
  // no plinth) so a floor-level car just drives through underneath between the
  // legs. The machine is a long steel housing on legs with OPEN sides — a roof
  // slab, corner posts and side rails frame each bay so the spinning
  // gear-drive shafts inside the body stay in view — and along its top a row
  // of heavy "beds" and upright "slats" rise and fall in alternating waves
  // (like a giant stacker / comb machine), visibly driven by the meshing gear
  // wraps on its front face — they poke UP through the open roof (beds top
  // ≈8.7, slats top ≈11.7) and churn right around the car as it crosses the
  // bridge, so the moving machinery stays in view.
  const MACHINE = { x: 71, z: 17, len: 42, halfD: 5.2, bodyH: 4.2, legs: 2.2 };
  const machineSteel = new THREE.MeshStandardMaterial({
    color: 0x5a6470, roughness: 0.45, metalness: 0.8,
    emissive: 0x141c28, emissiveIntensity: 0.4,
  });
  const bedsAndSlats = [];   // { mesh, baseY, amp, speed, phase } — animated in update()
  let machineT = 0;          // pump-cycle clock for the beds/slats
  // Bolt one interlocking gear pair onto the machine's front face. Kept flat
  // (axle along world Z, into the housing) so the gears face the road and spin
  // about their own Z — the update loop's gearSpin handles the motion.
  function mountGearDrive(px, pz, s) {
    const pair = makeGearPair(2.6, 1.7, 0.5, 16, 11, NEON.amber, NEON.cyan);
    pair.position.set(px, 3.15 * s + 0.15, pz);
    pair.scale.setScalar(s);
    parent.add(pair);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, 3.15 * s + 0.15, 18), gearSteel);
    ped.position.set(px, (3.15 * s + 0.15) / 2, pz);
    parent.add(ped);
    // Drive shaft running back INTO the machine body + a glowing coupling at
    // the gear hub. The shaft spins with the big driving gear.
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, MACHINE.halfD + 2.2, 14), gearSteel);
    shaft.rotation.x = Math.PI / 2;   // axis → +Z (into the housing)
    shaft.position.set(px, 3.15 * s + 0.15, MACHINE.z - 0.8);
    parent.add(shaft);
    gearSpin.push({ mesh: shaft, speed: 0.6 });
    const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.42, 14), makeGlowMat(NEON.amber));
    coupling.rotation.x = Math.PI / 2;
    coupling.position.set(px, 3.15 * s + 0.15, pz - 0.1);
    parent.add(coupling);
  }
  function makeSlatMachine() {
    // Legs under the housing.
    for (let i = 0; i < 4; i++) {
      const lx = MACHINE.x - MACHINE.len / 2 + (MACHINE.len / 3) * i;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, MACHINE.legs, 1.2), machineSteel);
      leg.position.set(lx, MACHINE.legs / 2, MACHINE.z);
      parent.add(leg);
    }
    // The long steel housing — now an OPEN framework instead of a solid box:
    // a roof slab (the drive surface), corner/mid posts and side rails frame
    // each bay so the spinning gear-drive shafts inside the body are visible
    // through the sides (see mountGearDrive). The belly stays open for cars
    // driving through underneath.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.len, 0.5, MACHINE.halfD * 2), machineSteel);
    roof.position.set(MACHINE.x, MACHINE.legs + MACHINE.bodyH - 0.25, MACHINE.z);
    roof.castShadow = true;
    parent.add(roof);
    const postH = MACHINE.bodyH - 0.5;            // from the top of a leg to the roof
    for (const ix of [-0.5, -0.16, 0.16, 0.5]) {
      for (const s of [1, -1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, postH, 0.7), machineSteel);
        post.position.set(MACHINE.x + ix * MACHINE.len, MACHINE.legs + postH / 2, MACHINE.z + s * MACHINE.halfD);
        parent.add(post);
      }
    }
    for (const s of [1, -1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.len - 1.4, 0.4, 0.3), machineSteel);
      rail.position.set(MACHINE.x, MACHINE.legs + MACHINE.bodyH * 0.55, MACHINE.z + s * MACHINE.halfD);
      parent.add(rail);
    }
    // Glowing drive window band across each side bay, reading as a scan fork
    // running along the open machine.
    for (const s of [1, -1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(MACHINE.len - 1.8, 1.2, 0.1), makeGlowMat(NEON.cyan));
      win.position.set(MACHINE.x, MACHINE.legs + MACHINE.bodyH * 0.62, MACHINE.z + s * MACHINE.halfD + 0.05);
      parent.add(win);
    }
    // Warning beacon + exhaust chimney poking above the housing top on the
    // centre line (≈6.95/7.3, just above the roof the car drives at 6.4).
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 10), makeGlowMat(NEON.red));
    beacon.position.set(MACHINE.x - MACHINE.len / 2 + 2, MACHINE.legs + MACHINE.bodyH + 0.55, MACHINE.z);
    parent.add(beacon);
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.5, 10), machineSteel);
    ex.position.set(MACHINE.x + MACHINE.len / 2 - 2, MACHINE.legs + MACHINE.bodyH + 0.9, MACHINE.z);
    parent.add(ex);
    // BEDS — heavy plates along the top row that rise and fall ABOVE the roof,
    // churning around the car as it crosses the bridge (top ≈8.7).
    const SLAT_BEDS = 5;
    const bedW = MACHINE.halfD * 2 - 0.6;
    const bedGeo = new THREE.BoxGeometry(6.6, 0.5, bedW);
    for (let i = 0; i < SLAT_BEDS; i++) {
      const bx = MACHINE.x - MACHINE.len / 2 + 4.5 + i * (MACHINE.len - 8) / (SLAT_BEDS - 1);
      const bed = new THREE.Mesh(bedGeo, machineSteel);
      bed.castShadow = true;
      bed.position.set(bx, MACHINE.legs + MACHINE.bodyH + 0.5, MACHINE.z);
      parent.add(bed);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.16, bedW), makeGlowMat(NEON.amber));
      edge.position.set(0, -0.32, 0);   // CHILD of the bed — centered on it, not absolute world coords
      bed.add(edge);
      bedsAndSlats.push({
        mesh: bed,
        baseY: MACHINE.legs + MACHINE.bodyH + 0.5,
        amp: 1.7,
        speed: 0.9 + (i % 3) * 0.18,
        phase: i * 1.25,
      });
    }
    // SLATS — upright fins between the beds, sliding the opposite phase so the
    // row works like interleaving teeth (beds up while neighbouring slats down).
    // They stand the tallest, sweeping up to ≈11.7 as they pump.
    const slatGeo = new THREE.BoxGeometry(0.6, 3.6, MACHINE.halfD * 2 - 0.8);
    for (let i = 0; i < SLAT_BEDS - 1; i++) {
      const sx = MACHINE.x - MACHINE.len / 2 + 4.5 + (i + 0.5) * (MACHINE.len - 8) / (SLAT_BEDS - 1);
      const slat = new THREE.Mesh(slatGeo, machineSteel);
      slat.castShadow = true;
      slat.position.set(sx, MACHINE.legs + MACHINE.bodyH + 1.8, MACHINE.z);
      parent.add(slat);
      bedsAndSlats.push({
        mesh: slat,
        baseY: MACHINE.legs + MACHINE.bodyH + 1.8,
        amp: 1.9,
        speed: 1.1 + (i % 2) * 0.22,
        phase: i * 1.25 + Math.PI,   // counter-phase to the neighbouring beds
      });
    }
  }
  makeSlatMachine();
  mountGearDrive(MACHINE.x - MACHINE.len / 5, MACHINE.z + MACHINE.halfD + 1.2, 1.0);
  mountGearDrive(MACHINE.x + MACHINE.len / 5, MACHINE.z + MACHINE.halfD + 1.2, 1.0);
  // The machine IS a bridge: a single soft "bridge" collider floats the roof at
  // the top of the housing (legs + body, y 6.4). main.js treats bridge
  // colliders specially — the elevator helper always reports their top (no
  // height-of-car filter) and the airborne landing math uses them as a catch
  // surface — so a car snaps onto the roof from the course ramps (east climb
  // top x=94, west drop top x=47.5) or falls onto it from a flyer, and never
  // sinks into the housing. The belly is OPEN: the plinth/slab are gone, so a
  // floor-level car just drives through underneath between the legs.
  const machineColliders = [
    {
      x: MACHINE.x, z: MACHINE.z,
      halfW: MACHINE.len / 2 + 2.5,
      halfD: MACHINE.halfD,
      h: MACHINE.legs + MACHINE.bodyH,
      soft: true,
      bridge: true,
    },
  ];

  // ---- Giant steam press straddling the eastbound z=0 lane (belt middle) ----
  // Industrial gantry: two columns at z=±5.5 (just outside the belt rails), a
  // crossbeam on top, a neon anvil on the floor, and a massive steel head that
  // rides the columns up and down. The press sits in the MIDDLE of the
  // conveyor belt (x=74, the belt runs x∈[41,107]) — if you do nothing, the
  // belt carries you under the head into the slam zone (|x−74| < 6.7) right as
  // it drops, and carries you OUT flat on the other side. The head cycles
  // raised (rest) → quick slam → hold flat on the anvil → rise, flashing its
  // warning light before each drop. If the car is under the head while it's
  // down it gets pressed flat (steam carrier reads steamPress.slamActive and
  // runs the normal flatten/bounce). The press is NEVER a collider — with the
  // head up you just drive through.
  const PRESS = { x: CONVEYOR.cx, z: 0, halfW: 5.5, halfD: 5.5, baseY: 8.2 };
  const PRESS_UP_Y = 4.5, PRESS_DOWN_Y = 1.15;   // head bottom (y-0.95) meets the anvil
  const pressSteel = new THREE.MeshStandardMaterial({ color: 0x3a3238, roughness: 0.5, metalness: 0.7 });
  const pressHeadMat = new THREE.MeshStandardMaterial({ color: 0x2c252d, roughness: 0.4, metalness: 0.8, emissive: 0x8a1f5c, emissiveIntensity: 0.35 });
  const pressGroup = new THREE.Group();
  pressGroup.position.set(PRESS.x, 0, PRESS.z);
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.1, PRESS.baseY, 1.1), pressSteel);
    col.position.set(0, PRESS.baseY / 2, s * PRESS.halfD);
    col.castShadow = true;
    pressGroup.add(col);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.18, PRESS.baseY, 0.18), makeGlowMat(NEON.amber));
    gl.position.set(-0.55, PRESS.baseY / 2, s * PRESS.halfD);
    pressGroup.add(gl);
  }
  const cross = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, PRESS.halfD * 2 + 1.4), pressSteel);
  cross.position.set(0, PRESS.baseY + 0.7, 0);
  pressGroup.add(cross);
  const warnLight = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), makeGlowMat(NEON.red).clone());
  warnLight.position.set(0, PRESS.baseY + 1.5, 0);
  pressGroup.add(warnLight);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(PRESS.halfW * 2 + 2, 0.2, PRESS.halfD * 2), pressSteel);
  anvil.position.set(0, 0.1, 0);
  pressGroup.add(anvil);
  const anvilGlow = new THREE.Mesh(new THREE.BoxGeometry(PRESS.halfW * 2 + 2, 0.06, PRESS.halfD * 2), makeGlowMat(NEON.magenta));
  anvilGlow.position.set(0, 0.2, 0);
  pressGroup.add(anvilGlow);
  const pressHead = new THREE.Mesh(new THREE.BoxGeometry(PRESS.halfW * 2, 1.9, PRESS.halfD * 2), pressHeadMat);
  pressHead.position.set(0, PRESS_UP_Y, 0);
  pressGroup.add(pressHead);
  const headGlow = new THREE.Mesh(new THREE.BoxGeometry(PRESS.halfW * 2 - 0.4, 0.12, PRESS.halfD * 2 - 0.4), makeGlowMat(NEON.magenta));
  headGlow.position.y = -0.95;
  pressHead.add(headGlow);
  const pressed = { t: 0, phase: 'up', head: pressHead, warnLight, slamActive: false, hiss: false };
  parent.add(pressGroup);
  const steamPuffs = [];   // soft grey steam when the head is down
  let steamPuffTimer = 0;

  // ---- Car wash bay on the westbound z=-30 lane, right up against the finish ----
  // Drive through it and out the exit portal, then 2 car lengths on to the
  // finish ribbon (COURSE_FINISH_X = -5.6, moved west so you clear the wash
  // before the line). Glowing frame, spinning side scrubber drums, BIG brushes
  // hanging from the roof rails that sweep back and forth across the car while
  // water sprays at you, and air-dryer fan boxes right at the exit. After you
  // exit the car sparkles for a few seconds. The bay's EXIT (west) portal sits
  // at world x=3; the finish ribbon now sits 2 car lengths beyond it.
  // Two main shops form this course-wide feature: a sweeping conveyor-style
  // car wash run (the westbound lane) with a stack of chemist-grade brushes.
  // cx = 3 + len/2 = 21 (len=36) puts the exit portal at x=3: world x 3..39.
  const CARWASH = { cx: 21, cz: -30, len: 36, wid: 8 };   // the car drives WEST (−X) through it; z half-span 4
  const washMat = new THREE.MeshStandardMaterial({ color: 0x26333a, roughness: 0.6, metalness: 0.55 });
  const washGlow = makeGlowMat(NEON.cyan);
  const carWash = {
    t: 0, inside: false, sparkleT: 0, droplets: [], sparkles: [],
    // Bay geometry (world coords) for the soapy glide in main.js — the car is
    // smoothly guided to the lane centre instead of knocking the lattice.
    bay: { cx: CARWASH.cx, cz: CARWASH.cz, len: CARWASH.len, wid: CARWASH.wid },
    // colourful spinning brush rigs, all animated in the update loop below
    drums: [],            // vertical side scrubber drums
    washers: [],          // full-height side washers (tall rollers, spin about Y)
    rocks: [],            // rocker-panel scrubbers (stubby low cylinders)
    tires: [],            // pena-wheel tire scrubbers (horizontal floor rollers)
    blasters: [],         // high-pressure wheel blasters (rotating nozzle rings)
    wraps: [],            // wrap-around "gyro wrap" swing arms (step in + scrub + release)
    mitterCurtains: [],   // cloth-strip frames agitating in a circular pattern
    mitter: null,         // overhead contour mitter (big soft roller, bobs in height)
    sweeps: [],           // existing big overhead brushes (swish across the car)
    fans: [], tubeMen: [],
    spawnAcc: 0, spawnAcc2: 0,
  };
  const washColliders = [];   // solid lattice side-walls (player + little car stay enclosed)
  const washGroup = new THREE.Group();
  washGroup.position.set(CARWASH.cx - CARWASH.len / 2, 0, CARWASH.cz);   // origin at the EXIT (west) portal x=3 — the car enters at the east end (x=39)
  const WZ = CARWASH.wid / 2;   // 4
  (function buildWash() {
    // Entry + exit portal arches (gantry frames across the lane).
    for (const ex of [0, CARWASH.len]) {
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 0.5), washMat);
        post.position.set(ex, 1.8, s * WZ);
        washGroup.add(post);
        const postGlow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 0.12), washGlow);
        postGlow.position.set(ex, 1.8, s * (WZ - 0.18));
        washGroup.add(postGlow);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, WZ * 2 + 1), washMat);
      bar.position.set(ex, 3.35, 0);
      washGroup.add(bar);
      const barGlow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, WZ * 2 + 0.6), washGlow);
      barGlow.position.set(ex, 3.2, 0);
      washGroup.add(barGlow);
    }
    // Lattice gate side-walls: you can SEE the brushes through the slats from
    // outside, but once a car is inside the bay it's ENCLOSED — the only
    // openings are the entry (east) and exit (west) ports above. Each wall is
    // a rail-bound X lattice (posts + crossing diagonals) at the bay's edges.
    const LATT_H = 3.6;                 // matches the portal post height
    const LATT_BAYS = 12;
    const lattBay = CARWASH.len / LATT_BAYS;
    const diagLen = Math.hypot(lattBay, LATT_H - 0.18);
    const diagAng = Math.atan2(LATT_H - 0.18, lattBay);
    for (const s of [-1, 1]) {
      const wz = s * WZ;                // wash-local z of the wall line
      for (const ry of [0.09, LATT_H - 0.09]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(CARWASH.len, 0.18, 0.22), washMat);
        rail.position.set(CARWASH.len / 2, ry, wz);
        washGroup.add(rail);
      }
      const strip = new THREE.Mesh(new THREE.BoxGeometry(CARWASH.len - 0.4, 0.1, 0.08), washGlow);
      strip.position.set(CARWASH.len / 2, LATT_H - 0.18, wz);
      washGroup.add(strip);
      for (let i = 0; i <= LATT_BAYS; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, LATT_H, 0.3), washMat);
        post.position.set(i * lattBay, LATT_H / 2, wz);
        washGroup.add(post);
      }
      for (let i = 0; i < LATT_BAYS; i++) {
        for (const dir of [1, -1]) {
          const dg = new THREE.Mesh(new THREE.BoxGeometry(diagLen, 0.1, 0.12), washMat);
          dg.rotation.z = dir * diagAng;
          dg.position.set((i + 0.5) * lattBay, LATT_H / 2, wz);
          washGroup.add(dg);
        }
      }
    }
    // Solid fences down each side (barriers, never roof surfaces) so the car
    // can't drive out through the lattice. `soapy` tells main.js NOT to use
    // the normal knock + wall-bounce: inside the bay the car glides along the
    // wall and eases back toward the lane centre instead of being yanked off.
    // h = wall height keeps the little car blocked only at this driving level,
    // not way up on the ceiling.
    washColliders.push(
      { x: CARWASH.cx, z: CARWASH.cz - WZ, halfW: CARWASH.len / 2, halfD: 0.3, h: LATT_H, noRoof: true, soapy: true },
      { x: CARWASH.cx, z: CARWASH.cz + WZ, halfW: CARWASH.len / 2, halfD: 0.3, h: LATT_H, noRoof: true, soapy: true },
    );
    // ===== Brush station row (built EAST → WEST, entry at high x) =====
    // The whole bay is one long brush marathon. Every rig is BIG, BOLD and
    // COLORFUL, spins/sweeps actively, and sits well out of the car lane so
    // driving through stays free. Local x descends as the westbound car
    // travels: entry portal at x≈36, exit at x≈0.
    const bristleM = (c) => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.92, metalness: 0.02, emissive: c, emissiveIntensity: 0.5,
    });
    const brushM = (c) => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.5, metalness: 0.22, emissive: c, emissiveIntensity: 0.35,
    });
    const pistonMat = new THREE.MeshStandardMaterial({ color: 0x3b4a52, roughness: 0.4, metalness: 0.75 });
    // One spinning brush: dark spine + colored bristle shroud + neon end rings.
    function makeBrushSpin(r, len, color, glow) {
      const spin = new THREE.Group();
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, len + 0.12, 12), washMat);
      spin.add(spine);
      const bris = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20, 1, true), bristleM(color));
      spin.add(bris);
      const top = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, 0.09, 8, 20), makeGlowMat(glow));
      top.rotation.x = Math.PI / 2;
      top.position.y = len / 2;
      spin.add(top);
      const bot = top.clone();
      bot.position.y = -len / 2;
      spin.add(bot);
      return spin;
    }
    // 1. VERTICAL SIDE BRUSHES — tall amber drums spinning about Y.
    for (const s of [-1, 1]) {
      const spin = makeBrushSpin(0.45, 2.5, NEON.amber, NEON.amber);
      spin.position.set(18, 1.65, s * (WZ - 0.45));
      washGroup.add(spin);
      carWash.drums.push(spin);
    }
    // 2. FULL-HEIGHT SIDE WASHERS — cyan rollers from floor to roofline.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const spin = makeBrushSpin(0.42, 3.1, NEON.cyan, NEON.cyan);
        spin.position.set(21 + i * 3.2, 1.75, s * (WZ - 0.4));
        washGroup.add(spin);
        carWash.washers.push(spin);
      }
    }
    // 3. ROCKER PANEL BRUSHES — stubby lime cylinders low to the ground.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const spin = makeBrushSpin(0.28, 0.75, NEON.lime, NEON.lime);
        spin.position.set(12.5 + i * 0.95, 0.45, s * (WZ - 0.5));
        washGroup.add(spin);
        carWash.rocks.push(spin);
      }
    }
    // 4. PENA-WHEEL / TIRE SCRUBBERS — red horizontal rollers at wheel level,
    //    spinning about their long axis to scrub rims + sidewalls. The brush
    //    lives in an orientation holder so the inner spin stays clean (rotate
    //    the inner group's Y = the roller's own symmetry axis).
    for (const s of [-1, 1]) {
      const holder = new THREE.Group();
      holder.rotation.x = Math.PI / 2;       // lay the roller flat across the lane
      holder.position.set(9.5, 0.35, s * (WZ - 0.7));
      const spin = makeBrushSpin(0.3, 1.7, NEON.red, NEON.red);
      holder.add(spin);
      washGroup.add(holder);
      carWash.tires.push(spin);
    }
    // 5. HIGH-PRESSURE WHEEL BLASTERS — spinning nozzle stands that flush the
    //    wheel wells (glowing cone tips whipping a circle at the wheels).
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const stand = new THREE.Group();
        stand.position.set(7 + i * 2.1, 0, s * (WZ - 0.75));
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.0, 10), pistonMat);
        post.position.y = 0.5;
        stand.add(post);
        const head = new THREE.Group();
        head.position.y = 1.05;
        stand.add(head);
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + s * 0.3;
          const arm = new THREE.Group();
          arm.rotation.y = a;
          const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 10), pistonMat);
          nozzle.rotation.z = -Math.PI / 2;   // aim the cone out sideways
          nozzle.position.x = 0.15;
          arm.add(nozzle);
          const jet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), makeGlowMat(NEON.cyan));
          jet.position.x = 0.3;
          arm.add(jet);
          head.add(arm);
        }
        washGroup.add(stand);
        carWash.blasters.push(head);
      }
    }
    // 6. WRAP-AROUND BRUSHES (Z-wraps / gyro wraps) — hanging vertical
    //    cylinders on jointed pneumatic swing arms that step INTO the car's
    //    path (front bumper), swing out along the sides, then reach back
    //    around to scrub the rear tailgate/trunk before releasing. The arm
    //    sweeps about its shoulder pivot while the brush spins fast.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const arm = new THREE.Group();
        arm.position.set(33.5 - i * 2.4, 3.35, s * (WZ - 1.15));
        arm.rotation.y = s === 1 ? Math.PI : 0;   // arm reaches toward the lane
        arm.userData.base = arm.rotation.y;
        // pneumatic shoulder + first joint
        const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.3, 10), pistonMat);
        seg1.rotation.x = Math.PI / 2;
        seg1.position.set(0, 0, 0.55);
        arm.add(seg1);
        const joint = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), brushM(NEON.magenta));
        joint.position.set(0, -0.1, 1.15);
        arm.add(joint);
        // fore-arm segment angled down toward the car roof
        const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 10), pistonMat);
        seg2.rotation.x = Math.PI / 2 + 0.55;
        seg2.position.set(0, -0.45, 1.6);
        arm.add(seg2);
        // hanging rotating vertical brush (magenta) at the end
        const spin = makeBrushSpin(0.5, 1.7, NEON.magenta, NEON.magenta);
        spin.position.set(0, -1.1, 1.85);
        arm.add(spin);
        washGroup.add(arm);
        carWash.wraps.push({ arm, spin, phase: i * 0.9 + (s > 0 ? 0.4 : 0), reach: 0.55 + i * 0.22 });
      }
    }
    // 7. MITTER CURTAINS — overhead frames with soft cloth flaps agitated in
    //    a circular pattern (simulating a hand-wash of the roof).
    for (let c = 0; c < 2; c++) {
      const frame = new THREE.Group();
      frame.position.set(15.4 - c * 10.2, 3.25, 0);
      const header = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, WZ * 2 - 0.6), washMat);
      frame.add(header);
      const stripMatC = new THREE.MeshStandardMaterial({
        color: c === 0 ? 0x0f8f7a : 0x7a3fd8, roughness: 0.6, metalness: 0.05,
        emissive: c === 0 ? 0x0a5e50 : 0x4a1f86, emissiveIntensity: 0.45,
      });
      for (let zi = 0; zi < 9; zi++) {
        const zz = -(WZ - 0.5) + zi * ((WZ * 2 - 1.0) / 8);
        for (const s of [-1, 1]) {
          const flap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.2), stripMatC);
          flap.position.set(s * 0.12, -0.62, zz);
          flap.rotation.z = s * (Math.random() - 0.5) * 0.15;
          frame.add(flap);
        }
      }
      washGroup.add(frame);
      carWash.mitterCurtains.push({ g: frame, phase: c * 1.9 });
    }
    // 8. TOP MITERS / CONTOUR WASHERS — a big horizontal roller suspended
    //    overhead that adjusts its height dynamically and rolls over the
    //    hood, windshield, roof and trunk. Like the tire scrubbers the brush
    //    sits in an orientation holder; the inner spin turns about its own
    //    symmetry axis.
    const mitterSpin = makeBrushSpin(0.62, WZ * 2 - 0.6, NEON.magenta, NEON.magenta);
    const mitterOrient = new THREE.Group();
    mitterOrient.rotation.x = Math.PI / 2;    // axis across the lane (over the car)
    mitterOrient.add(mitterSpin);
    const mitterG = new THREE.Group();
    mitterG.position.set(27.5, 2.4, 0);     // slowly bobs between ~2.0 and ~2.8
    mitterG.add(mitterOrient);
    // keep the roller only just off the car: hanger chains from the gantry
    for (const s of [-1, 1]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.3, 8), washMat);
      chain.position.set(0, 0.95, s * (WZ - 0.4));
      mitterG.add(chain);
    }
    washGroup.add(mitterG);
    carWash.mitter = { g: mitterG, spin: mitterSpin, phase: 0 };
    // 9. BIG overhead swish brushes — hang from the roof rail and sweep back
    //    and forth ACROSS the roof while rolling their own bristles.
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.set(24.5 - i * 2.6, 3.3, 0);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.0, 8), washMat);
      rod.position.y = -0.5;
      g.add(rod);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.35, 12), washMat);
      head.position.y = -1.02;
      g.add(head);
      const spin = makeBrushSpin(0.62, 1.2, NEON.cyan, NEON.cyan);
      spin.position.y = -1.35;
      g.add(spin);
      washGroup.add(g);
      carWash.sweeps.push({ g, spin, phase: i * 0.7, amp: 0.6 + (i % 2 ? 0.18 : 0.08) });
    }
    // Hanging strip curtain just before the air-dryer fans at the exit.
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0x35525e, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0.75,
      emissive: 0x0e4a5c, emissiveIntensity: 0.5,
    });
    for (let k = 0; k < 3; k++) {
      for (const s of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), stripMat);
        strip.position.set(2.0 + k * 1.0, 2.45, s * (WZ - 0.55));
        washGroup.add(strip);
      }
    }
    // Air-dryer fan boxes aimed back down the lane at the exit: each fan now
    // lives inside a steel box duct with a wire grille across its face, and is
    // a big 5-blade curved propeller spinning behind the mesh.  Fans spin via
    // their spin-group's Z rotation (parent orient +Y rotation maps that to the
    // world +X face normal).
    const ductMat = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.65 });
    const grilleMat = new THREE.MeshStandardMaterial({
      color: 0x1c2a30, roughness: 0.6, metalness: 0.6, emissive: 0x0d4a52, emissiveIntensity: 0.4,
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xa7bcc9, roughness: 0.35, metalness: 0.8, emissive: 0x123e4a, emissiveIntensity: 0.3,
    });
    // One curved paddle silhouette, extruded so it has real thickness.
    const bladeGeo = (() => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.3, 0.08);
      shape.lineTo(0.3, 0.18);
      shape.quadraticCurveTo(0.36, 0.0, 0.28, -0.14);
      shape.quadraticCurveTo(0.0, -0.22, -0.3, -0.08);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, {
        depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2,
      });
    })();
    for (const s of [-1, 1]) {
      const duct = new THREE.Group();
      const dw = 1.5, dh = 1.5, dd = 1.3;   // duct box dims (x depth, y, z)
      duct.position.set(0.55, 2.0, s * (WZ - 1.1));   // right AT the exit
      // box shell — five faces wrapped around the fan, open on the +X (lane) side
      const wall = (w, h, d, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ductMat);
        m.position.set(x, y, z);
        duct.add(m);
      };
      wall(dd, 0.1, dw, 0, dh / 2 - 0.05, 0);      // top
      wall(dd, 0.1, dw, 0, -dh / 2 + 0.05, 0);     // bottom
      wall(dd, dh, 0.1, 0, 0, -dw / 2 + 0.05);     // left side
      wall(dd, dh, 0.1, 0, 0, dw / 2 - 0.05);      // right side
      wall(0.1, dh, dw, -dd / 2 + 0.05, 0, 0);     // back plate
      // glowing rim frame around the open face
      const lath = (w, h, d, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), washGlow);
        m.position.set(x, y, z);
        duct.add(m);
      };
      lath(0.1, 0.1, dw, dd / 2, dh / 2 - 0.05, 0);
      lath(0.1, 0.1, dw, dd / 2, -dh / 2 + 0.05, 0);
      lath(0.1, dh, 0.1, dd / 2, 0, -dw / 2 + 0.05);
      lath(0.1, dh, 0.1, dd / 2, 0, dw / 2 - 0.05);
      // wire-mesh grille strung across the opening
      for (let i = 0; i <= 8; i++) {
        const t = -0.75 + i * (1.5 / 8);
        const vb = new THREE.Mesh(new THREE.BoxGeometry(0.035, dh - 0.25, 0.035), grilleMat);
        vb.position.set(dd / 2 - 0.03, 0, t);
        duct.add(vb);
        const hb = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, dw - 0.25), grilleMat);
        hb.position.set(dd / 2 - 0.03, t, 0);
        duct.add(hb);
      }
      // fan assembly — orient maps the local spin axis (+Z) to world +X (the
      // lane / duct axis), so spin.rotation.z is what rotates the propeller.
      const orient = new THREE.Group();
      orient.rotation.y = Math.PI / 2;
      const spin = new THREE.Group();
      orient.add(spin);
      duct.add(orient);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 18), ductMat);
      hub.rotation.x = Math.PI / 2;
      spin.add(hub);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 18), washGlow);
      collar.rotation.x = Math.PI / 2;
      spin.add(collar);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const B = new THREE.Group();
        B.rotation.z = a;
        const tilt = new THREE.Group();
        tilt.position.x = 0.45;          // blade root at radius ~0.15, tip at ~0.75
        tilt.rotation.x = 0.55;          // pitch the blade out of the disc plane
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.castShadow = true;
        tilt.add(blade);
        B.add(tilt);
        spin.add(B);
      }
      washGroup.add(duct);
      carWash.fans.push(spin);
    }
  })();
  parent.add(washGroup);
  // Inflatable tube men flailing at the wash's ENTRY — two crazy gesticulating
  // skimmers straddling the approach, welcoming cars into the bay. Purely
  // decorative (no colliders); each has pivoting arms + a swaying body that
  // the update loop sets to wild windmilling, and they're parked OUTSIDE the
  // wash-detection box so they never count as "inside" the wash.
  const tubeManMat = (c, glow) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.35, metalness: 0.15, emissive: glow, emissiveIntensity: 0.45,
  });
  for (const s of [-1, 1]) {
    const tube = new THREE.Group();
    const pink = s > 0;
    const mat = pink ? tubeManMat(0xff5ab2, 0x8a1048) : tubeManMat(0x2fe8ff, 0x0b6a8a);
    const glow = makeGlowMat(pink ? NEON.magenta : NEON.cyan);
    // Blower drum at the base (the inflatable's air column).
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.7, 12), mat);
    drum.position.y = 0.35;
    tube.add(drum);
    // The long body tube, slightly tapered, with a couple of stripe rings.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 3.0, 14), mat);
    body.position.y = 2.5;
    tube.add(body);
    for (const ry of [1.6, 2.4, 3.2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.05, 8, 14), glow);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      tube.add(ring);
    }
    // Pin-headed balloon top.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), mat);
    head.position.y = 4.2;
    tube.add(head);
    // Shoulder pivots + long flailing arms (little fists at the ends).
    const armGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.7, 8);
    const fistGeo = new THREE.SphereGeometry(0.16, 10, 8);
    function makeTubeArm(sx) {
      const a = new THREE.Group();
      a.position.set(sx * 0.3, 3.9, 0);
      const seg = new THREE.Mesh(armGeo, mat);
      seg.position.y = -0.85;
      a.add(seg);
      const fist = new THREE.Mesh(fistGeo, mat);
      fist.position.y = -1.7;
      a.add(fist);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 12), glow);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.2;
      a.add(cuff);
      return a;
    }
    const armL = makeTubeArm(-1);
    const armR = makeTubeArm(1);
    tube.add(armL, armR);
    tube.position.set(CARWASH.cx + CARWASH.len / 2 + 2, 0, -30 + s * (WZ + 1.6));   // flanking the ENTRY (east) portal x=39 — the first thing the oncoming car meets
    tube.rotation.y = Math.PI / 2;                        // face the oncoming westbound car
    parent.add(tube);
    carWash.tubeMen.push({ g: tube, body, armL, armR, phase: s > 0 ? 0 : 2.1, time: Math.random() * 2 });
  }
  const washWaterTex = makeStarTexture();   // soft glow reused for droplets + sparkles

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
  // dramatic slope. (Its side rails were REMOVED 2026-09-21 — they carried an
  // invisible-wall collider — but were restored 2026-09-22 as visible glowing
  // guardrails along BOTH edges so you can no longer drive off the sides.) The ramp
  // doubles as a candy waterfall: glowing gemstones spawn at the top, tumble down the slope in
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
  // The wedge (only the ramp surface; the guardrails are separate, below).
  // Local frame: base→top along +X, up along +Y, across along +Z.
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
    parent.add(rampGroup);
    ugRamps.push(GRAND);
  }
  // ---- Guardrails on the candy waterfall's sides (restored 2026-09-22) ----
  // The grand ramp used to carry side rails with an invisible-wall collider so
  // you couldn't drive off the edges; they were removed so you COULD. These
  // bring back BOTH a visible rail AND the barrier. A dark-steel guardrail
  // runs up each side of the waterfall, tilted to sit flush on the ramp's
  // slope (45°-ish), topped with a glowing magenta cap and anchored by vertical
  // posts. A chain of axis-aligned solid colliders along each rail keeps the
  // car on the ramp while it climbs — each segment's `h` follows the ramp
  // surface so the little car (which height-filters colliders) is blocked at
  // every height, not just mid-slope. (The west-flank black techno fence at
  // x=15 stays; THIS is the rail on the ramp's own edges, x=18 & x=30.)
  const RAIL_H = 2.3;                 // rail height above the ramp surface
  const RAIL_THICK = 0.3;             // rail body thickness across the edge
  const GRAND_THETA = Math.atan2(GRAND.height, GRAND.len);
  const railSteel = new THREE.MeshStandardMaterial({ color: 0x3a3440, metalness: 0.55, roughness: 0.45 });
  const railMagenta = makeGlowMat(NEON.magenta);
  const grandRailColliders = [];
  // Length along the slope EXACTLY matching the ramp edge (no overhang, so the
  // ends line up with the ramp's floor and roof lips, not dangle past them).
  const railLen = GRAND.len / Math.cos(GRAND_THETA);
  for (const edgeX of [GRAND.x - GRAND.width / 2, GRAND.x + GRAND.width / 2]) {
    // Sloped rail body hugging the ramp surface along the edge. The box's long
    // axis must lie ALONG the slope (high at the ceiling / z=48 end, low at
    // the floor / z=82 end) — rotation.x = +THETA, which maps local +Z tip to
    // (down + toward +Z) and the -Z tip up toward the ceiling. The center hangs
    // on the surface's up-normal ((0, cos T, +sin T)) so the rail sits a true
    // RAIL_H above the ramp all the way up instead of being canted the wrong
    // way (high end sunk in the floor, low end poking through the roof).
    const rail = new THREE.Mesh(new THREE.BoxGeometry(RAIL_THICK, RAIL_H, railLen), railSteel);
    rail.rotation.x = GRAND_THETA;
    rail.position.set(
      edgeX,
      grandRampSurfaceY(GRAND.z) + (RAIL_H / 2) * Math.cos(GRAND_THETA),
      GRAND.z
    );
    rail.castShadow = true;
    parent.add(rail);
    // Glowing magenta cap riding the rail's top edge (same tilt as the rail).
    const capH = (RAIL_H / 2 + 0.02) * Math.cos(GRAND_THETA);
    const capZ = (RAIL_H / 2 + 0.02) * Math.sin(GRAND_THETA);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(RAIL_THICK + 0.06, 0.08, railLen), railMagenta);
    cap.rotation.x = GRAND_THETA;
    cap.position.set(edgeX, rail.position.y + capH, rail.position.z + capZ);
    parent.add(cap);
    // Vertical posts standing on the surface, echoing the sloped rail.
    for (let z = 50; z <= 80; z += 5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, RAIL_H, 0.18), railSteel);
      post.position.set(edgeX, grandRampSurfaceY(z) + RAIL_H / 2, z);
      parent.add(post);
    }
    // Solid colliders: axis-aligned segments tracking the slope. Each segment's
    // h = the ramp surface at its SOUTH (top) edge, so it always catches the
    // little car riding that stretch (never floats below it).
    const RAIL_SEGS = 10;
    const segLen = GRAND.len / RAIL_SEGS;
    for (let k = 0; k < RAIL_SEGS; k++) {
      const zc = (GRAND.z - GRAND.len / 2) + (k + 0.5) * segLen;
      grandRailColliders.push({
        x: edgeX, z: zc,
        halfW: 0.6, halfD: segLen / 2 + 0.2,
        h: grandRampSurfaceY(zc - segLen / 2),
      });
    }
  }
  // ---- Black techno fence on the waterfall's west flank ----
  // The invisible wall beside the ramp never went away, so here's a black
  // techno fence standing right on it (reported world (15, 51)) — run into
  // it and there's finally something to see. Black steel with a magenta
  // glow rail and cyan LED slats between the posts; jutting wing fins at
  // each end angle out past the ramp so it reads as a guard fin off the
  // waterfall, not a stray prop. Purely visual (no collider).
  const FZ = GRAND.z - GRAND.len / 2;                 // 48 — ramp's top end
  const FLEN = GRAND.len;                             // 34 — spans the footprint
  const FX = GRAND.x - GRAND.width / 2 - 3;           // 15 — the invisible wall's x
  {
    const FH = 2.4;        // fence height
    const STEP = 5;        // post spacing
    const blackTech = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.5, metalness: 0.45 });
    const glowRail = makeGlowMat(NEON.magenta);
    const ledMat = makeGlowMat(NEON.cyan);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.6, metalness: 0.4 });
    // Black top rail with a glowing magenta cap riding on top of it.
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, FLEN), blackTech);
    topRail.position.set(FX, FH, FZ + FLEN / 2);
    parent.add(topRail);
    const glowCap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, FLEN), glowRail);
    glowCap.position.set(FX, FH + 0.09, FZ + FLEN / 2);
    parent.add(glowCap);
    // Black mid rail, about halfway up.
    const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, FLEN), blackTech);
    midRail.position.set(FX, FH * 0.55, FZ + FLEN / 2);
    parent.add(midRail);
    // Posts + cyan LED slats in the gaps between them.
    let prevPost = null;
    for (let z = FZ; z <= FZ + FLEN + 0.01; z += STEP) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, FH, 0.14), blackTech);
      post.position.set(FX, FH / 2, z);
      parent.add(post);
      if (prevPost != null && z - prevPost > 0.5) {
        const mid = (z + prevPost) / 2;
        const span = z - prevPost - 0.4;
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, FH * 0.42, span), ledMat);
        slat.position.set(FX, FH * 0.55, mid);
        parent.add(slat);
      }
      prevPost = z;
    }
    // Jutting wing fins at each end, angling out away from the ramp so the
    // fence visibly pokes off the side of the waterfall.
    for (const end of [{ z: FZ, dir: 1 }, { z: FZ + FLEN, dir: -1 }]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(3.4, FH * 0.55, 0.12), finMat);
      const finY = FH * 0.35;
      fin.position.set(FX - 1.6, finY, end.z + 0.4 * end.dir);
      fin.rotation.z = 0.35 * end.dir;   // slight rake up/out
      parent.add(fin);
      const finCap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 0.18), glowRail);
      finCap.position.set(fin.position.x, finY, fin.position.z);
      finCap.rotation.z = 0.35 * end.dir;
      parent.add(finCap);
    }
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

  await ugPhase(0.52, 'the big staircase');

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

  // ---- Padded vertical pole — REMOVED (2026-09-21): the coarse course
  // obstacles are gone; the padded pole, its light-burst fxBursts and its
  // solid collider were deleted with the rest of the course. ----

  // ---- Giant rotating disco ball you can hit ----
  // A big faceted mirror sphere hangs from the cavern ceiling OVER THE MIDDLE
  // of the first long straight — the eastbound z=37 lane (151 units long, from
  // the start bend to the x=134 column). A kicker ramp on the lane ahead
  // launches the car into it and you keep flying along the SAME straight, so
  // you land back on the path. It spins and carries a ring of colored point
  // lights that throw moving neon pools across the cavern floor: fly into it
  // and the ball swings on its cable like a pendulum, then settles with a
  // damped wobble (and spins a touch faster with every hit).
  const DISCO = { x: 58, z: 37, topY: CEIL_Y, len: 21, r: 4, spin: 1.2, hitR: 6.5 };   // ball centre at y = topY - len = 9
  const disco = { ax: 0, vx: 0, az: 0, vz: 0, hits: 0, cd: 0 };
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
    const L = new THREE.PointLight(c, 4.5, 40, 2);
    const a = (i / 4) * Math.PI * 2;
    L.position.set(Math.cos(a) * (DISCO.r + 0.6), 0, Math.sin(a) * (DISCO.r + 0.6));
    discoSpin.add(L);
  });

  // ---- Ramps: a disco kicker and factory machine ramps ----
  // The disk kicker on the eastbound z=37 straight sits right under the disco
  // ball (launching you into it, landing back on the same straight), and the
  // factory machine ramps on the westbound z=17 straight turn the machine into
  // a BRIDGE: the east ramp climbs UP onto the machine's drivable roof (top
  // 6.4, matching the roof's surface) and the west ramp drops you back off
  // onto the lane, so you drive clean OVER the factory instead of through it
  // (the open belly below just lets a floor-level car pass through underneath).
  addUgRamp({ x: 36, z: 37, len: 9, height: 4, width: 8, runX: 1, runZ: 0, boost: 1.9 });     // disco kicker (eastbound z=37 straight)
  addUgRamp({ x: 99, z: 17, len: 10, height: MACHINE.legs + MACHINE.bodyH, width: 10, runX: -1, runZ: 0, boost: 0.6 }); // climb onto the factory machine (westbound z=17 straight)
  addUgRamp({ x: 41, z: 17, len: 13, height: MACHINE.legs + MACHINE.bodyH, width: 10, runX: 1, runZ: 0, boost: 0 }); // drive OFF the machine's west edge (top x=47.5) back onto the lane

  // ---- Giant rotating platter (the spinning turntable) ----
  // Restored 2026-09-22 — a big bright neon turntable standing on the cavern
  // floor in the open space just north of the Holy Mountain, well OFF the
  // course. It SPINS (the wedge pattern + rim ring + hub sell the rotation)
  // and the collider carries `spin` so main.js adds the disk's rotation to a
  // car riding it — the car actually turns with the turntable and drives off
  // in the new heading instead of cutting a straight line across it. A soft
  // collider seats the car on the disk surface (0.32-high pad, no clip).
  const PLATTER = { cx: -85, cz: 62, r: 16, h: 0.32, spin: 2.0 };   // beside the mountain, off-course
  const platterSpin = { t: 0, disk: null };
  // `r` is the deck's TRUE radius. The disk mesh is round, so without it the
  // collider can only be the halfW/halfD square that covers the circle, and the
  // square's four corners sit ~41% further out than the rim — a car parked in
  // one of them rides an invisible shelf hanging over the floor. `r` makes
  // main.js treat the footprint as the disc it actually is (see
  // onColliderFootprint); halfW/halfD stay as the conservative bound for any
  // code that has not learned about discs.
  const platterColliders = [{
    x: PLATTER.cx, z: PLATTER.cz,
    halfW: PLATTER.r, halfD: PLATTER.r, r: PLATTER.r,
    h: PLATTER.h, soft: true,
    spin: PLATTER.spin,
  }];
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

  await ugPhase(0.58, 'the trampoline pads');

  // ---- Trampoline launch pads (idea #13) ----
  // Glowing bounce patches set into the cavern floor. Drive over one on the
  // ground and it punts the car straight up (main.js gives it a vy of 35 —
  // enough to clear the 31.3-high second roof) so it sails up through the
  // ceiling and lands on the colorful tiles: a floor→roof route that skips
  // the staircase and the grand ramp. A translucent light column marks the
  // launch line all the way up to the roof.
  const TRAMPOLINES = [
    { x: 128, z: -90, r: 3.4 },  // far SE corner, off every lane (clear of the x=134 column and the z=-30 run) — under the roof
    { x: 18, z: 46, r: 3.4 },    // far NW, north of the z=37 lane and beneath the ceiling's north edge — off-course
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

  await ugPhase(0.66, 'the candy waterfall');

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

  // Tip a statue over in the given compass direction and drop its collider
  // (shared by the tile-crumble path and the new car-tag path). Since 2026-09-22
  // statues have NO collider while standing: the ceiling is a soft surface the
  // raised car rides over (never blocked by these), but the floor car is
  // blocked height-blind — so colliders up on the ceiling made the floor course
  // hit invisible walls. They stay collider-free.
  function startStatueFall(s, angle) {
    s.state = 'falling';
    s.fallT = 0;
    s.tipAngle = angle;
    s.tipAxis.set(Math.sin(angle), 0, -Math.cos(angle));
    if (s.collider) {
      const ci = colliders.indexOf(s.collider);
      if (ci >= 0) colliders.splice(ci, 1);
    }
  }

  // Place a statue on a specific checkerboard tile (by grid index) so the
  // level can watch exactly which tile supports it. Returns the live statue
  // record (state machine) for update(). The statue is PURELY decorative and
  // carries NO collider: the floor-driving collision check is height-blind, so
  // a collider standing 31 units up on the ceiling tile would wall off the
  // floor course below it (invisible obstacles) — the car never needs to bump
  // a standing statue, it only topples them by driving across the roof over
  // them (see the tag block in update()).
  function placeStatue(tileIx, tileIz, ringColor, type = 'artdeco') {
    const idx = tileIz * tilesX + tileIx;
    const x = ceilMinX + tileIx * TILE_SZ + TILE_SZ / 2;
    const z = gridZ0 + tileIz * TILE_SZ + TILE_SZ / 2;
    const { group, ringGroup } = buildStatue(type, ringColor);
    const half = STATUE_HALF[type] || 1.5;
    group.position.set(x, TILE_TOP, z);
    parent.add(group);
    const tipAngle = Math.random() * Math.PI * 2;   // random topple direction
    const statue = {
      group, ringGroup, idx, x, z, type, half,
      collider: null,   // decorative — never blocks the floor course
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

  await ugPhase(0.74, 'the start and finish gates');

  // Classic racing check: a full black-and-white checkerboard cloth, no text
  // or lettering. Drawn on a canvas (no image assets) with near-square cells
  // to match the START banner's 13.2 × 2.8 world-size (14 × 3 grid).
  function makeCheckeredTexture() {
    const W = 1024, H = 384;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const rows = 3, cols = 14, cellW = W / cols, cellH = H / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f4f1ee' : '#141414';
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
    // Thin hem so the cloth reads as fabric, not a raw sticker.
    ctx.strokeStyle = 'rgba(18,18,18,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // Bright red satin ribbon: baked sheen streaks running along the length,
  // faint vertical folds and a light-catching top edge, so the fabric and its
  // subtle reflections read even at this low-poly scale.
  function makeSatinTexture() {
    const W = 1024, H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(0, 0, W, H);
    // Wide horizontal sheen bands along the ribbon's length.
    for (const f of [0.12, 0.38, 0.62, 0.86]) {
      const x = f * W;
      const g = ctx.createLinearGradient(x - 110, 0, x + 130, 0);
      g.addColorStop(0, 'rgba(255,212,204,0)');
      g.addColorStop(0.5, 'rgba(255,216,208,0.5)');
      g.addColorStop(1, 'rgba(255,212,204,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 110, 0, 240, H);
    }
    // Subtle vertical satin folds: darker creases between lighter ridgelines.
    for (let i = 0; i <= 24; i++) {
      const x = (i / 24) * W;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(120,6,18,0.12)' : 'rgba(255,228,220,0.06)';
      ctx.fillRect(x, 0, Math.ceil(W / 24), H);
    }
    // Soft shadowing so the strip reads as rounded satin, brightest on top.
    const gv = ctx.createLinearGradient(0, 0, 0, H);
    gv.addColorStop(0, 'rgba(255,230,220,0.4)');
    gv.addColorStop(0.35, 'rgba(255,255,255,0)');
    gv.addColorStop(0.85, 'rgba(90,4,12,0.35)');
    gv.addColorStop(1, 'rgba(55,2,8,0.55)');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // ---- START / FINISH gates (2026-09-20) ----
  // Two sturdy metal support posts with a signature banner between them:
  //   START  — the classic black-and-white checkered cloth, hung above head
  //            height off a bridging crossbar so vehicles roll clean under.
  //   FINISH — a bright red satin ribbon stretched taut at chest height, the
  //            finish marker you drive through and break.
  // Both are purely cosmetic — the car passes right through (no colliders).
  const gatePoleMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.42, metalness: 0.75 });
  const gateBaseMat = new THREE.MeshStandardMaterial({ color: 0x2a2626, roughness: 1 });

  // One gate post: a tapered metal cylinder, a foot collar where it anchors
  // into the ground and a rounded cap on top.
  function makeGatePost(px, pz, h, baseY) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.21, h, 10), gatePoleMat);
    post.position.set(px, baseY + h / 2, pz);
    post.castShadow = true;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.22, 10), gateBaseMat);
    foot.position.set(px, baseY + 0.11, pz);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.16, 10), gatePoleMat);
    cap.position.set(px, baseY + h + 0.08, pz);
    return [post, foot, cap];
  }

  // START gate: two posts bridged by a top crossbar, flying the checkered
  // banner. The cloth's bottom edge sits well above bumper height, so a car
  // drives underneath without touching. `scale` raises the whole arch (posts
  // and crossbar) — the cloth itself keeps its fixed height, it just hangs
  // higher — in case a taller start gate is ever wanted.
  const START_POLE_H = 6.4;
  function makeStartGate(xA, zA, xB, zB, baseY = 0, face = Math.PI, scale = 1) {
    const group = new THREE.Group();
    const midX = (xA + xB) / 2, midZ = (zA + zB) / 2;
    const alongX = zA === zB;
    for (const [px, pz] of [[xA, zA], [xB, zB]]) {
      group.add(...makeGatePost(px, pz, START_POLE_H * scale, baseY));
    }
    // Bridging crossbar above the cloth.
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, Math.abs(xB - xA) + Math.abs(zB - zA) + 0.6, 10),
      gatePoleMat
    );
    if (alongX) bar.rotation.z = Math.PI / 2;
    else bar.rotation.x = Math.PI / 2;
    bar.position.set(midX, baseY + 5.6 * scale, midZ);
    bar.castShadow = true;
    group.add(bar);
    // The checkered cloth hanging from the crossbar.
    const checkerMat = new THREE.MeshStandardMaterial({
      map: makeCheckeredTexture(),
      side: THREE.DoubleSide,
      roughness: 0.85,
    });
    const width = Math.abs(xB - xA) + Math.abs(zB - zA) + 1.2;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(width, 2.8, 0.16), checkerMat);
    banner.rotation.y = alongX ? 0 : Math.PI / 2;
    banner.position.set(midX, baseY + 3.9 * scale, midZ);
    banner.castShadow = true;
    group.add(banner);
    return { group };
  }

  // FINISH gate: two shorter posts holding a thick red satin ribbon pulled
  // taut between them at chest height. The material carries a faint red
  // emissive so a crossing can blaze it via `mat.emissiveIntensity`.
  const FINISH_POLE_H = 2.6;
  function makeFinishGate(xA, zA, xB, zB, baseY = 0) {
    const group = new THREE.Group();
    const midX = (xA + xB) / 2, midZ = (zA + zB) / 2;
    const alongX = zA === zB;
    for (const [px, pz] of [[xA, zA], [xB, zB]]) {
      group.add(...makeGatePost(px, pz, FINISH_POLE_H, baseY));
    }
    const satinMat = new THREE.MeshStandardMaterial({
      map: makeSatinTexture(),
      side: THREE.DoubleSide,
      roughness: 0.32,
      metalness: 0.05,
      emissive: 0xff2233,
      emissiveIntensity: 0.35,
    });
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(xB - xA) + Math.abs(zB - zA) + 0.6, 0.55, 0.12),
      satinMat
    );
    ribbon.rotation.y = alongX ? 0 : Math.PI / 2;
    ribbon.position.set(midX, baseY + 1.25, midZ);
    ribbon.castShadow = true;
    group.add(ribbon);
    return { group, mat: satinMat, ribbon };
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
  // Course marker positions use MINIMAP coordinates (mapX = 90 - worldX,
  // mapZ = 123 - worldZ — see main.js drawMinimap) so they match what the
  // on-screen axis numbers read. Converted to world here:
  //   START  map (107, 57) -> world (-17, 66)
  //   FINISH map (87, 153) -> world (3, -30)
  const COURSE_START = { x: -17, z: 66 };        // START banner centre (map 107, 57) — big checkered arch
  const COURSE_FINISH_X = -5.6;                  // finish gate centre x (map ~95.6) — 2 car lengths (2×4.3) west of the carwash exit portal x=3, crossed WESTBOUND
  const COURSE_FINISH_Z = -30;                   // finish gate centre z (map 153) — ribbon spans the Z band around it
  const COURSE_FINISH_HALF = 10;                 // z half-span of the finish ribbon (doubled so you can't miss it)
  const COURSE_FINISH_DIR = '-x';                // ribbon is crossed WESTBOUND (-X), the Holy Mountain framed dead ahead
  await ugPhase(0.78, 'the bronze and stone statues');
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

// START banner at map (107, 57) = world (-17, 66): a big glowing checkered
  // arch at NORMAL height (posts as they were originally — the earlier 2× lift
  // was too high) so the car drives clean under it. The arch now spans EAST-
  // WEST at z=66 (rotated 90° from its old N-S line at x=-17, which sat
  // PARALLEL to the course's straight-down leg). Now the arch sits ACROSS the
  // southbound course, so as you come off the spiral tunnel (mouth ~(-61, 83),
  // car exits heading east) and swing left into the course you drive straight
  // INTO and under the checkered arch heading south.
  const startGate = makeStartGate(-26, 66, -8, 66, 0, Math.PI / 2);
  parent.add(startGate.group);
  // (The painted start line that used to sit right AT the spiral-tunnel exit
  // — crossed the moment the tube spits you out — was removed 2026-09-21.)

  // FINISH gate at map (87, 153) = world (3, -30), on the open south tundra.
  // Crossing it WESTBOUND (-X): the ribbon plane sits at x=3 and spans a Z
  // band, and the crossing heads straight at the Holy Mountain (-100, 8) —
  // the neon staircase is now behind your left shoulder instead of dead
  // ahead. Driving through bursts the ribbon apart into tumbling satin
  // shards (burstRibbon), which reassemble on the next run.
const finishGate = makeFinishGate(-5.6, -40, -5.6, -20, 0);
  parent.add(finishGate.group);
  addTileBar(-4.2, -30, 20.2, 'z', NEON.amber, 0);

  // The bubble wrap strip zone (z=-30 westbound straight) — the guide dots are
  // skipped over it below, just like they're skipped over the conveyor belt.
  const BUBBLE_ZONE = { minX: 46, maxX: 80, minZ: -33, maxZ: -27 };

  // ---- Serpentine dotted guide line (the bold green racing path) ----
  // A bold dotted LIME line painted flat on the cavern floor — the route a
  // lap follows. It starts right AT the START banner, runs STRAIGHT south
  // down the waterfall's open west flank (never near its front), then turns
  // LEFT — map-left = world EAST — and runs BEHIND the candy waterfall,
  // passing right through world (20, 37) = minimap (70, 86). The waterfall's
  // FRONT is its north foot (where you drive up the ramp); the track stays
  // under the ceiling on the falls' SOUTH side, so the "green spheres" course
  // reads as a separate option from "run the candy waterfall". From behind
  // the falls it snakes back and forth underneath the ceiling (shorter than
  // before) and finally runs west through the finish ribbon. The dots are
  // pure floor paint — NEVER a collider. The factory machinery added 2026-09-22
  // (spinning gear clusters, the steam press gantry over the z=0 lane, the car
  // wash over the z=-30 approach) sits on this line so the green dots thread
  // through it.
  // World waypoint lanes (minimap mapZ = 123 - z): start z=66 (map 57) →
  // behind-run z=37 (map 86, at x≈20 = map 70) → lanes z = 17, 0, -30 (map
  // 106, 123, 153) → finish (3, -30) (map 87, 153). The lanes span x from 14
  // (map 76) to 134 (off-map). Two InstancedMeshes = one draw call per color:
  // the lime dots ARE the line; driving THROUGH a dot moves it into the blue
  // InstancedMesh (a darker glowing blue) — permanent, per-dot, so as you
  // work your way along the course the whole snake gradually turns blue
  // behind you. (Per-instance colors via setColorAt would NOT work here: the
  // neon look is EMISSIVE, and instanceColor only tints the diffuse channel.)
  const GUIDE_DOT_R = 0.5;    // dot radius — bold
  const GUIDE_STEP = 5.4;     // centre-to-centre spacing along the path (~⅓ the dots)
  const GUIDE_HIT = 6.0;      // horizontal "turned" radius around a dot centre — very generous,
                              // so dots light blue when you drive NEAR them, not only on top
                              // (doubled to 6.0 on 2026-09-22 per feedback)
  const GUIDE_HOT = 0x2f5bff; // the darker glowing blue a driven dot turns into
  const guidePts = [
    [-17, 66], [-17, 37], [134, 37], [134, 17],
    [14, 17], [14, 0], [134, 0], [134, -30], [14, -30], [3, -30],
  ];
  let guideDist = 0;
  for (let i = 1; i < guidePts.length; i++) {
    guideDist += Math.hypot(guidePts[i][0] - guidePts[i - 1][0], guidePts[i][1] - guidePts[i - 1][1]);
  }
  const guideN = Math.ceil(guideDist / GUIDE_STEP) + 1;
  const guideDotsLime = new THREE.InstancedMesh(
    new THREE.SphereGeometry(GUIDE_DOT_R, 12, 8),
    makeGlowMat(NEON.lime),
    guideN
  );
  const guideDotsBlue = new THREE.InstancedMesh(
    new THREE.SphereGeometry(GUIDE_DOT_R, 12, 8),
    makeGlowMat(GUIDE_HOT),
    guideN
  );
  // Both meshes: instances sit far from the geometry's local bounding sphere.
  guideDotsLime.frustumCulled = false;
  guideDotsBlue.frustumCulled = false;
  const guideDot = new THREE.Object3D();               // dot placement temp
  const _guideHide = new THREE.Vector3(0, -200, 0);    // "gone" hiding temp
  const _guideOne = new THREE.Vector3(0.001, 0.001, 0.001);  // vanish scale temp
  const _guideQuat = new THREE.Quaternion();           // identity temp
  const _guideZero = new THREE.Matrix4();              // zero matrix for vanished dots
  const guideX = new Float32Array(guideN);             // dot centres (world x/z at floor height)
  const guideZ = new Float32Array(guideN);
  const guideLit = new Uint8Array(guideN);             // 1 once the player has driven through
  let guideAcc = 0;
  let guideCount = 0;
  outer: for (let i = 1; i < guidePts.length; i++) {
    const ax = guidePts[i - 1][0], az = guidePts[i - 1][1];
    const bx = guidePts[i][0], bz = guidePts[i][1];
    const len = Math.hypot(bx - ax, bz - az);
    while (guideAcc <= len) {
      const t = guideAcc / len;
      const gx = ax + (bx - ax) * t;
      const gz = az + (bz - az) * t;
      // Skip any dot that would sit ON the conveyor belt — the belt is a
      // solid machine and the green path spheres shouldn't mark it.
      if (gx >= CONVEYOR.cx - CONVEYOR.len / 2 - 0.4 && gx <= CONVEYOR.cx + CONVEYOR.len / 2 + 0.4
        && gz >= CONVEYOR.cz - CONVEYOR.wid / 2 - 0.4 && gz <= CONVEYOR.cz + CONVEYOR.wid / 2 + 0.4) {
        guideAcc += GUIDE_STEP;
        if (guideAcc > len) break;
        continue;
      }
      // Skip any dot that would sit ON the bubble wrap strip — the bubbles are
      // their own path marker, so the green spheres shouldn't mark that zone
      // either (they stop before it and pick up again at the car wash).
      if (gx >= BUBBLE_ZONE.minX && gx <= BUBBLE_ZONE.maxX
        && gz >= BUBBLE_ZONE.minZ && gz <= BUBBLE_ZONE.maxZ) {
        guideAcc += GUIDE_STEP;
        if (guideAcc > len) break;
        continue;
      }
      // Skip dots buried inside the factory machine (and its flyover ramp) on
      // the z=17 lane — the path leaps the building and picks up past it.
      if (gx >= 46 && gx <= 106 && gz >= 10 && gz <= 24) {
        guideAcc += GUIDE_STEP;
        if (guideAcc > len) break;
        continue;
      }
      guideX[guideCount] = gx;
      guideZ[guideCount] = gz;
      guideDot.position.set(gx, GUIDE_DOT_R, gz);
      guideDot.updateMatrix();
      guideDotsLime.setMatrixAt(guideCount, guideDot.matrix);
      guideCount++;
      if (guideCount >= guideN) break outer;
      guideAcc += GUIDE_STEP;
    }
    guideAcc -= len;
  }
  guideDotsLime.count = guideCount;
  guideDotsBlue.count = 0;
  guideDotsLime.instanceMatrix.needsUpdate = true;
  parent.add(guideDotsLime);
  parent.add(guideDotsBlue);
  let guideBlueCount = 0;   // how many dots have been driven blue so far

  // Finish-ribbon burst (the "break apart like floating ribbons" moment):
  // when the car crosses the gate the ribbon disappears and a dozen thin red
  // satin strips spin apart off the crossing line — half peel left, half
  // right, fanning through the car. They lift, then fall under the same
  // gravity as the car and tumble away; once the last shard despawns the
  // whole ribbon respawns so the next run can burst it once more.
  const ribbonShards = [];
  let ribbonShardMat = null;
  function burstRibbon(hitX, hitZ) {
    if (finishGate.ribbon) finishGate.ribbon.visible = false;
    if (!ribbonShardMat) {
      ribbonShardMat = new THREE.MeshStandardMaterial({
        map: makeSatinTexture(),
        side: THREE.DoubleSide,
        roughness: 0.32,
        metalness: 0.05,
        emissive: 0xff2233,
        emissiveIntensity: 0.9,
      });
    }
    const n = 12;
    // The shards fan out along the ribbon's span: the -x gate spreads along
    // Z, the +z gate (the northbound finish) along X.
    const isZGate = COURSE_FINISH_DIR === '+z';
    const A = isZGate ? COURSE_FINISH_X - COURSE_FINISH_HALF : COURSE_FINISH_Z - COURSE_FINISH_HALF;
    const B = isZGate ? COURSE_FINISH_X + COURSE_FINISH_HALF : COURSE_FINISH_Z + COURSE_FINISH_HALF;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const side = i < n / 2 ? -1 : 1;   // split into a left and a right burst
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(isZGate ? 0.7 + Math.random() * 0.4 : 0.55, 0.14, isZGate ? 0.55 : 0.7 + Math.random() * 0.6),
        ribbonShardMat
      );
      mesh.position.set(
        isZGate ? A + (B - A) * t : hitX,
        1.25 + Math.random() * 0.5,
        isZGate ? hitZ : A + (B - A) * t
      );
      mesh.rotation.x = (Math.random() - 0.5) * 0.4;
      mesh.rotation.z = (side === -1 ? -1 : 1) * (0.5 + Math.random() * 0.8);
      mesh.castShadow = true;
      parent.add(mesh);
      ribbonShards.push({
        mesh,
        vx: side * (6 + Math.random() * 7),
        vy: 4 + Math.random() * 5,
        vz: (Math.random() - 0.5) * 4,
        rvx: (Math.random() - 0.5) * 10,
        rvy: (Math.random() - 0.5) * 10,
        rvz: (Math.random() - 0.5) * 10,
        age: 0,
        life: 3.0,
      });
    }
  }

  // ---- The Holy Mountain (hollow snow-capped peak, west cavern) ----
  // A full cone rising off the open western floor: drive the pilgrim's road

  await ugPhase(0.81, 'the holy mountain');
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
    // Four pivot-point legs (front-left, front-right, back-left, back-right)
    // so the herd can walk, trot and leap — each leg hangs from a hip pivot
    // that the update section swings with a gait cycle.
    const legPivots = [];
    const legHome = [[-0.55, 0.42], [0.55, 0.42], [-0.55, -0.42], [0.55, -0.42]];
    for (const [lx, lz] of legHome) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.5, lz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), goatMat);
      leg.position.y = -0.25;
      pivot.add(leg);
      g.add(pivot);
      legPivots.push(pivot);
    }
    g.goatLegs = legPivots;
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
    // One-shot flag set by main.js right when the chamber cinematic ends (the
    // car is kicked back out over the cone) — the update loop reads it to arm
    // the 30 s goat-pilgrimage countdown.
    ejectFlag: false,
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

  // ---- The goat pilgrimage (2026-09-22) ----
  // 30 s after the car is mysteriously kicked out of the mountain, the whole
  // herd of a dozen goats LAUNCHES out of the summit — each on its own azimuth,
  // flying a ballistic arc out of the mountaintop exactly like the car was
  // flung (same launch point, same gravity, tumbling mid-air) — then they
  // scramble off their knees and chase the little car around the cavern. Purely
  // decorative — no colliders, so they never block anything; if the little car
  // is tucked away they follow the player's car instead.
  const GOAT_HERD = 12;
  const GOAT_GRAVITY = 18;                 // match the car's ejection arc (main.js `gravity`)
  // How close the player car has to get before a goat bolts, how fast it runs
  // while fleeing (deliberately faster than the player car's top speed so it
  // genuinely gets away — same arcade logic as the city pedestrians), and how
  // long the panic lasts once the coast is clear.
  const GOAT_FLEE_TRIGGER = 7;
  const GOAT_FLEE_SPEED = 30;
  const GOAT_FLEE_HOLD = 1.2;
  // The goat herd never hangs together as one unit: each goat keeps its own
  // wide orbit around the follower (7..13 units out), its own gate, its own
  // wandering drift, and its own walk cadence.
  const goatEvent = { timer: -1 };
  const goatCrew = [];
  const goatColliders = [];
  for (let k = 0; k < GOAT_HERD; k++) {
    const mesh = makeGoat();
    mesh.scale.setScalar(1.15);
    mesh.visible = false;
    const phi = (k / GOAT_HERD) * Math.PI * 2 + Math.PI / 12;
    // Each goat carries a small SOLID collider so neither the player car nor the
    // little car can drive through it — but it's parked far off-map until the
    // goat actually lands and starts following (during wait/fly the collider
    // stays inert so it can't block the course from the spawn area). noRoof
    // keeps it a pure wall (never a surface the car could be elevated by).
    const col = { x: 9999, z: 9999, halfW: 0.8, halfD: 1.1, h: 1.5, noRoof: true };
    goatColliders.push(col);
    goatCrew.push({
      mesh, phi,
      state: 'wait',            // wait → fly → follow
      delay: k * 0.18,          // staggered blast-off
      vx: 0, vy: 0, vz: 0,      // ballistic velocity (set at launch)
      tumble: Math.random() * 12 + 4,
      bob: Math.random() * Math.PI * 2,
      orbitR: 7 + Math.random() * 6,        // own distance ring (big spacing)
      orbitA: Math.random() * Math.PI * 2,  // own angle around the follower
      driftT: Math.random() * Math.PI * 2,  // wander phase (drifts the orbit slowly)
      speed: 2 + Math.random() * 1.8,       // own pace (gait varies per goat)
      gate: Math.random() > 0.5 ? 1 : -1,   // wander/heading flips
      gaitPh: Math.random() * Math.PI * 2,  // own walk-cycle phase (never in lockstep)
      leap: 0,                              // leap-bounce arc progress (0 = grounded)
      flee: null,               // { dx, dz, t } while bolting from the player car
      col,
    });
    parent.add(mesh);
  }

  await ugPhase(0.82, 'the glass city skyline');

  const glassCity = addGlassCity(parent, {
    // Idea #25: a crystal cluster popping when the car runs into it.
    onCrystalPop: typeof opts.onGlassPop === 'function' ? opts.onGlassPop : null,
    // A street ghost picking the car up and dropping it at the waterfall's foot.
    onGhostRide: typeof opts.onGhostRide === 'function' ? opts.onGhostRide : null,
  });
  const cityGlow = new THREE.PointLight(0x9fb8ff, 2.4, 190, 1);
  cityGlow.position.set(0, 26, 152);
  parent.add(cityGlow);

  // Foreboding sky above the cavern ceiling (dark dome, drifting dark
  // clouds, a scatter of stars, colorful constellations) — visible from the
  // second roof and through crumbled holes. Purely decorative.
  await ugPhase(0.9, 'the underground sky');
  const sky = addUndergroundSky(parent, mergeGeoms);

  await ugPhase(0.94, 'the finish line');

  // ==========================================================================
  // Factory-floor attractions (2026-09-23): five large novelties that chase the
  // serpentine course. All placements were checked against the existing lane
  // geometry — the z=17 lane passes OVER the machine bridge (x 50..92), so the
  // bubble wrap strip moved to the clear z=-30 westbound straight, and the
  // express tube's exit re-routed to x≈99..100 (EAST of the machine bridge, and
  // east of the steam press at x=74) so the drop lands on open belt.
  // ==========================================================================

  // ---- 1. Car-sized bubble wrap strip (on-course, z=-30 westbound) --------
  // A long sheet of plain translucent floor bubbles across the westbound
  // straight (x∈[46,80], z∈[-33,-27]) that approaches the car wash. Driving
  // over it pops bubbles (THWACK + haptic + steering-wobble in main.js reads
  // `bubbleStrip.zone` + `bubbleStrip.pops`). Bubbles are instanced domes on
  // the floor; each pop flattens one and it slowly re-inflates. They read as
  // glossy translucent BLUE air bubbles (kept blue — the green course spheres
  // are skipped off this strip, see the guide-dot loop above).
  const BUBBLE_R = 0.85;
  const bubbleGeom = new THREE.SphereGeometry(BUBBLE_R, 14, 9);
  bubbleGeom.scale(1, 0.5, 1);   // squashed dome, base wide + low profile
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0x7ec8ff, emissive: 0x2f6fb8, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.55, roughness: 0.25,
  });
  const _bm = new THREE.Matrix4();
  const bubbles = [];
  {
    const bsx = BUBBLE_ZONE.maxX - BUBBLE_ZONE.minX;   // 34
    const bs = BUBBLE_ZONE.maxZ - BUBBLE_ZONE.minZ;     // 6
    const nx = Math.round(bsx / 1.7) + 1;               // ~21
    const nz = Math.round(bs / 1.7) + 1;                // ~4
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const jx = (Math.random() - 0.5) * 0.5;
        const jz = (Math.random() - 0.5) * 0.5;
        bubbles.push({
          x: BUBBLE_ZONE.minX + 0.85 + (i / (nx - 1)) * (bsx - 1.7) + jx,
          z: BUBBLE_ZONE.minZ + 0.85 + (j / (nz - 1)) * (bs - 1.7) + jz,
          scale: 1,
          regrow: 0,       // seconds before re-inflating starts
          popFlash: 0,     // 1 right when this bubble pops (visual spike)
          lastPop: 0,      // last `elapsed` this bubble was popped (pop pacing)
        });
      }
    }
  }
  const bubbleMesh = new THREE.InstancedMesh(bubbleGeom, bubbleMat, bubbles.length);
  bubbles.forEach((b, i) => {
    _v3a.set(b.x, 0.3 * b.scale, b.z);
    _v3b.set(1, b.scale, 1);
    _bm.compose(_v3a, _quat.identity(), _v3b);
    bubbleMesh.setMatrixAt(i, _bm);
  });
  bubbleMesh.instanceMatrix.needsUpdate = true;
  parent.add(bubbleMesh);
  const bubbleStrip = {
    zone: BUBBLE_ZONE,
    pops: 0,      // monotonic pop counter — main.js diffs it to trigger sfx/shake
    lastPopTime: 0,
  };

  // ---- 2. Taffy-puller machine (open-frame drive-through on the z=-30 lane) -
  // An OPEN-FRAME industrial taffy machine straddling the westbound z=-30 lane
  // at x=128 — you drive the car straight through it like a car wash. The old
  // glass box is gone: a gantry of steel uprights, top beams, cross ties and
  // mid rails frames the machine wide open on the east/west faces so every part
  // is visible from the lane and the car can rumble right through the middle.
  // Inside, two counter-rotating chrome hooks sweep across the lane (posts at
  // (128,-26) and (128,-34), one each side of the car's path), a train of
  // gears, pulleys and pistons churn, and an endless chain racetracks around
  // the whole unit right over/under the car as it passes through. A car under
  // a sweep gets hooked (main.js calls `taffy.hookedAt(x,z)` → trip the
  // carTaffyMode noodle-stretch). The arms NEVER become colliders — the hook
  // _grabs and stretches_ the car, it doesn't smash it.
  const TAFFY = [
    { x: 128, z: -26, armLen: 6, phase: 0,    tipAngle: 0.9,  angle: 0, cd: 0, snap: 0 },
    { x: 128, z: -34, armLen: 6, phase: Math.PI, tipAngle: -0.9, angle: 0, cd: 0, snap: 0 },
  ];
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8e2ea, metalness: 0.95, roughness: 0.18 });
  const taffySteel = new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.85, roughness: 0.3 });
  const taffyArms = [];
  const taffyMotion = [];   // {kind, ref, speed, phase} spun in update()
  // ---- Open-frame gantry: a steel cage over the two hook posts, wide open on
  // ---- the east/west faces so the car drives straight through the machine.
  // ---- Four corner uprights (straddling the westbound z=-30 lane around the
  // ---- posts at z=-26/-34), top beams + cross ties, neon mid rails and a
  // ---- glowing portal bar on each open end. Pure decor — no colliders, the
  // ---- car plows through the frame like the car-wash whites.
  {
    const spanX = 8.6;       // east-west opening (x 123.7 … 132.3)
    const spanZ = 8.2;       // north-south opening (z -34.1 … -25.9)
    const upY = 6.6;         // upright + top-beam height
    const posts = [[128 - spanX / 2, -25.9], [128 + spanX / 2, -25.9], [128 - spanX / 2, -34.1], [128 + spanX / 2, -34.1]];
    for (const [px, pz] of posts) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.5, upY, 0.5), taffySteel);
      upright.position.set(px, upY / 2, pz);
      upright.castShadow = true;
      parent.add(upright);
    }
    // Two long top beams running east-west over each side of the lane.
    for (const pz of [-25.9, -34.1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(spanX + 0.6, 0.5, 0.5), taffySteel);
      beam.position.set(128, upY, pz);
      beam.castShadow = true;
      parent.add(beam);
    }
    // Two shorter cross ties connecting the top beams across the lane.
    for (const px of [128 - spanX / 2, 128 + spanX / 2]) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, spanZ + 0.6), taffySteel);
      tie.position.set(px, upY, -30);
      tie.castShadow = true;
      parent.add(tie);
    }
    // Neon mid rails on the two open faces (car drives between them) + a
    // glowing portal bar overhead on each end, like a wash-bay arch.
    for (const pz of [-25.9, -34.1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(spanX - 0.4, 0.28, 0.28), makeGlowMat(NEON.cyan));
      rail.position.set(128, 4.6, pz);
      parent.add(rail);
    }
    for (let k = 0; k < 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, spanZ - 1.6), makeGlowMat(k ? NEON.magenta : NEON.amber));
      bar.position.set(k ? 128 - spanX / 2 : 128 + spanX / 2, 5.4, -30);
      parent.add(bar);
    }
  }
  // ---- Endless chain loop: links run around a vertical ring centred between
  // ---- the two posts (the racetrack ellipse of the stretched-open machine),
  // ---- at y≈3.1, so the belt visibly churns right over the passing car.
  {
    const CHAIN_N = 18;
    const chainGeom = new THREE.BoxGeometry(0.22, 0.5, 0.34);
    const chainMat = taffySteel;
    for (let k = 0; k < CHAIN_N; k++) {
      const link = new THREE.Mesh(chainGeom, chainMat);
      link.castShadow = true;
      parent.add(link);
      taffyMotion.push({ kind: 'chain', ref: link, speed: 1.6, phase: k / CHAIN_N });
    }
  }
  for (const h of TAFFY) {
    // Chrome post (floor → hip height) with a glowing base ring.
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3.4, 14), chromeMat);
    post.position.set(h.x, 1.7, h.z);
    post.castShadow = true;
    parent.add(post);
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.1, 8, 18),
      makeGlowMat(NEON.amber));
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.set(h.x, 0.42, h.z);
    parent.add(baseRing);
    // Big drive gear under the post — a heavy disc with 12 teeth, spinning.
    {
      const gear = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.4, 18), taffySteel);
      disc.castShadow = true;
      gear.add(disc);
      for (let k = 0; k < 12; k++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.42), taffySteel);
        tooth.position.x = 1.22;
        tooth.rotation.y = (k / 12) * Math.PI * 2;
        const holder = new THREE.Group();
        holder.add(tooth);
        holder.rotation.y = (k / 12) * Math.PI * 2;
        gear.add(holder);
      }
      gear.position.set(h.x, 0.95, h.z);
      parent.add(gear);
      taffyMotion.push({ kind: 'spin', ref: gear, speed: 2.4, dir: h.z === -22 ? -1 : 1 });
      // A small meshing pinion beside the gear, counter-rotating against it.
      const pinion = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.42, 8), chromeMat);
      pinion.position.set(h.x + 1.55, 0.95, h.z);
      parent.add(pinion);
      taffyMotion.push({ kind: 'spin', ref: pinion, speed: -6.5, dir: h.z === -22 ? -1 : 1 });
    }
    // Overhead pulley: a grooved steel wheel on each post top, spinning fast.
    {
      const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 14), chromeMat);
      pulley.position.set(h.x, 3.9, h.z);
      pulley.castShadow = true;
      parent.add(pulley);
      const groove = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 8, 18), makeGlowMat(NEON.cyan));
      groove.rotation.x = Math.PI / 2;
      groove.position.set(h.x, 3.9, h.z);
      parent.add(groove);
      taffyMotion.push({ kind: 'pulley', ref: pulley, speed: 3.2, dir: h.z === -22 ? -1 : 1 });
    }
    // Sweeping arm: horizontal chrome rod pivoting about Y at the post top.
    const armPivot = new THREE.Group();
    armPivot.position.set(h.x, 3.0, h.z);
    parent.add(armPivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(h.armLen, 0.18, 0.18), chromeMat);
    arm.position.set(h.armLen / 2, 0, 0);
    arm.castShadow = true;
    armPivot.add(arm);
    // Hook claw at the far tip (an L-bend that reads as "pulls you out").
    // Cloned from the glow cache because the sweep pulses its emissive per arm.
    const claw = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 8),
      makeGlowMat(NEON.magenta).clone());
    claw.rotation.z = Math.PI / 2;
    claw.position.set(h.armLen - 0.2, 0, 0);
    armPivot.add(claw);
    // A piston riding the arm's axle — bobs up/down as the arm sweeps, another
    // visible moving part for people watching from the course.
    const piston = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.6, 0.24), chromeMat);
    piston.position.set(h.armLen * 0.35, 0.7, 0);
    armPivot.add(piston);
    taffyArms.push({ hook: h, armPivot, claw });
  }
  const taffy = {
    hits: 0,   // monotonic hook counter, main.js edges on it for the THWACK
    // A car point (x,z) is hooked when it sits within the sweep radius of a
    // hook that's on-cooldown. On a hit mark the hook's snap animation + cd.
    hookedAt(x, z) {
      for (const a of taffyArms) {
        const h = a.hook;
        if (h.cd > 0) continue;
        const tipX = h.x + Math.cos(h.angle) * h.armLen;
        const tipZ = h.z - Math.sin(h.angle) * h.armLen;
        const dx = x - tipX, dz = z - tipZ;
        if (dx * dx + dz * dz < 2.4 * 2.4) {
          h.cd = 2.2;          // cooldown keeps a lingering car from re-tripping
          h.snap = 0.5;        // arm lunges at the car for a beat
          taffy.hits++;
          return true;
        }
      }
      return false;
    },
    get hooks() { return TAFFY; },
    reset() {
      for (const a of taffyArms) {
        a.hook.cd = 0;
        a.hook.snap = 0;
        a.claw.material.emissiveIntensity = 1;
      }
    },
  };

  // ---- 3. Industrial magnet pit-stop (on the eastbound belt lane) -----------
  // A huge electromagnet hangs from the ceiling at (55,0), radius 9, right over
  // the eastbound conveyor belt lane (z=0, x 41..107) — clear of the machine
  // bridge at x=92 and the steam press beyond it. A timer runs ON 3.2s / OFF
  // 4.8s; while active (`magnet.active`) main.js yanks a near grounded car up
  // off the belt to `magnet.holdY`, spins its wheels and hangs it until the
  // field drops. A red coil + translucent beam read the state from across the
  // cavern.
  const MAGNET = { x: 55, z: 0, r: 9, holdY: 27, on: 3.2, off: 4.8 };
  const magnetSteel = new THREE.MeshStandardMaterial({ color: 0x4a4a55, roughness: 0.4, metalness: 0.9 });
  const magGroup = new THREE.Group();
  magGroup.position.set(MAGNET.x, 0, MAGNET.z);
  {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.2, 22), magnetSteel);
    core.position.y = MAGNET.holdY;
    core.castShadow = true;
    magGroup.add(core);
    // Coil clone — the update loop pulses emissiveIntensity on it each frame.
    const coil = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.28, 12, 26), makeGlowMat(NEON.red).clone());
    coil.rotation.x = Math.PI / 2;
    coil.position.y = MAGNET.holdY - 0.15;
    magGroup.add(coil);
    // Translucent pull beam (faint when off, bright while active).
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 6.5, MAGNET.holdY, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff5560, transparent: true, opacity: 0.06,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    beam.position.y = MAGNET.holdY / 2;
    magGroup.add(beam);
    const magLight = new THREE.PointLight(0xff4455, 0, 60, 2);
    magLight.position.y = MAGNET.holdY - 3;
    magGroup.add(magLight);
    magGroup.userData = { beam, light: magLight, coil };
  }
  parent.add(magGroup);
  const magnet = { x: MAGNET.x, z: MAGNET.z, r: MAGNET.r, holdY: MAGNET.holdY, active: false, t: 0, hits: 0 };

  // ---- 4. (removed — the pinball plunger shortcut is deleted; it didn't work)

  // ---- 5. Pneumatic express tube (under the course tiles, SW-corner exit) ---
  // A clear glass tube rising off the open floor south of the Glass City
  // (intake at (12,113)), climbing to hug the underside of the checkerboard
  // ceiling tiles over the obstacle course (y≈28), threading a wide arc around
  // the ceiling magnet at (55,0), then descending to drop the car at world
  // (-53,-28) on the empty floor of the far south-west corner. The tube is
  // built from the pure path math in src/modules/expressTube.js; air-jet rings
  // ride the centre line so the forced ride reads as pneumatic suction.
  const tubePts = expressTubeSamples().map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const tubeCurve = new THREE.CatmullRomCurve3(tubePts);
  const tubeGeo = new THREE.TubeGeometry(tubeCurve, tubePts.length, EXPRESS_TUBE.R, 14, false);
  const tubeGlass = new THREE.MeshPhysicalMaterial({
    color: 0xbfe9ff, roughness: 0.05, metalness: 0.1,
    transparent: true, opacity: 0.13, side: THREE.DoubleSide,
    emissive: 0x2fd0ff, emissiveIntensity: 0.5, envMapIntensity: 1,
  });
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeGlass);
  tubeMesh.castShadow = true;
  parent.add(tubeMesh);
  // Glory rings + air-jet torus rings along the tube (animated in update()).
  const tubeRings = [];
  for (let k = 0; k < EXPRESS_TUBE.RING_COUNT; k++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(EXPRESS_TUBE.R + 0.35, 0.12, 8, 22),
      makeGlowMat(k % 2 ? NEON.cyan : NEON.lime)
    );
    parent.add(ring);
    tubeRings.push(ring);
  }
  // Boarding pads at BOTH mouths — the tube is a two-way ride. Each mouth gets
  // the same glowing amber ring (and cyan halo) as a "board here" affordance:
  // the glass-city pad (s≈0) and the skate-park pad (s≈1). Main.js grabs at
  // either mouth and carries the car to the far end.
  for (const sEnd of [0, 1]) {
    const mouth = expressTubePoint(sEnd);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(EXPRESS_TUBE.GRAB_R, 28),
      makeGlowMat(NEON.amber));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(mouth.x, 0.05, mouth.z);
    parent.add(pad);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(EXPRESS_TUBE.GRAB_R, 0.22, 10, 24),
      makeGlowMat(NEON.cyan));
    halo.rotation.x = Math.PI / 2;
    halo.position.set(mouth.x, 0.35, mouth.z);
    parent.add(halo);
  }
  // `dir` mirrors the player's current express ride direction so the level can
  // flip the air-jet ring flow: +1 glass-city → skate-park, -1 the return ride.
  // main.js writes +1 on a forward grab, -1 on a reverse grab, and back to +1
  // when a ride ends.
  const expressTube = { entrance: { x: 12, z: 113 }, exit: { x: -53, z: -28 }, rings: tubeRings, dir: 1 };

// ---- Sunken blue-wave halfpipe (south-west free-skate fun zone) ----
  // The pipe no longer sits ON the floor — it's a trough carved BELOW it, with
  // its lips flush at y=0. The U runs north-south with open mouths at both
  // ends: drive in straight over a mouth apron or drop in over a lip, bank up
  // the curved wave walls and pump the vert. Everything from the old pipe's
  // playbook still applies: physics walls are wedge-tiled ride surfaces, the
  // lips carry pipeTop (the vert-pop rocket), steep faces carry pipeSlide, and
  // main.js's keep-in (ugPipe) reins an airborne car back inside so it never
  // lands out over the lip. It now sits in the corridor between the neon
  // staircase and the cave wall, clear floor on both sides.
  const HALFPIPE = SS.pipe;   // keep-in logic in main.js reads cx/cz/len/bottomHalf/wallRun
  await ugPhase(0.92, 'the sunken blue-wave halfpipe');
  const pipeDepth = (p) => p.wallRise + p.bottomHalf;

  // Physics wedges for one vertical wall of a sunken pipe + a visual shell.
  // The ride profile rises monotonically from the trough centre out to the lip,
  // all at negative y (trough bottom = -(wallRise + bottomHalf), lip = 0). The
  // shell is drawn a hair OUTSIDE the ride face so nothing z-fights the wave
  // texture. Mouth aprons at each open end make straight entry rideable.
  function addSunkPipe(p, mat) {
    const R = p.bottomHalf, WR = p.wallRun, Wr = p.wallRise;
    const depth = pipeDepth(p);
    const segB = p.bowlSegs || 12, segW = p.wallSegs || 3;
    const prof = [];
    for (let k = 0; k <= segB; k++) {
      const px = R * (k / segB);
      prof.push([px, R - Math.sqrt(R * R - px * px) - depth]);
    }
    for (let k = 1; k <= segW; k++) {
      const t = k / segW;
      prof.push([R + WR * t, Wr * t - Wr]);
    }
    const left = prof.map(([px, yy]) => [-px, yy]);
    for (const [sgn, wall] of [[1, prof], [-1, left]]) {
      for (let k = 0; k < wall.length - 1; k++) {
        const [xa, ya] = wall[k];
        const [xb, yb] = wall[k + 1];
        const sx = Math.sign(xb - xa);
        ugRamps.push({
          x: p.cx + (xa + xb) / 2, z: p.cz,
          runX: sx, runZ: 0,
          len: Math.abs(xb - xa),
          width: p.len,
          baseY: ya,
          height: yb - ya,
          boost: 0,                              // bowls never launch — vert handles it
          pipeTop: k === wall.length - 2,        // the lip wedge = the vertical pop edge
          pipeLaunch: p.launch || 0,             // per-pipe vert-pop power (giant pipe rockets)
          pipeSlide: (yb - ya) > Math.abs(xb - xa) * 0.47,
        });
      }
      const lip = wall[wall.length - 1];
      const outerX = lip[0] + sgn * (p.wallThick || 0.9);
      const yMin = Math.min.apply(null, wall.map((q) => q[1])) - 1.4;
      const shape = new THREE.Shape();
      shape.moveTo(wall[0][0], wall[0][1]);
      for (const q of wall) shape.lineTo(q[0] * 1.015, q[1] - 0.04);
      shape.lineTo(outerX, lip[1] - 0.04);
      shape.lineTo(outerX, yMin);
      shape.lineTo(wall[0][0], yMin);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.len, bevelEnabled: false });
      geo.translate(0, 0, -p.len / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.cx, 0, p.cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    // Mouth aprons: drive in straight over either open end instead of hovering
    // at floor level. Surf is 0 at the mouth line, sloping down to the trough
    // floor over 2.2 units into the pipe.
    const mouthW = 2 * (R + WR) - 0.4;
    addUgRamp({ x: p.cx, z: p.cz - p.len / 2 + 1.1, runX: 0, runZ: -1, len: 2.2, width: mouthW, baseY: -depth, height: depth, boost: 0 }, mat);
    addUgRamp({ x: p.cx, z: p.cz + p.len / 2 - 1.1, runX: 0, runZ: 1, len: 2.2, width: mouthW, baseY: -depth, height: depth, boost: 0 }, mat);
  }
  // Glossy tile stretched over a pipe's walls (no asset files):
// ONE ceramic slab per texture (the same 2-world-unit pitch as the kitchen
// floor tile — repeat 0.5 turns each canvas into a ~2-unit tile), with grout
// seams on the tile border, a painted top-left sheen, and a diagonal glint so
// the surface reads shiny in the dark cavern. Tiles seamlessly on both axes.
  const makeWaveTile = (palette) => {
    const S = 256, GRID = 1;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const cell = S / GRID;
    for (let ty = 0; ty < GRID; ty++) {
      for (let tx = 0; tx < GRID; tx++) {
        const x0 = tx * cell, y0 = ty * cell;
        const grad = g.createLinearGradient(x0, y0, x0 + cell, y0 + cell);
        grad.addColorStop(0.0, palette.base[0]);
        grad.addColorStop(0.35, palette.base[1]);
        grad.addColorStop(0.65, palette.base[2]);
        grad.addColorStop(1.0, palette.base[3]);
        g.fillStyle = grad;
        g.fillRect(x0, y0, cell, cell);
        // Painted gloss so each slab reads glossy even without an env map.
        const sheen = g.createRadialGradient(x0 + cell * 0.28, y0 + cell * 0.28, 1, x0 + cell * 0.28, y0 + cell * 0.28, cell * 0.95);
        sheen.addColorStop(0, palette.sheen);
        sheen.addColorStop(0.35, palette.sheen2);
        sheen.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sheen;
        g.fillRect(x0, y0, cell, cell);
        g.strokeStyle = palette.grout;
        g.lineWidth = 2;
        g.strokeRect(x0 + 1, y0 + 1, cell - 2, cell - 2);
      }
    }
    // Whole-sheet diagonal glint so the grid never reads flat.
    const glint = g.createLinearGradient(0, 0, S, S);
    glint.addColorStop(0, palette.glint);
    glint.addColorStop(0.42, 'rgba(0,0,0,0)');
    glint.addColorStop(0.58, 'rgba(0,0,0,0)');
    glint.addColorStop(1, palette.glint2);
    g.fillStyle = glint;
    g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(0.5, 0.5);   // every canvas = one ~2-unit tile (kitchen-tile pitch)
    return t;
  };
  // Blue slabs for the mini vert pipe; dark green for the giant far-corner pipe.
  const waveTex = makeWaveTile({
    base: ['#24456b', '#12263f', '#0d1e33', '#0a1829'],
    sheen: 'rgba(130,180,230,0.55)', sheen2: 'rgba(70,120,180,0.16)',
    grout: '#27415e', glint: 'rgba(160,210,255,0.20)', glint2: 'rgba(160,210,255,0.12)',
  });
  const pipeTex = makeWaveTile({
    base: ['#275c35', '#14381f', '#0d2b16', '#082013'],
    sheen: 'rgba(120,220,155,0.50)', sheen2: 'rgba(60,150,95,0.15)',
    grout: '#1f4028', glint: 'rgba(160,255,200,0.18)', glint2: 'rgba(160,255,200,0.10)',
  });
  const waveMat = new THREE.MeshStandardMaterial({
    map: waveTex, roughness: 0.3, metalness: 0.15,
    emissive: 0x0b213f, emissiveIntensity: 0.5, side: THREE.DoubleSide,
  });
  const pipeMat = new THREE.MeshStandardMaterial({
    map: pipeTex, roughness: 0.3, metalness: 0.15,
    emissive: 0x0b2a18, emissiveIntensity: 0.5, side: THREE.DoubleSide,
  });
  // Generic sunken trench (spine/eurobox/escalator/rail): a profile strip
  // swept across its width. A lone slab leaves an "invisible glass" strip
  // over the pit's long sides (no surface within ride range of the floor), so
  // each ~0.35-unit column of the profile is built as a full cross-section: a
  // centre slab plus two angled side banks that rise from the column floor up
  // to the rim (surf 0) — every edge is drive-in from the floor.
  function addTrench(cfg, axisZ) {
    const prof = cfg.prof;
    const W = cfg.width;
    const bank = Math.min(cfg.bank || 1.6, (W - 0.6) / 2);   // side slant width
    const inner = Math.max(0.6, W - 2 * bank);
    const col = 0.35;                 // max column length along the profile axis
    for (let k = 0; k < prof.length - 1; k++) {
      const a0 = prof[k][0], y0 = prof[k][1];
      const a1 = prof[k + 1][0], y1 = prof[k + 1][1];
      const dA = a1 - a0;
      if (dA <= 0) continue;
      const n = Math.max(1, Math.ceil(Math.abs(dA) / col));
      const lastSeg = k === prof.length - 2;
      for (let i = 0; i < n; i++) {
        const ta = i / n, tb = (i + 1) / n;
        const ca = a0 + (a1 - a0) * ta, cb = a0 + (a1 - a0) * tb;
        const ya = y0 + (y1 - y0) * ta, yb = y0 + (y1 - y0) * tb;
        const dC = cb - ca;
        const dy = yb - ya;
        const rising = dy >= 0;
        const hmi = (ya + yb) / 2;
        const def = {
          len: dC,
          width: inner,
          baseY: Math.min(ya, yb),
          height: Math.max(Math.abs(dy), 0.02),
          boost: 0,
          pipeSlide: Math.abs(dy) > Math.abs(dC) * 0.47,
        };
        if (axisZ) { def.x = cfg.cx; def.z = (ca + cb) / 2; def.runX = 0; def.runZ = rising ? 1 : -1; }
        else       { def.x = (ca + cb) / 2; def.z = cfg.cz; def.runX = rising ? 1 : -1; def.runZ = 0; }
        if (lastSeg && i === n - 1 && cfg.tipBoost) def.boost = cfg.tipBoost;
        addUgRamp(def);
        // Side banks (perpendicular slant): surf 0 at the hole's long edge,
        // dropping to this column's height where it meets the centre slab.
        if (Math.abs(hmi) < 0.08) continue;
        const bDef = { len: bank, width: dC, baseY: hmi, height: -hmi, pipeSlide: (-hmi) > bank * 0.47 };
        if (axisZ) {
          addUgRamp(Object.assign({ x: cfg.cx - W / 2 + bank / 2, z: (ca + cb) / 2, runX: -1, runZ: 0 }, bDef));
          addUgRamp(Object.assign({ x: cfg.cx + W / 2 - bank / 2, z: (ca + cb) / 2, runX: 1, runZ: 0 }, bDef));
        } else {
          addUgRamp(Object.assign({ x: (ca + cb) / 2, z: cfg.cz - W / 2 + bank / 2, runX: 0, runZ: -1 }, bDef));
          addUgRamp(Object.assign({ x: (ca + cb) / 2, z: cfg.cz + W / 2 - bank / 2, runX: 0, runZ: 1 }, bDef));
        }
      }
    }
  }

  // A flat pad — a wedge with negligible height sitting at `y`.
  function thinPad(x, z, halfX, halfZ, y) {
    addUgRamp({ x, z, runX: 1, runZ: 0, len: halfX * 2, width: halfZ * 2, baseY: y, height: 0.02, boost: 0 });
  }

  // Radial sunken bowl on a superellipse footprint. t is normalized radius
  // (0 = centre, 1 = rim); h(t) is the surface height at that radius. Bands ×
  // sectors tile the wall with outward-run wedges so every point under the
  // opening is within ride range — nothing hovers.
  function superRingPit(cfg) {
    const { cx, cz, rx, rz, p, tIn, bands, sectors, h, rimBoost } = cfg;
    for (let j = 0; j < bands; j++) {
      const t0 = tIn + (1 - tIn) * (j / bands);
      const t1 = tIn + (1 - tIn) * ((j + 1) / bands);
      const y0 = h(t0), y1 = h(t1);
      if (Math.abs(y1 - y0) < 0.0005) continue;
      for (let k = 0; k < sectors; k++) {
        const th = (k + 0.5) / sectors * Math.PI * 2;
        const ca = Math.cos(th), sa = Math.sin(th);
        const sc = Math.pow(Math.abs(ca / rx), p) + Math.pow(Math.abs(sa / rz), p);
        const ray = 1 / Math.pow(sc, 1 / p);
        const tm = (t0 + t1) / 2;
        const pos = ray * tm;
        const run = ray * (t1 - t0);
        addUgRamp({
          x: cx + ca * pos, z: cz + sa * pos,
          runX: ca, runZ: sa,
          len: run,
          width: Math.max(0.4, pos * Math.PI * 2 / sectors),
          baseY: y0, height: y1 - y0,
          boost: (j === bands - 1) ? rimBoost : 0,
          pipeSlide: (y1 - y0) > run * 0.47,
        });
      }
    }
  }

  // Neon rim loops just above the floor line around an opening polygon.
  function rimLoop(pts, color) {
    const mat = makeGlowMat(color);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.12, 0.16), mat);
      m.position.set((a[0] + b[0]) / 2, 0.045, (a[1] + b[1]) / 2);
      m.rotation.y = Math.atan2(dz, dx);
      parent.add(m);
    }
  }
  function rimRing(cx, cz, r, color) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.13, 8, 44), makeGlowMat(color));
    m.rotation.x = Math.PI / 2;
    m.position.set(cx, 0.05, cz);
    parent.add(m);
  }

  // --- The relocated halfpipe (fully sunken) — dark green tiles ---
  addSunkPipe(SS.pipe, pipeMat);
  // Carve-line strips low in the bowl + cyan lagoon lights at the mouths.
  {
    const stripY = -pipeDepth(SS.pipe) + 0.9;
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.12, SS.pipe.len - 2),
        makeGlowMat(NEON.cyan)
      );
      strip.position.set(SS.pipe.cx + side * (SS.pipe.bottomHalf - 2), stripY, SS.pipe.cz);
      parent.add(strip);
    }
    for (const side of [-1, 1]) {
      const pt = new THREE.PointLight(NEON.cyan, 1.2, 55, 2);
      pt.position.set(SS.pipe.cx, 8, SS.pipe.cz + side * SS.pipe.len / 2);
      parent.add(pt);
    }
  }
  rimLoop(SS.pipe.hole, NEON.cyan);

  // --- Vert pit: a tighter second fullpipe north of the spine ---
  addSunkPipe(SS.vert, waveMat);
  rimLoop(SS.vert.hole, NEON.cyan);

  // --- Spine: V-trench, crease 6 below the floor ---
  addTrench(SS.spine, false);
  rimLoop(SS.spine.hole, NEON.lime);

  // --- Hip: well at −5 with two climbing walls (NE) + descending cheeks
  //     from every rim so nothing in the opening hovers over the cut edge.
  thinPad(-78, -52, 4.5, 4.5, -5);     // well floor: tiles the whole hole
  // Climbing walls out of the well: east face up off the well's west edge,
  // north face up off the well's south edge — drop in anywhere and carve.
  addUgRamp({ x: -76, z: -52, runX: 1, runZ: 0, len: 5, width: 9, baseY: -5, height: 5, boost: 0.8, pipeSlide: true });
  addUgRamp({ x: -78, z: -50, runX: 0, runZ: 1, len: 5, width: 9, baseY: -5, height: 5, boost: 0.8, pipeSlide: true });
  // Cheeks: surf 0 at the rim, ~45° down into the well (surf reachable from
  // the floor so the rims never read as an invisible glass bridge).
  addUgRamp({ x: -81.5, z: -46.5, runX: 0, runZ: -1, len: 2, width: 2, baseY: -5, height: 5 });
  addUgRamp({ x: -81.25, z: -52, runX: -1, runZ: 0, len: 2.5, width: 9, baseY: -5, height: 5 });
  addUgRamp({ x: -78, z: -55.25, runX: 0, runZ: -1, len: 2.5, width: 10.5, baseY: -5, height: 5 });
  rimLoop(SS.hip.hole, NEON.amber);

  // --- Eurobox: drop arc → flat run → shelf step-up → exit lip ---
  addTrench(SS.euro, false);
  rimLoop(SS.euro.hole, NEON.amber);

  // --- Pyramid: near-square funnel crater ---
  {
    const P = SS.pyramid;
    superRingPit({
      cx: P.cx, cz: P.cz, rx: P.rx, rz: P.rz, p: P.p, tIn: P.tIn,
      bands: P.bands, sectors: P.sectors,
      h: (t) => P.depth * (t - 1), rimBoost: P.rimBoost,
    });
    thinPad(P.cx, P.cz, P.padHalf, P.padHalf, P.padY);
    rimLoop(P.hole, NEON.magenta);
  }

  // --- Foam pit: banks up the rim, soft vinyl bottom, inner kicker ---
  {
    const F = SS.foam;
    // Kicker FIRST so the ride-match finds its ramp before the bottom pad.
    addUgRamp({ x: -126, z: -84, runX: 1, runZ: 0, len: 2, width: 10, baseY: -3.5, height: 2, boost: 1.4, pipeSlide: true });
    superRingPit({
      cx: F.cx, cz: F.cz, rx: F.rx, rz: F.rz, p: F.p, tIn: F.tIn,
      bands: F.bands, sectors: F.sectors,
      h: (t) => -F.depth * ((1 - t) / (1 - F.tIn)), rimBoost: F.rimBoost,
    });
    thinPad(F.cx, F.cz, F.padHalf, F.padHalf, F.padY);
    rimRing(F.cx, F.cz, 7.88, NEON.red);
  }

  // --- Escalator: stepped flights running north-south ---
  addTrench(SS.escalator, true);
  rimLoop(SS.escalator.hole, NEON.cyan);

  // --- Cradle: a spherical bowl ---
  {
    const C = SS.cradle;
    superRingPit({
      cx: C.cx, cz: C.cz, rx: C.rx, rz: C.rz, p: C.p, tIn: C.tIn,
      bands: C.bands, sectors: C.sectors,
      h: (t) => -Math.sqrt(C.rx * C.rx - (C.rx * t) * (C.rx * t)), rimBoost: C.rimBoost,
    });
    thinPad(C.cx, C.cz, C.padHalf, C.padHalf, C.padY);
    rimRing(C.cx, C.cz, 5.9, NEON.magenta);
  }

  // --- Kidney: mellow shallow superellipse bowl ---
  {
    const K = SS.kidney;
    superRingPit({
      cx: K.cx, cz: K.cz, rx: K.rx, rz: K.rz, p: K.p, tIn: K.tIn,
      bands: K.bands, sectors: K.sectors,
      h: (t) => K.depth * (t - 1), rimBoost: K.rimBoost,
    });
    thinPad(K.cx, K.cz, K.padHalfX, K.padHalfZ, K.padY);
    rimLoop(K.hole, NEON.lime);
  }

  // --- Kinked rail slot (north-south, south-east of the eurobox) ---
  addTrench(SS.rail, true);
  rimLoop(SS.rail.hole, NEON.amber);

  await ugPhase(0.97, 'the sunken skate park');

  // ---- World edge: dark boundary wall with 5 neon bands ----
  // Rings the whole cavern slab so the car can't drive off the world. One
  // tall dark pillar per side, each wearing five horizontal neon glow bands
  // (one per NEON colour); hard colliders span the full wall height so neither
  // a ground car nor serious airtime clears them (covers the roof top too).
  const worldWallMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.92 });
  const worldWallColliders = [];
  // Visible trim is only one car length tall (~4.3) so the whole map reads
  // open over the rim — the five neon bands hug the INNER face, lit toward the
  // cavern. The real containment is an invisible full-height collider (h=44,
  // no mesh) that no grounded car can roll over, so the low trim never has to
  // double as a barrier. Colliders are unrotated axis-aligned boxes, so the
  // x/z radius must be split by WHICH axis the wall's length runs along —
  // swapping them puts a phantom "wall" across the middle of the map.
  const WALL_H = 4.3;                  // one car length
  const WALL_THICK = 1.0;
  const WALL_BLOCK_H = 44;             // invisible containment height (grounded cars)
  const wallBandY = [0.6, 1.4, 2.2, 3.0, 3.8];
  const wallBandColors = [NEON.cyan, NEON.amber, NEON.lime, NEON.magenta, NEON.red];
  const buildWallSide = (x0, z0, x1, z1, nx, nz) => {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    // The wall's centreline sits one thickness outside the slab edge (nx/nz
    // point outward); the bands sit on the inner (cavern) face.
    const cx = (x0 + x1) / 2 + nx * (WALL_THICK / 2);
    const cz = (z0 + z1) / 2 + nz * (WALL_THICK / 2);
    const rot = Math.atan2(dz, dx);   // align the wall's length along the edge
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_H, WALL_THICK), worldWallMat);
    wall.position.set(cx, WALL_H / 2, cz);
    wall.rotation.y = rot;
    wall.castShadow = true;
    wall.receiveShadow = true;
    parent.add(wall);
    for (let k = 0; k < wallBandColors.length; k++) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(len + 0.1, 0.12, 0.16),
        makeGlowMat(wallBandColors[k])
      );
      band.position.set(cx - nx * (WALL_THICK / 2 + 0.1), wallBandY[k], cz - nz * (WALL_THICK / 2 + 0.1));
      band.rotation.y = rot;
      parent.add(band);
    }
    const runsAlongX = Math.abs(dx) >= Math.abs(dz);
    worldWallColliders.push({
      x: cx, z: cz,
      halfW: runsAlongX ? len / 2 : WALL_THICK / 2 + 0.15,
      halfD: runsAlongX ? WALL_THICK / 2 + 0.15 : len / 2,
      h: WALL_BLOCK_H,
    });
  };
  buildWallSide(SLAB.minX, SLAB.minZ, SLAB.maxX, SLAB.minZ, 0, -1);   // south face
  buildWallSide(SLAB.maxX, SLAB.minZ, SLAB.maxX, SLAB.maxZ, 1, 0);    // east face
  buildWallSide(SLAB.maxX, SLAB.maxZ, SLAB.minX, SLAB.maxZ, 0, 1);    // north face
  buildWallSide(SLAB.minX, SLAB.maxZ, SLAB.minX, SLAB.minZ, -1, 0);   // west face

  const colliders = [...ceilingColliders, ...stairColliders, ...mountColliders, ...statueColliders, ...glassCity.colliders, ...grandRailColliders, ...machineColliders, ...pickerPadColliders, ...platterColliders, ...washColliders, ...goatColliders, ...worldWallColliders];

  let elapsed = 0;   // course clock for sine-animated props (conduits, …)
  let prevX = 0, prevY = 0, prevZ = 0, havePrev = false;
  // Checkerboard tile under a car last frame — one edge-trigger state PER car
  // (carLastTile for the player's car, followerLastTile for the little car
  // follower, trainLastTiles for the trailing train cars) so one car crossing a
  // tile boundary can't eat the other's trigger.
  const carLastTile = { value: -1 };
  const followerLastTile = { value: -1 };
  const trainLastTiles = [];

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

  // Free one whole underground build's GPU resources. main.js calls this when
  // hot-swapping a stale world for a freshly rebuilt one (the underground
  // resets every time you leave via the tunnel and come back). Glow materials
  // come from a module-level cache shared across rebuilds, so those are kept.
  const dispose = (root) => {
    const cached = new Set(glowMatCache.values());
    const doneMats = new Set();
    const doneTex = new Set();
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      // InstancedMesh.dispose() frees instanceMatrix/instanceColor internally;
      // the attributes themselves have no dispose(), so never call it on them.
      if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        if (!m || cached.has(m) || doneMats.has(m)) continue;
        doneMats.add(m);
        m.dispose();
        if (m.map && !doneTex.has(m.map)) { doneTex.add(m.map); m.map.dispose(); }
      }
    });
  };

  // True if (x, z) falls inside one of the sunken park's carved-out holes (a
  // pit opening in the floor slab). main.js uses this so a car that outruns
  // the ride gate coming off a pit lip falls INTO the hole instead of snapping
  // back up to the y=0 floor plane (which would read as invisible glass over
  // the whole pit).
  function sunkHoleAt(x, z) {
    for (const poly of SS.holes) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  return {
    colliders,
    sky,           // foreboding sky all around the cavern (dark clouds, stars, constellations)
    ramps: ugRamps,
    halfpipe: HALFPIPE,   // blue-wave halfpipe footprint constants (:debug)
    sunkHoleAt,   // pit-opening test — main.js drops a car past the lip into a pit instead of floating it at y=0
    park: SS,             // sunken skate park — all 11 feature footprints (:debug)
    floor: plain,   // cavern floor mesh (1970s vinyl kitchen floor) — for the ?debug hook
    STAIRS,      // footprint constants (solid ramp + big flat roof)
    GRAND,       // grand-ramp footprint constants (steeper east twin of the staircase)
    gemstones,   // candy-waterfall gemstone pool (for the ?debug hook)
    beltGems,    // conveyor-candy gem pool (idea #33 follow-up) — ?debug hook
    trampolines,   // launch pads (idea #13) — state for the ?debug hook
    conveyor: CONVEYOR,   // giant conveyor lane footprint (idea #33) — ?debug hook
    glassCrystals: glassCity.balloons,   // Glass City plaza balloons (pop when driven over)
    glassSpire: glassCity.spire,         // central citadel crystal (idea #25)
    // Idea #29 — landmarks for the minimap so the big dark cavern is navigable.
    mapFeatures: [
      { kind: 'stairs', x: STAIRS.cx, z: STAIRS.cz, r: 12, color: '#8fd0ff', label: 'Stairs' },
      { kind: 'waterfall', x: GRAND.x, z: GRAND.z, r: 10, color: '#ff9a3c', label: 'Waterfall' },
      { kind: 'mountain', x: MOUNT.cx, z: MOUNT.cz, r: 34, color: '#f2f6ff', label: 'Mountain' },
      { kind: 'tramp', x: TRAMPOLINES[0].x, z: TRAMPOLINES[0].z, r: 4, color: '#9dff3f' },
      { kind: 'tramp', x: TRAMPOLINES[1].x, z: TRAMPOLINES[1].z, r: 4, color: '#9dff3f' },
      // Factory floor: the steam press on the eastbound lane and the car wash
      // on the westbound approach, so both read on the minimap.
      { kind: 'course', x: PRESS.x, z: PRESS.z, r: 6, color: '#ffb84d', label: 'Press' },
      { kind: 'course', x: CARWASH.cx, z: CARWASH.cz, r: 6, color: '#35f0ff', label: 'Car wash' },
      // The factory machine on the westbound z=17 lane and the disco ball over
      // the eastbound z=37 straight — the two ramps-and-air course moments.
      { kind: 'course', x: MACHINE.x, z: MACHINE.z, r: 14, color: '#f2f6ff', label: 'Factory' },
      { kind: 'course', x: DISCO.x, z: DISCO.z, r: 5, color: '#b9a8ff', label: 'Disco' },
      // The finish gate markers so the drive north toward the mountain reads
      // on the minimap from across the dark cavern.
      { kind: 'course', x: COURSE_START.x, z: COURSE_START.z, r: 9, color: '#9dff3f', label: 'Course start' },
      { kind: 'course', x: COURSE_FINISH_X, z: COURSE_FINISH_Z, r: 9, color: '#ff3fd8', label: 'Course finish' },
      // 2026-09-23 factory-floor attractions (the five new novelties).
      { kind: 'course', x: BUBBLE_ZONE.minX + (BUBBLE_ZONE.maxX - BUBBLE_ZONE.minX) / 2, z: BUBBLE_ZONE.minZ + (BUBBLE_ZONE.maxZ - BUBBLE_ZONE.minZ) / 2, r: 18, color: '#b8ffd0', label: 'Bubble wrap' },
      { kind: 'course', x: TAFFY[0].x, z: -30, r: 9, color: '#ff9be0', label: 'Taffy pullers' },
      { kind: 'course', x: MAGNET.x, z: MAGNET.z, r: 10, color: '#ff5560', label: 'Magnet' },
      { kind: 'course', x: expressTube.entrance.x, z: expressTube.entrance.z, r: 16, color: '#3fd8ff', label: 'Express tube' },
      // The sunken skate park (2026-09-25): the giant halfpipe plus the eleven
      // bowls/rails read as ONE square so the minimap stays clean. The park
      // sits west of the minimap's edge, so the square edges into the canvas's
      // right side after the 180° flip and the label clamps onto the visible
      // part (drawMinimap handles the 'park' kind).
      { kind: 'park', x: -96, z: -70, r: 40, color: '#35d0ff', label: 'Skate park' },
      // The spinner — a giant rotating turntable beside the Holy Mountain —
      // shows as a circle so the spinning platter reads apart from the bowls.
      { kind: 'circle', x: PLATTER.cx, z: PLATTER.cz, r: PLATTER.r, color: '#ff9a3c', label: 'Spinner' },
    ],
    get finishCount() { return finishCount; },
    // Factory floor (2026-09-22): the steam press's slamActive flag flattens
    // the car when it's under the head; carWash is the wash-bay live state.
    steamPress: pressed,
    carWash,
    // 2026-09-23 factory-floor attractions (the five novelties).
    bubbleStrip,      // pops counter + zone — main.js drives the THWACK/wobble
    taffy,            // hookedAt(x,z) poll + hooks list + hits counter
    magnet,           // live active flag + holdY/radius main.js reads
    expressTube,      // entrance/exit coords + ring meshes (for the minimap/lights)
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
    // Free a stale build's GPU resources before main.js swaps in a rebuilt world.
    dispose,
    update(delta, player, follower, consist) {
      glassCity.update(delta, player);
      elapsed += delta;
      sky.update(delta, elapsed, player);
      // Checkerboard ceiling: when a car drives over a tile, advance it one
      // step through the neon sequence (dark → cyan → lime → amber → magenta
      // → red). Red is terminal — once a tile is red it stays lit forever.
      // Edge-triggered on the tile under the car so a tile advances once per
      // visit, not every frame while the car sits on it. A per-tile cooldown
      // stops the same pass (front wheels then back wheels, or a boundary
      // jitter) from advancing a tile twice — the car must drive away and
      // come back before the tile can change color again. EVERY drivable body
      // shares the mechanic: the player's car, the little car follower, and
      // every trailing freight car when the player drives the train each
      // advance tiles as they drive over them (each with its own last-tile
      // edge state).
      const advanceTilesFor = (v, lastTileState, mode) => {
        // Only advance tiles when the car is actually driving ON the ceiling
        // (the "second roof", top face at CEIL_Y + 1.3) — not when it's on
        // the cavern floor underneath, even though the same x/z maps to a
        // ceiling tile.
        const onCeiling = v.y > CEIL_Y + 0.5;
        const tx = onCeiling ? Math.floor((v.x - ceilMinX) / TILE_SZ) : -1;
        const tz = onCeiling ? Math.floor((v.z - gridZ0) / TILE_SZ) : -1;
        if (tx >= 0 && tx < tilesX && tz >= 0 && tz < tilesZ) {
          const idx = tz * tilesX + tx;
          if (idx !== lastTileState.value) {
            lastTileState.value = idx;
            const st = checkerState[idx];
            // Player + little car keep the global per-tile cooldown: a tile
            // advances once per drive-over visit. The train cars pace PER CAR
            // instead — with a 15-car consist the loco's tile lock would
            // starve every car behind it (they arrive within a second of the
            // loco, cooldown still ticking), so the whole consist sweeps the
            // colors one step per car instead.
            const allowed = mode === 'train'
              ? (st < 2 + CHECKER_NEON.length - 1 && elapsed - lastTileState.guardT > TRAIN_TILE_GUARD)
              : (st < 2 + CHECKER_NEON.length - 1 && checkerCooldown[idx] <= 0);
            if (allowed) {
              if (mode === 'train') {
                lastTileState.guardT = elapsed;
                checkerCooldown[idx] = 0;   // don't lock the tile for the next car
              }
              // Advance one step: dark (0/1) → cyan (2), then cyan → lime →
              // amber → magenta → red. The two dark shades share a single
              // first step, so the SECOND drive-over is the green (lime)
              // that spreads blue to its neighbors.
              const oldSt = st;
              const newSt = setOrBump(idx, 2);
              if (mode === 'train') checkerCooldown[idx] = 0;   // setOrBump re-armed it ??? clear again
              // Play sound only for direct drive-over (not from spreading)
              if (typeof opts.onTileBong === 'function' && oldSt < newSt) {
                const notes = [523.25, 493.88, 440, 392, 349.23]; // C5, B4, A4, G4, F4 - lower notes for each color
                const idxNote = Math.max(0, Math.min(notes.length - 1, newSt - 2));
                opts.onTileBong(notes[idxNote]);
              }
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
          lastTileState.value = -1;
        }
      };
      // Per-car edge state for the trailing train cars (each car tracks its
      // own last tile so transitions are independent of its neighbours). The
      // array is rebuilt whenever the consist list is empty/absent.
      if (!Array.isArray(consist)) {
        trainLastTiles.length = 0;
        consist = null;
      }
      if (player || follower || (consist && consist.length)) {
        checker.tick++;
        // Tick down tile advance cooldowns so a tile can be re-triggered
        // once a car has driven away and come back.
        for (let i = 0; i < tileCount; i++) {
          if (checkerCooldown[i] > 0) checkerCooldown[i] -= delta;
        }
      }
      if (player) advanceTilesFor(player, carLastTile, 'standard');
      if (follower) advanceTilesFor(follower, followerLastTile, 'standard');
      if (consist) {
        while (trainLastTiles.length < consist.length) trainLastTiles.push({ value: -1, guardT: 0 });
        for (let i = 0; i < consist.length; i++) {
          advanceTilesFor(consist[i], trainLastTiles[i], 'train');
        }
      }
      // Serpentine guide dots: driving through a dot (car on the floor, inside
      // GUIDE_HIT horizontally) flips that dot from lime to the darker glowing
      // blue permanently — so dragging the whole course turns the snake blue
      // behind you. Only floor-height driving counts (the ceiling run at y≈31
      // passes over the same x/z and must not trigger the floor dots). The dot
      // is MOVED between two InstancedMeshes because the neon look is
      // emissive, which per-instance colors can't touch.
      if (player && player.y < 8) {
        const guideHitR2 = GUIDE_HIT * GUIDE_HIT;
        for (let i = 0; i < guideCount; i++) {
          if (guideLit[i]) continue;
          const gdx = player.x - guideX[i];
          const gdz = player.z - guideZ[i];
          if (gdx * gdx + gdz * gdz < guideHitR2) {
            guideLit[i] = 1;
            _guideZero.compose(_guideHide, _guideQuat, _guideOne);
            guideDotsLime.setMatrixAt(i, _guideZero);
            guideDotsLime.instanceMatrix.needsUpdate = true;
            guideDot.position.set(guideX[i], GUIDE_DOT_R, guideZ[i]);
            guideDot.updateMatrix();
            guideDotsBlue.setMatrixAt(guideBlueCount++, guideDot.matrix);
            guideDotsBlue.count = guideBlueCount;
            guideDotsBlue.instanceMatrix.needsUpdate = true;
          }
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
      // Ground-floor FINISH: crossing the red satin ribbon's plane on the cavern
      // floor, over the ribbon's span, completes a run — fanfare from the
      // caller plus a quick blaze on the ribbon (its faint emissive surges) so
      // the moment reads as a celebration. The gate is direction-aware: the
      // finish ribbon sits on the open south tundra and is crossed WESTBOUND
      // (COURSE_FINISH_DIR '-x'), the Holy Mountain framed dead ahead and the
      // neon staircase behind you. A short cooldown stops the same crossing
      // retriggering.
      if (finishCooldown > 0) finishCooldown -= delta;
      if (finishFlash > 0) finishFlash = Math.max(0, finishFlash - delta);
      if (finishGate.mat) {
        finishGate.mat.emissiveIntensity = 0.35 + finishFlash * 3.4;
      }
      // The gate is direction-aware: when the ribbon plane is vertical in X
      // (west-east crossers) the band check runs along Z; when it's vertical
      // in Z (north-south crossers, COURSE_FINISH_DIR '+z') the band check
      // runs along X. Only the matching crossing direction completes a run.
      let bandOk = false;
      let planeOk = false;
      if (COURSE_FINISH_DIR === '-x') {
        bandOk = Math.abs(player.z - COURSE_FINISH_Z) <= COURSE_FINISH_HALF;
        planeOk = prevX > COURSE_FINISH_X && player.x <= COURSE_FINISH_X;
      } else if (COURSE_FINISH_DIR === '+z') {
        bandOk = Math.abs(player.x - COURSE_FINISH_X) <= COURSE_FINISH_HALF;
        planeOk = prevZ < COURSE_FINISH_Z && player.z >= COURSE_FINISH_Z;
      }
      if (player && havePrev && player.y < 3 && finishCooldown <= 0) {
        if (bandOk && planeOk) {
          finishCooldown = 4.0;
          finishFlash = 0.85;
          finishCount += 1;
          burstRibbon(player.x, player.z);
          if (onFinishLine) onFinishLine(player.x, player.z);
        }
      }
      // Finish ribbon burst: the shards fly apart, tumble and sink under the
      // same gravity as the car; the moment the last one despawns the intact
      // ribbon respawns so a fresh run can burst it again.
      for (let i = ribbonShards.length - 1; i >= 0; i--) {
        const s = ribbonShards[i];
        s.age += delta;
        if (s.age >= s.life) {
          parent.remove(s.mesh);
          s.mesh.geometry.dispose();
          ribbonShards.splice(i, 1);
          continue;
        }
        s.vy -= 18 * delta;
        s.mesh.position.x += s.vx * delta;
        s.mesh.position.y += s.vy * delta;
        s.mesh.position.z += s.vz * delta;
        s.mesh.rotation.x += s.rvx * delta;
        s.mesh.rotation.y += s.rvy * delta;
        s.mesh.rotation.z += s.rvz * delta;
      }
      if (ribbonShards.length === 0 && finishGate.ribbon && !finishGate.ribbon.visible) {
        finishGate.ribbon.visible = true;
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
      // Giant conveyor lane (idea #33): scroll the chevrons and, while the car
      // is over the belt near floor level, add its drag on top of the car's
      // own motion.
      beltTex.offset.x -= CONVEYOR.dirX * CONVEYOR.speed * delta / 6;
      beltTex.offset.y += CONVEYOR.dirZ * CONVEYOR.speed * delta / 6;
      // The picker robot hunkers over the belt and HAMMERS its claw down in a
      // "grab" cycle: the shoulder sweeps the arm across the lane while the
      // elbow pitches the long forearm over and down INTO the belt (e sweeps up
      // to ~1.6 rad) and the two GIANT pincers stay gaped wide while the arm is
      // up, then SNAP SHUT around the belt as it bottoms out — like it's
      // genuinely trying to grab the car. The leveling clamp counter-rotates
      // against the elbow fold, so the claws keep pointing STRAIGHT DOWN at the
      // belt instead of swinging up-and-back onto the robot's own arm. If a car
      // is under the claw when the pincers clamp shut, a real onPickerGrab()
      // shove fires (the machine actually hits the car now); the soft pad under
      // the claw still bumps cars out.
      conveyorPicker.t += delta;
      {
        const t = conveyorPicker.t, sh = conveyorPicker.shoulder, el = conveyorPicker.elbow, wr = conveyorPicker.wrist;
        sh.rotation.y = -0.15 + Math.sin(t * 0.55) * 0.5;
        // The dive sweeps e up to ~1.6 rad (just past the sin-peak at π/2 so the
        // folded forearm's horizontal reach is deepest right where the pincers
        // snap shut over the belt's middle).
        const e = 0.5 + Math.max(0, Math.sin(t * 0.75)) * 1.1;
        el.rotation.x = -e;
        wr.rotation.x = 0.2 - e * 0.15;
        const lv = conveyorPicker.level;
        if (lv) lv.rotation.x = Math.min(e, 1.5);
        // Pincer jaws: gaped wide while the arm rides up, snapping SHUT only
        // as the claw bottoms out (~70% into the dive → hard clamp at the dip).
        const cg = Math.max(0, Math.sin(t * 0.75));
        const clamp = Math.max(0, Math.min(1, (cg - 0.7) / 0.3));
        const openAng = 1.4 - 1.38 * clamp;          // 1.4 rad open → ~0.02 rad clamped
        const jawL = conveyorPicker.jawL, jawR = conveyorPicker.jawR;
        if (jawL) {
          jawL.rotation.z = -openAng;
          jawR.rotation.z = openAng;
        }
        // Genuine grab hit: the instant the pincers finish clamping on a car
        // that's under the claw, hurl it — the robot REALLY grabs now.
        if (clamp > 0.85 && !conveyorPicker.grabbed) {
          conveyorPicker.grabbed = true;
          const pad = conveyorPicker.pad;
          if (player
            && Math.abs(player.x - pad.x) < 2.6
            && Math.abs(player.z - pad.z) < 2.8
            && player.y < 1.8) {
            const gx = CONVEYOR.dirX * 1.0, gz = CONVEYOR.dirZ * 1.0 - 0.6; // along the belt + off it (north)
            const gl = Math.hypot(gx, gz) || 1;
            if (onPickerGrab) onPickerGrab(gx / gl, gz / gl);
          }
        }
        if (clamp < 0.15 && conveyorPicker.grabbed) conveyorPicker.grabbed = false;
        wr.updateWorldMatrix(true, false);
        const wp = new THREE.Vector3();
        wr.getWorldPosition(wp);
        const pad = conveyorPicker.pad;
        pad.x = wp.x;
        pad.z = wp.z;
        const tipY = wp.y - 1.4;
        pad.h = tipY < 2.1 ? Math.max(0, Math.min(1.2, tipY - 0.3)) : 0;
      }
      if (player
        && Math.abs(player.x - CONVEYOR.cx) < CONVEYOR.len / 2
        && Math.abs(player.z - CONVEYOR.cz) < CONVEYOR.wid / 2
        && player.y < 1.5) {
        player.x += CONVEYOR.dirX * CONVEYOR.speed * delta;
        player.z += CONVEYOR.dirZ * CONVEYOR.speed * delta;
      }
      // Factory machinery: spin the gears, run the steam press cycle and the
      // car wash (rollers, fans, water spray + exit sparkle).
      for (const sp of gearSpin) sp.mesh.rotation.z += delta * sp.speed;
      // Giant slat machine: beds and slats pump up and down in alternating
      // waves (beds up → neighbouring slats down), like the gears drive them.
      machineT += delta;
      for (const bs of bedsAndSlats) {
        const wave = Math.sin(machineT * bs.speed + bs.phase);
        bs.mesh.position.y = bs.baseY + wave * (bs.amp * 0.75 + 0.25);
      }
      // Disco ball: spin forever, swing like a damped pendulum when a flying car
      // knocks it, and settle back to hanging straight.
      disco.cd = Math.max(0, disco.cd - delta);
      const DAMP = 2.6, STIFF = 9.0;
      disco.vx += (-STIFF * disco.ax - DAMP * disco.vx) * delta;
      disco.vz += (-STIFF * disco.az - DAMP * disco.vz) * delta;
      disco.ax += disco.vx * delta;
      disco.az += disco.vz * delta;
      discoPivot.rotation.z = disco.ax;
      discoPivot.rotation.x = disco.az;
      discoSpin.rotation.y += delta * (DISCO.spin + Math.min(disco.hits * 0.25, 2));
      // The giant turntable beside the mountain: spins forever, purely decorative.
      platterSpin.t += delta;
      if (platterSpin.disk) platterSpin.disk.rotation.y += delta * PLATTER.spin;
      if (player) {
        const px = player.x - DISCO.x, pz = player.z - DISCO.z;
        // Only a mid-air near the ball (from the kicker ramps) can hit it.
        if (disco.cd <= 0 && player.y > 4.5 && player.y < 13.5
          && px * px + pz * pz < DISCO.hitR * DISCO.hitR) {
          disco.cd = 1.2;
          disco.hits++;
          const d = Math.hypot(px, pz) || 1;
          disco.vx -= (px / d) * 3.2;
          disco.vz -= (pz / d) * 3.2;
          if (disco.ax + disco.az === 0) {
            disco.vx += (Math.random() - 0.5) * 1.5;
            disco.vz += (Math.random() - 0.5) * 1.5;
          }
        }
      }
      // Steam press state machine: 'up' (rest) → 'drop' (slam) → 'hold'
      // (flat) → 'rise'. The warning light flashes during the drop/hold so a
      // driver can read the timing, and steam blows when the head is low.
      pressed.t += delta;
      pressed.hiss = false;
      let headTarget = PRESS_UP_Y;
      if (pressed.phase === 'up') {
        if (pressed.t >= 2.4) { pressed.phase = 'drop'; pressed.t = 0; }
      } else if (pressed.phase === 'drop') {
        headTarget = PRESS_DOWN_Y;
        pressed.hiss = true;
        if (pressed.t >= 0.4) { pressed.phase = 'hold'; pressed.t = 0; }
      } else if (pressed.phase === 'hold') {
        headTarget = PRESS_DOWN_Y;
        pressed.hiss = true;
        if (pressed.t >= 1.35) { pressed.phase = 'rise'; pressed.t = 0; }
      } else if (pressed.phase === 'rise') {
        if (pressed.t >= 0.65) { pressed.phase = 'up'; pressed.t = 0; }
      }
      pressed.head.position.y += (headTarget - pressed.head.position.y) * Math.min(1, delta * 6);
      const pressing = pressed.phase === 'drop' || pressed.phase === 'hold';
      warnLight.material.emissiveIntensity = pressing ? 1.3 + Math.sin(pressed.t * 26) * 0.9 : 0.4;
      warnLight.scale.setScalar(pressing ? 1.35 : 1);
      pressed.slamActive = false;
      if (player
        && pressing
        && Math.abs(player.x - PRESS.x) < PRESS.halfW + 1.2
        && Math.abs(player.z - PRESS.z) < PRESS.halfD + 0.9
        && player.y < 2.1) {
        pressed.slamActive = true;
      }
      if (pressed.hiss) {
        steamPuffTimer -= delta;
        if (steamPuffTimer <= 0) {
          steamPuffTimer = 0.07;
          const sp = steamPuffs.find((p) => !p.alive);
          const puff = sp || {};
          if (!sp) {
            const mat = new THREE.SpriteMaterial({
              map: washWaterTex, color: 0xb8c4d0, transparent: true, opacity: 0.4, depthWrite: false,
            });
            puff.mesh = new THREE.Sprite(mat);
            parent.add(puff.mesh);
            steamPuffs.push(puff);
          }
          puff.alive = true;
          puff.life = 0.85;
          puff.vx = (Math.random() - 0.5) * 2;
          puff.vy = 1.6 + Math.random() * 1.4;
          puff.vz = (Math.random() - 0.5) * 2;
          const sideX = (Math.random() - 0.5) * 2 * PRESS.halfW;
          puff.mesh.position.set(PRESS.x + sideX, PRESS_DOWN_Y + 0.2, PRESS.z + (Math.random() - 0.5) * PRESS.halfD * 2);
          puff.mesh.scale.setScalar(1.1 + Math.random() * 1.3);
        }
      }
      for (let i = steamPuffs.length - 1; i >= 0; i--) {
        const p = steamPuffs[i];
        if (!p.alive) continue;
        p.life -= delta;
        if (p.life <= 0) {
          p.alive = false;
          p.mesh.visible = false;
          continue;
        }
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        p.mesh.material.opacity = 0.4 * (p.life / 0.85);
        p.mesh.visible = true;
      }
      // Car wash: every brush rig spins/sweeps; water sprays at the car while
      // it's inside; after it leaves it sparkles for a few seconds.
      carWash.t += delta;
      // Vertical side drums + full-height washers: fast spin about Y.
      for (const d of carWash.drums) d.rotation.y += delta * 8;
      for (const w of carWash.washers) w.rotation.y += delta * 9;
      // Rocker panel scrubbers rip along (fastest spinning of the lot).
      for (const rk of carWash.rocks) rk.rotation.y += delta * 16;
      // Pena-wheel tire scrubbers roll about their own long axis.
      for (const tr of carWash.tires) tr.rotation.y += delta * 14;
      // High-pressure wheel blasters: nozzle rings whip around.
      for (const hd of carWash.blasters) hd.rotation.y += delta * 11;
      // Wrap-around gyro Wraps: the arm STEPS IN to the car path, sweeps out
      // along the side, then REACHES BACK around the rear before releasing —
      // a repeated in/out swing about the shoulder while the brush spins.
      for (const w of carWash.wraps) {
        w.arm.rotation.y = (w.arm.userData.base ?? 0) + Math.sin(carWash.t * 1.6 + w.phase) * w.reach;
        w.spin.rotation.y += delta * 9;
      }
      // Mitter curtains: overhead frames agitate in a circular pattern.
      for (const mc of carWash.mitterCurtains) {
        mc.g.rotation.x = Math.sin(carWash.t * 2.0 + mc.phase) * 0.06;
        mc.g.rotation.z = Math.cos(carWash.t * 1.7 + mc.phase * 1.3) * 0.05;
      }
      // Top mitter / contour washer: bobs its height with the car + rolls.
      if (carWash.mitter) {
        carWash.mitter.g.position.y = 2.4 + Math.sin(carWash.t * 1.9) * 0.4;
        carWash.mitter.spin.rotation.y += delta * 10;
      }
      // Big overhead sweeps: sweep side to side across the roof + roll.
      for (const b of carWash.sweeps) {
        b.g.rotation.x = Math.sin(carWash.t * 2.1 + b.phase) * b.amp;
        b.g.rotation.z = Math.sin(carWash.t * 1.4 + b.phase * 0.7) * 0.08;
        b.spin.rotation.y += delta * 9;
      }
      for (const f of carWash.fans) { f.rotation.z += delta * 10; f.scale.setScalar(1 + Math.sin(carWash.t * 12) * 0.1); }
      // Inflatable tube men: swaying bodies + wildly windmilling arms.
      for (const tm of carWash.tubeMen) {
        tm.time += delta;
        tm.body.rotation.z = Math.sin(tm.time * 1.3 + tm.phase) * 0.3;
        tm.body.rotation.x = Math.sin(tm.time * 2.1 + tm.phase * 0.7) * 0.18;
        tm.armR.rotation.x = -Math.abs(Math.sin(tm.time * 3.1 + tm.phase)) * 2.7;
        tm.armR.rotation.z = Math.sin(tm.time * 2.3 + tm.phase * 0.5) * 0.8;
        tm.armL.rotation.x = Math.abs(Math.sin(tm.time * 2.7 + tm.phase * 1.4)) * 2.7;
        tm.armL.rotation.z = Math.sin(tm.time * 2.6 + tm.phase) * 0.8;
        tm.g.position.y = Math.sin(tm.time * 2.0 + tm.phase) * 0.08;
      }
      const inWash = player
        && Math.abs(player.x - CARWASH.cx) < CARWASH.len / 2 + 1
        && Math.abs(player.z - CARWASH.cz) < CARWASH.wid / 2 + 1.2
        && player.y < 3.2;
      if (inWash && !carWash.inside) {
        carWash.spawnAcc = 0;   // burst of spray on entry
      }
      if (!inWash && carWash.inside) {
        carWash.sparkleT = 3.5;   // just left the wash — sparkling!
      }
      carWash.inside = !!inWash;
      if (carWash.inside) {
        carWash.spawnAcc += delta;
        // ~22 droplets/sec while inside, sprayed from the roof rails + sides.
        while (carWash.spawnAcc > 0.045) {
          carWash.spawnAcc -= 0.045;
          const d = carWash.droplets.find((x) => !x.alive);
          const dr = d || {};
          if (!d) {
            const mat = new THREE.SpriteMaterial({
              map: washWaterTex, color: 0x66e7ff, transparent: true, opacity: 0.9, depthWrite: false,
            });
            dr.mesh = new THREE.Sprite(mat);
            parent.add(dr.mesh);
            carWash.droplets.push(dr);
          }
          dr.alive = true;
          dr.life = 0.8 + Math.random() * 0.4;
          const side = Math.random() < 0.5 ? -1 : 1;
          dr.mesh.position.set(
            CARWASH.cx + (Math.random() - 0.5) * (CARWASH.len - 4),
            2.6 + Math.random() * 0.8,
            CARWASH.cz + (Math.random() < 0.5 ? side * WZ : (Math.random() - 0.5) * CARWASH.wid * 0.9)
          );
          dr.vx = (Math.random() - 0.5) * 3;
          dr.vy = -2.5 - Math.random() * 3;
          dr.vz = (Math.random() - 0.5) * 3;
          dr.mesh.scale.setScalar(0.5 + Math.random() * 0.4);
          dr.mesh.material.opacity = 0.9;
        }
      }
      for (let i = carWash.droplets.length - 1; i >= 0; i--) {
        const d = carWash.droplets[i];
        if (!d.alive) continue;
        d.life -= delta;
        d.mesh.position.x += d.vx * delta;
        d.mesh.position.y += d.vy * delta;
        d.mesh.position.z += d.vz * delta;
        if (d.life <= 0 || d.mesh.position.y < 0.05) {
          d.alive = false;
          d.mesh.visible = false;
          continue;
        }
        d.mesh.material.opacity = 0.9 * (d.life / 1.0);
        d.mesh.visible = true;
      }
      if (carWash.sparkleT > 0) {
        carWash.sparkleT -= delta;
        carWash.spawnAcc2 += delta;
        if (player) {
          while (carWash.spawnAcc2 > 0.07) {
            carWash.spawnAcc2 -= 0.07;
            const s = carWash.sparkles.find((x) => !x.alive);
            const st = s || {};
            if (!s) {
              const mat = new THREE.SpriteMaterial({
                map: washWaterTex, color: 0xffffff, transparent: true, opacity: 1, depthWrite: false,
              });
              st.mesh = new THREE.Sprite(mat);
              parent.add(st.mesh);
              carWash.sparkles.push(st);
            }
            st.alive = true;
            st.life = 0.5 + Math.random() * 0.3;
            st.mesh.position.set(
              player.x + (Math.random() - 0.5) * 3.2,
              player.y + 0.3 + Math.random() * 1.6,
              player.z + (Math.random() - 0.5) * 3.2
            );
            st.vy = 1.8 + Math.random() * 1.6;
            st.mesh.scale.setScalar(0.2 + Math.random() * 0.3);
            st.mesh.material.opacity = 1;
          }
        }
      }
      for (let i = carWash.sparkles.length - 1; i >= 0; i--) {
        const s = carWash.sparkles[i];
        if (!s.alive) continue;
        s.life -= delta;
        s.mesh.position.y += s.vy * delta;
        s.vy *= 0.96;
        if (s.life <= 0) {
          s.alive = false;
          s.mesh.visible = false;
          continue;
        }
        s.mesh.material.opacity = s.life / 0.8;
        s.mesh.visible = true;
      }
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
      if (player) {
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
      // Goat pilgrimage: 30 s after the ejection flag, the herd LAUNCHES out of
      // the summit — each goat flies a ballistic arc away from the mountaintop
      // on its own azimuth (the same gravity/launch-point as the car's own
      // ejection), tumbles in the air, thuds down, then follows the little car
      // (or the player when the little car is parked/hidden).
      if (holy.ejectFlag) { holy.ejectFlag = false; goatEvent.timer = 30; }
      if (goatEvent.timer > 0) goatEvent.timer -= delta;
      const goatFollow = (follower && follower.x !== undefined) ? follower : (player || null);
      if (goatEvent.timer > -1 && goatEvent.timer <= 0) {
        for (const c of goatCrew) if (c.state === 'wait') c.state = 'fly';
        goatEvent.timer = -1;
      }
      for (const c of goatCrew) {
        if (c.state === 'wait') continue;
        const m = c.mesh;
        if (c.state === 'fly') {
          if (c.delay > 0) { c.delay -= delta; continue; }     // staggered blast-off
          if (c.vx === 0 && c.vy === 0 && c.vz === 0) {
            // Launch exactly like the car was kicked out: from the summit tip,
            // outward along the goat's azimuth, a strong forward + up velocity.
            m.visible = true;
            m.position.set(MOUNT.cx, MOUNT.peakY + 1, MOUNT.cz);
            const vf = 13 + Math.random() * 3;
            c.vx = Math.cos(c.phi) * vf;
            c.vz = Math.sin(c.phi) * vf;
            c.vy = 24;
          }
          c.vy -= GOAT_GRAVITY * delta;
          m.position.x += c.vx * delta;
          m.position.z += c.vz * delta;
          m.position.y += c.vy * delta;
          m.rotation.x += c.tumble * delta;      // windmill through the air
          m.rotation.z += c.tumble * delta * 0.7;
          if (m.position.y <= 0.45) {            // thud down, scramble up
            m.position.y = 0.45;
            m.rotation.x = 0;
            m.rotation.z = 0;
            m.rotation.y = Math.atan2(c.vx, c.vz);
            c.state = 'follow';
          }
          continue;
        }
        if (!goatFollow) continue;
        // Enable the goat's solid collider (tracked to its feet every frame)
        // only once it's on the ground — a goat can't be run over.
        c.col.x = m.position.x;
        c.col.z = m.position.z;
        // Flee from the player car just like the city pedestrians: bolt away
        // (plus a scatter so the herd doesn't all flee in lockstep), keep
        // running while the car is still near, then settle back to following
        // once it's clear. 3D distance keeps a car driving up on the far roof
        // from spooking the goats on the cavern floor.
        const pdx = player ? player.x - m.position.x : 0;
        const pdz = player ? player.z - m.position.z : 0;
        const pdy = player ? player.y - m.position.y : 0;
        const pDist = player ? Math.hypot(pdx, pdz, pdy) : Infinity;
        if (pDist < GOAT_FLEE_TRIGGER) {
          if (!c.flee) {
            const scatter = (Math.random() - 0.5) * 1.4;
            const away = Math.atan2(-pdz, -pdx) + scatter;
            c.flee = { dx: Math.cos(away), dz: Math.sin(away), t: GOAT_FLEE_HOLD };
          } else {
            // Keep re-aiming away from the moving car while it's near, with a
            // tiny sway so a static goat isn't stiff — like the city people.
            const ang = Math.atan2(-pdz, -pdx) + Math.sin(c.flee.t * 7 + c.gaitPh) * 0.18;
            c.flee.dx = Math.cos(ang);
            c.flee.dz = Math.sin(ang);
          }
          c.flee.t = Math.max(c.flee.t, 0.8);
        } else if (c.flee) {
          c.flee.t -= delta;
          if (c.flee.t <= 0) c.flee = null;
        }
        const moving = pDist >= GOAT_FLEE_TRIGGER;   // not bolting: normal behaviour
        if (c.flee) {
          // Gallop! Big bounding leaps, legs scissoring in a fast diagonal pair.
          const step = GOAT_FLEE_SPEED * delta;
          m.position.x += c.flee.dx * step;
          m.position.z += c.flee.dz * step;
          m.position.x = Math.max(-140, Math.min(140, m.position.x));   // stay on the slab
          m.position.z = Math.max(-90, Math.min(175, m.position.z));
          m.rotation.y = Math.atan2(c.flee.dx, c.flee.dz);
          c.gaitPh += delta * (13 + Math.random() * 2);
          const s0 = Math.sin(c.gaitPh) * 1.0;
          const s1 = Math.sin(c.gaitPh + Math.PI) * 1.0;
          m.goatLegs[0].rotation.x = s0;     // left front
          m.goatLegs[3].rotation.x = s0;     // right hind   (diagonal pair together)
          m.goatLegs[1].rotation.x = s1;     // right front
          m.goatLegs[2].rotation.x = s1;     // left hind
          m.position.y = 0.45 + Math.max(0, Math.sin(c.gaitPh * 0.5)) * 0.42;   // leap arc
          m.rotation.z = Math.sin(elapsed * 6 + c.bob) * 0.08;
          continue;
        }
        // Own wide orbit around the follower, drifting slowly so the herd
        // spreads out and never moves as one unit.
        c.orbitA += delta * 0.12 * c.gate;
        const wobR = c.orbitR + Math.sin(elapsed * 0.3 + c.driftT) * 2.0;
        const wobX = Math.sin(elapsed * 0.5 + c.driftT) * 1.6;
        const wobZ = Math.cos(elapsed * 0.4 + c.driftT) * 1.6;
        const tx = goatFollow.x + Math.cos(c.orbitA) * wobR + wobX;
        const tz = goatFollow.z + Math.sin(c.orbitA) * wobR + wobZ;
        const dx = tx - m.position.x;
        const dz = tz - m.position.z;
        const d = Math.hypot(dx, dz);
        const go = d > 2.2;
        if (go) {
          const step = Math.min((c.speed + d * 0.6) * delta, d - 2.2);
          m.position.x += (dx / d) * step;
          m.position.z += (dz / d) * step;
          m.rotation.y = Math.atan2(dx, dz);
        } else {
          m.rotation.y = Math.atan2(goatFollow.x - m.position.x, goatFollow.z - m.position.z);
        }
        // Gait animation keyed to pace: walking (slow step), trotting (diagonal
        // pairs), and a leaping bound now and again while on the move.
        if (go) {
          c.gaitPh += delta * (go ? (c.speed * 1.4 + d * 0.5) : 4);
          const amp = d > 6 ? 0.95 : 0.55;   // far spots clamp in with a longer stride
          const s0 = Math.sin(c.gaitPh) * amp;
          const s1 = Math.sin(c.gaitPh + Math.PI) * amp;
          m.goatLegs[0].rotation.x = s0;     // left front
          m.goatLegs[3].rotation.x = s0;     // right hind   (diagonal pair together)
          m.goatLegs[1].rotation.x = s1;     // right front
          m.goatLegs[2].rotation.x = s1;     // left hind
          if (Math.random() < 0.008) c.leap = 0.42;   // occasional leaping bound
        } else if (moving) {
          c.gaitPh += delta * 3;
          const s0 = Math.sin(c.gaitPh * 0.5) * 0.18;
          m.goatLegs[0].rotation.x = s0;
          m.goatLegs[3].rotation.x = s0;
          m.goatLegs[1].rotation.x = -s0;
          m.goatLegs[2].rotation.x = -s0;
        } else {
          // At the grazing stop the legs fold under (relaxed standing).
          for (const lp of m.goatLegs) lp.rotation.x *= 0.9;
        }
        m.position.y = 0.45 + 0.06 * Math.sin(elapsed * 5 + c.bob);
        if (c.leap > 0) {
          c.leap -= delta;
          m.position.y += Math.max(0, Math.sin((0.42 - c.leap) / 0.42 * Math.PI)) * 0.8;
        }
        m.rotation.z = Math.sin(elapsed * 6 + c.bob) * 0.1;
      }
      // ======================================================================
      // 2026-09-23 — Factory-floor attractions update
      // ======================================================================
      // 1. Bubble wrap strip: drive-over pops a nearby bubble (Game Genie pops
      //    whichever one is closest to the grounded car), re-inflate the rest
      //    slowly. Each pop briefly spikes the dome taller before flattening so
      //    it reads as a refreshed bubble being burst, and the pop counter +
      //    callback let main.js play the THWACK + haptic + steering wobble.
      {
        const bz = bubbleStrip.zone;
        // Pop the closest READY bubble while a grounded car drives the strip,
        // paced at ~8 pops/sec so a slow drive reads as a string of THWACKS.
        if (player
          && player.y < 1.2
          && elapsed - bubbleStrip.lastPopTime >= 0.12
          && player.x >= bz.minX && player.x <= bz.maxX
          && player.z >= bz.minZ && player.z <= bz.maxZ) {
          let best = null, bestD = Infinity;
          for (const b of bubbles) {
            if (b.scale < 0.9) continue;                     // already popped/re-inflating
            const dx = b.x - player.x, dz = b.z - player.z;
            const d = dx * dx + dz * dz;
            if (d < bestD) { bestD = d; best = b; }
          }
          if (best) {
            best.scale = 0.12;
            best.regrow = 0.55;
            best.popFlash = 1;
            bubbleStrip.pops++;
            bubbleStrip.lastPopTime = elapsed;
            if (onBubblePop) onBubblePop(best.x, best.z);
          }
        }
        // Re-inflate + settle popFlash over time (runs for every bubble, cheap:
        // only touched when regrow pending or flash lingers).
        let bubblesDirty = false;
        for (const b of bubbles) {
          if (b.regrow > 0) {
            b.regrow -= delta;
            if (b.regrow <= 0 && b.scale < 0.85) bubblesDirty = true;
          } else if (b.scale < 1) {
            b.scale = Math.min(1, b.scale + delta * 0.55);
            if (b.scale >= 1) bubblesDirty = true;
          }
          if (b.popFlash > 0) {
            b.popFlash = Math.max(0, b.popFlash - delta * 6);
            bubblesDirty = true;
          }
        }
        if (bubblesDirty) {
          for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i];
            const s = b.scale * (1 + b.popFlash * 0.5);
            _v3a.set(b.x, 0.3 * s, b.z);
            _v3b.set(s, s, s);
            _bm.compose(_v3a, _quat.identity(), _v3b);
            bubbleMesh.setMatrixAt(i, _bm);
          }
          bubbleMesh.instanceMatrix.needsUpdate = true;
        }
      }
      // 2. Taffy-puller machine: sweep the two hook arms counter-rotating about
      //    their posts, and spin the visible machinery (gears, pinions, pulleys
      //    + the endless chain loop) inside the open frame. The machine now
      //    straddles the westbound z=-30 lane (posts at (128,-26) and (128,-34))
      //    so the car drives THROUGH the frame like a car wash; a hook sweeps
      //    out and grabs the car on the way past — main.js polls
      //    taffy.hookedAt(x,z) each frame. While a hook is in its snap lunge
      //    its glow doubles — the arm reads as "grabbed you".
      {
        for (const m of taffyMotion) {
          if (m.kind === 'spin') {
            m.ref.rotation.y += delta * m.speed * m.dir;
          } else if (m.kind === 'pulley') {
            m.ref.rotation.z += delta * m.speed * m.dir;
          } else if (m.kind === 'chain') {
            // Link circles the two posts on a racetrack loop (the wide span of
            // the machine), so the belt visibly winds around the whole unit.
            const t = (elapsed * m.speed + m.phase) % 1;
            const ang = t * Math.PI * 2;
            const cx = 128, cz = -30, rx = 4.6, rz = 5.2;
            m.ref.position.set(cx + Math.cos(ang) * rx, 3.1, cz + Math.sin(ang) * rz);
            m.ref.rotation.y = ang + Math.PI / 2;
          }
        }
        for (const a of taffyArms) {
          const h = a.hook;
          if (h.cd > 0) h.cd = Math.max(0, h.cd - delta);
          if (h.snap > 0) h.snap -= delta;
          // Sweep back and forth about each post (phase π apart → the two arms
          // counter-swing, mirrored across the corner so they never coincide).
          h.angle = Math.sin(elapsed * 1.1 + h.phase) * 0.9;
          a.armPivot.rotation.z = Math.sin(elapsed * 2 + h.phase) * 0.06;  // subtle bob
          a.armPivot.rotation.y = h.angle + (h.snap > 0 ? Math.sin(elapsed * 10) * 0.35 : 0);
          const isSnap = h.snap > 0;
          a.claw.material.emissiveIntensity = isSnap ? 3.2 : 1.1;
        }
      }
      // 3. Magnet pit-stop: cycle the field on/off, pulse the coil + beam, and
      //    expose the live flag main.js reads to yank a near grounded car up to
      //    magnet.holdY while active. A counter (magnet.hits) edges FWOOSH.
      {
        magnet.t += delta;
        const cyc = MAGNET.on + MAGNET.off;
        const inOn = (magnet.t % cyc) < MAGNET.on;
        if (inOn !== magnet.active) {
          magnet.active = inOn;
          if (inOn) magnet.hits++;
        }
        const pul = 0.5 + 0.5 * Math.sin(magnet.t * (inOn ? 9 : 2.5));
        const light = magGroup.userData.light;
        light.intensity = inOn ? 2.4 + pul * 2.2 : 0.15;
        magGroup.userData.coil.material.emissiveIntensity = inOn ? 2.6 + pul * 1.8 : 0.35;
        magGroup.userData.beam.material.opacity = inOn ? 0.06 + pul * 0.1 : 0.01;
      }
      // 5. Express tube: ride the air-jet rings along the centre line. Each
      //    ring advances one-ninth of the tube per loop; the rings read as
      //    pneumatic pulses shooting toward the exit. The intake halo breathes.
      //    A TorusGeometry lies in the XY plane with its hole along +Z, so the
      //    ring's +Z is rotated onto the tube's unit tangent — its hole plane
      //    then matches the tube's cross-section exactly (a plain rotation.y
      //    only worked on flat runs, which is why the rings read sideways on
      //    the climbs).
      {
        for (let k = 0; k < tubeRings.length; k++) {
          // Rings "travel" always toward the far mouth the ride heads for: on a
          // return ride (expressTube.dir = -1) the +1 modulo wraps the phase
          // so the band sweeps glass-city-bound instead of skate-park-bound.
          const dir = expressTube.dir || 1;
          const s = (((elapsed * 0.22 * dir) + k / tubeRings.length) % 1 + 1) % 1;
          const p = expressTubePoint(s);
          const tan = expressTubeTangent(s);
          tubeRings[k].position.set(p.x, p.y, p.z);
          _ringT.set(tan.tx, tan.ty, tan.tz);
          _ringQuat.setFromUnitVectors(_ringZ, _ringT);
          tubeRings[k].quaternion.copy(_ringQuat);
        }
      }
    },
  };
}
