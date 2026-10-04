// ============================================================================
// The House — floor plan and dimensions. Pure numbers, no meshes and no THREE
// import, so the plan can be unit-tested in Node (housePlan.test.mjs). The
// builder in ./index.js imports these; nothing here knows about geometry.
//
// The house is a GIANT SQUARE filling the map: the interior is 180 x 180,
// which is the whole x span of the slab and nearly the whole z span, so from
// the road the car is the size of a Matchbox toy. It used to be a 162 x 195
// rectangle — taller than it was wide, which is why the rooms ended up in two
// long thin bands with a cramped walk-in closet in the corner. A square gives
// every room a usable width AND depth, and it is deliberately NOT the same
// shape as the brown-roofed house in the city. This is a silly video game; the
// floor plan is a place to drive around, not an architectural elevation.
//
// Nothing wraps. The city and ramp worlds are toruses; this one is a closed box,
// and main.js turns the wrap off while worldState is 'house'. Being a closed
// box is load-bearing: there is no way out of the house at all any more. The
// front door on the east wall is SHUT AND LOCKED, and the only way back to the
// city is the dark garage off the kitchen.
//
// Floor plan (interior faces; the shell walls sit 3 outside these):
//
//   z =  94  +-------------+-------------+-------------+------------+
//           |  DARK       |   KITCHEN   |   DINING    |   FOYER    |
//           |  GARAGE     |             |             |            |
//           | (the way    +-------------+-------------+   front    |
//           |    out)     |             |             |   door     |
//   z =  46  +-------------+-------------+-------------+---(locked)--+
//           |             |             |             |            |
//           |   LIVING    |    HALL     |             |  BATHROOM  |
//           |   ROOM      |             |             |            |
//   z = -20  +-------------+-------------+-------------+------------+
//           |  BEDROOM 1  |  WALK-IN    |  BEDROOM 2  |   MAIN     |
//           |             |   CLOSET    |             |   CLOSET   |
//   z = -86  +-------------+-------------+-------------+------------+
//
// The DARK GARAGE in the north-west corner is the only way out of the house.
// Its door is off the KITCHEN and there is no other: the wall it shares with
// the living room is solid, and the other two sides are shell. So leaving means
// crossing the whole floor — foyer, dining, kitchen — which is the point of a
// house this size. It is pitch dark in there; all you get is the beckoning
// lamp deep in the back of it, and the car rolls away from the camera into it.
//
// The walk-in closet runs east-west along the south end and opens into BOTH
// bedrooms, so you can drive bedroom 1 -> closet -> bedroom 2 without going
// back through the hall.
// ============================================================================

// The player's car radius in main.js. Doorways are sized against it.
export const CAR_RADIUS = 2.2;

// ---- Overall dimensions ----------------------------------------------------
export const HOUSE = {
  // Interior faces of the shell. 180 x 180 — a square, deliberately.
  minX: -90, maxX: 90,
  minZ: -86, maxZ: 94,
  wall: 3,            // shell wall thickness
  ceil: 30,           // ceiling height
  floorY: 0,
};

// Rooms, as interior rectangles. Every one of these is a real space you can
// drive into; the gaps between them are the wall thickness between them.
//
// The eleven rectangles tile HOUSE's interior exactly — no gaps you can drive
// through, no rooms inside one another. housePlan.test.mjs checks that, along
// with reachability and doorway widths, against these numbers directly.
export const ROOMS = {
  // North band (z 46..94) — four rooms across, west to east.
  darkGarage: { x0: -90, x1: -46, z0: 46, z1: 94 },   // pitch dark; the way out
  kitchen:    { x0: -46, x1: 6,   z0: 46, z1: 94 },
  dining:     { x0: 6,   x1: 52,  z0: 46, z1: 94 },
  foyer:      { x0: 52,  x1: 90,  z0: 46, z1: 94 },   // you arrive here
  // Middle band (z -20..46) — the living room swallows the west half.
  living:     { x0: -90, x1: 6,   z0: -20, z1: 46 },
  hall:       { x0: 6,   x1: 52,  z0: -20, z1: 46 },
  bathroom:   { x0: 52,  x1: 90,  z0: -20, z1: 46 },
  // South band (z -86..-20) — two bedrooms either side of the walk-in.
  bed1:       { x0: -90, x1: -46, z0: -86, z1: -20 },
  walkin:     { x0: -46, x1: 6,   z0: -86, z1: -20 },   // connects bed1 + bed2
  bed2:       { x0: 6,   x1: 52,  z0: -86, z1: -20 },
  closetA:    { x0: 52,  x1: 90,  z0: -86, z1: -20 },   // the main closet
};

// Where the car is put when it arrives. It comes in through the (locked) front
// door at the east end of the north band, so it is dropped in the FOYER facing
// west, into the house.
export const HOUSE_START = { x: 71, z: 70, yaw: 0 };

// The FRONT DOOR: a real door in the east shell wall, at the foyer. It is SHUT
// and LOCKED, and that is the whole point of it — you can see it, walk up to
// it, and it does not open. There is a deadbolt, a hasp and a padlock on it.
// The shell wall itself is continuous behind it, so the door is decoration over
// solid masonry: there is no trigger, no gap and no collider gap anywhere.
export const FRONT_DOOR = {
  wallAxis: 'z',       // it lives in a wall that runs along Z (a constant-x wall)
  at: HOUSE.maxX + HOUSE.wall / 2,
  z0: 58, z1: 78,      // 20 wide, centred on the foyer
  h: 22,               // head height
  inward: -1,          // the room side faces -X
};

// The way OUT. It is a region deep in the dark garage that the car must reach;
// reaching it starts the exit cinematic, where the camera STAYS BACK by the
// kitchen door and the car rolls away west into the dark under its own
// momentum. It then reappears out of the open bay of the brown-roofed house in
// the city.
//
// `dirX/dirZ` is the unit vector the car ROLLS along while the shot plays, and
// `mouthX/mouthZ` is the far end of that roll. Deriving both from the data
// rather than hard-coding a hold time means the shot still works if the box is
// nudged, which is the same reasoning the city-side trigger uses.
export const HOUSE_EXIT = {
  // In the dark garage, hard against the west shell wall.
  x0: -90, x1: -74, z0: 58, z1: 86,
  // Roll west, away from the camera, into the dark.
  dirX: -1, dirZ: 0,
  mouthX: -90, mouthZ: 72,
  // The watch camera. It stands back by the garage door and watches the car go,
  // so the last thing you see is the beckoning light and the back of the car.
  camX: -54, camY: 13, camZ: 72,
  // Kept for reference: where the brown-roofed house's open bay sits. main.js
  // does NOT use these — cityBuildings exports the real apron point and
  // heading from that bay's actual placement.
  cityX: -16.6, cityZ: -43.25, cityYaw: Math.PI,
};

// The drive outside the roller door, in world coordinates. It exists because the
// car really does drive out onto it: the exit shot lets the car roll out under its
// own momentum and only then cuts, so there has to be a surface to roll onto and
// the hedge ring has to be broken to let it past.
//
// The drive runs WEST, i.e. toward smaller x, but x0/x1 are still kept in
// ascending order so the builder's box maths (and the tests) never have to think
// about which end is which. The near end is the shell's INNER face, not its
// outer one, so the drive meets the garage floor at exactly x = minX with no
// strip of bare grass in the doorway for the car to cross.
export const DRIVE = {
  x0: HOUSE.minX - 40,          // far end, out past the hedge line
  x1: HOUSE.minX,               // at the garage floor, flush with the shell's inner face
  z0: HOUSE_EXIT.z0 - 6,        // the door opening, widened
  z1: HOUSE_EXIT.z1 + 6,
};

// The fireplace, and the bit of floor in front of it you can pull onto.
//
// `x/z` is the centre of the stone breast (the builder hangs everything else off
// it), `hearth` is the ash trigger, and `repulse` is where the spider and the
// skateboarder end up when they try to sit in front of the fire — they bounce
// halfway back across the living room instead of catching the soot.
//
// The hearth box is the open floor between the two west sofas and the mouth of
// the firebox: x1 = -75 stops short of the sofas at x -74.7, and z -3..15 fits
// between the sofa at z 2 and the one at z 24. So a car can actually park in it
// without any of it being inside a sofa, and the audit has no new furniture to
// complain about — the apron is a plane, and planes are invisible to it.
export const FIREPLACE = {
  x: ROOMS.living.x0 + 4.5,   // -85.5: the stone breast, hard against the west wall
  z: 8,
  // The stone apron on the floor, flush with the mouth of the firebox.
  hearth: { x0: ROOMS.living.x0 + 7, x1: -75, z0: -3, z1: 15 },
  // Where the fire-averse get thrown back to: roughly halfway across the living
  // room, nose-out, so they bounce off the hearth rather than through it.
  repulse: { x: -42, z: 13 },
};

// Interior walls. Each is one plane between two rooms: `axis` is the way the
// wall runs, `at` its centre on the other axis, `run0..run1` how far it actually
// extends, and `gap` the doorway cut out of it (measured along the run, with the
// height of its lintel). The run is the full extent of the two rooms it
// separates, not just the door — a wall that stops at the doorframe would leave
// the whole rest of the room boundary missing.
export const HOUSE_WALLS = [
  // ---- North band: running along Z between the four rooms ----
  { axis: 'z', at: -46, run0: 46,  run1: 94, gap: { a0: 62, a1: 82, top: 22 } },  // darkGarage | kitchen  <- the ONLY way into the dark garage
  // { axis: 'z', at: 6,   run0: 46,  run1: 94, gap: { a0: 54, a1: 84, top: 22 } },  // kitchen    | dining   (open)
  // { axis: 'z', at: 52,  run0: 46,  run1: 94, gap: { a0: 60, a1: 80, top: 22 } },  // dining     | foyer (open)
  // ---- Middle band: the living room's east wall, and the rooms off the hall ----
  // { axis: 'z', at: 6,   run0: -20, run1: 46, gap: { a0: -6, a1: 18,  top: 22 } }, // living     | hall (open)
  // { axis: 'z', at: 52,  run0: -20, run1: 46, gap: { a0: 0,  a1: 20,  top: 22 } }, // hall       | bathroom (open)
  // ---- South band: the two bedrooms and the walk-in between them ----
  { axis: 'z', at: -46, run0: -86, run1: -20, gap: { a0: -70, a1: -50, top: 22 } }, // bed1 | walkin
  { axis: 'z', at: 6,   run0: -86, run1: -20, gap: { a0: -70, a1: -50, top: 22 } }, // walkin | bed2
  { axis: 'z', at: 52,  run0: -86, run1: -20, gap: { a0: -70, a1: -50, top: 22 } }, // bed2 | closetA
  // ---- Running along X between the bands ----
  // The kitchen|living opening used to start at x=-42, which is 4 off the west
  // shell. There is a solid wall in a room, and it needs a run of counter on it
  // somewhere ??? 4 of wall is not enough for that, so the run ended up standing
  // in the opening. -36..-10 leaves 8 of wall at the west end for it.
  { axis: 'x', at: 46,  run0: -46, run1: 6,  gap: { a0: -36, a1: -10, top: 22 } }, // kitchen | living  (open plan)
  { axis: 'x', at: -20, run0: -90, run1: -46, gap: { a0: -74, a1: -54, top: 22 } }, // bed1   | living
  { axis: 'x', at: -20, run0: -46, run1: 6,  gap: { a0: -30, a1: -10, top: 22 } }, // walkin | living
  { axis: 'x', at: -20, run0: 6,   run1: 52, gap: { a0: 0,   a1: 20,  top: 22 } }, // bed2   | hall
  { axis: 'x', at: -20, run0: 52,  run1: 90, gap: { a0: 58,  a1: 78,  top: 22 } }, // closetA| bathroom
  // ---- Solid walls: boundaries you reach another way ----
  // The dark garage is walled off from the living room. Without this you could
  // drive into the pitch-dark garage straight out of the front room, take the
  // exit trigger at 90 degrees, and skip the entire house.
  { axis: 'x', at: 46,  run0: -90, run1: -46 },
  { axis: 'x', at: 46,  run0: 6,   run1: 52 },    // dining | hall
  { axis: 'x', at: 46,  run0: 52,  run1: 90 },    // foyer  | bathroom
];

// Big furniture, for the minimap. The minimap used to draw the shell and the
// room outlines and nothing else, which on a house this size is a lot of empty
// rectangles — you could not tell the living room from the walk-in closet.
// These are the objects big enough to be landmarks, and the builder places the
// ones marked `built: true` straight from this list so the map cannot drift
// away from the furniture it is describing.
//
// `ry` is the object's facing, in radians, about Y. `w`/`d` are its footprint
// in x and z BEFORE the rotation, so a 90-degree couch is 12 wide and 26 deep
// on the plan. `kind` picks the minimap colour; `label` is optional.
//
// The footprints here are the MARKER's, not the furniture's: housePlan.test.mjs
// wants every item 2.5 clear of its room rectangle, so anything standing flush
// against a wall is drawn a little thinner and pulled in off it. The audit in
// furnitureAudit.test.mjs is what measures the real thing.
export const MAP_ITEMS = [
  // ---- Living room: the big one, and the reason the house reads as huge ----
  { kind: 'sofa',   label: 'sofa',   x: -72, z: 24,  w: 30, d: 13, ry: 0, built: true },
  { kind: 'sofa',   label: 'sofa',   x: -72, z: 2,   w: 24, d: 12, ry: 0, built: true },
  { kind: 'table',  label: 'table',  x: -50, z: 14,  w: 20, d: 15, ry: 0, built: true },
  { kind: 'tv',     label: 'TV',     x: 2.5, z: 32,  w: 2,  d: 20, ry: 0, built: true },
  { kind: 'sofa',   label: 'sofa',   x: -30, z: 36,  w: 22, d: 12, ry: 0, built: true },
  { kind: 'plant',  x: -80, z: 38,  w: 7,  d: 7,  ry: 0, built: true },
  { kind: 'plant',  x: -8,  z: 0,   w: 7,  d: 7,  ry: 0, built: true },
  // ---- Kitchen ----
  { kind: 'fridge', label: 'fridge', x: -40.5, z: 87, w: 6, d: 7,  ry: 0, built: true },
  { kind: 'counter', label: 'counter', x: -19, z: 86, w: 20, d: 9,  ry: 0, built: true },
  { kind: 'stove',  label: 'stove',  x: -2,  z: 86,  w: 9,  d: 9,  ry: 0, built: true },
  { kind: 'counter', label: 'counter', x: -38, z: 65, w: 9,  d: 30, ry: 0, built: true },
  { kind: 'table',  label: 'island', x: -19, z: 64,  w: 20, d: 16, ry: 0, built: true },
  { kind: 'fridge', label: 'fridge', x: -2,  z: 62,  w: 10, d: 9,  ry: 0, built: true },
  // ---- Dining ----
  { kind: 'table',  label: 'table',  x: 27,  z: 70,  w: 24, d: 16, ry: 0, built: true },
  { kind: 'counter', label: 'sideboard', x: 45, z: 85, w: 8, d: 12, ry: 0, built: true },
  // ---- Foyer ----
  { kind: 'table',  label: 'console', x: 83, z: 70,  w: 8,  d: 30, ry: 0, built: true },
  { kind: 'plant',  x: 60, z: 87,  w: 8,  d: 8,  ry: 0, built: true },
  { kind: 'sofa',   label: 'bench', x: 68, z: 53,  w: 20, d: 8,  ry: 0, built: true },
  // ---- Hall ----
  { kind: 'counter', label: 'console', x: 44, z: 10, w: 7, d: 26, ry: 0, built: true },
  { kind: 'table',  label: 'table',  x: 22, z: 6,   w: 20, d: 16, ry: 0, built: true },
  { kind: 'plant',  x: 14, z: 38,  w: 8,  d: 8,  ry: 0, built: true },
  // ---- Bathroom ----
  // Tub moved against the east wall, rim facing west to allow approach from inside room
  { kind: 'tub',    label: 'bath',  x: 74.5, z: 30,  w: 11, d: 26, ry: Math.PI / 2, built: true },
  { kind: 'counter', label: 'sink', x: 86, z: 4,   w: 3,  d: 7,  ry: 0, built: true },
  { kind: 'counter', label: 'WC',    x: 85, z: -13, w: 5,  d: 7.5, ry: 0, built: true },
  // ---- Bedrooms ----
  { kind: 'bed',    label: 'bed',   x: -68, z: -58, w: 26, d: 32, ry: 0, built: true },
  { kind: 'bed',    label: 'bed',   x: 28,  z: -58, w: 26, d: 32, ry: 0, built: true },
  { kind: 'counter', label: 'desk', x: -66, z: -34, w: 10, d: 16, ry: 0, built: true },
  { kind: 'counter', label: 'desk', x: 44,  z: -34, w: 10, d: 16, ry: 0, built: true },
  // ---- Walk-in closet + main closet: runs of wardrobes either side of the aisle ----
  { kind: 'wardrobe', label: 'wardrobes', x: -42.5, z: -36.7, w: 2, d: 22, ry: 0, built: true },
  { kind: 'wardrobe', label: 'wardrobes', x: 2.5,   z: -36.7, w: 2, d: 22, ry: 0, built: true },
  { kind: 'wardrobe', label: 'wardrobes', x: 56,    z: -36.7, w: 3, d: 22, ry: 0, built: true },
  { kind: 'wardrobe', label: 'wardrobes', x: 86,    z: -36.7, w: 3, d: 22, ry: 0, built: true },
  // ---- The dark garage ----
  // Deliberately all pushed against the north and south walls. The car has to
  // roll the length of this room, west, into the exit trigger, so the whole
  // middle band of it is kept clear: anything standing in the way would stop
  // the exit shot short and leave you circling a workbench forever.
  { kind: 'bench',  label: 'workbench', x: -58, z: 88.5, w: 14, d: 5, ry: 0, built: true },
  { kind: 'bench',  label: 'workbench', x: -66, z: 52, w: 20, d: 6, ry: 0, built: true },
  { kind: 'tyres',  x: -54, z: 53,  w: 10,  d: 8,  ry: 0, built: true },
];

// Where the cat may choose to fall asleep, and the spots it wanders between
// while it is awake. Spread across the rooms you can actually reach, so a
// sleeping cat is never somewhere you cannot drive to. Kept well clear of every
// wall (build.test.mjs checks that) and with a 10-wide circle of nothing around
// each one (furnitureAudit.test.mjs checks that — a cat asleep inside a sofa is
// not a placement nit). One spot is in the dark garage on purpose: the one place
// its eyes are the only thing you can see.
export const CAT_SPOTS = [
  { x: -60, z: 32 }, { x: -20, z: 10 }, { x: 30, z: 20 },
  { x: 44, z: -60 }, { x: -52, z: -40 }, { x: -20, z: -70 },
  { x: 13, z: -60 }, { x: 60, z: -75 }, { x: 70, z: 12 },
  { x: 70, z: 70 }, { x: 46, z: 54 }, { x: -20, z: 80 },
  { x: -70, z: 70 },
];
