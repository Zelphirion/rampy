// The automatic quality walk, tested as a pure engine (modules/gfxQualityWalk.js),
// which main.js feeds with its live fps each frame. This is where the two
// promises of the walk are pinned:
//
//   1. It is BIDIRECTIONAL: quality is cut rung-by-rung under strain and then
//      handed back rung-by-rung once the frame rate recovers, ending in a
//      wholesale restore of the player's original settings.
//   2. It never touches DRAW DISTANCE: `far` is not a key in any rung, and `gfx`
//      keeps the same far plane throughout a full cut-and-recover cycle.
//
// Run: node --test src/gfxQualityWalk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gfxQualCreate,
  gfxQualTick,
  GFX_AUTO_LADDER,
  GFX_AUTO_FLOOR,
  GFX_AUTO_TARGET,
  GFX_AUTO_RISE,
  GFX_SCALE_MIN,
} from './modules/gfxQualityWalk.js';

const BASE = { scale: 1, far: 500, fogTie: true, shadows: true, aa: true, max: false };

// Drive one walk with a frame-rate function of time. Returns the final gfx and
// every applied action (with the gfx state right after it applied).
function run(fpsAt, tickMs = 100) {
  const state = gfxQualCreate();
  let gfx = { ...BASE };
  const steps = [];
  let time = 0;
  for (let i = 0; i < 20000; i++) {
    const res = gfxQualTick(state, gfx, fpsAt(time), time);
    if (res) {
      if (res.apply) {
        assert.ok(!('far' in res.apply), 'a rung is trying to change the draw distance');
        assert.ok(!('max' in res.apply), 'a rung is trying to change the max flag');
        gfx = { ...gfx, ...res.apply, max: false };
      } else {
        gfx = { ...gfx, ...res.restore };
      }
      steps.push({ time, kind: res.apply ? 'step' : 'restore', ...gfx });
    }
    time += tickMs;
  }
  return { gfx, steps };
}

const dip = (t) => (t < 8000 ? 12 : 45);   // deep strain, then a comfortable recovery

test('a sustained dip walks quality DOWN one rung per cooldown', () => {
  const { steps } = run(() => 12);   // strained forever: it must reach the floor
  const cuts = steps.filter((s) => s.kind === 'step');
  // The very first steps ride the top of the ladder (scale 1, aa off), so the
  // width of the cut run is the whole ladder, one step every cooldown.
  assert.equal(cuts.length, GFX_AUTO_LADDER.length,
    'the walk should step through every rung of the ladder while the machine is strained');
  const scales = cuts.map((s) => s.scale);
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i] <= scales[i - 1],
    'scale must never climb while the walk is cutting');
  assert.equal(cuts[cuts.length - 1].scale, GFX_SCALE_MIN,
    'the bottom rung is the blocky end, not somewhere above it');
  assert.equal(cuts[cuts.length - 1].shadows, false, 'shadows are off at the floor');
  assert.equal(cuts[cuts.length - 1].aa, false, 'aa is off at the floor');
  // Each cut lands on a real rung.
  const rungScales = GFX_AUTO_LADDER.map((r) => r.scale);
  for (const s of scales) assert.ok(rungScales.includes(s),
    `applied scale ${s} is not a ladder rung`);
});

test('each cut waits out the cooldown (no two cuts on top of each other)', () => {
  const state = gfxQualCreate();
  let gfx = { ...BASE };
  const times = [];
  const step = (t, fps) => {
    const res = gfxQualTick(state, gfx, fps, t);
    if (res) { gfx = { ...gfx, ...res.apply, max: false }; times.push(t); }
  };
  const low = 12;
  step(0, low);        // first tick is itself on cooldown (lastStep=0): nothing yet
  step(1500, low);     // cooled + under floor -> arms the dip (lowSince=1500)
  step(3000, low);     // armed + sustained + cooled -> first cut
  step(3100, low);     // 100ms later: still on cooldown -> nothing
  step(4600, low);     // again cooled + sustained -> second cut
  assert.deepEqual(times, [3000, 4600],
    'cuts must be spaced by the cooldown, not by how often the tick happens to run');
});

test('once the frame rate recovers, quality comes back rung by rung, then fully', () => {
  const { steps } = run(dip);
  const cuts = steps.filter((s) => s.kind === 'step');
  const rises = steps.filter((s) => s.kind === 'step' && s.time > 8000);
  const restore = steps.find((s) => s.kind === 'restore');
  assert.ok(rises.length > 0, 'recovering frame rate never hands a rung back');
  assert.ok(rises.length < GFX_AUTO_LADDER.length,
    'the recovery should climb one rung at a time, not snap straight to the top');
  assert.ok(restore, 'a full recovery never restores the user settings');
  assert.equal(restore.scale, BASE.scale, 'recovered scale is the original, not a rung');
  assert.equal(restore.shadows, BASE.shadows, 'recovered shadows are the original');
  assert.equal(restore.aa, BASE.aa, 'recovered aa is the original');
  assert.equal(cuts[0].scale, GFX_AUTO_LADDER[0].scale, 'the walk started from the top rung base');
});

test('draw distance is untouched for the whole cut-and-recover cycle', () => {
  const { gfx, steps } = run(dip);
  for (const s of steps) assert.equal(s.far, BASE.far,
    'a step changed gfx.far — the walk must never move draw distance');
  assert.equal(gfx.far, BASE.far, 'the final gfx.far moved on the walk');
});

test('the hysteresis holds: a machine at 30-40fps keeps its settings', () => {
  // After one cut, sit between the target (30) and the rise line (40) — the walk
  // should neither cut further nor hand anything back, for a long time.
  const state = gfxQualCreate();
  let gfx = { ...BASE };
  const step = (t, fps) => {
    const res = gfxQualTick(state, gfx, fps, t);
    if (res) gfx = { ...gfx, ...(res.apply || res.restore), max: false };
  };
  step(0, 12);
  step(1500, 12);            // one cut
  const afterCut = { ...gfx };
  for (let t = 1500; t < 40000; t += 100) step(t, 35);
  assert.deepEqual(gfx, afterCut,
    'a hoverer at 30-40fps must keep the rung it sits on (no cutting, no rising)');
});

test('max switches the walk off entirely', () => {
  const { steps } = run(() => 12);
  const froze = run(() => 12);
  assert.ok(steps.length > 0, 'the control dip never walked at all (bad harness)');
  const state = gfxQualCreate();
  let gfx = { ...BASE, max: true };
  let applied = 0;
  for (let t = 0; t < 40000; t += 100) {
    const res = gfxQualTick(state, gfx, 12, t);
    if (res) applied++;
  }
  assert.equal(applied, 0, 'under Max the walk must never touch the settings');
});

test('a recovered walk re-arms on the next dip', () => {
  const { steps } = run(dip);
  const firstRestore = steps.findIndex((s) => s.kind === 'restore');
  assert.ok(firstRestore > -1, 'control run never restored');
  const secondCut = steps.findIndex((s, i) => i > firstRestore && s.kind === 'step' && s.time > 8000 + 8000);
  // After restoring (at ~t>8000), the run above keeps fps at 45 forever, so a
  // second dip needs a fresh machine: walk that here.
  const state = gfxQualCreate();
  let gfx = { ...BASE };
  const gfx2 = { ...BASE };
  const times = [];
  for (let t = 0; t < 80000; t += 100) {
    const fps = t < 5000 ? 12 : t < 20000 ? 45 : 12;   // dip, recover, dip again
    const res = gfxQualTick(state, gfx, fps, t);
    if (res) {
      if (res.apply) gfx2.max = false, Object.assign(gfx2, res.apply);
      else Object.assign(gfx2, res.restore);
      times.push({ t, kind: res.apply ? 'step' : 'restore', scale: gfx2.scale });
    }
    gfx = gfx2;
  }
  const cuts = times.filter((s) => s.kind === 'step');
  const restores = times.filter((s) => s.kind === 'restore');
  assert.equal(restores.length, 1, 'one full recovery expected');
  assert.ok(cuts.some((s) => s.t > 20000),
    'the second dip did not re-arm the walk and cut again');
});