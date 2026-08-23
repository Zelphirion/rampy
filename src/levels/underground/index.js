import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addGlassCity } from '../../glasscity.js';

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

const TUNNEL = {
  cx: -58, cz: 104,
  R: 21,
  halfW: 3.5,
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
  // sweeps through the car (task #13, dirX = ±1 travel direction). Lets the
  // callers own the physics response without the level knowing how.
  const onBlockBump = typeof opts.onBlockBump === 'function' ? opts.onBlockBump : null;
  const onPipeShove = typeof opts.onPipeShove === 'function' ? opts.onPipeShove : null;

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2b2627, roughness: 1 });
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x241f20, roughness: 1, side: THREE.DoubleSide });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3434, roughness: 1 });

  const tubeR = 5;
  const localY = (absY) => absY - UNDERGROUND_Y;

  const plain = new THREE.Mesh(new THREE.BoxGeometry(292, 0.25, 276), rockMat);
  plain.position.set(0, -0.145, 41.5);
  plain.receiveShadow = true;
  parent.add(plain);

  const pts = pathSamples.map((p) => new THREE.Vector3(p.x, localY(p.y) + tubeR, p.z));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, N, tubeR, 20, false), tubeMat);
  tube.castShadow = true;
  parent.add(tube);

  const markerR = tubeR - 1.6;
  for (let i = 1; i <= 30; i++) {
    const s = i / 30;
    const p = tunnelPoint(s);
    const th = TUNNEL.theta0 + TUNNEL.sweep * s;
    const nx = Math.cos(th), nz = Math.sin(th);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), makeGlowMat(NEON.amber));
      m.position.set(p.x + nx * markerR * side, localY(p.y) + 0.12, p.z + nz * markerR * side);
      parent.add(m);
    }
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
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(ceilMaxX - ceilMinX, 1, ceilMaxZ - ceilMinZ),
    rockMat
  );
  ceiling.position.set((ceilMinX + ceilMaxX) / 2, CEIL_Y + 0.5, (ceilMinZ + ceilMaxZ) / 2);
  parent.add(ceiling);

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
  function addUgRamp(def) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(def.len, 0);
    shape.lineTo(def.len, def.height);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: def.width, bevelEnabled: false });
    geo.translate(-def.len / 2, 0, -def.width / 2);   // center wedge on its midpoint
    const m = new THREE.Mesh(geo, rampMaterial);
    m.rotation.y = Math.atan2(-def.runZ, def.runX);   // +X (base→top) lines up with run direction
    m.position.set(def.x, 0, def.z);
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
  const ELEV = { cx: 44, cz: -31, halfW: 5, halfD: 3.5, low: 0.55, high: 9, speed: 0.5 };
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

  // ---- Upper ledges / tiers (task #19) ----
  // Static walkways at the elevator's top height ringing the pit, so driving
  // off the lift at apex carries you onto a tier instead of a long fall.
  // Slabs use `soft` colliders: they feed buildingTopAt / the soft-surface
  // ride logic (land on them, roll across deck→ledge seamlessly) but never
  // wall off grounded driving underneath. Support pylons are solid.
  const LEDGE_Y = ELEV.high;
  const LEDGES = [
    { cx: 46, cz: -23.5, halfW: 9, halfD: 4, pylons: [[37, -19.5], [55, -19.5]] },  // north of the deck
    { cx: 55, cz: -31,   halfW: 6, halfD: 7, pylons: [[61, -24], [61, -38]] },      // east of the deck
    { cx: 42, cz: -38.5, halfW: 9, halfD: 4, pylons: [[33, -42.5], [51, -42.5]] },  // south of the deck
  ];
  const ledgeColliders = [];
  const pylonGeo = new THREE.CylinderGeometry(0.5, 0.6, LEDGE_Y, 10);
  for (const L of LEDGES) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(L.halfW * 2, 0.5, L.halfD * 2), elevMat);
    slab.position.set(L.cx, LEDGE_Y - 0.25, L.cz);
    slab.castShadow = true;
    slab.receiveShadow = true;
    parent.add(slab);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(L.halfW * 2 + 0.24, 0.18, L.halfD * 2 + 0.24),
      makeGlowMat(NEON.lime)
    );
    stripe.position.set(L.cx, LEDGE_Y - 0.41, L.cz);
    parent.add(stripe);
    ledgeColliders.push({ x: L.cx, z: L.cz, halfW: L.halfW, halfD: L.halfD, h: LEDGE_Y, soft: true });
    for (const [px, pz] of L.pylons) {
      const pylon = new THREE.Mesh(pylonGeo, pillarMat);
      pylon.position.set(px, LEDGE_Y / 2, pz);
      pylon.castShadow = true;
      parent.add(pylon);
      ledgeColliders.push({ x: px, z: pz, halfW: 0.5, halfD: 0.5, h: LEDGE_Y });
    }
  }

  const glassCity = addGlassCity(parent);
  const cityGlow = new THREE.PointLight(0x9fb8ff, 2.4, 190, 1);
  cityGlow.position.set(0, 26, 152);
  parent.add(cityGlow);

  const colliders = [...pillarColliders, ...columnColliders, ...pipePostColliders, ...pitRimColliders, ...elevatorColliders, ...ledgeColliders, ...glassCity.colliders];

  let bumpCount = 0;
  let lastBump = null;
  let elapsed = 0;   // course clock for sine-animated props (conduits, …)
  let prevX = 0, prevY = 0, prevZ = 0, havePrev = false;

  return {
    colliders,
    ramps: ugRamps,
    promptBlocks,
    foamPieces,
    spawnFoam,   // exposed for the ?debug test hook (foam-cap recycling)
    conduitPipes,
    get bumpCount() { return bumpCount; },
    get lastBump() { return lastBump; },
    update(delta, player) {
      glassCity.update(delta, player);
      elapsed += delta;
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
