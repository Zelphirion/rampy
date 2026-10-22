// ============================================================================
// City world bounds
// ============================================================================
// The city is a big FINITE rectangle now, not a torus. The original town and
// the railway ring that circles it stayed exactly where they always were; a wide
// outer belt was added all around them, running out to a solid brick boundary
// wall. So the playable rectangle is 4x the old area (each axis doubled) while
// the interesting middle is unchanged.
//
//   old: x -90..90 (180), z -90..123 (213)
//   new: x -180..180 (360), z -180..246 (426)
//
// Coordinates are world x/z (Three.js ground plane). See AGENTS.md for the
// minimap-coordinate conversion, which is unaffected by the resize except for
// the larger numbers.
export const worldXLo = -180;
export const worldXHi = 180;
export const worldXSpan = worldXHi - worldXLo;   // 360
export const worldXHalf = worldXSpan / 2;         // 180

export const worldZLo = -180;
export const worldZHi = 246;
export const worldZSpan = worldZHi - worldZLo;    // 426
export const worldZHalf = worldZSpan / 2;         // 213

export const worldSizeX = worldXSpan;
export const worldSizeZ = worldZSpan;

// ============================================================================
// The ramp world (the portal destination) is a separate, older, PERIODIC world
// whose rolling-hills terrain repeats over the original 180 x 213 span. It still
// wraps as a torus at those legacy bounds, and its player wrap is special-cased
// in main.js. Keep the legacy numbers here so nothing about the ramp changes
// when the city grows.
// ============================================================================
export const RAMP_XLO = -90;
export const RAMP_XHI = 90;
export const RAMP_ZLO = -90;
export const RAMP_ZHI = 123;
export const RAMP_XSPAN = RAMP_XHI - RAMP_XLO;    // 180
export const RAMP_ZSPAN = RAMP_ZHI - RAMP_ZLO;    // 213
export const RAMP_XHALF = RAMP_XSPAN / 2;          // 90
export const RAMP_ZHALF = RAMP_ZSPAN / 2;          // 106.5

// Traffic loops along the road grid, independent of the world edges: it drives
// a 160-long loop so the cars always stay on tarmac in the middle of town.
export const ROAD_HALF = 80;
export const ROAD_SPAN = ROAD_HALF * 2;

// ============================================================================
// The city no longer wraps — driving off an edge used to teleport you to the
// opposite side (a torus). Instead the car is CLAMPED at the boundary (and the
// brick wall physically stops it well before that). These clamp helpers keep the
// old call sites working: they simply pin a coordinate into the playable
// rectangle rather than folding it around.
// ============================================================================
export function wrapCoordX(v) {
  return v < worldXLo ? worldXLo : (v > worldXHi ? worldXHi : v);
}

export function wrapCoordZ(v) {
  return v < worldZLo ? worldZLo : (v > worldZHi ? worldZHi : v);
}

// Shortest-axis delta used to be a wrapped (torus) distance; on a finite world
// it is just the plain difference. Every caller uses this as "distance from a to
// b", so plain subtraction is the correct behaviour now.
export function wrappedDeltaX(a, b) {
  return b - a;
}

export function wrappedDeltaZ(a, b) {
  return b - a;
}

// The ramp world still wraps: keep the original torus maths for it.
export function wrapTorusX(v) {
  return ((v - RAMP_XLO) % RAMP_XSPAN + RAMP_XSPAN) % RAMP_XSPAN + RAMP_XLO;
}

export function wrapTorusZ(v) {
  return ((v - RAMP_ZLO) % RAMP_ZSPAN + RAMP_ZSPAN) % RAMP_ZSPAN + RAMP_ZLO;
}

// Traffic's own little torus along the road grid — unchanged.
export function wrapRoad(v) {
  return ((v + ROAD_HALF) % ROAD_SPAN + ROAD_SPAN) % ROAD_SPAN - ROAD_HALF;
}

export function rectCircleIntersect(px, pz, collider, radius) {
  // A collider carrying `r` is a DISC and is tested as one. Every other
  // collider is a box. This used to assume a box unconditionally, which meant a
  // disc collider fell through as `Math.abs(px - c.x) - ...` and never blocked.
  if (collider.r !== undefined) {
    const dx = px - collider.x;
    const dz = pz - collider.z;
    return dx * dx + dz * dz <= (collider.r + radius) * (collider.r + radius);
  }
  const dx = Math.max(Math.abs(px - collider.x) - collider.halfW, 0);
  const dz = Math.max(Math.abs(pz - collider.z) - collider.halfD, 0);
  return dx * dx + dz * dz <= radius * radius;
}
