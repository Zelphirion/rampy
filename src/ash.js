// Sitting by the fire, and what happens to a car that does it.
//
// Split out from main.js (which owns the meshes) so the RULE can be unit-tested,
// the same way catTemper.js holds the cat's swipe budget. The rule is:
//   - drive into the hearth  -> the car is ash-covered and grey with soot
//   - drive back out of it   -> it goes COMPLETELY BLACK and sheds ash flakes
//                               for a few seconds, then comes back to its own
//                               colour
//
// The black is not a colour, it is an amount. `ashBlack()` returns how black the
// car should be drawn this frame, 0 = its own paint, 1 = pitch black, and
// main.js lerps every material in the car hierarchy towards that. Modelling it as
// a number rather than as two booleans is what lets the recovery be a fade
// instead of a pop, and it is why the car can be grey inside the hearth and
// black outside it without two separate code paths.
//
// The timer is what makes it reversible. Nothing about the world remembers that
// the car has been in the fire, so if the state machine did not carry a countdown
// the car would stay black until the player left the house.

export const ASH_CLEAN = 'clean';       // its own colour
export const ASH_COVERED = 'covered';   // in the hearth: grey with soot
export const ASH_BURNING = 'burning';   // out of the hearth: black, shedding

// How long the car spends black and flaking after it leaves the hearth.
export const ASH_BURN_TIME = 7;
// The tail of that window over which it fades back to its own colour. Below this
// much time left, `ashBlack` starts climbing down from 1 back to 0.
export const ASH_RECOVER = 2.6;
// How grey the car is while it is sitting IN the hearth. Not black: it is ash on
// the paint, and it washes off the moment it drives out into the room.
export const ASH_SOOT = 0.55;

// Flakes per second, scaled by how black the car currently is. Zero while it is
// merely covered, so sitting in the hearth does not fill the room with ash — the
// flakes come off it when the soot is being burnt off, which is the point.
export const ASH_FLAKE_RATE = 70;

// A fresh state: clean, with the burnout timer at zero so a car that has never
// been near the fire has no countdown running.
export function makeAsh() {
  return { mode: ASH_CLEAN, t: 0 };
}

// Is the car inside the hearth box? `r` is the car's radius, so the NOSE trips
// the trigger rather than the centre — driving at the fireplace should catch you
// before you are actually under it.
export function inHearth(hearth, x, z, r = 0) {
  return x + r > hearth.x0 && x - r < hearth.x1 && z + r > hearth.z0 && z - r < hearth.z1;
}

// Advance the state machine by one frame. `inside` is the result of `inHearth`
// for this frame; passing it in keeps this function pure and testable.
//
// The transitions are deliberately hysteretic: `covered` is entered on the way
// in and only left on the way out, and `burning` runs its countdown to zero
// whatever the car does next, so driving straight back in mid-burn does not
// strand the car grey with a dead timer.
export function stepAsh(s, inside, delta) {
  if (inside) {
    // Back in the hearth mid-burnout: the fire wins again, and the countdown
    // starts over when it leaves.
    s.mode = ASH_COVERED;
    s.t = 0;
    return s;
  }
  if (s.mode === ASH_COVERED) {
    s.mode = ASH_BURNING;
    s.t = ASH_BURN_TIME;
    return s;
  }
  if (s.mode === ASH_BURNING) {
    s.t = Math.max(0, s.t - delta);
    if (s.t <= 0) s.mode = ASH_CLEAN;
  }
  return s;
}

// How black to draw the car, 0..1.
export function ashBlack(s) {
  if (s.mode === ASH_COVERED) return ASH_SOOT;
  if (s.mode === ASH_BURNING) return Math.min(1, s.t / ASH_RECOVER);
  return 0;
}

// How fast to shed flakes, per second. Scaled by the black amount so the flakes
// thin out exactly as the fade back to the car's own colour starts.
export function ashFlakeRate(s) {
  if (s.mode !== ASH_BURNING) return 0;
  return ASH_FLAKE_RATE * Math.min(1, s.t / ASH_RECOVER);
}

// Has the car been through it and come out the other side? Used to decide when
// the whole thing can be forgotten — e.g. when the player leaves the house.
export function ashSettled(s) {
  return s.mode === ASH_CLEAN;
}
