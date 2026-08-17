import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== The Cosmic Desert (east of the world) =====
// A surreal endless expanse of pastel-pink and cobalt-blue sand dunes under
// twin suns: giant plaster feet half-buried in the sand, tall mirrors
// reflecting improbable skies, and silent processions of high-cone-hat figures
// crossing the horizon. The dunes are DRIVEABLE — smooth mounds you ride up
// and over (analytic height + normal, so the car's physics match the mesh).
//
// Region: x in [94, 140] (the world's east band), z in [-90, 126].

const X0 = 94;
const X1 = 140;
const Z0 = -90;
const Z1 = 126;

// ---- Materials ----
const sandMat = new THREE.MeshStandardMaterial({ color: 0xe9b8c9, roughness: 1 });      // pastel-pink sand
const blueSandMat = new THREE.MeshStandardMaterial({ color: 0x2b50b8, roughness: 1 });  // cobalt sand
const plasterMat = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.85 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.6, roughness: 0.4 });

// ---- Dunes (smooth "smoothstep" domes: h = H*(1-q)^2, q=(r/R)^2 — flat at
// the rim so there's no lip, gentle slopes, flat apex) ----
const dunes = [
  { x: 118, z: -62, R: 14, H: 3.4, blue: false },
  { x: 132, z: -30, R: 10, H: 2.4, blue: true },
  { x: 105, z: -10, R: 12, H: 3.0, blue: false },
  { x: 126, z: 12, R: 9, H: 2.0, blue: true },
  { x: 100, z: 34, R: 15, H: 3.6, blue: false },
  { x: 133, z: 52, R: 11, H: 2.8, blue: true },
  { x: 108, z: 74, R: 13, H: 3.2, blue: false },
  { x: 128, z: 96, R: 10, H: 2.2, blue: true },
  { x: 112, z: 112, R: 12, H: 2.6, blue: false },
  { x: 134, z: -78, R: 9, H: 2.0, blue: true },
  { x: 100, z: 120, R: 10, H: 2.2, blue: false },
  { x: 122, z: -44, R: 12, H: 2.8, blue: true },
];

function duneH(d, R, H) {
  if (d >= R) return 0;
  const q = (d / R) * (d / R);
  return H * (1 - q) * (1 - q);
}

// Height above ground (0..H) at a world point — 0 off the dunes.
export function desertHeightAt(px, pz) {
  let h = 0;
  for (const d of dunes) {
    const dx = px - d.x;
    const dz = pz - d.z;
    const hh = duneH(Math.hypot(dx, dz), d.R, d.H);
    if (hh > h) h = hh;
  }
  return h;
}

// Full drive surface height (add groundHeight for the car's origin).
export function desertSurfaceY(px, pz, groundHeight) {
  return groundHeight + desertHeightAt(px, pz);
}

// Unit surface normal (analytic gradient of the tallest dune under the point).
// Returns {x,y,z}. Falls back to straight up off the dunes / at a summit.
export function desertNormal(px, pz) {
  let best = null;
  let bestH = -Infinity;
  for (const d of dunes) {
    const dx = px - d.x;
    const dz = pz - d.z;
    const r = Math.hypot(dx, dz);
    const hh = duneH(r, d.R, d.H);
    if (hh > bestH) { bestH = hh; best = { d, dx, dz, r }; }
  }
  if (!best || best.r < 1e-4) return { x: 0, y: 1, z: 0 };
  const { d, dx, dz, r } = best;
  const q = (r / d.R) * (r / d.R);
  const gradMag = (-4 * d.H * r * (1 - q)) / (d.R * d.R);   // dh/dr
  const gx = gradMag * (dx / r);
  const gz = gradMag * (dz / r);
  const len = Math.hypot(gx, 1, gz);
  return { x: -gx / len, y: 1 / len, z: -gz / len };
}

// A dune MESH displaced with the exact same height function as the physics, so
// the car rides the visible sand (no sinking into / floating above it).
function makeDuneMesh(x, z, R, H, mat) {
  const geo = new THREE.PlaneGeometry(R * 2, R * 2, 30, 30);
  geo.rotateX(-Math.PI / 2);   // lie flat in XZ, centred at the origin
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    pos.setY(i, duneH(Math.hypot(vx, vz), R, H));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0, z);
  m.receiveShadow = true;
  return m;
}

// Giant plaster feet half-buried in the sand (big toes poking up).
function makePlasterFoot(scene, x, z, ry) {
  const g = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.0, 3.4), plasterMat);
  foot.position.set(0, 1.0, 0);
  foot.rotation.x = -0.55;   // toes rise out of the sand
  foot.castShadow = foot.receiveShadow = true;
  g.add(foot);
  const heel = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.4, 3.4), plasterMat);
  heel.position.set(-3.4, 0.8, 0);
  heel.castShadow = heel.receiveShadow = true;
  g.add(heel);
  for (let i = -1; i <= 1; i++) {
    const toe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.9), plasterMat);
    toe.position.set(3.8, 1.7, i * 1.15);
    toe.rotation.x = -0.35;
    toe.castShadow = true;
    g.add(toe);
  }
  const ankle = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.4, 3.4), plasterMat);
  ankle.position.set(-3.0, 2.6, 0);
  ankle.rotation.x = -0.5;
  ankle.castShadow = true;
  g.add(ankle);
  g.position.set(x, 0.1, z);
  g.rotation.y = ry;
  scene.add(g);
}

// A canvas "improbable sky" for the mirrors: purple-pink gradient, twin suns,
// a scatter of stars.
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2a1a5e');
  grad.addColorStop(0.45, '#7a3f9e');
  grad.addColorStop(0.72, '#e88bb0');
  grad.addColorStop(1, '#ffd9a0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#fff3c9';
  g.beginPath(); g.arc(92, 140, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe1ec';
  g.beginPath(); g.arc(178, 118, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 42; i++) {
    g.globalAlpha = Math.random() * 0.7 + 0.3;
    g.fillRect(Math.random() * 256, Math.random() * 320, 2, 2);
  }
  g.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}

// A tall gold-framed mirror that "reflects" the improbable sky.
function makeMirror(scene, x, z, ry) {
  const g = new THREE.Group();
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.2), plasterMat);
  pedestal.position.y = 0.5;
  g.add(pedestal);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, 0.5), brassMat);
  post.position.y = 1.9;
  g.add(post);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.2, 3.4), brassMat);
  frame.position.y = 4.6;
  g.add(frame);
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 6.0),
    new THREE.MeshStandardMaterial({
      map: makeSkyTexture(),
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0x3a2a55,
      emissiveIntensity: 0.35,
    })
  );
  mirror.position.set(0, 4.6, 1.71);
  g.add(mirror);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
}

// A robed pilgrim with a high cone hat.
function makeFigure(robeColor) {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.9 }));
  robe.position.y = 0.75;
  g.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8c39a, roughness: 0.9 }));
  head.position.y = 1.62;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.9 }));
  hat.position.y = 2.4;
  g.add(hat);
  return g;
}

// A silent procession: a little line of cone-hat figures marching east across
// the horizon, looping when it reaches the desert's east edge.
function makeProcession(scene, z, speed, colors) {
  const g = new THREE.Group();
  const figs = [];
  for (let i = 0; i < 5; i++) {
    const f = makeFigure(colors[i % colors.length]);
    f.position.set(i * 3.2 - 6.4, 0, (i % 2) * 0.8);
    g.add(f);
    figs.push(f);
  }
  g.position.set((X0 + X1) / 2, 0, z);
  g.rotation.y = -Math.PI / 2;   // face +X (march east)
  scene.add(g);
  let t = 0;
  return {
    update(delta) {
      t += delta;
      g.position.x += speed * delta;
      for (const f of figs) f.position.y = Math.abs(Math.sin(t * 2 + f.position.x)) * 0.12;
      if (g.position.x > X1 + 4) g.position.x = X0 - 8;
    },
  };
}

// Twin suns: big additive glow sprites high in the east sky (fog-proof so they
// stay bright from far away).
function makeSunTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,200,0.95)');
  grad.addColorStop(0.6, 'rgba(255,200,150,0.35)');
  grad.addColorStop(1, 'rgba(255,180,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function makeSun(scene, x, y, z, size, tint) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSunTexture(),
    color: tint,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }));
  s.scale.set(size, size, 1);
  s.position.set(x, y, z);
  scene.add(s);
}

const feet = [
  { x: 122, z: -52, ry: 0.5 },
  { x: 108, z: 8, ry: -0.7 },
  { x: 131, z: 44, ry: 1.3 },
  { x: 115, z: 98, ry: -0.35 },
  { x: 100, z: -84, ry: 0.1 },
];
const mirrorSpots = [
  { x: 112, z: -36, ry: 0.8 },
  { x: 126, z: 2, ry: -0.5 },
  { x: 102, z: 30, ry: 1.9 },
  { x: 128, z: 66, ry: -1.2 },
  { x: 112, z: 104, ry: 0.3 },
  { x: 134, z: -74, ry: 2.2 },
];
const processions = [
  { z: -30, speed: 1.4, colors: [0xb8405a, 0x6a4fa0, 0xcf8a2a] },
  { z: 42, speed: 1.1, colors: [0x3f8f6f, 0x9a4a8a, 0xb8405a] },
  { z: 96, speed: 1.7, colors: [0xcf8a2a, 0x3f8f6f, 0x6a4fa0] },
];

export function addDesert(scene) {
  // Pastel-pink sand floor for the whole east band.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 2, 0.04, Z1 - Z0 + 2), sandMat);
  floor.position.set((X0 + X1) / 2, 0.02, (Z0 + Z1) / 2);
  scene.add(floor);

  const colliders = [];
  for (const d of dunes) scene.add(makeDuneMesh(d.x, d.z, d.R, d.H, d.blue ? blueSandMat : sandMat));
  for (const f of feet) {
    makePlasterFoot(scene, f.x, f.z, f.ry);
    colliders.push({ x: f.x, z: f.z, halfW: 4, halfD: 3, h: 3, noGhost: true });
  }
  for (const m of mirrorSpots) makeMirror(scene, m.x, m.z, m.ry);
  const procs = processions.map((p) => makeProcession(scene, p.z, p.speed, p.colors));

  makeSun(scene, 116, 46, -30, 14, 0xffe3ad);
  makeSun(scene, 130, 42, 8, 9, 0xffc9d8);

  function update(delta, player) {
    // Skip the animation work when the player is far away (it's cheap anyway).
    if (Math.abs(player.x - ((X0 + X1) / 2)) > 60) return;
    for (const p of procs) p.update(delta);
  }

  return { colliders, update };
}
