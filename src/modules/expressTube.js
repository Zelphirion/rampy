// Pure layout math for the Pneumatic Express Tube — a clear glass tube that
// sucks the car off the cavern floor at the open pad near the Glass City's
// south edge (world (12,113)), carries it up to hug the underside of the
// checkerboard ceiling tiles over the obstacle course (y≈28, just under
// CEIL_Y 30), threads a wide arc around the giant magnet that hangs from the
// ceiling at (55,0), then descends back to FLOOR LEVEL and spits the car out
// at the matching open pad in the far south-west corner (world (-53,-28)). This is the same family of code as the spiral
// tunnel ride (a track-following surface), but the tube FORCES the car along
// the path instead of letting it drive. It is bidirectional: the car can be
// grabbed at EITHER mouth (the glass-city pad at s≈0 OR the skate-park pad at
// s≈1, both floor level) and is carried to the far mouth. Grab/ride state
// lives in main.js (expressState) — this module only knows the geometry.
//
// No meshes here — every function returns plain numbers so node --test can
// verify the path invariants, and the level file turns the samples into a
// glass TubeGeometry.

export const EXPRESS_TUBE = {
  R: 1.7,           // tube cross-section radius (the car rides inside the glass)
  GRAB_R: 2.3,      // max horizontal distance from the centre line to grab/ride
  GRAB_YGAP: 2.4,   // max |carY - pathY| vertical window to consider the car "in" the tube
  RIDE_SPEED: 26,   // forced suction speed (world units / second)
  GRAB_S_MAX: 0.06, // grab window at each mouth: near s=0 (intake) or s=1 (skate-park end)
  // Path control points (world coords, local Y with the cavern floor at 0):
  //   intake pad on the open floor at world (12,113) → steep rise up to the
  //   ceiling band at y≈28 (well clear of the Glass City's tower caps, which
  //   stay north at z≥132) → the tube enters the ceiling region (z<48) and
  //   hugs the checkerboard's underside over the course → a wide arc around
  //   the ceiling magnet at (55,0) (passing SOUTH of its hang, keeping ≥10
  //   horizontal units off its centre line) → SW descent that drops the car
  //   at world (-53,-28), facing the skate park at (-97,-78).
  // Under the ceiling region (z<48) the tube centre stays ≤28.0 so the glass
  // (top ≤ 30 = CEIL_Y) never passes through the tiles; the descent stays
  // clear of the Holy Mountain (base radius 34 at (-100,8)) the whole way.
  control: [
    { x: 12, z: 113, y: 0.2 },    // intake pad — open floor, south of Glass City
    { x: 14, z: 109, y: 4 },
    { x: 18, z: 103, y: 11 },
    { x: 23, z: 95, y: 19 },
    { x: 30, z: 86, y: 25 },
    { x: 36, z: 77, y: 28.0 },    // reach the ceiling band north of the course
    { x: 40, z: 67, y: 28.2 },
    { x: 42, z: 57, y: 28.2 },
    { x: 43, z: 48, y: 28.1 },    // enter the ceiling region (z<48) under the tiles
    { x: 46, z: 40, y: 28.0 },
    { x: 52, z: 32, y: 27.9 },
    { x: 61, z: 27, y: 27.8 },
    { x: 70, z: 27, y: 27.7 },    // east end of the under-tiles run
    { x: 78, z: 23, y: 27.6 },
    { x: 80, z: 13, y: 27.4 },    // round the magnet's north-east corner
    { x: 72, z: 4, y: 27.2 },     //   clearest-pass arc around (55,0)
    { x: 66, z: -6, y: 27.0 },
    { x: 57, z: -12, y: 26.8 },   // SOUTH of the magnet now — ≥10 off its centre
    { x: 47, z: -14, y: 26.6 },
    { x: 36, z: -15, y: 26.4 },
    { x: 26, z: -16, y: 25.8 },
    { x: 16, z: -17, y: 24.5 },
    { x: 8, z: -20, y: 21.5 },    // west of the ceiling region — start the descent
    { x: -6, z: -23, y: 14 },
    { x: -20, z: -25, y: 8 },
    { x: -34, z: -26.5, y: 4.2 },
    { x: -44, z: -27, y: 1.4 },
    { x: -53, z: -28, y: 0.2 },   // exit pad — floor level (like the intake) so a
                                  //   grounded car can board the return ride here,
                                  //   facing the skate park at (-97,-78)
  ],
  // Decorative air-jet rings that travel along the tube (the level animates
  // them by re-sampling expressTubePoint).
  RING_COUNT: 9,
};

// Cavern slab bounds the whole layout must stay inside (mirrors the level's
// SLAB constant without importing it — keeps this module dependency-free).
export const SLAB_BOUNDS = { minX: -146, maxX: 146, minZ: -96.5, maxZ: 179.5 };
// Ceiling underside over the course zone (CEIL_Y); the tube must stay below
// it anywhere the checkerboard tiles exist (z < 48).
export const CEIL_Y = 30;

const SAMPLES = 260;

// 1D Catmull-Rom through four values at t ∈ [0,1].
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

let cache = null;

// Resample the Catmull-Rom spline through the control points into SAMPLES+1
// evenly-arc-length-spaced points (each with its normalized `s`). Callers get
// a shared copy — the values are never mutated.
export function expressTubeSamples(force = false) {
  if (cache && !force) return cache;
  const c = EXPRESS_TUBE.control;
  const dense = [];
  const SUB = 24;   // subdivisions per control segment
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)];
    const p1 = c[i];
    const p2 = c[i + 1];
    const p3 = c[Math.min(c.length - 1, i + 2)];
    for (let k = (i === 0 ? 0 : 1); k <= SUB; k++) {
      const t = k / SUB;
      dense.push({
        x: catmull(p0.x, p1.x, p2.x, p3.x, t),
        y: catmull(p0.y, p1.y, p2.y, p3.y, t),
        z: catmull(p0.z, p1.z, p2.z, p3.z, t),
      });
    }
  }
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y, dense[i].z - dense[i - 1].z));
  }
  const total = cum[cum.length - 1] || 1;
  const out = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const target = (total * i) / SAMPLES;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi - 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= target) lo = m;
      else hi = m;
    }
    const seg = (target - cum[lo]) / (cum[hi] - cum[lo] || 1);
    const a = dense[lo];
    const b = dense[hi];
    out.push({
      x: a.x + (b.x - a.x) * seg,
      y: a.y + (b.y - a.y) * seg,
      z: a.z + (b.z - a.z) * seg,
      s: i / SAMPLES,
    });
  }
  cache = out;
  return out;
}

// Total arc length of the tube (world units).
export function expressTubeLength() {
  const S = expressTubeSamples();
  const a = S[0];
  const b = S[S.length - 1];
  let len = 0;
  for (let i = 0; i + 1 < S.length; i++) {
    len += Math.hypot(S[i + 1].x - S[i].x, S[i + 1].y - S[i].y, S[i + 1].z - S[i].z);
  }
  // (arc between first/last sample already counted above; this is just a sanity constant)
  return len || Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

// Point on the tube at normalized offset s ∈ [0,1].
export function expressTubePoint(s) {
  const S = expressTubeSamples();
  const t = Math.max(0, Math.min(1, s)) * (S.length - 1);
  const i = Math.min(S.length - 2, Math.floor(t));
  const f = t - i;
  const a = S[i];
  const b = S[i + 1];
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
    s: a.s + (b.s - a.s) * f,
  };
}

// Unit tangent along the tube at s.
export function expressTubeTangent(s) {
  const S = expressTubeSamples();
  const t = Math.max(0, Math.min(1, s)) * (S.length - 1);
  const i = Math.min(S.length - 2, Math.max(0, Math.floor(t)));
  const a = S[i];
  const b = S[i + 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { tx: dx / l, ty: dy / l, tz: dz / l };
}

// Nearest path position to (px, pz) — horizontal distance only. Returns the
// closest sample plus its arc-length fraction.
export function expressTubeNearest(px, pz) {
  const S = expressTubeSamples();
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < S.length; i++) {
    const dx = px - S[i].x;
    const dz = pz - S[i].z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const p = S[best];
  return { s: p.s, x: p.x, y: p.y, z: p.z, horizDist: Math.sqrt(bestD) };
}