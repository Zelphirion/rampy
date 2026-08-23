export function isInVortexReturnZone(px, pz, vortexX, vortexZ, radius) {
  const dx = px - vortexX;
  const dz = pz - vortexZ;
  return dx * dx + dz * dz < radius * radius;
}

export function isInsideLevitationHall(px, pz, building, y) {
  const bx = px - building.x;
  const bz = pz - building.z;
  const inside = Math.abs(bx) < building.w / 2 - 0.5 &&
    Math.abs(bz) < building.d / 2 - 0.5;
  return inside && y < building.h;
}

export function isStillWithinLevitationHall(px, pz, building) {
  const bx = px - building.x;
  const bz = pz - building.z;
  return Math.abs(bx) < building.w / 2 + 1.5 &&
    Math.abs(bz) < building.d / 2 + 1.5;
}

export function isInMineDiveTrigger(px, pz, portal) {
  return Math.abs(px - portal.triggerX) < portal.triggerXHalf &&
    pz > portal.triggerZ;
}

export function isInUndergroundReturnZone(px, pz, tunnelX, tunnelZ, radius) {
  const dx = px - tunnelX;
  const dz = pz - tunnelZ;
  return dx * dx + dz * dz < radius * radius;
}
