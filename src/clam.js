// ===== Giant scallop shell in the park: shared numbers =====
//
// The shell is a portal, so the GROUND has to agree with it exactly. Three
// separate places need the same curve:
//   - props.js builds the two valves out of it,
//   - props.js/map.js cut the lawn and the city slab along its silhouette,
//   - main.js uses it as the drivable surface inside the pit.
// If any of them drifts the car ends up driving through the floor or clipping
// the turf, so the numbers live here once and everybody reads them from here.

// World position of the umbo (the point the two valves hinge on).
export const SHELL_X = 22;
export const SHELL_Z = 59.95;
export const SHELL_GRASS = 0.16;   // top of the park's grass slab

export const SHELL_RIBS = 13;      // one rib per ~15 deg of the fan
export const SHELL_SPAN = 1.75;    // half-angle of the fan; 3.5 rad ~ 200 deg
export const SHELL_SQUASH = 0.74;  // a pecten fan is wider than it is deep
export const SHELL_RIBIAMP = 0.1;  // rib depth as a fraction of the radius
export const SHELL_THICK = 0.15;

export const LOWER_SIZE = 2.0;
export const LOWER_FLAT = 0.36;    // squashed: the lower valve is a shallow dish
export const UPPER_SIZE = 2.0;
export const UPPER_FLAT = 1.0;     // the upper valve keeps its full sweep
export const SHELL_UMBO_Y = -0.3;  // the hinge sits under the lawn

export const LOWER_H = LOWER_SIZE * LOWER_FLAT;
export const UPPER_H = UPPER_SIZE * UPPER_FLAT;

// Both valves hinge on the umbo, so the whole open/close animation is one
// rotation of the upper valve about local X: 0 is shut (the upper valve is the
// bottom valve mirrored back over it), PI is the flat-book open position, and
// anything past it leans the upper valve away from the bowl. SHUT is set so the
// upper margin finishes level with the lower one, clamped down on the bowl.
export const SHELL_OPEN = 2.95;
export const SHELL_SHUT = 5.113;

// Where the lower valve crosses each ground surface. Both holes are cut at
// their crossing point, which means the valve is exactly flush with the turf at
// the edge of the lawn hole - no lip to trip over, and no gap for the ground
// behind the shell to show through. The slab hole is a touch wider than its own
// crossing so the shell's outer skin stays tucked inside the earth.
export const T_GRASS_HOLE = Math.acos(1 - (SHELL_GRASS - SHELL_UMBO_Y) / LOWER_H) / (Math.PI * 0.5);
export const T_SLAB_HOLE = Math.acos(1 - (0 - SHELL_UMBO_Y) / LOWER_H) / (Math.PI * 0.5) + 0.013;

// Radius (in world units, before the valve size is applied) inside which the fan
// angle is meaningless and the shell must be treated as fully enclosing. See the
// note on createClamSite's bowlYAt - without it the umbo gets a false wedge cut
// out of it by atan2(0, -0).
const UMBO_DEADZONE = 1e-4;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ===== The reusable part =====
//
// The shell is a portal, and the GROUND has to agree with it exactly. Wherever
// one is planted, four separate places need the same curve:
//   - the level builds the two valves out of it,
//   - the level cuts the ground along its silhouette,
//   - main.js uses bowlYAt as the drivable surface inside the pit,
//   - main.js uses inside as the trigger.
// A site bundles all of that for ONE location, so the park shell and the beach
// shell are the same animal guaranteed to line up.
//
// `surfaceY` is the height of the ground the shell is bedded into, and `umboY`
// where the hinge sits. The gap between them is how deep the bowl is.
export function createClamSite({
  x, z, umboY, surfaceY,
  size = LOWER_SIZE, flat = LOWER_FLAT,
  upperSize = UPPER_SIZE, upperFlat = UPPER_FLAT,
  span = SHELL_SPAN, squash = SHELL_SQUASH,
  ribAmp = SHELL_RIBIAMP, ribs = SHELL_RIBS,
  open = SHELL_OPEN, shut = SHELL_SHUT,
  yaw = Math.PI / 2,
  triggerR = 0.55,
}) {
  const lowerH = size * flat;
  const surfaceHole = Math.acos(clamp01(1 - (surfaceY - umboY) / lowerH)) / (Math.PI * 0.5);
  // A second cut, deeper, for any ground that sits below `surfaceY` (the city
  // slab under the lawn). Opened slightly wider than its own crossing so the
  // valve's outer skin stays tucked inside the earth.
  const deepHole = (deepY) =>
    Math.acos(clamp01(1 - (deepY - umboY) / lowerH)) / (Math.PI * 0.5) + 0.013;

// Height of the bowl in the pit, or the surrounding ground everywhere else.
  // `groundY` lets a caller pass its own ground height - the park's lawn is flat
  // so it just defaults to the shell's own surface, but the beach passes its
  // sand profile so the bowl lines up with dunes and ripples too.
  const bowlYAt = (wx, wz, groundY = surfaceY) => {
    const sx = z - wz;
    const sz = (wx - x) / squash;
    const r = Math.hypot(sx, sz);
    const a = Math.atan2(sx, sz);
    // Close to the umbo the fan angle means nothing - every direction lands on
    // the same lowest point of the dish - so the wedge test only applies out on
    // the rim. Without this guard a point a hair WEST of the umbo has
    // atan2(0, -epsilon) = pi, reads as off the shell, and drops a stripe of turf
    // straight through the middle of the bowl.
    if (r > UMBO_DEADZONE && (a < -span || a > span)) return groundY;
    const sp = r / (size * (1 + ribAmp * shellFlute(a, ribs, span)));
    if (sp >= 1) return groundY;
    const phi = Math.asin(clamp01(sp));
    if (phi >= surfaceHole * Math.PI * 0.5) return groundY;
    return umboY + lowerH * (1 - Math.cos(phi));
  };

  // Is a world XZ in the part of the bowl the car is meant to park in? Kept well
  // clear of the fan's side edges and its shallow lip, so nudging the shell on
  // the sand can't trigger the portal.
  const inside = (wx, wz) => {
    const sx = z - wz;
    const sz = (wx - x) / squash;
    const r = Math.hypot(sx, sz);
    const a = Math.atan2(sx, sz);
    if (r > UMBO_DEADZONE && (a < -span * 0.72 || a > span * 0.72)) return false;
    return r / (size * (1 + ribAmp * shellFlute(a, ribs, span))) < triggerR;
  };

  // Outline of the fan at parameter t, as a 2D polygon for cutting a ground
  // hole. `ox`/`oz` are the world position of the mesh that will use the path:
  // the caller extrudes the shape -90 deg about X, which maps shape (sx, sy) to
  // world (ox + sx, oz - sy), so the path is handed back in that frame.
  const fanOutline = (t, ox, oz, segments = 56) => {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = -span + (i / segments) * 2 * span;
      const r = size * shellRadius(t, a, ribs, span, ribAmp);
      const lx = r * Math.sin(a);                 // local fan width  -> world -Z
      const lz = r * Math.cos(a) * squash;       // local fan depth  -> world +X
      pts.push([x + lz - ox, oz - z + lx]);
    }
    // Close it back down to the umbo, so the hole is the fan's own silhouette
    // rather than a circle - outside the fan there is no shell to look at.
    pts.unshift([x - ox, oz - z]);
    return pts;
  };

  return {
    x, z, umboY, surfaceY, open, shut, yaw,
    size, flat, upperSize, upperFlat, span, squash, ribAmp, ribs,
    lowerH, surfaceHole, deepHole,
    // `holeY` is the extra cut for ground lower than the shell's own surface
    // (the park needs one for the city slab under the lawn).
    holeY: deepHole,
    bowlYAt, inside, fanOutline,
    // Largest world extent of the fan at the surface, for placing scenery clear
    // of the pit.
    reach: (t = surfaceHole) => ({
      x: size * shellRadius(t, 0, ribs, span, ribAmp) * squash,
      z: size * shellRadius(t, span * 0.5, ribs, span, ribAmp),
    }),
  };
}

// The park's shell. props.js, map.js and main.js all read through this, so the
// existing named exports below stay the park's numbers exactly as they were.
export const PARK_CLAM = createClamSite({
  x: SHELL_X, z: SHELL_Z, umboY: SHELL_UMBO_Y, surfaceY: SHELL_GRASS,
});

// How deep the corrugation is at angle `a` across the fan. Even in `a`, so
// there is a rib straight up the middle and a groove down each edge - the same
// layout as a real pecten.
export function shellFlute(a, ribs = SHELL_RIBS, span = SHELL_SPAN) {
  return 0.5 * (1 + Math.cos((a * ribs * Math.PI) / span));
}

// Radial distance of the lower valve's surface at parameter t and angle a,
// measured in the squashed local frame (see the site's bowlYAt).
export function shellRadius(t, a, ribs = SHELL_RIBS, span = SHELL_SPAN, ribAmp = SHELL_RIBIAMP) {
  return Math.sin(t * Math.PI * 0.5) * (1 + ribAmp * shellFlute(a, ribs, span));
}

// Outline of the fan at parameter t for the park's shell, in the MESH's frame.
export function clamFanOutline(t, ox, oz, segments = 56) {
  return PARK_CLAM.fanOutline(t, ox, oz, segments);
}

// Local frame helpers. The shell is yawed 90 deg so its fan opens east onto
// the park-spine road, which makes the world<->local swap a plain swap:
export function shellLocal(wx, wz) {
  return { lx: SHELL_Z - wz, lz: wx - SHELL_X };
}

// The park bowl as a drivable height field: the lower valve's own surface
// inside its pit, and the lawn everywhere else.
export function clamBowlHeightAt(wx, wz) {
  return PARK_CLAM.bowlYAt(wx, wz);
}

export function clamInsideShell(wx, wz) {
  return PARK_CLAM.inside(wx, wz);
}
