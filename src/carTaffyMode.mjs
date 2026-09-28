// Car "taffy-puller" stretch mode — the counter-rotating chrome hooks on the
// underground course stretch the car into a long noodle for TAFFY_STRETCH_TIME,
// then it snaps back to normal. Pure state machine, mirroring carFlatMode.mjs,
// so node --test can verify the scaling without the renderer.
//
// The car's long axis is its local X (front faces -X at yaw 0), so stretching
// scale.x elongates it nose-to-tail while shrinking scale.z makes it noodle-
// thin. The recover phase overshoots (a springy snap-back) then settles at 1.

export const TAFFY_STRETCH_TIME = 5;    // seconds the car stays a noodle
export const TAFFY_RECOVER_TIME = 0.5;  // springy snap-back duration
export const TAFFY_MAX_X = 3.9;         // noodle length multiplier (industrial pull)
export const TAFFY_MIN_Z = 0.42;        // noodle slimness (width multiplier)
export const NORMAL_SCALE = 1;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Ease-out-back: rises fast, then overshoots above 1 before settling — reads
// as the noodle "snapping" back past normal size and springing to rest.
// The overshoot constant is kept mild (c1=1.5) so that even from the longest
// noodle (TAFFY_MAX_X) the snap-back never dips the car below ≥0.8 length —
// a deep spring would make a long noodle look snapped/collapsed mid-recover.
function easeOutBack(t) {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function createTaffyState(active = false) {
  return {
    active,
    phase: active ? 'stretch' : 'normal',
    timer: 0,
    maxX: TAFFY_MAX_X,
    minZ: TAFFY_MIN_Z,
    stretchTime: TAFFY_STRETCH_TIME,
    recoverTime: TAFFY_RECOVER_TIME,
  };
}

export function getTaffyScale(state) {
  if (!state || !state.active) return { sx: NORMAL_SCALE, sz: NORMAL_SCALE };

  if (state.phase === 'stretch') {
    const t = Math.min(state.timer / state.stretchTime, 1);
    const e = easeOutCubic(t);
    return {
      sx: 1 + (state.maxX - 1) * e,
      sz: 1 - (1 - state.minZ) * e,
    };
  }

  if (state.phase === 'recover') {
    const t = Math.min(state.timer / state.recoverTime, 1);
    // At the very start of recovery the car still sits at the full noodle
    // extremes (never thinner than minZ) — return them exactly so floating
    // point can't shave the width below the floor the course promises.
    if (t === 0) return { sx: state.maxX, sz: state.minZ };
    // Mirror the stretch curve but with ease-out-back, so at t=0 we sit exactly
    // at the noodle extremes and the spring overshoot carries BOTH axes just
    // past 1 (a quick shrink then the "plunge" back to normal) before settling.
    const g = 1 - easeOutBack(t);
    return {
      sx: 1 + (state.maxX - 1) * g,
      sz: 1 - (1 - state.minZ) * g,
    };
  }

  return { sx: NORMAL_SCALE, sz: NORMAL_SCALE };
}

export function stepTaffyState(state, delta, tripped = false) {
  if (!state) state = createTaffyState(false);

  if (tripped) {
    // Bumped again while stretched (or fresh) → restart the stretch clock.
    state.active = true;
    state.phase = 'stretch';
    state.timer = 0;
    return state;
  }

  if (!state.active) return state;

  if (state.phase === 'stretch') {
    state.timer += delta;
    if (state.timer >= state.stretchTime) {
      state.phase = 'recover';
      state.timer = 0;
    }
    return state;
  }

  if (state.phase === 'recover') {
    state.timer += delta;
    if (state.timer >= state.recoverTime) {
      state.active = false;
      state.phase = 'normal';
      state.timer = 0;
    }
    return state;
  }

  state.timer = 0;
  return state;
}