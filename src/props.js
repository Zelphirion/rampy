import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable, setKnockableWorldGroup } from './physics.js';
import {
  SHELL_X, SHELL_Z, SHELL_GRASS, SHELL_RIBS, SHELL_SPAN, SHELL_SQUASH,
  SHELL_RIBIAMP, SHELL_THICK, T_GRASS_HOLE, clamFanOutline, PARK_CLAM,
} from './clam.js';

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
const lampBulbMatDark = new THREE.MeshStandardMaterial({ color: 0xfff2c2, emissive: 0xffd98a, emissiveIntensity: 0 });

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
  // A 5 x 7 grid filling the park, skipping anything that would stand in the
  // pond or off the grass. The park is deliberately small now, so the field is
  // tighter and closer together than it used to be.
  let count = 0;
  for (let x = 16.2; x <= 27.8; x += 2.9) {
    for (let z = 46.2; z <= 61.8; z += 2.6) {
      const dx = x - 22;
      const dz = z - 54;
      if (dx * dx + dz * dz < 4.0 * 4.0) continue;   // over the pond
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
  const redMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 });

  // Thinner body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.12, 0.55, 8),
    redMat
  );
  body.position.y = 0.32;
  body.castShadow = true;
  group.add(body);

  // Bell-shaped head (hemisphere dome)
  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    redMat
  );
  bell.position.y = 0.60;
  bell.castShadow = true;
  group.add(bell);

  // Single large nozzle on the front
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.22, 8),
    redMat
  );
  nozzle.position.set(0, 0.38, 0.13);
  nozzle.rotation.x = Math.PI / 2;
  group.add(nozzle);

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

// Standing cone positions used by traffic collision detection.
// Each entry: { x, z, r } where r is the traffic collision radius.
export const standingCones = [];

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
  standingCones.push({ x, z, r: 2.2 });  // traffic collision radius
}

// ===== Pothole =====
// Position on the main east-west road, far east of the intersection.
export const POTHOLE = { x: -50, z: 8, radius: 3 };

// Park lake: the shallow blue pond in the town park (centre 22,54) behaves like
// the pothole - driving in rocks the car, dips it into the water and kicks up
// splashes. Slightly bigger than the pothole's pool (the pond's top rim is 3.2).
export const LAKE = { x: 22, z: 54, radius: 3.6 };

function makePothole(scene) {
  const { x, z, radius } = POTHOLE;

  // Dark hole surface flush with the road
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 });
  const hole = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), holeMat);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, 0.24, z);
  scene.add(hole);

  // Shadow underneath to suggest depth
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.85, 20),
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, 0.12, z);
  scene.add(shadow);

  // Broken asphalt chunks around the rim
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const r = radius * (0.85 + Math.random() * 0.4);
    const s = 0.3 + Math.random() * 0.6;
    const chunk = new THREE.Mesh(new THREE.BoxGeometry(s, 0.08, s * 0.7), chunkMat);
    chunk.position.set(x + Math.cos(a) * r, 0.22, z + Math.sin(a) * r);
    chunk.rotation.y = Math.random() * Math.PI;
    chunk.castShadow = true;
    scene.add(chunk);
  }
}

// Build a tight semicircle of 8 cones on the north side of the pothole
// (the side facing traffic), guiding drivers to swerve toward the centre.
function addPotholeCones(scene) {
  const { x, z, radius } = POTHOLE;
  const ringR = 5.5;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const angle = Math.PI + (i / (n - 1)) * Math.PI;   // π → 2π (west → east via north)
    const cx = x + ringR * Math.cos(angle);
    const cz = z + ringR * Math.sin(angle);
    makeStreetCone(scene, cx, cz);
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

// ===== Old Mine Shaft Entrance =====
// Open pit mine shaft with boulders around the mouth.
// The pit mouth opens toward -X, so the approach and the mine-spur road both
// run along the group's local X axis. Local +X points AWAY from the road, into
// the mountain.
// Returns { colliders } so main.js can block the car from driving through walls.
function makeMineShaftEntrance(scene) {
  // Build the mine in a group, then rotate so the local axis lines up with the
  // spur. Local coords: the drive-in lane runs along X, width along Z.
  // Rotation.y = -π/2 maps local +X → world +Z and local +Z → world -X. The
  // mouth sits at the group's local x = 0 line, and props that must stay off the
  // approach tarmac are placed at local x >= 0.5 (behind the mouth) or pushed
  // out onto the shoulders.
  const mineGroup = new THREE.Group();
  const _realScene = scene;
  scene = mineGroup;                 // redirect all scene.add() into the group
  const x = 0, z = 0;               // local centre (group is positioned later)
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.95 });
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x5c5550, roughness: 1 });
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 1 });

  // The old flat cave interior (dark floor plane, side walls, back ceiling,
  // back wall, crystals) was REMOVED — the descending-adit excavation now
  // carves its own floor, walls and ceiling through this area. Those flat
  // planes sat at the old tunnel level and made the car look like it was
  // sinking through water instead of driving down a slope.
  const tunnelLen = 12;     // how far back the cave extends
  const tunnelW = 5;        // interior width (z)
  const tunnelH = 4.5;      // interior height (y)
  const hw = tunnelW / 2;   // half-width
  const tx = x + 1;         // cave interior starts just behind the frame

  // --- Collision colliders for the tunnel walls (car can't drive through) ---
  // h=0 so buildingTopAt() doesn't mistake them for rooftops (which bypass collisions).
  // World-space colliders (after group rotation.y = -π/2 at position (-55, 0, 34)):
  //   local (lx,ly,lz) → world (-55-lz, ly, 34+lx)
  //   local halfX → world halfD,  local halfZ → world halfW
  const mineColliders = [
    { x: -55, z: 47, halfW: 3.0, halfD: 0.5, h: 0 },     // back wall
    { x: -60, z: 41, halfW: 1.25, halfD: 6.5, h: 0 },     // west dirt bank
    { x: -50, z: 41, halfW: 1.25, halfD: 6.5, h: 0 },     // east dirt bank
    // The excavation pit itself: blocks AI traffic/pedestrians (aiOnly) but
    // never the player car or the fire lizard, which can drive/walk over it.
    { x: -55, z: 38, halfW: 6, halfD: 6, h: 0, aiOnly: true },
  ];

  // (above-ground structures removed — open pit mine shaft)

  // --- Worn planks on the ground at the entrance ---
  // Kept on the shoulders and BEHIND the mouth line (local x >= 0.5). Local +X
  // maps to world +Z, so anything at negative local x sits out on the mine-spur
  // tarmac in the driver's sightline; the middle of the mouth is the drive-in
  // lane and the approach in front of it has to stay completely clear.
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8 + Math.random() * 0.8, 0.1, 0.5), plankMat);
    plank.position.set(0.5 + Math.random() * 2.0, 0.06 + (Math.random() - 0.5) * 0.04, (i % 2 ? 1 : -1) * (3.6 + Math.random() * 0.8));
    plank.rotation.y = (Math.random() - 0.5) * 0.3;
    scene.add(plank);
  }

  // --- Boulders scattered around the entrance (knockable — they scatter on impact) ---
  const boulderData = [
    [-3.5, -3.2, 1.1], [-3.8, 3.5, 0.9],
    [-2.0, -3.8, 0.7], [-1.5, 3.6, 0.8],
    [0.5, -3.3, 1.0], [0.8, 3.4, 0.75],
    [-4.2, -1.0, 0.6], [-4.0, 1.2, 0.55],
    [-3.0, -4.0, 0.5], [-2.8, 4.1, 0.6],
    [2.5, -3.0, 0.85], [2.2, 3.1, 0.7],
    [3.8, -2.0, 0.9], [4.0, 1.8, 0.8],
    [1.0, 3.9, 0.65], [1.2, -3.7, 0.6],
    // top of frame boulders
    [-2.5, -1.0, 0.5], [-2.5, 0.8, 0.45],
    [3.0, 0.5, 0.55],
  ];
  boulderData.forEach(([bx, bz, r]) => {
    // The drive-in lane runs along local X (world Z) through the middle of the
    // mouth, so two things are kept clear: the |bz| band of the lane itself, and
    // everything in FRONT of the mouth (bx < 0.5), which is the mine-spur
    // tarmac the player is looking down as they approach. The mouth has to stay
    // legible from the road and wide enough to drive a car down.
    if (Math.abs(bz) < 3.2 || bx < 0.5) return;
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), boulderMat);
    b.position.y = r * 0.6;
    b.scale.y = 0.65 + Math.random() * 0.2;
    b.castShadow = true;
    g.add(b);
    g.position.set(bx, 0, bz);
    g.rotation.y = Math.random() * Math.PI;
    scene.add(g);
    addKnockable(g, r + 0.3, {
      mode: 'slide',
      fallTime: 0.35 + Math.random() * 0.2,
      slideDistance: 1.5 + Math.random() * 1.5,
      shovePower: 10,
      shoveSpinPower: 2.5,
    });
  });

  // --- Small rocks/gravel on the ground around the entrance (knockable) ---
  // Ringed around the mouth rather than scattered through it, for the same
  // reason the boulders are: the middle of the frame is the way in.
  const gravelMat = new THREE.MeshStandardMaterial({ color: 0x8a8078, roughness: 1 });
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 2.5;
    const gz = Math.sin(angle) * dist;
    const gx = Math.cos(angle) * dist;
    // Same rule as the boulders: ringed around the mouth rather than through
    // it, and nothing out on the spur tarmac in front of the mouth.
    if (Math.abs(gz) < 3.4 || gx < 0.5) continue;
    const gr = 0.12 + Math.random() * 0.18;
    const gg = new THREE.Group();
    const g = new THREE.Mesh(new THREE.SphereGeometry(gr, 5, 4), gravelMat);
    g.position.y = gr * 0.4;
    g.scale.y = 0.5;
    gg.add(g);
    gg.position.set(gx, 0, gz);
    scene.add(gg);
    addKnockable(gg, gr + 0.2, {
      mode: 'slide',
      fallTime: 0.25 + Math.random() * 0.15,
      slideDistance: 0.8 + Math.random() * 0.8,
      shovePower: 6,
      shoveSpinPower: 1.5,
    });
  }

  // --- Broken board walls lining the sides of the ceiling ---
  // Weathered boards standing in the grass at the edges of the excavation,
  // leaning inward so each board's base sits on the grass and its top leans
  // against the edge of the wooden ceiling (never skewered through it).
  // Gaps and missing boards let the rock show through; the mouth (local x = 0,
  // which opens to the road at negative local x) is left clear.
  // Ceiling height (world y) above the mine bed at local x (tunnel axis).
  const ceilHAt = (lx) => {
    const wz = 34 + lx;
    const prof = MINE_ADIT_PROFILE;
    let drop;
    if (wz <= prof[0][0]) drop = prof[0][1];
    else if (wz >= prof[prof.length - 1][0]) drop = prof[prof.length - 1][1];
    else {
      for (let i = 1; i < prof.length; i++) {
        if (wz <= prof[i][0]) {
          const za = prof[i - 1][0], zb = prof[i][0];
          const ya = prof[i - 1][1], yb = prof[i][1];
          drop = ya + (yb - ya) * (wz - za) / (zb - za);
          break;
        }
      }
    }
    return drop + 4.5;
  };
  for (let side = -1; side <= 1; side += 2) {
    for (let bx = 0.5; bx < 12; bx += 0.65 + Math.random() * 0.55) {
      if (Math.random() < 0.2) continue;   // broken gap in the wall
      const lean = 0.4 + Math.random() * 0.15;   // lean inward against the ceiling edge
      const ceilY = ceilHAt(bx);
      const bh = ceilY / Math.cos(lean) + 0.05;   // tall enough to just touch the ceiling
      const bd = 0.8 + Math.random() * 1.4;   // varied lengths along the wall
      const bz = side * (6.2 + Math.random() * 0.6);   // on the grass, outside the hole
      const board = new THREE.Mesh(new THREE.BoxGeometry(bd, bh, 0.12), plankMat);
      board.position.set(bx, bh / 2 - 0.1, bz);
      board.rotation.x = -side * lean;
      board.rotation.z = (Math.random() - 0.5) * 0.12;
      board.castShadow = true;
      scene.add(board);
      // Occasionally a fallen board lying at the base of the wall
      if (Math.random() < 0.25) {
        const fallen = new THREE.Mesh(new THREE.BoxGeometry(1.2 + Math.random() * 0.8, 0.12, 0.1), plankMat);
        fallen.position.set(bx + (Math.random() - 0.5) * 0.5, 0.08, bz + side * 0.4);
        fallen.rotation.y = Math.random() * Math.PI;
        scene.add(fallen);
      }
    }
  }

  // --- Rickety gate archway in front of the entrance (open — car drives through) ---
  // Just behind the mouth line, not out on the spur: local x is world z, so a
  // negative value would plant a 4.6-high post in the middle of the tarmac the
  // player is driving down. It still frames the hole from the road.
  const gateX = 0.5;       // level with the mouth, framing it from the roadside
  const gateHalf = 2.9;    // half-width of the opening
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.6, 0.35), timberMat);
    post.position.set(gateX, 2.3, z + side * gateHalf);
    post.rotation.z = side * 0.06;   // slight lean
    post.castShadow = true;
    scene.add(post);
  }
  const gateLintel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, gateHalf * 2 + 0.8), timberMat);
  gateLintel.position.set(gateX, 4.7, z);
  gateLintel.rotation.z = 0.05;      // slightly crooked
  gateLintel.castShadow = true;
  scene.add(gateLintel);
  for (const side of [-1, 1]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.4, 0.15), timberMat);
    brace.position.set(gateX + side * 0.6, 2.2, z + side * gateHalf * 0.7);
    brace.rotation.z = side * 0.5;
    brace.castShadow = true;
    scene.add(brace);
  }

  // --- Pickaxe and mining tools scattered near the entrance ---
  const toolMetalMat = new THREE.MeshStandardMaterial({ color: 0x6d757a, roughness: 0.6, metalness: 0.7 });
  // Pickaxe leaning against a boulder
  const pickGroup = new THREE.Group();
  const pickHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.3, 6), timberMat);
  pickHandle.position.y = 0.65;
  pickHandle.rotation.z = 0.5;
  pickGroup.add(pickHandle);
  const pickHead = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI), toolMetalMat);
  pickHead.position.set(0.55, 1.15, 0);
  pickHead.rotation.z = 0.5;
  pickGroup.add(pickHead);
  pickGroup.position.set(1.6, 0, -4.2);
  pickGroup.rotation.y = 0.6;
  scene.add(pickGroup);
  addKnockable(pickGroup, 0.5, { mode: 'slide', fallTime: 0.3, slideDistance: 1.0, shovePower: 6, shoveSpinPower: 1.5 });

  // Shovel lying on the ground
  const shovelGroup = new THREE.Group();
  const shovelHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), timberMat);
  shovelHandle.rotation.z = Math.PI / 2;
  shovelHandle.position.set(0, 0.05, 0);
  shovelGroup.add(shovelHandle);
  const shovelBlade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.25), toolMetalMat);
  shovelBlade.position.set(0.65, 0.05, 0);
  shovelGroup.add(shovelBlade);
  shovelGroup.position.set(1.4, 0, 4.4);
  shovelGroup.rotation.y = -0.4;
  scene.add(shovelGroup);
  addKnockable(shovelGroup, 0.5, { mode: 'slide', fallTime: 0.3, slideDistance: 1.0, shovePower: 6, shoveSpinPower: 1.5 });

  // A couple of loose timber scraps
  for (let i = 0; i < 3; i++) {
    const scrap = new THREE.Mesh(new THREE.BoxGeometry(1.2 + Math.random() * 0.8, 0.08, 0.25), plankMat);
    scrap.position.set(0.6 + Math.random() * 2, 0.05, (i % 2 ? 1 : -1) * (3.8 + Math.random() * 1.4));
    scrap.rotation.y = Math.random() * Math.PI;
    scene.add(scrap);
  }

  // --- Position & orient the mine group ---
  // Rotate π/2 around Y so the tunnel faces north (+Z = top of minimap).
  mineGroup.position.set(-55, 0, 34);
  mineGroup.rotation.y = -Math.PI / 2;  // face south (-Z = bottom of minimap)
  _realScene.add(mineGroup);
  // Update the world matrix so the knockable system can convert directions
  // from world space to the group's local space (ghost-rock fix).
  mineGroup.updateMatrixWorld(true);
  setKnockableWorldGroup(mineGroup);

  return { colliders: mineColliders };
}

// ===== Street Furniture Placement =====
function addStreetFurniture(scene) {
  // Pothole on the main road with cones ringed around it
  makePothole(scene);
  addPotholeCones(scene);

  // Parking meters — coins clatter everywhere on impact. Every one of these
  // sits on a verge, a clear unit or two outside the tarmac in ROADS.
  const meterPos = [
    [-47, -32], [-47, -14], [14, -14], [44, 14],
    [-46, 14], [14, 41], [46, 41], [66, 41],
  ];
  meterPos.forEach(([x, z]) => makeParkingMeter(scene, x, z, Math.atan2(-z, -x)));

  // Trash cans — beside the market shops and select buildings, not along roads
  const trashPos = [
    // beside each shop (north side, behind the shopfronts at z=63)
    [-51.5, 62], [-40.5, 62], [-29.5, 62], [-18.5, 62],
    // beside select buildings (not all)
    [-70, -27], [20, -55],   // flats and substation
    [33, -33],                // the south-east block
    [-27, 16],  [45, 16],    // the square and the north verge
  ];
  trashPos.forEach(([x, z]) => makeTrashCan(scene, x, z));

  // Soda vending machines — dozens of cans scatter on impact
  const vendingPos = [
    [46, 14, 0], [-28, 14, Math.PI],
    [31.5, 50, Math.PI / 2], [14, -34, 0],
    [-14, -14, Math.PI / 2], [66, 41, Math.PI / 2],
  ];
  vendingPos.forEach(([x, z, r]) => makeSodaVendingMachine(scene, x, z, r));

  // Phone booths at a few corners
  const phonePos = [
    [-27, 20, 0], [-14, 36, 0],
    [31.5, 64, 0], [45, 64, 0], [66, 66, 0],
  ];
  phonePos.forEach(([x, z, r]) => makePhoneBooth(scene, x, z, r));
}

// ===== Fence (park border) =====
const fenceMat = new THREE.MeshStandardMaterial({ color: 0x9a8a72, roughness: 0.9 });

function makeFenceLine(scene, x1, z1, x2, z2, sections = 12) {
  // The fence comes apart in MANY little sections — each one is its own
  // knockable (two posts + a short rail), so bumping the park border knocks
  // pieces every which way and the whole perimeter visibly crumbles into
  // scattered fencing rather than sliding away as one rigid 26-unit wall.
  //
  // Each section's GROUP is positioned at THAT SECTION's midpoint, with the
  // posts/rail in local coords — so the knockable's origin rides the fence
  // itself instead of the world origin (which would scatter every section the
  // moment anything bumped near the city centre).
  const len = Math.hypot(x2 - x1, z2 - z1);
  const rotY = Math.atan2(z2 - z1, x2 - x1);
  const segLen = len / sections;
  for (let i = 0; i < sections; i++) {
    const t0 = i / sections;
    const t1 = (i + 1) / sections;
    const cx = x1 + (x2 - x1) * (t0 + t1) / 2;
    const cz = z1 + (z2 - z1) * (t0 + t1) / 2;
    const g = new THREE.Group();
    for (const t of [t0, t1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), fenceMat);
      post.position.set(x1 + (x2 - x1) * t - cx, 0.45, z1 + (z2 - z1) * t - cz);
      post.castShadow = true;
      g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.09, 0.07), fenceMat);
    rail.position.set(0, 0.75, 0);
    rail.rotation.y = rotY;
    rail.castShadow = true;
    g.add(rail);
    g.position.set(cx, 0, cz);
    scene.add(g);
    addKnockable(g, segLen * 0.5 + 0.28, {
      mode: 'slide',
      slideDistance: 0.9 + Math.random() * 0.9,
      fallTime: 0.45,
      shovePower: 6,
      shoveSpinPower: 2.2,
    });
  }
}

// ===== Park (north of the market, beside the library) =====
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

// The park is a small square of grass, x 14..30 / z 44..64, with the library
// hard against its east edge and park-spine along the far side. The library
// fronts west onto the grass, so the east fence is left off so the two read as
// one place.
function addPark(scene) {
  // The lawn is an extruded slab with the scallop's own silhouette punched out
  // of it, so the shell's wavy margin finishes its run inside the turf instead
  // of sitting on top of it. The hole is cut to the FAN, not to a circle: the
  // valve only spans ~200 degrees, so a round hole would open onto bare earth
  // behind the hinge.
  // Park lawn: x 14..30, z 44..64, expressed in the shape's frame for a mesh
  // sitting at (SHELL_X, 0, SHELL_Z) rotated -90 deg about X - so sy runs from
  // (SHELL_Z - 64) to (SHELL_Z - 44).
  const lawnShape = new THREE.Shape();
  lawnShape.moveTo(14 - SHELL_X, SHELL_Z - 64);
  lawnShape.lineTo(30 - SHELL_X, SHELL_Z - 64);
  lawnShape.lineTo(30 - SHELL_X, SHELL_Z - 44);
  lawnShape.lineTo(14 - SHELL_X, SHELL_Z - 44);
  lawnShape.closePath();
  const pit = new THREE.Path();
  const pitPts = clamFanOutline(T_GRASS_HOLE, SHELL_X, SHELL_Z);
  pitPts.forEach(([px, py], i) => (i ? pit.lineTo(px, py) : pit.moveTo(px, py)));
  pit.closePath();
  lawnShape.holes.push(pit);

  const park = new THREE.Mesh(
    new THREE.ExtrudeGeometry(lawnShape, { depth: SHELL_GRASS, bevelEnabled: false }),
    grassMaterial
  );
  // Rotating -90 deg about X stands the shape up and turns its extrusion into
  // world +Y, so the slab ends up spanning y 0..SHELL_GRASS with the hole's
  // inner wall showing as a cut face.
  park.rotation.x = -Math.PI / 2;
  park.position.set(SHELL_X, 0, SHELL_Z);
  park.receiveShadow = true;
  scene.add(park);

  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.6, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x2f6fae, roughness: 0.35 })
  );
  pond.position.set(22, 0.16, 54);
  pond.receiveShadow = true;
  scene.add(pond);

  [[15,45],[15,63],[29,45],[29,63],[22,45],[22,63],[15,54],[29,54]].forEach(([x, z]) => makeTree(scene, x, z));
  // Park benches around the perimeter - facing inward
  makeBench(scene, 16, 60, 0);
  makeBench(scene, 28, 60, Math.PI);
  makeBench(scene, 16, 48, Math.PI);
  makeBench(scene, 28, 48, 0);
  makeBench(scene, 22, 62.5, 0);
  makeBench(scene, 22, 45.5, Math.PI);
  // The bench at (22,62.5) sits a stride clear of the shell's pit lip.
  return makeClamShell(scene, PARK_CLAM);
}

// Add a giant open scallop (pecten) shell near pond - like Botticelli's Birth of Venus
//
// A scallop is a ribbed fan hinged at its umbo - the pointed "nose" at the base
// of the fan - and the two valves swing apart about that hinge. Each valve is a
// patch of a surface of revolution (the polar sweep runs umbo -> margin) cut to
// a ~200 degree fan, then corrugated by SHELL_RIBS flutes that radiate out of
// the hinge and deepen toward the wavy edge, so the ribs are strongest exactly
// where a pecten's are and vanish at the solid hinge. Both valves get real
// thickness and a capped rim: a single sheet reads as a shell but goes
// invisible edge-on, which is what made the old lip vanish from low angles.
//
// The valve is now squashed in Y (cfg.flat) and the lower one is squashed hard,
// so instead of two hemispheres hinged on the lawn it is a shallow dish sunk
// into the park with a tall fan leaning back behind it. Every dimension and the
// ground's idea of where the floor is come out of clam.js, because the turf has
// to be cut along this exact silhouette.

// Mid-surface of one valve. t: 0 at the umbo -> 1 at the margin.
// a: angle across the fan, -SHELL_SPAN..+SHELL_SPAN.
// cup: +1 = a bowl whose cavity faces +Y, -1 = a dome (the upper valve).
// flat: Y squash. The two valves carry different values, so the shell can be a
// shallow dish at the bottom and a full sweep on top.
function shellPoint(t, a, cfg, out) {
  const phi = t * Math.PI * 0.5;
  const flute = 0.5 * (1 + Math.cos((a * SHELL_RIBS * Math.PI) / SHELL_SPAN));
  const sp = Math.sin(phi) * (1 + cfg.ribAmp * flute);
  out[0] = cfg.size * sp * Math.sin(a);
  out[1] = cfg.size * cfg.cup * (1 - Math.cos(phi)) * cfg.flat;
  out[2] = cfg.size * sp * Math.cos(a) * SHELL_SQUASH;
  return out;
}

function shellNormal(t, a, cfg, out) {
  const e = 0.004;
  const p0 = shellPoint(Math.max(0, t - e), a, cfg, [0, 0, 0]);
  const p1 = shellPoint(Math.min(1, t + e), a, cfg, [0, 0, 0]);
  // At the umbo every angle collapses onto one point, so the da tangent is
  // zero there and the cross product would come back as a null vector. Sample
  // it just inside the pole instead; the limit is the same normal everywhere.
  const tc = t < 0.05 ? 0.05 : t;
  const a0 = shellPoint(tc, Math.max(-SHELL_SPAN, a - e), cfg, [0, 0, 0]);
  const a1 = shellPoint(tc, Math.min(SHELL_SPAN, a + e), cfg, [0, 0, 0]);
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const vx = a1[0] - a0[0], vy = a1[1] - a0[1], vz = a1[2] - a0[2];
  const nx = vy * uz - vz * uy;
  const ny = vz * ux - vx * uz;
  const nz = vx * uy - vy * ux;
  const len = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / len;
  out[1] = ny / len;
  out[2] = nz / len;
  return out;
}

function shellValveGeometry(cfg) {
  const segT = 20;
  const segA = 120;
  const rowLen = segA + 1;
  const perLayer = (segT + 1) * rowLen;
  const half = cfg.thickness * 0.5;
  const pos = [];
  const nrm = [];
  const col = [];
  const idx = [];
  const p = [0, 0, 0];
  const n = [0, 0, 0];
  const inside = new THREE.Color(0xfff4e6);   // pearly interior
  const outside = new THREE.Color(0xe4c193);  // tan exterior
  const edge = new THREE.Color(0xf3e0b6);     // the cut rim
  // The hinge is solid, so the two faces meet at the umbo instead of leaving a
  // slot there for the ground to show through.
  const offsetAt = (t) => half * Math.min(1, t / 0.14);
  // Which layer faces the cavity flips with the sign of `cup` (a bowl and a
  // dome curve opposite ways about the same pole), so don't hard-code a layer
  // index: the cavity side is the one the surface turns away from, which is +n
  // for a dome and -n for a bowl.
  const innerLayer = cfg.cup > 0 ? 1 : 0;

  for (let layer = 0; layer < 2; layer++) {
    const sgn = layer === 0 ? 1 : -1;
    const tint = layer === innerLayer ? inside : outside;
    for (let i = 0; i <= segT; i++) {
      const t = i / segT;
      const d = offsetAt(t) * sgn;
      for (let j = 0; j <= segA; j++) {
        const a = (j / segA) * 2 * SHELL_SPAN - SHELL_SPAN;
        shellPoint(t, a, cfg, p);
        shellNormal(t, a, cfg, n);
        pos.push(p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d);
        nrm.push(n[0] * sgn, n[1] * sgn, n[2] * sgn);
        col.push(tint.r, tint.g, tint.b);
      }
    }
    const base = layer * perLayer;
    for (let i = 0; i < segT; i++) {
      for (let j = 0; j < segA; j++) {
        const v0 = base + i * rowLen + j;
        idx.push(v0, v0 + 1, v0 + rowLen + 1, v0, v0 + rowLen + 1, v0 + rowLen);
      }
    }
  }

  // Walk the patch border and bridge the two faces with a rim strip. Without it
  // the margin is an open slot and the valve thins to nothing edge-on.
  const rimBase = pos.length / 3;
  const loop = [];
  for (let i = 0; i <= segT; i++) loop.push([i, 0, 0]);
  for (let j = 1; j <= segA; j++) loop.push([segT, j, 1]);
  for (let i = segT - 1; i >= 0; i--) loop.push([i, segA, 0]);
  for (let j = segA - 1; j >= 1; j--) loop.push([0, j, 0]);

  const q = [0, 0, 0];
  const e = 0.01;
  for (const [i, j, along] of loop) {
    const t = i / segT;
    const a = (j / segA) * 2 * SHELL_SPAN - SHELL_SPAN;
    shellPoint(t, a, cfg, p);
    shellNormal(t, a, cfg, n);
    // Tangent along the rim, so the cut face normal is perpendicular to both
    // the rim and the valve surface.
    let tx, ty, tz;
    if (along) {
      shellPoint(t, Math.min(SHELL_SPAN, a + e), cfg, q);
      const q0 = shellPoint(t, Math.max(-SHELL_SPAN, a - e), cfg, [0, 0, 0]);
      tx = q[0] - q0[0];
      ty = q[1] - q0[1];
      tz = q[2] - q0[2];
    } else {
      shellPoint(Math.min(1, t + e), a, cfg, q);
      const q0 = shellPoint(Math.max(0, t - e), a, cfg, [0, 0, 0]);
      tx = q[0] - q0[0];
      ty = q[1] - q0[1];
      tz = q[2] - q0[2];
    }
    let rx = ty * n[2] - tz * n[1];
    let ry = tz * n[0] - tx * n[2];
    let rz = tx * n[1] - ty * n[0];
    const len = Math.hypot(rx, ry, rz) || 1;
    rx /= len;
    ry /= len;
    rz /= len;
    const d = offsetAt(t);
    pos.push(p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d);
    pos.push(p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d);
    nrm.push(rx, ry, rz, rx, ry, rz);
    col.push(edge.r, edge.g, edge.b, edge.r, edge.g, edge.b);
  }
  for (let k = 0; k < loop.length; k++) {
    const k2 = (k + 1) % loop.length;
    const v0 = rimBase + k * 2;
    const v2 = rimBase + k2 * 2;
    idx.push(v0, v0 + 1, v2 + 1, v0, v2 + 1, v2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// Builds the scallop for a `createClamSite` from clam.js. The site carries the
// position, the hinge height and the ground height it is bedded into, so the
// same builder produces the park shell and the beach shell and both are
// guaranteed to line up with the hole cut in their ground.
export function makeClamShell(scene, site = PARK_CLAM) {
  const { x, z, umboY, surfaceY, open, shut } = site;
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6, metalness: 0.04,
    side: THREE.DoubleSide,
  });

  // park-spine runs along the park's east side, so face the opening that way:
  // the fan opens east and you drive straight west into the bowl off the road.
  const yaw = new THREE.Group();
  yaw.rotation.y = site.yaw;
  g.add(yaw);

  // The lower valve is squashed to a shallow dish and the umbo is dropped half
  // a unit under the lawn, so the dish sits down inside its own hole in the
  // turf. The upper valve keeps nearly its full sweep and leans away to the
  // west, which is the classic open-scallop silhouette and leaves the whole
  // mouth of the bowl facing the road.
  const lowerCfg = { size: site.size, flat: site.flat, ribAmp: site.ribAmp, thickness: SHELL_THICK, cup: 1 };
  const upperCfg = { size: site.upperSize, flat: site.upperFlat, ribAmp: site.ribAmp, thickness: SHELL_THICK, cup: -1 };
  const lower = new THREE.Mesh(shellValveGeometry(lowerCfg), shellMat);
  const upper = new THREE.Mesh(shellValveGeometry(upperCfg), shellMat);
  // Both valves hinge on the umbo, so the open/close is a single rotation of
  // the upper valve about X.
  const swing = new THREE.Group();
  swing.rotation.x = open;
  swing.add(upper);
  yaw.add(lower, swing);

  const hinge = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), shellMat);
  hinge.scale.set(1, 0.7, 1.3);
  yaw.add(hinge);

  for (const mesh of [lower, upper, hinge]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  scene.add(g);
  // Seat the umbo, not the bounding box: the lawn hole in addPark() is cut to
  // the lower valve's own silhouette at T_GRASS_HOLE, so the shell has to hang
  // off the same datum the turf does or the dish floats or sinks.
  g.position.set(x, umboY, z);

  // ===== Pearls =====
  // Ringed around the shell on the lawn rather than sitting in the bowl - the
  // bowl is the mouth of the portal now and has to stay clear to drive into.
  const pearlMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.1, metalness: 0.05,
    clearcoat: 1, clearcoatRoughness: 0.12,
    iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [180, 760],
    emissive: 0x5c2f5e, emissiveIntensity: 0.3,
  });
  const pearlSpots = [
    [4.4, -1.1], [4.2, 1.9], [1.6, 3.7], [-2.4, 2.9], [-4.1, 0.3], [-3.2, -2.1],
  ];
  const pearls = pearlSpots.map(([dx, dz], i) => {
    const r = 0.17 + ((i * 37) % 11) * 0.01;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), pearlMat);
    // Seat each pearl on whatever the ground under it is doing - the park's lawn
    // is flat, the beach's dunes are not.
    const gy = (site.groundYAt || (() => surfaceY))(x + dx, z + dz);
    m.position.set(x + dx, gy + r * 0.82, z + dz);
    m.castShadow = true;
    scene.add(m);
    return { mesh: m, base: m.position.y, phase: i * 1.04, spin: 0.24 + (i % 3) * 0.09 };
  });

  let clock = 0;
  const shell = {
    group: g,
    site,
    x, z,
    angle: open,
    target: open,
    closing: false,
    shut: false,
    // Snap shut. Called by main.js the moment the car is down in the bowl.
    close() {
      if (this.closing || this.shut) return;
      this.closing = true;
      this.target = shut;
    },
    // Back to the open pose, for arriving back from the beach.
    reopen() {
      this.closing = false;
      this.shut = false;
      this.angle = open;
      this.target = open;
      swing.rotation.x = open;
    },
    // Returns true on the one frame the valves finish meeting.
    update(dt) {
      clock += dt;
      if (this.angle !== this.target) {
        const d = this.target - this.angle;
        const step = Math.sign(d) * Math.min(Math.abs(d), 1.52 * dt);
        this.angle += step;
        swing.rotation.x = this.angle;
      }
      for (const p of pearls) {
        p.mesh.position.y = p.base + Math.sin(clock * 1.25 + p.phase) * 0.11;
        p.mesh.rotation.y += p.spin * dt;
      }
      // The pearls light up as the valves come together.
      const near = Math.abs(this.angle - shut) / (shut - open);
      pearlMat.emissiveIntensity = 0.3 + near * 1.5;
      if (!this.shut && this.closing && this.angle >= shut) {
        this.shut = true;
        return true;
      }
      return false;
    },
  };

  if (typeof window !== 'undefined') {
    // Several shells can be live at once (the park's and the beach's), so keep a
    // list rather than letting the last one built silently steal the handle.
    window.__CLAM_SHELLS = (window.__CLAM_SHELLS || []).concat(shell);
    if (!window.__CLAM_SHELL) window.__CLAM_SHELL = shell;
  }
  return shell;
}

// ===== Parking lot (southwest) =====
// The one shared car park in town: the block between the residential street and
// the west edge, which the layout reserves as a lot rather than more frontage.
// It is deliberately a single wide apron off one throat, not a ribbon per
// building - a row of near-identical private drives off the same street reads as
// four lanes of a car park rather than as front gardens, and it is what makes a
// block look like it was paved by machine.
function addParkingLot(scene) {
  const lot = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.16, 20),
    new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 1 })
  );
  lot.position.set(-58, 0.08, -61);
  lot.receiveShadow = true;
  scene.add(lot);

  // The throat: the lot's north edge is z -51 and the residential street's south
  // kerb is z -48, so without this 3-unit apron the car park is an island you
  // cannot drive onto. 10 wide, so it reads as a single entrance rather than a
  // kerb full of separate ways in.
  const throat = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.16, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 1 })
  );
  throat.position.set(-58, 0.08, -49);
  throat.receiveShadow = true;
  scene.add(throat);

  const lotLineMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.8 });
  for (let i = -2; i <= 2; i++) {
    for (const z of [-63.5, -58.5]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 4), lotLineMat);
      line.position.set(-58 + i * 5, 0.16, z);
      line.receiveShadow = true;
      scene.add(line);
    }
  }
  // Bay noses facing the throat, so the stalls read as parking either side of the
  // aisle rather than as loose stripes.
  for (let i = -2; i <= 2; i++) {
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 4), lotLineMat);
    nose.position.set(-58 + i * 5, 0.16, -55.5);
    nose.receiveShadow = true;
    scene.add(nose);
  }
}

// ===== Market stalls (little fruit stands on the shops-row sidewalk) =====
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

// Seven fruit stands lined up along the kerb of market-row, on the ROAD side of
// the shops' sidewalk. Keeping them off the sidewalk is the whole point: the
// stalls used to sit directly in front of the shopfronts and hid them, so the
// row read as market stalls with shops behind rather than as shops fronting the
// street. Now you drive up, the stalls are at the kerb, and the shop doors face
// you over the sidewalk. The row stops at x = -18 because arterial-ns owns
// everything east of x = -13.
function addMarketStalls(scene) {
  const stalls = [
    [-51, 55.4, Math.PI],
    [-45.5, 55.4, Math.PI],
    [-40, 55.4, Math.PI],
    [-34.5, 55.4, Math.PI],
    [-29, 55.4, Math.PI],
    [-23.5, 55.4, Math.PI],
    [-18, 55.4, Math.PI],
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
  // The fountain rocks on its base and springs back upright, exactly like the
  // little shops. It is the centrepiece of the square: a four-tonne basin that
  // a car could knock flat was never a good idea, and toppling it broke the
  // water jet and the droplet orbit for good. A slow, low, heavily damped
  // wobble reads as "solid, heavy, immovable" rather than "bouncy".
  addKnockable(group, 2.4, {
    mode: 'wobble',
    fallTime: 0.6,
    wobbleAmp: 0.12,
    wobbleFreq: 7,
    wobbleDamping: 6,
  });
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

// Twinkle the mine-shaft gems: each gem shimmers on its own phase/speed.
// Cubing the sine makes the flashes brief and bright — like facets catching
// the light — and a tiny scale pulse adds life without moving the body.
function updateMineGems(gems, delta) {
  for (const g of gems) {
    g.time += delta;
    const t = g.time * g.speed + g.phase;
    const sparkle = Math.pow(Math.max(0, Math.sin(t)), 3);
    g.mesh.material.emissiveIntensity = g.base * (0.55 + 0.75 * sparkle);
    const pulse = 1 + 0.05 * Math.sin(t * 1.7);
    g.mesh.scale.copy(g.baseScale).multiplyScalar(pulse);
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

// Build the whimsical village charm: the market row of shops on its sidewalk
// north of market-row, the town-square fountain between the two arterials, and
// historical statues nestled among flowerbeds.
function addVillageCharm(scene, fountains) {
  // The market row. The shops sit on the grass north of their sidewalk, facing
  // SOUTH over the sidewalk and the stalls and on to market-row, so the whole
  // row fronts the street. The row is cut short at x = -16 because arterial-ns
  // takes everything east of x = -13.
  const shopData = [
    { x: -49, z: 63, r: Math.PI, c: 0xf2d17c, rc: 0xc0563b },
    { x: -38, z: 63, r: Math.PI, c: 0x8fd0c8, rc: 0x5a6b78 },
    { x: -27, z: 63, r: Math.PI, c: 0xe8a0b4, rc: 0x8a4f63 },
    { x: -16, z: 63, r: Math.PI, c: 0xc9b8e8, rc: 0x3f6f5f },
  ];
  shopData.forEach((s) => makeShop(scene, s.x, s.z, s.r, s.c, s.rc));

  // Sidewalk in front of the shops, between them and the stalls at the kerb.
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb0a899, roughness: 0.9 });
  const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 4), sidewalkMat);
  sidewalk.position.set(-33, 0.07, 59.2);
  sidewalk.receiveShadow = true;
  scene.add(sidewalk);

  // Fountain + statues on the town square: the block between west-spine and
  // arterial-ns, set back from the main drag behind the bodega, so you meet the
  // shopfront first and the fountain opens out behind it.
  makeFountain(scene, -22, 32, fountains);
  makeStatue(scene, -25, 32, 0.3, bronzeMat);
  makeFlowerBed(scene, -27.5, 32, 0);
  makeStatue(scene, -19, 32, -0.3, statueStoneMat);
  makeFlowerBed(scene, -16.5, 32, 0);
  makeFlowerBed(scene, -22, 36, 0);

  // A couple more in the park, clear of the pond and the benches
  makeStatue(scene, 17.5, 62, -0.8, bronzeMat);
  makeFlowerBed(scene, 15, 62, 0);
  makeStatue(scene, 26.5, 46, 0.8, statueStoneMat);
  makeFlowerBed(scene, 26.5, 44, Math.PI / 2);
}

// ===== Build everything =====
export function addProps(scene) {
  const trafficLights = [];
  const fountains = [];
  addSurroundingTrees(scene);
  // Road markings are NOT drawn here. The centre lines and kerb lines belong to
  // cityRoads.js, which lays them per road from the ROADS table so they follow
  // the real carriageway and skip junctions. The old addRoadMarkings() overlay
  // painted its own second set straight down x=0/z=0 and along +/-11.5, which is
  // what made the arterials look double-striped: two centre-line dash runs and
  // two pairs of edge lines, half a unit apart. Recolouring it white only made
  // the duplicate white as well; it has to go.

  makeTrafficLight(scene, 13.5, 13.5, 'x', trafficLights);      // NE — governs E/W
  makeTrafficLight(scene, -13.5, 13.5, 'z', trafficLights);     // NW — governs N/S
  makeTrafficLight(scene, 13.5, -13.5, 'z', trafficLights);     // SE — governs N/S
  makeTrafficLight(scene, -13.5, -13.5, 'x', trafficLights);    // SW — governs E/W

  makeStopSign(scene, 12.8, 0, Math.PI / 2);
  makeStopSign(scene, -12.8, 0, -Math.PI / 2);
  makeStopSign(scene, 0, 12.8, 0);
  makeStopSign(scene, 0, -12.8, Math.PI);

  // The lamp-post rows. The x = -17 row runs along the front of the two suburban
  // houses, and two of its posts stood square in the middle of a garage mouth:
  // the brown-roofed house's OPEN BAY — the way into the house — at z -70, and the
  // grey-roofed house's shut roller door at z -42. Nothing mechanical was wrong (a
  // lamp post is knockable, not a collider, so it never blocked the trigger), but
  // a streetlight planted in the driving line of a garage reads as a mistake.
  //
  // So the row SKIPS the two house frontages, and each skipped post is replaced on
  // the grass verge instead. The frontage bounds are declared here rather than
  // imported, because props.js knows nothing about buildings; they are copied from
  // the LAYOUT entries in cityBuildings.js and suburbanGarages.test.mjs re-derives
  // them, so a building that moves cannot quietly leave the light behind.
  const HOUSE_FRONTAGES = [
    { name: 'houseStandard open bay', z0: -73.5, z1: -67.0 },    // brown roof, the way in
    { name: 'houseGarage roller door', z0: -47.25, z1: -39.25 },  // grey roof, now shut
  ];
  const onAFrontage = (z) => HOUSE_FRONTAGES.some((f) => z > f.z0 && z < f.z1);

  for (let x = -70; x <= 70; x += 14) {
    // Keep this row open around the portal hill.
    if (x < 40 || x > 72) makeLampPost(scene, x, 17);
    makeLampPost(scene, x, -17);
  }
  for (let z = -70; z <= 70; z += 14) {
    makeLampPost(scene, 17, z);
    if (!onAFrontage(z)) makeLampPost(scene, -17, z);
  }
  // The two replacements. x = -14.5 is the middle of the grass verge between the
  // houses' front faces (x -17.5) and the arterial-ns kerb (x -12), which is where
  // a streetlight actually belongs; each z is by a front door rather than over a
  // garage, and clear of both garage bands and both door paths. The bay does not
  // lose its light — it has its own beckoning lamp inside it.
  makeLampPost(scene, -14.5, -62.5);
  makeLampPost(scene, -14.5, -51.0);

  // Fire hydrants, all on grass verges. Every one is checked against the ROADS
  // table in cityRoads.js by the city audit, so none of them stands in tarmac.
  makeFireHydrant(scene, -64, -32);    // verge on the residential street
  makeFireHydrant(scene, -58, -49);    // between the parking lot and the flats
  makeFireHydrant(scene, -70, -16);    // west corner of the flats block
  makeFireHydrant(scene, -70, -18);    // west end of the flats frontage
  makeFireHydrant(scene, 14, -34);     // south end of the east-spine block
  makeFireHydrant(scene, 33, -58);     // west end of the substation
  makeFireHydrant(scene, 33, -68);     // substation's south-west corner
  makeFireHydrant(scene, 66, -49);     // south-east block, east end
  makeFireHydrant(scene, -46, 14);     // bodega frontage
  makeFireHydrant(scene, -46, 16);     // north verge above the bodega
  makeFireHydrant(scene, -22, 37);     // north side of the town square
  makeFireHydrant(scene, 31, 50);      // between the park and the library
  makeFireHydrant(scene, 44, 100);     // far north, east of the hospital
  makeFireHydrant(scene, -13.5, 90);   // far north, verge on the main drag
  makeFireHydrant(scene, 64, 100);     // far north, west of the retained block
  makeFireHydrant(scene, 67, 60);      // grass east of the park
  // The market row: three along its own sidewalk and one at its west end.
  makeFireHydrant(scene, -34, 59);
  makeFireHydrant(scene, -20, 59);
  makeFireHydrant(scene, -46, 55);

  // Park border, three sides only — the library fronts the open east edge.
  makeFenceLine(scene, 14, 44, 14, 64, 10);
  makeFenceLine(scene, 14, 64, 30, 64, 8);
  makeFenceLine(scene, 30, 64, 30, 44, 10);

  const clamShell = addPark(scene);
  addParkingLot(scene);
  addMarketStalls(scene);
  addVillageCharm(scene, fountains);
  addStreetFurniture(scene);
  const { colliders: mineColliders } = makeMineShaftEntrance(scene);
  const mineGems = excavateDescendingAdit(scene);

  return { trafficLights, fountains, mineColliders, mineGems, clamShell };
}

// ========================================================================
// Descending Adit — a REAL visible dig-down at the mine mouth.
//
// Previously the mine-shift dive sold poorly: the car parked on flat paving,
// tipped its nose, and sank straight down into closed turf — nobody saw it
// "go underground". This builder carves an honest, graded excavation into
// the ground at the mine entrance so the departure finally reads:
//
//   • A GRASSY APRÓN grades down from the meadow into a widening notch.
//   • STEPPED ROCK-TERRACE walls hem the slot on both flanks (hewn layers,
//     not sheer voids), so the passage visibly LOWERS as it advances.
//   • A DESCENDING SOIL BED carries the carriage-way steadily downward
//     (monotonic Y-loss) toward the darkened throat.
//   • COLORFUL FACET-GEMS crust the freshly-exposed cliff faces AND drip
//     from a CONVERGENT ARCH-CANOPY overhead — brighter and denser as the
//     slot burrows, so the eyes follow the jewels down into the dark.
//
// Coordinates are WORLD space (independent of the rotated timber hut), tuned
// to the existing mine cluster: axis x=-55, advancing +z from the meadow
// (z≈30) down to the buried throat (z≈54), bounded by the existing dirt-bank
// colliders at x=-60 / x=-50. Nothing here creates colliders — the stock
// mine huts + banks already fence the driver; this is pure dressing so the
// descent is spectacular and believable.
// ------------------------------------------------------------------------

// Shared station profile (z -> cumulative drop below grade). Exported so the
// dive motion in main.js interpolates the SAME curve — the car's path and the
// carved bed can never drift apart. Opens with a long FLAT runway inside the
// mouth, toes off imperceptibly, then plunges well past the old terminus so
// the car visibly dwindles into the earth.
export const MINE_ADIT_PROFILE = [
  [30, 0.0],
  [34, 0.0],      // flat lead-in — enter, coast, THEN descend
  [37, -0.4],     // whisper-grade toe-off
  [40, -1.2],
  [43, -2.6],
  [46, -4.4],
  [49, -6.6],
  [52, -9.0],
  [54, -10.5],    // buried throat
];

function excavateDescendingAdit(scene) {
  const AXIS_X = -55;

  // Materials -----------------------------------------------------------
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 1 });
  const soilDarkMat = new THREE.MeshStandardMaterial({ color: 0x33271a, roughness: 1 });
  const rockFaceMat = new THREE.MeshStandardMaterial({ color: 0x5f5a52, roughness: 1 });
  const rockDeepMat = new THREE.MeshStandardMaterial({ color: 0x3c3833, roughness: 1 });

  // Facetted gem palette — saturated colours with strong emissive bloom so
  // they shine in the murk. Each gem gets its OWN material (colour + emissive
  // tied) so updateMineGems() can twinkle them independently.
  const GEM_HUE = ['#ff4bd8', '#ffe14b', '#4bf0ff', '#7dff4b', '#b06bff'];

  // Station profile: z -> cumulative drop below grade (units). Shared with the
  // dive motion in main.js via MINE_ADIT_PROFILE so the carved bed and the
  // car's path stay perfectly in sync.
  const PROFILE = MINE_ADIT_PROFILE;
  const dropAt = (zz) => {
    if (zz <= PROFILE[0][0]) return PROFILE[0][1];
    if (zz >= PROFILE[PROFILE.length - 1][0]) return PROFILE[PROFILE.length - 1][1];
    for (let i = 1; i < PROFILE.length; i++) {
      if (zz <= PROFILE[i][0]) {
        const za = PROFILE[i - 1][0], zb = PROFILE[i][0];
        const ya = PROFILE[i - 1][1], yb = PROFILE[i][1];
        const tt = (zz - za) / (zb - za);
        return ya + (yb - ya) * tt;
      }
    }
    return PROFILE[PROFILE.length - 1][1];
  };

  const HALFW = 5;              // channel half-width (flanked by x=-60/x=-50 banks)
  const CH_MIN = 30, CH_MAX = 44;  // matches ground hole in map.js (z 34..44)

  // Helper: a single tapering bedrock shelf filling one side of the slot.
  // Approximates the hewn cliff-face as a ladder of stepped prisms that walk
  // DOWN and INWARD as z advances — classic quarry terracing.
  function addFlankBank(sign /* -1 = west (x<xAxis), +1 = east */) {
    const innerEdgeSign = sign;             // signed direction from axis to the wall
    const numSteps = 6;
    const zPer = (CH_MAX - CH_MIN) / numSteps;
    for (let sIdx = 0; sIdx < numSteps; sIdx++) {
      const zA = CH_MIN + sIdx * zPer;
      const zB = zA + zPer;
      const fracMid = (sIdx + 0.5) / numSteps;                     // 0..1 along the dig
      const maxDrop = -PROFILE[PROFILE.length - 1][1];             // total burial (10.5)
      const dropMid = -(fracMid * maxDrop);                        // average drop at midpoint
      // Step thickness widens as we go deeper (bank bulges inward over the slot).
      const thickInner = 1.2 + fracMid * 2.6;                      // protrusion past the nominal wall
      const stepCX = AXIS_X + sign * (HALFW + thickInner / 2);
      const stepCY = dropMid + 0.6;                                // seat the shelf just proud of the bed
      const stepCZ = (zA + zB) / 2;
      const stepDX = thickInner;
      const stepDY = 1.6 + fracMid * 1.1;                          // thicker shelves lower down
      const stepDZ = zPer + 0.4;                                   // slight overlap kills gaps
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(stepDX, stepDY, stepDZ), rockFaceMat);
      shelf.position.set(stepCX, stepCY, stepCZ);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      scene.add(shelf);

      // Grassy sod topping each shelf — ties the scarred rock back to the meadow.
      // Wrapped in a group so it can be knocked loose by the car.
      const sodG = new THREE.Group();
      const sod = new THREE.Mesh(new THREE.BoxGeometry(stepDX + 0.3, 0.35, stepDZ + 0.3), grassMaterial);
      sod.position.y = 0.17;
      sod.receiveShadow = true;
      sodG.add(sod);
      sodG.position.set(stepCX, stepCY + stepDY / 2, stepCZ);
      scene.add(sodG);
      addKnockable(sodG, stepDX * 0.5 + 0.3, {
        mode: 'slide',
        fallTime: 0.3 + Math.random() * 0.2,
        slideDistance: 1.2 + Math.random() * 1.0,
        shovePower: 8,
        shoveSpinPower: 2.0,
      });
    }

    // Deep shadow curtain backing the lowest shelf — swallows the throat.
    const deepBox = new THREE.Mesh(
      new THREE.BoxGeometry(HALFW * 2 + 2, 7, 2.2),
      rockDeepMat
    );
    deepBox.position.set(AXIS_X, -8.5, CH_MAX + 0.6);
    scene.add(deepBox);
  }

  // Flanking quarried terraces ----------------------------------------------
  addFlankBank(-1);
  addFlankBank(1);

  // Flat grass lip at the entrance — straight edge, no curved apron.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(HALFW * 2 + 4, 0.1, 2.5), grassMaterial);
  lip.position.set(AXIS_X, 0.02, CH_MIN - 1.5);
  lip.receiveShadow = true;
  scene.add(lip);

  // Descending soil bed: a carpet of overlapping plates walking down the slot,
  // so the carriage-way visibly LOSES HEIGHT as it advances toward the throat.
  const plateNum = 12;
  for (let i = 0; i < plateNum; i++) {
    const zA = CH_MIN + (i / plateNum) * (CH_MAX - CH_MIN);
    const zB = CH_MIN + ((i + 1) / plateNum) * (CH_MAX - CH_MIN);
    const zm = (zA + zB) / 2;
    const ym = dropAt(zm);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(HALFW * 2 - 0.6, 0.5, zB - zA + 0.3),
      i % 2 ? soilMat : soilDarkMat
    );
    // Raised 0.02 (~half inch) above the bed so the plates render on top of
    // the grass instead of z-fighting with it at the entrance.
    plate.position.set(AXIS_X, ym - 0.25 + 0.02, zm);
    plate.receiveShadow = true;
    scene.add(plate);
  }

  // Descending ceiling: rock plates spanning the channel, following the bed
  // profile so the car drives INTO a descending tunnel. Without it the flat
  // meadow plane at y=0 stayed visible above the car, making the descent
  // read as sinking through water instead of driving down a slope.
  const ceilNum = 16;
  const CEIL_H = 4.5;     // tunnel height above the bed
  const CEIL_START = 33;  // generously covers the hole and overlaps it (z 33..54)
  for (let i = 0; i < ceilNum; i++) {
    const zA = CEIL_START + (i / ceilNum) * (54 - CEIL_START);
    const zB = CEIL_START + ((i + 1) / ceilNum) * (54 - CEIL_START);
    const zm = (zA + zB) / 2;
    const ym = dropAt(zm) + CEIL_H;
    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(HALFW * 2 - 0.6, 0.5, zB - zA + 0.3),
      rockFaceMat
    );
    ceil.position.set(AXIS_X, ym, zm);
    scene.add(ceil);
  }

  // Glowing gemstones lining the mine shaft — the "deeper into the mind"
  // treasure. Very sparse near the mouth (z 34–40): just a few faint glimmers
  // hinting at what's below. The cluster builds as you descend and blooms
  // deep in the throat (z 48–54) where the biggest, brightest crystals live.
  let seedRand = 1234;
  const rand = () => {
    seedRand = (seedRand * 16807) % 2147483647;
    return (seedRand - 1) / 2147483646;
  };
  const OCTAHEDRON = new THREE.OctahedronGeometry(0.5, 0);
  const DODECAHEDRON = new THREE.DodecahedronGeometry(0.5, 0);
  const CONE = new THREE.ConeGeometry(0.34, 0.95, 5);
  const mineGems = [];
  // Depth bands: [start, end, gems-per-wall, base intensity, size]
  const bands = [
    [34, 40, 1, 1.0, 0.35],   // mouth — tiny, faint hints
    [40, 46, 3, 1.6, 0.6],    // mid-shaft — growing presence
    [46, 51, 4, 2.0, 0.9],    // deep — the real cluster begins
    [51, 55, 3, 2.4, 1.1],    // throat — big showcase crystals
  ];
  for (const [za, zb, perWall, intenBase, sizeBase] of bands) {
    for (let ci = 0; ci < 2; ci++) {
      const sign = ci === 0 ? -1 : 1;
      for (let gi = 0; gi < perWall; gi++) {
        const zz = za + rand() * (zb - za);
        const yy = dropAt(zz) + 0.7 + rand() * 3.6;
        const xx = AXIS_X + sign * (HALFW - 0.5 - rand() * 1.7);
        const hex = GEM_HUE[(rand() * GEM_HUE.length) | 0];
        const base = intenBase + rand() * 0.5;
        const mat = new THREE.MeshStandardMaterial({
          color: hex, emissive: hex, emissiveIntensity: base,
          roughness: 0.15, metalness: 0.15,
        });
        const roll = rand();
        const spike = roll < 0.35;
        const big = roll > 0.85;
        const geo = big ? DODECAHEDRON : (spike ? CONE : OCTAHEDRON);
        const gemMesh = new THREE.Mesh(geo, mat);
        gemMesh.position.set(xx, yy, zz);
        gemMesh.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        const s = (big ? sizeBase * 1.6 : sizeBase * 0.8) + rand() * sizeBase * 0.6;
        const baseScale = new THREE.Vector3(s, s * (spike ? 1.35 : 1), s);
        gemMesh.scale.copy(baseScale);
        gemMesh.castShadow = true;
        scene.add(gemMesh);
        mineGems.push({
          mesh: gemMesh,
          base,
          baseScale,
          phase: rand() * Math.PI * 2,
          speed: 1.2 + rand() * 2.6,
          time: rand() * 10,
        });
      }
    }
  }

  // Warm coloured spill-lights washing the descending tunnel so the car and
  // the gems stay visible in the gloom — a cool pool near the entrance, hot
  // pools deeper in where the treasure glows brightest.
  const spills = [
    [AXIS_X, 2.0, 34, 0xaaccff, 1.2, 16],
    [AXIS_X, 2.0, 37, 0xaaccff, 1.1, 17],
    [AXIS_X, 0.8, 44, 0xff88ee, 1.2, 16],
    [AXIS_X, -1.2, 51, 0xffcf66, 1.4, 14],
  ];
  for (const [lx, ly, lz, col, inten, dst] of spills) {
    const sp = new THREE.PointLight(col, inten, dst, 2);
    sp.position.set(lx, ly, lz);
    scene.add(sp);
  }

  return mineGems;
}

export { updateFountains, updateMineGems };
