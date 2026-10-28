// Driveable surfaces in the house.
//
// The house was built as a flat floor: everything in it sat at floorY and the
// car could not go up anything. That is fine for a sofa and wrong for a bathtub
// you are supposed to drive into, a surfboard ramp, a dresser with a guitar
// propped against it, a piano mat and a counter you arrive on top of.
//
// So the house grows a list of surfaces, and the frame loop asks this module
// what height the floor is under the car. Everything here is PURE — no THREE, no
// DOM — so the shapes can be unit-tested, which matters because these are the
// numbers the car actually drives on and a wrong one is a car inside a bathtub.
//
// Three kinds, chosen because between them they cover everything the checklist
// asks for:
//
//   pad    A flat rectangle at a height. The tiled rim around the tub, the
//          kitchen counter, the top of a dresser, a piano key.
//   wedge  A ramp rising along one direction. A surfboard, a guitar neck, a
//          collapsed block, the approach to a counter.
//   bowl   A dished depression: lowest at the centre, rising to the rim. The
//          inside of the bathtub, a sand pit, a mixing bowl.
//
// All three are tested the same way — "is (x,z) inside you, and if so how high is
// your surface" — and the car takes the HIGHEST surface it could be standing on.
// Highest, not nearest: the tiled surround round the tub and the tub's own rim
// overlap near the edge, and driving across the tile must hold you up rather than
// dropping you into the bath.
//
// WHAT A HEIGHTFIELD CANNOT DO, AND WHERE THE WALL GOES. A heightfield has no
// vertical. It cannot say "the side of the bathtub is solid", so nothing in here
// tries to: the tub's walls are COLLIDERS (the house builder already pushes rects
// for its walls, and the tub pushes its own), and this module only answers "given
// that you are somehow inside, what height is the floor".
//
// That split is why the surfboard works. The colliders stop the car driving in
// through the side of the tub; the surfboard is a gap in those colliders plus a
// wedge surface carrying you up to the rim; the bowl then does what a bowl does.
// Without the colliders the car would simply drive through the porcelain, which is
// why the bowl's step allowance is deliberately small — the surface system should
// not be the thing holding the tub together.

export const PAD = 'pad';
export const WEDGE = 'wedge';
export const BOWL = 'bowl';

// How far above the car a surface may be and still be driven onto.
//
// Each kind gets the allowance that matches what it physically is. A wedge is a
// ramp: you are on it before you are on it, so it is always enterable. A pad is a
// ledge: it takes a kerb-height step or nothing. A bowl is a dish: it has to be
// low enough that the car is following the curve rather than being teleported up
// a wall, and its allowance is the steepest part of that curve.
//
// `steep` on a bowl is therefore not decoration — it is the number that decides
// whether the inside of the tub is drivable at all. See houseSurfaces.test.mjs.
export function stepAllowance(s) {
  if (s.kind === WEDGE) return Math.abs(s.height || 0) * 1.5 + 0.5;   // it IS a ramp
  if (s.kind === BOWL) return Math.max(0.35, s.steep || 0.35);
  return s.stepUp !== undefined ? s.stepUp : 0.6;                     // a ledge
}

// Surface height under (x,z), or null if the point is not on this surface.
//
// `pad`   { kind, x0, x1, z0, z1, y }
// `wedge` { kind, x, z, runX, runZ, len, width, baseY, height }
//         runX/runZ are the unit vector the surface rises ALONG, len its length
//         along that vector and width across it. `height` is added over the run.
// `bowl`  { kind, x, z, rx, rz, y, depth }
//         Lowest at the centre (y - depth) and at the rim it is `y`. `rx`/`rz`
//         are the rim radii, so the footprint is an ellipse and the falloff is a
//         paraboloid — which is why it reads as a bowl rather than a cone.
export function surfaceAt(s, x, z) {
  if (s.kind === PAD) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) return null;
    return s.y;
  }
  if (s.kind === WEDGE) {
    // A zero len or width would divide by zero below, and NaN fails every
    // comparison in the caller silently — the surface would simply never be
    // found, or worse, would be found at NaN and put the car nowhere. Read it as
    // "this ramp does not exist".
    if (!(s.len > 0) || !(s.width > 0)) return null;
    const dx = x - s.x, dz = z - s.z;
    const along = dx * s.runX + dz * s.runZ;
    const perp = -dx * s.runZ + dz * s.runX;
    if (along < -s.len / 2 || along > s.len / 2) return null;
    if (Math.abs(perp) > s.width / 2) return null;
    const t = (along + s.len / 2) / s.len;
    return s.baseY + (s.height || 0) * t;
  }
  if (s.kind === BOWL) {
    if (!(s.rx > 0) || !(s.rz > 0)) return null;   // same reason as the wedge
    const dx = (x - s.x) / s.rx;
    const dz = (z - s.z) / s.rz;
    const t = Math.hypot(dx, dz);
    if (t > 1) return null;
    // t^2, so the dish is flat-ish in the middle and steep at the rim — a bowl,
    // not a cone. Clamped at the rim so a point exactly on the ellipse reads the
    // rim height rather than dipping through it.
    return s.y - (s.depth || 0) * (1 - t * t);
  }
  return null;
}

// Every surface under (x,z), sorted low to high. Exported because the tests read
// it and because it is the honest way to think about a point that is inside both
// a pad and a bowl.
export function surfacesAt(list, x, z) {
  const out = [];
  for (const s of list) {
    const y = surfaceAt(s, x, z);
    if (y !== null && y !== undefined) out.push(y);
  }
  out.sort((a, b) => a - b);
  return out;
}

// The height of the floor under the car, or null if there is nothing there but the
// house floor.
//
// `fromY` is where the car is now. It is what makes this a "what can I stand on"
// question rather than a "what is under me" one: the car takes the highest
// surface that is NOT above it by more than that surface's step allowance. So
// driving towards the bathtub rim picks the rim up as it arrives, but a surface
// floating overhead does not yank the car into the air.
//
// Returns null when the answer is "the plain floor", so the caller can keep its
// existing `car.position.y = HOUSE.floorY` line and nothing has to change for the
// two hundred square metres of house that have no surfaces on them.
export function houseSurfaceY(list, x, z, fromY) {
  let best = null;
  for (const s of list) {
    const y = surfaceAt(s, x, z);
    if (y === null || y === undefined) continue;
    if (y > fromY + stepAllowance(s)) continue;   // too high to step onto
    if (best === null || y > best) best = y;
  }
  return best;
}

// The highest surface at (x,z) with no regard to how the car got there. This is
// the one you want for a landing: a car that comes down onto the bathtub rim
// should land ON the rim, not pass through it on the way to the bowl below.
//
// Note the difference from houseSurfaceY on purpose. Stepping up is forgiving;
// falling onto something is not.
export function houseLandingY(list, x, z) {
  let best = null;
  for (const s of list) {
    const y = surfaceAt(s, x, z);
    if (y === null || y === undefined) continue;
    if (best === null || y > best) best = y;
  }
  return best;
}

// ---- Skate-bowl launch + containment ---------------------------------------
// A bowl can be marked `launch` (the bathtub is): run the car up its inside wall
// with speed and it pops out over the lip instead of gluing to the curve.
//
// Why a pop is needed at all: the heightfield's dish is steeper near the rim
// than any car can leave — if the car simply went airborne at the surface, the
// rising floor would catch it again on the next frame. So the launch is a
// skate-style lip-pop: the caller lifts the car to the rim and hands it a
// ballistic vertical speed, and the normal airborne branch does the rest.
//
// `x/z` is where the car is now, `prevX/prevZ` where it was last frame, `speed`
// the signed drive speed. The trigger is outward TRAVEL in the bowl's own
// normalised radius: carving a circle inside the dish never launches you, but
// driving up the wall does.
export function bowlLaunchAt(list, x, z, prevX, prevZ, speed) {
  const v = Math.abs(speed);
  for (const s of list) {
    if (s.kind !== BOWL || !s.launch) continue;
    if (v < (s.launchMinSpeed ?? 4)) continue;
    const t = Math.hypot((x - s.x) / s.rx, (z - s.z) / s.rz);
    if (t < (s.launchFrom ?? 0.95) || t > 1.6) continue;
    const pt = Math.hypot((prevX - s.x) / s.rx, (prevZ - s.z) / s.rz);
    if (!(t - pt > 0.004)) continue;          // not travelling outward
    return {
      yVelocity: Math.min(
        s.launchMax ?? 9,
        Math.max(s.launchMinY ?? 6, v * (s.launch ?? 0.8) + 1.5),
      ),
      rimY: s.y,
      bowl: s,
    };
  }
  return null;
}

// Keep a grounded car inside a launch bowl even though its collision circle is
// wider than a bathtub. The porcelain colliders are solid at deck level, but a
// car up on the dish has to be able to climb all the way to the rim — otherwise
// a 2.2-radius car in a 3.6-radius bath can never get above the middle third.
// Returns the corrected x/z, or null when no correction is needed / the point is
// not inside a launch bowl.
export function containInBowl(list, x, z, y, margin = 0.995) {
  // A car on the 0.5 deck is the colliders' job (they release at 0.6, the bath
  // floor). Only a car genuinely on the dish is clamped by the rim.
  if (y <= 0.5) return null;
  for (const s of list) {
    if (s.kind !== BOWL || !s.launch) continue;
    // The boogie board is a real way in and out: don't clamp a car that is over
    // its footprint, or the only exit would be the launch.
    if (s.exit && x >= s.exit.x0 && x <= s.exit.x1 && z >= s.exit.z0 && z <= s.exit.z1) continue;
    const t = Math.hypot((x - s.x) / s.rx, (z - s.z) / s.rz);
    if (t <= margin || t > 1.6) continue;
    const k = margin / t;
    const cx = s.x + (x - s.x) * k;
    const cz = s.z + (z - s.z) * k;
    // Only a car that is actually ON the dish is contained. A car climbing the
    // boogie board is well below the lip height where it crosses the rim, and
    // must not be yanked sideways off the board by this.
    const lip = surfaceAt(s, cx, cz);
    if (lip === null || Math.abs(y - lip) > 0.35) continue;
    return { x: cx, z: cz, t: margin, bowl: s };
  }
  return null;
}

// ---- Builders ------------------------------------------------------------
// Small constructors so a level file reads as a list of things rather than as
// object literals with the axis convention spelled out every time.

// A flat rectangle. `cx/cz` centred, `w` across x and `d` across z.
export function pad(cx, cz, w, d, y, extra = {}) {
  return { kind: PAD, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y, ...extra };
}

// A ramp. `ry` is the compass direction it rises towards in radians about Y
// (0 = +x, PI/2 = +z), which is the same convention as everything else here.
export function wedge(cx, cz, ry, len, width, height, baseY = 0, extra = {}) {
  return {
    kind: WEDGE,
    x: cx, z: cz,
    runX: Math.cos(ry), runZ: Math.sin(ry),
    len, width, baseY, height,
    ...extra,
  };
}

// A dished depression. `y` is the RIM; the floor of it is `y - depth`.
export function bowl(cx, cz, rx, rz, y, depth, extra = {}) {
  return { kind: BOWL, x: cx, z: cz, rx, rz, y, depth, ...extra };
}
