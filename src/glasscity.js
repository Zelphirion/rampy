import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable } from './physics.js';
import {
  GLASS_TOWER_COLS as towerCols, GLASS_TOWER_ROWS as towerRows,
  GLASS_Z0 as Z0, GLASS_Z1 as Z1,
  GHOST_ROUTES, GHOST_RECHARGE, routeWalker, ghostTouches, laneBlocked,
} from './glasscityGhosts.js';

// ===== The Glass City (north of the world) =====
// A grid of silent, monolithic skyscrapers made of coloured translucent glass,
// with surreal street-level tableaux visible through shop windows — a room
// full of mechanical birds, an orchard plaza of glowing blue balloons, and
// figures locked in motionless tableaux.
//
// Region: z in [132, 173], spanning the whole world width x in [-140, 140].
// Built for the old, larger surface map; since the map shrank to its wrapped
// bounds it stands in the UNDERWORLD instead (see underground.js), whose
// cavern floor is big enough to hold it unchanged.
//
// The grid itself (tower columns, tower rows, the city footprint, the street
// lanes and the ghost routes) lives in glasscityGhosts.js, so the patrol maths
// can be tested without three.js and the two files cannot disagree about where
// a street is.

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
// through the city without getting stuck. The column and row lists now come
// from glasscityGhosts.js.

// Towers removed to make room for the balloon plaza, and the three tableaux.
// The ghost patrols below run down these same corridors, so both are derived
// from one source rather than re-typed as bare numbers.
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

// ---- Tableau 2: an orchard plaza of glowing blue balloons ----
// Each balloon bobs on its gold stand; the car pops them by driving over
// them (they vanish with a blue shard burst, then regrow after a beat).
function makeBalloon(scene, x, z) {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 8), goldMat);
  stand.position.y = 1.1;
  g.add(stand);
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
  const balloons = [];
  for (let i = 0; i < 7; i++) {
    const tx = (i % 3 - 1) * 6 + ((i * 7) % 5) * 1.2;
    const tz = (Math.floor(i / 3) - 1) * 5 + ((i * 3) % 4) * 1.0;
    const g = makeBalloon(scene, cx + tx, cz + tz);
    balloons.push({ g, x: cx + tx, z: cz + tz, radius: 2.6, alive: true, respawn: 0 });
  }
  return balloons;
}

// ---- Tableau 3: dancers that dance all the time (idea #26) ----
// A dapper little figure in a pointy hat. They never stop: they bounce, bob
// side to side, flail their arms and wiggle their hat, each on its own phase
// so they never move in lockstep — just like the birds in the other shop.
function makeDancer(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mat);
  body.position.y = 1.35;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.5 }));
  head.position.y = 2.2;
  g.add(head);
  // Two small dark eyes on the +Z side so the dancer has a friendly front.
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.4 });
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 2.27, 0.25);
  g.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.1, 2.27, 0.25);
  g.add(eyeR);
  // The pointy hat — kept, it's their signature.
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.6 }));
  hat.position.y = 2.82;
  g.add(hat);
  const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 8), mat);
  hatBand.position.y = 2.55;
  g.add(hatBand);
  // Arms as groups so they can flail independently.
  const armL = new THREE.Group();
  armL.position.set(-0.42, 1.35, 0);
  armL.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.65, 0.14), mat));
  g.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.42, 1.35, 0);
  armR.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.65, 0.14), mat));
  g.add(armR);
  // Legs.
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), mat);
  legL.position.set(-0.18, 0.3, 0);
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), mat);
  legR.position.set(0.18, 0.3, 0);
  g.add(legR);
  return { g, head, hat, armL, armR, legL, legR };
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
  // The building is clear glass all the way round, so no window pane — the
  // dancers are visible from every side. They face the CENTRE OF THE WORLD
  // (0,0), not the outer cave wall.
  const cdx = 0 - x;
  const cdz = 0 - z;
  const clen = Math.hypot(cdx, cdz) || 1;
  const disX = cdx / clen, disZ = cdz / clen;   // inward-facing display normal
  const faceYaw = Math.atan2(cdx, cdz);         // rotate +Z so it faces centre
  // Spread the dancers side by side ALONG the shop face (perpendicular to the
  // display normal) so they all stand at the same depth looking into the city.
  const perpX = -disZ, perpZ = disX;
  const figures = [];
  for (let i = 0; i < colors.length; i++) {
    const m = makeDancer(colors[i]);
    const ox = (i - 1) * 1.4;
    m.g.position.set(perpX * ox, 0.05, perpZ * ox);
    const baseYaw = faceYaw + (i - 1) * 0.16;
    m.g.rotation.y = baseYaw;
    g.add(m.g);
    figures.push({
      ...m, baseYaw, phase: i * 2.1 + x * 0.03, speed: 0.6 + (i % 3) * 0.2,
      xOff: perpX * ox, zOff: perpZ * ox,   // dancer's world offsets inside the shop
      dance: (i % 2 === 0) ? 1 : -1,       // alternate swing direction
    });
  }
  g.position.set(x, 0, z);
  scene.add(g);
  // The dancers start dancing when you get close (within 4 car lengths of the
  // shop, ~17 units) and settle back to a relaxed stance as you drive away —
  // like the birds in the other shop.
  const DANCE_RADIUS = 4 * 4.3;   // 4 car lengths (car body is 4.3 long)
  return {
    x, z, halfW: 3.5, halfD: 3.5, h: 6,
    update(delta, t, player) {
      let dancing = false;
      if (player) {
        const dx = player.x - x;
        const dz = player.z - z;
        dancing = dx * dx + dz * dz < DANCE_RADIUS * DANCE_RADIUS;
      }
      for (const f of figures) {
        const w = t * f.speed + f.phase;
        if (dancing) {
          // Easy bounce, stepping on the beat — only while the car is near.
          f.g.position.x = f.xOff + Math.sin(t * 3.2 + f.phase) * 0.25 * f.dance;
          f.g.position.z = f.zOff + Math.cos(t * 4.1 + f.phase) * 0.18 * f.dance;
          f.g.position.y = 0.05 + Math.abs(Math.sin(t * 4.6 + f.phase)) * 0.32;
          // Body leans into the groove.
          f.g.rotation.y = f.baseYaw + Math.sin(t * 2.3 + f.phase) * 0.3;
          f.g.rotation.z = Math.sin(t * 5.1 + f.phase) * 0.08;
          // Arms flail.
          f.armL.rotation.z = Math.sin(w * 1.7) * 0.9 + 0.3;
          f.armR.rotation.z = -Math.sin(w * 1.9) * 0.9 - 0.3;
          // Head bobs, hat wiggles.
          f.head.rotation.y = Math.sin(t * 5.4 + f.phase) * 0.4;
          f.hat.rotation.z = Math.sin(t * 6.2 + f.phase) * 0.2;
        } else {
          // Hush — still as statues, looking into the city until a car nears.
          f.g.position.x = f.xOff;
          f.g.position.z = f.zOff;
          f.g.position.y = 0.05;
          f.g.rotation.y = f.baseYaw;
          f.g.rotation.z = 0;
          f.armL.rotation.z = 0.4;
          f.armR.rotation.z = -0.5;
          f.head.rotation.y = 0;
          f.hat.rotation.z = 0;
        }
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

// ===== The street ghosts =====
//
// Two ghosts drift the glass streets on fixed square loops. They never chase and
// never steer toward the car - the whole point is that you can see them coming
// and choose whether to be hit - so the route is a constant, not a function of
// the player. Run into one and it picks you up and drops you at the foot of the
// candy waterfall, way back out in the cavern.
//
// The routes, the speed, the touch radius and the route arithmetic all live in
// glasscityGhosts.js; this file owns the meshes.

// One ghost: a translucent, floating body with a trailing skirt of afterimages.
function makeGhost(scene, x, z, tint) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: tint, emissive: tint, emissiveIntensity: 0.85,
    transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14), mat);
  body.position.y = 2.2;
  body.scale.set(1, 1.25, 1);
  g.add(body);
  // The trailing skirt: a stack of shrinking rings fading downward.
  const skirtMat = new THREE.MeshStandardMaterial({
    color: tint, emissive: tint, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.22, roughness: 0.4, depthWrite: false,
  });
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.5 - i * 0.22, 0.1, 6, 18), skirtMat);
    r.rotation.x = Math.PI / 2;
    r.position.y = 1.6 - i * 0.42;
    r.userData.phase = i * 0.7;
    g.add(r);
  }
  // Two eyes so it reads as a face rather than a lamp.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0b0d16 });
  for (const ex of [-0.55, 0.55]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), eyeMat);
    e.position.set(ex, 2.5, 1.25);
    g.add(e);
  }
  const halo = new THREE.PointLight(tint, 1.6, 26, 2);
  halo.position.y = 2.2;
  g.add(halo);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

// A ghost on a fixed route. The route walking itself lives in
// glasscityGhosts.js (routeWalker) because it is pure maths worth testing on
// its own; all this does is bolt a mesh to it.
function makeGhostPatrol(scene, legs, tint, phase) {
  const ghost = makeGhost(scene, legs[0][0], legs[0][1], tint);
  const walker = routeWalker(legs, phase);
  return {
    group: ghost,
    get leg() { return walker.leg; },
    get recharge() { return walker.recharge; },
    set recharge(v) { walker.recharge = v; },
    get phase() { return walker.phase; },
    step: (dt) => walker.step(dt),
  };
}

export function addGlassCity(scene, opts = {}) {
  const onCrystalPop = typeof opts.onCrystalPop === 'function' ? opts.onCrystalPop : null;
  const onGhostRide = typeof opts.onGhostRide === 'function' ? opts.onGhostRide : null;
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

  // ---- Balloon plaza: the blue "orchard" balloons pop when driven over ----
  const blueBalloons = makeOrchardPlaza(scene, 44, 154);

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

  // ---- Street ghosts ----
  // Two square loops, each built from street lanes and each skirting the
  // tableau shops. The routes are chosen so no corner lands on a shop: the west
  // ghost runs between the columns either side of the tableau at (-16, 143) on
  // the z=143 lane, the east ghost keeps to the far side of the plaza.
  const ghosts = [];
  for (const r of GHOST_ROUTES) {
    // A route that would clip a shop is dropped rather than silently repaired:
    // the routes in glasscityGhosts.js are chosen by hand, and this is the guard
    // that they stay correct if the tower grid is ever respaced.
    if (r.legs.some(([x, z]) => laneBlocked(x, z))) {
      console.warn(`glasscity: a ghost route lands on a tableau shop; route dropped`);
      continue;
    }
    ghosts.push(makeGhostPatrol(scene, r.legs, r.tint, r.phase));
  }

  // ---- Crystal clusters along the streets ----
  // (removed — the street crystal clusters were deleted at the player's
  // request; only the citadel spire above remains.)

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
    tableauA.update(delta, clockT, player);
    tableauB.update(delta, clockT, player);
    clockT += delta;
    // The ghosts walk their fixed loops. Touching one is the pickup - it never
    // homes in, so the only way to get caught is to drive into it, and the
    // recharge keeps a single pass from triggering twice on the way out.
    for (const g of ghosts) {
      const mv = g.step(delta);
      const grp = g.group;
      if (mv) {
        grp.position.x = mv.x;
        grp.position.z = mv.z;
        // Ease the heading toward the leg direction so corners read as a drift.
        const cur = grp.rotation.y;
        let diff = ((mv.heading - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        grp.rotation.y = cur + diff * Math.min(1, delta * 3.2);
      }
      // The hover and the skirt ripple never stop, even while recharging: a
      // ghost parked dead still would read as a dropped prop.
      grp.position.y = Math.sin(clockT * 1.6 + g.phase) * 0.35;
      for (const r of grp.children) {
        if (r.userData.phase === undefined) continue;
        r.scale.setScalar(1 + Math.sin(clockT * 3.4 + r.userData.phase) * 0.12);
      }
      if (g.recharge > 0 || !onGhostRide) continue;
      if (ghostTouches(grp.position.x, grp.position.z, player.x, player.z, player.y)) {
        g.recharge = GHOST_RECHARGE;
        // Fade the ghost out and back in with the recharge rather than popping.
        grp.visible = false;
        setTimeout(() => { grp.visible = true; }, GHOST_RECHARGE * 1000 * 0.7);
        onGhostRide({ x: grp.position.x, z: grp.position.z });
      }
    }
    // The plaza balloons bob and rotate slowly; drive over one and it pops.
    for (const b of blueBalloons) {
      if (b.alive) {
        b.g.rotation.y += delta * 0.05;
        if (b.g.visible && player.y < 3) {
          const dx = player.x - b.x;
          const dz = player.z - b.z;
          if (dx * dx + dz * dz < b.radius * b.radius) {
            b.alive = false;
            b.g.visible = false;
            b.respawn = 6;
            spawnCrystalBurst(b.x, b.z, 0x2f8fe0);
            if (onCrystalPop) onCrystalPop(b);
          }
        }
      } else {
        b.respawn -= delta;
        if (b.respawn <= 0) {
          b.alive = true;
          b.g.visible = true;
          b.g.scale.setScalar(0.001);
        }
      }
      if (b.alive && b.g.scale.x < 1) {
        b.g.scale.setScalar(Math.min(1, b.g.scale.x + delta * 2.5));
      }
    }
    // The citadel crystal slowly turns and its halo pulses.
    spire.rotation.y += delta * 0.25;
    spireHalo.rotation.z += delta * 0.6;
    spireLight.intensity = 2.6 + 0.9 * Math.sin(clockT * 1.8);
    spireHalo.material.opacity = 0.5 + 0.25 * Math.sin(clockT * 1.8);
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
  return { colliders, update, balloons: blueBalloons, spire, ghosts };
}
