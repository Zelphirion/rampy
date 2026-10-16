import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { shipStateAt, shipOffsets, SHIP_CYCLE } from './spaceportPhases.js?v=1799999999999';

// ===== Intergalactic Spaceship Transport Company =====
// The industrial compound in the south-west quarter of the city (world -58,
// -60, front facing north toward town). It occupies the block that used to be
// the empty parking lot (now removed). It is a fenced yard with docks where
// lozenge-shaped spacecraft sit under gantries, a round launch pad, a control
// tower and a fuel farm. Each ship runs the endless loop described in
// spaceportPhases.js: the big top window opens, a robot arm loads cargo, the
// hull swings upright, taxis to the pad and launches on a column of fire until
// it is far out of sight, then hovers back down to be refilled.
//
// The compound is authored in LOCAL space with +Z pointing at the town (north)
// and the origin at the middle of the yard; `site` drops it into the world. With
// yaw 0 the local axes are the world axes, so colliders are a plain translation.
//
// No text anywhere (per the brief) - the whole thing has to read from shape and
// emissive light alone.

export const SPACEPORT_SITE = { x: -58, z: -60, yaw: 0 };

// The compound is deliberately compact: a 16 x 22 apron that fits the former
// parking-lot block, clear of the substation (north-east) and the railway ring
// (north). Hulls run along local +X; every ship parks with its nose toward the
// pad, which sits in the east strip.
const L = 8;         // ship length
const R = 1.5;       // ship radius
const CRADLE_Y = 1.8;
const PAD_X = 4.0;   // launch-pad centre (local)
const PAD_R = 3.0;
// Where the player's car is parked for the boarding cinematic — on the plain
// concrete apron, deliberately OFF the glowing launch-pad circle, so the moment
// the ride shrinks it is never a tiny car sitting on a big obvious target.
const STAGE_X = 1.4, STAGE_Z = -4.6;
// Half-angle of the roof opening cut from the hull. The hold is a genuine open
// bay so the player's car can be lowered in through the roof.
const SHIP_OPEN_THETA = 0.7;

// The giant boarding arm stands here (compound-local), in the middle-rear of the
// yard, clear of both taxi lanes, with a reach long enough to span the pad and
// the docks. Used only by the rocket-ride cinematic.
const ARM_X = 0.5, ARM_Z = -8.5;
const ARM_A = 5.5, ARM_B = 5.5, ARM_BASE_H = 3;

// ---- Materials -------------------------------------------------------------
const M = {
  hull: new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide }),
  hullDark: new THREE.MeshStandardMaterial({ color: 0x5b6472, roughness: 0.55, metalness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8b929c, roughness: 0.6, metalness: 0.55 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x3c434d, roughness: 0.7, metalness: 0.5 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x6d716e, roughness: 0.95 }),
  pad: new THREE.MeshStandardMaterial({ color: 0x40464c, roughness: 0.9 }),
  warning: new THREE.MeshStandardMaterial({ color: 0xd9a41b, roughness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x9fd8ff, roughness: 0.12, metalness: 0.0, transmission: 0.8,
    transparent: true, opacity: 0.4, emissive: 0x1c4a66, emissiveIntensity: 0.35,
  }),
  glowCyan: new THREE.MeshStandardMaterial({ color: 0x2b8fb8, emissive: 0x39d7ff, emissiveIntensity: 2.2, roughness: 0.4 }),
  glowWarm: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a00, emissiveIntensity: 2.4, roughness: 0.5 }),
  crate: new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.85 }),
  crate2: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.8 }),
  flameOuter: new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55, depthWrite: false }),
  flameInner: new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95, depthWrite: false }),
  blast: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
};

// ---- Tiny geometry helpers (same conventions as cityBuildings.js) ----------
// Shared, cached geometries keep the fleet cheap: every ship reuses the same
// hull, canopy, crate and nozzle geometry, only scaled.
const geo = new Map();
const cache = (k, make) => { let g = geo.get(k); if (!g) { g = make(); geo.set(k, g); } return g; };
const boxGeo = (w, h, d) => cache(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylGeo = (rt, rb, h, s) => cache(`c${rt}|${rb}|${h}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));

// ---- One spacecraft --------------------------------------------------------
// Exported so the space level can reuse THE SAME rocket model (hull, glass roof,
// interior consoles, tail fins) for the player's arrival at the wheel station -
// the ship you flew is the ship you land in, not a cheap facsimile.
export function makeShip() {
  const g = new THREE.Group();

  // Lozenge hull, nose toward +X. The hull is an open bowl: the roof cap (a cone
  // of half-angle SHIP_OPEN_THETA) is left off, so the hold is genuinely hollow -
  // a car can be lowered in through the roof and seen through the glass.
  const body = new THREE.Mesh(
    cache('shipbody', () => new THREE.SphereGeometry(1, 30, 24, 0, Math.PI * 2, SHIP_OPEN_THETA, Math.PI - SHIP_OPEN_THETA)),
    M.hull);
  body.scale.set(L / 2, R, R);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // A flat deck in the belly and a lip around the roof opening so the empty hold
  // reads as a cargo bay rather than a hole.
  const deck = new THREE.Mesh(boxGeo(L * 0.78, 0.12, R * 1.5), M.pad);
  deck.position.set(0, -R * 0.5, 0);
  g.add(deck);
  const lip = new THREE.Mesh(cache('shiplip', () => new THREE.TorusGeometry(1, 0.05, 8, 32)), M.steel);
  lip.scale.set((L / 2) * Math.sin(SHIP_OPEN_THETA), R * Math.sin(SHIP_OPEN_THETA), 1);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = R * Math.cos(SHIP_OPEN_THETA);
  g.add(lip);

  // A darker belly band and nose cap so the hull does not read as a plain egg.
  const belly = new THREE.Mesh(cache('shipbelly', () => new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45)), M.hullDark);
  belly.scale.set(L / 2 + 0.02, R + 0.02, R + 0.02);
  g.add(belly);
  const nose = new THREE.Mesh(cache('shipnose', () => new THREE.SphereGeometry(0.85, 16, 12)), M.steelDark);
  nose.scale.set(0.9, 1.0, 1.0);
  nose.position.set(L / 2 - 0.3, 0, 0);
  g.add(nose);

  // The huge top window: a half-dome hinged at the tail that lifts its nose-end
  // up to open. This is the ship's signature.
  const hinge = new THREE.Group();
  hinge.position.set(-3.2, 1.05, 0);
  const canopy = new THREE.Mesh(
    cache('canopy', () => new THREE.SphereGeometry(1, 26, 16, 0, Math.PI * 2, 0, Math.PI / 2)),
    M.glass);
  canopy.scale.set(2.9, 1.15, 1.35);
  canopy.position.set(3.5, 0, 0);
  hinge.add(canopy);
  const rim = new THREE.Mesh(cache('canopyrim', () => new THREE.TorusGeometry(1, 0.06, 8, 40)), M.steel);
  rim.scale.set(2.9, 1.35, 1);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(3.5, 0, 0);
  hinge.add(rim);
  g.add(hinge);

  // Interior consoles, so the glass has something to show. They hug the two
  // side walls (z = +/-1.05) and sit low, leaving the centre of the hold clear
  // so the player's car stays visible through the big window, nose to tail.
  for (const dx of [-3.0, -1.0, 1.0, 3.0]) {
    for (const dz of [-1.05, 1.05]) {
      const c = new THREE.Mesh(boxGeo(0.95, 0.5, 0.45), M.steelDark);
      c.position.set(dx, 0.25, dz);
      g.add(c);
      const screen = new THREE.Mesh(boxGeo(0.65, 0.32, 0.06), M.glowCyan);
      screen.position.set(dx, 0.5, dz - Math.sign(dz) * 0.26);
      g.add(screen);
    }
  }

  // Cargo (hidden until the arm loads it).
  const cargo = new THREE.Group();
  const crateMats = [M.crate, M.crate2];
  const spots = [[-2.2, -0.5], [-1.1, 0.5], [0.2, -0.5], [1.3, 0.5], [2.2, 0]];
  spots.forEach(([x, z], i) => {
    const cr = new THREE.Mesh(boxGeo(0.7, 0.7, 0.7), crateMats[i % 2]);
    cr.position.set(x, 0.8, z);
    cr.rotation.y = (i * 0.7) % 1;
    cr.castShadow = true;
    cargo.add(cr);
  });
  cargo.visible = false;
  g.add(cargo);

  // Tail fins, three around the axis, so the hull's roll is readable. Each fin
  // is ROOTED into the hull - its base sits at the hull's surface radius for that
  // station (minus an embed), so no gap shows between fin and hull - and splayed
  // outward/back like a lander's leg. The hull is an ellipsoid (semi-axes
  // L/2, R, R), so the surface radius at a given axial x is R*sqrt(1-(x/(L/2))^2).
  const finRootX = -L / 2 + 1.1;
  const finRootR = R * Math.sqrt(Math.max(0, 1 - (finRootX / (L / 2)) ** 2));
  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Group();
    holder.rotation.x = (i / 3) * Math.PI * 2;
    g.add(holder);
    const legPivot = new THREE.Group();
    legPivot.position.set(finRootX, finRootR - 0.2, 0);  // hinge buried just inside the hull
    legPivot.rotation.z = 0.55;                           // splay the fin outward/back
    holder.add(legPivot);
    const fin = new THREE.Mesh(boxGeo(0.4, 2.4, 1.3), M.steelDark);
    fin.position.set(0, 1.05, 0);                          // butt end sits inside the hull
    fin.castShadow = true;
    legPivot.add(fin);
    // A root fairing that bulges out of the hull so the join reads as solid.
    const root = new THREE.Mesh(boxGeo(0.55, 0.6, 1.45), M.hullDark);
    root.position.set(0, -0.05, 0);
    legPivot.add(root);
  }

  // Exhaust plume at the tail (points down once the ship stands vertical).
  const plume = new THREE.Group();
  plume.position.x = -L / 2;
  const outer = new THREE.Mesh(cylGeo(0.15, 1.7, 5.5, 16), M.flameOuter.clone());
  outer.rotation.z = Math.PI / 2;   // apex toward -X
  outer.position.x = -2.75;
  plume.add(outer);
  const inner = new THREE.Mesh(cylGeo(0.05, 0.9, 4.0, 16), M.flameInner.clone());
  inner.rotation.z = Math.PI / 2;
  inner.position.x = -2.0;
  plume.add(inner);
  plume.visible = false;
  g.add(plume);

  const tail = new THREE.Object3D();
  tail.position.x = -L / 2 - 1.5;
  g.add(tail);

  return { g, hinge, cargo, plume, outer, inner, tail };
}

// ---- A dock: cradle under the ship + the robot loading arm --------------
function makeDock() {
  const g = new THREE.Group();
  // Two A-frame cradles.
  for (const dx of [-1.6, 1.6]) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(boxGeo(0.3, CRADLE_Y, 0.3), M.steel);
      leg.position.set(dx, CRADLE_Y / 2, s * (R - 0.2));
      leg.rotation.x = s * 0.12;
      leg.castShadow = true;
      g.add(leg);
    }
    const beam = new THREE.Mesh(boxGeo(0.4, 0.3, R * 2), M.steel);
    beam.position.set(dx, CRADLE_Y, 0);
    g.add(beam);
  }

  // Robot arm: a gantry post beside the dock with a two-part boom that swings
  // over the hatch. armPivot rotation carries the whole boom.
  const post = new THREE.Mesh(cylGeo(0.35, 0.45, 6.5, 10), M.steel);
  post.position.set(0, 3.25, 4.2);
  post.castShadow = true;
  g.add(post);
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 6.2, 4.2);
  const boom = new THREE.Mesh(boxGeo(0.5, 0.5, 4.4), M.warning);
  boom.position.set(0, 0, -2.2);
  boom.castShadow = true;
  armPivot.add(boom);
  const wrist = new THREE.Group();
  wrist.position.set(0, 0, -4.4);
  const wristSeg = new THREE.Mesh(boxGeo(0.35, 1.6, 0.35), M.steel);
  wristSeg.position.set(0, -0.8, 0);
  wrist.add(wristSeg);
  const claw = new THREE.Mesh(boxGeo(0.7, 0.4, 0.7), M.steelDark);
  claw.position.set(0, -1.7, 0);
  wrist.add(claw);
  // A grab jaw at the end of the wrist, but no crate: the ships fly empty and
  // the hold has to stay clear for the player's car.
  const jaw = new THREE.Mesh(boxGeo(0.8, 0.5, 0.8), M.steelDark);
  jaw.position.set(0, -2.3, 0);
  wrist.add(jaw);
  armPivot.add(wrist);
  g.add(armPivot);

  return { g, armPivot };
}

// ---- The giant boarding arm (rocket-ride cinematic) ------------------------
// A big two-link hydraulic arm that reaches down, picks the player's car up off
// the launch pad, carries it over to a docked ship and lowers it through the open
// roof. `reach(worldTarget, grip)` solves a closed-form two-link inverse
// kinematics in the arm's vertical plane so the claw lands exactly on the target
// no matter where it is, and returns the claw's world position (the car rides
// there). `grip` (0..1) opens / closes the jaws.
function makeBoardingArm(compound) {
  const g = new THREE.Group();

  const yaw = new THREE.Group();
  g.add(yaw);

  const pedestal = new THREE.Mesh(cylGeo(1.05, 1.35, ARM_BASE_H, 16), M.steelDark);
  pedestal.position.y = ARM_BASE_H / 2;
  pedestal.castShadow = true;
  yaw.add(pedestal);

  const shoulder = new THREE.Group();
  shoulder.position.y = ARM_BASE_H;
  yaw.add(shoulder);

  const upper = new THREE.Mesh(boxGeo(0.7, 0.7, ARM_A), M.warning);
  upper.position.z = ARM_A / 2;
  upper.castShadow = true;
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.z = ARM_A;
  shoulder.add(elbow);

  const fore = new THREE.Mesh(boxGeo(0.6, 0.6, ARM_B), M.steel);
  fore.position.z = ARM_B / 2;
  fore.castShadow = true;
  elbow.add(fore);

  const hand = new THREE.Group();
  hand.position.z = ARM_B;
  elbow.add(hand);

  const palm = new THREE.Mesh(boxGeo(1.3, 0.3, 1.1), M.steelDark);
  palm.position.set(0, -0.05, 0);
  palm.castShadow = true;
  hand.add(palm);
  const jawL = new THREE.Mesh(boxGeo(0.22, 1.6, 1.1), M.steelDark);
  const jawR = new THREE.Mesh(boxGeo(0.22, 1.6, 1.1), M.steelDark);
  jawL.castShadow = true;
  jawR.castShadow = true;
  hand.add(jawL, jawR);

  // Closed-form two-link IK in the arm's vertical plane. `worldTarget` is in
  // WORLD space; returns the claw's world position so the held car can ride it.
  //
  // `grip` (0..1) opens / closes the jaws. The optional `fit` lets the caller
  // size the hand to the car it is actually lifting: `half` is the car's
  // half-width (the closed jaws clamp just outside its flanks), `len` is its
  // height (how far down the sides the jaws run) and `width` is the palm's span
  // across the roof. Without `fit` the hand keeps its original fixed size.
  const _l = new THREE.Vector3();
  const _out = new THREE.Vector3();
  function reach(worldTarget, grip = 0, fit = null) {
    compound.updateWorldMatrix(true, false);
    _l.copy(worldTarget);
    compound.worldToLocal(_l);

    const dx = _l.x - ARM_X;
    const dz = _l.z - ARM_Z;
    yaw.rotation.y = Math.atan2(dx, dz);
    const radial = Math.hypot(dx, dz);
    const beta = Math.atan2(_l.y - ARM_BASE_H, radial);

    // Clamp the target into the arm's reachable disc, then solve the two-link
    // triangle (elbow-up configuration).
    let d = Math.hypot(dx, dz, _l.y - ARM_BASE_H);
    d = Math.max(Math.abs(ARM_A - ARM_B) + 0.02, Math.min(ARM_A + ARM_B - 0.02, d));
    const cosE = (ARM_A * ARM_A + ARM_B * ARM_B - d * d) / (2 * ARM_A * ARM_B);
    const cosA = (ARM_A * ARM_A + d * d - ARM_B * ARM_B) / (2 * ARM_A * d);
    const E = Math.acos(Math.max(-1, Math.min(1, cosE)));
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const phi = beta + alpha;
    const psi = phi - (Math.PI - E);

    shoulder.rotation.x = -phi;
    elbow.rotation.x = Math.PI - E;
    hand.rotation.x = psi;               // keep the claw hanging straight down

    // The closed jaws clamp just outside the car's flanks; they swing wider while
    // open so the hand reads as opening to admit it. With no measured car they
    // fall back to the original numbers.
    const shutHalf = fit && fit.half != null ? fit.half : 0.32;
    const openHalf = shutHalf + 0.7;
    const jawX = openHalf + (shutHalf - openHalf) * grip;
    const jawLen = fit && fit.len != null ? fit.len : 1.6;
    const jawDrop = fit && fit.drop != null ? fit.drop : 0.85;
    jawL.position.set(-jawX, -jawDrop, 0);
    jawR.position.set(jawX, -jawDrop, 0);
    jawL.scale.set(1, jawLen / 1.6, 1);
    jawR.scale.set(1, jawLen / 1.6, 1);
    // The palm rests on the car's roof, so widen it to the car too.
    palm.scale.x = (fit && fit.width != null ? fit.width : 1.3) / 1.3;

    hand.updateWorldMatrix(true, false);
    return hand.getWorldPosition(_out);
  }

  // The arm's current heading about Y (set by the last reach()). main.js reads it
  // so the carried car can turn WITH the hand instead of staying put.
  const yawAngle = () => yaw.rotation.y;

  return { g, yaw, shoulder, elbow, hand, jawL, jawR, palm, reach, yawAngle };
}

// ===== The spaceport =====
// `parent` is the city scene. Returns the group, the solid colliders (world
// space) and an update(delta, t). `pad` is the world launch-pad footprint, kept
// for the drive-in trigger that will load the player's car.
export function createSpaceport(parent, opts = {}) {
  const SITE = { ...SPACEPORT_SITE, ...(opts.site || {}) };
  const group = new THREE.Group();
  group.position.set(SITE.x, 0, SITE.z);
  group.rotation.y = SITE.yaw;
  parent.add(group);

  const colliders = [];

  // ---- Ground slab + painted markings ----
  const slab = new THREE.Mesh(boxGeo(16, 0.16, 22), M.concrete);
  slab.position.set(0, 0.08, 0);
  slab.receiveShadow = true;
  group.add(slab);

  // Hazard-striped border band (four thin bars).
  for (const [w, d, x, z] of [[16, 0.5, 0, -11], [16, 0.5, 0, 11], [0.5, 22, -8, 0], [0.5, 22, 8, 0]]) {
    const bar = new THREE.Mesh(boxGeo(w, 0.05, d), M.warning);
    bar.position.set(x, 0.18, z);
    group.add(bar);
  }

  // ---- Launch pad (east strip) ----
  const padG = new THREE.Group();
  padG.position.set(PAD_X, 0, 0);
  group.add(padG);
  const padR = PAD_R;
  const padDeck = new THREE.Mesh(cylGeo(padR, padR, 0.3, 28), M.pad);
  padDeck.position.y = 0.25;
  padDeck.receiveShadow = true;
  padG.add(padDeck);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(padR - 0.25, 0.16, 8, 32), M.glowWarm);
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = 0.42;
  padG.add(padRing);
  // Flame trench ring of emissive studs.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const stud = new THREE.Mesh(cylGeo(0.14, 0.14, 0.2, 8), M.glowCyan);
    stud.position.set(Math.cos(a) * (padR - 0.9), 0.44, Math.sin(a) * (padR - 0.9));
    padG.add(stud);
  }
  // The expanding ground blast ring, lit only during ignition/ascent.
  const blast = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.15, 40), M.blast);
  blast.rotation.x = -Math.PI / 2;
  blast.position.y = 0.45;
  blast.visible = false;
  padG.add(blast);

  const tower = new THREE.Group();
  tower.position.set(5.5, 0, -8.5);
  group.add(tower);
  const towerBody = new THREE.Mesh(boxGeo(4.4, 9, 4.4), M.steel);
  towerBody.position.y = 4.5;
  towerBody.castShadow = true;
  tower.add(towerBody);
  const towerCap = new THREE.Mesh(boxGeo(5.2, 0.5, 5.2), M.steelDark);
  towerCap.position.y = 9.1;
  towerCap.castShadow = true;
  tower.add(towerCap);
  // Observation-deck windows on all four faces.
  for (const y of [5.6, 7.6]) {
    for (const [wx, wz, ry] of [[0, 2.25, 0], [0, -2.25, 0], [2.25, 0, Math.PI / 2], [-2.25, 0, -Math.PI / 2]]) {
      const win = new THREE.Mesh(boxGeo(3.0, 0.9, 0.12), M.glowCyan);
      win.position.set(wx, y, wz);
      win.rotation.y = ry;
      tower.add(win);
    }
  }
  const dish = new THREE.Mesh(cache('dish', () => new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.hull);
  dish.scale.set(1, 0.5, 1);
  dish.rotation.x = -0.9;
  dish.position.set(-1.2, 9.4, 0);
  tower.add(dish);
  const beacon = new THREE.Mesh(cache('beacon', () => new THREE.SphereGeometry(0.22, 12, 8)), M.glowWarm);
  beacon.position.set(0, 10.3, 0);
  tower.add(beacon);
  // Solid footprint for the tower.
  colliders.push({ x: 5.5, z: -8.5, halfW: 2.2, halfD: 2.2, h: 9, noRoof: true });

  const tanks = new THREE.Group();
  tanks.position.set(5.5, 0, 8.5);
  group.add(tanks);
  for (const [dx, h] of [[-1.4, 4.5], [0, 5.5], [1.4, 4.5]]) {
    const tank = new THREE.Mesh(cylGeo(0.9, 0.9, h, 16), M.steel);
    tank.position.set(dx, h / 2, 0);
    tank.castShadow = true;
    tanks.add(tank);
    // Solid footprint for each tank.
    colliders.push({ x: 5.5 + dx, z: 8.5, halfW: 0.85, halfD: 0.85, h, noRoof: true });
  }

  // ---- No perimeter fence ----
  // Deliberately open on every side: the player drives straight in from any
  // direction to reach the launch pad. (A low fence used to ring the compound
  // and only left a gap on the town side; triggering the boarding ride meant
  // threading that one opening. Removed so the pad is approachable from all
  // sides.)

  // ---- Docks + ships ----
  // Two ships only. They share the single launch pad, and their loop offsets are
  // half a cycle apart (shipOffsets), which is longer than the pad window
  // (taxi..back = 20.9s), so one is always clear of the pad before the other
  // taxis on: they can never collide on landing or take-off.
  const dockDefs = [
    { x: -3, z: -5 },
    { x: -3, z: 5 },
  ];
  const ships = dockDefs.map((d) => {
    const dock = makeDock();
    dock.g.position.set(d.x, 0, d.z);
    group.add(dock.g);
    const ship = makeShip();
    group.add(ship.g);
    return {
      dock, ship,
      dockPos: new THREE.Vector3(d.x, 0, d.z),
      padPos: new THREE.Vector3(PAD_X, 0, 0),
    };
  });
  const offsets = shipOffsets(ships.length);

  // ---- Giant boarding arm (rocket-ride cinematic) ----
  const arm = makeBoardingArm(group);
  arm.g.position.set(ARM_X, 0, ARM_Z);
  group.add(arm.g);
  colliders.push({ x: ARM_X, z: ARM_Z, halfW: 1.4, halfD: 1.4, h: ARM_BASE_H, noRoof: true });

  const rideShip = ships[0];   // the ship the ride boards

  // A single shared exhaust light, moved to whichever ship is firing hardest.
  const plumeLight = new THREE.PointLight(0xffb45a, 0, 40, 2);
  group.add(plumeLight);
  const _wp = new THREE.Vector3();

  let updateCount = 0;
  let cineActive = false;
  let padBusy = false;

  function update(delta = 0, t = 0) {
    updateCount++;
    // The ride (driven from main.js) owns the whole fleet while it runs, so the
    // auto-loop stands down. The pad counts as busy then, so a fresh ride cannot
    // start on top of one already playing.
    padBusy = cineActive;
    if (!cineActive) {
      for (let i = 0; i < ships.length; i++) {
        if (shipStateAt(t, offsets[i]).pad > 0.05) { padBusy = true; break; }
      }
    }
    if (cineActive) return;   // the ride poser (main.js) owns the ship + light

    let bestShip = null, bestPlume = 0;
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i];
      const st = shipStateAt(t, offsets[i]);
      const { g, hinge, cargo, plume, outer, inner, tail } = s.ship;

      // Where the ship is: lerp from its cradle to the pad, then add altitude.
      const px = s.dockPos.x + (s.padPos.x - s.dockPos.x) * st.pad;
      const pz = s.dockPos.z + (s.padPos.z - s.dockPos.z) * st.pad;
      const standY = L / 2 + 0.2;                 // tail just off the deck when vertical
      const baseY = CRADLE_Y + (standY - CRADLE_Y) * st.tilt;
      g.position.set(px, baseY + st.y, pz);
      g.rotation.z = st.tilt * Math.PI / 2;        // nose (+X) swings up to +Y

      // Window + arm.
      hinge.rotation.z = st.windowOpen * 1.15;
      s.dock.armPivot.rotation.x = -1.15 + st.arm * 1.05;

      // Cargo fills / clears.
      cargo.visible = st.cargo > 0.02;
      cargo.scale.setScalar(Math.max(0.001, st.cargo));

      // Plume.
      plume.visible = st.plume > 0.02;
      if (plume.visible) {
        plume.scale.set(
          (0.4 + 0.9 * st.plume) * (0.9 + 0.2 * Math.sin(t * 40 + i)),
          0.6 + 0.5 * st.plume,
          0.7 + 0.3 * st.plume,
        );
        outer.material.opacity = 0.55 * st.plume;
        inner.material.opacity = 0.95 * st.plume;
      }
      if (st.plume > bestPlume) { bestPlume = st.plume; bestShip = s; }
    }

    // Exhaust light.
    if (bestShip && bestPlume > 0.02) {
      bestShip.ship.tail.getWorldPosition(_wp);
      plumeLight.position.copy(group.worldToLocal(_wp));
      plumeLight.intensity = 3 + 6 * bestPlume;
    } else {
      plumeLight.intensity = 0;
    }

    // Blast ring on the pad: pulses while any ship is igniting, then fades.
    let igniting = 0;
    for (let i = 0; i < ships.length; i++) {
      const st = shipStateAt(t, offsets[i]);
      if (st.phase === 'ignite' || st.phase === 'ascend') igniting = Math.max(igniting, st.plume);
    }
    blast.visible = igniting > 0.05;
    if (igniting > 0.02) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 12);
      blast.scale.setScalar(1 + (1 - igniting) * 2.2);
      blast.material.opacity = 0.5 * igniting * pulse;
    }
  }

  // Colliders were authored in the compound's local frame; hand them back in
  // world space, using the same local -> world convention as cityBuildings.js
  // (a local (lx,lz) lands at (x + lx*cos + lz*sin, z - lx*sin + lz*cos)).
  const cos = Math.cos(SITE.yaw), sin = Math.sin(SITE.yaw);
  const swap = Math.abs(sin) > 0.5;   // quarter-turned footprints trade W/D
  const worldColliders = colliders.map((c) => {
    const out = { x: SITE.x + c.x * cos + c.z * sin, z: SITE.z - c.x * sin + c.z * cos, h: c.h };
    if (c.r !== undefined) out.r = c.r;
    else { out.halfW = swap ? c.halfD : c.halfW; out.halfD = swap ? c.halfW : c.halfD; }
    if (c.noRoof) out.noRoof = true;
    return out;
  });

  // ---- Boarding API for the rocket-ride cinematic (main.js) ----
  // Pose the ride ship exactly as the auto-loop would, but from supplied values.
  function poseRideShip({ pad = 0, tilt = 0, y = 0, windowOpen = 0, plume = 0 } = {}) {
    const s = rideShip;
    const px = s.dockPos.x + (s.padPos.x - s.dockPos.x) * pad;
    const pz = s.dockPos.z + (s.padPos.z - s.dockPos.z) * pad;
    const standY = L / 2 + 0.2;
    const baseY = CRADLE_Y + (standY - CRADLE_Y) * tilt;
    s.ship.g.position.set(px, baseY + y, pz);
    s.ship.g.rotation.z = tilt * Math.PI / 2;
    s.ship.hinge.rotation.z = windowOpen * 1.15;
    s.dock.armPivot.rotation.x = -1.15;   // dock's own arm stows; the big arm does the work
    s.ship.plume.visible = plume > 0.02;
    if (s.ship.plume.visible) {
      s.ship.plume.scale.set(0.4 + 0.9 * plume, 0.6 + 0.5 * plume, 0.7 + 0.3 * plume);
      s.ship.outer.material.opacity = 0.55 * plume;
      s.ship.inner.material.opacity = 0.95 * plume;
    }
    s.ship.g.updateWorldMatrix(true, false);
    if (plume > 0.02) {
      s.ship.tail.getWorldPosition(_wp);
      group.updateWorldMatrix(true, false);
      plumeLight.position.copy(group.worldToLocal(_wp));
      plumeLight.intensity = 3 + 6 * plume;
    } else {
      plumeLight.intensity = 0;
    }
  }

  // Ship-local points: where the car rests in the hold, and the roof gap just
  // above it (used as the arm's carry target before the final lowering).
  const seatLocal = new THREE.Vector3(0, -R * 0.5 + 0.55, 0);
  const roofLocal = new THREE.Vector3(0, R * Math.cos(SHIP_OPEN_THETA) + 1.9, 0);
  const _seatWorld = new THREE.Vector3();
  function shipLocalToWorld(local, target = _seatWorld) {
    rideShip.ship.g.updateWorldMatrix(true, false);
    return rideShip.ship.g.localToWorld(target.copy(local));
  }

  const boarding = {
    ship: rideShip,
    arm,
    seatWorld: (target) => shipLocalToWorld(seatLocal, target),
    roofWorld: (target) => shipLocalToWorld(roofLocal, target),
    shipQuat: (q) => rideShip.ship.g.getWorldQuaternion(q),
    reach: (worldTarget, grip, fit) => arm.reach(worldTarget, grip, fit),
    armYaw: () => arm.yawAngle(),
    poseShip: poseRideShip,
    setActive(on) {
      cineActive = !!on;
      if (!cineActive) return;
      // Freeze the auto-loop cleanly: park EVERY ship at its dock rest pose so
      // the one the ride is not using cannot be left hanging mid-flight. The
      // ride ship is re-posed from the timeline each frame straight after.
      for (const s of ships) {
        s.ship.g.position.set(s.dockPos.x, CRADLE_Y, s.dockPos.z);
        s.ship.g.rotation.z = 0;
        s.ship.hinge.rotation.z = 0;
        s.dock.armPivot.rotation.x = -1.15;
        s.ship.cargo.visible = false;
        s.ship.plume.visible = false;
      }
      plumeLight.intensity = 0;
      blast.visible = false;
    },
    get active() { return cineActive; },
    get padBusy() { return padBusy; },
  };

  return {
    group,
    colliders: worldColliders,
    update,
    site: SITE,
    boarding,
    // World-space launch pad footprint (centre + radius), for the eventual
    // drive-in trigger that loads the player's car.
    pad: { x: SITE.x + PAD_X * cos, z: SITE.z - PAD_X * sin, r: PAD_R },
    // The compound's painted hazard border (the yellow rectangle the driver
    // crosses to enter the yard), in the SAME local frame the slab is authored
    // in. main.js fires the boarding ride the instant the car crosses onto it.
    bounds: { x: SITE.x, z: SITE.z, yaw: SITE.yaw, halfX: 8, halfZ: 11 },
    // World-space boarding stage: the apron spot off the pad where the ride
    // parks (and shrinks) the car before the big arm lifts it to the ship.
    stage: { x: SITE.x + STAGE_X * cos + STAGE_Z * sin, z: SITE.z - STAGE_X * sin + STAGE_Z * cos },
    get updates() { return updateCount; },
  };
}
