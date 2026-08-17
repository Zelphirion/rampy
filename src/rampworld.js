import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable } from './physics.js';

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
  const wx = (x * Math.PI) / 90;      // period 180 in x (the world's x span)
  const wz = (z * Math.PI) / 106.5;   // period 213 in z (the world's z span)
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

// ===== Bumpy objects =====
// Rock mounds, dirt humps and speed-bump ridges scattered over the hills —
// everything you can just drive straight over. Each entry is an elliptical
// cosEl bump.
const bumpyObjectEls = [
  { x: 10, z: -75, rx: 5, rz: 4, h: 2.2 },      // rock mound (SE of the spawn)
  { x: -20, z: -85, rx: 4, rz: 4, h: 1.8 },
  { x: 80, z: 10, rx: 5, rz: 5, h: 2.4 },
  { x: -75, z: -40, rx: 5, rz: 4, h: 2.0 },
  { x: 15, z: 15, rx: 3.5, rz: 3.5, h: 1.6 },
  { x: -10, z: 70, rx: 4.5, rz: 4.5, h: 2.0 },
  { x: 65, z: -55, rx: 8, rz: 1.8, h: 1.3 },    // speed-bump ridge (E-W)
  { x: -10, z: 50, rx: 1.8, rz: 8, h: 1.3 },    // speed-bump ridge (N-S)
  { x: 85, z: 60, rx: 3, rz: 3, h: 1.5 },
  { x: -30, z: -20, rx: 6, rz: 3, h: 1.7 },
  // ===== Tier 1 — obstacle course =====
  // Whoop-de-dos: a N-S straightaway of 5 rollers at x=78, spaced 6 apart
  // (~2x wheelbase) so the two-point suspension ripples over them in rhythm.
  { x: 78, z: -66, rx: 3, rz: 1.7, h: 1.2 },
  { x: 78, z: -60, rx: 3, rz: 1.7, h: 1.2 },
  { x: 78, z: -54, rx: 3, rz: 1.7, h: 1.2 },
  { x: 78, z: -48, rx: 3, rz: 1.7, h: 1.2 },
  { x: 78, z: -42, rx: 3, rz: 1.7, h: 1.2 },
  // Banked S / slalom: three staggered ridges in the open north-center band —
  // drive north at x≈0, weave west around the middle ridge and east around
  // the outer two. Steep enough to slow you, low enough to drive over.
  { x: -16, z: 106, rx: 3, rz: 8, h: 1.6 },
  { x: 0, z: 96, rx: 3, rz: 8, h: 1.6 },
  { x: -16, z: 86, rx: 3, rz: 8, h: 1.6 },
  // Giant's causeway: four tall columns in the SW corner — thread the
  // ~1-wheelbase gap between them, or take the hit and bump over one.
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

// ===== The velodrome =====
// A rounded banked bowl on the west side: a sunken infield with a smooth raised
// rim you can drive around, into and out of. d = normalized distance from the
// centre (0 at the middle, 1 at the outer edge). NOTE: this is pure terrain —
// no auto-steer / radial pull, so it can't cause the steering bugs the old
// city velodrome did.
// Made 2x as big (radii and infield depth doubled) and 5x as tall (rim bank 12).
// The centre moved from -66 toward the middle to -48 so the doubled 80-wide
// ellipse still fits inside the playable x band (-90..90) and fades to 0 before
// the torus-wrap seam (a full 2x size at -66 would cross x=-90 and break the
// seamless wrap).
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

// ===== The skatepark =====
// A cluster of half-pipes (U-troughs), a round bowl and curved launch lips in
// the north-east — dips and curves to roll through. Negative h = dip, positive
// h = curved lip / pump bump.
const skateparkEls = [
  { x: 18, z: 98, rx: 14, rz: 5, h: -3.0 },     // half-pipe (E-W trough) — DEEP, launch up the far wall
  { x: 40, z: 100, rx: 5, rz: 12, h: -2.6 },    // crossed half-pipe (N-S) — deepened
  { x: 12, z: 112, rx: 7, rz: 7, h: -2.6 },     // round bowl — deeper
  { x: 34, z: 112, rx: 6, rz: 3.5, h: 2.6 },    // curved launch lip — taller, pairs with the deeper bowl
  { x: 47, z: 96, rx: 3.5, rz: 2.2, h: 1.4 },   // pump bump
  { x: 48, z: 112, rx: 3.5, rz: 2.2, h: 1.4 },  // pump bump
];
function skateparkGround(x, z) {
  let s = 0;
  for (const e of skateparkEls) s += cosEl(x, z, e.x, e.z, e.rx, e.rz, e.h);
  return s;
}

// ===== Bowling-alley pad =====
// The giant pins stand on a wide, flat base, so on the sloped rolling hills
// their bases would hang in the air. Flatten a level, smoothly-blended pad
// under the rack so every pin rests on even ground (and you can drive a
// straight line at them). Inside the pad the height is pushed toward flatY;
// outside it leaves the terrain untouched, with a cosine fade over `edge`
// units so the rim stays smooth and drivable.
const bowlingPad = { cx: -30, cz: -38, hw: 13, hd: 13, edge: 4, flatY: 0.2 };
function bowlingPadGround(x, z, base) {
  const dx = Math.max(Math.abs(x - bowlingPad.cx) - bowlingPad.hw, 0);
  const dz = Math.max(Math.abs(z - bowlingPad.cz) - bowlingPad.hd, 0);
  const d = Math.hypot(dx, dz);           // 0 inside the pad, grows outside
  if (d >= bowlingPad.edge) return 0;     // fully outside: leave terrain alone
  const t = 0.5 * (1 + Math.cos((Math.PI * d) / bowlingPad.edge));
  return (bowlingPad.flatY - base) * t;   // push toward flatY, fading at the rim
}

// ===== Tier 3 — flattened pads =====
// The swinging-hammer straightaway and the trebuchet sit on flat ground (like
// the bowling pad) so the road reads as a level runway and the machines stand
// level even though the surrounding hills roll.
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

export function terrainHeightAt(x, z) {
  const base = rollingHills(x, z) + bumpyObjectGround(x, z) + velodromeGround(x, z) + skateparkGround(x, z);
  return base + bowlingPadGround(x, z, base) + hammerPadGround(x, z, base) + trebPadGround(x, z, base);
}

// Metadata for the minimap — the world geometry itself is baked into
// terrainHeightAt, so there is nothing extra to build at load time.
// The spinning wheel of death lives here — exposed so the minimap can mark it.
export const wheelOfDeathDef = { x: 35, z: -5, R: 9.5 };

// Paddles bolted all around the wheel of death's rim (a giant waterwheel).
// `radial` is how far each paddle's CENTRE sits outboard of the rim; main.js
// reuses these exact numbers so a paddle knock matches the visual.
export const wheelOfDeathPaddles = { count: 12, len: 2.4, wid: 1.6, thick: 0.9, radial: 0.9 };

// ===== Tier 3 — swinging mallet gauntlet =====
// A row of giant mallet pendulums over a flattened straightaway (x=0, running
// south-north). Each hangs from a FIXED pivot at the top of a goal-post gantry
// over the road centre and swings ACROSS the road in a vertical arc — like a
// crescent moon on its side, tips up: the head is high at both ends of its
// swing and dips to car height in the middle. You wait for a gap and gun it.
// main.js animates the pendulums and knocks the car along the swing direction.
const hammerDefs = [
  { z: 58, phase: 0 },
  { z: 68, phase: 0.8 * Math.PI },
  { z: 78, phase: 1.6 * Math.PI },
  { z: 88, phase: 2.4 * Math.PI },
];
const HAMMER_HALFSPAN = 22;  // gantry legs at x = ±HAMMER_HALFSPAN (outside the road)
const HAMMER_PIVOT_H = 15;   // fixed pivot height above the ground
const HAMMER_ARM = HAMMER_PIVOT_H - 1.6;  // pendulum length (head centre reaches car height)
const HAMMER_SWEEP = 1.0;    // swing amplitude (radians) — big crescent, tips up
const HAMMER_FREQ = 0.75;    // swing speed (rad/s) — slow & heavy
const HAMMER_HEAD_R = 1.5;   // mallet-head radius
const HAMMER_HEAD_L = 4.0;   // mallet-head length (along the swing tangent)

// ===== Tier 3 — trebuchet + boulder placement =====
const TREBUCHET_POS = { x: -50, z: 70 };   // slings you west over the hills
const BOULDER_POS = { x: 78, z: 42 };      // open NE hilltop

export const rampWorldFeatures = {
  velodrome: { x: velodromeDef.x, z: velodromeDef.z, rx: velodromeDef.rx, rz: velodromeDef.rz },
  skatepark: skateparkEls.map((e) => ({ x: e.x, z: e.z, rx: e.rx, rz: e.rz })),
  bumpyObjects: bumpyObjectEls.map((e) => ({ x: e.x, z: e.z, rx: e.rx, rz: e.rz })),
  wheelOfDeath: wheelOfDeathDef,
  hammerGauntlet: { x: 0, z: 70, zs: hammerDefs.map((d) => d.z), side: 0 },
  trebuchet: TREBUCHET_POS,
  boulder: BOULDER_POS,
};

// Build the ramp world's terrain mesh: a big heightmap plane whose vertices
// are displaced by exactly terrainHeightAt, so the car rides the visible
// ground (no invisible surface vs. visible mesh mismatch). The grid is ~1
// unit/segment so the baked-in velodrome bank and skatepark curves stay smooth.

// A small procedural dirt texture so the ramp-world ground reads as actual
// dirt (speckled brown) instead of a flat colour. Tiled across the heightmap
// plane; the random speckle means the repeats don't show obvious seams.
function makeDirtTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // A bright, warm earth tone so the ground clearly reads as DIRT against the
  // purple sky (the old tone was so dark it muddied into the haze).
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
      // Winding order matters! (a,b,c),(b,d,c) produces DOWNWARD normals, so
      // the ground was backface-culled from above and looked exactly like the
      // sky. Reversed order makes the heightmap face UP so it renders as dirt.
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
      // A faint warm emissive lift keeps the dirt from sinking into the shade
      // of the twilight lighting, so it always reads as sunlit earth.
      emissive: 0x241505,
      emissiveIntensity: 0.22,
    })
  );
  ground.receiveShadow = true;
  scene.add(ground);
  return { terrainHeightAt };
}

// ===== Ramp-world launch ramps =====
// Solid wedge kickers sitting on the bumpy terrain, exactly like the city's
// ramps but sized for the rolling hills. Each wedge's BASE sits on the local
// terrain (baseY = terrain height under its centre), so the visible wedge and
// the surface the car rides match. `run` is the direction from the low end to
// the high end (the way you drive up), and `boost` scales the launch speed.
const RAMP_WORLD_GROUND = 0.15;   // matches groundHeight in main.js
const rampWorldRampDefs = [
  // x, z, runX, runZ, len, width, height, boost
  { x: 30, z: -40, runX: 1, runZ: 0, len: 18, width: 9, height: 7, boost: 1.15 },      // east launcher right by the spawn
  { x: -30, z: 30, runX: -Math.SQRT1_2, runZ: Math.SQRT1_2, len: 16, width: 8, height: 6, boost: 1.1 }, // NW kicker
  { x: 55, z: 75, runX: 0, runZ: -1, len: 22, width: 9, height: 9, boost: 1.2 },      // big NE launcher (southward)
  { x: -60, z: 90, runX: 1, runZ: 0, len: 14, width: 8, height: 5, boost: 1.1 },      // NW-edge kicker
  { x: -45, z: -70, runX: 0, runZ: 1, len: 18, width: 9, height: 7, boost: 1.15 },    // SW launcher (northward)
  { x: 60, z: -10, runX: 0, runZ: 1, len: 18, width: 8, height: 6, boost: 1.15 },     // SE launcher (northward)
  // Tier 1 — tabletop jump: launch kicker + long low landing table, E-W along
  // z=30 in the NE open area. Drive up the kicker, fly the ~5u gap, land on
  // the descending landing table and ride down.
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
    // Triangular wedge: flat base on the ground, sloped face rising to `height`.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(r.len, 0);
    shape.lineTo(r.len, r.height);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: r.width, bevelEnabled: false });
    geo.translate(-r.len / 2, 0, -r.width / 2);   // centre the wedge on its midpoint
    const group = new THREE.Group();
    const body = new THREE.Mesh(geo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    // A glowing lip along the high end so the kicker edge reads at twilight.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, r.width), lipMat);
    lip.position.set(r.len / 2 - 0.3, r.height + 0.14, 0);
    lip.castShadow = true;
    group.add(lip);
    // +X (low -> high) lines up with the run direction, like the city ramps.
    group.rotation.y = Math.atan2(-r.runZ, r.runX);
    group.position.set(r.x, baseY, r.z);
    scene.add(group);
    ramps.push({ ...r, baseY, mesh: group });
  }
  return { ramps };
}

// A glowing portal: two counter-spinning emissive rings around a glowing
// disc, with a small point light. It stands VERTICAL facing +/-Z (so a car
// flying down the mega ramp toward -Z sees the ring face-on). Returns refs
// so the caller can spin the rings and pulse the disc glow each frame, and
// can test the trigger sphere (triggerRadius = radius * 1.9, generous so the
// portal is easy to fly into).
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

// ===== The vortex =====
// A swirling whirlpool you can drive around (and straight through): a dark
// sink pool, glowing spiral arms winding in toward the centre, a few thin
// shear rings, and a translucent funnel of light rising out of the middle
// like a tornado. The whole thing FLOATS in the air — `FLOAT` units above
// the dirt — so the car rolls right underneath it on the terrain. Purely
// visual, no collision. Returns refs so the caller can spin each layer and
// pulse the funnel every frame.
export function createVortex(scene, x, z, terrainHeightAt) {
  const FLOAT = 1;    // how high the vortex hovers above the ground
  const baseY = terrainHeightAt(x, z) + RAMP_WORLD_GROUND + FLOAT;
  const R = 12;    // base radius of the swirl
  const H = 22;    // funnel height
  const group = new THREE.Group();
  group.position.set(x, 0, z);   // set before the ribbon lookAt calls below

  // Dark pool — the "hole" the whirlpool drains into.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(R, 48),
    new THREE.MeshBasicMaterial({ color: 0x0c0716, transparent: true, opacity: 0.9, depthWrite: false })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = baseY + 0.04;
  group.add(pool);

  // Spiral arms: glowing streamers winding in from the rim to the core; they
  // spin, so the pool looks like it's constantly swirling inward.
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
      const ang = a * (Math.PI / 2) + t * 3.2 * Math.PI;   // ~1.6 turns, winding in
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

  // Shear rings: a few thin concentric hoops spinning the other way.
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

  // Rising funnel: a translucent open cone plus spiral ribbons that climb out
  // of the centre — the vortex's updraft.
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
      q.lookAt(x, py, z);   // face the centre axis
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

// ===== Drifting clouds =====
// Soft puffy clouds high over the hills. Each is a flattened cluster of white
// spheres; they slowly drift across the sky and wrap around so it never
// empties. Purely decorative.
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

// ===== The wheel of death =====
// A huge glowing vertical hoop (like a bicycle wheel standing upright on the
// dirt) that spins constantly. Its bottom rests on the terrain and the middle
// is wide open, so you can gun the car straight into the spinning rim and
// carve around inside the hoop. Purely visual, no collision (like the
// vortex) — the car rolls over the terrain underneath.
export function createWheelOfDeath(scene, x, z, terrainHeightAt) {
  const R = wheelOfDeathDef.R;
  const tube = 0.8;
  const groundY = terrainHeightAt(x, z) + RAMP_WORLD_GROUND;
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const spin = new THREE.Group();
  spin.position.y = groundY + R + 0.2;   // hoop centre: rim just rests on the dirt

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

  // A thin inner glow ring so the opening reads clearly at twilight.
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x7f2a10,
    emissive: 0xff6a2a,
    emissiveIntensity: 1.3,
    roughness: 0.5,
  });
  const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.8, 0.16, 8, 64), innerMat);
  spin.add(inner);

  // Hub + 6 spokes so the spin is obvious.
  const spokeMat = new THREE.MeshStandardMaterial({
    color: 0x3a1210,
    emissive: 0x6a2418,
    emissiveIntensity: 0.7,
    roughness: 0.6,
  });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 14), spokeMat);
  hub.rotation.x = Math.PI / 2;   // cylinder axis along Z (the wheel's axle)
  spin.add(hub);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, R * 1.9, 0.22), spokeMat);
    spoke.rotation.z = (i / 6) * Math.PI * 2;
    spin.add(spoke);
  }

  // A ring of paddles bolted to the rim — like a waterwheel, flat blades
  // stick out radially all the way around and sweep the dirt as the hoop
  // spins. They are what clobber you: main.js tests each paddle's box.
  const paddleMat = new THREE.MeshStandardMaterial({
    color: 0x6b3a1e,
    emissive: 0xff7a2a,
    emissiveIntensity: 0.5,
    roughness: 0.6,
  });
  const P = wheelOfDeathPaddles;
  const paddleRad = R + P.radial;   // centre radius (protrudes past the rim)
  const paddleGeo = new THREE.BoxGeometry(P.len, P.wid, P.thick);
  for (let i = 0; i < P.count; i++) {
    const a = (i / P.count) * Math.PI * 2;
    const paddle = new THREE.Mesh(paddleGeo, paddleMat);
    paddle.position.set(Math.cos(a) * paddleRad, Math.sin(a) * paddleRad, 0);
    paddle.rotation.z = a;   // long axis points radially outward
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

// ===== Ramp-world knockable props =====
// Bowling pins, a linked domino run, barrels you shove aside and a timber yard
// of rolling logs — everything knocks via the shared physics.js system. Each
// prop sits on the LOCAL terrain (y = terrainHeightAt + ground) so it stands
// exactly on the dirt it appears to stand on.
// A procedural wood-grain texture so the barrels and logs read as real timber
// (grain streaks + plank seams) instead of flat brown. The grain runs along
// the cylinder's length (the UV's V axis), so it reads as vertical staves on
// a standing barrel and as lengthwise grain on a fallen log. One instance is
// shared by every barrel and log so the whole yard reads as the same wood.
function makeWoodTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Warm timber base colour.
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
  // Wavy darker grain streaks running down the length axis (V).
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
  // Plank seams (barrel staves): a few darker vertical slits.
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
  const at = (x, z) => terrainHeightAt(x, z) + RAMP_WORLD_GROUND;   // ground y at (x,z)
  const woodTex = makeWoodTexture();   // shared by the barrels and the logs

  // ---- Bowling alley: a classic 10-pin rack you scatter through ----
  // Real bowling-pin silhouette (wide base -> narrow neck -> rounded bulb),
  // white with a red neck stripe. 5x bigger all around AND stretched 2x tall
  // so they read as giant, dramatic pins.
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd02020, roughness: 0.5 });
  const PIN_R = 5;      // "5x bigger all around" (radii/width)
  const PIN_H = 9.0;    // height = 0.9 * 5 (all around) * 2 (stretched tall)
  const pinProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(1.50, 0.0),   // base (0.30 * PIN_R)
    new THREE.Vector2(1.70, 0.6),   // base bell (0.34 * PIN_R, 0.06*10)
    new THREE.Vector2(1.65, 1.4),
    new THREE.Vector2(1.30, 2.4),
    new THREE.Vector2(0.90, 3.3),
    new THREE.Vector2(0.60, 4.2),   // shoulder in
    new THREE.Vector2(0.55, 5.0),   // neck (narrowest, 0.11 * PIN_R)
    new THREE.Vector2(0.65, 5.8),
    new THREE.Vector2(0.85, 6.6),
    new THREE.Vector2(1.00, 7.2),   // bulb
    new THREE.Vector2(1.05, 7.8),   // bulb (0.21 * PIN_R)
    new THREE.Vector2(1.00, 8.4),
    new THREE.Vector2(0.70, 8.8),   // shoulder to top
    new THREE.Vector2(0.60, PIN_H),
    new THREE.Vector2(0.0, PIN_H),  // top centre
  ];
  const pinGeo = new THREE.LatheGeometry(pinProfile, 20);
  const pinSpacing = 4.5;   // rack spacing scaled to the bigger pins
  const acx = -30, acz = -44;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      const px = acx + (i - row / 2) * pinSpacing;
      const pz = acz + row * pinSpacing;
      const pin = new THREE.Mesh(pinGeo, pinMat);
      // LatheGeometry spans y 0..PIN_H, so keep the mesh at y=0 — the base
      // (y=0) then sits exactly at the group origin, which is on the ground.
      // (PIN_H/2 would have lifted the whole pin PIN_H/2 into the air.)
      pin.position.y = 0;
      pin.castShadow = true;
      // Red neck stripe: a thin band sitting just proud of the narrow neck.
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.70, 0.8, 20), stripeMat);
      stripe.position.y = 5.0;   // at the neck (0.50 * 10, pin-local)
      pin.add(stripe);
      const g = new THREE.Group();
      g.add(pin);
      // Sink the flat base a touch below the (flattened) pad so it reads as
      // planted in the dirt, not floating on top of it.
      g.position.set(px, at(px, pz) - 0.2, pz);
      scene.add(g);
      addKnockable(g, 1.8, { fallTime: 0.3, isOffEdge: rampIsOffEdge });
    }
  }

  // ---- Domino run: giant white dominoes with black pips — hit the front one
  // at the right angle and the whole row topples like a real chain reaction ----
  const domMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.35 });
  const pipMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 });
  const dominoes = [];
  // 5x the old 0.18 x 1.3 x 0.5 tile -> a huge 0.9 x 6.5 x 2.5 domino.
  const DOM_W = 0.9, DOM_H = 6.5, DOM_D = 2.5;
  const dStartX = -34, dZ = -55;
  const dCount = 12, dSpacing = 3.0;   // spaced < height, so a toppling domino reaches the next
  // Standard pip layouts for a domino half, normalized to [-1, 1] in both axes.
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
    // Black pips (and a centre divider line) on both big faces, so the run
    // reads as real dominoes from either side.
    const pipGeo = new THREE.SphereGeometry(0.26, 10, 8);
    const pipW = 1.6, pipH = 2.0;             // pip field half-extent
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
    // mode 'domino' gives them the real chain-topple physics (physics.js):
    // a falling domino only knocks over the next one if its tilting body
    // actually *touches* it, so a clean hit topples the whole row while a
    // careful side/angled hit can knock over just one. fallTime 0.9 makes the
    // big tiles fall slowly and heavily (they have weight and inertia) — the
    // whole cascade takes ~3s instead of ~1s.
    dominoes.push(addKnockable(g, DOM_D / 2, {
      mode: 'domino', fallTime: 0.9,
      dominoW: DOM_W, dominoH: DOM_H, dominoD: DOM_D,
      isOffEdge: rampIsOffEdge,
    }));
  }

  // ---- Barrel run: staggered rows of BIG wooden barrels you plow through
  // (they slide) — 5x the old size, clad in a real wood-grain texture ----
  const barrelMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
  const barrelGeo = new THREE.CylinderGeometry(2.75, 2.75, 5.5, 14);
  // Rows spread out for the 5x barrels so they sit side-by-side without
  // clipping into each other (6 apart = radius 2.75 + a gap).
  const barrelRows = [[24, 30, 36, 42, 48], [27, 33, 39, 45]];
  const bZ = -72;
  barrelRows.forEach((row, ri) => {
    const rz = bZ + ri * 6;
    for (const x of row) {
      const b = new THREE.Mesh(barrelGeo, barrelMat);
      b.position.y = 2.75;   // half of the new 5.5 height
      b.castShadow = true;
      const g = new THREE.Group();
      g.add(b);
      g.position.set(x, at(x, rz), rz);
      scene.add(g);
      // Knock radius scaled 5x to match the bigger barrel.
      addKnockable(g, 4.0, { mode: 'slide', slideDistance: 9, fallTime: 1, isOffEdge: rampIsOffEdge });
    }
  });

  // ---- Timber yard: giant wooden logs lying flat that ROLL when you bump
  // them — 5x the old size, with a wood-grain texture. Spread the piles out
  // so the 5x logs don't overlap. ----
  const logMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 });
  const logGeo = new THREE.CylinderGeometry(2.1, 2.1, 13, 14);
  const logs = [
    { x: -84, z: 26, rotY: 0.3 },
    { x: -76, z: 34, rotY: -0.2 },
    { x: -88, z: 42, rotY: 1.1 },
    { x: -72, z: 50, rotY: 0.6 },
    { x: -80, z: 58, rotY: -0.9 },
  ];
  for (const L of logs) {
    // Hierarchy: g (knockable, on the ground) → roll (heading yaw) → spin
    // (rolls around its local Z = the log's long axis) → log mesh. Rotating
    // the cylinder mesh +90° around X maps its Y (long) axis onto the spin
    // group's +Z, so spinning `spin` around Z rolls the log around its own
    // long axis while it slides along the ground.
    const g = new THREE.Group();
    const roll = new THREE.Group();
    const spin = new THREE.Group();
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.x = Math.PI / 2;   // lay the cylinder on its side (axis → +Z)
    // Keep the mesh centered at the spin group's origin, and lift the spin
    // group's origin up to the log's center so spinning rotates around the
    // cylinder center instead of orbiting it.
    log.position.y = 0;
    spin.position.y = 2.1;   // half the new 4.2 diameter: spin pivot at cylinder centre
    log.castShadow = true;
    spin.add(log);
    roll.add(spin);
    roll.rotation.y = L.rotY;       // heading
    g.add(roll);
    g.position.set(L.x, at(L.x, L.z), L.z);
    scene.add(g);
    // Knock radius scaled 5x to match the bigger log. mode 'roll' (physics.js)
    // makes the log ROLL away a good distance when you hit it: the group
    // slides with a decaying velocity while `spin` rotates at the matching
    // rolling rate around the log's own axis. rollWrapX 180 keeps a westward
    // roll from crossing the torus seam (the yard sits near x=-90).
    addKnockable(g, 8.0, {
      mode: 'roll', rollRadius: 2.1, rollPower: 24, rollDecay: 1.0, rollWrapX: 180,
      spinGroup: spin,
      rollAxis: new THREE.Vector3(Math.sin(L.rotY), 0, Math.cos(L.rotY)),
      isOffEdge: rampIsOffEdge,
    });
  }

  // Metadata so the minimap / future UI can mark the new areas.
  return {
    bowlingAlley: { x: acx, z: acz, radius: 4 },
    dominoRun: { x: dStartX + ((dCount - 1) / 2) * dSpacing, z: dZ, length: dCount * dSpacing },
    barrelRun: { x: 36, z: bZ, w: 30 },
    timberYard: { x: -80, z: 42, w: 30 },
  };
}

// ===== Tier 3 — giant swinging mallets =====
// Build the mallet pendulums for the straightaway. Each hammer is a goal-post
// gantry over the road centre with a FIXED pivot at the top; the mallet head
// hangs from that pivot and swings ACROSS the road in a vertical arc (like a
// crescent moon on its side, tips up) — it is high at both ends of its swing
// and dips to car height in the middle. The head's world position is computed
// analytically in main.js from the SAME swing angle, so the knock exactly
// matches the visual.
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
    const pivotY = groundY + HAMMER_PIVOT_H;   // the fixed point the head swings from

    const group = new THREE.Group();
    group.position.set(0, groundY, d.z);

    // Goal-post gantry: two legs at x=±HALFSPAN plus a crossbeam at the top.
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

    // Pendulum: hangs from the fixed pivot under the crossbeam and swings in
    // the X-Y plane (across the road). rotation.z = ph swings it like a
    // wrecking ball; the head rides a crescent arc with the tips up.
    const pivot = new THREE.Group();
    pivot.position.y = HAMMER_PIVOT_H;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, HAMMER_ARM, 8), mastMat);
    rod.position.y = -HAMMER_ARM / 2;
    pivot.add(rod);
    // Mallet head: cylinder long axis along the swing TANGENT (flat face leads
    // the swing). Default Y axis; rotation.z = PI/2 maps it to X.
    const head = new THREE.Mesh(new THREE.CylinderGeometry(HAMMER_HEAD_R, HAMMER_HEAD_R, HAMMER_HEAD_L, 16), ballMat);
    head.rotation.z = Math.PI / 2;
    head.position.y = -HAMMER_ARM;
    head.castShadow = true;
    pivot.add(head);
    // Orange end caps so the head reads as a solid striking face.
    const capGeo = new THREE.CylinderGeometry(HAMMER_HEAD_R + 0.12, HAMMER_HEAD_R + 0.12, 0.35, 16);
    capGeo.rotateZ(Math.PI / 2);   // align the cap's axis with the head's (local X)
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

// ===== Tier 3 — the trebuchet =====
// A big static catapult you drive INTO the cup of. The arm rests with the cup
// on the ground at the FRONT; when the car's nose enters the cup zone, main.js
// winds the arm back, whips it up-and-over and slings the car skyward. Built
// facing +X, then flipped (rotation.y = PI) so it faces -X — the car drives in
// from the east (driving west, its natural heading) and is thrown west.
export function createTrebuchet(scene, x, z, terrainHeightAt) {
  const baseY = terrainHeightAt(x, z) + RAMP_WORLD_GROUND;
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.95 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.4, metalness: 0.7 });

  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Base slab under the axle.
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 7), darkMat);
  base.position.set(-1, baseY + 0.5, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Two A-frame side supports (the shape's x is the machine's front-back).
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

  // Pivot axle between the frames.
  const axleY = baseY + 1.8;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 7.4, 10), metalMat);
  axle.rotation.z = Math.PI / 2;   // axis along X
  axle.position.set(0.2, axleY, 0);
  group.add(axle);

  // Throwing arm (pivots on the axle, rotates about Z). Local +X = the cup
  // (throw) end. restAngle tilts the cup down onto the ground at the front.
  const ARM_FRONT = 10, ARM_BACK = 5;
  const restAngle = -0.21, windupAngle = -0.34, throwAngle = 1.35;
  const arm = new THREE.Group();
  arm.position.set(0.2, axleY, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ARM_FRONT + ARM_BACK, 0.5, 0.5), woodMat);
  beam.position.x = (ARM_FRONT - ARM_BACK) / 2;   // centred on the axle
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
  group.rotation.y = Math.PI;   // flip to face -X (the throw direction)
  scene.add(group);

  // Cup rest position in world space (used for the trigger zone). Computed
  // from the arm geometry at restAngle, then mirrored by the group flip.
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

// ===== Tier 3 — rolling boulder chase =====
// A big rock on an open hilltop that starts rolling toward you the moment you
// get within its trigger radius, and gives up after rolling ~100 units. If it
// catches you it knocks the car. Purely visual otherwise — main.js runs the
// chase state machine.
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
    state: 'idle',           // idle | chasing | retreat
    speed: 9,
    rolled: 0,
    triggerRadius: 20,
    hitRadius: 4.6,
    maxRoll: 100,            // gives up after this much distance
    cooldown: 0,
  };
}
