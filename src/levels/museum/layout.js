// ============================================================================
// Inside the Museum — floor plan and the pure surface maths.
// No meshes, no THREE import, so the whole plan (including the ramp and the
// balconies) can be unit-tested in Node (layout.test.mjs).
//
// Two levels, one building:
//
//   * The ATRIUM (south) is the second floor. You arrive through the entrance
//     doors, the runner runs north to the grand portal, and the reception desk
//     sits off to the EAST so driving straight in passes it on your right.
//   * The EXHIBIT HALL (north) is one enormous room: its floor is
//     EXHIBIT.floorY below the atrium. It houses the paint-ladder art exhibit
//     (paint.js) — two hundred ladders and their cans on one huge white drop cloth. You drive down the central ramp
//     from the purple-curtained portal. The ramp's landing spans the whole width
//     of the hall, so at the top of the stairs you can turn either way onto the
//     balconies: open, unrailed ledges at atrium height down both sides and
//     across the far end, with nothing to stop the car sailing off the lip.
//
// The hall is the wide part of the building, and its floor is a perfect square:
// 336 across and 336 deep, with the lobby wing sticking out of its south side.
// MUSEUM_HALL is the hall's (and therefore the building's) envelope; ATRIUM is
// the unchanged lobby.
//
// Axis reminder: the car's nose faces -X at yaw 0, so yaw -PI/2 points it north
// (-Z), which is the way the runner and the portal run.
// ============================================================================

// The building envelope. It is the exhibit hall's footprint: the hall's side
// walls stand proud of the lobby's, which only spans ATRIUM.
export const MUSEUM_HALL = {
  minX: -214, maxX: 214,
  minZ: -292, maxZ: 140,
  wall: 5,
  ceil: 64,
  floorY: 0,                       // the atrium / second floor
  doorGap: { x0: -22, x1: 22, top: 30 },
};

// The lobby wing: the original atrium, unchanged. Everything from ATRIUM_EDGE
// north of it is the wider exhibit hall.
export const ATRIUM = { minX: -130, maxX: 130 };

// The glass entrance vestibule beyond the south doors: real doors open into it,
// and the far end of it is where the way back to the city is.
export const MUSEUM_VESTIBULE = { halfW: 30, z0: 140, z1: 184 };

// Arrival: on the runner, facing north, with the portal straight ahead.
export const MUSEUM_START = { x: 0, z: 118, yaw: -Math.PI / 2 };

// Driving south through the far end of the vestibule goes back to the city. It
// spans the full vestibule width, so there is no side lane that can slip past
// the trigger and through the outer glass.
export const MUSEUM_EXIT = { x0: -28, x1: 28, z0: 168, z1: 178 };

// The atrium ends here; the exhibit hall is everything north of it.
export const ATRIUM_EDGE = 70;

// The deep-crimson runner, from the entrance doors to the portal.
export const RUNNER = { halfW: 15, z0: ATRIUM_EDGE, z1: 140 };

// Reception desk, off to the EAST: a shallow arc whose nearest point is at
// x ≈ 94, so the middle of the atrium stays clear for the run to the portal.
export const RECEPTION = {
  cx: 148, cz: 104, r: 54,
  a0: (150 * Math.PI) / 180,
  a1: (210 * Math.PI) / 180,
  height: 11,
  segments: 18,
};

// Coat check on the west side of the atrium, near the entrance.
export const COAT = { x0: -130, x1: -86, z0: 88, z1: 138, counterZ: 113 };

// The grand portal, dead ahead at the north end of the atrium.
export const PORTAL = { z: ATRIUM_EDGE, halfW: 24, height: 42 };

// The exhibit hall: one huge empty room, a perfect square. The open void is
// 336 x 336; the balconies run 46 deep down each side and 26 deep across the
// far end.
export const EXHIBIT = {
  floorY: -36,
  innerX: 168,         // the open void is x -168..168
  northZ: -292,
  northInnerZ: -266,   // the north balcony occupies z -292..-266
};

// The central ramp down from the portal landing to the exhibit floor. The
// landing is deliberately deep (16 units): the portal's piers stand 4.5 proud of
// the wall at z = ATRIUM_EDGE, and the car needs room to turn round them onto
// the balconies.
export const RAMP = { halfW: 24, zTop: 54, zBottom: -32, yTop: 0, yBottom: EXHIBIT.floorY };

// How far below a surface you have to be before the level treats it as a roof
// over your head rather than the ground under your wheels. It is what lets a car
// in the exhibit hall drive UNDER the ramp and the landing: below the overhang
// by this much, the hall floor is the floor. It is also the snap window a car
// climbing the ramp has to stay inside, so it must be far bigger than one frame
// of climbing (14 u/s up a 23° slope moves 0.1 a frame).
//
// The balcony fascias are walls down to the hall floor, so the pit is a closed
// box: the balconies are only reachable from the landing at atrium height.
export const RAMP_UNDER_CLEARANCE = 3;

// The balconies are open ledges at atrium height: no railings, so the car can
// sail off the inner edge and land on the exhibit floor 36 below. The landing at
// the head of the ramp (z >= RAMP.zTop) spans the full width of the hall, which
// is what connects the top of the stairs to both of them.
export const BALCONY = { innerX: EXHIBIT.innerX, northInnerZ: EXHIBIT.northInnerZ };

// The floor height at a point in the museum, in world y. This is the one place
// that knows the atrium, the ramp, the landings and the deep floor apart; main.js
// and the tests both read it.
//
// `y` is optional and is the height of whatever is asking. Pass it and every
// upstairs slab — the ramp, the landing, the balconies and the atrium — becomes
// a roof as well as a road: a car down in the hall, well below the slab, is told
// to drive on the hall floor and passes UNDER it. Without it (a camera asking
// "where is the ground here?") the slab is the surface.
export function museumSurfaceAt(x, z, y = null) {
  // A car this far below the atrium storey has the slab over its head, not
  // under its wheels. Answering with the storey above instead snapped the car
  // up through the landing (and the balcony fascias) the moment it nosed them
  // from the exhibit floor, so it could climb out of the pit through a wall.
  const underAtrium = y !== null && y < MUSEUM_HALL.floorY - RAMP_UNDER_CLEARANCE;
  if (z >= ATRIUM_EDGE) return underAtrium ? EXHIBIT.floorY : MUSEUM_HALL.floorY;
  // The landing at the head of the ramp spans the full width of the hall, so
  // the top of the stairs opens left and right onto the balconies.
  if (z >= RAMP.zTop) return underAtrium ? EXHIBIT.floorY : MUSEUM_HALL.floorY;
  if (Math.abs(x) >= BALCONY.innerX) return underAtrium ? EXHIBIT.floorY : MUSEUM_HALL.floorY;
  if (z <= BALCONY.northInnerZ) return underAtrium ? EXHIBIT.floorY : MUSEUM_HALL.floorY;
  if (Math.abs(x) <= RAMP.halfW && z >= RAMP.zBottom) {
    const t = (RAMP.zTop - z) / (RAMP.zTop - RAMP.zBottom);
    const rampY = RAMP.yTop + (RAMP.yBottom - RAMP.yTop) * t;
    // The slope is a roof as well as a road: a car down in the hall, well below
    // it, is on the hall floor and drives underneath.
    if (y !== null && y < rampY - RAMP_UNDER_CLEARANCE) return EXHIBIT.floorY;
    return rampY;
  }
  return EXHIBIT.floorY;
}

// True only on the sloping part (not the flat landing above it).
export function museumOnRamp(x, z) {
  return Math.abs(x) <= RAMP.halfW && z < RAMP.zTop && z > RAMP.zBottom;
}
