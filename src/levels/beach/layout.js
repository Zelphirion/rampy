import { createClamSite, LOWER_SIZE } from '../../clam.js';
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
// The box is not an arbitrary size - it is THE map. The cliffs stand AT the
// world's own limits exactly, so the walled cove IS the edge of the world, and
// the whole map width and depth is driveable sand; the drop-off stands its own
// distance in from the southern edge, which is why the water looks like it goes
// on for ever while the last thing between the car and the dark is a lip.
export const BEACH_MAP_X0 = worldXLo;   // -90, the map's west edge
export const BEACH_MAP_X1 = worldXHi;   // +90, the map's east edge
export const BEACH_MAP_Z0 = worldZLo;   // -90, the map's seaward edge
export const BEACH_MAP_Z1 = worldZHi;   // +123, the map's landward edge

export const BEACH_HALF_W = BEACH_MAP_X1;   // 90: side cliff faces at the world's edge
export const BEACH_CLIFF_Z = BEACH_MAP_Z1;  // 123: foot of the back cliff wall at the edge
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
// How far out to sea the trench floor is actually built. The map's own seaward
// edge is worldZLo (-90) and the trench only reaches BEACH_TRENCH_Z (-88), so
// the floor used to stop barely past the drop-off and the flat sea beyond it was
// nothing but the dark abyss plane. The mermaid castle stands well out past the
// mermaids' patrol, so the sand has to carry on underneath it or the castle
// floats over the void. This is scenery only - the rim collider keeps the car
// landward of the drop-off - so it costs nothing but a few thousand triangles.
//
// It now runs far past the mermaids' castle and far past the camera's own far
// plane, so from the shore the flat deep reads as sea floor going on for ever:
// there is no edge to the sand to catch the eye. The rows step out coarsely
// beyond the trench (see index.js's sandRowStep) because the floor there is dead
// flat, so the extra reach costs almost nothing.
export const BEACH_DEEP_FLOOR_Z = -700;

// The far end of the DRIVABLE deep. The drop-off is no longer a wall: the car
// drives down it and out across the trench floor to the wreck (z -415) and the
// mermaids' castle (z -450). This is where the deep channel is closed off, well
// past both, so the run is bounded rather than running on to the floor's own
// far edge. The camera's keep-in uses it too.
export const BEACH_DEEP_Z = -480;

// Where you arrive: on the sand BETWEEN the cliffs and the water, facing the
// water, so the whole cove opens up in front of you.
export const BEACH_START = { x: 0, z: 26, yaw: Math.PI };  // yaw PI = facing -Z, the sea

// ---- The one way home ----
// The same scallop you drove in through, bedded ALL the way out at the far
// north-east corner of the cove - the very corner of the beach, diagonally
// opposite the sand castle in the south-west - so you turn off the spawn line
// and drive clear across the sand to reach it.
//
// Two details are copied from the park shell on purpose, because they are what
// keep the drawn shell and the drivable bowl describing the SAME hole:
//   - the default yaw, which is what puts the drawn fan's bisector on world +X
//     (the bowl maths is fixed to +X regardless of yaw, so any other yaw would
//     draw the shell at 90 degrees to the ground the car actually drives on),
//   - being bedded on flat sand, so the shell's bowl is cut for one single
//     ground height.
//
// That corner is up on the gentle side bank, not the dead-flat shelf, so the
// shell takes its surface height from the sand ACTUALLY under it (the same bank
// term the ground profile rides) rather than the global BEACH_SAND_Y. Cutting
// the bowl for BEACH_SAND_Y there would leave the pit rim standing proud of the
// bank around it by the whole bank height.
//
// Approach: the fan's gap faces -X, so the car comes in from the west heading
// east and rolls down onto the umbo - exactly the way the park shell is taken.
const SHELL_X = 72, SHELL_Z = 30;
// sideBank()'s bank term at the shell: 0.8 * k^2, with k = (|x| - 46) / 44.
// (The dune fade is 1 this far down the shelf, and the ripples are damped to
// nothing under the shell, so this is the whole local rise.)
const SHELL_BANK = 0.8 * Math.pow(
  Math.min(1, Math.max(0, (Math.abs(SHELL_X) - (BEACH_HALF_W - 44)) / 44)), 2);
const SHELL_GROUND_Y = BEACH_SAND_Y + SHELL_BANK;
export const BEACH_SHELL = createClamSite({
  x: SHELL_X, z: SHELL_Z, umboY: SHELL_GROUND_Y - 0.46, surfaceY: SHELL_GROUND_Y,
  // A touch bigger than the park shell so it reads as the landmark you sail
  // across the sand to - and so a full-size car tucked into the dish still has
  // room when the valves close over it.
  size: LOWER_SIZE * 1.4,
  // Generous enough that rolling to the bottom of the dish always counts as
  // being IN it, but still short of the lip, so the valves never start closing
  // over a car that is still up on the rim.
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
    // The drop-off: the long ramp down off the shelf and out into the deep. It
    // used to be a near-vertical precipice with a collider wall on the lip, so
    // the car could never leave the basin. It is now the way DOWN - a smooth,
    // drivable grade that carries you out to the wreck and the mermaids'
    // castle - so it uses the same eased curve as the rest of the profile.
    const u = clamp01((BEACH_RIM_Z - z) / (BEACH_RIM_Z - BEACH_TRENCH_Z));
    return lerp(BEACH_BASIN_Y, BEACH_TRENCH_Y, smooth(u));
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
  // Fade the ripples to nothing well before the cliff foot rather than cutting
  // them dead on it. A hard cutoff leaves a ~0.11 step where the corrugation
  // ends, right on the map's own edge: the car crests it at speed, goes
  // airborne, and - because an airborne car ignores colliders - flies the seam
  // and wraps across the torus. Ramping them out removes the lip entirely.
  const zFade = clamp01((BEACH_CLIFF_Z - z) / 3);
  if (zFade <= 0) return 0;
  const dry = clamp01((z - BEACH_SHORE_Z) / 10);
  const a = 0.055 + 0.075 * smooth(clamp01((z - BEACH_SHORE_Z) / 26));
  const pad = clamp01((Math.hypot(x - BEACH_SHELL.x, z - BEACH_SHELL.z) - 3) / 5);
  return zFade * a * dry * pad *
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
//
// The climb is kept GENTLE and late-starting on purpose: this is the surface
// the car rides up against the wall, and a steep bank pressed against a collider
// is a wedge - the car noses into it, the sand keeps rising under the body, and
// the only way out is straight back. Long, low and wide, it still reads as a
// bowl while never offering a place to get stuck against the rock.
function sideBank(x, z) {
  const k = clamp01((Math.abs(x) - (BEACH_HALF_W - 44)) / 44);
  if (k <= 0) return 0;
  // Fade the bank out as the beach climbs into the back cliff, so the two
  // features meet as one continuous bank of sand.
  const zf = clamp01((z - BEACH_DUNES) / (BEACH_CLIFF_Z - BEACH_DUNES));
  return 0.8 * k * k * (1 - 0.35 * zf);
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
  return shoreProfile(z) + sideBank(x, z) + ripple(x, z) + sandPileOffsetAt(x, z);
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
// The slice of the cliff's own height that the car body occupies as it noses up
// to the rock. The face spans CLIFF_BOTTOM -40 to CLIFF_TOP 30 (see cliffs.js);
// the sand banks to BEACH_CLIFF_FOOT_Y 3.4, so u ~ 0.60 at the contact and a
// little above it for the car's roof. Sampling cliffFaceZ here - and taking the
// most seaward value - puts the barrier on the rock the car can actually touch,
// not out at the lip leaning over the beach 25 metres up.
const CLIFF_CAR_U0 = 0.60;
const CLIFF_CAR_U1 = 0.66;
const CLIFF_BARRIER_R = 2.0;      // disc radius; big enough to seal between samples
const CLIFF_BARRIER_STEP = 3.0;   // spacing along the run (well under 2R + car)
// The rock's lower courses are chewed back into the hill (a sea cave), so at the
// car's height the face sits BEHIND the map's own edge. The car centre can never
// cross that edge - main.js wraps a car past worldZ 123 / |x| 90 clean across the
// torus - so the barrier is capped just this side of it: the car keeps its nose
// on the rock but its centre stays clear of the seam.
const CLIFF_BARRIER_MAX_FACE = 1.5;

function cliffFaceAtCarHeight(s, seed) {
  let face = Infinity;
  for (let k = 0; k <= 4; k++) {
    const v = cliffFaceZ(CLIFF_CAR_U0 + (CLIFF_CAR_U1 - CLIFF_CAR_U0) * (k / 4), s, seed);
    if (v < face) face = v;   // most seaward = the first thing the car meets
  }
  return face;
}

// Lay a chain of overlapping discs along one cliff face. `from`/`to` are world
// run coordinates; `sFrom`/`sTo` are the run coordinates that map to s=0 and s=1
// in the wall's own frame (matching how cliffs.js places the same wall), and
// `place` turns a run position and a face offset into a world XZ. Each disc is
// centred one radius INTO the rock, so its seaward edge sits flush on the rock
// the player sees. Discs rather than boxes because the face is lumpy: a chain of
// circles follows every buttress and hollow, where axis-aligned boxes would
// either bridge straight over the recesses or leave a diagonal gap at the seam.
function addCliffChain(out, { seed, from, to, sFrom, sTo, place }) {
  const n = Math.max(2, Math.round((to - from) / CLIFF_BARRIER_STEP));
  for (let i = 0; i <= n; i++) {
    const run = from + (to - from) * (i / n);
    const s = (run - sFrom) / (sTo - sFrom);
    const face = Math.min(cliffFaceAtCarHeight(s, seed), CLIFF_BARRIER_MAX_FACE);
    const p = place(run, face, CLIFF_BARRIER_R);
    out.push({ x: p.x, z: p.z, r: CLIFF_BARRIER_R, noRoof: true });
  }
}

export function beachColliders() {
  const out = [];
  const wall = (x, z, halfW, halfD) => out.push({ x, z, halfW, halfD, noRoof: true });

  // The three land walls are the cliffs THEMSELVES: a chain of overlapping discs
  // laid along the actual rock face, at the height the car meets it. The barrier
  // used to stand out at the overhanging lip - six or seven units of invisible
  // wall this side of the rock - which read as a web across the alcove. Now you
  // drive right up to the sandstone and stop against it, nosing in under the
  // overhang exactly as you should.
  const backLen = (BEACH_MAP_X1 + 34) * 2;
  addCliffChain(out, {
    seed: BEACH_CLIFF_SEEDS[0],
    from: -(BEACH_HALF_W + 26), to: BEACH_HALF_W + 26,
    sFrom: -backLen / 2, sTo: backLen / 2,
    place: (x, face, r) => ({ x, z: BEACH_CLIFF_Z + face + r }),
  });
  // The side walls run the FULL depth of the map, from past the back cliff to
  // past the seaward edge, because that is how far the rock runs.
  const sideFrom = BEACH_CLIFF_Z + 14;
  const sideTo = BEACH_TRENCH_Z - 10;
  const sideMid = (sideFrom + sideTo) / 2;
  const sideHalf = (sideFrom - sideTo) / 2;
  for (const sx of [1, -1]) {
    addCliffChain(out, {
      seed: BEACH_CLIFF_SEEDS[sx > 0 ? 1 : 2],
      from: sideTo, to: sideFrom,
      sFrom: sx > 0 ? sideFrom : sideTo,
      sTo: sx > 0 ? sideTo : sideFrom,
      place: (z, face, r) => ({ x: sx * (BEACH_HALF_W + face + r), z }),
    });
  }
  // The offshore drop-off is OPEN. The car drives over the lip and down the ramp
  // (see the profile's own drop-off), out across the deep to the wreck and the
  // mermaids' castle. The old lip wall is gone; the deep run is closed off at its
  // far end and along its flanks instead, so the car is still contained on a meshed
  // floor with nowhere else to be - just a much bigger box.
  const deepFrom = BEACH_TRENCH_Z + 6;
  const deepTo = BEACH_DEEP_Z;
  const deepMid = (deepFrom + deepTo) / 2;
  const deepHalf = (deepFrom - deepTo) / 2;
  // Flanks: stand them on the sand grid's own edge (|x| = BEACH_HALF_W), so the
  // car stops where the visible floor ends rather than out over the void.
  wall(BEACH_HALF_W + 8, deepMid, 8, deepHalf + 20);
  wall(-BEACH_HALF_W - 8, deepMid, 8, deepHalf + 20);
  // Far end: past the castle, deep in the murk.
  wall(0, BEACH_DEEP_Z, BEACH_EDGE_X + 30, 8);
  // Backstops buried inside the cliffs. Nothing should ever reach these; they
  // exist so a physics edge case cannot put the car in the void, and they are
  // never visible.
  wall(0, BEACH_CLIFF_Z + 30, BEACH_EDGE_X + 30, 8);
  wall(BEACH_MAP_X0 - 14, sideMid, 8, sideHalf + 30);
  wall(BEACH_MAP_X1 + 14, sideMid, 8, sideHalf + 30);
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
  // A loose grove along the foot of the back cliff, where palms would actually
  // take hold - these are the trees that fill the space the cove gained when
  // the rock moved back to the map's edge.
  [-66, 110, 1.00], [-44, 116, 1.10], [-20, 112, 0.90], [4, 117, 1.05],
  [28, 113, 0.95], [50, 116, 1.10], [72, 109, 1.00],
  // Fringing the side cliffs.
  [-81, 76, 1.00], [-83, 44, 0.90], [-78, 12, 0.95],
  [81, 80, 1.05], [83, 46, 0.90], [78, 14, 0.95],
  // A few standing out on the open sand.
  [-56, 58, 0.95], [54, 62, 1.00], [-32, 30, 0.85], [46, 34, 0.90],
];

export const BEACH_ROCKS = [
  // Boulders strewn right across the cove, back to front, so the whole shelf is
  // a place to weave through rather than one clump near the waterline.
  [-70, 92, 1.40], [-34, 96, 1.20], [8, 90, 1.50], [44, 92, 1.10],
  [72, 62, 1.30], [-62, 58, 1.15], [-16, 76, 1.00], [32, 74, 1.25],
  [58, 38, 1.05], [-46, 46, 1.20], [16, 50, 0.95], [-74, 24, 1.10],
  [66, 20, 1.00], [-8, 14, 1.05], [38, 22, 1.25], [-26, 6, 0.85],
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
  // Out in the open back sand, so the fire is a destination you drive to across
  // the new space rather than something wedged among the shore rocks.
  x: -2,
  z: 72,
  // 7 across, so the nose trips it before the middle of the car is over the
  // coals — exactly the relationship the house hearth has with its fireplace.
  hearth: { x0: -5.5, x1: 1.5, z0: 68.5, z1: 75.5 },
  repulse: { x: 11, z: 74 },
  // Two flat stones pushed up to the south of it to sit on, and a pair of
  // driftwood sticks leaning in with marshmallows on the ends.
  seats: [[-4.4, 77.6], [0.4, 77.6]],
};

// ---- The sand castle ----
//
// The landmark in the opposite corner of the cove from the giant scallop: a
// full sand castle the car can drive into. It carries NO collider of its own -
// you are meant to be able to drive in through its gateways - and the moment the
// car touches the structure it comes down in a heap. The wreck is a wide, low
// mound that the car simply drives out across.
//
// It sits on the flat shelf in the south-west corner (the seaward-left corner),
// diagonally across from the shell, and `x/z` is the centre of the keep.
export const BEACH_SANDCASTLE = { x: -40, z: 21 };
// The wreck: how wide the collapsed heap spreads and how high it piles. Kept low
// and broad so the car never gets beached on it - the whole point is that you
// drive in, it falls over, and you drive straight back out.
export const SAND_PILE_R = 8.5;
export const SAND_PILE_H = 1.15;

// Whether the castle is currently a heap. The level flips this the frame the car
// touches the standing castle; it never flips back - the castle stays collapsed.
let sandPileActive = false;
export const setSandPile = (on) => { sandPileActive = !!on; };
export const isSandPileDown = () => sandPileActive;

// The bare mound profile, independent of whether the pile is up. Used both to
// build the visible heap and - once `sandPileActive` is set - as part of the
// drivable height, so the mesh the player sees and the surface the car rides
// are the same mound. `smooth` is the same ease the rest of the profile uses, so
// the heap meets the flat sand with no lip.
export function sandPileProfileAt(x, z) {
  const d = Math.hypot(x - BEACH_SANDCASTLE.x, z - BEACH_SANDCASTLE.z);
  if (d >= SAND_PILE_R) return 0;
  return SAND_PILE_H * smooth(1 - d / SAND_PILE_R);
}
export const sandPileOffsetAt = (x, z) => (sandPileActive ? sandPileProfileAt(x, z) : 0);

// ---- The mermaids' castle ----
//
// The landmark the deep is built around: a GIANT version of the very same
// castle model that stands on the sand (`sandcastle.js`'s buildStanding), but
// rendered in pearl-pink, dusted with glitter and ringed with shells and other
// things off the sea floor. It is scenery, not a destination.
//
// It stands well OUT PAST the mermaids: their patrol never leaves x = +-15, and
// the castle sits off to the east side (a large +x) and far further seaward (a
// much more negative z) than they ever swim. It is deep past the drop-off, on the
// flat deep floor, in water the car's rim collider can never let it reach - so
// there is nothing here to drive into and nothing to interact with. You only ever
// see it, tiny and hazy, away out in the distance.
//
// It is placed ~20 castle-lengths from the beach. A castle-length is taken as
// the castle's own width across the curtain walls, 2 * WALL_HALF * scale ~ 23.8,
// so 20 of them is ~476: with x = 50 that lands the keep ~478 units from the
// spawn - right out at the camera's own far plane, a small silhouette in the
// haze and nothing more. The deep floor (BEACH_DEEP_FLOOR_Z) runs far past it so
// it never floats over the void.
//
// `x/z` is the centre of the keep, exactly as BEACH_SANDCASTLE's is.
export const BEACH_MERMAID_CASTLE = { x: 50, z: -450 };
// How much bigger than the drivable sand castle this one is. The sand castle is
// already a full castle at the car's own scale; the giant one is nearly twice
// it, so even through the water and at a distance it reads as a landmark rather
// than as a stray heap of the same masonry.
export const MERMAID_CASTLE_SCALE = 1.7;

// ---- The wreck ----
//
// A huge 1800s sailing ship, broken and heeled right over on the sea floor, out
// in the deep just short of the mermaids' castle so the two read together as the
// drowned end of the cove. Like the castle it is scenery only - it sits in water
// the car's rim collider can never let it reach, carries no collider and has
// nothing to drive into; you only ever see it from the lip, down through the
// water. `x/z` is the ship's midships point, `yaw` its heading (radians) and
// `heel` how far it has rolled over (its 45-ish degree list).
export const BEACH_SHIPWRECK = { x: 12, z: -415, yaw: 0.7, heel: Math.PI / 4 };
// Overall size knob for the whole wreck model, applied on top of a ship already
// modelled at roughly the scale of the giant castle.
export const SHIPWRECK_SCALE = 1.0;

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
