import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== Shared car materials =====
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa61e1e, roughness: 0.6 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0xf3e7bc, roughness: 0.4 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1f2b3f, transparent: true, opacity: 0.72 });
const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff7c7, emissive: 0xffdd66, emissiveIntensity: 0.9 });
const wheelGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.3, 18);
const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.4 });

// ===== Car factory =====
// The group's userData exposes { wheels, wheelPivots } so the game loop
// can spin the wheels and steer the front ones.
export function createCar(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.3, 1.0, 1.8), bodyMat.clone());
  body.material.color.set(color);
  body.position.set(0, 1.05, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.75, 1.2), trimMat.clone());
  roof.position.set(0.35, 1.7, 0);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 1.4), bodyMat.clone());
  hood.material.color.set(color);
  hood.position.set(-1.2, 1.05, 0);
  hood.castShadow = true;
  hood.receiveShadow = true;
  group.add(hood);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 1.4), bodyMat.clone());
  trunk.material.color.set(color);
  trunk.position.set(1.4, 1.05, 0);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 1.9), trimMat.clone());
  frontBumper.position.set(-2.25, 0.95, 0);
  frontBumper.castShadow = true;
  frontBumper.receiveShadow = true;
  group.add(frontBumper);

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 1.9), trimMat.clone());
  rearBumper.position.set(2.25, 0.95, 0);
  rearBumper.castShadow = true;
  rearBumper.receiveShadow = true;
  group.add(rearBumper);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 1.3), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));
  grille.position.set(-2.15, 1.1, 0);
  grille.castShadow = true;
  grille.receiveShadow = true;
  group.add(grille);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 1.03), glassMat.clone());
  windshield.position.set(-0.2, 1.75, 0);
  windshield.rotation.y = 0.04;
  group.add(windshield);

  const sideWindowL = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.42, 0.15), glassMat.clone());
  sideWindowL.position.set(0.35, 1.65, -0.65);
  group.add(sideWindowL);
  const sideWindowR = sideWindowL.clone();
  sideWindowR.position.z = 0.65;
  group.add(sideWindowR);

  const headlightL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.25), lightMat.clone());
  headlightL.position.set(-2.35, 1.05, -0.55);
  group.add(headlightL);
  const headlightR = headlightL.clone();
  headlightR.position.z = 0.55;
  group.add(headlightR);

  const taillightL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.22), new THREE.MeshStandardMaterial({ color: 0xff2c2c, emissive: 0x880000, emissiveIntensity: 0.2 }));
  taillightL.position.set(2.3, 1.0, -0.55);
  group.add(taillightL);
  const taillightR = taillightL.clone();
  taillightR.position.z = 0.55;
  group.add(taillightR);

  const wheels = [];
  const wheelPivots = [];
  const wheelPositions = [
    [-1.35, 0.55, 0.95],
    [-1.35, 0.55, -0.95],
    [1.35, 0.55, 0.95],
    [1.35, 0.55, -0.95],
  ];
  wheelPositions.forEach((pos) => {
    const pivot = new THREE.Group();
    pivot.position.set(pos[0], pos[1], pos[2]);
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial.clone());
    wheel.rotation.x = Math.PI / 2;   // lay the cylinder flat
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  });
  group.userData.wheels = wheels;
  group.userData.wheelPivots = wheelPivots;

  const chrome = new THREE.Mesh(new THREE.BoxGeometry(4.65, 0.12, 1.92), chromeMat.clone());
  chrome.position.set(0, 0.5, 0);
  chrome.castShadow = true;
  chrome.receiveShadow = true;
  group.add(chrome);

  return group;
}

// ===== Fire engine (big red pumper truck) =====
// A long fire truck: roomy cab up front with glowing headlights, a warning
// lightbar, a row of round valve knobs along each side, and a ladder rack on
// the roof. Exposes the same { wheels, wheelPivots } userData contract as
// createCar so the game loop can spin the wheels and steer the front pair.
const fireRed = new THREE.MeshStandardMaterial({ color: 0xd2201f, roughness: 0.55 });
const cream = new THREE.MeshStandardMaterial({ color: 0xf7efd6, roughness: 0.5 });
const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8 });
const knobMat = new THREE.MeshStandardMaterial({ color: 0xb9bec9, roughness: 0.4, metalness: 0.3 });
const ladderMat = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.5, metalness: 0.2 });
const warnRed = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2222, emissiveIntensity: 1.3 });
const warnAmber = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff9900, emissiveIntensity: 1.3 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2c2c, emissive: 0x880000, emissiveIntensity: 0.25 });
const truckWheelGeometry = new THREE.CylinderGeometry(0.62, 0.62, 0.36, 20);

// Little round knob used for the side valve knobs and the cab door handles.
function addKnob(group, x, y, z, r, mat) {
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 12), mat.clone());
  knob.rotation.x = Math.PI / 2;   // cylinder axis points out along Z
  knob.position.set(x, y, z);
  knob.castShadow = true;
  group.add(knob);
}

export function createFiretruck() {
  const group = new THREE.Group();

  // Small helper: adds a shadow-casting box to the group.
  const box = (w, h, d, mat, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.rotation.x = rx;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // ===== Cab (front, faces -X) =====
  box(3.1, 2.0, 2.35, fireRed, -2.55, 1.5, 0);
  box(3.0, 0.18, 2.2, cream, -2.55, 2.62, 0);          // cab roof
  box(1.9, 0.6, 2.0, glassMat, -3.3, 2.2, 0, 0, 0.5);   // slanted windshield
  box(2.0, 0.5, 0.12, glassMat, -2.55, 1.95, 1.2);      // side windows
  box(2.0, 0.5, 0.12, glassMat, -2.55, 1.95, -1.2);
  box(0.2, 0.85, 1.7, dark, -4.18, 0.95, 0);            // grille
  box(0.14, 0.32, 0.34, lightMat, -4.26, 1.25, -0.62);   // headlights
  box(0.14, 0.32, 0.34, lightMat, -4.26, 1.25, 0.62);
  box(0.4, 0.4, 2.5, cream, -4.3, 0.7, 0);              // front bumper

  // Small roof ladder over the front of the cab
  box(1.5, 0.07, 0.07, ladderMat, -3.0, 2.78, -0.42);
  box(1.5, 0.07, 0.07, ladderMat, -3.0, 2.78, 0.42);
  for (let x = -3.6; x <= -2.4; x += 0.4) box(0.06, 0.07, 0.84, ladderMat, x, 2.78, 0);

  // Warning lightbar at the back of the cab roof
  box(1.2, 0.16, 0.3, dark, -1.95, 2.8, 0);
  const lightRed = box(0.26, 0.14, 0.26, warnRed, -2.15, 2.92, 0);
  const lightAmber = box(0.26, 0.14, 0.26, warnAmber, -1.75, 2.92, 0);

  // Cab door handles (round knobs)
  addKnob(group, -3.0, 1.25, 1.2, 0.11, chromeMat);
  addKnob(group, -3.0, 1.25, -1.2, 0.11, chromeMat);

  // ===== Body (rear) =====
  box(4.9, 1.7, 2.3, fireRed, 1.45, 1.45, 0);
  box(4.9, 0.24, 2.34, cream, 1.45, 1.12, 0);     // cream stripe band
  box(4.6, 0.1, 2.15, cream, 1.45, 2.38, 0);      // roof deck
  box(5.0, 0.08, 0.32, cream, 0.3, 0.52, 1.35);   // running boards
  box(5.0, 0.08, 0.32, cream, 0.3, 0.52, -1.35);

  // Row of valve knobs along each side of the body
  for (let x = -0.4; x <= 3.4; x += 0.95) {
    addKnob(group, x, 1.15, 1.17, 0.09, knobMat);
    addKnob(group, x, 1.15, -1.17, 0.09, knobMat);
  }

  // Rear: taillights + bumper
  box(0.14, 0.22, 0.26, tailMat, 3.9, 1.35, -0.7);
  box(0.14, 0.22, 0.26, tailMat, 3.9, 1.35, 0.7);
  box(0.34, 0.34, 2.3, cream, 4.05, 0.7, 0);

  // ===== Long roof ladder over the body =====
  box(4.7, 0.09, 0.09, ladderMat, 1.45, 2.55, -0.55);
  box(4.7, 0.09, 0.09, ladderMat, 1.45, 2.55, 0.55);
  for (let x = -0.8; x <= 3.7; x += 0.45) {
    if (Math.abs(x - 1.45) < 0.7) continue;   // leave room for the deck gun
    box(0.07, 0.09, 1.1, ladderMat, x, 2.55, 0);
  }

  // ===== Big roof deck-gun nozzle (aimed by the firefighter AI) =====
  const nozzlePivot = new THREE.Group();
  nozzlePivot.position.set(1.45, 2.55, 0);
  const nozzleMount = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.4, 14), dark.clone());
  nozzleMount.position.y = 0.2;
  nozzleMount.castShadow = true;
  nozzlePivot.add(nozzleMount);
  const nozzleBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 1.6, 14), chromeMat.clone());
  nozzleBarrel.position.y = 1.0;
  nozzleBarrel.castShadow = true;
  nozzlePivot.add(nozzleBarrel);
  const nozzleCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.18, 14), fireRed.clone());
  nozzleCollar.position.y = 1.62;
  nozzlePivot.add(nozzleCollar);
  group.add(nozzlePivot);

  // ===== Wheels: 3 axles, front pair steers =====
  const wheels = [];
  const wheelPivots = [];
  const wheelPositions = [
    [-2.7, 0.62, 1.18],
    [-2.7, 0.62, -1.18],
    [0.3, 0.62, 1.18],
    [0.3, 0.62, -1.18],
    [2.7, 0.62, 1.18],
    [2.7, 0.62, -1.18],
  ];
  wheelPositions.forEach((pos) => {
    const pivot = new THREE.Group();
    pivot.position.set(pos[0], pos[1], pos[2]);
    const wheel = new THREE.Mesh(truckWheelGeometry, wheelMaterial.clone());
    wheel.rotation.x = Math.PI / 2;   // lay the cylinder flat
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    // hubcaps on both faces
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 12), chromeMat.clone());
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.19;
    pivot.add(hub);
    const hubB = hub.clone();
    hubB.position.z = -0.19;
    pivot.add(hubB);
    group.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  });
  group.userData.wheels = wheels;
  group.userData.wheelPivots = wheelPivots;
  group.userData.warningLights = [lightRed, lightAmber];
  group.userData.nozzlePivot = nozzlePivot;

  return group;
}

// ===== 1957 Chevy Bel Air Taxi (classic checkered cab) =====
// A yellow taxi with round headlights, chrome bezels, sweeping tailfins,
// a checkerboard strip along the sides, and an illuminated taxi roof sign.
// Exposes the same { wheels, wheelPivots } contract as createCar.
const taxiYellow = new THREE.MeshStandardMaterial({ color: 0xF5C518, roughness: 0.55 });
const taxiBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
const taxiWhite = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 });
const taxiSignMat = new THREE.MeshStandardMaterial({ color: 0xFFFDE7, emissive: 0xFFEB3B, emissiveIntensity: 0.8 });
const taxiRedFin = new THREE.MeshStandardMaterial({ color: 0xD32F2F, roughness: 0.5 });

export function createChevy57Taxi() {
  const group = new THREE.Group();
  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Yellow body panels
  box(4.3, 1.0, 1.8, taxiYellow, 0, 1.05, 0);
  box(1.9, 0.7, 1.4, taxiYellow, -1.2, 1.05, 0);    // hood
  box(1.7, 0.65, 1.4, taxiYellow, 1.4, 1.05, 0);     // trunk
  box(2.9, 0.75, 1.2, taxiYellow, 0.35, 1.7, 0);     // roof

  // Windshield + side windows
  box(1.9, 0.55, 1.03, glassMat, -0.2, 1.75, 0, 0, 0.04);
  box(2.3, 0.42, 0.15, glassMat, 0.35, 1.65, -0.65);
  box(2.3, 0.42, 0.15, glassMat, 0.35, 1.65, 0.65);

  // Chrome bumpers
  box(0.35, 0.3, 1.9, chromeMat, -2.25, 0.95, 0);    // front
  box(0.35, 0.3, 1.9, chromeMat, 2.25, 0.95, 0);     // rear

  // Wide chrome grille ('57 Chevy signature)
  box(0.22, 0.5, 1.5, chromeMat, -2.15, 1.05, 0);

  // Round headlights + chrome bezels (spheres so they look round from every angle)
  const hlGeom = new THREE.SphereGeometry(0.15, 16, 12);
  const bezelGeom = new THREE.TorusGeometry(0.2, 0.04, 8, 16);
  for (const z of [-0.58, 0.58]) {
    const hl = new THREE.Mesh(hlGeom, lightMat.clone());
    hl.position.set(-2.38, 1.15, z);
    group.add(hl);
    const bezel = new THREE.Mesh(bezelGeom, chromeMat.clone());
    bezel.position.set(-2.42, 1.15, z);
    bezel.rotation.y = Math.PI / 2;
    group.add(bezel);
  }

  // Taillights
  for (const z of [-0.55, 0.55]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xff2c2c, emissive: 0x880000, emissiveIntensity: 0.2 }));
    tl.position.set(2.3, 1.0, z);
    group.add(tl);
  }

  // ===== Tailfins =====
  for (const z of [-0.92, 0.92]) {
    box(1.4, 0.65, 0.12, taxiYellow, 1.6, 1.55, z);   // fin body
    box(1.4, 0.06, 0.16, chromeMat, 1.6, 1.9, z);      // chrome trim on top
    box(0.35, 0.3, 0.14, taxiRedFin, 2.15, 1.55, z);   // red fin tip
  }

  // ===== Checkerboard strip =====
  const checkerSize = 0.32, checkerH = 0.28, numCheckers = 10;
  for (let i = 0; i < numCheckers; i++) {
    const cx = -1.6 + i * (checkerSize + 0.04);
    const mat = i % 2 === 0 ? taxiBlack : taxiWhite;
    box(checkerSize, checkerH, 0.06, mat, cx, 0.85, -0.92);  // left
    box(checkerSize, checkerH, 0.06, mat, cx, 0.85, 0.92);   // right
  }

  // Taxi roof sign
  box(0.7, 0.22, 0.45, taxiSignMat, 0, 2.2, 0);
  box(0.08, 0.1, 0.3, chromeMat, -0.2, 2.05, 0);  // support leg
  box(0.08, 0.1, 0.3, chromeMat, 0.2, 2.05, 0);

  // Chrome trim strip along body
  box(4.65, 0.1, 1.92, chromeMat, 0, 0.5, 0);

  // ===== Wheels with chrome hubcaps =====
  const wheels = [], wheelPivots = [];
  for (const pos of [[-1.35, 0.55, 0.95], [-1.35, 0.55, -0.95],
                      [1.35, 0.55, 0.95],  [1.35, 0.55, -0.95]]) {
    const pivot = new THREE.Group();
    pivot.position.set(pos[0], pos[1], pos[2]);
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial.clone());
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 12), chromeMat.clone());
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.18;
    pivot.add(hub);
    group.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  }
  group.userData.wheels = wheels;
  group.userData.wheelPivots = wheelPivots;
  return group;
}

// ===== 1968 VW Bug (classic Beetle) =====
// Almost entirely round: ellipsoid body, dome roof, bulbous fenders,
// cylinder bumpers, torus trim — no flat rectangles. The real Beetle is
// a collection of curves, and this model tries to honor that.
const bugMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.55 });
const bugChrome = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.35, metalness: 0.4 });
const bugDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 });

export function createVWBug(color) {
  const group = new THREE.Group();
  const cMat = (mat) => mat.clone();

  // Helper: add a sphere-based mesh (no boxes in this car!)
  const sph = (r, segW, segH, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, segW, segH), cMat(mat));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Helper: add a cylinder-based mesh
  const cyl = (rt, rb, h, seg, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), cMat(mat));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Helper: add a torus ring
  const torus = (R, r, segT, segR, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, segR, segT), cMat(mat));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const bc = bugMat.clone();
  bc.color.set(color);

  // ===== Main body — a large horizontal ellipsoid, the Beetle "blob" =====
  sph(1.0, 24, 18, bc, 0, 1.0, 0, 2.0, 0.7, 1.0);

  // ===== Front nose — a smaller sphere that blends into the body =====
  sph(0.65, 20, 14, bc, -1.55, 0.85, 0, 1.1, 0.72, 1.05);

  // ===== Rear engine deck — rounded lump at the back =====
  sph(0.6, 18, 14, bc, 1.45, 0.88, 0, 1.0, 0.65, 1.05);

  // ===== Dome roof — the entire dome is one big opaque window =====
  const domeGlass = new THREE.MeshStandardMaterial({ color: 0x1f2b3f, roughness: 0.4 });
  const dome = sph(0.8, 24, 16, domeGlass, 0.1, 1.45, 0, 1.65, 0.95, 1.1);
  // Cut off the bottom half so it sits as a dome on the body
  dome.geometry = new THREE.SphereGeometry(0.8, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
  dome.position.set(0.1, 1.42, 0);

  // ===== Front fenders — big bulbous spheres over the front wheels =====
  for (const z of [-0.85, 0.85]) {
    sph(0.46, 16, 12, bc, -1.2, 0.6, z, 1.15, 0.75, 0.7);
  }

  // ===== Rear fenders — big bulbous spheres over the rear wheels =====
  for (const z of [-0.85, 0.85]) {
    sph(0.46, 16, 12, bc, 1.2, 0.6, z, 1.15, 0.75, 0.7);
  }

  // ===== Front bumper — a rounded cylinder bar spanning the car width =====
  cyl(0.11, 0.11, 1.85, 16, bugChrome, -1.85, 0.65, 0, Math.PI / 2, 0, 0);
  // Round bumper end-caps
  for (const z of [-0.92, 0.92]) {
    sph(0.11, 10, 8, bugChrome, -1.85, 0.65, z);
  }

  // ===== Rear bumper — rounded cylinder bar spanning the car width =====
  cyl(0.11, 0.11, 1.85, 16, bugChrome, 1.85, 0.65, 0, Math.PI / 2, 0, 0);
  for (const z of [-0.92, 0.92]) {
    sph(0.11, 10, 8, bugChrome, 1.85, 0.65, z);
  }

  // ===== Running boards — thin rounded strips along each side =====
  cyl(0.04, 0.04, 2.2, 12, bugDark, 0, 0.42, -0.92, 0, 0, Math.PI / 2);
  cyl(0.04, 0.04, 2.2, 12, bugDark, 0, 0.42, 0.92, 0, 0, Math.PI / 2);

  // ===== Big round headlights with chrome bezels =====
  const hlGeom = new THREE.SphereGeometry(0.18, 16, 12);
  const bezelGeom = new THREE.TorusGeometry(0.22, 0.045, 8, 20);
  for (const z of [-0.55, 0.55]) {
    const hl = new THREE.Mesh(hlGeom, lightMat.clone());
    hl.position.set(-2.12, 1.05, z);
    group.add(hl);
    const bezel = new THREE.Mesh(bezelGeom, bugChrome.clone());
    bezel.position.set(-2.16, 1.05, z);
    bezel.rotation.y = Math.PI / 2;
    group.add(bezel);
  }

  // ===== Small round turn signals (orange spheres on fender tops) =====
  for (const z of [-0.72, 0.72]) {
    sph(0.06, 10, 8,
      new THREE.MeshStandardMaterial({ color: 0xff8c00, emissive: 0xff6600, emissiveIntensity: 0.5 }),
      -1.65, 1.1, z);
  }



  // ===== VW emblem (torus circle on front nose) =====
  torus(0.12, 0.025, 18, 8, bugChrome, -1.95, 1.1, 0, 0, Math.PI / 2, 0);

  // ===== Rear engine vents — small torus rings instead of slots =====
  for (let i = 0; i < 3; i++) {
    torus(0.06, 0.015, 10, 6, bugDark, 1.72, 1.0 + i * 0.1, 0, 0, Math.PI / 2, 0);
  }

  // ===== Taillights — small round red spheres =====
  for (const z of [-0.55, 0.55]) {
    sph(0.09, 12, 10,
      new THREE.MeshStandardMaterial({ color: 0xff2c2c, emissive: 0x880000, emissiveIntensity: 0.3 }),
      1.98, 0.95, z);
  }



  // ===== Wheels — same design as the '57 Chevy taxi =====
  const wheels = [], wheelPivots = [];
  for (const pos of [[-1.2, 0.48, 0.92], [-1.2, 0.48, -0.92],
                      [1.2, 0.48, 0.92],  [1.2, 0.48, -0.92]]) {
    const pivot = new THREE.Group();
    pivot.position.set(pos[0], pos[1], pos[2]);
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial.clone());
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 12), chromeMat.clone());
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.18;
    pivot.add(hub);
    group.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  }
  group.userData.wheels = wheels;
  group.userData.wheelPivots = wheelPivots;
  return group;
}

// ===== Traffic cars (reuse createCar) =====
// The roads form a plus: the main road runs along X (z in [-12,12]) and the
// cross road runs along Z (x in [-12,12]). Each traffic car drives straight
// along one lane and wraps at the map edge — they don't chase the player.
// `axis` is the lane's travel axis, `off` the lane offset from road center,
// `dir` is +1/-1 along that axis, `speed` is units/second.
const LANES = [
  { axis: 'x', off: -5.5, dir: -1, speed: 4.5 },  // main road, heading -X
  { axis: 'x', off: 5.5, dir: 1, speed: 5.2 },    // main road, heading +X
  { axis: 'z', off: -5.5, dir: 1, speed: 4.8 },   // cross road, heading +Z
  { axis: 'z', off: 5.5, dir: -1, speed: 4.2 },   // cross road, heading -Z
];
const TRAFFIC_COLORS = [
  0x33415c, 0x7f5539, 0x9c2b2b, 0x283618, 0x5f0f40, 0x3d5a80,
  0x9c6644, 0x606c38, 0x556b2f, 0x8d6e63, 0x4a6fa5, 0x7b5e3b,
];

export function addTrafficCars(scene) {
  const cars = [];
  let colorIdx = 0;
  for (const lane of LANES) {
    // Spread a row of cars down the lane; they all share the lane speed, so
    // the gaps between them stay even forever (same direction, same speed).
    for (let s = -70; s <= 70; s += 20) {
      // Rotate through car types: regular, VW Bug, regular, '57 Chevy taxi
      const typeIdx = colorIdx % 4;
      let mesh;
      if (typeIdx === 1) {
        mesh = createVWBug(TRAFFIC_COLORS[colorIdx % TRAFFIC_COLORS.length]);
      } else if (typeIdx === 3) {
        mesh = createChevy57Taxi();
      } else {
        mesh = createCar(TRAFFIC_COLORS[colorIdx % TRAFFIC_COLORS.length]);
      }
      colorIdx++;
      if (lane.axis === 'x') {
        mesh.position.set(s, 0.15, lane.off);
        mesh.rotation.y = lane.dir === -1 ? 0 : Math.PI;
      } else {
        mesh.position.set(lane.off, 0.15, s);
        mesh.rotation.y = lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      }
      scene.add(mesh);
      // homeLat = the lane offset a car eases back to after being shoved aside.
      cars.push({ mesh, axis: lane.axis, dir: lane.dir, speed: lane.speed, speedCur: lane.speed, homeLat: lane.off, shove: 0, knock: null });
    }
  }
  return cars;
}
