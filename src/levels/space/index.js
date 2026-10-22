import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { RING_R, RING_W, RING_HALF_W } from '../../spaceRing.js';
import { makeShip } from '../../spaceport.js';
import { buildSpaceSectors } from './sectors.js?v=1799900000000';

// ===== The Wheel: a rotating wheel space station =====
//
// A Von Braun wheel: a big hollow rim you drive along the inside of, a glowing
// hub on the axis, spokes overhead and banks of consoles lining the floor. The
// car never leaves the rim, so the scene only has to sell the curve — the far
// side of the ring, the hub and the wheeling starfield do that.
//
// Local frame: the cylinder axis is world Z. A point on the floor at loop angle
// theta sits at (R*cos, R*sin, z), its "up" points at the hub. `spaceRing.js`
// owns the coordinate maths; this file only builds meshes and a couple of
// animated bits (the core's orbiters, the flickering consoles, the pod-bay doors).
//
// The piece builders below are exported so the object browser can show the true
// geometry (see objects/catalog.js) rather than a hand-made mini model.

const TWO_PI = Math.PI * 2;

// ---- The dock spur: an off-ramp that leaves the main ring road -------------
// The +Z window wall is gapped around world angle 0 and a second strip of road
// continues the corridor floor out past the wall to the berth at the dock head,
// so the player can drive OFF the main road and park where the rocket loads. These numbers live
// here (the geometry and the driveable range must agree) and are exported for
// main.js, which widens the ring lane near the dock and times the boarding
// trigger from them.
export const DOCK_HALF_ARC = 0.148;    // half-angle (rad) of the spur around world angle 0
export const DOCK_SPUR_Z0 = 12.2;      // axial start of the spur (overlaps the corridor floor)
export const DOCK_SPUR_Z1 = 18.4;      // axial end of the spur (the berth lip, past the wall)
export const DOCK_LANE = 17.2;         // max w the car can hold while near the dock
export const DOCK_BERTH_W = 15.0;      // w at which the boarding trigger starts listening
// The side decon bay hangs off the same +Z shoulder as the dock, so the two
// openings are cut as one longer gap in the window wall. Angles are world angles
// (rad): A is toward the decon bay (the waste sector), B is past the dock spur.
const SHOULDER_GAP_A = -0.42;
const SHOULDER_GAP_B = 0.22;

// ---- Materials -------------------------------------------------------------
const M = {
  floor: new THREE.MeshStandardMaterial({ color: 0x0c1018, roughness: 0.95, side: THREE.BackSide }),
  panel: new THREE.MeshStandardMaterial({ color: 0x6f7885, roughness: 0.6, metalness: 0.4 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8b929c, roughness: 0.6, metalness: 0.55 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x3c434d, roughness: 0.7, metalness: 0.5 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0x1a6d8c, emissive: 0x3fd9ff, emissiveIntensity: 2.4, roughness: 0.4, side: THREE.BackSide }),
  glowCyan: new THREE.MeshStandardMaterial({ color: 0x2b8fb8, emissive: 0x39d7ff, emissiveIntensity: 2.2, roughness: 0.4 }),
  glowWarm: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a00, emissiveIntensity: 2.4, roughness: 0.5 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x0e3a44, emissive: 0x2fe0ff, emissiveIntensity: 2.0, roughness: 0.35 }),
  sun: new THREE.MeshBasicMaterial({ color: 0xfff2c4 }),
  planet: new THREE.MeshStandardMaterial({ color: 0x3a6ea8, roughness: 0.9, emissive: 0x14243c, emissiveIntensity: 0.5 }),
  planet2: new THREE.MeshStandardMaterial({ color: 0xb4693a, roughness: 0.95, emissive: 0x2a1408, emissiveIntensity: 0.4 }),
  // The core station's own palette: a pale panelled hull, darker recessed
  // bands/seams and a couple of emissive accents for the docking port.
  core: new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.55, metalness: 0.5 }),
  corePanel: new THREE.MeshStandardMaterial({ color: 0x717b89, roughness: 0.6, metalness: 0.52 }),
  coreDark: new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.72, metalness: 0.55 }),
  coreLight: new THREE.MeshStandardMaterial({ color: 0xc3cbd7, roughness: 0.45, metalness: 0.55 }),
  hangar: new THREE.MeshStandardMaterial({ color: 0x0b2630, emissive: 0x2ec6ff, emissiveIntensity: 1.7, roughness: 0.4 }),
};

const geo = new Map();
const cache = (k, make) => { let g = geo.get(k); if (!g) { g = make(); geo.set(k, g); } return g; };

// ---- The ship the player arrives in ---------------------------------------
// THE launch rocket itself, reused verbatim from the spaceport (makeShip): the
// same lozenge hull, the same big glass roof, the same interior consoles and
// tail fins, so the arrival reads as the very ship that lifted the car off the
// pad. A seat marker rides in the hold at the launch's seatLocal spot, so the
// miniature car sits exactly where the boarding ride put it.
export function buildArrivalShip() {
  const ship = makeShip();
  const seat = new THREE.Object3D();
  seat.position.set(0, -0.2, 0);
  ship.g.add(seat);
  return {
    g: ship.g,
    seat,
    hinge: ship.hinge,
    cargo: ship.cargo,
    plume: ship.plume,
    outer: ship.outer,
    inner: ship.inner,
    tail: ship.tail,
  };
}

// A monitor face texture: dark screen with rows of blocky "odd symbols". Two
// variants, a legible one (normal) and a scrambled one (garbled), so the flicker
// loop can blink between them. Cached per variant by canvasTex.
function consoleGlyphTex(v, garbled) {
  return canvasTex(`console${v}${garbled ? 'g' : 'n'}`, 128, (ctx, S) => {
    ctx.fillStyle = '#04141c';
    ctx.fillRect(0, 0, S, S);
    let seed = 7 + v * 131 + (garbled ? 91 : 0);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.fillStyle = 'rgba(80,240,255,0.85)';
    ctx.fillRect(8, 8, S - 16, 6);
    const rows = 7, cols = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (garbled ? rnd() < 0.35 : rnd() < 0.12) continue;
        const x = 8 + c * ((S - 16) / cols);
        const y = 22 + r * ((S - 30) / rows);
        const w = ((S - 16) / cols) * (0.4 + rnd() * 0.5);
        const h = ((S - 30) / rows) * 0.55;
        const a = 0.5 + rnd() * 0.5;
        ctx.fillStyle = garbled
          ? `rgba(${(120 + rnd() * 135) | 0},${(200 + rnd() * 55) | 0},255,${a})`
          : `rgba(90,230,255,${a})`;
        ctx.fillRect(x, y, w, h);
        if (rnd() < 0.5) ctx.fillRect(x, y + h + 2, w * 0.5, 2);
      }
    }
  });
}

// ---- One console bank ------------------------------------------------------
// A steel pedestal with an angled keyboard tray, a bank of lit keys, a stalked
// monitor and a glowing status bar. The screen is deliberately the SECOND child
// so the level's flicker loop can reach bank.children[1].material, and there is
// a stool tucked in front so the bank reads as a workstation someone sits at.
// `v` picks the glyph-texture variant so the banks don't all look identical.
export function buildSpaceConsoleBank(v = 0) {
  const bank = new THREE.Group();
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.5), M.steelDark);
  desk.position.y = 0.45;
  bank.add(desk);                                            // [0]

  const scr = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.1), M.screen.clone());
  scr.position.set(0, 0.85, 0.72);
  const texN = consoleGlyphTex(v, false);
  scr.material.map = texN;
  scr.material.emissiveMap = texN;
  scr.material.needsUpdate = true;
  scr.userData.texN = texN;
  scr.userData.texG = consoleGlyphTex(v, true);
  bank.add(scr);                                             // [1]

  // Angled keyboard tray with a grid of lit keys.
  const tray = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.6), M.steel);
  tray.position.set(0, 0.92, 0.42);
  tray.rotation.x = -0.42;
  bank.add(tray);
  const keyGeo = new THREE.BoxGeometry(0.16, 0.06, 0.14);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const key = new THREE.Mesh(keyGeo, (r + c) % 3 === 0 ? M.glowWarm : M.glowCyan);
      key.position.set(-0.8 + c * 0.2, 1.0 - r * 0.05, 0.52 - r * 0.12);
      key.rotation.x = -0.42;
      bank.add(key);
    }
  }

  // Monitor hood, glow bar and back cable trunking.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 0.5), M.steelDark);
  hood.position.set(0, 1.14, 0.62);
  bank.add(hood);
  const pip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), M.glowCyan);
  pip.position.set(0, 0.06, 0.72);
  bank.add(pip);
  for (let i = 0; i < 3; i++) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), M.coreDark);
    trunk.position.set(-0.6 + i * 0.6, 0.5, -0.72);
    bank.add(trunk);
  }
  // Front kick plate and side ribs.
  for (const sx of [-1.16, 1.16]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 1.4), M.steel);
    rib.position.set(sx, 0.45, 0);
    bank.add(rib);
  }
  // A stool pulled up to the desk.
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.12, 14), M.panel);
  seat.position.set(0, 0.45, 1.15);
  bank.add(seat);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.45, 10), M.steelDark);
  stalk.position.set(0, 0.22, 1.15);
  bank.add(stalk);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.1), M.steelDark);
    foot.position.set(Math.cos(a) * 0.18, 0.03, 1.15 + Math.sin(a) * 0.18);
    foot.rotation.y = -a;
    bank.add(foot);
  }
  return bank;
}

// ---- The pod bay: the station's eye-port, the door the rocket slides into ----
// The port at the very CENTRE of the station: the level bolts this model onto
// the core's +Z face (the wheel axle), aimed down the incoming rocket's throat, so the arrival
// flies to the middle of the ship and the two lids open "like an eye" for it,
// then slide shut around it once it is home (main.js's arrival cine drives
// `userData.setDoors`, 0 = shut, 1 = wide open). The catalogue shows this same
// model on the Pod Bay tile, so the tile is the door the rocket flies into.
//
// Local frame: the mouth lies on the y = 0 plane with its normal along -Y (the
// direction the level aims it), the body built back along +Y; X is the slide
// axis and Z the other diameter. The face plate is an annulus (ROUT outside,
// MOUTH_R hole); the two half-disc lids sit just behind it in a shallow slot
// and slide apart along X — shut they meet on the centre-line, open they park
// flush behind the plate so the mouth is a clean hole for the ship. A collar
// tube hides the retracted lids from the side and a skirt flares back from it
// to bed the port into the core sphere.
export function buildSpacePodBay(opts = {}) {
  const bay = new THREE.Group();

  const MOUTH_R = opts.mouthR ?? 4.6;   // iris radius (the hole the ship passes)
  const ROUT = MOUTH_R + 4.8;           // face plate / collar outer radius
  const TH = 0.5;                       // lid slot thickness
  const RETRACT = MOUTH_R;              // full-open slide: lids park clear of the mouth
  const slotY = 0.02;                   // lids sit just behind the plate

  // Face plate: a real annulus (extruded ring), mouth-facing -Y.
  const plateShape = new THREE.Shape();
  plateShape.absarc(0, 0, ROUT, 0, Math.PI * 2, false);
  const holePath = new THREE.Path();
  holePath.absarc(0, 0, MOUTH_R, 0, Math.PI * 2, true);
  plateShape.holes.push(holePath);
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: 0.5, bevelEnabled: false, curveSegments: 40 });
  plateGeo.rotateX(Math.PI / 2);        // extrusion +Z -> -Y: plate fills y -0.5..0
  bay.add(new THREE.Mesh(plateGeo, M.steel));

  // Heavy bezel + lit rim hugging the mouth lip.
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(MOUTH_R + 0.5, 0.5, 10, 44), M.steel);
  bezel.rotation.x = Math.PI / 2;
  bezel.position.y = -0.35;
  bay.add(bezel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(MOUTH_R - 0.12, 0.2, 8, 44), M.glowCyan);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.55;
  bay.add(rim);

  // Open collar behind the plate (double-sided: the throat interior is seen
  // through the open mouth) + a skirt flaring back to bed the port into the
  // core sphere.
  const shellMat = M.steelDark.clone();
  shellMat.side = THREE.DoubleSide;
  const can = new THREE.Mesh(new THREE.CylinderGeometry(ROUT, ROUT, 2.4, 44, 1, true), shellMat);
  can.position.y = 0.7;                 // y -0.5..1.9
  bay.add(can);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(ROUT, ROUT + 1.8, 3.0, 44, 1, true), shellMat);
  skirt.position.y = 3.4;               // y 1.9..4.9
  bay.add(skirt);

  // Radial bolts round the face plate, and running lights on it.
  const boltGeo = new THREE.BoxGeometry(0.34, 0.42, 0.7);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bolt = new THREE.Mesh(boltGeo, M.steelDark);
    bolt.position.set(Math.cos(a) * (ROUT - 0.45), -0.45, Math.sin(a) * (ROUT - 0.45));
    bolt.rotation.y = -a;
    bay.add(bolt);
  }
  for (const sx of [-1, 1]) {
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), M.glowWarm);
    beacon.position.set(sx * (ROUT - 1.1), -0.6, 0);
    bay.add(beacon);
  }

  // The iris glow: a lit ring seated on the plinth behind the mouth, haloing
  // the ship's nose when the eye is open.
  const iris = new THREE.Mesh(new THREE.TorusGeometry(MOUTH_R * 0.78, 0.26, 8, 40), M.hangar);
  iris.rotation.x = Math.PI / 2;
  iris.position.y = 1.06;
  bay.add(iris);

  // ---- The two lids: half-disc slabs that slide apart like an eyelid ------
  // Each lid's geometry is offset by half the radius so the MESH positions stay
  // symmetric for the door driver: shut at -+MOUTH_R/2 (arcs meeting on the
  // centre-line), open at -+1.5*MOUTH_R (retracted flush behind the plate).
  function lidGeo(sign) {
    const sh = new THREE.Shape();
    if (sign < 0) sh.absarc(0, 0, MOUTH_R, Math.PI / 2, Math.PI * 1.5, false);
    else sh.absarc(0, 0, MOUTH_R, -Math.PI / 2, Math.PI / 2, false);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: TH, bevelEnabled: false, curveSegments: 32 });
    geo.rotateX(-Math.PI / 2);          // extrusion +Z -> +Y: slab fills y slotY..slotY+TH
    geo.translate(-sign * MOUTH_R / 2, slotY, 0);
    return geo;
  }
  const doorL = new THREE.Mesh(lidGeo(-1), M.steel);
  const doorR = new THREE.Mesh(lidGeo(1), M.steel);
  bay.add(doorL, doorR);
  // A raised handle along the seam edge of each lid.
  for (const d of [doorL, doorR]) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, MOUTH_R * 1.6), M.panel);
    grip.position.set(d === doorL ? MOUTH_R / 2 - 0.3 : -MOUTH_R / 2 + 0.3, slotY - 0.13, 0);
    d.add(grip);
  }

  bay.userData.doorL = doorL;
  bay.userData.doorR = doorR;
  bay.userData.mouthR = MOUTH_R;
  bay.userData.setDoors = (open) => {
    const o = Math.max(0, Math.min(1.2, open));
    const slide = MOUTH_R / 2 + RETRACT * o;
    doorL.position.x = -slide;
    doorR.position.x = slide;
    // The lit rim and iris halo swell as the lids draw back, so the eye visibly
    // opens WIDER than its rest state (the departure asks for more than 1).
    const grow = 1 + 0.16 * Math.min(o, 1.15);
    rim.scale.setScalar(grow);
    iris.scale.setScalar(grow);
  };
  bay.userData.setDoors(0);
  return bay;
}

// ---- The hangar loading arm: the big hydraulic arm that lifts the car off the
// ---- dock floor and tucks it into the rocket's open hold ---------------------
//
// The same closed-form two-link reach as the city boarding arm (spaceport.js),
// but built INSIDE the dock frame (the old hangar's placement frame at the ring
// floor) and sized to span the berth area: the base stands on the +Y (floor)
// side, off the car's lane, and the claw can reach both the berth (where the car
// parks) and the parked rocket's hold. `reach(worldTarget, grip, fit)` solves
// the IK in the arm's vertical plane and returns the claw's world position so
// the held car can ride it; `yawAngle()` reports the heading the armed car
// turns with.
export function buildSpaceHangarArm(opts = {}) {
  const g = new THREE.Group();
  const baseX = opts.baseX ?? 10;
  const baseZ = opts.baseZ ?? 8;
  const A = opts.a ?? 9;               // upper-arm length
  const B = opts.b ?? 9;               // forearm length
  const BASE_H = opts.baseH ?? 2.6;
  g.position.set(baseX, 0, baseZ);

  const yaw = new THREE.Group();
  g.add(yaw);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, BASE_H, 18), M.steelDark);
  pedestal.position.y = BASE_H / 2;
  pedestal.castShadow = true;
  yaw.add(pedestal);

  const shoulder = new THREE.Group();
  shoulder.position.y = BASE_H;
  yaw.add(shoulder);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, A), M.stripe);
  upper.position.z = A / 2;
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.z = A;
  shoulder.add(elbow);

  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, B), M.steel);
  fore.position.z = B / 2;
  elbow.add(fore);

  const hand = new THREE.Group();
  hand.position.z = B;
  elbow.add(hand);

  const palm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.3), M.steelDark);
  hand.add(palm);
  const jawL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.8, 1.3), M.steelDark);
  const jawR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.8, 1.3), M.steelDark);
  hand.add(jawL, jawR);

  // Default: folded away so the idle arm reads as a parked rig, not a limb
  // sticking into the lane. reach() overrides these every frame while it works.
  shoulder.rotation.x = -0.5;
  elbow.rotation.x = 1.7;
  hand.rotation.x = 0.6;

  const _l = new THREE.Vector3();
  const _out = new THREE.Vector3();
  function reach(worldTarget, grip = 0, fit = null) {
    const compound = g.parent;
    if (!compound) { hand.getWorldPosition(_out); return _out; }
    compound.updateWorldMatrix(true, false);
    _l.copy(worldTarget);
    compound.worldToLocal(_l);

    const dx = _l.x - baseX;
    const dz = _l.z - baseZ;
    yaw.rotation.y = Math.atan2(dx, dz);
    const radial = Math.hypot(dx, dz);
    const beta = Math.atan2(_l.y - BASE_H, radial);

    let d = Math.hypot(dx, dz, _l.y - BASE_H);
    d = Math.max(Math.abs(A - B) + 0.05, Math.min(A + B - 0.05, d));
    const cosE = (A * A + B * B - d * d) / (2 * A * B);
    const cosA = (A * A + d * d - B * B) / (2 * A * d);
    const E = Math.acos(Math.max(-1, Math.min(1, cosE)));
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const phi = beta + alpha;
    const psi = phi - (Math.PI - E);

    shoulder.rotation.x = -phi;
    elbow.rotation.x = Math.PI - E;
    hand.rotation.x = psi;

    const shutHalf = fit && fit.half != null ? fit.half : 0.32;
    const openHalf = shutHalf + 0.75;
    const jawX = openHalf + (shutHalf - openHalf) * grip;
    const jawLen = fit && fit.len != null ? fit.len : 1.8;
    const jawDrop = fit && fit.drop != null ? fit.drop : 0.9;
    jawL.position.set(-jawX, -jawDrop, 0);
    jawR.position.set(jawX, -jawDrop, 0);
    jawL.scale.set(1, jawLen / 1.8, 1);
    jawR.scale.set(1, jawLen / 1.8, 1);
    palm.scale.x = (fit && fit.width != null ? fit.width : 1.5) / 1.5;

    hand.updateWorldMatrix(true, false);
    return hand.getWorldPosition(_out);
  }

  const yawAngle = () => yaw.rotation.y;

  return { g, yaw, shoulder, elbow, hand, jawL, jawR, palm, reach, yawAngle };
}

// ---- The core: the station's spherical main hull, its outrigger pods, the ----
// ---- vertical sensor spire and the orbiting auxiliary spheres ---------------
//
// The hero structure. It lives at the wheel's centre, so the driver sees it as
// the towering hub overhead AND the still exterior flyby lens sees it as the
// station's body. It is authored in the wheel's own frame so the arrival shot
// reads it the way the brief describes:
//   * the vertical spire runs along WORLD Y  -> top-and-bottom in the flyby frame
//   * the gantry arms run along the cylinder axis (WORLD Z) -> left-and-right
//   * the eye-port docking door faces +X  -> toward the incoming rocket (the
//     level mounts buildSpacePodBay on the core's +X plinth, see buildSpaceWorld)
// CORE_R is exported (and surfaced on the level api) so the driving chase camera
// can hold itself outside the sphere when fully zoomed in.
export const CORE_R = 20;
// The eye-port cuts a real hole through the core shell: the pod bay's skirt
// flares back to this radius, so the rocket can slide INSIDE the station instead
// of stopping against a painted-on door. The dark throat behind it keeps the
// opening reading as a deep tunnel rather than a see-through hole.
const EYE_HOLE_R = 11.2;
const EYE_HOLE_Z = Math.sqrt(CORE_R * CORE_R - EYE_HOLE_R * EYE_HOLE_R);
const EYE_HOLE_ANGLE = Math.asin(EYE_HOLE_R / CORE_R);
export function buildSpaceCore() {
  const g = new THREE.Group();
  const R = CORE_R;
  const floaters = [];   // tethered auxiliary spheres (spun slowly)
  const beacons = [];    // emissive materials to pulse
  const spinners = [];   // groups to turn slowly

  // ---- Main sphere: panelled hull, seams and recessed equatorial bands ----
  // Built with the +Z cap removed (SphereGeometry's default hole is around +Y,
  // so the geometry is rolled a quarter turn to aim it down the eye's axis).
  // The eye-port model beds into the rim and the dark throat below closes it.
  g.add(new THREE.Mesh(cache('coreShell', () => {
    const shell = new THREE.SphereGeometry(R, 64, 40, 0, Math.PI * 2, EYE_HOLE_ANGLE, Math.PI - EYE_HOLE_ANGLE);
    shell.rotateX(Math.PI / 2);
    return shell;
  }), M.core));

  // Rim collar around the mouth of the hole, so the cut edge reads as a
  // machined socket where the eye-port seats.
  const eyeRim = new THREE.Mesh(
    cache('coreEyeRim', () => new THREE.TorusGeometry(EYE_HOLE_R, 0.42, 10, 64)),
    M.corePanel);
  eyeRim.position.z = EYE_HOLE_Z;
  g.add(eyeRim);

  // The dark docking throat behind the eye: a tapered, open tube that swallows
  // the rocket's nose after it clears the iris. Without it the hole would look
  // straight through the station.
  const throatMat = new THREE.MeshStandardMaterial({
    color: 0x05080c, roughness: 0.88, metalness: 0.25, side: THREE.BackSide,
  });
  const throat = new THREE.Mesh(
    cache('coreEyeThroat', () => new THREE.CylinderGeometry(EYE_HOLE_R + 0.05, 7.4, 13.0, 48, 1, true)),
    throatMat);
  throat.rotation.x = Math.PI / 2;     // cylinder axis Y -> world Z
  throat.position.z = EYE_HOLE_Z - 6.5;
  g.add(throat);
  const throatCap = new THREE.Mesh(
    cache('coreEyeThroatCap', () => new THREE.CircleGeometry(7.45, 48)),
    new THREE.MeshStandardMaterial({ color: 0x030507, roughness: 1 }));
  throatCap.position.z = EYE_HOLE_Z - 13.0;
  g.add(throatCap);

  // Dark recessed bands hugging the equator (the plane perpendicular to the
  // spire), flattened against the shell so they read as machine grooves.
  for (const y of [-3.4, 0, 3.4]) {
    const r = Math.sqrt(Math.max(1, R * R - y * y));
    const band = new THREE.Mesh(cache(`coreBand${y}`, () => new THREE.TorusGeometry(r, 1.1, 10, 72)), M.coreDark);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    band.scale.z = 0.35;
    g.add(band);
  }

  // Latitude seams — thin bright rings.
  for (const y of [-13, -8, 8, 13]) {
    const r = Math.sqrt(Math.max(1, R * R - y * y)) + 0.05;
    const seam = new THREE.Mesh(cache(`coreLat${y}`, () => new THREE.TorusGeometry(r, 0.16, 6, 72)), M.coreLight);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = y;
    g.add(seam);
  }

  // Meridian seams — great circles through the poles.
  const merGeo = cache('coreMer', () => new THREE.TorusGeometry(R + 0.06, 0.14, 6, 96));
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(merGeo, M.coreDark);
    m.rotation.y = (i / 6) * Math.PI;
    g.add(m);
  }

  // Raised polar collars where the spire seats into the sphere.
  for (const s of [-1, 1]) {
    const collar = new THREE.Mesh(cache('corePoleCollar', () => new THREE.CylinderGeometry(4.6, 5.4, 1.8, 24)), M.corePanel);
    collar.position.y = s * (R - 0.7);
    g.add(collar);
  }

  // ---- Illuminated docking port on the +Z face ---------------------------
  // The eye-port model (buildSpacePodBay, mounted by buildSpaceWorld) beds
  // straight into the rim collar above. There is deliberately no housing box
  // behind it any more: the old block sat across the docking throat and the
  // rocket had nowhere to go. The tapered dark throat is all that lies behind
  // the mouth now, so the ship slides into the station's centre.

  // ---- Vertical sensor spire through the poles ---------------------------
  const spireTop = R + 17, spireBot = R + 13;
  const mast = new THREE.Mesh(cache('coreMast', () => new THREE.CylinderGeometry(0.6, 0.6, spireTop + spireBot, 12)), M.coreLight);
  mast.position.y = (spireTop - spireBot) / 2;
  g.add(mast);

  const strutGeo = cache('pltStrut', () => new THREE.BoxGeometry(0.22, 1.6, 0.22));
  function platform(y, r) {
    const p = new THREE.Group();
    p.position.y = y;
    p.add(new THREE.Mesh(cache(`plt${r}`, () => new THREE.CylinderGeometry(r, r, 0.5, 28)), M.corePanel));
    const rail = new THREE.Mesh(cache(`pltRail${r}`, () => new THREE.TorusGeometry(Math.max(0.5, r - 0.15), 0.12, 6, 44)), M.coreLight);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 0.5;
    p.add(rail);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const strut = new THREE.Mesh(strutGeo, M.coreDark);
      strut.position.set(Math.cos(a) * (r - 0.6), -0.9, Math.sin(a) * (r - 0.6));
      strut.rotation.set(-0.3 * Math.sin(a), 0, 0.3 * Math.cos(a));
      p.add(strut);
    }
    g.add(p);
  }
  platform(R + 3, 5.2);
  platform(R + 9, 3.8);
  platform(-(R + 4), 4.6);
  platform(-(R + 10), 3.2);

  // Communication dishes riding the platforms.
  function dish(x, y, z, tilt, r) {
    const d = new THREE.Mesh(cache(`coreDish${r}`, () => new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.coreLight);
    d.scale.y = 0.5;
    d.position.set(x, y, z);
    d.rotation.x = tilt;
    g.add(d);
  }
  dish(2.4, R + 9.2, 0, -0.7, 2.4);
  dish(-2.4, R + 9.2, 0, -0.7, 1.8);
  dish(1.8, -(R + 10.2), 0, Math.PI + 0.5, 1.8);

  // Antenna cluster on a hub cap, with the warm beacon on a stem above it —
  // every piece tied back into the mast so nothing floats free.
  const topHub = new THREE.Mesh(cache('coreTopHub', () => new THREE.SphereGeometry(2.2, 16, 12)), M.corePanel);
  topHub.position.y = spireTop;
  g.add(topHub);
  const botHub = new THREE.Mesh(cache('coreBotHub', () => new THREE.SphereGeometry(1.8, 16, 12)), M.corePanel);
  botHub.position.y = -spireBot;
  g.add(botHub);
  const antGeo = cache('coreAnt', () => new THREE.CylinderGeometry(0.07, 0.07, 5, 6));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const ant = new THREE.Mesh(antGeo, M.coreDark);
    ant.position.set(Math.cos(a) * 1.2, spireTop + 1.8, Math.sin(a) * 1.2);
    g.add(ant);
  }
  const stem = new THREE.Mesh(cache('coreTipStem', () => new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8)), M.coreLight);
  stem.position.y = spireTop + 1.4;
  g.add(stem);
  const tip = new THREE.Mesh(cache('coreTip', () => new THREE.SphereGeometry(0.5, 12, 10)), M.glowWarm.clone());
  tip.position.y = spireTop + 2.8;
  g.add(tip);
  beacons.push(tip.material);

  // ---- Lateral gantry arms + spherical outrigger pods --------------------
  const braceGeo = cache('armBrace', () => new THREE.BoxGeometry(0.24, 3.9, 0.24));
  // Only the far (-Z) arm. The +Z face is the eye/pod-bay mouth the arrival
  // camera looks straight into, and the old mirrored outrigger sat right in
  // front of it, hiding the iris.
  for (const s of [-1]) {
    const z0 = R - 2, z1 = R + 12;
    const mid = (z0 + z1) / 2, len = z1 - z0;
    const spine = new THREE.Mesh(cache(`armSpine${len}`, () => new THREE.BoxGeometry(1.0, 1.0, len)), M.corePanel);
    spine.position.z = s * mid;
    g.add(spine);
    for (const yy of [-1.9, 1.9]) {
      const rail = new THREE.Mesh(cache(`armRail${len}`, () => new THREE.BoxGeometry(0.35, 0.35, len)), M.coreDark);
      rail.position.set(0, yy, s * mid);
      g.add(rail);
    }
    for (let i = 0; i < 4; i++) {
      const zz = z0 + 2 + i * ((len - 4) / 3);
      for (const sgn of [-1, 1]) {
        const br = new THREE.Mesh(braceGeo, M.coreDark);
        br.position.set(0, sgn * 0.95, s * zz);
        br.rotation.x = sgn * 0.95;
        g.add(br);
      }
    }
    // Flange where the arm leaves the core's equatorial surface (the sphere
    // reaches z = +/-R along the arm axis, so the collar sits just outside it).
    const col = new THREE.Mesh(cache('armCollar', () => new THREE.TorusGeometry(2.2, 0.4, 8, 32)), M.steel);
    col.position.z = s * (R + 0.3);
    g.add(col);

    // The outrigger pod: another panelled sphere at the arm's end, banded like
    // the core and dotted with warm portholes.
    const podR = 5.6, podC = s * (R + 13.5);
    const pod = new THREE.Mesh(cache('corePod', () => new THREE.SphereGeometry(podR, 30, 22)), M.core);
    pod.position.z = podC;
    g.add(pod);
    for (const dz of [-1.5, 0, 1.5]) {
      const r = Math.sqrt(Math.max(1, podR * podR - dz * dz));
      const band = new THREE.Mesh(cache(`podBand${dz}`, () => new THREE.TorusGeometry(r, 0.45, 8, 40)), M.coreDark);
      band.position.z = podC + dz;
      g.add(band);
    }
    const winGeo = cache('podWin', () => new THREE.BoxGeometry(0.3, 0.7, 0.35));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const win = new THREE.Mesh(winGeo, M.glowWarm);
      win.position.set(Math.cos(a) * podR, Math.sin(a) * podR, podC);
      win.rotation.z = a;
      g.add(win);
    }
    const port = new THREE.Mesh(cache('podPort', () => new THREE.CylinderGeometry(1.5, 1.5, 0.9, 18)), M.corePanel);
    port.rotation.x = Math.PI / 2;
    port.position.z = podC + s * (podR + 0.2);
    g.add(port);
    const portGlow = new THREE.Mesh(cache('podPortGlow', () => new THREE.TorusGeometry(1.1, 0.22, 8, 28)), M.glowCyan);
    portGlow.position.z = podC + s * (podR + 0.5);
    g.add(portGlow);
  }

  // ---- Orbiting auxiliary spheres / probes -------------------------------
  // These read as the station's deployed instruments rather than loose debris:
  // each one is anchored to the core shell by a radial gantry boom, so the whole
  // assembly is one connected structure. They still slowly spin.
  const auxDefs = [
    [30, 14, -34, 2.4, 0.30],
    [-28, -10, 30, 1.6, -0.45],
    [34, -20, 22, 3.0, 0.20],
    [-36, 8, -22, 1.2, 0.62],
    [16, 34, 30, 2.0, -0.30],
    [-20, 28, -32, 1.4, 0.48],
    [48, 4, -10, 2.6, -0.22],
    [-48, -6, 12, 1.1, 0.40],
  ];
  const UP = new THREE.Vector3(0, 1, 0);
  const AX = new THREE.Vector3(0, 0, 1);
  const tDir = new THREE.Vector3();
  const tPerp = new THREE.Vector3();
  const tBoomGeo = cache('auxTether', () => new THREE.BoxGeometry(0.5, 1, 0.5));
  const tRailGeo = cache('auxTetherRail', () => new THREE.BoxGeometry(0.16, 1, 0.16));
  const tCollarGeo = cache('auxTetherCollar', () => new THREE.TorusGeometry(0.55, 0.16, 6, 18));
  for (let i = 0; i < auxDefs.length; i++) {
    const [x, y, z, r, spin] = auxDefs[i];
    const a = new THREE.Mesh(cache(`aux${r}`, () => new THREE.SphereGeometry(r, 20, 14)), M.core);
    a.position.set(x, y, z);
    const band = new THREE.Mesh(cache(`auxBand${r}`, () => new THREE.TorusGeometry(r + 0.02, 0.14, 6, 30)), M.coreDark);
    band.rotation.x = Math.PI / 2;
    a.add(band);
    const glint = new THREE.Mesh(cache(`auxGlint${r}`, () => new THREE.SphereGeometry(0.16, 8, 6)), M.glowCyan);
    glint.position.set(0, r, 0);
    a.add(glint);
    // A small radial boom so the probe's slow spin is actually readable.
    const boom = new THREE.Mesh(cache('auxBoom', () => new THREE.BoxGeometry(2.2, 0.16, 0.16)), M.coreDark);
    boom.position.set(r + 1.0, 0, 0);
    a.add(boom);
    a.userData = { spin, baseY: y, phase: i * 1.9 };
    floaters.push(a);
    g.add(a);

    // The tether: a square truss (spine + one offset rail) running from inside
    // the core shell out to the probe, with a collar at each end.
    const dist = Math.hypot(x, y, z);
    tDir.set(x, y, z).normalize();
    tPerp.set(-tDir.z, 0, tDir.x);
    if (tPerp.lengthSq() < 1e-4) tPerp.set(1, 0, 0);
    tPerp.normalize();
    const b0 = R - 2, b1 = dist - r + 0.6;
    const blen = Math.max(1, b1 - b0);
    const mid = (b0 + b1) / 2;
    const spine = new THREE.Mesh(tBoomGeo, M.corePanel);
    spine.scale.set(1, blen, 1);
    spine.position.copy(tDir).multiplyScalar(mid);
    spine.quaternion.setFromUnitVectors(UP, tDir);
    g.add(spine);
    const rail = new THREE.Mesh(tRailGeo, M.coreDark);
    rail.scale.set(1, blen, 1);
    rail.position.copy(tDir).multiplyScalar(mid).addScaledVector(tPerp, 0.5);
    rail.quaternion.copy(spine.quaternion);
    g.add(rail);
    for (const bb of [b0 + 0.35, dist - r - 0.15]) {
      const collar = new THREE.Mesh(tCollarGeo, M.steel);
      collar.position.copy(tDir).multiplyScalar(bb);
      collar.quaternion.setFromUnitVectors(AX, tDir);
      g.add(collar);
    }
  }

  // ---- A slowly turning armillary ring around the equator ----------------
  const spin = new THREE.Group();
  const ringR = R + 3.6;
  const orbRing = new THREE.Mesh(cache('coreSpinRing', () => new THREE.TorusGeometry(ringR, 0.22, 8, 96)), M.steel);
  orbRing.rotation.x = Math.PI / 2;      // lie in the equatorial (XZ) plane
  spin.add(orbRing);
  const slGeo = cache('coreSpinLight', () => new THREE.SphereGeometry(0.32, 8, 6));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const l = new THREE.Mesh(slGeo, M.glowCyan);
    l.position.set(Math.cos(a) * ringR, 0, Math.sin(a) * ringR);
    spin.add(l);
  }
  // Radial spokes that tie the ring down onto the core shell, so it reads as a
  // rotating gantry rather than a detached hoop. They turn with the ring but
  // their inner ends always sit buried in the sphere.
  const strutL = ringR - (R - 1.5);
  const strutGeo2 = cache('coreSpinStrut', () => new THREE.BoxGeometry(strutL, 0.2, 0.2));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const st = new THREE.Mesh(strutGeo2, M.coreDark);
    const sr = R - 1.5 + strutL / 2;
    st.position.set(Math.cos(a) * sr, 0, Math.sin(a) * sr);
    st.rotation.y = -a;
    spin.add(st);
  }
  g.add(spin);
  spinners.push(spin);

  return { g, floaters, beacons, spinners };
}

// ---- Procedural sky textures ----------------------------------------------
// The void is dressed entirely with canvas-generated sprites, so the level needs
// no external image assets. Everything is additive + depthWrite:false so the
// far field layers over the black of space without fighting the station.
const skyTex = new Map();
function canvasTex(key, size, draw) {
  let t = skyTex.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  skyTex.set(key, t);
  return t;
}

// A soft round dot: white core, cool halo. Used for every star point.
const starTex = () => canvasTex('star', 64, (ctx, S) => {
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(198,220,255,0.22)');
  g.addColorStop(1, 'rgba(198,220,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
});

// A wispy nebula cloud: a handful of soft overlapping blobs, tinted per sprite.
function cloudTex(v) {
  return canvasTex(`cloud${v}`, 256, (ctx, S) => {
    let seed = 1 + v * 977;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const x = S / 2 + (rnd() - 0.5) * S * 0.55;
      const y = S / 2 + (rnd() - 0.5) * S * 0.55;
      const r = S * (0.16 + rnd() * 0.3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.13)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// A bright point with four diffraction spikes — a quasar / brilliant foreground
// star. Drawn white so the sprite tint colours it.
function flareTex() {
  return canvasTex('flare', 256, (ctx, S) => {
    const cx = S / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, S * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.07, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.25, 'rgba(210,232,255,0.32)');
    g.addColorStop(0.6, 'rgba(130,180,255,0.07)');
    g.addColorStop(1, 'rgba(90,140,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cx);
    for (const a of [0, Math.PI / 2]) {
      ctx.save();
      ctx.rotate(a);
      const lg = ctx.createLinearGradient(-S * 0.5, 0, S * 0.5, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(-S * 0.5, -1.1, S, 2.2);
      ctx.restore();
    }
  });
}

// A face-on spiral galaxy: bright bulge plus two logarithmic arms dusted with
// stars. Orientation is baked in so each cached variant reads differently.
function galaxyTex(v) {
  return canvasTex(`galaxy${v}`, 512, (ctx, S) => {
    const cx = S / 2;
    ctx.translate(cx, cx);
    ctx.rotate(v * 1.1);
    ctx.globalCompositeOperation = 'lighter';
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.24);
    core.addColorStop(0, 'rgba(255,250,235,0.95)');
    core.addColorStop(0.35, 'rgba(255,236,205,0.42)');
    core.addColorStop(1, 'rgba(255,224,190,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.24, 0, Math.PI * 2);
    ctx.fill();
    let seed = 7 + v * 613;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let arm = 0; arm < 2; arm++) {
      const base = arm * Math.PI;
      for (let i = 0; i < 1100; i++) {
        const tt = Math.pow(rnd(), 0.55);
        const ang = base + tt * 2.7 * Math.PI + (rnd() - 0.5) * 0.45;
        const rad = tt * S * 0.46 + (rnd() - 0.5) * S * 0.045;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad * 0.72;   // squashed = tilted disc
        const a = (1 - tt) * 0.5 + 0.05;
        const rr = 0.7 + rnd() * 2.0;
        const tint = rnd();
        const col = tint < 0.5 ? `rgba(214,228,255,${a})` : `rgba(255,226,196,${a})`;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

const _skyRnd = { s: 1 };
const srnd = () => ((_skyRnd.s = (_skyRnd.s * 16807) % 2147483647) / 2147483647);

// ---- The sky: starfield shell, nebula clouds, a galaxy, quasars, -------------
// ---- the sun and two planets ------------------------------------------------
export function buildSpaceSky() {
  const skyGroup = new THREE.Group();
  const clouds = [];
  const quasars = [];
  _skyRnd.s = 1234567;

  const makeStarLayer = (count, rMin, rSpan, size, brightMin) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = srnd() * 2 - 1;
      const phi = srnd() * TWO_PI;
      const r = rMin + srnd() * rSpan;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(phi);
      pos[i * 3 + 1] = r * s * Math.sin(phi);
      pos[i * 3 + 2] = r * u;
      // Spectral variety: a few warm giants, many blue-white and white dwarfs.
      const k = srnd();
      if (k < 0.05) c.setHSL(0.07, 0.75, 0.72);
      else if (k < 0.14) c.setHSL(0.13, 0.55, 0.82);
      else if (k < 0.52) c.setHSL(0.6, 0.28, 0.92);
      else c.setHSL(0.6, 0.04, 1.0);
      const b = brightMin + srnd() * (1 - brightMin);
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    skyGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size, sizeAttenuation: false, map: starTex(),
      transparent: true, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
  };
  makeStarLayer(4200, 780, 520, 1.7, 0.35);   // the general background
  makeStarLayer(680, 680, 360, 3.2, 0.75);    // scattered bright stars

  // ---- Nebula clouds: big soft tinted wisps drifting in the far field ------
  const cloudTints = [0x6a3fd0, 0xc03a8f, 0x2f7fd0, 0x2fbfa0, 0x8a4fd0, 0xd06a3a, 0x4f6ad0];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTex(i % 4), color: cloudTints[i % cloudTints.length],
      transparent: true, opacity: 0.1 + srnd() * 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    const u = srnd() * 2 - 1, phi = srnd() * TWO_PI, s = Math.sqrt(1 - u * u);
    const R = 1150 + srnd() * 560;
    sp.position.set(R * s * Math.cos(phi), R * s * Math.sin(phi), R * u);
    const sc = 260 + srnd() * 460;
    sp.scale.set(sc * (1.2 + srnd() * 0.9), sc, 1);
    mat.rotation = srnd() * Math.PI;
    sp.userData = { base: mat.opacity, amp: 0.05 + srnd() * 0.05, phase: srnd() * TWO_PI };
    clouds.push(sp);
    skyGroup.add(sp);
  }
  // One broad "milky band" to hint at a galactic plane.
  {
    const mat = new THREE.SpriteMaterial({
      map: cloudTex(2), color: 0x8fa8d8, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const band = new THREE.Sprite(mat);
    band.position.set(200, 620, 900);
    band.scale.set(2200, 520, 1);
    mat.rotation = 0.5;
    band.userData = { base: 0.07, amp: 0.02, phase: 1.3 };
    clouds.push(band);
    skyGroup.add(band);
  }

  // ---- A spiral galaxy or two ----------------------------------------------
  const galaxyTints = [0xcfd8ee, 0xe0c8a8];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.SpriteMaterial({
      map: galaxyTex(i), color: galaxyTints[i], transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    const u = i ? -0.4 : 0.35, phi = i ? 2.4 : 0.8, s = Math.sqrt(1 - u * u);
    const R = 1320 + i * 220;
    sp.position.set(R * s * Math.cos(phi), R * s * Math.sin(phi), R * u);
    const sc = 360 + i * 120;
    sp.scale.set(sc, sc, 1);
    skyGroup.add(sp);
  }

  // ---- Occasional quasar / brilliant beacon --------------------------------
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.SpriteMaterial({
      map: flareTex(), color: i ? 0xbfe2ff : 0xffd9b0,
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const q = new THREE.Sprite(mat);
    const u = i ? 0.62 : -0.7, phi = i ? 4.1 : 1.9, s = Math.sqrt(1 - u * u);
    const R = 1260 + i * 300;
    q.position.set(R * s * Math.cos(phi), R * s * Math.sin(phi), R * u);
    const sc = 90 + i * 60;
    q.scale.set(sc, sc, 1);
    skyGroup.add(q);
    quasars.push({ mat, base: 0.7 + srnd() * 0.2, phase: srnd() * TWO_PI, speed: 2.5 + srnd() * 3 });
  }

  const sun = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 16), M.sun);
  sun.position.set(-720, 260, -520);
  skyGroup.add(sun);
  const planetA = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 24), M.planet);
  planetA.position.set(640, -180, -700);
  skyGroup.add(planetA);
  const planetB = new THREE.Mesh(new THREE.SphereGeometry(70, 28, 20), M.planet2);
  planetB.position.set(500, 420, 820);
  skyGroup.add(planetB);

  skyGroup.userData = { clouds, quasars };
  return skyGroup;
}

// ---- The boarding elevator at the berth --------------------------------
// A big, unmistakable lift: you drive onto it, it rises, and it carries you up
// to the waiting exit rocket's hold. Built so every cue reads as "elevator"
// without any lettering (no in-world text in this game): hazard-chevron deck
// edging, four glowing corner masts, a big lit up-arrow chevron painted on the
// deck, a pair of red beacon lamps on top that blink, guide rails and a lit
// threshold gate you enter through. Returns the deck (the part that rises) and
// the masts/beacons so update() can animate it.
// Local frame is the dockFrame: +X tangent, +Y inward/up-the-rim, +Z axial.
export function buildSpaceBerthElevator() {
  const g = new THREE.Group();
  const addBox = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const HW = 2.6, HD = 3.6;      // half-width (tangent) / half-depth (axial)
  const DECK_H = 0.4;

  // Static base well: a recessed frame the deck sits in, so the platform reads
  // as sunk into the floor when down and clearly a separate rising box when up.
  const base = addBox(HW * 2 + 0.5, 0.6, HD * 2 + 0.5, 0, -0.3, 0, M.steelDark);
  base.receiveShadow = true;

  // ---- The rising deck ----------------------------------------------------
  const deck = new THREE.Group();
  deck.position.set(0, 0, 0);
  g.add(deck);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, DECK_H, HD * 2), M.steel);
  plate.position.set(0, DECK_H / 2, 0);
  plate.castShadow = true; plate.receiveShadow = true;
  deck.add(plate);

  // Hazard chevrons around the deck edge (alternating warm/steel), so the
  // platform edge is unmistakable.
  const chevGeo = new THREE.BoxGeometry(1.0, 0.06, 0.5);
  const edge = (x, z, rotY) => {
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(chevGeo, (i + 3) % 2 === 0 ? M.glowWarm : M.steelDark);
      c.position.set(x, DECK_H + 0.03, z + i * 1.1);
      c.rotation.y = rotY;
      deck.add(c);
    }
  };
  edge(-HW + 0.3, 0, 0);
  edge(HW - 0.3, 0, 0);

  // Big lit up-arrow on the deck — the universal "this goes up" mark, built
  // from three glowing chevrons stacked along the axial run (points +Z, toward
  // the rocket park beyond the berth).
  for (let k = 0; k < 3; k++) {
    const zc = -1.2 + k * 1.2;
    for (const sx of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.05), M.glowCyan);
      bar.position.set(sx * 0.42, DECK_H + 0.04, zc);
      bar.rotation.y = sx * -0.72;      // the two bars meet in a "V" pointing +Z
      deck.add(bar);
    }
  }

  // Corner masts + blinking beacon lamps ride the deck.
  const masts = [];
  const beacons = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const mx = sx * (HW - 0.28), mz = sz * (HD - 0.28);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.6, 8), M.steel);
      mast.position.set(mx, DECK_H + 1.3, mz);
      mast.castShadow = true;
      deck.add(mast);
      masts.push(mast);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M.glowWarm);
      cap.position.set(mx, DECK_H + 2.7, mz);
      deck.add(cap);
      const lamp = cap;
      beacons.push(lamp);
    }
  }

  // Guide rails along the two long sides, leaving the ends open to drive on.
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, HD * 2 - 0.4), M.glowCyan);
    rail.position.set(sx * HW, DECK_H + 0.95, 0);
    deck.add(rail);
    for (const sz of [-1, 0, 1]) {
      const stanch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), M.steel);
      stanch.position.set(sx * HW, DECK_H + 0.48, sz * (HD - 0.5));
      deck.add(stanch);
    }
  }

  // ---- The threshold gate (static): a lit arch at the approach end, so you
  // can't miss where to drive on. Two posts + a header, cyan marks.
  const gate = new THREE.Group();
  gate.position.z = -HD - 0.35;
  g.add(gate);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.0, 0.3), M.steelDark);
    post.position.set(sx * (HW + 0.25), 1.5, 0);
    post.castShadow = true;
    gate.add(post);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), M.glowCyan);
    strip.position.set(sx * (HW + 0.25) - sx * 0.2, 1.5, 0);
    gate.add(strip);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 0.9, 0.4, 0.4), M.steelDark);
  header.position.set(0, 3.0, 0);
  gate.add(header);
  // Three lit up-chevrons on the header — the "this is the lift" sign.
  for (let i = 0; i < 3; i++) {
    const cxh = (i - 1) * 0.75;
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.1), M.glowWarm);
      wing.position.set(cxh + sx * 0.18, 3.0 + 0.02, 0.24);
      wing.rotation.z = sx * 0.9;
      gate.add(wing);
    }
  }
  // A little down-cage under the gate posts, so it reads as part of the lift.
  for (const sx of [-1, 1]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), M.steelDark);
    brace.position.set(sx * (HW + 0.25), 0.1, 0);
    gate.add(brace);
  }

  return { g, deck, plate, masts, beacons, base, gate };
}

// ---- The road-centre departure lift ----------------------------------------
// The unmistakable way home, sat plumb in the MIDDLE of the lane at the dock so
// a driver cruising the loop cannot miss it. It is deliberately built so you
// cannot blunder onto it head-on: two low rows of POSTS wall off the faces that
// point along the racing direction (local +/-X), while the two axial SIDES
// (local +/-Z) are left wide open. So you never mount it while just driving the
// road — you pull off the line to one side and drive into its flank, which
// triggers the whole fly-home cinematic. A rising deck (with up-chevrons and
// corner beacons) sits in a sunk well, so it clearly reads as an elevator.
// Local frame is the dockFrame: +X tangent, +Y inward/up-the-rim, +Z axial.
export function buildSpaceRoadLift() {
  const g = new THREE.Group();
  const addBox = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const RW = 2.8, RD = 3.6;      // half-extent along the tangent (X) / axial (Z)
  const DECK_H = 0.4;

  // Sunk base well the deck rises out of.
  addBox(RW * 2 + 0.5, 0.6, RD * 2 + 0.5, 0, -0.3, 0, M.steelDark);

  // ---- The rising deck ----------------------------------------------------
  const deck = new THREE.Group();
  g.add(deck);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(RW * 2, DECK_H, RD * 2), M.steel);
  plate.position.set(0, DECK_H / 2, 0);
  plate.castShadow = true; plate.receiveShadow = true;
  deck.add(plate);

  // Hazard chevrons along the two axial (open) sides, drawing the eye to where
  // you drive on.
  const chevGeo = new THREE.BoxGeometry(0.5, 0.06, 1.0);
  for (const sz of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(chevGeo, (i + 3) % 2 === 0 ? M.glowWarm : M.steelDark);
      c.position.set(i * 1.1, DECK_H + 0.03, sz * (RD - 0.3));
      deck.add(c);
    }
  }

  // Big lit up-arrow on the deck (points +Y, i.e. "this goes up").
  for (let k = 0; k < 3; k++) {
    const yc = -1.2 + k * 1.2;
    for (const sz of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.05), M.glowCyan);
      bar.position.set(sz * 0.42, DECK_H + 0.04, yc);
      bar.rotation.y = sz * 0.72;
      deck.add(bar);
    }
  }

  // Corner masts + blinking beacon lamps ride the deck.
  const masts = [];
  const beacons = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const mx = sx * (RW - 0.28), mz = sz * (RD - 0.28);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.6, 8), M.steel);
      mast.position.set(mx, DECK_H + 1.3, mz);
      mast.castShadow = true;
      deck.add(mast);
      masts.push(mast);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M.glowWarm);
      lamp.position.set(mx, DECK_H + 2.7, mz);
      deck.add(lamp);
      beacons.push(lamp);
    }
  }

  // ---- The blocking posts -------------------------------------------------
  // Two stout rows of posts walling off the tangent (+/-X) faces — the faces a
  // car meets when it is simply driving the lane — so you cannot drive onto the
  // lift head-on. The axial (+/-Z) flanks are left open for the side entry.
  const posts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 0, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.5, 10), M.steelDark);
      post.position.set(sx * (RW + 0.5), 0.75, sz * (RD - 0.7));
      post.castShadow = true;
      g.add(post);
      posts.push(post);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 10), M.glowWarm);
      band.position.set(sx * (RW + 0.5), 1.35, sz * (RD - 0.7));
      g.add(band);
    }
  }

  return { g, deck, plate, masts, beacons, posts };
}


export function buildSpaceWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color(0x04060f);

  // ---- Starfield + sun + planets (a slowly wheeling sky group) ------------
  const skyGroup = buildSpaceSky();
  group.add(skyGroup);

  // ---- Lighting ----------------------------------------------------------
  // Space is NOT dark — there is no fog out here, so the only reason anything
  // reads dim is lighting, and a rocket sweeping past the arrival lens used to
  // present its unlit flank. Full wash: cool sky-bounce + ambient fill, the
  // warm sun from behind the station, and a cold fill from the void side the
  // flyby tripod sits on, so the ship reads bright-white on the pass.
  group.add(new THREE.HemisphereLight(0x8fb6ff, 0x101520, 1.6));
  group.add(new THREE.AmbientLight(0x334455, 0.9));
  const sunLight = new THREE.DirectionalLight(0xfff2c4, 1.55);
  sunLight.position.set(-720, 260, -520);
  group.add(sunLight);
  const fillLight = new THREE.DirectionalLight(0xcfe0ff, 1.8);
  fillLight.position.set(520, 380, 560);   // the void side the arrival lens sits on
  group.add(fillLight);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * (Math.PI * 2);
    const l = new THREE.PointLight(0x9fd8ff, 0.9, 140, 2);
    l.position.set(Math.cos(a) * (RING_R - 12), Math.sin(a) * (RING_R - 12), 0);
    group.add(l);
  }

  // ---- The rim floor -----------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x40464c, roughness: 0.9, side: THREE.BackSide });
  const floor = new THREE.Mesh(cache('spacefloor', () => new THREE.CylinderGeometry(RING_R, RING_R, RING_W, 160, 1, true)), floorMat);
  floor.rotation.x = Math.PI / 2;
  group.add(floor);

  // ---- The outside of the wheel: a solid hull + slowly-wheeling markers ----
  // The driving lane lives on the INNER surface, so the exterior shell (and the
  // chevron ring below) are only ever seen from OUTSIDE — the arrival reveal
  // and the departure shot. The semi-solid hull keeps the station's silhouette
  // readable against the stars, and the glowing chevrons slowly sliding around
  // it are what sell the station's majestic spin through the fixed camera. They
  // are invisible from the corridor (behind the BackSide floor).
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1a2028, roughness: 0.7, metalness: 0.5, transparent: true, opacity: 0.45,
  });
  const hull = new THREE.Mesh(cache('spacehull', () => new THREE.CylinderGeometry(RING_R + 0.45, RING_R + 0.45, RING_W, 160, 1, true)), hullMat);
  hull.rotation.x = Math.PI / 2;
  group.add(hull);

  const extRing = new THREE.Group();
  group.add(extRing);
  const chevGeo = new THREE.BoxGeometry(7, 1.2, 0.9);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const chev = new THREE.Mesh(chevGeo, M.glowWarm.clone());
    chev.position.set(Math.cos(a) * (RING_R + 2.2), Math.sin(a) * (RING_R + 2.2), 0);
    chev.rotation.z = a;
    extRing.add(chev);
  }
  const plateGeo = new THREE.BoxGeometry(5, 0.7, 0.5);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (Math.PI / 18) * 0.5;
    const plate = new THREE.Mesh(plateGeo, M.steelDark);
    plate.position.set(Math.cos(a) * (RING_R + 1.5), Math.sin(a) * (RING_R + 1.5), RING_HALF_W - 0.8);
    plate.rotation.z = a;
    extRing.add(plate);
  }

  // Emissive stripe pairs running the whole loop, to read the curve and speed.
  for (const z of [-RING_HALF_W + 0.7, RING_HALF_W - 0.7]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(RING_R - 0.05, RING_R - 0.05, 0.25, 160, 1, true), M.stripe);
    band.rotation.x = Math.PI / 2;
    band.position.z = z;
    group.add(band);
  }

  // ---- Window walls on both sides of the corridor ------------------------
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9fd8ff, roughness: 0.12, metalness: 0, transmission: 0.8,
    transparent: true, opacity: 0.4, emissive: 0x1c4a66, emissiveIntensity: 0.35, side: THREE.DoubleSide,
  });
  // The -Z wall is a full glass ring. The +Z wall leaves a single gap at the
  // dock spur (world angle 0, the +X side) so the car can drive off the main
  // road and out to the bay. Cylinder theta runs one quarter turn ahead of world
  // angle (the floor is rotated x = PI/2), so the gap is centred on theta =
  // PI/2; the torus frame needs no such offset, so its gap is centred on 0.
  {
    const win = new THREE.Mesh(cache('spacewin', () => new THREE.CylinderGeometry(RING_R, RING_R, 3.0, 160, 1, true)), glassMat);
    win.rotation.x = Math.PI / 2;
    win.position.z = -RING_HALF_W;
    group.add(win);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.4, 8, 160), M.steel);
    frame.position.z = -RING_HALF_W;
    group.add(frame);

    const gapA = SHOULDER_GAP_A, gapB = SHOULDER_GAP_B;
    const gapLen = gapB - gapA;
    const winGap = new THREE.Mesh(
      cache('spacewingap', () => new THREE.CylinderGeometry(RING_R, RING_R, 3.0, 160, 1, true, gapB + Math.PI / 2, Math.PI * 2 - gapLen)),
      glassMat);
    winGap.rotation.x = Math.PI / 2;
    winGap.position.z = RING_HALF_W;
    group.add(winGap);
    const frameGap = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.4, 8, 160, Math.PI * 2 - gapLen), M.steel);
    frameGap.rotation.z = gapB;
    frameGap.position.z = RING_HALF_W;
    group.add(frameGap);
  }

  // ---- The spherical core + spire + outrigger arms (the hero structure) --
  // Sits at the wheel's centre: the towering hub the driver looks up at, and
  // the station body the exterior flyby lens frames.
  const core = buildSpaceCore();
  group.add(core.g);

  // ---- Consoles lining the floor (outside the driving lane) --------------
  // orientFloor places a group on the rim with local Y = hub-ward ("up") and
  // local X = the driving tangent, so a console's screen faces back into the
  // lane and its depth runs across the corridor.
  const _m = new THREE.Matrix4();
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  function orientFloor(obj, theta, w, r = RING_R) {
    const c = Math.cos(theta), s = Math.sin(theta);
    _x.set(-s, c, 0);      // tangent
    _y.set(-c, -s, 0);     // inward (up on the rim)
    _z.set(0, 0, 1);       // axial
    _m.makeBasis(_x, _y, _z);
    obj.quaternion.setFromRotationMatrix(_m);
    obj.position.set(r * c, r * s, w);
    return obj;
  }

  // ---- The rim's four themed sectors -------------------------------------
  // Each quarter of the loop is dressed as a different function of station life
  // (civic, hydroponics, reactor, waste/docking); see sectors.js. The module also
  // hands back the hazard zones, the shovable props and the rescue crane that
  // main.js drives.
  const sectors = buildSpaceSectors();
  group.add(sectors.group);

  // A couple of console banks flank the arrival spawn so it still reads as a
  // crewed corridor right where the car rolls out, before the sectors begin.
  const consoles = [];
  for (const theta of [0.22, -0.22]) {
    for (const side of [-1, 1]) {
      const bank = buildSpaceConsoleBank(consoles.length);
      if (side < 0) bank.scale.z = -1;
      orientFloor(bank, theta, side * (RING_HALF_W - 0.95), RING_R - 0.7);
      group.add(bank);
      const scr = bank.children[1];
      consoles.push({ mesh: scr, mat: scr.material, base: 1.8, phase: Math.random() * Math.PI * 2 });
    }
  }

  // ---- The eye-port: the pod bay doors at the station's centre -----------
  // The old boxy hangar that hung off the outer hull is GONE. The door moved to
  // the very middle of the ship: the catalogue pod-bay model itself, bolted onto
  // the core's +Z plinth and aimed down the incoming rocket's throat, so the
  // arrival flies to the centre of the station and the lids open like an eye
  // for it (main.js's arrival cine drives setDoors). +Z is the wheel's axle —
  // standing in the hub and looking out along it, like the centre of a ferris
  // wheel staring away from the rim, instead of down at the floor. Placed at
  // world z = 21.5: the face plate stands proud of the sphere, the lid slot sits
  // at z 20.98..21.48, and behind it the open iris/throat leads into the core.
  // The arrival now slides the ship the rest of the way down the axle after the
  // approach, so the hold comes to rest behind that slot (tail ~19.8) and the
  // lids can shut in front of it.
  const bay = buildSpacePodBay();
  bay.rotation.x = -Math.PI / 2;   // mouth (local -Y) -> world +Z, body into the core
  bay.position.set(0, 0, 21.5);
  group.add(bay);

  // ---- The dock frame at the ring floor, theta = 0 -----------------------
  // What remains of the old hangar: just its placement frame at the head of the
  // dock spur, holding the loading arm and giving the departure's berth and its
  // load camera their coordinates (main.js reads it as spaceWorld.dockFrame).
  const dockFrame = new THREE.Group();
  orientFloor(dockFrame, 0, 0, RING_R);
  group.add(dockFrame);

  // The big hydraulic loading arm that lifts the car off the berth and tucks it
  // into the parked rocket's hold (driven by the departure cine in main.js).
  // Stowed folded against the floor until then.
  const hangarArm = buildSpaceHangarArm({ baseX: 5, baseZ: 8, a: 9, b: 9, baseH: 2.6 });
  dockFrame.add(hangarArm.g);

  // ---- The dock spur: the off-ramp from the main road to the berth --------
  // A second strip of curved floor continues the corridor through the +Z wall
  // gap out to the berth, with a centreline and a berth ring so it reads as a
  // road that ends at the dock. Built with the same cylinder maths as the floor
  // (theta is a quarter turn ahead of world angle), so a strip centred on world
  // angle 0 — the dock — is centred on cylinder theta = PI/2.
  const spurGroup = new THREE.Group();
  group.add(spurGroup);

  const spurMat = new THREE.MeshStandardMaterial({ color: 0x3b4a5e, roughness: 0.9, side: THREE.BackSide });
  const spurFloor = new THREE.Mesh(
    cache('spurfloor', () => new THREE.CylinderGeometry(
      RING_R - 0.03, RING_R - 0.03, DOCK_SPUR_Z1 - DOCK_SPUR_Z0, 40, 1, true,
      Math.PI / 2 - DOCK_HALF_ARC, DOCK_HALF_ARC * 2)),
    spurMat);
  spurFloor.rotation.x = Math.PI / 2;
  spurFloor.position.z = (DOCK_SPUR_Z0 + DOCK_SPUR_Z1) / 2;
  spurGroup.add(spurFloor);

  // Centreline dashes running out to the berth (thin radially, long along Z).
  const dashGeo = new THREE.BoxGeometry(0.12, 0.5, 1.3);
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Mesh(dashGeo, M.glowCyan);
    d.position.set(RING_R - 0.07, 0, DOCK_SPUR_Z0 + 1.0 + i * 1.4);
    spurGroup.add(d);
  }
  // Edge studs down both sides.
  const studGeo = new THREE.SphereGeometry(0.16, 8, 6);
  for (const side of [-1, 1]) {
    const a = side * (DOCK_HALF_ARC - 0.02);
    for (let i = 0; i < 3; i++) {
      const stud = new THREE.Mesh(studGeo, M.glowWarm);
      stud.position.set(Math.cos(a) * (RING_R - 0.07), Math.sin(a) * (RING_R - 0.07), DOCK_SPUR_Z0 + 1.4 + i * 2.2);
      spurGroup.add(stud);
    }
  }
  // The berth ring marks where the loading arm picks the car up (behind the
  // departure's black beat, so the drive never sees the hand-off).
  const berth = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.22, 8, 40), M.glowCyan);
  berth.rotation.y = Math.PI / 2;    // lie flat in the tangent plane at world angle 0
  berth.position.set(RING_R - 0.08, 0, DOCK_SPUR_Z1 - 1.0);
  spurGroup.add(berth);

  // ---- The road-centre departure lift ------------------------------------
  // Sat plumb in the middle of the lane at the dock: the unmistakable way home.
  // Its fenced tangent ends stop a car that is simply driving the loop, while
  // the open axial flanks let you pull off the line and drive in sideways to
  // board. main.js drives the deck up and reads `s`/`halfS`/`halfW` for the
  // post collision and the boarding trigger.
  const roadLift = buildSpaceRoadLift();
  roadLift.g.position.set(0, 0, 0);      // dockFrame origin = s 0, w 0
  dockFrame.add(roadLift.g);
  roadLift.s = 0;
  roadLift.w = 0;
  roadLift.halfS = 2.8;
  roadLift.halfW = 3.6;

  // ---- A dormant launch rocket, hidden until the arrival cine ------------
  const arrival = buildArrivalShip();
  arrival.g.visible = false;
  group.add(arrival.g);

  // Two lamps travel with that rocket, key above the roof and a cold fill under
  // the belly: out in the void the hull is 100+ units from every station lamp,
  // so without its own lighting the flyby pass is a silhouette. They ride the
  // ship's own frame, so whichever flank the lens is on stays lit; distance is
  // kept short so they wash the hull and not the stars. Intensities are hot
  // because the physical falloff (decay 1.2) saps a lamp fast at hull range.
  const shipKey = new THREE.PointLight(0xfff6e6, 60, 120, 1.2);
  shipKey.position.set(1.5, 4.2, 4.2);
  arrival.g.add(shipKey);
  const shipFill = new THREE.PointLight(0xcfe6ff, 40, 120, 1.2);
  shipFill.position.set(-2.0, -3.2, -3.6);
  arrival.g.add(shipFill);
  // A third lamp out at the nose, so the front of the hull does not fall off
  // dark as the rocket sweeps past the fixed tripod.
  const shipNose = new THREE.PointLight(0xfff2e0, 30, 100, 1.2);
  shipNose.position.set(4.5, -0.5, 0);
  arrival.g.add(shipNose);

  const api = {
    group,
    skyGroup,
    core: core.g,
    coreRadius: CORE_R,
    floor,
    // The eye-port at the station centre (setDoors below drives its lids).
    bay,
    // The ring-floor frame at the spur head: holds the loading arm, and the
    // departure's berth/load camera coordinates (main.js: spaceWorld.dockFrame).
    dockFrame,
    spur: spurGroup,
    consoles,
    sectors,
    zones: sectors.zones,
    crane: sectors.crane,
    // The side decon bay's footprint, for the lane widening in main.js (loop
    // distance, near-arc and the max w the car may reach while driving into it).
    decon: sectors.decon,
    // The waste-sector trash loader: a proximity-triggered bot that fires trash out
    // of the airlock into the void (no rescue).
    trashBot: sectors.trashBot,
    arrivalShip: arrival.g,
    arrivalSeat: arrival.seat,
    arrivalHinge: arrival.hinge,
    arrivalPlume: { g: arrival.plume, outer: arrival.outer, inner: arrival.inner },
    // The road-centre departure lift: the player pulls into an open flank and
    // the deck lifts the car to the exit rocket's hold (main.js drives
    // `deck`/`beacons` and uses `s`/`halfS`/`halfW` for the collision).
    roadLift,
    hangarArm,
    // The berth, in the dock frame's local frame: where the car parks to be
    // loaded (world = dockFrame.localToWorld). The load cine grabs the car here.
    berthLocal: new THREE.Vector3(0, 0.0, DOCK_SPUR_Z1 - 1.0),
    // The dock spur's driveable footprint, for the lane widening + boarding
    // trigger in main.js (loop-distance half-width, max w, and berth w).
    dock: {
      s: DOCK_HALF_ARC * RING_R,
      lane: DOCK_LANE,
      berthW: DOCK_BERTH_W,
      z0: DOCK_SPUR_Z0,
      z1: DOCK_SPUR_Z1,
    },
    setDoors(open) {
      bay.userData.setDoors(open);
    },
    update(dt, t, car, car2) {
      for (const s of core.spinners) s.rotation.y += dt * 0.08;
      // Probes spin only — no drift, so each stays seated on its tether.
      for (const f of core.floaters) f.rotation.y += dt * f.userData.spin;
      for (const m of core.beacons) m.emissiveIntensity = 1.6 + Math.sin(t * 4) * 0.9;
      extRing.rotation.z -= dt * 0.045;   // hull markers wheel the other way
      skyGroup.rotation.z = -t * 0.02;   // stars wheel past the windows
      // The road lift's beacon lamps pulse in a slow alternating sweep, so the
      // platform reads as live and waiting even before you pull onto it.
      for (let i = 0; i < roadLift.beacons.length; i++) {
        const k = 0.5 + 0.5 * Math.sin(t * 4 + i * (Math.PI / 2));
        roadLift.beacons[i].scale.setScalar(0.8 + k * 0.5);
      }
      const su = skyGroup.userData;
      for (const c of su.clouds) c.material.opacity = c.userData.base + Math.sin(t * 0.25 + c.userData.phase) * c.userData.amp;
      for (const q of su.quasars) q.mat.opacity = q.base + Math.sin(t * q.speed + q.phase) * 0.2;
      for (const c of consoles) {
        const blink = Math.sin(t * 11 + c.phase * 2.3);
        if (blink < -0.9) {
          c.mat.emissiveIntensity = 0.06;   // hard blink to near-black
        } else {
          c.mat.emissiveIntensity = c.base + Math.sin(t * 3 + c.phase) * 0.6;
          // Every so often the readout scrambles into odd glyphs, then clears.
          const want = blink < -0.35 ? c.mesh.userData.texG : c.mesh.userData.texN;
          if (c.mat.map !== want) {
            c.mat.map = want;
            c.mat.emissiveMap = want;
            c.mat.needsUpdate = true;
          }
        }
      }
      sectors.update(dt, t, car || null, car2 || null);
    },
    mapFeatures: [],
    spawn: { s: 0, w: 5.4, heading: 0 },
  };

  api.setDoors(0);
  return api;
}
