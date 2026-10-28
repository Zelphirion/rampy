import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { onRoad } from './cityRoads.js';
import { addKnockable } from './physics.js?v=1800000000006';
import { CITY_HILLS, hillProfileAt } from './modules/cityHills.js?v=1793123233707';

// ============================================================================
// The outer belt: boundary wall, scenery, parking lots and the nature area
// ============================================================================
// The city grew to 4x its old area (see modules/world.js) but the original town
// and its railway ring stayed exactly where they were. Everything the player
// asked for OUTSIDE the tracks lives out here in the new belt:
//
//   * a solid brick wall closing the whole rectangle, so the map is finite and
//     you cannot drive off an edge;
//   * a few empty parking lots (tarmac + painted bays, no cars);
//   * a nature area: rolling hills and scattered trees, with the city park
//     (lawn, lake and playground) relocated into the belt beside it.
//
// The wall's colliders are pushed into the shared buildingColliders list, so the
// wall is an ordinary physics obstacle - you hit it exactly like a building and
// cannot pass. That is what makes "finite" real rather than cosmetic.
// ============================================================================

export const OUTER = {
  // The wall's INNER face lines up with the world bounds, so the clamped player
  // (worldXHi etc.) never ends up standing inside the bricks.
  innerX: 180,
  innerZlo: -180,
  innerZhi: 246,
  wallT: 3,
  wallH: 5.2,
  capH: 0.6,
};

// Rolling hills, placed clear of the roads, the lots, the park and the two
// feature sites relocated into the belt (the spaceport and the soccer field).
// The layout and the height profile live in modules/cityHills.js, because the
// ground under them is real: main.js rides it and the trees avoid it.
const HILLS = CITY_HILLS;

// Regions the nature pass must keep clear for things other modules drop in
// out here: the spaceport yard (SW belt), the soccer field (east belt), and the
// park. Exported so those builders can share the exact same rectangles.
export const RESERVED = [
  { id: 'spaceport', x0: -138, x1: -102, z0: -130, z1: -88 },
  { id: 'soccer', x0: 92, x1: 180, z0: 18, z1: 128 },
  { id: 'park', x0: -148, x1: -98, z0: 16, z1: 106 },
  // The city portal tree stands against the west wall inside the strip of land
  // the ring road's inward move opened up — keep the pine scatter off it.
  { id: 'portal-tree', x0: -180, x1: -164, z0: 48, z1: 72 },
];

// The museum's own plot: the massing, its roof garden, the forecourt of the
// grand stair and the strip of ground between it and the arterial. The pine
// scatter runs on an 18 m grid straight across this ground, so without the
// exclusion it grows trees up through the building - and through the middle of
// the new flight and its arrival.
const MUSEUM_SITE = { x0: -110, x1: -8, z0: 130, z1: 190 };

const brickMat = new THREE.MeshStandardMaterial({ color: 0x8a3b2e, roughness: 0.95 });
const capMat = new THREE.MeshStandardMaterial({ color: 0xb9b1a3, roughness: 0.9 });
const grassMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3f, roughness: 1 });
const hillMat = new THREE.MeshStandardMaterial({ color: 0x357038, roughness: 1 });
const barkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2b, roughness: 1 });
const crownMat = new THREE.MeshStandardMaterial({ color: 0x3f7d41, roughness: 0.9 });

// A brick wall segment with a pale concrete cap — the cap overhangs a little so
// the wall reads as built rather than as a naked box.
function wallSegment(scene, w, d, x, z, alongX) {
  const { wallH, capH } = OUTER;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), brickMat);
  body.position.set(x, wallH / 2, z);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  const capW = alongX ? w + 0.8 : w + 0.8;
  const capD = alongX ? d + 0.8 : d + 0.8;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(capW, capH, capD), capMat);
  cap.position.set(x, wallH + capH / 2, z);
  cap.castShadow = true;
  cap.receiveShadow = true;
  scene.add(cap);
}

function buildWall(scene, buildingColliders) {
  const { innerX, innerZlo, innerZhi, wallT, wallH } = OUTER;
  const cx = innerX + wallT / 2;                     // 181.5
  const southZ = innerZlo - wallT / 2;               // -181.5
  const northZ = innerZhi + wallT / 2;               // 247.5
  const midZ = (innerZlo + innerZhi) / 2;            // 33
  const spanX = innerX * 2 + wallT * 2;              // 366
  const spanZ = (innerZhi - innerZlo) + wallT * 2;   // 432

  // South / north run east-west along x.
  wallSegment(scene, spanX, wallT, 0, southZ, true);
  wallSegment(scene, spanX, wallT, 0, northZ, true);
  // West / east run north-south along z.
  wallSegment(scene, wallT, spanZ, -cx, midZ, false);
  wallSegment(scene, wallT, spanZ, cx, midZ, false);

  // Four ordinary box colliders. They overlap at the corners, which is fine.
  buildingColliders.push(
    { x: 0, z: southZ, halfW: spanX / 2, halfD: wallT / 2, h: wallH },
    { x: 0, z: northZ, halfW: spanX / 2, halfD: wallT / 2, h: wallH },
    { x: -cx, z: midZ, halfW: wallT / 2, halfD: spanZ / 2, h: wallH },
    { x: cx, z: midZ, halfW: wallT / 2, halfD: spanZ / 2, h: wallH },
  );
}

// Empty parking lots: tarmac with white bays painted across it, nothing parked.
// Declared x0..x1 / z0..z1 like the roads so they read the same way.
// (The east lot is gone: its tarmac sat right behind the soccer pitch's south
// goal, and the pitch took that ground to double in size.)
export const LOTS = [
  { id: 'lot-north', x0: -74, x1: -18, z0: 148, z1: 172 },
  { id: 'lot-south', x0: 20, x1: 78, z0: -122, z1: -98 },
];

const ROAD_Y = 0.13;

function parkingLot(scene, lot) {
  const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;

  const tarmac = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d),
    new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 1 }));
  tarmac.position.set(cx, ROAD_Y, cz);
  tarmac.receiveShadow = true;
  scene.add(tarmac);

  // Bays run off the LONG axis, spaced 5 apart with a small margin at each end.
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 1 });
  const alongX = w >= d;
  const run = alongX ? w : d;
  const cross = alongX ? d : w;
  const n = Math.max(2, Math.floor((run - 6) / 5));
  const step = (run - 6) / n;
  for (let i = 0; i <= n; i++) {
    const t = -run / 2 + 3 + i * step;
    const line = alongX
      ? new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, cross - 3), stripeMat)
      : new THREE.Mesh(new THREE.BoxGeometry(cross - 3, 0.02, 0.24), stripeMat);
    line.position.set(alongX ? cx + t : cx, ROAD_Y + 0.1, alongX ? cz : cz + t);
    scene.add(line);
  }
}

// The nature area: rolling hills and scattered trees.
//
// One hill, as a surface sampled from the SAME profile the car drives on (see
// modules/cityHills.js). A cone — which is what these used to be — has a razor
// apex and a hard lip at the foot, and no collision at all; this is a dome whose
// slope matches the height query exactly, so the mesh and the ground can never
// disagree about where the hill is.
function hillSurface(hill) {
  const RINGS = 12, SEGS = 40;
  const positions = [0, hill.h, 0];   // the crown
  for (let ring = 1; ring <= RINGS; ring++) {
    const d = (ring / RINGS) * hill.r;
    const y = hillProfileAt(hill, d);
    for (let s = 0; s < SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2;
      positions.push(Math.cos(a) * d, y, Math.sin(a) * d);
    }
  }
  const at = (ring, s) => 1 + (ring - 1) * SEGS + (s % SEGS);
  const indices = [];
  for (let s = 0; s < SEGS; s++) indices.push(0, at(1, s + 1), at(1, s));
  for (let ring = 1; ring < RINGS; ring++) {
    for (let s = 0; s < SEGS; s++) {
      indices.push(at(ring, s), at(ring, s + 1), at(ring + 1, s));
      indices.push(at(ring, s + 1), at(ring + 1, s + 1), at(ring + 1, s));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// The nature area: rolling hills and scattered trees.
function buildNature(scene) {
  // --- Hills ------------------------------------------------------------
  for (const h of HILLS) {
    const hill = new THREE.Mesh(hillSurface(h), hillMat);
    hill.name = 'cityHill';
    hill.position.set(h.x, 0, h.z);
    hill.castShadow = true;
    hill.receiveShadow = true;
    scene.add(hill);
  }

  // --- Trees ------------------------------------------------------------
  const inReserved = (x, z) => RESERVED.some((r) => x > r.x0 - 2 && x < r.x1 + 2 && z > r.z0 - 2 && z < r.z1 + 2);
  // Deterministic scatter (no Math.random) so the belt looks the same every
  // load. Trees only go in the outer belt, and never on a road, a parking lot,
  // a hill or on a reserved feature site.
  const inLot = (x, z) => LOTS.some((l) => x > l.x0 - 2 && x < l.x1 + 2 && z > l.z0 - 2 && z < l.z1 + 2);
  const nearHill = (x, z) => HILLS.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 3);
  const inMuseum = (x, z) => x > MUSEUM_SITE.x0 && x < MUSEUM_SITE.x1 && z > MUSEUM_SITE.z0 && z < MUSEUM_SITE.z1;

  for (let gx = -170; gx <= 170; gx += 18) {
    for (let gz = -170; gz <= 238; gz += 18) {
      // Only the belt outside the railway ring.
      if (Math.abs(gx) <= 102 && gz >= -100 && gz <= 138) continue;
      // Deterministic jitter so the rows do not read as a grid.
      const x = gx + Math.sin(gx * 0.7 + gz * 1.3) * 5;
      const z = gz + Math.cos(gx * 1.1 - gz * 0.6) * 5;
      if (Math.abs(x) > 178 || z < -178 || z > 244) continue;
      if (onRoad(x, z, 3) || inLot(x, z) || nearHill(x, z) || inReserved(x, z) || inMuseum(x, z)) continue;

      const group = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.8, 8), barkMat);
      trunk.position.y = 0.9;
      trunk.castShadow = true;
      group.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 8), crownMat);
      crown.position.y = 2.2;
      crown.castShadow = true;
      group.add(crown);
      group.position.set(x, 0, z);
      scene.add(group);
    }
  }
}

// Build the whole outer belt. `buildingColliders` receives the wall so the wall
// stops the car like any other solid.
export function addCityOuter(scene, buildingColliders) {
  const group = new THREE.Group();
  group.name = 'cityOuter';
  scene.add(group);

  buildWall(scene, buildingColliders);
  for (const lot of LOTS) parkingLot(scene, lot);
  buildNature(scene);
}

// ===== Art Museum =====
const museumTitanium = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.25 });
const museumSteel = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.65, roughness: 0.22 });
const museumGlass = new THREE.MeshStandardMaterial({ color: 0xd8eaff, metalness: 0.4, roughness: 0.12, transparent: true, opacity: 0.28 });

// ===== Exhibition posters =====
// The masts in front of the rear block carry the museum's posters. A banner is
// 9 x 14 m, so a flat tint reads as a painted wall; painted on a canvas instead
// - a Mondrian grid, concentric circles, paper cut-outs, a Bauhaus stripe, each
// with plain colour bands top and bottom - it reads as a real exhibition poster
// and gives the huge facade a colour accent at the same time. No lettering: the
// art carries the banner on its own.
// Built once and shared: the object browser rebuilds the museum on every visit.
const POSTER_W = 384, POSTER_H = 600, POSTER_ART = 482;
let posterMats = null;

function museumPosters() {
  if (posterMats) return posterMats;

  const make = (draw) => {
    const c = document.createElement('canvas');
    c.width = POSTER_W;
    c.height = POSTER_H;
    draw(c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.72, metalness: 0.05,
      // A little self-illumination keeps the art legible on the shaded side of
      // the building instead of turning into a black rectangle.
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22,
    });
  };

  // The same head and foot band on all four, so they hang as a set. The bands
  // are colour only: the art is the whole poster, with no lettering to date it
  // or to compete with the painting when seen from across the loop.
  const masthead = (g, bg) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, POSTER_W, 46);
  };
  const caption = (g, bg) => {
    g.fillStyle = bg;
    g.fillRect(0, POSTER_ART, POSTER_W, POSTER_H - POSTER_ART);
  };

  posterMats = [
    // --- 0. Mondrian: primaries held apart by black rules -------------------
    make((g) => {
      g.fillStyle = '#f2eee3';
      g.fillRect(0, 46, POSTER_W, POSTER_ART - 46);
      g.fillStyle = '#d62828'; g.fillRect(190, 62, 186, 190);
      g.fillStyle = '#1f5fa8'; g.fillRect(16, 260, 166, 96);
      g.fillStyle = '#f2c14e'; g.fillRect(190, 364, 186, 110);
      g.fillStyle = '#141414';
      const rule = (x, y, w, h) => g.fillRect(x, y, w, h);
      rule(0, 46, POSTER_W, 8);
      rule(0, 252, POSTER_W, 8);
      rule(0, 356, POSTER_W, 8);
      rule(0, 474, POSTER_W, 8);
      rule(0, 46, 8, POSTER_ART - 46);
      rule(182, 46, 8, POSTER_ART - 46);
      rule(376, 46, 8, POSTER_ART - 46);
      rule(100, 364, 6, 110);
      masthead(g, '#141414');
      caption(g, '#141414');
    }),

    // --- 1. Concentric circles and beams -----------------------------------
    make((g) => {
      g.fillStyle = '#16233f';
      g.fillRect(0, 46, POSTER_W, POSTER_ART - 46);
      g.strokeStyle = 'rgba(247,240,214,0.5)';
      g.lineWidth = 3;
      for (const [x0, y0, x1, y1] of [[0, 120, POSTER_W, 270], [54, 46, 214, POSTER_ART]]) {
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      const rings = (cx, cy, radii, cols) => {
        for (let i = 0; i < radii.length; i++) {
          g.beginPath();
          g.arc(cx, cy, radii[i], 0, Math.PI * 2);
          g.fillStyle = cols[i];
          g.fill();
        }
      };
      rings(116, 172, [94, 76, 58, 40, 21], ['#e4572e', '#f2c14e', '#f7f0d6', '#4dabf7', '#16233f']);
      rings(286, 304, [70, 54, 38, 22], ['#4dabf7', '#f7f0d6', '#e4572e', '#f2c14e']);
      rings(146, 420, [46, 34, 21], ['#f2c14e', '#16233f', '#e4572e']);
      g.fillStyle = '#f7f0d6';
      g.beginPath(); g.moveTo(232, 438); g.lineTo(266, 352); g.lineTo(300, 438); g.closePath(); g.fill();
      g.fillStyle = '#e4572e';
      g.beginPath(); g.moveTo(248, 428); g.lineTo(284, 428); g.lineTo(266, 382); g.closePath(); g.fill();
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#f7f0d6' : '#4dabf7';
        g.beginPath();
        g.arc(304 + (i % 4) * 21, 66 + Math.floor(i / 4) * 23, 4, 0, Math.PI * 2);
        g.fill();
      }
      masthead(g, '#16233f');
      caption(g, '#16233f');
    }),

    // --- 2. Matisse cut-outs: a paper garden -------------------------------
    make((g) => {
      g.fillStyle = '#f6ecd9';
      g.fillRect(0, 46, POSTER_W, POSTER_ART - 46);
      const petal = (cx, cy, rx, ry, rot, col) => {
        g.save();
        g.translate(cx, cy);
        g.rotate(rot);
        g.fillStyle = col;
        g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      };
      // The big coral flower.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        petal(128 + Math.cos(a) * 42, 236 + Math.sin(a) * 42, 27, 64, a + Math.PI / 2, '#ff6b5e');
      }
      petal(128, 236, 26, 26, 0, '#f6ecd9');
      // Teal sprig: three separate leaves rather than one blob.
      petal(296, 122, 14, 40, -0.5, '#2a9d8f');
      petal(330, 152, 14, 40, 0.5, '#2a9d8f');
      petal(266, 158, 14, 38, -1.35, '#2a9d8f');
      // Mustard star, built from triangles.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.save();
        g.translate(272, 350);
        g.rotate(a);
        g.fillStyle = i % 2 ? '#e9c46a' : '#264653';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-26, -66); g.lineTo(26, -66); g.closePath(); g.fill();
        g.restore();
      }
      // Blue blob and a black wandering line.
      g.fillStyle = '#264653';
      g.beginPath();
      g.moveTo(40, 400);
      g.bezierCurveTo(90, 340, 170, 470, 226, 402);
      g.bezierCurveTo(250, 372, 286, 410, 330, 392);
      g.lineTo(330, 470);
      g.lineTo(40, 470);
      g.closePath();
      g.fill();
      g.strokeStyle = '#1f4f4a';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(28, 340);
      g.bezierCurveTo(110, 300, 140, 396, 214, 330);
      g.stroke();
      masthead(g, '#f6ecd9');
      caption(g, '#1f4f4a');
    }),

    // --- 3. Bauhaus: diagonal bands and a hard circle ----------------------
    make((g) => {
      g.fillStyle = '#111111';
      g.fillRect(0, 46, POSTER_W, POSTER_ART - 46);
      g.save();
      g.translate(POSTER_W / 2, (46 + POSTER_ART) / 2);
      g.rotate(-0.5);
      for (const [col, y, h] of [
        ['#d62828', -300, 74], ['#f2c14e', -200, 58],
        ['#1f5fa8', -120, 92], ['#f7f0d6', 4, 46], ['#d62828', 86, 30],
      ]) {
        g.fillStyle = col;
        g.fillRect(-460, y, 920, h);
      }
      g.restore();
      g.fillStyle = '#f7f0d6';
      g.beginPath(); g.arc(192, 286, 104, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d62828';
      g.beginPath(); g.arc(192, 286, 104, -Math.PI / 2, Math.PI / 2); g.fill();
      g.fillStyle = '#111111';
      g.beginPath(); g.moveTo(192, 286); g.lineTo(192, 182); g.lineTo(296, 286); g.closePath(); g.fill();
      g.fillStyle = '#f2c14e';
      g.beginPath(); g.arc(192, 286, 22, 0, Math.PI * 2); g.fill();
      masthead(g, '#111111');
      caption(g, '#f7f0d6');
    }),
  ];
  return posterMats;
}

// Where the museum stands, and which way it looks. Everything in the builder is
// modelled in the building's own frame, addressing NORTH (that is where the
// grand approach and the roof garden are); the plot yaw turns the whole thing a
// quarter turn so it addresses EAST instead, and the stair comes down onto a
// paved forecourt that opens straight off the north-south arterial.
//
// The plot itself is the ground between the residential lane in the west, the
// railway's north straight below, the arterial on the east and the outer ring
// above; the museum fills it, and nothing runs underneath it any more.
export const MUSEUM = { x: -232, z: 112, yaw: Math.PI / 2 };

// The museum's own frame, the handful of numbers everything else is measured
// from: the massing is centred on local x = cx, the roof (and so the garden) sits
// at `roof`, and the grand flight climbs local z from `stair.z1` (the roof edge)
// out to `stair.z0` at the foot, across `stair.w` of local x, in `stair.steps`.
const MUSEUM_FRAME = {
  cx: -46,
  roof: 14,
  stair: { z0: 208, z1: 186, w: 20, steps: 30 },
};

// Building frame -> world, for the plot's yaw and offset. Props that have to
// stand in the world in their own right (anything the car can knock over) are
// placed with this.
function museumToWorld(x, z) {
  const c = Math.cos(MUSEUM.yaw), s = Math.sin(MUSEUM.yaw);
  return { x: MUSEUM.x + x * c + z * s, z: MUSEUM.z - x * s + z * c };
}

// The drive surface of that flight in world space, which is what main.js needs
// to pitch the car up the treads and knock it over each riser the way the
// underground staircase does. The museum addresses east, so the flight climbs
// west from the forecourt to the roof edge.
export const MUSEUM_STAIR = (() => {
  const { cx, roof, stair } = MUSEUM_FRAME;
  const foot = museumToWorld(cx, stair.z0);
  const head = museumToWorld(cx, stair.z1);
  return {
    x0: foot.x, z0: foot.z, x1: head.x, z1: head.z,
    halfW: stair.w / 2,
    y0: 0, y1: roof + 0.3,
    stepRise: (roof + 0.3) / stair.steps,
    stepDepth: Math.abs(stair.z1 - stair.z0) / stair.steps,
  };
})();

// The pavilion's double entrance doors, in world space. The doors face EAST off
// the roof garden; the car drives west through them. main.js uses this for the
// bump trigger and the scripted drive into the museum. The two distances that
// matter:
//   x      the door plane (where the leaves hang)
//   backX  the pavilion's back wall, where the scripted car stops
export const MUSEUM_DOOR = (() => {
  const { cx, roof, stair } = MUSEUM_FRAME;
  const PW = 9, PD = 18;
  const pz = stair.z1 - 15.5;
  const ex = PW / 2 - 0.06;
  const center = museumToWorld(cx, pz + ex + 0.12);
  const back = museumToWorld(cx, pz - PW / 2);
  return {
    x: center.x,
    z: center.z,
    y: roof + 0.08,
    z0: center.z - PD / 2,
    z1: center.z + PD / 2,
    backX: back.x,
    // A thin box around the door plane. The car's nose is 2.2 from its centre,
    // so the box starts just before the leaves would be touched.
    trigger: { x0: center.x - 2.5, x1: center.x + 2.6, z0: center.z - 4.2, z1: center.z + 4.2 },
  };
})();

// Where the car is put back down when it drives out of the museum: in the middle
// of the forecourt apron at the foot of the grand flight, facing east down the
// approach, so the player comes out of the building already at the bottom of the
// stairs. main.js fills in the ground height.
export const MUSEUM_EXIT_POSE = (() => {
  const { cx, stair } = MUSEUM_FRAME;
  const w = museumToWorld(cx, stair.z0 + 6);
  return { x: w.x, z: w.z, yaw: Math.PI };
})();

// A push-door leaf's angle for this frame. Opening tracks the car exactly (the
// nose is doing the pushing, so the leaf moves as fast as the car does); closing
// is deliberately slow, and never closes past what the car still needs while it
// is in the doorway, so the leaves drift shut behind it instead of slamming.
const DOOR_PUSH_TRACK = 30;    // per second: fast enough to stay with the nose
const DOOR_CLOSE_RATE = 1.2;   // rad/s: a full leaf takes about a second to shut
function pushDoorAngle(angle, target, delta) {
  const cur = Math.abs(angle);
  const want = Math.abs(target);
  const sign = Math.sign(angle) || Math.sign(target) || 1;
  const mag = cur < want
    ? cur + (want - cur) * Math.min(1, DOOR_PUSH_TRACK * delta)
    : Math.max(want, cur - DOOR_CLOSE_RATE * delta);
  return sign * mag;
}

// The pavilion's two door leaves, hung on push hinges so the car can butt them
// open like the bathroom door back at the house. They are built in the
// pavilion's own frame (`pv`), but their push is driven by WORLD x, because the
// door plane and the approach both run along the world x axis.
function buildMuseumDoors(pv, opts) {
  const { ex, base } = opts;
  const glassMat = opts.glassMat;
  const frameMat = opts.frameMat;
  const LEAF_W = 3.55;
  const LEAF_H = 4.4;
  const PANEL_T = 0.06;
  const leaves = [];

  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    const hingeZ = side * (LEAF_W + 0.075);
    hinge.position.set(ex + 0.12, base, hingeZ);
    pv.add(hinge);

    const childZ = -side * (LEAF_W / 2);
    const add = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      hinge.add(m);
      return m;
    };
    // The glazed panel, then its steel stiles and rails, then the pull.
    const glass = new THREE.Mesh(new THREE.BoxGeometry(PANEL_T, LEAF_H - 0.36, LEAF_W - 0.18), glassMat);
    glass.position.set(0, LEAF_H / 2, childZ);
    hinge.add(glass);
    add(0.16, LEAF_H, 0.16, 0, LEAF_H / 2, childZ - (LEAF_W / 2 - 0.08));
    add(0.16, LEAF_H, 0.16, 0, LEAF_H / 2, childZ + (LEAF_W / 2 - 0.08));
    add(0.16, 0.18, LEAF_W, 0, LEAF_H - 0.09, childZ);
    add(0.16, 0.18, LEAF_W, 0, 0.09, childZ);
    add(0.14, 0.12, LEAF_W - 0.2, 0, LEAF_H / 2, childZ);
    for (const hx of [-0.12, 0.12]) {
      add(0.1, 1.5, 0.09, hx, LEAF_H * 0.52, childZ - side * (LEAF_W / 2 - 0.42));
    }

    leaves.push({ hinge, side, angle: 0, swing: 0 });
  }

  // Push doors, not automatic ones: a leaf stays shut until the car's nose
  // reaches the leaf line, and from then on its angle is tied to how far the
  // nose has driven past that line — so it opens exactly as fast as the car is
  // moving, and falls shut gently once the tail is through.
  const HALF_LEN = opts.carHalfLength || 2.2;   // nose-to-centre
  const PUSH_DEPTH = HALF_LEN;
  const OPEN_ANGLE = 1.2;
  const update = (carPos, delta) => {
    const dx = carPos.x - MUSEUM_DOOR.x;
    const penetration = HALF_LEN - Math.abs(dx);   // <=0 until the nose touches
    const inBay = carPos.z > MUSEUM_DOOR.z0 + 1.5 && carPos.z < MUSEUM_DOOR.z1 - 1.5;
    const press = inBay && penetration > 0 ? Math.min(1, penetration / PUSH_DEPTH) : 0;
    for (const leaf of leaves) {
      let target = 0;
      if (press > 0.01) {
        // Away from the car: outside (east, dx>0) swings the leaf into the
        // pavilion; inside (dx<0) swings it back out to the garden. Latched
        // while open so it does not flip as the car passes through.
        if (leaf.swing === 0 || Math.abs(leaf.angle) < 0.04) leaf.swing = dx >= 0 ? 1 : -1;
        target = leaf.side * leaf.swing * OPEN_ANGLE * press;
      } else if (Math.abs(leaf.angle) < 0.04) {
        leaf.swing = 0;
      }
      leaf.angle = pushDoorAngle(leaf.angle, target, delta);
      leaf.hinge.rotation.y = leaf.angle;
    }
  };

  return { update };
}

export function buildGehryMuseum(buildingColliders = []) {
  const group = new THREE.Group();
  group.name = 'artMuseum';
  // The architecture is built in the building's own frame inside `building`,
  // which carries the plot's turn and offset; the group we return stays at the
  // world origin with no transform of its own. That matters for the potted
  // plants: knock-over physics moves a prop inside its PARENT's space, so a
  // prop parented to the turned group would fall in the wrong direction.
  const building = new THREE.Group();
  building.rotation.y = MUSEUM.yaw;
  building.position.set(MUSEUM.x, 0, MUSEUM.z);
  group.add(building);
  const cx = MUSEUM_FRAME.cx;  const ROOF = MUSEUM_FRAME.roof, MID = 7;
  // Colliders are collected in the building's own frame and carried into world
  // space at the bottom, by the same yaw and offset the group gets.
  const colliders = [];

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8f8c85, roughness: 0.92 });
  const skinEdgeMat = new THREE.MeshStandardMaterial({ color: 0x77828c, metalness: 0.92, roughness: 0.24 });
  const warmMat = new THREE.MeshStandardMaterial({ color: 0xffd9ac, emissive: 0xffa650, emissiveIntensity: 1.2, roughness: 0.3 });
  const warmLight = new THREE.PointLight(0xffb060, 1.4, 30);
  const gravelMat = new THREE.MeshStandardMaterial({ color: 0x9a9488, roughness: 1.0 });
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2f6f3a, roughness: 0.95 });
  const clayMat = new THREE.MeshStandardMaterial({ color: 0xb87a4a, roughness: 0.9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa89f94, roughness: 0.88 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.7, roughness: 0.28 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x0f1216, metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.6 });

  // --- Facade dressing -----------------------------------------------------
  // The building itself is a pile of very large boxes: from the road there was
  // nothing at eye level to read the size against, so a 16 m wall and a 28 m
  // wall looked the same. Everything below exists to put a human-scale datum
  // on every exposed face - a 4.2 m door, 3.5 m gallery windows, a 1 m plinth
  // course, 1-2 m shrubs. Those are what make the masses read as monumental.
  const glassLitMat = new THREE.MeshStandardMaterial({
    color: 0x233039, metalness: 0.4, roughness: 0.14,
    emissive: 0xffb469, emissiveIntensity: 0.6,
  });
  const glassCoolMat = new THREE.MeshStandardMaterial({
    color: 0x18242e, metalness: 0.55, roughness: 0.12,
    emissive: 0x1f4c72, emissiveIntensity: 0.18,
  });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x6b675f, roughness: 0.92 });
  const forecourtMat = new THREE.MeshStandardMaterial({ color: 0x7d7972, roughness: 0.95 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2b1f, roughness: 1 });
  const bushMats = [
    hedgeMat,
    new THREE.MeshStandardMaterial({ color: 0x3d8749, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x24552c, roughness: 0.95 }),
  ];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 });
  // Leaf tones for the potted plants, shared with the hedge planting.
  const leafMats = [hedgeMat, bushMats[1], bushMats[2]];

  function mass(px, pz, w, d, h, ry, rz) {
    const g = new THREE.Group();
    const lower = new THREE.Group();
    lower.position.y = h * 0.31;
    lower.rotation.set(0, ry, rz || 0);
    g.add(lower);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.62, d), museumTitanium);
    shell.castShadow = true;
    shell.receiveShadow = true;
    lower.add(shell);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, h * 0.62, d * 0.92), museumSteel);
    upper.position.y = h * 0.69;
    upper.position.x = Math.sin(ry) * w * 0.08;
    upper.position.z = Math.cos(ry) * d * 0.06;
    upper.rotation.y = ry * 0.8;
    upper.rotation.z = (rz || 0) * -0.6;
    upper.castShadow = true;
    upper.receiveShadow = true;
    g.add(upper);
    // The upper shell is a separate, leaning box, so its windows need a frame
    // with the SAME transform rather than the lower shell's. An empty group
    // parented to the mesh gives faceBox a local origin at the shell's centre;
    // panes added to it ride the upper box's yaw and tilt exactly.
    const upperFrame = new THREE.Group();
    upper.add(upperFrame);
    g.position.set(px + cx, 0, pz);
    building.add(g);
    // `lower` is the frame every facade detail is placed in: it carries exactly
    // the same transform as the lower shell, so a window put on "the south
    // face" stays on the wall through the mass's lean and yaw. `upper` is the
    // matching frame for the cantilevered box that sits on top of it.
    return {
      x: px + cx, z: pz, w, d, h, ry, rz: rz || 0, baseY: h * 0.31, lower,
      upper: { w: w * 0.82, d: d * 0.92, h: h * 0.62, baseY: 0, lower: upperFrame },
    };
  }
  const mA = mass(0, 150, 44, 30, 16, 0.08, 0.05);
  const mB = mass(10, 142, 28, 22, 20, 0.24, 0.08);
  const mC = mass(-12, 156, 26, 18, 24, -0.16, -0.04);
  const mD = mass(4, 160, 18, 14, 28, 0.42, 0.1);

  const rear = new THREE.Mesh(new THREE.BoxGeometry(40, ROOF, 20), museumTitanium);
  rear.position.set(cx, ROOF / 2, 176);
  rear.castShadow = true;
  rear.receiveShadow = true;
  building.add(rear);

  // The rear block is an ordinary box, but it needs the same facade frame so
  // the window rows can run across its north and east walls too.
  const mR = { w: 40, d: 20, h: ROOF, ry: 0, rz: 0, baseY: ROOF / 2, lower: new THREE.Group() };
  mR.lower.position.set(cx, ROOF / 2, 176);
  building.add(mR.lower);

  // A box standing on one face of a mass. `side` names the face; `a` is the
  // offset ALONG it (local x for the north/south walls, local z for east/west);
  // `y` is height above the ground, `proud` how far it stands off the wall.
  function faceBox(m, side, a, y, along, h, depth, mat, proud = 0) {
    const alongX = side === 'north' || side === 'south';
    const s = side === 'south' || side === 'west' ? -1 : 1;
    const out = s * ((alongX ? m.d : m.w) / 2 + proud + depth / 2);
    const mesh = new THREE.Mesh(
      alongX ? new THREE.BoxGeometry(along, h, depth) : new THREE.BoxGeometry(depth, h, along),
      mat,
    );
    mesh.position.set(alongX ? a : out, y - m.baseY, alongX ? out : a);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    m.lower.add(mesh);
    return mesh;
  }

  // Same as faceBox, for anything that is not a box (bushes, trees, lights).
  function facePlace(m, side, a, y, out, obj) {
    const alongX = side === 'north' || side === 'south';
    const s = side === 'south' || side === 'west' ? -1 : 1;
    const face = (alongX ? m.d : m.w) / 2;
    obj.position.set(
      alongX ? a : s * (face + out),
      y - m.baseY,
      alongX ? s * (face + out) : a,
    );
    m.lower.add(obj);
    return obj;
  }

  // Two rows of windows on one span of wall: tall gallery glazing at eye level
  // and a shorter clerestory above it, with continuous stone courses top and
  // bottom. The courses run the whole span so the bays read as one facade.
  function windowRun(m, side, a0, a1, opts = {}) {
    const len = a1 - a0;
    if (len < 3) return;
    const gaps = opts.gaps || [];
    const n = Math.max(1, Math.round(len / (opts.pitch || 4.8)));
    const pitch = len / n;
    const winW = Math.min(opts.winW || 2.6, pitch - 1.6);
    const mid = (a0 + a1) / 2;

    // Base course, floor line and parapet band.
    faceBox(m, side, mid, 0.45, len, 0.9, 0.36, plinthMat);
    faceBox(m, side, mid, 5.35, len, 0.42, 0.3, plinthMat);
    faceBox(m, side, mid, 8.95, len, 0.4, 0.3, plinthMat);

    for (let i = 0; i < n; i++) {
      const a = a0 + pitch * (i + 0.5);
      if (gaps.some(([g0, g1]) => a > g0 - 1.2 && a < g1 + 1.2)) continue;

      // Gallery window: frame, lit glass, a centre mullion and a stone sill.
      // The glass stands PROUD of the frame (0.12 vs 0..0.1) - the frame is a
      // solid box, so anything set inside its depth is simply hidden by it.
      faceBox(m, side, a, 3.15, winW + 0.34, 3.84, 0.12, frameMat, 0);
      faceBox(m, side, a, 3.15, winW, 3.5, 0.06, glassLitMat, 0.12);
      faceBox(m, side, a, 3.15, 0.1, 3.5, 0.08, frameMat, 0.17);
      faceBox(m, side, a, 1.32, winW + 0.62, 0.18, 0.42, stoneMat);

      // Clerestory: smaller, cooler panes, one per bay.
      faceBox(m, side, a, 7.5, 2.2, 2.4, 0.12, frameMat, 0);
      faceBox(m, side, a, 7.5, 1.9, 2.1, 0.06, glassCoolMat, 0.12);
    }
  }

  // One horizontal row of glazing on a face, at height `y`. This is windowRun's
  // window unit without the courses, for walls that already have their floor
  // lines: the cantilevered upper shells and the rear block's top storey.
  function paneRun(m, side, a0, a1, y, opts = {}) {
    const len = a1 - a0;
    if (len < 3) return;
    const gaps = opts.gaps || [];
    const n = Math.max(1, Math.round(len / (opts.pitch || 4.4)));
    const pitch = len / n;
    const winW = Math.min(opts.winW || 2.6, pitch - 1.6);
    const winH = opts.winH || 3.2;
    const glass = opts.glass || glassLitMat;
    for (let i = 0; i < n; i++) {
      const a = a0 + pitch * (i + 0.5);
      if (gaps.some(([g0, g1]) => a > g0 - 1.2 && a < g1 + 1.2)) continue;
      faceBox(m, side, a, y, winW + 0.34, winH + 0.34, 0.12, frameMat, 0);
      faceBox(m, side, a, y, winW, winH, 0.06, glass, 0.12);
      faceBox(m, side, a, y, 0.1, winH, 0.08, frameMat, 0.17);
      faceBox(m, side, a, y - winH / 2 - 0.14, winW + 0.62, 0.18, 0.42, stoneMat);
    }
  }

  // Windows around one cantilevered upper shell. `m` is the shell's own frame
  // (see mass), so the panes follow its yaw and lean. The rows sit in the part
  // of the upper box that clears the lower shell's roofline: everything below
  // that is tucked inside the wider box underneath and would be invisible.
  function upperWindows(m) {
    const uh = m.h;
    const rows = uh >= 13.5 ? 2 : 1;
    const lo = -uh * 0.09;
    const hi = uh * 0.45;
    const ys = rows === 1
      ? [(lo + hi) / 2]
      : [lo + (hi - lo) * 0.3, lo + (hi - lo) * 0.72];
    const wInset = Math.min(1.2, m.w * 0.12);
    const dInset = Math.min(1.2, m.d * 0.12);
    for (const y of ys) {
      for (const side of ['north', 'south']) {
        paneRun(m, side, -m.w / 2 + wInset, m.w / 2 - wInset, y,
          { pitch: 4.4, winW: 2.4, winH: 2.6, glass: glassCoolMat });
      }
      for (const side of ['east', 'west']) {
        paneRun(m, side, -m.d / 2 + dInset, m.d / 2 - dInset, y,
          { pitch: 4.4, winW: 2.4, winH: 2.6, glass: glassCoolMat });
      }
    }
  }

  // A planted bed along the foot of a wall: stone curb, soil, then a mixed row
  // of clipped hedges, round bushes and small conifers. The variation is
  // deterministic so the planting looks the same on every load.
  function plantBed(m, side, a0, a1, opts = {}) {
    const len = a1 - a0;
    if (len < 2.5) return;
    const gaps = opts.gaps || [];
    const depth = opts.depth || 1.7;
    const mid = (a0 + a1) / 2;
    faceBox(m, side, mid, 0.13, len, 0.26, depth, stoneMat, 0.08);
    faceBox(m, side, mid, 0.29, len - 0.4, 0.18, depth - 0.46, soilMat, 0.32);
    // A low continuous hedge along the back of the bed, so the gaps between
    // the bigger plants read as planting rather than bare soil.
    faceBox(m, side, mid, 0.72, len - 0.5, 0.68, Math.min(0.62, depth * 0.4), bushMats[2], 0.42);

    const n = Math.max(1, Math.floor(len / (opts.step || 1.9)));
    const pitch = len / n;
    for (let i = 0; i < n; i++) {
      const a = a0 + pitch * (i + 0.5);
      if (gaps.some(([g0, g1]) => a > g0 - 1.1 && a < g1 + 1.1)) continue;
      const kind = (i * 5 + Math.round(a0 * 2)) % 3;
      const mat = bushMats[(i + Math.abs(Math.round(a0))) % bushMats.length];
      const out = 0.32 + depth * 0.5;
      let b;
      if (kind === 0) {
        // Clipped hedge block.
        b = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 0.9), mat);
        facePlace(m, side, a, 0.69, out, b);
      } else if (kind === 1) {
        // Round bush.
        b = new THREE.Mesh(new THREE.SphereGeometry(0.58, 10, 8), mat);
        b.scale.set(1.15, 0.92, 1.15);
        facePlace(m, side, a, 0.86, out, b);
      } else {
        // Small conifer, a little taller than the rest.
        b = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.25, 8), mat);
        facePlace(m, side, a, 1.0, out, b);
      }
      b.castShadow = true;
      b.receiveShadow = true;
    }
  }

  // --- Where the detail goes ----------------------------------------------
  // Only the faces that are actually outside the massing get windows. The
  // south wall of the front block is the one you see coming up the loop; the
  // west walls face the west arm of the loop; the rear block's north and east
  // walls are the ones visible from the north and east arms.
  //
  // There is no door at street level: the museum is entered from the roof
  // garden (see "The grand approach" below), so every ground-level wall runs
  // windows and planting straight through instead of breaking for a threshold.
  windowRun(mB, 'south', -13.2, 13.2, { pitch: 4.4 });
  plantBed(mB, 'south', -13.2, 13.2);

  // East wall of the front block faces the east arm of the loop.
  windowRun(mB, 'east', -10.2, 10.2, { pitch: 4.4 });
  plantBed(mB, 'east', -10.2, 10.2, { depth: 1.2 });

  // West block (mC): the west wall, unbroken now that its side door is gone.
  windowRun(mC, 'west', -8.2, 8.2, { pitch: 4.2 });
  plantBed(mC, 'west', -8.2, 8.2, { depth: 1.5 });

  // South wall of the west block's neighbour (mA), west of the front block.
  windowRun(mA, 'south', -21, -5.2, { pitch: 4.4 });
  plantBed(mA, 'south', -21, -5.2);
  // ... and the two side walls of that block that are not covered by mC / mB.
  windowRun(mA, 'west', -14.2, -3.6, { pitch: 4.2 });
  plantBed(mA, 'west', -14.2, -3.6, { depth: 1.4 });
  windowRun(mA, 'east', 3.4, 14.2, { pitch: 4.2 });
  plantBed(mA, 'east', 3.4, 14.2, { depth: 1.2 });

  // Upper levels: the cantilevered boxes stacked on the masses are the biggest
  // blank surfaces left on the building. A row of cool glazing (two on the tall
  // shells) on every face turns them into upper galleries without touching the
  // two-storey runs below.
  upperWindows(mA.upper);
  upperWindows(mB.upper);
  upperWindows(mC.upper);
  upperWindows(mD.upper);

  // Rear block: the north wall faces the new grand approach, and the east wall
  // is the one the east arm drives past. The north wall's glazing stops short of
  // the stair (its cheeks pass at x -57 and -35), because everything between
  // them is the flight itself.
  windowRun(mR, 'north', -19, -11, { pitch: 4.6 });
  plantBed(mR, 'north', -19, -11);
  windowRun(mR, 'east', -9.4, 9.4, { pitch: 4.4 });
  plantBed(mR, 'east', -9.4, 9.4, { depth: 1.2 });
  // The rear block is 14 m tall, so a third storey sits above the parapet band
  // to keep its whole height working from the north and east arms.
  paneRun(mR, 'north', -19, -11, 11.4, { pitch: 4.6, winW: 2.2, winH: 2.4 });
  paneRun(mR, 'east', -9.4, 9.4, 11.4, { pitch: 4.4, winW: 2.2, winH: 2.4 });

  // The massing as solid boxes for the car, one per mass rather than a couple of
  // coarse slabs over the lot: the coarse pair used to stand a good 7 m proud of
  // the south wall, which is fine while the building is the only thing out here
  // and not fine now that a road runs past its foot. Every box reports the ROOF
  // height, not the mass's own: the roof is driven at ROOF + 0.3, and a taller
  // collider would yank a car on the roof up onto its top.
  for (const m of [mA, mB, mC, mD]) {
    colliders.push({ x: m.x, z: m.z, halfW: m.w / 2, halfD: m.d / 2, h: ROOF });
  }
  colliders.push({ x: cx, z: 176, halfW: 20, halfD: 10, h: ROOF });

  warmLight.position.set(cx, 4.2, 214);      // over the forecourt, at the foot of the flight
  building.add(warmLight);

  const terrace = new THREE.Mesh(new THREE.BoxGeometry(32, MID, 10), concreteMat);
  terrace.position.set(cx, MID / 2, 144);
  terrace.castShadow = true;
  terrace.receiveShadow = true;
  building.add(terrace);
  colliders.push({ x: cx, z: 144, halfW: 16, halfD: 5, h: MID, soft: true });

  // --- The grand approach -------------------------------------------------
  // The museum has no door at street level any more. The whole arrival is
  // outdoors: a paved forecourt, then a 20 m wide flight climbing the east face
  // to the roof, and the entrance up there at the head of the flight.
  //
  // The flight is 30 shallow steps over 22 m, so the climb is 33 degrees - steep
  // for a footpath and exactly right for a car. Each step is a solid monolith
  // from the ground up (so the flight reads as one mass from the side) and each
  // carries a `soft` collider. Soft colliders never block driving (main.js's
  // isPositionBlocked skips them); they only report their top as a surface, so
  // buildingTopAt snaps the car up one tread at a time instead of stopping it.
  const STAIR = { x: cx, ...MUSEUM_FRAME.stair, top: ROOF + 0.3 };
  const stepD = (STAIR.z0 - STAIR.z1) / STAIR.steps;
  const stepRise = STAIR.top / STAIR.steps;

  for (let i = 0; i < STAIR.steps; i++) {
    const top = stepRise * (i + 1);
    const zc = STAIR.z0 - stepD * (i + 0.5);
    const tread = new THREE.Mesh(new THREE.BoxGeometry(STAIR.w, top, stepD + 0.02), stoneMat);
    tread.position.set(STAIR.x, top / 2, zc);
    tread.castShadow = true;
    tread.receiveShadow = true;
    building.add(tread);
    colliders.push({
      x: STAIR.x, z: zc, halfW: STAIR.w / 2, halfD: stepD / 2 + 0.05, h: top - 0.3, soft: true,
    });
  }

  // Balustrade cheeks either side of the flight, stepped with the climb in runs
  // of five treads. `noRoof` because they are barriers, not surfaces: without it
  // the top of the wall would report as a rooftop and the car could drive up
  // and off the outer edge.
  const CHEEK_RUN = 5;
  const CHEEK_H = 1.15;
  for (const sgn of [-1, 1]) {
    const wx = STAIR.x + sgn * (STAIR.w / 2 + 0.45);
    for (let i = 0; i < STAIR.steps; i += CHEEK_RUN) {
      const n = Math.min(CHEEK_RUN, STAIR.steps - i);
      const h = stepRise * (i + n) + CHEEK_H;
      const runLen = stepD * n;
      const zc = STAIR.z0 - stepD * (i + n / 2);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, runLen + 0.02), plinthMat);
      wall.position.set(wx, h / 2, zc);
      wall.castShadow = true;
      wall.receiveShadow = true;
      building.add(wall);
      colliders.push({ x: wx, z: zc, halfW: 0.45, halfD: runLen / 2, h, noRoof: true });

      // One lamp standard per run, standing on the cheek: at night the flight
      // reads as a lit processional way rather than a dark ramp.
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.7, 8), frameMat);
      pole.position.set(wx, h + 1.35, zc);
      pole.castShadow = true;
      building.add(pole);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), warmMat);
      globe.position.set(wx, h + 2.82, zc);
      building.add(globe);
    }
  }

  // The forecourt at the foot of the flight: a paved apron laid over the head of
  // the approach road, with the benches and lamp standards that used to stand
  // outside the (now removed) ground doors. Its top sits at the road's drive
  // height, so the tarmac, kerbs and markings it covers are hidden under it and
  // the car rolls off the road straight onto the paving.
  const PLAZA_TOP = 0.3;
  {
    const plazaZ = STAIR.z0 + 6;      // paving runs z 208..220
    const pla = new THREE.Mesh(new THREE.BoxGeometry(28, 0.36, 12), forecourtMat);
    pla.position.set(STAIR.x, PLAZA_TOP - 0.18, plazaZ);
    pla.receiveShadow = true;
    building.add(pla);
    // A darker kerb round the paving, so the plaza has an edge instead of
    // fading into the grass. Its top sits a couple of centimetres BELOW the
    // paving: when both tops were at PLAZA_TOP the two coplanar faces stripped
    // against each other along the whole apron.
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(28.8, 0.38, 12.8), plinthMat);
    kerb.position.set(STAIR.x, PLAZA_TOP - 0.21, plazaZ);
    kerb.receiveShadow = true;
    building.add(kerb);
    // Paving joints: roughly 3.5 m slabs, the cheapest honest scale cue there is.
    for (let i = 1; i < 8; i++) {
      const joint = new THREE.Mesh(new THREE.BoxGeometry(28, 0.02, 0.07), plinthMat);
      joint.position.set(STAIR.x, PLAZA_TOP + 0.012, plazaZ - 6 + i * (12 / 8));
      building.add(joint);
    }
    for (let i = 1; i < 4; i++) {
      const joint = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 12), plinthMat);
      joint.position.set(STAIR.x - 14 + i * (28 / 4), PLAZA_TOP + 0.012, plazaZ);
      building.add(joint);
    }
    // Benches and lamps face the flight, so the last thing between the car and
    // the stairs is a row of seats and light.
    const y = (h) => PLAZA_TOP - 0.14 + h;    // furniture still stands ON the apron
    for (const bx of [-8, 8]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.62), stoneMat);
      seat.position.set(STAIR.x + bx, y(0.52), plazaZ + 4.4);
      seat.rotation.y = Math.PI / 2;
      seat.castShadow = true;
      seat.receiveShadow = true;
      building.add(seat);
      for (const lx of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.5), stoneMat);
        leg.position.set(STAIR.x + bx, y(0.33), plazaZ + 4.4 + lx);
        leg.castShadow = true;
        building.add(leg);
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.4, 8), frameMat);
      pole.position.set(STAIR.x + bx * 1.5, y(1.84), plazaZ + 4.4);
      pole.castShadow = true;
      building.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), warmMat);
      lamp.position.set(STAIR.x + bx * 1.5, y(3.64), plazaZ + 4.4);
      building.add(lamp);
    }
  }

  // Planter trees flank the flight: the tallest thing at eye level in the
  // forecourt, and the clearest datum for how tall the stair really is. They
  // stand off the apron so a car pulling up to the treads never has to squeeze
  // between them.
  for (const sgn of [-1, 1]) {
    const w = museumToWorld(STAIR.x + sgn * 13.6, STAIR.z0 - 3);
    planterTree(w.x, w.z, 0);
  }

  // --- Potted plants ------------------------------------------------------
  // The pots are props, not scenery: each is built in world space with its
  // origin at the pot's foot (so it tips about its base) and registered as
  // knockable, which is why the returned group has no transform of its own.
  // Three kinds: a clipped box ball, a small conifer, and the big planter trees
  // that flank the flight.
  // Pot: tapered body, a proud rim and the soil disc recessed in the top, so it
  // reads as terracotta rather than a bucket.
  function potOf(g, topR, botR, h) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, h, 14), clayMat);
    body.position.y = h / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(topR + 0.05, topR + 0.01, h * 0.16, 14), clayMat);
    rim.position.y = h - h * 0.08;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(topR * 0.9, topR * 0.9, h * 0.1, 14), soilMat);
    soil.position.y = h - h * 0.12;
    for (const m of [body, rim, soil]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    return h;
  }

  function pottedPlant(wx, wz, wy, kind, size = 1) {
    const g = new THREE.Group();
    g.position.set(wx, wy, wz);
    const topR = 0.34 * size, botR = 0.24 * size, potH = 0.52 * size;
    potOf(g, topR, botR, potH);

    const stemH = 0.34 * size;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * size, 0.07 * size, stemH, 7), trunkMat);
    stem.position.y = potH + stemH / 2 - 0.04 * size;
    stem.castShadow = true;
    g.add(stem);

    const baseY = potH + stemH - 0.06 * size;
    if (kind === 'conifer') {
      // Three cones of shrinking radius, alternating tones, so it reads as a
      // clipped little fir instead of a party hat.
      for (let i = 0; i < 3; i++) {
        const r = (0.34 - i * 0.085) * size;
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, 0.46 * size, 9), leafMats[i % 2 ? 2 : 0]);
        c.position.y = baseY + i * 0.3 * size + 0.14 * size;
        c.castShadow = true;
        g.add(c);
      }
    } else {
      // Box ball: a rounded mass of overlapping leaf blobs with a few berries.
      const blobs = [
        [0, 0.3, 0, 0.3], [0.17, 0.16, 0.09, 0.21], [-0.15, 0.2, -0.08, 0.23],
        [0.02, 0.1, -0.18, 0.19], [-0.05, 0.34, 0.14, 0.17],
      ];
      for (let i = 0; i < blobs.length; i++) {
        const [bx, by, bz, r] = blobs[i];
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r * size, 0), leafMats[i % 2 ? 1 : 0]);
        leaf.position.set(bx * size, baseY + by * size, bz * size);
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        g.add(leaf);
      }
      for (const [bx, by, bz] of [[0.18, 0.34, 0.14], [-0.2, 0.26, 0.12], [0.06, 0.2, -0.24]]) {
        const berry = new THREE.Mesh(new THREE.SphereGeometry(0.035 * size, 6, 5), warmMat);
        berry.position.set(bx * size, baseY + by * size, bz * size);
        g.add(berry);
      }
    }
    group.add(g);
    addKnockable(g, 0.42 * size, { fallTime: 0.34, slideDistance: 0.9, shovePower: 7, shoveSpinPower: 2 });
    return g;
  }

  // The big stone planter trees that flank the foot of the flight.
  function planterTree(wx, wz, wy) {
    const g = new THREE.Group();
    g.position.set(wx, wy, wz);
    const trough = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.86, 1.7), stoneMat);
    trough.position.y = 0.43;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.14, 1.88), stoneMat);
    lip.position.y = 0.86;
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 1.5), soilMat);
    soil.position.y = 0.92;
    trough.castShadow = true;
    trough.receiveShadow = true;
    lip.castShadow = true;
    g.add(trough, lip, soil);

    const trunkH = 1.85;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, trunkH, 8), trunkMat);
    trunk.position.y = 0.92 + trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const r = 0.92 - i * 0.16;
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, 1.15, 9), leafMats[i % 2 ? 2 : 0]);
      c.position.y = 0.92 + trunkH + i * 0.55;
      c.castShadow = true;
      c.receiveShadow = true;
      g.add(c);
    }
    group.add(g);
    addKnockable(g, 1.0, { fallTime: 0.55, slideDistance: 1.3, shovePower: 8, shoveSpinPower: 1.6 });
    return g;
  }

  // Two masts carry the exhibition posters. Each poster hangs between a top and
  // a bottom arm, and each mast shows a different design on each face, so the
  // banners read as a programme rather than as four coloured rectangles.
  const posters = museumPosters();
  const masts = [
    // The masts stand just clear of the rear block's end walls, with the banner
    // hung flat along the wall so it can be read from each arm of the loop.
    // West mast: circles face the west loop, cut-outs face inwards.
    { x: cx - 21, z: 171, west: 1, east: 2 },
    // East mast: Bauhaus faces the east loop, the grid faces inwards.
    { x: cx + 21, z: 171, west: 0, east: 3 },
  ];
  for (const mast of masts) {
    const sx = mast.x, sz = mast.z;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 19.4, 10), frameMat);
    pole.position.set(sx, 9.7, sz);
    pole.castShadow = true;
    building.add(pole);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.68, 0.5, 12), stoneMat);
    foot.position.set(sx, 0.25, sz);
    foot.castShadow = true;
    building.add(foot);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), museumSteel);
    finial.position.set(sx, 19.55, sz);
    building.add(finial);

    for (const y of [18.75, 4.45]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 9.6, 8), frameMat);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(sx, y, sz);
      arm.castShadow = true;
      building.add(arm);
    }

    // One plane each way. FrontSide means a plane is invisible from behind, so
    // the two never fight: from the west you see the -X face, from the east the
    // +X one, and neither is mirrored. Each face sits just outside the mast
    // line, so neither is buried in the wall behind it.
    const faces = [
      { dx: -0.09, ry: -Math.PI / 2, mat: posters[mast.west] },
      { dx: 0.09, ry: Math.PI / 2, mat: posters[mast.east] },
    ];
    for (const f of faces) {
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(9, 14), f.mat);
      poster.position.set(sx + f.dx, 11.6, sz);
      poster.rotation.y = f.ry;
      building.add(poster);
    }
  }

  // --- The roof garden: the museum's entrance level -----------------------
  // The garden block's roof IS the front door level now. The order of the
  // arrival is the point: up the flight, across the planted court, and only
  // then in through the doors, which stand at the far side of the roof.
  const gardenX = cx;
  const gardenZ = STAIR.z1 - 5.5;          // band centre: 11 m of court, stair head to doors
  const garden = new THREE.Group();
  garden.position.set(gardenX, ROOF + 0.08, gardenZ);
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(36, 11), gravelMat);
  gravel.rotation.x = -Math.PI / 2;
  gravel.receiveShadow = true;
  garden.add(gravel);
  // Planting runs down both flanks of the court, keeping the 20 m the flight
  // arrives on clear so the drive across to the doors is unobstructed: a clipped
  // hedge along the outer edge, then two rows of pots a side, with the figures
  // and benches set between the rows. The bands are spaced so nothing
  // interpenetrates - hedge 16.4..18, pots at 11.6 and 14.4, figures at 13.0.
  for (const sgn of [-1, 1]) {
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 9.2), hedgeMat);
    hedge.position.set(sgn * 17.2, 0.35, 0);
    hedge.castShadow = true;
    garden.add(hedge);
  }
  for (const sgn of [-1, 1]) {
    for (const rowX of [11.6, 14.4]) {
      for (let i = 0; i < 5; i++) {
        const w = museumToWorld(gardenX + sgn * rowX, gardenZ + (-4.8 + i * 2.4));
        const conifer = (i + (rowX > 13 ? 1 : 0)) % 2 === 0;
        const size = 0.88 + ((i + (rowX > 13 ? 1 : 0)) % 3) * 0.06;
        pottedPlant(w.x, w.z, ROOF + 0.08, conifer ? 'conifer' : 'bush', size);
      }
    }
  }
  function smallStatue(x, z, rot) {
    const s = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.2, 14), stoneMat);
    base.position.y = 0.1;
    s.add(base);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.58, 12), stoneMat);
    body.position.y = 0.49;
    s.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), stoneMat);
    head.position.y = 0.88;
    s.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 12), museumSteel);
    hat.position.y = 1.08;
    hat.rotation.z = 0.36;
    s.add(hat);
    s.position.set(x, 0, z);
    s.rotation.y = rot;
    s.castShadow = true;
    garden.add(s);
    colliders.push({ x: gardenX + x, z: gardenZ + z, halfW: 0.4, halfD: 0.4, h: 1.1 });
  }
  smallStatue(13.0, 1.2, 0.7);
  smallStatue(-13.0, -1.2, -0.9);
  smallStatue(13.0, -1.2, 2.3);
  smallStatue(-13.0, 1.2, 1.4);
  for (const bx of [-15.6, 15.6]) {
    for (const bz of [-2.4, 2.4]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.6), stoneMat);
      bench.position.set(bx, 0.07, bz);
      bench.rotation.y = Math.PI / 2;
      bench.receiveShadow = true;
      garden.add(bench);
      colliders.push({ x: gardenX + bx, z: gardenZ + bz, halfW: 0.3, halfD: 1.0, h: 0.22 });
    }
  }
  building.add(garden);

  // --- The garden pavilion: the museum's one door --------------------------
  // A steel and glass box standing at the far side of the roof court, its whole
  // front one storey of glass: two glazed leaves in a steel door bay, a transom
  // over them and a canopy above. It is turned to face back across the
  // garden toward the head of the flight, so the arrival reads stairs -> garden
  // -> doors, with the lantern itself at the end of the drive.
  let museumDoors = null;
  {
    const PW = 9, PD = 18, PH = 5.8;    // PW: depth, PD: width across the doors
    const px = STAIR.x;                 // centred on the flight
    const pz = STAIR.z1 - 15.5;         // doors on the garden side of the box
    const base = ROOF + 0.08;
    const pv = new THREE.Group();
    pv.position.set(px, base, pz);
    // Built with its door wall on its own +X face; a quarter turn stands that
    // face square to the flight, looking back up the treads.
    pv.rotation.y = -Math.PI / 2;
    building.add(pv);

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      pv.add(m);
      return m;
    };

    // Threshold slab and the big roof plate that overhangs it on every side.
    add(new THREE.BoxGeometry(PW + 0.9, 0.16, PD + 0.9), forecourtMat, 0, 0.08, 0);
    add(new THREE.BoxGeometry(PW + 1.4, 0.5, PD + 1.4), museumTitanium, 0, PH + 0.25, 0);
    // The back of the box is glazed too, so the pavilion is a lantern on the roof
    // rather than a solid room: the lit panel inside glows out through it, and a
    // car that rolls in through the doors comes out into the garden behind.
    add(new THREE.BoxGeometry(0.08, PH, PD), museumGlass, -PW / 2 + 0.05, 0.16 + PH / 2, 0);

    // Corner posts, then the two glazed flanks with mullions every 3.2 m.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(new THREE.BoxGeometry(0.34, PH, 0.34), frameMat, sx * (PW / 2 - 0.17), 0.16 + PH / 2, sz * (PD / 2 - 0.17));
      }
    }
    for (const sz of [-1, 1]) {
      const z = sz * (PD / 2 - 0.05);
      add(new THREE.BoxGeometry(PW - 0.5, PH - 0.8, 0.06), museumGlass, 0, 0.16 + (PH - 0.8) / 2, z);
      add(new THREE.BoxGeometry(PW - 0.5, 0.18, 0.1), frameMat, 0, 0.16 + PH - 1.9, z);
      for (let i = -1; i <= 1; i++) {
        add(new THREE.BoxGeometry(0.1, PH - 0.8, 0.12), frameMat, i * (PW / 3.2), 0.16 + (PH - 0.8) / 2, z);
      }
    }

    // The entrance wall. It is mostly glass held in a steel grid: a door bay in
    // the middle (two leaves and a fanlight, warm from the lights inside) and
    // clear glazing either side, so the pavilion reads as a glazed front with
    // doors in it rather than as a black wall with two lit holes punched in it.
    const ex = PW / 2 - 0.06;
    const pavGlassMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a33, metalness: 0.5, roughness: 0.08,
      emissive: 0xffb469, emissiveIntensity: 0.34, transparent: true, opacity: 0.55,
    });
    // Mullions frame the clear glazing either side of the door bay. There is
    // deliberately none at z = 0: that post stood right between the two leaves
    // and the car drove straight through it.
    for (const z of [-PD / 2 + 0.2, -3.9, 3.9, PD / 2 - 0.2]) {
      add(new THREE.BoxGeometry(0.18, PH - 0.3, 0.2), frameMat, ex, 0.16 + (PH - 0.3) / 2, z);
    }
    // Head, door-head and sill rails.
    add(new THREE.BoxGeometry(0.18, 0.45, PD), frameMat, ex, 0.16 + PH - 0.28, 0);
    add(new THREE.BoxGeometry(0.18, 0.18, PD), frameMat, ex, 0.16 + 4.72, 0);
    add(new THREE.BoxGeometry(0.18, 0.22, PD), frameMat, ex, 0.16 + 0.11, 0);
    // Clear glazing either side of the doors...
    for (const sz of [-1, 1]) {
      add(new THREE.BoxGeometry(0.06, PH - 1.0, 3.7), museumGlass, ex + 0.12, 0.16 + (PH - 1.0) / 2, sz * (PD / 2 - 2.05));
    }
    // ...then the two door leaves, hung on push hinges so the car can butt them
    // open, plus their fanlight.
    museumDoors = buildMuseumDoors(pv, { ex, base: 0.16, glassMat: pavGlassMat, frameMat: museumSteel });
    add(new THREE.BoxGeometry(0.06, 0.58, 7.4), pavGlassMat, ex + 0.12, 0.16 + 5.06, 0);

    // A softly lit panel inside, against the back wall: at night the pavilion
    // then reads as a lantern up on the roof instead of a dark box. It is kept
    // narrow so the glazing either side still shows the garden straight through.
    const pavInnerMat = new THREE.MeshStandardMaterial({
      color: 0x3a3126, roughness: 0.72, emissive: 0xffb469, emissiveIntensity: 0.26,
    });
    add(new THREE.BoxGeometry(0.14, PH - 1.9, PD - 6), pavInnerMat, -PW / 2 + 0.7, 0.16 + (PH - 1.9) / 2, 0);

    // Canopy over the threshold, with warm strip lights under it.
    add(new THREE.BoxGeometry(2.4, 0.2, PD - 3), museumTitanium, PW / 2 + 1.0, 4.75, 0);
    for (const oz of [-3.4, 0, 3.4]) {
      add(new THREE.BoxGeometry(1.5, 0.08, 0.5), warmMat, PW / 2 + 0.85, 4.62, oz);
    }
    const pavLight = new THREE.PointLight(0xffb060, 1.5, 26);
    pavLight.position.set(-PW / 4, 3.2, 0);
    pv.add(pavLight);
  }
  // main.js drives these: the leaves are pushed by the car, and bumping them
  // starts the cut through into the interior level.
  group.userData.museumDoors = museumDoors;
  group.userData.museumDoor = MUSEUM_DOOR;

  // --- Colliders into the world -------------------------------------------
  // The building itself was turned and set down at the top of the function; the
  // colliders were collected in its own frame, so carry them across with the
  // same turn and offset. A quarter turn leaves every footprint axis-aligned, so
  // each keeps its sides and simply swaps its two half-extents; anything else
  // would need a real oriented box.
  const cos = Math.cos(MUSEUM.yaw), sin = Math.sin(MUSEUM.yaw);
  const quarter = Math.abs(cos) < 0.5;
  for (const c of colliders) {
    buildingColliders.push({
      ...c,
      x: MUSEUM.x + c.x * cos + c.z * sin,
      z: MUSEUM.z - c.x * sin + c.z * cos,
      halfW: quarter ? c.halfD : c.halfW,
      halfD: quarter ? c.halfW : c.halfD,
    });
  }

  return group;
}

