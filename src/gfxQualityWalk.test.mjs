// The automatic quality walk, tested as a pure engine (modules/gfxQualityWalk.js),
// which main.js feeds with its live fps each frame. This is where the promises
// of the walk are pinned:
//
//   1. It is CONSERVATIVE going down: it only arms below 5fps held for 5s, so
//      ordinary chugging (20fps, 15fps, 10fps) never trips it.
//   2. It is AGGRESSIVE coming back up: a sustained 40fps restores the player's
//      WHOLE picture in one step, not one rung at a time.
//   3. It only ever moves RESOLUTION and ANTI-ALIASING: no rung carries `far`,
//      `shadows` or `fogTie`, and `gfx` keeps those values through the cycle.
//
// Run: node --test src/gfxQualityWalk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  gfxQualCreate,
  gfxQualTick,
  GFX_AUTO_LADDER,
  GFX_AUTO_FLOOR,
  GFX_AUTO_TARGET,
  GFX_AUTO_RISE,
  GFX_AUTO_SUSTAIN,
  GFX_SCALE_MIN,
} from './modules/gfxQualityWalk.js';

const BASE = { scale: 1, far: 500, fogTie: true, shadows: true, aa: true, max: false };

// Drive one walk with a frame-rate function of time. Returns the final gfx and
// every applied action (with the gfx state right after it applied).
function run(fpsAt, tickMs = 100, ticks = 20000) {
  const state = gfxQualCreate();
  let gfx = { ...BASE };
  const steps = [];
  let time = 0;
  for (let i = 0; i < ticks; i++) {
    const res = gfxQualTick(state, gfx, fpsAt(time), time);
    if (res) {
      const patch = res.apply || res.restore;
      // The walk may only ever move scale and aa.
      assert.ok(!('far' in patch), 'the walk is trying to change the draw distance');
      assert.ok(!('shadows' in patch), 'the walk is trying to change shadows');
      assert.ok(!('fogTie' in patch), 'the walk is trying to change the fog tie');
      assert.ok(!('max' in patch), 'the walk is trying to change the max flag');
      gfx = { ...gfx, ...patch, max: false };
      steps.push({ time, kind: res.apply ? 'step' : 'restore', ...gfx });
    }
    time += tickMs;
  }
  return { gfx, steps };
}

const dip = (t) => (t < 40000 ? 2 : 45);   // deep strain, then a comfortable recovery

test('the ladder and the arming threshold match the promised shape', () => {
  // Only scale and aa are ever in a rung.
  for (const rung of GFX_AUTO_LADDER) {
    for (const key of Object.keys(rung)) {
      assert.ok(key === 'scale' || key === 'aa',
        `a rung carries "${key}", but the walk may only move scale and aa`);
    }
  }
  assert.equal(GFX_AUTO_FLOOR, 5, 'the walk must only arm below 5fps');
  assert.equal(GFX_AUTO_SUSTAIN, 5000, 'the walk must hold the dip for 5s');
  assert.equal(GFX_AUTO_RISE, 40, 'the walk restores at 40fps');
});

test('the resolution floor is a fifth of native, not a tenth', () => {
  // The blocky end was 0.1x; it is deliberately twice that now. Pin the number
  // so a future tuning pass has to be a conscious choice.
  assert.equal(GFX_SCALE_MIN, 0.2, 'the walk floor should be 0.2x');
  // And no rung may reach BELOW the floor (the fold takes the min over rungs,
  // so a stray low rung would drag the real bottom past GFX_SCALE_MIN).
  for (const rung of GFX_AUTO_LADDER) {
    if (rung.scale !== undefined) {
      assert.ok(rung.scale >= GFX_SCALE_MIN,
        `a rung is ${rung.scale}x, below the ${GFX_SCALE_MIN}x floor`);
    }
  }
});

test('the resolution slider bottoms out at exactly the walk floor', () => {
  // The Graphics tab's slider and the automatic walk must agree on how low the
  // picture may go, or the slider would offer a resolution the walk then refuses
  // to honour (or vice versa).
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/id="gfx-scale"[^>]*\bmin="([\d.]+)"/);
  assert.ok(m, 'index.html has no #gfx-scale slider with a min — the Graphics tab changed shape');
  assert.equal(Number(m[1]), GFX_SCALE_MIN,
    `the slider's min (${m[1]}x) must equal the lowest resolution the walk sets (${GFX_SCALE_MIN}x)`);
});

test('a deep sustained dip walks quality DOWN one rung per cooldown', () => {
  const { steps } = run(() => 2);   // strained forever: it must reach the floor
  const cuts = steps.filter((s) => s.kind === 'step');
  assert.equal(cuts.length, GFX_AUTO_LADDER.length,
    'the walk should step through every rung of the ladder while the machine is strained');
  const scales = cuts.map((s) => s.scale);
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i] <= scales[i - 1],
    'scale must never climb while the walk is cutting');
  assert.equal(cuts[cuts.length - 1].scale, GFX_SCALE_MIN,
    'the bottom rung is the blocky end, not somewhere above it');
  assert.equal(cuts[cuts.length - 1].aa, false, 'aa is off at the floor');
});

test('the first cut waits out the 5s sustain, and later cuts the cooldown', () => {
  const state = gfxQualCreate();
  let gfx = { ...BASE };
  const times = [];
  const step = (t, fps) => {
    const res = gfxQualTick(state, gfx, fps, t);
    if (res) { gfx = { ...gfx, ...(res.apply || res.restore), max: false }; times.push(t); }
  };
  step(0, 2);              // not cooled yet: nothing, and the dip is not recorded
  step(1500, 2);           // the dip starts counting now
  step(4000, 2);           // only 2.5s under the floor: still arming
  step(6500, 2);           // 5s under the floor: first cut
  step(6600, 2);           // on cooldown: nothing
  step(8100, 2);           // cooled again: second cut
  assert.deepEqual(times, [6500, 8100],
    'cuts must obey the sustain then the cooldown, not how often the tick runs');
});

test('a recovered frame rate restores the whole picture in ONE step', () => {
  const { steps } = run(dip);
  const restores = steps.filter((s) => s.kind === 'restore');
  assert.equal(restores.length, 1,
    'recovery should be a single wholesale restore, not a rung-by-rung climb');
  const restore = restores[0];
  assert.equal(restore.scale, BASE.scale, 'recovered scale is the original, not a rung');
  assert.equal(restore.aa, BASE.aa, 'recovered aa is the original');
});

test('draw distance, shadows and the fog tie are untouched for the whole cycle', () => {
  const { gfx, steps } = run(dip);
  for (const s of steps) {
    assert.equal(s.far, BASE.far, 'a step changed gfx.far — the walk must never move draw distance');
    assert.equal(s.shadows, BASE.shadows, 'a step changed gfx.shadows — shadows are player-owned');
    assert.equal(s.fogTie, BASE.fogTie, 'a step changed gfx.fogTie — the fog tie is player-owned');
  }
  assert.equal(gfx.far, BASE.far, 'the final gfx.far moved on the walk');
  assert.equal(gfx.shadows, BASE.shadows, 'the final gfx.shadows moved on the walk');
});

test('the hysteresis holds: a machine at 30-40fps keeps its rung', () => {
  // After one cut, sit between the target (30) and the rise line (40) — the walk
  // should neither cut further nor restore, for a long time.
  const state = gfxQualCreate();
  let gfx = { ...BASE };
  const step = (t, fps) => {
    const res = gfxQualTick(state, gfx, fps, t);
    if (res) gfx = { ...gfx, ...(res.apply || res.restore), max: false };
  };
  step(1500, 2);
  step(6500, 2);            // one cut
  const afterCut = { ...gfx };
  for (let t = 6500; t < 70000; t += 100) step(t, 35);
  assert.deepEqual(gfx, afterCut,
    'a hoverer at 30-40fps must keep the rung it sits on (no cutting, no restoring)');
});

test('max switches the walk off entirely', () => {
  const { steps } = run(() => 2);
  assert.ok(steps.length > 0, 'the control dip never walked at all (bad harness)');
  const state = gfxQualCreate();
  const gfx = { ...BASE, max: true };
  let applied = 0;
  for (let t = 0; t < 60000; t += 100) {
    const res = gfxQualTick(state, gfx, 2, t);
    if (res) applied++;
  }
  assert.equal(applied, 0, 'under Max the walk must never touch the settings');
});

test('a recovered walk re-arms on the next deep dip', () => {
  const state = gfxQualCreate();
  let gfx = { ...BASE };
  const times = [];
  for (let t = 0; t < 160000; t += 100) {
    const fps = t < 40000 ? 2 : t < 80000 ? 45 : 2;   // dip, recover, dip again
    const res = gfxQualTick(state, gfx, fps, t);
    if (res) {
      gfx = { ...gfx, ...(res.apply || res.restore), max: false };
      times.push({ t, kind: res.apply ? 'step' : 'restore' });
    }
  }
  const cuts = times.filter((s) => s.kind === 'step');
  const restores = times.filter((s) => s.kind === 'restore');
  assert.equal(restores.length, 1, 'one full recovery expected');
  assert.ok(cuts.some((s) => s.t > 80000),
    'the second dip did not re-arm the walk and cut again');
});
