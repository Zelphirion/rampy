import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable } from '../../physics.js';
import { tirePyramidSlots, tirePyramidSupports } from '../../modules/tireStack.js';

// Ramp-world safe playable band: extend a little beyond the visible edge so
// nudging something past these bounds counts as "off the world" and it
// should drop away.
const RAMP_WORLD_BOUNDS = { xLo: -95, xHi: 95, zLo: -95, zHi: 128 };
function rampIsOffEdge(pos) {
  return pos.x < RAMP_WORLD_BOUNDS.xLo || pos.x > RAMP_WORLD_BOUNDS.xHi || pos.z < RAMP_WORLD_BOUNDS.zLo || pos.z > RAMP_WORLD_BOUNDS.zHi;
}

// ===== Ramp world =====
// The portal's destination: a warm twilight hillscape. The ground height is a
// smooth, PERIODIC rolling-hills function PLUS a handful of LOCAL drivable
// features (bumpy mounds, a rounded velodrome, a skatepark of dips & curves)
// — all baked into the SAME height function, so the terrain mesh exactly
// matches the physics the car rides (no invisible surface vs. visible mesh
// mismatch). The periodic base matches itself across the torus wrap seams
// (period 180 in x, 213 in z); the local features sit well inside the playable
// band and fade to 0 before the seams, so the wrap stays seamless.

// Base rolling hills — periodic, so the wrap seams line up exactly. The
// high-frequency terms make the ground properly BUMPY on top of the hills.
function rollingHills(x, z) {
  const wx = (x * Math.PI) / 90;
  const wz = (z * Math.PI) / 106.5;
  return (
    2.2 * Math.sin(wx + 1.0) * Math.cos(wz) +
    1.5 * Math.sin(2 * wx + 2.4) * Math.sin(2 * wz + 0.6) +
    1.0 * Math.sin(3 * wx + 0.3) * Math.cos(3 * wz + 1.8) +
    0.7 * Math.sin(wx + 0.5) * Math.sin(3 * wz + 2.2) +
    0.9 * Math.sin(4 * wx + 1.1) * Math.sin(4 * wz + 0.4) +
    0.6 * Math.cos(5 * wx + 0.2) * Math.cos(5 * wz + 1.3) +
    0.5 * Math.sin(6 * wx + 2.0) * Math.cos(6 * wz + 0.9) +
    0.35 * Math.sin(8 * wx + 0.7) * Math.sin(8 * wz + 1.5)
  );
}

// A smooth cosine-blended elliptical bump/dip: h * 0.5 * (1 + cos(pi*d)) inside
// the ellipse, 0 outside. h > 0 raises the ground (drive over it), h < 0 carves
// a dip (half-pipe / bowl). The zero-at-the-edge falloff means every feature
// blends seamlessly into the surrounding terrain.
function cosEl(x, z, ex, ez, rx, rz, h) {
  const d = Math.hypot((x - ex) / rx, (z - ez) / rz);
  if (d >= 1) return 0;
  return h * 0.5 * (1 + Math.cos(Math.PI * d));
}

const bumpyObjectEls = [
  { x: 10, z: -75, rx: 5, rz: 4, h: 2.2 },
  { x: -20, z: -85, rx: 4, rz: 4, h: 1.8 },
  { x: 80, z: 10, rx: 5, rz: 5, h: 2.4 },
  { x: -75, z: -40, rx: 5, rz: 4, h: 2.0 },
  { x: 15, z: 15, rx: 3.5, rz: 3.5, h: 1.6 },
  { x: -10, z: 70, rx: 4.5, rz: 4.5, h: 2.0 },
  { x: 65, z: -55, rx: 8, rz: 1.8, h: 1.3 },
  { x: -10, z: 50, rx: 1.8, rz: 8, h: 1.3 },
  { x: 85, z: 60, rx: 3, rz: 3, h: 1.5 },
  { x: -30, z: -20, rx: 6, rz: 3, h: 1.7 },
  { x: 78, z: -66, rx: 3, rz: 1.7, h: 1.2 },
  { x: 78, z: -60, rx: 3, rz: 1.7, h: 1.2 },
  { x: 78, z: -54, rx: 3, rz: 1.7, h: 1.2 },
  { x: 78, z: -48, rx: 3, rz: 1.7, h: 1.2 },
  { x: 78, z: -42, rx: 3, rz: 1.7, h: 1.2 },
  { x: -16, z: 106, rx: 3, rz: 8, h: 1.6 },
  { x: 0, z: 96, rx: 3, rz: 8, h: 1.6 },
  { x: -16, z: 86, rx: 3, rz: 8, h: 1.6 },
  { x: -80, z: -84, rx: 2.6, rz: 2.6, h: 2.2 },
  { x: -80, z: -76, rx: 2.6, rz: 2.6, h: 2.2 },
  { x: -80, z: -68, rx: 2.6, rz: 2.6, h: 2.2 },
  { x: -80, z: -60, rx: 2.6, rz: 2.6, h: 2.2 },
];
function bumpyObjectGround(x, z) {
  let s = 0;
  for (const e of bumpyObjectEls) s += cosEl(x, z, e.x, e.z, e.rx, e.rz, e.h);
  return s;
}

const velodromeDef = { x: -48, z: 5, rx: 40, rz: 28, dip: 2.6, bank: 12.0 };
function velodromeShape(d) {
  if (d <= 0.55) return -velodromeDef.dip * 0.5 * (1 + Math.cos((Math.PI * d) / 0.55));
  if (d <= 0.775) return velodromeDef.bank * 0.5 * (1 - Math.cos((Math.PI * (d - 0.55)) / 0.225));
  if (d <= 1) return velodromeDef.bank * 0.5 * (1 + Math.cos((Math.PI * (d - 0.775)) / 0.225));
  return 0;
}
function velodromeGround(x, z) {
  const d = Math.hypot((x - velodromeDef.x) / velodromeDef.rx, (z - velodromeDef.z) / velodromeDef.rz);
  if (d >= 1) return 0;
  return velodromeShape(d);
}

const skateparkEls = [
  { x: 18, z: 98, rx: 14, rz: 5, h: -3.0 },
  { x: 40, z: 100, rx: 5, rz: 12, h: -2.6 },
  { x: 12, z: 112, rx: 7, rz: 7, h: -2.6 },
  { x: 34, z: 112, rx: 6, rz: 3.5, h: 2.6 },
  { x: 47, z: 96, rx: 3.5, rz: 2.2, h: 1.4 },
  { x: 48, z: 112, rx: 3.5, rz: 2.2, h: 1.4 },
];
function skateparkGround(x, z) {
  let s = 0;
  for (const e of skateparkEls) s += cosEl(x, z, e.x, e.z, e.rx, e.rz, e.h);
  return s;
}

const bowlingPad = { cx: -30, cz: -38, hw: 13, hd: 13, edge: 4, flatY: 0.2 };
function bowlingPadGround(x, z, base) {
  const dx = Math.max(Math.abs(x - bowlingPad.cx) - bowlingPad.hw, 0);
  const dz = Math.max(Math.abs(z - bowlingPad.cz) - bowlingPad.hd, 0);
  const d = Math.hypot(dx, dz);
  if (d >= bowlingPad.edge) return 0;
  const t = 0.5 * (1 + Math.cos((Math.PI * d) / bowlingPad.edge));
  return (bowlingPad.flatY - base) * t;
}

const hammerPad = { cx: 0, cz: 70, hw: 20, hd: 20, edge: 5, flatY: 0.2 };
function hammerPadGround(x, z, base) {
  const dx = Math.max(Math.abs(x - hammerPad.cx) - hammerPad.hw, 0);
  const dz = Math.max(Math.abs(z - hammerPad.cz) - hammerPad.hd, 0);
  const d = Math.hypot(dx, dz);
  if (d >= hammerPad.edge) return 0;
  const t = 0.5 * (1 + Math.cos((Math.PI * d) / hammerPad.edge));
  return (hammerPad.flatY - base) * t;
}
const trebPad = { cx: -50, cz: 70, hw: 11, hd: 9, edge: 3, flatY: 1.3 };
function trebPadGround(x, z, base) {
  const dx = Math.max(Math.abs(x - trebPad.cx) - trebPad.hw, 0);
  const dz = Math.max(Math.abs(z - trebPad.cz) - trebPad.hd, 0);
  const d = Math.hypot(dx, dz);
  if (d >= trebPad.edge) return 0;
  const t = 0.5 * (1 + Math.cos((Math.PI * d) / trebPad.edge));
  return (trebPad.flatY - base) * t;
}

const tireFlatArea = { cx: 8, cz: -18, hw: 7, hd: 4.5 };
const tireFlatBase = rollingHills(tireFlatArea.cx, tireFlatArea.cz)
  + bumpyObjectGround(tireFlatArea.cx, tireFlatArea.cz)
  + velodromeGround(tireFlatArea.cx, tireFlatArea.cz)
  + skateparkGround(tireFlatArea.cx, tireFlatArea.cz);

export function terrainHeightAt(x, z) {
  const base = rollingHills(x, z) + bumpyObjectGround(x, z) + velodromeGround(x, z) + skateparkGround(x, z);
  if (Math.abs(x - tireFlatArea.cx) <= tireFlatArea.hw &&
      Math.abs(z - tireFlatArea.cz) <= tireFlatArea.hd) return tireFlatBase;
  return base + bowlingPadGround(x, z, base) + hammerPadGround(x, z, base) + trebPadGround(x, z, base);
}

export const wheelOfDeathDef = { x: 35, z: -5, R: 9.5 };
export const wheelOfDeathPaddles = { count: 12, len: 2.4, wid: 1.6, thick: 0.9, radial: 0.9 };

const hammerDefs = [
  { z: 58, phase: 0 },
  { z: 68, phase: 0.8 * Math.PI },
  { z: 78, phase: 1.6 * Math.PI },
  { z: 88, phase: 2.4 * Math.PI },
];
const HAMMER_HALFSPAN = 22;
const HAMMER_PIVOT_H = 15;
const HAMMER_ARM = HAMMER_PIVOT_H - 1.6;
const HAMMER_SWEEP = 1.0;
const HAMMER_FREQ = 0.75;
const HAMMER_HEAD_R = 1.5;
const HAMMER_HEAD_L = 4.0;
const TREBUCHET_POS = { x: -50, z: 70 };
const BOULDER_POS = { x: 78, z: 42 };

export const rampWorldFeatures = {
  velodrome: { x: velodromeDef.x, z: velodromeDef.z, rx: velodromeDef.rx, rz: velodromeDef.rz },
  skatepark: skateparkEls.map((e) => ({ x: e.x, z: e.z, rx: e.rx, rz: e.rz })),
  bumpyObjects: bumpyObjectEls.map((e) => ({ x: e.x, z: e.z, rx: e.rx, rz: e.rz })),
  wheelOfDeath: wheelOfDeathDef,
  hammerGauntlet: { x: 0, z: 70, zs: hammerDefs.map((d) => d.z), side: 0 },
  trebuchet: TREBUCHET_POS,
  boulder: BOULDER_POS,
};

function makeDirtTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9c6b38';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = Math.random();
    const lite = Math.random() < 0.1;
    const dark = Math.random() < 0.14;
    let r = 156 + (n - 0.5) * 50;
    let g = 107 + (n - 0.5) * 40;
    let b = 56 + (n - 0.5) * 28;
    if (lite) { r += 55; g += 38; b += 20; }
    if (dark) { r -= 60; g -= 42; b -= 24; }
    d[i] = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, b));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRampWorld(scene) {
  const x0 = -95, x1 = 95;
  const z0 = -96, z1 = 127;
  const segX = 192, segZ = 224;
  const verts = [];
  const uvs = [];
  const idx = [];
  for (let iz = 0; iz <= segZ; iz++) {
    for (let ix = 0; ix <= segX; ix++) {
      const x = x0 + ((x1 - x0) * ix) / segX;
      const z = z0 + ((z1 - z0) * iz) / segZ;
      verts.push(x, terrainHeightAt(x, z), z);
      uvs.push(ix / segX, iz / segZ);
    }
  }
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * (segX + 1) + ix;
      const b = a + 1;
      const c = a + segX + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map: makeDirtTexture(),
      roughness: 1,
      emissive: 0x241505,
      emissiveIntensity: 0.22,
    })
  );
  ground.receiveShadow = true;
  scene.add(ground);
  return { terrainHeightAt };
}

const RAMP_WORLD_GROUND = 0.15;
const rampWorldRampDefs = [
  { x: 30, z: -40, runX: 1, runZ: 0, len: 18, width: 9, height: 7, boost: 1.15 },
  { x: -30, z: 30, runX: -Math.SQRT1_2, runZ: Math.SQRT1_2, len: 16, width: 8, height: 6, boost: 1.1 },
  { x: 55, z: 75, runX: 0, runZ: -1, len: 22, width: 9, height: 9, boost: 1.2 },
  { x: -60, z: 90, runX: 1, runZ: 0, len: 14, width: 8, height: 5, boost: 1.1 },
  { x: -45, z: -70, runX: 0, runZ: 1, len: 18, width: 9, height: 7, boost: 1.15 },
  { x: 60, z: -10, runX: 0, runZ: 1, len: 18, width: 8, height: 6, boost: 1.15 },
  { x: 64, z: 30, runX: 1, runZ: 0, len: 10, width: 7, height: 3.5, boost: 1.15 },
  { x: 80, z: 30, runX: 1, runZ: 0, len: 12, width: 7, height: 2.2, boost: 1 },
];

export function buildRampWorldRamps(scene, terrainHeightAt) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.95 });
  const lipMat = new THREE.MeshStandardMaterial({
    color: 0xffb04a,
    emissive: 0xff9a2a,
    emissiveIntensity: 1.3,
    roughness: 0.5,
  });
  const ramps = [];
  for (const r of rampWorldRampDefs) {
    const baseY = terrainHeightAt(r.x, r.z) + RAMP_WORLD_GROUND;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(r.len, 0);
    shape.lineTo(r.len, r.height);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: r.width, bevelEnabled: false });
    geo.translate(-r.len / 2, 0, -r.width / 2);
    const group = new THREE.Group();
    const body = new THREE.Mesh(geo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, r.width), lipMat);
    lip.position.set(r.len / 2 - 0.3, r.height + 0.14, 0);
    lip.castShadow = true;
    group.add(lip);
    group.rotation.y = Math.atan2(-r.runZ, r.runX);
    group.position.set(r.x, baseY, r.z);
    scene.add(group);
    ramps.push({ ...r, baseY, mesh: group });
  }
  return { ramps };
}

export function createPortal(scene, x, y, z, radius, color) {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.7,
    roughness: 0.3,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.32, 12, 48), ringMat);
  group.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.78, 0.16, 10, 40), ringMat.clone());
  ring2.material.emissiveIntensity = 2.4;
  group.add(ring2);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.85, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(glow);
  const light = new THREE.PointLight(color, 18, 45, 2);
  group.add(light);
  group.position.set(x, y, z);
  scene.add(group);
  return { x, y, z, radius, triggerRadius: radius * 1.9, ring, ring2, glow, light, group };
}

export function createVortex(scene, x, z, terrainHeightAt) {
  const FLOAT = 1;
  const baseY = terrainHeightAt(x, z) + RAMP_WORLD_GROUND + FLOAT;
  const R = 12;
  const H = 22;
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(R, 48),
    new THREE.MeshBasicMaterial({ color: 0x0c0716, transparent: true, opacity: 0.9, depthWrite: false })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = baseY + 0.04;
  group.add(pool);

  const armSpin = new THREE.Group();
  const armMat = new THREE.MeshBasicMaterial({
    color: 0xa06bff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let a = 0; a < 4; a++) {
    for (let i = 0; i < 44; i++) {
      const t = i / 44;
      const ang = a * (Math.PI / 2) + t * 3.2 * Math.PI;
      const rr = R * (1 - t * 0.92);
      const seg = new THREE.Mesh(
        new THREE.PlaneGeometry(2.1 * (1 - t * 0.55), 0.9 * (1 - t * 0.55)),
        armMat
      );
      seg.position.set(Math.cos(ang) * rr, baseY + 0.08, Math.sin(ang) * rr);
      seg.rotation.x = -Math.PI / 2;
      armSpin.add(seg);
    }
  }
  group.add(armSpin);

  const ringSpin = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x7ef9ff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const rr of [3.2, 6.5, 9.4]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.12, 6, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = baseY + 0.1;
    ringSpin.add(ring);
  }
  group.add(ringSpin);

  const funnelMat = new THREE.MeshBasicMaterial({
    color: 0x6f3cff,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const funnel = new THREE.Mesh(new THREE.ConeGeometry(R * 0.5, H, 20, 1, true), funnelMat);
  funnel.position.y = baseY + H / 2;
  group.add(funnel);

  const ribbonSpin = new THREE.Group();
  const ribMat = new THREE.MeshBasicMaterial({
    color: 0x7ef9ff,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let a = 0; a < 3; a++) {
    for (let i = 0; i < 36; i++) {
      const t = i / 36;
      const ang = a * ((2 * Math.PI) / 3) + t * 4.5 * Math.PI;
      const rr = R * 0.46 * (1 - t * 0.85);
      const py = baseY + t * H * 0.9;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), ribMat);
      q.position.set(Math.cos(ang) * rr, py, Math.sin(ang) * rr);
      q.lookAt(x, py, z);
      ribbonSpin.add(q);
    }
  }
  group.add(ribbonSpin);

  const light = new THREE.PointLight(0x9d5cff, 30, 40, 2);
  light.position.set(0, baseY + 2.5, 0);
  group.add(light);

  scene.add(group);
  return { x, z, baseY, armSpin, ringSpin, ribbonSpin, funnel, light };
}

export function createClouds(scene) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xd9ccff,
    emissiveIntensity: 0.3,
    roughness: 1,
  });
  const clouds = [];
  const defs = [
    { x: -72, y: 36, z: -32, s: 1.5, puffs: 5 },
    { x: -32, y: 44, z: 42, s: 1.9, puffs: 6 },
    { x: 14, y: 40, z: 78, s: 1.7, puffs: 5 },
    { x: 56, y: 30, z: -56, s: 1.3, puffs: 4 },
    { x: 82, y: 46, z: 22, s: 2.0, puffs: 7 },
    { x: -56, y: 42, z: 104, s: 1.6, puffs: 5 },
    { x: 38, y: 36, z: -12, s: 1.4, puffs: 4 },
  ];
  for (const d of defs) {
    const g = new THREE.Group();
    for (let i = 0; i < d.puffs; i++) {
      const a = (i / d.puffs) * Math.PI * 2;
      const r = (Math.random() * 0.45 + 0.15) * d.s;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry((Math.random() * 0.6 + 0.7) * d.s, 10, 8),
        mat
      );
      puff.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 0.6 * d.s, Math.sin(a) * r);
      puff.scale.y = 0.55;
      g.add(puff);
    }
    g.position.set(d.x, d.y, d.z);
    g.userData.speed = (Math.random() * 0.7 + 0.3) * (Math.random() < 0.5 ? 1 : -1);
    scene.add(g);
    clouds.push(g);
  }
  return clouds;
}

export function createWheelOfDeath(scene, x, z, terrainHeightAt) {
  const R = wheelOfDeathDef.R;
  const tube = 0.8;
  const groundY = terrainHeightAt(x, z) + RAMP_WORLD_GROUND;
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const spin = new THREE.Group();
  spin.position.y = groundY + R + 0.2;

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x5a1a10,
    emissive: 0xff4a1a,
    emissiveIntensity: 1.6,
    roughness: 0.4,
    metalness: 0.15,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 12, 64), rimMat);
  rim.castShadow = true;
  spin.add(rim);

  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x7f2a10,
    emissive: 0xff6a2a,
    emissiveIntensity: 1.3,
    roughness: 0.5,
  });
  const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.8, 0.16, 8, 64), innerMat);
  spin.add(inner);

  const spokeMat = new THREE.MeshStandardMaterial({
    color: 0x3a1210,
    emissive: 0x6a2418,
    emissiveIntensity: 0.7,
    roughness: 0.6,
  });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 14), spokeMat);
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, R * 1.9, 0.22), spokeMat);
    spoke.rotation.z = (i / 6) * Math.PI * 2;
    spin.add(spoke);
  }

  const paddleMat = new THREE.MeshStandardMaterial({
    color: 0x6b3a1e,
    emissive: 0xff7a2a,
    emissiveIntensity: 0.5,
    roughness: 0.6,
  });
  const P = wheelOfDeathPaddles;
  const paddleRad = R + P.radial;
  const paddleGeo = new THREE.BoxGeometry(P.len, P.wid, P.thick);
  for (let i = 0; i < P.count; i++) {
    const a = (i / P.count) * Math.PI * 2;
    const paddle = new THREE.Mesh(paddleGeo, paddleMat);
    paddle.position.set(Math.cos(a) * paddleRad, Math.sin(a) * paddleRad, 0);
    paddle.rotation.z = a;
    paddle.castShadow = true;
    spin.add(paddle);
  }

  group.add(spin);
  const light = new THREE.PointLight(0xff5a20, 26, 34, 2);
  light.position.set(0, groundY + R * 0.5, 0);
  group.add(light);

  scene.add(group);
  return { x, z, R, spin };
}

function makeWoodTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9c6b38';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = Math.random();
    let r = 156 + (n - 0.5) * 60;
    let g = 107 + (n - 0.5) * 44;
    let b = 58 + (n - 0.5) * 30;
    d[i] = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, b));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let s = 0; s < 70; s++) {
    const x0 = Math.random() * size;
    const wobble = Math.random() * 4 + 1;
    const phase = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    for (let y = 0; y <= size; y += 8) {
      ctx.lineTo(x0 + Math.sin(y * 0.05 + phase) * wobble, y);
    }
    ctx.strokeStyle = `rgba(72, 44, 22, ${(Math.random() * 0.35 + 0.15).toFixed(2)})`;
    ctx.lineWidth = Math.random() * 1.8 + 0.5;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(48, 28, 12, 0.4)';
  for (let s = 0; s < 9; s++) {
    const x = Math.random() * size;
    ctx.fillRect(x, 0, Math.random() * 2.2 + 0.8, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRampWorldProps(scene, terrainHeightAt) {
  const at = (x, z) => terrainHeightAt(x, z) + RAMP_WORLD_GROUND;
  const woodTex = makeWoodTexture();
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd02020, roughness: 0.5 });
  const PIN_R = 5;
  const PIN_H = 9.0;
  const pinProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(1.50, 0.0),
    new THREE.Vector2(1.70, 0.6),
    new THREE.Vector2(1.65, 1.4),
    new THREE.Vector2(1.30, 2.4),
    new THREE.Vector2(0.90, 3.3),
    new THREE.Vector2(0.60, 4.2),
    new THREE.Vector2(0.55, 5.0),
    new THREE.Vector2(0.65, 5.8),
    new THREE.Vector2(0.85, 6.6),
    new THREE.Vector2(1.00, 7.2),
    new THREE.Vector2(1.05, 7.8),
    new THREE.Vector2(1.00, 8.4),
    new THREE.Vector2(0.70, 8.8),
    new THREE.Vector2(0.60, PIN_H),
    new THREE.Vector2(0.0, PIN_H),
  ];
  const pinGeo = new THREE.LatheGeometry(pinProfile, 20);
  const pinSpacing = 4.5;
  const acx = -30, acz = -44;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      const px = acx + (i - row / 2) * pinSpacing;
      const pz = acz + row * pinSpacing;
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.y = 0;
      pin.castShadow = true;
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.70, 0.8, 20), stripeMat);
      stripe.position.y = 5.0;
      pin.add(stripe);
      const g = new THREE.Group();
      g.add(pin);
      g.position.set(px, at(px, pz) - 0.2, pz);
      scene.add(g);
      addKnockable(g, 1.8, { fallTime: 0.3, isOffEdge: rampIsOffEdge });
    }
  }

  const domMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.35 });
  const pipMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 });
  const dominoes = [];
  const DOM_W = 0.9, DOM_H = 6.5, DOM_D = 2.5;
  const dStartX = -34, dZ = -55;
  const dCount = 12, dSpacing = 3.0;
  const PIPS = {
    1: [[0, 0]],
    2: [[-0.5, -0.5], [0.5, 0.5]],
    3: [[-0.5, -0.5], [0, 0], [0.5, 0.5]],
    4: [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]],
    5: [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5], [0, 0]],
    6: [[-0.5, -0.5], [-0.5, 0], [-0.5, 0.5], [0.5, -0.5], [0.5, 0], [0.5, 0.5]],
  };
  for (let i = 0; i < dCount; i++) {
    const dx = dStartX + i * dSpacing;
    const g = new THREE.Group();
    const d = new THREE.Mesh(new THREE.BoxGeometry(DOM_W, DOM_H, DOM_D), domMat);
    d.position.y = DOM_H / 2;
    d.castShadow = true;
    g.add(d);
    const pipGeo = new THREE.SphereGeometry(0.26, 10, 8);
    const pipW = 1.6, pipH = 2.0;
    const cyTop = DOM_H * 0.75, cyBot = DOM_H * 0.25;
    const top = (i % 6) + 1, bottom = ((i * 2 + 3) % 6) + 1;
    for (const faceX of [DOM_W / 2 + 0.04, -DOM_W / 2 - 0.04]) {
      const divider = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, DOM_D - 0.15), pipMat);
      divider.position.set(faceX, DOM_H / 2, 0);
      g.add(divider);
      const place = (list, cy) => {
        for (const [pu, pv] of list) {
          const p = new THREE.Mesh(pipGeo, pipMat);
          p.position.set(faceX, cy + pv * pipH, pu * pipW);
          g.add(p);
        }
      };
      place(PIPS[top], cyTop);
      place(PIPS[bottom], cyBot);
    }
    g.position.set(dx, at(dx, dZ), dZ);
    scene.add(g);
    dominoes.push(addKnockable(g, DOM_D / 2, {
      mode: 'domino', fallTime: 0.9,
      dominoW: DOM_W, dominoH: DOM_H, dominoD: DOM_D,
      isOffEdge: rampIsOffEdge,
    }));
  }

  const barrelMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
  const barrelGeo = new THREE.CylinderGeometry(2.75, 2.75, 5.5, 14);
  const barrelRows = [[24, 30, 36, 42, 48], [27, 33, 39, 45]];
  const bZ = -72;
  barrelRows.forEach((row, ri) => {
    const rz = bZ + ri * 6;
    for (const x of row) {
      const b = new THREE.Mesh(barrelGeo, barrelMat);
      b.position.y = 2.75;
      b.castShadow = true;
      const g = new THREE.Group();
      g.add(b);
      g.position.set(x, at(x, rz), rz);
      scene.add(g);
      addKnockable(g, 4.0, { mode: 'slide', slideDistance: 9, fallTime: 1, isOffEdge: rampIsOffEdge });
    }
  });

  const logMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 });
  const logGeo = new THREE.CylinderGeometry(2.1, 2.1, 13, 14);
  const logs = [
    { x: -88, z: 22, rotY: 0.3 },
    { x: -74, z: 32, rotY: -0.2 },
    { x: -92, z: 46, rotY: 1.1 },
    { x: -70, z: 54, rotY: 0.6 },
    { x: -82, z: 64, rotY: -0.9 },
  ];
  for (const L of logs) {
    const g = new THREE.Group();
    const roll = new THREE.Group();
    const spin = new THREE.Group();
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.x = Math.PI / 2;
    log.position.y = 0;
    spin.position.y = 2.1;
    log.castShadow = true;
    spin.add(log);
    roll.add(spin);
    roll.rotation.y = L.rotY;
    g.add(roll);
    g.position.set(L.x, at(L.x, L.z), L.z);
    scene.add(g);
    addKnockable(g, 8.0, {
      mode: 'roll', rollRadius: 2.1, rollHalfLen: 6.5, rollPower: 24, rollDecay: 1.0, rollWrapX: 180,
      spinGroup: spin,
      rollAxis: new THREE.Vector3(Math.sin(L.rotY), 0, Math.cos(L.rotY)),
      isOffEdge: rampIsOffEdge,
    });
  }

  // ===== Tire pyramid =====
  // A junkyard pile of big old tires straight ahead of the ramp-world spawn:
  // eight flat-stacked rows shrinking 8-1 (36 tires, ~8 tall). Tires are
  // proper cylinders with an open hole through the middle — the car-wheel
  // look scaled up, not rounded inner tubes. Every tire is its own knockable:
  // plow into the stack and struck tires pop off (most roll away on their
  // rims, some tumble flat onto their side and skid away spinning), and
  // knocking out both tires under one makes it drop with gravity — sometimes
  // skidding away on impact too (physics.js 'tire' mode).
  const PYRAMID_POS = { x: 8, z: -18 };
  const tireGroundY = at(PYRAMID_POS.x, PYRAMID_POS.z);
  const TIRE_OUTER_R = 0.6;   // tread radius, close to the car wheel size
  const TIRE_HOLE_R = 0.3;    // open hole through the middle
  const TIRE_HALF_W = 0.15;   // half the sidewall-to-sidewall width
  const tireShape = new THREE.Shape();
  tireShape.absarc(0, 0, TIRE_OUTER_R, 0, Math.PI * 2, false);
  const tireHole = new THREE.Path();
  tireHole.absarc(0, 0, TIRE_HOLE_R, 0, Math.PI * 2, true);
  tireShape.holes.push(tireHole);
  const tireGeo = new THREE.ExtrudeGeometry(tireShape, {
    depth: TIRE_HALF_W * 2,
    bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2,
    curveSegments: 30,
  });
  tireGeo.rotateX(-Math.PI / 2);            // extrude axis → vertical: lies flat
  tireGeo.translate(0, -TIRE_HALF_W, 0);    // centre the ring on its origin
  const tireMats = [
    new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x3d3934, roughness: 0.9 }),  // sun-bleached worn ones
  ];
  const tireKs = [];
  for (const s of tirePyramidSlots({
    rows: 8,
    spacing: TIRE_OUTER_R * 2 + 0.05,
    nestStep: TIRE_HALF_W * 2 + 0.005,
    tubeR: TIRE_HALF_W,
  })) {
    const px = PYRAMID_POS.x + s.x;
    const pz = PYRAMID_POS.z;
    const g = new THREE.Group();
    const spin = new THREE.Group();       // spun around its axle while rolling
    const tire = new THREE.Mesh(tireGeo, tireMats[s.row % 2]);
    tire.castShadow = true;
    spin.add(tire);
    g.add(spin);
    g.position.set(px, tireGroundY + s.y, pz);
    scene.add(g);
    tireKs.push(addKnockable(g, TIRE_OUTER_R, {
      mode: 'tire',
      fallTime: 0.55,
      slideDistance: 4.5,
      flyHeight: 1.2,
      rimLift: TIRE_OUTER_R - TIRE_HALF_W,     // centre gain flat→on-rim
      groundY: tireGroundY + TIRE_HALF_W,      // where it rests on the flat dirt
      rollRadius: TIRE_OUTER_R,                // on-rim rolling radius
      rollPower: 20,
      rollDecay: 0.8,
      rollDuration: 0.35 + ((s.row * 5 + s.i) % 5) * 0.06,
      sideChance: 0.3,
      dropDelay: 0.15 + s.row * 0.28 + ((s.row * 3 + s.i) % 3) * 0.1,
      rollWrapX: 180,
      spinGroup: spin,
      rollSpinAxis: 'y',
      isOffEdge: rampIsOffEdge,
    }));
  }
  // Wire the stack: each tire rests on the two tires diagonally below it, so
  // it only drops once BOTH have been knocked out of their slots.
  for (const w of tirePyramidSupports(8)) {
    tireKs[w.slot].supporters = [tireKs[w.a], tireKs[w.b]];
  }

  return {
    bowlingAlley: { x: acx, z: acz, radius: 4 },
    dominoRun: { x: dStartX + ((dCount - 1) / 2) * dSpacing, z: dZ, length: dCount * dSpacing },
    barrelRun: { x: 36, z: bZ, w: 30 },
    timberYard: { x: -80, z: 42, w: 30 },
    tirePyramid: { x: PYRAMID_POS.x, z: PYRAMID_POS.z },
  };
}

export function buildHammers(scene, terrainHeightAt) {
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x5a4428, roughness: 0.9 });
  const boomMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.85 });
  const ballMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.45, metalness: 0.45 });
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xffb04a, emissive: 0xff7a1a, emissiveIntensity: 0.9, roughness: 0.5,
  });

  const hammers = [];
  for (const d of hammerDefs) {
    const groundY = terrainHeightAt(0, d.z) + RAMP_WORLD_GROUND;
    const pivotY = groundY + HAMMER_PIVOT_H;
    const group = new THREE.Group();
    group.position.set(0, groundY, d.z);

    const legGeo = new THREE.CylinderGeometry(0.7, 0.9, HAMMER_PIVOT_H, 12);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, mastMat);
      leg.position.set(s * HAMMER_HALFSPAN, HAMMER_PIVOT_H / 2, 0);
      leg.castShadow = true;
      group.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HAMMER_HALFSPAN * 2, 1.1, 1.1), boomMat);
    beam.position.y = HAMMER_PIVOT_H;
    beam.castShadow = true;
    group.add(beam);

    const pivot = new THREE.Group();
    pivot.position.y = HAMMER_PIVOT_H;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, HAMMER_ARM, 8), mastMat);
    rod.position.y = -HAMMER_ARM / 2;
    pivot.add(rod);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(HAMMER_HEAD_R, HAMMER_HEAD_R, HAMMER_HEAD_L, 16), ballMat);
    head.rotation.z = Math.PI / 2;
    head.position.y = -HAMMER_ARM;
    head.castShadow = true;
    pivot.add(head);
    const capGeo = new THREE.CylinderGeometry(HAMMER_HEAD_R + 0.12, HAMMER_HEAD_R + 0.12, 0.35, 16);
    capGeo.rotateZ(Math.PI / 2);
    const capA = new THREE.Mesh(capGeo, bandMat);
    capA.position.set(-HAMMER_HEAD_L / 2, -HAMMER_ARM, 0);
    pivot.add(capA);
    const capB = capA.clone();
    capB.position.x = HAMMER_HEAD_L / 2;
    pivot.add(capB);

    group.add(pivot);
    scene.add(group);

    hammers.push({
      x: 0, z: d.z, phase: d.phase,
      freq: HAMMER_FREQ, sweep: HAMMER_SWEEP, armLen: HAMMER_ARM,
      headRadius: HAMMER_HEAD_R, pivotY,
      cooldown: 0,
      group, pivot,
    });
  }
  return hammers;
}

export function createTrebuchet(scene, x, z, terrainHeightAt) {
  const baseY = terrainHeightAt(x, z) + RAMP_WORLD_GROUND;
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.95 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.4, metalness: 0.7 });

  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 7), darkMat);
  base.position.set(-1, baseY + 0.5, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const aShape = new THREE.Shape();
  aShape.moveTo(-4, 0);
  aShape.lineTo(1, 3.6);
  aShape.lineTo(-4, 3.6);
  aShape.closePath();
  const aGeo = new THREE.ExtrudeGeometry(aShape, { depth: 0.6, bevelEnabled: false });
  aGeo.translate(0, 0, -0.3);
  for (const sz of [-3.5, 3.5]) {
    const frame = new THREE.Mesh(aGeo, woodMat);
    frame.position.set(0, baseY, sz);
    frame.castShadow = true;
    group.add(frame);
  }

  const axleY = baseY + 1.8;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 7.4, 10), metalMat);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0.2, axleY, 0);
  group.add(axle);

  const ARM_FRONT = 10, ARM_BACK = 5;
  const restAngle = -0.21, windupAngle = -0.34, throwAngle = 1.35;
  const arm = new THREE.Group();
  arm.position.set(0.2, axleY, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ARM_FRONT + ARM_BACK, 0.5, 0.5), woodMat);
  beam.position.x = (ARM_FRONT - ARM_BACK) / 2;
  beam.castShadow = true;
  arm.add(beam);
  const cup = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 4.2), woodMat);
  cup.position.set(ARM_FRONT - 1.5, 0.3, 0);
  cup.castShadow = true;
  arm.add(cup);
  const weight = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 3.6), darkMat);
  weight.position.set(-ARM_BACK + 0.6, -0.4, 0);
  weight.castShadow = true;
  arm.add(weight);

  group.add(arm);
  group.rotation.y = Math.PI;
  scene.add(group);

  const cupLocal = new THREE.Vector3(ARM_FRONT - 1.5, 0.3, 0);
  const cA = Math.cos(restAngle), sA = Math.sin(restAngle);
  const cupX = 0.2 + cupLocal.x * cA - cupLocal.y * sA;
  const cupY = axleY + cupLocal.x * sA + cupLocal.y * cA;
  const cupRest = { x: x - cupX, y: cupY, z };

  return {
    x, z, baseY, group, arm, axleY, cupRest,
    armFront: ARM_FRONT, armBack: ARM_BACK,
    restAngle, windupAngle, throwAngle,
    cupRadius: 3.4,
    state: 'idle', t: 0,
  };
}

export function createRollingBoulder(scene, x, z, terrainHeightAt) {
  const R = 3.2;
  const homeY = terrainHeightAt(x, z) + RAMP_WORLD_GROUND + R;
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a6a74, roughness: 0.9, metalness: 0.05 });
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), mat);
  rock.castShadow = true;
  rock.receiveShadow = true;
  const group = new THREE.Group();
  group.add(rock);
  group.position.set(x, homeY, z);
  scene.add(group);

  return {
    x, z, R, group, rock,
    homeX: x, homeZ: z, homeY,
    state: 'idle',
    speed: 9,
    rolled: 0,
    triggerRadius: 20,
    hitRadius: 4.6,
    maxRoll: 100,
    cooldown: 0,
  };
}

export { rampIsOffEdge };
