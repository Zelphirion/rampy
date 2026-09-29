import * as THREE from './three-stub.mjs';
import { addCityBuildings, cityDoorTargets } from './undertest-cityBuildings.js';
import { buildCityRoads, buildDriveways } from './undertest-cityRoads.js';

// ===== Shared map materials =====
// The tarmac material now lives in cityRoads.js with the rest of the network.
const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x3a7a3f, roughness: 1 });
const windowMaterial = new THREE.MeshStandardMaterial({
  color: 0x7eb8ff,
  emissive: 0x112b3a,
  emissiveIntensity: 0.8,
  roughness: 0.2,
});

export const PORTAL_HILL = { x: 56, z: 27, baseRadius: 14, topRadius: 6, height: 4 };

export function portalHillHeightAt(x, z) {
  const radius = Math.hypot(x - PORTAL_HILL.x, z - PORTAL_HILL.z);
  if (radius >= PORTAL_HILL.baseRadius) return 0;
  if (radius <= PORTAL_HILL.topRadius) return PORTAL_HILL.height;
  return PORTAL_HILL.height * (PORTAL_HILL.baseRadius - radius) /
    (PORTAL_HILL.baseRadius - PORTAL_HILL.topRadius);
}

// ===== Ground =====
function addGround(scene) {
  // Asymmetric ground: the grass only extends far to the NORTH (the mega-ramp
  // approach field, z up to ~126). The east/west/south edges end at ±90 like
  // the original map. The box overhangs each wrap seam slightly (to ~±95) so
  // no grass edge is ever visible through the seams.
  //
  // The ground is split into four slabs with a rectangular HOLE over the
  // abandoned mine shaft (x -60..-50, z 34..54). The descending-adit
  // excavation lives in that hole, so the car visibly drives DOWN into the
  // shaft instead of sinking below a flat meadow plane.
  const groundY = -0.125;
  const groundH = 0.25;
  const makeSlab = (w, d, x, z) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, groundH, d), grassMaterial);
    slab.position.set(x, groundY, z);
    slab.receiveShadow = true;
    scene.add(slab);
  };
  // South slab: z -95..32 (full width) — hole starts closer to the rocks.
  makeSlab(190, 127, 0, -31.5);
  // North slab: z 44..126 (full width).
  makeSlab(190, 82, 0, 85);
  // West slab: x -95..-61, z 32..44 — wider hole.
  makeSlab(34, 12, -78, 38);
  // East slab: x -49..95, z 32..44 — wider hole.
  makeSlab(144, 12, 23, 38);

  const hill = new THREE.Mesh(
    new THREE.CylinderGeometry(PORTAL_HILL.topRadius, PORTAL_HILL.baseRadius, PORTAL_HILL.height, 48),
    grassMaterial
  );
  hill.position.set(PORTAL_HILL.x, PORTAL_HILL.height / 2, PORTAL_HILL.z);
  hill.castShadow = true;
  hill.receiveShadow = true;
  scene.add(hill);
}

// ===== Roads, crosswalks =====
// The ten-street network, its kerb lines and its centre markings all live in
// cityRoads.js; the town is laid out around them rather than on top of them.
function addRoads(scene) {
  buildCityRoads(scene);
  addCrosswalks(scene);
}

// Zebra crossings at the four spots in the middle of town where people walk.
// Each stripe is about one car long and runs ALONG the direction of travel, and
// the stripes are laid end-to-end ACROSS the carriageway. That is the layout a
// zebra has: the band you drive over is one car deep, but it reaches from one
// kerb to the other, and a walker crosses it side-on, stepping over one stripe
// after another. Laying the long axis across the road instead (or repeating the
// stripes down the centreline) puts the whole crossing in the middle of the
// street rather than joining its two sides.
function addCrosswalks(scene) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf8f8f8, roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  // Exactly four, all in the middle of town where people actually walk. A zebra
  // on every block is just road noise; these four cover the two arterials either
  // side of the junction where most pedestrians are.
  const spots = [
    [-34, 0, 'x'], [34, 0, 'x'],      // the east-west drag, flanking the centre
    [0, -26, 'z'], [0, 30, 'z'],       // the north-south drag, likewise
  ];
  // Each bar is ONE CAR LONG (about 4.6) and no more: a stripe stretched the
  // full width of a 24-wide carriageway reads as a wall, not a crossing.
  const BAR_LEN = 4.6, BAR = 0.9, PITCH = 2.4;
  // The stripes repeat across the road until they reach the kerb on both sides:
  // the arterials are 24 wide, and a 1.1 inset each side leaves 21.8 of
  // carriageway to paint. This is the run that crosses the street.
  const SPAN = 22;
  for (const [x, z, along] of spots) {
    const n = Math.ceil(SPAN / PITCH);
    for (let i = 0; i < n; i++) {
      const t = -SPAN / 2 + PITCH / 2 + i * PITCH;
      // `along` is the direction the street runs, so it is the LONG axis of the
      // bar; t steps across it, perpendicular to travel. On an east-west street
      // that means a wide-short bar repeated in z; on a north-south one it is
      // the other way round.
      const geo = along === 'x'
        ? new THREE.BoxGeometry(BAR_LEN, 0.02, BAR)
        : new THREE.BoxGeometry(BAR, 0.02, BAR_LEN);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(along === 'x' ? x : x + t, 0.25, along === 'x' ? z + t : z);
      m.receiveShadow = true;
      scene.add(m);
    }
  }
}

// ===== Jump ramps =====
function addRamps(scene) {
  const rampMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4653, roughness: 0.98 });
  // A launch ramp is a triangular wedge: flat base on the ground, sloped face
  // rising from the base (low end) up to `height` at the top (high end).
  // Each ramp carries its own dimensions + launch boost so one can be a giant.
  // `run` is the world direction from the base to the top (the direction you
  // drive to go UP the ramp). The car launches off the high end. `boost` is a
  // launch-velocity multiplier (1 = natural ballistic arc off the top).
  const ramps = [
    // Moved from the west edge of town (-70,0) to the east side of the main
    // road (24,0): the old spot launched you straight at the west map wall
    // (you flew off the edge of the world). Now it still launches west, but
    // the arc carries you toward town centre and lands well inside the map.
    { x: 24, z: 0, runX: -1, runZ: 0, len: 8, width: 7, height: 4, boost: 1 },                     // rises toward -X (west)
    { x: 70, z: 70, runX: -Math.SQRT1_2, runZ: Math.SQRT1_2, len: 8, width: 7, height: 4, boost: 1 }, // rises toward NW
    // MEGA RAMP — a giant kicker on the NORTH end of the cross road (moved
    // here from the south end per request: "the other end of town where it is
    // not so crowded" — the south end has the parking lot + trees around it).
    // It is 34 tall (the tallest building is 13), so it towers over
    // everything, and its 40-long slope launches the car south straight over
    // the town centre. base z=+80 (low end) -> top z=+40 (high end), run -Z.
    // It's a thin one-foot board now (board:true): only the low end touches
    // the ground, so you can drive UNDER the elevated part, ride up the top
    // surface, and still launch off the high end.
    { x: 0, z: 60, runX: 0, runZ: -1, len: 40, width: 7, height: 34, boost: 1.4, board: true, thickness: 1, enterTol: 1.2, stayTol: 3 },
  ];
  ramps.forEach((r) => {
    let m;
    if (r.board) {
      // "One foot thick" board ramp: instead of a solid wedge (which fills the
      // whole footprint with ground-level concrete and can't be driven under),
      // this is a thin plank stuck into the ground at an angle. It only touches
      // the ground at the low end; the rest is elevated, so you can drive UNDER
      // it, ride up and over the top surface, and launch off the high end.
      // `slopeLen` is the true length of the sloped face; we tilt the plank by
      // `slopeAngle` so its base edge sits at ground level and its far edge
      // reaches `height`.
      const slopeLen = Math.hypot(r.len, r.height);
      const slopeAngle = Math.atan2(r.height, r.len);
      const geo = new THREE.BoxGeometry(slopeLen, r.thickness, r.width);
      geo.rotateZ(slopeAngle);           // tilt the long axis up the slope
      geo.translate(0, r.height / 2, 0); // center it on the slope midpoint
      m = new THREE.Mesh(geo, rampMaterial);
      // +X (low end -> high end) lines up with the run direction
      m.rotation.y = Math.atan2(-r.runZ, r.runX);
      m.position.set(r.x, 0, r.z);
    } else {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(r.len, 0);
      shape.lineTo(r.len, r.height);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: r.width, bevelEnabled: false });
      geo.translate(-r.len / 2, 0, -r.width / 2); // center wedge on its midpoint
      m = new THREE.Mesh(geo, rampMaterial);
      // Rotate so the wedge's +X (base -> top) lines up with the run direction
      m.rotation.y = Math.atan2(-r.runZ, r.runX);
      m.position.set(r.x, 0, r.z);
    }
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  });
  return { ramps };
}

// ===== Open building with hovering rings =====
// Creates a building with one side open (facing the edge of the map) and
// glowing hovering rings inside that float upward.
const hoveringRings = []; // stored for animation

function makeHilltopPortal(scene) {
  const group = new THREE.Group();
  // Floating concentric glowing rings stacked vertically above the hill like
  // a column of light the car floats UP through during the levitation sequence.
  // Larger rings sit near the ground, progressively smaller ones higher up —
  // the car threads through the whole tower on its way to the sky.  Every
  // ring is a shade of green so the whole column reads as a glowing green
  // beacon.  Each ring bobs gently up/down out of phase.
  const ringDefs = [
    { r: 5.8, y: 3 },
    { r: 5.2, y: 12 },
    { r: 4.5, y: 22 },
    { r: 3.8, y: 34 },
    { r: 3.0, y: 48 },
    { r: 2.2, y: 64 },
    { r: 1.6, y: 82 },
    { r: 1.1, y: 100 },
  ];
  ringDefs.forEach((def, i) => {
    const t = i / (ringDefs.length - 1);  // 0 = lowest, 1 = highest
    const hue = 0.36 - t * 0.08;          // forest green → bright spring green
    const sat = 0.88;
    const light = 0.32 + t * 0.4;         // upper rings glow brighter
    const color = new THREE.Color().setHSL(hue, sat, light);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(def.r, 0.28, 16, 48),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.8 + t * 0.8,
        roughness: 0.25,
        metalness: 0.6,
        transparent: true,
        opacity: 0.88,
      })
    );
    ring.rotation.x = Math.PI / 2;   // lie flat, face the sky
    ring.position.y = def.y;
    group.add(ring);
    hoveringRings.push({ mesh: ring, baseY: def.y, speed: 0.35 + i * 0.04, phase: i * 0.7 });
  });
  const portalLight = new THREE.PointLight(0x33ff66, 14, 40, 2);
  portalLight.position.y = PORTAL_HILL.height + 2;
  group.add(portalLight);
  group.position.set(PORTAL_HILL.x, 0, PORTAL_HILL.z);
  scene.add(group);
}

function makeOpenBuilding(scene, x, z, w, d, h, color, openSide) {
  const group = new THREE.Group();
  const wallThickness = 0.4;

  // Create 3 walls — the open side is always built as +X, then we rotate
  const wallMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });

  // West wall (perpendicular to X axis, at -X edge)
  const westWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, h, d),
    wallMaterial
  );
  westWall.position.set(-w / 2 + wallThickness / 2, h / 2, 0);
  westWall.castShadow = true;
  westWall.receiveShadow = true;
  group.add(westWall);

  // North wall (perpendicular to Z axis, at +Z edge)
  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, wallThickness),
    wallMaterial
  );
  northWall.position.set(0, h / 2, d / 2 - wallThickness / 2);
  northWall.castShadow = true;
  northWall.receiveShadow = true;
  group.add(northWall);

  // South wall (perpendicular to Z axis, at -Z edge)
  const southWall = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, wallThickness),
    wallMaterial
  );
  southWall.position.set(0, h / 2, -d / 2 + wallThickness / 2);
  southWall.castShadow = true;
  southWall.receiveShadow = true;
  group.add(southWall);

  // Floor (top sits flush with the car's ground height (0.15) so the wheels
  // don't sink into a raised slab when you drive in)
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.3, d),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 })
  );
  floor.position.y = 0;
  floor.receiveShadow = true;
  group.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.3, d),
    new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.9 })
  );
  ceiling.position.y = h;
  ceiling.castShadow = true;
  ceiling.receiveShadow = true;
  group.add(ceiling);

  // Roof
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.25, 0.35, d + 0.25),
    new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.9 })
  );
  roof.position.y = h + 0.08;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Add windows on the west wall (back wall, opposite the open east side).
  // Row heights and column spread scale with the building so a tall hall gets
  // windows climbing its whole back wall instead of huddling near the floor.
  const windowGeometry = new THREE.BoxGeometry(0.08, 0.6, 0.22);
  const windowGroup = new THREE.Group();
  windowGroup.position.set(-w / 2 - 0.1, 0, 0);
  for (let row = 0; row < 3; row++) {
    for (let col = -1; col <= 1; col++) {
      const mesh = new THREE.Mesh(windowGeometry, windowMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(0, h * (0.25 + row * 0.2) + 0.4, col * d * 0.06);
      windowGroup.add(mesh);
    }
  }
  group.add(windowGroup);

  // Add glowing hovering rings inside. The stack scales with the hall: more
  // rings for taller buildings, spread evenly up most of the height, and the
  // rings themselves grow with the footprint so they don't look lost in a
  // huge room.
  const ringCount = Math.max(5, Math.round(h / 3));
  const ringSpacing = (h * 0.82 - 1.5) / (ringCount - 1);
  const ringR = Math.max(0.8, w * 0.05);
  const ringTube = Math.max(0.12, w * 0.008);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 2,
    roughness: 0.2,
    metalness: 0.8,
    transparent: true,
    opacity: 0.8
  });

  for (let i = 0; i < ringCount; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringR, ringTube, 16, 32),
      ringMaterial.clone()
    );
    // Position rings stacked vertically inside the building
    const ringY = 1.5 + i * ringSpacing;
    ring.position.set(0, ringY, 0);
    ring.rotation.x = Math.PI / 2; // Lay flat
    ring.castShadow = true;
    group.add(ring);

    // Store ring info for animation
    hoveringRings.push({
      mesh: ring,
      baseY: ringY,
      speed: 0.5 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2
    });
  }

  // Giant glowing portal ring standing in the open doorway — once you round
  // the building and spot it there's no missing the way in. It bobs gently and
  // pulses with the same animation that drives the interior rings. The car
  // drives straight through its opening (the hole is far taller than the car).
  // Size and height scale off the building so a bigger hall gets a bigger ring.
  const doorRing = new THREE.Mesh(
    new THREE.TorusGeometry(w * 0.18, Math.max(0.28, w * 0.02), 14, 48),
    ringMaterial.clone()
  );
  doorRing.position.set(w / 2 + 0.6, h * 0.32, 0);
  doorRing.rotation.y = Math.PI / 2;   // stand upright, facing the open side
  doorRing.castShadow = true;
  group.add(doorRing);
  hoveringRings.push({ mesh: doorRing, baseY: h * 0.32, speed: 0.35, phase: Math.random() * Math.PI * 2 });

  // Glowing threshold strip across the doorway floor — lights the entrance
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.08, d - 2),
    new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.6, roughness: 0.4 })
  );
  threshold.position.set(w / 2 - 1.2, 0.2, 0);
  group.add(threshold);

  group.position.set(x, 0, z);

  // Rotate based on open side
  if (openSide === 'east') group.rotation.y = 0;
  else if (openSide === 'west') group.rotation.y = Math.PI;
  else if (openSide === 'north') group.rotation.y = Math.PI / 2;
  else if (openSide === 'south') group.rotation.y = -Math.PI / 2;

  scene.add(group);
  return group;
}

// Update hovering rings animation
export function updateHoveringRings(time) {
  for (const ring of hoveringRings) {
    // Hover upward with sinusoidal motion
    ring.mesh.position.y = ring.baseY + Math.sin(time * ring.speed + ring.phase) * 0.3;
    // Slow rotation
    ring.mesh.rotation.z = time * 0.3 + ring.phase;
    // Pulsing emissive intensity
    ring.mesh.material.emissiveIntensity = 1.5 + Math.sin(time * 2 + ring.phase) * 0.5;
  }

}

function addBuildings(scene, buildingColliders) {
  // The city is built from twelve landmark buildings in cityBuildings.js rather
  // than the old grid of identical boxes; it keeps two of the old blocks.
  addCityBuildings(scene, buildingColliders);
  makeHilltopPortal(scene);
}

// ===== Build everything =====
export function buildMap(scene) {
  const buildingColliders = [];
  addGround(scene);
  addRoads(scene);
  const { ramps } = addRamps(scene);
  addBuildings(scene, buildingColliders);
  // A ribbon of tarmac from every front door to the nearest street, so all
  // fourteen buildings are genuinely drivable-up-to.
  const { driveways } = buildDriveways(scene, cityDoorTargets());
  return { buildingColliders, ramps, driveways };
}
