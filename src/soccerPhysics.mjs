// The school soccer pitch: an oversized ball the cars can boot around.
//
// Pure maths only (no THREE), so the whole game can be stepped headless — see
// soccerPhysics.test.mjs — while soccer.js builds the mesh and draws the result.
//
// The ball is "magically" kept on the pitch: its own soft walls bounce it back
// off the touchlines and the end lines. The only openings are the two goal
// mouths, where it can cross the line into the net and score.
export const SOCCER = {
  // These are WORLD coordinates: minimap (44, 173) -> world (136, 73) (see
  // AGENTS.md). The pitch fills the whole clear belt east of the railway loop —
  // the parking lot that used to sit off its south end is gone, so the only
  // things near it are the arterial (south) and a hill (north).
  x0: 96, x1: 176,
  z0: 22, z1: 124,
  cx: 136, cz: 73,
  // Both goals, centred on the pitch's long axis, at the two end lines.
  goalHalf: 5.0,      // half the mouth width (a 10-wide goal)
  goalDepth: 4.4,
  goalH: 5.2,
  // An oversized football: 3.4 across, wider than a car.
  ballR: 1.7,
  drag: 0.62,         // per second rolling resistance
  bounce: 0.72,       // touchline restitution
};

export function createBall(x = SOCCER.cx, z = SOCCER.cz) {
  return {
    x, z,
    vx: 0, vz: 0,
    r: SOCCER.ballR,
    resetT: 0,
    goals: [0, 0],
    kickCool: 0,        // seconds until this ball may be split again
  };
}

// A ball can only be split once per this long, so a car resting against one does
// not spawn a copy every single frame — one touch, one extra ball.
export const BALL_SPLIT_COOLDOWN = 0.35;

export function resetBall(ball) {
  ball.x = SOCCER.cx;
  ball.z = SOCCER.cz;
  ball.vx = 0;
  ball.vz = 0;
  ball.resetT = 0;
}

// One frame. `actors` entries are { x, z, heading, speed, radius } — one per
// car on the pitch, so both player cars boot the ball in split-screen and the
// city's chase car boots it in single player. An actor may also carry
// `canSplit: false` to boot the ball without duplicating it (the chase car —
// see below). Returns
//   { goal: 0 | 1 }      a goal at the south (0) or north (1) end
//   { reset: true }      the post-goal pause ended and the ball is back at centre
//   { kick: true }       a car just booted it, so the pitch duplicates it
//   null                 ordinary play
export function stepBall(ball, dt, actors) {
  const S = SOCCER;
  if (ball.kickCool > 0) ball.kickCool = Math.max(0, ball.kickCool - dt);
  let kicked = false;

  // ---- cars boot it ----
  for (const a of actors || []) {
    if (!a) continue;
    // A car flying well over the pitch (a ramp jump) is not touching the ball.
    if ((a.y ?? 0) > 5) continue;
    const ar = a.radius ?? 2.2;
    const reach = ball.r + ar;
    let dx = ball.x - a.x, dz = ball.z - a.z;
    let d = Math.hypot(dx, dz);
    if (d >= reach) continue;
    if (d < 1e-4) { dx = 0; dz = 1; d = 1; }
    const nx = dx / d, nz = dz / d;
    // Sit the ball just outside the car so it never ends up inside the bodywork.
    ball.x = a.x + nx * reach;
    ball.z = a.z + nz * reach;
    const sp = Math.abs(a.speed ?? 0);
    if (sp < 0.2) continue;
    const fx = -Math.cos(a.heading ?? 0), fz = Math.sin(a.heading ?? 0);
    // Most of the punt follows the car's nose, with a little radial shove so a
    // glancing hit still sends it away from the flank.
    let px = fx * 0.72 + nx * 0.28;
    let pz = fz * 0.72 + nz * 0.28;
    const pl = Math.hypot(px, pz) || 1;
    const power = Math.min(17, 3.4 + sp * 1.0);
    ball.vx = (px / pl) * power;
    ball.vz = (pz / pl) * power;
    // `canSplit: false` actors still boot the ball, they just never duplicate
    // it: the AI chase car patrols the whole belt on its own, so a copy per
    // touch would carpet the pitch without the player ever driving. Its punt
    // also leaves the cool-down alone, so a player who follows it in can still
    // split the ball straight away.
    if (ball.kickCool <= 0 && a.canSplit !== false) {
      ball.kickCool = BALL_SPLIT_COOLDOWN;
      kicked = true;
    }
  }

  // ---- roll + drag ----
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  const f = Math.max(0, 1 - S.drag * dt);
  ball.vx *= f;
  ball.vz *= f;
  if (Math.hypot(ball.vx, ball.vz) < 0.12) { ball.vx = 0; ball.vz = 0; }

  // ---- post-goal pause, then back to the centre spot ----
  if (ball.resetT > 0) {
    ball.resetT -= dt;
    if (ball.resetT <= 0) {
      resetBall(ball);
      return { reset: true };
    }
  }

  const r = ball.r;

  // ---- touchlines ----
  if (ball.x - r < S.x0) { ball.x = S.x0 + r; if (ball.vx < 0) ball.vx = -ball.vx * S.bounce; }
  if (ball.x + r > S.x1) { ball.x = S.x1 - r; if (ball.vx > 0) ball.vx = -ball.vx * S.bounce; }

  // ---- end lines and goals ----
  // The goal branch engages as soon as the ball's EDGE reaches an end line: a
  // ball that is wide of the mouth bounces there, while one lined up with the
  // mouth rolls through and scores once its centre crosses the line.
  const mouth = Math.abs(ball.x - S.cx) <= S.goalHalf - r;
  const south = ball.z - r < S.z0;
  const north = ball.z + r > S.z1;

  if (mouth && (south || north)) {
    const side = south ? 0 : 1;
    const line = south ? S.z0 : S.z1;
    const dir = south ? -1 : 1;
    const back = line + dir * S.goalDepth;
    // The net: side panels and the back panel absorb the ball.
    const lo = S.cx - S.goalHalf + r, hi = S.cx + S.goalHalf - r;
    if (ball.x < lo) { ball.x = lo; if (ball.vx < 0) ball.vx = -ball.vx * 0.45; }
    if (ball.x > hi) { ball.x = hi; if (ball.vx > 0) ball.vx = -ball.vx * 0.45; }
    if (dir < 0 && ball.z - r < back) { ball.z = back + r; if (ball.vz < 0) ball.vz = -ball.vz * 0.28; }
    if (dir > 0 && ball.z + r > back) { ball.z = back - r; if (ball.vz > 0) ball.vz = -ball.vz * 0.28; }
    // A centre over the line is a goal (arcade rule: generous, easy to score).
    if (ball.resetT <= 0 && (south ? ball.z < line : ball.z > line)) {
      ball.goals[side]++;
      ball.resetT = 1.6;
      return { goal: side };
    }
  } else {
    if (ball.z - r < S.z0) { ball.z = S.z0 + r; if (ball.vz < 0) ball.vz = -ball.vz * S.bounce; }
    if (ball.z + r > S.z1) { ball.z = S.z1 - r; if (ball.vz > 0) ball.vz = -ball.vz * S.bounce; }
  }

  // The kick comes last, so a ball that was booted AND scored in the same frame
  // reports the goal (the ball goes back to the centre spot, and the pitch does
  // not want a second ball spawning inside the net a moment later).
  if (kicked) return { kick: true };
  return null;
}

// Balls do not shove each other about, but they must not stand inside one
// another either: a horde dropped on the same square metre reads as a broken
// model, not as a heap of footballs. One position-only pass per frame is enough
// — two balls are pushed apart along the line between them, half the overlap
// each — and the pass is O(n²) only in name, because at the horde's 160 it is
// still well under a millisecond.
export function separateBalls(balls) {
  const S = SOCCER;
  const minD = S.ballR * 2;
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2);
      // Exactly coincident: pick a direction rather than dividing by zero.
      const nx = d < 1e-4 ? 1 : dx / d;
      const nz = d < 1e-4 ? 0 : dz / d;
      const push = (minD - d) / 2;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
    }
  }
  // A shove must not put a ball through the touchline or out of a net. The end
  // lines are only clamped outside the goal mouth, so a ball in the net stays
  // in the net (that is what scores).
  for (const b of balls) {
    if (b.x - b.r < S.x0) b.x = S.x0 + b.r;
    if (b.x + b.r > S.x1) b.x = S.x1 - b.r;
    const behind = S.z0 - S.goalDepth - b.r;
    const beyond = S.z1 + S.goalDepth + b.r;
    if (b.z < behind) b.z = behind;
    if (b.z > beyond) b.z = beyond;
  }
}
