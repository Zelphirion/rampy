import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== Train =====
// A freight train that endlessly circles the town on a big rounded-rectangle
// loop of rails out on the grass ring (well clear of the roads/sidewalks).
// It's a fixed convoy: the locomotive leads a long mixed freight of boxcar,
// hoppers, gondolas, tankers, flatcars, an autorack, a well car, a reefer, a
// coil car, a stock car, and a caboose, all tied to the track. When you run
// into it a car wobbles in place, but the train NEVER derails — it just keeps
// going.

// ===== Track path (rounded rectangle) =====
// East/west/south rails sit at ±84 — past the park (max 75), the parking lot
// (SW corner -77,-73) and the ±82 tree line. The NORTH straight is pushed out
// to +120, just inside the world's north edge (z=123), so the short grass
// field behind the mega ramp stays clear of the track; the loop becomes a
// tall rounded rectangle.
const ST = 84;       // east/west/south straight rails sit at ±84
const ST_N = 120;    // north straight rail sits at +120 (field far edge)
const R = 10;        // corner radius
const CC = ST - R;   // corner arc centres at ±74 on the east/west/south sides
const TRACK_Y = 0.19;   // rail tube centre height

// Sample points around the closed loop (clockwise). y is fixed (flat ground).
function buildLoopPath() {
  const pts = [];
  const step = 0.5;
  const aStep = 0.05;
  const push = (x, z) => pts.push(new THREE.Vector3(x, TRACK_Y, z));
  // North corner arc centres sit at x=±CC (matching the south corners) and
  // z=ST_N-R, so each north corner rounds from the top rail to the side rail
  // and the whole loop stays inside the world's east/west bounds (±90).
  const NZ = ST_N - R;
  // top straight (z = +ST_N), left -> right (spans the same x-range as the
  // other straights, [-CC,CC])
  for (let x = -CC; x <= CC; x += step) push(x, ST_N);
  // NE arc (centre CC,NZ) 90° -> 0°  (top straight's right end -> right straight's top)
  for (let a = Math.PI / 2; a >= 0; a -= aStep) push(CC + R * Math.cos(a), NZ + R * Math.sin(a));
  // right straight (x = +ST), top -> bottom
  for (let z = NZ; z >= -CC; z -= step) push(ST, z);
  // SE arc (centre CC,-CC) 0° -> -90°
  for (let a = 0; a > -Math.PI / 2; a -= aStep) push(CC + R * Math.cos(a), -CC + R * Math.sin(a));
  // bottom straight (z = -ST), right -> left
  for (let x = CC; x >= -CC; x -= step) push(x, -ST);
  // SW arc (centre -CC,-CC) -90° -> -180°
  for (let a = -Math.PI / 2; a > -Math.PI; a -= aStep) push(-CC + R * Math.cos(a), -CC + R * Math.sin(a));
  // left straight (x = -ST), bottom -> top
  for (let z = -CC; z <= NZ; z += step) push(-ST, z);
  // NW arc (centre -CC,NZ) 180° -> 90°  (left straight's top -> top straight's left end)
  for (let a = Math.PI; a >= Math.PI / 2; a -= aStep) push(-CC + R * Math.cos(a), NZ + R * Math.sin(a));

  const n = pts.length;
  const cum = new Array(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
  return { pts, cum, n, total: cum[n - 1] };
}

// Position + unit tangent at arc-length s (wraps around the closed loop).
function sample(path, s) {
  const { pts, cum, n, total } = path;
  s = ((s % total) + total) % total;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid + 1; else hi = mid;
  }
  const i = Math.max(0, lo - 1);
  const segLen = (cum[i + 1] - cum[i]) || 1e-6;
  const t = Math.min(1, Math.max(0, (s - cum[i]) / segLen));
  const a = pts[i], b = pts[(i + 1) % n];
  const tx = b.x - a.x, tz = b.z - a.z;
  const tl = Math.hypot(tx, tz) || 1e-6;
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    tx: tx / tl,
    tz: tz / tl,
  };
}

// ===== Rails + sleepers =====
const railMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.7, metalness: 0.3 });
const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 });

function buildRails(scene, path) {
  const { pts, n } = path;
  // Two parallel steel rails offset ±0.8 from the centreline.
  for (const off of [0.8, -0.8]) {
    const curvePts = pts.map((p, i) => {
      const a = pts[(i + 1) % n], b = pts[(i - 1 + n) % n];
      let tx = a.x - b.x, tz = a.z - b.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      return new THREE.Vector3(p.x - tz * off, p.y, p.z + tx * off);
    });
    const curve = new THREE.CatmullRomCurve3(curvePts, true, 'catmullrom', 0.5);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 720, 0.07, 6, true), railMat);
    rail.castShadow = true;
    rail.receiveShadow = true;
    scene.add(rail);
  }
  // Wooden sleepers (ties) under the rails every few units.
  const sleeperGeo = new THREE.BoxGeometry(2.0, 0.14, 0.18);
  for (let s = 0; s < path.total; s += 5.5) {
    const p = sample(path, s);
    const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
    sleeper.position.set(p.x, 0.16, p.z);
    sleeper.rotation.y = Math.atan2(p.tx, p.tz);
    sleeper.receiveShadow = true;
    scene.add(sleeper);
  }
}

// ===== Train cars =====
const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 14);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.85 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe3f5, roughness: 0.2, transparent: true, opacity: 0.7 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.7 });
const hubGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10);

// Wheels: a pivot per wheel (axle laid along local X, across the car) so each
// wheel can spin around its own axle. Stored as the mesh children to spin.
// withHubs adds a brass hub cap on the outer face (locomotive detail).
function makeTrainWheels(group, positions, withHubs) {
  const wheels = [];
  for (const [lx, ly, lz] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, ly, lz);
    pivot.rotation.z = Math.PI / 2;   // axle along local X (perpendicular to travel)
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    if (withHubs) {
      const hub = new THREE.Mesh(hubGeo, brassMat);
      hub.position.x = 0.17;
      wheel.add(hub);
    }
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
  }
  return wheels;
}

// Steam locomotive from 1869 (front faces +Z): a wood-burning American
// engine with a diamond stack, rounded steam + sand domes, a bell, a smokebox
// with a round door, and a headlight mounted on a bracket on the smokebox
// front (bolted on, never floating).
function makeLocomotive() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.7 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c323d, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.5, metalness: 0.4 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8a2b2b, roughness: 0.6 });

  // running board / frame
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 6.6), dark);
  chassis.position.set(0, 0.9, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);

  // boiler (firebox end to smokebox), front faces +Z
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 3.0, 12), iron);
  boiler.rotation.x = Math.PI / 2;
  boiler.position.set(0, 1.7, 0.1); boiler.castShadow = boiler.receiveShadow = true; g.add(boiler);

  // brass boiler bands
  for (const bz of [-0.9, 0.1, 1.3]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.98, 0.08, 12), brassMat);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 1.7, bz);
    g.add(band);
  }

  // smokebox + round door at the front
  const smoke = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.95, 0.55, 12), dark);
  smoke.rotation.x = Math.PI / 2;
  smoke.position.set(0, 1.7, 1.875); smoke.castShadow = true; g.add(smoke);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), steel);
  door.rotation.x = Math.PI / 2;
  door.position.set(0, 1.7, 2.22); g.add(door);
  const doorBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), steel);
  doorBar.rotation.x = Math.PI / 2;
  doorBar.position.set(0.35, 1.7, 2.32); g.add(doorBar);

  // diamond smokestack (1869 wood-burner) on the boiler top at z = 1.0
  const stack = new THREE.Group();
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.4, 8), dark);
  collar.position.set(0, 2.7, 0); stack.add(collar);
  const flare = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.55, 8), dark);
  flare.rotation.x = Math.PI;          // apex down, wide base up
  flare.position.set(0, 3.075, 0); stack.add(flare);
  const taper = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.5, 8), dark);
  taper.position.set(0, 3.6, 0); stack.add(taper);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.16, 8), dark);
  cap.position.set(0, 3.92, 0); stack.add(cap);
  stack.position.set(0, 0, 1.0);
  stack.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.add(stack);

  // rounded steam dome + smaller sand dome (both sunk into the boiler top)
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.26, 12), steel);
  domeBase.position.set(0, 2.66, -0.2); g.add(domeBase);
  const domeTop = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), steel);
  domeTop.position.set(0, 2.95, -0.2); domeTop.scale.y = 0.7; g.add(domeTop);
  const sandBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.2, 12), steel);
  sandBase.position.set(0, 2.66, -0.75); g.add(sandBase);
  const sandTop = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), steel);
  sandTop.position.set(0, 2.9, -0.75); sandTop.scale.y = 0.7; g.add(sandTop);

  // bell on the boiler top near the cab
  const bellMount = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), dark);
  bellMount.position.set(0, 2.72, -1.05); g.add(bellMount);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), brassMat);
  bell.position.set(0, 2.9, -1.05); bell.scale.y = 0.85; g.add(bell);

  // red 1869 cab with overhanging roof + glass
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.7, 1.7), red);
  cab.position.set(0, 2.0, -2.3); cab.castShadow = cab.receiveShadow = true; g.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 2.0), dark);
  cabRoof.position.set(0, 2.86, -2.3); cabRoof.castShadow = true; g.add(cabRoof);
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.9), glassMat);
    win.position.set(sx * 1.16, 2.15, -2.3); g.add(win);
  }
  const fwin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.4, 0.05), glassMat);
  fwin.position.set(0, 2.3, -1.48); g.add(fwin);

  // firebox wrapper under the cab front / boiler rear
  const firebox = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.3, 0.9), iron);
  firebox.position.set(0, 1.5, -1.5); firebox.castShadow = true; g.add(firebox);

  // headlight on a bracket bolted to the smokebox front (NOT floating)
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.2), dark);
  bracket.position.set(0, 1.95, 2.12); g.add(bracket);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.3), dark);
  lamp.position.set(0, 2.28, 2.24); lamp.castShadow = true; g.add(lamp);
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xfff7c7, emissive: 0xffdd66, emissiveIntensity: 1.1 })
  );
  lens.position.set(0, 2.28, 2.42); g.add(lens);
  const lampCap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.36), dark);
  lampCap.position.set(0, 2.52, 2.24); g.add(lampCap);

  // pilot beam + forward cowcatcher wedge at the front
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.3), dark);
  beam.position.set(0, 1.02, 3.32); beam.castShadow = true; g.add(beam);
  const catcher = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.85, 0.6, 4), steel);
  catcher.rotation.x = Math.PI / 2;   // wedge pointing forward (+Z)
  catcher.position.set(0, 0.78, 3.42); catcher.castShadow = true; g.add(catcher);

  // red accent stripe along the running board
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.3, 6.65), red);
  stripe.position.set(0, 0.75, 0); g.add(stripe);

  // static side rods on the drivers (outside the wheel faces)
  for (const sx of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.8), steel);
    rod.position.set(sx * 1.26, 0.57, -0.6);
    g.add(rod);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.05, 0.57, -2.5], [1.05, 0.57, -2.5],
    [-1.05, 0.57, -0.7], [1.05, 0.57, -0.7],
    [-1.05, 0.57, 1.3], [1.05, 0.57, 1.3],
    [-1.05, 0.57, 2.9], [1.05, 0.57, 2.9],
  ], true);
  return g;
}

// Simple boxcar.
function makeBoxcar(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 5.2), bodyMat);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 4.9), bodyMat);
  body.position.set(0, 1.95, 0); body.castShadow = body.receiveShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 5.1), trim);
  roof.position.set(0, 3.05, 0); roof.castShadow = true; g.add(roof);

  // end door trims
  for (const ez of [-2.42, 2.42]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.06), trim);
    door.position.set(0, 1.95, ez); g.add(door);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.7], [1.0, 0.57, -1.7],
    [-1.0, 0.57, 1.7], [1.0, 0.57, 1.7],
  ]);
  return g;
}

// Proper caboose: red body with a cupola lookout and end platforms.
function makeCaboose() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xb8342f, roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 4.6), red);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.0, 4.2), red);
  body.position.set(0, 1.95, 0); body.castShadow = body.receiveShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 4.4), trim);
  roof.position.set(0, 2.95, 0); roof.castShadow = true; g.add(roof);

  // cupola (lookout on the roof)
  const cup = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.7), trim);
  cup.position.set(0, 3.4, 0); cup.castShadow = true; g.add(cup);
  for (const sx of [-1, 1]) {
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 1.4), glassMat);
    cw.position.set(sx * 0.81, 3.4, 0); g.add(cw);
  }

  // end platforms with railings
  for (const ez of [-2.45, 2.45]) {
    const plat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.5), trim);
    plat.position.set(0, 1.35, ez); g.add(plat);
    for (const sx of [-0.95, 0.95]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), trim);
      post.position.set(sx, 1.7, ez + Math.sign(ez) * 0.28); g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.04), trim);
    rail.position.set(0, 1.95, ez + Math.sign(ez) * 0.28); g.add(rail);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.5], [1.0, 0.57, -1.5],
    [-1.0, 0.57, 1.5], [1.0, 0.57, 1.5],
  ]);
  return g;
}

// Sloped "funnel" used by the hopper cars: a 4-sided truncated pyramid.
// CylinderGeometry(...,4) gives 4 flat faces; a 45° y-rotation squares the
// faces up to the car body. (A square pyramid frustum with the face planes at
// distance 0.707 * radius from the centreline.)
function makeHopperFunnel(topR, bottomR, height, mat) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topR, bottomR, height, 4), mat);
  mesh.rotation.y = Math.PI / 4;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Covered hopper: closed car with a sloped bottom and roof hatches for bulk
// dry goods like grain or cement.
function makeCoveredHopper() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc2b8a6, roughness: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.4, 5.2), trim);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.35, 4.9), bodyMat);
  body.position.set(0, 2.55, 0); body.castShadow = body.receiveShadow = true; g.add(body);
  const hopper = makeHopperFunnel(1.5, 1.0, 1.15, bodyMat);
  hopper.position.set(0, 1.5, 0); g.add(hopper);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.14, 4.95), trim);
  roof.position.set(0, 3.2, 0); roof.castShadow = true; g.add(roof);
  for (const hz of [-1.6, 0, 1.6]) {
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.85), trim);
    hatch.position.set(0, 3.22, hz); g.add(hatch);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.7], [1.0, 0.57, -1.7],
    [-1.0, 0.57, 1.7], [1.0, 0.57, 1.7],
  ]);
  return g;
}

// Open-top hopper: the same sloped floor, but the top is open and heaped with
// coal/gravel.
function makeOpenTopHopper() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x16171b, roughness: 0.9 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.4, 5.2), trim);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.45, 4.9), bodyMat);
  body.position.set(0, 2.55, 0); body.castShadow = body.receiveShadow = true; g.add(body);
  const hopper = makeHopperFunnel(1.42, 0.95, 1.3, bodyMat);
  hopper.position.set(0, 1.55, 0); g.add(hopper);
  for (const zz of [-2.45, 2.45]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 0.12), trim);
    rim.position.set(0, 3.4, zz); rim.castShadow = true; g.add(rim);
  }
  for (const xx of [-1.0, 1.0]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4.9), trim);
    rim.position.set(xx, 3.4, 0); g.add(rim);
  }
  const coal = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 8), coalMat);
  coal.position.set(0, 3.35, 0); coal.scale.set(1, 0.5, 1.6); coal.castShadow = true; g.add(coal);
  const coal2 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), coalMat);
  coal2.position.set(0.55, 3.7, 0.85); coal2.scale.set(1, 0.6, 0.9); g.add(coal2);

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.7], [1.0, 0.57, -1.7],
    [-1.0, 0.57, 1.7], [1.0, 0.57, 1.7],
  ]);
  return g;
}

// Gondola: low open-top car for scrap metal and steel coils.
function makeGondola() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x39464f, roughness: 0.4, metalness: 0.6 });
  const scrapMat = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.7, metalness: 0.4 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.4, 5.3), trim);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 5.1), bodyMat);
  floor.position.set(0, 1.12, 0); floor.castShadow = floor.receiveShadow = true; g.add(floor);
  for (const sx of [-1.05, 1.05]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 5.05), bodyMat);
    wall.position.set(sx, 1.65, 0); wall.castShadow = wall.receiveShadow = true; g.add(wall);
  }
  for (const zz of [-2.55, 2.55]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.95, 0.14), bodyMat);
    wall.position.set(0, 1.65, zz); wall.castShadow = wall.receiveShadow = true; g.add(wall);
  }
  const coilGeo = new THREE.TorusGeometry(0.55, 0.24, 10, 20);
  for (const [cx, cz] of [[-0.55, -1.3], [0.6, 0], [-0.55, 1.3]]) {
    const coil = new THREE.Mesh(coilGeo, coilMat);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(cx, 1.62, cz); coil.castShadow = coil.receiveShadow = true; g.add(coil);
  }
  for (const [cx, cz] of [[0.7, -1.5], [-0.75, 0.5], [0.55, 1.5]]) {
    const lump = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), scrapMat);
    lump.position.set(cx, 1.45, cz); lump.castShadow = true; g.add(lump);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.7], [1.0, 0.57, -1.7],
    [-1.0, 0.57, 1.7], [1.0, 0.57, 1.7],
  ]);
  return g;
}

// Liquid tanker: cylindrical tank for bulk liquids (oil, chemicals).
function makeLiquidTanker() {
  const g = new THREE.Group();
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xe9e1cf, roughness: 0.35, metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.4, 5.3), trim);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 5.0, 16), tankMat);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 1.88, 0); tank.castShadow = tank.receiveShadow = true; g.add(tank);
  for (const zz of [-2.5, 2.5]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.92, 12, 8), tankMat);
    cap.position.set(0, 1.88, zz); cap.castShadow = true; g.add(cap);
  }
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.22, 10), trim);
  domeBase.position.set(0, 2.98, 0); g.add(domeBase);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), trim);
  dome.position.set(0, 3.2, 0); dome.scale.y = 0.7; g.add(dome);

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.7], [1.0, 0.57, -1.7],
    [-1.0, 0.57, 1.7], [1.0, 0.57, 1.7],
  ]);
  return g;
}

// Pressurized gas tanker: fat heavy-gauge tank with rounded ends for
// liquefied gases like propane or anhydrous ammonia.
function makeGasTanker() {
  const g = new THREE.Group();
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x8a9a6b, roughness: 0.5, metalness: 0.4 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.4, 5.0), trim);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 4.4, 14), tankMat);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 1.95, 0); tank.castShadow = tank.receiveShadow = true; g.add(tank);
  for (const zz of [-2.2, 2.2]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), tankMat);
    cap.position.set(0, 1.95, zz); cap.castShadow = true; g.add(cap);
  }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.04, 1.04, 0.12, 14), trim);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, 1.95, -1.6); g.add(band);
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 10), trim);
  domeBase.position.set(0, 3.1, 0); g.add(domeBase);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), trim);
  dome.position.set(0, 3.42, 0); dome.scale.y = 0.75; g.add(dome);

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.6], [1.0, 0.57, -1.6],
    [-1.0, 0.57, 1.6], [1.0, 0.57, 1.6],
  ]);
  return g;
}

// Flatcar: a bare deck for heavy machinery and long piping.
function makeFlatcar() {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.85 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5f4a3a, roughness: 0.5, metalness: 0.5 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.7 });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.26, 5.4), deckMat);
  deck.position.set(0, 1.12, 0); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 5.4), trim);
  sill.position.set(0, 0.8, 0); sill.castShadow = true; g.add(sill);
  for (const sx of [-1.18, 1.18]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 5.4), trim);
    lip.position.set(sx, 1.28, 0); g.add(lip);
  }
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 3.0, 12), pipeMat);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0, 1.32, 1.2); pipe.castShadow = true; g.add(pipe);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), crateMat);
  crate.position.set(-0.15, 1.8, -1.2); crate.castShadow = true; g.add(crate);

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.8], [1.0, 0.57, -1.8],
    [-1.0, 0.57, 1.8], [1.0, 0.57, 1.8],
  ]);
  return g;
}

// Centerbeam flatcar: tall centre beam with bundled lumber on both sides.
function makeCenterbeam() {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.85 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.5, metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 0.85 });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.26, 5.4), deckMat);
  deck.position.set(0, 1.12, 0); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 5.4), trim);
  sill.position.set(0, 0.8, 0); g.add(sill);
  const web = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.1, 5.2), steelMat);
  web.position.set(0, 2.7, 0); web.castShadow = web.receiveShadow = true; g.add(web);
  const tflange = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 5.2), steelMat);
  tflange.position.set(0, 3.8, 0); tflange.castShadow = true; g.add(tflange);
  const bflange = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 5.2), steelMat);
  bflange.position.set(0, 1.6, 0); g.add(bflange);
  for (const sx of [-0.68, 0.68]) {
    const bale = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 5.0), woodMat);
    bale.position.set(sx, 1.55, 0); bale.castShadow = true; g.add(bale);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 5.0), woodMat);
    top.position.set(sx, 2.25, 0); top.castShadow = true; g.add(top);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.8], [1.0, 0.57, -1.8],
    [-1.0, 0.57, 1.8], [1.0, 0.57, 1.8],
  ]);
  return g;
}

// Bulkhead flatcar: sturdy end walls holding long loads like pipes or timber.
function makeBulkhead() {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.85 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4f3f33, roughness: 0.5, metalness: 0.5 });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.26, 5.4), deckMat);
  deck.position.set(0, 1.12, 0); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 5.4), trim);
  sill.position.set(0, 0.8, 0); g.add(sill);
  for (const bz of [-2.7, 2.7]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.2), trim);
    wall.position.set(0, 2.0, bz); wall.castShadow = wall.receiveShadow = true; g.add(wall);
  }
  for (const [px, py] of [[-0.55, 1.45], [0.55, 1.45], [0, 1.95]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 4.7, 12), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, py, 0); pipe.castShadow = true; g.add(pipe);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.75], [1.0, 0.57, -1.75],
    [-1.0, 0.57, 1.75], [1.0, 0.57, 1.75],
  ]);
  return g;
}

// Autorack: tall multi-level enclosed carrier for hauling cars and trucks.
function makeAutorack() {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x386a5e, roughness: 0.6, metalness: 0.3 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 5.4), frameMat);
  frame.position.set(0, 0.9, 0); frame.castShadow = frame.receiveShadow = true; g.add(frame);
  for (const yh of [1.5, 2.9, 4.25]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.12, 5.2), frameMat);
    deck.position.set(0, yh, 0); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  }
  for (const sx of [-1.16, 1.16]) {
    for (const yh of [2.15, 3.55]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 5.2), panelMat);
      panel.position.set(sx, yh, 0); panel.castShadow = true; g.add(panel);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 5.2), panelMat);
      top.position.set(sx, yh + 0.56, 0); g.add(top);
    }
    for (const yh of [2.15, 3.55]) {
      for (const zz of [-2.3, 0, 2.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.06), frameMat);
        post.position.set(sx, yh, zz); g.add(post);
      }
    }
  }
  for (const ez of [-2.65, 2.65]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.7, 0.06), frameMat);
    door.position.set(0, 2.35, ez); g.add(door);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.75], [1.0, 0.57, -1.75],
    [-1.0, 0.57, 1.75], [1.0, 0.57, 1.75],
  ]);
  return g;
}

// Intermodal well car: low-slung bed holding double-stacked containers.
function makeWellCar() {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const c1Mat = new THREE.MeshStandardMaterial({ color: 0xb4532f, roughness: 0.7 });
  const c2Mat = new THREE.MeshStandardMaterial({ color: 0x2f5a8a, roughness: 0.7 });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.35, 5.4), frameMat);
  deck.position.set(0, 1.0, 0); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  for (const sx of [-1.15, 1.15]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 5.4), frameMat);
    rim.position.set(sx, 1.18, 0); g.add(rim);
  }
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.35, 4.6), c1Mat);
  c1.position.set(0, 1.8, 0); c1.castShadow = c1.receiveShadow = true; g.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.35, 4.6), c2Mat);
  c2.position.set(0, 3.15, 0); c2.castShadow = c2.receiveShadow = true; g.add(c2);

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.75], [1.0, 0.57, -1.75],
    [-1.0, 0.57, 1.75], [1.0, 0.57, 1.75],
  ]);
  return g;
}

// Reefer: insulated boxcar with a refrigeration unit on the front end.
function makeReefer() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8e3d8, roughness: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 5.2), trim);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 4.9), bodyMat);
  body.position.set(0, 2.05, 0); body.castShadow = body.receiveShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 5.1), trim);
  roof.position.set(0, 3.17, 0); roof.castShadow = true; g.add(roof);
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 0.5), trim);
  fridge.position.set(0, 1.9, 2.62); fridge.castShadow = true; g.add(fridge);
  const grill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.06), trim);
  grill.position.set(0, 1.9, 2.9); g.add(grill);

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.7], [1.0, 0.57, -1.7],
    [-1.0, 0.57, 1.7], [1.0, 0.57, 1.7],
  ]);
  return g;
}

// Coil car: trough gondola with removable arched hoods for steel coils.
function makeCoilCar() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0x6a7680, roughness: 0.6, metalness: 0.4 });
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x39464f, roughness: 0.45, metalness: 0.6 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.4, 5.3), trim);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const trough = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 4.9), bodyMat);
  trough.position.set(0, 1.65, 0); trough.castShadow = trough.receiveShadow = true; g.add(trough);
  const liner = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.1, 4.65), trim);
  liner.position.set(0, 1.05, 0); g.add(liner);
  const coilGeo = new THREE.TorusGeometry(0.5, 0.2, 10, 18);
  for (const cz of [-1.6, 0, 1.6]) {
    const coil = new THREE.Mesh(coilGeo, coilMat);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0, 1.6, cz); coil.castShadow = true; g.add(coil);
  }
  const capGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10);
  for (const cz of [-1.6, 0, 1.6]) {
    const cap = new THREE.Mesh(capGeo, coilMat);
    cap.position.set(0, 1.55, cz); g.add(cap);
  }
  const hoodGeo = new THREE.CylinderGeometry(1.15, 1.15, 1.3, 16, 1, true, 0, Math.PI);
  for (const hz of [-1.8, 0, 1.8]) {
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.rotation.x = -Math.PI / 2;
    hood.position.set(0, 2.17, hz); hood.castShadow = true; g.add(hood);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.7], [1.0, 0.57, -1.7],
    [-1.0, 0.57, 1.7], [1.0, 0.57, 1.7],
  ]);
  return g;
}

// Stock car: ventilated boxcar with slatted sides for livestock.
function makeStockCar() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 5.2), trim);
  chassis.position.set(0, 0.85, 0); chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.0, 4.9), bodyMat);
  body.position.set(0, 1.95, 0); body.castShadow = body.receiveShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 5.05), trim);
  roof.position.set(0, 2.95, 0); roof.castShadow = true; g.add(roof);
  for (const sx of [-1.16, 1.16]) {
    for (const sy of [1.35, 1.68, 2.01, 2.34]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 4.8), slatMat);
      slat.position.set(sx, sy, 0); g.add(slat);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.4), trim);
    brace.position.set(sx, 1.92, -2.3); g.add(brace);
    const brace2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.4), trim);
    brace2.position.set(sx, 1.92, 2.3); g.add(brace2);
  }

  g.userData.wheels = makeTrainWheels(g, [
    [-1.0, 0.57, -1.7], [1.0, 0.57, -1.7],
    [-1.0, 0.57, 1.7], [1.0, 0.57, 1.7],
  ]);
  return g;
}

// ===== Build the train =====
const TRAIN_SPEED = 6.5;   // it ambles along; the player (top speed 14) can catch it
const SPACING = 6.6;       // gap between unit centres
const UNIT_R = 1.7;        // per-car collision radius

export function addTrain(scene) {
  const path = buildLoopPath();
  buildRails(scene, path);

  const units = [
    makeLocomotive(),
    makeBoxcar(0x8a2b2b),
    makeCoveredHopper(),
    makeOpenTopHopper(),
    makeGondola(),
    makeLiquidTanker(),
    makeGasTanker(),
    makeFlatcar(),
    makeCenterbeam(),
    makeBulkhead(),
    makeAutorack(),
    makeWellCar(),
    makeReefer(),
    makeCoilCar(),
    makeStockCar(),
    makeCaboose(),
  ];
  units.forEach((u) => {
    u.position.y = 0.15;
    scene.add(u);
  });

  let s0 = 0;   // arc position of the locomotive
  const wob = units.map(() => ({ t: Infinity, axis: new THREE.Vector3(1, 0, 0), dir: new THREE.Vector3(1, 0, 0) }));

  function update(delta, ctx) {
    s0 += TRAIN_SPEED * delta;
    const wrapDeltaX = ctx.wrapDeltaX;
    const wrapDeltaZ = ctx.wrapDeltaZ;

    // Move every car along the track (fixed spacing, fixed to the rails).
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const p = sample(path, s0 - i * SPACING);
      const h = Math.atan2(p.tx, p.tz);
      const baseQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h, 0));
      const w = wob[i];
      const pos = new THREE.Vector3(p.x, u.position.y, p.z);
      if (w.t < 1e9) {
        // Wobbling: rock around the hit axis, easing back to upright. The car
        // never leaves the track — it just leans and comes back.
        w.t += delta;
        const decay = Math.exp(-3 * w.t);
        const tilt = Math.sin(w.t * 9) * 0.6 * decay;
        const q = new THREE.Quaternion().setFromAxisAngle(w.axis, tilt);
        u.quaternion.copy(baseQ).premultiply(q);
        pos.addScaledVector(w.dir, 0.3 * decay);
        if (decay < 0.02) w.t = Infinity;
      } else {
        u.quaternion.copy(baseQ);
      }
      u.position.copy(pos);
      for (const wh of u.userData.wheels) wh.rotation.y += TRAIN_SPEED * delta;
    }

    // Running into the train makes the hit car wobble — and the train is
    // solid, so the player/bumper bounce off without ever derailing it.
    const threats = [
      { p: ctx.player, r: ctx.playerR },
      { p: ctx.bumper, r: ctx.bumperR },
    ];
    for (const th of threats) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        // Altitude gate: the train stays on its surface rails, so an
        // underground player driving directly below the track is NOT shoved
        // by an invisible train.
        if (Math.abs(th.p.y - u.position.y) > 6) continue;
        const dx = wrapDeltaX(u.position.x, th.p.x);
        const dz = wrapDeltaZ(u.position.z, th.p.z);
        const min = th.r + UNIT_R;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, nz = dz / d;        // unit -> threat
        const px = -nx, pz = -nz;              // unit pushed away from the hit
        const w = wob[i];
        w.t = 0;
        w.dir.set(px, 0, pz);
        w.axis.crossVectors(new THREE.Vector3(0, 1, 0), w.dir);
        if (w.axis.lengthSq() < 1e-4) w.axis.set(1, 0, 0);
        w.axis.normalize();
        // keep the threat out of the train body
        th.p.x += nx * (min - d);
        th.p.z += nz * (min - d);
      }
    }
  }

  return { update, units, sample, path };
}
