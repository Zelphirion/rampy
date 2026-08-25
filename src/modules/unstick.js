// Pure 2D de-penetration helpers: guarantee a circle (the player car body)
// can always be pushed out of solid geometry it somehow ended up overlapping
// (a knock slide, an awkward fall landing, a moving obstacle squeezing it).
//
// Solids are plain data so this module stays testable without three.js:
//   { kind: 'rect',   x, z, hw, hd }   axis-aligned box (a collider)
//   { kind: 'circle', x, z, r }        circle obstacle (fire engine, robot)
// `radius` is the car body radius. All positions are in the same unwrapped
// space as the caller's checks (main.js pre-wraps circle centres).

// Minimal translation to move a circle at (px,pz) out of an axis-aligned
// rect centred (cx,cz) with half-extents hw/hd, or null when separated.
// Pushes along the axis of least penetration (the shortest escape).
export function rectPushOut(px, pz, cx, cz, hw, hd, radius) {
  const dx = px - cx;
  const dz = pz - cz;
  const penX = hw + radius - Math.abs(dx);
  if (penX <= 0) return null;
  const penZ = hd + radius - Math.abs(dz);
  if (penZ <= 0) return null;
  if (penX < penZ) return { dx: (dx >= 0 ? 1 : -1) * penX, dz: 0 };
  return { dx: 0, dz: (dz >= 0 ? 1 : -1) * penZ };
}

// Minimal translation to separate two circles, or null when apart.
export function circlePushOut(px, pz, cx, cz, rSum) {
  const dx = px - cx;
  const dz = pz - cz;
  const d = Math.hypot(dx, dz);
  if (d >= rSum) return null;
  if (d < 1e-6) return { dx: rSum, dz: 0 };   // dead centre: escape along +x
  const k = (rSum - d) / d;
  return { dx: dx * k, dz: dz * k };
}

function pushOutFor(solid, x, z, radius) {
  return solid.kind === 'circle'
    ? circlePushOut(x, z, solid.x, solid.z, solid.r)
    : rectPushOut(x, z, solid.x, solid.z, solid.hw, solid.hd, radius);
}

// True when the circle at (x,z) still overlaps any solid.
export function stillBlocked(solids, x, z, radius) {
  for (const s of solids) {
    if (pushOutFor(s, x, z, radius)) return true;
  }
  return false;
}

// Iteratively push a stuck point out of every solid until it is clear of all
// of them (several passes handle wedges between overlapping obstacles).
// Returns the repaired position plus the unit direction of the last
// correction — the "away from the wall" normal callers use to bounce.
export function resolveStuck(px, pz, solids, radius, maxPasses = 5) {
  let x = px;
  let z = pz;
  let moved = false;
  let nx = 0;
  let nz = 0;
  for (let pass = 0; pass < maxPasses && stillBlocked(solids, x, z, radius); pass++) {
    let ax = 0;
    let az = 0;
    let biggest = null;
    let bigPen = 0;
    for (const s of solids) {
      const p = pushOutFor(s, x, z, radius);
      if (!p) continue;
      ax += p.dx;
      az += p.dz;
      const pen = Math.hypot(p.dx, p.dz);
      if (pen > bigPen) {
        bigPen = pen;
        biggest = p;
      }
    }
    // Opposing walls can cancel the summed push (wedged in a gap narrower
    // than the car). Fall back to the single deepest push so we always make
    // progress toward SOME exit instead of oscillating in place.
    if (Math.hypot(ax, az) < 1e-6 && biggest) {
      ax = biggest.dx;
      az = biggest.dz;
    }
    x += ax;
    z += az;
    moved = true;
    nx = ax;
    nz = az;
  }
  if (!stillBlocked(solids, x, z, radius)) {
    const len = Math.hypot(nx, nz);
    return { x, z, moved, nx: len > 1e-6 ? nx / len : 0, nz: len > 1e-6 ? nz / len : 0 };
  }
  // Last resort for pathological geometry (a spot the car can never fit):
  // ring-search outward for the nearest position the body actually fits in
  // and move there. Guarantees "never stuck" no matter what happened.
  for (let ring = 1; ring <= 30; ring++) {
    const r = ring * 1.1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + ring * 0.37;
      const tx = px + Math.cos(a) * r;
      const tz = pz + Math.sin(a) * r;
      if (!stillBlocked(solids, tx, tz, radius)) {
        return { x: tx, z: tz, moved: true, nx: Math.cos(a), nz: Math.sin(a) };
      }
    }
  }
  return { x, z, moved, nx: 0, nz: 0 };
}

// Normal of the deepest-penetrating surface under the point (null when not
// touching anything). Used to aim the wall-bounce deflection.
export function wallNormal(px, pz, solids, radius) {
  let best = null;
  let bestPen = 0;
  for (const s of solids) {
    const p = pushOutFor(s, px, pz, radius);
    if (!p) continue;
    const pen = Math.hypot(p.dx, p.dz);
    if (pen > bestPen) {
      bestPen = pen;
      best = { nx: p.dx / pen, nz: p.dz / pen };
    }
  }
  return best;
}
