// The automatic quality walk, as a pure engine with no DOM and no THREE, so it
// can be driven headless in a test. main.js feeds it the live `gfx` settings
// and the measured fps each tick; the module owns the timing state (per walk,
// not per file) and the rung ladder, and returns what should change.
//
// It exists for ONE emergency — a machine that has fallen to a slideshow — and
// it only ever touches TWO settings: RESOLUTION (`scale`) and ANTI-ALIASING
// (`aa`). Draw distance, shadows and the fog tie are the player's business and
// are never moved by the walk (they do not appear in a rung).
//
// How it behaves:
//  - It arms only on a genuinely broken frame rate: below GFX_AUTO_FLOOR
//    (5fps) held for GFX_AUTO_SUSTAIN (5s). Ordinary chugging — 20, 15, even
//    10fps — never trips it.
//  - Once armed, it drops one rung per cooldown while the machine is still
//    below GFX_AUTO_TARGET, so it can claw its way back to a playable rate.
//  - Coming back up it is AGGRESSIVE: once the frame rate holds GFX_AUTO_RISE
//    (40fps) for GFX_AUTO_RISE_SUSTAIN, it hands EVERY rung back at once — a
//    wholesale restore of the player's original picture, not a slow climb.
//  - "Max" (gfx.max) disables the walk entirely: the user has asked for the
//    picture whatever the frame rate.
export const GFX_SCALE_MIN = 0.1;

export const GFX_AUTO_FLOOR = 5;           // the dip that arms the walk (fps)
export const GFX_AUTO_TARGET = 30;         // what it cuts to reach
export const GFX_AUTO_SUSTAIN = 5000;      // ms under the floor before the first cut
export const GFX_AUTO_RISE = 40;           // fps above which the walk restores the picture
export const GFX_AUTO_RISE_SUSTAIN = 1500; // ms above the rise line before the full restore
export const GFX_AUTO_COOLDOWN = 1500;     // ms between steps (going down)

// Only scale and aa: the walk must never move shadows, fog tie or draw
// distance. Most-aggressive-of-the-two is applied cumulatively, so the rungs
// only ever reduce. The bottom rung is the blocky end: a tenth-res buffer.
export const GFX_AUTO_LADDER = [
  { scale: 1.0, aa: false },
  { scale: 0.8, aa: false },
  { scale: 0.65, aa: false },
  { scale: 0.5, aa: false },
  { scale: 0.4, aa: false },
  { scale: 0.32, aa: false },
  { scale: 0.25, aa: false },
  { scale: 0.2, aa: false },
  { scale: 0.16, aa: false },
  { scale: 0.13, aa: false },
  { scale: GFX_SCALE_MIN, aa: false },
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

// Fold rungs 0..step over the base settings: only scale and aa ever move —
// never far, fogTie or shadows. Aggression accumulates down the rungs.
function ladderFold(base, step) {
  const next = { scale: base.scale, aa: base.aa };
  for (let i = 0; i <= step; i++) {
    const s = GFX_AUTO_LADDER[i];
    if (s.scale !== undefined) next.scale = Math.min(next.scale, s.scale);
    if (s.aa !== undefined) next.aa = next.aa && s.aa;
  }
  return next;
}

// One tick of the walk. `time` is a millisecond clock (performance.now() in the
// game, a synthetic clock in tests). Returns null when nothing should change,
// or an action for the caller to apply:
//   { apply: next }   -- step DOWN one rung (forces max off)
//   { restore: base } -- hand every rung back at once; restore the original
export function gfxQualTick(state, gfx, fps, time) {
  if (gfx.max) return null;
  const active = state.step >= 0;
  const cooled = time - state.lastStep >= GFX_AUTO_COOLDOWN;

  // --- Hand quality back (aggressive) ---
  // Once the walk has cut anything, a sustained spell at or above the rise line
  // restores the player's WHOLE picture in one step — no slow climb. The rise
  // line sits well above the target so a machine hovering between them (30-40
  // fps) keeps the rung it is on instead of flapping.
  if (active && fps >= GFX_AUTO_RISE) {
    if (!state.highSince) { state.highSince = time; return null; }
    if (time - state.highSince < GFX_AUTO_RISE_SUSTAIN) return null;
    const restore = state.base;
    state.step = -1;
    state.lastStep = time;
    state.highSince = 0;
    state.lowSince = 0;
    state.base = null;
    return { restore };
  }
  state.highSince = 0;

  // --- Take quality away ---
  if (fps >= (active ? GFX_AUTO_TARGET : GFX_AUTO_FLOOR)) { state.lowSince = 0; return null; }
  if (!cooled) return null;
  // Arming the walk takes a sustained sub-floor dip; once it is moving, the
  // cooldown is the only brake, so it can keep stepping down promptly.
  if (!active) {
    if (!state.lowSince) { state.lowSince = time; return null; }
    if (time - state.lowSince < GFX_AUTO_SUSTAIN) return null;
  }
  if (state.step >= GFX_AUTO_LADDER.length - 1) return null;   // already at the floor
  if (!state.base) {
    state.base = { scale: gfx.scale, aa: gfx.aa };
  }
  state.step++;
  state.lastStep = time;
  state.lowSince = 0;
  return { apply: ladderFold(state.base, state.step) };
}