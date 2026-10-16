// Pure, dependency-free timeline for the "boarding" cinematic at the spaceport:
// the player's car is driven onto the launch pad, a giant robotic arm picks it
// up, shrinks it, lowers it through the open roof of a docked spacecraft, seals
// the roof, and the rocket erects and launches with the car inside. Like
// spaceportPhases.js this module owns ONLY the numbers - which stage the ride is
// in and how much the clamp is shut, how small the car is, whether the roof is
// open, how upright/aloft the rocket is, whether the car is aboard, and how far
// the black fade has gone. main.js maps these to a world-space arm path and the
// camera; the tests read them directly.
//
// Unlike the ship loop this is a ONE-SHOT: it plays once from t=0 and holds its
// final (launched, faded-out) state for any t at or beyond the end.

import { SHIP_MAX_Y } from './spaceportPhases.js?v=1799999999999';

export const RIDE_MAX_Y = SHIP_MAX_Y;

// How small the car becomes for the flight. The shrink happens INSTANTLY on the
// cut into the cinematic (t = 0), so it is never seen as an animation: the ride
// opens with the car already small and stays that way.
export const RIDE_CAR_SCALE = 0.42;

// name / seconds, in story order.
export const RIDE_SEGMENTS = [
  ['establish', 2.0],   // camera settles on the pad; the arm wakes, the car waits
  ['grab', 1.8],        // the claw descends and closes on the car, which shrinks
  ['carry', 2.4],       // the arm lifts and swings the car over the rocket roof
  ['insert', 1.4],      // it lowers the car into the hold and lets go
  ['retract', 1.0],     // the empty claw lifts back out
  ['seal', 1.2],        // the big roof window swings shut
  ['erect', 2.2],       // the hull tilts from horizontal to standing on its tail
  ['taxi', 1.4],        // it slides onto the launch pad
  ['ignite', 1.0],      // the plume builds
  ['launch', 2.5],      // it climbs until out of sight, car aboard (trimmed ~2s)
  ['fade', 1.2],        // the screen fades to black
];

const INDEX = {};
{
  let t = 0;
  for (const [name, dur] of RIDE_SEGMENTS) {
    INDEX[name] = { start: t, dur };
    t += dur;
  }
}

// Whole sequence, in seconds.
export const RIDE_CYCLE = RIDE_SEGMENTS.reduce((a, s) => a + s[1], 0);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (u) => u * u * (3 - 2 * u);   // smoothstep
const accel = (u) => u * u;                  // slow start, then rush

// Which segment is the ride in? `t` is seconds since the ride started, clamped
// at both ends (this is a one-shot, not a loop).
export function ridePhaseAt(t) {
  if (t <= 0) return { phase: RIDE_SEGMENTS[0][0], local: 0 };
  if (t >= RIDE_CYCLE) return { phase: RIDE_SEGMENTS[RIDE_SEGMENTS.length - 1][0], local: 1 };
  let x = t;
  for (const [name, dur] of RIDE_SEGMENTS) {
    if (x < dur) return { phase: name, local: x / dur };
    x -= dur;
  }
  return { phase: RIDE_SEGMENTS[RIDE_SEGMENTS.length - 1][0], local: 1 };
}

export const RIDE_DONE = (t) => t >= RIDE_CYCLE;

// Everything the geometry and camera need, all normalised 0..1 except `y`.
export function rideStateAt(t) {
  const { phase, local } = ridePhaseAt(t);
  const idx = INDEX[phase];
  const at = (name) => phase === name;
  const after = (name) => idx.start >= INDEX[name].start + INDEX[name].dur;

  // Claw grip: open, snaps shut on the car, stays shut while carrying, then
  // opens again as the car is set down in the hold.
  let grip = 0;
  if (at('grab')) grip = smooth(local);
  else if (at('carry')) grip = 1;
  else if (at('insert')) grip = 1 - smooth(local);

  // The car is a fixed fraction of its normal size for the whole ride: it was
  // shrunk on the cut, so there is no shrink to animate.
  const carScale = RIDE_CAR_SCALE;

  // The roof: open the whole time the arm is working, sealed for flight.
  let windowOpen = 1;
  if (at('seal')) windowOpen = 1 - smooth(local);
  else if (after('seal')) windowOpen = 0;

  // Horizontal (0) -> vertical (1) on the way to launch.
  let tilt = 0;
  if (at('erect')) tilt = smooth(local);
  else if (after('erect')) tilt = 1;

  // Dock (0) -> launch pad (1).
  let pad = 0;
  if (at('taxi')) pad = smooth(local);
  else if (after('taxi')) pad = 1;

  // Altitude.
  let y = 0;
  if (at('ignite')) y = 0.2 * smooth(local);
  else if (at('launch')) y = 0.2 + (RIDE_MAX_Y - 0.2) * accel(local);
  else if (at('fade')) y = RIDE_MAX_Y;

  // Exhaust plume.
  let plume = 0;
  if (at('ignite')) plume = smooth(local);
  else if (at('launch')) plume = 1;
  else if (at('fade')) plume = 1 - smooth(local);

  // Once the car is set down (near the very end of `insert`) it rides with the
  // ship: the camera can then follow it up through the launch.
  const attached = after('insert') || (at('insert') && local >= 0.92);

  // Black fade over the tail of the sequence.
  const fade = at('fade') ? smooth(local) : (after('fade') ? 1 : 0);

  return { phase, local, grip, carScale, windowOpen, tilt, pad, y, plume, attached, fade };
}
