// ===== The Glass City street ghosts, as pure maths =====
//
// The two ghosts drift the glass streets on fixed square loops and drop the car
// at the foot of the candy waterfall when you drive into one. All of that is
// geometry and route arithmetic, so it lives here with no three.js import: the
// meshes stay in glasscity.js, and this file is what the tests drive.
//
// Two rules hold this file together:
//
// 1. THE GHOSTS NEVER CHASE. The route is a constant, not a function of the
//    player, so you can see one coming and choose whether to be caught. Nothing
//    in here reads the player's position - if a future edit needs to, the ride
//    stops being a hazard and becomes a homing missile.
//
// 2. THE ROUTE IS BUILT FROM THE TOWER GRID, NOT TYPED IN. A street lane is the
//    midpoint between two tower columns (or two tower rows), so it is clear of
//    a tower whatever widths the layout loop picked. Hard-coding lane numbers
//    here would be a lie the moment someone respaces the grid.

/** Tower columns and rows, in world x/z. Mirrors glasscity.js's layout. */
export const GLASS_TOWER_COLS = (() => {
  const cols = [];
  for (let x = -126; x <= 134; x += 20) cols.push(x);
  return cols;
})();
export const GLASS_TOWER_ROWS = [134, 152, 170];

/** The Glass City footprint, world z. */
export const GLASS_Z0 = 132;
export const GLASS_Z1 = 173;

/** Midpoints between adjacent towers: the drivable lanes. */
export function streetLanes() {
  const cols = [];
  for (let i = 0; i < GLASS_TOWER_COLS.length - 1; i++) {
    cols.push((GLASS_TOWER_COLS[i] + GLASS_TOWER_COLS[i + 1]) / 2);
  }
  const rows = [];
  for (let i = 0; i < GLASS_TOWER_ROWS.length - 1; i++) {
    rows.push((GLASS_TOWER_ROWS[i] + GLASS_TOWER_ROWS[i + 1]) / 2);
  }
  return { cols, rows };
}

// The one solid thing that sits on a lane: the three tableau shops. (The citadel
// spire is at z=152, between the lanes, and the balloon plaza pops on touch
// rather than blocking, so neither can foul a route.)
export const GLASS_SHOP_SPOTS = [[-96, 143], [-16, 143], [84, 161]];

/** True if a lane centre is occupied by a tableau shop. */
export function laneBlocked(x, z) {
  return GLASS_SHOP_SPOTS.some(([sx, sz]) => sx === x && sz === z);
}

/** True if (x,z) is a lane centre at all - used to assert a route stays on the grid. */
export function isLane(x, z) {
  const { cols, rows } = streetLanes();
  return cols.includes(x) && rows.includes(z);
}

// The two patrol routes. Each is a square of lane centres, chosen so no corner
// lands on a shop: the west ghost runs either side of the tableau at (-16, 143)
// on the z=143 lane, the east ghost keeps clear of the plaza and the (84, 161)
// tableau.
export const GHOST_ROUTES = [
  { tint: 0x9fd8ff, phase: 0.0, legs: [[-36, 143], [-36, 161], [-56, 161], [-56, 143]] },
  { tint: 0xffb0e0, phase: 1.7, legs: [[44, 143], [44, 161], [24, 161], [24, 143]] },
];

/** Ghost touch radius, world units. */
export const GHOST_R = 1.9;
/** Ghost cruise speed, world units per second. */
export const GHOST_SPEED = 13;
/** Seconds a ghost stays parked after delivering the car. */
export const GHOST_RECHARGE = 4.0;
/**
 * How far the ghost notices you. Generous on purpose: a pickup that is easy to
 * miss reads as a bug, and the ghost is the only way out of the glass city.
 */
export const GHOST_REACH = GHOST_R + 3.2;

/** Per-leg lengths of a closed route. */
export function legLengths(legs) {
  return legs.map((p, i) => {
    const q = legs[(i + 1) % legs.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
}

/** Total loop length. */
export function routePerimeter(legs) {
  return legLengths(legs).reduce((a, b) => a + b, 0);
}

/**
 * A walker around a closed route. Pure: create one, call step(dt), read x/z.
 *
 * Speed is constant across legs of different lengths, which is the point of
 * measuring each leg separately - a walker that spends the same time on every
 * leg visibly changes pace at every corner.
 */
export function routeWalker(legs, phase = 0) {
  if (!Array.isArray(legs) || legs.length < 2) throw new Error('routeWalker needs at least two legs');
  const lens = legLengths(legs);
  if (lens.some((l) => l <= 0)) throw new Error('routeWalker got a zero-length leg');
  return {
    leg: 0,
    along: 0,
    recharge: 0,
    phase,
    perimeter: lens.reduce((a, b) => a + b, 0),
    /**
     * Advance `dt` seconds. Returns `{x, z, heading, moved}` while moving, or
     * null while recharging after a pickup.
     */
    step(dt, speed = GHOST_SPEED) {
      if (this.recharge > 0) {
        this.recharge -= dt;
        return null;
      }
      let budget = dt * speed;
      let moved = 0;
      // A big dt can cross several legs in one call, so this has to loop rather
      // than assume it stays on one leg.
      let guard = 0;
      while (budget > 0 && guard++ < 10000) {
        const rem = lens[this.leg] - this.along;
        if (budget < rem) { this.along += budget; moved += budget; budget = 0; }
        else { budget -= rem; moved += rem; this.along = 0; this.leg = (this.leg + 1) % legs.length; }
      }
      const p = legs[this.leg];
      const q = legs[(this.leg + 1) % legs.length];
      const t = this.along / lens[this.leg];
      return {
        x: p[0] + (q[0] - p[0]) * t,
        z: p[1] + (q[1] - p[1]) * t,
        heading: Math.atan2(q[0] - p[0], q[1] - p[1]),
        moved,
      };
    },
  };
}

/**
 * Did the car touch the ghost? Pure, so the pickup radius is pinned by a test
 * rather than by whatever the update loop happens to compare.
 */
export function ghostTouches(ghostX, ghostZ, carX, carZ, carY = 0) {
  // Airborne cars pass overhead: the ghost is a street-level pickup, so a car
  // on the second roof sails over it untouched.
  if (carY > 4) return false;
  const dx = carX - ghostX;
  const dz = carZ - ghostZ;
  return dx * dx + dz * dz < GHOST_REACH * GHOST_REACH;
}