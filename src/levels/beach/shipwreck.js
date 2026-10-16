import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  BEACH_SHIPWRECK, SHIPWRECK_SCALE, BEACH_SEA_Y, beachGroundOffsetAt,
} from './layout.js?v=1800000000000';

// ===== The wreck =====
//
// A huge 1800s sailing ship, broken and heeled right over on the sea floor, out
// in the deep just short of the mermaids' castle. It used to be pure scenery,
// glimpsed from the lip through the water; now the drop-off is open, so the car
// can drive right out to it.
//
// The whole ship is kept UNDER the waterline. That is the one hard rule here:
// the masts are snapped off to stumps, the sails are gone, and the forward
// quarter has rotted clean away (clipped off) - so nothing rises anywhere near
// the surface, and the wreck reads as something that has been down here a long
// time rather than a ship still afloat. The placement at the end MEASURES the
// finished model and settles it so its highest timber sits just below the
// surface, no matter how the parts above are arranged.
//
// Everything is deterministic (no Math.random) so a rebuild is reproducible, the
// same way the rest of the level is.
const TAU = Math.PI * 2;

let _seed = 90210;
const rnd = () => {
  _seed = (_seed * 48271) % 2147483647;
  return _seed / 2147483647;
};
const rr = (a, b) => a + (b - a) * rnd();

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, flatShading: true, ...opts });
}

// Weathered timber and rotten iron. The low emissive terms keep the wreck
// legible under deep water light without making it glow like the pearl castle.
// The hull and deck sides are DoubleSide so the open, rotted-away bow quarter
// shows a dark interior instead of vanishing into the murk.
const M = {
  hull:     std(0x4a3826, { emissive: 0x17110a, emissiveIntensity: 0.16, side: THREE.DoubleSide }),
  hullDark: std(0x271d12, { emissive: 0x0d0906, emissiveIntensity: 0.12, side: THREE.DoubleSide }),
  deck:     std(0x6b5238, { emissive: 0x211a10, emissiveIntensity: 0.14, side: THREE.DoubleSide }),
  spar:     std(0x554229, { emissive: 0x1a1409, emissiveIntensity: 0.14 }),
  iron:     std(0x33343a, { roughness: 0.5, metalness: 0.5, emissive: 0x0a0b0d, emissiveIntensity: 0.1 }),
  rope:     std(0x6d5c3c, { emissive: 0x1c170e, emissiveIntensity: 0.12 }),
  growth:   std(0x5f6f4e, { roughness: 0.85, emissive: 0x1b2415, emissiveIntensity: 0.14 }),
  gold:     std(0xffd257, { roughness: 0.24, metalness: 0.95, emissive: 0x6a4a00, emissiveIntensity: 0.35 }),
  jewel:    std(0x7fd8ff, { roughness: 0.15, metalness: 0.3, emissive: 0x1a4a63, emissiveIntensity: 0.4, flatShading: true }),
  jewelWarm: std(0xff8f6b, { roughness: 0.15, metalness: 0.3, emissive: 0x5a2412, emissiveIntensity: 0.4, flatShading: true }),
  pearl:    std(0xf4f1ea, { roughness: 0.1, metalness: 0.2, emissive: 0x6a6a60, emissiveIntensity: 0.25 }),
  chest:    std(0x5b3f23, { emissive: 0x1a1209, emissiveIntensity: 0.14 }),
  chestDim: std(0x2f2113, { emissive: 0x0e0a05, emissiveIntensity: 0.12 }),
};

// The hull, in its own local frame: forward is +Z (bow at +LEN/2), the keel sits
// on y = 0 and the weather deck is at y = DECK.
const LEN = 112;
const BEAM = 28;
const DECK = 17;
const BULWARK = 5;
// The forward quarter has rotted clean away. Everything in front of this line
// (local +Z) is clipped off the whole model, so the wreck reads as if a quarter
// of it has simply gone - bow, forecastle, foremast and all.
const Z_CUT = LEN * 0.25;

function box(parent, w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, x, y, z, mat, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// A thin bar running between two points - used for the rigging, so a stay
// actually lands on the mast top and the rail.
function strut(parent, ax, ay, az, bx, by, bz, r, mat) {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  parent.add(m);
  return m;
}

function buildHull() {
  const ship = new THREE.Group();

  // ---- the hull ----
  // A lower hull as a squashed hemisphere: an elliptical bowl whose rim is the
  // deck line and whose keel sits on y = 0.
  const lower = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, TAU, Math.PI / 2, Math.PI / 2), M.hull);
  lower.scale.set(BEAM / 2, DECK, LEN / 2);
  lower.position.y = DECK;
  ship.add(lower);

  // The weather deck, lid on the bowl.
  const deck = new THREE.Mesh(new THREE.CircleGeometry(1, 40), M.deck);
  deck.rotation.x = -Math.PI / 2;
  deck.scale.set(BEAM / 2, LEN / 2, 1);
  deck.position.y = DECK;
  ship.add(deck);

  // The bulwark: the open sides above the deck, a ring shaped to the same
  // elliptical plan.
  const bulwark = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), M.hull);
  bulwark.scale.set(BEAM / 2, BULWARK, LEN / 2);
  bulwark.position.y = DECK + BULWARK / 2;
  ship.add(bulwark);

  // Cap rail on top of the bulwark.
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 6, 40), M.spar);
  rail.rotation.x = Math.PI / 2;
  rail.scale.set(BEAM / 2, LEN / 2, 1);
  rail.position.y = DECK + BULWARK;
  ship.add(rail);

  // ---- stern, and the high poop deck ----
  // The bow has rotted away, so there is no stem or forecastle to build; only
  // the stern post and the raised castle aft are left.
  box(ship, 2.4, DECK + 4, 5, 0, (DECK + 4) / 2, -LEN / 2 + 2, M.spar, 0.14, 0, 0);
  box(ship, BEAM * 0.66, 6.5, LEN * 0.2, 0, DECK + BULWARK + 2.6, -LEN / 2 + LEN * 0.11, M.hull);
  // Gun ports along both sides, up to the rotted line.
  for (let z = -LEN * 0.34; z <= Z_CUT - 4; z += 9) {
    box(ship, 1.2, 1.8, 2.6, BEAM / 2 - 0.6, DECK - 6, z, M.hullDark);
    box(ship, 1.2, 1.8, 2.6, -BEAM / 2 + 0.6, DECK - 6, z, M.hullDark);
  }

  // ---- damage: the ship is broken and gutted ----
  // Big cracks split the planking; a couple of the bites go right through to a
  // dark recess, so they read as holes rather than painted lines.
  const cracks = [
    { z: -8, x: BEAM / 2, ry: 0.4, w: 3.4, h: 10 },
    { z: 14, x: -BEAM / 2, ry: -0.3, w: 2.6, h: 13 },
    { z: -30, x: BEAM / 2, ry: 0.2, w: 2.2, h: 8 },
  ];
  for (const c of cracks) {
    box(ship, 0.6, c.h, c.w, c.x, DECK - c.h / 2 + 2, c.z, M.hullDark, 0.1, c.ry, 0.35);
  }
  // A whole section stove in amidships: an open gap with the bare frames showing.
  box(ship, BEAM - 1, 9, 14, 0, DECK - 4, -8, M.hullDark);
  for (let i = -3; i <= 3; i++) {
    // Ribs bent over the gap, rising proud of the deck where the planking is gone.
    const rib = box(ship, 1.1, DECK + 7, 1.1, i * 3.6, DECK + 1, -8, M.hullDark, 0, 0, 0.06 * i);
    rib.rotation.x = Math.PI / 40;
  }

  // ---- the rotted bow: bare frames showing at the break ----
  // Where the forward quarter is cut away, the ribs stand exposed. A short
  // stub of planking is left standing proud of the cut so the edge is ragged.
  for (let i = -3; i <= 3; i++) {
    const rib = box(ship, 1.0, DECK + BULWARK + 1, 1.0, i * 3.7, (DECK + BULWARK) / 2, Z_CUT - 0.6, M.hullDark);
    rib.rotation.z = i * 0.05;
  }
  box(ship, 3.2, 1.4, 1.0, -4.2, DECK - 3, Z_CUT - 1.2, M.hullDark, 0.6, 0, 0.2);
  box(ship, 2.6, 1.2, 1.0, 5.0, DECK - 5, Z_CUT - 0.4, M.hullDark, -0.5, 0, -0.3);

  // A yard that came down across the deck and now lies there.
  const fallen = cyl(ship, 0.7, 0.7, 44, 0, DECK + 1.2, -30, M.spar, 6);
  fallen.rotation.z = Math.PI / 2;
  fallen.rotation.y = 0.5;

  // ---- masts: all snapped off to stumps ----
  // Nothing on a sunken wreck should reach for the surface. The mainmast is a
  // splintered stub, the mizzen a bare stump, and the foremast went with the
  // rotted bow quarter.
  cyl(ship, 1.7, 1.1, 16, 0, DECK + 8, -2, M.spar, 8);
  box(ship, 2.0, 2.6, 2.0, 0, DECK + 17, -2, M.hullDark, 0.3, 0, 0.2);   // splintered top
  cyl(ship, 1.5, 1.2, 9, 0, DECK + 4.5, -36, M.spar, 8);                 // mizzen stump
  box(ship, 1.8, 2.0, 1.8, 0, DECK + 9.5, -36, M.hullDark, 0.2, 0, -0.3);

  // A single low yard lashed across the main stump, and a couple of stays run
  // down to the rail - the tatters of the rig that have not rotted through.
  const mainTop = DECK + 16;
  const yard = cyl(ship, 0.6, 0.6, BEAM * 1.4, 0, mainTop - 4, -2, M.spar, 6);
  yard.rotation.z = Math.PI / 2;
  strut(ship, 0, mainTop, -2, -BEAM / 2 + 2, DECK + BULWARK, -LEN / 2 + 6, 0.13, M.rope);
  strut(ship, 0, mainTop, -2, BEAM / 2 - 2, DECK + BULWARK, -LEN / 2 + 6, 0.13, M.rope);

  // ---- growth: weed, barnacles and the odd coral on the timber ----
  for (let i = 0; i < 60; i++) {
    const a = rr(0, TAU);
    const y = rr(1, DECK + 2);
    const r = Math.sqrt(Math.max(0, 1 - Math.pow((y - DECK) / DECK, 2)));
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.5, 1.5), 0), M.growth);
    blob.position.set(Math.cos(a) * r * (BEAM / 2 + 0.3), y, Math.sin(a) * r * (LEN / 2 + 0.3));
    blob.scale.y = rr(0.4, 0.8);
    ship.add(blob);
  }

  return ship;
}

export function buildShipwreck(base) {
  const group = new THREE.Group();
  const ship = buildHull();

  const ground = beachGroundOffsetAt(BEACH_SHIPWRECK.x, BEACH_SHIPWRECK.z);

  // Measure the FINISHED model in its own frame, BEFORE it is heeled, so the
  // placement below can settle it by what is actually there. Only the kept
  // geometry counts: anything forward of the rotted line is clipped off and must
  // not be allowed to drive the fit.
  ship.updateMatrixWorld(true);
  const sinH = Math.sin(BEACH_SHIPWRECK.heel);
  const cosH = Math.cos(BEACH_SHIPWRECK.heel);
  const p = new THREE.Vector3();
  let lowest = Infinity;
  let highest = -Infinity;
  ship.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (p.z > Z_CUT) continue;
      // Heel is a roll about the fore-aft (Z) axis, so only x and y move.
      const y = p.x * sinH + p.y * cosH;
      if (y < lowest) lowest = y;
      if (y > highest) highest = y;
    }
  });

  group.add(ship);

  // Roll it about its fore-aft axis, then TURN it. The heel is applied first, in
  // the model's own frame; the yaw then swings the whole thing round in world.
  const heelQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), BEACH_SHIPWRECK.heel);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), BEACH_SHIPWRECK.yaw);
  group.quaternion.copy(yawQ).multiply(heelQ);
  group.scale.setScalar(SHIPWRECK_SCALE);

  // Settle it: seat it `settle` above the floor, then NEVER let its highest
  // timber rise past the waterline. The second term is the guarantee - whatever
  // the geometry above does, no part of this wreck breaks the surface.
  const settle = 1.2;   // sink it a touch so it reads as bedded, not parked
  const seatY = base + ground + SHIPWRECK_SCALE * (settle - lowest);
  const topLimit = base + BEACH_SEA_Y - 0.8;   // 0.8 under the surface
  const clearY = topLimit - SHIPWRECK_SCALE * highest;
  group.position.set(BEACH_SHIPWRECK.x, Math.min(seatY, clearY), BEACH_SHIPWRECK.z);

  // Clip off the rotted forward quarter of EVERY part of the ship. The plane is
  // built in the ship's own frame (drop local +Z past the cut) and then carried
  // into world space by the group's own transform, because Three clips against
  // world-space planes. The group never moves, so this is computed just once.
  const nLocal = new THREE.Vector3(0, 0, -1);
  const ptLocal = new THREE.Vector3(0, 0, Z_CUT);
  const worldPt = ptLocal.clone().multiplyScalar(SHIPWRECK_SCALE).applyQuaternion(group.quaternion).add(group.position);
  const worldN = nLocal.clone().applyQuaternion(group.quaternion).normalize();
  const clipPlane = new THREE.Plane(worldN, -worldN.dot(worldPt));
  for (const mat of Object.values(M)) {
    if (mat.isMeshStandardMaterial) mat.clippingPlanes = [clipPlane];
  }

  return {
    group,
    update() {
      // The wreck itself does not move (it is lying on the floor). Kept as a
      // no-op so the world's update loop does not have to special-case it.
    },
  };
}

// ===== The treasure =====
//
// A chest burst open on the sea floor beside the wreck, spilling gold - coins
// strewn across the sand, and jewels and pearls among them. Pure scenery, but it
// is the reason to come all the way out here. Deterministic, like everything
// else in the level.
export function buildTreasureChest(base) {
  const group = new THREE.Group();
  const site = { x: BEACH_SHIPWRECK.x + 26, z: BEACH_SHIPWRECK.z + 20 };
  const ground = beachGroundOffsetAt(site.x, site.z);

  const chest = new THREE.Group();
  chest.position.set(site.x, base + ground, site.z);
  chest.rotation.y = -0.6;

  // The chest body: a plank box with iron banding.
  const bw = 7, bh = 4.4, bd = 4.8;
  box(chest, bw, bh, bd, 0, bh / 2, 0, M.chest);
  box(chest, bw + 0.4, 0.6, 0.5, 0, bh - 0.6, bd / 2, M.iron);
  box(chest, bw + 0.4, 0.6, 0.5, 0, bh - 0.6, -bd / 2, M.iron);
  box(chest, 0.5, bh + 0.4, bd + 0.4, bw / 2, bh / 2, 0, M.iron);
  box(chest, 0.5, bh + 0.4, bd + 0.4, -bw / 2, bh / 2, 0, M.iron);
  // The lid: broken off its hinges and flung back, so the box gapes open.
  const lid = box(chest, bw, 0.6, bd, 0, bh + 0.2, -bd, M.chestDim, -1.15, 0, 0.12);
  box(chest, bw, 0.5, 0.5, 0, bh + 0.2, -bd - bd / 2 + 0.3, M.iron, -1.15, 0, 0.12);
  lid.rotation.y = 0.06;

  // The horde: gold coins heaped in the box, spilling over the front lip.
  for (let i = 0; i < 90; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8), M.gold);
    const spread = 1 + rr(0, 2.6);
    coin.position.set(rr(-bw / 2 + 0.5, bw / 2 - 0.5), bh + rr(-0.2, 0.5), rr(-bd / 2 + 0.5, bd / 2 + spread * 0.6));
    coin.rotation.set(rr(0, TAU), rr(0, TAU), rr(0, TAU));
    chest.add(coin);
  }
  // Jewels and pearls nested in the gold.
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.55 + rr(0, 0.35), 0), i % 2 ? M.jewel : M.jewelWarm);
    g.position.set(rr(-bw / 2 + 0.7, bw / 2 - 0.7), bh + 0.35, rr(-bd / 2 + 0.7, bd / 2 + 1.4));
    g.rotation.set(rr(0, TAU), rr(0, TAU), rr(0, TAU));
    chest.add(g);
  }
  for (let i = 0; i < 9; i++) {
    const pe = new THREE.Mesh(new THREE.SphereGeometry(0.32 + rr(0, 0.16), 6, 5), M.pearl);
    pe.position.set(rr(-bw / 2 + 0.6, bw / 2 - 0.6), bh + 0.3, rr(-bd / 2 + 0.6, bd / 2 + 1.6));
    chest.add(pe);
  }

  // ...and the coins strewn across the sand, as if the tide of the spill ran out
  // across the floor. They lie flat, half-sunk, so they read as scattered.
  for (let i = 0; i < 70; i++) {
    const a = rr(0, TAU);
    const r = rr(2, 16);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8), M.gold);
    const cx = site.x + Math.cos(a) * r;
    const cz = site.z + Math.sin(a) * r;
    coin.position.set(cx, base + beachGroundOffsetAt(cx, cz) + 0.06, cz);
    coin.rotation.set(rr(-0.3, 0.3), rr(0, TAU), rr(-0.3, 0.3));
    group.add(coin);
  }
  for (let i = 0; i < 6; i++) {
    const a = rr(0, TAU);
    const r = rr(3, 13);
    const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 + rr(0, 0.3), 0), i % 2 ? M.jewel : M.jewelWarm);
    const cx = site.x + Math.cos(a) * r;
    const cz = site.z + Math.sin(a) * r;
    g.position.set(cx, base + beachGroundOffsetAt(cx, cz) + 0.4, cz);
    g.rotation.set(rr(0, TAU), rr(0, TAU), rr(0, TAU));
    group.add(g);
  }
  for (let i = 0; i < 7; i++) {
    const a = rr(0, TAU);
    const r = rr(2, 12);
    const pe = new THREE.Mesh(new THREE.SphereGeometry(0.3 + rr(0, 0.14), 6, 5), M.pearl);
    const cx = site.x + Math.cos(a) * r;
    const cz = site.z + Math.sin(a) * r;
    pe.position.set(cx, base + beachGroundOffsetAt(cx, cz) + 0.3, cz);
    group.add(pe);
  }

  group.add(chest);
  return { group, site };
}
