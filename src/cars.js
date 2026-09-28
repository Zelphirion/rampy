import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { makePerson } from './people.js';

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

// ===== Little car (underground follower) =====
// A smaller, cuter copy of the player car that follows you into the
// underground through the spiral tunnel. Shares the same body + wheel rig
// (so the game loop can spin the wheels), just scaled down so it reads as a
// "little car" next to the full-size player car.
export function createLittleCar(color) {
  const group = createCar(color);
  group.scale.setScalar(0.55);
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
const warnWhite = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xeef4ff, emissiveIntensity: 1.3 });
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

  // Warning lightbar across the cab roof (driver door ↔ passenger door)
  box(0.32, 0.16, 1.8, dark, -2.55, 2.8, 0);
  const lightRed = box(0.28, 0.16, 0.32, warnRed, -2.55, 2.92, -0.58);
  const lightAmber = box(0.28, 0.16, 0.32, warnRed, -2.55, 2.92, 0.58);

  // Extra emergency lighting (all flashed by firetruck.js via userData):
  // yellow markers down both sides of the body...
  const sideYellow = [];
  for (const sz of [1, -1]) {
    for (const sx of [-0.55, 1.45, 3.45]) {
      sideYellow.push(box(0.55, 0.16, 0.1, warnAmber, sx, 1.95, sz * 1.17));
    }
  }

  // ...a full row of red strobes across the rear face above the taillights...
  const rearRed = [];
  for (const rz of [-0.95, -0.32, 0.32, 0.95]) {
    rearRed.push(box(0.16, 0.3, 0.34, warnRed, 3.94, 2.05, rz));
  }

  // ...and white flashers on the front face above the headlights.
  const frontWhite = [];
  for (const fz of [-0.85, 0.85]) {
    frontWhite.push(box(0.16, 0.3, 0.42, warnWhite, -4.14, 1.78, fz));
  }

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
  // Red lights split into left/right halves so they can strobe against each
  // other; yellows and whites flash as their own groups.
  group.userData.warningLights = {
    redLeft: [lightRed, ...rearRed.filter((l) => l.position.z < 0)],
    redRight: [lightAmber, ...rearRed.filter((l) => l.position.z > 0)],
    yellow: sideYellow,
    white: frontWhite,
  };
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

// ===== Steamroller (yellow road roller) =====
// A heavy road roller: a big flat drum up front that flattens the player car
// when it drives over it, a cab at the rear, and a smokestack. Exposes the
// same { wheels, wheelPivots } userData contract as createCar so the game
// loop can spin the rear wheels. The front drum stays fixed.
const rollerYellow = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.55 });
const rollerDark = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 });

export function createSteamroller() {
  const group = new THREE.Group();
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

  // ===== Big flat drum (front, faces -X) =====
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.5, 24), rollerYellow.clone());
  drum.rotation.order = 'YXZ';   // spin via rotation.y (traffic wheel roll) without tilting the axis
  drum.rotation.x = Math.PI / 2;   // lay cylinder on its side, axis along Z
  drum.position.set(-2.3, 1.15, 0);
  drum.castShadow = true;
  drum.receiveShadow = true;
  group.add(drum);
  // Drum axle hub
  const drumHub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.6, 12), rollerDark.clone());
  drumHub.rotation.x = Math.PI / 2;
  drumHub.position.set(-2.3, 1.15, 0);
  group.add(drumHub);

  // ===== Engine housing (between drum and cab) =====
  box(1.6, 1.0, 2.2, rollerYellow, -0.85, 1.0, 0);
  box(1.6, 0.15, 2.3, rollerDark, -0.85, 0.5, 0);   // chassis plate

  // ===== Cab (rear) =====
  box(2.2, 1.7, 2.1, rollerYellow, 1.35, 1.7, 0);
  box(2.2, 0.15, 2.15, rollerDark, 1.35, 2.62, 0);   // cab roof
  box(1.6, 0.55, 0.12, glassMat, 1.35, 2.0, 1.06);   // side windows
  box(1.6, 0.55, 0.12, glassMat, 1.35, 2.0, -1.06);
  box(0.9, 0.5, 1.6, glassMat, 2.2, 2.0, 0);         // rear window

  // ===== Smokestack =====
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 12), rollerDark.clone());
  stack.position.set(0.35, 2.6, 0);
  stack.castShadow = true;
  group.add(stack);
  const stackCap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), chromeMat.clone());
  stackCap.position.set(0.35, 3.42, 0);
  group.add(stackCap);

  // ===== Rear wheels (two small) =====
  const wheels = [];
  const wheelPivots = [];
  for (const z of [-1.0, 1.0]) {
    const pivot = new THREE.Group();
    pivot.position.set(2.3, 0.55, z);
    const wheel = new THREE.Mesh(truckWheelGeometry, wheelMaterial.clone());
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  }
  // The drum stays fixed — it doesn't spin with the rear wheels.
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

// ===== Monster truck: lifted purple Ford F-150 (Big Foot style) =====
// A square-jawed 70s-80s F-150 regular cab: long flat hood, quad round
// headlights in a wide chromed grille, raked windshield, an open bed with a
// tailgate, a brush bar out front. Then it's LIFTED right off the axles on
// enormous off-road tires, with a pair of tall chrome smoke stacks belching
// out of the bed behind the cab. Still purple.
// Front faces -X like every car. Exposes the same
// { wheels, wheelPivots } contract so the game loop can spin + steer it.
const monsterPurple = new THREE.MeshStandardMaterial({ color: 0x7b2fbf, roughness: 0.6 });
const monsterDark = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.8 });
const monsterKnob = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
const monsterChrome = new THREE.MeshStandardMaterial({ color: 0xe4e9f0, roughness: 0.15, metalness: 0.9 });
const monsterRed = new THREE.MeshStandardMaterial({ color: 0xd42a2a, emissive: 0xaa1414, emissiveIntensity: 0.7 });

// A single giant off-road tire: a fat cylinder wrapped in two staggered rows
// of chunky tread lugs, with a chrome beadlock ring on each sidewall. Lugs
// are children of the wheel, so they roll with it.
function makeKnobbyWheel(pivot, r, width, lugs = 14) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 20), wheelMaterial.clone());
  wheel.rotation.x = Math.PI / 2;
  wheel.castShadow = true;
  wheel.receiveShadow = true;
  for (let row = -1; row <= 1; row += 2) {
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2 + (row > 0 ? 0 : Math.PI / lugs);
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, width * 0.44), monsterKnob.clone());
      lug.position.set(Math.cos(a) * (r - 0.01), 0, Math.sin(a) * (r - 0.01));
      lug.rotation.y = -a + row * 0.35;
      lug.castShadow = true;
      wheel.add(lug);
    }
  }
  const bead = new THREE.Mesh(new THREE.TorusGeometry(r * 0.52, 0.05, 6, 18), monsterChrome.clone());
  bead.rotation.x = Math.PI / 2;
  bead.position.y = width / 2 + 0.02;
  wheel.add(bead);
  const beadB = bead.clone();
  beadB.position.y = -width / 2 - 0.02;
  wheel.add(beadB);
  pivot.add(wheel);
  return wheel;
}

export function createMonsterTruck() {
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
  // A chrome tube swept through a smooth curve — nerf bars, the brush bar
  // and the rounded heat-shield loops round the stacks.
  const tube = (pts, r, mat = monsterChrome) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 6, r, 8, false), mat.clone());
    m.castShadow = true;
    group.add(m);
    return m;
  };

  // ===== Chassis, cranked way up over the axles =====
  const AXLE_Y = 1.15;
  box(5.2, 0.28, 1.15, monsterDark, 0.1, 1.85, 0);            // cross-member slab
  for (const sz of [-0.52, 0.52]) {
    box(5.2, 0.14, 0.16, monsterDark, 0.1, 1.9, sz);           // frame rails
  }
  // Live axles, diffs, shocks — you can see the lift from the side
  for (const ax of [-1.55, 1.9]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.6, 12), monsterDark.clone());
    axle.rotation.x = Math.PI / 2;
    axle.position.set(ax, AXLE_Y, 0);
    axle.castShadow = true;
    group.add(axle);
    const diff = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), monsterDark.clone());
    diff.position.set(ax, AXLE_Y, 0);
    diff.castShadow = true;
    group.add(diff);
    for (const sz of [-0.85, 0.85]) {
      const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.95, 10), monsterChrome.clone());
      shock.position.set(ax + (ax < 0 ? -0.15 : 0.15), AXLE_Y + 0.5, sz);
      shock.rotation.z = (ax < 0 ? 1 : -1) * 0.12;
      shock.castShadow = true;
      group.add(shock);
    }
  }

  // ===== The F-150 body: cab, long flat hood, open bed =====
  box(3.6, 0.9, 2.2, monsterPurple, -0.6, 2.55, 0);           // lower slab, x -2.4..1.2
  box(1.55, 0.34, 1.95, monsterPurple, -1.6, 3.06, 0);        // long flat hood on top
  box(0.62, 0.18, 0.9, monsterDark, -1.5, 3.3, 0);            // hood scoop
  box(2.0, 0.85, 2.05, monsterPurple, 0.05, 3.42, 0);         // cab greenhouse
  box(1.95, 0.14, 2.0, monsterDark, 0.05, 3.9, 0);            // roof
  box(0.1, 0.8, 1.85, glassMat, -0.95, 3.4, 0, 0, 0, -0.3);  // raked windshield
  box(1.5, 0.6, 0.1, glassMat, 0.1, 3.4, 1.03);               // door glass
  box(1.5, 0.6, 0.1, glassMat, 0.1, 3.4, -1.03);
  box(0.1, 0.55, 1.7, glassMat, 1.05, 3.4, 0);                // backlight
  for (const sz of [-1.11, 1.11]) {                            // door seams + handles
    box(0.07, 0.8, 0.07, monsterDark, -0.3, 2.6, sz);
    box(0.24, 0.07, 0.07, monsterChrome, -0.42, 2.95, sz * 1.02);
  }
  for (const sz of [-1, 1]) {                                  // mirror arms
    box(0.06, 0.06, 0.5, monsterChrome, -1.0, 3.5, sz * 1.25);
    box(0.1, 0.34, 0.14, monsterDark, -1.0, 3.45, sz * 1.5);
  }

  // ===== The bed: floor, walls, tailgate =====
  box(1.7, 0.14, 2.0, monsterDark, 2.0, 2.38, 0);             // bed floor
  for (const sz of [-1, 1]) {
    box(1.7, 0.72, 0.16, monsterPurple, 2.0, 2.81, sz * 1.02);  // bed sides
    box(1.7, 0.12, 0.24, monsterDark, 2.0, 3.21, sz * 1.02);   // bed rail caps
  }
  box(0.16, 0.72, 2.0, monsterPurple, 2.85, 2.81, 0);          // tailgate
  box(0.06, 0.45, 0.06, monsterDark, 2.9, 2.81, 0);            // tailgate seam
  box(0.5, 0.09, 0.09, monsterChrome, 2.92, 2.81, 0);          // tailgate handle
  for (const sz of [-0.75, 0.75]) {
    box(0.12, 0.34, 0.28, monsterRed, 2.94, 2.85, sz);         // tail lights
  }

  // ===== Front end: quad round headlights in a wide chromed grille =====
  box(0.1, 1.0, 2.05, monsterChrome, -2.4, 2.72, 0);           // chrome grille surround
  box(0.16, 0.86, 1.3, monsterDark, -2.5, 2.72, 0);           // dark grille mesh
  for (let i = 0; i < 5; i++) {                                // horizontal bars
    box(0.07, 0.07, 1.25, monsterChrome, -2.58, 2.45 + i * 0.135, 0);
  }
  box(0.09, 0.34, 0.5, monsterChrome, -2.6, 2.72, 0);          // centre badge
  for (const sz of [-1, 1]) {                                  // two round lamps a side
    for (const dy of [-0.26, 0.26]) {
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 14), monsterChrome.clone());
      bezel.rotation.z = Math.PI / 2;
      bezel.position.set(-2.56, 2.72 + dy, sz * 0.83);
      bezel.castShadow = true;
      group.add(bezel);
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 14), lightMat.clone());
      bulb.rotation.z = Math.PI / 2;
      bulb.position.set(-2.62, 2.72 + dy, sz * 0.83);
      group.add(bulb);
    }
  }
  box(0.34, 0.3, 2.25, monsterChrome, -2.66, 2.2, 0);          // chromed bumper
  for (const sz of [-0.75, 0.75]) {                            // brush bar standoffs
    box(0.5, 0.12, 0.12, monsterChrome, -2.9, 2.2, sz);
  }
  tube([[-2.98, 2.55, -0.8], [-3.05, 2.2, -0.4], [-3.05, 2.2, 0.4], [-2.98, 2.55, 0.8]], 0.07);
  for (const sz of [-0.42, 0.42]) {
    box(0.1, 0.7, 0.1, monsterChrome, -3.03, 2.38, sz);
  }

  // ===== Flared fenders + side nerf bars over the giant tires =====
  for (const wx of [-1.55, 1.9]) {
    for (const sz of [-1, 1]) {
      box(1.7, 0.26, 1.15, monsterPurple, wx, 2.42, sz * 1.25);   // fender top
      box(1.7, 0.6, 0.2, monsterPurple, wx, 2.2, sz * 1.8);       // outer flare
      box(0.2, 0.5, 0.5, monsterPurple, wx - 0.85, 2.15, sz * 1.25); // fender front lip
      box(0.2, 0.5, 0.5, monsterPurple, wx + 0.85, 2.15, sz * 1.25); // fender rear lip
    }
    tube([[wx - 0.7, 1.95, 1.95], [wx - 0.5, 1.7, 2.2], [wx + 0.5, 1.7, 2.2], [wx + 0.7, 1.95, 1.95]], 0.07);
    tube([[wx - 0.7, 1.95, -1.95], [wx - 0.5, 1.7, -2.2], [wx + 0.5, 1.7, -2.2], [wx + 0.7, 1.95, -1.95]], 0.07);
  }


  // ===== Twin smoke stacks rising out of the bed behind the cab =====
  for (const sz of [-1, 1]) {
    // Chrome mount bolting the stack down through the bed floor
    box(0.34, 0.78, 0.34, monsterChrome, 1.5, 2.82, sz * 0.55);
    tube([[1.5, 3.14, sz * 0.55], [1.32, 3.42, sz * 0.76], [1.5, 3.72, sz * 0.6], [1.72, 3.5, sz * 0.5]], 0.06);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 1.7, 14), monsterChrome.clone());
    stack.position.set(1.5, 4.0, sz * 0.55);
    stack.castShadow = true;
    group.add(stack);
    for (const cy of [3.5, 4.5]) {                            // chrome clamp bands
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 14), monsterDark.clone());
      band.rotation.x = Math.PI / 2;
      band.position.set(1.5, cy, sz * 0.55);
      group.add(band);
    }
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.14, 14), monsterDark.clone());
    collar.position.set(1.5, 4.86, sz * 0.55);
    collar.castShadow = true;
    group.add(collar);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.16, 0.3, 14, 1, true), monsterChrome.clone());
    tip.position.set(1.5, 5.05, sz * 0.55);                    // flared tip, raked back
    tip.rotation.z = -0.18;
    tip.castShadow = true;
    group.add(tip);
  }
  // Roof light bar
  box(0.9, 0.12, 1.7, monsterDark, 0.05, 4.02, 0);
  for (const sz of [-0.5, 0.5]) {
    box(0.14, 0.2, 0.4, lightMat, -0.45, 4.14, sz);
  }

  // ===== Four enormous off-road tires =====
  const wheels = [];
  const wheelPivots = [];
  for (const pos of [[-1.55, AXLE_Y, 1.22], [-1.55, AXLE_Y, -1.22],
                      [1.9, AXLE_Y, 1.22],   [1.9, AXLE_Y, -1.22]]) {
    const pivot = new THREE.Group();
    pivot.position.set(pos[0], pos[1], pos[2]);
    const wheel = makeKnobbyWheel(pivot, 1.05, 0.85);
    // Chrome hub cap on the outer face so the tire reads as spinning
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), monsterChrome.clone());
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.45;
    pivot.add(hub);
    const hubB = hub.clone();
    hubB.position.z = -0.45;
    pivot.add(hubB);
    group.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  }
  group.userData.wheels = wheels;
  group.userData.wheelPivots = wheelPivots;
  return group;
}

// ===== School bus (classic yellow) =====
// A long yellow bus built as a SHELL, not a solid block: the window band is
// left open, so every window — windshield, side windows and the back one —
// is a genuine hole you can see straight through, framed by the pillars
// between them. Red marker lights sit low over the windshield and above the
// rear door like eyebrows (not on the roof), the headlights are down on the
// hood, and the emergency-exit door is a pair of leaves on the BACK.
// Front faces -X like every car. Exposes { wheels, wheelPivots }.
const busYellow = new THREE.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.55 });
const busBlack = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 });
const busChrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.35, metalness: 0.5 });
const busRed = new THREE.MeshStandardMaterial({ color: 0xe03131, emissive: 0xcc2020, emissiveIntensity: 0.8 });
const busDoorYellow = new THREE.MeshStandardMaterial({ color: 0xf9c23a, roughness: 0.5 });
const busSeat = new THREE.MeshStandardMaterial({ color: 0x2c4450, roughness: 0.8 });

// Shell dimensions — the bus is x ∈ [-3.05, 3.25], y ∈ [0.5, 2.8], z ∈ ±1.125.
const BUS_FRONT = -3.05;
const BUS_BACK = 3.25;
const BUS_FLOOR = 0.5;
const BUS_SILL = 1.75;    // top of the lower body = bottom of the window band
const BUS_HEAD = 2.55;    // bottom of the roof = top of the window band
const BUS_ROOF = 2.8;
const BUS_HALF_W = 1.125;

export function createSchoolBus() {
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
  // A panel spanning the whole window band in Y, sized to a slice of X.
  const band = (x0, x1, mat) => box(x1 - x0, BUS_HEAD - BUS_SILL, BUS_HALF_W * 2, mat, (x0 + x1) / 2, (BUS_SILL + BUS_HEAD) / 2, 0);

  // ===== Lower body + roof; the middle is left open =====
  // The lower body side panels stop at x=-2.35, right at the hood's rear edge
  // (-3.65..-2.35), so the two yellow slabs meet in a clear butt joint instead
  // of overlapping for ~0.7 units — that overlap made coplanar faces z-fight
  // and flicker through the open windshield/side window holes.
  box(BUS_BACK + 2.35, BUS_SILL - BUS_FLOOR, BUS_HALF_W * 2, busYellow, (BUS_BACK - 2.35) / 2, (BUS_FLOOR + BUS_SILL) / 2, 0);
  box(BUS_BACK - BUS_FRONT, BUS_ROOF - BUS_HEAD, BUS_HALF_W * 2, busYellow, (BUS_FRONT + BUS_BACK) / 2, (BUS_HEAD + BUS_ROOF) / 2, 0);
  // Black rub rail along the waist (same shortened run as the body below it).
  // Kept with its top face well UNDER the lower-body slab's top face (1.75) —
  // a rail ending flush at the slab top made two coplanar yellow plane-faces
  // z-fight and shimmer straight through every window hole, exactly where the
  // seats are.
  box(BUS_BACK + 2.35, 0.12, BUS_HALF_W * 2 + 0.04, busBlack, (BUS_BACK - 2.35) / 2, BUS_SILL - 0.13, 0);

  // ===== Window band: pillars only, so each gap is an open hole =====
  const PILLAR = 0.4;
  const WINDOW_X0 = -2.4;
  const WINDOW_X1 = 2.6;
  const WINDOW_W = (WINDOW_X1 - WINDOW_X0 - 3 * PILLAR) / 4;
  // Front end pillar — split into a low panel, a header and two corner posts
  // so the windshield is a hole too.
  const frontC = -2.725;
  box(0.65, 0.3, BUS_HALF_W * 2, busYellow, frontC, BUS_SILL + 0.15, 0);          // cowl below glass
  box(0.65, BUS_ROOF - BUS_HEAD, BUS_HALF_W * 2, busYellow, frontC, (BUS_HEAD + BUS_ROOF) / 2, 0);  // header
  for (const sz of [-1, 1]) {                                                        // corner posts
    box(0.65, BUS_HEAD - BUS_SILL - 0.3, 0.35, busYellow, frontC, (BUS_SILL + 0.3 + BUS_HEAD) / 2, sz * 0.95);
  }
  // Rear end pillar — same treatment, leaves the back window open
  const rearC = 2.925;
  box(0.65, 0.3, BUS_HALF_W * 2, busYellow, rearC, BUS_SILL + 0.15, 0);
  box(0.65, BUS_ROOF - BUS_HEAD, BUS_HALF_W * 2, busYellow, rearC, (BUS_HEAD + BUS_ROOF) / 2, 0);
  for (const sz of [-1, 1]) {
    box(0.65, BUS_HEAD - BUS_SILL - 0.3, 0.35, busYellow, rearC, (BUS_SILL + 0.3 + BUS_HEAD) / 2, sz * 0.95);
  }
  // Three pillars dividing the side into four open windows
  for (let i = 0; i < 3; i++) {
    const px = WINDOW_X0 + WINDOW_W + i * (WINDOW_W + PILLAR);
    band(px, px + PILLAR, busYellow);
  }
  // ===== Hood / nose with the headlights dropped down low =====
  box(1.3, BUS_SILL - BUS_FLOOR, BUS_HALF_W * 2, busYellow, -3.0, (BUS_FLOOR + BUS_SILL) / 2, 0);

  // ===== Interior bench seats, one pair under each side-window hole =====
  // The bus is a hollow shell, so each open window would otherwise frame just
  // a bare yellow floor strip with the old z-fighting seam. Two-person benches
  // (fat cushion + upright backrest in dark vinyl) sit on the slab in every
  // window bay, well clear of the pillars. The backrest's front face is held
  // a whisker behind the cushion's rear (non-coplanar, tiny gap) so the joint
  // never z-fights either.
  const seatXs = [-1.925, -0.575, 0.775, 2.125];
  for (const sx of seatXs) {
    box(0.5, 0.14, 1.1, busSeat, sx, BUS_SILL + 0.09, 0);          // cushion (hovers 0.01 over the floor so its base never z-fights the slab)
    box(0.1, 0.5, 1.1, busSeat, sx + 0.35, BUS_SILL + 0.39, 0);     // backrest
  }
  box(0.18, 0.9, 2.1, busBlack, -3.72, 1.0, 0);                       // grille
  for (let i = 0; i < 4; i++) {                                        // grille slats
    box(0.06, 0.07, 2.0, busChrome, -3.8, 0.72 + i * 0.19, 0);
  }
  // Headlights sitting on the hood line, well below the window band
  for (const sz of [-1, 1]) {
    box(0.2, 0.34, 0.42, lightMat, -3.7, 1.32, sz * 0.78);
    box(0.06, 0.44, 0.52, busChrome, -3.62, 1.32, sz * 0.78);           // chrome bezel
  }
  box(0.3, 0.28, 2.4, busBlack, -3.9, 0.72, 0);                        // front bumper
  box(0.3, 0.1, 0.6, busBlack, -3.3, 0.55, 0);                         // step

  // ===== Red marker "eyebrows": low over the windshield, and over the back =====
  // Little ROUND lamps (glowing red lenses with a chrome collar), tilted so
  // the outer ends sit higher — two angry brows, front and rear. They live in
  // the header panel right above the glass, not up on the roof.
  const roundLamp = (x, y, z, rz) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.z = rz;
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), busRed);
    lens.position.x = 0.05;
    lens.castShadow = true;
    pivot.add(lens);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 16), busChrome);
    collar.position.set(0.05, 0, 0);
    pivot.add(collar);
    group.add(pivot);
  };
  for (const sz of [-1, 1]) {
    roundLamp(-3.1, 2.66, sz * 0.5, sz * 0.3);
    roundLamp(3.3, 2.66, sz * 0.5, -sz * 0.3);
  }

  // ===== Rear emergency-exit door — two leaves on the BACK of the bus =====
  // Thin in X, wide in Z, so it reads as a rear door rather than a side panel.
  // It stops just under the open rear window so it doesn't block the hole.
  const dx = BUS_BACK + 0.06;
  for (const sz of [-1, 1]) {
    box(0.1, 1.5, 0.98, busDoorYellow, dx, 1.3, sz * 0.5);        // leaf (mostly yellow)
    box(0.06, 0.42, 0.7, busBlack, dx + 0.06, 1.62, sz * 0.5);     // small window up top
  }
  box(0.08, 1.56, 0.07, busBlack, dx, 1.3, 0);                      // centre seam
  for (const sz of [-1, 1]) {                                       // chrome crossbar latch
    box(0.06, 0.08, 0.9, busChrome, dx + 0.09, 1.6, sz * 0.5);
    box(0.08, 0.22, 0.08, busChrome, dx + 0.1, 1.2, sz * 0.16);     // handle
    box(0.1, 0.14, 0.1, busChrome, dx + 0.07, 0.9, sz * 0.42);      // hinges
    box(0.1, 0.14, 0.1, busChrome, dx + 0.07, 1.75, sz * 0.42);
  }
  for (const sz of [-1, 1]) {                                       // stop lights flanking the door
    box(0.12, 0.3, 0.2, busRed, dx - 0.02, 1.15, sz * 1.05);
  }
  box(0.3, 0.28, 2.4, busBlack, dx - 0.05, 0.72, 0);               // rear bumper

  // Mirrors on chrome arms off the front cowl
  for (const z of [-1.2, 1.2]) {
    box(0.06, 0.06, 1.5, busChrome, -3.66, 1.88, z * 0.4);
    box(0.32, 0.26, 0.1, busBlack, -3.66, 1.82, z * 0.62);
  }

  // ===== Wheels (bus-size) =====
  const wheels = [];
  const wheelPivots = [];
  for (const pos of [[-2.35, 0.62, 1.1], [-2.35, 0.62, -1.1],
                      [2.35, 0.62, 1.1],  [2.35, 0.62, -1.1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(pos[0], pos[1], pos[2]);
    const wheel = new THREE.Mesh(truckWheelGeometry, wheelMaterial.clone());
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 12), busChrome.clone());
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.2;
    pivot.add(hub);
    group.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  }
  group.userData.wheels = wheels;
  group.userData.wheelPivots = wheelPivots;
  return group;
}

// ===== Indy 500 race car =====
// A narrow open-wheel racer: low body, bare big tires, tall rear wing on
// pylons, a front wing, coil springs over each wheel and a number board.
// Front faces -X. Exposes { wheels, wheelPivots }. Drives 1.5× faster (see
// the pedals in main.js).
const indyRed = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.45 });
const indyWhite = new THREE.MeshStandardMaterial({ color: 0xf4f6fb, roughness: 0.4 });
const indyDark = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.7 });
const indySilver = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, roughness: 0.35, metalness: 0.7 });

// ===== '80s Marlboro-graphic F1 (Indy 500) =====
// Long white open-wheel single-seater with red livery trim — a plain-eyed
// take on the white/red McLarens & Marlboro cars of the early '80s: white
// monocoque, red side stripes and nose under-trim, big black rear boots and
// the huge twin-deck rear wing on pylons. No text, no logos — just paint.
// Front faces -X. Exposes { wheels, wheelPivots }. Drives 1.5× faster (see
// the pedals in main.js).
export function createIndyCar() {
  const group = new THREE.Group();
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

  // ===== White monocoque: survival cell + tapered nose =====
  box(2.0, 0.52, 0.78, indyWhite, 0.25, 0.74, 0);                 // main tub
  box(1.7, 0.34, 0.5, indyWhite, -1.75, 0.6, 0);                  // nose spine
  box(1.0, 0.26, 0.4, indyWhite, -2.85, 0.47, 0);                 // nose tip
  box(0.5, 0.1, 0.34, indyRed, -3.15, 0.5, 0);                    // red nose under-lip
  // Engine cover aft of the cockpit
  box(1.3, 0.4, 0.66, indyWhite, 1.6, 0.84, 0);
  box(0.9, 0.1, 0.5, indyRed, 1.55, 1.1, 0);                      // red spine fin

  // ===== Red livery trim down both flanks =====
  for (const sx of [-1, 1]) {
    box(3.3, 0.12, 0.06, indyRed, -0.3, 0.82, sx * 0.4);
    box(2.2, 0.05, 0.05, indyRed, -2.2, 0.66, sx * 0.17);         // nose stripe
  }

  // ===== Cockpit + driver + roll hoop =====
  box(0.85, 0.42, 0.62, indyDark, 0.75, 1.12, 0);                 // cockpit opening
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), indyRed.clone());
  helmet.scale.set(0.8, 1, 0.92);
  helmet.position.set(0.52, 1.2, 0);
  helmet.castShadow = true;
  group.add(helmet);                                              // helmet crest over the rim
  box(0.1, 0.34, 0.4, indyDark, 1.3, 1.32, 0);                    // roll hoop bar
  box(0.34, 0.08, 0.5, indyWhite, 1.3, 1.52, 0);                  // hoop fairing

  // ===== Front wing: slim, wide, red endplates =====
  box(0.3, 0.07, 2.0, indyWhite, -3.3, 0.26, 0);
  box(0.32, 0.06, 1.5, indyRed, -3.3, 0.32, 0);                   // red main-element stripe
  box(0.14, 0.32, 0.12, indyRed, -3.36, 0.42, -1.0);              // endplates
  box(0.14, 0.32, 0.12, indyRed, -3.36, 0.42, 1.0);

  // ===== Rear wing: the huge twin-deck '80s warplane =====
  for (const z of [-0.5, 0.5]) {
    box(0.12, 0.95, 0.12, indyDark, 2.35, 1.35, z);               // twin pylons
  }
  box(0.55, 0.09, 3.4, indyWhite, 2.35, 1.92, 0);                 // main plane
  box(0.3, 0.07, 3.0, indyWhite, 2.35, 1.72, 0);                  // lower flap
  box(0.14, 0.4, 0.12, indyRed, 2.4, 1.72, -1.66);                // big red endplates
  box(0.14, 0.4, 0.12, indyRed, 2.4, 1.72, 1.66);
  box(0.12, 0.15, 2.6, indyWhite, 2.35, 2.12, 0);                 // upper mini-flap
  // Diffuser fins under the tail
  for (const z of [-0.4, 0, 0.4]) box(0.12, 0.3, 0.06, indyDark, 2.9, 0.62, z);

  // ===== Front suspension arms (pencil-thin, dark) =====
  for (const sx of [-1, 1]) {
    for (const z of [-1, 1]) {
      box(0.9, 0.07, 0.07, indyDark, -1.35, 0.5, z * 0.52, 0, -sx * 0.28);
      box(0.7, 0.07, 0.07, indyDark, -1.15, 0.4, z * 0.62, 0, sx * 0.34);
    }
  }
  // Rear arms
  for (const sx of [-1, 1]) {
    box(0.7, 0.07, 0.07, indyDark, 1.5, 0.6, sx * 0.62, 0, -0.18);
  }

  // ===== Open wheels: SMALL fronts, BIG rears (the '80s staggered look) =====
  const wheels = [];
  const wheelPivots = [];
  const wheelSpec = [
    { x: -1.6, r: 0.34, t: 0.26, z: 0.82 },   // front left / right (small)
    { x: -1.6, r: 0.34, t: 0.26, z: -0.82 },
    { x: 1.6, r: 0.58, t: 0.4, z: 0.95 },     // rear left / right (big boots)
    { x: 1.6, r: 0.58, t: 0.4, z: -0.95 },
  ];
  for (const s of wheelSpec) {
    const pivot = new THREE.Group();
    pivot.position.set(s.x, s.r, s.z);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, s.t, 18), wheelMaterial.clone());
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.34, s.r * 0.34, s.t * 0.14, 12), indySilver.clone());
    hub.rotation.x = Math.PI / 2;
    hub.position.z = s.t * 0.52;
    pivot.add(hub);
    group.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  }

  // ===== Twin tailpipe =====
  box(0.2, 0.14, 0.2, indySilver, 3.05, 0.78, 0);

  group.userData.wheels = wheels;
  group.userData.wheelPivots = wheelPivots;
  return group;
}

// ===== Skateboarder (pedestrian on a skateboard) =====
// A little person from people.js standing on a skateboard. The person model
// faces +Z, so main.js marks this entry `faceZ` to quarter-turn it onto the
// cars' -X forward axis. Spinning skate wheels roll with the same rotation
// the other cars use. Exposes { wheels, wheelPivots } (wheelPivots empty).
const skaterBoardMat = new THREE.MeshStandardMaterial({ color: 0x2d9cdb, roughness: 0.5 });
const skaterWheelMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.8 });

export function createSkateboarder() {
  const group = new THREE.Group();
  // Skateboard deck: long axis along Z (the person's forward) — length ~1.0
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 1.0), skaterBoardMat.clone());
  deck.position.y = 0.11;
  deck.castShadow = true;
  group.add(deck);
  // Nose + tail kicker wedges
  for (const z of [-0.52, 0.52]) {
    const kick = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.14), skaterBoardMat.clone());
    kick.position.set(0, 0.13, z);
    kick.rotation.x = z < 0 ? 0.35 : -0.35;
    kick.castShadow = true;
    group.add(kick);
  }
  // Two truck bars under the deck
  for (const z of [-0.33, 0.33]) {
    const truck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.28), skaterWheelMat.clone());
    truck.position.set(0, 0.045, z);
    truck.castShadow = true;
    group.add(truck);
  }
  // Four tiny wheels (cylinder axis along Z so the shared spin rolls them)
  const wheels = [];
  for (const z of [-0.33, 0.33]) {
    for (const x of [-0.12, 0.12]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 10), skaterWheelMat.clone());
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.055, z);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  // The rider standing on the deck (front of the person is +Z)
  const person = makePerson(0xd05a3a, 0x2b3a4a);
  person.position.y = 0.24;
  group.add(person);
  // Slight forward lean for a steezy look
  person.rotation.x = -0.08;

  group.userData.wheels = wheels;
  group.userData.wheelPivots = [];
  return group;
}

// ===== Trash-can hot rod, driven by a raccoon =====
// A 1930s-style racing car with TWO steel trash cans bolted end to end: the
// big cockpit can the raccoon pops out of to steer, and a shorter nose can
// over the front axle carrying a pair of headlights. The exposed engine
// rumbles out front, wrapped in rounded chrome plumbing, and two long
// megaphone rockets shoot flames way out past the tail. Little half-size
// front rollers under big tall rear ones, and chrome wherever metal shines.
// Front faces -X like every car. Exposes { wheels, wheelPivots, effects } —
// `effects` feeds the frame loop so the engine throbs and the flames pop.
const canSteel = new THREE.MeshStandardMaterial({ color: 0x8b909a, roughness: 0.45, metalness: 0.6 });
const hotChrome = new THREE.MeshStandardMaterial({ color: 0xe9eef5, roughness: 0.12, metalness: 0.95 });
const hotTire = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.9 });
const hotWhitewall = new THREE.MeshStandardMaterial({ color: 0xe8e6d8, roughness: 0.72 });
const hotDark = new THREE.MeshStandardMaterial({ color: 0x33373e, roughness: 0.7 });
const hotRustRed = new THREE.MeshStandardMaterial({ color: 0x8a2b2b, roughness: 0.7 });
const raceWhite = new THREE.MeshStandardMaterial({ color: 0xf2efe7, roughness: 0.55 });
const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const racoonFur = new THREE.MeshStandardMaterial({ color: 0x7d828b, roughness: 0.85 });
const racoonDark = new THREE.MeshStandardMaterial({ color: 0x3e434a, roughness: 0.9 });
const racoonWhite = new THREE.MeshStandardMaterial({ color: 0xf2efe7, roughness: 0.8 });
const racoonBlack = new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.8 });

// A little sitting raccoon, front faces +Z (like the people). Ringed tail
// curled up behind, white muzzle with a black mask, pointy dark-tipped ears.
function makeRaccoon() {
  const g = new THREE.Group();
  const add = (mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };

  // Stocky sitting body + light belly
  const torso = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.34), racoonFur));
  torso.position.y = 0.7;
  const belly = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.18), racoonWhite));
  belly.position.set(0, 0.72, 0.19);

  // Ringed tail sweeping up behind (-Z)
  const tail = new THREE.Group();
  tail.position.set(0, 0.62, -0.24);
  tail.rotation.x = -0.7;
  for (let k = 0; k < 5; k++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 10), k % 2 === 0 ? racoonFur : racoonDark);
    seg.position.y = 0.07 + k * 0.14;
    seg.rotation.x = Math.sin(k * 0.55) * 0.5;
    seg.castShadow = true;
    tail.add(seg);
  }
  g.add(tail);

  // Head, white muzzle, black eye mask, nose
  const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), racoonFur));
  head.position.y = 1.16;
  const muzzle = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), racoonWhite));
  muzzle.position.set(0, 1.12, 0.15);
  muzzle.scale.set(1, 0.78, 0.85);
  const mask = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.15), racoonBlack));
  mask.position.set(0, 1.2, 0.09);
  const nose = add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), racoonBlack));
  nose.position.set(0, 1.11, 0.23);

  // Pointy ears with dark tips
  for (const sx of [-0.12, 0.12]) {
    const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), racoonDark));
    ear.position.set(sx, 1.35, 0);
    const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 6), racoonBlack));
    tip.position.set(sx, 1.42, 0);
  }

  // Arms reaching forward toward the steering wheel (+Z)
  for (const sx of [-0.19, 0.19]) {
    const arm = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), racoonFur));
    arm.rotation.x = Math.PI / 2.3;
    arm.position.set(sx, 0.92, 0.2);
  }
  return g;
}

// A 1930s-style round tire wheel: fat drum with whitewall rings and chrome
// hubcap domes on BOTH faces. `r` is the tire radius, so the front pair can
// run half-size little rollers under the big rear tires. The dome caps are
// mirrored per side because the axlePivot flips the wheel's local Y between
// the two sides of the car (mountHotWheel spins the axle by π/2).
function makeHotWheel(r) {
  const s = r / 0.95;                       // 1 for the big rear rollers, 0.5 up front
  const width = 0.34 + 0.18 * s;            // fatter, rounder tires (front pair a touch slimmer)
  const w = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 20), hotTire);
  tire.castShadow = true;
  tire.receiveShadow = true;
  w.add(tire);
  // Whitewall ring just inside each face
  for (const f of [1, -1]) {
    const ww = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, r * 0.1, 8, 24), hotWhitewall);
    ww.rotation.x = Math.PI / 2;
    ww.position.y = f * (width / 2 + 0.004);
    w.add(ww);
  }
  // Chrome hubcap dome on both faces (north cap on one side, south on the
  // other, so the bulge always points outward whichever way the wheel mounts).
  for (const f of [1, -1]) {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.42 * s, 16, 10, 0, Math.PI * 2, f > 0 ? 0 : Math.PI / 2, Math.PI / 2),
      hotChrome
    );
    cap.position.y = f * (width / 2 - 0.03);
    cap.castShadow = true;
    w.add(cap);
  }
  // Thin chrome lip ring right on each face edge
  for (const f of [1, -1]) {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.02 * s + 0.008, 8, 24), hotChrome);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = f * (width / 2 + 0.004);
    w.add(lip);
  }
  return w;
}

// Mount a wheel so it rolls and (front pair) steers: an outer steerPivot
// (rotation.y) holds an axlePivot (rotation.x = π/2) that turns the wheel's
// local Y axle into the car's transverse Z axis. `y` is the axle height, so
// the little front rollers sit as low as their radius.
function mountHotWheel(group, x, y, z, r, steer, wheels, wheelPivots) {
  const steerPivot = new THREE.Group();
  steerPivot.position.set(x, y, z);
  if (steer) wheelPivots.push(steerPivot);
  const axlePivot = new THREE.Group();
  axlePivot.rotation.x = Math.PI / 2;
  const wheel = makeHotWheel(r);
  axlePivot.add(wheel);
  steerPivot.add(axlePivot);
  group.add(steerPivot);
  wheels.push(wheel);
}

// A chrome pipe swept through a smooth curve — used for the rounded header
// tubes and intake elbows that wrap around the exposed engine block.
function chromeTube(points, r, mat = hotChrome) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 6, r, 8, false), mat.clone());
  mesh.castShadow = true;
  return mesh;
}

export function createRaccoonHotRod() {
  const group = new THREE.Group();
  const wheels = [];
  const wheelPivots = [];

  // Big thin tall rollers at the back, little half-size rollers up front
  mountHotWheel(group, -1.85, 0.5, -1.02, 0.475, true, wheels, wheelPivots);
  mountHotWheel(group, -1.85, 0.5, 1.02, 0.475, true, wheels, wheelPivots);
  mountHotWheel(group, 1.55, 0.95, -1.0, 0.95, false, wheels, wheelPivots);
  mountHotWheel(group, 1.55, 0.95, 1.0, 0.95, false, wheels, wheelPivots);

  // Chrome ladder frame + axle tubes (the front axle drops with the little rollers)
  for (const sz of [-0.62, 0.62]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 0.16), hotChrome);
    rail.position.set(0.15, 0.62, sz);
    rail.castShadow = rail.receiveShadow = true;
    group.add(rail);
  }
  for (const [ax, ay, len] of [[-1.85, 0.5, 2.24], [1.55, 0.95, 2.2]]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 12), hotChrome);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(ax, ay, 0);
    axle.castShadow = true;
    group.add(axle);
  }

  // The trash can body (open top) with its rim + ribs + racing plates
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 1.3, 18, 1, true), canSteel.clone());
  can.position.set(0.12, 1.1, 0);
  can.castShadow = can.receiveShadow = true;
  group.add(can);
  const canBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.08, 18), canSteel.clone());
  canBottom.position.set(0.12, 0.45, 0);
  canBottom.castShadow = true;
  group.add(canBottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 20), hotChrome.clone());
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0.12, 1.78, 0);
  group.add(rim);
  for (const ry of [0.8, 1.38]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.535, 0.03, 8, 20), hotChrome.clone());
    rib.rotation.x = Math.PI / 2;
    rib.position.set(0.12, ry, 0);
    group.add(rib);
  }
  for (const sz of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), raceWhite.clone());
    plate.rotation.x = Math.PI / 2;
    plate.position.set(0.12, 1.15, sz * 0.53);
    plate.castShadow = true;
    group.add(plate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.028, 8, 18), hotChrome.clone());
    ring.position.set(0.12, 1.15, sz * 0.56);
    group.add(ring);
  }

  // Exposed engine out front: dark block, chrome valve covers, splayed
  // zoomie headers — the whole assembly shivers on idle (frame loop rumbles
  // it via `effects.engine`).
  const engine = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.78), hotDark.clone());
  block.position.set(-0.55, 1.15, 0);
  block.castShadow = block.receiveShadow = true;
  engine.add(block);
  for (const zz of [-0.16, 0.16]) {
    const vc = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.2), hotChrome.clone());
    vc.position.set(-0.55, 1.52, zz);
    vc.castShadow = true;
    engine.add(vc);
  }
  for (const sz of [-1, 1]) {
    const zoomie = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.82, 10), hotChrome.clone());
    zoomie.rotation.z = sz * 0.5;
    zoomie.rotation.x = -0.25;
    zoomie.position.set(-0.92, 1.45, sz * 0.36);
    zoomie.castShadow = true;
    engine.add(zoomie);
  }

  // ===== Rounded chrome plumbing wrapped right around the block =====
  // Swept tube elbows: a rounded crossover hoop over the top, a pair of
  // fat downpipes curling off the flanks into the exhausts, and two
  // intake elbows with throttle bodies — all smooth bends, no sharp joints.
  const plumbing = new THREE.Group();
  // Rounded crossover over the valve covers
  plumbing.add(chromeTube([
    [-0.2, 1.5, 0.3], [-0.4, 1.78, 0.36], [-0.78, 1.8, 0.3], [-0.94, 1.54, 0.16],
  ], 0.06, hotChrome));
  // Mirror crossover on the other side
  const cross2 = chromeTube([
    [-0.2, 1.5, -0.3], [-0.4, 1.78, -0.36], [-0.78, 1.8, -0.3], [-0.94, 1.54, -0.16],
  ], 0.06, hotChrome);
  plumbing.add(cross2);
  // Fat downpipes: out of the block's flanks, rounding down and back
  for (const sz of [-1, 1]) {
    plumbing.add(chromeTube([
      [-0.62, 1.3, sz * 0.38], [-0.86, 1.24, sz * 0.5], [-1.1, 1.1, sz * 0.6], [-1.22, 1.05, sz * 0.66],
    ], 0.075, hotChrome));
  }
  // Intake elbows with round throttle bodies sitting on the block
  for (const sz of [-1, 1]) {
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 12), hotChrome.clone());
    tb.position.set(-0.55, 1.62, sz * 0.2);
    tb.castShadow = true;
    plumbing.add(tb);
    plumbing.add(chromeTube([
      [-0.55, 1.68, sz * 0.2], [-0.55, 1.86, sz * 0.24], [-0.34, 1.94, sz * 0.3], [-0.1, 1.88, sz * 0.3],
    ], 0.05, hotChrome));
  }
  // Rounded oil dipstick loop + a chromed water neck on the front of the block
  plumbing.add(chromeTube([
    [-0.9, 1.3, 0.24], [-1.04, 1.36, 0.12], [-1.0, 1.5, -0.02], [-0.82, 1.48, -0.08],
  ], 0.035, hotChrome));
  engine.add(plumbing);
  group.add(engine);

  // ===== Twin chrome rocket exhausts shooting way out the back =====
  // Long tapered megaphone pipes running back past the tail, flames off the
  // tips. The frame loop pops them via `effects.flames`.
  const flames = [];
  for (const sz of [-1, 1]) {
    // Straight run
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 2.7, 12), hotChrome.clone());
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(1.0, 1.05, sz * 0.66);
    pipe.castShadow = true;
    group.add(pipe);
    // Rounded collector bend sweeping down out of the engine bay into the pipe
    group.add(chromeTube([
      [-1.2, 1.16, sz * 0.62], [-0.9, 1.24, sz * 0.66], [-0.5, 1.1, sz * 0.66], [-0.35, 1.05, sz * 0.66],
    ], 0.085, hotChrome));
    // Chrome clamp rings along the pipe
    for (const cx of [0.1, 1.1, 2.0]) {
      const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 6, 12), hotChrome.clone());
      clamp.rotation.y = Math.PI / 2;
      clamp.position.set(cx, 1.05, sz * 0.66);
      group.add(clamp);
    }
    // Megaphone tip flaring out past the tail
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.085, 0.4, 14, 1, true), hotChrome.clone());
    tip.rotation.z = -Math.PI / 2;
    tip.position.set(2.5, 1.05, sz * 0.66);
    tip.castShadow = true;
    group.add(tip);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 14), hotChrome.clone());
    lip.rotation.y = Math.PI / 2;
    lip.position.set(2.7, 1.05, sz * 0.66);
    group.add(lip);
    const fg = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 8), flameOuterMat.clone());
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.46, 6), flameInnerMat.clone());
    outer.rotation.z = -Math.PI / 2;   // apex out the tail (+X)
    inner.rotation.z = -Math.PI / 2;
    fg.add(outer);
    fg.add(inner);
    fg.position.set(2.78, 1.05, sz * 0.66);
    group.add(fg);
    flames.push(fg);
  }

  // ===== The nose: a second trash can, tipped onto its BACK so the gaping
  // mouth faces forward like a grille =====
  // A shorter, narrower can than the cockpit one, rolled over so its open
  // rim + lid opening point -X (the car front). The two headlights sit
  // WIDE-SET above the mouth like eyes; a crumpled paper or two spill out.
  const nose = new THREE.Group();
  const noseX = -1.72;
  const canG = new THREE.Group();
  const openR = 0.44, baseR = 0.5, canLen = 1.15;
  const noseCan = new THREE.Mesh(new THREE.CylinderGeometry(openR, baseR, canLen, 18, 1, true), canSteel.clone());
  noseCan.castShadow = noseCan.receiveShadow = true;
  canG.add(noseCan);
  const noseBottom = new THREE.Mesh(new THREE.CylinderGeometry(baseR, baseR, 0.08, 18), canSteel.clone());
  noseBottom.position.y = -canLen / 2;
  noseBottom.castShadow = true;
  canG.add(noseBottom);
  const noseRim = new THREE.Mesh(new THREE.TorusGeometry(openR, 0.045, 8, 20), hotChrome.clone());
  noseRim.rotation.x = Math.PI / 2;
  noseRim.position.y = canLen / 2;
  canG.add(noseRim);
  for (const ry of [-0.2, 0.28]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry((openR + baseR) / 2 - Math.abs(ry) * 0.06, 0.028, 8, 20), hotChrome.clone());
    rib.rotation.x = Math.PI / 2;
    rib.position.y = ry;
    canG.add(rib);
  }
  // Lay the can on its back: +Y (the open top) swings to -X (the car front).
  canG.rotation.z = Math.PI / 2;
  nose.add(canG);
  // A couple of crumpled paper balls spilling out of the gaping mouth
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.07 + Math.random() * 0.05, 8, 6),
      new THREE.MeshStandardMaterial({ color: [0xe8e8e8, 0xbcd6e8, 0xe8e0c8][i], roughness: 0.9 })
    );
    ball.position.set(canLen / 2 + 0.06 + Math.random() * 0.09, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3);
    ball.castShadow = true;
    canG.add(ball);
  }
  // A dented racing number roundel on each flank of the nose can
  for (const sz of [-1, 1]) {
    const roundel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 14), raceWhite.clone());
    roundel.rotation.x = Math.PI / 2;
    roundel.position.set(0, 0.05, sz * 0.44);
    roundel.castShadow = true;
    nose.add(roundel);
  }
  // Two headlights perched wide-set above the gaping mouth
  for (const sz of [-1, 1]) {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.22, 12), hotChrome.clone());
    bucket.rotation.z = Math.PI / 2;
    bucket.position.set(-0.35, 0.52, sz * 0.3);
    bucket.castShadow = true;
    nose.add(bucket);
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 12), lightMat.clone());
    bulb.rotation.z = Math.PI / 2;
    bulb.position.set(-0.48, 0.52, sz * 0.3);
    nose.add(bulb);
    // A little chrome brow visor over each headlight
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.32), hotChrome.clone());
    brow.position.set(-0.3, 0.66, sz * 0.3);
    brow.rotation.z = sz * 0.12;
    brow.castShadow = true;
    nose.add(brow);
  }
  // Chrome neck joining the now-horizontal nose can back to the cockpit can
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10), hotChrome.clone());
  neck.rotation.z = Math.PI / 2;
  neck.position.set(0.84, 0, 0);
  neck.castShadow = true;
  nose.add(neck);
  nose.position.set(noseX, 1.08, 0);
  group.add(nose);

  // A pair of rounded chrome tube hoops linking the nose can round to the
  // engine bay, one on each flank.
  for (const sz of [-1, 1]) {
    group.add(chromeTube([
      [noseX + 0.28, 1.5, sz * 0.34],
      [noseX + 0.68, 1.68, sz * 0.42],
      [-0.62, 1.62, sz * 0.3],
      [-0.42, 1.34, sz * 0.18],
    ], 0.045));
  }

  // ===== Old giant steamer suitcase, lashed onto the back rails =====
  // Sits between the two exhaust pipes with a half-CYLINDER lid like a real
  // pirate chest: the cylinder's long axis runs across the car's width, so
  // its flat round ENDS face straight out at the left/right rear tires, with
  // the curved top bulging up above the box. A middle leather band, a brass
  // lid-seam and gold catch-clasps on both end faces finish it off.
  const suitcaseMat = new THREE.MeshStandardMaterial({ color: 0x8a5430, roughness: 0.75 });
  const suitcaseDarkMat = new THREE.MeshStandardMaterial({ color: 0x5e3a20, roughness: 0.85 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.32, metalness: 0.7 });
  const trunk = new THREE.Group();
  const tx = 1.7;
  const tbody = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.6, 1.0), suitcaseMat);
  tbody.position.set(tx, 1.0, 0);
  tbody.castShadow = tbody.receiveShadow = true;
  trunk.add(tbody);
  // Pirate-chest lid: a half-cylinder (theta sweep of π). The geometry is
  // rolled flat-side-down on top of the box — axis along Z (facing the tires),
  // curved bulge upward.
  const tlidGeom = new THREE.CylinderGeometry(0.42, 0.42, 1.02, 20, 4, false, 0, Math.PI);
  tlidGeom.rotateX(Math.PI / 2);
  tlidGeom.rotateZ(Math.PI / 2);
  const tlid = new THREE.Mesh(tlidGeom, suitcaseDarkMat);
  tlid.position.set(tx, 1.3, 0);
  tlid.castShadow = true;
  trunk.add(tlid);
  // Leather band around the middle + brass line at the lid seam
  const tband = new THREE.Mesh(new THREE.BoxGeometry(1.19, 0.14, 1.01), suitcaseDarkMat);
  tband.position.set(tx, 1.0, 0);
  trunk.add(tband);
  const tseam = new THREE.Mesh(new THREE.BoxGeometry(1.19, 0.045, 1.01), brassMat);
  tseam.position.set(tx, 1.3, 0);
  trunk.add(tseam);
  // Gold catch-clasps on each end face (two per end)
  for (const bound of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.16), brassMat);
      clasp.position.set(tx + bound * 0.6, 1.32, sz * 0.3);
      clasp.castShadow = true;
      trunk.add(clasp);
    }
  }
  // A carry handle arching over the lid's curved peak
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 16, 0, Math.PI), suitcaseDarkMat);
  handle.rotation.y = Math.PI / 2;
  handle.position.set(tx, 2.0, 0);
  trunk.add(handle);
  group.add(trunk);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.55, 8), hotChrome.clone());
  column.position.set(0.12, 1.42, 0);
  column.castShadow = true;
  group.add(column);
  const wheel3 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 18), hotChrome.clone());
  wheel3.rotation.y = Math.PI / 2;
  wheel3.rotation.x = -0.25;
  wheel3.position.set(0.12, 1.66, 0);
  group.add(wheel3);
  for (const sx of [-0.07, 0.07]) {
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), racoonFur.clone());
    paw.position.set(0.14 + sx * 0.1, 1.72, 0.02);
    paw.castShadow = true;
    group.add(paw);
  }
  // (The only headlight on the car is the pair set into the nose trash can.)

  // The raccoon pops out of the can and grips the wheel; faces car forward.
  const driver = new THREE.Group();
  driver.add(makeRaccoon());
  driver.rotation.y = -Math.PI / 2;   // turn the +Z-facing raccoon to -X
  driver.position.set(0.12, 1.0, 0);
  group.add(driver);

  group.userData.wheels = wheels;
  group.userData.wheelPivots = wheelPivots;
  // Per-frame effects: engine rumble + twin exhaust flame pops.
  group.userData.effects = { engine, flames, phase: 0 };

  // A little racing driver's red stripe up the can
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.92), hotRustRed.clone());
  stripe.position.set(0.44, 1.1, 0);
  stripe.castShadow = true;
  group.add(stripe);
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
  // A steamroller patrols the main road — its big drum flattens the player
  // car when it drives over it (see main.js traffic update).  Placed between
  // the regular traffic spawn points (every 20 units) so deOverlapTraffic
  // doesn't immediately remove it.
  const roller = createSteamroller();
  roller.position.set(40, 0.15, -5.5);
  roller.rotation.y = 0;   // heading -X (westbound)
  scene.add(roller);
  cars.push({ mesh: roller, axis: 'x', dir: -1, speed: 3.2, speedCur: 3.2, homeLat: -5.5, shove: 0, knock: null, isSteamroller: true });
  return cars;
}
