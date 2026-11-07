import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable, triggerKnockable } from '../../physics.js?v=1793986751263';
import {
  FAIR_GROUND, FAIR_LANE, FERRIS, PENDULUM, TILT, SWINGS,
  BOOTHS, FAIR_SCATTER, FAIR_RETURN, FAIR_BOUNDS,
  fairBoundsColliders,
} from './layout.js';

// ============================================================================
// The County Fair (night)
// ============================================================================
// A walled fairground reached through the circus big top. Everything is built
// here: the gravel midway, the concession booths, the loose physics props and
// the five big rides, which are the only things this module animates.
//
// main.js owns the scene move, the car's Y and the portal cuts. This module
// owns the meshes, the colliders and update(delta).

const TWO_PI = Math.PI * 2;

// Deterministic noise, so the gravel, the star field and the popcorn scatter
// look identical on every load.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ===== Palette ==============================================================
const NEON = {
  warm: 0xffc76a, amber: 0xffa33c, pink: 0xff5fb0, cyan: 0x5fe0ff,
  violet: 0xa06bff, red: 0xff3a2e, green: 0x6dff9c, white: 0xfff4e0,
};

// Unlit, always-bright materials: neon reads as neon even under the night rig.
function neonMat(color, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ color, fog: false });
  if (opacity < 1) { m.transparent = true; m.opacity = opacity; }
  return m;
}

// ===== Canvas signage =======================================================
const _signCache = new Map();
function signTexture(text, bg, fg) {
  const key = `${text}|${bg}|${fg}`;
  if (_signCache.has(key)) return _signCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  // A double border in the text colour keeps the plate reading as painted tin.
  g.strokeStyle = fg;
  g.lineWidth = 7;
  g.strokeRect(9, 9, 494, 110);
  g.fillStyle = fg;
  g.font = 'bold 62px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 70, 460);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _signCache.set(key, t);
  return t;
}

function signPanel(text, w, h, bg, fg) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: signTexture(text, bg, fg),
      emissive: 0xffffff,
      emissiveMap: signTexture(text, bg, fg),
      emissiveIntensity: 0.9,
      roughness: 0.7,
      metalness: 0.1,
    }),
  );
  return m;
}

// ===== Gravel + grass ground texture =======================================
function gravelTexture() {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const rng = makeRng(0xfa12e5);

  // Base: dark trodden gravel.
  g.fillStyle = '#4a423a';
  g.fillRect(0, 0, N, N);
  // Coarse stones.
  for (let i = 0; i < 9000; i++) {
    const v = 56 + Math.floor(rng() * 70);
    g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
    const s = 1 + rng() * 2.6;
    g.fillRect(rng() * N, rng() * N, s, s);
  }
  // Warm pools of light spill so the ground is not a flat grey sheet.
  for (let i = 0; i < 12; i++) {
    const x = rng() * N, y = rng() * N, r = 30 + rng() * 70;
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(255,170,80,0.16)');
    grad.addColorStop(0.6, 'rgba(255,120,60,0.06)');
    grad.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Deep blue shadow pooling.
  for (let i = 0; i < 8; i++) {
    const x = rng() * N, y = rng() * N, r = 40 + rng() * 80;
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(20,20,60,0.22)');
    grad.addColorStop(1, 'rgba(20,20,60,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 14);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ===== Night sky ============================================================
// The night backplate is the scene BACKGROUND, not a dome mesh: the level is
// 300 x 280 wide and the chase camera's far plane tops out at 500, so a sky
// sphere big enough to swallow the play area would be clipped. A background
// texture is drawn full-screen and can never be clipped.
function skyBackdropTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#04030c');
  grad.addColorStop(0.42, '#0a0a22');
  grad.addColorStop(0.68, '#1b1233');
  grad.addColorStop(0.86, '#38204a');
  grad.addColorStop(1.0, '#54304f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSky(scene) {
  const rng = makeRng(0x5c1e11);
  scene.background = skyBackdropTexture();

  // Stars: one Points cloud on the upper hemisphere, inside the far plane from
  // anywhere on the map. sizeAttenuation is off so they stay pin-sharp.
  const starCount = 1400;
  const pos = new Float32Array(starCount * 3);
  const col = new Float32Array(starCount * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const u = rng() * TWO_PI;
    const v = Math.acos(0.04 + rng() * 0.96);   // keep them above the horizon
    const r = 300;
    pos[i * 3] = Math.sin(v) * Math.cos(u) * r;
    pos[i * 3 + 1] = Math.cos(v) * r;
    pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
    const w = 0.65 + rng() * 0.35;
    tint.setRGB(w, w * (0.92 + rng() * 0.08), w * (0.9 + rng() * 0.1));
    col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.4, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.95,
  }));
  stars.renderOrder = -9;
  scene.add(stars);

  // A low moon so the backplate has an anchor.
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(18, 32),
    new THREE.MeshBasicMaterial({ color: 0xfdf6dd, fog: false }),
  );
  moon.position.set(-150, 165, 240);
  moon.lookAt(0, 40, 0);
  scene.add(moon);
  const moonGlow = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xbcd0ff, fog: false, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  moonGlow.position.copy(moon.position);
  moonGlow.quaternion.copy(moon.quaternion);
  scene.add(moonGlow);
}

// ===== Ground ===============================================================
function buildGround(scene) {
  const tex = gravelTexture();
  const { x0, x1, z0, z1 } = FAIR_BOUNDS;
  const w = x1 - x0, d = z1 - z0;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 260, d + 260),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.98, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((x0 + x1) / 2, FAIR_GROUND, (z0 + z1) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // The midway lane: a paler, swept strip laid a hair above the gravel.
  const laneW = FAIR_LANE.x1 - FAIR_LANE.x0;
  const laneD = FAIR_LANE.z1 - FAIR_LANE.z0;
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(laneW, laneD),
    new THREE.MeshStandardMaterial({ color: 0x5f5749, roughness: 0.95 }),
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.set((FAIR_LANE.x0 + FAIR_LANE.x1) / 2, FAIR_GROUND + 0.02, (FAIR_LANE.z0 + FAIR_LANE.z1) / 2);
  lane.receiveShadow = true;
  scene.add(lane);

  // Gravel apron in front of the rides.
  const apron = new THREE.Mesh(
    new THREE.CircleGeometry(96, 48),
    new THREE.MeshStandardMaterial({ color: 0x5a5348, roughness: 0.97 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, FAIR_GROUND + 0.015, 84);
  apron.receiveShadow = true;
  scene.add(apron);
}

// ===== Bulb strings =========================================================
// Every hanging bulb in the level is one InstancedMesh (three draw calls total
// for all the strings on the midway), so hundreds of bulbs cost almost nothing.
function buildBulbs(scene) {
  const pts = [];
  const add = (x, y, z, color) => pts.push({ x, y, z, color });

  const strand = (ax, ay, az, bx, by, bz, sag, color, step = 2.4) => {
    const len = Math.hypot(bx - ax, bz - az, by - ay);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      add(
        THREE.MathUtils.lerp(ax, bx, t),
        THREE.MathUtils.lerp(ay, by, t) - Math.sin(t * Math.PI) * sag,
        THREE.MathUtils.lerp(az, bz, t),
        color,
      );
    }
  };

  // Criss-crossing runs over the midway, hung from booth height to booth height
  // and anchored on the taller ride frames at the north end.
  const palette = [NEON.warm, NEON.pink, NEON.cyan, NEON.violet, NEON.white];
  let ci = 0;
  const nextColor = () => palette[(ci++) % palette.length];

  for (let z = -118; z <= 18; z += 17) {
    strand(-9.6, 7.4, z, 9.6, 7.4, z + 4, 1.5, nextColor());
    strand(-9.6, 7.4, z + 4, 9.6, 7.4, z, 1.5, nextColor());
  }
  // Two long runs down the lane edges.
  for (let z = -120; z <= 20; z += 9) {
    add(-10.2, 7.0 - Math.sin(((z + 120) / 140) * Math.PI) * 0.9, z, nextColor());
    add(10.2, 7.0 - Math.sin(((z + 120) / 140) * Math.PI) * 0.9, z, nextColor());
  }
  // The rides' outlines.
  const ferris = FERRIS;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TWO_PI;
    add(ferris.x + Math.cos(a) * (ferris.r + 1.2), ferris.hubY + Math.sin(a) * (ferris.r + 1.2), ferris.z, nextColor());
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TWO_PI;
    add(PENDULUM.x + Math.cos(a) * 12, 3.2, PENDULUM.z + Math.sin(a) * 12, nextColor());
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TWO_PI;
    add(TILT.x + Math.cos(a) * (TILT.r + 0.9), 3.4, TILT.z + Math.sin(a) * (TILT.r + 0.9), nextColor());
  }
  // Two garlands running the length of each booth row, just above the stall
  // roof line and clear of the giant sculptures that stand on it.
  for (const sx of [-1, 1]) {
    const bx = sx * 9.6;
    for (let z = -104; z <= 0; z += 13) {
      strand(bx, 7.0, z, bx, 7.0, z + 13, 1.1, nextColor(), 1.8);
    }
  }
  // The arrival gate.
  const gate = FAIR_RETURN;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = THREE.MathUtils.lerp(gate.x - 7, gate.x + 7, t);
    add(x, 9.4 - Math.sin(t * Math.PI) * 1.1, gate.z - 1.2, nextColor());
  }

  const geo = new THREE.SphereGeometry(0.15, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setHex(p.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = true;
  scene.add(mesh);
  return { mesh, mat };
}

// ===== Physics props ========================================================
export function makePopcornTub() {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9, side: THREE.DoubleSide });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.25, 0.72, 14, 1, true), paper);
  body.position.y = 0.36;
  body.castShadow = true;
  g.add(body);
  for (const y of [0.2, 0.5]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.32 - y * 0.12, 0.3 - y * 0.12, 0.08, 14), stripe);
    band.position.y = y;
    g.add(band);
  }
  const corn = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xf5e6a8, roughness: 1 }),
  );
  corn.scale.y = 0.55;
  corn.position.y = 0.7;
  g.add(corn);
  return g;
}

export function makeSodaCup() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.14, 0.52, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xdfe9f5, roughness: 0.5, side: THREE.DoubleSide }),
  );
  cup.position.y = 0.26;
  cup.castShadow = true;
  g.add(cup);
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.55 }),
  );
  lid.position.y = 0.53;
  g.add(lid);
  const straw = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
  );
  straw.position.set(0.03, 0.68, 0);
  straw.rotation.z = 0.16;
  g.add(straw);
  return g;
}

export function makePlush(color) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), fur);
  body.position.y = 0.34;
  body.scale.set(1, 1.05, 0.9);
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), fur);
  head.position.y = 0.78;
  g.add(head);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), fur);
    ear.position.set(sx * 0.16, 0.98, 0);
    g.add(ear);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.3 }),
    );
    eye.position.set(sx * 0.09, 0.82, 0.22);
    g.add(eye);
  }
  return g;
}

export function makeMilkBottle() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({
    color: 0xf2f6ff, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.72,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.5, 12), glass);
  body.position.y = 0.25;
  body.castShadow = true;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.2, 12), glass);
  neck.position.y = 0.6;
  g.add(neck);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.6 }),
  );
  cap.position.y = 0.72;
  g.add(cap);
  return g;
}

// A pyramid of milk bottles on a game-booth shelf: the classic knockdown.
function makeBottlePyramid(parent, x, z, count = 6) {
  const rows = [[0, 3], [0.36, 2], [0.72, 1]];
  let made = 0;
  for (const [y, n] of rows) {
    for (let i = 0; i < n && made < count; i++, made++) {
      const b = makeMilkBottle();
      const off = (i - (n - 1) / 2) * 0.46;
      b.position.set(x + off, y, z);
      parent.add(b);
      addKnockable(b, 0.34, { mode: 'scatter', fallTime: 0.28, slideDistance: 1.6, flyHeight: 0.6, shovePower: 7 });
    }
  }
}

// ===== Warm light pools on the gravel ======================================
// A radial-gradient quad laid flat under every lamp. The point lights alone give
// a flat wash at this scale; these guarantee the warm pools of light a real
// midway has, and they are one quad each.
let _poolTex = null;
function lightPoolTexture() {
  if (_poolTex) return _poolTex;
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(N / 2, N / 2, 2, N / 2, N / 2, N / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.34)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.11)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, N, N);
  _poolTex = new THREE.CanvasTexture(c);
  _poolTex.colorSpace = THREE.SRGBColorSpace;
  return _poolTex;
}

function addLightPool(scene, x, z, r, color) {
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({
      map: lightPoolTexture(),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, FAIR_GROUND + 0.05, z);
  pool.renderOrder = 1;
  scene.add(pool);
}

// ===== Booths ===============================================================
// Every booth is a GIANT SCULPTURE of the thing you go there for, the way the
// Randy's Donuts on La Cienega is a giant donut with a shop underneath. There is
// no signage anywhere in the fair: the building itself is the sign, so a car
// sees a twelve-metre popcorn carton, a donut you can drive under, a bear the
// size of a house, and knows exactly what is on the counter.
//
// The base is shared — a service counter with a lit backboard and a neon fascia
// — so the midway still reads as a row of stalls. Everything above it is unique.

const BOOTH_W = 7.2;
const BOOTH_D = 4.6;
const BOOTH_H = 3.4;

// Two-colour vertical stripes on a canvas, for the popcorn carton.
const _stripeCache = new Map();
function stripeTexture(a, b, count) {
  const key = `${a}|${b}|${count}`;
  if (_stripeCache.has(key)) return _stripeCache.get(key);
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N; c.height = 8;
  const g = c.getContext('2d');
  const w = N / count;
  for (let i = 0; i < count; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(Math.floor(i * w), 0, Math.ceil(w) + 1, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _stripeCache.set(key, t);
  return t;
}

// A THREE colour as a CSS hex string, for the canvas stripe texture.
const _cssHexCache = new Map();
function cssHex(n) {
  if (_cssHexCache.has(n)) return _cssHexCache.get(n);
  const s = `#${(n >>> 0).toString(16).padStart(6, '0')}`;
  _cssHexCache.set(n, s);
  return s;
}

// The shared stall under every sculpture. It is a fairground STALL, not a
// building: four corner posts, a roof slab, and an open counter on the front and
// both sides — nothing at all across the back, so you can see straight through
// it from the midway. Every board is a tagged piece, so makeBooth can register
// it as its own knockable and ramming the stall throws the BOARDS, not just the
// stock.
function makeStallBase(accent) {
  const g = new THREE.Group();
  const W = BOOTH_W, D = BOOTH_D, H = BOOTH_H;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x4c3a68, roughness: 0.85, emissive: 0x1a1230, emissiveIntensity: 0.7,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8c6538, roughness: 0.9 });
  const skirtMat = new THREE.MeshStandardMaterial({
    map: stripeTexture('#f6f1e2', cssHex(accent), 14), roughness: 0.9, side: THREE.DoubleSide,
  });

  const piece = (mesh) => { mesh.userData.stallPiece = true; g.add(mesh); return mesh; };

  const COUNTER_Y = 1.15;     // top of the counter board
  const TOP_T = 0.22;         // counter board thickness
  const SKIRT_H = COUNTER_Y - TOP_T / 2;
  const SKIRT_Y = COUNTER_Y - TOP_T / 2 - SKIRT_H / 2;
  const FRONT_Z = 0.45;       // centre of the front counter run
  const FRONT_D = 1.6;        // its depth — a proper working counter
  const SIDE_T = 0.62;        // thickness of the side runs

  // Four corner posts, nothing between them.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), woodMat);
      post.position.set(sx * (W / 2 - 0.18), H / 2, sz * (D / 2 - 0.18));
      post.castShadow = true;
      post.userData.stallPost = true;
      piece(post);
    }
  }

  // Roof slab, so the posts hold something and the neon has a line to follow.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, D), bodyMat);
  roof.position.set(0, H + 0.09, 0);
  roof.castShadow = true;
  roof.userData.stallRoof = true;
  piece(roof);

  // One counter run: top board, skirt box, striped face on the OUTSIDE (the
  // sign of `faceSign`). axis 'x' runs along X at z = cz; axis 'z' runs along Z
  // at x = cx.
  const counterRun = (cx, cz, len, axis, thick, faceSign) => {
    const wide = axis === 'x' ? len : thick;
    const deep = axis === 'x' ? thick : len;
    const top = new THREE.Mesh(new THREE.BoxGeometry(wide, TOP_T, deep), woodMat);
    top.position.set(cx, COUNTER_Y, cz);
    top.castShadow = top.receiveShadow = true;
    piece(top);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(wide, SKIRT_H, deep * 0.96), bodyMat);
    skirt.position.set(cx, SKIRT_Y, cz);
    piece(skirt);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(len, SKIRT_H), skirtMat);
    if (axis === 'x') {
      face.position.set(cx, SKIRT_Y, cz + faceSign * (thick * 0.48 + 0.006));
    } else {
      face.position.set(cx + faceSign * (thick * 0.48 + 0.006), SKIRT_Y, cz);
      face.rotation.y = faceSign > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    piece(face);
  };

  // Front counter, in two halves so a hit throws two boards.
  const halfW = (W - 0.3) / 2 - 0.02;
  for (const sx of [-1, 1]) {
    const cx = sx * (W - 0.3) / 4;
    const top = new THREE.Mesh(new THREE.BoxGeometry(halfW, TOP_T, FRONT_D), woodMat);
    top.position.set(cx, COUNTER_Y, FRONT_Z);
    top.castShadow = top.receiveShadow = true;
    piece(top);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(halfW, SKIRT_H, FRONT_D * 0.96), bodyMat);
    skirt.position.set(cx, SKIRT_Y, FRONT_Z);
    piece(skirt);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(halfW, SKIRT_H), skirtMat);
    face.position.set(cx, SKIRT_Y, FRONT_Z + FRONT_D * 0.48 + 0.006);
    piece(face);
  }

  // Side counters running back from the front counter, open above like the
  // front. The BACK is left completely open — this is a stall, not a building.
  const sideZ1 = FRONT_Z - FRONT_D / 2;
  const sideZ0 = -D / 2 + 0.08;
  const sideCz = (sideZ0 + sideZ1) / 2;
  for (const sx of [-1, 1]) {
    counterRun(sx * (W / 2 - SIDE_T / 2), sideCz, sideZ1 - sideZ0, 'z', SIDE_T, sx);
  }

  // Neon trim all the way round the roof line.
  const fasciaFront = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, 0.15), neonMat(accent));
  fasciaFront.position.set(0, H + 0.05, D / 2 - 0.1);
  piece(fasciaFront);
  const fasciaBack = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, 0.15), neonMat(accent));
  fasciaBack.position.set(0, H + 0.05, -D / 2 + 0.1);
  piece(fasciaBack);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, D), neonMat(accent));
    side.position.set(sx * (W / 2 - 0.1), H + 0.05, 0);
    piece(side);
  }
  return g;
}

// --- 1. Popcorn: a giant striped carton, kernels tumbling over the rim ------
function boothPopcorn() {
  const g = makeStallBase(0xe23a2e);
  const tubMat = new THREE.MeshStandardMaterial({
    map: stripeTexture('#e23a2e', '#f6f1e2', 22),
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.3, 8, 26, 1, true), tubMat);
  tub.position.set(0, BOOTH_H + 4.1, -0.2);
  tub.rotation.y = 0.12;
  tub.castShadow = true;
  g.add(tub);

  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 26),
    new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 1, side: THREE.DoubleSide }),
  );
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(0, BOOTH_H + 8.0, -0.2);
  g.add(mouth);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.15, 8, 44), neonMat(0xffd08a));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, BOOTH_H + 8.1, -0.2);
  g.add(rim);

  // Heaped kernels, plus a spill running over the front lip.
  const rng = makeRng(0x7a3d);
  const kernelMat = new THREE.MeshStandardMaterial({ color: 0xf8ecc0, roughness: 1 });
  for (let i = 0; i < 76; i++) {
    const a = rng() * TWO_PI;
    const rr = Math.sqrt(rng()) * 4.2;
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.4 + rng() * 0.32, 7, 6), kernelMat);
    k.position.set(Math.cos(a) * rr, BOOTH_H + 8.15 + rng() * 1.6, -0.2 + Math.sin(a) * rr);
    k.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    g.add(k);
  }
  for (let i = 0; i < 16; i++) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.32 + rng() * 0.28, 7, 6), kernelMat);
    const y = BOOTH_H + 7.6 - rng() * 3.2;
    const taper = THREE.MathUtils.lerp(3.35, 4.55, (y - BOOTH_H) / 8);
    k.position.set(-2.2 + rng() * 4.4, y, -0.2 + taper + 0.25 + rng() * 0.35);
    g.add(k);
  }
  return g;
}

// --- 2. Cotton candy: a paper cone with a huge pink cloud on top ------------
function boothCottonCandy() {
  const g = makeStallBase(0xff8fc0);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 7.0, 26, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf7f0e0, roughness: 0.95, side: THREE.DoubleSide }),
  );
  cone.rotation.x = Math.PI;               // wide rim up, apex on the roof
  cone.position.set(0, BOOTH_H + 3.5, -0.2);
  cone.castShadow = true;
  g.add(cone);

  const rng = makeRng(0xc077);
  const flossMat = new THREE.MeshStandardMaterial({
    color: 0xffc6e2, emissive: 0xff8fc0, emissiveIntensity: 0.42, roughness: 1,
  });
  for (let i = 0; i < 30; i++) {
    const a = rng() * TWO_PI;
    const rr = rng() * 3.4;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1.4 + rng() * 1.5, 10, 8), flossMat);
    puff.position.set(
      Math.cos(a) * rr,
      BOOTH_H + 7.4 + rng() * 3.0 - rr * 0.45,
      -0.2 + Math.sin(a) * rr,
    );
    puff.scale.set(1, 0.8 + rng() * 0.4, 1);
    g.add(puff);
  }
  return g;
}

// --- 3. Ring toss: one enormous hoop, spare rings stacked at its foot -------
function boothRingToss() {
  const g = makeStallBase(0xffb347);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xffb347, emissive: 0xff9a2e, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.3,
  });
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.8, 12, 44), rimMat);
  hoop.position.set(0, BOOTH_H + 6.1, -0.2);
  hoop.castShadow = true;
  g.add(hoop);

  // A few smaller rings dropped on the roof, leaning on each other.
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.9 - i * 0.22, 0.26, 8, 24), rimMat);
    r.position.set(-2.4 + i * 0.9, BOOTH_H + 0.5 + i * 0.24, 1.2);
    r.rotation.set(1.32, 0.3 * i, 0.18);
    g.add(r);
  }
  return g;
}

// --- 4. Knockdown bottles: a giant milk bottle ---------------------------------
function boothMilkBottle() {
  const g = makeStallBase(0xbfe4ff);
  const glass = new THREE.MeshStandardMaterial({
    color: 0xeaf6ff, roughness: 0.15, metalness: 0.05,
    transparent: true, opacity: 0.72,
    emissive: 0x9fd0ff, emissiveIntensity: 0.22,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 6.4, 28), glass);
  body.position.set(0, BOOTH_H + 3.2, -0.2);
  body.castShadow = true;
  g.add(body);
  // The shoulder tapers from the body's width up to the neck.
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.9, 2.2, 28), glass);
  shoulder.position.set(0, BOOTH_H + 7.5, -0.2);
  g.add(shoulder);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.0, 20), glass);
  neck.position.set(0, BOOTH_H + 9.1, -0.2);
  g.add(neck);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 0.7, 20),
    new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.5 }),
  );
  cap.position.set(0, BOOTH_H + 9.95, -0.2);
  g.add(cap);

  // The milk itself, so the bottle is not an empty shell.
  const milk = new THREE.Mesh(
    new THREE.CylinderGeometry(2.7, 2.7, 5.4, 24),
    new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.14 }),
  );
  milk.position.set(0, BOOTH_H + 2.9, -0.2);
  g.add(milk);

  // Two smaller brothers flanking it.
  for (const sx of [-1, 1]) {
    const b = makeMilkBottle();
    b.scale.setScalar(2.2);
    b.position.set(sx * 3.1, BOOTH_H + 0.02, 1.6);
    g.add(b);
  }
  return g;
}

// --- 5. Prizes: a teddy bear the size of the stall ---------------------------
function boothTeddy() {
  const g = makeStallBase(0xffb3c8);
  const fur = new THREE.MeshStandardMaterial({ color: 0xb5793f, roughness: 1 });
  const furLight = new THREE.MeshStandardMaterial({ color: 0xe7c9a3, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.4 });
  const sph = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const b = BOOTH_H;
  sph(3.0, fur, 0, b + 2.6, -0.5, 1, 0.95, 0.9);           // body
  sph(2.35, fur, 0, b + 6.6, -0.4);                          // head
  for (const sx of [-1, 1]) {
    sph(0.95, fur, sx * 1.7, b + 8.4, -0.6);                 // ears
    sph(0.5, furLight, sx * 1.7, b + 8.45, 0.05);
    sph(0.24, dark, sx * 0.85, b + 7.15, 1.75);              // eyes
    sph(1.1, fur, sx * 2.75, b + 3.4, 0.5);                  // arms
    sph(1.25, fur, sx * 1.75, b + 0.6, 0.9);                 // feet
  }
  sph(1.05, furLight, 0, b + 6.1, 1.5, 1, 0.8, 0.85);        // muzzle
  sph(0.38, dark, 0, b + 6.35, 2.3);                         // nose
  return g;
}

// --- 6. Darts: a giant board with a giant dart buried in the treble ---------
function boothDart() {
  const g = makeStallBase(0x6ee0ff);
  const R = 5.0;
  const cy = BOOTH_H + R + 0.3;

  const board = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 0.5, 40),
    new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.8 }),
  );
  board.rotation.x = Math.PI / 2;
  board.position.set(0, cy, -0.2);
  g.add(board);

  // Wooden cabinet behind it, so the board is not a black hole seen from the
  // back of the stall.
  const cabinet = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.7, 40),
    new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.9 }),
  );
  cabinet.rotation.x = Math.PI / 2;
  cabinet.position.set(0, cy, -0.6);
  g.add(cabinet);

  // Concentric scoring bands on the face.
  const bands = [
    [4.6, 5.0, 0xe23a2e], [3.7, 4.6, 0xf4eede], [3.0, 3.7, 0x2f7de0],
    [2.2, 3.0, 0xf4eede], [1.3, 2.2, 0x2fae5a], [0.0, 1.3, 0xe23a2e],
  ];
  bands.forEach(([ri, ro, col], i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ri, ro, 44),
      new THREE.MeshStandardMaterial({
        color: col, roughness: 0.7, emissive: col, emissiveIntensity: 0.2, side: THREE.DoubleSide,
      }),
    );
    ring.position.set(0, cy, 0.32 + i * 0.004);
    g.add(ring);
  });

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.26, 8, 52),
    new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 0.9, roughness: 0.3 }),
  );
  rim.position.set(0, cy, -0.2);
  g.add(rim);

  // A giant dart buried in the board.
  const dart = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 0.9, roughness: 0.25 });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 12), steel);
  tip.rotation.x = -Math.PI / 2;            // apex points at -Z
  tip.position.z = -0.7;
  dart.add(tip);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 4.6, 14),
    new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.7, roughness: 0.3 }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 2.3;
  dart.add(barrel);
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.6 }),
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 5.9;
  dart.add(shaft);
  const flightMat = new THREE.MeshStandardMaterial({ color: 0xff3a2e, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x5a0f0c, emissiveIntensity: 0.4 });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), flightMat);
    f.position.z = 7.3;
    f.rotation.z = (i / 4) * Math.PI;
    dart.add(f);
  }
  // A giant dart buried in the board, tip through the face and flights out front.
  dart.position.set(1.0, cy + 0.9, 0.5);
  dart.rotation.set(0.26, -0.16, 0);
  dart.scale.setScalar(0.9);
  g.add(dart);
  return g;
}

// --- 7. Candy apples: a giant glossy apple on a stick ------------------------
function boothCandyApple() {
  const g = makeStallBase(0xff4d4d);
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 7.0, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }),
  );
  stick.position.set(0, BOOTH_H + 3.5, -0.2);
  g.add(stick);

  const apple = new THREE.Mesh(
    new THREE.SphereGeometry(3.3, 26, 20),
    new THREE.MeshStandardMaterial({
      color: 0xd8232a, roughness: 0.12, metalness: 0.35,
      emissive: 0x5a0a0c, emissiveIntensity: 0.5,
    }),
  );
  apple.position.set(0, BOOTH_H + 8.4, -0.2);
  apple.scale.set(1, 1.06, 1);
  apple.castShadow = true;
  g.add(apple);

  // Caramel cap, with drips running down over the fruit.
  const caramel = new THREE.MeshStandardMaterial({
    color: 0xc07a2a, roughness: 0.35, metalness: 0.15,
    emissive: 0x40200a, emissiveIntensity: 0.4,
  });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(3.3, 26, 14, 0, TWO_PI, 0, Math.PI * 0.55), caramel);
  cap.position.set(0, BOOTH_H + 8.45, -0.2);
  cap.scale.set(1, 1.03, 1);
  g.add(cap);
  const rng = makeRng(0x3aa1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TWO_PI + 0.3;
    const drip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9 + rng() * 1.0, 6), caramel);
    drip.position.set(Math.cos(a) * 2.95, BOOTH_H + 7.5 - rng() * 0.4, -0.2 + Math.sin(a) * 2.95);
    drip.rotation.x = Math.PI;
    g.add(drip);
  }

  // A second, smaller apple leaning on the base.
  const small = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0xd8232a, roughness: 0.15, metalness: 0.3 }),
  );
  small.position.set(-3.0, BOOTH_H + 1.7, 1.9);
  g.add(small);
  return g;
}

// --- 8. The donut shop: a giant iced donut you can drive under ---------------
function boothDonut() {
  const g = makeStallBase(0xffd166);
  const R = 4.4, TUBE = 1.95;
  const cy = BOOTH_H + R + TUBE;

  const donut = new THREE.Mesh(
    new THREE.TorusGeometry(R, TUBE, 16, 48),
    new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.85 }),
  );
  donut.position.set(0, cy, -0.2);
  donut.castShadow = true;
  g.add(donut);

  // Pink icing on the front face, so the donut reads as iced from the midway.
  const icing = new THREE.Mesh(
    new THREE.TorusGeometry(R, TUBE * 1.02, 16, 48),
    new THREE.MeshStandardMaterial({
      color: 0xff8fc0, roughness: 0.45, emissive: 0x8a2f57, emissiveIntensity: 0.35,
    }),
  );
  icing.position.set(0, cy, 0.55);
  g.add(icing);

  // Sprinkles, laid on the icing's own surface.
  const rng = makeRng(0xdd51);
  const sprinkleCols = [0xfff8e0, 0x5fe0ff, 0xffd166, 0x9effa1, 0xb196ff];
  for (let i = 0; i < 64; i++) {
    const a = rng() * TWO_PI;
    const b = Math.PI / 2 + (rng() - 0.5) * 1.7;
    const rr = R + TUBE * Math.cos(b);
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.11, 0.11),
      new THREE.MeshStandardMaterial({
        color: sprinkleCols[i % sprinkleCols.length],
        roughness: 0.6,
        emissive: sprinkleCols[i % sprinkleCols.length],
        emissiveIntensity: 0.3,
      }),
    );
    s.position.set(Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.55 + TUBE * Math.sin(b));
    s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    g.add(s);
  }

  // Backlight ring so the silhouette reads against the night sky.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(R + 0.05, 0.12, 6, 52), neonMat(0xffd08a));
  halo.position.set(0, cy, -2.5);
  g.add(halo);

  // Braces down to the roof, the way a giant sign is bolted to its shop.
  for (const sx of [-1, 1]) {
    const brace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 5.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a8f9c, metalness: 0.7, roughness: 0.4 }),
    );
    brace.position.set(sx * 3.0, BOOTH_H + 2.2, -1.9);
    brace.rotation.z = sx * 0.2;
    g.add(brace);
  }
  return g;
}

// --- 9. Corn dogs: a giant battered dog on a stick ---------------------------
function boothCornDog() {
  const g = makeStallBase(0xffc14d);
  const dog = new THREE.Group();

  const batter = new THREE.MeshStandardMaterial({ color: 0xd8a13c, roughness: 0.95 });
  dog.add(new THREE.Mesh(new THREE.CapsuleGeometry(1.35, 5.6, 10, 18), batter));

  // Mustard zig-zag.
  const mustard = new THREE.MeshStandardMaterial({
    color: 0xffd93b, roughness: 0.5, emissive: 0x6a5300, emissiveIntensity: 0.4,
  });
  for (let i = 0; i < 9; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mustard);
    d.position.set(Math.sin(i * 1.5) * 1.15, -2.4 + i * 0.6, 1.05);
    d.scale.set(1, 1.5, 0.7);
    dog.add(d);
  }

  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 3.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }),
  );
  stick.position.y = -4.5;
  dog.add(stick);

  dog.position.set(0, BOOTH_H + 5.0, 0.4);
  dog.rotation.set(-0.1, 0, 0.2);
  dog.scale.setScalar(1.3);
  g.add(dog);
  return g;
}

// --- 10. Ice cream: a giant cone with three cream swirls and a cherry --------
function boothIceCream() {
  const g = makeStallBase(0xffd6ea);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(3.0, 6.6, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd8b06a, roughness: 0.95, side: THREE.DoubleSide }),
  );
  cone.rotation.x = Math.PI;
  cone.position.set(0, BOOTH_H + 3.3, -0.2);
  cone.castShadow = true;
  g.add(cone);
  // Waffle cross-hatch: thin raised strips running down the cone.
  const waffle = new THREE.MeshStandardMaterial({ color: 0xb98e4c, roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TWO_PI;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 6.2, 0.1), waffle);
    strip.position.set(Math.cos(a) * 1.62, BOOTH_H + 3.3, -0.2 + Math.sin(a) * 1.62);
    strip.rotation.y = -a;
    strip.rotation.z = 0.42;
    g.add(strip);
  }

  const cream = new THREE.MeshStandardMaterial({
    color: 0xfff5e4, roughness: 0.85, emissive: 0xffe9c9, emissiveIntensity: 0.24,
  });
  for (const [r, y] of [[2.85, 6.9], [2.3, 8.5], [1.65, 9.8]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), cream);
    s.position.set(0, BOOTH_H + y, -0.2);
    s.scale.y = 0.85;
    g.add(s);
  }
  const cherry = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8232a, roughness: 0.2, emissive: 0x5a0a0c, emissiveIntensity: 0.55 }),
  );
  cherry.position.set(0, BOOTH_H + 10.9, -0.2);
  g.add(cherry);
  return g;
}

// ===== What is actually inside each booth ===================================
// Every stall is stocked: the product it sells, the machine that makes it, and
// a cash register with the drawer hanging open, full of notes and coins.
//
// All of it is knockable, and ONE bump on the stall bursts ALL of it at once.
// The counter is solid, so a car can never reach most of these props directly —
// each one therefore answers to the STALL's own footprint rather than to its own
// position (see the hitTest in stallKnock). That is also what makes a wreck read
// properly: hit the counter once and the whole booth explodes outward.

const BOOTH_HIT_RADIUS = 1.6;  // each board / tub answers for itself, not the stall
const BOOTH_CT = 1.26;         // counter-top height: everything is displayed here

// Register one booth item so it goes flying when the stall is rammed.
function stallKnock(obj, radius, opts = {}) {
  const k = addKnockable(obj, radius, {
    mode: 'scatter',
    dormant: opts.dormant === true,
    fallTime: opts.fallTime ?? 0.42,
    slideDistance: opts.slideDistance ?? 2.2,
    flyHeight: opts.flyHeight ?? 1.3,
    shovePower: opts.shovePower ?? 9,
    shoveSpinPower: opts.shoveSpinPower ?? 3,
  });
  _stallKnockables.push(k);
  const bounds = localBounds(obj);
  k._box = bounds ? bounds.box : null;
  k._pts = bounds ? bounds.pts : null;
  return k;
}

// Where a prop sits about its own origin, measured once at build time: its union
// box (for the flat-face snap) plus a cloud of real vertex positions. A bounding
// box or sphere is far too loose for a sculpture built from a cone and a heap of
// fluff spheres — rotating those bounds leaves the actual shape hanging well off
// the ground — so the settle uses the geometry itself, sampled down to a couple
// of thousand points.
const _lbTmp = new THREE.Matrix4();
const _lbV = new THREE.Vector3();
function localBounds(root) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  let total = 0;
  root.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.attributes.position) total += o.geometry.attributes.position.count;
  });
  const stride = Math.max(1, Math.ceil(total / 2000));
  const pts = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    _lbTmp.multiplyMatrices(inv, o.matrixWorld);
    const b = geo.boundingBox.clone().applyMatrix4(_lbTmp);
    box.union(b);
    const pos = geo.attributes.position;
    if (pos) {
      for (let i = 0; i < pos.count; i += stride) {
        _lbV.fromBufferAttribute(pos, i).applyMatrix4(_lbTmp);
        pts.push(_lbV.x, _lbV.y, _lbV.z);
      }
    }
    // The box corners as well, so a plain board always lands exactly flat.
    for (let i = 0; i < 8; i++) {
      pts.push(
        i & 1 ? b.max.x : b.min.x,
        i & 2 ? b.max.y : b.min.y,
        i & 4 ? b.max.z : b.min.z,
      );
    }
  });
  if (box.isEmpty()) return null;
  return { box, pts: new Float32Array(pts) };
}

// Lay a flat piece (a board, a counter top, the roof, a neon strip) down on its
// largest face: pick the thinnest local axis and turn it to vertical, with a
// random yaw so the wreck is not uniformly aligned.
const _upAxis = new THREE.Vector3(0, 1, 0);
const _alignQ = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const _axX = new THREE.Vector3(1, 0, 0);
const _axY = new THREE.Vector3(0, 1, 0);
const _axZ = new THREE.Vector3(0, 0, 1);
function snapFlat(k) {
  const b = k._box;
  if (!b) return;
  const ex = b.max.x - b.min.x;
  const ey = b.max.y - b.min.y;
  const ez = b.max.z - b.min.z;
  let thinnest = _axY;
  let best = ey;
  if (ex < best) { best = ex; thinnest = _axX; }
  if (ez < best) { thinnest = _axZ; }
  if (thinnest === _axX) _alignQ.setFromAxisAngle(_axZ, Math.PI / 2);       // X -> Y
  else if (thinnest === _axZ) _alignQ.setFromAxisAngle(_axX, -Math.PI / 2); // Z -> Y
  else _alignQ.identity();
  _yawQ.setFromAxisAngle(_upAxis, Math.random() * TWO_PI);
  k.group.quaternion.copy(_yawQ).multiply(_alignQ);
}

const _leanQ = new THREE.Quaternion();
const _leanAxis = new THREE.Vector3();
const _leanDir = new THREE.Vector3();

// Drop a landed prop so it rests on the gravel. Flat pieces are first laid on
// their largest face, then everything — board, roof, machine, giant sign — is
// dropped until its lowest real geometry just touches the ground.
const _liftTmp = new THREE.Vector3();
function lowestPointY(k) {
  const q = k.group.quaternion;
  let minY = Infinity;
  const pts = k._pts;
  if (pts) {
    for (let i = 0; i < pts.length; i += 3) {
      _liftTmp.set(pts[i], pts[i + 1], pts[i + 2]).applyQuaternion(q);
      if (_liftTmp.y < minY) minY = _liftTmp.y;
    }
    return minY;
  }
  const b = k._box;
  if (!b) return minY;
  for (let i = 0; i < 8; i++) {
    _liftTmp.set(
      i & 1 ? b.max.x : b.min.x,
      i & 2 ? b.max.y : b.min.y,
      i & 4 ? b.max.z : b.min.z,
    );
    _liftTmp.applyQuaternion(q);
    if (_liftTmp.y < minY) minY = _liftTmp.y;
  }
  return minY;
}

function settleOnGround(k) {
  if (k._flat) snapFlat(k);
  const minY = lowestPointY(k);
  if (Number.isFinite(minY)) k.group.position.y = -minY + 0.01;
  // A fallen heavy body must stay solid to the car: a big sculpture is shoved
  // by any part of it, not just by its centre point, so widen its hit radius to
  // its own footprint once it is down.
  if (k._pts && k._pts.length) {
    let ext = 0;
    for (let i = 0; i < k._pts.length; i += 3) {
      const d = Math.hypot(k._pts[i], k._pts[i + 2]);
      if (d > ext) ext = d;
    }
    const r = Math.min(3.4, ext * 0.7);
    if (r > k.radius) k.radius = r;
  }
}

// Add one prop to a booth and make it fly. In the object browser the stall is
// built with `inert` set, so the props are shown but never registered: a preview
// copy must not join the world's knockable list.
let _stockingInert = false;
const _stallKnockables = [];   // every piece and prop in every booth
const _boothRigs = [];         // { roof, posts } per booth, for the lean

function boothProp(parent, obj, opts = {}) {
  // The stall has no back wall now, so anything that used to sit on a back
  // shelf would hang in mid-air. Anything not actually over a counter run gets
  // set down on the gravel behind the counter instead.
  if (obj.position.y > 0.3) {
    const { x, z } = obj.position;
    const onFront = z > -0.45 && z < 1.32 && Math.abs(x) < 3.5;
    const onSide = Math.abs(x) > 2.9 && Math.abs(x) < 3.7 && z > -2.32 && z < -0.3;
    if (!onFront && !onSide) obj.position.y = 0.01;
  }
  parent.add(obj);
  if (_stockingInert) return null;
  const rest = { ...opts };
  delete rest.radius;
  return stallKnock(obj, BOOTH_HIT_RADIUS, rest);
}

// Paper, sugar, small loose stock: thrown the furthest, tumbling end over end.
function looseProp(parent, obj) {
  return boothProp(parent, obj, {
    slideDistance: 3.0, flyHeight: 1.9, fallTime: 0.72, shovePower: 5,
  });
}

// ===== Cash register, and the money in the drawer ==========================
function makeNote() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.012, 0.17),
    new THREE.MeshStandardMaterial({
      color: 0xc6dfae, roughness: 0.85, emissive: 0x33461f, emissiveIntensity: 0.3,
    }),
  );
}

function makeCoin() {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.022, 12),
    new THREE.MeshStandardMaterial({
      color: 0xe9c85c, metalness: 0.9, roughness: 0.25,
      emissive: 0x6b4f10, emissiveIntensity: 0.35,
    }),
  );
}

function makeCashRegister() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2f3a2f, roughness: 0.5, metalness: 0.35 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb9a76a, roughness: 0.35, metalness: 0.7 });
  const keys = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.6 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.8), body);
  base.position.y = 0.17;
  base.castShadow = true;
  g.add(base);

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.62), body);
  head.position.set(0, 0.48, -0.06);
  head.rotation.x = -0.18;
  g.add(head);

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.11), keys);
      key.position.set(-0.33 + c * 0.22, 0.63, -0.23 + r * 0.16);
      key.rotation.x = -0.18;
      g.add(key);
    }
  }

  const display = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.05), neonMat(0x7fe0ff));
  display.position.set(0, 0.67, 0.26);
  display.rotation.x = -0.18;
  g.add(display);

  // Drawer, hanging open — the till is full.
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.66), brass);
  drawer.position.set(0, 0.1, 0.78);
  g.add(drawer);
  for (let i = 0; i < 5; i++) {
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.6), body);
    div.position.set(-0.42 + i * 0.21, 0.16, 0.78);
    g.add(div);
  }
  return g;
}

// A register plus a shower of loose notes and coins waiting in the drawer.
function stockRegister(parent, x, y, z, seed) {
  const reg = makeCashRegister();
  reg.position.set(x, y, z);
  reg.rotation.y = -0.22;
  boothProp(parent, reg, {
    radius: 0.6, slideDistance: 2.7, flyHeight: 0.95, fallTime: 0.5, shovePower: 7,
  });

  const rng = makeRng(seed);
  for (let i = 0; i < 7; i++) {
    const note = makeNote();
    note.position.set(x - 0.36 + rng() * 0.74, y + 0.2 + rng() * 0.04, z + 0.5 + rng() * 0.5);
    note.rotation.set((rng() - 0.5) * 0.6, rng() * 3.1, (rng() - 0.5) * 0.5);
    looseProp(parent, note);
  }
  for (let i = 0; i < 8; i++) {
    const coin = makeCoin();
    coin.position.set(x - 0.36 + rng() * 0.74, y + 0.23 + rng() * 0.05, z + 0.5 + rng() * 0.5);
    coin.rotation.set(rng() * 3.1, rng() * 3.1, rng() * 3.1);
    looseProp(parent, coin);
  }
}

// ===== The machines ========================================================
// A popcorn popper: red cabinet, glass hood, gold kettle, corn heaped in the bowl.
function makePopcornPopper() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xe23a2e, roughness: 0.55 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c2d2, metalness: 0.8, roughness: 0.3 });
  const corn = new THREE.MeshStandardMaterial({ color: 0xf8ecc0, roughness: 1 });

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.86, 1.05), red);
  cab.position.y = 0.43;
  cab.castShadow = true;
  g.add(cab);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.1, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0xdff0ff, roughness: 0.06, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    }),
  );
  glass.position.y = 1.42;
  g.add(glass);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 0.3, 16), steel);
  bowl.position.y = 1.02;
  g.add(bowl);
  const kettle = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.85, roughness: 0.25 }),
  );
  kettle.position.y = 1.6;
  g.add(kettle);
  const rng = makeRng(0x1f7a);
  for (let i = 0; i < 24; i++) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.1 + rng() * 0.06, 5, 4), corn);
    k.position.set((rng() - 0.5) * 0.82, 1.2 + rng() * 0.16, (rng() - 0.5) * 0.72);
    g.add(k);
  }
  const warm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), neonMat(0xffb347));
  warm.position.set(0, 2.0, 0.28);
  g.add(warm);
  return g;
}

// Cotton-candy spinner: steel drum, spinning head, a cloud already forming.
function makeCottonMachine() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc6ccd8, metalness: 0.75, roughness: 0.3 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.64, 0.36, 20), steel);
  drum.position.y = 0.18;
  drum.castShadow = true;
  g.add(drum);
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.3, 16),
    new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.7, roughness: 0.3 }),
  );
  head.position.y = 0.42;
  g.add(head);
  const floss = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffc6e2, emissive: 0xff8fc0, emissiveIntensity: 0.45, roughness: 1 }),
  );
  floss.position.y = 0.62;
  floss.scale.y = 0.6;
  g.add(floss);
  return g;
}

// Donut fryer: a steel vat of oil with donuts bobbing in it.
function makeDonutFryer() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9b2c0, metalness: 0.8, roughness: 0.35 });
  const dough = new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.85 });

  const vat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.05), steel);
  vat.position.y = 0.35;
  vat.castShadow = true;
  g.add(vat);
  const oil = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.06, 0.86),
    new THREE.MeshStandardMaterial({
      color: 0x8a6a1e, roughness: 0.25, metalness: 0.2,
      emissive: 0x3a2a06, emissiveIntensity: 0.45,
    }),
  );
  oil.position.y = 0.7;
  g.add(oil);
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.075, 6, 14), dough);
    d.rotation.x = Math.PI / 2;
    d.position.set(-0.55 + i * 0.28, 0.74, i % 2 ? 0.2 : -0.2);
    g.add(d);
  }
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), steel);
  arm.position.set(0.55, 1.0, 0);
  arm.rotation.z = 0.35;
  g.add(arm);
  return g;
}

// Corn-dog fryer: a vat with dogs standing in it on their sticks.
function makeCornDogFryer() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9b2c0, metalness: 0.8, roughness: 0.35 });
  const batter = new THREE.MeshStandardMaterial({ color: 0xd8a13c, roughness: 0.95 });
  const stickMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });

  const vat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.0), steel);
  vat.position.y = 0.3;
  vat.castShadow = true;
  g.add(vat);
  const oil = new THREE.Mesh(
    new THREE.BoxGeometry(1.32, 0.05, 0.82),
    new THREE.MeshStandardMaterial({
      color: 0x8a6a1e, roughness: 0.25, metalness: 0.2,
      emissive: 0x3a2a06, emissiveIntensity: 0.45,
    }),
  );
  oil.position.y = 0.6;
  g.add(oil);
  for (let i = 0; i < 4; i++) {
    const z0 = i % 2 ? 0.15 : -0.15;
    const dog = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 6, 10), batter);
    dog.position.set(-0.5 + i * 0.33, 0.95, z0);
    dog.rotation.z = 0.18;
    g.add(dog);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), stickMat);
    stick.position.set(-0.5 + i * 0.33 + 0.06, 0.55, z0);
    g.add(stick);
  }
  return g;
}

// Caramel dipping station: a pot over a blue gas ring.
function makeCaramelPot() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.5, 0.58, 18),
    new THREE.MeshStandardMaterial({ color: 0x5a5f6b, metalness: 0.7, roughness: 0.4 }),
  );
  pot.position.y = 0.54;
  pot.castShadow = true;
  g.add(pot);
  const caramel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.05, 18),
    new THREE.MeshStandardMaterial({ color: 0xc07a2a, roughness: 0.3, emissive: 0x3a1e06, emissiveIntensity: 0.45 }),
  );
  caramel.position.y = 0.84;
  g.add(caramel);
  const burner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.72, 0.22, 18),
    new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7 }),
  );
  burner.position.y = 0.13;
  g.add(burner);
  const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.13, 16), neonMat(0x4f9dff));
  flame.position.y = 0.27;
  g.add(flame);
  return g;
}

// Soft-serve machine: two nozzles, two twin swirls, a cyan menu strip.
function makeSoftServe() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.5, metalness: 0.3 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff5e4, roughness: 0.85 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.8), white);
  box.position.y = 0.75;
  box.castShadow = true;
  g.add(box);
  for (const sx of [-1, 1]) {
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x9aa4b8, metalness: 0.9, roughness: 0.25 }),
    );
    nozzle.position.set(sx * 0.24, 0.36, 0.5);
    g.add(nozzle);
    let y = 0.44;
    for (const r of [0.22, 0.16, 0.1]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), cream);
      s.position.set(sx * 0.24, y, 0.6);
      s.scale.y = 0.8;
      g.add(s);
      y += r * 1.2;
    }
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.08), neonMat(0x7fe0ff));
  strip.position.set(0, 1.52, 0.42);
  g.add(strip);
  return g;
}

// ===== Display stock ======================================================
function makeDonutTray(n = 6) {
  const g = new THREE.Group();
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.06, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x9aa4b8, metalness: 0.7, roughness: 0.4 }),
  );
  tray.position.y = 0.03;
  g.add(tray);
  const dough = new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.85 });
  const icing = new THREE.MeshStandardMaterial({
    color: 0xff8fc0, roughness: 0.45, emissive: 0x7a2a4e, emissiveIntensity: 0.3,
  });
  for (let i = 0; i < n; i++) {
    const d = new THREE.Group();
    const base = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.07, 6, 14), dough);
    base.rotation.x = Math.PI / 2;
    d.add(base);
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.075, 6, 14), icing);
    top.rotation.x = Math.PI / 2;
    top.position.y = 0.035;
    d.add(top);
    d.position.set(-0.42 + (i % 3) * 0.42, 0.1, -0.16 + Math.floor(i / 3) * 0.32);
    g.add(d);
  }
  return g;
}

function makeDonut() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.075, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.85 }),
  );
  base.rotation.x = Math.PI / 2;
  g.add(base);
  const top = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.08, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0xff8fc0, roughness: 0.45, emissive: 0x7a2a4e, emissiveIntensity: 0.3 }),
  );
  top.rotation.x = Math.PI / 2;
  top.position.y = 0.04;
  g.add(top);
  return g;
}

function makeCandyAppleOnStick(color = 0xd8232a) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }),
  );
  stick.position.y = 0.25;
  g.add(stick);
  const apple = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 14, 12),
    new THREE.MeshStandardMaterial({
      color, roughness: 0.15, metalness: 0.3, emissive: 0x4a080a, emissiveIntensity: 0.4,
    }),
  );
  apple.position.y = 0.66;
  g.add(apple);
  return g;
}

function makeCornDogStick() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }),
  );
  stick.position.y = 0.22;
  g.add(stick);
  const dog = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.12, 0.34, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8a13c, roughness: 0.95 }),
  );
  dog.position.y = 0.6;
  g.add(dog);
  return g;
}

function makeIceCreamCone() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.4, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8b06a, roughness: 0.95 }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = 0.2;
  g.add(cone);
  const cream = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff5e4, roughness: 0.85, emissive: 0xffe9c9, emissiveIntensity: 0.2 }),
  );
  cream.position.y = 0.46;
  cream.scale.y = 0.85;
  g.add(cream);
  return g;
}

function makeCottonCone() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.34, 8),
    new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.9 }),
  );
  stick.rotation.x = Math.PI;
  stick.position.y = 0.17;
  g.add(stick);
  const floss = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffc6e2, emissive: 0xff8fc0, emissiveIntensity: 0.45, roughness: 1 }),
  );
  floss.position.y = 0.48;
  floss.scale.y = 0.9;
  g.add(floss);
  return g;
}

function makeMilkCrate() {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.34, 0.84),
    new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.85 }),
  );
  crate.position.y = 0.17;
  crate.castShadow = true;
  g.add(crate);
  const rng = makeRng(0x41c2);
  for (let i = 0; i < 6; i++) {
    const b = makeMilkBottle();
    b.position.set(-0.4 + (i % 3) * 0.4, 0.34, -0.18 + Math.floor(i / 3) * 0.36);
    b.scale.setScalar(0.85);
    b.rotation.y = rng() * 3;
    g.add(b);
  }
  return g;
}

function makeRingCrate() {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.3, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.9 }),
  );
  crate.position.y = 0.15;
  crate.castShadow = true;
  g.add(crate);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffb347, emissive: 0xff9a2e, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.3,
  });
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 16), ringMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(-0.45 + (i % 3) * 0.45, 0.32 + Math.floor(i / 3) * 0.08, -0.2 + Math.floor(i / 3) * 0.4);
    g.add(r);
  }
  return g;
}

function makeDartRack() {
  const g = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.9 }),
  );
  back.position.set(0, 0.55, -0.2);
  back.rotation.x = -0.22;
  g.add(back);
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.7, roughness: 0.3 });
  const flightMat = new THREE.MeshStandardMaterial({ color: 0xff3a2e, roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), brass);
    barrel.rotation.x = Math.PI / 2;
    d.add(barrel);
    const flight = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.1), flightMat);
    flight.position.z = 0.2;
    d.add(flight);
    d.position.set(-0.34 + (i % 3) * 0.34, 0.36 + Math.floor(i / 3) * 0.4, -0.1);
    g.add(d);
  }
  return g;
}

function makePlushPile(colors) {
  const g = new THREE.Group();
  const rng = makeRng(0x5b21);
  for (let i = 0; i < 5; i++) {
    const p = makePlush(colors[i % colors.length]);
    p.position.set(-0.5 + rng() * 1.0, 0.06 + i * 0.14, (rng() - 0.5) * 0.55);
    p.scale.setScalar(0.9);
    p.rotation.y = rng() * 3;
    g.add(p);
  }
  return g;
}

function makeConeHolder() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.1, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x8c6538, roughness: 0.9 }),
  );
  base.position.y = 0.05;
  g.add(base);
  for (let i = 0; i < 5; i++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.4, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8b06a, roughness: 0.95 }),
    );
    cone.position.set(-0.44 + i * 0.22, 0.3, 0);
    g.add(cone);
  }
  return g;
}

function makeBatterBowl() {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.26, 0.26, 16),
    new THREE.MeshStandardMaterial({ color: 0xd9dde4, metalness: 0.6, roughness: 0.4 }),
  );
  bowl.position.y = 0.13;
  g.add(bowl);
  const batter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.05, 16),
    new THREE.MeshStandardMaterial({ color: 0xe8c766, roughness: 0.8 }),
  );
  batter.position.y = 0.24;
  g.add(batter);
  return g;
}

function makePopcornBowl() {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.3, 0.4, 16),
    new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9, side: THREE.DoubleSide }),
  );
  bowl.position.y = 0.2;
  g.add(bowl);
  const corn = new THREE.MeshStandardMaterial({ color: 0xf8ecc0, roughness: 1 });
  const rng = makeRng(0x77a1);
  for (let i = 0; i < 18; i++) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.11 + rng() * 0.05, 5, 4), corn);
    const a = rng() * TWO_PI, rr = rng() * 0.34;
    k.position.set(Math.cos(a) * rr, 0.36 + rng() * 0.12, Math.sin(a) * rr);
    g.add(k);
  }
  return g;
}

function makeIceCreamTub(color = 0xfff5e4) {
  const g = new THREE.Group();
  const tub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.24, 0.4, 14),
    new THREE.MeshStandardMaterial({ color: 0xdfe9f5, roughness: 0.5, side: THREE.DoubleSide }),
  );
  tub.position.y = 0.2;
  g.add(tub);
  const cream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.06, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  cream.position.y = 0.36;
  g.add(cream);
  return g;
}

// ===== Stocking ============================================================
// Fill one stall. `kind` picks the product line; every branch also stocks the
// register, so every booth has a till full of money to scatter.

function stockBooth(kind, g) {
  const seed = 0x9000 + kind.charCodeAt(0) * 131 + kind.length * 17;
  const register = (x = 2.45, z = 0.5) => stockRegister(g, x, BOOTH_CT, z, seed);

  if (kind === 'popcorn') {
    const popper = makePopcornPopper();
    popper.position.set(-1.95, BOOTH_CT, 0.1);
    boothProp(g, popper, { radius: 0.7, slideDistance: 2.4, flyHeight: 0.9, fallTime: 0.5, shovePower: 6 });
    const bowl = makePopcornBowl();
    bowl.position.set(-0.35, BOOTH_CT, 0.85);
    boothProp(g, bowl, { radius: 0.4, slideDistance: 2.4, flyHeight: 1.4, fallTime: 0.6, shovePower: 7 });
    for (let i = 0; i < 4; i++) {
      const tub = makePopcornTub();
      tub.position.set(0.85 + (i % 2) * 0.5, BOOTH_CT + Math.floor(i / 2) * 0.06, 1.0 - (i % 2) * 0.4);
      tub.rotation.y = i * 0.8;
      looseProp(g, tub);
    }
    for (let i = 0; i < 4; i++) {
      const cup = makeSodaCup();
      cup.position.set(1.55, BOOTH_CT, -0.2 + i * 0.3);
      looseProp(g, cup);
    }
    register();
    return;
  }

  if (kind === 'cotton') {
    const machine = makeCottonMachine();
    machine.position.set(-1.95, BOOTH_CT, 0.2);
    boothProp(g, machine, { radius: 0.55, slideDistance: 2.3, flyHeight: 1.2, fallTime: 0.55, shovePower: 6 });
    const holder = makeConeHolder();
    holder.position.set(-0.7, BOOTH_CT, 0.95);
    boothProp(g, holder, { radius: 0.5, slideDistance: 2.4, flyHeight: 1.3, fallTime: 0.6, shovePower: 6 });
    for (let i = 0; i < 4; i++) {
      const c = makeCottonCone();
      c.position.set(0.35 + i * 0.34, BOOTH_CT, 0.95 - (i % 2) * 0.45);
      c.rotation.y = i * 1.1;
      looseProp(g, c);
    }
    // Spare cones and sugar bags.
    for (let i = 0; i < 3; i++) {
      const c = makeCottonCone();
      c.position.set(0.2 + i * 0.4, BOOTH_CT, -0.35);
      looseProp(g, c);
    }
    register();
    return;
  }

  if (kind === 'teddy') {
    const colors = [0xff6fae, 0x7bd8ff, 0xffd166, 0xa8ff9e, 0xc79bff, 0xff9a6a];
    const pile = makePlushPile(colors);
    pile.position.set(-1.5, BOOTH_CT, 0.75);
    boothProp(g, pile, { radius: 0.7, slideDistance: 2.6, flyHeight: 1.4, fallTime: 0.6, shovePower: 6 });
    for (let i = 0; i < 6; i++) {
      const p = makePlush(colors[i % colors.length]);
      p.position.set(-0.35 + (i % 3) * 0.55, BOOTH_CT, 0.55 + Math.floor(i / 3) * 0.5);
      p.scale.setScalar(1.1);
      p.rotation.y = i * 0.9;
      looseProp(g, p);
    }
    // A shelf of prizes on the back wall.
    for (let i = 0; i < 4; i++) {
      const p = makePlush(colors[(i + 2) % colors.length]);
      p.position.set(-1.1 + i * 0.6, 2.05, -1.85);
      p.scale.setScalar(0.9);
      p.rotation.y = i * 1.2;
      looseProp(g, p);
    }
    register();
    return;
  }

  if (kind === 'donut') {
    const fryer = makeDonutFryer();
    fryer.position.set(-1.95, BOOTH_CT, 0.15);
    boothProp(g, fryer, { radius: 0.7, slideDistance: 2.4, flyHeight: 1.0, fallTime: 0.55, shovePower: 6 });
    const tray = makeDonutTray(6);
    tray.position.set(-0.3, BOOTH_CT, 0.9);
    boothProp(g, tray, { radius: 0.55, slideDistance: 2.5, flyHeight: 1.4, fallTime: 0.6, shovePower: 6 });
    for (let i = 0; i < 6; i++) {
      const d = makeDonut();
      d.position.set(0.9 + (i % 2) * 0.4, BOOTH_CT + 0.02 + Math.floor(i / 2) * 0.06, 1.0 - (i % 2) * 0.42);
      d.rotation.y = i * 0.6;
      looseProp(g, d);
    }
    register();
    return;
  }

  if (kind === 'dart') {
    const rack = makeDartRack();
    rack.position.set(-2.2, BOOTH_CT, 0.6);
    rack.rotation.y = 0.25;
    boothProp(g, rack, { radius: 0.55, slideDistance: 2.3, flyHeight: 1.4, fallTime: 0.6, shovePower: 6 });
    const prizes = makePlushPile([0x7bd8ff, 0xffd166, 0xff6fae]);
    prizes.position.set(0.1, BOOTH_CT, 0.85);
    boothProp(g, prizes, { radius: 0.6, slideDistance: 2.5, flyHeight: 1.3, fallTime: 0.6, shovePower: 6 });
    for (let i = 0; i < 5; i++) {
      const p = makePlush(0x9effa1);
      p.position.set(1.2 + (i % 2) * 0.4, BOOTH_CT, 0.9 - i * 0.3);
      p.scale.setScalar(0.85);
      p.rotation.y = i * 1.3;
      looseProp(g, p);
    }
    register();
    return;
  }

  if (kind === 'milk') {
    const crate = makeMilkCrate();
    crate.position.set(-1.85, BOOTH_CT, 0.35);
    boothProp(g, crate, { radius: 0.7, slideDistance: 2.4, flyHeight: 1.0, fallTime: 0.55, shovePower: 6 });
    const can = makeMilkCrate();
    can.position.set(-0.2, BOOTH_CT, 0.8);
    can.scale.setScalar(0.8);
    boothProp(g, can, { radius: 0.6, slideDistance: 2.4, flyHeight: 1.2, fallTime: 0.6, shovePower: 6 });
    for (let i = 0; i < 6; i++) {
      const b = makeMilkBottle();
      b.position.set(0.7 + (i % 3) * 0.34, BOOTH_CT + 0.02, 1.0 - Math.floor(i / 3) * 0.4);
      b.scale.setScalar(1.25);
      looseProp(g, b);
    }
    register();
    return;
  }

  if (kind === 'apple') {
    const pot = makeCaramelPot();
    pot.position.set(-1.95, BOOTH_CT, 0.2);
    boothProp(g, pot, { radius: 0.6, slideDistance: 2.3, flyHeight: 1.1, fallTime: 0.55, shovePower: 6 });
    for (let i = 0; i < 5; i++) {
      const a = makeCandyAppleOnStick();
      a.position.set(-0.5 + (i % 3) * 0.4, BOOTH_CT + 0.02, 0.85 + Math.floor(i / 3) * 0.35);
      a.rotation.y = i * 0.7;
      looseProp(g, a);
    }
    for (let i = 0; i < 4; i++) {
      const a = makeCandyAppleOnStick(0xe8b74a);
      a.position.set(1.1 + (i % 2) * 0.4, BOOTH_CT + 0.02, 0.9 - i * 0.35);
      looseProp(g, a);
    }
    register();
    return;
  }

  if (kind === 'corndog') {
    const fryer = makeCornDogFryer();
    fryer.position.set(-1.95, BOOTH_CT, 0.15);
    boothProp(g, fryer, { radius: 0.65, slideDistance: 2.4, flyHeight: 1.0, fallTime: 0.55, shovePower: 6 });
    const bowl = makeBatterBowl();
    bowl.position.set(-0.5, BOOTH_CT, 0.95);
    boothProp(g, bowl, { radius: 0.4, slideDistance: 2.5, flyHeight: 1.5, fallTime: 0.6, shovePower: 6 });
    for (let i = 0; i < 6; i++) {
      const d = makeCornDogStick();
      d.position.set(0.5 + (i % 3) * 0.36, BOOTH_CT + 0.02, 0.95 - Math.floor(i / 3) * 0.4);
      d.rotation.z = (i % 2 ? 0.2 : -0.2);
      looseProp(g, d);
    }
    register();
    return;
  }

  if (kind === 'icecream') {
    const machine = makeSoftServe();
    machine.position.set(-2.05, BOOTH_CT, 0.1);
    boothProp(g, machine, { radius: 0.6, slideDistance: 2.4, flyHeight: 1.0, fallTime: 0.55, shovePower: 6 });
    const holder = makeConeHolder();
    holder.position.set(-0.7, BOOTH_CT, 0.95);
    boothProp(g, holder, { radius: 0.5, slideDistance: 2.4, flyHeight: 1.3, fallTime: 0.6, shovePower: 6 });
    for (let i = 0; i < 3; i++) {
      const tub = makeIceCreamTub(i === 0 ? 0xfff5e4 : i === 1 ? 0xf2c9a0 : 0x8a5a3a);
      tub.position.set(0.1 + i * 0.34, BOOTH_CT, -0.3);
      looseProp(g, tub);
    }
    for (let i = 0; i < 4; i++) {
      const c = makeIceCreamCone();
      c.position.set(1.1 + (i % 2) * 0.36, BOOTH_CT + 0.02, 0.95 - Math.floor(i / 2) * 0.42);
      looseProp(g, c);
    }
    register();
    return;
  }

  // ring toss
  const crate = makeRingCrate();
  crate.position.set(-1.95, BOOTH_CT, 0.35);
  boothProp(g, crate, { radius: 0.7, slideDistance: 2.4, flyHeight: 1.1, fallTime: 0.55, shovePower: 6 });
  const crate2 = makeRingCrate();
  crate2.position.set(-0.5, BOOTH_CT, 0.85);
  crate2.scale.setScalar(0.85);
  boothProp(g, crate2, { radius: 0.6, slideDistance: 2.5, flyHeight: 1.3, fallTime: 0.6, shovePower: 6 });
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.055, 6, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffb347, emissive: 0xff9a2e, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.3,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.9 + (i % 2) * 0.4, BOOTH_CT + 0.05, 0.95 - i * 0.28);
    looseProp(g, ring);
  }
  register();
}

const BOOTH_BUILDERS = {
  popcorn: boothPopcorn,
  cotton: boothCottonCandy,
  ring: boothRingToss,
  milk: boothMilkBottle,
  teddy: boothTeddy,
  dart: boothDart,
  apple: boothCandyApple,
  donut: boothDonut,
  corndog: boothCornDog,
  icecream: boothIceCream,
};

// One stall: the shared counter, a unique giant sculpture on top, and a solid
// footprint so the car cannot drive through the counter. The sculpture itself
// overhangs (it is above roof height), so you can drive under a giant donut.
export function makeBooth(kind, opts = {}) {
  const build = BOOTH_BUILDERS[kind] || boothTeddy;
  const group = build();

  // Everything the stall base built is a tagged structural piece; everything
  // else the builder added is the giant sculpture. The sculpture becomes one
  // more knockable, so a hard enough hit brings the whole sign down too.
  const pieces = [];
  const signParts = [];
  for (const child of [...group.children]) {
    if (child.userData.stallPiece) pieces.push(child);
    else signParts.push(child);
  }
  if (signParts.length) {
    const sign = new THREE.Group();
    sign.userData.isSign = true;
    for (const c of signParts) sign.add(c);
    group.add(sign);
    pieces.push(sign);
  }

  // The object browser builds a preview copy: stock it, but do not register
  // anything as knockable (it belongs to no world).
  _stockingInert = opts.inert === true;
  try {
    if (!_stockingInert) {
      // Structure first. Boards fly a long way; the roof is a heavy slab and
      // only lurches off its posts, so it gets a gentler throw.
      const knockOf = new Map();
      for (const p of pieces) {
        const isRoof = p.userData.stallRoof === true;
        // The roof is heavy: the car cannot knock it off by touch. It only
        // comes down once a post is gone and it has sagged (see world.update),
        // which is what makes the stall read as top-heavy.
        const k = stallKnock(p, isRoof ? 0.02 : BOOTH_HIT_RADIUS, isRoof
          ? { dormant: true, slideDistance: 2.2, flyHeight: 1.0, fallTime: 1.05, shovePower: 10, shoveSpinPower: 2.2 }
          : {
            slideDistance: 4.2 + Math.random() * 2.2,
            flyHeight: 2.6 + Math.random() * 1.6,
            fallTime: 0.85,
            shovePower: 12,
            shoveSpinPower: 4,
          });
        // Every board and the roof lie down flat once they land. The giant
        // sculpture is not a flat thing, so it is left to tumble.
        if (!p.userData.isSign) k._flat = true;
        knockOf.set(p, k);
      }
      // The roof only stands while the stall does: knock any piece and the
      // heavy sign overhead makes the roof sag and come down (see world.update).
      const posts = pieces.filter((p) => p.userData.stallPost).map((p) => knockOf.get(p));
      const signMesh = pieces.find((p) => p.userData.isSign);
      _boothRigs.push({
        roof: knockOf.get(pieces.find((p) => p.userData.stallRoof)),
        posts,
        pieces: pieces.map((p) => knockOf.get(p)).filter(Boolean),
        sign: knockOf.get(signMesh) || null,
      });
    }
    stockBooth(kind, group);
  } finally {
    _stockingInert = false;
  }

  // Everything that belongs to this stall is knocked INDIVIDUALLY as the car
  // reaches it: you plough in and the boards and stock come down in the order
  // you hit them, rather than the whole booth detonating at once.
  return {
    group,
    // A fairground stall is scenery, not a wall: no collider at all, so the car
    // ploughs straight through and can never be stopped by a counter.
    colliders: [],
  };
}

// ===== Ferris wheel =========================================================
export function buildFerrisWheel() {
  const { x, z, r, hubY, facing } = FERRIS;
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = facing;

  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, roughness: 0.45, metalness: 0.7, emissive: 0x2a3550, emissiveIntensity: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.7, metalness: 0.4 });

  // Two A-frame legs, front and back of the wheel plane.
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const legLen = Math.hypot(r * 0.72, hubY);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, legLen, 10), steel);
      leg.position.set(sx * r * 0.36, hubY / 2, sz * 5.2);
      leg.rotation.z = -sx * Math.atan2(r * 0.36, hubY);
      leg.castShadow = true;
      root.add(leg);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, 0.4, 0.4), dark);
    brace.position.set(0, hubY * 0.52, sz * 5.2);
    root.add(brace);
  }

  // The rotating wheel.
  const wheel = new THREE.Group();
  wheel.position.set(0, hubY, 0);
  root.add(wheel);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.42, 8, 72), steel);
  rim.castShadow = true;
  wheel.add(rim);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.24, 6, 56), dark);
  wheel.add(rim2);

  // Multi-coloured LED spokes.
  const ledColors = [NEON.pink, NEON.cyan, NEON.warm, NEON.violet, NEON.green];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TWO_PI;
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(r, 0.13, 0.13),
      neonMat(ledColors[i % ledColors.length]),
    );
    spoke.position.set(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0);
    spoke.rotation.z = a;
    wheel.add(spoke);
  }
  // Hub.
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16), steel);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);

  // Open-air passenger baskets, kept upright by the update.
  const baskets = [];
  const BASKETS = 16;
  const basketMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.8 });
  for (let i = 0; i < BASKETS; i++) {
    const a = (i / BASKETS) * TWO_PI;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.5), basketMat);
    seat.position.y = -1.05;
    seat.castShadow = true;
    pivot.add(seat);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 1.5), neonMat(ledColors[i % ledColors.length]));
      rail.position.set(sx * 0.9, -0.62, 0);
      pivot.add(rail);
    }
    const backRail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 0.1), basketMat);
    backRail.position.set(0, -0.62, -0.7);
    pivot.add(backRail);
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), steel);
    hanger.position.y = -0.5;
    pivot.add(hanger);
    wheel.add(pivot);
    baskets.push(pivot);
  }

  // Boarding platform with access gates.
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(16, 1.0, 10),
    new THREE.MeshStandardMaterial({ color: 0x4b4f5c, roughness: 0.9 }),
  );
  deck.position.set(0, 0.5, 12.5);
  deck.receiveShadow = true;
  root.add(deck);
  for (const sx of [-1, 1]) {
    const gate = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.16, 6, 20, Math.PI), neonMat(NEON.cyan));
    gate.position.set(sx * 6.0, 3.3, 12.5);
    gate.rotation.y = Math.PI / 2;
    root.add(gate);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.3, 8), steel);
    post.position.set(sx * 6.0, 1.65, 12.5);
    root.add(post);
  }

  root.updateMatrixWorld(true);

  const colliders = [
    // The two leg frames.
    { x: x + Math.sin(facing) * 5.2, z: z + Math.cos(facing) * 5.2, halfW: 4.5, halfD: 1.2, h: hubY },
    { x: x - Math.sin(facing) * 5.2, z: z - Math.cos(facing) * 5.2, halfW: 4.5, halfD: 1.2, h: hubY },
    // The boarding deck.
    { x: x + Math.sin(facing) * 12.5, z: z + Math.cos(facing) * 12.5, halfW: 8, halfD: 5, h: 1.0 },
  ];
  return { group: root, colliders, wheel, baskets };
}

// ===== Pendulum swing =======================================================
export function buildPendulum() {
  const { x, z, facing, armLen } = PENDULUM;
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = facing;

  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c2d2, roughness: 0.4, metalness: 0.75, emissive: 0x2a3550, emissiveIntensity: 0.5 });
  const pivotY = armLen + 8;

  // A-frame legs reaching the pivot.
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const len = Math.hypot(7, pivotY);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, len, 10), steel);
      leg.position.set(sx * 3.5, pivotY / 2, sz * 4.5);
      leg.rotation.z = -sx * Math.atan2(3.5, pivotY);
      leg.castShadow = true;
      root.add(leg);
    }
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 10, 12), steel);
  axle.rotation.x = Math.PI / 2;
  axle.position.y = pivotY;
  root.add(axle);

  // The swinging arm and its ring.
  const swing = new THREE.Group();
  swing.position.set(0, pivotY, 0);
  root.add(swing);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, armLen, 1.1), steel);
  arm.position.y = -armLen / 2;
  arm.castShadow = true;
  swing.add(arm);

  const ringY = -armLen - 1.0;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(9.5, 0.5, 8, 40),
    neonMat(NEON.pink),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = ringY;
  swing.add(ring);
  const ringDeck = new THREE.Mesh(
    new THREE.CylinderGeometry(9.7, 9.7, 0.4, 36),
    new THREE.MeshStandardMaterial({ color: 0x333a4a, roughness: 0.8 }),
  );
  ringDeck.position.y = ringY - 0.2;
  swing.add(ringDeck);
  // Seats around the ring.
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.9 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TWO_PI;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.2), seatMat);
    seat.position.set(Math.cos(a) * 9.0, ringY + 0.7, Math.sin(a) * 9.0);
    seat.rotation.y = -a;
    swing.add(seat);
  }

  const colliders = [
    { x, z, halfW: 7.6, halfD: 6.4, h: 5.0 },
  ];
  return { group: root, colliders, swing };
}

// ===== Roller coaster =======================================================
export function buildCoaster() {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8f9bb3, roughness: 0.38, metalness: 0.8, emissive: 0x243050, emissiveIntensity: 0.5 });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x3c4a66, roughness: 0.5, metalness: 0.6, emissive: 0x1d2740, emissiveIntensity: 0.6 });

  // A closed circuit: station straight, lift hill, a vertical loop, then a wide
  // swooping return down the east side.
  const pts = [
    [86, 3.0, -34], [86, 3.0, -22],
    [90, 6.0, -6], [96, 14.0, 6], [100, 26.0, 18],
    [100, 28.5, 28], [98, 20.0, 40],
    [94, 11.0, 48], [92.5, 20.0, 54], [94, 30.0, 60], [97, 23.0, 64], [95, 13.0, 70],
    [104, 16.0, 78], [112, 20.0, 62], [114, 18.0, 40], [110, 14.0, 18],
    [104, 8.0, 2], [96, 5.0, -16],
  ].map(([px, py, pz]) => new THREE.Vector3(px, py, pz));

  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 420, 0.26, 6, true),
    trackMat,
  );
  tube.castShadow = true;
  root.add(tube);

  // Twin rails: two thinner tubes offset either side of the spine.
  for (const off of [-0.62, 0.62]) {
    const railPts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      railPts.push(p.clone().addScaledVector(side, off));
    }
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, true, 'catmullrom', 0.5), 300, 0.1, 5, true),
      neonMat(NEON.cyan),
    );
    root.add(rail);
  }

  // Support columns every few metres, skipping the low station run.
  const colGeo = new THREE.CylinderGeometry(0.24, 0.3, 1, 6);
  for (let i = 0; i < 90; i++) {
    const t = i / 90;
    const p = curve.getPointAt(t);
    if (p.y < 4.2) continue;
    const h = p.y - FAIR_GROUND;
    const col = new THREE.Mesh(colGeo, steel);
    col.scale.y = h;
    col.position.set(p.x, FAIR_GROUND + h / 2, p.z);
    col.castShadow = true;
    root.add(col);
  }

  // Cars frozen in motion along the track.
  const carBody = new THREE.MeshStandardMaterial({ color: 0xe23a2e, roughness: 0.45, metalness: 0.25 });
  const cars = [];
  for (let i = 0; i < 3; i++) {
    const t = 0.006 + i * 0.012;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 2.2), carBody);
    body.castShadow = true;
    car.add(body);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.9 }));
    seat.position.set(0, 0.6, -0.3);
    car.add(seat);
    // Local +Z runs along the track.
    car.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.clone().normalize());
    car.position.copy(p);
    root.add(car);
    cars.push(car);
  }

  // Station platform and access gates.
  const station = new THREE.Mesh(
    new THREE.BoxGeometry(11, 1.4, 30),
    new THREE.MeshStandardMaterial({ color: 0x5a5348, roughness: 0.92 }),
  );
  station.position.set(80, 0.7, -26);
  station.receiveShadow = true;
  root.add(station);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 32), new THREE.MeshStandardMaterial({ color: 0x2a2033, roughness: 0.8 }));
  roof.position.set(80, 7.4, -26);
  root.add(roof);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7.4, 8), steel);
      post.position.set(80 + sx * 5.4, 3.7, -26 + sz * 15);
      root.add(post);
    }
  }
  const gate = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.16, 6, 20, Math.PI), neonMat(NEON.pink));
  gate.position.set(86, 4.2, -26);
  gate.rotation.y = Math.PI / 2;
  root.add(gate);

  const colliders = [
    { x: 80, z: -26, halfW: 5.5, halfD: 15, h: 1.4 },
  ];
  return { group: root, colliders };
}

// ===== Tilt-a-whirl =========================================================
export function buildTiltAWhirl() {
  const { x, z, r } = TILT;
  const root = new THREE.Group();
  root.position.set(x, 0, z);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(r + 1.6, r + 2.0, 1.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x3a3148, roughness: 0.9 }),
  );
  base.position.y = 0.6;
  base.receiveShadow = true;
  root.add(base);

  const spin = new THREE.Group();
  spin.position.y = 1.4;
  root.add(spin);

  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0x6b2f6e, roughness: 0.75 }),
  );
  deck.receiveShadow = true;
  spin.add(deck);

  // Colour wedges so the spin reads.
  const wedgeColors = [NEON.pink, NEON.cyan, NEON.warm, NEON.violet];
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TWO_PI;
    const wedge = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.18, r * 0.96, 12, 1, a0, TWO_PI / 8 * 0.92),
      new THREE.MeshBasicMaterial({ color: wedgeColors[i % 4], side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.5 }),
    );
    wedge.rotation.x = -Math.PI / 2;
    wedge.position.y = 0.27;
    spin.add(wedge);
  }

  // The ride's cars, each free to spin on its own axis.
  const carGroups = [];
  const carColors = [0xe23a2e, 0x2f7de0, 0xf2c14e, 0x35b06a, 0xd94fa8, 0x8f5bd8, 0xdff0ff];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TWO_PI;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * (r - 2.6), 0.9, Math.sin(a) * (r - 2.6));
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 14, 10, 0, TWO_PI, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: carColors[i % carColors.length], roughness: 0.5, metalness: 0.2 }),
    );
    shell.scale.y = 0.7;
    shell.castShadow = true;
    pivot.add(shell);
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.9 }),
    );
    seat.position.y = 0.42;
    pivot.add(seat);
    spin.add(pivot);
    carGroups.push(pivot);
  }

  const colliders = [{ x, z, r: r + 1.4, h: 3.0 }];
  return { group: root, colliders, spin, cars: carGroups };
}

// ===== Chair-swing tower ====================================================
export function buildChairSwing() {
  const { x, z, h } = SWINGS;
  const root = new THREE.Group();
  root.position.set(x, 0, z);

  const steel = new THREE.MeshStandardMaterial({ color: 0xaeb8c8, roughness: 0.4, metalness: 0.8, emissive: 0x2a3550, emissiveIntensity: 0.5 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.9, h, 14), steel);
  mast.position.y = h / 2;
  mast.castShadow = true;
  root.add(mast);

  // Flared canopy at the top.
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(11, 4.4, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2e2a4a, roughness: 0.7, side: THREE.DoubleSide }),
  );
  canopy.position.y = h + 0.6;
  root.add(canopy);
  const canopyRim = new THREE.Mesh(new THREE.TorusGeometry(10.6, 0.28, 6, 40), neonMat(NEON.warm));
  canopyRim.rotation.x = Math.PI / 2;
  canopyRim.position.y = h - 1.4;
  root.add(canopyRim);

  // Rotating hub with chairs on chains.
  const hub = new THREE.Group();
  hub.position.y = h - 1.8;
  root.add(hub);

  const chains = [];
  const chairs = [];
  const N = 16;
  const chainMat = new THREE.MeshStandardMaterial({ color: 0xb8bfcc, roughness: 0.5, metalness: 0.6 });
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TWO_PI;
    const arm = new THREE.Group();
    arm.position.set(Math.cos(a) * 8.4, 0, Math.sin(a) * 8.4);
    arm.rotation.y = -a;
    // The chain hangs outward as the tower spins; a fixed splay reads as that.
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 8.2, 5), chainMat);
    chain.position.set(Math.sin(0.42) * 4.1, -4.1, 0);
    chain.rotation.z = -0.42;
    arm.add(chain);
    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.25, 1.4),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe23a2e : 0xffd166, roughness: 0.7 }),
    );
    chair.position.set(Math.sin(0.42) * 8.1, -8.2, 0);
    arm.add(chair);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.12), neonMat(NEON.pink));
    back.position.set(chair.position.x, -7.7, -0.66);
    arm.add(back);
    hub.add(arm);
    chains.push(arm);
    chairs.push(chair);
  }

  const colliders = [{ x, z, r: 3.0, h }];
  return { group: root, colliders, hub, arms: chains, chairs };
}

// ===== The arrival / exit gate ==============================================
export function buildGate() {
  const { x, z, halfW } = FAIR_RETURN;
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x7d5731, roughness: 0.8 });
  const H = 9.5;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.0, H, 1.0), postMat);
    post.position.set(x + sx * (halfW + 0.6), H / 2, z);
    post.castShadow = true;
    g.add(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), neonMat(NEON.warm));
    lamp.position.set(x + sx * (halfW + 0.6), H + 0.3, z);
    g.add(lamp);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry((halfW + 1.2) * 2, 1.5, 1.1), postMat);
  header.position.set(x, H - 0.2, z);
  g.add(header);
  const sign = signPanel('COUNTY FAIR', (halfW + 1.2) * 2, 2.2, '#1b1030', '#ffd98a');
  sign.position.set(x, H + 1.6, z + 0.1);
  g.add(sign);
  // The glowing mouth of the way home.
  const portal = new THREE.Mesh(
    new THREE.CircleGeometry(halfW, 32),
    new THREE.MeshBasicMaterial({ color: 0x2a1450, fog: false }),
  );
  portal.position.set(x, halfW * 0.9, z + 0.05);
  g.add(portal);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(halfW, 0.16, 6, 40), neonMat(NEON.cyan));
  ring.position.copy(portal.position);
  g.add(ring);

  const colliders = [
    { x: x - (halfW + 0.6), z, halfW: 0.6, halfD: 1.4, h: H },
    { x: x + (halfW + 0.6), z, halfW: 0.6, halfD: 1.4, h: H },
  ];
  return { group: g, colliders, portal, ring };
}

// ===== Scatter props ========================================================
function buildScatter(scene) {
  const rng = makeRng(0x71c3);
  const popcornMat = new THREE.MeshStandardMaterial({ color: 0xf8ecc0, roughness: 1 });
  const popcornGeo = new THREE.SphereGeometry(0.11, 6, 5);

  for (const s of FAIR_SCATTER) {
    if (s.kind === 'tub') {
      const tub = makePopcornTub();
      tub.position.set(s.x, FAIR_GROUND, s.z);
      tub.rotation.y = rng() * TWO_PI;
      scene.add(tub);
      addKnockable(tub, 0.4, { mode: 'scatter', fallTime: 0.3, slideDistance: 1.4, flyHeight: 0.5, shovePower: 6 });
    } else if (s.kind === 'cup') {
      const cup = makeSodaCup();
      cup.position.set(s.x, FAIR_GROUND, s.z);
      cup.rotation.y = rng() * TWO_PI;
      // A few cups have been knocked over already and lie on their side.
      if (rng() < 0.45) {
        cup.rotation.z = Math.PI / 2;
        cup.position.y = FAIR_GROUND + 0.19;
      }
      scene.add(cup);
      addKnockable(cup, 0.22, { mode: 'scatter', fallTime: 0.24, slideDistance: 1.2, flyHeight: 0.4, shovePower: 5 });
    } else if (s.kind === 'bottles') {
      const g = new THREE.Group();
      g.position.set(s.x, FAIR_GROUND, s.z);
      scene.add(g);
      makeBottlePyramid(g, 0, 0, 6);
    } else if (s.kind === 'popcorn') {
      // A heap of spilled kernels.
      const heap = new THREE.Group();
      heap.position.set(s.x, FAIR_GROUND, s.z);
      for (let i = 0; i < 16; i++) {
        const k = new THREE.Mesh(popcornGeo, popcornMat);
        const a = rng() * TWO_PI, rr = rng() * 0.85;
        k.position.set(Math.cos(a) * rr, 0.06 + rng() * 0.07, Math.sin(a) * rr);
        heap.add(k);
      }
      scene.add(heap);
    }
  }
}

// ============================================================================
// World assembly
// ============================================================================
export function buildFairgroundWorld(scene) {
  scene.fog = new THREE.Fog(0x120c22, 150, 460);

  // Night rig: the fair's own lamps do most of the work, so the ambient terms
  // only have to keep unlit steel from going pure black.
  scene.add(new THREE.HemisphereLight(0x7a90d8, 0x3a2e4a, 1.85));
  const moon = new THREE.DirectionalLight(0xcfe0ff, 1.05);
  moon.position.set(-120, 180, 140);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -170;
  moon.shadow.camera.right = 170;
  moon.shadow.camera.top = 170;
  moon.shadow.camera.bottom = -170;
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = 460;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.06;
  scene.add(moon);
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));

  buildSky(scene);
  buildGround(scene);
  const bulbs = buildBulbs(scene);

  // ---- Midway booths ----
  const colliders = [];
  for (const b of BOOTHS) {
    const built = makeBooth(b.kind);
    built.group.position.set(b.x, FAIR_GROUND, b.z);
    built.group.rotation.y = b.facing;
    scene.add(built.group);
    // Booth colliders are authored in the booth's local frame; rotate the
    // centre out to world space (the footprint is square-ish, so rotating the
    // half-extents by a quarter turn for the side-facing rows is enough).
    for (const c of built.colliders) {
      const cos = Math.cos(b.facing), sin = Math.sin(b.facing);
      const lx = c.x, lz = c.z;
      colliders.push({
        x: b.x + lx * cos + lz * sin,
        z: b.z - lx * sin + lz * cos,
        halfW: Math.abs(cos) > 0.5 ? c.halfW : c.halfD,
        halfD: Math.abs(cos) > 0.5 ? c.halfD : c.halfW,
        h: c.h,
        noRoof: c.noRoof,
        gate: c.gate,
      });
    }
  }

  // ---- Rides ----
  const ferris = buildFerrisWheel();
  scene.add(ferris.group);
  colliders.push(...ferris.colliders);

  const pendulum = buildPendulum();
  scene.add(pendulum.group);
  colliders.push(...pendulum.colliders);

  const coaster = buildCoaster();
  scene.add(coaster.group);
  colliders.push(...coaster.colliders);

  const tilt = buildTiltAWhirl();
  scene.add(tilt.group);
  colliders.push(...tilt.colliders);

  const swings = buildChairSwing();
  scene.add(swings.group);
  colliders.push(...swings.colliders);

  const gate = buildGate();
  scene.add(gate.group);
  colliders.push(...gate.colliders);

  buildScatter(scene);

  // ---- The fair's own lamps -------------------------------------------------
  // Warm spill down the midway, plus a coloured wash on each ride, so the place
  // reads as "lit up" rather than "dark with glowing dots". These are the only
  // point lights in the level; everything else is emissive.
  const lampSpecs = [
    { x: -12, y: 6.5, z: -100, c: 0xffb85c, i: 55, d: 60 },
    { x: 12, y: 6.5, z: -78, c: 0xff9ad0, i: 52, d: 58 },
    { x: -12, y: 6.5, z: -56, c: 0xffb85c, i: 55, d: 60 },
    { x: 12, y: 6.5, z: -34, c: 0x9ad7ff, i: 50, d: 56 },
    { x: -12, y: 6.5, z: -12, c: 0xffb85c, i: 55, d: 60 },
    { x: 0, y: 8, z: 14, c: 0xffd08a, i: 45, d: 56 },
    { x: TILT.x, y: 9, z: TILT.z, c: 0xff8ad0, i: 60, d: 64 },
    { x: FERRIS.x, y: 26, z: FERRIS.z + 18, c: 0xffd08a, i: 130, d: 140 },
    { x: PENDULUM.x, y: 18, z: PENDULUM.z, c: 0xff77c0, i: 80, d: 95 },
    { x: SWINGS.x, y: 22, z: SWINGS.z, c: 0xffc46a, i: 80, d: 95 },
    { x: 96, y: 12, z: 26, c: 0x7fe0ff, i: 80, d: 95 },
  ];
  for (const L of lampSpecs) {
    const lamp = new THREE.PointLight(L.c, L.i, L.d, 2);
    lamp.position.set(L.x, L.y, L.z);
    scene.add(lamp);
    // A soft pool of light on the gravel beneath it. One quad, and deliberately
    // subtle: the point light does the lighting, this only warms the ground.
    addLightPool(scene, L.x, L.z, Math.min(13, L.d * 0.2), L.c);
  }

  // ---- Boundary ----
  colliders.push(...fairBoundsColliders());

  // ---- Animation state ----
  let time = 0;
  let wheelAngle = 0;

  const world = {
    group: scene,
    colliders,
    ramps: [],
    interiors: [],
    groundY: FAIR_GROUND,
    spawn: { x: 0, z: -112, yaw: Math.PI / 2 },
    returnPortal: FAIR_RETURN,
    mapBounds: FAIR_BOUNDS,
    mapFeatures: [
      { kind: 'circle', x: FERRIS.x, z: FERRIS.z, r: FERRIS.r + 2, color: '#ffd166', label: 'Ferris Wheel' },
      { kind: 'circle', x: PENDULUM.x, z: PENDULUM.z, r: 12, color: '#ff7bd0', label: 'Pendulum' },
      { kind: 'rect', x: 98, z: 24, r: 34, color: '#7be0ff', label: 'Coaster' },
      { kind: 'circle', x: TILT.x, z: TILT.z, r: TILT.r + 1, color: '#b196ff', label: 'Tilt-a-Whirl' },
      { kind: 'circle', x: SWINGS.x, z: SWINGS.z, r: 11, color: '#8affc1', label: 'Chair Swing' },
      { kind: 'rect', x: 0, z: -56, r: 26, color: '#ffd166', label: 'Midway' },
      { kind: 'circle', x: FAIR_RETURN.x, z: FAIR_RETURN.z, r: 6, color: '#7fe0ff', label: 'Exit' },
    ],
    // Runs AFTER physics' updateKnockables (main.js calls it there), because
    // that is what writes a falling prop's Y. The scatter animation walks the
    // object's ORIGIN along an arc — which buries a giant sculpture, whose
    // geometry starts metres above its origin — and then correcting it on the
    // landing frame made the whole thing snap into the air. So here the LOWEST
    // POINT is walked along that same arc instead: every piece descends onto
    // the gravel and is already at its resting height the moment it lands.
    settlePass() {
      for (const k of _stallKnockables) {
        if (k.state === 'fallen') {
          if (!k._grounded) { k._grounded = true; settleOnGround(k); }
        } else if (k.state === 'falling') {
          k._grounded = false;
          if (k.t > 0.45) {
            // Freeze the tumble and measure the resting offset ONCE, then just
            // walk the lowest point down the scatter's own arc. Measuring every
            // frame was expensive enough to drop frames during a big wreck.
            if (k.spin) { k.spin = 0; k._restMinY = lowestPointY(k); }
            if (Number.isFinite(k._restMinY)) {
              const e = 1 - (1 - k.t) * (1 - k.t);
              const arcY = k.basePos.y + (0.03 - k.basePos.y) * e
                + Math.sin(k.t * Math.PI) * k.flyHeight;
              k.group.position.y = arcY - k._restMinY;
            }
          }
        } else if (k.state === 'standing') {
          k._grounded = false;
          k._restMinY = undefined;
        }
      }
    },
    update(delta) {
      time += delta;

      // A heavy sign over a light stall: the moment ANY piece of the stall goes
      // down, the giant sculpture bolted to that roof loses its mount and comes
      // down — it must never be left hanging over an emptied plot. The roof sags
      // toward the gap first, then lets go after it.
      for (const rig of _boothRigs) {
        const roof = rig.roof;
        const downed = rig.pieces.find((p) => p.state !== 'standing');
        if (!downed) {
          if (roof && roof._leanT) {
            roof._leanT = 0;
            roof.group.quaternion.copy(roof.baseQuat);
            roof.group.position.copy(roof.basePos);
          }
          continue;
        }
        const anchor = roof || rig.sign;
        if (!anchor) continue;
        const dxb = downed.basePos.x - anchor.basePos.x;
        const dzb = downed.basePos.z - anchor.basePos.z;
        const len = Math.hypot(dxb, dzb) || 1;
        const dx = dxb / len;
        const dz = dzb / len;

        // The sign is the heavy thing and its mounts are gone: let it go.
        if (rig.sign && rig.sign.state === 'standing') {
          triggerKnockable(rig.sign, _leanDir.set(dx, 0, dz));
        }

        if (roof && roof.state === 'standing') {
          roof._leanT = (roof._leanT || 0) + delta;
          const t = Math.min(1, roof._leanT / 0.55);
          const theta = t * t * 0.95;                 // ease in, ~54 degrees
          _leanQ.setFromAxisAngle(_leanAxis.set(dz, 0, -dx), theta);
          roof.group.quaternion.copy(roof.baseQuat).premultiply(_leanQ);
          roof.group.position.copy(roof.basePos);
          if (t >= 1) {
            roof._leanT = 0;
            // The roof is only dormant while it is on its posts; once it is
            // down it has to be a solid, shovable body like everything else.
            roof.dormant = false;
            triggerKnockable(roof, _leanDir.set(dx, 0, dz));
          }
        }
      }

      // Ferris wheel: a slow, majestic turn; baskets ride upright.
      wheelAngle += delta * 0.075;
      ferris.wheel.rotation.z = wheelAngle;
      for (const b of ferris.baskets) b.rotation.z = -wheelAngle;

      // Pendulum: a long, heavy arc.
      pendulum.swing.rotation.z = Math.sin(time * 0.95) * 1.02;

      // Tilt-a-whirl: the deck spins one way, the cars another.
      tilt.spin.rotation.y = time * 0.62;
      for (let i = 0; i < tilt.cars.length; i++) {
        tilt.cars[i].rotation.y = -time * 1.35 + i * 0.9;
      }

      // Chair swing: hub turns, the chain ring leans into the wind.
      swings.hub.rotation.y = time * 0.55;
      swings.hub.rotation.z = Math.sin(time * 0.55) * 0.03;

      // The gate's portal mouth breathes.
      const pulse = 0.75 + 0.25 * Math.sin(time * 2.2);
      gate.ring.material.color.setHex(NEON.cyan);
      gate.portal.material.opacity = pulse;
      gate.portal.material.transparent = true;

      // Bulbs twinkle very slightly — a global emissive wobble is enough.
      bulbs.mat.color.setScalar(0.92 + 0.08 * Math.sin(time * 3.1));
    },
  };

  return world;
}
