// ============================================================================
// The children's playroom toys - the real models, shared by the level and the
// object explorer.
// ============================================================================
//
// `levels/house/index.js` places these in the walk-in playroom; `objects/
// catalog.js` shows the very same builders as explorer tiles, so the explorer can
// never drift from what is actually in the world (the whole point of this file).
//
// The big pieces are the real things, not simplified stand-ins: the toy train is
// the spaceport locomotive (`train.js`), and the rocket is the actual lander the
// spaceport flies (`spaceport.js`), shrunk and hung from the ceiling.
//
// Everything is built in WORLD units (the house's own scale: the car is ~4.5
// long) and oriented nose/forward toward +Z unless noted, matching `train.js`.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { makeLocomotive, buildFreightCars } from '../../train.js';
import { makeShip } from '../../spaceport.js';
import { hotwheelsNodes, buildTrack, poseOnTrack, TRACK_HALF_WIDTH } from './hotwheels.mjs';
import { makeLizardModel } from '../../lizard.js?v=1800000000000';
import {
  JACK_BOX, JACK_FLOOR, createJack, jackTouch, jackStep, jackPose, springLength,
} from './jack.mjs';

// ---- Materials & primitives ------------------------------------------------
function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.7,
    metalness: o.metalness ?? 0,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.opacity !== undefined,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
}

function box(parent, w, h, d, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.material || mat(color, o));
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent, rt, rb, h, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 16), o.material || mat(color, o));
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cone(parent, r, h, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, o.seg || 12), o.material || mat(color, o));
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = true;
  parent.add(m);
  return m;
}

function ball(parent, r, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, o.seg || 16, o.seg2 || 12), o.material || mat(color, o));
  m.position.set(x, y, z);
  if (o.sx || o.sy || o.sz) m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// The toy colour box. Bold and saturated, because a toy box is.
const C = {
  red: 0xd8232a,
  redDark: 0x9c1c22,
  cream: 0xf3e9d4,
  wood: 0xc8a878,
  woodDark: 0x8a6c48,
  woodPale: 0xe4d6bd,
  steel: 0xb8bec9,
  steelDark: 0x5a616d,
  gold: 0xf0b429,
  orange: 0xff7a1a,
};

const RAINBOW = [0xe53935, 0xfb8c00, 0xfdd835, 0x43a047, 0x00acc1, 0x1e88e5, 0x8e24aa];
const BRIGHT = [0xff3b30, 0xffcc00, 0x34c759, 0x0a84ff, 0xff9500, 0xbf5af2, 0xff2d95, 0x30d5c8];

// ============================================================================
// The toy train - the real locomotive + the WHOLE town consist, on a big ring of
// track that hugs the playroom and rides a raised trestle viaduct over the Hot
// Wheels track. Returns { group, update(delta) }.
// ============================================================================
//
// The track is the same "standard" rail style the town train uses in train.js -
// two parallel steel rails with wooden sleepers under them - not a flat torus,
// so it reads as a real track rather than a doughnut. Because the playroom floor
// is already full of the Hot Wheels track, the play train runs on a TRESTLE
// VIADUCT above it: the rails sit on a run of cross-braced timber bents, high
// enough that the Hot Wheels cars (and the player's car) drive underneath.

export const PLAY_RAIL_HALF = 0.8;   // half the track gauge at unit scale (train.js's 0.8)

// A rounded-rectangle centreline: four straights and four quarter-round corners,
// as a closed list of {x, y, z} points.
function roundedRectPath(cx, cz, halfX, halfZ, r, y) {
  const pts = [];
  const push = (x, z) => pts.push({ x, y, z });
  const step = 0.7, arc = 0.09;
  const cxn = cx - halfX + r, cxp = cx + halfX - r;
  const czn = cz - halfZ + r, czp = cz + halfZ - r;
  // bottom straight (z = cz - halfZ), right -> left
  for (let x = cxp; x >= cxn; x -= step) push(x, cz - halfZ);
  // SW corner (centre cxn,czn): -90deg -> -180deg
  for (let a = -Math.PI / 2; a >= -Math.PI; a -= arc) push(cxn + r * Math.cos(a), czn + r * Math.sin(a));
  // left straight (x = cx - halfX), bottom -> top
  for (let z = czn; z <= czp; z += step) push(cx - halfX, z);
  // NW corner (centre cxn,czp): 180deg -> 90deg
  for (let a = Math.PI; a >= Math.PI / 2; a -= arc) push(cxn + r * Math.cos(a), czp + r * Math.sin(a));
  // top straight (z = cz + halfZ), left -> right
  for (let x = cxn; x <= cxp; x += step) push(x, cz + halfZ);
  // NE corner (centre cxp,czp): 90deg -> 0deg
  for (let a = Math.PI / 2; a >= 0; a -= arc) push(cxp + r * Math.cos(a), czp + r * Math.sin(a));
  // right straight (x = cx + halfX), top -> bottom
  for (let z = czp; z >= czn; z -= step) push(cx + halfX, z);
  // SE corner (centre cxp,czn): 0deg -> -90deg
  for (let a = 0; a > -Math.PI / 2; a -= arc) push(cxp + r * Math.cos(a), czn + r * Math.sin(a));
  // cumulative arc length
  const n = pts.length;
  const cum = new Array(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  // close the loop
  const total = cum[n - 1] + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].z - pts[n - 1].z);
  return { pts, cum, n, total };
}

// A closed path from an explicit list of {x, z, y} waypoints. Same shape as
// `roundedRectPath`, so the track builder and sampler do not care which they get.
// Used for the floor-level train route that wanders through several rooms, where
// a rectangle would be the wrong shape and the deck height VARIES (floor level
// for most of the run, lifted only where it bridges something).
function pathFromPoints(points) {
  const pts = points.map((p) => ({ x: p.x, y: p.y ?? 0.19, z: p.z }));
  const n = pts.length;
  const cum = new Array(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  const total = cum[n - 1] + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].z - pts[n - 1].z);
  return { pts, cum, n, total };
}

// Position + unit tangent at arc-length s along a closed point path.
function samplePath(path, s) {
  const { pts, cum, n, total } = path;
  s = ((s % total) + total) % total;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid + 1; else hi = mid;
  }
  const i = Math.max(0, lo - 1);
  const next = (i + 1) % n;
  const segLen = (cum[i + 1] !== undefined ? cum[i + 1] : total) - cum[i] || 1e-6;
  const t = Math.min(1, Math.max(0, (s - cum[i]) / segLen));
  const a = pts[i], b = pts[next];
  let tx = b.x - a.x, tz = b.z - a.z;
  const tl = Math.hypot(tx, tz) || 1e-6;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, tx: tx / tl, tz: tz / tl };
}

// Lay the rails, sleepers and trestle bents along a closed path. `gauge` is the
// full rail spacing, `scale` sizes every piece (rails, sleepers, posts).
function buildPathTrack(path, scale, opts) {
  const g = new THREE.Group();
  g.name = 'PlayTrainTrack';
  const railMat = mat(0x6a7078, { metalness: 0.6, roughness: 0.35 });
  const tieMat = mat(0x4a3a2c, { roughness: 0.9 });
  const bentMat = mat(0x8a6c48, { roughness: 0.85 });
  const half = PLAY_RAIL_HALF * scale;

  // Two rails. Each is a closed Catmull-Rom tube offset ±half from the centre.
  //
  // The curve is built from the OFFSET CENTRELINE, which gives the rails their
  // smooth horizontal shape through even the route's hairpin turns. Their HEIGHT,
  // though, is taken from the PATH itself (the deck the sleepers sit on) rather
  // than from the spline: a Catmull-Rom through a steep descent overshoots BELOW
  // the floor at the foot of the ramp, which left a long stretch of rail buried
  // under the boards right where the train comes down off the trestle. Sampling
  // the smooth curve for its X/Z and the path for its Y keeps the rails
  // continuous the whole way round, including through the descent.
  const RAIL_N = Math.max(240, path.n * 8);
  for (const off of [half, -half]) {
    const curvePts = [];
    for (let i = 0; i < path.n; i += 2) {
      const p = path.pts[i];
      // Offset perpendicular to the local tangent.
      const a = path.pts[(i - 2 + path.n) % path.n], b = path.pts[(i + 2) % path.n];
      let tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      curvePts.push(new THREE.Vector3(p.x - tz * off, p.y, p.z + tx * off));
    }
    const curve = new THREE.CatmullRomCurve3(curvePts, true, 'catmullrom', 0.5);
    // Sample the smooth curve, measure its own horizontal arc, and hand each
    // sample the deck's height at the matching point on the path.
    const dense = [];
    for (let i = 0; i < RAIL_N; i++) dense.push(curve.getPoint(i / RAIL_N));
    const cumLen = new Array(RAIL_N + 1);
    cumLen[0] = 0;
    for (let i = 1; i <= RAIL_N; i++) {
      const a = dense[i - 1], b = dense[i % RAIL_N];
      cumLen[i] = cumLen[i - 1] + Math.hypot(b.x - a.x, b.z - a.z);
    }
    const railLen = cumLen[RAIL_N] || 1;
    const railPts = dense.map((p, i) =>
      new THREE.Vector3(p.x, samplePath(path, (cumLen[i] / railLen) * path.total).y, p.z));
    const railCurve = new THREE.CatmullRomCurve3(railPts, true, 'catmullrom', 0.5);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, Math.max(200, RAIL_N), 0.09 * scale, 6, true), railMat);
    rail.castShadow = true;
    rail.receiveShadow = true;
    g.add(rail);
  }

  // Sleepers.
  const sleeperGeo = new THREE.BoxGeometry(2.4 * scale, 0.16 * scale, 0.22 * scale);
  for (let s = 0; s < path.total; s += 2.2 * scale) {
    const p = samplePath(path, s);
    const sleeper = new THREE.Mesh(sleeperGeo, tieMat);
    sleeper.position.set(p.x, p.y - 0.1 * scale, p.z);
    sleeper.rotation.y = Math.atan2(p.tx, p.tz);
    sleeper.receiveShadow = true;
    g.add(sleeper);
  }

  // Trestle bents: a post under every RAISED part of the deck, down to the floor.
  // The deck height VARIES — floor-level for most of the run, lifted only where
  // the track bridges over something — so each post is measured from ITS OWN
  // sample's height rather than one fixed deck level. Skipped where the post
  // would stand inside a piece of furniture the caller lists in `opts.skip`.
  if (opts.trestle) {
    const skip = opts.skip || [];
    for (let s = 0; s < path.total; s += 5.0 * scale) {
      const p = samplePath(path, s);
      if (p.y <= 0.6) continue;                 // deck is on the floor here
      if (skip.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1)) continue;
      const postH = p.y;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, postH, 0.34 * scale), bentMat);
      post.position.set(p.x, postH / 2, p.z);
      post.castShadow = true;
      g.add(post);
      // Top beam under the sleepers.
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scale, 0.4 * scale, 3.4 * scale), bentMat);
      beam.position.set(p.x, p.y - 0.45 * scale, p.z);
      beam.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI / 2;
      beam.castShadow = true;
      g.add(beam);
      // Two splayed foot braces.
      for (const dir of [-1, 1]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, Math.hypot(postH, 2), 0.22 * scale), bentMat);
        brace.position.set(p.x, postH * 0.45, p.z);
        brace.rotation.set(0, 0, dir * 0.5);
        brace.position.x += dir * 1.0 * scale;
        g.add(brace);
      }
    }
  }
  return g;
}

// Build the toy train: the real locomotive pulling the whole town consist. By
// default it rides a raised rounded-rectangle viaduct sized to the playroom.
export function makePlayTrain(opts = {}) {
  const scale = opts.scale ?? 0.5;
  const speed = opts.speed ?? 6.5;   // world units / second (matched to the town train)
  const group = new THREE.Group();
  group.name = 'PlayTrain';

  // The centreline. Either an explicit rounded rectangle (the playroom viaduct)
  // or a plain circle, if some caller asks for one.
  let path;
  if (opts.path) {
    path = opts.path;
  } else if (opts.points) {
    // An explicit wander route (see pathFromPoints): the floor-level train that
    // threads several rooms and only lifts where it bridges the Hot Wheels track.
    path = pathFromPoints(opts.points);
  } else {
    const radius = opts.radius ?? opts.halfX ?? 20;
    const y = opts.y ?? 0.19;
    const spec = (opts.shape === 'rect' || opts.halfZ !== undefined)
      ? opts
      : { cx: opts.cx ?? 0, cz: opts.cz ?? 0, halfX: radius, halfZ: radius, r: radius, y };
    path = roundedRectPath(
      spec.cx ?? 0, spec.cz ?? 0,
      spec.halfX ?? radius, spec.halfZ ?? radius, spec.r ?? Math.min(spec.halfX ?? radius, spec.halfZ ?? radius), y,
    );
  }

  group.add(buildPathTrack(path, scale, { trestle: opts.trestle !== false, skip: opts.skip }));

  // The whole town consist, in miniature.
  const units = [makeLocomotive(), ...buildFreightCars()];
  const spacing = 6.6 * scale;         // train.js SPACING, scaled to the toy
  const n = units.length;
  const gap = Math.min(spacing, path.total / n);
  const cars = units.map((mesh, i) => {
    mesh.scale.setScalar(scale);
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(mesh);
    return { mesh, offset: -i * gap, wheels: mesh.userData.wheels || [] };
  });

  let s0 = 0;   // arc position of the locomotive, world units
  // Per-car knock state, exactly like the town train in `train.js`: a car hit by
  // the car rocks about the hit axis and eases back upright, then settles. The
  // consist never leaves the rails, so the toy is solid — you bounce off it —
  // rather than the ghost the playroom used to have.
  const wob = cars.map(() => ({
    t: Infinity, axis: new THREE.Vector3(1, 0, 0), dir: new THREE.Vector3(1, 0, 0),
  }));
  const baseQ = new THREE.Quaternion();
  const wobQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const place = () => {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const s = s0 + c.offset;
      const p = samplePath(path, s);
      c.mesh.position.set(p.x, p.y, p.z);
      // Pitch the car up/down to follow the grade (the deck rises onto the
      // trestle over the Hot Wheels track), so the consist sits ON the rails
      // rather than level while the rails climb under it.
      const a = samplePath(path, s - 1), b = samplePath(path, s + 1);
      const grade = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
      euler.set(-grade, Math.atan2(p.tx, p.tz), 0);
      baseQ.setFromEuler(euler);
      const w = wob[i];
      if (w.t < 1e9) {
        // Rocking: lean about the hit axis and ease back, drifting a little.
        const decay = Math.exp(-3 * w.t);
        const tilt = Math.sin(w.t * 9) * 0.6 * decay;
        wobQ.setFromAxisAngle(w.axis, tilt);
        c.mesh.quaternion.copy(baseQ).premultiply(wobQ);
        c.mesh.position.addScaledVector(w.dir, 0.3 * decay);
      } else {
        c.mesh.quaternion.copy(baseQ);
      }
    }
  };
  place();

  // Per-car body radius used when shoving the car off the consist. Scaled with
  // the toy so the little train feels solid at its own size.
  const carR = opts.carRadius ?? 1.7 * scale;

  return {
    group,
    path,
    cars,
    // `ctx` (optional) carries the vehicles that can bump the train:
    //   threats: [{ p: Vector3, r: number }]  — player (and any second player)
    //   wrapDeltaX / wrapDeltaZ               — world wrap (identity in the house)
    update(delta, ctx) {
      s0 += speed * delta;
      if (s0 > path.total) s0 -= path.total;
      for (const w of wob) if (w.t < 1e9) w.t += delta;
      place();
      for (const c of cars) for (const w of c.wheels) w.rotation.y += (speed * delta) / 0.5;

      const threats = ctx && ctx.threats;
      if (!threats || threats.length === 0) return;
      const dX = (ctx.wrapDeltaX) || ((a, b) => b - a);
      const dZ = (ctx.wrapDeltaZ) || ((a, b) => b - a);
      for (const th of threats) {
        if (!th || !th.p) continue;
        for (let i = 0; i < cars.length; i++) {
          const mesh = cars[i].mesh;
          // Altitude gate: while the consist is up on the trestle (bridging the
          // Hot Wheels track) a player on the floor below is not shoved by it.
          if (Math.abs(th.p.y - mesh.position.y) > 6) continue;
          const dx = dX(mesh.position.x, th.p.x);
          const dz = dZ(mesh.position.z, th.p.z);
          const min = th.r + carR;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.001;
          const nx = dx / d, nz = dz / d;        // unit -> threat
          const w = wob[i];
          w.t = 0;
          w.dir.set(-nx, 0, -nz);                // the car is pushed away from the hit
          w.axis.crossVectors(new THREE.Vector3(0, 1, 0), w.dir);
          if (w.axis.lengthSq() < 1e-4) w.axis.set(1, 0, 0);
          w.axis.normalize();
          // Keep the vehicle out of the car body (bounce off, don't pass through).
          th.p.x += nx * (min - d);
          th.p.z += nz * (min - d);
        }
      }
    },
  };
}

// ============================================================================
// The rocking horse - one, big and bright red, standing on its own rockers.
// ============================================================================
// 2026-10-14: rebuilt. The old one had the rockers as two crosswise torus arcs
// lying flat on the floor IN FRONT of the legs, so it looked like it was sitting
// on a couple of hoops rather than rocking. A real rocking horse has TWO curved
// rails running FRONT-TO-BACK under the hooves (a "banana" that dips in the
// middle and lifts at the ends), and the four legs stand ON those rails. Rock it
// and it pitches: nose down / tail up, then nose up / tail down. The rails here
// are tubes along a parabola so the contact point really does move as it pivots.
const ROCK_L = 1.75;      // half-length of each rocker rail (front-back, local Z)
const ROCK_RISE = 0.85;   // how much the rail ends lift above the dip
const ROCK_DIP = 0.16;    // height of the rail at its lowest (the middle)

function rockerRailHeight(z, x = 0) {
  return ROCK_DIP + (z * z) / (ROCK_L * ROCK_L) * ROCK_RISE;
}

export function makeRedHorse(opts = {}) {
  const s = opts.scale ?? 1;
  const g = new THREE.Group();
  g.name = 'RedHorse';
  const RED = mat(C.red, { roughness: 0.5 });
  const RED_D = mat(C.redDark, { roughness: 0.5 });
  const GOLD = mat(C.gold, { roughness: 0.35, metalness: 0.4 });
  const HOOF = mat(0x2a2a2a, { roughness: 0.6 });
  const EYE = mat(0x101014, { roughness: 0.2 });
  const WOOD = mat(C.woodDark, { roughness: 0.7 });

  // ---- The two rocker rails, running front-to-back under the legs ----
  const railHalf = ROCK_L, segs = 14;
  for (const rx of [-0.78, 0.78]) {
    const curvePts = [];
    for (let i = 0; i <= segs; i++) {
      const z = -railHalf + (2 * railHalf) * (i / segs);
      curvePts.push(new THREE.Vector3(rx, rockerRailHeight(z), z));
    }
    const curve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0.5);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.14, 8, false), WOOD);
    rail.castShadow = rail.receiveShadow = true;
    g.add(rail);
    // A little wooden cross-bar between the rails at the lowest point.
  }
  const cross = cyl(g, 0.09, 0.09, 1.7, 0, rockerRailHeight(0), 0, 0, { material: WOOD });
  cross.rotation.z = Math.PI / 2;

  // ---- Four legs, standing ON the rails ----
  // Local Z of each leg pair, and the rail height there, so the hoof meets the
  // rail exactly (this is the attachment the old model was missing).
  for (const lz of [1.05, -1.05]) {
    const footY = rockerRailHeight(lz);
    const topY = 2.05;
    for (const lx of [-0.72, 0.72]) {
      const len = topY - footY;
      const leg = cyl(g, 0.19, 0.26, len, lx, footY + len / 2, lz, 0, { material: RED_D });
      leg.rotation.z = lx > 0 ? -0.06 : 0.06;
      // A dark hoof cap right where the leg meets the rail.
      cyl(g, 0.24, 0.26, 0.2, lx, footY + 0.1, lz, 0, { material: HOOF });
    }
  }

  // ---- Barrel body ----
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 2.4, 18), RED);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 2.55, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  ball(g, 0.74, 0, 2.55, 1.15, C.red, { material: RED });     // chest
  ball(g, 0.74, 0, 2.55, -1.15, C.red, { material: RED });    // rump
  // Saddle blanket + seat, and a girth strap so it reads as a ridden toy.
  box(g, 1.35, 0.16, 1.5, 0, 3.15, 0.1, 0, { material: mat(0x2f6fb0, { roughness: 0.6 }) });
  box(g, 1.0, 0.4, 1.1, 0, 3.35, 0.1, 0, { material: mat(C.redDark, { roughness: 0.5 }) });
  box(g, 0.1, 1.6, 0.7, 0, 2.55, 0.75, 0, { material: mat(0x2a2a2a, { roughness: 0.7 }) });

  // ---- Neck, head and face ----
  const neck = cyl(g, 0.44, 0.56, 1.5, 0, 3.7, 1.3, 0, { material: RED });
  neck.rotation.x = -0.5;
  // Mane: a run of gold tufts down the back of the neck.
  for (let i = 0; i < 6; i++) {
    ball(g, 0.32 - i * 0.02, 0, 4.55 - i * 0.3, 1.0 - i * 0.02, C.gold,
      { material: GOLD, sx: 0.65, sy: 1, sz: 0.55 });
  }
  const head = cyl(g, 0.5, 0.46, 1.15, 0, 4.75, 2.05, 0, { material: RED });
  head.rotation.x = Math.PI / 2 - 0.75;
  // Muzzle (rounded snout) + a small dark mouth line.
  ball(g, 0.4, 0, 4.95, 2.72, C.red, { material: RED, sx: 0.9, sy: 0.78, sz: 1.25 });
  box(g, 0.5, 0.06, 0.28, 0, 4.78, 3.05, 0, { material: mat(0x5a1414, { roughness: 0.7 }) });
  // Nostrils.
  for (const sx of [-1, 1]) ball(g, 0.07, sx * 0.14, 5.06, 2.98, 0x3a0f0f, { material: mat(0x3a0f0f, { roughness: 0.6 }) });
  // Ears (cones) angled outward-back.
  for (const sx of [-1, 1]) {
    const ear = cone(g, 0.17, 0.55, sx * 0.26, 5.5, 1.62, C.redDark, { material: RED_D });
    ear.rotation.z = sx * 0.3;
  }
  // Eyes with a white glint.
  for (const sx of [-1, 1]) {
    ball(g, 0.14, sx * 0.34, 5.12, 2.2, 0, { material: EYE });
    ball(g, 0.05, sx * 0.4, 5.18, 2.28, 0xffffff);
  }
  // Blaze down the face.
  box(g, 0.16, 0.02, 0.9, 0, 5.0, 2.4, 0, { material: mat(0xf4c9c9, { roughness: 0.6 }) });
  // A forelock tuft between the ears.
  ball(g, 0.24, 0, 5.35, 1.85, C.gold, { material: GOLD, sx: 0.7, sy: 1, sz: 0.5 });

  // ---- Tail, sweeping down and back from the rump ----
  const tail = cyl(g, 0.24, 0.1, 1.5, 0, 3.05, -1.65, 0, { material: RED_D });
  tail.rotation.x = 0.95;
  ball(g, 0.26, 0, 2.5, -2.35, C.gold, { material: GOLD, sx: 0.8, sy: 1.4, sz: 0.8 });

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(s);
  return g;
}

// ============================================================================
// The Lego box - one clear tub, brimming over with bricks.
// ============================================================================
// Returns { group, bricks }. The tub keeps its clear sides and stays put; every
// brick is listed in `bricks` so the level can register them as knockables and
// have the whole lot fly out when the car hits the box (like the city's trash
// cans spilling).
export function makeLegoBox(opts = {}) {
  const s = opts.scale ?? 1;
  const g = new THREE.Group();
  g.name = 'LegoBox';

  const W = 4.2, D = 3.2, H = 2.0, wall = 0.08;
  const clear = mat(0xbfe3f5, { opacity: 0.16, roughness: 0.1, metalness: 0 });
  clear.depthWrite = false;

  // The transparent tub: four walls + a base (no top, so the bricks show).
  box(g, W, H, wall, 0, H / 2, -D / 2, 0, { material: clear });
  box(g, W, H, wall, 0, H / 2, D / 2, 0, { material: clear });
  box(g, wall, H, D, -W / 2, H / 2, 0, 0, { material: clear });
  box(g, wall, H, D, W / 2, H / 2, 0, 0, { material: clear });
  box(g, W, wall, D, 0, wall / 2, 0, 0xdfe9f2, { roughness: 0.3 });

  // A big jumble of bricks, stacked past the rim so the box is overflowing.
  const bricks = [];
  const studR = 0.08;
  let seed = 20261014;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const count = 66;
  for (let i = 0; i < count; i++) {
    const bw = 0.34 + rnd() * 0.62;
    const bd = 0.34 + rnd() * 0.5;
    const bh = 0.22 + rnd() * 0.18;
    // Bias the pile upward as it fills, so the last bricks crown the heap. The
    // lowest brick sits clear of the tub's base slab (top at y=wall) so no brick
    // face is coplanar with it (coplanar faces z-fight).
    const fill = i / count;
    const y = wall + bh / 2 + 0.02 + fill * (H - wall - 0.1) + rnd() * 0.33;
    const x = (rnd() - 0.5) * (W - bw - 0.2);
    const z = (rnd() - 0.5) * (D - bd - 0.2);
    const col = BRIGHT[i % BRIGHT.length];
    const brick = box(g, bw, bh, bd, x, y, z, col, { roughness: 0.35 });
    brick.rotation.y = (rnd() - 0.5) * 0.7;
    bricks.push(brick);
    // The studs are CHILDREN of the brick, in its own local space, so when the
    // brick scatters as a knockable its nodules travel with it instead of being
    // left floating in the air where the brick used to be.
    const nx = Math.max(1, Math.round(bw / 0.34));
    const nz = Math.max(1, Math.round(bd / 0.34));
    for (let a = 0; a < nx; a++) {
      for (let b = 0; b < nz; b++) {
        // Half-sunk into the top so the stud's bottom face is not coplanar with
        // the brick top (another z-fight source).
        cyl(brick, studR, studR, 0.1,
          -bw / 2 + (a + 0.5) * (bw / nx), bh / 2 - 0.005, -bd / 2 + (b + 0.5) * (bd / nz),
          col, { seg: 10, roughness: 0.35 });
      }
    }
  }
  g.scale.setScalar(s);
  return { group: g, bricks };
}

// ============================================================================
// The hanging rocket - the spaceport lander itself, small, hung from the roof.
// ============================================================================
export function makeHangingRocket(opts = {}) {
  const s = opts.scale ?? 0.62;
  const hang = opts.hang ?? 0;   // string length above the ship
  const g = new THREE.Group();
  g.name = 'HangingRocket';

  const ship = makeShip();
  ship.g.scale.setScalar(s);
  // The lander is built nose +X; stand it upright (nose up) to hang like a rocket.
  ship.g.rotation.z = Math.PI / 2;
  ship.plume.visible = false;
  ship.cargo.visible = false;
  ship.g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(ship.g);

  if (hang > 0) {
    const str = cyl(g, 0.03, 0.03, hang, 0, (4 * s) / 2 + hang / 2, 0, 0x333333, { seg: 6 });
    str.castShadow = false;
  }
  return g;
}

// ============================================================================
// The xylophone - rainbow metal bars on a wooden frame. Driving over a bar makes
// a note; the level reads `bars` for the world positions and pitches.
// ============================================================================
export function makeXylophone(opts = {}) {
  const s = opts.scale ?? 1;
  const group = new THREE.Group();
  group.name = 'Xylophone';

  const L = 9 * s, W = 2.4 * s;
  box(group, L + 0.6 * s, 0.3 * s, W, 0, 0.15 * s, 0, C.woodDark, { roughness: 0.8 });
  for (const sx of [-1, 1]) box(group, 0.5 * s, 0.9 * s, W + 0.2 * s, sx * (L / 2 - 0.3 * s), 0.6 * s, 0, C.wood);
  // Two rails the bars sit on.
  for (const zz of [-W / 2 + 0.4 * s, W / 2 - 0.4 * s]) {
    box(group, L, 0.14 * s, 0.14 * s, 0, 0.34 * s, zz, C.wood, { roughness: 0.6 });
  }

  const bars = [];
  // A rising major scale, eight bars, bright and shiny.
  const freqs = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5];
  const n = freqs.length;
  const step = L / (n + 0.6);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + step * (i + 0.8);
    const len = (0.95 - i * 0.05) * W;          // longest (lowest) bar first
    const col = RAINBOW[i % RAINBOW.length];
    const bar = box(group, step * 0.82, 0.16 * s, len, x, 0.44 * s, 0, col, {
      material: mat(col, { metalness: 0.6, roughness: 0.25, emissive: col, emissiveIntensity: 0.12 }),
    });
    // Little mounting pegs so it reads as an instrument, not a plank.
    for (const zz of [-len / 2 + 0.1 * s, len / 2 - 0.1 * s]) {
      cyl(group, 0.05 * s, 0.05 * s, 0.2 * s, x, 0.34 * s, zz, C.steelDark, { seg: 8 });
    }
    bars.push({ mesh: bar, freq: freqs[i], x, z: 0, len, w: step * 0.82 });
  }
  group.scale.setScalar(1);
  return { group, bars };
}

// ============================================================================
// The block castle - a proper little castle built block by block, with gaps.
// ============================================================================
// Returns { group, pieces }. The green base is the "plot" and is NOT in
// `pieces`: it stays put and the car drives straight over it (a toy mat). Every
// block, tower, roof and the keep ARE pieces, so the level can register them as
// knockables - ram the castle and the whole thing comes apart and scatters.
export function makeBlockCastle(opts = {}) {
  const s = opts.scale ?? 1;
  const g = new THREE.Group();
  g.name = 'BlockCastle';
  const pieces = [];

  const blockMat = mat(C.woodPale, { roughness: 0.7 });
  const trimMat = mat(0xb08d5f, { roughness: 0.7 });
  const roofMat = mat(0x8a2b2b, { roughness: 0.6 });
  const bw = 1.0, bh = 0.42, bd = 0.5;   // one block

  // ---- The plot: a grid of base plate studs the castle stands on ----
  for (let i = -5; i <= 5; i++) {
    for (let j = -4; j <= 4; j++) {
      const m = box(g, 0.94, 0.16, 0.94, i * 1.0, 0.08, j * 1.0, 0, { material: mat(0x3f7d3a, { roughness: 0.8 }) });
      cyl(g, 0.09, 0.09, 0.1, i * 1.0, 0.2, j * 1.0, 0x3f7d3a, { seg: 8 });
      m.receiveShadow = true;
    }
  }

  // A course of blocks with GAPS between them (0.18 clear), stacked into walls.
  const course = (cx, cz, axis, count, y, m, gap = 0.18, gapEvery = 3, gapW = 0.8) => {
    const stride = axis === 'x' ? 1.0 : 1.0;
    for (let k = 0; k < count; k++) {
      const along = (k - (count - 1) / 2) * stride;
      const x = cx + (axis === 'x' ? along : 0);
      const z = cz + (axis === 'z' ? along : 0);
      // Punch a gap (a missing block) every `gapEvery`.
      if (gapEvery > 0 && k > 0 && k % gapEvery === 0) continue;
      const w = axis === 'x' ? bw : bd;
      const d = axis === 'x' ? bd : bw;
      pieces.push(box(g, w, bh, d, x, y, z, 0, { material: m }));
    }
  };

  // Four walls, six courses tall, each with gaps.
  const halfX = 3.0, halfZ = 3.0;
  const courses = 6;
  for (let c = 0; c < courses; c++) {
    const y = 0.16 + bh / 2 + c * bh;
    const mx = (c % 2 === 0) ? blockMat : trimMat;
    course(0, -halfZ, 'x', 6, y, mx, 0.18, 3, 0.8);
    course(0, halfZ, 'x', 6, y, mx, 0.18, 3, 0.8);
    course(-halfX, 0, 'z', 6, y, mx, 0.18, 3, 0.8);
    course(halfX, 0, 'z', 6, y, mx, 0.18, 3, 0.8);
  }

  // Four corner towers, round-ish (stacked blocks), taller, with crenellations.
  for (const [tx, tz] of [[-halfX, -halfZ], [halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ]]) {
    const th = 8;
    for (let c = 0; c < th; c++) {
      const y = 0.16 + bh / 2 + c * bh;
      const m = (c % 2 === 0) ? trimMat : blockMat;
      pieces.push(box(g, bw * 1.35, bh, bd * 1.35, tx, y, tz, 0, { material: m }));
    }
    // Crenellations: alternating blocks around the top.
    const topY = 0.16 + bh / 2 + th * bh;
    for (const [dx, dz] of [[-0.55, 0], [0.55, 0], [0, -0.55], [0, 0.55]]) {
      pieces.push(box(g, 0.5, 0.5, 0.5, tx + dx, topY, tz + dz, 0, { material: blockMat }));
    }
    // A conical roof on each tower.
    pieces.push(cone(g, 1.05, 1.6, tx, topY + 1.1, tz, 0, { material: roofMat, seg: 8 }));
  }

  // A gatehouse gap on the +z wall with a drawbridge ramp and a portcullis.
  pieces.push(box(g, 1.8, 0.16, 1.6, 0, 0.24, halfZ + 1.0, C.wood, { material: mat(C.wood, { roughness: 0.8 }) }));
  for (const sx of [-1, 1]) pieces.push(box(g, 0.3, 2.0, 0.3, sx * 1.1, 2.1, halfZ, 0, { material: blockMat }));
  pieces.push(box(g, 1.4, 0.5, 0.24, 0, 3.4, halfZ, 0, { material: blockMat }));

  // A keep in the middle, one course per block, with a flag.
  const keepH = 5;
  for (let c = 0; c < keepH; c++) {
    const y = 0.16 + bh / 2 + c * bh;
    pieces.push(box(g, 2.2, bh, 2.2, 0, y, 0, 0, { material: (c % 2 === 0) ? blockMat : trimMat }));
  }
  cyl(g, 0.04, 0.04, 2.4, 0, 0.16 + keepH * bh + 1.2, 0, C.steelDark, { seg: 6 });
  pieces.push(box(g, 1.0, 0.6, 0.06, 0.5, 0.16 + keepH * bh + 2.0, 0, C.red, { material: mat(C.red, { roughness: 0.5 }) }));

  g.scale.setScalar(s);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, pieces };
}

// ============================================================================
// The magnet-tile parking structure - a connected stack of decks and towers.
// ============================================================================
// Returns { group, pieces }. Every tile is a piece (the dark base plate is not),
// so the level can register them all as knockables and the whole garage comes
// apart and scatters when you hit it. All the tiles are laid so each rests on the
// one below it - no floating corners: the columns stand on the deck under them,
// each deck rests on its columns, and the towers are stacked course by course on
// the roof deck.
export function makeMagnetCity(opts = {}) {
  const s = opts.scale ?? 1;
  const g = new THREE.Group();
  g.name = 'MagnetCity';
  const pieces = [];

  const tile = (w, h, d, x, y, z, col) => {
    const m = box(g, w, h, d, x, y, z, col, {
      material: mat(col, { opacity: 0.55, roughness: 0.25, metalness: 0.05, emissive: col, emissiveIntensity: 0.08 }),
    });
    pieces.push(m);
    return m;
  };

  const W0 = 11, D0 = 9, floors = 4, fh = 1.7, slabT = 0.18;
  const L0 = 0.3;   // top of the base plate; decks are measured up from here

  // The dark ground plate (not a piece - it is the "plot" for the explorer, and
  // in the room it stays put under the scattering tiles).
  box(g, W0, 0.3, D0, 0, 0.15, 0, 0x2c2f36, { material: mat(0x2c2f36, { roughness: 0.8 }) });

  for (let f = 0; f < floors; f++) {
    const wX = W0 - f * 1.1, wZ = D0 - f * 1.1;
    const yCol = L0 + f * fh + fh / 2;          // columns span this storey
    // Columns (upright tiles) at the corners + mid-edges, standing on the deck
    // below (top of the previous deck = L0 + f*fh).
    for (const [cx, cz] of [
      [-wX / 2 + 0.45, -wZ / 2 + 0.45], [wX / 2 - 0.45, -wZ / 2 + 0.45],
      [-wX / 2 + 0.45, wZ / 2 - 0.45], [wX / 2 - 0.45, wZ / 2 - 0.45],
      [0, -wZ / 2 + 0.45], [0, wZ / 2 - 0.45],
    ]) {
      const ci = ((f * 3 + Math.round(cx + cz) + 8) % BRIGHT.length + BRIGHT.length) % BRIGHT.length;
      const col = BRIGHT[ci];
      tile(0.44, fh, 0.44, cx, yCol, cz, col);
    }
    // The deck for this storey: a 3x3 grid of flat tiles, resting on the columns.
    const ySlab = L0 + (f + 1) * fh - slabT / 2;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const col = BRIGHT[(i + j + f + 8) % BRIGHT.length];
        tile(wX / 3 - 0.16, slabT, wZ / 3 - 0.16, i * (wX / 3), ySlab, j * (wZ / 3), col);
      }
    }
    // A run of upright wall tiles along each side, sitting on the deck.
    for (let k = -1; k <= 1; k++) {
      tile(0.16, 0.9, wZ / 3 - 0.2, -wX / 2 + 0.09, ySlab + slabT / 2 + 0.45, k * (wZ / 3), BRIGHT[(k + f + 4) % BRIGHT.length]);
      tile(0.16, 0.9, wZ / 3 - 0.2, wX / 2 - 0.09, ySlab + slabT / 2 + 0.45, k * (wZ / 3), BRIGHT[(k + f + 6) % BRIGHT.length]);
    }
  }

  // Towers on the roof deck, stacked course by course straight up (each course
  // rests on the one below, so nothing floats).
  const roofY = L0 + floors * fh;
  const course = 0.16;
  for (const [tx, tz, hgt, sidewaysAt] of [
    [-3.0, -2.4, 4.5, 2], [3.0, -2.4, 3.2, 3], [3.0, 2.4, 5.2, 2], [-3.0, 2.4, 2.6, 1], [0, 0, 6.0, 2],
  ]) {
    const col = BRIGHT[Math.round(Math.abs(tx + tz)) % BRIGHT.length];
    const n = Math.round(hgt / course);
    for (let c = 0; c < n; c++) {
      const y = roofY + course / 2 + c * course;
      if (c === sidewaysAt) {
        // A sideways tile wedged in the stack (1.2 tall, standing on edge).
        tile(1.2, 1.1, 1.1, tx, y + 0.45, tz, BRIGHT[(c + 1) % BRIGHT.length]);
      } else {
        tile(1.2, course, 1.2, tx, y, tz, col);
      }
    }
    const roofMat = mat(col, { opacity: 0.7, roughness: 0.3 });
    const roof = cone(g, 0.95, 1.0, tx, roofY + n * course + 0.5, tz, col, { seg: 8, material: roofMat });
    pieces.push(roof);
  }

  g.scale.setScalar(s);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, pieces };
}

// ============================================================================
// The Hot Wheels track - the real orange road, shared by the level and explorer.
// ============================================================================
// The centreline maths (spline, frames, loop) is pure and lives in
// hotwheels.mjs; this is only the geometry laid along the sampled frames. The
// level returns this same object as `world.hotwheels` so main.js can drive the
// car on `track`; the explorer shows the same `group`.
export function makeHotWheels() {
  const nodes = hotwheelsNodes();
  const track = buildTrack(nodes);
  const group = new THREE.Group();
  group.name = 'hotwheels';
  const HOTMAT = {
    // DoubleSide so the swept ribbon is never invisible from below or inside the
    // loop, where the winding flips around the far side of the geometry.
    road: mat(0xff6a00, { roughness: 0.5, side: THREE.DoubleSide }),
    rail: mat(0xcc4a00, { roughness: 0.45, side: THREE.DoubleSide }),
    tie: mat(0xffab47, { roughness: 0.6 }),
  };
  const HALF = TRACK_HALF_WIDTH;
  const m = track.samples.length;
  const stride = 2;
  const canOrient = typeof THREE.Matrix4 === 'function' && THREE.Matrix4.prototype
    && typeof THREE.Matrix4.prototype.makeBasis === 'function';
  const basis = canOrient ? new THREE.Matrix4() : null;
  const vx = canOrient ? new THREE.Vector3() : null;
  const vy = canOrient ? new THREE.Vector3() : null;
  const vz = canOrient ? new THREE.Vector3() : null;

  const put = (host, w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    host.add(mesh);
    return mesh;
  };

  // Oriented frame at sample `i`, as a group whose local +X is backward and +Z
  // the binormal across the track. Used to hang ties under the deck.
  const segAt = (i) => {
    const p = track.samples[i];
    const pose = poseOnTrack(track, p.s, 0);
    const seg = new THREE.Group();
    if (canOrient) {
      vx.set(pose.xx, pose.xy, pose.xz);      // local +X = backward
      vy.set(pose.yx, pose.yy, pose.yz);      // local +Y = up
      vz.set(pose.zx, pose.zy, pose.zz);      // local +Z = binormal (across)
      basis.makeBasis(vx, vy, vz);
      basis.setPosition(pose.px, pose.py, pose.pz);
      seg.matrixAutoUpdate = false;
      seg.matrix.copy(basis);
    } else {
      seg.position.set(pose.px, pose.py, pose.pz);
    }
    group.add(seg);
    return seg;
  };

  // ---- The deck: ONE continuous ribbon ------------------------------------
  // Swept along EVERY sample as a single BufferGeometry — a four-sided tube
  // (top deck, underside, two thin kerbs) of the track's cross-section. Because
  // it is one mesh covering the whole route there are no abutting per-segment
  // slabs to leave hairline gaps or for coplanar faces to z-fight.
  const positions = [];
  const quad = (a, b, c, d) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    positions.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  };
  const THICK = 0.3;
  const topL = [], topR = [], botL = [], botR = [];
  for (let i = 0; i < m; i++) {
    const p = track.samples[i];
    const ex = p.bx * HALF, ey = p.by * HALF, ez = p.bz * HALF;
    const ax = p.x + ex, ay = p.y + ey, az = p.z + ez;    // +binormal edge
    const gx = p.x - ex, gy = p.y - ey, gz = p.z - ez;    // -binormal edge
    const ox = p.ux * THICK, oy = p.uy * THICK, oz = p.uz * THICK;
    topL.push([ax, ay, az]);
    topR.push([gx, gy, gz]);
    botL.push([ax - ox, ay - oy, az - oz]);
    botR.push([gx - ox, gy - oy, gz - oz]);
  }
  for (let i = 0; i < m - 1; i++) {
    quad(topL[i], topL[i + 1], topR[i + 1], topR[i]);   // top deck
    quad(botR[i], botR[i + 1], botL[i + 1], botL[i]);   // underside
    quad(botL[i], topL[i], topL[i + 1], botL[i + 1]);   // one kerb
    quad(topR[i], botR[i], botR[i + 1], topR[i + 1]);   // the other kerb
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, HOTMAT.road);
  road.castShadow = true;
  road.receiveShadow = true;
  group.add(road);

  // ---- Two continuous guide rails -----------------------------------------
  // One tube swept along each edge, so the guides read as a single unbroken
  // line the length of the route rather than a chain of little rail boxes.
  for (const sign of [1, -1]) {
    const pts = [];
    for (let i = 0; i < m; i++) {
      const p = track.samples[i];
      pts.push(new THREE.Vector3(
        p.x + sign * p.bx * (HALF + 0.12) + p.ux * 0.16,
        p.y + sign * p.by * (HALF + 0.12) + p.uy * 0.16,
        p.z + sign * p.bz * (HALF + 0.12) + p.uz * 0.16,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, m), 0.2, 8, false), HOTMAT.rail);
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  }

  // ---- Cross-ties under the deck ------------------------------------------
  // Sparse: a tie every ~10th of what would read as a sleeper spacing. The deck
  // ribbon and the two guide rails carry the look; a dense ladder of bars only
  // read as clutter (and the loop crowded its own underside).
  for (let i = 0; i < m; i += stride * 20) {
    put(segAt(i), 0.5, 0.14, 2 * HALF + 0.5, 0, -0.3, 0, HOTMAT.tie);
  }

  // ---- No supports ---------------------------------------------------------
  // The track FLOATS: no posts, no pillars, nothing standing it on the floor.
  // A raised toy track hanging in mid-air is the look we want, and it is what
  // stops the loop's underside sprouting a pillar the car then drives into.
  return { group, nodes, track };
}

// ============================================================================
// The Jack-in-the-box
// ============================================================================
//
// A bold striped cube with a wind-up crank on the side. Touch it and it winds
// itself up (crank turning faster and faster, lid STILL SHUT - that pause is
// the joke), then the lid flies open and a clown on a huge spring shoots out:
// a big red nose, a huge pointy hat, a frilly collar and red hands. It bounces
// around on the spring for a few seconds, then the spring draws it slowly back
// down and the lid closes. The timing is in ./jack.mjs (pure, tested headless);
// this is only the geometry and the per-frame pose.
//
// `opts.x`/`opts.z` are the WORLD spot the box is placed at, so the returned
// `touch()` can tell on its own whether a car is against it.
export function makeJackInTheBox(opts = {}) {
  const wx = opts.x ?? 0, wz = opts.z ?? 0;
  const touchR = opts.touchR ?? 3.4;
  const scale = opts.scale ?? 0.6;      // shrink to about car size (4.4 across)
  const group = new THREE.Group();

  const W = JACK_BOX.w, D = JACK_BOX.d, H = JACK_BOX.h;
  const LID_OPEN = 2.1;               // radians the lid swings back

  // ---- the box: a cube in bold vertical stripes ---------------------------
  box(group, W, H, D, 0, H / 2, 0, C.cream);
  const n = RAINBOW.length;
  for (let i = 0; i < n; i++) {
    const col = RAINBOW[i];
    const sx = -W / 2 + (i + 0.5) * (W / n);
    const sz = -D / 2 + (i + 0.5) * (D / n);
    for (const f of [-1, 1]) {
      box(group, W / n + 0.02, H - 1.4, 0.12, sx, H / 2, f * (D / 2 + 0.06), col, false);
      box(group, 0.12, H - 1.4, D / n + 0.02, f * (W / 2 + 0.06), H / 2, sz, col, false);
    }
  }
  // A dark plinth and a rim, so it reads as a box and not a striped lump.
  box(group, W + 0.5, 0.7, D + 0.5, 0, 0.35, 0, C.woodDark);
  box(group, W + 0.4, 0.5, D + 0.4, 0, H - 0.2, 0, C.woodDark);

  // ---- the lid, hinged along the back edge --------------------------------
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, H, -D / 2);
  group.add(lidPivot);
  box(lidPivot, W + 0.4, 0.6, D + 0.4, 0, 0.3, D / 2, C.woodDark);
  box(lidPivot, W - 0.8, 0.35, D - 0.8, 0, 0.72, D / 2, C.gold);

  // ---- the wind-up crank, on the +X side ----------------------------------
  const crankPivot = new THREE.Group();
  crankPivot.position.set(W / 2 + 0.1, H * 0.5, 0);
  group.add(crankPivot);
  cyl(crankPivot, 0.15, 0.15, 0.9, 0.45, 0, 0, C.steel, { rz: Math.PI / 2, seg: 10 });
  box(crankPivot, 0.22, 1.15, 0.22, 0.9, 0.55, 0, C.steelDark);
  cyl(crankPivot, 0.17, 0.17, 0.7, 1.05, 1.12, 0, C.gold, { rz: Math.PI / 2, seg: 10 });

  // ---- the spring and the clown (the `pop` assembly) ----------------------
  const pop = new THREE.Group();
  group.add(pop);

  const RINGS = 14;
  const rings = [];
  const springMat = mat(0xd9dde5, { metalness: 0.55, roughness: 0.4 });
  for (let i = 0; i < RINGS; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.15, 6, 14), springMat);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    pop.add(ring);
    rings.push(ring);
  }

  const clown = new THREE.Group();
  pop.add(clown);
  buildClown(clown);

  // About car-sized: the whole gag is built at toy scale, then the group is
  // shrunk so the box reads as a thing you can knock with the car.
  group.scale.setScalar(scale);

  // ---- the pose -----------------------------------------------------------
  const st = createJack();
  let armed = true;    // you must leave the box before it fires again

  function apply() {
    const p = jackPose(st);
    const L = springLength(p.out);
    const side = p.sway;     // how far the head has been pushed off +x
    const fwd = p.bend;      // how far the head has been pushed off +z
    lidPivot.rotation.x = -p.lid * LID_OPEN;
    crankPivot.rotation.x = -p.crank;
    // Curve the spring: ring i sits a fraction f up the spring and is pushed
    // out by f*f of the head's lean, so the whole column arcs from the box out
    // to the leaning head rather than tilting as one rigid rod.
    for (let i = 0; i < RINGS; i++) {
      const f = (i + 0.5) / RINGS;
      rings[i].position.set(side * f * f, JACK_FLOOR + f * L, fwd * f * f);
    }
    // The clown rides the top of the arc and lies over to match its slope.
    clown.position.set(side, JACK_FLOOR + L, fwd);
    const denom = Math.max(L, 0.001);
    clown.rotation.z = -Math.atan2(2 * side, denom);
    clown.rotation.x = Math.atan2(2 * fwd, denom);
    // The box trembles while it winds. Nothing else writes to the root, so
    // this cannot fight the knockable wobble on the unit above it.
    group.position.x = Math.sin(st.t * 47) * 0.12 * p.jiggle;
    group.position.z = Math.cos(st.t * 41) * 0.12 * p.jiggle;
  }
  apply();

  return {
    group,
    get phase() { return st.phase; },
    // main.js calls this every house frame with the car's position. Edge
    // triggered: parking on the box does not start it over and over.
    touch(x, z) {
      if (Math.hypot(x - wx, z - wz) > touchR) { armed = true; return false; }
      if (!armed) return false;
      if (!jackTouch(st)) return false;
      armed = false;
      return true;
    },
    // Returns the phase entered this frame (for the sounds), or null.
    update(delta) {
      const entered = jackStep(st, delta);
      apply();
      return entered;
    },
  };
}

// The clown: a grotesque, medieval jester - horned, sunken-eyed, hooked-nosed
// and grinning through a mouthful of jagged teeth. In world units, standing on
// y=0 (the top of the spring).
function buildClown(parent) {
  const skin = 0xe8c9a0;
  const skinDark = 0xbf9569;
  const evil = 0x5e0f1c;      // dark arterial red, for the horns and hat
  const ivory = 0xf3ecd6;     // teeth and claws
  const sore = 0x4a7a4a;      // sickly warts

  // Torso: a striped jester's body over a bloated little belly.
  ball(parent, 1.0, 0, 1.0, 0, C.red);
  ball(parent, 0.9, 0, 0.78, 0.3, C.cream, { sy: 0.68, sz: 0.72 });
  ball(parent, 0.6, 0, 0.42, 0.05, C.redDark, { sy: 0.6 });

  // Arms flung out wide, ending in clawed hands.
  for (const s of [-1, 1]) {
    cyl(parent, 0.17, 0.17, 1.95, s * 1.35, 2.05, 0, C.cream, { rz: -s * 1.05, seg: 8 });
    ball(parent, 0.5, s * 2.1, 2.55, 0, C.red);
    for (let c = -1; c <= 1; c++) {
      cone(parent, 0.11, 0.5, s * 2.45, 2.95 + c * 0.26, 0.05, ivory, { rx: Math.PI, seg: 6 });
    }
  }

  // The frilly collar: a ruff of flat petals ringing the neck.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const petal = ball(parent, 0.55, Math.sin(a) * 1.3, 1.85, Math.cos(a) * 1.3,
      i % 2 ? C.cream : 0xffffff, { sy: 1, sz: 0.5 });
    petal.rotation.y = a;
  }

  // The head, with a heavy undershot jaw.
  ball(parent, 1.15, 0, 3.05, 0, skin);
  ball(parent, 0.85, 0, 2.55, 0.25, skinDark, { sy: 0.7 });

  // Horns: dark horns curling up and out off the temples.
  for (const s of [-1, 1]) {
    cone(parent, 0.3, 1.5, s * 0.7, 3.75, 0, evil, { rz: -s * 0.8, seg: 8 });
    cone(parent, 0.16, 0.7, s * 1.05, 4.35, 0, evil, { rz: -s * 1.15, seg: 8 });
  }

  // Angry brow ridges, slanted down toward the nose.
  for (const s of [-1, 1]) {
    box(parent, 0.66, 0.22, 0.34, s * 0.42, 3.45, 0.85, skinDark, { rz: s * 0.5, ry: -s * 0.15 });
  }
  // Sunken sockets with embers burning in them.
  for (const s of [-1, 1]) {
    ball(parent, 0.34, s * 0.44, 3.05, 0.72, 0x0e0908, { seg: 12, seg2: 8 });
    ball(parent, 0.14, s * 0.44, 3.05, 0.95, 0xff2a00, { emissive: 0xff2a00, emissiveIntensity: 2.5, seg: 10, seg2: 8 });
  }

  // A long hooked nose.
  cone(parent, 0.28, 1.15, 0, 2.85, 1.05, skinDark, { rx: Math.PI / 2 + 0.6, seg: 8 });
  ball(parent, 0.24, 0, 2.6, 1.45, skinDark);

  // A wide grinning maw with jagged teeth top and bottom.
  box(parent, 1.5, 0.62, 0.3, 0, 2.25, 0.78, 0x150505);
  for (let i = 0; i < 4; i++) {
    cone(parent, 0.13, 0.4, -0.5 + i * 0.33, 2.48, 0.82, ivory, { rx: Math.PI, seg: 6 });
    cone(parent, 0.12, 0.36, -0.42 + i * 0.3, 2.02, 0.82, ivory, { seg: 6 });
  }

  // Warts and a stitch.
  ball(parent, 0.14, 0.75, 2.7, 0.62, sore);
  ball(parent, 0.1, -0.68, 2.9, 0.68, sore);
  box(parent, 0.5, 0.05, 0.05, 0.55, 3.45, 0.92, 0x7a4030, { rz: 0.6 });

  // The tattered jester's hat, bent over, with a bell.
  ball(parent, 1.2, 0, 4.1, 0, C.gold, { sy: 0.35 });      // whose brim
  cone(parent, 1.05, 2.2, 0, 4.6, 0, evil, { seg: 10 });
  cone(parent, 0.4, 1.2, 0.55, 5.75, 0, C.red, { rz: -0.9, seg: 8 });
  ball(parent, 0.28, 1.1, 6.2, 0, C.gold);                 // and the bell
}

// ============================================================================
// The pet terrarium - a glass tank on the playroom shelf, with a green lizard.
// ============================================================================
//
// The lizard is the SAME model as the town's flame lizard (src/lizard.js), built
// from a green palette with the fire switched off (`flames: false`): no flame
// mane, no tail flame, no breath, no warm glow - just a plain scaly reptile.
// Under the clear hood it idles with a slow tail flick, and turns its head to
// watch the player's car whenever it drives near. Returns
// { group, update(delta, playerX, playerZ) }.
const PET_LIZARD = {
  body: 0x3f8f3a, bodyEmissive: 0x0c2a08, bodyEmissiveIntensity: 0.10,
  belly: 0xcfe8a6, bellyEmissive: 0x2a3a10, bellyEmissiveIntensity: 0.05,
  spike: 0x2c5f28,
  eye: 0xffd23c,
  claw: 0x203018,
  flat: true,   // low-poly + flat shading reads as scaly skin.
};

export function makeTerrarium(opts = {}) {
  const wx = opts.x ?? 0, wz = opts.z ?? 0;
  const W = opts.w ?? 9, D = opts.d ?? 6, H = opts.h ?? 5;
  const wallT = 0.14, baseH = 0.5;
  const g = new THREE.Group();
  g.name = 'Terrarium';

  // ---- The cabinet base and its trim (dark wood) ----
  box(g, W + 0.5, baseH, D + 0.5, 0, baseH / 2, 0, 0, { material: mat(C.woodDark, { roughness: 0.8 }) });
  box(g, W + 0.3, 0.3, D + 0.3, 0, baseH + 0.15, 0, 0, { material: mat(C.woodDark, { roughness: 0.8 }) });

  // ---- The substrate: a bed of sand inside the tank ----
  const subTop = baseH + 0.6;
  box(g, W - 0.3, 0.6, D - 0.3, 0, baseH + 0.3, 0, 0, { material: mat(0xd9c08a, { roughness: 0.95 }) });

  // ---- Decorations: a water dish, rocks, a little plant and a log ----
  cyl(g, 1.1, 1.0, 0.22, -2.9, subTop, 1.5, 0,
    { material: mat(0x8fd0ea, { opacity: 0.7, roughness: 0.2 }) });
  box(g, 2.6, 0.24, 2.2, 2.7, subTop + 0.12, 1.4, 0, { material: mat(0x8a8172, { roughness: 0.95 }) });
  ball(g, 0.8, 1.9, subTop + 0.6, 1.4, 0, { material: mat(0x8a8f96, { roughness: 0.85 }) });
  ball(g, 0.5, 3.2, subTop + 0.4, -1.4, 0, { material: mat(0x777d86, { roughness: 0.9 }) });
  // A spiky little succulent in the far corner.
  cone(g, 0.7, 1.6, -3.6, subTop + 0.8, -1.9, 0x3f8f4f, { material: mat(0x3f8f4f, { roughness: 0.8 }) });
  cyl(g, 0.12, 0.12, 0.5, -3.6, subTop + 0.25, -1.9, 0, { material: mat(C.woodDark, { roughness: 0.9 }) });
  // A hollow log to hide in, laid across the back.
  const log = cyl(g, 0.75, 0.75, 5.5, 0, subTop + 0.7, -1.9, 0, { material: mat(0x8a6c48, { roughness: 0.85 }), seg: 12 });
  log.rotation.z = Math.PI / 2;

  // ---- The glass hood: four clear panes on a dark wooden frame ----
  const clear = mat(0xbfe3f5, { opacity: 0.14, roughness: 0.1, metalness: 0 });
  clear.depthWrite = false;
  const gy = baseH + H / 2;
  box(g, W, H, wallT, 0, gy, -D / 2, 0, { material: clear });
  box(g, W, H, wallT, 0, gy, D / 2, 0, { material: clear });
  box(g, wallT, H, D, -W / 2, gy, 0, 0, { material: clear });
  box(g, wallT, H, D, W / 2, gy, 0, 0, { material: clear });
  // Corner posts, so the hood reads as a real tank and not a glass cube.
  for (const [cx, cz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    box(g, 0.22, H, 0.22, cx, gy, cz, 0, { material: mat(0x6b4a2a, { roughness: 0.7 }) });
  }
  // A wooden rim around the base of the hood.
  const frame = mat(0x6b4a2a, { roughness: 0.7 });
  box(g, W + 0.24, 0.3, 0.3, 0, baseH + 0.05, -D / 2, 0, { material: frame });
  box(g, W + 0.24, 0.3, 0.3, 0, baseH + 0.05, D / 2, 0, { material: frame });
  box(g, 0.3, 0.3, D + 0.24, -W / 2, baseH + 0.05, 0, 0, { material: frame });
  box(g, 0.3, 0.3, D + 0.24, W / 2, baseH + 0.05, 0, 0, { material: frame });
  // A clipped lid over the back half, leaving the front open to the room.
  box(g, W - 0.2, 0.18, D * 0.5, 0, baseH + H, -D * 0.25, 0, { material: frame });

  // ---- The lizard itself ----
  const lizard = makeLizardModel(PET_LIZARD, { flames: false });
  const s = opts.lizardScale ?? 0.85;
  lizard.scale.setScalar(s);
  const lx = -0.6, lz = 1.2;          // seat on the sand, facing +Z into the room
  lizard.position.set(lx, subTop + 0.31 * s, lz);
  g.add(lizard);
  const { headPivot, tailPivot } = lizard.userData;

  const st = { t: Math.random() * Math.PI * 2, look: 0 };
  return {
    group: g,
    x: wx, z: wz,
    update(delta, px, pz) {
      st.t += delta;
      // Idle: the tail sweeps slowly from side to side.
      tailPivot.rotation.y = Math.sin(st.t * 1.5) * 0.3;
      // Watch the player: turn the head toward the car when it is near.
      let want = 0;
      if (px != null && pz != null) {
        const dx = px - (wx + lx), dz = pz - (wz + lz);
        if (dx * dx + dz * dz < 34 * 34) {
          want = Math.atan2(dx, dz);     // the lizard's forward is +Z
          want = Math.max(-1.0, Math.min(1.0, want));
        }
      }
      st.look += (want - st.look) * Math.min(1, delta * 3.5);
      headPivot.rotation.y = st.look;
      headPivot.rotation.x = Math.sin(st.t * 1.9) * 0.05;   // faint idle bob
    },
  };
}

// A convenience list the explorer and the level both iterate, so a toy added
// here shows up in both places. `build` returns a THREE.Group.
export const TOYS = [
  { id: 'train', name: 'Play Train', build: () => makePlayTrain().group },
  { id: 'horse', name: 'Rocking Horse', build: () => makeRedHorse() },
  { id: 'lego', name: 'Lego Box', build: () => makeLegoBox().group },
  { id: 'rocket', name: 'Hanging Rocket', build: () => makeHangingRocket({ hang: 3 }) },
  { id: 'xylophone', name: 'Rainbow Xylophone', build: () => makeXylophone().group },
  { id: 'castle', name: 'Block Castle', build: () => makeBlockCastle().group },
  { id: 'magnet', name: 'Magnet Parking', build: () => makeMagnetCity().group },
  { id: 'hotwheels', name: 'Hot Wheels Track', build: () => makeHotWheels().group },
  { id: 'jack', name: 'Jack in the Box', build: () => makeJackInTheBox().group },
  { id: 'terrarium', name: 'Pet Terrarium', build: () => makeTerrarium().group },
];
