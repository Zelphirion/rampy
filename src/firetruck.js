import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createFiretruck } from './cars.js';

const UP = new THREE.Vector3(0, 1, 0);

// Shared fire materials — bright, unlit cones so the flames pop against the
// night scene (each flame still flickers independently via its own scale).
const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f });
const flameMidMat = new THREE.MeshBasicMaterial({ color: 0xff9e2c });
const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });

// Shared flame cone geometries (centered on origin; tip points up)
const FLAME_GEO = {
  roofOuter: new THREE.ConeGeometry(1.6, 5.0, 10),
  roofCore: new THREE.ConeGeometry(0.85, 2.6, 8),
  roofSmall: new THREE.ConeGeometry(0.7, 2.2, 8),
  win: new THREE.ConeGeometry(0.3, 1.1, 7),
  corner: new THREE.ConeGeometry(0.85, 3.4, 8),
};

// Burning buildings next to the main road: x/z = building position, w/d =
// footprint, h = roof height. Fire = roof plume + a few random windows + the
// upper corners (no ground-floor fire). At most two buildings burn at once.
// The truck parks on the road (z=0) and douses them. Spot 3 IS the portal
// building (see map.js openBuildingSpec) — same centre/footprint/height so
// every flame sits exactly on that building.
const FIRE_SPOTS = [
  { x: -28, z: 12, h: 8,  w: 8,  d: 8 },
  { x: 36,  z: 12, h: 7,  w: 8,  d: 7 },
  { x: 56,  z: 27, h: 20, w: 28, d: 28 },   // the big portal levitation hall
  { x: 0,   z: -24, h: 13, w: 10, d: 8 },
];

const FIRE_HEALTH = 7;
const SPRAY_RATE = 3.2;       // fire health drained per second while dousing
const STOP_DIST = 8;          // park when this close (along the road) to the fire
const PATROL_MIN = -55;
const PATROL_MAX = 55;
const PATROL_SPEED = 4.5;
const RESPOND_SPEED = 7;
const DROP_SPEED = 26;        // water droplet muzzle speed
const GRAVITY = 13;           // water droplet gravity

const SMOKE_PUFFS = 12;       // soft smoke billboards per burning building
const SMOKE_RISE = 22;        // how high the plume climbs above the roof
const SMOKE_OPACITY = 0.4;    // peak smoke opacity (semi-transparent)

// Soft radial-gradient texture for the smoke billboards (canvas-generated)
const smokeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(190,190,205,0.5)');
  grad.addColorStop(0.55, 'rgba(175,175,190,0.25)');
  grad.addColorStop(1, 'rgba(160,160,175,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

// Build a building fire: an animated roof plume, flames out of only a few
// random windows, fire climbing the upper corners, a warm flickering glow and
// semi-transparent smoke pluming into the sky. No ground-floor flames. The
// returned `flames` array lets update() flicker each one independently and
// shrink them all as the truck douses the fire.
function makeFire(scene, spot) {
  const group = new THREE.Group();
  group.position.set(spot.x, 0, spot.z);
  const { w, d, h } = spot;
  const flames = [];   // { mesh, phase, freq, amp, base, sway, rz }

  // Big buildings get big flames: scale every cone up on huge footprints so
  // the fire reads at distance (small buildings keep the original sizes).
  const sizeK = Math.max(1, Math.max(w, d) / 12);

  const add = (geo, mat, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = opts.rx || 0;
    m.rotation.z = opts.rz || 0;
    if (sizeK !== 1) m.scale.setScalar(sizeK);
    group.add(m);
    flames.push({
      mesh: m,
      phase: opts.phase ?? flames.length * 1.31,
      freq: opts.freq ?? 6 + (flames.length % 5),
      amp: opts.amp ?? 0.22,
      base: opts.base ?? 1,
      sway: opts.sway ?? 0,
      rz: m.rotation.z,
    });
    return m;
  };

  // Big plume rising off the roof centre + extra licks scattered on the roof
  add(FLAME_GEO.roofOuter, flameOuterMat, 0, h + 0.35 + 2.5, 0, { freq: 6.5, amp: 0.25, sway: 0.05 });
  add(FLAME_GEO.roofCore, flameCoreMat, 0, h + 0.35 + 1.3, 0, { freq: 9, amp: 0.3, sway: 0.06 });
  add(FLAME_GEO.roofSmall, flameMidMat, -w * 0.18, h + 0.35 + 1.1, -d * 0.15, { freq: 7, amp: 0.28 });
  add(FLAME_GEO.roofSmall, flameMidMat, w * 0.22, h + 0.35 + 1.1, d * 0.1, { freq: 8, amp: 0.26 });
  add(FLAME_GEO.roofSmall, flameOuterMat, w * 0.05, h + 0.35 + 1.0, d * 0.25, { freq: 7.5, amp: 0.3 });

  // Flames out of only 2-3 RANDOM windows (not every window; the window rows
  // sit at mid-building height so none are on the ground floor).
  const cols = [-0.45, 0, 0.45];
  const faces = [
    { ox: 0, oz: d / 2 + 0.35, rx: 0.5, rz: 0 },      // front (+Z)
    { ox: 0, oz: -(d / 2 + 0.35), rx: -0.5, rz: 0 },   // back (-Z)
    { ox: -(w / 2 + 0.35), oz: 0, rx: 0, rz: 0.5 },    // left (-X)
    { ox: w / 2 + 0.35, oz: 0, rx: 0, rz: -0.5 },      // right (+X)
  ];
  const windowSpots = [];
  for (const face of faces) {
    const onX = face.rz !== 0;   // left/right faces vary along z
    const span = onX ? d : w;    // how wide this face is — spread columns across it
    for (let row = 0; row < 3; row++) {
      const yRow = h / 2 + 0.7 + row * 0.9;
      for (let ci = 0; ci < cols.length; ci++) {
        const c = cols[ci] * Math.max(1, span * 0.3);
        windowSpots.push({
          px: onX ? face.ox : c,
          pz: onX ? c : face.oz,
          y: yRow + 0.55,
          rx: face.rx, rz: face.rz,
          mat: (row + ci) % 3 === 0 ? flameCoreMat : ((row + ci) % 2 ? flameMidMat : flameOuterMat),
        });
      }
    }
  }
  // Fisher-Yates shuffle, then keep a random 2 or 3
  for (let i = windowSpots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [windowSpots[i], windowSpots[j]] = [windowSpots[j], windowSpots[i]];
  }
  const nWin = 2 + Math.floor(Math.random() * 2);   // 2 or 3
  for (let i = 0; i < nWin; i++) {
    const ws = windowSpots[i];
    add(FLAME_GEO.win, ws.mat, ws.px, ws.y, ws.pz, { rx: ws.rx, rz: ws.rz, freq: 8 + i * 0.7, amp: 0.3, sway: 0.08 });
  }

  // Fire climbing the four upper corners (kept off the ground floor)
  const corners = [
    [-w / 2, -d / 2, 0.5, -0.5],
    [w / 2, -d / 2, -0.5, -0.5],
    [-w / 2, d / 2, 0.5, 0.5],
    [w / 2, d / 2, -0.5, 0.5],
  ];
  for (const [cx, cz, rz, rx] of corners) {
    add(FLAME_GEO.corner, flameMidMat, cx, h * 0.45 + 1.7, cz, { rx, rz, freq: 6.5, amp: 0.3, sway: 0.1 });
    add(FLAME_GEO.corner, flameOuterMat, cx, h * 0.85 + 1.7, cz, { rx, rz, freq: 7.5, amp: 0.32, sway: 0.12 });
  }

  // Warm flickering glow so the building walls themselves read as "on fire"
  // (bigger buildings get a stronger, wider-reaching glow)
  const glow = new THREE.PointLight(0xff6a1f, 42 * sizeK, 46 * sizeK, 2);
  glow.position.set(0, h * 0.55, 0);
  group.add(glow);
  const glowBase = 42 * sizeK;
  const glowAmp = 18 * sizeK;

  // Semi-transparent smoke pluming up from the roof into the sky
  const smoke = [];
  for (let i = 0; i < SMOKE_PUFFS; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTex, transparent: true, opacity: 0, depthWrite: false,
    }));
    s.position.set(0, h + 0.4, 0);
    s.scale.set(1, 1, 1);
    group.add(s);
    smoke.push({
      sprite: s,
      t: i / SMOKE_PUFFS,                          // staggered so the column is continuous
      speed: 0.18 + Math.random() * 0.16,          // plume cycles per second
      driftX: (Math.random() - 0.5) * 7,
      driftZ: (Math.random() - 0.5) * 7,
      wob: Math.random() * Math.PI * 2,
    });
  }

  scene.add(group);
  return {
    x: spot.x, z: spot.z, h: spot.h,
    w: spot.w, d: spot.d,
    health: FIRE_HEALTH, active: true, respawn: 0,
    group, flames, glow, smoke, glowBase, glowAmp,
  };
}

export function addFiretruck(scene) {
  const truck = createFiretruck();
  truck.position.set(45, 0.15, 0);
  truck.rotation.y = 0;   // face -X at spawn — sits behind the player, facing it
  scene.add(truck);

  const fires = FIRE_SPOTS.map((s) => makeFire(scene, s));

  // Only two buildings burn at a time: pick two to start, hold the rest back
  // with staggered relight timers so they cycle in as slots free up.
  [...fires].sort(() => Math.random() - 0.5).forEach((f, i) => {
    if (i < 2) return;
    f.active = false;
    f.health = 0;
    f.group.visible = false;
    f.respawn = 4 + Math.random() * 8;
  });

  // Water droplet pool (visual spray; damage is applied continuously)
  const droplets = [];
  const dropGeo = new THREE.SphereGeometry(0.1, 6, 6);
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xaee4ff, transparent: true, opacity: 0.85, roughness: 0.15 });

  const state = { mode: 'patrol', dir: 1, target: null, flash: 0 };
  const ctx = { wrapX: (v) => v, wrapDeltaX: (a, b) => b - a, blocked: () => false };
  let recoil = 0;   // signed X velocity from being rammed — decays each frame

  function nearestFire() {
    let best = null;
    let bd = Infinity;
    for (const f of fires) {
      if (!f.active) continue;
      const d = Math.abs(ctx.wrapDeltaX(truck.position.x, f.x));
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  // Aim the deck gun at the fire (with a ballistic arc so the stream lands on
  // it) and spray a stream of water droplets from the nozzle tip.
  function douse(fire, delta) {
    const pivot = truck.userData.nozzlePivot;
    truck.updateMatrixWorld();
    const fireLocal = truck.worldToLocal(new THREE.Vector3(fire.x, fire.h + 1.5, fire.z));
    const dist = fireLocal.distanceTo(pivot.position);
    const t = dist / DROP_SPEED;
    const lift = 0.5 * GRAVITY * t * t;   // arc compensation
    const dirLocal = fireLocal.sub(pivot.position).add(new THREE.Vector3(0, lift, 0)).normalize();
    pivot.quaternion.setFromUnitVectors(UP, dirLocal);

    const tipLocal = pivot.position.clone().addScaledVector(dirLocal, 1.7);
    const tipWorld = truck.localToWorld(tipLocal);
    const dirWorld = dirLocal.clone().applyQuaternion(truck.quaternion);

    const n = Math.floor(delta * 90);
    // Long shots (the truck fights from the road, and the portal hall stands
    // far back from it) need extra airtime or the water dies mid-flight.
    const life = Math.min(2.4, dist / DROP_SPEED + 0.3);
    for (let i = 0; i < n && droplets.length < 220; i++) {
      const d = {
        mesh: new THREE.Mesh(dropGeo, dropMat),
        vel: dirWorld.clone().multiplyScalar(DROP_SPEED),
        life,
      };
      d.mesh.position
        .copy(tipWorld)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
      d.vel.x += (Math.random() - 0.5) * 2.5;
      d.vel.z += (Math.random() - 0.5) * 2.5;
      scene.add(d.mesh);
      droplets.push(d);
    }
  }

  function updateDroplets(delta) {
    const f = state.target;
    const firePos = f && f.active ? new THREE.Vector3(f.x, f.h + 1.5, f.z) : null;
    for (let i = droplets.length - 1; i >= 0; i--) {
      const d = droplets[i];
      d.life -= delta;
      d.vel.y -= GRAVITY * delta;
      d.mesh.position.addScaledVector(d.vel, delta);
      if (firePos && d.mesh.position.distanceTo(firePos) < 2.6) d.life = 0;   // splash on the fire
      if (d.life <= 0) { scene.remove(d.mesh); droplets.splice(i, 1); }
    }
  }

  function update(delta, ctxIn) {
    Object.assign(ctx, ctxIn);
    state.flash += delta;

    // Flicker the flames + flash the warning lights
    const blink = Math.floor(state.flash / 0.35) % 2 === 0;
    const wl = truck.userData.warningLights;
    if (wl) {
      const ON = 2.4, OFF = 0.05;
      const setAll = (lights, on) => {
        if (!Array.isArray(lights)) return;   // tolerate stale/mismatched builds
        for (const l of lights) l.material.emissiveIntensity = on ? ON : OFF;
      };
      // Red: bar halves + rear strobes swap left/right every beat
      setAll(wl.redLeft, blink);
      setAll(wl.redRight, !blink);
      // Yellow side markers take the off-beat so something is always lit
      setAll(wl.yellow, !blink);
      // White front flashers strobe twice as fast
      setAll(wl.white, Math.floor(state.flash / 0.175) % 2 === 0);
    }
    for (const f of fires) {
      if (!f.active) continue;
      // Each flame flickers and sways on its own phase; the whole fire dies
      // down as the truck douses it (scale tracks remaining health).
      const healthScale = 0.3 + 0.7 * Math.max(0, f.health) / FIRE_HEALTH;
      for (const fl of f.flames) {
        const s = (fl.base + Math.sin(state.flash * fl.freq + fl.phase) * fl.amp) * healthScale;
        fl.mesh.scale.y = s;
        const w = (1 + Math.sin(state.flash * (fl.freq * 0.7) + fl.phase * 1.7) * fl.amp * 0.5) * healthScale;
        fl.mesh.scale.x = w;
        fl.mesh.scale.z = w;
        fl.mesh.rotation.z = fl.rz + Math.sin(state.flash * 2 + fl.phase) * fl.sway;
      }
      f.glow.intensity = (f.glowBase + Math.sin(state.flash * 11 + f.x * 0.7) * f.glowAmp) * healthScale;

      // Smoke pluming into the sky: each puff rises, drifts, grows and fades
      // on its own loop.
      for (const p of f.smoke) {
        p.t += delta * p.speed;
        if (p.t >= 1) p.t -= 1;
        const t = p.t;
        const swayX = Math.sin(state.flash * 1.3 + p.wob) * 2.2 * t;
        const swayZ = Math.cos(state.flash * 1.1 + p.wob * 1.4) * 2.2 * t;
        p.sprite.position.set(swayX + p.driftX * t, f.h + 0.4 + t * SMOKE_RISE, swayZ + p.driftZ * t);
        const sz = 2.2 + t * 5.5;
        p.sprite.scale.set(sz, sz, 1);
        p.sprite.material.opacity = SMOKE_OPACITY * (1 - t);
      }
    }
    // (Fires are no longer relit on a timer — the flame lizard scurries around
    // and lights buildings itself, so the fire engine always has work to do.)

    // Pick the nearest active fire
    const target = nearestFire();

    // State machine: patrol <-> respond <-> fight
    if (state.mode !== 'fight') {
      if (target) {
        state.target = target;
        state.mode = Math.abs(ctx.wrapDeltaX(truck.position.x, target.x)) > STOP_DIST ? 'respond' : 'fight';
      } else {
        state.target = null;
        state.mode = 'patrol';
      }
    }
    if (state.mode === 'fight' && (!state.target || !state.target.active)) {
      state.mode = 'patrol';
      state.target = null;
    }

    let spin = 0;
    if (Math.abs(recoil) > 0.02) {
      // Bouncing back from a collision — override normal driving this frame so
      // the truck physically recoils instead of plowing through the player.
      truck.position.x = ctx.wrapX(truck.position.x + recoil * delta);
      recoil *= 0.85;
      if (Math.abs(recoil) > 0.02) truck.rotation.y = recoil < 0 ? 0 : Math.PI;
      spin = Math.abs(recoil) * delta;
    } else {
      recoil = 0;
      if (state.mode === 'respond') {
        const dx = ctx.wrapDeltaX(truck.position.x, state.target.x);
        const dir = Math.sign(dx);
        if (!ctx.blocked()) {
          truck.position.x = ctx.wrapX(truck.position.x + dir * RESPOND_SPEED * delta);
          spin = RESPOND_SPEED * delta;
        }
        truck.rotation.y = dir > 0 ? Math.PI : 0;
      } else if (state.mode === 'patrol') {
        if (!ctx.blocked()) {
          truck.position.x = ctx.wrapX(truck.position.x + state.dir * PATROL_SPEED * delta);
          spin = PATROL_SPEED * delta;
        }
        if (truck.position.x > PATROL_MAX) state.dir = -1;
        if (truck.position.x < PATROL_MIN) state.dir = 1;
        truck.rotation.y = state.dir > 0 ? Math.PI : 0;
      } else if (state.mode === 'fight') {
        const f = state.target;
        douse(f, delta);
        f.health -= SPRAY_RATE * delta;
        if (f.health <= 0) {
          f.active = false;
          f.group.visible = false;
          f.respawn = 14 + Math.random() * 12;
          state.target = null;
          state.mode = 'patrol';
        }
      }
    }

    // Spin the wheels while moving
    for (const w of truck.userData.wheels) w.rotation.y += spin * 2.6;

    updateDroplets(delta);
  }

  return {
    truck, fires, update,
    // The flame lizard calls this to light a (currently dark) building on fire.
    ignite: (f) => {
      f.active = true;
      f.health = FIRE_HEALTH;
      f.group.visible = true;
      f.respawn = 0;
    },
    bump: (nx, nz) => {
      // Another vehicle rammed into us: recoil away along the collision normal.
      // The truck only travels along X, so use the X component of the push.
      recoil = Math.sign(nx || 1) * 5;
    },
  };
}
