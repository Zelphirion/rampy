export const worldXLo = -90;
export const worldXHi = 90;
export const worldXSpan = worldXHi - worldXLo;
export const worldXHalf = worldXSpan / 2;

export const worldZLo = -90;
export const worldZHi = 123;
export const worldZSpan = worldZHi - worldZLo;
export const worldZHalf = worldZSpan / 2;

export const worldSizeX = worldXSpan;
export const worldSizeZ = worldZSpan;

export const ROAD_HALF = 80;
export const ROAD_SPAN = ROAD_HALF * 2;

export function wrapCoordX(v) {
  return ((v - worldXLo) % worldXSpan + worldXSpan) % worldXSpan + worldXLo;
}

export function wrapCoordZ(v) {
  return ((v - worldZLo) % worldZSpan + worldZSpan) % worldZSpan + worldZLo;
}

export function wrappedDeltaX(a, b) {
  let d = b - a;
  d = ((d + worldXHalf) % worldXSpan + worldXSpan) % worldXSpan - worldXHalf;
  return d;
}

export function wrappedDeltaZ(a, b) {
  let d = b - a;
  d = ((d + worldZHalf) % worldZSpan + worldZSpan) % worldZSpan - worldZHalf;
  return d;
}

export function wrapRoad(v) {
  return ((v + ROAD_HALF) % ROAD_SPAN + ROAD_SPAN) % ROAD_SPAN - ROAD_HALF;
}

export function rectCircleIntersect(px, pz, collider, radius) {
  // A collider carrying `r` is a DISC and is tested as one. Every other
  // collider is a box. This used to assume a box unconditionally, which meant a
  // disc collider fell through as `Math.abs(px - c.x) - undefined` = NaN and
  // compared false — so a round collider blocked NOTHING. That quietly applied
  // to the underground's giant platter and to the beach's coral reefs: they
  // were in the list, the containment test could see them, and the car still
  // drove straight through. A collider with a footprint has to block, whatever
  // shape the footprint is.
  if (collider.r !== undefined) {
    const dx = px - collider.x;
    const dz = pz - collider.z;
    const rr = collider.r + radius;
    return dx * dx + dz * dz <= rr * rr;
  }
  const dx = Math.max(Math.abs(px - collider.x) - collider.halfW, 0);
  const dz = Math.max(Math.abs(pz - collider.z) - collider.halfD, 0);
  return dx * dx + dz * dz <= radius * radius;
}
