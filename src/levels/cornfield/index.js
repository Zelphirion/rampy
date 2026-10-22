import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  CORN_GROUND, CORN_SPAWN, CORN_RETURN, BARN, BARN_RAMP, SILO, WATER_TOWER,
  CORNFIELD_RECT, PUMPKIN_PATCH, CORN,
  ORCHARD, APPLE_TREE, SQUIRREL, squirrelThrowHits, TRACTOR,
  BARREL_STACKS, HILL, FARM_TRUCK, FARM_BOUNDS, BRICK_WALL, ROLLING,
  hillHeightAt,
  PASTURE, PASTURE_FENCE_H, BULL, pastureFenceColliders, pastureFenceBayDefs,
  RIVER, riverAt, riverFlowAt, riverSurfaceY, riverWallColliders,
  MILL, millColliders, FARM_HOUSE, farmHouseColliders,
  PORCH, farmPorchColliders, porchTopAt,
  barnColliders, siloColliders, waterTowerColliders, cornGrid,
  shouldKnockStalk, stepPumpkin, stepBarrel, PUMPKIN_VINE_BREAK,
  orchardGrid, barrelPyramid, plateauTopAt, hillColliders, farmBoundsColliders,
} from './layout.js?v=1800000000019';

// ===== The Cornfield =====
// A new world reached by driving through the arch in the giant tree in the
// city's outer belt. Everything the player asked for lives here:
//   * a corn field you flatten by driving through it (stalks bend flat and
//     stay flat; cobs fly off) so you can carve visible trails;
//   * a red barn with a drive-in ground floor, a wooden ramp up to a hayloft
//     and hay that explodes into the air when you hare around up there;
//   * a closed silo standing in a clearing of the corn (scenery only — no
//     drive-in, no interior);
//   * a pumpkin patch on the level top of the north plateau: snaky ground
//     vines plus giant pumpkins that drag their runner vine, tear it off and
//     roll away when you hit them.
//
// main.js owns the world switch and the cars' Y here; this module owns the
// meshes and a small `update(delta, ...cars)` that runs each frame with every
// car on the farm as an actor.

const TWO_PI = Math.PI * 2;
// Half the ground mesh extent; the river trench is cut the full length of it
// so the water visibly runs off past the boundary fence at both ends.
const GROUND_EX = 180;

// ---- Palette ---------------------------------------------------------------
const M = {
  grass: new THREE.MeshStandardMaterial({ color: 0x5f8f43, roughness: 1 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x6a5136, roughness: 1 }),
  barn: new THREE.MeshStandardMaterial({ color: 0xa8321f, roughness: 0.85 }),
  barnTrim: new THREE.MeshStandardMaterial({ color: 0xe9e3d5, roughness: 0.8 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x5b2018, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9c6b3a, roughness: 0.9 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x704a26, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xc2c8cc, roughness: 0.5, metalness: 0.35 }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x8b9196, roughness: 0.6, metalness: 0.3 }),
  waterTank: new THREE.MeshStandardMaterial({ color: 0x9db9cf, roughness: 0.55, metalness: 0.25 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x3f86c4, transparent: true, opacity: 0.72,
    roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide,
  }),
  foam: new THREE.MeshStandardMaterial({
    color: 0xeef6fb, transparent: true, opacity: 0.55, roughness: 0.6,
  }),
  stone: new THREE.MeshStandardMaterial({ color: 0x9b9384, roughness: 0.95 }),
  houseWall: new THREE.MeshStandardMaterial({ color: 0xe8dcc3, roughness: 0.9 }),
  houseTrim: new THREE.MeshStandardMaterial({ color: 0x704a26, roughness: 0.9 }),
  window: new THREE.MeshStandardMaterial({
    color: 0x9fc2df, emissive: 0x22384c, emissiveIntensity: 0.7, roughness: 0.3,
  }),
  // Farmhouse: whitewashed clapboard, a red-brick chimney on a rugged stone
  // footing, dark shutters and ironwork, and polished brass door furniture.
  clapboard: new THREE.MeshStandardMaterial({ color: 0xefe9db, roughness: 0.88 }),
  clapboardShade: new THREE.MeshStandardMaterial({ color: 0xd7cfbd, roughness: 0.92 }),
  shutter: new THREE.MeshStandardMaterial({ color: 0x3c2a1c, roughness: 0.9 }),
  brickDark: new THREE.MeshStandardMaterial({ color: 0x7c3a29, roughness: 0.96 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x2b2b2f, roughness: 0.55, metalness: 0.55 }),
  plank: new THREE.MeshStandardMaterial({ color: 0x8a5c30, roughness: 0.85 }),
  plankDark: new THREE.MeshStandardMaterial({ color: 0x5e3c1e, roughness: 0.9 }),
  glassPane: new THREE.MeshStandardMaterial({
    color: 0xaecbe0, emissive: 0x33485c, emissiveIntensity: 0.5,
    roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85,
  }),
  foundationStone: new THREE.MeshStandardMaterial({ color: 0x8f887a, roughness: 1 }),
  stalk: new THREE.MeshStandardMaterial({ color: 0x4f8f3b, roughness: 0.9 }),
  husk: new THREE.MeshStandardMaterial({ color: 0x8fbf57, roughness: 0.9 }),
  cob: new THREE.MeshStandardMaterial({ color: 0xf2c53d, roughness: 0.7 }),
  hay: new THREE.MeshStandardMaterial({ color: 0xe3cd74, roughness: 0.95 }),
  pumpkin: new THREE.MeshStandardMaterial({ color: 0xe2761f, roughness: 0.7 }),
  pumpkinDark: new THREE.MeshStandardMaterial({ color: 0xc25f16, roughness: 0.7 }),
  stem: new THREE.MeshStandardMaterial({ color: 0x4e7a2e, roughness: 0.9 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x356b32, roughness: 1 }),
  apple: new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.45 }),
  orchardLeaf: new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 1 }),
  barrel: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 }),
  hoop: new THREE.MeshStandardMaterial({ color: 0x6b7075, roughness: 0.5, metalness: 0.4 }),
  tractor: new THREE.MeshStandardMaterial({ color: 0xb8431d, roughness: 0.7 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.4 }),
  dogFur: new THREE.MeshStandardMaterial({ color: 0xb98a54, roughness: 0.9 }),
  dogDark: new THREE.MeshStandardMaterial({ color: 0x6f4a26, roughness: 0.9 }),
  hat: new THREE.MeshStandardMaterial({ color: 0xe8c766, roughness: 0.9 }),
  truck: new THREE.MeshStandardMaterial({ color: 0x3f6d4a, roughness: 0.75 }),
  squirrel: new THREE.MeshStandardMaterial({ color: 0xa9682f, roughness: 0.9 }),
  squirrelBelly: new THREE.MeshStandardMaterial({ color: 0xe8d3b0, roughness: 0.9 }),
  appleRed: new THREE.MeshStandardMaterial({ color: 0xc62b22, roughness: 0.6 }),
  bull: new THREE.MeshStandardMaterial({ color: 0x3f2a1d, roughness: 0.92 }),
  bullMuzzle: new THREE.MeshStandardMaterial({ color: 0x8d6b52, roughness: 0.9 }),
  horn: new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.8 }),
  // Distillery: copper that catches the light, a darker patina for pipework,
  // and the two woods a still-works is built from.
  copper: new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.32, metalness: 0.72 }),
  copperDark: new THREE.MeshStandardMaterial({ color: 0x9a5a26, roughness: 0.45, metalness: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 }),
  oak: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 }),
  oakDark: new THREE.MeshStandardMaterial({ color: 0x5f3d1d, roughness: 0.9 }),
  brick: new THREE.MeshStandardMaterial({ color: 0xa9603f, roughness: 0.95 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0xe7dcc2, roughness: 1 }),
  cornMeal: new THREE.MeshStandardMaterial({ color: 0xd9b25b, roughness: 0.95 }),
  portal: new THREE.MeshStandardMaterial({
    color: 0x7fe0ff, emissive: 0x2ea8d8, emissiveIntensity: 1.1,
    transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.3,
  }),
  // Corn draws as one merged, vertex-coloured geometry, so it needs a single
  // double-sided material that reads tone from the vertex colours.
  cornStalk: new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, side: THREE.DoubleSide,
  }),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _sc = new THREE.Vector3(1, 1, 1);

// ===== A reusable debris pool =====
// Small flying chunks (cobs, hay, pumpkin stems) that launch, fall, settle and
// fade. Fixed-size ring buffer, so a whole field of knocking never allocates.
function makeDebrisPool(scene, geo, mat, max) {
  const items = [];
  const parent = new THREE.Group();
  parent.name = 'Debris';
  scene.add(parent);
  for (let i = 0; i < max; i++) {
    const mesh = new THREE.Mesh(geo, mat.clone());
    mesh.visible = false;
    mesh.castShadow = true;
    parent.add(mesh);
    items.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, rest: false });
  }
  let seq = 0;
  return {
    group: parent,
    spawn(x, y, z, vx, vy, vz, life, scale = 1) {
      const d = items[seq % max];
      seq++;
      d.mesh.visible = true;
      d.mesh.position.set(x, y, z);
      d.mesh.scale.setScalar(scale);
      d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      d.vx = vx; d.vy = vy; d.vz = vz;
      d.maxLife = life; d.life = life; d.rest = false;
      d.mesh.material.opacity = 1;
      d.mesh.material.transparent = true;
    },
    update(dt) {
      for (const d of items) {
        if (!d.mesh.visible) continue;
        d.life -= dt;
        if (d.life <= 0) { d.mesh.visible = false; continue; }
        if (!d.rest) {
          d.vy -= 14 * dt;
          d.mesh.position.x += d.vx * dt;
          d.mesh.position.y += d.vy * dt;
          d.mesh.position.z += d.vz * dt;
          d.mesh.rotation.x += dt * 4.5;
          d.mesh.rotation.z += dt * 3.1;
          const floor = CORN_GROUND + 0.12;
          if (d.mesh.position.y <= floor && d.vy < 0) {
            d.mesh.position.y = floor;
            if (Math.abs(d.vx) + Math.abs(d.vz) < 0.6) { d.rest = true; d.vx = d.vy = d.vz = 0; }
            else { d.vy = 0; d.vx *= 0.5; d.vz *= 0.5; d.vy = 0; }
          }
        }
        d.mesh.material.opacity = Math.min(1, d.life / 0.6);
      }
    },
    clear() {
      for (const d of items) { d.mesh.visible = false; d.life = 0; }
    },
  };
}

// ===== The giant portal tree =====
// A huge hollow tree with a real opening cut through the trunk's +Z face: you
// look straight into the dark hollow and see the shimmering portal disc and
// drifting sparkles inside. An arched frame marks the doorway. Shared by the
// city (the way in) and the cornfield (the hollow that takes you home).
// `faceAngle` rotates the arch — it always sits on the tree's local +Z face.
export function makePortalTree(parent, x, z, faceAngle = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = faceAngle;

  const gapHalf = 0.8;
  // Trunk: an open cylinder with a theta gap around theta=0 (the +Z face).
  const trunkGeo = new THREE.CylinderGeometry(4.0, 5.4, 9, 18, 1, true,
    gapHalf, TWO_PI - 2 * gapHalf);
  const trunk = new THREE.Mesh(trunkGeo, M.bark);
  trunk.position.y = 4.5;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  // Dark inner liner (BackSide) so looking through the opening shows a deep
  // hollow rather than the meadow behind.
  const liner = new THREE.Mesh(
    new THREE.CylinderGeometry(3.7, 5.0, 8.8, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 1, side: THREE.BackSide })
  );
  liner.position.y = 4.4;
  g.add(liner);

  // Buttress roots — skipped in front of the opening.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TWO_PI;
    if (Math.sin(a) > Math.cos(gapHalf + 0.1)) continue;   // leave the mouth clear (mouth faces +Z, where sin(a)=1)
    const root = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.2, 6), M.bark);
    root.position.set(Math.cos(a) * 4.6, 1.4, Math.sin(a) * 4.6);
    root.rotation.z = Math.cos(a) * 0.5;
    root.rotation.x = -Math.sin(a) * 0.5;
    root.castShadow = true;
    g.add(root);
  }

  // Canopy.
  const crown = [
    [0, 10.2, 0, 5.4], [3.2, 9.2, 1.2, 3.6], [-3.2, 9.4, -1.0, 3.7],
    [1.0, 12.6, -1.4, 3.3], [-1.2, 12.2, 1.6, 3.1],
  ];
  for (const [cx, cy, cz, r] of crown) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), M.leaf);
    c.position.set(cx, cy, cz);
    c.castShadow = true;
    g.add(c);
  }

  // Arched frame around the opening: two legs and a semicircle header.
  const archMat = M.woodDark;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 5.0, 1.2), archMat);
    leg.position.set(sx * 3.6, 2.5, 4.0);
    leg.castShadow = true;
    g.add(leg);
  }
  const header = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.55, 8, 16, Math.PI), archMat);
  header.position.set(0, 5.0, 4.0);
  g.add(header);

  // The portal disc, deep inside the hollow.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.9, 24), M.portal);
  disc.position.set(0, 3.2, 1.2);
  g.add(disc);

  // Sparkles drifting inside the hollow — visible through the opening.
  const sparkMat = new THREE.MeshStandardMaterial({
    color: 0x9ff0ff, emissive: 0x7fe0ff, emissiveIntensity: 1.6, roughness: 0.4,
  });
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.1 + (i % 3) * 0.05, 6, 5), sparkMat);
    sp.position.set(
      Math.sin(i * 2.7) * 1.8,
      1.4 + (i * 1.37) % 3.4,
      1.6 + Math.sin(i * 1.9) * 0.8
    );
    g.add(sp);
  }

  parent.add(g);
  return { group: g, disc };
}

// ===== Ground, fences, a couple of trees =====
function buildGround(scene) {
  // Ground is built as planes around the L-shaped river hole (the channel
  // plus the leg that turns west at the hill's base), so the water is a real
  // drop instead of a pit painted onto a solid floor. The hill mound itself
  // sits ON the grass — only the water is a hole.
  const plane = (x0, x1, z0, z1) => {
    const w = x1 - x0, d = z1 - z0;
    if (w <= 0 || d <= 0) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.grass);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, CORN_GROUND, (z0 + z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
  };
  const EX = GROUND_EX;
  const { x0: cx0, x1: cx1, legX0, legZ0, legZ1 } = RIVER;
  // Main field: west of the channel, south of the leg.
  plane(-EX, cx0, -EX, legZ0);
  // North strip: west of the channel, north of the leg.
  plane(-EX, cx0, legZ1, EX);
  // East bank strip: east of the channel, full length.
  plane(cx1, EX, -EX, EX);
  // The strip west of the leg's spring end.
  plane(-EX, legX0, legZ0, legZ1);

  // The cornfield's dirt bed, so the field reads as worked ground.
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(CORNFIELD_RECT.x1 - CORNFIELD_RECT.x0 + 6, CORNFIELD_RECT.z1 - CORNFIELD_RECT.z0 + 6),
    M.dirt
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set((CORNFIELD_RECT.x0 + CORNFIELD_RECT.x1) / 2, CORN_GROUND + 0.02, (CORNFIELD_RECT.z0 + CORNFIELD_RECT.z1) / 2);
  bed.receiveShadow = true;
  scene.add(bed);

  // A dirt yard around the barn/silo so the farm reads as a farm.
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(70, 60), M.dirt);
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(24, CORN_GROUND + 0.015, 8);
  yard.receiveShadow = true;
  scene.add(yard);
}

// ===== Corn field =====
// A corn plant is a lot of little parts — a tapered stem with leaf nodes, six
// big alternating leaves, a spray of tassel at the crown and one or two husked
// ears with a yellow cob poking out. Drawing that per stalk with a dozen meshes
// each would be thousands of draw calls, so the whole plant is baked into ONE
// vertex-coloured geometry and stamped across the field with InstancedMesh.
// Colour lives in the vertices (stem / leaf / husk / cob / tassel), which lets a
// single double-sided material draw it all, and the field stays three draws
// wide. A handful of variants (different leaf angles and ear placement) breaks
// up the repetition.

// One leaf: a long tapered blade lying along +X and arching up towards +Y,
// widest around the middle and pointed at both ends.
function makeCornLeafGeometry() {
  const segs = 6;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = 0.42 * Math.sin(Math.PI * t);
    const w = 0.5 * 0.5 * Math.pow(Math.sin(Math.PI * t), 0.65);
    pos.push(t, y, -w, t, y, w);
  }
  for (let s = 0; s < segs; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const CORN_LEAF_GEO = makeCornLeafGeometry();

const _euler = new THREE.Euler();
// A transform with an optional rotation (applied Y-X-Z) and scale.
function cornPlace(x, y, z, rx, ry, rz, sx = 1, sy = sx, sz = sx) {
  const q = new THREE.Quaternion().setFromEuler(_euler.set(rx, ry, rz, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}
// Copy a geometry's verts into an accumulating buffer, transformed and tinted.
function cornPart(acc, geo, matrix, color) {
  const p = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  const base = acc.pos.length / 3;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(matrix);
    acc.pos.push(v.x, v.y, v.z);
    v.set(nrm[i], nrm[i + 1], nrm[i + 2]).applyMatrix3(nm).normalize();
    acc.nrm.push(v.x, v.y, v.z);
    acc.col.push(color.r, color.g, color.b);
  }
  const gi = geo.index.array;
  for (let i = 0; i < gi.length; i++) acc.idx.push(base + gi[i]);
}

const CORN_STALK_COL = new THREE.Color(0x6f9a3c);
const CORN_LEAF_COL = new THREE.Color(0x55913d);
const CORN_HUSK_COL = new THREE.Color(0xb2d26c);
const CORN_COB_COL = new THREE.Color(0xf3c637);
const CORN_TASSEL_COL = new THREE.Color(0xcbb45a);

// Bake one whole corn plant into a single geometry. `seed` nudges the leaf and
// ear placement so a few variants can share the field without looking cloned.
function buildCornStalkGeometry(seed) {
  let s = 1 + seed * 17.3;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return (s / 233280) * 2 - 1; };
  const H = CORN.stalkH;
  const acc = { pos: [], nrm: [], idx: [], col: [] };

  // Stem: a tapered stalk with a few swollen leaf nodes up its length.
  cornPart(acc, new THREE.CylinderGeometry(0.13, 0.24, H, 6), cornPlace(0, H / 2, 0, 0, 0, 0), CORN_STALK_COL);
  for (let k = 0; k < 3; k++) {
    cornPart(acc, new THREE.CylinderGeometry(0.19, 0.19, 0.1, 6), cornPlace(0, H * (0.3 + k * 0.22), 0, 0, 0, 0), CORN_STALK_COL);
  }

  // Six big leaves, each twisted to a new angle around the stalk and alternated
  // between an upright and a droopy arch.
  for (let i = 0; i < 6; i++) {
    const y = H * (0.15 + i * 0.115) + rnd() * 0.06;
    const yaw = i * 2.399963 + rnd() * 0.4;
    const droop = i % 2 ? 0.72 : 0.42;
    const len = 1.35 + rnd() * 0.45;
    cornPart(acc, CORN_LEAF_GEO, cornPlace(0, y, 0, -0.12, yaw, droop + rnd() * 0.12, len, len * 0.9, len), CORN_LEAF_COL);
  }

  // Ears: husk blades fanning out of the stem, a yellow cob poking free of them,
  // and a little brown silk tuft at the tip.
  for (let e = 0; e < 2; e++) {
    const ey = H * (0.5 + e * 0.14) + rnd() * 0.05;
    const yaw = e * 3.1 + 0.6 + rnd() * 0.5;
    const pitch = 0.85 + rnd() * 0.2;
    const dx = Math.sin(pitch) * Math.sin(yaw);
    const dz = Math.sin(pitch) * Math.cos(yaw);
    for (let h = 0; h < 3; h++) {
      cornPart(acc, CORN_LEAF_GEO, cornPlace(dx * 0.08, ey, dz * 0.08, -0.05, yaw + h * 2.0944, 0.8, 0.55, 0.6, 0.55), CORN_HUSK_COL);
    }
    cornPart(acc, new THREE.CylinderGeometry(0.075, 0.06, 0.42, 8), cornPlace(dx * 0.2, ey + Math.cos(pitch) * 0.2, dz * 0.2, pitch, yaw, 0), CORN_COB_COL);
    cornPart(acc, new THREE.ConeGeometry(0.03, 0.16, 4), cornPlace(dx * 0.44, ey + Math.cos(pitch) * 0.44, dz * 0.44, pitch, yaw, 0), CORN_HUSK_COL);
  }

  // Tassel: a spray of thin spikes above the crown.
  for (let t = 0; t < 5; t++) {
    const a = t * 1.2566;
    const lean = 0.35 + (t % 2) * 0.28;
    cornPart(acc, new THREE.ConeGeometry(0.035, 0.6, 4), cornPlace(Math.sin(a) * 0.05, H + 0.22, Math.cos(a) * 0.05, lean, a, 0), CORN_TASSEL_COL);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  g.setIndex(acc.idx);
  return g;
}

function buildCorn(scene) {
  // The closed silo stands in a clearing of the corn, so no stalks grow
  // through its wall.
  const clearR = SILO.r + 1.8;
  const pts = cornGrid().filter(
    (p) => Math.hypot(p.x - SILO.x, p.z - SILO.z) > clearR
  );
  const n = pts.length;

  // Split the field across a few geometry variants so the rows aren't identical.
  const VARIANTS = 3;
  const counts = new Array(VARIANTS).fill(0);
  for (let i = 0; i < n; i++) counts[i % VARIANTS]++;
  const meshes = [];
  for (let v = 0; v < VARIANTS; v++) {
    const im = new THREE.InstancedMesh(buildCornStalkGeometry(v + 1), M.cornStalk, counts[v]);
    im.frustumCulled = false;
    im.castShadow = true;
    scene.add(im);
    meshes.push(im);
  }

  const knocked = new Uint8Array(n);
  const done = new Uint8Array(n);
  const angle = new Float32Array(n);
  const dirX = new Float32Array(n);
  const dirZ = new Float32Array(n);
  const meshOf = new Uint8Array(n);
  const slot = new Int32Array(n);
  const yaw = new Float32Array(n);
  const scale = new Float32Array(n);
  const cursor = new Array(VARIANTS).fill(0);
  for (let i = 0; i < n; i++) {
    const v = i % 3;
    meshOf[i] = v;
    slot[i] = cursor[v]++;
    yaw[i] = (i * 2.399963) % (Math.PI * 2);
    scale[i] = 0.9 + ((i * 37) % 21) / 100;
  }

  const writeStalk = (i, a) => {
    const p = pts[i];
    _q.identity();
    if (a > 0.0001) {
      _axis.set(dirZ[i], 0, -dirX[i]);
      if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
      _axis.normalize();
      _q.setFromAxisAngle(_axis, a);
    }
    _q.multiply(_qy.setFromAxisAngle(_up, yaw[i]));
    _v.set(p.x, CORN_GROUND, p.z);
    _m.compose(_v, _q, _sc.setScalar(scale[i]));
    meshes[meshOf[i]].setMatrixAt(slot[i], _m);
  };
  for (let i = 0; i < n; i++) writeStalk(i, 0);
  for (const im of meshes) im.instanceMatrix.needsUpdate = true;

  return {
    count: n,
    pts, knocked, done, angle, dirX, dirZ, meshes,
    // Bend one stalk over in the direction the car is travelling.
    knock(i, headingX, headingZ, onCob) {
      if (knocked[i]) return;
      knocked[i] = 1;
      dirX[i] = headingX; dirZ[i] = headingZ;
      angle[i] = 0;
      onCob(pts[i]);
    },
    // Advance the fall animation.
    step(dt) {
      let any = false;
      for (let i = 0; i < n; i++) {
        if (!knocked[i] || done[i]) continue;
        angle[i] += (Math.PI / 2) * (dt / CORN.fallTime);
        if (angle[i] >= Math.PI / 2) { angle[i] = Math.PI / 2; done[i] = 1; }
        writeStalk(i, angle[i]);
        any = true;
      }
      if (any) for (const im of meshes) im.instanceMatrix.needsUpdate = true;
    },
    reset() {
      for (let i = 0; i < n; i++) { knocked[i] = 0; done[i] = 0; angle[i] = 0; }
      for (let i = 0; i < n; i++) writeStalk(i, 0);
      for (const im of meshes) im.instanceMatrix.needsUpdate = true;
    },
  };
}

// ===== Barn =====
function buildBarn(scene) {
  const cx = BARN.x, cz = BARN.z;
  const hw = BARN.halfW, hd = BARN.halfD, h = BARN.wallH;

  // Walls as thin boxes (the doorway is the gap in the west wall).
  const wall = (w, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, y ? y * 2 : h, d), mat);
    m.position.set(x, y || h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  wall(1.0, hd * 2, cx + hw, 0, cz, M.barn);                       // east
  wall(hw * 2, 1.0, cx, 0, cz + hd, M.barn);                       // north
  wall(1.0, hd * 2, cx - hw, 0, cz, M.barn);                       // west
  // South wall, split around the drive-in doorway (the hayloft ramp enters here).
  const doorL = BARN.doorX - BARN.doorHalf;
  const doorR = BARN.doorX + BARN.doorHalf;
  wall(doorL - (cx - hw), 1.0, ((cx - hw) + doorL) / 2, 0, cz - hd, M.barn);
  wall((cx + hw) - doorR, 1.0, (doorR + (cx + hw)) / 2, 0, cz - hd, M.barn);
  // Door header.
  const header = new THREE.Mesh(new THREE.BoxGeometry(BARN.doorHalf * 2, 2.0, 1.0), M.barnTrim);
  header.position.set(BARN.doorX, h - 1.0, cz - hd);
  scene.add(header);

  // Gable roof: two slanted slabs meeting at the ridge.
  const ridgeY = h + 4;
  for (const s of [-1, 1]) {
    const len = Math.hypot(hw, ridgeY - h);
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, hd * 2 + 1.0), M.roof);
    r.position.set(cx + s * hw / 2, (h + ridgeY) / 2, cz);
    r.rotation.z = -s * Math.atan2(ridgeY - h, hw);
    r.castShadow = true;
    scene.add(r);
  }

  // ---- classic red barn trim, white on every side ----
  // Gable triangles closing both ends (ridge runs along z, so the gables
  // face north and south).
  for (const s of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(-hw, 0); tri.lineTo(hw, 0); tri.lineTo(0, ridgeY - h);
    tri.closePath();
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false });
    const m = new THREE.Mesh(g, M.barn);
    m.position.set(cx, h, cz + s * hd - 0.25);
    scene.add(m);
  }
  // Corner boards — proud of BOTH wall faces they wrap (the walls are 1.0
  // thick, so a board centred on the corner line was buried inside them).
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.45, h, 0.45), M.barnTrim);
      c.position.set(cx + sx * (hw + 0.34), h / 2, cz + sz * (hd + 0.34));
      scene.add(c);
    }
  }
  // White band along the head of each gable end — outside the gable triangle's
  // face, so it reads as trim instead of vanishing inside the red paint.
  for (const s of [-1, 1]) {
    const eave = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 0.3, 0.25), M.barnTrim);
    eave.position.set(cx, h + 0.15, cz + s * (hd + 0.42));
    scene.add(eave);
  }
  // A true eave fascia down each long side, under the roof's lower edge.
  for (const sx of [-1, 1]) {
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, hd * 2 + 1.2), M.barnTrim);
    fascia.position.set(cx + sx * (hw + 0.5), h + 0.1, cz);
    scene.add(fascia);
  }
  // Ridge cap — runs along the ridge (z), not across it. This was the
  // "sideways top stripe": it lay athwart the roof like a giant staple.
  const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, hd * 2 + 1.2), M.barnTrim);
  ridgeCap.position.set(cx, ridgeY + 0.2, cz);
  scene.add(ridgeCap);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const rakeLen = Math.hypot(hw, ridgeY - h);
      const rake = new THREE.Mesh(new THREE.BoxGeometry(rakeLen, 0.26, 0.22), M.barnTrim);
      rake.position.set(cx + sx * hw / 2, (h + ridgeY) / 2 + 0.2, cz + sz * (hd + 0.48));
      rake.rotation.z = -sx * Math.atan2(ridgeY - h, hw);
      scene.add(rake);
    }
  }
  // X-braces on both long walls — stood off the wall faces (they used to sit
  // 0.08 out from the wall's CENTRELINE, i.e. half a metre inside the paint).
  const xBrace = (len, x, y, z, rotY, rot) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    for (const r of [rot, -rot]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, len, 0.12), M.barnTrim);
      b.rotation.z = r;
      g.add(b);
    }
    scene.add(g);
  };
  const braceLen = Math.hypot(hd * 0.9, h * 0.86);
  const braceAng = Math.atan2(hd * 0.9, h * 0.86);
  for (const dz of [-hd * 0.48, hd * 0.48]) {
    xBrace(braceLen, cx + hw + 0.55, h * 0.48, cz + dz, Math.PI / 2, braceAng);   // east
    xBrace(braceLen, cx - hw - 0.55, h * 0.48, cz + dz, Math.PI / 2, braceAng);   // west
  }
  const braceLenS = Math.hypot(hw * 0.9, h * 0.86);
  const braceAngS = Math.atan2(hw * 0.9, h * 0.86);
  // North wall: a symmetric pair, matched to the long (east/west) sides.
  for (const dx of [-hw * 0.48, hw * 0.48]) {
    xBrace(braceLenS, cx + dx, h * 0.48, cz + hd + 0.55, 0, braceAngS); // north
  }
  // South wall: a single brace WEST of the drive-in doorway. The old pair sat
  // at -0.48hw AND -0.08hw — both west of centre, so the two X's overlapped in
  // a jumble, the second one clipped the door jamb, and the east end of the
  // wall was left bare. That east end is where the slid-open braced door panel
  // is parked, so it carries its own trim already.
  xBrace(braceLenS, cx - hw * 0.48, h * 0.48, cz - hd - 0.55, 0, braceAngS); // south
  // Big sliding door, parked slid-open to the east of the south opening, with a
  // white frame and X-braces. It stands proud of the wall's outer face.
  const doorZ = cz - hd - 0.56;
  const doorPanel = new THREE.Group();
  doorPanel.position.set(BARN.doorX + BARN.doorHalf + 2.6, h * 0.42, doorZ);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(BARN.doorHalf * 2.1, h * 0.84, 0.18), M.barn);
  doorPanel.add(panel);
  for (const r of [0.9, -0.9]) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(Math.hypot(h * 0.78, BARN.doorHalf * 1.9), 0.14, 0.1), M.barnTrim
    );
    b.rotation.z = r > 0 ? Math.atan2(BARN.doorHalf * 1.9, h * 0.78) : -Math.atan2(BARN.doorHalf * 1.9, h * 0.78);
    doorPanel.add(b);
  }
  scene.add(doorPanel);
  // Door track above the opening, running east to the parked panel.
  const track = new THREE.Mesh(new THREE.BoxGeometry((cx + hw) - doorL, 0.25, 0.2), M.barnTrim);
  track.position.set((doorL + (cx + hw)) / 2, h - 0.1, doorZ);
  scene.add(track);
  // White frame around the opening itself.
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.25, h * 0.86, 0.25), M.barnTrim);
    jamb.position.set(BARN.doorX + sx * (BARN.doorHalf + 0.1), h * 0.43, cz - hd - 0.585);
    scene.add(jamb);
  }
  // Square hay door high on the north gable, white-framed.
  const hayDoor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 0.2), M.woodDark);
  hayDoor.position.set(cx, h + 1.5, cz + hd + 0.55);
  scene.add(hayDoor);
  for (const [dx, dy] of [[0, 0.95], [0, -0.95], [0.95, 0], [-0.95, 0]]) {
    const t = new THREE.Mesh(
      new THREE.BoxGeometry(dx ? 0.16 : 2.0, dx ? 2.0 : 0.16, 0.12), M.barnTrim
    );
    t.position.set(cx + dx, h + 1.5 + dy, cz + hd + 0.68);
    scene.add(t);
  }
  // Cupola + weathervane on the ridge.
  const cupola = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), M.barnTrim);
  cupola.position.set(cx - hw * 0.4, ridgeY + 0.85, cz);
  cupola.castShadow = true;
  scene.add(cupola);
  const cupRoof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.9, 4), M.roof);
  cupRoof.rotation.y = Math.PI / 4;
  cupRoof.position.set(cx - hw * 0.4, ridgeY + 1.9, cz);
  scene.add(cupRoof);
  const vanePole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), M.metalDark);
  vanePole.position.set(cx - hw * 0.4, ridgeY + 2.7, cz);
  scene.add(vanePole);
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 1.0), M.metalDark);
  vane.position.set(cx - hw * 0.4, ridgeY + 3.05, cz - 0.3);
  scene.add(vane);

  // Hayloft floor (also the soft collider, built in barnColliders()). It covers
  // the BACK (north) half of the barn only — the second floor at the rear, over
  // the north chamber — not the whole footprint. Old wooden boards with small
  // gaps between them, then a loose cover of hay strewn over the boards.
  const loftW = (BARN.x + hw) - BARN.loftWest;          // full width (x)
  const loftCx = BARN.loftWest + loftW / 2;
  const loftZ0 = cz + BARN.loftSouth;                    // south edge (barn centre)
  const loftD = (cz + hd) - loftZ0;                      // depth (z), back half
  const loftCz = loftZ0 + loftD / 2;
  const loftDeck = new THREE.Mesh(new THREE.BoxGeometry(loftW, 0.34, loftD), M.woodDark);
  loftDeck.position.set(loftCx, BARN.loftY - 0.17, loftCz);
  loftDeck.castShadow = true; loftDeck.receiveShadow = true;
  scene.add(loftDeck);
  // Board seams: thin dark strips on top so it reads as planks.
  const nPlanks = Math.max(4, Math.floor(loftW / 1.6));
  for (let i = 1; i < nPlanks; i++) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, loftD - 0.2), M.plankDark);
    seam.position.set(loftCx - loftW / 2 + loftW * (i / nPlanks), BARN.loftY + 0.005, loftCz);
    scene.add(seam);
  }
  // The hay strewn over the boards.
  const hayBed = new THREE.Mesh(new THREE.BoxGeometry(loftW - 0.3, 0.18, loftD - 0.4), M.hay);
  hayBed.position.set(loftCx, BARN.loftY + 0.05, loftCz);
  hayBed.receiveShadow = true;
  scene.add(hayBed);
  // A few loose hay tufts for texture.
  for (let i = 0; i < 22; i++) {
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.5), M.hay);
    tuft.position.set(
      BARN.loftWest + 1 + Math.random() * (loftW - 2),
      BARN.loftY + 0.16,
      loftZ0 + 0.6 + Math.random() * (loftD - 1.2));
    tuft.rotation.y = Math.random() * Math.PI;
    scene.add(tuft);
  }

  // Boarded ramp up to the loft: a plank deck on side stringers carried by
  // posts, not a solid wedge — old boards laid across the run with visible gaps.
  {
    const run = BARN_RAMP.len, rise = BARN_RAMP.height;
    const ang = Math.atan2(-BARN_RAMP.runZ, BARN_RAMP.runX);
    const rampGroup = new THREE.Group();
    rampGroup.position.set(BARN_RAMP.x, 0, BARN_RAMP.z);
    rampGroup.rotation.y = ang;
    const slope = Math.atan2(rise, run);
    // Side stringers (two long beams following the grade).
    for (const s of [-1, 1]) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(Math.hypot(run, rise), 0.34, 0.22), M.woodDark);
      beam.position.set(run / 2, rise / 2 - 0.17, s * (BARN_RAMP.width / 2 - 0.11));
      beam.rotation.z = slope;
      beam.castShadow = true;
      rampGroup.add(beam);
    }
    // Plank deck: boards laid across the run, small gaps between them.
    const nBoards = Math.max(6, Math.floor(run / 0.6));
    for (let i = 0; i < nBoards; i++) {
      const t = (i + 0.5) / nBoards;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.12, BARN_RAMP.width), M.wood);
      board.position.set(t * run, t * rise + 0.06, 0);
      board.rotation.z = slope;
      board.castShadow = true; board.receiveShadow = true;
      rampGroup.add(board);
    }
    // Posts under the stringers, down to the barn floor.
    const nPosts = Math.max(3, Math.floor(run / 6));
    for (let i = 1; i <= nPosts; i++) {
      const t = i / (nPosts + 1);
      const px = t * run, py = t * rise;
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, py, 0.26), M.woodDark);
        post.position.set(px, py / 2, s * (BARN_RAMP.width / 2 - 0.11));
        post.castShadow = true;
        rampGroup.add(post);
      }
    }
    scene.add(rampGroup);
  }

  // Hay bales up on the back-half loft (decor; the hay burst is spawned by update()).
  const bales = [];
  const baleSpots = [
    [10, BARN.loftY + 0.35, 6], [24, BARN.loftY + 0.35, 6],
    [14, BARN.loftY + 0.35, 15], [38, BARN.loftY + 0.35, 14],
    [30, BARN.loftY + 0.95, 10],
  ];
  for (const [bx, by, bz] of baleSpots) {
    const bale = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.3, 1.6), M.hay);
    bale.position.set(bx, by, bz);
    bale.rotation.y = (bx + bz) * 0.3;
    bale.castShadow = true;
    scene.add(bale);
    bales.push(bale);
  }
  // ---- hung farm kit: pitchforks, rakes and shovels on the bare walls ----
  // Every long wall already carries something: the east side carries the loft
  // ramp, the south the drive-in doorway and its parked panel, the north the
  // loft itself. The west interior wall and the wall space ABOVE the loft floor
  // are the only bare surfaces, so that is where the equipment hangs. Pure
  // decor — no colliders, and the tools are hung well clear of head height.
  const hungTool = (kind) => {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.1, 6), M.wood);
    handle.position.y = -1.05;                    // hangs down from the rail
    handle.castShadow = true;
    g.add(handle);
    if (kind === 'fork' || kind === 'rake') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.09), M.metalDark);
      bar.position.y = 0.1;
      g.add(bar);
      const teeth = kind === 'fork' ? [-0.18, -0.06, 0.06, 0.18] : [-0.22, -0.11, 0, 0.11, 0.22];
      const toothH = kind === 'fork' ? 0.62 : 0.3;
      for (const t of teeth) {
        const tooth = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, toothH, 0.05), M.metalDark);
        tooth.position.set(t, 0.14 + toothH / 2, 0);
        g.add(tooth);
      }
    } else {
      // Shovel: the blade sits at the BOTTOM of the handle, tip down.
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.07), M.metal);
      neck.position.y = -2.16;
      g.add(neck);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.07), M.metal);
      blade.position.y = -2.48;
      g.add(blade);
    }
    return g;
  };
  // A rail with tools hooked over it, hung flat on a wall. `rotY` turns the
  // group so its thin axis always points INTO the wall it hangs on.
  const toolRack = (x, y, z, rotY, kinds, spacing = 1.15) => {
    const rack = new THREE.Group();
    rack.position.set(x, y, z);
    rack.rotation.y = rotY;
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry((kinds.length - 1) * spacing + 0.7, 0.14, 0.14), M.woodDark);
    rail.position.y = 0.12;
    rack.add(rail);
    kinds.forEach((k, i) => {
      const t = hungTool(k);
      t.position.x = -((kinds.length - 1) * spacing) / 2 + i * spacing;
      t.rotation.z = (i % 2 ? 1 : -1) * 0.05;     // a touch of hang-wobble
      rack.add(t);
    });
    scene.add(rack);
  };
  // West interior wall (plain red boards the length of the barn).
  toolRack(cx - hw + 0.66, 4.3, cz - hd * 0.45, Math.PI / 2, ['fork', 'rake', 'shovel']);
  toolRack(cx - hw + 0.66, 4.3, cz + hd * 0.4, Math.PI / 2, ['rake', 'fork']);
  // Above the loft floor, on the north wall — reachable from the hay deck.
  toolRack(cx - hw * 0.62, 10.1, cz + hd - 0.66, 0, ['shovel', 'rake', 'fork']);
  toolRack(cx + hw * 0.62, 10.1, cz + hd - 0.66, 0, ['fork', 'shovel']);
  // South wall, west of the drive-in opening (the east end is the door panel).
  toolRack(cx - hw * 0.5, 4.4, cz - hd + 0.66, 0, ['rake', 'shovel']);

  return { bales };
}

// ===== Silo =====
// Closed SCENERY: a full banded-metal cylinder with a conical roof cap. No
// door, no gap, no interior spiral — the colliders ring it solid at full
// height and nothing opens into it.
function buildSilo(scene) {
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(SILO.r, SILO.r, SILO.h, 40, 1, true),
    M.metal
  );
  wall.position.set(SILO.x, SILO.h / 2, SILO.z);
  wall.castShadow = true; wall.receiveShadow = true;
  scene.add(wall);

  // Horizontal rings for a banded-metal look.
  for (let k = 1; k <= 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(SILO.r + 0.02, 0.12, 6, 40), M.metalDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(SILO.x, (SILO.h / 4) * k, SILO.z);
    scene.add(ring);
  }
  // Rim cap.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(SILO.r, 0.16, 6, 40), M.metalDark);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(SILO.x, SILO.h, SILO.z);
  scene.add(rim);

  // Conical roof cap + finial, closing the top.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(SILO.r + 0.45, 3.4, 40), M.metalDark);
  roof.position.set(SILO.x, SILO.h + 1.7, SILO.z);
  roof.castShadow = true;
  scene.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M.metal);
  finial.position.set(SILO.x, SILO.h + 3.5, SILO.z);
  scene.add(finial);

  return {};
}

// ===== Water tower =====
// A steel tank on four braced legs in the barnyard south-west of the barn. The
// legs lean in from wide feet to a narrow platform; X-braces tie the faces
// together, a ladder climbs the south face and a downpipe hugs the NE leg.
function buildWaterTower(scene) {
  const { x: cx, z: cz, legH, tankR, tankH, roofH, legBase, legTop } = WATER_TOWER;

  // A strut between two points: a thin box oriented along the segment.
  const strut = (ax, ay, az, bx, by, bz, t, mat) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 0.001;
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), mat);
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.setFromUnitVectors(_up, _v.set(dx / len, dy / len, dz / len));
    m.castShadow = true;
    scene.add(m);
    return m;
  };
  // Point on a leaning leg at height y.
  const legPt = (sx, sz, y) => {
    const s = legBase + (legTop - legBase) * (y / legH);
    return [cx + sx * s, y, cz + sz * s];
  };

  // Legs.
  const feet = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sz] of feet) {
    strut(...legPt(sx, sz, 0), ...legPt(sx, sz, legH), 0.42, M.metalDark);
  }

  // X-bracing on all four faces at two levels.
  const faces = [
    [[-1, -1], [1, -1]], [[-1, 1], [1, 1]],
    [[-1, -1], [-1, 1]], [[1, -1], [1, 1]],
  ];
  for (const [a, b] of faces) {
    for (const y0 of [legH * 0.28, legH * 0.62]) {
      const y1 = Math.min(y0 + legH * 0.28, legH);
      strut(...legPt(a[0], a[1], y0), ...legPt(b[0], b[1], y1), 0.14, M.metalDark);
      strut(...legPt(a[0], a[1], y1), ...legPt(b[0], b[1], y0), 0.14, M.metalDark);
    }
  }

  // Platform the tank sits on, with a walkway lip.
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(tankR + 0.7, tankR + 0.7, 0.3, 20), M.metalDark);
  platform.position.set(cx, legH + 0.15, cz);
  platform.castShadow = true; platform.receiveShadow = true;
  scene.add(platform);

  // Tank body with banding.
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(tankR, tankR, tankH, 24), M.waterTank);
  tank.position.set(cx, legH + 0.3 + tankH / 2, cz);
  tank.castShadow = true; tank.receiveShadow = true;
  scene.add(tank);
  for (let k = 1; k <= 2; k++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(tankR + 0.02, 0.1, 6, 28), M.metalDark);
    band.rotation.x = Math.PI / 2;
    band.position.set(cx, legH + 0.3 + (tankH / 3) * k, cz);
    scene.add(band);
  }

  // Conical roof + finial.
  const roofY = legH + 0.3 + tankH;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(tankR + 0.35, roofH, 24), M.metalDark);
  roof.position.set(cx, roofY + roofH / 2, cz);
  roof.castShadow = true;
  scene.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.metal);
  finial.position.set(cx, roofY + roofH + 0.15, cz);
  scene.add(finial);

  // Walkway railing around the platform.
  const rail = new THREE.Mesh(new THREE.TorusGeometry(tankR + 0.55, 0.06, 6, 28), M.metal);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(cx, legH + 1.1, cz);
  scene.add(rail);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TWO_PI;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 5), M.metal);
    post.position.set(cx + (tankR + 0.55) * Math.cos(a), legH + 0.65, cz + (tankR + 0.55) * Math.sin(a));
    scene.add(post);
  }

  // Ladder up the south face, leaning with the legs.
  const ladderZ = (y) => cz - (legBase + (legTop - legBase) * (y / legH)) - 0.28;
  for (const sx of [-1, 1]) {
    strut(cx + sx * 0.35, 0.1, ladderZ(0.1), cx + sx * 0.35, legH + 0.3, ladderZ(legH + 0.3), 0.09, M.metal);
  }
  for (let y = 0.7; y < legH + 0.2; y += 0.7) {
    strut(cx - 0.35, y, ladderZ(y), cx + 0.35, y, ladderZ(y), 0.07, M.metal);
  }

  // Downpipe from the tank floor, hugging the inside of the NE leg.
  const dp0 = legPt(1, 1, 0), dp1 = legPt(1, 1, legH);
  strut(dp0[0] - 0.45, 0, dp0[2] - 0.45, dp1[0] - 0.45, legH + 0.2, dp1[2] - 0.45, 0.26, M.metal);
}

// ===== Pumpkin patch =====
// A lobed pumpkin: a sphere whose XZ radius is pushed out by six cosine
// flutes (the same trick the beach shell uses), so the ridges are part of the
// surface and shade like real ribs — the old torus hoops lay ON the sphere
// and read as candy stripes.
function makePumpkinGeometry(r) {
  const geo = new THREE.SphereGeometry(r, 20, 14);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const f = 1 + 0.085 * 0.5 * (1 + Math.cos(Math.atan2(x, z) * 6));
    pos.setX(i, x * f);
    pos.setZ(i, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildPumpkins(scene) {
  const patch = [];

  // Giant rolling pumpkins FIRST, so the vines below can be rooted at their
  // stems. They sit in a tight cluster on the plateau's level crown so their
  // runners tangle into one bed. Every runner springs from a pumpkin's stem
  // base; each pumpkin also gets a drag-vine mesh that stretches out behind it
  // when it is knocked loose (update() owns the stretch / tear-off).
  const spots = [
    [2, 92], [8, 94], [14, 92],
    [0, 98], [6, 100], [12, 98],
    [4, 106], [10, 104],
  ];
  for (const [px, pz] of spots) {
    const r = 1.15 + ((px * 7 + pz) % 5) * 0.06;
    const base = hillHeightAt(px, pz);
    const g = new THREE.Group();
    g.position.set(px, base + r * 0.7, pz);
    const body = new THREE.Mesh(makePumpkinGeometry(r), M.pumpkin);
    body.scale.set(1, 0.72, 1);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.5, 6), M.stem);
    stem.position.set(0, r * 0.72 + 0.2, 0);
    stem.rotation.z = 0.15;
    g.add(stem);
    scene.add(g);
    // The drag vine: a thin runner that stretches from the home stem base out
    // to the rolling pumpkin, then snaps when the pumpkin travels too far.
    const drag = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.18), M.leaf);
    drag.position.set(px, base + 0.1, pz);
    drag.visible = false;
    scene.add(drag);
    patch.push({
      group: g, stem, body, radius: r, drag,
      x: px, z: pz, vx: 0, vz: 0, spin: 0,
      stemAttached: true, home: { x: px, z: pz }, restY: base + r * 0.7,
    });
  }

  // Five runners spring from EACH pumpkin's stem base and snake out inside the
  // (smaller) patch, so every pumpkin reads as the root of its own dense vine
  // bed. Scaled up to 25 runners per plant (5x) so the patch is one thick,
  // tangled bed rather than a few lonely tendrils. The patch rides the
  // plateau, so the runners lie on the crown, not on farm ground.
  const makeVine = (ox, oz, seed, base) => {
    const pts = [];
    const steps = 30;
    const reach = 2.4 + (seed % 4) * 0.55;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = seed * 1.7 + t * TWO_PI * 0.62;
      const rr = t * reach;
      const vx = ox + Math.cos(a) * rr + Math.sin(t * 7 + seed) * 0.7;
      const vz = oz + Math.sin(a) * rr + Math.cos(t * 5 + seed) * 0.7;
      pts.push(new THREE.Vector3(
        THREE.MathUtils.clamp(vx, PUMPKIN_PATCH.x0 + 1, PUMPKIN_PATCH.x1 - 1),
        base + 0.1,
        THREE.MathUtils.clamp(vz, PUMPKIN_PATCH.z0 + 1, PUMPKIN_PATCH.z1 - 1)
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.11, 5, false), M.leaf);
    tube.receiveShadow = true;
    scene.add(tube);
    for (let i = 1; i < 9; i++) {
      const p = curve.getPointAt(i / 9);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.34, 6, 5), M.husk);
      leaf.scale.set(1.35, 0.22, 0.85);
      leaf.position.set(p.x, base + 0.15, p.z);
      leaf.rotation.y = i * 1.3 + seed;
      scene.add(leaf);
    }
  };
  for (let i = 0; i < patch.length; i++) {
    const base = hillHeightAt(patch[i].x, patch[i].z);
    for (let k = 0; k < 25; k++) {
      makeVine(patch[i].x, patch[i].z, i * 2.3 + k * 1.37 + 0.5, base);
    }
  }

  return patch;
}

// ===== Apple orchard =====
function makeAppleTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, APPLE_TREE.trunkH, 7), M.bark);
  trunk.position.y = APPLE_TREE.trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const lobes = [
    [0, APPLE_TREE.trunkH + 1.0, 0, APPLE_TREE.canopyR],
    [1.15, APPLE_TREE.trunkH + 0.35, 0.4, APPLE_TREE.canopyR * 0.66],
    [-1.05, APPLE_TREE.trunkH + 0.5, -0.5, APPLE_TREE.canopyR * 0.6],
  ];
  for (const [cx, cy, cz, r] of lobes) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), M.orchardLeaf);
    c.position.set(cx, cy, cz);
    c.castShadow = true;
    g.add(c);
  }

  const apples = [];
  for (let i = 0; i < APPLE_TREE.apples; i++) {
    const a = (i / APPLE_TREE.apples) * Math.PI * 2 + (i % 3) * 0.7;
    const rr = APPLE_TREE.canopyR * (0.7 + 0.3 * Math.abs(Math.sin(i * 2.3)));
    const ay = APPLE_TREE.trunkH + 0.35 + Math.sin(i * 1.7) * 1.25;
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), M.apple);
    apple.position.set(Math.cos(a) * rr, ay, Math.sin(a) * rr);
    g.add(apple);
    apples.push(apple);
  }
  return { group: g, apples };
}

function buildOrchard(scene) {
  const trees = [];
  for (const p of orchardGrid()) {
    const t = makeAppleTree();
    t.group.position.set(p.x, CORN_GROUND, p.z);
    t.group.rotation.y = p.x * 0.6 + p.z * 1.1;
    scene.add(t.group);
    trees.push({ x: p.x, z: p.z, group: t.group, topY: CORN_GROUND + APPLE_TREE.trunkH + 1.0 });
  }
  return trees;
}

// ===== Squirrel =====
function makeSquirrel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.squirrel);
  body.scale.set(1.05, 0.9, 1.35);
  body.position.y = 0.34;
  body.castShadow = true;
  g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M.squirrelBelly);
  belly.scale.set(1, 0.8, 1.2);
  body.add(belly);
  belly.position.set(0, -0.05, 0.55);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.squirrel);
  head.position.set(0, 0.64, 0.36);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.squirrelBelly);
  snout.position.set(0, 0.58, 0.55);
  g.add(snout);
  for (const sx of [-0.1, 0.1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 6), M.squirrel);
    ear.position.set(sx, 0.82, 0.32);
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), M.tire);
    eye.position.set(sx, 0.66, 0.5);
    g.add(eye);
  }

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M.squirrel);
  tail.scale.set(0.7, 1.5, 0.7);
  tail.position.set(0, 0.62, -0.5);
  tail.rotation.x = -0.6;
  g.add(tail);

  const arm = new THREE.Group();
  arm.position.set(0.24, 0.5, 0.18);
  const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.34, 6), M.squirrel);
  armMesh.position.y = -0.17;
  arm.add(armMesh);
  g.add(arm);
  g.userData.throwArm = arm;
  return g;
}

function buildSquirrel(scene) {
  const mesh = makeSquirrel();
  mesh.position.set(SQUIRREL.home.x, CORN_GROUND, SQUIRREL.home.z);
  scene.add(mesh);
  return {
    mesh,
    x: SQUIRREL.home.x, z: SQUIRREL.home.z, y: CORN_GROUND,
    state: 'idle',        // idle | run | climb | throw | descend
    timer: 0,
    node: null,           // {x,z} it is heading to
    tree: null,
    perch: null,          // {x,y,z} outer canopy perch while throwing
    shot: 0,              // total throws this climb
    throwsLeft: 0,
    spin: 0,
  };
}

// A small pool of thrown apples.
function makeApplePool(scene, max) {
  const geo = new THREE.SphereGeometry(0.34, 10, 8);
  const items = [];
  for (let i = 0; i < max; i++) {
    const mesh = new THREE.Mesh(geo, M.appleRed);
    mesh.visible = false;
    scene.add(mesh);
    items.push({ mesh, alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, hit: false });
  }
  return {
    items,
    spawn(x, y, z, vx, vy, vz, hit) {
      for (const a of items) {
        if (a.alive) continue;
        a.alive = true; a.hit = hit;
        a.x = x; a.y = y; a.z = z;
        a.vx = vx; a.vy = vy; a.vz = vz;
        a.life = 3.5;
        a.mesh.visible = true;
        a.mesh.position.set(x, y, z);
        return a;
      }
      return null;
    },
    reset() {
      for (const a of items) { a.alive = false; a.mesh.visible = false; }
    },
  };
}

const APPLE_GRAVITY = 22;

// Aim a ballistic arc from (sx,sy,sz) to (tx,ty,tz) at speed S.
// Returns a velocity vector, or null when the target is out of practical range.
function aimArc(sx, sy, sz, tx, ty, tz, speed) {
  const dx = tx - sx, dz = tz - sz;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.3) return null;
  const t = dist / speed;
  const nx = dx / dist, nz = dz / dist;
  const vy = (ty - sy) / t + 0.5 * APPLE_GRAVITY * t;
  return { vx: nx * speed, vy, vz: nz * speed };
}

// ===== Barrels =====
// Built upright: the lathe's native axis is Y, so the barrel stands on its end.
function makeBarrel(length, radius) {
  const g = new THREE.Group();
  // Bellied stave profile: r*0.87 at the ends swelling to full r at the
  // middle, lathe-turned — a straight cylinder read as a pipe.
  const bulge = (t) => radius * (1 - 0.13 * (2 * t - 1) * (2 * t - 1));
  const pts = [new THREE.Vector2(0, -length / 2), new THREE.Vector2(bulge(0), -length / 2)];
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(bulge(t), -length / 2 + t * length));
  }
  pts.push(new THREE.Vector2(bulge(1), length / 2), new THREE.Vector2(0, length / 2));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), M.barrel);
  body.castShadow = true;
  g.add(body);
  // Hoops sit at ±0.3 length, hugging the profile radius there (≈0.953 r).
  const hoopR = bulge(0.8) + 0.01;
  for (const oy of [-length * 0.3, length * 0.3]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(hoopR, 0.05, 5, 12), M.hoop);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = oy;
    g.add(hoop);
  }
  return g;
}

// Barrels lie on their sides in a pyramid. Each is a free body: bump one and it
// tumbles END OVER END (somersaulting about the ground axis across its length,
// the way a tire tumbles), then rolls to a stop broadside. A barrel that loses
// the barrels holding it up FOLDS DOWN and tumbles to the ground instead of
// hanging in the air. `state` is 'stacked', 'falling' (tumbling), 'rolling'
// (broadside roll), or 'rest'.
function buildBarrels(scene) {
  const barrels = [];
  for (const stack of BARREL_STACKS) {
    const items = barrelPyramid(stack);
    const pitch = (stack.radius || 0.55) * 2.04;
    for (const b of items) {
      const g = makeBarrel(b.length, b.radius);
      g.position.set(b.x, b.y, b.z);
      // Lying on its side: long axis along the row. yaw(axis) then tip it a
      // quarter turn onto its side (matches the resting pose elsewhere).
      const axis = b.alongX ? 0 : Math.PI / 2;
      g.quaternion.setFromAxisAngle(_up, axis).multiply(
        _q.setFromAxisAngle(_zAxis, Math.PI / 2));
      scene.add(g);
      barrels.push({
        group: g,
        radius: b.radius,
        length: b.length,
        axis,
        tip: 0,               // tumble angle about the across-axis (radians)
        tipV: 0,
        rollPower: 0,
        x: b.x, y: b.y, z: b.z,
        vx: 0, vz: 0, vy: 0, roll: 0,
        tier: Math.round((b.y - b.radius) / (b.radius * Math.sqrt(3))),
        state: 'stacked',
        home: { x: b.x, y: b.y, z: b.z, axis },
      });
    }
    // Link the support graph: each barrel in a tier above the ground rests on
    // the barrels diagonally beneath it (perpendicular neighbours one tier
    // down). When they are both gone it can no longer stay up and folds down.
    const group = barrels.slice(-items.length);
    const byTier = new Map();
    for (const b of group) {
      if (!byTier.has(b.tier)) byTier.set(b.tier, []);
      byTier.get(b.tier).push(b);
    }
    const perpOf = stack.alongX ? (b, o) => o.home.z - b.home.z : (b, o) => o.home.x - b.home.x;
    for (const b of group) {
      if (b.tier === 0) continue;
      const below = (byTier.get(b.tier - 1) || []).slice();
      below.sort((p, q) => Math.abs(perpOf(b, p)) - Math.abs(perpOf(b, q)));
      b.supporters = below.filter((o) => Math.abs(perpOf(b, o)) < pitch * 1.2).slice(0, 2);
    }
  }
  return barrels;
}

// Every barrel already lies on its side, so a knock flips it END OVER END about
// the ground axis across its length (across-axis tumble), and the velocity runs
// along that same across-axis so the flip and the skid agree. `axis` is the yaw
// of the long axis; the across-axis (world) is (sin axis, 0, cos axis).
function knockBarrel(b, nx, nz, power) {
  if (b.state !== 'stacked' && b.state !== 'rest') return;
  const axAx = Math.sin(b.axis), axAz = Math.cos(b.axis);   // across-axis (perp to long axis)
  const along = nx * axAz - nz * axAx;                      // component along the long axis
  let px = nx - along * axAz, pz = nz + along * axAx;
  let pl = Math.hypot(px, pz);
  if (pl < 1e-3) { px = axAx; pz = axAz; pl = 1; }
  b.vx = (px / pl) * power;
  b.vz = (pz / pl) * power;
  b.rollPower = power;
  // Cap the tumble rate so even a full-speed hit flips like a tire in a
  // couple of tenths of a second instead of cartwheeling for half a minute.
  const tip = Math.min(8.5, (power / Math.max(0.3, b.radius)) * 0.8);
  b.tipV = tip * (px * axAx + pz * axAz >= 0 ? 1 : -1);
  b.state = 'falling';
  b.tip = 0;
}

// ===== Perimeter fence =====
// `lift(x, z)` returns the ground height the run stands on, so a fence that
// crosses the plateau follows the terrain instead of burying itself in it.
// Rails connect the two posts of each bay exactly, in 3D — so a run that
// climbs or drops with the ground angles its rails along the slope instead of
// stepping flat and floating/sinking at the joints.
function fenceLine(scene, ax, az, bx, bz, postEvery = 7, lift = () => CORN_GROUND) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const n = Math.max(2, Math.round(len / postEvery));
  const postPt = (t) => {
    const x = ax + dx * t, z = az + dz * t;
    return [x, lift(x, z), z];
  };
  for (let i = 0; i < n; i++) {
    const [x0, y0, z0] = postPt(i / n);
    const [x1, y1, z1] = postPt((i + 1) / n);
    const d3 = _v.set(x1 - x0, y1 - y0, z1 - z0);
    const l3 = d3.length() || 0.001;
    d3.divideScalar(l3);
    for (const ry of [0.55, 1.15]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(l3 + 0.1, 0.12, 0.1), M.woodDark);
      rail.position.set((x0 + x1) / 2, (y0 + y1) / 2 + ry, (z0 + z1) / 2);
      rail.quaternion.setFromUnitVectors(_xAxis, d3);
      rail.castShadow = true;
      scene.add(rail);
    }
  }
  for (let i = 0; i <= n; i++) {
    const [px, py, pz] = postPt(i / n);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.16), M.wood);
    post.position.set(px, py + 0.85, pz);
    post.castShadow = true;
    scene.add(post);
  }
}

function buildFarmBoundary(scene) {
  const { x0, x1, z0, z1 } = FARM_BOUNDS;
  // Fences on three sides; the city-facing (south) side is a brick wall.
  // The north run stands on the plateau's crown, and the east/west runs climb
  // the plateau with it, so every post sits on the ground it overlooks.
  fenceLine(scene, x0, z1, x1, z1, 7, (x) => hillHeightAt(x, z1));
  fenceLine(scene, x1, z0, x1, z1, 7, hillHeightAt);
  // The west run is drawn in two spans, leaving the stream's gap open where
  // the river leg runs out past the property line (the collider towers stay
  // whole, the same treatment the brick wall's channel gap gets).
  {
    const g0 = RIVER.legZ0 + 0.5, g1 = RIVER.legZ1 - 0.5;
    fenceLine(scene, x0, z1, x0, g1, 7, hillHeightAt);
    fenceLine(scene, x0, g0, x0, z0, 7, hillHeightAt);
  }
  const brickMat = new THREE.MeshStandardMaterial({ color: BRICK_WALL.color, roughness: 0.95 });
  const capMat = new THREE.MeshStandardMaterial({ color: BRICK_WALL.capColor, roughness: 0.9 });
  // The river channel flows straight out under the south wall, so the wall is
  // built in two spans with a gap over the channel — the water can be seen
  // carrying on beyond the fence instead of dead-ending into the brickwork.
  const gap0 = RIVER.x0 - 1.6, gap1 = RIVER.x1 + 1.6;
  const spans = [[x0, gap0], [gap1, x1]].filter(([a, b]) => b - a > 0.5);
  for (const [a, b] of spans) {
    const len = b - a, cx = (a + b) / 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, BRICK_WALL.h, 0.8), brickMat);
    wall.position.set(cx, CORN_GROUND + BRICK_WALL.h / 2, z0);
    wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len, BRICK_WALL.capH, 1.1), capMat);
    cap.position.set(cx, CORN_GROUND + BRICK_WALL.h + BRICK_WALL.capH / 2, z0);
    cap.castShadow = true;
    scene.add(cap);
    // Pilasters along this span.
    const n = Math.max(1, Math.round(len / 10));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, BRICK_WALL.h + 0.5, 1.2), brickMat);
      p.position.set(a + len * t, CORN_GROUND + (BRICK_WALL.h + 0.5) / 2, z0);
      p.castShadow = true;
      scene.add(p);
      const pc = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.4), capMat);
      pc.position.set(a + len * t, CORN_GROUND + BRICK_WALL.h + 0.55, z0);
      scene.add(pc);
    }
  }
  // A low stone culvert arch bridging the channel gap, so the wall still reads
  // as continuous while the river runs under it and out into the open.
  const archW = gap1 - gap0, archCx = (gap0 + gap1) / 2;
  for (const sx of [-1, 1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.9, BRICK_WALL.h + 0.5, 1.2), brickMat);
    pier.position.set(archCx + sx * (archW / 2 - 0.45), CORN_GROUND + (BRICK_WALL.h + 0.5) / 2, z0);
    pier.castShadow = true;
    scene.add(pier);
  }
  const span = new THREE.Mesh(
    new THREE.BoxGeometry(archW, 0.7, 1.1),
    brickMat);
  span.position.set(archCx, CORN_GROUND + BRICK_WALL.h - 0.2, z0);
  span.castShadow = true;
  scene.add(span);
  const archCap = new THREE.Mesh(new THREE.BoxGeometry(archW + 0.2, BRICK_WALL.capH, 1.2), capMat);
  archCap.position.set(archCx, CORN_GROUND + BRICK_WALL.h + BRICK_WALL.capH / 2 + 0.15, z0);
  scene.add(archCap);
}

// ===== Underbrush around the return portal tree =====
// Bushes, rocks and reeds so the home portal reads as a wild hollow rather
// than a lone prop on mown grass.
function buildUnderbrush(scene) {
  const spots = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TWO_PI + Math.sin(i * 3.7) * 0.25;
    const r = 7 + (i * 2.99) % 7;
    const x = CORN_RETURN.x + Math.cos(a) * r;
    const z = CORN_RETURN.z + Math.sin(a) * r;
    if (z < FARM_BOUNDS.z0 + 3) continue;              // keep clear of the brick wall
    spots.push([x, z]);
  }
  for (const [bx, bz] of spots) {
    const s = 0.7 + ((bx * 3 + bz) % 5) * 0.18;
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), M.leaf);
    bush.scale.y = 0.65;
    bush.position.set(bx, CORN_GROUND + s * 0.5, bz);
    bush.castShadow = true;
    scene.add(bush);
  }
  // A few rocks tucked among the bushes.
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7 + 0.6;
    const r = 6.5 + (i * 2.1) % 6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + (i % 3) * 0.18), M.stone);
    rock.position.set(CORN_RETURN.x + Math.cos(a) * r, CORN_GROUND + 0.2, CORN_RETURN.z + Math.sin(a) * r);
    rock.rotation.set(i, i * 2, 0);
    rock.castShadow = true;
    scene.add(rock);
  }
  // Reeds at the spring end of the river leg.
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.4, 5), M.cornStalk);
    reed.position.set(
      RIVER.legX0 + 1.5 + (i * 2.3) % 12,
      CORN_GROUND + 0.7,
      side > 0 ? RIVER.legZ1 + 0.5 : RIVER.legZ0 - 0.5
    );
    reed.rotation.z = Math.sin(i * 5.1) * 0.15;
    scene.add(reed);
  }
}

// ===== The plateau =====
// The plateau mesh is displaced straight from hillHeightAt — the SAME function
// the physics rides — so the surface you see is the surface you drive. The grid
// runs from the river bank at the south toe all the way out past the north
// fence, so the shoulder that eases down beyond the fence is part of the same
// mesh (it fades into the backing ridges at zBack). Returns { fence } so the
// crash can hide the lip fence.
function buildHill(scene) {
  const segX = 16, segZ = 44;
  const grid = (x0, x1, segsX, lift) => {
    const verts = [];
    const idx = [];
    for (let iz = 0; iz <= segZ; iz++) {
      const z = HILL.zNear + (HILL.zBack - HILL.zNear) * (iz / segZ);
      for (let ix = 0; ix <= segsX; ix++) {
        const x = x0 + (x1 - x0) * (ix / segsX);
        verts.push(x, hillHeightAt(x, z) + lift, z);
      }
    }
    const row = segsX + 1;
    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < segsX; ix++) {
        const a = iz * row + ix, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  const mound = new THREE.Mesh(grid(HILL.x0, HILL.x1, segX, 0), M.grass);
  mound.castShadow = true; mound.receiveShadow = true;
  scene.add(mound);

  // A worn dirt track along the crown — the truck's road, at the truck's x.
  const track = new THREE.Mesh(grid(FARM_TRUCK.x - 5, FARM_TRUCK.x + 5, 8, 0.07), M.dirt);
  track.receiveShadow = true;
  scene.add(track);

  // The lip fence at the crown's south edge — the truck breaks through it on
  // its way down the face. Its posts and rails stand on the level crown.
  const fence = new THREE.Group();
  const fw = HILL.x1 - HILL.x0;
  const nPosts = 16;
  for (let i = 0; i <= nPosts; i++) {
    const t = i / nPosts;
    const x = HILL.x0 + fw * t;
    const gy = hillHeightAt(x, HILL.zTop);
    for (const ry of [0.5, 1.1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(fw / nPosts + 0.1, 0.12, 0.12), M.woodDark);
      rail.position.set(x, gy + ry, HILL.zTop);
      scene.add(rail); fence.add(rail);
    }
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.8, 0.18), M.wood);
    post.position.set(x, gy + 0.9, HILL.zTop);
    scene.add(post); fence.add(post);
  }
  return { fence };
}

// Low grass ridges beyond the fences that continue the hill's mass, so the
// mound reads as part of a longer landform. Pure scenery.
function buildBerms(scene) {
  const N = 10;
  for (const b of ROLLING) {
    const profile = new THREE.Shape();
    profile.moveTo(-b.len / 2, 0);
    for (let k = 1; k < N * 2; k++) {
      const u = (k / (N * 2)) * 2 - 1;          // -1 .. 1
      profile.lineTo(u * b.len / 2, (b.h * (1 + Math.cos(Math.PI * u))) / 2);
    }
    profile.lineTo(b.len / 2, 0);
    profile.closePath();
    const geo = new THREE.ExtrudeGeometry(profile, { depth: b.halfW * 2, bevelEnabled: false });
    const m = new THREE.Mesh(geo, M.grass);
    if (b.axis === 'z') {
      geo.translate(0, 0, -b.halfW);
      m.rotation.y = -Math.PI / 2;
    } else {
      geo.translate(0, 0, -b.halfW);
    }
    m.position.set(b.x, CORN_GROUND, b.z);
    m.receiveShadow = true;
    scene.add(m);
  }

  // The river's source: a rounded hill OUTSIDE the fence, east of the channel,
  // that the water appears to come down from — its south face slopes right into
  // the channel's east bank, so the river reads as draining off a higher
  // landform beyond the farm rather than starting out of nowhere. Smooth radial
  // dome (no flat clipped flank) that rolls away toward the horizon.
  const mound = (mx, mz, rad, hi) => {
    const seg = 22, rings = 6;
    const verts = [], idx = [];
    verts.push(mx, hi, mz);
    for (let r = 1; r <= rings; r++) {
      const rr = (r / rings) * rad;
      const y = hi * Math.pow(1 - r / rings, 1.6);
      for (let a = 0; a < seg; a++) {
        const th = (a / seg) * TWO_PI;
        verts.push(mx + Math.cos(th) * rr, y, mz + Math.sin(th) * rr);
      }
    }
    const ringStart = (r) => 1 + (r - 1) * seg;
    for (let a = 0; a < seg; a++) {
      idx.push(0, ringStart(1) + a, ringStart(1) + ((a + 1) % seg));
    }
    for (let r = 1; r < rings; r++) {
      for (let a = 0; a < seg; a++) {
        const a0 = ringStart(r) + a, a1 = ringStart(r) + ((a + 1) % seg);
        const b0 = ringStart(r + 1) + a, b1 = ringStart(r + 1) + ((a + 1) % seg);
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.grass);
    m.position.y = CORN_GROUND;
    m.receiveShadow = true;
    scene.add(m);
  };
  // East of the channel (channel x1 = RIVER.x1), well outside the fence line.
  mound(RIVER.x1 + 26, 40, 40, 16);
  mound(RIVER.x1 + 20, 128, 34, 12);
  mound(RIVER.x1 + 40, 90, 44, 10);
  // The river's western source: a rounded mound OUTSIDE the fence at the
  // spring end of the leg, so the water appears to come down off higher
  // ground beyond the farm rather than starting out of nowhere.
  mound(RIVER.legX0 - 22, (RIVER.legZ0 + RIVER.legZ1) / 2, 34, 11);
}

// ===== Bull pasture =====
// A rail fence around a paddock on the plateau's level crown, drawn as
// individual bays (one post-and-panel stretch per bay, matching
// pastureFenceBayDefs / pastureFenceColliders in layout.js). Ram a side hard
// enough and only the bays you actually smash drop; the bull inside comes out
// after whoever did it.
function buildPasture(scene) {
  const h = PASTURE_FENCE_H;
  const base = HILL.topY;
  const defs = pastureFenceBayDefs();
  const bays = defs.map((b, i, all) => {
    const g = new THREE.Group();
    const dir = _v.set(b.bx - b.ax, 0, b.bz - b.az).normalize();
    for (const ry of [0.55, 1.45]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(b.len + 0.15, 0.12, 0.1), M.woodDark);
      rail.position.set(b.cx, base + ry, b.cz);
      rail.quaternion.setFromUnitVectors(_xAxis, dir);
      rail.castShadow = true;
      g.add(rail);
    }
    // Each bay owns its start post; the very last bay also owns the closing
    // post, so no two bays ever draw the same post.
    const post = (px, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.18), M.wood);
      m.position.set(px, base + h / 2, pz);
      m.castShadow = true;
      g.add(m);
    };
    post(b.ax, b.az);
    if (i === all.length - 1) post(b.bx, b.bz);
    scene.add(g);
    return g;
  });
  return { bays, defs, base };
}

// ===== Fence wreckage =====
// When a bay is smashed its boards should not blink out — they explode, tumble
// and lie in the grass, permanently, and can be batted around again. This is a
// dedicated pool (the shared makeDebrisPool fades and recycles, which is wrong
// here): each board is a free rigid body with gravity, tumbling flight, a real
// ground landing that settles into a resting pose, and a re-kick when a car
// runs over a board already down. A smashed bay yields two long rails plus its
// posts, launched off in every direction with absurd spin.
const FENCE_BOARD_GRAVITY = 22;
function makeFenceWreck(scene) {
  const parent = new THREE.Group();
  parent.name = 'FenceWreck';
  scene.add(parent);
  const boards = [];
  const _spinAxis = new THREE.Vector3();
  const _dq = new THREE.Quaternion();

  // A board is a box whose long axis is local +X; `len` is set when it spawns so
  // posts (short) and rails (long) share one pool. Each board reuses one of a
  // handful of geometries scaled to its length, so the pool never allocates.
  const railGeo = new THREE.BoxGeometry(1, 0.12, 0.1);
  const postGeo = new THREE.BoxGeometry(0.18, 1, 0.18);

  return {
    group: parent,
    boards,
    // Flight: launch a batch of boards from a bay def. `base` is the ground Y
    // the fence stands on; `impact` is the world point of the hit, so boards
    // blow away from the impact as well as off the bay's own direction.
    burst(def, base, impactX, impactZ, count) {
      // Two rails (the long horizontal planks) and one or two posts.
      const dir = Math.atan2(def.bz - def.az, def.bx - def.ax);
      const pieces = [];
      pieces.push({ geo: railGeo, len: def.len + 0.15, kind: 'rail', ry: 0.55 });
      pieces.push({ geo: railGeo, len: def.len + 0.15, kind: 'rail', ry: 1.45 });
      pieces.push({ geo: postGeo, len: PASTURE_FENCE_H, kind: 'post', ry: 0.5 });
      if (count > 1) pieces.push({ geo: postGeo, len: PASTURE_FENCE_H, kind: 'post', ry: 0.5 });
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        const t = i / Math.max(1, pieces.length - 1) - 0.5;
        // Where on the bay this board starts (posts at the ends, rails spread).
        const frac = p.kind === 'post' ? (i === 2 ? 0 : 1) : 0.5 + t * 0.4;
        const bx = def.ax + (def.bx - def.ax) * frac;
        const bz = def.az + (def.bz - def.az) * frac;
        const y = base + p.ry + (p.kind === 'post' ? 0.0 : 0);
        // Blow outward from the impact point, plus a big upward kick.
        let ox = bx - impactX, oz = bz - impactZ;
        let ol = Math.hypot(ox, oz);
        if (ol < 1e-3) { ox = Math.cos(dir); oz = Math.sin(dir); ol = 1; }
        const outSpeed = 4.5 + Math.random() * 4.0;
        const board = {
          mesh: null, geo: p.geo, kind: p.kind, len: p.len,
          x: bx, y, z: bz,
          vx: (ox / ol) * outSpeed + (Math.random() - 0.5) * 3,
          vy: 6.5 + Math.random() * 5.5,
          vz: (oz / ol) * outSpeed + (Math.random() - 0.5) * 3,
          // A wild end-over-end tumble that differs every time.
          wx: (Math.random() - 0.5) * 22,
          wy: (Math.random() - 0.5) * 22,
          wz: (Math.random() - 0.5) * 22,
          rest: false,
        };
        board.mesh = new THREE.Mesh(p.geo, p.kind === 'post' ? M.wood : M.woodDark);
        board.mesh.castShadow = true;
        board.mesh.position.set(board.x, board.y, board.z);
        // Lie the long axis along the bay direction, matching where it broke off.
        board.mesh.quaternion.setFromAxisAngle(_up, -dir);
        board.mesh.scale.set(p.kind === 'post' ? 1 : p.len, p.kind === 'post' ? PASTURE_FENCE_H : 1, 1);
        parent.add(board.mesh);
        boards.push(board);
      }
    },
    // Re-kick a resting board when a car rolls over it. Returns true if a board
    // moved, so the caller can shake on the biggest hits.
    knockAt(x, z, radius, speed) {
      let kicked = false;
      for (const b of boards) {
        if (!b.rest) continue;
        const dx = b.x - x, dz = b.z - z;
        const d = Math.hypot(dx, dz);
        if (d > radius + 0.6) continue;
        const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0;
        const power = 5.0 + speed * 0.8;
        b.vx = nx * power + (Math.random() - 0.5) * 2.5;
        b.vz = nz * power + (Math.random() - 0.5) * 2.5;
        b.vy = 3.5 + Math.random() * 3.5;
        b.wx = (Math.random() - 0.5) * 26;
        b.wy = (Math.random() - 0.5) * 26;
        b.wz = (Math.random() - 0.5) * 26;
        b.rest = false;
        kicked = true;
      }
      return kicked;
    },
    update(dt) {
      for (const b of boards) {
        if (b.rest) continue;
        b.vy -= FENCE_BOARD_GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        // Integrate the tumble through a quaternion so boards spin on all axes.
        const wlen = Math.hypot(b.wx, b.wy, b.wz);
        if (wlen > 1e-4) {
          _spinAxis.set(b.wx / wlen, b.wy / wlen, b.wz / wlen);
          _dq.setFromAxisAngle(_spinAxis, wlen * dt);
          b.mesh.quaternion.premultiply(_dq);
        }
        const floor = hillHeightAt(b.x, b.z) + 0.1;
        if (b.y <= floor) {
          b.y = floor;
          if (b.vy < -0.5) {
            // A bounce, then friction slows the skid until it settles for good.
            b.vy = -b.vy * 0.28;
            b.vx *= 0.6; b.vz *= 0.6;
            b.wx *= 0.5; b.wy *= 0.5; b.wz *= 0.5;
          } else {
            b.vy = 0;
            b.vx *= Math.max(0, 1 - 6 * dt);
            b.vz *= Math.max(0, 1 - 6 * dt);
            b.wx *= Math.max(0, 1 - 8 * dt);
            b.wy *= Math.max(0, 1 - 8 * dt);
            b.wz *= Math.max(0, 1 - 8 * dt);
            if (Math.hypot(b.vx, b.vz) < 0.25 && Math.hypot(b.wx, b.wy, b.wz) < 0.5) {
              // Settled: lay it flat in the grass and stop integrating it. It
              // stays put (and knockable) until the world resets.
              b.rest = true;
              b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0;
              b.mesh.position.set(b.x, hillHeightAt(b.x, b.z) + 0.1, b.z);
            }
          }
        }
        b.mesh.position.set(b.x, b.y, b.z);
      }
    },
    clear() {
      for (const b of boards) {
        parent.remove(b.mesh);
        b.rest = true;
      }
      boards.length = 0;
    },
  };
}

// A heavy, low-slung bull. Faces local +X; the driver-side profile is all that
// really reads, so it is a simple box body with a broad head, horns and a tail.
// The whole head assembly rides in `headG`, a group pivoted at the neck so the
// bull can drop its nose to graze or lower its horns to charge.
function makeBull() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.25, 1.15), M.bull);
  body.position.set(0, 1.2, 0);
  body.castShadow = true;
  g.add(body);
  const headG = new THREE.Group();
  headG.position.set(1.55, 1.45, 0);
  g.add(headG);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.85), M.bull);
  head.castShadow = true;
  headG.add(head);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.55), M.bullMuzzle);
  muzzle.position.set(0.5, -0.17, 0);
  headG.add(muzzle);
  for (const sz of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 6), M.horn);
    horn.position.set(0.15, 0.55, sz * 0.42);
    horn.rotation.z = -0.5;
    horn.rotation.x = sz * 0.35;
    headG.add(horn);
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.36), M.bullMuzzle);
    ear.position.set(-0.05, 0.21, sz * 0.56);
    headG.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), M.tire);
    eye.position.set(0.43, 0.13, sz * 0.24);
    headG.add(eye);
  }
  const legs = [];
  for (const lx of [-0.85, 0.85]) {
    for (const lz of [-0.42, 0.42]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.95, 0.3), M.bull);
      leg.position.set(lx, 0.48, lz);
      leg.castShadow = true;
      g.add(leg);
      legs.push(leg);
    }
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 1.0, 5), M.bull);
  tail.position.set(-1.35, 1.1, 0);
  tail.rotation.z = 0.5;
  g.add(tail);
  return { group: g, legs, headG };
}


// ===== The river =====
// An L-shaped watercourse: the channel runs south along the east side, and
// the leg turns west at the base of the hill's north face and runs to the
// mill. Trench walls + floors, translucent water planes, and foam streaks
// racing along each leg's flow direction (animated by update()).
function buildRiver(scene) {
  const { x0, x1, legX0, legZ0, legZ1, waterY } = RIVER;
  // The riverbed is a heightfield, not a flat floor with vertical walls: every
  // bank slopes from grass level down to the bed (riverSurfaceY), so the car
  // can drive in and out anywhere. Built as two grids that tile the L exactly
  // (the channel, plus the leg west of it) so no faces overlap.
  const bedGrid = (gx0, gx1, gz0, gz1) => {
    const segX = Math.max(1, Math.ceil((gx1 - gx0) / 1.5));
    const segZ = Math.max(1, Math.ceil((gz1 - gz0) / 3));
    const verts = [], idx = [];
    for (let iz = 0; iz <= segZ; iz++) {
      const z = gz0 + (gz1 - gz0) * (iz / segZ);
      for (let ix = 0; ix <= segX; ix++) {
        const x = gx0 + (gx1 - gx0) * (ix / segX);
        verts.push(x, riverSurfaceY(x, z) ?? CORN_GROUND, z);
      }
    }
    const row = segX + 1;
    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < segX; ix++) {
        const a = iz * row + ix, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.dirt);
    m.receiveShadow = true;
    scene.add(m);
  };
  const waterPlane = (w, d, cx, cz) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.water);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, waterY, cz);
    scene.add(m);
    return m;
  };
  const chanW = x1 - x0, chanCx = (x0 + x1) / 2;
  const chanZ0 = -GROUND_EX, chanZ1 = legZ1;
  const chanLen = chanZ1 - chanZ0;
  bedGrid(x0, x1, chanZ0, chanZ1);
  const chanWater = waterPlane(chanW, chanLen, chanCx, (chanZ0 + chanZ1) / 2);

  const legLen = x1 - legX0, legCx = (legX0 + x1) / 2, legW = legZ1 - legZ0;
  // Only the part west of the channel — the corner is already in the channel grid.
  bedGrid(legX0, x0, legZ0, legZ1);
  const legWater = waterPlane(legLen, legW, legCx, (legZ0 + legZ1) / 2);

  // Foam streaks, one pool per leg, each racing along its flow direction.
  // spanA is the x-extent, spanB the z-extent of the pool.
  const foam = [];
  const addFoam = (count, axis, cx, cz, spanA, spanB) => {
    for (let i = 0; i < count; i++) {
      const len = 2 + Math.random() * 3.5;
      const f = new THREE.Mesh(
        new THREE.BoxGeometry(axis === 'x' ? len : 0.4, 0.04, axis === 'x' ? 0.4 : len),
        M.foam
      );
      f.position.set(
        cx + (Math.random() - 0.5) * spanA,
        waterY + 0.04,
        cz + (Math.random() - 0.5) * spanB
      );
      f.userData.speed = 7 + Math.random() * 6;
      f.userData.axis = axis;
      scene.add(f);
      foam.push(f);
    }
  };
  addFoam(18, 'z', chanCx, (chanZ0 + chanZ1) / 2, chanW - 2.2, chanLen - 8);
  addFoam(12, 'x', legCx, (legZ0 + legZ1) / 2, legLen - 8, legW - 2.2);
  return { waters: [chanWater, legWater], foam };
}

// ===== Mill house =====
// A wide mill on the south bank of the river's leg: stone footing, timber
// walls, gable roof, windows on every face, doorway on the south (farm) side.
// The water wheel hangs on the north wall, dips into the east-running current
// (so it spins about Z), and drives the machinery inside — a shaft down the
// long axis, two meshed gears, a crank and a toothed drum, all kept turning
// by update().
function buildMill(scene) {
  const { x: cx, z: cz, halfW: hw, halfD: hd, wallH: h, doorHalf, wheel: wh, drum: dr } = MILL;

  const wall = (w, d, x, z, mat = M.wood, height = h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
    m.position.set(x, height / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // A board-on-board timber wall you can partly see through: a solid sill and
  // top plate, a mid rail, and vertical planks spaced with small gaps so the
  // machinery inside shows between them. `along` is the run ('x' or 'z'); the
  // wall stays solid for the car (see millColliders) — only the eye passes
  // through the gaps. `skip` (a [lo,hi] along the run) leaves a doorway open.
  const slatWall = (along, len, thick, fixed, runCentre, height, skip) => {
    // Sill, top plate and mid rail (solid bands).
    const band = (y, hh) => {
      const m = along === 'x'
        ? new THREE.Mesh(new THREE.BoxGeometry(len, hh, thick + 0.06), M.woodDark)
        : new THREE.Mesh(new THREE.BoxGeometry(thick + 0.06, hh, len), M.woodDark);
      m.position.set(along === 'x' ? runCentre : fixed, y, along === 'x' ? fixed : runCentre);
      m.castShadow = true;
      scene.add(m);
    };
    band(0.25, 0.5);
    band(height * 0.5, 0.18);
    band(height - 0.15, 0.3);
    // Vertical planks, gap-spaced; alternate in/out so it reads as board-on-board.
    // Doubled pitch (1.24 vs the old 0.62) so the boards stand TWICE as far
    // apart: wide 0.86 gaps let the machinery inside be read straight through
    // the walls from outside.
    const pitch = 1.24, plankW = 0.38;
    const n = Math.max(1, Math.floor(len / pitch));
    const start = runCentre - (n * pitch) / 2 + pitch / 2;
    for (let i = 0; i < n; i++) {
      const a = start + i * pitch;
      if (skip && a > skip[0] && a < skip[1]) continue;
      const proud = (i % 2 === 0) ? 0.04 : -0.02;
      const hgt = height - 0.5;
      const m = along === 'x'
        ? new THREE.Mesh(new THREE.BoxGeometry(plankW, hgt, thick), M.wood)
        : new THREE.Mesh(new THREE.BoxGeometry(thick, hgt, plankW), M.wood);
      m.position.set(
        along === 'x' ? a : fixed + proud,
        0.5 + hgt / 2,
        along === 'x' ? fixed + proud : a);
      m.castShadow = true;
      scene.add(m);
    }
    // Heavy end posts at the corners.
    for (const s of [-1, 1]) {
      const a = runCentre + s * (len / 2 - 0.2);
      const post = along === 'x'
        ? new THREE.Mesh(new THREE.BoxGeometry(0.4, height, thick + 0.1), M.woodDark)
        : new THREE.Mesh(new THREE.BoxGeometry(thick + 0.1, height, 0.4), M.woodDark);
      post.position.set(along === 'x' ? a : fixed, height / 2, along === 'x' ? fixed : a);
      post.castShadow = true;
      scene.add(post);
    }
  };
  // Stone footing around the whole footprint.
  const footing = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 0.7, hd * 2 + 1.2), M.stone);
  footing.position.set(cx, 0.35, cz);
  footing.castShadow = true; footing.receiveShadow = true;
  scene.add(footing);

  slatWall('z', hd * 2, 0.6, cx + hw, cz, h);              // east
  slatWall('z', hd * 2, 0.6, cx - hw, cz, h);              // west
  slatWall('x', hw * 2, 0.6, cz + hd, cx, h);              // north (river face)
  const segW = hw - doorHalf;
  slatWall('x', segW, 0.6, cz - hd, cx - (hw + doorHalf) / 2, h);  // south, west of door
  slatWall('x', segW, 0.6, cz - hd, cx + (hw + doorHalf) / 2, h);  // south, east of door
  // Door header + a plank door standing open against the east jamb.
  const header = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2, 1.4, 0.6), M.woodDark);
  header.position.set(cx, h - 0.7, cz - hd);
  scene.add(header);
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 1.7, h - 1.4, 0.1), M.woodDark);
  door.position.set(cx + doorHalf * 1.05, (h - 1.4) / 2, cz - hd + 0.55);
  door.rotation.y = 0.9;
  scene.add(door);

  // Windows: three down each long (east/west) face, two on the river face
  // overlooking the wheel, two flanking the door — the machinery shows from
  // every side.
  const pane = (w, d, x, z, y = 3.4) => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), M.window);
    win.position.set(x, y, z);
    scene.add(win);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 1.9, d > w ? d : w + 0.3), M.woodDark);
    trim.position.set(x, y, z);
    scene.add(trim);
  };
  for (const s of [-1, 1]) {
    for (const dz of [-hd * 0.55, 0, hd * 0.55]) {
      pane(0.12, 1.6, cx + s * (hw + 0.05), cz + dz);
    }
    pane(1.6, 0.12, cx + s * hw * 0.45, cz + hd + 0.05);          // river face
    pane(1.6, 0.12, cx + s * (hw * 0.45 + doorHalf * 0.4), cz - hd - 0.05); // south flanks
  }

  // Gable roof, ridge along x; gable triangles close both ends.
  const ridgeY = h + 3;
  const slopeLen = Math.hypot(hd, ridgeY - h);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.0, 0.45, slopeLen), M.roof);
    r.position.set(cx, (h + ridgeY) / 2, cz + s * hd / 2);
    // The sign matters: with `-s` the north slab tipped its north edge UP and
    // its ridge edge DOWN — a valley, not a gable. Farmhouse (same formula,
    // `+s`) was always right; this one was flipped.
    r.rotation.x = s * Math.atan2(ridgeY - h, hd);
    r.castShadow = true;
    scene.add(r);
  }
  // Ridge cap along the ridge (the roof slabs' top edges meet at ridgeY).
  const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.0, 0.28, 0.3), M.roof);
  ridgeCap.position.set(cx, ridgeY + 0.28, cz);
  ridgeCap.castShadow = true;
  scene.add(ridgeCap);
  // Gable triangles close the EAST and WEST ends (the ridge runs along x, so
  // the open ends are the long-side ends — they used to sit at north/south,
  // where the roof was already closed, leaving the real ends gaping).
  for (const s of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(-hd, 0); tri.lineTo(hd, 0); tri.lineTo(0, ridgeY - h);
    tri.closePath();
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false });
    const m = new THREE.Mesh(g, M.wood);
    m.position.set(cx + s * (hw + 0.1), h, cz);
    m.rotation.y = s * Math.PI / 2;
    scene.add(m);
  }

  // Interior floor (so the doorway doesn't open onto grass).
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 - 0.8, hd * 2 - 0.8), M.woodDark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.04, cz);
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- the water wheel (spins about Z: the current runs east) ----
  // A huge wheel as wide as the river leg it sits in: twin rims pushed out to
  // the full span, face spokes on each side, and paddles as wide as the wheel,
  // so it reads as a mill wheel filling the current, not a thin bicycle hoop.
  const wheel = new THREE.Group();
  wheel.position.set(wh.x, wh.y, wh.z);
  const rimZ = wh.halfW - 0.55;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, wh.halfW * 2, 12), M.metalDark);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  for (const sz of [-rimZ, rimZ]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(wh.r, 0.13, 6, 32), M.woodDark);
    ring.position.z = sz;
    ring.castShadow = true;
    wheel.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(wh.r * 0.55, 0.09, 6, 24), M.woodDark);
    inner.position.z = sz;
    wheel.add(inner);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, wh.r, 0.15), M.woodDark);
      spoke.position.set(Math.cos(a) * wh.r / 2, Math.sin(a) * wh.r / 2, sz);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
    }
  }
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, wh.r * 2, 0.15), M.woodDark);
    spoke.rotation.z = (i * Math.PI) / 8;
    wheel.add(spoke);
  }
  // Paddles run the full width of the wheel, between the rims.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TWO_PI;
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, wh.halfW * 2 - 0.3), M.wood);
    paddle.position.set(Math.cos(a) * wh.r, Math.sin(a) * wh.r, 0);
    paddle.rotation.z = a;
    paddle.castShadow = true;
    wheel.add(paddle);
  }
  scene.add(wheel);
  // Axle from the north wall out along Z to the wheel hub.
  const axleLen = wh.z - (cz + hd) + wh.halfW;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, axleLen, 8), M.metalDark);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(wh.x, wh.y, cz + hd + axleLen / 2);
  scene.add(axle);

  // ---- the threshing machinery inside ----
  // Main shaft along z, continuing the wheel axle through the wall.
  const shaftGeo = new THREE.CylinderGeometry(0.14, 0.14, 14, 8);
  shaftGeo.rotateX(Math.PI / 2);
  const shaft = new THREE.Mesh(shaftGeo, M.metalDark);
  shaft.position.set(cx, wh.y, cz);
  shaft.castShadow = true;
  scene.add(shaft);
  for (const oz of [-4.5, 1.0]) {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.2), M.metal);
    collar.position.set(0, 0, oz);
    shaft.add(collar);
  }

  // Two meshed gears (offset in y, both spinning about z).
  const makeGear = (radius, teeth, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.3, 16), M.metal);
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TWO_PI;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.3), M.metalDark);
      tooth.position.set(Math.cos(a) * (radius + 0.12), Math.sin(a) * (radius + 0.12), 0);
      tooth.rotation.z = a;
      g.add(tooth);
    }
    scene.add(g);
    return g;
  };
  const gearA = makeGear(1.0, 12, cx, wh.y, cz - 3);
  const gearB = makeGear(0.9, 10, cx, wh.y + 1.9, cz - 3);
  // Stub axle for gear B.
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), M.metalDark);
  stub.rotation.x = Math.PI / 2;
  stub.position.set(cx, wh.y + 1.9, cz - 3);
  scene.add(stub);

  // Crank disc on the shaft with a rod swinging off it.
  const crank = new THREE.Group();
  crank.position.set(cx, wh.y, cz - 6);
  const cDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.24, 14), M.metal);
  cDisc.rotation.x = Math.PI / 2;
  crank.add(cDisc);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.18), M.metalDark);
  rod.position.set(0.55, 0, 0.25);
  rod.rotation.z = -Math.PI / 2;
  crank.add(rod);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), M.metalDark);
  pin.rotation.x = Math.PI / 2;
  pin.position.set(1.1, 0, 0.3);
  crank.add(pin);
  scene.add(crank);

  // The threshing drum up on its red frame — the star of the show.
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.7, 4.0), M.barn);
  body.position.set(dr.x, 0.85, dr.z);
  body.castShadow = true; body.receiveShadow = true;
  scene.add(body);
  for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.3), M.metalDark);
    leg.position.set(dr.x - 1.6, 2.0, dr.z + sz * 1.2);
    scene.add(leg);
  }
  const drum = new THREE.Group();
  drum.position.set(dr.x, dr.y, dr.z);
  const drumBody = new THREE.Mesh(
    new THREE.CylinderGeometry(dr.r, dr.r, dr.len, 14), M.metal
  );
  drumBody.rotation.x = Math.PI / 2;
  drum.add(drumBody);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TWO_PI;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, dr.len), M.metalDark);
    bar.position.set(Math.cos(a) * (dr.r + 0.08), Math.sin(a) * (dr.r + 0.08), 0);
    bar.rotation.z = a;
    drum.add(bar);
  }
  drum.castShadow = true;
  scene.add(drum);

  // The heavy timber milling train and the copper distillery that share the
  // floor with the thresher. Both hands back the parts update() animates.
  const millParts = buildMillInterior(scene, { cx, cz, hw, hd, h, wallH: h, ridgeY: h + 3 });
  const stillParts = buildDistillery(scene, { cx, cz, hw, hd, h, ridgeY: h + 3 });

  return { wheel, shaft, gearA, gearB, crank, drum, ...millParts, ...stillParts };
}

// ===== Mill machinery =====
// The flour-milling train that towers over the thresher. Everything is driven
// off the one water-wheel shaft, so the moving parts share the wheel's slow
// turn: the great spur wheel on the shaft drives the upright shaft, which turns
// the stone nuts, which spin the millstones under their hoppers and shoes.
// Wooden everything — hurst frame, tun vats, elevator legs, bolters, chutes —
// because a country mill in this world is timber, iron and stone.
function buildMillInterior(scene, mill) {
  const { cx, cz, hw, hd, h, ridgeY } = mill;
  // Local helper: a revolving group plus its axis. `axis` is 'z' (shaft/gear,
  // like the water wheel, which turns about Z) or 'y' (an upright shaft).
  const part = (x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    scene.add(g);
    return g;
  };
  const box = (g, w, d, hh, x, y, z, mat = M.wood) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (g, rt, rb, hh, x, y, z, mat = M.woodDark, axis = 'y', seg = 14) => {
    const geo = new THREE.CylinderGeometry(rt, rb, hh, seg);
    if (axis === 'x') geo.rotateZ(Math.PI / 2);
    else if (axis === 'z') geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  // ---- the hurst frame: the massive timber cradle the stones sit in ----
  const husX = cx - 6, husZ = cz - 4;   // the stone floor, west-centre
  for (const sx of [-3.2, 0, 3.2]) {
    box(scene, 0.55, 0.55, 3.0, husX + sx, 1.5, husZ + 2.6, M.woodDark);
    box(scene, 0.55, 0.55, 3.0, husX + sx, 1.5, husZ - 2.6, M.woodDark);
  }
  // Top beams of the hurst frame (carry the stone spindles).
  box(scene, 7.4, 0.6, 0.6, husX, 3.0, husZ + 2.6, M.woodDark);
  box(scene, 7.4, 0.6, 0.6, husX, 3.0, husZ - 2.6, M.woodDark);
  box(scene, 0.6, 0.6, 5.8, husX - 3.2, 3.0, husZ, M.woodDark);
  box(scene, 0.6, 0.6, 5.8, husX + 3.2, 3.0, husZ, M.woodDark);

  // ---- the great spur wheel: the massive horizontal gear on the upright ----
  // It meshes with the water-wheel shaft (gearB) and turns the upright shaft.
  const spur = part(husX, 5.6, husZ);
  const spurR = 3.2;
  const spurDisc = new THREE.Mesh(new THREE.CylinderGeometry(spurR, spurR, 0.34, 22), M.woodDark);
  spurDisc.rotation.x = Math.PI / 2;
  spur.add(spurDisc);
  // Wooden cogs all round the rim (the "cogs" of a cog-and-round gear).
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TWO_PI;
    const cog = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.4), M.oak);
    cog.position.set(Math.cos(a) * (spurR + 0.16), Math.sin(a) * (spurR + 0.16), 0);
    cog.rotation.z = a;
    cog.castShadow = true;
    spur.add(cog);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TWO_PI;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, spurR * 2, 0.2), M.wood);
    spoke.rotation.z = a;
    spur.add(spoke);
  }
  // Upright shaft (about Y) from the spur wheel up through the stone floor
  // above — the tall vertical the whole milling room is built around.
  const upright = part(husX, 0, husZ);
  cyl(upright, 0.32, 0.36, 16, 0, 8, 0, M.woodDark, 'y', 12);
  cyl(upright, 0.55, 0.55, 0.5, 0, 5.6, 0, M.metalDark, 'y', 12);   // collar at spur
  cyl(upright, 0.5, 0.5, 0.4, 0, 11.0, 0, M.metalDark, 'y', 12);    // crown bearing

  // ---- two pairs of millstones on stone nuts under wooden vats ----
  // Each stone sits in a wooden tun (vat) on the hurst frame; the stone nut on
  // the upright drives it, and a hopper + shoe feed it from above.
  const stoneNuts = [];
  const shoes = [];
  const stoneXs = [-3.2, 3.2];
  for (const sx of stoneXs) {
    const stX = husX + sx, stZ = husZ;
    // Timber bed + wooden tun vat around the stones.
    const tun = new THREE.Group();
    tun.position.set(stX, 3.05, stZ);
    scene.add(tun);
    const vat = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.65, 1.5, 18, 1, true), M.oak);
    vat.position.y = 0.75;
    vat.castShadow = true;
    tun.add(vat);
    const vatRim = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.12, 6, 20), M.oakDark);
    vatRim.rotation.x = Math.PI / 2;
    vatRim.position.y = 1.5;
    tun.add(vatRim);
    // The bedstone (fixed, grooved) and the runner stone on the stone nut.
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.32, 20), M.stone);
    bed.position.y = 0.16;
    tun.add(bed);
    const runner = part(stX, 3.05 + 0.5, stZ);   // turns about Y
    const runnerMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.32, 20), M.stone);
    runner.add(runnerMesh);
    // The stone nut: the wooden gear under the runner that the spur drives.
    const nut = new THREE.Group();
    nut.position.set(stX, 2.75, stZ);
    scene.add(nut);
    cyl(nut, 0.55, 0.55, 0.42, 0, 0, 0, M.oak, 'y', 12);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TWO_PI;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.22), M.woodDark);
      tooth.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
      tooth.rotation.y = -a;
      nut.add(tooth);
    }
    // The hopper: an inverted square pyramid above the stone, on a timber frame.
    const hop = new THREE.Group();
    hop.position.set(stX, 6.2, stZ);
    scene.add(hop);
    const hopper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 1.3, 1.6, 4), M.woodDark
    );
    hopper.rotation.y = Math.PI / 4;
    hopper.position.y = 0.8;
    hopper.castShadow = true;
    hop.add(hopper);
    const hopRim = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 2.1), M.wood);
    hopRim.position.y = 1.62;
    hop.add(hopRim);
    // hopper legs down to the hurst frame top
    for (const lx of [-0.95, 0.95]) for (const lz of [-0.95, 0.95]) {
      box(hop, 0.16, 0.16, 3.2, lx, -0.4, lz, M.woodDark);
    }
    // The shoe: the vibrating trough that rattles grain from hopper to hole.
    const shoe = part(stX, 5.0, stZ);
    const shoeBox = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.0), M.oakDark);
    shoeBox.position.y = -0.4;
    shoeBox.rotation.x = 0.18;
    shoe.add(shoeBox);
    const damsel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), M.metalDark);
    damsel.position.y = -0.9;
    shoe.add(damsel);
    stoneNuts.push(nut);
    shoes.push(shoe);
  }

  // ---- elevator legs: tall boxes carrying a bucket belt ----
  // Meal is lifted from the stone floor up to the bolters on the gantry.
  const eleX = cx + 1.0, eleZ = cz - 2.0;
  const legH = 9.4;
  for (const sz of [-0.55, 0.55]) {
    box(scene, 0.7, 0.7, legH, eleX, legH / 2 + 0.4, eleZ + sz, M.woodDark);
  }
  // Bucket belt inside, animated: a chain of small buckets on a loop.
  const belt = part(eleX, 0, eleZ);
  const buckets = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), M.metalDark);
    const y = 0.6 + t * legH;
    const loop = Math.sin(t * TWO_PI) * 0.35;   // the belt wraps the top/bottom
    b.position.set(loop, y, 0);
    belt.add(b);
    buckets.push({ mesh: b, t });
  }
  // Head pulley + boot pulley.
  cyl(scene, 0.4, 0.4, 0.7, eleX, legH + 0.6, eleZ, M.metalDark, 'z', 10);
  cyl(scene, 0.4, 0.4, 0.7, eleX, 0.6, eleZ, M.metalDark, 'z', 10);

  // ---- bolters: tilting, fabric-covered reels on the gantry ----
  // Two cylinders swathed in cloth, one per stone, that sift meal into chutes.
  const bolters = [];
  for (let i = 0; i < 2; i++) {
    const bx = cx - 6 + i * 6.4, bz = cz + 4.2;
    const bol = part(bx, 8.4, bz);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 3.4, 16, 1, true), M.cloth);
    drum.rotation.x = Math.PI / 2;
    drum.castShadow = true;
    bol.add(drum);
    for (const sz of [-1.7, 1.7]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.07, 0.1, 6, 18), M.woodDark);
      ring.position.z = sz;
      bol.add(ring);
    }
    // A fine brass screen band round the middle.
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.09, 1.09, 1.8, 16, 1, true), M.brass);
    band.rotation.x = Math.PI / 2;
    bol.add(band);
    // Timber support frame + the tilting pivot.
    box(scene, 0.4, 0.4, 4.0, bx, 8.4, bz - 2.1, M.woodDark);
    const tilt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 8), M.metalDark);
    tilt.rotation.z = Math.PI / 2;
    tilt.position.set(bx, 8.4, bz + 1.75);
    scene.add(tilt);
    bolters.push(bol);
  }

  // ---- wooden chutes: meal runs down from the bolters to the flour bins ----
  // The bins sit against the west wall, well clear of the door, so the entry is
  // open for the car; the chutes slope west off the stones to reach them.
  const binX = cx - hw + 1.6;
  for (const sx of stoneXs) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 0.9), M.wood);
    ch.position.set((husX + sx + binX) / 2, 3.6, husZ);
    ch.rotation.z = -0.5;   // sloping down toward the bins at the west wall
    ch.castShadow = true;
    scene.add(ch);
  }
  // Two open flour bins against the west wall.
  for (const sz of [-1.2, 1.2]) {
    box(scene, 1.8, 2.2, 1.8, binX, 0.9, husZ + sz, M.oak);
    box(scene, 1.9, 2.3, 0.2, binX, 1.9, husZ + sz, M.oakDark);
  }

  return { spur, upright, stoneNuts, runnerStones: stoneNuts.map((_, i) => null), shoes, belt, buckets, bolters, beltH: legH };
}

// ===== The distillery =====
// The copper half of the works, filling the east end: oak mash tuns and bubbling
// fermentation vats on the floor, a brass hand pump, a bulbous copper pot still
// over a brick furnace, then the goose neck and lyne arm out to a thump keg, a
// cold-water worm box with a spiral copper coil, a collection barrel and rows of
// charred oak aging casks. update() bubbles the fermenters, turns the pump,
// flickers the furnace and trickles whiskey into the barrel.
function buildDistillery(scene, mill) {
  const { cx, cz, hd, h, ridgeY } = mill;
  const part = (x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    scene.add(g);
    return g;
  };
  const box = (g, w, d, hh, x, y, z, mat = M.oak) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (g, rt, rb, hh, x, y, z, mat = M.oak, axis = 'y', seg = 16) => {
    const geo = new THREE.CylinderGeometry(rt, rb, hh, seg);
    if (axis === 'x') geo.rotateZ(Math.PI / 2);
    else if (axis === 'z') geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // A staved cask/tun: bellied lathe-free barrel from stacked rings of hoops.
  const makeVat = (R, H, mat = M.oak) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.82, H, 20), mat);
    body.castShadow = true;
    g.add(body);
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H * 0.5, 20), mat);
    g.add(belly);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.16, 20), M.oakDark);
    cap.position.y = H / 2;
    g.add(cap);
    for (const hy of [-H * 0.4, -H * 0.1, H * 0.2, H * 0.42]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(R * (Math.abs(hy) > H * 0.3 ? 0.85 : 0.99), 0.07, 6, 20), M.hoop);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = hy;
      g.add(hoop);
    }
    return g;
  };

  const exX = cx + 8.5;   // east half of the floor

  // ---- two big oak mash tuns (open-topped) ----
  const mashTuns = [];
  for (let i = 0; i < 2; i++) {
    const mx = exX - 2.2, mz = cz - 6 + i * 5.2;
    const tun = makeVat(1.7, 2.6, M.oak);
    tun.position.set(mx, 1.3, mz);
    scene.add(tun);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.12, 6, 22), M.oakDark);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(mx, 2.6, mz);
    scene.add(rim);
    // Grain bed floating in the mash tun.
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 18), M.cornMeal);
    bed.position.set(mx, 2.45, mz);
    scene.add(bed);
    mashTuns.push(tun);
  }

  // ---- bubbling fermentation vats ----
  const fermenters = [];
  for (let i = 0; i < 2; i++) {
    const fx = exX + 3.4, fz = cz - 5 + i * 5.6;
    const vat = makeVat(1.5, 2.2, M.oakDark);
    vat.position.set(fx, 1.1, fz);
    scene.add(vat);
    // Open top with a frothy wash surface that update() bobs.
    const wash = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.16, 18), M.cornMeal);
    wash.position.set(fx, 2.05, fz);
    scene.add(wash);
    fermenters.push({ vat, wash, x: fx, z: fz });
  }

  // ---- manual brass hand pump between tuns and still ----
  const pump = part(exX - 0.2, 0, cz + 1.5);
  box(pump, 1.2, 1.0, 1.4, 0, 0.7, 0, M.oakDark);              // pump body (wood-clad)
  cyl(pump, 0.16, 0.16, 1.4, 0, 2.0, 0, M.brass, 'y', 10);     // pump barrel
  const pumpHandle = part(exX - 0.2, 2.1, cz + 1.5);
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), M.brass);
  hBar.position.set(0, 0.7, 0);
  pumpHandle.add(hBar);
  const hGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), M.oakDark);
  hGrip.rotation.z = Math.PI / 2;
  hGrip.position.set(0, 1.5, 0);
  pumpHandle.add(hGrip);
  // Feed pipe: pump up to the still charge pipe.
  cyl(scene, 0.11, 0.11, 3.2, exX - 0.2, 3.0, cz + 1.5, M.copperDark, 'y', 8);

  // ---- the pot still: bulbous copper pot over a brick furnace ----
  const stillX = cx + 11, stillZ = cz + 2.5;
  // Stone/brick furnace hearth.
  box(scene, 3.2, 3.2, 1.6, stillX, 0.8, stillZ, M.brick);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.0, 12, 1, false, 0, Math.PI), M.brick);
  arch.rotation.z = Math.PI / 2;
  arch.position.set(stillX, 0.6, stillZ - 1.55);
  scene.add(arch);
  // Fire glow inside the furnace (flickered by update()).
  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff4a00, emissiveIntensity: 1.4, roughness: 0.6 })
  );
  fire.position.set(stillX, 0.7, stillZ - 1.4);
  scene.add(fire);
  // The copper pot: a squat onion dome (sphere squashed) on the furnace.
  const pot = new THREE.Group();
  pot.position.set(stillX, 2.4, stillZ);
  scene.add(pot);
  const potBody = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), M.copper);
  potBody.scale.set(1, 0.95, 1);
  potBody.position.y = 0.6;
  potBody.castShadow = true;
  pot.add(potBody);
  const potBase = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 0.5, 18), M.copper);
  potBase.position.y = -0.75;
  pot.add(potBase);
  const potNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.75, 0.6, 16), M.copperDark);
  potNeck.position.y = 1.7;
  pot.add(potNeck);
  // Riveted seam bands.
  for (const by of [-0.4, 0.6, 1.4]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(by > 1 ? 0.6 : 1.4, 0.06, 6, 22), M.copperDark);
    band.rotation.x = Math.PI / 2;
    band.position.y = by;
    pot.add(band);
  }

  // ---- goose neck + lyne arm to the thump keg ----
  const thumpX = stillX, thumpZ = stillZ + 4.6;
  const goose = new THREE.Group();
  goose.position.set(stillX, 4.1, stillZ);
  scene.add(goose);
  // A domed cap that sweeps up and over (a few segments of copper tube).
  const gseg = [
    { x: 0, y: 0.3, z: 0, rx: 0, rz: 0, len: 0.8 },
    { x: 0.0, y: 1.0, z: 0.35, rx: 0.5, rz: 0, len: 0.9 },
    { x: 0.0, y: 1.55, z: 1.1, rx: 0.9, rz: 0, len: 1.0 },
    { x: 0.0, y: 1.65, z: 2.0, rx: Math.PI / 2, rz: 0, len: 1.0 },
    { x: 0.0, y: 1.65, z: 3.0, rx: Math.PI / 2, rz: 0, len: 1.0 },
  ];
  for (const s of gseg) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, s.len, 12), M.copper);
    seg.position.set(s.x, s.y, s.z);
    seg.rotation.set(s.rx, 0, s.rz);
    goose.add(seg);
  }
  // Lyne arm drops from the goose neck into the thump keg.
  cyl(scene, 0.16, 0.16, 2.4, thumpX, 3.0, thumpZ, M.copper, 'y', 10);

  // ---- thump keg (small wooden keg between still and worm) ----
  const thump = makeVat(0.95, 1.6, M.oak);
  thump.position.set(thumpX, 1.4, thumpZ);
  scene.add(thump);
  // Charge pipe from thump keg over to the worm box.
  const wormX = cx + 11, wormZ = cz + 11;
  cyl(scene, 0.13, 0.13, 2.0, thumpX, 3.0, thumpZ + 0.9, M.copperDark, 'z', 10);

  // ---- cold-water worm box with a spiral copper coil ----
  // A big wooden trough full of water; a copper helix winds through it, so the
  // condensing spirit trickles out of the far end into the collection barrel.
  const boxW = 4.4, boxD = 3.0, boxH = 2.2;
  const cw = part(wormX, 0, wormZ);
  // Watertight wooden box (open top).
  box(cw, boxW, 0.2, boxH, 0, 0.1, -boxD / 2, M.oak);          // long side A
  box(cw, boxW, 0.2, boxH, 0, 0.1, boxD / 2, M.oak);           // long side B
  box(cw, 0.2, boxD, boxH, -boxW / 2, 0.1, 0, M.oak);          // end A
  box(cw, 0.2, boxD, boxH, boxW / 2, 0.1, 0, M.oak);           // end B
  box(cw, boxW, boxD, 0.14, 0, 0.07, 0, M.oakDark);            // floor
  // Cold water surface.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(boxW - 0.3, boxD - 0.3),
    new THREE.MeshStandardMaterial({ color: 0x4a86b8, transparent: true, opacity: 0.7, roughness: 0.3 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, boxH - 0.35, 0);
  cw.add(water);
  // The spiral copper coil: a helix of short tube segments. Built from plain
  // trig + rotation (the headless catalogue stub has no vector maths or
  // quaternions), one segment between consecutive points on the helix.
  const coil = new THREE.Group();
  coil.position.set(0, 1.0, 0);
  cw.add(coil);
  const coilTurns = 8, coilR = 0.9, coilLen = boxD - 0.6;
  const steps = coilTurns * 8;
  const at = (i) => {
    const t = i / steps;
    const a = t * coilTurns * TWO_PI;
    return {
      x: Math.cos(a) * coilR,
      y: Math.sin(a) * coilR,
      z: (t - 0.5) * coilLen,
    };
  };
  for (let i = 0; i < steps; i++) {
    const p = at(i), q = at(i + 1);
    const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
    const len = Math.hypot(dx, dy, dz) || 0.001;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len * 1.04, 8), M.copper);
    seg.position.set((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
    // A Y-axis cylinder is aimed by yaw (about Y) then pitch (about X):
    // the segment's own Z run is handled by the pitch, its XY swing by the yaw.
    seg.rotation.y = Math.atan2(dx, dz);
    seg.rotation.x = Math.atan2(Math.hypot(dx, dz), dy);
    coil.add(seg);
  }
  // Water in/out stub pipes.
  cyl(cw, 0.1, 0.1, 0.9, 0, 1.4, 0, M.copperDark, 'y', 8);

  // ---- collection barrel: the coil drips fresh whiskey into it ----
  const collX = wormX, collZ = wormZ + boxD / 2 + 0.9;
  const collBarrel = makeVat(0.72, 1.5, M.oak);
  collBarrel.position.set(collX, 0.75, collZ);
  scene.add(collBarrel);
  // A spirit-safe cap on top with the coil drain entering it.
  const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10), M.oakDark);
  bung.position.set(collX, 1.52, collZ);
  scene.add(bung);
  cyl(scene, 0.07, 0.07, 1.0, collX, 1.9, collZ - 0.4, M.copper, 'z', 8);

  // ---- rows of charred oak aging casks ----
  const casks = [];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 3; i++) {
      const kx = cx + 13 - i * 1.6;
      const kz = cz - 10.5 + row * 1.7;
      const cask = makeVat(0.62, 1.2, M.oakDark);
      cask.rotation.z = Math.PI / 2;   // lying on its side in a rick
      cask.position.set(kx, 0.62 + row * 1.25, kz);
      cask.castShadow = true;
      scene.add(cask);
      casks.push(cask);
      // Chalk/tarred ring to read as charred.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.05, 6, 16), M.hoop);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(kx + 0.3, 0.62 + row * 1.25, kz);
      scene.add(ring);
    }
  }
  // A couple of casks standing on end against the east wall.
  for (let i = 0; i < 2; i++) {
    const cask = makeVat(0.6, 1.15, M.oakDark);
    cask.position.set(cx + 15, 0.58, cz + 6 - i * 3.2);
    scene.add(cask);
    casks.push(cask);
  }

  return { pot, potBody, fire, fermenters, pumpHandle, coil, collBarrel, casks, mashTuns, water };
}

// ===== Farmhouse =====
// A clapboard house with a gable roof, chimney, a paneled door and windows —
// the "new house" west of the barnyard. A wrap-around porch rings all four
// sides (deck, posts, railing, lean-to roof) and the chimney breathes slow
// smoke curls. Walls are solid (see farmHouseColliders); the porch deck sits
// just outside them. Returns { smoke } so update() can animate the puffs.
function buildFarmhouse(scene) {
  const { x: cx, z: cz, halfW: hw, halfD: hd, wallH: h } = FARM_HOUSE;

  const mesh = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // ---- rugged stone foundation blocks ----
  // A course of uneven footing stones around the whole footprint, so the house
  // reads as anchored into the ground rather than dropped on it.
  const baseH = 0.7;
  mesh(new THREE.BoxGeometry(hw * 2 + 0.6, baseH, hd * 2 + 0.6), M.stone, cx, baseH / 2, cz);
  const footRng = (seed) => (Math.sin(seed * 12.9898) * 43758.5453) % 1;
  for (const face of [-1, 1]) {
    // South / north rows of stone blocks.
    for (let bx = -hw + 0.5; bx <= hw - 0.4; bx += 1.35) {
      const j = footRng(bx * (face + 3));
      const bw = 0.9 + Math.abs(j) * 0.4, bh = 0.42 + Math.abs(footRng(bx * 7)) * 0.22;
      mesh(new THREE.BoxGeometry(bw, bh, 0.9), M.foundationStone,
        cx + bx, bh / 2, cz + face * (hd + 0.15));
    }
    // East / west rows.
    for (let bz = -hd + 0.5; bz <= hd - 0.4; bz += 1.2) {
      const j = footRng(bz * (face + 5));
      const bd = 0.85 + Math.abs(j) * 0.35, bh = 0.42 + Math.abs(footRng(bz * 9)) * 0.22;
      mesh(new THREE.BoxGeometry(0.9, bh, bd), M.foundationStone,
        cx + face * (hw + 0.15), bh / 2, cz + bz);
    }
  }

  // ---- whitewashed clapboard siding ----
  // The walls are a solid box (matching farmHouseColliders) clad in horizontal
  // clapboard courses laid proud of the face, each row shaded slightly so the
  // lap line reads. `along` lets a course run on x or z.
  const wallTh = 0.6;
  mesh(new THREE.BoxGeometry(hw * 2, h, hd * 2), M.clapboardShade, cx, h / 2, cz);
  const clapboard = (along, len, fixed, lo, hi) => {
    const rows = Math.round((hi - lo) / 0.42);
    const step = (hi - lo) / rows;
    for (let r = 0; r < rows; r++) {
      const y = lo + (r + 0.5) * step;
      const shade = r % 2 === 0 ? M.clapboard : M.clapboardShade;
      const m = new THREE.Mesh(
        along === 'x' ? new THREE.BoxGeometry(len, step * 0.72, 0.12)
                      : new THREE.BoxGeometry(0.12, step * 0.72, len),
        shade);
      if (along === 'x') m.position.set(cx, y, fixed);
      else m.position.set(fixed, y, cz);
      m.receiveShadow = true;
      scene.add(m);
    }
  };
  // North, south, east and west faces (the door and windows sit proud over them).
  clapboard('x', hw * 2 - 0.2, -(hd + wallTh / 2), 0.7, h);
  clapboard('x', hw * 2 - 0.2, +(hd + wallTh / 2), 0.7, h);
  clapboard('z', hd * 2 - 0.2, +(hw + wallTh / 2), 0.7, h);
  clapboard('z', hd * 2 - 0.2, -(hw + wallTh / 2), 0.7, h);
  // Corner boards (vertical trim) closing the laps at each corner.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.32, h, 0.32), M.clapboard,
      cx + sx * (hw + wallTh / 2 - 0.02), h / 2, cz + sz * (hd + wallTh / 2 - 0.02));
  }

  // ---- grand gabled roof with deep overhangs ----
  // Ridge runs along x; two slabs with a deep eave and rake overhang, a ridge
  // cap, gable-end trim, carved rafter tails and decorative iron tie-rods.
  const eaves = 0.9;                       // how far the roof oversails the walls
  const ridgeY = h + 3.4;
  const slope = Math.atan2(ridgeY - h, hd + eaves);
  const len = Math.hypot(hd + eaves, ridgeY - h);
  for (const s of [-1, 1]) {
    const r = mesh(new THREE.BoxGeometry(hw * 2 + eaves * 2, 0.4, len), M.roof,
      cx, (h + ridgeY) / 2, cz + s * (hd + eaves) / 2);
    r.rotation.x = s * slope;
  }
  // Ridge cap.
  mesh(new THREE.BoxGeometry(hw * 2 + eaves * 2 + 0.2, 0.22, 0.5), M.roof, cx, ridgeY + 0.15, cz);
  // Gable-end triangles closing both ends (ridge along x, gables on x faces).
  for (const sx of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(-(hd + eaves), 0); tri.lineTo(hd + eaves, 0); tri.lineTo(0, ridgeY - h);
    const g = new THREE.Mesh(new THREE.ShapeGeometry(tri), M.clapboard);
    g.position.set(cx + sx * (hw + 0.02), h, cz);
    g.rotation.y = sx * Math.PI / 2;
    scene.add(g);
  }
  // Rafter tails: a row of short carved brackets under the eaves.
  for (let i = 0; i <= Math.round((hw * 2) / 1.4); i++) {
    const rx = cx - hw + i * 1.4;
    for (const s of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.16, 0.34, eaves + 0.5), M.plankDark,
        rx, h - 0.1, cz + s * (hd + eaves / 2 - 0.05));
    }
  }
  // Iron tie-rods: dark straps across each gable, with round washer plates.
  for (const sy of [h + 0.9, h + 2.1]) {
    for (const sx of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.1, 0.1, hd * 1.7), M.iron,
        cx + sx * (hw + 0.1), sy, cz);
      for (const pz of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), M.iron);
        plate.rotation.z = Math.PI / 2;
        plate.position.set(cx + sx * (hw + 0.14), sy, cz + pz * hd * 0.82);
        scene.add(plate);
      }
    }
  }

  // ---- massive red-brick chimney on a broad stone fireplace base ----
  const chimX = cx - hw * 0.5, chimZ = cz - hd + 0.55;
  const chBase = 1.0;                       // how far the firebox/hearth projects
  // Broad stone fireplace base, stepped out from the wall.
  mesh(new THREE.BoxGeometry(3.0, 1.5, chBase + 0.9), M.stone, chimX, 0.75, chimZ - 0.25);
  // Heavy red-brick stack, tapering in two stages up past the ridge.
  const stackTop = ridgeY + 1.8;
  const brickStack = (w, d, y0, y1) => mesh(
    new THREE.BoxGeometry(w, y1 - y0, d), M.brick, chimX, (y0 + y1) / 2, chimZ);
  brickStack(2.2, 1.5, 1.5, ridgeY - 0.4);
  brickStack(1.9, 1.3, ridgeY - 0.4, stackTop);
  // A darker corbel course where the stack necks in, plus a stone crown.
  mesh(new THREE.BoxGeometry(2.35, 0.25, 1.65), M.brickDark, chimX, ridgeY - 0.5, chimZ);
  mesh(new THREE.BoxGeometry(2.2, 0.35, 1.5), M.stone, chimX, stackTop + 0.1, chimZ);
  // Two clay flue pots on top.
  for (const fx of [-0.45, 0.45]) {
    const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.55, 12), M.brickDark);
    flue.position.set(chimX + fx, stackTop + 0.45, chimZ);
    scene.add(flue);
  }

  // ---- extra-wide solid-oak double door with polished brass hardware ----
  const doorW = 2.6, doorH = 3.0;
  const doorX = cx + PORCH.doorX;
  // Recessed jamb reveal.
  mesh(new THREE.BoxGeometry(doorW + 0.5, doorH + 0.3, 0.16), M.plankDark, doorX, (doorH + 0.3) / 2, cz - hd - 0.46);
  for (const side of [-1, 1]) {
    const leaf = mesh(new THREE.BoxGeometry(doorW / 2 - 0.04, doorH, 0.14), M.plank,
      doorX + side * (doorW / 4), doorH / 2, cz - hd - 0.5);
    // Recessed panels on the leaf.
    for (const py of [doorH * 0.62, doorH * 0.26]) {
      mesh(new THREE.BoxGeometry(doorW / 2 - 0.5, 0.85, 0.04), M.plankDark,
        doorX + side * (doorW / 4), py, cz - hd - 0.58);
    }
  }
  // Brass hardware: two round knobs and a pair of door ring handles.
  for (const side of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.brass);
    knob.position.set(doorX + side * 0.28, 1.4, cz - hd - 0.62);
    scene.add(knob);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8), M.brass);
    back.rotation.x = Math.PI / 2;
    back.position.set(doorX + side * 0.28, 1.4, cz - hd - 0.58);
    scene.add(back);
  }
  // A carved transom/lintel over the door.
  mesh(new THREE.BoxGeometry(doorW + 0.7, 0.4, 0.2), M.plankDark, doorX, doorH + 0.35, cz - hd - 0.47);

  // ---- tall double-hung multipane windows with dark shutters ----
  // Each window: a trim frame, a blue glass pane split by muntins into two
  // sashes (double-hung), and a louvred dark shutter on each side. `along` is
  // the wall run ('x' or 'z'), `face` is the wall-plane coordinate on the other
  // axis, `run` is the window's position along the wall, and `y` its centre.
  const window2 = (along, face, run, y) => {
    const wW = 1.5, wH = 2.3;
    const centre = along === 'x' ? cz : cx;
    const n = Math.sign(face - centre) || 1;   // outward normal
    // place(a, b, off): a = along-axis coord, b = depth from the wall face.
    const place = (obj, a, off, ay = y) => {
      if (along === 'x') obj.position.set(a, ay, face + n * off);
      else obj.position.set(face + n * off, ay, a);
      scene.add(obj);
    };
    // Trim frame.
    place(new THREE.Mesh(
      along === 'x' ? new THREE.BoxGeometry(wW + 0.3, wH + 0.3, 0.12)
                    : new THREE.BoxGeometry(0.12, wH + 0.3, wW + 0.3), M.houseTrim), run, 0.06);
    // Glass.
    place(new THREE.Mesh(
      along === 'x' ? new THREE.BoxGeometry(wW, wH, 0.06)
                    : new THREE.BoxGeometry(0.06, wH, wW), M.glassPane), run, 0.13);
    // Muntins: 2 columns x 4 rows, reading as double-hung multipane.
    for (let c = 1; c <= 2; c++) {
      const u = c / 3 - 0.5;
      place(new THREE.Mesh(
        along === 'x' ? new THREE.BoxGeometry(0.04, wH, 0.09)
                      : new THREE.BoxGeometry(0.09, wH, 0.04), M.houseTrim), run + u * wW, 0.16);
    }
    for (let r = 1; r < 4; r++) {
      const v = r / 4 - 0.5;
      place(new THREE.Mesh(
        along === 'x' ? new THREE.BoxGeometry(wW, 0.05, 0.09)
                      : new THREE.BoxGeometry(0.09, 0.05, wW), M.houseTrim), run, 0.16, y + v * wH);
    }
    // A thicker meeting rail between the two sashes.
    place(new THREE.Mesh(
      along === 'x' ? new THREE.BoxGeometry(wW, 0.1, 0.11)
                    : new THREE.BoxGeometry(0.11, 0.1, wW), M.houseTrim), run, 0.15);
    // Dark wooden shutters, louvred, one per side.
    for (const s of [-1, 1]) {
      const shW = 0.42, off = s * (wW / 2 + shW / 2 + 0.08);
      place(new THREE.Mesh(
        along === 'x' ? new THREE.BoxGeometry(shW, wH + 0.2, 0.1)
                      : new THREE.BoxGeometry(0.1, wH + 0.2, shW), M.shutter), run + off, 0.2);
      for (let l = -2; l <= 2; l++) {
        place(new THREE.Mesh(
          along === 'x' ? new THREE.BoxGeometry(shW * 0.7, 0.05, 0.13)
                        : new THREE.BoxGeometry(0.13, 0.05, shW * 0.7), M.plankDark),
          run + off, 0.24, y + l * 0.4);
      }
    }
  };
  // South face (flanking the door) and north face, two tall windows each.
  window2('x', cz - hd - wallTh / 2, cx - 4.6, 2.9);
  window2('x', cz - hd - wallTh / 2, cx + 5.6, 2.9);
  window2('x', cz + hd + wallTh / 2, cx - 4.6, 2.9);
  window2('x', cz + hd + wallTh / 2, cx + 3.6, 2.9);
  // Gable ends: one tall window in each.
  window2('z', cx + hw + wallTh / 2, cz, 2.9);
  window2('z', cx - hw - wallTh / 2, cz, 2.9);

  // ---- wrap-around porch ----
  // PW/DECK/door numbers come from PORCH in layout.js, which also owns the
  // rail colliders and porchTopAt — one source of truth for the deck ring.
  const PW = PORCH.w, DECK = PORCH.deck, POST_H = 2.45, POST_TOP = DECK + POST_H;
  const deck = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), M.wood);
    m.position.set(x, DECK - 0.175, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  deck(hw * 2 + PW * 2, PW, cx, cz - hd - PW / 2);        // south
  deck(hw * 2 + PW * 2, PW, cx, cz + hd + PW / 2);        // north
  deck(PW, hd * 2, cx + hw + PW / 2, cz);                 // east
  deck(PW, hd * 2, cx - hw - PW / 2, cz);                 // west
  // Steps down to the yard on the south, in front of the door. Each tread top
  // sits a third of the way up to the deck; the old boxes were centred at
  // y = -0.175 and -0.525, i.e. two slabs buried under the grass.
  for (let i = 0; i < 2; i++) {
    const top = DECK * (2 - i) / 3;
    const st = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.3, 0.55), M.stone
    );
    st.position.set(cx + PORCH.doorX, top - 0.15, cz - hd - PW - 0.28 - i * 0.55);
    st.receiveShadow = true;
    scene.add(st);
  }
  // Heavy square timber posts, on a stone plinth with a moulded capital.
  const post = (x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, POST_H, 0.32), M.plank);
    m.position.set(x, DECK + POST_H / 2, z);
    m.castShadow = true;
    scene.add(m);
    // Weathered stone plinth at the base.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.44), M.stone);
    plinth.position.set(x, DECK + 0.15, z);
    scene.add(plinth);
    // Stepped capital under the beam.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), M.plankDark);
    cap.position.set(x, POST_TOP - 0.07, z);
    scene.add(cap);
    const cap2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), M.plank);
    cap2.position.set(x, POST_TOP + 0.04, z);
    scene.add(cap2);
  };
  const ox = hw + PW - 0.15, oz = hd + PW - 0.15;
  for (const sx of [-1, 0, 1]) {
    post(cx + sx * ox, cz - oz);
    post(cx + sx * ox, cz + oz);
  }
  for (const sz of [-1, 1]) {
    post(cx + ox, cz + sz * (hd * 0.45));
    post(cx - ox, cz + sz * (hd * 0.45));
  }
  // Railing between the posts (skip the door span on the south).
  const rail = (w, d, x, z) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), M.woodDark);
    t.position.set(x, DECK + 0.95, z);
    scene.add(t);
    // Balusters.
    const along = w > d ? w : d;
    const n = Math.max(2, Math.floor(along / 0.55));
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), M.wood);
      const bx = w > d ? x - w / 2 + u * w : x;
      const bz = w > d ? z : z - d / 2 + u * d;
      b.position.set(bx, DECK + 0.475, bz);
      scene.add(b);
    }
  };
  // South: two segments flanking the entry gap — centred on the door
  // (PORCH.doorX), the same numbers farmPorchColliders uses, so the eye and
  // the car agree where the opening is. East/west run the full wrap.
  const gx0 = PORCH.doorX - PORCH.gap / 2, gx1 = PORCH.doorX + PORCH.gap / 2;
  rail(ox + gx0, 0.08, cx + (gx0 - ox) / 2, cz - oz);
  rail(ox - gx1, 0.08, cx + (gx1 + ox) / 2, cz - oz);
  rail(hw * 2 + PW * 2 - 0.3, 0.08, cx, cz + oz);
  rail(0.08, oz * 2 - 0.3, cx + ox, cz);
  rail(0.08, oz * 2 - 0.3, cx - ox, cz);
  // Lean-to porch roof ring, pitched gently down and out.
  const ROOF_Y = POST_TOP + 0.15;
  const porchRoof = (w, d, x, z, rot) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), M.roof);
    r.position.set(x, ROOF_Y, z);
    r.rotation[rot.axis] = rot.pitch;
    r.castShadow = true;
    scene.add(r);
  };
  const pitch = 0.09;
  porchRoof(hw * 2 + PW * 2 + 0.4, PW + 0.5, cx, cz - hd - PW / 2, { axis: 'x', pitch });
  porchRoof(hw * 2 + PW * 2 + 0.4, PW + 0.5, cx, cz + hd + PW / 2, { axis: 'x', pitch: -pitch });
  porchRoof(PW + 0.5, hd * 2, cx + hw + PW / 2, cz, { axis: 'z', pitch: -pitch });
  porchRoof(PW + 0.5, hd * 2, cx - hw - PW / 2, cz, { axis: 'z', pitch });

  // ---- hanging iron lanterns ----
  // An iron bracket off a post, a chain, and a glazed lantern with a warm fire.
  const lanternGlass = new THREE.MeshStandardMaterial({
    color: 0xffcf7a, emissive: 0xff9a2e, emissiveIntensity: 1.0,
    transparent: true, opacity: 0.55, roughness: 0.4,
  });
  const makeLantern = (x, z, dirX, dirZ) => {
    const g = new THREE.Group();
    g.position.set(x, POST_TOP - 0.15, z);
    // Wall/arm bracket reaching out from the post.
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), M.iron);
    arm.rotation.y = Math.atan2(dirX, dirZ);
    arm.position.set(dirX * 0.33, -0.02, dirZ * 0.33);
    g.add(arm);
    const tipX = dirX * 0.66, tipZ = dirZ * 0.66;
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), M.iron);
    hook.position.set(tipX, -0.16, tipZ);
    g.add(hook);
    // Lantern body: a tapered cage of iron with glass and a peaked roof.
    const cock = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 8), M.iron);
    cock.position.set(tipX, -0.36, tipZ);
    g.add(cock);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.34, 8), lanternGlass);
    glass.position.set(tipX, -0.58, tipZ);
    g.add(glass);
    const roofL = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 8), M.iron);
    roofL.position.set(tipX, -0.33, tipZ);
    g.add(roofL);
    const floorL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8), M.iron);
    floorL.position.set(tipX, -0.77, tipZ);
    g.add(floorL);
    // Corner ribs.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TWO_PI;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.035), M.iron);
      rib.position.set(tipX + Math.cos(a) * 0.14, -0.58, tipZ + Math.sin(a) * 0.14);
      g.add(rib);
    }
    scene.add(g);
  };
  // Lanterns at the two south corners, and a pair bracketing the entry, all
  // hanging over the deck so they pool warm light on the boards.
  makeLantern(cx + ox, cz - oz, 0, 1);            // south-east corner
  makeLantern(cx - ox, cz - oz, 0, 1);            // south-west corner
  makeLantern(cx, cz - oz, 0, 1);                 // by the entry, west side
  makeLantern(cx + ox, cz + oz, 0, -1);           // north-east corner
  makeLantern(cx - ox, cz + oz, 0, -1);           // north-west corner

  // ---- hand-carved rocking chairs ----
  // Seat, a slatted curved back, turned legs and two curved rocker runners.
  const makeRockingChair = (x, z, yaw) => {
    const g = new THREE.Group();
    g.position.set(x, DECK, z);
    g.rotation.y = yaw;
    const seatY = 0.45;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.6), M.plank);
    seat.position.y = seatY;
    g.add(seat);
    // Front and rear legs.
    for (const lx of [-0.26, 0.26]) for (const lz of [-0.24, 0.24]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, seatY, 8), M.plankDark);
      leg.position.set(lx, seatY / 2, lz);
      g.add(leg);
    }
    // Slatted, slightly raked back.
    const backH = 0.85;
    const back = new THREE.Group();
    back.position.set(0, seatY, -0.27);
    back.rotation.x = 0.14;
    for (const lx of [-0.26, 0.26]) {
      const stile = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, backH, 8), M.plank);
      stile.position.set(lx, backH / 2, 0);
      back.add(stile);
    }
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.06), M.plank);
      slat.position.set(0, 0.22 + i * 0.26, 0);
      back.add(slat);
    }
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.09), M.plankDark);
    topRail.position.set(0, backH - 0.02, 0);
    back.add(topRail);
    g.add(back);
    // Armrests.
    for (const lx of [-0.29, 0.29]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.5), M.plank);
      arm.position.set(lx, seatY + 0.26, 0);
      g.add(arm);
    }
    // Two curved rocker runners (thin tilted boxes, ends lifted).
    for (const lx of [-0.26, 0.26]) {
      const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.95), M.plankDark);
      rocker.position.set(lx, 0.06, 0);
      rocker.rotation.x = 0;
      g.add(rocker);
      const fwd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.3), M.plankDark);
      fwd.position.set(lx, 0.13, 0.55);
      fwd.rotation.x = -0.7;
      g.add(fwd);
      const backR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.3), M.plankDark);
      backR.position.set(lx, 0.13, -0.55);
      backR.rotation.x = 0.7;
      g.add(backR);
    }
    scene.add(g);
  };
  // Rocking chairs set along the porch, facing the yard: two by the door, one
  // at each side run.
  makeRockingChair(cx - 3.2, cz - hd - PW / 2 + 0.1, Math.PI);
  makeRockingChair(cx + 6.4, cz - hd - PW / 2 + 0.1, Math.PI);
  makeRockingChair(cx - hw - PW / 2 + 0.1, cz + 2.2, -Math.PI / 2);
  makeRockingChair(cx + hw + PW / 2 - 0.1, cz - 2.2, Math.PI / 2);

  // ---- chimney smoke ----
  // Five translucent puffs looping up out of the stack; update() drifts each
  // along its own phase.
  const smoke = [];
  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xd9d9d9, transparent: true, opacity: 0.3, roughness: 1, depthWrite: false,
  });
  const chimTop = stackTop + 0.75;
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.45 + i * 0.14, 10, 8), smokeMat.clone());
    s.position.set(chimX, chimTop, chimZ);
    s.userData.t = i / 5;
    s.userData.baseX = chimX;
    s.userData.baseY = chimTop;
    s.userData.baseZ = chimZ;
    scene.add(s);
    smoke.push(s);
  }
  return { smoke };
}

// ===== Tractor (1939 Farmall) + farmer dog =====
function makeFarmerDog() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.4), M.dogFur);
  torso.position.y = 0.31;
  g.add(torso);
  // overall bib
  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a5a8a, roughness: 0.9 }));
  bib.position.set(0, 0.34, 0.21);
  g.add(bib);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xd8e2f0, roughness: 0.5 });
  for (const by of [0.42, 0.26]) {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), btnMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, by, 0.245);
    g.add(btn);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.dogFur);
  head.position.set(0, 0.74, 0.02);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.24), M.dogDark);
  snout.position.set(0, 0.7, 0.22);
  g.add(snout);
  // Face: bright eyes with pupils, a shiny nose, a U-shaped smile and a
  // lolling tongue — the old dog had none of this and was turned around.
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  for (const sx of [-0.085, 0.085]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
    eye.position.set(sx, 0.79, 0.2);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), M.dogDark);
    pupil.position.set(sx, 0.79, 0.232);
    g.add(pupil);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.dogDark);
  nose.position.set(0, 0.735, 0.345);
  g.add(nose);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), M.dogDark);
  smile.position.set(0, 0.575, 0.17);
  smile.rotation.z = Math.PI;   // flip the arc into a U
  g.add(smile);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.04), new THREE.MeshStandardMaterial({ color: 0xe8858c, roughness: 0.6 }));
  tongue.position.set(0, 0.5, 0.185);
  tongue.rotation.x = 0.35;
  g.add(tongue);
  for (const sx of [-0.17, 0.17]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.14), M.dogDark);
    ear.position.set(sx, 0.72, 0);
    ear.rotation.z = sx > 0 ? 0.3 : -0.3;
    g.add(ear);
  }
  // Arms reach forward and down to the steering wheel (paw lands on the rim
  // at tractor-space (-0.77, 2.13, ±0.19)). They used to be near-vertical
  // stubs tucked behind the hat brim, gripping nothing.
  for (const sx of [-0.187, 0.187]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.78, 0.12), M.dogFur);
    arm.position.set(sx, 0.36, 0.53);
    arm.rotation.x = 1.7;
    g.add(arm);
  }
  // Haunches + wagging stub tail, so the seated pose reads from behind too.
  for (const sx of [-0.17, 0.17]) {
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M.dogFur);
    haunch.scale.set(0.85, 0.75, 1.05);
    haunch.position.set(sx, 0.1, -0.1);
    g.add(haunch);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), M.dogFur);
  tail.position.set(0, 0.42, -0.27);
  tail.rotation.x = -0.9;
  g.add(tail);
  // straw hat
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 14), M.hat);
  brim.position.y = 0.92;
  g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.24, 12), M.hat);
  crown.position.y = 1.05;
  g.add(crown);
  return g;
}

// A stand-alone 1939 Farmall: small steer wheels up front, huge knobby rears,
// tricycle stance, farmer dog at the wheel. Also the cornfield's AI tractor.
export function makeFarmallTractor() {
  const g = new THREE.Group();
  const wheels = [];
  const wheelPivots = [];

  const addWheel = (x, z, radius, width, lugs = 0) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, radius, z);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), M.tire);
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    // Knobby tread: lugs sit ON the tyre, so they inherit its roll about the axle.
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2;
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.16, width * 1.04, 0.26), M.tire);
      lug.position.set(Math.cos(a) * (radius + 0.02), 0, Math.sin(a) * (radius + 0.02));
      lug.rotation.y = -a;
      tyre.add(lug);
    }
    pivot.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.38, radius * 0.4, width * 1.06, 12), M.chrome);
    hub.rotation.x = Math.PI / 2;
    pivot.add(hub);
    g.add(pivot);
    wheels.push(tyre);
    wheelPivots.push(pivot);
    return pivot;
  };

  // Front steer wheels first — main.js steers wheelPivots[0] and [1].
  // z = ±0.38: at ±0.35 the tyre's outer cap sat exactly coplanar with the
  // body panel (z=0.5, thickness 0.3 → face at 0.5) and z-fought with it.
  addWheel(-1.6, 0.38, 0.5, 0.3);              // front (tricycle stance)
  addWheel(-1.6, -0.38, 0.5, 0.3);
  addWheel(0.9, 0.78, 1.15, 0.6, 12);          // huge knobby rear
  addWheel(0.9, -0.78, 1.15, 0.6, 12);

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 1.0), M.tractor);
  body.position.set(-0.4, 1.15, 0);
  body.castShadow = true;
  g.add(body);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.8), M.tractor);
  hood.position.set(-1.6, 1.35, 0);
  g.add(hood);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.7), M.chrome);
  grille.position.set(-2.35, 1.35, 0);
  g.add(grille);

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), M.chrome);
  exhaust.position.set(-1.9, 2.05, 0.2);
  g.add(exhaust);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.6), M.tire);
  seat.position.set(0.4, 1.75, 0);
  g.add(seat);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.6), M.tire);
  seatBack.position.set(0.75, 2.0, 0);
  g.add(seatBack);

  // steering column + wheel
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), M.metalDark);
  column.position.set(-0.8, 1.75, 0);
  column.rotation.x = 0.5;
  g.add(column);
  const steer = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 14), M.chrome);
  steer.position.set(-1.0, 2.05, 0);
  steer.rotation.x = 1.1;
  g.add(steer);

  const dog = makeFarmerDog();
  dog.position.set(0.15, 1.82, 0);
  // -90°, not +90°: the dog's snout is on its local +Z, so +90° pointed him
  // at the rear wheel. He now faces the hood with both paws on the wheel.
  dog.rotation.y = -Math.PI / 2;
  g.add(dog);

  g.userData.wheels = wheels;
  g.userData.wheelPivots = wheelPivots;
  return g;
}

// ===== 1940s farm truck (round headlights, stake bed) =====
export function makeFarmTruckModel() {
  const g = new THREE.Group();
  const wheels = [];

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 2.4), M.woodDark);
  chassis.position.set(0.2, 0.95, 0);
  g.add(chassis);

  const glassMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.6 });
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x1c2b1f, roughness: 0.9 });

  // Rounded 1940s hood: a cylinder laid along x with a domed nose. Its rear
  // edge stops well short of the cab (x = -1.5, not buried inside the cab
  // wall) so the round end no longer punches through the flat front face —
  // a flat cowl/firewall panel bridges the gap up to the windshield base.
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.45, 14), M.truck);
  hood.rotation.z = Math.PI / 2;
  hood.position.set(-2.225, 1.55, 0);
  hood.castShadow = true;
  g.add(hood);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), M.truck);
  nose.scale.set(0.5, 1, 1);
  nose.position.set(-2.95, 1.55, 0);
  nose.castShadow = true;
  g.add(nose);
  // Flat cowl transition panel: runs from the hood's rear edge back into the
  // cab front face, standing on the chassis, top flush with the windshield sill.
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.75, 2.15), M.truck);
  cowl.position.set(-1.45, 1.575, 0);
  cowl.castShadow = true;
  g.add(cowl);

  // Grille: a solid body-color shell with a chrome frame and thick bars.
  const grilleShell = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 1.3), M.truck);
  grilleShell.position.set(-3.32, 1.5, 0);
  g.add(grilleShell);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 1.12), M.chrome);
  grille.position.set(-3.4, 1.5, 0);
  g.add(grille);
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), M.metal);
    bar.position.set(-3.42, 1.5, -0.4 + i * 0.2);
    g.add(bar);
  }

  // Two big rounded fenders arcing over the front wheels, reaching back
  // toward the running boards.
  for (const wz of [-1.08, 1.08]) {
    const fender = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.16, 6, 12, Math.PI), M.truck);
    fender.position.set(-1.9, 0.68, wz);
    fender.scale.z = 1.9;
    fender.castShadow = true;
    g.add(fender);
  }

  // Cab: wide, low box. The roof is a half-cylinder squashed nearly flat so
  // the cab reads as gently rounded 1940s sheet metal, not a barrel — the
  // peak now sits only ~0.5 above the hood instead of ~1.4.
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.45, 2.2), M.truck);
  cab.position.set(-0.4, 1.9, 0);
  cab.castShadow = true;
  g.add(cab);
  const roofGeo = new THREE.CylinderGeometry(1.15, 1.15, 1.85, 14, 1, false, 0, Math.PI);
  roofGeo.rotateZ(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, M.truck);
  roof.scale.y = 0.28;
  roof.position.set(-0.4, 2.62, 0);
  roof.castShadow = true;
  g.add(roof);

  // Windshield: carved as a frame proud of the flat cab front face, with the
  // split glass sunk behind it so it reads as recessed bodywork, not a sheet
  // laid on the panel. Sits on the cowl panel just above it.
  const wsFrame = (w, h, cy, cz) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, w), M.truck);
    piece.position.set(-1.38, cy, cz);
    g.add(piece);
  };
  wsFrame(1.84, 0.08, 1.99, 0);      // bottom rail
  wsFrame(1.84, 0.08, 2.56, 0);      // top rail
  wsFrame(0.08, 0.65, 2.275, -0.88); // left pillar
  wsFrame(0.08, 0.65, 2.275, 0.88);  // right pillar
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.49, 1.68), glassMat);
  glass.position.set(-1.355, 2.275, 0);
  g.add(glass);
  const divider = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.49, 0.06), M.chrome);
  divider.position.set(-1.37, 2.275, 0);
  g.add(divider);

  // Side doors: a gently curved outer skin, inset perimeter seams, silver
  // pull handle and a rounded-top window set into the upper panel.
  const doorFrontX = -1.22, doorRearX = -0.05, doorMidX = -0.635;
  const skinY0 = 1.35, skinY1 = 2.13;
  const skinW = doorRearX - doorFrontX;
  const skinR = 2;
  const skinTheta = skinW / skinR;
  // Rounded-top-rect shape for the side windows (rounded corners up top only).
  const roundTopShape = (w, h, r) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2);
    return s;
  };
  for (const s of [-1, 1]) {
    // Curved skin: an arc of a big-radius cylinder so the panel bows outward
    // slightly, then drops flush to the cab side at its front and rear edges.
    const skinGeo = new THREE.CylinderGeometry(skinR, skinR, skinY1 - skinY0, 12, 1, true,
      s > 0 ? -skinTheta / 2 : Math.PI - skinTheta / 2, skinTheta);
    const skin = new THREE.Mesh(skinGeo, M.truck);
    skin.position.set(doorMidX, (skinY0 + skinY1) / 2, s * (1.17 - skinR));
    skin.castShadow = true;
    g.add(skin);
    // Inset seam lines around the door perimeter.
    for (const dx of [doorFrontX, doorRearX]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.22, 0.03), seamMat);
      seam.position.set(dx, 1.955, s * 1.115);
      g.add(seam);
    }
    for (const dy of [skinY0 + 0.01, skinY1]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(skinW + 0.03, 0.03, 0.03), seamMat);
      seam.position.set(doorMidX, dy, s * 1.115);
      g.add(seam);
    }
    // Classic silver pull-handle hardware near the rear edge.
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.055), M.chrome);
    handle.position.set(-0.18, 1.95, s * 1.145);
    g.add(handle);
    // Side window: dark-rounded rect trim with the glass sunk inside it.
    const trim = new THREE.Mesh(new THREE.ExtrudeGeometry(roundTopShape(0.76, 0.42, 0.08), { depth: 0.04, bevelEnabled: false, curveSegments: 6 }), seamMat);
    trim.rotation.y = s > 0 ? 0 : Math.PI;
    trim.position.set(-0.7, 2.34, s * 1.115);
    g.add(trim);
    const sideGlass = new THREE.Mesh(new THREE.ExtrudeGeometry(roundTopShape(0.66, 0.34, 0.06), { depth: 0.025, bevelEnabled: false, curveSegments: 6 }), glassMat);
    sideGlass.rotation.y = s > 0 ? 0 : Math.PI;
    sideGlass.position.set(-0.7, 2.34, s * 1.12);
    g.add(sideGlass);
  }

  // Rear window: a small horizontally-oblong opening set into the back wall,
  // ringed by a thick rubber gasket so the glass looks properly bedded in.
  const roundRectShape = (w, h, r) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
  };
  const gasket = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRectShape(0.78, 0.42, 0.11), { depth: 0.05, bevelEnabled: false, curveSegments: 6 }), M.tire);
  gasket.rotation.y = Math.PI / 2;
  gasket.position.set(0.555, 2.28, 0);
  g.add(gasket);
  const rearGlass = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRectShape(0.66, 0.3, 0.08), { depth: 0.025, bevelEnabled: false, curveSegments: 6 }), glassMat);
  rearGlass.rotation.y = Math.PI / 2;
  rearGlass.position.set(0.565, 2.28, 0);
  g.add(rearGlass);

  // Round headlights recessed into small pods on either side of the grille.
  for (const sz of [-0.82, 0.82]) {
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M.truck);
    pod.scale.set(0.7, 1, 1);
    pod.position.set(-3.0, 1.85, sz);
    pod.castShadow = true;
    g.add(pod);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffdd88, emissiveIntensity: 0.7 }));
    hl.position.set(-3.2, 1.85, sz);
    g.add(hl);
    const bez = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 14), M.chrome);
    bez.position.set(-3.18, 1.85, sz);
    bez.rotation.y = Math.PI / 2;
    g.add(bez);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 2.0), M.chrome);
  bumper.position.set(-3.45, 1.0, 0);
  g.add(bumper);

  // Running boards bridging the front fenders back to the rear fender
  // flares — the continuous 1940s silhouette.
  for (const sz of [-1.22, 1.22]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 0.55), M.woodDark);
    step.position.set(-0.15, 0.8, sz);
    g.add(step);
    const flare = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.13, 6, 12, Math.PI), M.truck);
    flare.position.set(1.9, 0.62, sz);
    flare.scale.z = 1.6;
    flare.castShadow = true;
    g.add(flare);
  }

  // Stake bed: thick timber planks, stakes and rails — real beams, not planes.
  const bed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 2.3), M.wood);
  bed.position.set(1.7, 1.28, 0);
  g.add(bed);
  const stakeMat = M.wood;
  for (const sz of [-1.15, 1.15]) {
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 0.18), stakeMat);
      post.position.set(0.65 + i * 0.75, 1.9, sz);
      g.add(post);
    }
    for (const py of [1.62, 2.0]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 0.12), stakeMat);
      plank.position.set(1.75, py, sz);
      g.add(plank);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.16, 0.16), stakeMat);
    rail.position.set(1.75, 2.4, sz);
    g.add(rail);
  }
  // Tailgate: thick vertical slats with a top rail — the old
  // solid slab read like a box van, not a stake-bed farm truck.
  const tailZ = [-0.9, -0.54, -0.18, 0.18, 0.54, 0.9];
  for (const tz of tailZ) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.18), stakeMat);
    slat.position.set(3.25, 1.9, tz);
    g.add(slat);
  }
  const backRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 2.25), stakeMat);
  backRail.position.set(3.25, 2.4, 0);
  g.add(backRail);

  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 16);
  for (const [wx, wz] of [[-1.9, -1.15], [-1.9, 1.05], [1.9, -1.05], [1.9, 1.05]]) {
    const wheel = new THREE.Mesh(wheelGeo, M.tire);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.55, wz);
    g.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.44, 10), M.chrome);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    wheels.push(wheel);
  }

  g.userData.wheels = wheels;
  return g;
}

// ===== Builder =====
export function buildCornfieldWorld(scene) {
  scene.background = new THREE.Color(0x9fd0ff);
  scene.fog = new THREE.Fog(0xbcdcff, 120, 320);

  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x5e6b3a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d8, 1.6);
  sun.position.set(60, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  buildGround(scene);
  const corn = buildCorn(scene);
  const barn = buildBarn(scene);
  const silo = buildSilo(scene);
  buildWaterTower(scene);
  const pumpkins = buildPumpkins(scene);
  const returnTree = makePortalTree(scene, CORN_RETURN.x, CORN_RETURN.z, 0);

  const orchard = buildOrchard(scene);
  const barrels = buildBarrels(scene);
  buildFarmBoundary(scene);
  const hill = buildHill(scene);
  buildBerms(scene);
  const river = buildRiver(scene);
  const mill = buildMill(scene);
  const farmhouse = buildFarmhouse(scene);
  buildUnderbrush(scene);

  // ---- debris pools ----
  const cobGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.42, 6);
  const cobs = makeDebrisPool(scene, cobGeo, M.cob, 160);
  const hayGeo = new THREE.BoxGeometry(0.5, 0.16, 0.3);
  const hay = makeDebrisPool(scene, hayGeo, M.hay, 220);
  const stemGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.5, 5);
  const stems = makeDebrisPool(scene, stemGeo, M.stem, 40);

  // ---- squirrel + thrown apples ----
  const squirrel = buildSquirrel(scene);
  const apples = makeApplePool(scene, 24);

  // ---- AI tractor on its loop ----
  const tractorMesh = makeFarmallTractor();
  tractorMesh.position.set(TRACTOR.path[0][0], CORN_GROUND, TRACTOR.path[0][1]);
  scene.add(tractorMesh);
  const farmTractor = {
    mesh: tractorMesh,
    x: TRACTOR.path[0][0], z: TRACTOR.path[0][1],
    heading: 0, wp: 1, spin: 0,
  };

  // ---- runaway farm truck ----
  const truckMesh = makeFarmTruckModel();
  const truckY = hillHeightAt(FARM_TRUCK.x, FARM_TRUCK.z);
  truckMesh.position.set(FARM_TRUCK.x, truckY, FARM_TRUCK.z);
  truckMesh.rotation.y = FARM_TRUCK.yaw;
  scene.add(truckMesh);
  const truck = {
    mesh: truckMesh,
    x: FARM_TRUCK.x, y: truckY, z: FARM_TRUCK.z,
    vz: 0, vy: 0, rotX: 0,
    state: 'parked',        // parked | rolling | crashed
    settleSpin: 0,
    floatT: 0,
  };

  const hillWalls = hillColliders();
  const pasture = buildPasture(scene);
  const fenceWreck = makeFenceWreck(scene);
  const bullParts = makeBull();
  bullParts.group.position.set(BULL.home.x, hillHeightAt(BULL.home.x, BULL.home.z), BULL.home.z);
  scene.add(bullParts.group);
  const bull = {
    mesh: bullParts.group,
    legs: bullParts.legs,
    headG: bullParts.headG,
    x: BULL.home.x, z: BULL.home.z,
    homeX: BULL.home.x, homeZ: BULL.home.z,
    heading: 0, animT: 0,
    state: 'calm',          // calm | angry | recover | spent
    charges: 0,
    cooldown: 0,
    // After a fling he backs off, paces while the car is still in the air, and
    // only re-charges once the target has landed AND `flingRecovery` seconds
    // have passed since the landing.
    recoveryTimer: 0,       // counts up once the target is back on the ground
    recoveryWait: 0,        // total time spent in 'recover' (safety timeout)
    landed: false,          // has the target touched back down yet?
    paceX: 0, paceZ: 0,     // where he ambles to while recovering
    // Calm graze: walk to a target inside the pasture, put the head down and
    // eat for a few seconds, pick another spot, repeat.
    grazePhase: 'walk',     // walk | eat
    grazeTimer: 0,
    gx: BULL.home.x, gz: BULL.home.z,
    headPitch: 0,
  };
  const pastureCols = pastureFenceColliders();
  const colliders = [
    ...barnColliders(), ...siloColliders(), ...waterTowerColliders(),
    ...hillWalls, ...farmBoundsColliders(),
    ...riverWallColliders(), ...millColliders(), ...farmHouseColliders(),
    ...farmPorchColliders(), ...pastureCols,
    // The parked truck is solid until it starts to roll. Height matches the
    // flattened cab (peak ~2.95) closely enough that nothing clips over it.
    { x: FARM_TRUCK.x, z: FARM_TRUCK.z, halfW: 1.3, halfD: 3.3, h: 3.0, top: truckY + 3.0, truck: true },
    // The AI tractor is solid too: you crash off it like a traffic car. The box
    // is deliberately tight (1.4) so the proximity bump in main.js fires FIRST
    // (at playerCarRadius + 1.7) and you get the recoil/knock, while the box
    // still catches a fast car that would otherwise tunnel straight through.
    // Its x/z are synced to the live tractor each frame below.
    { x: farmTractor.x, z: farmTractor.z, halfW: 1.4, halfD: 1.4, h: 2.6, tractor: true },
  ];
  const truckCollider = colliders[colliders.length - 2];
  const tractorCollider = colliders[colliders.length - 1];
  // The plateau is no longer a ramp chain — it is a heightfield (hillHeightAt)
  // main.js rides directly, so all four sides are gentle curves. The river is
  // likewise a heightfield now (riverSurfaceY), so its old boat-ramp defs are
  // gone: the whole bank slopes and you can drive in and out anywhere. The
  // silo is closed scenery, so the only ramp left is the barn's hayloft.
  const ramps = [BARN_RAMP];

  let shimmerT = 0;

  return {
    group: scene,
    colliders,
    // Camera interiors: when the car is inside one of these, main.js clamps the
    // chase lens inside too — the frame never fills with a wall from outside.
    // (The silo has no interior: it is closed scenery you cannot drive into.)
    interiors: [
      { kind: 'box', x: BARN.x, z: BARN.z, halfW: BARN.halfW, halfD: BARN.halfD, ceil: BARN.wallH },
      { kind: 'box', x: MILL.x, z: MILL.z, halfW: MILL.halfW, halfD: MILL.halfD, ceil: MILL.wallH },
    ],
    ramps,
    groundY: CORN_GROUND,
    spawn: CORN_SPAWN,
    returnPortal: CORN_RETURN,
    corn,
    pumpkins,
    barrels,
    mapFeatures: [
      { kind: 'rect', x: (CORNFIELD_RECT.x0 + CORNFIELD_RECT.x1) / 2, z: (CORNFIELD_RECT.z0 + CORNFIELD_RECT.z1) / 2, r: 26, color: '#c8d46a', label: 'Corn' },
      { kind: 'rect', x: BARN.x, z: BARN.z, r: 26, color: '#c0503a', label: 'Barn' },
      { kind: 'circle', x: SILO.x, z: SILO.z, r: 6, color: '#b9c0c4', label: 'Silo' },
      { kind: 'circle', x: WATER_TOWER.x, z: WATER_TOWER.z, r: 5, color: '#9ab6cc', label: 'Water Tower' },
      { kind: 'rect', x: (PUMPKIN_PATCH.x0 + PUMPKIN_PATCH.x1) / 2, z: (PUMPKIN_PATCH.z0 + PUMPKIN_PATCH.z1) / 2, r: 18, color: '#e08a2a', label: 'Pumpkins' },
      { kind: 'rect', x: (ORCHARD.x0 + ORCHARD.x1) / 2, z: (ORCHARD.z0 + ORCHARD.z1) / 2, r: 20, color: '#5f9e4a', label: 'Orchard' },
      { kind: 'rect', x: (HILL.x0 + HILL.x1) / 2, z: (HILL.zNear + HILL.zFar) / 2, r: 20, color: '#8a6a3a', label: 'Hill' },
      { kind: 'circle', x: CORN_RETURN.x, z: CORN_RETURN.z, r: 5, color: '#7fe0ff', label: 'Home' },
      { kind: 'circle', x: MILL.x, z: MILL.z, r: 12, color: '#8b6f4e', label: 'Mill' },
      { kind: 'rect', x: FARM_HOUSE.x, z: FARM_HOUSE.z, r: 9, color: '#d8cdb4', label: 'Farmhouse' },
      { kind: 'rect', x: (RIVER.x0 + RIVER.x1) / 2, z: -28, r: 6, color: '#4a90c8', label: 'River' },
      { kind: 'rect', x: (RIVER.legX0 + RIVER.x1) / 2, z: (RIVER.legZ0 + RIVER.legZ1) / 2, r: 6, color: '#4a90c8', label: 'River Leg' },
      { kind: 'rect', x: (PASTURE.x0 + PASTURE.x1) / 2, z: (PASTURE.z0 + PASTURE.z1) / 2, r: 22, color: '#7d9a52', label: 'Pasture' },
      { kind: 'circle', x: BULL.home.x, z: BULL.home.z, r: 2.6, color: '#3f2a1d', label: 'Bull' },
    ],
    mapBounds: FARM_BOUNDS,
    // ---- Surface queries used by main.js's cornfield Y branch ----
    // Ramp surface is `baseY + height * s`; returns null off any ramp.
    rampInfoAt(x, z) {
      for (const r of ramps) {
        const dx = x - r.x, dz = z - r.z;
        const along = dx * r.runX + dz * r.runZ;
        const perp = -dx * r.runZ + dz * r.runX;
        if (along >= -r.len / 2 && along <= r.len / 2 && Math.abs(perp) < r.width / 2) {
          const s = (along + r.len / 2) / r.len;
          return { runX: r.runX, runZ: r.runZ, s, height: r.height, len: r.len, boost: r.boost | 0, baseY: r.baseY || 0, def: r };
        }
      }
      return null;
    },
    // -Infinity off a ramp/mound so a Math.max() with the loft picks the loft.
    rampSurfaceY(x, z) {
      const info = this.rampInfoAt(x, z);
      return info ? info.baseY + info.height * info.s : -Infinity;
    },
    // The hayloft (back half of the barn only), but ONLY for a car already up at
    // loft level — a ground-floor car parked under the loft must not be lifted.
    loftTopAt(x, z, carY) {
      const inLoft = x >= BARN.loftWest && x <= BARN.x + BARN.halfW &&
        z >= BARN.z + BARN.loftSouth && z <= BARN.z + BARN.halfD;
      return inLoft && carY > BARN.loftY - 2.5 ? BARN.loftY : 0;
    },
    // The mound surface — the live physics rides this (up AND down), so the
    // rounded dome drives exactly as it looks. 0 off the mound.
    hillHeightAt(x, z) {
      return hillHeightAt(x, z);
    },
    // The flat top of the hill/embankment — again only for a car already up
    // there (its own loftTopAt, so a car at the foot of the slope is not lifted).
    plateauTopAt(x, z, carY) {
      return plateauTopAt(x, z, carY);
    },
    // The farmhouse porch deck: 0.35 inside the porch ring, 0 outside. Unlike
    // the loft it gates on nothing — you approach it from the ground, and the
    // south rail gap is the only way in.
    porchTopAt(x, z) {
      return porchTopAt(x, z);
    },
    riverAt,
    // The sloped bank/bed surface — you enter and leave the river anywhere.
    riverSurfaceY(x, z) {
      return riverSurfaceY(x, z);
    },
    riverFlowAt,
    squirrel,
    farmTractor,
    truck,
    // Called each frame while the car is here. `car` = { x, y, z, heading, speed }.
    // Every car on the farm is an actor: Player 1, the split twin, and the
    // blue chaser car. The first actor (P1) still drives the squirrel's aim;
    // corn, pumpkins, barrels, hay, apples, the fence break and the truck
    // trigger all consider every actor.
    update(delta, ...cars) {
      const actors = cars.filter(Boolean);
      const car = actors[0] || { x: 0, y: 0, z: 0, heading: 0, speed: 0 };
      shimmerT += delta;
      returnTree.disc.material.opacity = 0.45 + 0.18 * Math.sin(shimmerT * 3.0);

      // ---- Corn knocking ----
      // A car's forward vector is (-cos(yaw), sin(yaw)) — see main.js.
      for (const actor of actors) {
        const hx = -Math.cos(actor.heading), hz = Math.sin(actor.heading);
        if (Math.abs(actor.speed) <= CORN.minSpeed) continue;
        for (let i = 0; i < corn.count; i++) {
          if (corn.knocked[i]) continue;
          if (shouldKnockStalk(actor.x, actor.z, actor.speed, corn.pts[i])) {
            corn.knock(i, hx, hz, (p) => {
              // Burst of cobs off the top, thrown along the car's heading.
              const speed = Math.abs(actor.speed);
              for (let c = 0; c < 3; c++) {
                const a = Math.atan2(hx, hz) + (Math.random() - 0.5) * 1.6;
                const sp = 2.5 + speed * 0.35 + Math.random() * 2.5;
                cobs.spawn(
                  p.x, CORN_GROUND + CORN.stalkH * 0.8, p.z,
                  Math.sin(a) * sp, 3.5 + Math.random() * 3.0, Math.cos(a) * sp,
                  1.8 + Math.random() * 1.2
                );
              }
            });
          }
        }
      }
      corn.step(delta);

      // ---- Pumpkin patch ----
      for (const p of pumpkins) {
        for (const actor of actors) {
          const dx = actor.x - p.x, dz = actor.z - p.z;
          const dist = Math.hypot(dx, dz);
          const hit = dist < p.radius + 1.0 && Math.abs(actor.speed) > 1.2;
          if (hit && Math.hypot(p.vx, p.vz) < 0.4) {
            const nx = dist > 1e-3 ? -dx / dist : 1;
            const nz = dist > 1e-3 ? -dz / dist : 0;
            const push = 3.5 + Math.abs(actor.speed) * 0.5;
            p.vx = nx * push; p.vz = nz * push;
            // The stem stays attached and the runner vine stretches out behind
            // — until the pumpkin has travelled far enough to tear it off.
            break;
          }
        }
        const sp = stepPumpkin(p, delta);
        if (sp > 0) {
          p.group.position.x = p.x;
          p.group.position.z = p.z;
          // Roll about the horizontal axis perpendicular to travel.
          const ax = Math.hypot(p.vx, p.vz) || 1;
          _axis.set(p.vz / ax, 0, -p.vx / ax);
          _q.setFromAxisAngle(_axis, (sp * delta) / p.radius);
          p.group.quaternion.premultiply(_q);
        }
        // The drag vine: while the stem is attached, a runner stretches from
        // the home stem base out to the rolling pumpkin (laid along the
        // plateau between the two); travel PUMPKIN_VINE_BREAK from home and
        // it tears off — stem sheds with a debris chunk, the vine snaps back
        // flat, the pumpkin rolls free.
        if (p.stemAttached && p.drag) {
          const vx = p.x - p.home.x, vz = p.z - p.home.z;
          const d = Math.hypot(vx, vz);
          if (d > 0.2) {
            const mx = (p.home.x + p.x) / 2, mz = (p.home.z + p.z) / 2;
            p.drag.visible = true;
            p.drag.position.set(mx, hillHeightAt(mx, mz) + 0.1, mz);
            p.drag.scale.x = d;
            p.drag.rotation.y = Math.atan2(-vz, vx);
          }
          if (d > PUMPKIN_VINE_BREAK) {
            p.stemAttached = false;
            p.stem.visible = false;
            p.drag.visible = false;
            stems.spawn(
              p.x, hillHeightAt(p.x, p.z) + p.radius * 0.9, p.z,
              p.vx * 0.3, 2.5 + Math.random(), p.vz * 0.3,
              1.6 + Math.random() * 0.8
            );
          }
        }
      }

      // ---- Barrels: knock one and it tumbles end over end, then rolls ----
      for (const b of barrels) {
        if (b.state !== 'stacked' && b.state !== 'rest') continue;
        if (b.y > b.radius * 2.4 || Math.hypot(b.vx, b.vz) > 0.5) continue;
        for (const actor of actors) {
          if (Math.abs(actor.speed) <= CORN.minSpeed) continue;
          const dx = b.x - actor.x, dz = b.z - actor.z;
          const dist = Math.hypot(dx, dz);
          // Only the barrels a car can actually reach (low on the pile), and
          // only when they are not already off and rolling. A firm shove —
          // knocked barrels scatter like ramp-world tires, not chess pieces.
          if (dist >= b.radius + 1.4) continue;
          const push = 7.0 + Math.abs(actor.speed) * 1.15;
          knockBarrel(b, dist > 1e-3 ? dx / dist : 1, dist > 1e-3 ? dz / dist : 0, push);
          break;
        }
      }
      // A stacked barrel with nothing left holding it up folds down and tumbles
      // to the ground, instead of hanging in the air where its supports were.
      for (const b of barrels) {
        if (b.state !== 'stacked' || b.tier === 0 || !b.supporters) continue;
        const held = b.supporters.some((s) =>
          (s.state === 'stacked' || s.state === 'rest') &&
          Math.hypot(s.x - s.home.x, s.z - s.home.z) < b.radius * 1.6);
        if (!held) {
          b.state = 'falling';
          b.tip = 0;
          b.tipV = (Math.random() < 0.5 ? -1 : 1) * 2.4;
          b.vx = (Math.random() - 0.5) * 2.0;
          b.vz = (Math.random() - 0.5) * 2.0;
        }
      }
      for (const b of barrels) {
        if (b.state === 'falling') {
          // End-over-end tumble: advance the flip, ride the height down the
          // barrel's own half-length as it rolls over, and skid with it.
          b.tip += b.tipV * delta;
          b.x += b.vx * delta;
          b.z += b.vz * delta;
          const target = b.radius;   // centre height once lying on the ground
          b.y += (target - b.y) * Math.min(1, delta * 4);
          const f = Math.max(0, 1 - 1.8 * delta);
          b.vx *= f; b.vz *= f;
          // Land once it has rolled over onto its side (or stalled out), then
          // kick into a broadside roll along its across-axis.
          const tipped = Math.abs(b.tip) >= Math.PI * 0.9 && b.y < target + 0.05;
          const stalled = Math.hypot(b.vx, b.vz) < 0.6 && b.y < target + 0.05;
          if (tipped || stalled) {
            b.y = target;
            // Landed, still turning: roll broadside along the across-axis.
            const side = b.tipV >= 0 ? 1 : -1;
            b.vx = Math.sin(b.axis) * Math.max(2.5, b.rollPower * 0.6) * side;
            b.vz = Math.cos(b.axis) * Math.max(2.5, b.rollPower * 0.6) * side;
            b.tip = 0;
            b.state = 'rolling';
          }
        } else if (b.state === 'rolling') {
          if (stepBarrel(b, delta) <= 0.02) b.state = 'rest';
        }
        if (b.state !== 'stacked') {
          b.group.position.set(b.x, b.y, b.z);
          // yaw(long axis) * across-axis end-over-end flip * long-axis roll *
          // quarter-turn onto the side. The tumble is about the across-axis (world
          // Z when the long axis is world X) so a barrel somersaults end over end
          // while it skids; `roll` then spins it about its own long axis as it
          // rolls away broadside after landing.
          _qy.setFromAxisAngle(_up, b.axis);
          _qz.setFromAxisAngle(_zAxis, b.tip);
          _q.setFromAxisAngle(_xAxis, b.roll);
          b.group.quaternion.copy(_qy).multiply(_qz).multiply(_q).multiply(
            _q.setFromAxisAngle(_zAxis, Math.PI / 2));
        }
      }

      // ---- Hay (only while a car is on the back-half loft) ----
      for (const actor of actors) {
        const onLoft = actor.y > BARN.loftY - 1.2 &&
          actor.x > BARN.loftWest - 1 && actor.x < BARN.x + BARN.halfW + 1 &&
          actor.z > BARN.z + BARN.loftSouth - 1 && actor.z < BARN.z + BARN.halfD + 1;
        if (!onLoft || Math.abs(actor.speed) <= 1.0) continue;
        const n = Math.min(6, 1 + Math.floor(Math.abs(actor.speed) * 0.4));
        for (let i = 0; i < n && Math.random() < 0.9; i++) {
          hay.spawn(
            actor.x + (Math.random() - 0.5) * 2, BARN.loftY + 0.4, actor.z + (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 3, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 3,
            1.4 + Math.random() * 0.9, 0.8 + Math.random() * 0.6
          );
        }
      }

      // ---- Squirrel ----
      // It runs about the orchard; when you get close it bolts up a tree and
      // lobs apples. One throw in three is a true hit (squirrelThrowHits).
      // It only bothers to throw when the car is near the ORCHARD itself (a
      // few car lengths of the trees), not merely somewhere near the squirrel.
      const sq = squirrel;
      const orchardDx = Math.max(ORCHARD.x0 - car.x, 0, car.x - ORCHARD.x1);
      const orchardDz = Math.max(ORCHARD.z0 - car.z, 0, car.z - ORCHARD.z1);
      const orchardDist = Math.hypot(orchardDx, orchardDz);
      sq.spin += delta;
      if (sq.state === 'idle') {
        if (orchardDist < SQUIRREL.throwRange && orchard.length) {
          sq.tree = orchard[(Math.random() * orchard.length) | 0];
          sq.state = 'run';
        } else if (!sq.node) {
          sq.node = {
            x: ORCHARD.x0 + Math.random() * (ORCHARD.x1 - ORCHARD.x0),
            z: ORCHARD.z0 + Math.random() * (ORCHARD.z1 - ORCHARD.z0),
          };
        }
      }
      if (sq.state === 'idle' || sq.state === 'run') {
        const tgt = sq.state === 'run' ? (sq.tree || sq.node) : sq.node;
        if (tgt) {
          const dx = tgt.x - sq.x, dz = tgt.z - sq.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.4) {
            if (sq.state === 'run' && sq.tree) {
              // Perch on the OUTER edge of the canopy, on the side facing the
              // car, a touch below the crown — so the squirrel stays in plain
              // sight instead of vanishing into the leaves.
              const toCarX = car.x - sq.tree.x, toCarZ = car.z - sq.tree.z;
              const tl = Math.hypot(toCarX, toCarZ) || 1;
              const rim = APPLE_TREE.canopyR * 0.82;
              sq.perch = {
                x: sq.tree.x + (toCarX / tl) * rim,
                z: sq.tree.z + (toCarZ / tl) * rim,
                y: sq.tree.topY - 0.5,
              };
              sq.state = 'climb'; sq.timer = 0; sq.y = CORN_GROUND;
              sq.throwsLeft = SQUIRREL.shots; sq.shot = 0;
            } else { sq.node = null; sq.state = 'idle'; }
          } else {
            const step = SQUIRREL.runSpeed * delta;
            sq.x += (dx / d) * step;
            sq.z += (dz / d) * step;
            sq.mesh.rotation.y = Math.atan2(dx, dz);
          }
        }
      }
      if (sq.state === 'climb') {
        sq.timer += delta;
        const t = Math.min(1, sq.timer / SQUIRREL.climbTime);
        const perch = sq.perch || { x: sq.tree.x, z: sq.tree.z, y: sq.tree.topY };
        sq.x = sq.tree.x + (perch.x - sq.tree.x) * t;
        sq.z = sq.tree.z + (perch.z - sq.tree.z) * t;
        sq.y = CORN_GROUND + t * (perch.y - CORN_GROUND);
        if (t >= 1) { sq.x = perch.x; sq.z = perch.z; sq.state = 'throw'; sq.timer = 0; }
      }
      if (sq.state === 'throw') {
        // If the car drives well clear of the orchard, give up the shot and
        // come back down — it only harasses you near the trees.
        if (orchardDist > SQUIRREL.throwRange * 1.6) {
          sq.state = 'descend'; sq.timer = 0;
        } else {
          sq.timer += delta;
          sq.mesh.rotation.y = Math.atan2(car.x - sq.x, car.z - sq.z);
          sq.mesh.userData.throwArm.rotation.x = -1.8 * Math.min(1, sq.timer / 0.25);
          if (sq.timer >= SQUIRREL.throwInterval) {
            sq.timer = 0;
            const hitThrow = squirrelThrowHits(sq.shot);
            sq.shot++;
            const sx = sq.x, sy = sq.y + 1.2, sz = sq.z;
            let aim = aimArc(sx, sy, sz, car.x, car.y + 0.6, car.z, SQUIRREL.appleSpeed);
            if (aim && !hitThrow) {
              const ang = (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.18);
              const ca = Math.cos(ang), sa = Math.sin(ang);
              aim = { vx: aim.vx * ca - aim.vz * sa, vy: aim.vy, vz: aim.vx * sa + aim.vz * ca };
            }
            if (aim) apples.spawn(sx, sy, sz, aim.vx, aim.vy, aim.vz, hitThrow);
            sq.mesh.userData.throwArm.rotation.x = 0.6;
            sq.throwsLeft--;
            if (sq.throwsLeft <= 0) { sq.state = 'descend'; sq.timer = 0; }
          }
        }
      }
      if (sq.state === 'descend') {
        sq.timer += delta;
        const t = Math.min(1, sq.timer / SQUIRREL.climbTime);
        const perch = sq.perch || { x: sq.tree.x, z: sq.tree.z, y: sq.tree.topY };
        sq.x = perch.x + (sq.tree.x - perch.x) * t;
        sq.z = perch.z + (sq.tree.z - perch.z) * t;
        sq.y = perch.y + t * (CORN_GROUND - perch.y);
        if (t >= 1) { sq.state = 'idle'; sq.tree = null; sq.node = null; sq.perch = null; }
      }
      sq.mesh.position.set(sq.x, sq.y, sq.z);

      // ---- Thrown apples ----
      for (const a of apples.items) {
        if (!a.alive) continue;
        a.life -= delta;
        a.vy -= APPLE_GRAVITY * delta;
        a.x += a.vx * delta;
        a.y += a.vy * delta;
        a.z += a.vz * delta;
        a.mesh.position.set(a.x, a.y, a.z);
        a.mesh.rotation.x += a.vx * delta;
        a.mesh.rotation.z -= a.vz * delta;
        if (a.y < CORN_GROUND + 0.05 || a.life <= 0) { a.alive = false; a.mesh.visible = false; continue; }
        for (const actor of actors) {
          const ddx = a.x - actor.x, ddz = a.z - actor.z;
          if (a.hit && Math.hypot(ddx, ddz) < SQUIRREL.appleHitRadius && Math.abs(a.y - (actor.y + 0.7)) < 1.7) {
            a.alive = false; a.mesh.visible = false;
            if (typeof actor.onAppleHit === 'function') {
              const dl = Math.hypot(actor.x - sq.x, actor.z - sq.z) || 1;
              actor.onAppleHit((actor.x - sq.x) / dl, (actor.z - sq.z) / dl, actor.x, actor.y, actor.z);
            }
            break;
          }
        }
      }

      // ---- AI tractor on its slow loop ----
      // Paused while the player's bump has knocked it (t.knock is owned and
      // stepped by main.js's bump block, which also syncs t.x/t.z/heading).
      {
        const t = farmTractor;
        if (!t.knock) {
        const wp = TRACTOR.path[t.wp];
        const dx = wp[0] - t.x, dz = wp[1] - t.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          t.wp = (t.wp + 1) % TRACTOR.path.length;
        } else {
          const nx = dx / d, nz = dz / d;
          t.x += nx * TRACTOR.speed * delta;
          t.z += nz * TRACTOR.speed * delta;
          let diff = Math.atan2(nz, -nx) - t.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          t.heading += diff * Math.min(1, 3 * delta);
          t.spin += TRACTOR.speed * delta * 2.2;
          t.mesh.position.set(t.x, CORN_GROUND, t.z);
          t.mesh.rotation.y = t.heading;
          if (t.mesh.userData.wheels) for (const w of t.mesh.userData.wheels) w.rotation.y += TRACTOR.speed * delta * 2.6;
          const piv = t.mesh.userData.wheelPivots;
          if (piv) for (let i = 0; i < Math.min(2, piv.length); i++) piv[i].rotation.y = Math.sin(t.spin * 0.3) * 0.3;
        }
        }
        // Keep the tractor's solid box on the live tractor (main.js also moves
        // t.x/t.z while it is knocked, so this always tracks the real position).
        tractorCollider.x = t.x;
        tractorCollider.z = t.z;
      }

      // ---- Runaway farm truck ----
      {
        const tr = truck;
        if (tr.state === 'parked') {
          // Touching ANY side of the truck starts it. The trigger is a box
          // distance against the truck's own footprint (halfW 1.3 x halfD 3.3,
          // axis-aligned: the truck only ever faces south), not a circle
          // around its centre — a radial test missed the nose and the corners,
          // which is most of the truck. No speed gate: crawling into it counts
          // too; the roll itself starts slow (vz accelerates from 0) and builds
          // down the long face, exactly like the runaway should behave.
          for (const actor of actors) {
            const ox = Math.max(0, Math.abs(actor.x - tr.x) - 1.3);
            const oz = Math.max(0, Math.abs(actor.z - tr.z) - 3.3);
            if (Math.hypot(ox, oz) < 1.7) {
              tr.state = 'rolling';
              const ci = colliders.indexOf(truckCollider);
              if (ci >= 0) colliders.splice(ci, 1);   // let the players follow it
              break;
            }
          }
          // While it is still solid, the box tracks the live truck: main.js's
          // proximity bump shoves it a little on a hit (like a traffic car),
          // and the collider must follow that nudge rather than stay behind.
          truckCollider.x = tr.x;
          truckCollider.z = tr.z;
        }
        if (tr.state === 'rolling') {
          tr.vz = Math.min(16, tr.vz + 9 * delta);
          tr.z -= tr.vz * delta;   // south, down the long face toward the farm
          if (tr.mesh.userData.wheels) for (const w of tr.mesh.userData.wheels) w.rotation.y -= tr.vz * delta * 1.5;
          if (tr.z >= HILL.zTop + 1.5) {
            tr.y = hillHeightAt(tr.x, tr.z);
          } else {
            if (hill.fence.visible) {
              hill.fence.visible = false;
            }
            // Roll down the long south face on its wheels: y follows the
            // surface, the body pitches to the slope (nose down toward -Z),
            // and it only tumbles once it reaches the water.
            if (tr.z >= HILL.zNear) {
              tr.y = hillHeightAt(tr.x, tr.z);
            } else {
              // Splash into the river leg at the foot of the hill!
              tr.state = 'floating';
              tr.settleSpin = tr.vz * 0.5;
              tr.floatT = 0;
              tr.y = RIVER.waterY - 0.1;
              tr.vx = 8.5;
            }
          }
          // While it is still on the hill, angle the body to the ground under
          // it — the ground rises toward +Z (behind the truck as it heads
          // south), so a negative pitch tips the nose down the slope. The
          // floating / sinking states ease it over onto its roof from here.
          if (tr.z >= HILL.zNear) {
            const here = hillHeightAt(tr.x, tr.z);
            const pitch = Math.atan(here - hillHeightAt(tr.x, tr.z + 1));
            tr.rotX += (pitch - tr.rotX) * Math.min(1, 6 * delta);
          }
        } else if (tr.state === 'floating') {
          // Bobbing downstream: east along the leg toward the river bend,
          // easing to the middle of the channel-width leg, then turning south
          // down the channel to sink in open water.
          tr.floatT += delta;
          tr.x += tr.vx * delta;
          tr.z += ((RIVER.legZ0 + RIVER.legZ1) / 2 - tr.z) * Math.min(1, 1.2 * delta);
          tr.y = RIVER.waterY - 0.1 + 0.15 * Math.sin(shimmerT * 5) * Math.min(1, tr.floatT);
          tr.rotX += (Math.PI * 0.85 - tr.rotX) * Math.min(1, 1.2 * delta);
          if (tr.x >= (RIVER.x0 + RIVER.x1) / 2) {
            // Reached the channel: drift south down it and sink.
            tr.vz = -8.5;
            tr.vx = 0;
            tr.state = 'sinking';
          }
          if (tr.mesh.userData.wheels) for (const w of tr.mesh.userData.wheels) w.rotation.y += tr.settleSpin * delta;
          tr.settleSpin *= Math.max(0, 1 - 1.0 * delta);
        } else if (tr.state === 'sinking') {
          tr.z += tr.vz * delta;
          tr.y -= 0.9 * delta;
          if (tr.y <= RIVER.bedY + 0.7) {
            tr.y = RIVER.bedY + 0.7;
            tr.state = 'crashed';
            tr.settleSpin = Math.abs(tr.vz) * 0.4;
          }
        } else if (tr.state === 'crashed') {
          tr.rotX += (Math.PI - tr.rotX) * Math.min(1, 3 * delta);
          if (tr.settleSpin > 0.05) {
            for (const w of tr.mesh.userData.wheels) w.rotation.y += tr.settleSpin * delta;
            tr.settleSpin *= Math.max(0, 1 - 1.0 * delta);
          }
        }
        tr.mesh.position.set(tr.x, tr.y, tr.z);
        tr.mesh.rotation.x = tr.rotX;
      }

      // ---- river: foam racing with the current, water bobbing ----
      for (const f of river.foam) {
        if (f.userData.axis === 'x') {
          f.position.x += f.userData.speed * delta;
          if (f.position.x > RIVER.x1 - 1) f.position.x = RIVER.legX0 + 1;
        } else {
          f.position.z -= f.userData.speed * delta;
          if (f.position.z < -GROUND_EX) f.position.z += GROUND_EX * 2;
        }
      }
      for (const w of river.waters) {
        w.position.y = RIVER.waterY + 0.035 * Math.sin(shimmerT * 1.7);
      }

      // ---- mill: wheel, shaft, gears, crank and threshing drum all turn (about Z) ----
      mill.wheel.rotation.z += 1.05 * delta;
      mill.shaft.rotation.z += 1.05 * delta;
      mill.crank.rotation.z += 1.05 * delta;
      mill.gearA.rotation.z -= 1.7 * delta;
      mill.gearB.rotation.z += 2.0 * delta;
      mill.drum.rotation.z += 3.2 * delta;

      // ---- the milling train, all off the same wheel speed ----
      // The great spur wheel drives the upright shaft, which turns the stone
      // nuts and their runner stones; the shoes rattle and the bolters sift.
      mill.spur.rotation.z += 0.62 * delta;
      mill.upright.rotation.y += 0.62 * delta;
      for (const nut of mill.stoneNuts) nut.rotation.y -= 1.4 * delta;
      for (const shoe of mill.shoes) shoe.position.y = 5.0 + Math.sin(shimmerT * 22 + shoe.position.x) * 0.06;
      for (const bol of mill.bolters) bol.rotation.z += 1.1 * delta;
      // The bucket belt: buckets ride up the front and down the back.
      const beltT = (shimmerT * 0.28) % 1;
      for (const bk of mill.buckets) {
        const t = (bk.t + beltT) % 1;
        bk.mesh.position.y = 0.6 + t * mill.beltH;
        bk.mesh.position.z = Math.sin(t * TWO_PI) * 0.35;
      }

      // ---- distillery: fermenters bubble, the pump works, whiskey trickles ----
      mill.mashTuns.forEach((t, i) => { t.rotation.y = Math.sin(shimmerT * 0.4 + i) * 0.02; });
      for (const f of mill.fermenters) {
        // The wash surface bobs and the vat gives a tiny rock, as if gassing off.
        f.wash.position.y = 2.05 + Math.sin(shimmerT * 3.1 + f.x) * 0.05;
        f.wash.scale.y = 1 + Math.sin(shimmerT * 5.3 + f.z) * 0.25;
      }
      mill.pumpHandle.rotation.z = Math.sin(shimmerT * 2.2) * 0.5;
      // The furnace fire flickers.
      mill.fire.material.emissiveIntensity = 1.2 + Math.random() * 0.9;
      mill.fire.scale.setScalar(0.85 + Math.random() * 0.3);
      // The coil gently steams (drift its water) and the collection barrel fills
      // with a slow ripple on the surface.
      mill.water.material.opacity = 0.66 + Math.sin(shimmerT * 1.4) * 0.06;
      mill.collBarrel.rotation.y = Math.sin(shimmerT * 0.6) * 0.03;

      // ---- farmhouse chimney smoke: puffs rise, swell, fade, loop ----
      for (const s of farmhouse.smoke) {
        s.userData.t += delta * 0.22;
        if (s.userData.t > 1) s.userData.t -= 1;
        const t = s.userData.t;
        // Anchor each puff to the stack mouth and drift it downwind from there.
        // (The old code added delta to position.x every frame, so the whole
        // column slowly slid off the chimney and out over the yard.)
        s.position.set(
          s.userData.baseX + t * 2.2,
          s.userData.baseY + t * 4.5,
          s.userData.baseZ + Math.sin(t * 5.5) * 0.55
        );
        s.scale.setScalar(0.6 + t * 1.6);
        s.material.opacity = 0.32 * (1 - t) * Math.min(1, t * 6);
      }

      // ---- Pasture bull ----
      // The rail fence is the thing that keeps him in. A hard ram smashes only
      // the BAYS it actually hits: the nearest intact bay picks the spot, then
      // every intact bay within reach of the impact drops — the rest of the
      // run stays standing. The first smash (while he is still calm) is what
      // sets him off; he charges the nearest car that can take a hit, up to
      // three times, then trudges home and calms down. Any actor (the blue
      // chaser included) can smash the fence down.
      for (const actor of actors) {
        const outX = actor.x < PASTURE.x0 ? PASTURE.x0 - actor.x
          : actor.x > PASTURE.x1 ? actor.x - PASTURE.x1 : 0;
        const outZ = actor.z < PASTURE.z0 ? PASTURE.z0 - actor.z
          : actor.z > PASTURE.z1 ? actor.z - PASTURE.z1 : 0;
        const edgeDist = (outX || outZ)
          ? Math.hypot(outX, outZ)
          : Math.min(actor.x - PASTURE.x0, PASTURE.x1 - actor.x, actor.z - PASTURE.z0, PASTURE.z1 - actor.z);
        if (edgeDist >= 3.2 || Math.abs(actor.speed) <= BULL.breakSpeed) continue;
        // The impact point is the actor's position clamped onto the fence line.
        const ix = THREE.MathUtils.clamp(actor.x, PASTURE.x0, PASTURE.x1);
        const iz = THREE.MathUtils.clamp(actor.z, PASTURE.z0, PASTURE.z1);
        // Only intact bays are candidates; a bay near the hit selects the spot.
        let hitBay = -1, bestD = 5.5;
        for (let i = 0; i < pastureCols.length; i++) {
          const c = pastureCols[i];
          if (c.broken) continue;
          const d = Math.hypot(c.x - ix, c.z - iz);
          if (d < bestD) { bestD = d; hitBay = i; }
        }
        if (hitBay < 0) continue;
        let smashed = false;
        for (let i = 0; i < pastureCols.length; i++) {
          const c = pastureCols[i];
          if (c.broken) continue;
          if (Math.hypot(c.x - ix, c.z - iz) > 4.5) continue;
          c.broken = true;
          pasture.bays[i].visible = false;
          // Rather than blink out, the bay's rails and posts are hurled apart
          // and left lying in the grass (see makeFenceWreck).
          fenceWreck.burst(pasture.defs[i], pasture.base, ix, iz, i === hitBay ? 2 : 1);
          const ci = colliders.indexOf(c);
          if (ci >= 0) colliders.splice(ci, 1);
          smashed = true;
        }
        if (smashed) {
          if (bull.state === 'calm') {
            bull.state = 'angry';
            bull.charges = 0;
            bull.cooldown = 0.9;
          }
          if (typeof actor.onBullBreak === 'function') actor.onBullBreak();
          break;
        }
      }

      // Whoever he is charging: the nearest actor that can actually take the
      // hit (the chaser car has no knock to give), P1 as the fallback.
      const bullTarget = actors.reduce((best, a) => {
        if (typeof a.onBullHit !== 'function') return best;
        if (!best) return a;
        const da = Math.hypot(a.x - bull.x, a.z - bull.z);
        const db = Math.hypot(best.x - bull.x, best.z - bull.z);
        return da < db ? a : best;
      }, null) || car;

      bull.animT += delta;
      let headTarget = 0;
      if (bull.state === 'calm') {
        // Grazing: amble to a target inside the pasture, head down and eat for
        // a few seconds, then pick another spot. The fence holds him in; this
        // is the life he leads until someone smashes it.
        bull.grazeTimer -= delta;
        if (bull.grazePhase === 'walk') {
          const dx = bull.gx - bull.x, dz = bull.gz - bull.z;
          const d = Math.hypot(dx, dz) || 1;
          bull.heading = Math.atan2(-dz, dx);
          headTarget = 0;
          if (d < 1.2 || bull.grazeTimer <= 0) {
            bull.grazePhase = 'eat';
            bull.grazeTimer = 3 + Math.random() * 4;
          } else {
            const step = BULL.walkSpeed * delta;
            bull.x += (dx / d) * step;
            bull.z += (dz / d) * step;
          }
        } else {
          headTarget = -0.9;   // nose in the grass
          if (bull.grazeTimer <= 0) {
            bull.grazePhase = 'walk';
            bull.grazeTimer = 4 + Math.random() * 5;
            const m = 4;
            bull.gx = PASTURE.x0 + m + Math.random() * (PASTURE.x1 - PASTURE.x0 - 2 * m);
            bull.gz = PASTURE.z0 + m + Math.random() * (PASTURE.z1 - PASTURE.z0 - 2 * m);
          }
        }
      } else if (bull.state === 'angry') {
        const dx = bullTarget.x - bull.x, dz = bullTarget.z - bull.z;
        const dist = Math.hypot(dx, dz) || 1;
        bull.heading = Math.atan2(-dz, dx);
        headTarget = -0.5;     // horns lowered, coming for you
        if (dist > BULL.chargeRadius * 0.7) {
          const step = BULL.chargeSpeed * delta;
          bull.x += (dx / dist) * step;
          bull.z += (dz / dist) * step;
        }
        bull.cooldown = Math.max(0, bull.cooldown - delta);
        // Reach him at his own level (the pasture stands on the plateau) — a
        // car down at farm ground or flying well overhead is out of horn range.
        if (dist < BULL.chargeRadius && bull.cooldown <= 0
            && (bullTarget.y ?? 0) < hillHeightAt(bull.x, bull.z) + 6) {
          bull.charges++;
          if (typeof bullTarget.onBullHit === 'function') {
            bullTarget.onBullHit(dx / dist, dz / dist);
          }
          if (bull.charges >= BULL.maxCharges) {
            bull.state = 'spent';
          } else {
            // Back off and let them land before going again. He paces to a spot
            // pulled off the target so he is not parked on top of the car for
            // the whole airtime; the actual re-charge waits for the landing.
            bull.state = 'recover';
            bull.landed = false;
            bull.recoveryTimer = 0;
            bull.recoveryWait = 0;
            const off = (Math.random() < 0.5 ? -1 : 1) * BULL.recoverPace;
            bull.paceX = bull.x - (dx / dist) * off;
            bull.paceZ = bull.z - (dz / dist) * off;
          }
        }
      } else if (bull.state === 'recover') {
        // Wait out the fling: pace around while the car is still in the air, then
        // hold for `flingRecovery` seconds once it is back down before charging
        // again. `recoverTimeout` catches the case where it never comes back to
        // his level (landed on a roof, drove off) so he is never stuck forever.
        bull.recoveryWait += delta;
        const grounded = (bullTarget.y ?? 0) < hillHeightAt(bull.x, bull.z) + 6;
        if (grounded) {
          bull.landed = true;
          bull.recoveryTimer += delta;
        }
        // Amble to the pacing spot — unless he is already there, in which case he
        // just paws the ground in place.
        const pdx = bull.paceX - bull.x, pdz = bull.paceZ - bull.z;
        const pdist = Math.hypot(pdx, pdz);
        bull.heading = Math.atan2(-(bullTarget.z - bull.z), bullTarget.x - bull.x);
        headTarget = -0.25;    // still cross, but not lowered to charge
        if (pdist > 0.6) {
          const step = BULL.walkSpeed * delta;
          bull.x += (pdx / pdist) * step;
          bull.z += (pdz / pdist) * step;
        }
        const ready = bull.landed && bull.recoveryTimer >= BULL.flingRecovery;
        if (ready || bull.recoveryWait >= BULL.recoverTimeout) {
          bull.state = 'angry';
          bull.cooldown = 0;
        }
      } else if (bull.state === 'spent') {
        const dx = bull.homeX - bull.x, dz = bull.homeZ - bull.z;
        const dist = Math.hypot(dx, dz) || 1;
        bull.heading = Math.atan2(-dz, dx);
        headTarget = -0.2;     // worn out, head hanging
        if (dist > 2.0) {
          const step = BULL.walkSpeed * delta;
          bull.x += (dx / dist) * step;
          bull.z += (dz / dist) * step;
        } else {
          bull.state = 'calm';
          bull.charges = 0;
          bull.grazePhase = 'walk';
          bull.grazeTimer = 2;
          bull.gx = bull.homeX; bull.gz = bull.homeZ;
        }
      }
      bull.headPitch += (headTarget - bull.headPitch) * Math.min(1, 8 * delta);
      bull.headG.rotation.z = bull.headPitch;
      bull.mesh.position.set(bull.x, hillHeightAt(bull.x, bull.z), bull.z);
      bull.mesh.rotation.y = bull.heading;
      const calmWalking = bull.state === 'calm' && bull.grazePhase === 'walk';
      const gait = bull.state === 'angry' ? 14 : bull.state === 'recover' ? 10
        : bull.state === 'spent' ? 8 : 6;
      const amp = (bull.state === 'angry' || bull.state === 'recover' || bull.state === 'spent') ? 0.5
        : calmWalking ? 0.25 : 0;   // standing still while he eats
      for (let i = 0; i < bull.legs.length; i++) {
        bull.legs[i].rotation.x = Math.sin(bull.animT * gait + (i % 2) * Math.PI + (i > 1 ? 0.6 : 0)) * amp;
      }

      // ---- Fence wreckage: fly, land, settle, and get batted around again ----
      for (const actor of actors) {
        if (Math.abs(actor.speed) <= CORN.minSpeed) continue;
        fenceWreck.knockAt(actor.x, actor.z, 1.4, Math.abs(actor.speed));
      }
      fenceWreck.update(delta);

      cobs.update(delta);
      hay.update(delta);
      stems.update(delta);
    },
    reset() {
      corn.reset();
      for (const p of pumpkins) {
        p.x = p.home.x; p.z = p.home.z; p.vx = 0; p.vz = 0; p.spin = 0;
        p.stemAttached = true; p.stem.visible = true;
        if (p.drag) p.drag.visible = false;
        p.group.position.set(p.home.x, p.restY, p.home.z);
        p.group.quaternion.identity();
      }
      // stack every barrel back up where it started
      for (const b of barrels) {
        b.x = b.home.x; b.y = b.home.y; b.z = b.home.z;
        b.vx = 0; b.vz = 0; b.vy = 0; b.roll = 0; b.tip = 0; b.tipV = 0; b.state = 'stacked';
        b.group.position.set(b.x, b.y, b.z);
        b.group.quaternion.setFromAxisAngle(_up, b.home.axis).multiply(
          _q.setFromAxisAngle(_zAxis, Math.PI / 2));
      }
      // squirrel
      squirrel.state = 'idle'; squirrel.timer = 0;
      squirrel.x = SQUIRREL.home.x; squirrel.z = SQUIRREL.home.z; squirrel.y = CORN_GROUND;
      squirrel.node = null; squirrel.tree = null; squirrel.shot = 0; squirrel.perch = null;
      squirrel.mesh.position.set(squirrel.x, squirrel.y, squirrel.z);
      apples.reset();
      // tractor
      farmTractor.x = TRACTOR.path[0][0]; farmTractor.z = TRACTOR.path[0][1];
      farmTractor.wp = 1; farmTractor.heading = 0; farmTractor.spin = 0;
      farmTractor.knock = null;
      squirrel.mesh.userData.throwArm.rotation.x = 0;
      farmTractor.mesh.position.set(farmTractor.x, CORN_GROUND, farmTractor.z);
      farmTractor.mesh.rotation.set(0, 0, 0);
      tractorCollider.x = farmTractor.x; tractorCollider.z = farmTractor.z;
      // runaway truck
      truck.x = FARM_TRUCK.x; truck.y = hillHeightAt(FARM_TRUCK.x, FARM_TRUCK.z); truck.z = FARM_TRUCK.z;
      truck.vz = 0; squirrel.shot = 0; truck.vy = 0; truck.rotX = 0;
      truck.state = 'parked'; truck.settleSpin = 0; truck.floatT = 0;
      truck.mesh.position.set(truck.x, truck.y, truck.z);
      truck.mesh.rotation.set(0, FARM_TRUCK.yaw, 0);
      hill.fence.visible = true;
      if (colliders.indexOf(truckCollider) < 0) colliders.push(truckCollider);
      // pasture + bull: stand every bay back up, sweep up the wreckage and
      // restore its collider.
      fenceWreck.clear();
      for (let i = 0; i < pastureCols.length; i++) {
        pastureCols[i].broken = false;
        pasture.bays[i].visible = true;
      }
      for (const c of pastureCols) if (colliders.indexOf(c) < 0) colliders.push(c);
      bull.x = bull.homeX; bull.z = bull.homeZ;
      bull.state = 'calm'; bull.charges = 0; bull.cooldown = 0;
      bull.recoveryTimer = 0; bull.recoveryWait = 0; bull.landed = false;
      bull.paceX = bull.homeX; bull.paceZ = bull.homeZ;
      bull.heading = 0; bull.grazePhase = 'walk'; bull.grazeTimer = 2;
      bull.gx = bull.homeX; bull.gz = bull.homeZ; bull.headPitch = 0;
      bull.headG.rotation.z = 0;
      bull.mesh.position.set(bull.x, hillHeightAt(bull.x, bull.z), bull.z);
      bull.mesh.rotation.y = 0;
    },
  };
}

// ---- standalone models for the object browser (each built into its own group) -
export function makeBarnModel() {
  const g = new THREE.Group();
  buildBarn(g);
  return g;
}
export function makeSiloModel() {
  const g = new THREE.Group();
  buildSilo(g);
  return g;
}
export function makeWaterTowerModel() {
  const g = new THREE.Group();
  buildWaterTower(g);
  return g;
}
export function makeMillModel() {
  const g = new THREE.Group();
  buildMill(g);
  return g;
}
export function makeFarmhouseModel() {
  const g = new THREE.Group();
  buildFarmhouse(g);
  return g;
}
export function makePumpkinModel() {
  const g = new THREE.Group();
  const r = 1.3;
  const body = new THREE.Mesh(makePumpkinGeometry(r), M.pumpkin);
  body.scale.set(1, 0.72, 1);
  g.add(body);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.5, 6), M.stem);
  stem.position.set(0, r * 0.72 + 0.2, 0);
  stem.rotation.z = 0.15;
  g.add(stem);
  return g;
}
export function makeCornStalkModel() {
  return new THREE.Mesh(buildCornStalkGeometry(2.7), M.cornStalk);
}
export function makeAppleTreeModel() {
  return makeAppleTree().group;
}
export function makeBarrelModel() {
  return makeBarrel(1.1, 0.55);
}

