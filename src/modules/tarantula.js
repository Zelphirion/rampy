import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== Giant tarantula =====
// A lurching ball of dark fur with eight thick striding legs (each hanging
// from a chunky ball-joint at the body) and eight small hot red eyes. Faces
// +Z (like the robot), so the car-picker quarter-turns it onto the cars' -X
// forward axis. Everything sits in a `rig` lifted so the feet touch the ground
// plane (the picker strips the model root, so the lift must live inside a
// child group). `userData.legs` holds the eight leg pivots the frame loop
// strides; `userData.wheels` is empty because nothing spins on a spider.
export function makeTarantula() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.position.y = 0.58;
  g.add(rig);

  const fur = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.95 });
  const furDark = new THREE.MeshStandardMaterial({ color: 0x17110a, roughness: 0.95 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x241c13, roughness: 0.9 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x32281c, roughness: 0.85 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1f0c, emissiveIntensity: 1.6 });
  const fangMat = new THREE.MeshStandardMaterial({ color: 0x1c0f06, roughness: 1 });

  // ==== Body ====
  // Abdomen: the big fuzzy back-half (a squat spheroid)
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), fur);
  abdomen.scale.set(1.0, 0.62, 1.15);
  abdomen.position.set(0, 0.42, -0.42);
  abdomen.castShadow = abdomen.receiveShadow = true;
  rig.add(abdomen);
  // Cephalothorax: smaller hump toward the front (+Z)
  const cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), furDark);
  cephalo.scale.set(1, 0.8, 1.05);
  cephalo.position.set(0, 0.5, 0.42);
  cephalo.castShadow = true;
  rig.add(cephalo);

  // ==== Eyes: eight small ones, clustered up front — the two big reds
  // closest to the mouth, two more rows behind them ====
  const eyes = [];
  const eyeSpec = [
    [0, 0.78, 0.1],         // the two "giant" eyes (still small)
    [-0.13, 0.85, 0.055], [0.13, 0.85, 0.055],
    [-0.26, 0.79, 0.05], [0.26, 0.79, 0.05],
    [-0.3, 0.67, 0.045], [0.3, 0.67, 0.045],
    [-0.1, 0.64, 0.05], [0.1, 0.64, 0.05],
  ];
  for (const [ex, ez, r] of eyeSpec) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), eyeMat);
    eye.position.set(ex, 0.62 + ez * 0.14, ez);
    eye.castShadow = true;
    rig.add(eye);
    eyes.push(eye);
  }

  // Down-curving black chelicerae (fangs) over the mouth
  for (const sx of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), fangMat);
    fang.rotation.x = Math.PI / 2.6;
    fang.position.set(sx * 0.17, 0.26, 0.94);
    rig.add(fang);
  }

  // ==== The eight legs, pivoting at the body line ====
  // A chunky two-segment leg: a thick femur out to the side and a tapered
  // tibia dropping to the ground with a big foot. Each leg hangs from a ball
  // JOINT — a sphere lodged at the body — so the joint sphere pairs the leg
  // to the abdomen and you never see the leg separated from the body. The leg
  // GROUP's centre sits at the joint, so swinging the group swings the foot.
  const legs = [];
  const rows = [0.6, 0.14, -0.28, -0.6];   // front pair to rear pair, on +Z
  for (let r = 0; r < rows.length; r++) {
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.34, 0.52, rows[r]);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), jointMat);
      leg.add(joint);
      // Femur: thick, mostly horizontal, tilted slightly down
      const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.055, 0.5, 8), legMat);
      femur.position.set(sx * 0.25, -0.1, -0.02);
      femur.rotation.z = -sx * (Math.PI / 2 - 0.34);
      femur.castShadow = true;
      leg.add(femur);
      // Tibia: tapered, dropping almost straight down (fatter than before)
      const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.48, 8), legMat);
      tibia.position.set(sx * 0.47, -0.44, -0.01);
      tibia.rotation.z = -sx * 0.32;
      tibia.castShadow = true;
      leg.add(tibia);
      // A big hairy foot knob
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), legMat);
      foot.position.set(sx * 0.52, -0.58, -0.01);
      foot.castShadow = true;
      leg.add(foot);
      rig.add(leg);
      legs.push(leg);
    }
  }

  g.userData.legs = legs;
  g.userData.eyes = eyes;
  g.userData.eyeMat = eyeMat;
  g.userData.wheels = [];      // the picker spins wheels — nothing to spin here
  g.userData.wheelPivots = [];
  g.userData.effects = null;
  return g;
}

// ===== The ramp-world guardian =====
// A huge tarantula sleeps inside the giant velodrome bowl on the hills. It
// stays perfectly still with dimmed eyes until the player bumps into it —
// then its eyes BLAZE red, it scrambles after the same patrol trail the wild
// monster truck uses, wanders for 30 seconds, and settles back down wherever
// it is, dozing until you poke it again. It never knocks props over.
const NPC_SCALE = 3;
const WAKE_TIME = 30;          // seconds of roaming before it sleeps again
const NPC_SPEED = 9;           // full-throttle scurry
const EYE_SLEEP = 0.06;
const EYE_WAKE = 2.6;

export function addRampTarantula(rampScene, surface, spawn, waypoints) {
  const mesh = makeTarantula();
  mesh.scale.setScalar(NPC_SCALE);
  mesh.position.set(spawn.x, surface(spawn.x, spawn.z) + 0.15, spawn.z);
  rampScene.add(mesh);
  mesh.userData.eyeMat.emissiveIntensity = EYE_SLEEP;
  return {
    mesh,
    surface,
    waypoints,
    mode: 'sleep',            // 'sleep' → dormant in the bowl | 'awake' → roaming
    timer: 0,                 // seconds left awake
    patrol: 0,                // waypoint index
    heading: Math.random() * Math.PI * 2,
    phase: 0,
    wanderTimer: 0,
    bounds: { xLo: -95, xHi: 95, zLo: -95, zHi: 128 },
  };
}

export function wakeTarantula(c) {
  if (c.mode !== 'awake') {
    c.mode = 'awake';
    c.timer = WAKE_TIME;
  }
}

function strideTarantulaLegs(c, delta) {
  const mesh = c.mesh;
  const speed = c.mode === 'awake' ? NPC_SPEED : 0;
  c.phase += delta * speed * 0.85;
  const s = Math.sin(c.phase) * 0.5 * (speed > 0.05 ? 1 : 0);
  const A = [0, 3, 4, 7];   // cross-diagonal gait pairs
  const legs = mesh.userData.legs;
  if (!legs) return;
  for (let i = 0; i < legs.length; i++) {
    const drive = (A.indexOf(i) >= 0 ? 1 : -1) * s
      + 0.05 * Math.sin(c.phase * 1.7 + i * 1.4) * (speed > 0.05 ? 1 : 0);
    legs[i].rotation.y += (drive - legs[i].rotation.y) * Math.min(1, delta * 8);
  }
}

// Drive the wanderer. Sleep: keep still, eyes dim. Awake: patrol the monster
// truck's waypoint loop, ride the terrain, face its heading, and ease the eye
// glow up; after WAKE_TIME it sleeps again wherever it stopped.
export function updateTarantulaNpc(c, delta) {
  const mesh = c.mesh;
  const eyes = mesh.userData.eyes;
  const eyeMat = mesh.userData.eyeMat;

  if (c.mode === 'sleep') {
    eyeMat.emissiveIntensity += (EYE_SLEEP - eyeMat.emissiveIntensity) * Math.min(1, 4 * delta);
    c.phase += delta * 0.5;
    for (const eye of eyes) eye.scale.setScalar(1);
    strideTarantulaLegs(c, delta);
    return;
  }

  // Awake: count down, then doze off right where it stands.
  c.timer -= delta;
  if (c.timer <= 0) {
    c.mode = 'sleep';
    return;
  }
  eyeMat.emissiveIntensity += (EYE_WAKE - eyeMat.emissiveIntensity) * Math.min(1, 6 * delta);
  for (const eye of eyes) eye.scale.setScalar(1 + eyeMat.emissiveIntensity * 0.03);

  // Patrol the same waypoints the monster truck uses.
  const wp = c.waypoints && c.waypoints.length > 0 ? c.waypoints[c.patrol] : null;
  if (!wp) { c.timer = 0; return; }
  let dx = wp.x - mesh.position.x;
  let dz = wp.z - mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 9) c.patrol = (c.patrol + 1) % c.waypoints.length;
  dx = wp.x - mesh.position.x;
  dz = wp.z - mesh.position.z;
  const dd = Math.hypot(dx, dz) || 1;
  const step = Math.min(NPC_SPEED * delta, dd);
  let nx = mesh.position.x + (dx / dd) * step;
  let nz = mesh.position.z + (dz / dd) * step;
  if (nx < c.bounds.xLo || nx > c.bounds.xHi || nz < c.bounds.zLo || nz > c.bounds.zHi) {
    c.patrol = (c.patrol + 1) % c.waypoints.length;
    nx = THREE.MathUtils.clamp(mesh.position.x, c.bounds.xLo, c.bounds.xHi);
    nz = THREE.MathUtils.clamp(mesh.position.z, c.bounds.zLo, c.bounds.zHi);
  }
  mesh.position.set(nx, c.surface(nx, nz) + 0.15, nz);

  // Face the walk direction (model front is +Z).
  const targetYaw = Math.atan2(dx / dd, dz / dd);
  let yaw = mesh.rotation.y;
  let dy = targetYaw - yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  mesh.rotation.y = yaw + dy * Math.min(1, 2.6 * delta);

  strideTarantulaLegs(c, delta);
}