import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== Shared map materials =====
const streetMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 1 });
const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.95 });
const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x3a7a3f, roughness: 1 });
const windowMaterial = new THREE.MeshStandardMaterial({
  color: 0x7eb8ff,
  emissive: 0x112b3a,
  emissiveIntensity: 0.8,
  roughness: 0.2,
});
const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4026, roughness: 1 });

// ===== Ground =====
function addGround(scene) {
  // Asymmetric ground: the grass only extends far to the NORTH (the mega-ramp
  // approach field, z up to ~126). The east/west/south edges end at ±90 like
  // the original map. The box overhangs each wrap seam slightly (to ~±95) so
  // no grass edge is ever visible through the seams.
  const ground = new THREE.Mesh(new THREE.BoxGeometry(190, 0.25, 221), grassMaterial);
  ground.position.set(0, -0.125, 15.5);
  ground.receiveShadow = true;
  scene.add(ground);
}

// ===== Roads, sidewalks, crosswalks =====
function addRoads(scene) {
  const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(160, 0.2, 24), streetMaterial);
  mainRoad.position.set(0, 0.13, 0);
  mainRoad.receiveShadow = true;
  scene.add(mainRoad);

  // Cross road: same surface, but with a polygon offset so its top face never
  // z-fights the main road where the two overlap at the centre.
  const crossRoadMat = streetMaterial.clone();
  crossRoadMat.polygonOffset = true;
  crossRoadMat.polygonOffsetFactor = -1;
  crossRoadMat.polygonOffsetUnits = -1;
  const crossRoad = new THREE.Mesh(new THREE.BoxGeometry(24, 0.2, 160), crossRoadMat);
  crossRoad.position.set(0, 0.13, 0);
  crossRoad.receiveShadow = true;
  scene.add(crossRoad);

  // Sidewalks form a ring at ±42. The north/south edges run along Z (rotated
  // 90°), and their tops sit clearly above the road as a curb so the two can
  // never z-fight where they overlap.
  const sidewalks = [];
  const sidewalkWidths = [24, 24, 26, 26];
  for (let i = 0; i < sidewalkWidths.length; i++) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(160, 0.18, sidewalkWidths[i]), sidewalkMaterial);
    side.position.set(0, 0.21, 0);            // top = 0.30, a 0.07 curb above the road
    if (i >= 2) side.rotation.y = Math.PI / 2; // N/S sidewalks run along Z
    side.receiveShadow = true;
    sidewalks.push(side);
  }
  sidewalks[0].position.z = -42;
  sidewalks[1].position.z = 42;
  sidewalks[2].position.x = -42;
  sidewalks[3].position.x = 42;
  scene.add(...sidewalks);

  const crosswalkMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(6, 0.16, 24), crosswalkMaterial);
    cross.position.set(i % 2 === 0 ? -20 : 20, 0.26, i < 2 ? -42 : 42);  // top = 0.34, above the curb
    cross.receiveShadow = true;
    scene.add(cross);
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

// ===== Buildings =====
function makeBuilding(scene, x, z, w, d, h, color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  );
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.25, 0.35, d + 0.25),
    new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.9 })
  );
  roof.position.y = h + 0.08;   // sink the overhang into the body — no coplanar seam
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const windowGeometry = new THREE.BoxGeometry(0.22, 0.6, 0.08);
  const doorGeometry = new THREE.BoxGeometry(0.7, 1.15, 0.12);

  const addWindowRow = (face, row, col, offsetX = 0, offsetZ = 0) => {
    const mesh = new THREE.Mesh(windowGeometry, windowMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(offsetX, row * 0.9 + 0.7, offsetZ);
    face.add(mesh);
  };

  const front = new THREE.Group();
  front.position.set(0, 0, d / 2 + 0.1);
  body.add(front);
  const back = new THREE.Group();
  back.position.set(0, 0, -(d / 2 + 0.1));
  body.add(back);
  const left = new THREE.Group();
  left.position.set(-(w / 2 + 0.1), 0, 0);
  body.add(left);
  const right = new THREE.Group();
  right.position.set(w / 2 + 0.1, 0, 0);
  body.add(right);

  for (let row = 0; row < 3; row++) {
    for (let col = -1; col <= 1; col++) {
      const x = col * 0.45;
      addWindowRow(front, row, col, x, 0);
      addWindowRow(back, row, col, x, 0);
      addWindowRow(left, row, col, 0, x);
      addWindowRow(right, row, col, 0, x);
    }
  }

  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, 0.58, d / 2 + 0.12);
  door.castShadow = true;
  door.receiveShadow = true;
  body.add(door);

  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

// ===== Open building with hovering rings =====
// Creates a building with one side open (facing the edge of the map) and
// glowing hovering rings inside that float upward.
const hoveringRings = []; // stored for animation

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

  // Floor (raised slightly so it doesn't z-fight with the ground)
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.3, d),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 })
  );
  floor.position.y = 0.3;
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

  // Add windows on the west wall (back wall, opposite the open east side)
  const windowGeometry = new THREE.BoxGeometry(0.08, 0.6, 0.22);
  const windowGroup = new THREE.Group();
  windowGroup.position.set(-w / 2 - 0.1, 0, 0);
  for (let row = 0; row < 3; row++) {
    for (let col = -1; col <= 1; col++) {
      const mesh = new THREE.Mesh(windowGeometry, windowMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(0, row * 0.9 + 0.7, col * 0.45);
      windowGroup.add(mesh);
    }
  }
  group.add(windowGroup);

  // Add glowing hovering rings inside
  const ringCount = 5;
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
      new THREE.TorusGeometry(0.8, 0.12, 16, 32),
      ringMaterial.clone()
    );
    // Position rings stacked vertically inside the building
    ring.position.set(0, 1.5 + i * 1.8, 0);
    ring.rotation.x = Math.PI / 2; // Lay flat
    ring.castShadow = true;
    group.add(ring);

    // Store ring info for animation
    hoveringRings.push({
      mesh: ring,
      baseY: 1.5 + i * 1.8,
      speed: 0.5 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2
    });
  }

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
  const buildingSpecs = [
    { x: -56, z: -54, w: 8, d: 8, h: 10, color: 0x7a5d45 },
    { x: -34, z: -54, w: 10, d: 6, h: 12, color: 0x5a6b78 },
    { x: -12, z: -54, w: 7, d: 8, h: 8, color: 0x8b6d3f },
    { x: 12, z: -54, w: 8, d: 7, h: 9, color: 0x5f4e51 },
    { x: 36, z: -54, w: 9, d: 9, h: 11, color: 0x7d6f60 },
    { x: -56, z: -24, w: 9, d: 6, h: 7, color: 0x4d6372 },
    { x: -32, z: -24, w: 6, d: 7, h: 8, color: 0x825d4b },
    { x: 0, z: -24, w: 10, d: 8, h: 13, color: 0x6e5f52 },
    { x: 26, z: -24, w: 7, d: 7, h: 10, color: 0x6e7d6e },
    { x: 54, z: -24, w: 8, d: 8, h: 6, color: 0x4b5a62 },
    { x: -56, z: 12, w: 7, d: 7, h: 9, color: 0x6f5d56 },
    { x: -28, z: 12, w: 8, d: 8, h: 8, color: 0x465c5c },
    { x: 6, z: 12, w: 11, d: 9, h: 12, color: 0x7d6a4f },
    { x: 36, z: 12, w: 8, d: 7, h: 7, color: 0x4f5c63 },
  ];

  buildingSpecs.forEach((spec) => {
    makeBuilding(scene, spec.x, spec.z, spec.w, spec.d, spec.h, spec.color);
    buildingColliders.push({ x: spec.x, z: spec.z, halfW: spec.w / 2, halfD: spec.d / 2, h: spec.h });
  });

  // Special building at east edge with open side facing east (toward map edge)
  const openBuildingSpec = { x: 56, z: 12, w: 8, d: 8, h: 10, color: 0x6d4f3f };
  makeOpenBuilding(scene, openBuildingSpec.x, openBuildingSpec.z, openBuildingSpec.w, openBuildingSpec.d, openBuildingSpec.h, openBuildingSpec.color, 'east');
  // Instead of a full rectangle (which blocks the open east side), add 3 wall
  // colliders: back (west), north, and south — leaving the east side open.
  const wt = 0.4; // wall thickness for collider half-width
  const ow = openBuildingSpec.x, oz = openBuildingSpec.z;
  const obw = openBuildingSpec.w, obd = openBuildingSpec.d, obh = openBuildingSpec.h;
  // West wall collider (full depth)
  buildingColliders.push({ x: ow - obw / 2 + wt / 2, z: oz, halfW: wt / 2, halfD: obd / 2, h: obh });
  // North wall collider (full width)
  buildingColliders.push({ x: ow, z: oz + obd / 2 - wt / 2, halfW: obw / 2, halfD: wt / 2, h: obh });
  // South wall collider (full width)
  buildingColliders.push({ x: ow, z: oz - obd / 2 + wt / 2, halfW: obw / 2, halfD: wt / 2, h: obh });
}

// ===== Build everything =====
export function buildMap(scene) {
  const buildingColliders = [];
  addGround(scene);
  addRoads(scene);
  const { ramps } = addRamps(scene);
  addBuildings(scene, buildingColliders);
  return { buildingColliders, ramps };
}
