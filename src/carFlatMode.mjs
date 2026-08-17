export const FLAT_CAR_HEIGHT = 0.22;
export const NORMAL_CAR_HEIGHT = 1;
export const FLAT_DRIVE_BOUNCE_TIME = 6;
export const CAR_BOUNCE_RISE_TIME = 0.28;
export const CAR_BOUNCE_TOTAL_TIME = 1.15;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createFlatCarState(active = false) {
  return {
    active,
    phase: active ? 'flat' : 'normal',
    timer: 0,
    flatScaleY: FLAT_CAR_HEIGHT,
    normalScaleY: NORMAL_CAR_HEIGHT,
    bouncePeakScaleY: 2,
    bounceRiseTime: CAR_BOUNCE_RISE_TIME,
    bounceTotalTime: CAR_BOUNCE_TOTAL_TIME,
  };
}

export function getFlatCarScaleY(state) {
  if (!state || !state.active) return NORMAL_CAR_HEIGHT;

  if (state.phase === 'flat') return state.flatScaleY;

  if (state.phase === 'bounce') {
    const riseT = Math.min(state.timer / state.bounceRiseTime, 1);
    if (state.timer < state.bounceRiseTime) {
      return 1 + (state.bouncePeakScaleY - 1) * easeOutCubic(riseT);
    }

    const fallT = Math.min((state.timer - state.bounceRiseTime) / (state.bounceTotalTime - state.bounceRiseTime), 1);
    return state.bouncePeakScaleY - (state.bouncePeakScaleY - 1) * easeInOutCubic(fallT);
  }

  return state.normalScaleY;
}

export function stepFlatCarState(state, delta, isDriving = false) {
  if (!state) return createFlatCarState(false);

  if (!state.active) {
    state.phase = 'normal';
    state.timer = 0;
    return state;
  }

  if (state.phase === 'flat') {
    if (isDriving) {
      state.timer += delta;
      if (state.timer >= FLAT_DRIVE_BOUNCE_TIME) {
        state.phase = 'bounce';
        state.timer = 0;
      }
    }
    return state;
  }

  if (state.phase === 'bounce') {
    state.timer += delta;
    if (state.timer >= state.bounceTotalTime) {
      state.phase = 'normal';
      state.timer = 0;
      state.active = false;
    }
    return state;
  }

  state.timer = 0;
  return state;
}
