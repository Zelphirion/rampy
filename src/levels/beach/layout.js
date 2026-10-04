import { createClamSite } from '../../clam.js';
import { worldXLo, worldXHi, worldZLo, worldZHi } from '../../modules/world.js';

// ===== Beach World layout =====
//
// The authoritative model for the beach: where the sand is, where the cliffs
// are, where the car is allowed to be, and where the shell sits.
//
// Everything here is plain math with no three.js, because TWO different things
// have to agree on it and neither of them should trust the other:
//   - main.js asks beachGroundOffsetAt() for the car's Y every frame,
//   - index.js walks the same numbers to build the sand mesh and place scenery.
// If the mesh and the drivable surface ever come from different constants the
// car either floats or sinks, so there is exactly one source of truth and it is
// this file.
//
// UNITS. Every Y here is an OFFSET from main.js's `groundHeight`, not an
// absolute height, and every X/Z is a world coordinate. That matches the
// existing contract: main.js sets the car's Y to `groundHeight +
// beachGroundOffsetAt(x, z)`, and the meshes are parented at `groundHeight`
// with these numbers as their local Y.

// ---- The cove ----
// The sea is to the SOUTH (-Z). Sheer cliffs wall the beach in on the north
// (+Z) and on both sides, and the only way out is the one giant seashell lying
// in the sand. Nothing here wraps: the beach is a box, not a torus.
//
// The box is not an arbitrary size - it is THE map. The cliffs stand a few
// units inside the world's own limits so they read as the edge of the world
// rather than as a fence in the middle of it, and the drop-off stands the same
// distance in from the southern edge, which is why the water looks like it goes
// on for ever while the last thing between the car and the dark is a lip.
export const BEACH_MAP_X0 = worldXLo;   // -90, the map's west edge
export const BEACH_MAP_X1 = worldXHi;   // +90, the map's east edge
export const BEACH_MAP_Z0 = worldZLo;   // -90, the map's seaward edge
export const BEACH_MAP_Z1 = worldZHi;   // +123, the map's landward edge

export const BEACH_HALF_W = BEACH_MAP_X1 - 4;   // 86: side cliff faces
export const BEACH_CLIFF_Z = BEACH_MAP_Z1 - 23;  // 100: foot of the back cliff wall
export const BEACH_SEA_Y = 0;         // sea surface, as an offset
export const BEACH_SHORE_Z = 0;       // waterline: sand above this, sea floor below
export const BEACH_SHELF_Z0 = 18;     // flat dry sand starts (the foot of the beach)
export const BEACH_SHELF_Z1 = 34;     // flat dry sand ends (the dunes start)
export const BEACH_DUNES = 34;        // dune ridge starts rising behind the shelf
export const BEACH_SAND_Y = 0.8;      // flat dry sand
export const BEACH_WET_Y = 0.3;       // sand at the waterline
export const BEACH_BERM_Y = 1.7;      // dune crest piled against the back cliff
export const BEACH_CLIFF_FOOT_Y = 3.4;// top of the sand where it meets the cliff
export const BEACH_BASIN_Y = -16;     // deepest water the car can drive into
export const BEACH_RIM_Z = BEACH_MAP_Z0 + 22;   // -68: lip of the offshore drop-off
export const BEACH_TRENCH_Z = BEACH_MAP_Z0 + 2; // -88: floor of the drop-off
export const BEACH_TRENCH_Y = -30;               // the deep water itself
export const BEACH_EDGE_X = BEACH_MAP_X1;        // 90: outer backstop, in the cliffs

// Where you arrive: on the sand BETWEEN the cliffs and the water, facing the
// water, so the whole cove opens up in front of you.
export const BEACH_START = { x: 0, z: 26, yaw: Math.PI };  // yaw PI = facing -Z, the sea

// ---- The one way home ----
// The same scallop you drove in through, bedded in the flat sand east of the
// spawn, so you turn right off the spawn line and drive straight at it.
//
// Two details are copied from the park shell on purpose, because they are what
// keep the drawn shell and the drivable bowl describing the SAME hole:
//   - the default yaw, which is what puts the drawn fan's bisector on world +X
//     (the bowl maths is fixed to +X regardless of yaw, so any other yaw would
//     draw the shell at 90 degrees to the ground the car actually drives on),
//   - being bedded on sand that is dead flat (the shelf), so the shell's bowl is
//     cut for one single ground height, BEACH_SAND_Y.
//
// Approach: the fan's gap faces -X, so the car comes in from the west heading
// east and rolls down onto the umbo - exactly the way the park shell is taken.
export const BEACH_SHELL = createClamSite({
  x: 22, z: 26, umboY: BEACH_SAND_Y - 0.46, surfaceY: BEACH_SAND_Y,
  // Generous enough that rolling to the bottom of the dish always counts as
  // being IN it, but still short of the lip (surfaceHole is 0.765, so the
  // valves never start closing over a car that is still up on the rim).
  triggerR: 0.72,
});

// How far the shell's own hole reaches, so scenery can be kept off it.
export const BEACH_SHELL_REACH = BEACH_SHELL.reach();

// ---- helpers ----
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { const u = clamp01(v); return u * u * (3 - 2 * u); };
const lerp = (a, b, t) => a + (b - a) * t;

// A cheap deterministic hash, so the cliffs look the same every time they are
// built without needing a noise library or a seed passed in from outside.
function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const noise = (a, b) => hash(a, b) * 2 - 1;

// ---- The cliff rock ----
// How far a course of rock stands proud of (inset behind) the cliff's base line.
// Negative is an overhang jutting out over the beach, positive is a recess cut
// back into it. cliffs.js draws this; it lives here because the level's
// colliders have to be placed off it - a barrier set at the base line would let
// the car drive out through the overhanging top courses.
//
// SIGN. This is the local Z of the cliff's front surface, measured in the wall's
// own frame where the face looks down -Z. NEGATIVE therefore means the rock
// stands OUT over the beach and POSITIVE means it has been cut BACK into the
// hill. That is the whole point of the function: the top courses lean out
// (negative), the foot is chewed back (positive), and the middle is sheer.
//
// This convention used to be inverted at the point of use - cliffs.js negated
// the result before using it as a Z, which turned the overhanging lip into a
// recess and the undercut foot into a bulge, and had the level drawing the
// exact opposite of what it describes. Keeping the sign here and using it
// directly is what stops that coming back.
export function courseInset(u, seed = 0) {
  // Undercut base: the sea has taken a bite out of the bottom few metres, which
  // is what leaves the sea caves along a real cliff foot. POSITIVE - the rock is
  // cut back there, so the wall leans out over its own base.
  const undercut = 1.9 * (1 - smooth(u / 0.2));
  // The overhanging lip: the top couple of courses lean right out over
  // everything below them. NEGATIVE - out over the sand.
  const overhang = -4.4 * smooth((u - 0.66) / 0.34);
  // Ledges and ribs all the way up.
  const ledges = noise(u * 9.3 + seed, 4.1) * 1.4;
  return undercut + overhang + ledges;
}

// ---- The lumps ----
//
// The profile above is the SHAPE of the wall. This is its surface: buttresses
// and hollows running the height of it, broken ledges, and the odd block still
// standing proud. It is what turns a smooth extruded profile into rock, and it is
// why the cliff reads as a wall you can pick a handhold on rather than as a
// painted backdrop.
//
// `seed` gives each of the three walls its own arrangement of lumps, so they do
// not look like the same wall copied and rotated. Everything here RECEDES
// (positive) except a small `jut`, which is the only thing that may stick out
// past the profile - and it is bounded, which is what lets CLIFF_REACH below
// put the car barrier at a spot that is guaranteed to be outside every lump.
export function cliffLumps(u, s, seed = 0) {
  // The big shapes: full-height buttresses and the hollows between them.
  const buttress = (0.5 + 0.5 * noise(s * 2.7 + seed, 1.9)) * 3.0;
  // Broken ledges and shelves part way up.
  const shelf = (0.5 + 0.5 * noise(s * 7.3 + seed, 4.7)) * 1.5;
  // Chimneys and gullies, which vary up the wall rather than along it.
  const gully = (0.5 + 0.5 * noise(u * 6.1 + seed, 8.3)) * 1.1;
  // Chips and rubble, small enough to be scale.
  const chip = noise(s * 19.7 + seed, 12.1) * 0.35 + noise(u * 23.0 + seed, 5.5) * 0.3;
  // The one thing allowed to jut. Small, and bounded by CLIFF_JUT below.
  const jut = noise(s * 11.9 + seed, 6.1) * 0.9;
  return buttress + shelf + gully + chip + jut;
}

// The most any lump may stand out past the profile. CLIFF_REACH adds it, and the
// barrier collider is placed from that, so if this is ever raised the barrier
// moves out with it and the car can never end up inside the rock.
export const CLIFF_JUT = 0.9;

// The front surface of the cliff at one point: the profile plus the lumps. This
// is the SINGLE description of where the rock is. cliffs.js draws it and
// CLIFF_REACH is measured from it, so the geometry and the collision barrier
// cannot drift apart.
export const cliffFaceZ = (u, s, seed = 0) => courseInset(u, seed) + cliffLumps(u, s, seed);

// The three walls' seeds. Exported so cliffs.js uses exactly the numbers
// CLIFF_REACH was measured over - a wall drawn with a seed nobody sampled would
// be a wall the barrier was never placed to clear.
export const BEACH_CLIFF_SEEDS = [3.1, 11.7, 14.7];

// The furthest the rock ever reaches out over the beach, and the furthest back
// it ever recedes. `out` is where the barrier collider goes; `back` is how much
// rock there is behind it.
//
// Sampled over the whole face AND over all three walls' seeds, because the wall
// you happen to be nearest is not the one that decides where the car stops.
export const CLIFF_REACH = (() => {
  let out = 0;
  let back = 0;
  for (const seed of BEACH_CLIFF_SEEDS) {
    for (let i = 0; i <= 64; i++) {
      const u = i / 64;
      for (let j = 0; j <= 96; j++) {
        const v = cliffFaceZ(u, j / 96, seed);
        if (-v > out) out = -v;
        if (v > back) back = v;
      }
    }
  }
  return { out, back };
})();

export { hash as cliffHash, noise as cliffNoise };

// How the sea floor falls away from the waterline: it drops away quickly off the
// shelf, then eases out across the long floor of the basin and creeps down all
// the way to the lip. Most of the depth is reached early, so the basin is a
// broad flat pan you can wander about in rather than one long ramp, and the
// last few metres are the shallowest approach to the drop-off - which is what
// makes the lip read as a decision.
// The two halves are scaled to MEET: the first stops at 0.84 and the second
// carries on from 0.84 to 1, rather than the first arriving at 1 and the second
// leaving it. Both are flat at the join (smooth() has zero slope at 0 and 1), so
// the seam is smooth as well as continuous - a step here would be a cliff the
// car slams into on the way down.
function basinCurve(u) {
  if (u < 0.26) return 0.84 * smooth(u / 0.26);
  const k = (u - 0.26) / 0.74;
  return 0.84 + 0.16 * smooth(k);
}

// The height profile straight out to sea, as an offset. Dry sand for z >= 0,
// sea floor for z < 0.
function shoreProfile(z) {
  if (z >= BEACH_CLIFF_Z) return BEACH_CLIFF_FOOT_Y;
  if (z >= BEACH_DUNES) {
    // Berm crest, then the last of it climbing into the cliff foot.
    const u = clamp01((z - BEACH_DUNES) / (BEACH_CLIFF_Z - BEACH_DUNES));
    return BEACH_SAND_Y + (BEACH_BERM_Y - BEACH_SAND_Y) * smooth(u / 0.45) +
      (BEACH_CLIFF_FOOT_Y - BEACH_BERM_Y) * smooth((u - 0.45) / 0.55);
  }
  if (z >= BEACH_SHELF_Z0) return BEACH_SAND_Y;      // the flat shelf
  if (z >= BEACH_SHORE_Z) {
    // Last stretch of dry sand, easing down to the waterline.
    return lerp(BEACH_SAND_Y, BEACH_WET_Y, smooth((BEACH_SHELF_Z0 - z) / BEACH_SHELF_Z0));
  }
  if (z >= BEACH_RIM_Z) {
    return lerp(BEACH_WET_Y, BEACH_BASIN_Y, basinCurve(clamp01((BEACH_SHORE_Z - z) / (BEACH_SHORE_Z - BEACH_RIM_Z))));
  }
  if (z >= BEACH_TRENCH_Z) {
    // The drop-off. Nearly vertical right at the lip so it reads as a precipice
    // rather than a slope, easing as it falls away into the dark.
    const u = clamp01((BEACH_RIM_Z - z) / (BEACH_RIM_Z - BEACH_TRENCH_Z));
    return lerp(BEACH_BASIN_Y, BEACH_TRENCH_Y, Math.pow(u, 0.45));
  }
  return BEACH_TRENCH_Y;
}

// Wind ripples on the dry sand, and a longer swell-scale wobble so the beach
// never reads as a ramp. Amplitude is held well under the collider scale so the
// car does not judder over them.
//
// The ripples are also damped to nothing on the pad around the shell, because
// the shell's bowl is cut for one single ground height (BEACH_SAND_Y). A ripple
// running under the hole would leave a small step where the sand meets the
// valve's rim.
function ripple(x, z) {
  if (z > BEACH_CLIFF_Z) return 0;
  const dry = clamp01((z - BEACH_SHORE_Z) / 10);
  const a = 0.055 + 0.075 * smooth(clamp01((z - BEACH_SHORE_Z) / 26));
  const pad = clamp01((Math.hypot(x - BEACH_SHELL.x, z - BEACH_SHELL.z) - 3) / 5);
  return a * dry * pad *
    (Math.sin(x * 0.52 + z * 0.11) * 0.6 + Math.sin(x * 0.17 - z * 0.4) * 0.4);
}

// How the sand banks up against the side cliffs, so the cove is a bowl rather
// than a ramp with walls bolted on. It carries on underwater too, which does
// two jobs at once: the basin is a bowl the car can drive around instead of a
// flat pan with a step round its edge, and the sand shelves up against the foot
// of the rock so the underwater cliffs look like they are standing in it.
//
// Kept below the cliff foot height so the banks pile against the rock instead of
// climbing over it.
function sideBank(x, z) {
  const k = clamp01((Math.abs(x) - (BEACH_HALF_W - 34)) / 34);
  if (k <= 0) return 0;
  // Fade the bank out as the beach climbs into the back cliff, so the two
  // features meet as one continuous bank of sand.
  const zf = clamp01((z - BEACH_DUNES) / (BEACH_CLIFF_Z - BEACH_DUNES));
  return 1.25 * k * k * (1 - 0.35 * zf);
}

// Height of the drivable sand, as an offset from groundHeight. Inside the
// shell's hole this hands over to the shell's own bowl profile, which is what
// makes the car roll down into the portal instead of onto a flat plate of sand.
export function beachGroundOffsetAt(x, z) {
  return BEACH_SHELL.bowlYAt(x, z, beachSandOffsetAt(x, z));
}

// The sand profile on its own, with the shell's bowl NOT cut in. Used to build
// the mesh's vertices, and by the tests to check the two agree away from the
// hole.
export function beachSandOffsetAt(x, z) {
  return shoreProfile(z) + sideBank(x, z) + ripple(x, z);
}

// ---- Where the car may be ----
// Every barrier in the beach is a collider rather than a slope, because the
// car happily follows a steep height field: the only thing that reliably stops
// it is a wall. The cliffs and the lip of the drop-off are therefore both drawn
// as geometry AND listed here.
//
// `noRoof: true` on all of them is load-bearing: without it main.js's
// buildingTopAt() would report each wall as a rooftop and the car could end up
// driving along the top of the cliffs.
export function beachColliders() {
  const out = [];
  const wall = (x, z, halfW, halfD) => out.push({ x, z, halfW, halfD, noRoof: true });

  // The three land walls. Each one is placed at the FURTHEST that any course of
  // cliff rock ever reaches out over the beach (cliffReach().reachOut), not at
  // the cliff's nominal base line: the overhanging top courses lean out past
  // the face below them, and a wall set at the base line would let the car
  // drive straight through them. Setting the barrier out at the overhang means
  // the car is always held on the open side of every course of rock.
  const backFace = BEACH_CLIFF_Z - CLIFF_REACH.out;
  wall(0, backFace + 3, BEACH_EDGE_X, 3);
  // The side walls run the FULL depth of the map, from past the back cliff to
  // past the seaward edge, because that is how far the rock now runs.
  const sideFace = BEACH_HALF_W - CLIFF_REACH.out;
  const sideFrom = BEACH_CLIFF_Z + 14;
  const sideTo = BEACH_TRENCH_Z - 10;
  const sideMid = (sideFrom + sideTo) / 2;
  const sideHalf = (sideFrom - sideTo) / 2;
  wall(-sideFace + 4, sideMid, 4, sideHalf);
  wall(sideFace - 4, sideMid, 4, sideHalf);
  // The two back corners, where a wall each way leaves a notch wide enough to
  // squeeze out of.
  wall(-(sideFace - 4), backFace + 3, 5, 5);
  wall(sideFace - 4, backFace + 3, 5, 5);
  // The offshore drop-off. This is the one the player meets last: you can drive
  // right down across the whole basin, and this is the lip that stops you leaving
  // it. It stands just inside the map's edge, so everything past it - the
  // trench, the dark, the mermaid - is close enough to see and far enough that
  // nothing in it is reachable.
  wall(0, BEACH_RIM_Z, BEACH_HALF_W + 10, 3);
  // Backstops buried inside the cliffs and out in the trench. Nothing should
  // ever reach these; they exist so a physics edge case cannot put the car in
  // the void, and they are never visible.
  wall(0, BEACH_CLIFF_Z + 30, BEACH_EDGE_X + 30, 8);
  wall(BEACH_MAP_X0 - 14, sideMid, 8, sideHalf + 30);
  wall(BEACH_MAP_X1 + 14, sideMid, 8, sideHalf + 30);
  wall(0, BEACH_MAP_Z0 - 18, BEACH_EDGE_X + 30, 8);
  // The coral heads in the basin, last so they are on top of the list. They are
  // round and they are barriers: noRoof stops a reef reporting standable floor,
  // which would otherwise let the car climb onto the coral.
  for (const c of beachReefColliders()) out.push(c);
  return out;
}

// ---- Scenery that is also solid ----
// Palms and boulders are real obstacles, so each one pushes its own collider.
// They carry an `h` because a boulder IS a surface (a flat car can sit on one);
// a palm is a bare barrier.
export const BEACH_PALMS = [
  [30, 30, 1.0], [40, 22, 0.85], [-36, 34, 1.05], [34, 44, 0.9],
  [-12, 46, 0.8], [8, 40, 0.95], [-42, 12, 0.75], [43, 6, 0.8],
];

export const BEACH_ROCKS = [
  [-33, 22, 1.5], [12, 30, 1.15], [26, 14, 1.7], [-44, 24, 1.3],
  [4, 14, 0.95], [36, 34, 1.25], [-20, 42, 1.05], [-8, 36, 0.8],
  [46, 18, 1.4], [-28, 8, 1.1],
];

// ---- The campfire ----
//
// A fire ring out on the open dry sand, well clear of the rocks, the palms and
// the giant scallop: there is room to drive a full circle around it.
//
// `x/z` is the centre of the ring and the builder hangs everything off it.
// `hearth` is the ash trigger — the scorched patch of sand you can pull onto —
// and `repulse` is where a fire-averse ride gets thrown when it tries to sit in
// the flames.
//
// It deliberately mirrors the house's FIREPLACE field-for-field, because it runs
// through the SAME state machine (src/ash.js): pull into the ring and you go grey
// with soot, drive back out and you go pitch black and shed ash flakes for a few
// seconds. Nothing about the beach fire is a special case; it is the house hearth
// with the walls taken off.
export const BEACH_CAMPFIRE = {
  x: -14,
  z: 22,
  // 7 across, so the nose trips it before the middle of the car is over the
  // coals — exactly the relationship the house hearth has with its fireplace.
  hearth: { x0: -17.5, x1: -10.5, z0: 18.5, z1: 25.5 },
  repulse: { x: -1, z: 24 },
  // Two flat stones pushed up to the south of it to sit on, and a pair of
  // driftwood sticks leaning in with marshmallows on the ends.
  seats: [[-16.4, 27.6], [-11.6, 27.6]],
};

// ---- The scale of the wildlife ----
//
// A person standing in one of the house's giant chairs is about 7-8 tall - roughly
// twice the width of the car (radius 2.2, so 4.4 across). That chair is the
// yardstick, and PERSON_H is it.
//
// Before this existed the wildlife was built to no scale at all and came out
// smaller than the car, which is the one object in the level whose size is
// fixed and cannot be argued with. A mermaid you cannot tell from a seahorse at
// a distance is not a mermaid.
//
// Sizes are FRACTIONS of a person, never lengths. Two separate mistakes came
// from writing them the other way: the fish were handed their raw fraction as if
// it were a length in metres (so a 0.06 minnow was built six centimetres long),
// and the mermaid came out wrong for an unrelated reason in the builder. One
// table, read through one function, is what stops that: there is nowhere else
// for a size to hide.
//
// A real crab is about a hundredth of a person's height and would be invisible at
// this scale, so the beach crabs are not realistic - they are the SMALLEST thing
// here that still reads as an animal from the car.
export const PERSON_H = 7.5;

export const ANIMAL_SCALE = {
  crab: { frac: 0.27, axis: 'x' },
  // One fraction per entry in critters.js FISH_KINDS, in the same order. The
  // kinds table carries no length of its own: when both did they were two lists
  // of the same numbers, and animalSize() indexed the shorter one.
  fish: { frac: [0.06, 0.10, 0.08, 0.18, 0.26, 0.33], axis: 'x' },
  turtle: { frac: 0.34, axis: 'z' },
  seahorse: { frac: 0.09, axis: 'y' },
  mermaid: { frac: 1.0, axis: 'y' },
};

// The one place a fraction becomes a world size. If a caller needs a length, it
// comes through here - never by multiplying out a literal of its own.
export const animalSize = (kind, variant) => {
  const entry = ANIMAL_SCALE[kind];
  const f = Array.isArray(entry.frac) ? entry.frac[variant] : entry.frac;
  return PERSON_H * f;
};

// The coral heads standing up off the floor of the basin, in the water the car
// drives through. They are the reason the basin is worth driving into rather
// than a straight run at the drop-off: you have to pick a line between them.
//
// They stand ON the sea floor, so `h` is how far the coral rises ABOVE the sand
// at that spot, not an absolute height. Each is built at the sand's own height
// and then scaled, which is what keeps a reef standing on the slope instead of
// hovering over it or sinking into it.
//
// `r` is the collider radius and it is deliberately a little SMALLER than the
// coral's widest flare. A reef wider than its own collider looks like you can
// drive through it; a collider wider than the coral looks like the car is
// bumping into thin air. The flare is the part you steer around by eye, so the
// barrier goes just inside it.
//
// z stays between -18 and -58: below -58 the basin tips over the lip into the
// drop-off, and past the lip nothing is reachable any more. x stays inside the
// side banks so no reef pokes out through the sand wall at the edge of the bowl.
export const BEACH_REEFS = [
  [-38, -22, 6.5, 7.0, 1.1],
  [26, -30, 8.0, 9.0, 2.7],
  [-8, -40, 7.0, 8.0, 4.3],
  [44, -46, 6.0, 7.0, 5.9],
  [-50, -44, 5.5, 6.5, 7.1],
  [12, -54, 6.0, 7.5, 8.8],
];

// The collider a reef actually uses. The coral's widest flare is a little wider
// than this, on purpose: a collider wider than the coral looks like the car is
// bumping into thin air, and the flare is the part you steer around by eye.
//
// This lives here rather than next to the reef geometry so that
// beachColliders() - and therefore the containment test - know about the reefs.
// Reef colliders added anywhere else are colliders the flood fill cannot see,
// which is exactly the kind of thing that lets a later change wall the basin in
// half without anything noticing.
export const REEF_COLLIDER_R = 0.86;
export const beachReefColliders = () =>
  BEACH_REEFS.map(([x, z, r]) => ({ x, z, r: r * REEF_COLLIDER_R, noRoof: true }));

// ---- The shell's hole, for cutting the sand ----
// The fan's own silhouette at the height it crosses the sand. Slightly tighter
// than the true crossing on purpose: that way the sand always overlaps the
// valve's outer skin instead of leaving a hairline gap around it.
//
// `fanOutline` hands the path back in the SHAPE's frame, and the builder
// extrudes the shape -90 deg about X, which maps shape (sx, sy) to world
// (ox + sx, oz - sy). Asked for a mesh at the origin that is world
// (sx, -sy), so Z comes back flipped.
export function beachShellPitPath(shrink = 0.985, segments = 72) {
  return BEACH_SHELL
    .fanOutline(BEACH_SHELL.surfaceHole * shrink, 0, 0, segments)
    .map(([sx, sy]) => [sx, -sy]);
}

// Is a world XZ inside the sand hole?
export function inBeachShellPit(x, z, path = beachShellPitPath()) {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i][0], zi = path[i][1];
    const xj = path[j][0], zj = path[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
