// Pure, dependency-free timeline for the "Intergalactic Spaceship Transport
// Company" spacecraft parked in the corner of the city. Each ship runs an
// endless loop: sit on its dock with the top window opening, a robot arm swings
// over the open roof, the window shuts, the hull tilts from horizontal to
// vertical, taxis onto the launch pad, lifts off in a plume until it is far out
// of sight, then hovers back down, lands, opens and starts again. This module
// owns ONLY the
// numbers: which phase a ship is in at a given time and how "open", "tilted",
// "down the pad", "up in the air" and "on fire" it should look. The geometry
// module (spaceport.js) and the tests both read it, so the choreography has one
// source of truth and no Three.js import.
//
// Nothing here is random: the whole yard shares one clock (the game's elapsed
// time), and each ship is just a fixed time-offset into the same cycle.

// ---- The loop --------------------------------------------------------------
// name / seconds. The order is the order of the animation, and several helpers
// below depend on that order (they use "am I past segment X?" tests).
export const SHIP_SEGMENTS = [
  ['dock', 16.0],    // parked horizontal on the cradle, window shut, idle
  ['open', 1.2],     // the big top window swings open
  ['load', 3.0],     // the robot arm swings over the open roof and back out
  ['close', 1.0],    // window shuts
  ['tilt', 2.4],     // hull rotates from lying flat to standing on its tail
  ['taxi', 2.4],     // slides from the cradle onto the launch pad
  ['ignite', 1.0],   // clamps release, the plume builds
  ['ascend', 5.0],   // climbs, accelerating, until it is out of sight
  ['absent', 2.5],   // gone
  ['descend', 4.0],  // hovers back down out of the sky
  ['touch', 1.6],    // settles onto the pad
  ['untilt', 2.0],   // rotates back to horizontal
  ['back', 2.4],     // slides back onto its cradle, empty, ready to refill
];

const INDEX = {};
{
  let t = 0;
  for (const [name, dur] of SHIP_SEGMENTS) {
    INDEX[name] = { start: t, dur };
    t += dur;
  }
}

// One full loop, in seconds.
export const SHIP_CYCLE = SHIP_SEGMENTS.reduce((a, s) => a + s[1], 0);

// Peak altitude of a launch, and the hover height above the pad just before
// touch-down. High enough that the ship genuinely leaves the view.
export const SHIP_MAX_Y = 150;
export const SHIP_HOVER_Y = 6;

// ---- Which segment is a ship in? -------------------------------------------
export function shipPhaseAt(t, offset = 0) {
  let x = (t + offset) % SHIP_CYCLE;
  if (x < 0) x += SHIP_CYCLE;
  for (const [name, dur] of SHIP_SEGMENTS) {
    if (x < dur) return { phase: name, local: x / dur };
    x -= dur;
  }
  const last = SHIP_SEGMENTS[SHIP_SEGMENTS.length - 1];
  return { phase: last[0], local: 1 };
}

// Evenly spaced offsets so a fleet never all performs the same beat at once.
export function shipOffsets(count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push((i / count) * SHIP_CYCLE);
  return out;
}

// ---- Derived pose ----------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (u) => u * u * (3 - 2 * u);   // smoothstep
const accel = (u) => u * u;                  // slow start (rising off the pad)

// Everything the geometry needs, all normalised 0..1 except `y` (world units)
// and `phase`/`local`.
export function shipStateAt(t, offset = 0) {
  const { phase, local } = shipPhaseAt(t, offset);
  const idx = INDEX[phase];
  const at = (name) => phase === name;
  const after = (name) => idx.start >= INDEX[name].start + INDEX[name].dur;

  // The top window: shut on the dock, open while cargo goes in, shut for flight.
  let windowOpen = 0;
  if (at('open')) windowOpen = smooth(local);
  else if (at('load')) windowOpen = 1;
  else if (at('close')) windowOpen = 1 - smooth(local);

  // The robot arm: stowed, swings over the hatch while it is open, withdraws.
  let arm = 0;
  if (at('open')) arm = smooth(local);
  else if (at('load')) arm = 1;
  else if (at('close')) arm = 1 - smooth(local);

  // Cargo: fills during `load`, rides along through the flight, and is gone by
  // the time the ship lands (it was delivered), ready to be refilled next loop.
  let cargo = 0;
  if (at('load')) cargo = smooth(local);
  else if (after('load') && !at('touch') && !after('touch')) cargo = 1;

  // Horizontal (0) -> vertical (1). Held vertical across the whole flight.
  let tilt = 0;
  if (at('tilt')) tilt = smooth(local);
  else if (after('tilt') && !at('untilt') && !after('untilt')) tilt = 1;
  else if (at('untilt')) tilt = 1 - smooth(local);

  // Dock (0) -> launch pad (1).
  let pad = 0;
  if (at('taxi')) pad = smooth(local);
  else if (after('taxi') && !at('back') && !after('back')) pad = 1;
  else if (at('back')) pad = 1 - smooth(local);

  // Altitude above the ground.
  let y = 0;
  if (at('ignite')) y = 0.2 * smooth(local);
  else if (at('ascend')) y = 0.2 + (SHIP_MAX_Y - 0.2) * accel(local);
  else if (at('absent')) y = SHIP_MAX_Y;
  else if (at('descend')) y = SHIP_MAX_Y - (SHIP_MAX_Y - SHIP_HOVER_Y) * clamp01(accel(local));
  else if (at('touch')) y = SHIP_HOVER_Y * (1 - smooth(local));

  // Exhaust plume. Full on the way up, a lighter retro burn coming back down.
  let plume = 0;
  if (at('ignite')) plume = smooth(local);
  else if (at('ascend')) plume = 1;
  else if (at('absent')) plume = 1 - smooth(local);
  else if (at('descend')) plume = 0.5 * (1 - local);
  else if (at('touch')) plume = 0.3 * (1 - smooth(local));

  return { phase, local, windowOpen, arm, cargo, tilt, pad, y, plume };
}
