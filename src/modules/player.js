// The per-player record and the input resolver, kept pure (no DOM, no THREE)
// so they can be driven headless. The whole split-screen feature is about
// turning the game's singletons into per-player values; this module owns what a
// player IS and how their controls become a per-frame input vector.
//
// `readInput` mirrors the merge the single-player frame loop used to do inline
// in main.js (keyboard, gamepad and the touch joystick folding on top of each
// other), so feeding it the same keys/pad/joy state yields exactly the values
// the old code produced — single-player keeps working untouched while the input
// path itself is now player-owned.
export const INPUT_SCHEMES = {
  // P1's keyboard half.
  'kb-wasd': {
    throttle: ['KeyW'],
    reverse: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    boost: ['ShiftLeft', 'ShiftRight'],
  },
  // P2's keyboard half.
  'kb-arrows': {
    throttle: ['ArrowUp'],
    reverse: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    boost: ['ShiftRight'],
  },
  // Single-player shows BOTH halves on one keyboard (the old behaviour), so the
  // default device is the union of the two schemes. Split mode assigns 'kb-wasd'
  // to P1 and 'kb-arrows' to P2.
  'kb-both': {
    throttle: ['KeyW', 'ArrowUp'],
    reverse: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    boost: ['ShiftLeft', 'ShiftRight'],
  },
  // Two-players-on-one-touchscreen: this player drives entirely with an
  // on-screen joystick, so no keyboard key (and no pad) steers them.
  'touch': {
    throttle: [],
    reverse: [],
    left: [],
    right: [],
    boost: [],
  },
};

export const PAD_DEAD = 0.18;

// The per-frame input vector readInput fills.
export function makeInput() {
  return {
    forward: 0,        // 0..1
    reverse: 0,        // 0..1
    boost: false,      // nitro held
    wantLeft: false,   // keyboard half's steer-left key is down
    wantRight: false,  // keyboard half's steer-right key is down
    joyActive: false,  // the (single-view) touch joystick is engaged
    joyX: 0,           // joystick x, -1..1
    joyY: 0,           // joystick y, -1..1
    steerPad: 0,       // pad stick/D-pad steer, -1..1 (deadzoned upstream)
  };
}

// Resolve one player's controls for one frame. `state` is the live engine's
// { keys, pad, joy }: the world-level `keys` map, the flattened first-pad
// object and the touch joystick. (When more than one pad is wired up, `pad`
// becomes `pads[p.padIndex]`.)
export function readInput(p, state) {
  const scheme = INPUT_SCHEMES[p.device] || INPUT_SCHEMES['kb-both'];
  const on = (codes) => codes.some((c) => !!state.keys[c]);
  const out = makeInput();

  out.forward = on(scheme.throttle) ? 1 : 0;
  out.reverse = on(scheme.reverse) ? 1 : 0;
  out.boost = on(scheme.boost) || !!state.pad.boost;
  out.wantLeft = on(scheme.left);
  out.wantRight = on(scheme.right);

  // The touch joystick folds in the way the old frame loop did: push up goes,
  // pull down reverses, and the override only engages past its dead band.
  if (state.joy.active) {
    const f = Math.max(0, -state.joy.y);
    const r = Math.max(0, state.joy.y);
    if (f > 0.08) out.forward = Math.max(out.forward, f);
    else if (r > 0.08) out.reverse = Math.max(out.reverse, r);
  }

  // The pad's triggers / stick / D-pad are analog and digital at once: any
  // meaningful reading takes over from (or adds to) the keyboard.
  if (state.pad.throttle > 0.05) out.forward = Math.max(out.forward, state.pad.throttle);
  if (state.pad.reverse > 0.05) out.reverse = Math.max(out.reverse, state.pad.reverse);

  out.joyActive = state.joy.active;
  out.joyX = state.joy.x;
  out.joyY = state.joy.y;
  out.steerPad = state.pad.steer;
  return out;
}

// The Player record: everything that used to be a singleton now lives on one of
// these. A single-player game builds exactly one. `car` / `velocity` /
// `steering` / `camera` are attached by main.js once its objects exist; until
// then the record is inert (nulls, zeroes).
export function makePlayer(index, opts = {}) {
  return {
    index,                          // 0 | 1
    name: 'P' + (index + 1),        // 'P1' | 'P2'
    device: opts.device || 'kb-both',
    padIndex: opts.padIndex === undefined ? 0 : opts.padIndex,
    input: makeInput(),
    car: null,                      // THREE.Group from createCar / buildPlayerCar
    kind: null,                     // id from CAR_KINDS
    velocity: { value: 0 },         // was the global `velocity`
    steering: { value: 0 },         // was the global `steering`
    camera: null,                   // its own THREE.PerspectiveCamera
    cam: {                          // its own chase-cam state
      orbit: { radius: 0, phi: 0, minPhi: 0, maxPhi: 0 },
      yaw: 0,
      target: null,
      offset: null,
    },
    marker: null,                   // { group, sprite } the floating P1/P2 tag
    spawn: null,                    // THREE.Vector3 spawn/orientation
    knock: null,                    // active world-space knock impulse (P2)
    jump: null,                     // { inAir, yVelocity } airborne state (P2)
  };
}