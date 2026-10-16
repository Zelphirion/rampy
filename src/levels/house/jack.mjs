// ============================================================================
// The playroom Jack-in-the-box - the TIMING behind the surprise.
// ============================================================================
//
// Pure numbers, no THREE, so the whole gag can be stepped and checked headless
// (see jack.test.mjs) the way hotwheels.mjs and playtrain.mjs are. The geometry
// in playroom.js `makeJackInTheBox` reads nothing but `jackPose()`.
//
// The gag, in order:
//   1. you touch the box -> `winding`: the crank on the side turns itself,
//      faster and faster, and the LID STAYS SHUT. That pause is the whole joke.
//   2. `pop`: the lid flies open and the clown shoots out on its spring, well
//      past its resting height (it overshoots), before dropping back onto it.
//   3. `bounce`: it bounces around on the spring for a few seconds.
//   4. `retract`: the spring draws it slowly back down and the lid closes.

export const JACK = {
  wind: 1.9,      // crank turning before the lid flies
  pop: 0.42,      // lid open + clown out, with overshoot
  bounce: 4.6,    // bouncing on the spring
  retract: 2.8,   // drawn slowly back in
};

export const JACK_TOTAL = JACK.wind + JACK.pop + JACK.bounce + JACK.retract;

// Crank revolutions over `wind`.
export const JACK_WIND_TURNS = 6;

// Geometry shared by the pose and the builder.
export const JACK_BOX = { w: 7.6, d: 7.6, h: 8.5 };   // the cube, world units
export const JACK_FLOOR = 0.5;                        // the box's inside floor
export const JACK_SPRING_TUCK = 0.4;                  // spring length, clown hidden
export const JACK_SPRING_FULL = 11;                   // spring length, fully out

const DUR = { winding: JACK.wind, pop: JACK.pop, bounce: JACK.bounce, retract: JACK.retract };
const NEXT = { winding: 'pop', pop: 'bounce', bounce: 'retract', retract: 'idle' };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);

export function createJack() {
  return { phase: 'idle', t: 0, plays: 0 };
}

// Touch the box. Returns true only if that touch STARTED the gag (it is
// ignored while one is already running). The caller arms it again by moving
// away, so sitting on the box does not loop it forever.
export function jackTouch(st) {
  if (st.phase !== 'idle') return false;
  st.phase = 'winding';
  st.t = 0;
  st.plays++;
  return true;
}

// Advance one frame. Returns the name of the phase ENTERED this frame - 'pop',
// 'bounce', 'retract' or 'idle' - or null if nothing changed, so main.js can
// fire the right sound on each beat.
export function jackStep(st, dt) {
  if (st.phase === 'idle') return null;
  st.t += dt;
  let entered = null;
  while (st.phase !== 'idle' && st.t >= DUR[st.phase]) {
    st.t -= DUR[st.phase];
    st.phase = NEXT[st.phase];
    entered = st.phase;
  }
  if (st.phase === 'idle') st.t = 0;
  return entered;
}

// The pose for the current phase:
//   lid    0..1    how far the lid is open
//   out    0..~1.2 how far out the clown is (the spring stretch fraction)
//   crank  rad     total crank rotation
//   sway   rad     how far the clown's head is LEANED SIDEWAYS (off +x)
//   bend   rad     how far the clown's head is LEANED FORWARD (off +z)
//   jiggle 0..1    how hard the box is trembling while it winds
//
// `sway` and `bend` describe where the TOP of the spring has been pushed to,
// in world units. playroom.js curves the spring through the rings between
// those two points and lays the clown over to match, so the clown visibly
// bends forward and to one side - not just tilts rigidly.
export function jackPose(st) {
  const p = st.phase;
  if (p === 'winding') {
    const k = clamp01(st.t / JACK.wind);
    return {
      lid: 0,                                          // STAYS SHUT
      out: 0,
      crank: k * k * JACK_WIND_TURNS * Math.PI * 2,    // winds up to speed
      sway: 0,
      bend: 0,
      jiggle: 0.35 + 0.65 * k,
    };
  }
  if (p === 'pop') {
    const k = clamp01(st.t / JACK.pop);
    // It shoots straight up, then in the last stretch it starts to topple -
    // sideways first, then hard forward - so it comes out then LURCHES.
    const lean = smooth(clamp01((k - 0.45) / 0.55));
    return {
      lid: smooth(clamp01(k / 0.4)),    // slams open in the first 40%
      out: backOut(k),                  // shoots out, overshoots, settles at 1
      crank: JACK_WIND_TURNS * Math.PI * 2,
      sway: lean * 0.55,
      bend: lean * 0.95,
      jiggle: 0,
    };
  }
  if (p === 'bounce') {
    // Bent over at the top, bouncing a couple of times while it paws at the
    // air: the forward bend is the base pose, and both sway and bend throb on
    // top of it with a slow decay.
    const t = st.t;
    const decay = Math.exp(-0.85 * t);
    return {
      lid: 1,
      out: 1 + 0.18 * Math.sin(st.t * 7.5) * decay,
      crank: JACK_WIND_TURNS * Math.PI * 2,
      sway: 0.5 + 0.34 * Math.sin(st.t * 5.1) * decay,
      bend: 0.8 + 0.34 * Math.sin(st.t * 6.4 + 0.7) * decay,
      jiggle: 0,
    };
  }
  if (p === 'retract') {
    const k = clamp01(st.t / JACK.retract);
    const e = smooth(k);
    // Straighten up quickly so the clown fits back through the lid, then get
    // drawn down.
    const straight = 1 - smooth(clamp01(st.t / (JACK.retract * 0.35)));
    return {
      lid: 1 - smooth(clamp01((k - 0.55) / 0.45)),   // shuts near the end
      out: 1 - e,
      crank: JACK_WIND_TURNS * Math.PI * 2,
      sway: 0.55 * straight,
      bend: 0.85 * straight,
      jiggle: 0,
    };
  }
  return { lid: 0, out: 0, crank: 0, sway: 0, bend: 0, jiggle: 0 };
}

// Spring length for a given `out`.
export function springLength(out) {
  const o = out < 0 ? 0 : out;
  return JACK_SPRING_TUCK + (JACK_SPRING_FULL - JACK_SPRING_TUCK) * o;
}

// easeOutBack: overshoots past 1, then settles onto it. c1 = 3 makes the
// overshoot generous - this is a jack-in-the-box, the clown should FLY.
function backOut(k) {
  const c1 = 3, c3 = c1 + 1;
  const x = k - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}
