import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { makeClamShell } from '../../props.js';
import { shellRadius } from '../../clam.js';
import { addBeachCliffs } from './cliffs.js?v=1791039533400';
import { addBeachLife } from './critters.js?v=1791041466326';
import { buildReefs } from './reefs.js?v=1791039533418';
import { buildBoat, updateBoat, BOAT_SPOT } from './boat.js?v=1791038847704';
import { createGulls } from './seagulls.js?v=1791039533421';
import {
  BEACH_START, BEACH_SHELL, BEACH_SAND_Y, BEACH_SEA_Y, BEACH_SHORE_Z,
  BEACH_RIM_Z, BEACH_TRENCH_Z, BEACH_TRENCH_Y, BEACH_CLIFF_Z, BEACH_HALF_W,
  BEACH_EDGE_X, BEACH_BASIN_Y, BEACH_MAP_X0, BEACH_MAP_X1, BEACH_MAP_Z0,
  BEACH_MAP_Z1, CLIFF_REACH, BEACH_PALMS, BEACH_ROCKS, BEACH_CAMPFIRE,
  beachGroundOffsetAt, beachSandOffsetAt, beachColliders, clamp01,
} from './layout.js?v=1791038381904';

// Re-exported so main.js keeps one import for the beach, exactly as before.
export {
  beachGroundOffsetAt, BEACH_START, BEACH_SHORE_Z,
  BEACH_HALF_W, BEACH_CLIFF_Z, BEACH_RIM_Z, BEACH_TRENCH_Z, BEACH_BASIN_Y,
  BEACH_MAP_X0, BEACH_MAP_X1, BEACH_MAP_Z0, BEACH_MAP_Z1, BEACH_CAMPFIRE,
};
export { BEACH_SHELL } from './layout.js?v=1791038381904';

// The object browser builds the REST of the beach from these same builders, so
// a preview is the real geometry rather than a miniature. They are geometry
// only (position is baked in at build time, no scene registration), which is
// what makes that safe.
export { makePalm, makeRock, makeBeachShell, makeCampfire };

// ===== Beach World =====
//
// A cove, not a map. Sheer cliffs wall it in on three sides and the sea floor
// falls away to a drop-off on the fourth, so the car is contained without a
// single wrap-around: there is simply nowhere else to be. You arrive on the sand
// BETWEEN the cliffs and the water, facing the open sea, and the only way home
// is the giant scallop bedded in the sand east of you.
//
// The sand mesh is built from the SAME height function main.js drives the car
// with, and the shell's hole is cut out of it rather than faked, so the pit is
// the lower valve you can actually see and drive down into.

const SAND_MIN_X = BEACH_MAP_X0;
const SAND_MAX_X = BEACH_MAP_X1;
const SAND_MIN_Z = BEACH_TRENCH_Z - 6;
const SAND_MAX_Z = BEACH_CLIFF_Z + 14;
const SAND_STEP = 1;
// How far the sand is sunk below the shell's own surface inside the shell's
// outline. The valve is about this thick, so the shell reads as bedded into the
// beach rather than laid on top of it, and the seam is hidden underneath the
// rim instead of z-fighting with it.
const VALVE_SINK = 0.16;
// Two radii into the shell's fan. The inner one is how deep the sand grid is
// dug out; the outer one is the shell's own silhouette, where the valve
// disappears into the beach.
const HOLE_T = BEACH_SHELL.surfaceHole * 0.34;
const RIM_T = BEACH_SHELL.surfaceHole * 0.985;

const clampLerp = (a, b, t) => a + (b - a) * clamp01(t);

// Sand colour by height: dry and pale up top, dark and wet at the tide line,
// then silty and green in the deep where the light does not reach.
function sandColour(y, out) {
  if (y >= BEACH_SEA_Y) {
    const k = clampLerp(0, 1, (y - BEACH_SEA_Y) / 1.4);
    return out.setRGB(
      0.663 + (0.890 - 0.663) * k,
      0.569 + (0.804 - 0.569) * k,
      0.416 + (0.604 - 0.416) * k,
    );
  }
  const k = clampLerp(0, 1, (BEACH_SEA_Y - y) / 5);
  const deep = clampLerp(0, 1, (BEACH_SEA_Y - y) / 12);
  return out.setRGB(
    0.663 - 0.110 * k - 0.070 * deep,
    0.569 - 0.130 * k - 0.040 * deep,
    0.416 - 0.090 * k - 0.040 * deep,
  );
}

// ===== Palm =====
// Same leaning, segmented trunk as before, but now seated on whatever the sand
// under it is doing instead of floating at y = 0.
function makePalm(x, z, scale, lean) {
  const g = new THREE.Group();
  const segs = 5;
  const trunkH = 7.4 * scale;
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 });
  let px = 0;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const r0 = (0.3 - 0.13 * t0) * scale;
    const r1 = (0.3 - 0.13 * t1) * scale;
    const h = trunkH / segs;
    const nx = lean * trunkH * (t1 * t1 - t0 * t0) * 0.12;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h * 1.06, 7), barkMat);
    m.position.set((px + nx) / 2, trunkH * (t0 + t1) / 2, 0);
    m.rotation.z = Math.atan2(nx - px, h) * -1;
    m.castShadow = true;
    g.add(m);
    px = nx;
  }
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x4e9b46, roughness: 0.8, side: THREE.DoubleSide,
  });
  const crown = new THREE.Group();
  crown.position.set(px, trunkH, 0);
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + 0.3;
    const len = (3.1 + (i % 3) * 0.5) * scale;
    const geo = new THREE.PlaneGeometry(1.05 * scale, len, 1, 7);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const py = pos.getY(v);
      const u = py / len + 0.5;
      pos.setX(v, pos.getX(v) * (1 - u * 0.85));
      pos.setZ(v, -u * u * 2.1 * scale);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, frondMat);
    m.position.y = len * 0.5;
    const arm = new THREE.Group();
    arm.add(m);
    arm.rotation.y = a;
    arm.rotation.x = -0.55 + (i % 2) * 0.18;
    arm.castShadow = true;
    crown.add(arm);
  }
  g.add(crown);
  g.position.set(x, beachGroundOffsetAt(x, z), z);
  g.rotation.y = x * 0.7;
  return { group: g, crown };
}

function makeRock(x, z, r, seed) {
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(r, 0),
    new THREE.MeshStandardMaterial({ color: 0x8e8478, roughness: 1, flatShading: true }),
  );
  m.position.set(x, beachGroundOffsetAt(x, z) + r * 0.34, z);
  m.scale.set(1 + (seed % 3) * 0.12, 0.62 + (seed % 2) * 0.16, 1 - (seed % 3) * 0.1);
  m.rotation.set(seed * 0.7, seed * 1.3, seed * 0.4);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A washed-up valve, half buried in the sand. Decoration only - these are not
// the way home, and they are far too small to drive into.
function makeBeachShell(x, z, scale, tilt) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({
    color: 0xf2e2cd, roughness: 0.55, side: THREE.DoubleSide,
  });
  const lower = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), m);
  lower.scale.set(1.7, 0.55, 1.25);
  lower.rotation.x = Math.PI;
  const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), m);
  upper.scale.set(1.7, 0.8, 1.25);
  upper.position.set(0, 0.05, -0.95);
  upper.rotation.x = -0.7;
  g.add(lower, upper);
  for (const mm of [lower, upper]) { mm.castShadow = true; mm.receiveShadow = true; }
  g.scale.setScalar(scale);
  g.position.set(x, beachGroundOffsetAt(x, z) + 0.1 * scale, z);
  g.rotation.y = tilt;
  return g;
}

// ===== The sand =====
//
// A grid walked at the same numbers the car rides. The quads inside the shell's
// bite are dropped, and `pitCollar` fills between that rectangle and the shell's
// true fan outline - which is why the hole in the ground is the right shape
// rather than a staircase.
// Is a world XZ inside the shell's fan at parameter t? This mirrors the site's
// own bowlYAt test, in the same squashed local frame: the fan's width lies along
// world -Z and its depth along world +X.
function inFanAt(x, z, t) {
  const site = BEACH_SHELL;
  const sx = site.z - z;
  const sz = (x - site.x) / site.squash;
  const r = Math.hypot(sx, sz);
  const a = Math.atan2(sx, sz);
  if (r > 0.02 && (a < -site.span || a > site.span)) return false;
  return r < site.size * shellRadius(t, a, site.ribs, site.span, site.ribAmp);
}

// The sand's height at a world XZ, including the sink inside the shell so the
// rim of the valve ends up proud of the beach.
function sandY(x, z) {
  const y = beachGroundOffsetAt(x, z);
  return y - (inFanAt(x, z, RIM_T) ? VALVE_SINK : 0);
}

function buildSand(base) {
  const nx = Math.round((SAND_MAX_X - SAND_MIN_X) / SAND_STEP);
  const nz = Math.round((SAND_MAX_Z - SAND_MIN_Z) / SAND_STEP);
  const geo = new THREE.PlaneGeometry(
    SAND_MAX_X - SAND_MIN_X, SAND_MAX_Z - SAND_MIN_Z, nx, nz,
  );
  geo.rotateX(-Math.PI / 2);
  geo.translate((SAND_MIN_X + SAND_MAX_X) / 2, 0, (SAND_MIN_Z + SAND_MAX_Z) / 2);

  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = sandY(x, z);
    pos.setY(i, y);
    sandColour(y - VALVE_SINK * 0.5, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  // Drop the quads that fall inside the pit. The quads left on its edge are
  // ragged, so the collar below is drawn out past them to the shell's real
  // outline - that is what keeps the hole's border off the ground.
  const idx = geo.index.array;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const cx = (pos.getX(idx[t]) + pos.getX(idx[t + 1]) + pos.getX(idx[t + 2])) / 3;
    const cz = (pos.getZ(idx[t]) + pos.getZ(idx[t + 1]) + pos.getZ(idx[t + 2])) / 3;
    if (inFanAt(cx, cz, HOLE_T)) continue;
    keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  geo.setIndex(keep);

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
  }));
  mesh.position.y = base;
  mesh.receiveShadow = true;
  return mesh;
}

// The collar: the ring of sand between the pit the grid dug out and the shell's
// own outline. Both of its edges are walked by the same angle from the umbo, and
// the fan is a circular sector about that point, so one parameter runs around
// both of them and the strip between the two is exact - no staircase, no seam.
function pitCollar(base) {
  const site = BEACH_SHELL;
  const N = 72;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const pt = (a, t) => {
    const r = site.size * shellRadius(t, a, site.ribs, site.span, site.ribAmp);
    const x = site.x + r * Math.cos(a) * site.squash;
    const z = site.z - r * Math.sin(a);
    return [x, beachGroundOffsetAt(x, z) - VALVE_SINK, z];
  };
  const quad = (a, b, cc, d) => {
    for (const p of [a, b, cc, a, cc, d]) {
      pos.push(p[0], p[1], p[2]);
      sandColour(p[1] - base - VALVE_SINK * 0.5, c);
      col.push(c.r, c.g, c.b);
    }
  };
  for (let i = 0; i < N; i++) {
    const a0 = -site.span + (i / N) * 2 * site.span;
    const a1 = -site.span + ((i + 1) / N) * 2 * site.span;
    quad(pt(a0, HOLE_T), pt(a1, HOLE_T), pt(a1, RIM_T), pt(a0, RIM_T));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1,
  }));
  mesh.position.y = base;
  mesh.receiveShadow = true;
  return mesh;
}

// ===== Foam =====
// A strip of white along a line of XZ, with its alpha broken up so it reads as
// foam rather than as a painted stripe. Used for the waterline and for the
// water breaking against the cliff feet.
function foamStrip(points, width, base, seed) {
  const n = points.length;
  const pos = [];
  const col = [];
  const a = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    let nx = -(z1 - z0);
    let nz = x1 - x0;
    const len = Math.hypot(nx, nz) || 1;
    nx = (nx / len) * width * 0.5;
    nz = (nz / len) * width * 0.5;
    const wob = 0.55 + 0.45 * Math.sin(i * 1.7 + seed) * Math.sin(i * 0.6 + seed * 2);
    const quadPos = [
      [x0 - nx, BEACH_SEA_Y + 0.08, z0 - nz],
      [x1 - nx, BEACH_SEA_Y + 0.08, z1 - nz],
      [x1 + nx, BEACH_SEA_Y + 0.08, z1 + nz],
      [x0 + nx, BEACH_SEA_Y + 0.08, z0 + nz],
    ];
    const alpha = [0, 0, wob, wob];
    for (const t of [0, 1, 2, 0, 2, 3]) {
      pos.push(...quadPos[t]);
      col.push(1, 1, 1);
      a.push(alpha[t] * 0.8);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const alphaAttr = new THREE.Float32BufferAttribute(a, 1);
  geo.setAttribute('foam', alphaAttr);
  const mat2 = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
  });
  mat2.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float foam;\nvarying float vFoam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoam = foam;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFoam;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vFoam;\n#include <opaque_fragment>');
  };
  const mesh = new THREE.Mesh(geo, mat2);
  mesh.position.y = base;
  mesh.renderOrder = 3;
  return mesh;
}

// ===== The campfire =====
//
// A ring of wet stones, a teepee of driftwood, a bed of coals and a real flame
// with a real light. It is built as its own group placed on the sand at the
// layout's own (x, z), so `hearth` in layout.js and this mesh can never drift
// apart: both read BEACH_CAMPFIRE.
//
// The flicker is the same deterministic sum-of-three-sines the house fireplace
// uses, so it looks identical run to run and a test can drive it.
function makeCampfire(base) {
  const g = new THREE.Group();
  const H = BEACH_CAMPFIRE;
  g.position.set(H.x, base + beachGroundOffsetAt(H.x, H.z), H.z);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8b84, roughness: 0.95, flatShading: true });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 });
  const charMat = new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 1 });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff8a1e, emissive: 0xff7a10, emissiveIntensity: 2.4,
    transparent: true, opacity: 0.9, depthWrite: false,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8, emissive: 0xffd05a, emissiveIntensity: 3.0,
    transparent: true, opacity: 0.95, depthWrite: false,
  });
  const marshMat = new THREE.MeshStandardMaterial({ color: 0xf6ead2, roughness: 0.7 });

  // The scorched patch of sand under the whole thing, so the ring reads as burnt
  // into the beach rather than dropped on top of it.
  const scorch = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 24),
    new THREE.MeshStandardMaterial({ color: 0x3b2f26, roughness: 1 })
  );
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.03;
  scorch.receiveShadow = true;
  g.add(scorch);

  // The ring of stones. Twelve of them, sized off a fixed table so the ring is
  // the same ring every run rather than a random one.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 2.55 + ((i % 3) - 1) * 0.16;
    const s = 0.52 + ((i * 5) % 4) * 0.09;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneMat.clone());
    stone.position.set(Math.cos(a) * r, s * 0.62, Math.sin(a) * r);
    stone.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    stone.scale.y = 0.8;
    stone.castShadow = true;
    stone.receiveShadow = true;
    g.add(stone);
  }

  // Driftwood teepee: three thick sticks leaning in over the coals.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 3.1, 8), woodMat.clone());
    log.position.set(Math.cos(a) * 1.0, 1.25, Math.sin(a) * 1.0);
    log.rotation.set(Math.sin(a) * 0.72, 0, -Math.cos(a) * 0.72);
    log.castShadow = true;
    g.add(log);
  }
  // Two more lying across the base, half burnt at the ends.
  for (let i = 0; i < 2; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.9, 8), charMat.clone());
    log.position.set(0, 0.34 + i * 0.34, 0.2 - i * 0.4);
    log.rotation.set(Math.PI / 2, 0.4 + i * 0.9, 0);
    log.castShadow = true;
    g.add(log);
  }

  // The bed of coals, and the two stones to sit on beside it.
  const coals = [];
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4;
    const r = 0.35 + ((i * 7) % 5) * 0.22;
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + ((i * 3) % 3) * 0.07, 0), charMat.clone());
    c.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    c.castShadow = true;
    g.add(c);
    coals.push(c);
  }
  for (const [sx, sz] of H.seats) {
    const seat = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 0), stoneMat.clone());
    seat.position.set(sx - H.x, 0.42, sz - H.z);
    seat.scale.set(1.3, 0.55, 1.05);
    seat.castShadow = true;
    seat.receiveShadow = true;
    g.add(seat);
  }
  // Two sticks in off the teepee with a marshmallow on the end of each.
  for (let i = 0; i < 2; i++) {
    const a = 2.1 + i * 2.0;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 6), woodMat.clone());
    stick.position.set(Math.cos(a) * 1.5, 0.95, Math.sin(a) * 1.5);
    stick.rotation.set(Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95);
    g.add(stick);
    const marsh = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.24, 4, 8), marshMat.clone());
    marsh.position.set(Math.cos(a) * 2.35, 0.72, Math.sin(a) * 2.35);
    marsh.castShadow = true;
    g.add(marsh);
  }

  // The flame: a ring of tall tongues with a shorter, brighter core inside them,
  // matching the house fire so the two read as the same fire.
  const flames = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tall = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.5, 8), flameMat.clone());
    tall.position.set(Math.cos(a) * 0.5, 1.35, Math.sin(a) * 0.5);
    g.add(tall);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.5, 8), coreMat.clone());
    core.position.set(Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3);
    g.add(core);
    flames.push({ tall, core, a, h: 2.5 });
  }

  // The light of it, thrown out across the sand and flickering.
  const fireLight = new THREE.PointLight(0xff8f34, 22, 34, 2);
  fireLight.position.set(0, 2.1, 0);
  g.add(fireLight);

  // Embers: a few tiny warm specks drifting up out of the coals. Cheap, and they
  // sell "this fire is real" better than another light does.
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xffb14a, transparent: true, opacity: 0.9 });
  const embers = [];
  for (let i = 0; i < 14; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), emberMat.clone());
    g.add(e);
    embers.push({ mesh: e, t: i * 0.37, life: 2.4 + (i % 5) * 0.4, rise: 1.5 + (i % 4) * 0.5, a: i * 1.9, r: 0.3 + (i % 3) * 0.22 });
  }

  return {
    group: g,
    // The ash trigger, read by main.js exactly like the house's FIREPLACE.hearth.
    hearth: H.hearth,
    update(elapsed) {
      const f = Math.sin(elapsed * 9.5) * 0.5 + Math.sin(elapsed * 15.7) * 0.3 + Math.sin(elapsed * 27.1) * 0.2;
      fireLight.intensity = 19 + f * 8;
      for (const fl of flames) {
        const p = Math.sin(elapsed * (6.4 + fl.a * 2.1)) * 0.5 + 0.5;
        const s = 0.76 + p * 0.44 + f * 0.07;
        fl.tall.scale.set(1 + p * 0.13, s, 1 + p * 0.13);
        fl.tall.position.y = 0.22 + (fl.h * s) / 2;
        fl.core.scale.set(1 + p * 0.18, 0.78 + p * 0.44, 1 + p * 0.18);
        fl.core.position.y = 0.14 + (1.5 * (0.78 + p * 0.44)) / 2;
      }
      for (const e of embers) {
        e.t += 1 / 60;
        if (e.t > e.life) { e.t = 0; e.mesh.visible = true; }
        const k = e.t / e.life;
        e.mesh.position.set(Math.cos(e.a + k * 2.2) * (e.r + k * 0.5), 0.5 + k * e.rise * 2.4, Math.sin(e.a + k * 2.2) * (e.r + k * 0.5));
        e.mesh.material.opacity = 0.9 * (1 - k);
        e.mesh.visible = k < 0.99;
      }
    },
  };
}

export function createBeachWorld(scene, opts = {}) {
  const base = opts.groundHeight ?? 0.15;
  const group = new THREE.Group();
  if (scene) scene.add(group);

  // ===== Sand =====
  group.add(buildSand(base));
  group.add(pitCollar(base));

  // ===== Cliffs =====
  addBeachCliffs(group, base);

  // ===== The one way home =====
  const shell = makeClamShell(group, BEACH_SHELL);
  // The site above is written in offsets, so the shell arrives sitting on y = 0;
  // the beach's datum is `base` up. Lift the mesh onto it, or the dish ends up
  // one datum too low and the sand of the pit is what the car sees instead.
  shell.group.position.y += base;

  // ===== Sea =====
  // Translucent on purpose: the whole point of the basin is that you can see
  // the cliffs carrying on underwater, the fish, and the mermaid, and none of
  // that is visible through an opaque surface. depthWrite is off so the water
  // never hides the opaque things it is drawn in front of.
  // Sized and centred to cover the whole map - the sea runs out past the
  // cliffs' feet and all the way to the seaward edge, so there is never a
  // visible edge to the water itself, only the drop-off and then the dark.
  const SEA_SPAN_X = (BEACH_MAP_X1 - BEACH_MAP_X0) + 240;
  const SEA_SPAN_Z = (BEACH_MAP_Z1 - BEACH_MAP_Z0) + 240;
  const seaGeo = new THREE.PlaneGeometry(SEA_SPAN_X, SEA_SPAN_Z, 80, 80);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({
    color: 0x2b86b8, roughness: 0.16, metalness: 0.3,
    transparent: true, opacity: 0.58, depthWrite: false,
  }));
  sea.position.set(0, base + BEACH_SEA_Y, (BEACH_MAP_Z0 + BEACH_MAP_Z1) / 2);
  sea.renderOrder = 2;
  group.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);

  // The floor of the trench, so the drop-off ends in something dark rather than
  // in nothing at all.
  const abyss = new THREE.Mesh(
    new THREE.PlaneGeometry(SEA_SPAN_X, SEA_SPAN_Z),
    new THREE.MeshStandardMaterial({ color: 0x16303a, roughness: 1 }),
  );
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.set(0, base + BEACH_TRENCH_Y - 4, (BEACH_MAP_Z0 + BEACH_MAP_Z1) / 2);
  group.add(abyss);

  // ===== Foam =====
  // Twelve breaker bands sliding shoreward and wrapping back out to sea. They
  // are staggered in width, speed and opacity so the surf reads as a set of
  // waves rather than as one sheet being dragged along.
  const foam = [];
  // Bands run out past the drop-off as well, so the surf carries on over the
  // lip instead of stopping dead at it.
  const FOAM_SPAN = BEACH_SHORE_Z - BEACH_MAP_Z0 + 30;
  for (let i = 0; i < 12; i++) {
    const k = i / 11;
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_SPAN_X * 0.8, 1.6 + k * 5.5),
      new THREE.MeshBasicMaterial({
        color: 0xfdfbf4, transparent: true, opacity: 0.4 - k * 0.2,
        depthWrite: false, fog: false,
      }),
    );
    band.rotation.x = -Math.PI / 2;
    band.position.set(0, base + BEACH_SEA_Y + 0.06 + i * 0.004, 0);
    band.renderOrder = 3;
    group.add(band);
    foam.push({ mesh: band, z: BEACH_SHORE_Z - 2 - i * 6.4, speed: 2.1 + k * 2.6, bob: i * 1.7 });
  }

  // Foam where the water actually meets the sand: found by bisecting the sand
  // profile for the crossing, so the line follows the real shoreline (which
  // curves with the banks either side) instead of sitting at a guessed Z.
  const shoreLine = [];
  for (let x = -BEACH_HALF_W + 2; x <= BEACH_HALF_W - 2; x += 1.5) {
    let lo = BEACH_SHORE_Z + 3;
    let hi = BEACH_SHORE_Z - 14;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (beachSandOffsetAt(x, mid) > BEACH_SEA_Y) lo = mid; else hi = mid;
    }
    shoreLine.push([x, (lo + hi) / 2]);
  }
  group.add(foamStrip(shoreLine, 3.4, base, 1.7));

  // ...and foam breaking against the foot of the cliffs, just inside wherever
  // the rock actually reaches.
  const cliffInset = CLIFF_REACH.out + 1.2;
  const footLine = (fixed, from, to, along) => {
    const pts = [];
    const n = Math.round(Math.abs(to - from) / 2);
    for (let i = 0; i <= n; i++) {
      const v = from + ((to - from) * i) / n;
      pts.push(along === 'x' ? [v, fixed] : [fixed, v]);
    }
    return pts;
  };
  group.add(foamStrip(footLine(BEACH_CLIFF_Z - cliffInset, -BEACH_HALF_W + 4, BEACH_HALF_W - 4, 'x'), 3.0, base, 4.1));
  group.add(foamStrip(footLine(-(BEACH_HALF_W - cliffInset), BEACH_SHORE_Z - 12, BEACH_CLIFF_Z - 6, 'z'), 3.0, base, 5.9));
  group.add(foamStrip(footLine(BEACH_HALF_W - cliffInset, BEACH_SHORE_Z - 12, BEACH_CLIFF_Z - 6, 'z'), 3.0, base, 7.3));

  // ===== Sky =====
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(20, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff4c8, fog: false }),
  );
  sun.position.set(-90, 62, -230);
  sun.lookAt(0, 20, 0);
  group.add(sun);

  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    const n = 3 + (i % 3);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(9 + (k % 3) * 3, 1), cloudMat);
      puff.position.set(k * 11 - n * 5, (k % 2) * 3, (k % 3) * 4 - 4);
      puff.scale.y = 0.5;
      c.add(puff);
    }
    c.position.set(-190 + i * 48, 70 + (i % 3) * 12, -60 - (i % 4) * 55);
    group.add(c);
    clouds.push(c);
  }

  // Two distant headlands out past the drop-off, so the sea has a far edge
  // instead of running into fog.
  const isleMat = new THREE.MeshStandardMaterial({ color: 0x6d8f7a, roughness: 1, flatShading: true });
  [[-140, -210, 40, 14], [120, -250, 56, 20]].forEach(([x, z, r, h]) => {
    const isle = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), isleMat);
    isle.position.set(x, base + h / 2 - 2, z);
    group.add(isle);
  });

  // ===== Things you can hit =====
  const palms = [];
  BEACH_PALMS.forEach(([x, z, s], i) => {
    const p = makePalm(x, z, s, (i % 2 ? 1 : -1) * (0.5 + i * 0.12));
    group.add(p.group);
    palms.push(p.crown);
  });
  BEACH_ROCKS.forEach(([x, z, r], i) => group.add(makeRock(x, z, r, i + 1)));
  // The coral heads in the basin. They are built at the sand's own height and
  // the mesh carries the level's base, exactly as the palms above do.
  const reefs = buildReefs();
  reefs.position.y += base;
  group.add(reefs);
  // Washed-up shells, scattered over the shelf.
  [[-14, 30, 1.4, 0.7], [6, 33, 1.0, -2.1], [-30, 28, 0.7, 1.6], [16, 20, 0.6, 0.3]]
    .forEach(([x, z, s, t]) => group.add(makeBeachShell(x, z, s, t)));

  // The campfire out on the open sand. `fireplace` is the beach's answer to the
  // house's: same shape of object, and main.js runs it through the same ash rule.
  const campfire = makeCampfire(base);
  group.add(campfire.group);

  // Rocks are surfaces a flat car can sit on; palms are bare obstacles.
  const colliders = beachColliders();
  for (const [x, z, s] of BEACH_PALMS) {
    colliders.push({ x, z, halfW: 0.55 * s, halfD: 0.55 * s, noRoof: true });
  }
  for (const [x, z, r] of BEACH_ROCKS) {
    colliders.push({
      x, z, halfW: r * 0.9, halfD: r * 0.9,
      h: beachGroundOffsetAt(x, z) + r * 0.34 + r * 0.55,
    });
  }

  // ===== Wildlife =====
  const life = addBeachLife(group, base);
  // The crabs go into the collision list as live discs, updated in place as they
  // skitter about - so a crab walking into your path actually stops the car,
  // and you can herd them by driving at them. `noRoof` because they are flat on
  // the sand: a collider with a roof height would also be a thing you could
  // drive up onto.
  for (const c of life.crabColliders) colliders.push(c);

  // ===== The boat =====
  // Scenery only. It floats out past the drop-off, so the rim collider puts it
  // permanently out of reach, and it carries no collider of its own - there is
  // nothing there to drive into.
  const boat = buildBoat();
  boat.position.set(BOAT_SPOT.x, base + BEACH_SEA_Y, BOAT_SPOT.z);
  // The base yaw is kept on userData as well as on the transform, because
  // updateBoat() swings the hull around that yaw with its own slow drift and
  // would otherwise reset her to heading north on the first frame.
  boat.userData.yaw = BOAT_SPOT.yaw;
  boat.rotation.y = BOAT_SPOT.yaw;
  boat.userData.baseY = base + BEACH_SEA_Y;
  group.add(boat);

  // ===== The gulls =====
  // The flock, and the one that comes for your car if you leave it too long.
  // `gulls.carCarry` is the car-holding pose, or null - see the note in
  // seagulls.js about why the main loop and not this file moves the car.
  const gulls = createGulls(base);
  group.add(gulls.group);

  let t = 0;
  return {
    group,
    colliders,
    shell,
    // The fire. main.js reads `hearth` for the ash trigger and calls `update`
    // every frame the beach is live — exactly as it does for the house fireplace.
    fireplace: campfire,
    // The crab discs that went into `colliders` above, published so main.js can
    // take them back out again when the player IS a crab (see activeColliders).
    crabColliders: life.crabColliders,
    // Live: non-null only while a gull has the car in her talons. The main loop
    // polls this after update() and, when it is set, drives the car from the
    // pose instead of from the physics.
    get carCarry() { return gulls.carCarry; },
    update(delta, carPos, carR, blocked) {
      t += delta;
      const shut = shell.update(delta);
      // Two crossing swells ride the water's vertices.
      const p = seaGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = seaBase[i * 3];
        const z = seaBase[i * 3 + 1];
        p.setY(i, Math.sin(x * 0.05 + t * 0.9) * 0.22 + Math.sin(z * 0.037 - t * 0.62) * 0.3);
      }
      p.needsUpdate = true;
      for (const f of foam) {
        f.z += delta * f.speed;
        if (f.z > BEACH_SHORE_Z + 2) f.z -= FOAM_SPAN;
        f.mesh.position.z = f.z;
        f.mesh.position.y = base + BEACH_SEA_Y + 0.06 + Math.sin(t * 1.4 + f.bob) * 0.06;
      }
      for (const c of palms) c.rotation.z = Math.sin(t * 0.7 + c.position.x) * 0.035;
      for (const c of clouds) {
        c.position.x += delta * 1.4;
        if (c.position.x > 320) c.position.x = -320;
      }
      life.update(delta, carPos ? carPos.x : 0, carPos ? carPos.z : 0, carR);
      campfire.update(t);
      // `blocked` is true while the shell is closing, or during a fade: she does
      // not start a ten-second count towards robbing a car that is already on
      // its way home.
      gulls.update(delta, carPos, !!blocked);
      updateBoat(boat, t);
      return shut;
    },
  };
}

export { BEACH_SAND_Y };
