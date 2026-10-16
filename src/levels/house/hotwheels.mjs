// ===== The playroom Hot Wheels track (pure geometry + drive maths) =====
//
// The children's playroom is a walk-in room between the two bedrooms, and the
// centrepiece of it is a long orange Hot Wheels track the player's car can
// actually drive: it climbs up onto a bookshelf, dives down a big hill, throws
// the car through a full vertical LOOP-THE-LOOP, and fires it off a launch ramp
// onto a dresser stacked with knockables.
//
// The house car normally rides a flat heightfield (see house/surfaces.js): the
// world is a floor height per (x,z) and "up" is always world +Y. That cannot
// express a loop, where the car goes over the top and is briefly upside down,
// held on only by its own speed. So the track is not a heightfield at all. It is
// a 3D CENTRELINE with a per-point "up" (the contact normal), exactly the idea
// spaceRing.js uses to drive the car around the inside of the wheel: the car is
// posed by a frame along the track and gravity is resolved along that frame
// rather than in world space.
//
// This module is PURE - no THREE, no DOM - so the path, the frames and the loop
// physics can be unit-tested. main.js turns a frame into a quaternion and reads
// the player's throttle; house/index.js turns the same frames into rails.
//
// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------
// A node is { x, y, z, ux, uy, uz }: a point on the centreline and the surface
// normal ("up") there. On flat ground up is (0,1,0). Around the loop the up
// points at the loop's centre, so at the top of the loop it is (0,-1,0) and the
// car is inverted - which is the whole point.
//
// The centreline is a Catmull-Rom spline through the nodes, sampled to a dense
// arc-length table. Up vectors are interpolated between nodes and re-squared
// against the tangent, so the frame stays orthonormal all the way round.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- Drive feel (mirrors the ring drive's constants, tuned for a toy track) --
export const TRACK_ACCEL = 34;      // units/s^2 of throttle
export const TRACK_MAX = 46;        // top speed forward (fast enough for the loop)
export const TRACK_REVERSE = 14;    // top speed in reverse
export const TRACK_DRAG = 4;        // coasting deceleration
export const TRACK_TURN = 2.3;      // steering authority (kept for API parity)

// How far off the rail surface the car's origin sits (the model's own ride
// height), matching SPACE_CAR_LIFT's role on the wheel.
export const TRACK_LIFT = 0.5;

// The car is captured onto the track when its centre comes within this of the
// centreline. Small on purpose: you have to drive AT the track, not merely past
// it, and a floor run under an elevated shelf is 8 units clear of it.
export const TRACK_CAPTURE = 2.0;

// How far the guide rails sit either side of the centreline, and how wide the
// capture band is drawn. Purely cosmetic on the geometry side.
export const TRACK_HALF_WIDTH = 1.6;

const EPS = 1e-6;

function norm(x, y, z) {
  const m = Math.hypot(x, y, z) || 1;
  return { x: x / m, y: y / m, z: z / m };
}

// Catmull-Rom through p0..p3 at t in [0,1], component-wise.
function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a0, a1, a2, a3) =>
    0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 + (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
  out.x = f(p0.x, p1.x, p2.x, p3.x);
  out.y = f(p0.y, p1.y, p2.y, p3.y);
  out.z = f(p0.z, p1.z, p2.z, p3.z);
  return out;
}

// A vertical loop, as a run of nodes whose up vectors point at the centre of the
// circle. Entered at the bottom travelling +X (in the loop's own plane), it goes
// up the right side, over the top inverted, down the left, and out +X again.
//
// `steps` nodes are produced from the bottom round to the bottom again (so the
// first and last coincide - the caller decides whether to keep both).
//
// `rise` and `drift` turn the flat circle into a gentle HELIX: the loop closes
// slightly higher and across from where it started, so the entry and the exit are
// two distinct points and the car visibly drives IN one side and OUT the other
// instead of passing through the same spot twice. With both 0 this is the plain
// circle the unit tests pin.
export function circleLoopNodes(cx, cy, cz, r, steps = 8, rise = 0, drift = 0, heading = 0) {
  const out = [];
  // The circle lies in the vertical plane that contains `heading` (0 = +X east).
  // The car enters at the bottom travelling along +heading and leaves the same
  // way, so a heading of PI/2 feeds the loop from the south and spits it north.
  const ca = Math.cos(heading), sa = Math.sin(heading);
  for (let i = 0; i <= steps; i++) {
    // theta from -90deg (bottom) up through 0, 90 (top) to 270 (= bottom again).
    const th = -Math.PI / 2 + (i / steps) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const f = i / steps;                 // 0 at the mouth, 1 at the exit
    const along = r * c;                 // distance ahead along the heading
    out.push({
      x: cx + ca * along - sa * drift * f,
      y: cy + r * s + rise * f,
      z: cz + sa * along + ca * drift * f,
      // up = (centre - point)/r, i.e. inward toward the hub of the loop.
      ux: -ca * c, uy: -s, uz: -sa * c,
    });
  }
  return out;
}

// A TEARDROP loop: the same vertical loop as circleLoopNodes, but with a gentle,
// wide radius at the bottom (where the car enters fast) that tightens toward a
// small radius at the top. That is the classic "clothoid" loop shape and it is
// what makes the entry ramp read as a soft, sweeping climbing curve instead of a
// hard circle pulled straight up off the floor - the car leans into it rather
// than being flung at a wall.
//
// It is built by integrating a curvature that varies from rBot at the bottom to
// rTop at the top: rho(psi) = A + B cos(psi) with A=(rTop+rBot)/2, B=(rBot-rTop)/2.
// The bottom point sits at (cx,cy,cz); the car enters travelling along `heading`,
// the track rises to cy + rBot + rTop at the crown and comes back to cy one
// `rBot*pi - rTop*pi` further along. `rise`/`drift` add the same gentle helix
// offset as the circular loop so entry and exit are distinct points.
export function teardropLoopNodes(cx, cy, cz, rBot, rTop, steps = 16, rise = 0, drift = 0, heading = 0) {
  const A = (rBot + rTop) / 2;
  const B = (rBot - rTop) / 2;
  const ca = Math.cos(heading), sa = Math.sin(heading);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const psi = f * Math.PI * 2;
    const c = Math.cos(psi), s = Math.sin(psi);
    // Integrals of cos(psi)*rho and sin(psi)*rho, closed form.
    const along = A * s + B * (psi / 2 + Math.sin(2 * psi) / 4);
    const up = A * (1 - c) + (B / 2) * s * s;
    out.push({
      x: cx + ca * along - sa * drift * f,
      y: cy + up + rise * f,
      z: cz + sa * along + ca * drift * f,
      // up is the inward normal (toward the curvature centre): rotate the tangent
      // a quarter turn in the loop plane.
      ux: -ca * s, uy: c, uz: -sa * s,
    });
  }
  return out;
}

// ---- Track pieces ----------------------------------------------------------
//
// Kept for the unit tests and for any route that still wants to be laid piece by
// piece. The playroom coaster no longer uses these - it is authored freehand
// (see rideNodes / hotwheelsNodes below) - but trackStraight and trackCurve are
// small, well-behaved and worth testing, so they stay exported. A piece is laid
// from the pose the previous piece left behind: a position (x, y, z) and a
// heading `ang` in the ground plane (0 = +X east, PI/2 = +Z north) that only the
// curves change.
export const CURVE_R = 8;          // the standard curve radius
export const STRAIGHT_STEP = 8;    // nodes this far apart keep a straight straight

// `roll` banks the frame about the tangent: +roll tips the car's "up" toward the
// track's right-hand binormal, which is how a corner leans the car into the turn.
const U = () => ({ ux: 0, uy: 1, uz: 0 });
const N = (x, y, z, u, roll) => ({ x, y, z, ...(u || U()), roll: roll || 0 });

// Append a straight of `len` (optionally climbing `dy`, optionally banked by
// `roll`) and return the new pose. Intermediate nodes are dropped in along the
// run so a straight is genuinely straight through the middle of the spline.
export function trackStraight(nodes, pose, len, opts = {}) {
  const { dy = 0, roll = 0, step = STRAIGHT_STEP } = opts;
  const n = Math.max(1, Math.round(Math.abs(len) / step));
  const dx = Math.cos(pose.ang), dz = Math.sin(pose.ang);
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    nodes.push(N(pose.x + dx * len * f, pose.y + dy * f, pose.z + dz * len * f, null, roll));
  }
  return { x: pose.x + dx * len, y: pose.y + dy, z: pose.z + dz * len, ang: pose.ang };
}

// Append a standard curve of radius `r` (sweep in radians; + turns left) and
// return the new pose. Optional `roll` banks it and `dy` lets it climb through
// the turn.
export function trackCurve(nodes, pose, sweep, opts = {}) {
  const { r = CURVE_R, dy = 0, roll = 0 } = opts;
  const steps = Math.max(2, Math.round(Math.abs(sweep) / (Math.PI / 12)));
  // The hub sits on the car's left for a left-handed sweep and on its right for
  // a right-handed one, so the curve leaves the pose along `ang` either way.
  const leftX = -Math.sin(pose.ang), leftZ = Math.cos(pose.ang);
  const side = sweep >= 0 ? 1 : -1;
  const cx = pose.x + leftX * r * side, cz = pose.z + leftZ * r * side;
  const a0 = Math.atan2(pose.z - cz, pose.x - cx);
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    const a = a0 + sweep * f;
    nodes.push(N(cx + r * Math.cos(a), pose.y + dy * f, cz + r * Math.sin(a), null, roll));
  }
  const a1 = a0 + sweep;
  return { x: cx + r * Math.cos(a1), y: pose.y + dy, z: cz + r * Math.sin(a1), ang: pose.ang + sweep };
}

// ---- The authored route ---------------------------------------------------
//
// World coordinates are the house's own (see layout.js). The route is OPEN: it
// starts on the playroom floor at the walk-in's north doorway (so driving
// straight in from the living room lands you on the on-ramp) and ends at the lip
// of a launch ramp after a pair of loops, firing the car north through the
// playroom doorway on a long flight ACROSS the living room (see releaseHouseTrack
// in main.js). After climbing out of the walk-in it tours the two bedrooms, the
// main closet and the living room — but NOT the bathroom, the dark garage, the
// kitchen, the dining room or the foyer, which are all kept clear now.
//
// It is a roller coaster, not a set of shelves:
//   * there is no flat, level run anywhere except one short straightaway (every
//     other piece climbs or dives),
//   * every long leg is a single long, SWEEPING banked arc (no back-and-forth
//     weaving), each one banked hard so the car leans into the turn,
//   * the tour climbs to a peak, dips under each doorway header and climbs again,
//     so the height is always changing, and
//   * it goes fully upside down TWICE, in a stacked pair of loops just before
//     the launch, and stays high off the floor (y ~ 15..29) the whole way so it
//     is barely visible until it dives home to the playroom.
// The doorway crossings are kept on the original ground headings, so the tour
// still threads the same doors it always did; only the shape, the height and the
// banking of each leg changed. The launch runs dead straight NORTH.
const E = 0, NN = Math.PI / 2, W = Math.PI, SS = -Math.PI / 2;

export function hotwheelsNodes() {
  const nodes = [];
  let p = null;
  const go = (len, dy = 0, roll = 0) => { p = trackStraight(nodes, p, len, { dy, roll }); };
  const arc = (sweep, dy = 0, roll = 0, r = 16) => { p = trackCurve(nodes, p, sweep, { dy, roll, r }); };

  // A "wavy straight": nets `len` along the current heading with no net turn,
  // weaving sideways by up to r instead of running straight. A long leg lays a
  // few of these back to back. `side` picks which way it bulges (+1 = the car's
  // right); keep the bulge off any wall the leg runs alongside, and put a door
  // crossing at a wave's END (where the offset is zero) so it threads the gap.
  const wave = (len, dy = 0, roll = 0, side = 1) => {
    const r = Math.abs(len) / 4;
    arc(-NN * side, dy / 4, roll, r);
    arc(NN * side, dy / 4, roll, r);
    arc(NN * side, dy / 4, roll, r);
    arc(-NN * side, dy / 4, roll, r);
  };

  // ===== The ON-RAMP: the walk-in's north doorway lane =====================
  // Doorway A is x -30..-10 at z=-20 and the on-ramp sits at its east edge, so
  // driving straight south out of the living room rolls the car onto it. The one
  // genuinely straight piece: it has to be aimable, so the player can line up and
  // hit the rails. It climbs two storeys, high enough to clear everything below.
  p = { x: -12, y: 0, z: -24, ang: SS };
  nodes.push(N(p.x, p.y, p.z));
  go(16, 8);                       // climb the aimable straight; (-12, 8, -40)
  arc(-NN, 4, 0.5, 12);            // sweep south->west, banked; (-24, 12, -52)

  // ===== Into BEDROOM 1 through the bed1|walkin door (x=-46) ================
  wave(24, 2, 0.3);                // weave west; (-48, 14, -52); crosses x=-46 at z=-52
  arc(-NN, 3, 0.5, 18);            // sweep west->north; (-66, 17, -34)
  go(14, 4, 0.3);                  // climb the west lane; (-66, 21, -20)

  // ===== A weaving S across the LIVING ROOM ================================
  arc(-NN, 4, 0.5, 20);            // north->east sweep; (-46, 25, 0)
  arc(NN, 2, 0.5, 14);             // east->north sweep; (-32, 27, 14)

  // ===== One long banked U-turn back across the LIVING ROOM ==================
  // The tour used to carry on through the kitchen, the dining room and the foyer
  // from here. Those rooms are now kept clear, so instead the route folds back
  // over the living room in a single wide banked U: it sweeps north->east and
  // then east->south, diving as it goes, and lands heading south to pick up the
  // bedroom-2 doorway lane.
  arc(-NN, -6, 0.5, 9);            // north->east sweep, diving
  go(14, 0, 0.3);                  // the long level east run (the straightaway)
  arc(-NN, -6, 0.5, 19);           // east->south sweep, diving; (10, 15, 4)

  // ===== Into BEDROOM 2 through its door (z=-20 at x=10) ===================
  wave(24, 0.7, 0.2, -1);          // weave east (away from the x=6 wall); (10, 15.7, -20)
  wave(12, 0.3, 0.2, -1);          // (-10, 16, -32) strands, crosses z=-20 at x=10
  arc(NN, 2, -0.5, 20);            // south->east sweep; (30, 18, -52)
  wave(26, -4, 0.2, -1);           // (56, 14, -52); under the x=52 door at z=-52

  // ===== Into the MAIN CLOSET through its only door (x=52) =================
  arc(-NN, 0, 0.4, 8);             // east->south; (64, 14, -60)
  arc(-NN, 0, 0.4, 8);             // south->west; (56, 14, -68), the closet U

  // ===== Back out through bed2 and into the WALK-IN (x=6) ==================
  // The return rides well ABOVE the outbound lane it crosses mid-bedroom-2, so
  // the two never share a spot while still in bedroom 2.
  wave(46, -6, 0.2);               // weave west, diving; (10, 8, -68)
  go(6, -1, 0.2);                  // (4, 7, -68); crosses x=6 into the walk-in
  go(6, -5, 0.2);                  // the dive onto the floor; (-2, 2, -68)

  // ===== Turn around and set up the loops ==================================
  arc(NN, 0, -0.5, 8);             // west->south; (-10, 2, -76)
  arc(-W, 0, 0, 6);                // south->north hairpin; (-22, 2, -76)

  // ===== A STACKED PAIR OF LOOPS, then the launch ramp north ===============
  // Both loops sit SOUTH of the play train's z=-54 crossing, and the launch
  // climbs clear of it, so the low track never meets the train.
  // Entered heading north, so each exits heading north straight onto the next.
  // The first drifts east-to-west and the second drifts back the other way, so
  // the pair reads as a double corkscrew climbing the playroom.
  const loop1 = circleLoopNodes(-22, 5.4, -76, 5.4, 12, 1.5, 4.6, NN);
  for (let i = 1; i < loop1.length; i++) nodes.push(loop1[i]);
  let out = loop1[loop1.length - 1];
  p = { x: out.x, y: out.y, z: out.z, ang: NN };
  go(14, -out.y);
  const loop2 = circleLoopNodes(-26.6, 5.4, -62, 5.4, 12, 1.5, -4.6, NN);
  for (let i = 1; i < loop2.length; i++) nodes.push(loop2[i]);
  out = loop2[loop2.length - 1];
  p = { x: out.x, y: out.y, z: out.z, ang: NN };

  // The launch climbs steeply then flattens onto a near-flat lip that fires the
  // car NORTH through the playroom doorway on a long flight (see
  // releaseHouseTrack in main.js).
  go(28, 14);                      // -> (-22, 15.5, -34)
  go(14, 0.4);                     // -> (-22, 15.9, -20), the near-flat lip
  return nodes;
}

// ---- Building the sampled track -------------------------------------------

// Build the dense arc-length table from a node list. `closed` wraps the spline
// (not used by the playroom route, but kept general and tested).
export function buildTrack(nodes, { closed = false, sub = 12 } = {}) {
  const n = nodes.length;
  const at = (i) => {
    if (closed) return nodes[((i % n) + n) % n];
    return nodes[clamp(i, 0, n - 1)];
  };
  const pts = [];
  const ups = [];
  const rolls = [];
  const segs = closed ? n : n - 1;
  const scratch = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    // Sample [0,1) of every segment; the final endpoint is appended once below.
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      catmull(p0, p1, p2, p3, t, scratch);
      // The floor is at y=0 and a Catmull-Rom spline overshoots slightly when a
      // run-in meets the flat, so the centreline is nudged onto the floor rather
      // than allowed to dip a few centimetres through it.
      pts.push({ x: scratch.x, y: Math.max(0, scratch.y), z: scratch.z });
      // nlerp the up vectors of the two nodes this spans, then normalize.
      ups.push(norm(
        p1.ux + (p2.ux - p1.ux) * t,
        p1.uy + (p2.uy - p1.uy) * t,
        p1.uz + (p2.uz - p1.uz) * t,
      ));
      rolls.push((p1.roll || 0) + ((p2.roll || 0) - (p1.roll || 0)) * t);
    }
  }
  if (!closed) {
    const last = nodes[n - 1];
    pts.push({ x: last.x, y: last.y, z: last.z });
    ups.push(norm(last.ux, last.uy, last.uz));
    rolls.push(last.roll || 0);
  }

  // Cumulative arc length.
  const m = pts.length;
  const s = new Array(m).fill(0);
  for (let i = 1; i < m; i++) {
    s[i] = s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  }
  const length = s[m - 1];

  // Tangent (central difference), then orthogonalise up against it.
  const samples = new Array(m);
  for (let i = 0; i < m; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(m - 1, i + 1)];
    let t = norm(b.x - a.x, b.y - a.y, b.z - a.z);
    let u = ups[i];
    // Gram-Schmidt: remove the tangent component from up.
    const d = u.x * t.x + u.y * t.y + u.z * t.z;
    u = norm(u.x - t.x * d, u.y - t.y * d, u.z - t.z * d);
    // Binormal completes a right-handed (T, U, B).
    let bin = norm(t.y * u.z - t.z * u.y, t.z * u.x - t.x * u.z, t.x * u.y - t.y * u.x);
    // BANK: roll both up and binormal about the tangent by the sampled roll, so
    // the car leans into the corner instead of sitting flat across it.
    const roll = rolls[i] || 0;
    if (roll) {
      const c = Math.cos(roll), sn = Math.sin(roll);
      const ux = u.x * c + bin.x * sn, uy = u.y * c + bin.y * sn, uz = u.z * c + bin.z * sn;
      const bx = -u.x * sn + bin.x * c, by = -u.y * sn + bin.y * c, bz = -u.z * sn + bin.z * c;
      u = { x: ux, y: uy, z: uz };
      bin = { x: bx, y: by, z: bz };
    }
    samples[i] = {
      x: pts[i].x, y: pts[i].y, z: pts[i].z,
      tx: t.x, ty: t.y, tz: t.z,
      ux: u.x, uy: u.y, uz: u.z,
      bx: bin.x, by: bin.y, bz: bin.z,
      s: s[i], kappa: 0,
    };
  }
  // Signed curvature along up: kappa = (dT/ds) . U. Positive when the track
  // bends toward the car (concave up), which is what a loop's underside is.
  for (let i = 0; i < m; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(m - 1, i + 1)];
    const ds = (b.s - a.s) || EPS;
    const dtx = (b.tx - a.tx) / ds, dty = (b.ty - a.ty) / ds, dtz = (b.tz - a.tz) / ds;
    samples[i].kappa = dtx * samples[i].ux + dty * samples[i].uy + dtz * samples[i].uz;
  }

  return { samples, length, closed };
}

// Interpolated frame at arc length `s` (clamped to the track; wraps if closed).
export function sampleTrack(track, dist) {
  const m = track.samples.length;
  let d = dist;
  if (track.closed) {
    d = ((d % track.length) + track.length) % track.length;
  } else {
    d = clamp(d, 0, track.length);
  }
  // Binary search for the segment containing d.
  let lo = 0, hi = m - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track.samples[mid].s <= d) lo = mid; else hi = mid;
  }
  const a = track.samples[lo], b = track.samples[Math.min(m - 1, lo + 1)];
  const span = (b.s - a.s) || 1;
  const t = clamp((d - a.s) / span, 0, 1);
  const lerp = (p, q) => p + (q - p) * t;
  const tx = lerp(a.tx, b.tx), ty = lerp(a.ty, b.ty), tz = lerp(a.tz, b.tz);
  const T = norm(tx, ty, tz);
  let ux = lerp(a.ux, b.ux), uy = lerp(a.uy, b.uy), uz = lerp(a.uz, b.uz);
  const dp = ux * T.x + uy * T.y + uz * T.z;
  const Uv = norm(ux - T.x * dp, uy - T.y * dp, uz - T.z * dp);
  return {
    x: lerp(a.x, b.x), y: lerp(a.y, b.y), z: lerp(a.z, b.z),
    tx: T.x, ty: T.y, tz: T.z,
    ux: Uv.x, uy: Uv.y, uz: Uv.z,
    kappa: lerp(a.kappa, b.kappa),
    s: d,
  };
}

// World pose of the car riding `lift` off the rail at arc length `s`. Same
// basis convention as spaceRing.js's ringPose: local +X is the car's BACKWARD,
// +Y is up, +Z is the right-handed cross, so -X (the hood) faces travel.
export function poseOnTrack(track, s, lift = TRACK_LIFT) {
  const f = sampleTrack(track, s);
  const px = f.x + f.ux * lift, py = f.y + f.uy * lift, pz = f.z + f.uz * lift;
  const xx = -f.tx, xy = -f.ty, xz = -f.tz;      // backward
  const yx = f.ux, yy = f.uy, yz = f.uz;         // up
  const zx = xy * yz - xz * yy;                  // Z = X cross Y
  const zy = xz * yx - xx * yz;
  const zz = xx * yy - xy * yx;
  return { px, py, pz, xx, xy, xz, yx, yy, yz, zx, zy, zz };
}

// Yaw to hand to the flat (yaw-only) house drive when the car leaves the track
// at arc length `s`. The whole game drives with forward = (-cos yaw, sin yaw) in
// world (x, z) (see main.js 's drive loop), and the track's travel direction is
// its tangent T, so matching forward to T gives yaw = atan2(Tz, -Tx).
export function releaseYaw(track, s) {
  const f = sampleTrack(track, s);
  return Math.atan2(f.tz, -f.tx);
}

// Nearest point on the track to (x,y,z). A `hint` (a previous s) narrows the
// search to a window around itself; without one it scans the whole track, which
// is cheap for a few hundred samples.
export function nearestTrackS(track, x, y, z, hint = null, window = 60) {
  const m = track.samples.length;
  let lo = 0, hi = m - 1;
  if (hint !== null && Number.isFinite(hint)) {
    // Convert the hint arc length to a sample index, then window around it.
    let idx = 0;
    while (idx < m - 1 && track.samples[idx + 1].s <= hint) idx++;
    lo = Math.max(0, idx - window);
    hi = Math.min(m - 1, idx + window);
  }
  let best = Infinity, bestI = lo;
  for (let i = lo; i <= hi; i++) {
    const p = track.samples[i];
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
    if (d2 < best) { best = d2; bestI = i; }
  }
  return { s: track.samples[bestI].s, dist: Math.sqrt(best), index: bestI };
}

// Can the car stay glued at this point and speed? The normal force the track
// must supply is N/m = v^2 * kappa + g * up_y. It has to be non-negative: on
// flat ground (kappa 0, up_y 1) that is +g, fine; at the top of a loop
// (kappa ~ 1/r, up_y -1) it is v^2/r - g, which needs v >= sqrt(g r) - the
// classic loop-the-loop condition. Below that the car peels off the track.
export function trackStick(track, s, speed, g) {
  const f = sampleTrack(track, s);
  const normal = speed * speed * f.kappa + g * f.uy;
  return normal >= -1e-9;
}

// The minimum speed to hold the track at `s` (0 when gravity alone is enough).
export function trackStickSpeed(track, s, g) {
  const f = sampleTrack(track, s);
  if (f.kappa <= EPS || f.uy >= 0) return 0;
  return Math.sqrt(-g * f.uy / f.kappa);
}

export function createTrackState(s = 0) {
  return { active: false, s, speed: 0, hint: s, released: false, atEnd: false };
}

// Advance the track drive by dt. `input.throttle` is -1..1 (forward positive).
// Gravity acts along the slope (the tangent's own y), so the car is pulled down
// the hill and decelerated up it; boosters (see BOOSTS) add speed so a run can
// make the loop. Mutates and returns `st`.
export function stepTrack(track, st, input = {}, dt = 0, g = 18) {
  const throttle = clamp(input.throttle || 0, -1, 1);
  if (throttle > 0.01) st.speed += TRACK_ACCEL * throttle * dt;
  else if (throttle < -0.01) st.speed += TRACK_ACCEL * throttle * dt;
  else {
    const drop = Math.min(Math.abs(st.speed), TRACK_DRAG * dt);
    st.speed -= Math.sign(st.speed) * drop;
  }
  // Gravity along the slope at the current point.
  const f = sampleTrack(track, st.s);
  st.speed += -g * f.ty * dt;
  // Boosters: a short tunnel that shoves the car forward while it is inside.
  st.speed += boostAt(track, st.s) * dt;
  st.speed = clamp(st.speed, -TRACK_REVERSE, TRACK_MAX);

  st.s += st.speed * dt;
  st.hint = st.s;
  st.atEnd = !track.closed && st.s >= track.length;
  if (!track.closed) {
    if (st.s <= 0) { st.s = 0; if (st.speed < 0) st.speed = 0; }
    if (st.atEnd) st.s = track.length;
  } else {
    st.s = ((st.s % track.length) + track.length) % track.length;
  }
  return st;
}

// ---- Boosters --------------------------------------------------------------
// Defined as fractions of the track length so they stay put through retuning.
// The first shoves the car up the on-ramp and the bedroom-1 climb onto the high
// house tour; the next keeps it quick across the long level tour, and the last
// two drive it down the big hill, through the turnaround and the double loop,
// and onto the launch ramp so it arrives at the lip still at full speed.
export const BOOSTS = [
  { a: 0.040, b: 0.095, push: 80 },   // up the on-ramp + bedroom-1 climb
  { a: 0.715, b: 0.750, push: 80 },   // across the level house tour (closet return)
  { a: 0.835, b: 0.865, push: 90 },   // down the big hill and into the turnaround
  { a: 0.885, b: 0.915, push: 60 },   // through the double loop onto the launch ramp
];

export function boostAt(track, s) {
  const frac = track.length > 0 ? s / track.length : 0;
  for (const b of BOOSTS) {
    if (frac >= b.a && frac <= b.b) return b.push;
  }
  return 0;
}
