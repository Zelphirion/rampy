// The automatic quality walk, as a pure engine with no DOM and no THREE, so it
// can be driven headless in a test. main.js feeds it the live `gfx` settings
// and the measured fps each tick; the module owns the hysteresis, the timing
// state (per walk, not per file) and the rung ladder, and returns what should
// change. Nothing in this file touches `far`: draw distance is the one setting
// a player is expected to tune by hand, so the automatic system never moves it
// (`gfx.far` is only ever changed by the slider).
//
// How it behaves:
//  - A sustained dip below GFX_AUTO_FLOOR (25fps) arms the walk; the first cut
//    needs GFX_AUTO_SUSTAIN ms under the floor, then every cooldown period it
//    drops one more rung while the machine is still below GFX_AUTO_TARGET (30).
//  - Once the frame rate has been at or above GFX_AUTO_RISE (40) for
//    GFX_AUTO_RISE_SUSTAIN ms, it hands one rung back at a time (also on the
//    cooldown), all the way up to the user's original settings, which it then
//    restores wholesale. The gap between the cut line (30) and the rise line
//    (40) is deliberate hysteresis so the two directions never fight over a
//    machine sitting on the boundary.
//  - "Max" (gfx.max) disables the walk entirely: the user has asked for the
//    picture whatever the frame rate.
export const GFX_SCALE_MIN = 0.1;

export const GFX_AUTO_FLOOR = 25;          // the dip that arms the walk
export const GFX_AUTO_TARGET = 30;         // what it cuts to reach
export const GFX_AUTO_SUSTAIN = 1000;      // ms under the floor before the first cut
export const GFX_AUTO_RISE = 40;           // fps above which the walk starts climbing back
export const GFX_AUTO_RISE_SUSTAIN = 1500; // ms above the rise line before handing one back
export const GFX_AUTO_COOLDOWN = 1500;     // ms between steps (either direction)

// Most-aggressive-of-each-key is applied cumulatively, so the rungs only ever
// reduce. The bottom rung is the blocky end: a tenth-resolution buffer.
export const GFX_AUTO_LADDER = [
  { scale: 1.0, shadows: true, aa: false },
  { scale: 1.0, shadows: false, aa: false },
  { scale: 0.8, shadows: false, aa: false },
  { scale: 0.65, shadows: false, aa: false },
  { scale: 0.5, shadows: false, aa: false },
  { scale: 0.4, shadows: false, aa: false },
  { scale: 0.32, shadows: false, aa: false },
  { scale: 0.25, shadows: false, aa: false },
  { scale: 0.2, shadows: false, aa: false },
  { scale: 0.16, shadows: false, aa: false },
  { scale: 0.13, shadows: false, aa: false },
  { scale: GFX_SCALE_MIN, shadows: false, aa: false },
];

// One walk's timing/settings state. A fresh create() re-arms a paused walk.
export function gfxQualCreate() {
  return {
    step: -1,        // last rung applied (-1 = the walk has not started)
    base: null,      // the settings the walk reduces FROM (and restores TO)
    lowSince: 0,     // when the current sub-floor dip began
    highSince: 0,    // when the current above-the-rise-line spell began
    lastStep: 0,     // when the last step (either direction) was made
  };
}

// Fold rungs 0..step over the base settings: only scale/shadows/aa ever move,
// never far and never max. Aggression per key accumulates down the rungs.
function ladderFold(base, step) {
  const next = { scale: base.scale, fogTie: base.fogTie, shadows: base.shadows, aa: base.aa };
  for (let i = 0; i <= step; i++) {
    const s = GFX_AUTO_LADDER[i];
    if (s.scale !== undefined) next.scale = Math.min(next.scale, s.scale);
    if (s.shadows !== undefined) next.shadows = next.shadows && s.shadows;
    if (s.aa !== undefined) next.aa = next.aa && s.aa;
  }
  return next;
}

// One tick of the walk. `time` is a millisecond clock (performance.now() in the
// game, a synthetic clock in tests). Returns null when nothing should change,
// or an action for the caller to apply:
//   { apply: next }   -- step down OR hand one rung back; forces max off
//   { restore: base } -- walk finished; restore the user's original settings
export function gfxQualTick(state, gfx, fps, time) {
  if (gfx.max) return null;
  const active = state.step >= 0;
  const cooled = time - state.lastStep >= GFX_AUTO_COOLDOWN;

  // --- Hand quality back ---
  // Only once the walk has actually lowered something. The rise line sits well
  // above the target so a machine hovering at 30-40fps keeps the settings it
  // has instead of flapping between two rungs.
  if (active && fps >= GFX_AUTO_RISE) {
    if (!state.highSince) state.highSince = time;
    if (cooled && time - state.highSince >= GFX_AUTO_RISE_SUSTAIN) {
      state.step--;
      state.lastStep = time;
      state.highSince = 0;
      state.lowSince = 0;
      if (state.step < 0) {
        // Fully recovered: hand the user's own settings back wholesale and
        // retire the walk until the next dip re-arms it.
        const base = state.base;
        state.base = null;
        return { restore: base };
      }
      return { apply: ladderFold(state.base, state.step) };
    }
    return null;
  }
  state.highSince = 0;

  // --- Take quality away ---
  if (fps >= (active ? GFX_AUTO_TARGET : GFX_AUTO_FLOOR)) { state.lowSince = 0; return null; }
  if (!cooled) return null;
  // Arming the walk takes a sustained dip; once it is moving, the cooldown is
  // the only brake, so it can keep stepping down promptly.
  if (!active) {
    if (!state.lowSince) { state.lowSince = time; return null; }
    if (time - state.lowSince < GFX_AUTO_SUSTAIN) return null;
  }
  if (state.step >= GFX_AUTO_LADDER.length - 1) return null;   // already at the floor
  if (!state.base) {
    state.base = { scale: gfx.scale, far: gfx.far, fogTie: gfx.fogTie, shadows: gfx.shadows, aa: gfx.aa };
  }
  state.step++;
  state.lastStep = time;
  state.lowSince = 0;
  return { apply: ladderFold(state.base, state.step) };
}