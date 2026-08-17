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
      const mesh = createCar(TRAFFIC_COLORS[colorIdx % TRAFFIC_COLORS.length]);
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
