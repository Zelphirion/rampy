// Heading conventions shared between the car and anything placed in the world.
//
// This exists because two different yaw conventions meet at the house door and
// getting them wrong is silent: the car still appears, just facing the wrong
// way. The two are:
//
//   car heading      forward = (-cos ry,  sin ry)
//   building yaw     local +Z (its "front") = (sin yaw, cos yaw)
//
// A building placed with placeCollider/faceHeading therefore has a front axis
// that is NOT the same vector as a car pointing at that same heading. Asking
// "what heading points a car out of this building's front door?" means solving
//
//     -cos ry = sin yaw      sin ry = cos yaw
//
// which gives ry = yaw + PI/2. Getting this wrong is what made the car come out
// of the suburban garage sideways.

// Where a car with this heading is pointing. Matches main.js, which computes
// `const fx = -Math.cos(ry), fz = Math.sin(ry)`.
export function carForward(yaw) {
  return { x: -Math.cos(yaw), z: Math.sin(yaw) };
}

// The world direction a building's local +Z (its front face) points, given the
// yaw it was placed at. Matches the toWorld in cityBuildings.
export function buildingFront(buildingYaw) {
  return { x: Math.sin(buildingYaw), z: Math.cos(buildingYaw) };
}

// The car heading that points out of a building's front face.
export function outwardYaw(buildingYaw) {
  return buildingYaw + Math.PI / 2;
}
