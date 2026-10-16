// ============================================================================
// The house play train's ROUTE - pure geometry, no THREE, so it can be checked
// headless (see playtrain.test.mjs). The route is consumed by
// ./playroom.js `makePlayTrain` (via the level builder in ./index.js).
// ============================================================================
//
// The play train is a TOY: it lives on the floor and runs a closed loop that
// threads every room of the house except the bathroom AND the dark garage. Like
// the Hot Wheels route (hotwheels.mjs) it is laid out as STRAIGHTS and STANDARD
// 90-degree CURVES, so every place the track passes near itself does so square-on
// rather than at some arbitrary angle. It stays on the FLOOR and hugs the walls.
//
// The dark garage is off-limits: it is the pitch-dark exit room, and a toy train
// looping through it would be a leftover from when the route used to turn around
// in there. The loop now turns around inside the KITCHEN instead.
//
// The route is authored as a list of CORNERS (axis-aligned waypoints). Every
// dead end (the foyer, the main closet) is served by a pair of OFFSET lanes - the
// train drives in on one and back out on the other - so it never has to reverse,
// and no two runs share a lane. `waypointsToOps` turns the corners into a turtle
// program of `S` (straight) and `L`/`R` (arc) ops, and `expandOps` turns that
// into the dense point list the track builder wants.
//
// World coordinates are the house's own (see layout.js): +X east, +Z north.

export const PLAY_TRAIN_Y = 0.19;      // deck height: rails just off the boards

const DEG = Math.PI / 180;

// Straight step / arc step used for the dense point list. Small enough that the
// Catmull-Rom rails the playroom builds read as straight or as a smooth arc.
const STRAIGHT_STEP = 1.6;
const ARC_STEP = Math.PI / 36;         // 5 degrees per node

export function expandOps(ops, start) {
  const pts = [];
  let x = start.x, z = start.z, ang = start.ang;
  const add = (px, pz) => pts.push({ x: px, y: PLAY_TRAIN_Y, z: pz });

  const straight = (len) => {
    const n = Math.max(1, Math.ceil(Math.abs(len) / STRAIGHT_STEP));
    const dx = Math.cos(ang), dz = Math.sin(ang);
    for (let i = 1; i <= n; i++) add(x + dx * len * (i / n), z + dz * len * (i / n));
    x += dx * len; z += dz * len;
  };

  const arc = (r, sweep) => {
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP));
    const leftX = -Math.sin(ang), leftZ = Math.cos(ang);
    const side = sweep >= 0 ? 1 : -1;
    const cx = x + leftX * r * side, cz = z + leftZ * r * side;
    const a0 = Math.atan2(z - cz, x - cx);
    for (let i = 1; i <= n; i++) {
      const a = a0 + sweep * (i / n);
      add(cx + r * Math.cos(a), cz + r * Math.sin(a));
    }
    x = cx + r * Math.cos(a0 + sweep);
    z = cz + r * Math.sin(a0 + sweep);
    ang += sweep;
  };

  for (const op of ops) {
    if (op[0] === 'S') straight(op[1]);
    else if (op[0] === 'L') arc(op[1], op[2] * DEG);
    else if (op[0] === 'R') arc(op[1], -op[2] * DEG);
    else throw new Error(`unknown op ${op[0]}`);
  }
  return pts;
}

// Turn a cyclic list of axis-aligned corners into turtle ops. Corner i is
// rounded with `radii[i]` (default 4); the arc is tangent to both of its
// segments, so the straight before each corner is shortened accordingly.
export function waypointsToOps(waypoints, radii, defaultR = 4) {
  const n = waypoints.length;
  const dir = [], len = [];
  for (let i = 0; i < n; i++) {
    const a = waypoints[i], b = waypoints[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) throw new Error(`zero-length segment ${i}`);
    if (dx !== 0 && dz !== 0) throw new Error(`non-axis segment ${i}`);
    dir.push({ x: dx / L, z: dz / L });
    len.push(L);
  }
  const rAt = (i) => (radii && radii[i] != null ? radii[i] : defaultR);
  const turnAt = (i) => {
    const a = dir[(i - 1 + n) % n], b = dir[i];
    if (Math.abs(a.x * b.x + a.z * b.z) > 1e-9) throw new Error(`corner ${i} not 90deg`);
    return (a.x * b.z - a.z * b.x) > 0 ? 'L' : 'R';
  };
  const r0 = rAt(0);
  const start = {
    x: waypoints[0][0] + r0 * dir[0].x,
    z: waypoints[0][1] + r0 * dir[0].z,
    ang: Math.atan2(dir[0].z, dir[0].x),
  };
  const ops = [];
  let cur = { x: start.x, z: start.z };
  for (let step = 1; step <= n; step++) {
    const i = step % n;
    const r = rAt(i);
    const dIn = dir[(i - 1 + n) % n], dOut = dir[i];
    const tin = { x: waypoints[i][0] - r * dIn.x, z: waypoints[i][1] - r * dIn.z };
    const s = Math.hypot(tin.x - cur.x, tin.z - cur.z);
    if (s > 1e-6) ops.push(['S', s]);
    ops.push([turnAt(i), r, 90]);
    cur = { x: waypoints[i][0] + r * dOut.x, z: waypoints[i][1] + r * dOut.z };
  }
  return { ops, start };
}

// Debug aid: the pose (position + heading, degrees) at the end of every op.
export function traceOps(ops, start) {
  const out = [];
  let x = start.x, z = start.z, ang = start.ang;
  for (const op of ops) {
    if (op[0] === 'S') { x += Math.cos(ang) * op[1]; z += Math.sin(ang) * op[1]; }
    else {
      const sweep = (op[0] === 'L' ? 1 : -1) * op[2] * DEG, r = op[1];
      const leftX = -Math.sin(ang), leftZ = Math.cos(ang);
      const side = sweep >= 0 ? 1 : -1;
      const cx = x + leftX * r * side, cz = z + leftZ * r * side;
      const a0 = Math.atan2(z - cz, x - cx);
      x = cx + r * Math.cos(a0 + sweep); z = cz + r * Math.sin(a0 + sweep);
      ang += sweep;
    }
    let d = (ang * 180 / Math.PI) % 360;
    if (d > 180) d -= 360; if (d <= -180) d += 360;
    out.push({ op, x: +x.toFixed(2), z: +z.toFixed(2), deg: +d.toFixed(1) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The authored route. A cyclic list of axis-aligned corners, walked the same
// way a train would run: living -> kitchen -> dining -> foyer -> kitchen ->
// living -> hall -> bedroom 2 -> main closet -> bedroom 2 -> walk-in ->
// bedroom 1 -> living (and round again). The dark garage is deliberately NOT on
// the route any more.
//
// The tricky room is the KITCHEN: its island, the run of counter and the north
// galley leave a west aisle and an east aisle, and the train uses BOTH - it goes
// up the west aisle, east along the north edge and back down the east aisle, so
// it turns around inside the kitchen instead of driving out through the garage.
// The two runs of each aisle are OFFSET a few units and use tighter radii where
// the turnarounds pass closest, so no two runs share a lane.
//
//   * kitchen: out up the west aisle at x=-34, east along z=82, down the east at
//              x=2; back up the east at x=-4, west along z=76, then south down
//              the west at x=-31.
//   * living:  the west lane pair x=-34 / x=-31 (3 apart); the bedroom-1 run
//              enters along z=-12 and the hall run leaves along z=20.
//   * dining:  out along z=58 and back along z=54, both south of the table.
//   * foyer:   a deep loop in from z=58 and out on z=54, round the back of the
//              bench and the pot plant.
//   * bedroom2: in along z=-40 to the main closet, back along z=-66 and -74.
//   * walk-in:  crossed at z=-54, just north of the Hot Wheels loop.
// ---------------------------------------------------------------------------
const W = [
  [-34, -12],   //  0  living, just inside the kitchen opening
  [-34, 82],    //  1  kitchen (up the west aisle, through the open plan)
  [2, 82],      //  2  kitchen (east along the north edge, under the galley)
  [2, 58],      //  3  down the east aisle
  [54, 58],     //  4  dining, then into the foyer
  [54, 74],     //  5
  [72, 74],     //  6
  [72, 60],     //  7
  [57, 60],     //  8
  [57, 54],     //  9  out of the foyer
  [-4, 54],     // 10  back into the kitchen (east aisle, inner lane)
  [-4, 76],     // 11  up the east aisle
  [-31, 76],    // 12  west under the galley
  [-31, 20],    // 13  living (down across the open plan)
  [14, 20],     // 14  hall
  [14, -40],    // 15  bedroom 2 (through its door)
  [38, -40],    // 16  bedroom 2
  [38, -58],    // 17  bedroom 2
  [58, -58],    // 18  main closet (through its door)
  [58, -66],    // 19
  [40, -66],    // 20
  [40, -74],    // 21
  [10, -74],    // 22
  [10, -54],    // 23
  [-52, -54],   // 24  walk-in, then bedroom 1
  [-52, -24],   // 25
  [-64, -24],   // 26
  [-64, -12],   // 27  living (up through the bedroom-1 door)
];
// Default corner radius. The kitchen turnarounds and the foyer corners pass
// closest to the parallel run beside them, so they use tighter radii.
const RADII = W.map(() => 4);
RADII[1] = 3;    // (-34,82): just clear of the return lane's corner at (-31,76)
RADII[8] = 2;    // the foyer's return throat is short: tighten these two turns
RADII[9] = 2;
RADII[12] = 3;   // (-31,76): just clear of the outbound corner at (-34,82)

const built = waypointsToOps(W, RADII);

export const START = built.start;
export const PLAY_TRAIN_OPS = built.ops;

export function playTrainPoints() {
  return expandOps(PLAY_TRAIN_OPS, START);
}
