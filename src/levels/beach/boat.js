import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== The boat =====
//
// A harbour tug, riding at her moorings out in the deep water past the
// drop-off.
//
// It is SCENERY, deliberately. The car drives underwater - that is the whole
// conceit of this beach - so anything left floating at the surface is already
// unreachable; putting the boat out in the trench past the drop-off makes that
// structural rather than a matter of where it happened to be dropped. It is not
// there to be found, driven to, or landed in. You can see it from the lip of
// the drop-off, and that is the whole of its job.
//
// BUILT BIG. It started as a rowing boat at 7.4 long and 2.3 across, which at
// this level's scale was a bathtub with oars in it - something you could have
// mistaken for scenery in a pond. A tug is the right answer twice over: it is a
// genuinely large object to look at from the lip, and its fat, high, bluff
// bow and its stack of deckhouse are unmistakably a WORKING boat rather than a
// model of one. 15 by 5.2 against a car that is 4.4 wide, it reads as bigger
// than the thing you are driving, which is the whole joke.
//
// DETAIL, because that is what makes it a tug rather than a box: a lofted
// hull with real sheer and a rounded forefoot, a rubbing strake round the
// waterline, a deckhouse and a wheelhouse in two tiers with a window band, a
// stack with a coloured band, a mast and a radar scanner, stanchion railings
// along the foredeck, tyre fenders down both sides, and a towing winch on the
// afterdeck.
//
// The motion is driven by three sine waves at different rates rather than one,
// so it never quite repeats and does not read as a single mechanical
// oscillation. Roll and pitch run at different speeds to the heave for the same
// reason: a boat that only bobs up and down looks like a lift, not a boat.

const LEN = 15;            // overall length
const BEAM = 5.2;          // overall width
const STATIONS = 22;       // how finely the hull is lofted along its length
const ROWS = 5;            // how finely the bottom is rounded across its width

// A tug's working colours: black bottom, red topsides, cream deckhouse, and a
// stack banded in the same red.
const HULL_BELOW = 0x2b2f38;
const HULL_TOPSIDE = 0x9c3b2e;
const HULL_BOOT = 0xe8e2d2;      // the pale boot-top along the waterline
const DECK_COL = 0x6d5b45;
const HOUSE_COL = 0xece3d0;
const HOUSE_TRIM = 0x1f4a52;
const STACK_COL = 0x24262b;
const STACK_BAND = 0xd8a12c;
const METAL = 0xb9bec4;
const GLASS = 0x16323d;

// Half-beam of the hull at a station along its length. A tug is FULL forward -
// it has a bluff bow to push with and pushes it wide - so the width comes in
// early and stays there, rather than the long taper of a rowing boat.
function halfBeam(u) {
  // u = 0 at the transom, 1 at the stem.
  const bow = Math.pow(u, 0.42);
  const stern = 1 - 0.3 * Math.pow(1 - u, 2.2);
  return (0.34 + 0.66 * bow) * stern;
}

// How deep the hull sits, and how high its deck edge runs. `d` is the keel below
// the waterline, `h` the bulwark above it. The sheer is the curve of the deck
// line: low amidships, sweeping up to the stem and lifting again at the
// transom, which is most of what makes a hull read as a hull.
function keelDepth(u) {
  const mid = Math.sin(Math.PI * Math.pow(u, 0.8));
  // A tug carries a deep, flat-bottomed forefoot, so it does NOT rise at the
  // bow the way a rowing boat does.
  return 1.5 + 0.85 * mid;
}
function sheer(u) {
  return 0.95 + 0.55 * Math.pow(u, 2.6) + 0.3 * Math.pow(1 - u, 3);
}

// One cross-section of the hull, as a CLOSED loop walked anticlockwise seen from
// the bow: down the starboard side to the keel, up the port side, and back along
// the deck. Lofting consecutive sections into this loop and capping each end
// gives a closed solid without any of the internal faces that made the old
// per-plank hull read as a set of floating boards.
function hullSection(u) {
  const w = halfBeam(u) * BEAM * 0.5;
  const d = keelDepth(u);
  const h = sheer(u);
  const pts = [];
  for (let i = 0; i <= ROWS; i++) {
    const a = (i / ROWS) * Math.PI * 0.5;
    pts.push([Math.sin(a) * w, -Math.cos(a) * d]);
  }
  pts.push([w, h]);
  pts.push([-w, h]);
  pts.push([-w, 0]);
  // Back down to (but not onto) the keel point, which closes the loop.
  for (let i = ROWS; i >= 1; i--) {
    const a = (i / ROWS) * Math.PI * 0.5;
    pts.push([-Math.sin(a) * w, -Math.cos(a) * d]);
  }
  return pts;
}

const rgbOf = (hex, k = 1) => [
  ((hex >> 16) & 255) / 255 * k,
  ((hex >> 8) & 255) / 255 * k,
  (hex & 255) / 255 * k,
];

function hullGeometry() {
  const pos = [];
  const col = [];
  const sections = [];
  for (let i = 0; i <= STATIONS; i++) {
    const u = i / STATIONS;
    sections.push({ u, z: (u - 0.5) * LEN, pts: hullSection(u) });
  }
  const N = sections[0].pts.length;

  // Colour by HEIGHT of the section point, so the boot-top and the black bottom
  // are painted on as bands that wrap the hull instead of being separate meshes.
  const colourOf = (y) => {
    if (y < -0.28) return rgbOf(HULL_BELOW);
    if (y < 0.1) return rgbOf(HULL_BOOT, 0.92);
    return rgbOf(HULL_TOPSIDE, 0.86 + 0.2 * Math.min(1, y / 1.2));
  };
  const tri = (a, b, c) => {
    const rgb = colourOf((a[1] + b[1] + c[1]) / 3);
    for (const v of [a, b, c]) {
      pos.push(v[0], v[1], v[2]);
      col.push(rgb[0], rgb[1], rgb[2]);
    }
  };

  for (let i = 0; i < STATIONS; i++) {
    const s0 = sections[i], s1 = sections[i + 1];
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      const a = [s0.pts[k][0], s0.pts[k][1], s0.z];
      const b = [s1.pts[k][0], s1.pts[k][1], s1.z];
      const c = [s1.pts[k1][0], s1.pts[k1][1], s1.z];
      const d = [s0.pts[k1][0], s0.pts[k1][1], s0.z];
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  // Cap the transom and the stem, each a fan from the section's own centre.
  for (const [s, flip] of [[sections[0], false], [sections[STATIONS], true]]) {
    let cx = 0, cy = 0;
    for (const p of s.pts) { cx += p[0]; cy += p[1]; }
    cx /= N; cy /= N;
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      const a = [s.pts[k][0], s.pts[k][1], s.z];
      const b = [s.pts[k1][0], s.pts[k1][1], s.z];
      const c = [cx, cy, s.z];
      if (flip) tri(a, b, c); else tri(a, c, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildBoat() {
  const group = new THREE.Group();
  group.userData.isBoat = true;

  // DoubleSide throughout: the hull is a closed solid, but a boat is the one
  // thing on this level the player looks at from every side including from below
  // through the water, and a hole in it reads as a hole in the world.
  const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide, ...opts,
  });
  const hullMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.66, metalness: 0.06,
    flatShading: true, side: THREE.DoubleSide,
  });
  const metal = mat(METAL, { roughness: 0.42, metalness: 0.55 });
  const houseMat = mat(HOUSE_COL);
  const trimMat = mat(HOUSE_TRIM, { roughness: 0.5 });
  const glassMat = mat(GLASS, { roughness: 0.18, metalness: 0.4 });
  const deckMat = mat(DECK_COL, { roughness: 0.9 });
  const tyreMat = mat(0x1b1b1e, { roughness: 0.95 });

  const hull = new THREE.Mesh(hullGeometry(), hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // ---- deck ----
  // A single flat plate laid over the lofted hull. It does not follow the sheer,
  // which at this size and distance is not visible, and it means there is a
  // surface to stand the deckhouse on.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.86, 0.22, LEN * 0.93), deckMat);
  deck.position.set(0, sheer(0.5) - 0.05, 0);
  deck.receiveShadow = true;
  group.add(deck);

  // ---- rubbing strake: the fat roll of timber round the waterline ----
  // This one line does more for "boat" than any amount of superstructure. It is a
  // torus-ish band run the length of the hull, following the waterline.
  {
    const pos = [];
    const col = [];
    const SEG = STATIONS;
    for (let i = 0; i < SEG; i++) {
      const u0 = i / SEG, u1 = (i + 1) / SEG;
      const w0 = halfBeam(u0) * BEAM * 0.5, w1 = halfBeam(u1) * BEAM * 0.5;
      const z0 = (u0 - 0.5) * LEN, z1 = (u1 - 0.5) * LEN;
      const rgb = rgbOf(HULL_BOOT, 0.66);
      const ring = (w, z, y, r) => {
        // A little half-round tube standing off the topsides.
        for (const sx of [-1, 1]) {
          pos.push(sx * (w - 0.02), y + r, z);
          pos.push(sx * (w + r), y, z);
          pos.push(sx * (w - 0.02), y - r, z);
          for (let q = 0; q < 3; q++) col.push(rgb[0], rgb[1], rgb[2]);
        }
      };
      for (const sx of [-1, 1]) {
        const a = [sx * (w0 - 0.02), 0.28, z0];
        const b = [sx * (w1 - 0.02), 0.28, z1];
        const c = [sx * (w1 + 0.34), 0.28, z1];
        const d = [sx * (w0 + 0.34), 0.28, z0];
        for (const v of [a, b, c, a, c, d]) {
          pos.push(v[0], v[1], v[2]);
          col.push(rgb[0], rgb[1], rgb[2]);
        }
      }
      void ring;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const strake = new THREE.Mesh(geo, hullMat);
    group.add(strake);
  }

  // ---- deckhouse, in two tiers ----
  // Aft house first, then the wheelhouse on top and forward of it. Tugs are
  // built back-to-front like this so the pilot has the whole foredeck in front
  // of them, which is exactly the shape you want to read at a glance.
  const houseH = 1.8;
  const house = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.74, houseH, 6.4), houseMat);
  house.position.set(0, sheer(0.5) + houseH / 2, -1.6);
  house.castShadow = true;
  group.add(house);
  // A trim stripe round the base of the house, so it does not merge with the
  // deck.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.76, 0.3, 6.5), trimMat);
  stripe.position.set(0, sheer(0.5) + 0.16, -1.6);
  group.add(stripe);

  const wheelH = 2.0;
  const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.62, wheelH, 3.4), houseMat);
  wheelhouse.position.set(0, sheer(0.5) + houseH + wheelH / 2, 1.5);
  wheelhouse.castShadow = true;
  group.add(wheelhouse);
  // The window band: one dark glass ring right round the wheelhouse, and a
  // second, shorter one along the deckhouse. These are the windows you see
  // catching the sun as she rolls.
  const band = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.635, 0.85, 3.42), glassMat);
  band.position.set(0, sheer(0.5) + houseH + wheelH * 0.62, 1.5);
  group.add(band);
  const houseBand = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.755, 0.55, 6.0), glassMat);
  houseBand.position.set(0, sheer(0.5) + houseH * 0.62, -1.6);
  group.add(houseBand);
  // A roof that overhangs the wheelhouse, and a visor over the front windows.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.72, 0.22, 4.1), trimMat);
  roof.position.set(0, sheer(0.5) + houseH + wheelH + 0.1, 1.5);
  group.add(roof);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.66, 0.12, 0.7), trimMat);
  visor.position.set(0, sheer(0.5) + houseH + wheelH * 0.86, 3.3);
  group.add(visor);

  // ---- the stack ----
  const stackY = sheer(0.5) + houseH;
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 2.3, 12), mat(STACK_COL));
  stack.position.set(0, stackY + 1.15, -4.0);
  stack.castShadow = true;
  group.add(stack);
  // The coloured band round it, and the black top lip.
  const sBand = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.55, 12), mat(STACK_BAND));
  sBand.position.set(0, stackY + 1.0, -4.0);
  group.add(sBand);
  const sCap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.3, 12), mat(0x141518));
  sCap.position.set(0, stackY + 2.42, -4.0);
  group.add(sCap);
  // Two stub exhausts out of the top, which is what a tug actually has.
  for (const sx of [-0.24, 0.24]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 8), metal);
    pipe.position.set(sx, stackY + 2.6, -4.0);
    group.add(pipe);
  }

  // ---- mast, radar and lights ----
  const mastBase = sheer(0.5) + houseH + wheelH + 0.2;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.4, 8), metal);
  mast.position.set(0, mastBase + 1.7, 0.6);
  group.add(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), metal);
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, mastBase + 2.7, 0.6);
  group.add(yard);
  // Radar scanner on top. The only moving part on the boat.
  const radarPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), metal);
  radarPost.position.set(0, mastBase + 3.5, 0.6);
  group.add(radarPost);
  const scanner = new THREE.Group();
  scanner.position.set(0, mastBase + 3.8, 0.6);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.22), houseMat);
  scanner.add(bar);
  group.add(scanner);
  group.userData.scanner = scanner;
  // Masthead lamps, port and starboard, and a searchlight on the wheelhouse front.
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      mat(sx < 0 ? 0xcc3322 : 0x22aa44, { roughness: 0.4 }));
    lamp.position.set(sx * 0.9, mastBase + 0.1, 0.6);
    group.add(lamp);
  }
  const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.4, 10), metal);
  spot.rotation.x = Math.PI / 2;
  spot.position.set(0, sheer(0.5) + houseH + wheelH * 0.5, 3.35);
  group.add(spot);

  // ---- railings along the foredeck ----
  // Stanchions and two runs of rail. Cheap, and it is the detail that says
  // "somebody walks about up here" rather than "this is a solid lump".
  const railTop = sheer(0.5) + 0.95;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const u = 0.62 + i * 0.075;
      const w = halfBeam(u) * BEAM * 0.5 - 0.35;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 5), metal);
      st.position.set(sx * w, railTop, (u - 0.5) * LEN);
      group.add(st);
    }
    for (const [h, r] of [[0.9, 0.05], [0.55, 0.04]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, LEN * 0.34), metal);
      const u = 0.745;
      rail.position.set(sx * (halfBeam(u) * BEAM * 0.5 - 0.35), railTop - h, (u - 0.5) * LEN);
      group.add(rail);
      void r;
    }
  }

  // ---- tyre fenders down both sides ----
  // Six big rubber tyres hung over the side. On a tug these are what you would
  // actually hit with something, and they break the sheer line nicely.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const u = 0.14 + i * 0.145;
      const w = halfBeam(u) * BEAM * 0.5;
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 6, 12), tyreMat);
      tyre.rotation.y = Math.PI / 2;
      tyre.position.set(sx * (w + 0.2), sheer(u) - 0.35, (u - 0.5) * LEN);
      tyre.castShadow = true;
      group.add(tyre);
    }
  }

  // ---- towing gear on the afterdeck ----
  // A winch drum, a hook, and a bollard. This is what she is FOR, and it is the
  // detail that says tug rather than cabin cruiser.
  const winchBase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.3), metal);
  winchBase.position.set(0, sheer(0.5) + 0.25, -5.6);
  group.add(winchBase);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10), mat(0x6a6257));
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, sheer(0.5) + 0.75, -5.6);
  group.add(drum);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 10, Math.PI * 1.4), metal);
  hook.position.set(0, sheer(0.5) + 0.95, -6.6);
  hook.rotation.set(0, Math.PI / 2, 0.6);
  group.add(hook);
  for (const sx of [-1, 1]) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8), metal);
    bollard.position.set(sx * 1.6, sheer(0.5) + 0.35, -6.4);
    group.add(bollard);
  }

  // ---- the name board ----
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.12), houseMat);
  board.position.set(0, sheer(0.86) - 0.1, LEN * 0.42);
  group.add(board);

  return group;
}

// The motion. Kept apart from the build so the level's update can call it
// without holding on to any of the boat's parts.
//
// Three heave rates, two tilts, all on different periods. The phases are baked
// in as offsets rather than being all zero, otherwise every axis would peak
// together once per cycle and the boat would visibly march rather than bob.
export function updateBoat(boat, t) {
  const heave = Math.sin(t * 0.85) * 0.16
    + Math.sin(t * 1.37 + 1.7) * 0.09
    + Math.sin(t * 2.31 + 4.1) * 0.04;
  boat.position.y = boat.userData.baseY + heave;
  boat.rotation.z = Math.sin(t * 0.61 + 2.2) * 0.055 + Math.sin(t * 1.13) * 0.025;
  boat.rotation.x = Math.cos(t * 0.74 + 0.9) * 0.045;
  // A very slow yaw, as if it is riding out a set of swell lines.
  boat.rotation.y = (boat.userData.yaw || 0) + Math.sin(t * 0.17) * 0.09;
  // The radar keeps turning, slowly, the way one does.
  if (boat.userData.scanner) boat.userData.scanner.rotation.y = t * 0.55;
}

// Where it sits: out in the trench past the drop-off, well beyond the rim the
// car is stopped by, and clear of the side cliffs. It is meant to be visible
// from the lip and impossible to reach.
//
// Yawed so you see her three-quarter on from the lip rather than end-on, which
// is the angle her length and her whole stack of deckhouse read from. At 15
// long she needs checking against the rim: half her length is 7.5, and sin of
// the yaw swings about 4.9 of that fore-and-aft, so she spans roughly z -73 to
// -83 - still five clear of the lip at -68.
export const BOAT_SPOT = { x: -17, z: -78, yaw: 0.7 };
export const BOAT_SIZE = { len: LEN, beam: BEAM };