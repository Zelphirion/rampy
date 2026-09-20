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
  // Bounded to the OPEN pit only: triggerZ is the mouth lip, triggerZ1 is the
  // back wall of the visible excavation (z=44, where the quarried banks end).
  // Beyond that the tunnel crown is sealed meadow — you can only reach the
  // back of the shaft inside the scripted dive, so nothing there should trip
  // this zone (a car cruising the grass behind/over the shaft never triggers).
  return Math.abs(px - portal.triggerX) < portal.triggerXHalf &&
    pz > portal.triggerZ && pz < portal.triggerZ1;
}

export function isInUndergroundReturnZone(px, pz, tunnelX, tunnelZ, radius) {
  const dx = px - tunnelX;
  const dz = pz - tunnelZ;
  return dx * dx + dz * dz < radius * radius;
}
