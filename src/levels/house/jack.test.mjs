// Authoring checker + regression guard for the playroom Jack-in-the-box gag.
// The gag is pure numbers (jack.mjs), so it can be stepped frame by frame here
// and checked without a renderer:
//   - the phases run in order and a whole gag lasts about as long as designed
//   - the LID STAYS SHUT through the wind-up, and only opens at the pop
//   - the clown overshoots its resting height before it settles (it FLIES out)
//   - it is drawn back down and the lid closes again
//   - a touch starts it, and a touch while it is already running is ignored
//
// Run: node --test src/levels/house/jack.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JACK, JACK_TOTAL, JACK_WIND_TURNS, JACK_SPRING_TUCK, JACK_SPRING_FULL,
  createJack, jackTouch, jackStep, jackPose, springLength,
} from './jack.mjs';

const STEP = 1 / 60;

// Step a fresh box until the gag has run its course, recording the phase and
// pose seen on every frame.
function run(touchAtFrame = 0, maxFrames = 3000) {
  const st = createJack();
  const frames = [];
  const entered = [];
  let started = false;
  for (let f = 0; f < maxFrames; f++) {
    if (f === touchAtFrame) started = jackTouch(st);
    const e = jackStep(st, STEP);
    if (e) entered.push(e);
    frames.push({ f, phase: st.phase, pose: jackPose(st) });
    if (started && st.phase === 'idle' && f > touchAtFrame + 10) break;
  }
  return { st, frames, entered, started };
}

test('a touch starts the box and the phases run in order', () => {
  const { started, entered } = run();
  assert.equal(started, true, 'the first touch starts it');
  assert.deepEqual(entered, ['pop', 'bounce', 'retract', 'idle']);
});

test('the gag lasts about as long as designed, and only then goes idle', () => {
  const { st, frames, entered } = run();
  assert.equal(st.phase, 'idle', 'it finishes on its own');
  const done = frames.find((fr) => fr.phase === 'idle' && fr.f > 1);
  const seconds = done.f * STEP;
  assert.ok(Math.abs(seconds - JACK_TOTAL) < 0.1, `whole gag ~${JACK_TOTAL}s, ran ${seconds.toFixed(2)}s`);
  assert.ok(entered.length === 4);
});

test('the lid STAYS SHUT while it winds up, then flies open', () => {
  const { frames } = run();
  const winding = frames.filter((fr) => fr.phase === 'winding');
  assert.ok(winding.length > 30, 'the wind-up is a real pause');
  for (const fr of winding) assert.equal(fr.pose.lid, 0, 'lid shut during wind-up');
  // It is fully open by the end of the pop, and stays open through the bounce.
  const popLast = frames.filter((fr) => fr.phase === 'pop').at(-1);
  assert.ok(popLast.pose.lid > 0.9, 'lid wide open after the pop');
  for (const fr of frames.filter((f) => f.phase === 'bounce')) assert.equal(fr.pose.lid, 1, 'lid open while bouncing');
});

test('the crank turns ever faster while winding, then holds', () => {
  const { frames } = run();
  const winding = frames.filter((fr) => fr.phase === 'winding').map((fr) => fr.pose.crank);
  assert.ok(winding.length > 5);
  const late = winding.at(-1) - winding.at(-6);
  const early = winding[5] - winding[0];
  assert.ok(late > early, 'winds up to speed (accelerates)');
  const after = frames.filter((fr) => fr.phase === 'bounce');
  assert.ok(after.length > 0);
  for (const fr of after) assert.ok(Math.abs(fr.pose.crank - JACK_WIND_TURNS * Math.PI * 2) < 1e-6, 'crank holds once out');
});

test('the clown overshoots its resting height before settling (it flies out)', () => {
  const { frames } = run();
  const pop = frames.filter((fr) => fr.phase === 'pop');
  assert.ok(pop.length > 5, 'the pop takes a moment');
  const peak = Math.max(...pop.map((fr) => fr.pose.out));
  assert.ok(peak > 1.05, `overshoots past its rest (peak ${peak.toFixed(3)})`);
  assert.ok(pop.at(-1).pose.out <= peak, 'settles back from the peak');
  // And the spring length grows with it.
  assert.ok(springLength(peak) > springLength(1), 'the spring stretches past rest');
  assert.ok(springLength(0) === JACK_SPRING_TUCK);
  assert.ok(springLength(1) === JACK_SPRING_FULL);
});

test('the clown bounces while out, then is drawn back and the lid closes', () => {
  const { frames } = run();
  const bounceOut = frames.filter((fr) => fr.phase === 'bounce').map((fr) => fr.pose.out);
  assert.ok(Math.max(...bounceOut) - Math.min(...bounceOut) > 0.05, 'it bounces around');
  const retract = frames.filter((fr) => fr.phase === 'retract');
  const first = retract[0].pose, last = retract.at(-1).pose;
  assert.ok(last.out < first.out - 0.5, 'drawn back in');
  assert.ok(last.out < 0.05, 'fully tucked by the end');
  assert.ok(last.lid < 0.05, 'lid shut at the end');
  // The lid stays open for the first half of the retract, so the clown is
  // swallowed before it snaps shut.
  assert.ok(retract[Math.floor(retract.length / 3)].pose.lid > 0.5, 'lid still open early in');
});

test('a touch while it is already running is ignored', () => {
  const st = createJack();
  assert.equal(jackTouch(st), true);
  jackStep(st, 0.1);
  assert.equal(jackTouch(st), false, 'no restart mid-gag');
  assert.equal(st.plays, 1);
});

test('it can be set off again once it is idle', () => {
  const st = createJack();
  assert.equal(jackTouch(st), true);
  let guard = 0;
  while (st.phase !== 'idle' && guard++ < 5000) jackStep(st, STEP);
  assert.equal(st.phase, 'idle');
  assert.equal(jackTouch(st), true, 'fires again');
  assert.equal(st.plays, 2);
});

test('the pose is inert at rest and never NaNs across a whole gag', () => {
  const st = createJack();
  const rest = jackPose(st);
  assert.deepEqual(rest, { lid: 0, out: 0, crank: 0, sway: 0, bend: 0, jiggle: 0 });
  jackTouch(st);
  let guard = 0;
  while (st.phase !== 'idle' && guard++ < 5000) {
    jackStep(st, STEP);
    const p = jackPose(st);
    for (const k of ['lid', 'out', 'crank', 'sway', 'bend', 'jiggle']) {
      assert.ok(Number.isFinite(p[k]), `${k} finite (${p[k]})`);
    }
  }
  assert.deepEqual(jackPose(st), { lid: 0, out: 0, crank: 0, sway: 0, bend: 0, jiggle: 0 }, 'returns to rest');
});
