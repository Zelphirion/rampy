import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== The Golden Factory (west of the world) =====
// A sprawling retro-futuristic industrial complex with no workers — only
// self-operating machinery: conveyor belts producing glowing geometric shapes,
// vats of liquefied gold, giant mechanical statues enacting cyclical ritual
// movements, sawtooth-roofed halls and striped smokestacks.
//
// Region: x in [-140, -94] (the world's west band), z in [-90, 126].

const X0 = -140;
const X1 = -94;
const Z0 = -90;
const Z1 = 126;

// ---- Materials ----
const concreteMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.8, metalness: 0.35 });
const rustMat = new THREE.MeshStandardMaterial({ color: 0x7a4a32, roughness: 0.95 });
const redBandMat = new THREE.MeshStandardMaterial({ color: 0xb84040, roughness: 0.8 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 });
const goldLiquidMat = new THREE.MeshStandardMaterial({ color: 0xffc24d, emissive: 0xffb84d, emissiveIntensity: 0.85, roughness: 0.2, metalness: 0.4 });
const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffe9a8, emissiveIntensity: 1.6 });

// ---- Industrial halls (colliders) ----
const halls = [
  { x: -124, z: -64, w: 26, d: 16, h: 10 },
  { x: -108, z: -16, w: 18, d: 20, h: 8 },
  { x: -130, z: 30, w: 24, d: 16, h: 11 },
  { x: -108, z: 72, w: 20, d: 22, h: 9 },
  { x: -128, z: 108, w: 22, d: 16, h: 10 },
];

function makeHall(scene, hx, hz, w, d, h) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steelMat);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // sawtooth roof
  const n = Math.max(2, Math.floor(w / 5));
  for (let i = 0; i < n; i++) {
    const saw = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, d * 0.9), rustMat);
    saw.position.set(-w / 2 + 2.6 + i * (w / n), h + 0.7, 0);
    saw.rotation.z = 0.35;
    saw.castShadow = true;
    g.add(saw);
  }
  // glowing window band
  const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 1.1, 0.4), glowMat);
  band.position.set(0, h * 0.5, d / 2 + 0.05);
  g.add(band);
  // side pipes
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, h * 0.7, 8), rustMat);
    pipe.position.set(side * (w / 2 + 0.5), h * 0.35, 0);
    g.add(pipe);
  }
  g.position.set(hx, 0, hz);
  scene.add(g);
  return { x: hx, z: hz, halfW: w / 2, halfD: d / 2, h };
}

// Striped smokestack.
function makeStack(scene, x, z, h) {
  const g = new THREE.Group();
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, h, 12), rustMat);
  pipe.position.y = h / 2;
  pipe.castShadow = true;
  g.add(pipe);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.7, 12), redBandMat);
  band.position.y = h * 0.55;
  g.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.4, 1.0, 12), steelMat);
  cap.position.y = h + 0.5;
  g.add(cap);
  g.position.set(x, 0, z);
  scene.add(g);
}

// A conveyor belt that endlessly produces glowing geometric shapes.
function makeConveyor(scene, x, z, len) {
  const g = new THREE.Group();
  const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 1.4), steelMat);
  belt.position.y = 0.55;
  belt.castShadow = belt.receiveShadow = true;
  g.add(belt);
  for (const lx of [-len / 2 + 1, len / 2 - 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 1.2), rustMat);
    leg.position.set(lx, 0.28, 0);
    g.add(leg);
  }
  const defs = [
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.IcosahedronGeometry(0.42, 0),
    new THREE.SphereGeometry(0.38, 12, 10),
  ];
  const shapes = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(defs[i % 3], glowMat);
    s.position.set(i * (len / 4) - len / 2 + len / 8, 1.35, 0);
    s.castShadow = true;
    g.add(s);
    shapes.push(s);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    len,
    shapes,
    update(delta, t) {
      const travel = len - 0.8;
      for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];
        const off = (t * 1.6 + i * (travel / 4)) % travel;
        s.position.x = -len / 2 + 0.4 + off;
        s.position.y = 1.35 + Math.sin(t * 3 + i) * 0.06;
        s.rotation.x += delta * 2;
        s.rotation.y += delta * 1.5;
      }
    },
    collider: { halfW: len / 2, halfD: 0.7, h: 0.8 },
  };
}

// A vat of liquefied gold (shell + pulsing golden liquid).
function makeVat(scene, x, z, r) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, r * 1.6, 20), rustMat);
  shell.position.y = r * 0.8;
  shell.castShadow = shell.receiveShadow = true;
  g.add(shell);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.4, 20), steelMat);
  rim.position.y = r * 1.55;
  g.add(rim);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, r * 0.9, 20), goldLiquidMat);
  liquid.position.y = r * 1.25;
  g.add(liquid);
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    liquid,
    update(delta, t) {
      liquid.material.emissiveIntensity = 0.7 + 0.35 * Math.sin(t * 1.8);
      liquid.rotation.y += delta * 0.4;
    },
  };
}

// A giant mechanical statue performing a slow ritual cycle (jointed arms).
function makeMachineStatue(scene, x, z, ry) {
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.8, 3.0), steelMat);
  plinth.position.y = 0.4;
  plinth.castShadow = plinth.receiveShadow = true;
  g.add(plinth);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1.2), goldMat);
  torso.position.y = 2.4;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), goldMat);
  head.position.y = 3.9;
  g.add(head);
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 8), rustMat);
  crest.position.y = 4.7;
  g.add(crest);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.1), glowMat);
  eyes.position.set(0, 3.95, 0.55);
  g.add(eyes);
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.1, 3.0, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), goldMat);
    upper.position.y = -0.7;
    pivot.add(upper);
    const elbow = new THREE.Group();
    elbow.position.set(0, -1.4, 0);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), steelMat);
    fore.position.y = -0.6;
    elbow.add(fore);
    pivot.add(elbow);
    g.add(pivot);
    arms.push({ pivot, elbow });
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  return {
    arms,
    update(delta, t) {
      for (const a of arms) {
        a.pivot.rotation.x = Math.sin(t * 0.9) * 0.9;
        a.elbow.rotation.x = -Math.sin(t * 0.9) * 0.7;
      }
    },
  };
}

function makePipe(scene, x, y, z, len, ry) {
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, len, 10), rustMat);
  pipe.rotation.z = Math.PI / 2;
  pipe.rotation.y = ry;
  pipe.position.set(x, y, z);
  scene.add(pipe);
}

const stacks = [
  { x: -118, z: -88, h: 15 },
  { x: -132, z: 14, h: 18 },
  { x: -116, z: 96, h: 14 },
];
const conveyorSpots = [
  { x: -118, z: -40, len: 22 },
  { x: -114, z: 56, len: 20 },
  { x: -120, z: 84, len: 18 },
];
const vatSpots = [
  { x: -118, z: -34, r: 3.2 },
  { x: -120, z: 52, r: 3.6 },
  { x: -126, z: 118, r: 2.8 },
];
const statueSpots = [
  { x: -112, z: 6, ry: 0.4 },
  { x: -126, z: 88, ry: 2.6 },
];
const pipeSpots = [
  { x: -120, z: -40, y: 6, len: 30, ry: 0 },
  { x: -118, z: 8, y: 5, len: 24, ry: Math.PI / 2 },
  { x: -124, z: 66, y: 7, len: 28, ry: 0 },
];

export function addFactory(scene) {
  // Dark concrete floor for the whole west band.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 2, 0.04, Z1 - Z0 + 2), concreteMat);
  floor.position.set((X0 + X1) / 2, 0.02, (Z0 + Z1) / 2);
  scene.add(floor);

  const colliders = [];
  for (const h of halls) colliders.push(makeHall(scene, h.x, h.z, h.w, h.d, h.h));
  for (const s of stacks) makeStack(scene, s.x, s.z, s.h);
  const conveyors = [];
  for (const c of conveyorSpots) {
    const cv = makeConveyor(scene, c.x, c.z, c.len);
    conveyors.push(cv);
    colliders.push({ x: c.x, z: c.z, halfW: cv.collider.halfW, halfD: cv.collider.halfD, h: cv.collider.h, noGhost: true });
  }
  const vats = [];
  for (const v of vatSpots) {
    const vt = makeVat(scene, v.x, v.z, v.r);
    vats.push(vt);
    colliders.push({ x: v.x, z: v.z, halfW: v.r * 1.1, halfD: v.r * 1.1, h: v.r * 1.7, noGhost: true });
  }
  const statues = [];
  for (const s of statueSpots) statues.push(makeMachineStatue(scene, s.x, s.z, s.ry));
  for (const p of pipeSpots) makePipe(scene, p.x, p.y, p.z, p.len, p.ry);

  let t = 0;
  function update(delta, player) {
    if (Math.abs(player.x - ((X0 + X1) / 2)) > 60) return;
    t += delta;
    for (const cv of conveyors) cv.update(delta, t);
    for (const v of vats) v.update(delta, t);
    for (const s of statues) s.update(delta, t);
  }

  return { colliders, update };
}
