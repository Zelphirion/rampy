import * as THREE from './three-stub.mjs';

// ============================================================================
// The city street network
// ============================================================================
// The map used to have exactly two roads: one 160x24 slab east-west and one
// 24x160 slab north-south, crossing at the origin. Everything else in town sat
// on open grass, so you could not drive to a single building. This module is
// the replacement: a connected grid of two arterials plus a set of local
// streets that threads between the buildings, so every door has tarmac under
// it and every road joins the network.
//
// Road rectangles are declared as EDGES (x0..x1, z0..z1) rather than
// centre+size, because that is how you actually think about a street layout —
// you read off "does this one reach that one?" by comparing edges. The mesh
// builder converts to centre+size.
//
// The network is deliberately kept INSIDE the railway ring (the loop runs at
// x = +/-84, z = -84 and z = +120, with 10-unit corner arcs), so no road ever
// meets the track. The rail is the town's edge, which is why it reads as a
// boundary rather than an obstacle in the middle of the streets. Nothing in
// town is allowed to straddle the loop either — see the clearance notes on
// RAIL_CLEARANCE below.
// ---------------------------------------------------------------------------

// Widths, in world units. The car is a shade under 2.3 wide, so a 14-wide
// street is a comfortable two-lane road with room to pass. The two arterials
// stay 24 wide and stay centred on x = 0 / z = 0, because the traffic AI
// drives down those exact centre lines and their lane offsets are tuned to it.
export const ARTERIAL_W = 24;
export const STREET_W = 14;

// Where the town sits. The rail formation is 20 wide (radius 10 about the
// centreline), so the east/west straights at x = +/-84 eat x -94..-74 and
// 74..94, the south straight at z = -84 eats z -94..-74, and the north straight
// at z = +120 eats z 110..130. Buildings, props and the side streets all stay
// inside this box, leaving a 2-unit grass verge all the way round - but the two
// arterials deliberately run straight through it and over the tracks, out to
// the world edge, so the town is a through-route rather than a dead end.
export const TOWN = { x0: -72, x1: 72, z0: -72, z1: 108 };

// Kind drives the surface treatment: arterials get a centre line and edge
// lines, local streets get a dashed centre line only.
export const ROADS = [
  // ---- Arterials — the same two the traffic AI already drives ------------
  // Both run the full width of the world, crossing the railway on the way, so a
  // car can leave town in any direction without ever touching grass.
  { id: 'arterial-ew', kind: 'arterial', x0: -90, x1: 90, z0: -12, z1: 12 },
  // Runs north past the town centre and on past the mega-ramp base at z = 80,
  // because you need tarmac all the way up to line up on it.
  { id: 'arterial-ns', kind: 'arterial', x0: -12, x1: 12, z0: -90, z1: 123 },

  // ---- Market street (north-west) --------------------------------------
  // The shops face south at z = 58, so the street that serves them has to be
  // SOUTH of them. This one runs along the front of the fruit stalls, whose
  // sidewalk spans x -53..-13 at z = 58. It stops at x = -48 because the mine
  // adit occupies x -61..-49 all the way from z = 30 to z = 54, so there is no
  // way through to the west of the market on this line.
  { id: 'market-row', kind: 'street', x0: -48, x1: -6, z0: 39, z1: 53 },
  // Along behind the market, north of the adit and north of the stalls. It
  // joins the main drag at x = -6, which is the only way into the west side
  // of the mine field, so it doubles as market access and a town-centre loop.
  { id: 'market-link', kind: 'street', x0: -90, x1: -6, z0: 65, z1: 79 },

  // ---- Town centre: park and library ------------------------------------
  // Split either side of the mega-ramp, which climbs the x ~0 corridor from
  // z = 40 to z = 80, so no east-west street can cross it up there.
  { id: 'north-row', kind: 'street', x0: 6, x1: 56, z0: 65, z1: 79 },
  // Spine up the east side, serving the library and the park, and reaching
  // the far north blocks. It starts at z = 43, clear of the portal hill.
  { id: 'park-spine', kind: 'street', x0: 48, x1: 62, z0: 43, z1: 123 },

  // ---- Spines -----------------------------------------------------------
  // west-spine runs the full height; east-spine stops at the main drag, because
  // the block between the drag and market-row is the school yard and there is
  // no room for a road behind it.
  { id: 'west-spine', kind: 'street', x0: -45, x1: -31, z0: -90, z1: 53 },
  { id: 'east-spine', kind: 'street', x0: 16, x1: 30, z0: -90, z1: 12 },

  // ---- Mine access -------------------------------------------------------
  // A short spur west off west-spine that runs up to the mine frame, so the
  // shaft is dead ahead of you as you approach and you can drive straight in.
  // Its north edge is the mouth itself (z = 34), so there is nothing at all
  // between the road and the hole - the sightline is the tarmac.
  { id: 'mine-spur', kind: 'street', x0: -62, x1: -40, z0: 18, z1: 32 },

  // ---- South ------------------------------------------------------------
  { id: 'south-main', kind: 'street', x0: -45, x1: 90, z0: -30, z1: -16 },
  // The residential street. It runs west from west-spine, so it serves the
  // parking lot on one side and the block of flats on the other without
  // cutting through either.
  { id: 'residential', kind: 'street', x0: -90, x1: -31, z0: -48, z1: -34 },
];

// How close a building (or prop) may come to a road before the audit calls it
// an overlap. Roads are 14 wide and most buildings set a few units back, so
// anything inside this band is genuinely sitting in the carriageway.
export const ROAD_CLEAR = 0.4;

// The railway loop, in the same terms as the ground. Exported so the layout
// audit can prove no building, prop or road ever touches the track. `ST` is
// the straight-line offset, `R` the corner radius, and `NZ` the z of the north
// corner arc centres (the north straight is pushed out to +120, clear of the
// mega-ramp landing field).
export const RAIL = { st: 84, stN: 120, r: 10, cc: 74, nz: 110 };

// Signed clearance from a point to the nearest rail centreline. Negative means
// the point is inside the formation (i.e. on the ballast).
export function railClearance(x, z) {
  const { st, stN, r, cc, nz } = RAIL;
  let best = Infinity;
  const seg = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    if (d < best) best = d;
  };
  const arc = (cx, cz) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) best = d;
  };
  seg(x, z, -cc, stN, cc, stN);            // north straight
  arc(cc, nz); arc(-cc, nz);               // north corners
  seg(x, z, st, -cc, st, nz);              // east straight
  seg(x, z, -st, -cc, -st, nz);            // west straight
  seg(x, z, cc, -st, -cc, -st);            // south straight
  arc(cc, -cc); arc(-cc, -cc);             // south corners
  return best - r;
}

// Signed clearance from a point to a rail rect's boundary, for the rectangular
// buildings that sit over the line. Positive means outside the footprint.
export function rectOutsideRail(x0, z0, x1, z1) {
  // Sampled rather than solved exactly: the footprint corners are the worst
  // case, and a 1-unit sample along each edge catches the arc bulges.
  let worst = Infinity;
  const nx = 24, nz = 24;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      // Only the perimeter matters, so walk the four edges.
      if (i > 0 && i < nx && j > 0 && j < nz) continue;
      const x = x0 + ((x1 - x0) * i) / nx;
      const z = z0 + ((z1 - z0) * j) / nz;
      const c = railClearance(x, z);
      if (c < worst) worst = c;
    }
  }
  return worst;
}

// ============================================================================
// Surface layering — the z-fighting fix
// ============================================================================
// Every flat surface in the game used to sit at y = 0.02..0.04 above the grass
// and rely on that gap alone. Where two of them overlapped (a road junction, a
// driveway crossing a lane line, a forecourt over a car park) their top faces
// were within a hair of each other and the depth buffer could not pick a
// winner, so the surface stippled.
//
// Instead of nudging heights around, every road/paint surface now gets its own
// material with a polygon offset drawn from this table. Coplanar faces with
// different offsets always resolve to the same winner, so junctions are
// deterministic and invisible. Higher number = drawn on top of lower.
const LAYER = {
  // Driveways sit BELOW the road on purpose. A driveway's top face is a few
  // hundredths under the carriageway, so at the point they meet the road must
  // be the unambiguous winner; ordering the driveway last would fight that.
  driveway: 0,
  road: 1,
  roadEdge: 2,
  lane: 3,
};

function layeredMaterial(params, layer) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, ...params });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -layer;
  m.polygonOffsetUnits = -layer;
  return m;
}

// Road top surface. The 0.2 thickness matches the old main road exactly, so the
// car's ride height over tarmac is unchanged.
const ROAD_Y = 0.13;
const ROAD_T = 0.2;
const roadMat = layeredMaterial({ color: 0x1c1f24 }, LAYER.road);
const edgeMat = layeredMaterial({ color: 0xf2f4f7 }, LAYER.roadEdge);
// Every stripe on every road is the same white paint. No yellow anywhere: a
// yellow centre line reads as "temporary works" in a town that is finished.
const laneMat = layeredMaterial({ color: 0xf4f6f8 }, LAYER.lane);
const driveMat = layeredMaterial({ color: 0x2a2e34 }, LAYER.driveway);

export function roadRect(id) {
  const r = ROADS.find((q) => q.id === id);
  if (!r) throw new Error(`unknown road: ${id}`);
  return r;
}

// Is a world point on tarmac? Used by the layout audit to prove every door has
// a road under it, and to keep props off the carriageway.
export function onRoad(x, z, pad = 0) {
  return ROADS.some((r) =>
    x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad);
}

// Nearest point on the network to a world point, as a straight drive line. The
// audit uses the length of this as "how far from the road is this door".
export function nearestRoadDistance(x, z) {
  let best = Infinity, hit = null;
  for (const r of ROADS) {
    const cx = Math.max(r.x0, Math.min(x, r.x1));
    const cz = Math.max(r.z0, Math.min(z, r.z1));
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) { best = d; hit = { x: cx, z: cz, road: r }; }
  }
  return { dist: best, x: hit.x, z: hit.z, road: hit.road };
}

// ============================================================================
// Build
// ============================================================================
function slab(parent, w, d, cx, cz, y, mat, t = ROAD_T) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), mat);
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Dashed centre line down the middle of a road, skipping the middle 13 units of
// every crossing so a junction does not get a stripe painted through it.
function centreLine(group, r) {
  const along = r.x1 - r.x0 > r.z1 - r.z0 ? 'x' : 'z';
  const len = along === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
  const cross = along === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const dash = 3, gap = 3;
  const n = Math.floor(len / (dash + gap));
  for (let i = 0; i < n; i++) {
    const t0 = -len / 2 + dash / 2 + i * (dash + gap);
    const px = along === 'x' ? cx + t0 : cross;
    const pz = along === 'x' ? cross : cz + t0;
    // Drop any dash whose centre lands inside another road's surface, so a
    // junction never gets a stripe painted across it.
    const inJunction = ROADS.some((o) => o !== r &&
      px >= o.x0 && px <= o.x1 && pz >= o.z0 && pz <= o.z1);
    if (inJunction) continue;
    if (along === 'x') slab(group, dash, 0.22, cx + t0, cross, ROAD_Y + 0.1, laneMat, 0.02);
    else slab(group, 0.22, dash, cross, cz + t0, ROAD_Y + 0.1, laneMat, 0.02);
  }
}

// Builds the whole network. Returns the group so callers can hang extras off
// it, plus the list of road rects for the audit.
export function buildCityRoads(scene) {
  const group = new THREE.Group();
  group.name = 'cityRoads';
  scene.add(group);

  for (const r of ROADS) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    slab(group, w, d, cx, cz, ROAD_Y, roadMat);

    // Arterials get a solid white edge line down both kerbs; local streets get
    // nothing, which is what makes the two tiers read differently.
    if (r.kind === 'arterial') {
      const along = w > d ? 'x' : 'z';
      if (along === 'x') {
        slab(group, w, 0.24, cx, r.z0 + 1.1, ROAD_Y + 0.1, edgeMat, 0.02);
        slab(group, w, 0.24, cx, r.z1 - 1.1, ROAD_Y + 0.1, edgeMat, 0.02);
      } else {
        slab(group, 0.24, d, r.x0 + 1.1, cz, ROAD_Y + 0.1, edgeMat, 0.02);
        slab(group, 0.24, d, r.x1 - 1.1, cz, ROAD_Y + 0.1, edgeMat, 0.02);
      }
    }
    centreLine(group, r);
  }

  return { group, roads: ROADS };
}

// Two driveways may not sit closer to each other than this, measured across the
// axis they are thin on. A row of near-identical ribbons running side by side off
// the same street reads as four lanes of a car park, not as front gardens, and it
// is what makes a block look like it was paved by machine. Sharing a single apron
// per group of neighbours fixes it.
const DRIVE_SEP = 14;

// ...and the same separation has to hold ALONG the street. Two ribbons only count
// as side by side when they are close in both axes; two driveways 100 units apart
// along one street are separate properties, however well their thin axes line up.
const NEIGHBOUR_SPAN = 16;

// A driveway from a building's doorstep to the nearest point on the network:
// the thing that actually makes "you can drive up to the building" true. It is
// 7 wide — a single-car ribbon — and it stops at the door rather than running
// under the walls. It is deliberately UNMARKED: a driveway is a private way off
// the street, not a road, so it gets no centre line, no edge line and no
// hatching. Marking it would read as a second carriageway.
export function buildDriveways(scene, entries) {
  const group = new THREE.Group();
  group.name = 'driveways';
  scene.add(group);
  const out = [];

  // Work out each door's straight run to the network first, so the grouping pass
  // below can compare real geometry rather than guessing from the door points.
  const runs = [];
  for (const e of entries) {
    const near = nearestRoadDistance(e.x, e.z);
    if (near.dist < 0.5) continue;                 // already on tarmac
    runs.push({ e, near, alongX: Math.abs(near.x - e.x) > Math.abs(near.z - e.z), len: near.dist });
  }

  // Group neighbouring runs that would otherwise be laid side by side. "Side by
  // side" has to mean close in BOTH axes: two ribbons are only neighbours if they
  // run the same way AND their thin axes are within a car or two of each other.
  // Comparing the thin axis alone would group every driveway on a street
  // together, since they all line up across the road and most are 100 units
  // apart along it - those are separate properties, not a car park.
  const taken = new Set();
  for (let i = 0; i < runs.length; i++) {
    if (taken.has(i)) continue;
    const a = runs[i];
    const aCross = a.alongX ? a.e.z : a.e.x;      // the axis its ribbon is thin on
    const aAlong = a.alongX ? a.e.x : a.e.z;
    const mates = [i];
    for (let j = i + 1; j < runs.length; j++) {
      if (taken.has(j)) continue;
      const b = runs[j];
      if (b.alongX !== a.alongX) continue;         // different orientation
      const bCross = b.alongX ? b.e.z : b.e.x;
      const bAlong = b.alongX ? b.e.x : b.e.z;
      if (Math.abs(bCross - aCross) < DRIVE_SEP && Math.abs(bAlong - aAlong) < NEIGHBOUR_SPAN) {
        mates.push(j);
      }
    }
    // Only collapse when there really are neighbours to share with; a lone door
    // keeps its own ribbon.
    if (mates.length >= 2) {
      const group_ = mates.map((k) => runs[k]);
      for (const k of mates) taken.add(k);
      // The court is one rectangle spanning the group's width ACROSS the street
      // and running from the kerb back past its deepest door, so a single slab
      // genuinely puts tarmac under every door it serves. That is what makes it a
      // shared car park rather than several ribbons in a row.
      const roadEnd = group_.reduce((best, r) =>
        (r.len < best.len ? r : best), group_[0]).near;
      const alongX = group_[0].alongX;
      const crossOf = (p) => (alongX ? p.z : p.x);
      const alongOf = (p) => (alongX ? p.x : p.z);
      let crossLo = Infinity, crossHi = -Infinity, alongLo = Infinity, alongHi = -Infinity;
      for (const r of group_) {
        for (const p of [r.e, r.near]) {
          const c = crossOf(p), l = alongOf(p);
          if (c < crossLo) crossLo = c;
          if (c > crossHi) crossHi = c;
          if (l < alongLo) alongLo = l;
          if (l > alongHi) alongHi = l;
        }
      }
      const w = (crossHi - crossLo) + 7;            // the doors' spread, plus a car
      const len = (alongHi - alongLo) + 2;           // kerb to the furthest threshold
      const cx = (crossLo + crossHi) / 2, cz = (alongLo + alongHi) / 2;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? len : w, 0.18, alongX ? w : len), driveMat);
      m.position.set(cx, ROAD_Y - 0.02, cz);
      m.receiveShadow = true;
      group.add(m);
      out.push({ court: true, doors: group_.map((r) => r.e), to: roadEnd, len, w });
      continue;
    }
    taken.add(i);
  }

  // Everything that did not join a court gets its own ribbon, checked against the
  // ribbons already placed so two can never end up as neighbours.
  const placed = [];
  for (let i = 0; i < runs.length; i++) {
    if (taken.has(i) && out.some((o) => o.court && o.doors.includes(runs[i].e))) continue;
    const r = runs[i];
    const cross = r.alongX ? r.e.z : r.e.x;
    const a0 = r.alongX ? r.e.x : r.e.z, a1 = r.alongX ? r.near.x : r.near.z;
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    const clash = placed.some((p) => p.alongX === r.alongX
      && Math.abs(p.cross - cross) < DRIVE_SEP
      && lo < p.hi + DRIVE_SEP && p.lo < hi + DRIVE_SEP);
    if (clash) continue;
    placed.push({ alongX: r.alongX, cross, lo, hi });
    const w = 7;
    const dw = r.alongX ? r.len : w;
    const dd = r.alongX ? w : r.len;
    const m = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.18, dd), driveMat);
    m.position.set((r.near.x + r.e.x) / 2, ROAD_Y - 0.02, (r.near.z + r.e.z) / 2);
    m.receiveShadow = true;
    group.add(m);
    out.push({ from: r.e, to: r.near, len: r.len });
  }
  return { group, driveways: out };
}
