// logCollision.js — Pure 2D math for Ramp World timber-log collisions.
//
// A log is modeled as a capsule: a segment (its long axis) with a radius.
// This module has no three.js / DOM dependencies so it can be unit-tested
// with `node --test`. physics.js feeds it the live knockable state and
// applies the returned corrections each frame.
//
// The two jobs it does:
//   1. Detect overlap between two log capsules and separate them, so logs
//      never overlap at rest and rolling logs never ghost through each other.
//   2. Transfer momentum: a rolling log that hits a log at rest knocks it
//      into rolling (chain reaction), and bounces off with restitution.

// Closest points between two 2D segments a1->a2 and b1->b2.
// Returns { pax, paz, pbx, pbz, dist }.
export function segmentClosestPoints(a1x, a1z, a2x, a2z, b1x, b1z, b2x, b2z) {
  const d1x = a2x - a1x, d1z = a2z - a1z;
  const d2x = b2x - b1x, d2z = b2z - b1z;
  const rx = a1x - b1x, rz = a1z - b1z;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0; t = 0;
  } else if (a <= 1e-12) {
    s = 0; t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1x * rx + d1z * rz;
    if (e <= 1e-12) {
      t = 0; s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1x * d2x + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const pax = a1x + d1x * s, paz = a1z + d1z * s;
  const pbx = b1x + d2x * t, pbz = b1z + d2z * t;
  return { pax, paz, pbx, pbz, dist: Math.hypot(pax - pbx, paz - pbz) };
}

// Resolve a collision between two log capsules.
//   k, j: { x, z, ax, az, halfLen, radius, vx, vz, rollPower }
//     ax/az = unit axis of the log's long axis (world space)
//     halfLen = half the log length
//     radius = capsule radius
//     vx/vz = current velocity (0 for a log at rest)
//     rollPower = the knock speed this log can impart
// Returns null when the logs don't overlap, otherwise:
//   { kx, kz, jx, jz, kvx, kvz, jvx, jvz, knocked }
//   knocked = true when j was at rest and got knocked into rolling.
export function resolveLogCollision(k, j) {
  const a1x = k.x - k.ax * k.halfLen, a1z = k.z - k.az * k.halfLen;
  const a2x = k.x + k.ax * k.halfLen, a2z = k.z + k.az * k.halfLen;
  const b1x = j.x - j.ax * j.halfLen, b1z = j.z - j.az * j.halfLen;
  const b2x = j.x + j.ax * j.halfLen, b2z = j.z + j.az * j.halfLen;
  const cp = segmentClosestPoints(a1x, a1z, a2x, a2z, b1x, b1z, b2x, b2z);
  const minDist = k.radius + j.radius;
  if (cp.dist >= minDist) return null;
  // Contact normal from k toward j (so vrel > 0 means approaching).
  let nx = cp.pbx - cp.pax, nz = cp.pbz - cp.paz;
  let nl = Math.hypot(nx, nz);
  if (nl < 1e-6) {
    // Segments cross / centres coincide: fall back to centre-to-centre.
    nx = j.x - k.x; nz = j.z - k.z;
    nl = Math.hypot(nx, nz);
    if (nl < 1e-6) { nx = 1; nz = 0; nl = 1; }
  }
  nx /= nl; nz /= nl;
  const pen = minDist - cp.dist;
  // Separate: push each log apart by half the penetration along the normal.
  const kx = k.x - nx * pen * 0.5;
  const kz = k.z - nz * pen * 0.5;
  const jx = j.x + nx * pen * 0.5;
  const jz = j.z + nz * pen * 0.5;
  // Relative approach speed along the normal (positive = approaching).
  const vrel = (k.vx - j.vx) * nx + (k.vz - j.vz) * nz;
  let kvx = k.vx, kvz = k.vz;
  let jvx = j.vx, jvz = j.vz;
  let knocked = false;
  if (vrel > 0) {
    // Knock j: project the normal onto the plane perpendicular to j's axis
    // (matching startFall's 'roll' mode) so j rolls away from the hit — a
    // side bump rolls it straight on, an end-on bump rolls it sideways.
    const along = nx * j.ax + nz * j.az;
    let px = nx - along * j.ax;
    let pz = nz - along * j.az;
    let pl = Math.hypot(px, pz);
    if (pl < 1e-3) { px = -j.az; pz = j.ax; pl = 1; }  // pure end-on: roll sideways
    px /= pl; pz /= pl;
    const jSpeed = Math.min(vrel * 0.85, k.rollPower);
    jvx = px * jSpeed;
    jvz = pz * jSpeed;
    knocked = j.vx === 0 && j.vz === 0;   // was at rest
    // Deflect k: reflect the normal component of k's velocity with
    // restitution so the rolling log bounces off instead of plowing through.
    const vn = k.vx * nx + k.vz * nz;
    const e = 0.55;
    kvx = k.vx - (1 + e) * vn * nx;
    kvz = k.vz - (1 + e) * vn * nz;
  }
  return { kx, kz, jx, jz, kvx, kvz, jvx, jvz, knocked };
}