// Pure timing math for the underground's retracting pyramid stairs
// (TODO tasks #27–#29). Deliberately dependency-free (no three.js, no DOM)
// so `node --test` can exercise it directly.
//
// Every tier runs the same cycle: extend → hold out → retract → hold in.
// Neighbouring tiers are offset in phase by `phaseStep` of a full cycle,
// which turns the whole staircase into a slow travelling wave — at any
// instant a contiguous band of tiers is extended, so there is always a
// climbable path up the pyramid.

export const STAIR_CYCLE_DEFAULTS = Object.freeze({
  period: 6,     // seconds per full extend/retract cycle
  outFrac: 0.72, // fraction of the cycle spent out (including both transitions)
  transFrac: 0.12, // fraction spent easing in EACH direction (out and in)
});

// Normalized cycle position τ ∈ [0, 1) for tier `index` at time `t`.
// Tier i leads tier 0 by i·phaseStep of a cycle. Wraps safely for negative t.
export function stepTau(t, index, { period = STAIR_CYCLE_DEFAULTS.period, phaseStep = 0 } = {}) {
  const tau = (t / period + index * phaseStep) % 1;
  return tau < 0 ? tau + 1 : tau;
}

// Smoothstep easing — matches the tunnel-dive ease used elsewhere in-game.
function ease(s) {
  return s * s * (3 - 2 * s);
}

// Extension of a tier at cycle position τ: 0 = fully retracted into the
// cavern wall, 1 = fully extended in place. Windows (fractions of a cycle):
//   [0, transFrac]                 extending (eased 0 → 1)
//   [transFrac, outFrac−transFrac] holding fully out
//   [outFrac−transFrac, outFrac]   retracting (eased 1 → 0)
//   [outFrac, 1]                   holding fully retracted
export function stepExtension(
  tau,
  { outFrac = STAIR_CYCLE_DEFAULTS.outFrac, transFrac = STAIR_CYCLE_DEFAULTS.transFrac } = {}
) {
  const holdEnd = outFrac - transFrac;
  if (tau < transFrac) return ease(tau / transFrac);
  if (tau < holdEnd) return 1;
  if (tau < outFrac) return ease((outFrac - tau) / transFrac);
  return 0;
}

// A tier's collider is only trustworthy while the tier is more than halfway
// out — below that most of its footprint sits inside the wall / its
// neighbours, so the car should fall through (or be stopped by the tier
// behind it) rather than stand on a sliver of ghost step.
export function stepColliderActive(extension, threshold = 0.5) {
  return extension >= threshold;
}
