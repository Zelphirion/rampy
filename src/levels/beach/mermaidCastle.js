import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  BEACH_MERMAID_CASTLE, MERMAID_CASTLE_SCALE, beachGroundOffsetAt,
} from './layout.js?v=1800000000000';
import { buildStanding } from './sandcastle.js?v=1800000000000';

// ===== The mermaids' castle =====
//
// The landmark the deep is built around. It is the SAME castle model the car
// can drive into on the sand (sandcastle.js's buildStanding) - identical walls,
// turrets, gate arches, crenellations and keep - but built here in pearl-pink,
// dusted with glitter and ringed with shells and the other things that grow on
// a quiet patch of sea floor.
//
// It is scenery and nothing more. It stands well out past the mermaids' patrol,
// off to the east and further seaward than they ever swim, deep below the drop-
// off - water the car's rim collider can never let it reach. There is no
// collider here, no trigger, nothing to drive into: the only way to see it is
// from the lip, looking down into the blue.
const TAU = Math.PI * 2;

// The keep of the drivable castle is WALL_HALF wide (sandcastle.js). We only
// need a rough footprint to ring the decorations around, so it is re-stated
// here rather than exported: a decoration that drifts a little wider or tighter
// than the wall is not a bug, it is a garden.
const FOOT = 7;   // WALL_HALF, castle-local, before MERMAID_CASTLE_SCALE

// A deterministic RNG. The whole level avoids Math.random so a build is
// reproducible; the castle is no exception.
let _seed = 1234;
const rnd = () => {
  _seed = (_seed * 48271) % 2147483647;
  return _seed / 2147483647;
};
const rrange = (a, b) => a + (b - a) * rnd();

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true, ...opts });
}

// ---- the pink palette ----
// `emissive` is what makes the castle glow through the murk instead of sinking
// into it: a plain pink surface under deep water light reads as grey. The
// emissive term is the castle's own colour, kept low so it looks lit rather
// than radioactive.
const PEARL = std(0xffb3d9, { roughness: 0.4, metalness: 0.22, emissive: 0xff4fa0, emissiveIntensity: 0.16 });
const PEARL_DARK = std(0xe070ae, { roughness: 0.5, emissive: 0xd83f92, emissiveIntensity: 0.12 });
const PEARL_INNER = std(0xffd9ec, { roughness: 0.3, emissive: 0xff7fbf, emissiveIntensity: 0.22 });
const SHELL_MAT = std(0xffe6f3, { roughness: 0.3, metalness: 0.15, emissive: 0xff9ecb, emissiveIntensity: 0.18 });

// ---- shells, starfish, coral and the rest of the sea-floor dressing ----

// A little scallop, seated in the sand. Same face as the beach's washed-up
// valves, but pearl-pink and glittering.
function scallop(scale) {
  const g = new THREE.Group();
  const lower = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 8, 0, TAU, Math.PI * 0.5, Math.PI * 0.5), SHELL_MAT);
  lower.scale.set(1.7, 0.55, 1.25);
  lower.rotation.x = Math.PI;
  const upper = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 8, 0, TAU, Math.PI * 0.62, Math.PI * 0.38), SHELL_MAT);
  upper.scale.set(1.7, 0.8, 1.25);
  upper.position.set(0, 0.05, -0.95);
  upper.rotation.x = -0.7;
  g.add(lower, upper);
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// A five-armed starfish lying flat on the floor.
function starfish(scale, mat) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 6), mat);
  disc.scale.y = 0.34;
  g.add(disc);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const arm = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 5), mat);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = -a;
    arm.position.set(Math.cos(a) * 1.0, 0.02, Math.sin(a) * 1.0);
    arm.scale.y = 0.5;
    g.add(arm);
  }
  g.scale.setScalar(scale);
  return g;
}

// A spiky urchin: the shell with a hatful of short spikes out of it.
function urchin(scale, mat) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), mat);
  g.add(ball);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 14; i++) {
    const y = rrange(-1, 1);
    const a = rnd() * TAU;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize();
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.85, 4), mat);
    spike.quaternion.setFromUnitVectors(up, dir);
    spike.position.copy(dir).multiplyScalar(0.55);
    g.add(spike);
  }
  g.scale.setScalar(scale);
  return g;
}

// A coral head: a lumpy dome with a few branches, kept in the muted reef
// palette so the castle garden belongs to the same sea as the basin reefs.
const CORAL_COLS = [0xff8fc4, 0xffa9d1, 0xc07ad8, 0xe97f9f];
function coralHead(scale, color) {
  const m = std(color, { roughness: 0.7 });
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), m);
  ball.scale.y = 0.8;
  g.add(ball);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU;
    const h = rrange(0.6, 1.5);
    const br = new THREE.Mesh(new THREE.ConeGeometry(0.22, h, 5), m);
    br.position.set(Math.cos(a) * 0.6, 0.5 + h * 0.4, Math.sin(a) * 0.6);
    br.rotation.z = Math.cos(a) * 0.5;
    br.rotation.x = -Math.sin(a) * 0.5;
    g.add(br);
  }
  g.scale.setScalar(scale);
  return g;
}

// A ribbon of kelp. It is one long tapered blade that the update sways about
// its foot, so a patch of them moves like weed in a swell rather than standing
// like a fence.
const KELP_MAT = std(0x4fae86, { roughness: 0.8, side: THREE.DoubleSide, emissive: 0x1c5a44, emissiveIntensity: 0.1 });
function kelp(scale) {
  const g = new THREE.Group();
  const h = rrange(4, 9);
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.42, h, 5), KELP_MAT);
  blade.position.y = h / 2;
  blade.scale.z = 0.28;
  g.add(blade);
  g.scale.setScalar(scale);
  g.userData.phase = rnd() * TAU;
  return g;
}

// A scatter of pearls, for the glitter at the foot of the keep.
function pearl(scale) {
  const m = std(0xfff4fa, { roughness: 0.12, metalness: 0.4, emissive: 0xffc6e6, emissiveIntensity: 0.5 });
  const g = new THREE.Group();
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(rrange(0.22, 0.5), 10, 8), m);
    p.position.set(rrange(-1.2, 1.2), rrange(0.2, 0.9), rrange(-1.2, 1.2));
    g.add(p);
  }
  g.scale.setScalar(scale);
  return g;
}

// A soft round glint sprite for the sparkle points.
const sparkTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,244,252,1)');
  grad.addColorStop(0.35, 'rgba(255,196,232,0.75)');
  grad.addColorStop(1, 'rgba(255,150,210,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

// Sample `n` points lying ON the castle's own skin, in the model's LOCAL frame.
// Every triangle of every mesh is weighed by its area and picked in proportion,
// then a random point is taken inside it - so the big curtain-wall faces collect
// most of the glitter and the little crenellations only a few flecks, and no two
// points bunch up at a shared corner the way raw vertex-picking would. Each point
// is then nudged a hair out along its OWN face normal, so it sits just proud of
// the surface it was drawn from (glinting on the wall) instead of half-buried in
// the masonry or hanging in the empty courtyard.
function sampleSkinPoints(root, n) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const toLocal = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const tris = [];
  let total = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    toLocal.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i + 2 < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(toLocal);
      b.fromBufferAttribute(pos, i1).applyMatrix4(toLocal);
      c.fromBufferAttribute(pos, i2).applyMatrix4(toLocal);
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      const cross = e1.cross(e2);
      const area = cross.length() * 0.5;
      if (area <= 1e-7) continue;
      nrm.copy(cross).normalize();
      total += area;
      tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), nx: nrm.x, ny: nrm.y, nz: nrm.z, upto: total });
    }
  });
  const out = [];
  if (!tris.length || total <= 0) return out;
  for (let i = 0; i < n; i++) {
    const pick = rnd() * total;
    let lo = 0;
    let hi = tris.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tris[mid].upto < pick) lo = mid + 1; else hi = mid;
    }
    const t = tris[lo];
    let u = rnd();
    let v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const px = t.a.x + (t.b.x - t.a.x) * u + (t.c.x - t.a.x) * v;
    const py = t.a.y + (t.b.y - t.a.y) * u + (t.c.y - t.a.y) * v;
    const pz = t.a.z + (t.b.z - t.a.z) * u + (t.c.z - t.a.z) * v;
    out.push(new THREE.Vector3(px + t.nx * 0.18, py + t.ny * 0.18, pz + t.nz * 0.18));
  }
  return out;
}

// Three sheets of glitter, each pulsing on its own phase, so the sparkle
// twinkles unevenly instead of beating in time. One Points cloud per sheet is
// one draw call. The points are sampled from the castle's own surface, so the
// glitter clings to the walls and towers instead of hanging in the water in the
// middle of the courtyard.
function buildSparkles(castle) {
  const clouds = [];
  for (let s = 0; s < 3; s++) {
    const pts = sampleSkinPoints(castle, 90);
    const pos = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      pos[i * 3] = pts[i].x;
      pos[i * 3 + 1] = pts[i].y;
      pos[i * 3 + 2] = pts[i].z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.1, map: sparkTex, color: 0xffe3f4, sizeAttenuation: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const cloud = new THREE.Points(geo, mat);
    cloud.userData.phase = s * (TAU / 3);
    cloud.userData.freq = 1.6 + s * 0.7;
    clouds.push(cloud);
  }
  return clouds;
}

export function buildMermaidCastle(base) {
  const group = new THREE.Group();

  // ---- the castle itself, in pink ----
  const standRes = buildStanding(PEARL, PEARL_DARK, PEARL_INNER);
  const castle = standRes.group;
  castle.scale.setScalar(MERMAID_CASTLE_SCALE);
  // No flag on the mermaids' castle: the pennant belongs to the beach copy the
  // car can drive into, not to this drowned one. The pole and the card are both
  // dropped from the model.
  for (const part of standRes.flagParts) part.removeFromParent();
  group.add(castle);

  const ground = beachGroundOffsetAt(BEACH_MERMAID_CASTLE.x, BEACH_MERMAID_CASTLE.z);
  group.position.set(BEACH_MERMAID_CASTLE.x, base + ground, BEACH_MERMAID_CASTLE.z);

  const wallR = FOOT * MERMAID_CASTLE_SCALE;      // the wall ring, in world units
  const tall = 15 * MERMAID_CASTLE_SCALE;         // the keep, in world units

  // ---- the garden: shells and undersea objects, ringing the walls ----
  // Everything is seated on the sea floor at its own XZ, exactly as the basin
  // reefs and the beach shells are, so nothing floats or sinks. Positions are
  // taken in the castle's LOCAL frame and the world height is measured at the
  // matching world XZ.
  const localToWorldY = (lx, lz) =>
    base + beachGroundOffsetAt(BEACH_MERMAID_CASTLE.x + lx, BEACH_MERMAID_CASTLE.z + lz);

  const garden = new THREE.Group();
  const ringPlace = (obj, rMin, rMax) => {
    const a = rnd() * TAU;
    const r = rrange(rMin, rMax);
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    obj.position.set(lx, localToWorldY(lx, lz) - (base + ground), lz);
    obj.rotation.y = rnd() * TAU;
    garden.add(obj);
  };

  // A curb of shells right against the wall, then the wider garden beyond it.
  for (let i = 0; i < 14; i++) ringPlace(scallop(rrange(0.8, 1.6)), wallR + 0.6, wallR + 3.5);
  for (let i = 0; i < 10; i++) ringPlace(scallop(rrange(1.0, 2.0)), wallR + 4, wallR + 12);
  for (let i = 0; i < 9; i++) ringPlace(coralHead(rrange(0.9, 1.6), CORAL_COLS[i % CORAL_COLS.length]), wallR + 2, wallR + 13);
  for (let i = 0; i < 6; i++) ringPlace(starfish(rrange(0.9, 1.6), SHELL_MAT), wallR + 3, wallR + 14);
  for (let i = 0; i < 6; i++) ringPlace(urchin(rrange(0.8, 1.3), std(0x6a3d7a, { roughness: 0.8 })), wallR + 4, wallR + 15);
  for (let i = 0; i < 5; i++) ringPlace(pearl(rrange(0.8, 1.3)), wallR + 1, wallR + 8);
  group.add(garden);

  // ---- shells and glitter clinging UP the towers ----
  // The same dressing carried onto the masonry itself, so the castle reads as
  // encrusted rather than merely surrounded.
  const decor = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const corner = i % 4;
    const sx = corner < 2 ? 1 : -1;
    const sz = corner % 2 === 0 ? 1 : -1;
    const s = scallop(rrange(0.7, 1.3));
    s.position.set(
      sx * wallR * rrange(0.85, 1.0),
      rrange(2, tall * 0.55),
      sz * wallR * rrange(0.85, 1.0),
    );
    s.rotation.set(rrange(-0.4, 0.4), rnd() * TAU, rrange(-0.4, 0.4));
    decor.add(s);
  }
  for (let i = 0; i < 4; i++) {
    const p = pearl(rrange(0.8, 1.2));
    p.position.set(rrange(-wallR, wallR), rrange(tall * 0.2, tall * 0.8), wallR * (rnd() > 0.5 ? 1 : -1) * 0.9);
    decor.add(p);
  }
  group.add(decor);

  // ---- kelp, swaying off the sea floor ----
  const kelpPatch = [];
  for (let i = 0; i < 40; i++) {
    const k = kelp(rrange(0.8, 1.7));
    ringPlace(k, wallR + 5, wallR + 30);
    kelpPatch.push(k);
  }

  // ---- the glitter, clinging to the masonry ----
  // The points are in the castle's own local frame, so they are parented to the
  // castle (and inherit its scale) rather than to the world-space group.
  const sparkles = buildSparkles(castle);
  for (const c of sparkles) castle.add(c);

  return {
    group,
    update(delta, t) {
      // The glitter twinkles: each sheet breathes on its own phase. It is NOT
      // turned, because the points live on the walls - spinning them would drag
      // the glints off the masonry and back into the water.
      for (const c of sparkles) {
        c.material.opacity = 0.30 + 0.36 * (0.5 + 0.5 * Math.sin(t * c.userData.freq + c.userData.phase));
      }
      // The kelp bends about its foot in the same slow swell.
      for (const k of kelpPatch) {
        const p = k.userData.phase;
        k.rotation.z = Math.sin(t * 0.6 + p) * 0.16;
        k.rotation.x = Math.sin(t * 0.45 + p * 1.3) * 0.12;
      }
    },
  };
}
