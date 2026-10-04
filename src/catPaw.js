// ============================================================================
// The swat is a FRONT PAWN, not a body-check.
//
// It used to be triggered by distance from the MIDDLE of the cat: you got clawed
// when the car was inside a circle centred on her spine. That is why the swipe
// felt like it only landed once you were under her — by which time she was
// already on top of you and the shove read as a collision rather than as a cat
// putting a paw across you.
//
// What decides it now is the paw. The paw hangs off the SHOULDER, which is well
// forward of the middle of the body, and it sweeps across the front. So the
// region she can reach is a half-disc in FRONT of the shoulders, and nothing
// behind her chest: you get clawed for trying to get past her on either side, or
// for getting in front of her, not for being underneath her.
//
// Everything in here is plain arithmetic on the cat's own dimensions — no THREE,
// no meshes — so the region and the animation can be tested against each other.
// The invariant that matters is at the bottom of the file: the paw tip the
// animation puts on screen has to stay inside the region the swipe claims. If
// those two drift apart, the cat claws cars she never appears to be touching.
// ============================================================================

// The swing as fractions of the whole gesture, so the wind-up, the strike and the
// follow-through can be reasoned about as three named beats instead of three
// magic numbers sprinkled through an animation.
export const SWAT_TIME = 0.34;      // seconds for one wind-up-and-across
export const SWAT_WINDUP = 0.26;    // ...of which this much is the paw going back
export const SWAT_STRIKE = 0.60;    // ...this much is the paw coming down on you

// The lift is a triple rather than a curve, because the paw does two different
// jobs in one gesture and easing between them is what made the old one read as a
// shrug. Cocked: up and BACK, folded against her chest. Struck: forward and
// slightly down, which is the height band a car occupies. Follow-through: still
// out, a touch higher, because the leg is carrying on.
const SWAT_COCKED_LIFT = 0.42;
const SWAT_STRIKE_LIFT = -1.42;
const SWAT_FOLLOW_LIFT = -1.05;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Smoothstep. A paw does not start and stop a swing in one frame.
const smooth = (v) => { const u = clamp01(v); return u * u * (3 - 2 * u); };

// Everything the swat needs from the cat's size. Passed in rather than imported,
// because cat.js owns the three dimensions and a second copy of them here is
// exactly the kind of number that quietly drifts.
export function swatGeometry({ len, limb, wid }) {
  return {
    // Where the paw pivots, in the cat's own frame with +z forward. This is the
    // front hip position, which is what makes the swat a front-limb gesture:
    // measured from the shoulder rather than from the spine, the reach reaches
    // FORWARD of her, which is the whole point of the change.
    shoulderZ: len * 0.26,
    // How far the paw tip can get from the shoulder: the leg, fully straight,
    // which is why it is derived from the limb length instead of being a number
    // of its own. The claw at the end is the only thing past it.
    reach: limb,
    // Half of the sweep across, in radians. A bit over a right angle, so the paw
    // comes past the middle of her chest and finishes on the far side.
    cross: 1.15,
    // The paw itself, so the region is a thing with width rather than a line. Half
    // the cat's width, which is a front paw held out — wide enough that the car
    // being clawed has to overlap the paw and not merely be near it.
    footprint: wid * 0.5,
  };
}

// The cat's local frame: +z is the way she is facing, +x is her left.
//
// A Y rotation of -sin(yaw), cos(yaw) turns a direction of sin(theta), cos(theta)
// (the forward axis, theta = 0) into sin(theta - yaw), cos(theta - yaw) — so the
// world direction of her local +z is sin(yaw), cos(yaw), which is what heading
// is: Math.atan2(nx, nz) for a heading of nx, nz. The two therefore agree, which
// is the only reason this can be written down once and used by both the trigger
// and the animation.
export function toLocal(heading, dx, dz) {
  const c = Math.cos(heading), s = Math.sin(heading);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

// Can the paw reach a car at this offset from her, in her own frame?
//
// A half-disc in front of the shoulder, not a circle round the middle: she claws
// what is in front of her and what is beside her, and nothing at all behind her
// chest, because a front paw does not reach backwards. The lip below the
// shoulder line is the width of the paw and the width of the car — it is what
// catches you when you are level with her ribs rather than out in front.
export function pawReaches(g, lx, lz, playerR) {
  const skin = g.footprint + playerR;
  if (lz < g.shoulderZ - skin) return false;
  return Math.hypot(lx, lz - g.shoulderZ) <= g.reach + skin;
}

// The swing itself: how far across the paw has come, how high it is lifted, and
// how bent the knee is, at `t` seconds into a swat.
//
// `across` is the gesture as a whole, -0.35 fully cocked through 1 at the strike
// and back to 0 as she puts her foot down again. `yaw` is that same gesture
// resolved into the one number the hip takes, in units of `g.cross`: 0 is the paw
// hanging where the stride left it, negative is drawn back on her own side for
// the wind-up, positive is out across her body on the follow-through.
//
// They are separate because the two do NOT peak together, and reading the yaw off
// `across` linearly is what put the cocked paw out at nearly twice the follow-
// through's angle and snapped it sideways on the first frame of the swat.
//
// `side` picks which front paw: +1 is her right, on local +x, -1 is her left.
// `g` is the geometry from swatGeometry(), so the angle the paw is thrown through
// is the same number the reach is measured against.
export function swatPose(t, side, g) {
  const c = clamp01(t / SWAT_TIME);
  let across;
  let u;
  if (c < SWAT_WINDUP) {
    const wind = smooth(c / SWAT_WINDUP);
    across = -0.35 * wind;
    u = -wind;
  } else {
    const out = smooth((c - SWAT_WINDUP) / (SWAT_STRIKE - SWAT_WINDUP));
    const back = smooth((c - SWAT_STRIKE) / (1 - SWAT_STRIKE));
    across = out * (1 - back);
    u = c < SWAT_STRIKE ? 2 * out - 1 : 1 - back;
  }
  const lift = c < SWAT_WINDUP ? SWAT_COCKED_LIFT
    : c < SWAT_STRIKE ? SWAT_STRIKE_LIFT
      : SWAT_FOLLOW_LIFT;
  return {
    across,
    // A negative Y rotation swings the paw toward +x, so the sign has to follow
    // which paw it is — otherwise every swat is thrown with the same leg and the
    // gesture alternates while the model does not.
    yaw: side * u * g.cross,
    lift,
    // The knee stays almost straight through the strike. A swat is a stiff-legged
    // throw, and at this scale a bent knee reads as the cat hugging a foreleg
    // rather than batting something across her path.
    knee: c < SWAT_WINDUP ? 1.15 : 0.22,
  };
}

// Where the paw TIP ends up, in the cat's local frame. This is what the animation
// draws, and the test uses it to prove the drawn paw stays inside pawReaches() —
// so the gesture you watch and the region that hurts you cannot disagree.
export function pawTip(t, side = 1, g) {
  const p = swatPose(t, side, g);
  // The leg hangs from the hip pointing straight down, so the tip starts at
  // (0, -limb, 0) and the two joint rotations carry it from there: y first,
  // which swings it across, then x, which lifts and extends it.
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  const cl = Math.cos(p.lift), sl = Math.sin(p.lift);
  return {
    x: -g.reach * sy,
    y: -g.reach * cy * cl,
    z: -g.reach * cy * sl,
  };
}
