// Headless checks for the school soccer ball: it rolls, it is booted by either
// car, it bounces off the touchlines and end lines, and it goes into the goal
// mouths. Pure maths — no THREE.
//
// Run: node --test src/soccerPhysics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOCCER, createBall, resetBall, stepBall, separateBalls } from './soccerPhysics.mjs';

const DT = 1 / 60;

test('the ball starts on the centre spot and stays put with nobody near', () => {
  const b = createBall();
  assert.equal(b.x, SOCCER.cx);
  assert.equal(b.z, SOCCER.cz);
  assert.equal(b.r, SOCCER.ballR);
  for (let i = 0; i < 120; i++) stepBall(b, DT, []);
  assert.equal(b.x, SOCCER.cx);
  assert.equal(b.z, SOCCER.cz);
});

test('a car punts the ball along its nose and clears its own body', () => {
  const b = createBall();
  // A car sitting just south of the ball, driving north (+z, yaw PI/2).
  const car = { x: SOCCER.cx, z: SOCCER.cz - 3, heading: Math.PI / 2, speed: 9 };
  stepBall(b, DT, [car]);
  assert.ok(b.vz > 4, `expected a northward punt, got vz=${b.vz.toFixed(2)}`);
  assert.ok(Math.abs(b.vx) < 1, 'a head-on hit should not spray sideways');
  // It must be outside the car's own footprint, not inside it.
  const gap = Math.hypot(b.x - car.x, b.z - car.z);
  assert.ok(gap >= b.r + 2.2 - 1e-6, `ball still inside the car (gap ${gap.toFixed(2)})`);
});

test('either car can boot it, so split-screen works', () => {
  const b = createBall();
  // Cars face local -X, so heading 0 points west.
  const p2 = { x: SOCCER.cx + 3, z: SOCCER.cz, heading: 0, speed: 7 };
  stepBall(b, DT, [p2]);
  assert.ok(b.vx < -3, `P2's car should have sent it west, got vx=${b.vx.toFixed(2)}`);
});

test('a car flying over the pitch does not hit the ball', () => {
  const b = createBall();
  const air = { x: SOCCER.cx, z: SOCCER.cz - 3, heading: Math.PI / 2, speed: 9, y: 20 };
  stepBall(b, DT, [air]);
  assert.equal(b.vx, 0);
  assert.equal(b.vz, 0);
});

test('the touchlines bounce the ball back into the pitch', () => {
  const b = createBall();
  b.x = SOCCER.x0 + b.r + 0.2;
  b.vx = -9;
  for (let i = 0; i < 6; i++) stepBall(b, DT, []);
  assert.ok(b.x - b.r >= SOCCER.x0 - 1e-6, `ball left the pitch west (x=${b.x.toFixed(2)})`);
  assert.ok(b.vx >= 0, 'the west touchline should reflect it east');
  assert.ok(b.x >= SOCCER.x0 + b.r - 1e-6, 'the ball is back on the grass');
});

test('the end line bounces a ball that is outside the goal mouth', () => {
  const b = createBall();
  b.x = SOCCER.cx + SOCCER.goalHalf + 0.5;   // wide of the posts
  b.z = SOCCER.z0 + b.r + 0.2;
  b.vz = -10;
  for (let i = 0; i < 6; i++) stepBall(b, DT, []);
  assert.ok(b.z - b.r >= SOCCER.z0 - 1e-6, `ball crossed the end line wide (z=${b.z.toFixed(2)})`);
  assert.ok(b.vz >= 0, 'the end line should reflect it back');
});

test('a ball through the mouth scores and is caught by the net', () => {
  const b = createBall();
  b.z = SOCCER.z0 + b.r + 0.3;
  b.vz = -10;
  let scored = null;
  for (let i = 0; i < 60 && !scored; i++) {
    const ev = stepBall(b, DT, []);
    if (ev && ev.goal !== undefined) scored = ev;
  }
  assert.ok(scored, 'the ball never scored');
  assert.equal(scored.goal, 0, 'south goal (0)');
  assert.equal(b.goals[0], 1);
  assert.ok(b.z < SOCCER.z0, 'the ball is over the line');
  // It is caught by the back of the net rather than sailing on for ever.
  for (let i = 0; i < 30; i++) stepBall(b, DT, []);
  assert.ok(b.z - b.r >= SOCCER.z0 - SOCCER.goalDepth - 1e-6,
    'the ball went through the back of the net');
});

test('the ball comes back to the centre spot after a goal', () => {
  const b = createBall();
  b.z = SOCCER.z0 + b.r + 0.3;
  b.vz = -12;
  let ev = null;
  for (let i = 0; i < 60 && !(ev && ev.goal !== undefined); i++) ev = stepBall(b, DT, []);
  let reset = null;
  for (let i = 0; i < 240 && !reset; i++) {
    const e = stepBall(b, DT, []);
    if (e && e.reset) reset = e;
  }
  assert.ok(reset, 'the ball never reset');
  assert.equal(b.x, SOCCER.cx);
  assert.equal(b.z, SOCCER.cz);
  assert.equal(b.vx, 0);
  assert.equal(b.vz, 0);
});

test('drag slows a rolling ball to a stop', () => {
  const b = createBall();
  b.vx = 8;
  for (let i = 0; i < 600; i++) stepBall(b, DT, []);
  assert.ok(Math.hypot(b.vx, b.vz) < 0.12, 'the ball should eventually stop');
});

test('resetBall is a clean centre spot', () => {
  const b = createBall();
  b.x = 3; b.z = 99; b.vx = 4; b.vz = -4;
  resetBall(b);
  assert.deepEqual([b.x, b.z, b.vx, b.vz], [SOCCER.cx, SOCCER.cz, 0, 0]);
});

test('a kicked ball can be split once, not once per frame', () => {
  const b = createBall();
  // A car nose-to-nose with it.
  const car = { x: SOCCER.cx, z: SOCCER.cz - 3, heading: Math.PI / 2, speed: 9 };
  // Hold it against the nose and keep touching it: the ball is punted away each
  // frame, so put it back — the cooldown is what has to stop the burst.
  const hold = () => { b.x = car.x; b.z = car.z + 3; b.vx = 0; b.vz = 0; };
  hold();
  assert.equal(stepBall(b, DT, [car]).kick, true, 'the first touch splits the ball');
  for (let i = 0; i < 10; i++) {
    hold();
    const ev = stepBall(b, DT, [car]);
    assert.ok(!(ev && ev.kick), 'the same held touch split the ball again');
  }
  // …and once the cooldown is up it is a fresh touch again.
  for (let i = 0; i < 40; i++) stepBall(b, DT, []);
  hold();
  const ev = stepBall(b, DT, [car]);
  assert.equal(ev && ev.kick, true, 'a later touch should be able to split it again');
});

test('balls are pushed apart instead of standing inside each other', () => {
  const a = createBall(SOCCER.cx, SOCCER.cz);
  const b = createBall(SOCCER.cx + 0.2, SOCCER.cz);   // nearly the same spot
  const c = createBall(SOCCER.cx + 30, SOCCER.cz);    // nowhere near
  const balls = [a, b, c];
  for (let i = 0; i < 40; i++) separateBalls(balls);
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(d > SOCCER.ballR * 2 - 1e-6, `the pair is still ${d.toFixed(2)} apart`);
  assert.equal(c.x, SOCCER.cx + 30, 'a ball nowhere near the pair was moved');
  // Exactly coincident balls still separate (no divide-by-zero wedge).
  const p = createBall(SOCCER.cx, SOCCER.cz);
  const q = createBall(SOCCER.cx, SOCCER.cz);
  separateBalls([p, q]);
  assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 0, 'coincident balls never came apart');
});

test('separating balls never shoves one off the pitch or out of the net', () => {
  // Pile them up in a corner, right on the touchline.
  const balls = [];
  for (let i = 0; i < 12; i++) balls.push(createBall(SOCCER.x0 + 0.4, SOCCER.z0 + 0.4));
  for (let i = 0; i < 60; i++) separateBalls(balls);
  for (const b of balls) {
    assert.ok(b.x - b.r >= SOCCER.x0 - 1e-6, `a ball was pushed through the west touchline (x=${b.x})`);
    assert.ok(b.x + b.r <= SOCCER.x1 + 1e-6, `a ball was pushed through the east touchline (x=${b.x})`);
  }
  // A ball inside the goal net is left where it is: that is where goals happen.
  const net = createBall(SOCCER.cx, SOCCER.z0 - SOCCER.goalDepth / 2);
  separateBalls([net]);
  assert.equal(net.z, SOCCER.z0 - SOCCER.goalDepth / 2, 'a ball in the net was shoved out of it');
});

test('the chase car boots the ball but never duplicates it', () => {
  const b = createBall();
  // The little blue AI car: it patrols the belt, so it is not allowed to split.
  const chaser = {
    x: SOCCER.cx, z: SOCCER.cz - 2.5, heading: Math.PI / 2, speed: 6,
    radius: 1.15, canSplit: false,
  };
  const ev = stepBall(b, DT, [chaser]);
  assert.ok(b.vz > 3, `the chase car should have punted it north, got vz=${b.vz.toFixed(2)}`);
  assert.ok(!(ev && ev.kick), 'the chase car split the ball');
  // Held against the chaser it keeps shoving it, and still never splits it.
  for (let i = 0; i < 30; i++) {
    b.x = chaser.x; b.z = chaser.z + 2.5; b.vx = 0; b.vz = 0;
    const e = stepBall(b, DT, [chaser]);
    assert.ok(!(e && e.kick), 'a held chase-car touch split the ball');
  }
  // It leaves the split cool-down alone, so the player can split it right after.
  const player = { x: chaser.x, z: chaser.z + 2.5, heading: Math.PI / 2, speed: 9 };
  b.x = player.x; b.z = player.z + 3; b.vx = 0; b.vz = 0;
  const ev2 = stepBall(b, DT, [player]);
  assert.equal(ev2 && ev2.kick, true, 'the chase car blocked the player from splitting the ball');
});
