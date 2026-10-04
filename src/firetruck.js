import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
// Stamp matches main.js's import of this module. Two different query strings are
// two different cache keys, so an unstamped import here would have the browser
// hold a second, potentially stale copy of cars.js.
import { createFiretruck } from './cars.js?v=1791123166969';

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

// Burning buildings: x/z = building centre, w/d = footprint, h = roof height.
// Fire = roof plume + a few random windows + the upper corners (no ground-floor
// fire). At most two buildings burn at once.
//
// This is only a fallback for when the caller has not handed us the city:
// main.js passes cityFireSpots(buildingColliders), so the fires always land on
// real roofs of the buildings that are actually standing. Deriving them from the
// colliders is what stops a flame from being left hovering in mid-air beside a
// building that has since been replaced. The fire station is deliberately not in
// the caller's list either — the engine lives in it.
const FIRE_SPOTS = [
  { x: -30, z: -28, h: 11.7, w: 20.6, d: 14.6 },   // bank
  { x: 24, z: -67, h: 10, w: 20, d: 12 },            // apartments
  { x: 28, z: 30, h: 12.5, w: 20, d: 14 },           // hospital
];

const FIRE_HEALTH = 7;
const SPRAY_RATE = 3.2;       // fire health drained per second while dousing
const STOP_DIST = 8;          // park when this close (along the road) to the fire
const PATROL_MIN = -55;
const PATROL_MAX = 55;
const PATROL_SPEED = 4.5;
const RESPOND_SPEED = 7;
const RETURN_SPEED = 9;       // hurrying back to the station after a call
const BAY_SPEED = 5.5;        // pulling out of / reversing back into the bay
const BAY_TURN = 0.5;         // seconds spent swinging onto the street
const TURN_RATE = 4.5;        // rad/s for that swing
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

// The engine's day. `home` is the station's apparatus bay in world space —
// { x, z, yaw, roadZ, roadMinX, roadMaxX } — handed in by main.js from
// cityFireStationBay(). Pass null and the whole station half of the behaviour
// switches off: the truck spawns on the road and patrols it, exactly as it used
// to.
//
//   parked   → sitting nose-out in the bay, lights off, waiting for a call
//   exiting  → pulling forward out of the bay, down the apron and up the drive
//   turning  → swinging 90° onto the street before it drives off
//   respond  → running along the drag toward the nearest burning building
//   fight    → parked on the road, deck gun on the fire
//   patrol   → nothing burning, ambling up and down the drag
//   homeward → hurrying back down the drag to the station's x
//   entering → reversing down the drive and back into the bay
export function addFiretruck(scene, spots = null, home = null) {
  const truck = createFiretruck();
  // Prefer caller-supplied spots so the fires track the buildings that exist;
  // fall back to the hard-coded list if none were given.
  const spotList = (spots && spots.length) ? spots : FIRE_SPOTS;
  const fires = spotList.map((s) => makeFire(scene, s));

  // Start in the bay if we were given one, otherwise out on the drag.
  if (home) {
    truck.position.set(home.x, 0.15, home.z);
    truck.rotation.y = home.yaw;
  } else {
    truck.position.set(45, 0.15, 0);
    truck.rotation.y = 0;   // face -X at spawn — sits behind the player, facing it
  }
  scene.add(truck);

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

  const state = {
    mode: home ? 'parked' : 'patrol',
    dir: 1,
    target: null,
    flash: 0,
    turn: 0,          // seconds left of the 90° swing onto the street
    turnTo: 0,        // yaw to swing to
  };
  const ctx = { wrapX: (v) => v, wrapDeltaX: (a, b) => b - a, blocked: () => false };
  let recoil = 0;   // signed X velocity from being rammed — decays each frame
  // Duty switch. Flipped off by main.js when the player picks the fire truck
  // from the car list: from then on they are the engine, and this one parks in
  // its bay with the beacons dark. The fires keep burning and keep smoking —
  // they belong to the city, not to this truck.
  let onDuty = true;

  // The lane the truck uses when it is on the street, and how far along it it
  // is allowed to wander. With a station, the lane is the centre line of the
  // street the station fronts and the limits are that street's own extent, so
  // the engine stays on tarmac. Without one it keeps the old wide drag patrol.
  const roadZ = home ? home.roadZ : 0;
  const laneMinX = home ? home.roadMinX : PATROL_MIN;
  const laneMaxX = home ? home.roadMaxX : PATROL_MAX;

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

  // True once the engine is close enough to put water on the fire. It works its
  // own street rather than driving to the building, so the x it can actually
  // reach is the fire's x clamped to the ends of that street — and a fire past
  // the end of the street is fought from the end of it rather than leaving the
  // engine driving at a stop dist it will never close.
  function atFire(f) {
    const reach = Math.max(laneMinX, Math.min(laneMaxX, f.x));
    return Math.abs(ctx.wrapDeltaX(truck.position.x, reach)) <= STOP_DIST;
  }

  // Aim the deck gun at the fire and spray a stream of water droplets from the
  // nozzle tip.
  //
  // The engine works its own street rather than driving to each building, so a
  // shot can be a long one — the far side of town is well over a hundred units.
  // Solving the ballistic arc at a fixed muzzle speed would put the water a
  // hundred units into the air and the droplets would expire before they landed,
  // so the flight time is bounded instead and the muzzle speed solved from it.
  // Every shot then leaves the nozzle as a believable arc and always completes,
  // however far away the building is.
  const MAX_FLIGHT = 2.2;
  function douse(fire, delta) {
    const pivot = truck.userData.nozzlePivot;
    truck.updateMatrixWorld();
    const fireLocal = truck.worldToLocal(new THREE.Vector3(fire.x, fire.h + 1.5, fire.z));
    const dist = fireLocal.distanceTo(pivot.position);
    const t = Math.min(MAX_FLIGHT, dist / DROP_SPEED);
    const speed = dist / t;                       // >= DROP_SPEED for a long shot
    const lift = 0.5 * GRAVITY * t * t;           // arc compensation
    const dirLocal = fireLocal.sub(pivot.position).add(new THREE.Vector3(0, lift, 0)).normalize();
    pivot.quaternion.setFromUnitVectors(UP, dirLocal);

    const tipLocal = pivot.position.clone().addScaledVector(dirLocal, 1.7);
    const tipWorld = truck.localToWorld(tipLocal);
    const dirWorld = dirLocal.clone().applyQuaternion(truck.quaternion);

    const n = Math.floor(delta * 90);
    for (let i = 0; i < n && droplets.length < 220; i++) {
      const d = {
        mesh: new THREE.Mesh(dropGeo, dropMat),
        vel: dirWorld.clone().multiplyScalar(speed),
        life: t + 0.35,
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
      // Parked in the bay the beacons are off — an engine sitting in its garage
      // with the lightbar going would read as permanently on a call. They come
      // up the moment it starts moving, and go out again when it gets home.
      const stowed = !onDuty || state.mode === 'parked';
      const OFF = 0.05;
      const ON = stowed ? OFF : 2.4;
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

    // ===== Stood down =====
    // Everything above this line is the city's, not the engine's: the flames
    // flicker and the smoke plumes whether or not anybody is fighting them. What
    // comes next is this truck's own behaviour, and while the player is driving
    // their own engine there must be none of it — no answering calls, no wheels
    // turning, not even the recoil from a shunt. So hold it in the bay (or just
    // stop dead, if it has no bay) and return before the state machine runs.
    if (!onDuty) {
      recoil = 0;
      if (home) {
        truck.position.set(home.x, 0.15, home.z);
        truck.rotation.y = home.yaw;
      }
      updateDroplets(delta);
      return;
    }

    let spin = 0;

    // ===== Which road state should the engine be in? =====
    // Only the states that put the truck on a road look for a fire to answer.
    // Sitting in the bay, a bare x comparison would read "already there" for any
    // building sharing the station's x, and the engine would start fighting a
    // fire it cannot see the front of.
    const onRoad = state.mode === 'respond' || state.mode === 'fight' || state.mode === 'patrol';
    const target = onRoad ? nearestFire() : null;

    // Leaving the bay: ANY burning building anywhere is a call, not just one
    // near the station.
    if (state.mode === 'parked' && fires.some((f) => f.active)) state.mode = 'exiting';

    // Road-state bookkeeping. `homeward` is terminal while it lasts — the engine
    // finishes its trip back to the station rather than being re-tasked mid-run.
    if (state.mode === 'respond' || state.mode === 'patrol') {
      if (target) {
        state.target = target;
        state.mode = atFire(target) ? 'fight' : 'respond';
      } else {
        state.target = null;
        if (home) {
          state.mode = 'homeward';
          state.dir = Math.sign(ctx.wrapDeltaX(truck.position.x, home.x)) || 1;
        }
      }
    }
    if (state.mode === 'fight' && (!state.target || !state.target.active)) {
      state.target = null;
      state.mode = home ? 'homeward' : 'patrol';
      if (home) state.dir = Math.sign(ctx.wrapDeltaX(truck.position.x, home.x)) || 1;
    }

    if (Math.abs(recoil) > 0.02) {
      // Bouncing back from a collision — override normal driving this frame so
      // the truck physically recoils instead of plowing through the player.
      truck.position.x = ctx.wrapX(truck.position.x + recoil * delta);
      recoil *= 0.85;
      if (Math.abs(recoil) > 0.02) truck.rotation.y = recoil < 0 ? 0 : Math.PI;
      spin = Math.abs(recoil) * delta;
    } else {
      recoil = 0;
      // The 90° swing between the bay and the street. Movement is suspended for
      // the beat so the truck pivots on the apron instead of crabbing sideways.
      if (state.turn > 0) {
        state.turn -= delta;
        const dy = state.turnTo - truck.rotation.y;
        truck.rotation.y += Math.atan2(Math.sin(dy), Math.cos(dy)) * Math.min(1, TURN_RATE * delta);
        if (state.turn <= 0) truck.rotation.y = state.turnTo;
      } else if (state.mode === 'parked') {
        // Held hard on the bay marks, so a shove in the forecourt cannot shunt
        // it out of its own garage.
        truck.position.x = home.x;
        truck.position.z = home.z;
        truck.rotation.y = home.yaw;
      } else if (state.mode === 'exiting') {
        // The nose already points out of the bay, so this is a straight pull
        // forward down the apron onto the lane.
        truck.rotation.y = home.yaw;
        if (!ctx.blocked()) {
          truck.position.z += BAY_SPEED * delta;
          spin += BAY_SPEED * delta;
        }
        if (truck.position.z >= roadZ) {
          truck.position.z = roadZ;
          state.mode = 'turning';
          state.turn = BAY_TURN;
          state.turnTo = Math.PI;   // nose to +X, facing east down the drag
        }
      } else if (state.mode === 'turning') {
        truck.position.z = roadZ;
        if (state.turn <= 0) {
          // Back on the road: pick up whatever needs doing, which is usually
          // "nothing", in which case head straight home again.
          const f = nearestFire();
          state.target = f;
          if (f) {
            state.mode = atFire(f) ? 'fight' : 'respond';
          } else {
            state.mode = home ? 'homeward' : 'patrol';
            if (home) state.dir = Math.sign(ctx.wrapDeltaX(truck.position.x, home.x)) || 1;
          }
        }
      } else if (state.mode === 'entering') {
        // Reverse straight back down the lane with the nose still pointing out —
        // the way a pumper actually parks, and it keeps the bay a straight-line
        // manoeuvre with no swinging inside a 7.4-wide door.
        truck.rotation.y = home.yaw;
        if (!ctx.blocked()) {
          truck.position.z -= BAY_SPEED * delta;
          spin += BAY_SPEED * delta;
        }
        if (truck.position.z <= home.z) {
          truck.position.z = home.z;
          truck.position.x = home.x;
          state.mode = 'parked';
        }
      } else if (state.mode === 'homeward') {
        // Run the drag back to the station's x, then drop onto the apron lane.
        if (Math.abs(ctx.wrapDeltaX(truck.position.x, home.x)) > 2.0) {
          if (!ctx.blocked()) {
            truck.position.x = ctx.wrapX(truck.position.x + state.dir * RETURN_SPEED * delta);
            spin += RETURN_SPEED * delta;
          }
          truck.rotation.y = state.dir > 0 ? Math.PI : 0;
        } else {
          truck.position.x = home.x;
          truck.position.z += (roadZ - truck.position.z) * Math.min(1, delta * 3);
          truck.rotation.y = home.yaw;
          state.mode = 'entering';
        }
      } else if (state.mode === 'respond') {
        // Run the drag toward the fire's x. It works its own street rather than
        // driving to the building, so the target is clamped to the ends of that
        // street — the engine pulls up at the far end and puts water on the fire
        // from there rather than driving off the end of the tarmac.
        const dx = ctx.wrapDeltaX(truck.position.x, state.target.x);
        const dir = Math.sign(dx) || 1;
        const want = Math.max(laneMinX, Math.min(laneMaxX, truck.position.x + dir * RESPOND_SPEED * delta));
        if (!ctx.blocked()) {
          truck.position.x = ctx.wrapX(want);
          spin += RESPOND_SPEED * delta;
        }
        truck.rotation.y = dir > 0 ? Math.PI : 0;
      } else if (state.mode === 'patrol') {
        if (!ctx.blocked()) {
          truck.position.x = ctx.wrapX(truck.position.x + state.dir * PATROL_SPEED * delta);
          spin += PATROL_SPEED * delta;
        }
        if (truck.position.x > laneMaxX) state.dir = -1;
        if (truck.position.x < laneMinX) state.dir = 1;
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
          // Fire is out — the engine goes back to the station rather than
          // loitering on the road with nothing to do.
          state.mode = home ? 'homeward' : 'patrol';
          if (home) state.dir = Math.sign(ctx.wrapDeltaX(truck.position.x, home.x)) || 1;
        }
      }
    }

    // Spin the wheels while moving
    for (const w of truck.userData.wheels) w.rotation.y += spin * 2.6;

    updateDroplets(delta);
  }

  return {
    truck, fires, update,
    // The player is driving their own engine: hide this one and stop it working.
    // Handing the seat back resumes from the bay, lights off, so it does not
    // pull out of the station mid-frame.
    standDown: (off) => {
      onDuty = !off;
      truck.visible = !off;
      if (off) {
        recoil = 0;
        if (home) {
          truck.position.set(home.x, 0.15, home.z);
          truck.rotation.y = home.yaw;
        }
      } else {
        state.target = null;
        state.mode = home ? 'parked' : 'patrol';
      }
    },
    // Is this engine the one on duty? main.js reads it to keep a stood-down
    // truck from blocking the street as an invisible wall.
    duty: () => onDuty,
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
