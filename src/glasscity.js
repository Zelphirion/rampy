import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable } from './physics.js';

// ===== The Glass City (north of the world) =====
// A grid of silent, monolithic skyscrapers made of coloured translucent glass,
// with surreal street-level tableaux visible through shop windows — a room
// full of mechanical birds, an orchard of blue trees growing through marble
// floors, and figures locked in motionless tableaux.
//
// Region: z in [132, 173], spanning the whole world width x in [-140, 140].
// Built for the old, larger surface map; since the map shrank to its wrapped
// bounds it stands in the UNDERWORLD instead (see underground.js), whose
// cavern floor is big enough to hold it unchanged.

const Z0 = 132;
const Z1 = 173;

// ---- Materials ----
const glassColors = [0xc85a7a, 0x4a7fd4, 0x7a5ac8, 0x3fae8f, 0xd49a3f, 0xcf6fd4];
const glassTowerMat = new THREE.MeshPhysicalMaterial({ roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false });
const interiorMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffcf8a, emissiveIntensity: 0.55, transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.2 });
const capMat = new THREE.MeshStandardMaterial({ color: 0xdfdbe6, roughness: 0.4 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.7, roughness: 0.35 });
const windowMat = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0.7, transparent: true, opacity: 0.55, roughness: 0.2 });
const marbleMat = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.6 });

// ---- Layout: tower grid ----
// Wide, drivable streets between the towers: columns 20 apart (corridor
// ~12 wide) and rows 18 apart (corridor ~10 wide), so the car can thread
// through the city without getting stuck.
const towerCols = [];
for (let x = -126; x <= 134; x += 20) towerCols.push(x);
const towerRows = [134, 152, 170];

// Towers removed to make room for the blue-tree orchard plaza.
function towerSkipped(x, z) {
  if (z === 152 && (x === 34 || x === 54)) return true;
  return false;
}

function makeTower(scene, x, z, w, h, colorIdx) {
  const g = new THREE.Group();
  const mat = glassTowerMat.clone();
  mat.color.set(glassColors[colorIdx % glassColors.length]);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
  body.position.y = h / 2;
  body.receiveShadow = true;
  g.add(body);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, h * 0.78, w * 0.78), interiorMat);
  inner.position.y = h / 2;
  g.add(inner);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, w + 0.6), capMat);
  cap.position.y = h + 0.4;
  g.add(cap);
  g.position.set(x, 0, z);
  scene.add(g);
  // Knockable like the market shops: the car drives straight through, the
  // tower rocks on its base away from the impact, then springs back upright.
  // The pivot is the group origin (ground level), so the whole tower sways
  // like a reed. Taller towers are heavier: they sway slower and shallower
  // (the peak tilt shrinks with height so the rooftop swing stays ~2 units).
  addKnockable(g, w / 2 + 2.4, {
    mode: 'wobble',
    wobbleAmp: Math.min(0.32, 2.4 / h),
    wobbleFreq: 7,
    wobbleDamping: 2.6,
  });
  return { x, z, halfW: w / 2, halfD: w / 2, h };
}

// ---- Tableau 1: a room full of mechanical birds ----
function makeBird() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), goldMat);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), goldMat);
  head.position.set(0, 0.22, 0.08);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), redBandMat());
  beak.position.set(0, 0.22, 0.3);
  g.add(beak);
  const wL = new THREE.Group();
  wL.position.set(-0.18, 0.12, 0);
  wL.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.16), goldMat));
  const wR = new THREE.Group();
  wR.position.set(0.18, 0.12, 0);
  wR.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.16), goldMat));
  g.add(wL);
  g.add(wR);
  return { g, wL, wR };
}

function makeBirdShop(scene, x, z) {
  const g = new THREE.Group();
  const mat = glassTowerMat.clone();
  mat.color.set(0xe88bb0);
  mat.opacity = 0.3;
  const box = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 7), mat);
  box.position.y = 3;
  box.receiveShadow = true;
  g.add(box);
  const win = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4, 0.2), windowMat);
  win.position.set(0, 3, 3.55);
  g.add(win);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 0.3), goldMat);
  sign.position.set(0, 5.3, 3.5);
  g.add(sign);
  const perches = [];
  for (let i = 0; i < 5; i++) {
    const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), goldMat);
    perch.rotation.z = Math.PI / 2;
    perch.position.set((i - 2) * 1.2, 1.8, 0);
    g.add(perch);
    perches.push(perch);
  }
  const birds = [];
  for (let i = 0; i < 5; i++) {
    const b = makeBird();
    b.g.position.set((i - 2) * 1.2, 2.05, 0);
    b.g.scale.setScalar(1 + (i % 2) * 0.2);
    g.add(b.g);
    birds.push(b);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    birds,
    update(delta, t) {
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        const ph = t * 3 + i * 1.3;
        b.g.position.y = 2.05 + Math.abs(Math.sin(ph)) * 0.25;
        b.wL.rotation.z = Math.sin(ph) * 0.6;
        b.wR.rotation.z = -Math.sin(ph) * 0.6;
      }
    },
  };
}

// ---- Tableau 2: an orchard of blue trees growing through marble ----
function makeBlueTree(scene, x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 8), goldMat);
  trunk.position.y = 1.1;
  g.add(trunk);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f8fe0, emissive: 0x1a5f9e, emissiveIntensity: 0.5, transparent: true, opacity: 0.8, roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(1.0 - i * 0.2, 12, 10), canopyMat);
    blob.position.set((i - 1) * 0.8, 2.6 + (i % 2) * 0.3, (i % 2) * 0.7);
    g.add(blob);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

function makeOrchardPlaza(scene, cx, cz) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(34, 0.25, 22), marbleMat);
  floor.position.set(cx, 0.02, cz);   // top ~0.145 (car rides over it level)
  floor.receiveShadow = true;
  scene.add(floor);
  const trees = [];
  for (let i = 0; i < 7; i++) {
    const tx = (i % 3 - 1) * 6 + ((i * 7) % 5) * 1.2;
    const tz = (Math.floor(i / 3) - 1) * 5 + ((i * 3) % 4) * 1.0;
    trees.push(makeBlueTree(scene, cx + tx, cz + tz));
  }
  return trees;
}

// ---- Tableau 3: figures that slowly "change pose" on a clock (idea #26) ----
function makeMannequin(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.4), mat);
  body.position.y = 1.3;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.5 }));
  head.position.y = 2.25;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.6 }));
  hat.position.y = 2.85;
  g.add(hat);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), mat);
  armL.position.set(-0.42, 1.2, 0);
  armL.rotation.z = 0.5;
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), mat);
  armR.position.set(0.42, 1.2, 0);
  armR.rotation.z = -0.6;
  g.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), mat);
  legL.position.set(-0.18, 0.4, 0);
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), mat);
  legR.position.set(0.18, 0.35, 0);
  g.add(legR);
  return { g, head, hat, armL, armR };
}

function makeTableauShop(scene, x, z, color, colors) {
  const g = new THREE.Group();
  const mat = glassTowerMat.clone();
  mat.color.set(color);
  mat.opacity = 0.32;
  const box = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 7), mat);
  box.position.y = 3;
  box.receiveShadow = true;
  g.add(box);
  const win = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4, 0.2), windowMat);
  win.position.set(0, 3, 3.55);
  g.add(win);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 0.3), goldMat);
  sign.position.set(0, 5.3, 3.5);
  g.add(sign);
  const figures = [];
  for (let i = 0; i < colors.length; i++) {
    const m = makeMannequin(colors[i]);
    m.g.position.set((i - 1) * 1.4, 0.05, 0);
    const baseYaw = 0.2 + (i % 2) * 0.5;
    m.g.rotation.y = baseYaw;
    g.add(m.g);
    figures.push({ ...m, baseYaw, phase: i * 2.1 + x * 0.03, speed: 0.5 + (i % 3) * 0.25 });
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    x, z, halfW: 3.5, halfD: 3.5, h: 6,
    // Slow living-exhibit motion: arms drift, the body turns a little, head
    // scans — each figure on its own phase so they don't move in lockstep.
    update(delta, t) {
      for (const f of figures) {
        const w = t * f.speed + f.phase;
        f.armL.rotation.z = 0.5 + Math.sin(w) * 0.4;
        f.armR.rotation.z = -0.6 + Math.sin(w * 0.8 + 1.3) * 0.35;
        f.g.rotation.y = f.baseYaw + Math.sin(w * 0.4) * 0.4;
        f.head.rotation.y = Math.sin(w * 0.7 + 2) * 0.35;
        f.hat.rotation.z = Math.sin(w * 0.5 + 0.5) * 0.12;
      }
    },
  };
}

// A canvas marble floor with a faint grid, repeated across the whole region.
function makeCityFloor(scene) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e6e2d8';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(160,160,175,0.5)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.strokeStyle = 'rgba(120,120,150,0.22)';
  g.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i * 16); g.lineTo(128, i * 16); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 4);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(284, 0.04, 45), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  floor.position.set(0, 0.02, (Z0 + Z1) / 2);
  scene.add(floor);
}

// (small red for the bird beaks)
function redBandMat() {
  return new THREE.MeshStandardMaterial({ color: 0xb84040, roughness: 0.6 });
}

// ---- Crystals (idea #25) ----
// Glowing crystal clusters along the streets (like the mine gems) that POP when
// the car runs into them, plus one big central citadel crystal the towers ring.
const crystalColors = [0x7ef9ff, 0xff8ad8, 0x9dff8f, 0xffd27e, 0xb48cff];

function makeCrystalCluster(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.95,
    transparent: true, opacity: 0.85, roughness: 0.12, metalness: 0.25,
    flatShading: true,
  });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.25, 0.4, 7),
    new THREE.MeshStandardMaterial({ color: 0x3a3548, roughness: 0.9 })
  );
  base.position.y = 0.2;
  base.castShadow = true;
  g.add(base);
  const n = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const h = 1.4 + Math.random() * 1.8;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.22 + Math.random() * 0.22, h, 6), mat);
    shard.position.set(Math.cos(a) * 0.55, 0.35 + h / 2, Math.sin(a) * 0.55);
    shard.rotation.set((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7);
    shard.castShadow = true;
    g.add(shard);
  }
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.6 + Math.random(), 6), mat);
  core.position.y = 0.35 + (2.6 + Math.random()) / 2;
  core.castShadow = true;
  g.add(core);
  g.userData.color = color;
  g.userData.mat = mat;
  return g;
}

export function addGlassCity(scene, opts = {}) {
  const onCrystalPop = typeof opts.onCrystalPop === 'function' ? opts.onCrystalPop : null;
  makeCityFloor(scene);

  const colliders = [];
  let ci = 0;
  for (const x of towerCols) {
    let ri = 0;
    for (const z of towerRows) {
      if (!towerSkipped(x, z)) {
        const h = 13 + ((ci * 7 + ri * 11) % 13);
        const w = 6 + ((ci + ri) % 3);
        // Towers are knockable (see makeTower), not solid — the car drives
        // straight through them, so they contribute no collider.
        makeTower(scene, x, z, w, h, ci + ri);
      }
      ri++;
    }
    ci++;
  }

  // Tableaux (colliders for the shops, decorations inside them) — set in the
  // wide corridor gaps of the tower grid.
  const tableauA = makeTableauShop(scene, -96, 143, 0x4a7fd4, [0xe8d3a0, 0xb0c4e8, 0xe8a0b4]);
  colliders.push(tableauA);
  const tableauB = makeTableauShop(scene, 84, 161, 0x7a5ac8, [0xffffff, 0xe0d8a8, 0xb0c4e8]);
  colliders.push(tableauB);
  const birdShop = makeBirdShop(scene, -16, 143);
  colliders.push({ x: -16, z: 143, halfW: 3.5, halfD: 3.5, h: 6, noGhost: true });

  const blueTrees = makeOrchardPlaza(scene, 44, 154);

  // ---- Central citadel crystal (idea #25) ----
  // One big double-terminated crystal in the corridor the towers ring, with a
  // glowing halo and a bright light so it reads as the city's heart.
  const spireX = 4, spireZ = 152;
  const spireMat = new THREE.MeshStandardMaterial({
    color: 0xaee6ff, emissive: 0x5fb9ff, emissiveIntensity: 1.2,
    transparent: true, opacity: 0.72, roughness: 0.06, metalness: 0.3, flatShading: true,
  });
  const spire = new THREE.Group();
  const spireBody = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), spireMat);
  spireBody.scale.set(1, 4.4, 1);
  spireBody.position.y = 11.5;
  spireBody.castShadow = true;
  spire.add(spireBody);
  const spireBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3.4, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x2b2838, roughness: 0.85, metalness: 0.2 })
  );
  spireBase.position.y = 0.6;
  spireBase.castShadow = true;
  spire.add(spireBase);
  const spireHalo = new THREE.Mesh(
    new THREE.TorusGeometry(3.6, 0.14, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  spireHalo.rotation.x = Math.PI / 2;
  spireHalo.position.y = 1.4;
  spire.add(spireHalo);
  const spireLight = new THREE.PointLight(0x7fd0ff, 3.2, 60, 2);
  spireLight.position.set(0, 8, 0);
  spire.add(spireLight);
  spire.position.set(spireX, 0, spireZ);
  scene.add(spire);
  colliders.push({ x: spireX, z: spireZ, halfW: 2.6, halfD: 2.6, h: 20 });

  // ---- Crystal clusters along the streets ----
  const CRYSTAL_SPOTS = [
    [-116, 143], [-76, 143], [-36, 143], [24, 143], [64, 143], [104, 143], [124, 143],
    [-116, 161], [-76, 161], [-36, 161], [24, 161], [64, 161], [104, 161], [124, 161],
  ];
  const crystals = [];
  for (let i = 0; i < CRYSTAL_SPOTS.length; i++) {
    const [x, z] = CRYSTAL_SPOTS[i];
    const color = crystalColors[i % crystalColors.length];
    const group = makeCrystalCluster(color);
    group.position.set(x, 0, z);
    scene.add(group);
    crystals.push({ group, x, z, color, radius: 2.8, alive: true, respawn: 0 });
  }

  // Shard bursts for a popped cluster — small flying cones that fade out.
  const crystalBursts = [];
  function spawnCrystalBurst(x, z, color) {
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 1.1, transparent: true, opacity: 1,
      roughness: 0.15, metalness: 0.2, flatShading: true,
    });
    const shards = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.14 + Math.random() * 0.12, 0.5 + Math.random() * 0.6, 5), mat.clone());
      s.position.set(x + (Math.random() - 0.5) * 1.2, 1.0 + Math.random() * 2.2, z + (Math.random() - 0.5) * 1.2);
      s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      scene.add(s);
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      shards.push({ mesh: s, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 4 + Math.random() * 5, spin: (Math.random() - 0.5) * 8, life: 0, max: 0.7 + Math.random() * 0.5 });
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.0, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 1.0, z);
    scene.add(ring);
    crystalBursts.push({ shards, ring, life: 0, max: 0.75 });
  }

  function update(delta, player) {
    // Only animate when the player is in/near the Glass City.
    if (Math.abs(player.z - ((Z0 + Z1) / 2)) > 60) return;
    birdShop.update(delta, clockT);
    tableauA.update(delta, clockT);
    tableauB.update(delta, clockT);
    clockT += delta;
    for (const t of blueTrees) {
      t.rotation.y += delta * 0.05;   // the blue trees turn slowly, like living things
    }
    // The citadel crystal slowly turns and its halo pulses.
    spire.rotation.y += delta * 0.25;
    spireHalo.rotation.z += delta * 0.6;
    spireLight.intensity = 2.6 + 0.9 * Math.sin(clockT * 1.8);
    spireHalo.material.opacity = 0.5 + 0.25 * Math.sin(clockT * 1.8);
    // Crystals pop when the car drives into them, then regrow after a beat.
    for (const c of crystals) {
      if (c.alive) {
        if (c.group.visible && player.y < 3) {
          const dx = player.x - c.x;
          const dz = player.z - c.z;
          if (dx * dx + dz * dz < c.radius * c.radius) {
            c.alive = false;
            c.group.visible = false;
            c.respawn = 6;
            spawnCrystalBurst(c.x, c.z, c.color);
            if (onCrystalPop) onCrystalPop(c);
          }
        }
      } else {
        c.respawn -= delta;
        if (c.respawn <= 0) {
          c.alive = true;
          c.group.visible = true;
          c.group.scale.setScalar(0.001);
        }
      }
      if (c.alive && c.group.scale.x < 1) {
        c.group.scale.setScalar(Math.min(1, c.group.scale.x + delta * 2.5));
      }
    }
    // Animate the shard bursts.
    for (let i = crystalBursts.length - 1; i >= 0; i--) {
      const b = crystalBursts[i];
      b.life += delta;
      const t = b.life / b.max;
      for (const s of b.shards) {
        s.vy -= 16 * delta;
        s.mesh.position.x += s.vx * delta;
        s.mesh.position.y += s.vy * delta;
        s.mesh.position.z += s.vz * delta;
        s.mesh.rotation.x += s.spin * delta;
        s.mesh.rotation.z += s.spin * delta;
        s.mesh.material.opacity = Math.max(0, 1 - t);
      }
      b.ring.scale.setScalar(1 + t * 5);
      b.ring.material.opacity = Math.max(0, 0.9 * (1 - t));
      if (b.life >= b.max) {
        for (const s of b.shards) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
        scene.remove(b.ring);
        b.ring.geometry.dispose();
        b.ring.material.dispose();
        crystalBursts.splice(i, 1);
      }
    }
  }
  let clockT = 0;
  return { colliders, update, crystals, spire };
}
