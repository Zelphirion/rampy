import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable } from './physics.js';

const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x3a7a3f, roughness: 1 });

// ===== Trees =====
function makeTree(scene, x, z) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x6d4c2b, roughness: 1 })
  );
  trunk.position.y = 0.9;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3f7d41, roughness: 0.9 })
  );
  crown.position.y = 2.2;
  crown.castShadow = true;
  crown.receiveShadow = true;
  group.add(crown);

  group.position.set(x, 0, z);
  scene.add(group);
  addKnockable(group, 0.55, { fallTime: 0.5 });
}

function addSurroundingTrees(scene) {
  // NOTE: all of these sit clear of the train loop (outer extent ±84): the
  // ±88 / ±74 ring keeps a clean grass margin around the rails. The four ±82
  // trees were pushed out to ±88 when the loop grew from ±78 to ±84 so their
  // canopies never brush the track.
  const treePositions = [
    [-88, -60], [-88, -34], [-74, 34], [-88, 74],
    [88, -60], [88, -36], [74, 36], [88, 74],
    [-26, 74], [28, 74], [-22, -74], [24, -74]
  ];
  treePositions.forEach(([x, z]) => makeTree(scene, x, z));
}

// ===== Road markings =====
function addRoadMarkings(scene) {
  const laneMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e0, roughness: 0.85 });
  const markY = 0.3;
  for (let x = -76; x <= 76; x += 8) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(3, 0.14, 0.42), laneMat);
    d.position.set(x, markY, 0);
    d.receiveShadow = true;
    scene.add(d);
  }
  for (let z = -76; z <= 76; z += 8) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 3), laneMat);
    d.position.set(0, markY, z);
    d.receiveShadow = true;
    scene.add(d);
  }
  for (const off of [-11.5, 11.5]) {
    const e1 = new THREE.Mesh(new THREE.BoxGeometry(160, 0.14, 0.26), laneMat);
    e1.position.set(0, markY, off);
    e1.receiveShadow = true;
    scene.add(e1);
    const e2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 160), laneMat);
    e2.position.set(off, markY, 0);
    e2.receiveShadow = true;
    scene.add(e2);
  }
}

// ===== Traffic lights & stop signs =====
const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f353b, roughness: 0.8 });

function makeTrafficLight(scene, x, z, axis, trafficLights) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.4, 10), poleMat);
  pole.position.y = 2.2;
  pole.castShadow = true;
  pole.receiveShadow = true;
  group.add(pole);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.35, 0.38), poleMat);
  housing.position.y = 3.6;
  housing.castShadow = true;
  group.add(housing);
  const bulbs = [];
  [0xff4433, 0xffaa22, 0x33ff55].forEach((c, i) => {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 10),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 })
    );
    b.position.set(0, 3.6 + (1 - i) * 0.37, 0.21);
    group.add(b);
    bulbs.push(b);
  });
  group.position.set(x, 0, z);
  group.lookAt(0, 3.6, 0);   // +Z (bulb side) faces the intersection
  scene.add(group);
  addKnockable(group, 0.7, { fallTime: 0.45 });
  // `axis` says which road this signal governs: 'x' for E/W (main road),
  // 'z' for N/S (cross road), so the intersection can alternate properly.
  trafficLights.push({ bulbs, axis });
}

function makeStopSign(scene, x, z, rotY) {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 8), poleMat);
  post.position.y = 0.85;
  post.castShadow = true;
  group.add(post);
  const sign = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.06, 8),
    new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 })
  );
  sign.position.y = 1.8;
  sign.rotation.x = Math.PI / 2;   // stand it up vertically
  group.add(sign);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  addKnockable(group, 0.6, { fallTime: 0.35 });
}

// ===== Lamp posts =====
const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c2, emissive: 0xffd98a, emissiveIntensity: 1.4 });

function makeLampPost(scene, x, z) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.3, 8), poleMat);
  pole.position.y = 1.65;
  pole.castShadow = true;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 0.09), poleMat);
  arm.position.set(0.5, 3.25, 0);
  group.add(arm);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), lampBulbMat);
  bulb.position.set(1.1, 3.15, 0);
  group.add(bulb);
  group.position.set(x, 0, z);
  scene.add(group);
  addKnockable(group, 0.5, { fallTime: 0.4 });
}

// ===== Lamp-post field in the park (a whole forest of them to knock down) =====
function addLampField(scene) {
  // A 7x7 grid centered on the park (62,62), skipping the pond and one corner
  // so exactly 39 lamp posts stand in the field, ready to be knocked over.
  let count = 0;
  for (let x = 53; x <= 71; x += 3) {
    for (let z = 53; z <= 71; z += 3) {
      const dx = x - 62;
      const dz = z - 62;
      if (dx * dx + dz * dz < 4.6 * 4.6) continue;   // over the pond
      if (x === 71 && z === 71) continue;            // keep the total at 39
      makeLampPost(scene, x, z);
      count++;
    }
  }
  return count;
}

// ===== Fire hydrants with enormous water spray =====
const _sprayDropGeo = new THREE.SphereGeometry(0.07, 5, 5);
const _sprayDropMat = new THREE.MeshStandardMaterial({ color: 0x55bbff, transparent: true, opacity: 0.85, roughness: 0.15 });
const _geyserGeo = new THREE.CylinderGeometry(0.06, 0.22, 6, 8);
const _geyserMat = new THREE.MeshStandardMaterial({ color: 0x99ddff, transparent: true, opacity: 0.6, roughness: 0.1 });
const _SPRAY_DROPS = 55;
const _SPRAY_DURATION = 3.8;
const _hydrantSprays = [];

function makeFireHydrant(scene, x, z) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 })
  );
  body.position.y = 0.32;
  body.castShadow = true;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.1, 8), body.material);
  cap.position.y = 0.62;
  group.add(cap);
  // Side nozzles
  for (const side of [-1, 1]) {
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.15, 6),
      new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 })
    );
    nozzle.position.set(side * 0.18, 0.38, 0);
    nozzle.rotation.z = side * Math.PI / 2;
    group.add(nozzle);
  }
  group.position.set(x, 0, z);
  group.scale.set(3, 3, 3);
  scene.add(group);
  const k = addKnockable(group, 1.05, { fallTime: 0.25 });

  // Water spray system — geyser column + 55 droplets
  const geyser = new THREE.Mesh(_geyserGeo, _geyserMat.clone());
  geyser.position.set(x, 3, z);
  geyser.visible = false;
  scene.add(geyser);
  const drops = [];
  for (let i = 0; i < _SPRAY_DROPS; i++) {
    const d = new THREE.Mesh(_sprayDropGeo, _sprayDropMat.clone());
    d.position.set(x, 0.5, z);
    d.visible = false;
    scene.add(d);
    drops.push({ mesh: d, vx: 0, vy: 0, vz: 0 });
  }
  _hydrantSprays.push({ knockRef: k, lastState: 'standing', geyser, drops, active: false, timer: 0, x, z });
}

export function updateHydrantSprays(delta) {
  for (const s of _hydrantSprays) {
    const st = s.knockRef.state;
    if (s.lastState === 'standing' && st !== 'standing' && !s.active) {
      // Hydrant just knocked — enormous water burst!
      s.active = true;
      s.timer = 0;
      s.geyser.visible = true;
      s.geyser.scale.set(1, 1, 1);
      s.geyser.material.opacity = 0.65;
      for (const d of s.drops) {
        d.mesh.position.set(
          s.x + (Math.random() - 0.5) * 0.18,
          0.5 + Math.random() * 0.25,
          s.z + (Math.random() - 0.5) * 0.18
        );
        d.mesh.visible = true;
        d.mesh.material.opacity = 0.85;
        const angle = Math.random() * Math.PI * 2;
        const spread = 0.8 + Math.random() * 4.5;
        d.vx = Math.cos(angle) * spread;
        d.vy = 10 + Math.random() * 18;
        d.vz = Math.sin(angle) * spread;
      }
    }
    s.lastState = st;
    if (!s.active) continue;
    s.timer += delta;
    // Geyser shrinks and fades
    const ge = Math.max(0, 1 - s.timer / _SPRAY_DURATION);
    s.geyser.scale.set(0.8 + 0.2 * Math.sin(s.timer * 12), ge, 0.8 + 0.2 * Math.sin(s.timer * 12));
    s.geyser.material.opacity = 0.65 * ge;
    // Droplet physics
    for (const d of s.drops) {
      if (!d.mesh.visible) continue;
      d.vy -= 22 * delta;
      d.mesh.position.x += d.vx * delta;
      d.mesh.position.y += d.vy * delta;
      d.mesh.position.z += d.vz * delta;
      if (d.mesh.position.y < 0.1) {
        d.mesh.position.y = 0.1;
        d.vy = Math.abs(d.vy) * 0.25;
        d.vx *= 0.55;
        d.vz *= 0.55;
      }
      if (s.timer > _SPRAY_DURATION * 0.55) {
        d.mesh.material.opacity = 0.85 * Math.max(0, 1 - (s.timer - _SPRAY_DURATION * 0.55) / (_SPRAY_DURATION * 0.45));
      }
    }
    if (s.timer > _SPRAY_DURATION) {
      s.active = false;
      s.geyser.visible = false;
      for (const d of s.drops) d.mesh.visible = false;
    }
  }
}

export function resetHydrantSprays() {
  for (const s of _hydrantSprays) {
    s.active = false;
    s.timer = 0;
    s.lastState = 'standing';
    s.geyser.visible = false;
    for (const d of s.drops) d.mesh.visible = false;
  }
}

// ===== Street Cones =====
const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.7 });
const coneWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });

function makeStreetCone(scene, x, z) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.05, 8), coneMat);
  base.position.y = 0.025;
  base.castShadow = true;
  group.add(base);
  const coneBody = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 8), coneMat);
  coneBody.position.y = 0.23;
  coneBody.castShadow = true;
  group.add(coneBody);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 8), coneWhiteMat);
  stripe.position.y = 0.19;
  group.add(stripe);
  group.position.set(x, 0, z);
  group.scale.set(3, 3, 3);
  scene.add(group);
  addKnockable(group, 0.66, { mode: 'scatter', fallTime: 0.3, slideDistance: 1.5, flyHeight: 0.45 });
}

// ===== Newspaper Boxes =====
const newsBoxMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.7 });
const paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 });
const newsGlassMat = new THREE.MeshStandardMaterial({ color: 0xaaddee, transparent: true, opacity: 0.4, roughness: 0.1 });

function makeNewspaperBox(scene, x, z, rotY) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.38), newsBoxMat);
  body.position.y = 0.42;
  body.castShadow = true;
  group.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.02), newsGlassMat);
  glass.position.set(0, 0.48, 0.2);
  group.add(glass);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.15), paperMat);
    p.position.set((Math.random() - 0.5) * 0.08, 0.38 + i * 0.07, 0);
    group.add(p);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotY || 0;
  group.scale.set(3, 3, 3);
  scene.add(group);
  const k = addKnockable(group, 1.35, { fallTime: 0.35 });
  k.linked = [];
  for (let i = 0; i < 10; i++) {
    const pg = new THREE.Group();
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.14), paperMat.clone());
    sheet.castShadow = true;
    pg.add(sheet);
    pg.position.set(x, 0.65, z);
    pg.rotation.y = rotY || 0;
    pg.scale.set(3, 3, 3);
    scene.add(pg);
    k.linked.push(addKnockable(pg, 0.75, {
      mode: 'scatter',
      fallTime: 0.35 + Math.random() * 0.3,
      slideDistance: 1.5 + Math.random() * 2.0,
      flyHeight: 0.5 + Math.random() * 0.8,
    }));
  }
}

// ===== Parking Meters =====
const meterMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.6, metalness: 0.4 });
const coinMat = new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.3, metalness: 0.7 });

function makeParkingMeter(scene, x, z, rotY) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.3, 6), meterMat);
  pole.position.y = 0.65;
  pole.castShadow = true;
  group.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.13), meterMat);
  head.position.y = 1.38;
  head.castShadow = true;
  group.add(head);
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3 })
  );
  face.position.set(0, 1.4, 0.07);
  group.add(face);
  group.position.set(x, 0, z);
  group.rotation.y = rotY || 0;
  group.scale.set(3, 3, 3);
  scene.add(group);
  const k = addKnockable(group, 1.05, { fallTime: 0.3 });
  k.linked = [];
  for (let i = 0; i < 10; i++) {
    const cg = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8), coinMat);
    disc.castShadow = true;
    cg.add(disc);
    cg.position.set(x, 1.2, z);
    cg.scale.set(3, 3, 3);
    scene.add(cg);
    k.linked.push(addKnockable(cg, 0.54, {
      mode: 'scatter',
      fallTime: 0.25 + Math.random() * 0.2,
      slideDistance: 1.0 + Math.random() * 2.5,
      flyHeight: 0.4 + Math.random() * 0.7,
    }));
  }
}

// ===== Street Benches (along sidewalks) =====
function makeStreetBench(scene, x, z, rotY) {
  const group = new THREE.Group();
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.9 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), benchMat);
  seat.position.y = 0.45;
  seat.castShadow = true;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.09), benchMat);
  back.position.set(0, 0.75, -0.24);
  group.add(back);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  group.scale.set(3, 3, 3);
  scene.add(group);
  addKnockable(group, 3.3, { fallTime: 0.35, shovePower: 9, shoveSpinPower: 2.0 });
}

// ===== Trash Cans =====
const trashCanMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.8 });
const garbageMats = [
  new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0xd2691e, roughness: 0.9 }),
];

function makeTrashCan(scene, x, z) {
  const group = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.65, 10), trashCanMat);
  can.position.y = 0.325;
  can.castShadow = true;
  group.add(can);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 10), trashCanMat);
  lid.position.y = 0.67;
  group.add(lid);
  group.position.set(x, 0, z);
  group.scale.set(3, 3, 3);
  scene.add(group);
  const k = addKnockable(group, 1.2, { fallTime: 0.35, shovePower: 10, shoveSpinPower: 2.2 });
  k.linked = [];
  for (let i = 0; i < 8; i++) {
    const gg = new THREE.Group();
    const mat = garbageMats[i % garbageMats.length];
    const geo = Math.random() < 0.5
      ? new THREE.BoxGeometry(0.07 + Math.random() * 0.07, 0.05, 0.05 + Math.random() * 0.05)
      : new THREE.SphereGeometry(0.035 + Math.random() * 0.025, 5, 5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    gg.add(mesh);
    gg.position.set(x, 0.75, z);
    gg.scale.set(3, 3, 3);
    scene.add(gg);
    k.linked.push(addKnockable(gg, 0.54, {
      mode: 'scatter',
      fallTime: 0.3 + Math.random() * 0.3,
      slideDistance: 1.0 + Math.random() * 2.0,
      flyHeight: 0.35 + Math.random() * 0.65,
    }));
  }
}

// ===== Soda Vending Machines =====
const vendingRedMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 });
const sodaCanRedMat = new THREE.MeshStandardMaterial({ color: 0xdd1111, roughness: 0.4, metalness: 0.3 });
const sodaCanBlueMat = new THREE.MeshStandardMaterial({ color: 0x1177dd, roughness: 0.4, metalness: 0.3 });

function makeSodaVendingMachine(scene, x, z, rotY) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.5, 0.65), vendingRedMat);
  body.position.y = 0.75;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // Top cap / brand header
  const topCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.89, 0.12, 0.69),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 })
  );
  topCap.position.y = 1.56;
  group.add(topCap);
  // Brand sign area on front-top
  const brandSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.2, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
  );
  brandSign.position.set(0, 1.42, 0.34);
  group.add(brandSign);
  // Display panel with selection buttons
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.55, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 })
  );
  panel.position.set(0, 1.05, 0.34);
  group.add(panel);
  // Selection buttons (colored rows representing different sodas)
  const buttonColors = [0xdd1111, 0x1177dd, 0x22aa22, 0xff8800, 0xdd1111, 0x1177dd];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const btn = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.12, 0.025),
        new THREE.MeshStandardMaterial({ color: buttonColors[row * 2 + col], roughness: 0.4, metalness: 0.2 })
      );
      btn.position.set(-0.1 + col * 0.2, 1.18 - row * 0.16, 0.355);
      group.add(btn);
    }
  }
  // Coin slot
  const coinSlot = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.04, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.6 })
  );
  coinSlot.position.set(0.18, 1.28, 0.35);
  group.add(coinSlot);
  // Coin return slot
  const coinReturn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.025, 8),
    new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.5 })
  );
  coinReturn.position.set(0.18, 0.95, 0.35);
  coinReturn.rotation.x = Math.PI / 2;
  group.add(coinReturn);
  // Delivery tray / bin at bottom
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 })
  );
  tray.position.set(0, 0.18, 0.35);
  group.add(tray);
  // Side trim strips
  for (const sx of [-0.44, 0.44]) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 1.3, 0.66),
      new THREE.MeshStandardMaterial({ color: 0xaa1111, roughness: 0.5, metalness: 0.2 })
    );
    trim.position.set(sx, 0.75, 0);
    group.add(trim);
  }
  // Dispensing slot
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.16, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 })
  );
  slot.position.set(0, 0.32, 0.34);
  group.add(slot);
  group.position.set(x, 0, z);
  group.rotation.y = rotY || 0;
  group.scale.set(3, 3, 3);
  scene.add(group);
  const k = addKnockable(group, 2.25, { fallTime: 0.5, shovePower: 6 });
  k.linked = [];
  for (let i = 0; i < 14; i++) {
    const cg = new THREE.Group();
    const mat = Math.random() < 0.5 ? sodaCanRedMat : sodaCanBlueMat;
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.44, 8), mat);
    cylinder.castShadow = true;
    cg.add(cylinder);
    cg.position.set(x, 0.9, z);
    scene.add(cg);
    k.linked.push(addKnockable(cg, 0.56, {
      mode: 'scatter',
      fallTime: 0.3 + Math.random() * 0.3,
      slideDistance: 1.5 + Math.random() * 3.0,
      flyHeight: 0.3 + Math.random() * 0.55,
    }));
  }
}

// ===== Phone Booths =====
const phoneBoothMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.6 });
const phoneBoothGlassMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.35, roughness: 0.1 });

function makePhoneBooth(scene, x, z, rotY) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.07, 0.85), phoneBoothMat);
  base.position.y = 0.035;
  group.add(base);
  for (const [lx, lz] of [[-0.36, -0.36], [-0.36, 0.36], [0.36, -0.36], [0.36, 0.36]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6), phoneBoothMat);
    post.position.set(lx, 0.95, lz);
    post.castShadow = true;
    group.add(post);
  }
  for (const [lx, lz, ry] of [[0, -0.36, 0], [-0.36, 0, Math.PI / 2], [0.36, 0, Math.PI / 2]]) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.5, 0.02), phoneBoothGlassMat);
    glass.position.set(lx, 1.0, lz);
    glass.rotation.y = ry;
    group.add(glass);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.9), phoneBoothMat);
  roof.position.y = 1.95;
  roof.castShadow = true;
  group.add(roof);
  const phone = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.18, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 })
  );
  phone.position.set(0, 1.1, 0.34);
  group.add(phone);
  group.position.set(x, 0, z);
  group.rotation.y = rotY || 0;
  group.scale.set(3, 3, 3);
  scene.add(group);
  addKnockable(group, 1.95, { fallTime: 0.5 });
}

// ===== Street Furniture Placement =====
function addStreetFurniture(scene) {
  // Street cones — lightweight, scatter on impact
  const conePos = [
    [14, 14], [14, -14], [-14, 14], [-14, -14],
    [35, 14], [-35, 14], [35, -14], [-35, -14],
    [14, 35], [14, -35], [-14, 35], [-14, -35],
  ];
  conePos.forEach(([x, z]) => makeStreetCone(scene, x, z));

  // Newspaper boxes — papers burst out on impact
  const newsPos = [
    [14, 6], [-14, 6], [6, 14], [-6, 14],
    [14, -6], [-14, -6], [6, -14], [-6, -14],
  ];
  newsPos.forEach(([x, z]) => makeNewspaperBox(scene, x, z, Math.atan2(-z, -x)));

  // Parking meters — coins clatter everywhere on impact
  const meterPos = [
    [-48, -50], [-52, -48], [30, 14], [-30, 14],
    [50, 14], [-50, 14], [14, 30], [-14, 30],
    [14, -30], [-14, -30],
  ];
  meterPos.forEach(([x, z]) => makeParkingMeter(scene, x, z, Math.atan2(-z, -x)));

  // Street benches along sidewalks — can be re-shoved after falling
  const benchPos = [
    [25, 14, 0], [-25, 14, 0], [45, 14, 0], [-45, 14, 0],
    [14, 25, Math.PI / 2], [-14, 25, Math.PI / 2],
    [14, -25, -Math.PI / 2], [-14, -25, -Math.PI / 2],
  ];
  benchPos.forEach(([x, z, r]) => makeStreetBench(scene, x, z, r));

  // Trash cans — garbage spews out, can rolls like barrel
  const trashPos = [
    [16, 16], [16, -16], [-16, 16], [-16, -16],
    [40, 14], [-40, 14], [60, 14], [-60, 14],
    [14, 40], [-14, 40], [14, -40], [-14, -40],
  ];
  trashPos.forEach(([x, z]) => makeTrashCan(scene, x, z));

  // Soda vending machines — dozens of cans scatter on impact
  const vendingPos = [
    [28, 14, 0], [-28, 14, Math.PI],
    [14, 28, Math.PI / 2], [-14, 28, -Math.PI / 2],
    [14, -28, -Math.PI / 2], [-14, -28, Math.PI / 2],
  ];
  vendingPos.forEach(([x, z, r]) => makeSodaVendingMachine(scene, x, z, r));

  // Phone booths at a few corners
  const phonePos = [
    [22, 14, 0], [-22, 14, Math.PI],
    [14, 22, Math.PI / 2], [-14, 22, -Math.PI / 2],
  ];
  phonePos.forEach(([x, z, r]) => makePhoneBooth(scene, x, z, r));
}

// ===== Fence (park border) =====
const fenceMat = new THREE.MeshStandardMaterial({ color: 0x9a8a72, roughness: 0.9 });

function makeFenceLine(scene, x1, z1, x2, z2, n = 6) {
  const group = new THREE.Group();
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const len = Math.hypot(x2 - x1, z2 - z1);
  const rotY = Math.atan2(z2 - z1, x2 - x1);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), fenceMat);
    post.position.set(x1 - cx + (x2 - x1) * t, 0.45, z1 - cz + (z2 - z1) * t);
    post.castShadow = true;
    group.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.07), fenceMat);
  rail.position.set(0, 0.75, 0);
  rail.rotation.y = rotY;
  group.add(rail);
  group.position.set(cx, 0, cz);
  scene.add(group);
  addKnockable(group, 5, { mode: 'slide', slideDistance: 1.2, fallTime: 0.5 });
}

// ===== Park (northeast) =====
function makeBench(scene, x, z, rotY) {
  const group = new THREE.Group();
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.9 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), benchMat);
  seat.position.y = 0.45;
  seat.castShadow = true;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.09), benchMat);
  back.position.set(0, 0.75, -0.24);
  group.add(back);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  addKnockable(group, 1.1, { fallTime: 0.35 });
}

function addPark(scene) {
  const park = new THREE.Mesh(new THREE.BoxGeometry(26, 0.16, 26), grassMaterial);
  park.position.set(62, 0.08, 62);
  park.receiveShadow = true;
  scene.add(park);

  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.4, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x2f6fae, roughness: 0.35 })
  );
  pond.position.set(62, 0.16, 62);
  pond.receiveShadow = true;
  scene.add(pond);

  [[52,52],[72,52],[52,72],[72,72],[62,48],[48,62],[76,62],[62,76]].forEach(([x, z]) => makeTree(scene, x, z));
  makeBench(scene, 58, 66, 0);
  makeBench(scene, 66, 58, Math.PI / 2);
}

// ===== Parking lot (southwest) =====
function addParkingLot(scene) {
  const lot = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.16, 26),
    new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 1 })
  );
  lot.position.set(-62, 0.08, -60);
  lot.receiveShadow = true;
  scene.add(lot);

  const lotLineMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.8 });
  for (let i = -2; i <= 2; i++) {
    for (const z of [-60, -68.2]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 4.6), lotLineMat);
      line.position.set(-62 + i * 6, 0.16, z);
      line.receiveShadow = true;
      scene.add(line);
    }
  }
}

// ===== Market stalls (little fruit shops around the edge of town) =====
const stallWoodMat = new THREE.MeshStandardMaterial({ color: 0x8a6b43, roughness: 0.85 });
const umbrellaPoleMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 });

// Red-and-white striped canvas, wrapped around the canopy cone so the stripes
// read as alternating umbrella panels.
const umbrellaTex = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f5f2ea' : '#d92b2b';
    g.fillRect(i * 16, 0, 16, 128);
  }
  return new THREE.CanvasTexture(c);
})();
const umbrellaMat = new THREE.MeshStandardMaterial({ map: umbrellaTex, roughness: 0.7, side: THREE.DoubleSide });

const appleMat = new THREE.MeshStandardMaterial({ color: 0xd42828, roughness: 0.35 });
const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff8c2a, roughness: 0.5 });
const fruitGeo = new THREE.SphereGeometry(0.13, 10, 10);

// One market stall: a big table piled with apples (or oranges) under a red &
// white umbrella. The table and umbrella wobble when hit and spring back
// upright (like the shops), while every piece of fruit scatters everywhere.
function makeFruitStall(scene, x, z, rotY) {
  const fruitMat = Math.random() < 0.5 ? appleMat : orangeMat;

  // ---- Big table ----
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.3), stallWoodMat);
  top.position.y = 0.85;
  top.castShadow = true;
  top.receiveShadow = true;
  table.add(top);
  for (const lx of [-1.05, 1.05]) {
    for (const lz of [-0.5, 0.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), stallWoodMat);
      leg.position.set(lx, 0.4, lz);
      leg.castShadow = true;
      table.add(leg);
    }
  }
  table.position.set(x, 0, z);
  table.rotation.y = rotY;
  scene.add(table);
  const tableK = addKnockable(table, 1.5, { mode: 'wobble', fallTime: 0.5 });
  tableK.linked = [];

  // ---- Fruit piled on the tabletop (each piece scatters independently) ----
  for (let ri = 0; ri < 3; ri++) {
    for (let ci = 0; ci < 5; ci++) {
      const fruit = new THREE.Group();
      const ball = new THREE.Mesh(fruitGeo, fruitMat);
      ball.castShadow = true;
      fruit.add(ball);
      fruit.position.set(x, 1.03, z);
      fruit.rotation.y = rotY;
      fruit.translateX((ci - 2) * 0.36);
      fruit.translateZ((ri - 1) * 0.34);
      scene.add(fruit);
      const fk = addKnockable(fruit, 0.4, {
        mode: 'scatter',
        fallTime: 0.5 + Math.random() * 0.2,
        slideDistance: 1.4 + Math.random() * 1.2,
        flyHeight: 0.7 + Math.random() * 0.5,
      });
      tableK.linked.push(fk);
    }
  }

  // ---- Red & white umbrella on a pole behind the table ----
  const umbrella = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.3, 8), umbrellaPoleMat);
  pole.position.y = 1.15;
  pole.castShadow = true;
  umbrella.add(pole);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.55, 16), umbrellaMat);
  canopy.position.y = 2.25;
  canopy.rotation.x = 0.12;   // a little tilt, like it's open in the sun
  canopy.castShadow = true;
  umbrella.add(canopy);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), umbrellaPoleMat);
  finial.position.y = 2.56;
  umbrella.add(finial);
  umbrella.position.set(x, 0, z);
  umbrella.rotation.y = rotY;
  umbrella.translateZ(-0.75);   // pole stands behind the table
  scene.add(umbrella);
  addKnockable(umbrella, 0.8, { mode: 'wobble', fallTime: 0.45 });
}

// A ring of fruit stalls around the edge of town, on the perimeter sidewalks.
function addMarketStalls(scene) {
  const stalls = [
    [-33, 42, 0],
    [33, 42, 0],
    [-33, -42, Math.PI],
    [33, -42, Math.PI],
    [42, -33, Math.PI / 2],
    [42, 33, Math.PI / 2],
    [-42, -33, -Math.PI / 2],
    [-42, 33, -Math.PI / 2],
  ];
  stalls.forEach(([x, z, r]) => makeFruitStall(scene, x, z, r));
}

// ===== Flowers & flowerbeds =====
const flowerStemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.3, 4);
const flowerBloomGeo = new THREE.SphereGeometry(0.085, 6, 6);
const flowerStemMat = new THREE.MeshStandardMaterial({ color: 0x2f7d33, roughness: 1 });
const flowerColors = [0xff4d6d, 0xffb703, 0xc77dff, 0xff8c42, 0xffffff, 0x70e000, 0x4cc9f0];
const flowerBloomMats = flowerColors.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })
);
const flowerBoxMat = new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.9 });
const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });

function makeFlowerBed(scene, x, z, rotY, n = 6) {
  const group = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 0.75), flowerBoxMat);
  bed.position.y = 0.09;
  bed.castShadow = true;
  bed.receiveShadow = true;
  group.add(bed);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.05, 0.6), soilMat);
  soil.position.y = 0.2;
  group.add(soil);
  for (let i = 0; i < n; i++) {
    const fx = (n === 1 ? 0 : i / (n - 1) - 0.5) * 1.7;
    const fz = (Math.random() - 0.5) * 0.35;
    const stem = new THREE.Mesh(flowerStemGeo, flowerStemMat);
    stem.position.set(fx, 0.35, fz);
    group.add(stem);
    const bloom = new THREE.Mesh(
      flowerBloomGeo,
      flowerBloomMats[Math.floor(Math.random() * flowerBloomMats.length)]
    );
    bloom.position.set(fx, 0.48 + Math.random() * 0.06, fz);
    group.add(bloom);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
}

// ===== Small colourful shops (edges of town) =====
const shopDoorMat = new THREE.MeshStandardMaterial({ color: 0x6b4026, roughness: 1 });
const shopGlassMat = new THREE.MeshStandardMaterial({ color: 0x9fc8e8, roughness: 0.15, metalness: 0.15 });
const signMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2b, roughness: 0.85 });

// One small shop: a pastel facade with a steep roof, a glass display window
// (with a flower box blooming beneath it), and a door. The whole shop wobbles
// when hit and springs back upright — it never falls over.
function makeShop(scene, x, z, rotY, color, roofColor) {
  const group = new THREE.Group();
  const facadeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 2.5), facadeMat);
  body.position.y = 1.3;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.35, 1.15, 4),
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9 })
  );
  roof.position.y = 2.6;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Front is +Z. Display window (left) with a wooden frame and recessed glass
  // (the pane sits behind the frame face so the two never z-fight / clip).
  const winFrame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.16), signMat);
  winFrame.position.set(-0.72, 1.45, 1.40);
  winFrame.castShadow = true;
  group.add(winFrame);
  const winGlass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.06), shopGlassMat);
  winGlass.position.set(-0.72, 1.45, 1.37);
  winGlass.castShadow = true;
  group.add(winGlass);

  // Flower box blooming under the window
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 0.34), signMat);
  box.position.set(-0.72, 0.55, 1.42);
  box.castShadow = true;
  group.add(box);
  for (let i = 0; i < 5; i++) {
    const fx = -0.72 + (i / 4 - 0.5) * 1.1;
    const stem = new THREE.Mesh(flowerStemGeo, flowerStemMat);
    stem.position.set(fx, 0.78, 1.44);
    group.add(stem);
    const bloom = new THREE.Mesh(flowerBloomGeo, flowerBloomMats[(i * 3 + 1) % flowerBloomMats.length]);
    bloom.position.set(fx, 0.91, 1.44);
    group.add(bloom);
  }

  // Door (right) with a brass knob
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.55, 0.12), shopDoorMat);
  door.position.set(0.95, 0.78, 1.31);
  door.castShadow = true;
  group.add(door);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8b95a, roughness: 0.4, metalness: 0.7 })
  );
  knob.position.set(1.28, 0.8, 1.38);
  group.add(knob);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  group.scale.set(2, 2, 2);   // twice as big
  scene.add(group);
  addKnockable(group, 3.4, { mode: 'wobble', fallTime: 0.6 });
}

// ===== Centre plaza fountain =====
const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb8b5ad, roughness: 0.85 });
const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x8f8c84, roughness: 0.9 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x7fc8e8, roughness: 0.25, transparent: true, opacity: 0.85 });
const waterJetMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.2, transparent: true, opacity: 0.7 });
const dropletGeo = new THREE.SphereGeometry(0.06, 6, 6);
const dropletMat = new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.15, transparent: true, opacity: 0.9 });

// A carved stone fountain: a big basin fed by a central jet, on a plaza disc.
// The jet pulses and little droplets splash and orbit, so the water always
// seems to be gently moving. It tips over (slowly — it's stone) when hit.
function makeFountain(scene, x, z, fountains) {
  const group = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.22, 20), stoneDarkMat);
  base.position.y = 0.11;
  base.receiveShadow = true;
  group.add(base);

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.1, 0.75, 18), stoneMat);
  basin.position.y = 0.6;
  basin.castShadow = true;
  group.add(basin);

  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.28, 2.28, 0.08, 18), waterMat);
  pool.position.y = 0.82;
  group.add(pool);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.55, 12), stoneMat);
  column.position.y = 1.6;
  column.castShadow = true;
  group.add(column);

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.68, 0.5, 12), stoneMat);
  upper.position.y = 2.2;
  upper.castShadow = true;
  group.add(upper);

  const upperPool = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 12), waterMat);
  upperPool.position.y = 2.4;
  group.add(upperPool);

  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.35, 8), waterJetMat);
  jet.position.y = 3.05;
  jet.castShadow = true;
  group.add(jet);

  const droplets = [];
  for (let i = 0; i < 10; i++) {
    const d = new THREE.Mesh(dropletGeo, dropletMat);
    d.position.set(0, 3.0, 0);
    group.add(d);
    droplets.push({
      mesh: d,
      phase: Math.random() * Math.PI * 2,
      speed: 1.2 + Math.random() * 0.9,
      spread: 0.55 + Math.random() * 0.85,
    });
  }

  group.position.set(x, 0, z);
  scene.add(group);
  addKnockable(group, 2.4, { fallTime: 0.9 });   // heavy — tips over slowly
  fountains.push({ jet, droplets, time: 0 });
}

// Gentle water animation: the jet pulses and little droplets splash & orbit.
function updateFountains(fountains, delta) {
  for (const f of fountains) {
    f.time += delta;
    const t = f.time;
    f.jet.scale.y = 1 + Math.sin(t * 2.4) * 0.08;
    f.jet.material.opacity = 0.55 + Math.sin(t * 3.1) * 0.15;
    for (const d of f.droplets) {
      const ph = t * d.speed + d.phase;
      d.mesh.position.y = 2.95 + Math.abs(Math.sin(ph)) * 0.95;
      const a = ph * 1.7;
      d.mesh.position.x = Math.sin(a) * d.spread;
      d.mesh.position.z = Math.cos(a) * d.spread;
    }
  }
}

// ===== Bronze & stone statues =====
const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x6e5a3c, roughness: 0.5, metalness: 0.5 });
const statueStoneMat = new THREE.MeshStandardMaterial({ color: 0xb8b5ad, roughness: 0.9 });

// A robed historical village figure on a stone pedestal, holding a little book.
function makeStatue(scene, x, z, rotY, material) {
  const group = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 1.15), statueStoneMat);
  plinth.position.y = 0.16;
  plinth.castShadow = true;
  group.add(plinth);
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.85), statueStoneMat);
  pedestal.position.y = 0.85;
  pedestal.castShadow = true;
  group.add(pedestal);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.0, 10), material);
  robe.position.y = 1.85;
  robe.castShadow = true;
  group.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), material);
  head.position.y = 2.45;
  head.castShadow = true;
  group.add(head);
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.06), material);
  book.position.set(0, 1.95, 0.28);
  book.rotation.x = -0.3;
  group.add(book);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  addKnockable(group, 0.9, { fallTime: 0.7 });
}

// Build the whimsical village charm: shops on the town-edge sidewalks, the
// centre-plaza fountain, and historical statues nestled among flowerbeds.
function addVillageCharm(scene, fountains) {
  // All four shops in a row on the grass at the town's north edge (NOT on the
  // sidewalks), facing the town centre. z=64 is out past the sidewalk ring
  // (>54) and clear of the fountain plaza (x ~20..40) and the park (x 49..75).
  const shopData = [
    { x: -68, z: 64, r: Math.PI, c: 0xf2d17c, rc: 0xc0563b },
    { x: -54, z: 64, r: Math.PI, c: 0x8fd0c8, rc: 0x5a6b78 },
    { x: -40, z: 64, r: Math.PI, c: 0xe8a0b4, rc: 0x8a4f63 },
    { x: -26, z: 64, r: Math.PI, c: 0xc9b8e8, rc: 0x3f6f5f },
  ];
  shopData.forEach((s) => makeShop(scene, s.x, s.z, s.r, s.c, s.rc));

  // Fountain + statues at the town's north edge, out on the grass and well
  // clear of the roads (the crossroads run the full length of town).
  makeFountain(scene, 30, 58, fountains);
  makeStatue(scene, 24, 58, 0.3, bronzeMat);
  makeFlowerBed(scene, 20.5, 58, 0);
  makeStatue(scene, 36, 58, -0.3, statueStoneMat);
  makeFlowerBed(scene, 39.5, 58, 0);
  makeFlowerBed(scene, 30, 65, 0);

  // A couple more in the park by the pond
  makeStatue(scene, 55, 69, -0.8, bronzeMat);
  makeFlowerBed(scene, 50.6, 69, 0);
  makeStatue(scene, 69, 55, 0.8, statueStoneMat);
  makeFlowerBed(scene, 69, 50.6, Math.PI / 2);
}

// ===== Build everything =====
export function addProps(scene) {
  const trafficLights = [];
  const fountains = [];
  addSurroundingTrees(scene);
  addRoadMarkings(scene);

  makeTrafficLight(scene, 13.5, 13.5, 'x', trafficLights);      // NE — governs E/W
  makeTrafficLight(scene, -13.5, 13.5, 'z', trafficLights);     // NW — governs N/S
  makeTrafficLight(scene, 13.5, -13.5, 'z', trafficLights);     // SE — governs N/S
  makeTrafficLight(scene, -13.5, -13.5, 'x', trafficLights);    // SW — governs E/W

  makeStopSign(scene, 12.8, 0, Math.PI / 2);
  makeStopSign(scene, -12.8, 0, -Math.PI / 2);
  makeStopSign(scene, 0, 12.8, 0);
  makeStopSign(scene, 0, -12.8, Math.PI);

  for (let x = -70; x <= 70; x += 14) {
    makeLampPost(scene, x, 17);
    makeLampPost(scene, x, -17);
  }
  for (let z = -70; z <= 70; z += 14) {
    makeLampPost(scene, 17, z);
    makeLampPost(scene, -17, z);
  }

  makeFireHydrant(scene, -60, -46);
  makeFireHydrant(scene, 8, -46);
  makeFireHydrant(scene, 50, -46);
  makeFireHydrant(scene, -60, 6);

  makeFenceLine(scene, 49, 49, 49, 75, 7);
  makeFenceLine(scene, 49, 75, 75, 75, 7);
  makeFenceLine(scene, 75, 75, 75, 49, 7);
  makeFenceLine(scene, 75, 49, 49, 49, 7);

  addPark(scene);
  addParkingLot(scene);
  addMarketStalls(scene);
  addVillageCharm(scene, fountains);
  addStreetFurniture(scene);

  return { trafficLights, fountains };
}

export { updateFountains };
