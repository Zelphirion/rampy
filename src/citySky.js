import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { worldXLo, worldXHi, worldZLo, worldZHi } from './modules/world.js';

// ============================================================================
// The city's daylight sky
// ============================================================================
// The city scene itself only owns the flat sky colour and the horizon haze
// (CITY_SKY is applied in main.js). This module builds the cheerful dressing
// that lives above it: soft, drifting fluffy clouds and the occasional flock of
// birds crossing overhead. Everything here is decorative — no colliders, no
// shadow casters, and the flock updates only run while the city is the active
// world.
// ============================================================================

export const CITY_SKY = {
  // A bright, saturated daytime blue — deliberately much lighter than the old
  // night-navy backdrop. The haze is paler still, so distant rooftops melt into
  // a sunny horizon instead of a dark void.
  color: 0x87d3ff,
  fogColor: 0xd9f0ff,
  fogDensity: 0.006,

  cloudCount: 12,
  flockCount: 3,

  // Clouds drift across a band wider than the city and wrap around, so the sky
  // never empties out and no cloud ever cuts a visible seam at the wall.
  cloudWrapMargin: 80,
  cloudMinY: 82,
  cloudMaxY: 142,

  // Birds spawn beyond the city edge, cross it, and leave the far side. The
  // gap between flocks is what makes them "occasional" rather than constant.
  flockSpawnRadius: 200,
  flockMinSpeed: 14,
  flockMaxSpeed: 22,
  flockMinGap: 18,
  flockMaxGap: 42,
};

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORLD_CX = (worldXLo + worldXHi) / 2;
const WORLD_CZ = (worldZLo + worldZHi) / 2;

// ===== Clouds =====
// Each cloud is a clump of shared low-poly spheres: a wide, flattened pile of
// puffs that reads as a fluffy cumulus rather than a single ball. One geometry
// and one material are reused by every puff, so the whole sky is cheap.
function makeCloudMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xdff2ff,
    emissiveIntensity: 0.22,
    roughness: 1,
    metalness: 0,
  });
}

function addClouds(parent, rng) {
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  const mat = makeCloudMaterial();
  const clouds = [];
  const wrapLo = worldXLo - CITY_SKY.cloudWrapMargin;
  const wrapHi = worldXHi + CITY_SKY.cloudWrapMargin;

  for (let i = 0; i < CITY_SKY.cloudCount; i++) {
    const cloud = new THREE.Group();
    const size = 2.4 + rng() * 2.8;
    const puffs = 5 + Math.floor(rng() * 4);

    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, mat);
      const angle = rng() * Math.PI * 2;
      const radius = Math.pow(rng(), 0.7) * size * 1.7;
      const scale = (0.55 + rng() * 0.8) * size;
      puff.position.set(
        Math.cos(angle) * radius,
        (rng() - 0.35) * size * 0.8,
        Math.sin(angle) * radius * 0.65,
      );
      // Wider than tall, like a real cumulus: the flattened puffs also read
      // much softer than a stack of plain spheres.
      puff.scale.set(scale, scale * 0.62, scale * 0.9);
      puff.rotation.y = rng() * Math.PI;
      puff.castShadow = false;
      puff.receiveShadow = false;
      cloud.add(puff);
    }

    cloud.position.set(
      wrapLo + rng() * (wrapHi - wrapLo),
      CITY_SKY.cloudMinY + rng() * (CITY_SKY.cloudMaxY - CITY_SKY.cloudMinY),
      worldZLo - 60 + rng() * ((worldZHi - worldZLo) + 120),
    );
    cloud.rotation.y = rng() * Math.PI * 2;
    cloud.userData.speed = (0.5 + rng() * 1.3) * (rng() < 0.5 ? -1 : 1);
    cloud.userData.baseY = cloud.position.y;
    cloud.userData.bobPhase = rng() * Math.PI * 2;
    cloud.userData.bobAmp = 0.4 + rng() * 1.2;
    cloud.userData.wrapLo = wrapLo;
    cloud.userData.wrapHi = wrapHi;
    parent.add(cloud);
    clouds.push(cloud);
  }

  return clouds;
}

function updateClouds(clouds, delta, elapsed) {
  for (const cloud of clouds) {
    const u = cloud.userData;
    cloud.position.x += u.speed * delta;
    if (cloud.position.x > u.wrapHi) cloud.position.x = u.wrapLo;
    else if (cloud.position.x < u.wrapLo) cloud.position.x = u.wrapHi;
    cloud.position.y = u.baseY + Math.sin(elapsed * 0.35 + u.bobPhase) * u.bobAmp;
  }
}

// ===== Birds =====
// A bird is two triangular wings (mirrored) plus a tiny body. The wings hinge at
// the body and flap, so the flock reads as moving birds rather than crossing
// specks. Dark, unlit silhouettes hold up against the bright sky at any angle.
function makeBirdGeometry() {
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.45,      // root, front
    1.15, 0, 0.02,   // wing tip, swept back
    0, 0, -0.5,      // root, back
  ], 3));
  wing.computeVertexNormals();
  return wing;
}

function makeBird(wingGeo, bodyGeo, mat, rng) {
  const bird = new THREE.Group();
  const right = new THREE.Mesh(wingGeo, mat);
  const left = new THREE.Mesh(wingGeo, mat);
  left.scale.x = -1;
  const body = new THREE.Mesh(bodyGeo, mat);
  body.scale.set(0.7, 0.55, 2.1);
  bird.add(right, left, body);
  bird.userData.left = left;
  bird.userData.right = right;
  bird.userData.flapPhase = rng() * Math.PI * 2;
  bird.userData.flapSpeed = 7 + rng() * 5;
  bird.scale.setScalar(1.3 + rng() * 0.6);
  return bird;
}

function makeFlock(parent, wingGeo, bodyGeo, mat, rng, index) {
  const group = new THREE.Group();
  group.visible = false;
  parent.add(group);

  const birds = [];
  const count = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const bird = makeBird(wingGeo, bodyGeo, mat, rng);
    // A loose V: one leader, then pairs stepping back and out to either side.
    const row = Math.ceil(i / 2);
    const side = i === 0 ? 0 : (i % 2 === 1 ? -1 : 1);
    bird.position.set(side * row * 1.8, (rng() - 0.5) * 0.7, -row * 2.1);
    group.add(bird);
    birds.push(bird);
  }

  return {
    group,
    birds,
    active: false,
    // Stagger the first wave so the sky warms up gradually instead of three
    // identical flocks arriving together.
    timer: 3 + index * 15 + rng() * 8,
    startX: 0,
    startZ: 0,
    dirX: 0,
    dirZ: 0,
    speed: 0,
    travelled: 0,
    baseY: 0,
    weavePhase: rng() * Math.PI * 2,
  };
}

function spawnFlock(flock, rng) {
  const angle = rng() * Math.PI * 2;
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  const r = CITY_SKY.flockSpawnRadius;
  const halfSpan = r * 2;

  flock.dirX = dirX;
  flock.dirZ = dirZ;
  flock.speed = CITY_SKY.flockMinSpeed + rng() * (CITY_SKY.flockMaxSpeed - CITY_SKY.flockMinSpeed);
  flock.travelled = 0;
  flock.halfSpan = halfSpan;
  flock.baseY = 42 + rng() * 24;
  flock.weavePhase = rng() * Math.PI * 2;
  flock.startX = WORLD_CX - dirX * r;
  flock.startZ = WORLD_CZ - dirZ * r;
  flock.group.position.set(flock.startX, flock.baseY, flock.startZ);
  // Local +Z is the bird's nose, so yaw = atan2(dirX, dirZ).
  flock.group.rotation.y = Math.atan2(dirX, dirZ);
  flock.group.visible = true;
  flock.active = true;
}

function updateFlocks(flocks, delta, elapsed, rng) {
  for (const flock of flocks) {
    if (!flock.active) {
      flock.timer -= delta;
      if (flock.timer <= 0) spawnFlock(flock, rng);
      continue;
    }

    flock.travelled += flock.speed * delta;
    // Gentle sway across the straight flight line so the flock does not look
    // like it is on rails.
    const sway = Math.sin(elapsed * 0.5 + flock.weavePhase) * 7;
    const x = flock.startX + flock.dirX * flock.travelled - flock.dirZ * sway;
    const z = flock.startZ + flock.dirZ * flock.travelled + flock.dirX * sway;
    const y = flock.baseY + Math.sin(elapsed * 0.8 + flock.weavePhase) * 1.6;
    flock.group.position.set(x, y, z);

    for (const bird of flock.birds) {
      const flap = Math.sin(elapsed * bird.userData.flapSpeed + bird.userData.flapPhase) * 0.65;
      bird.userData.left.rotation.z = -flap;
      bird.userData.right.rotation.z = flap;
    }

    if (flock.travelled > flock.halfSpan) {
      flock.active = false;
      flock.group.visible = false;
      flock.timer = CITY_SKY.flockMinGap + rng() * (CITY_SKY.flockMaxGap - CITY_SKY.flockMinGap);
    }
  }
}

export function buildCitySky(scene, opts = {}) {
  const rng = makeRng(opts.seed === undefined ? 0x5eed1234 : opts.seed);
  const root = new THREE.Group();
  root.name = 'citySky';
  scene.add(root);

  const clouds = addClouds(root, rng);

  const wingGeo = makeBirdGeometry();
  const bodyGeo = new THREE.SphereGeometry(0.16, 6, 4);
  const birdMat = new THREE.MeshBasicMaterial({
    color: 0x2f3a46,
    side: THREE.DoubleSide,
    fog: true,
  });
  const flocks = [];
  for (let i = 0; i < CITY_SKY.flockCount; i++) {
    flocks.push(makeFlock(root, wingGeo, bodyGeo, birdMat, rng, i));
  }

  return {
    root,
    clouds,
    flocks,
    update(delta, elapsed) {
      updateClouds(clouds, delta, elapsed);
      updateFlocks(flocks, delta, elapsed, rng);
    },
  };
}
