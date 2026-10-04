// Unit tests for the giant scallop in the park - the shared shell/pit math that
// props.js (the shell + lawn), map.js (the hole in the city slab) and main.js
// (the portal trigger + drivable ground) all read from.
// Run: node --test src/clam.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHELL_X, SHELL_Z, SHELL_GRASS, SHELL_RIBS, SHELL_SPAN, SHELL_SQUASH,
  SHELL_RIBIAMP, SHELL_THICK, LOWER_SIZE, LOWER_FLAT, UPPER_SIZE, UPPER_FLAT,
  SHELL_UMBO_Y, LOWER_H, UPPER_H, SHELL_OPEN, SHELL_SHUT, T_GRASS_HOLE,
  T_SLAB_HOLE, shellFlute, shellRadius, clamFanOutline, shellLocal,
  clamBowlHeightAt, clamInsideShell,
} from './clam.js';

const EPS = 1e-9;

// The park lawn, and the scenery the shell must stay clear of.
const LAWN = { x0: 14, x1: 30, z0: 44, z1: 64 };
const POND_EDGE_Z = 57.6;                        // pond rim, southern-most point
const BENCH = { z: 62.5, halfD: 0.35 };
const LOWER_LIP_X = SHELL_X + LOWER_SIZE;        // where the lower valve's rim lands
const EPS2 = 1e-6;

const bounds = (pts) => ({
  x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])),
  z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])),
});

// Bounds of a cut, expressed relative to the umbo (the shell's mesh origin).
const worldHole = (t) => bounds(clamFanOutline(t, SHELL_X, SHELL_Z));

// Widest the fluted silhouette gets anywhere on the fan.
function maxRadius() {
  let m = 0;
  for (let i = 0; i <= 40; i++) {
    for (let j = 0; j <= 40; j++) {
      m = Math.max(m, shellRadius(i / 40, -SHELL_SPAN + (2 * SHELL_SPAN * j) / 40));
    }
  }
  return m;
}

test('the fan is a fluted shell, wider than it is deep', () => {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 200; i++) {
    const f = shellFlute(-SHELL_SPAN + (2 * SHELL_SPAN * i) / 199);
    assert.ok(f >= -1 - EPS && f <= 1 + EPS, `flute out of range: ${f}`);
    lo = Math.min(lo, f); hi = Math.max(hi, f);
  }
  assert.ok(hi - lo > 0.5, `ribs are too shallow: range ${(hi - lo).toFixed(3)}`);
  assert.ok(Math.abs(shellFlute(0) - 1) < EPS, 'a=0 should be a rib crest');
  assert.ok(Math.abs(shellFlute(Math.PI / 2) - shellFlute(-Math.PI / 2)) < EPS,
    'the fan should be symmetric about its centre rib');
  assert.ok(SHELL_RIBS >= 8, 'want a visibly ribbed shell');
  assert.ok(SHELL_SQUASH < 1, 'a scallop is wider than it is deep');
  assert.ok(SHELL_RIBIAMP > 0, 'ribs have to cut into the silhouette');
  assert.ok(SHELL_THICK > 0, 'valves need real thickness');
  assert.ok(maxRadius() > 1 && maxRadius() <= 1 + SHELL_RIBIAMP + EPS2,
    `silhouette peaks at ${maxRadius()}`);
});

test('both ground holes are cut to the shell, inside the lawn', () => {
  // clamFanOutline hands back the path in the MESH's frame - the umbo lands at
  // (0, 0) - because the caller adds its own world position. Offset it.
  const b = worldHole(T_GRASS_HOLE);
  assert.ok(b.x0 + SHELL_X > LAWN.x0 && b.x1 + SHELL_X < LAWN.x1, JSON.stringify(b));
  assert.ok(b.z0 + SHELL_Z > LAWN.z0 && b.z1 + SHELL_Z < LAWN.z1, JSON.stringify(b));
  // And they miss the pond and the bench.
  assert.ok(b.z0 + SHELL_Z - POND_EDGE_Z > 0.1,
    `clips the pond by ${(POND_EDGE_Z - (b.z0 + SHELL_Z)).toFixed(3)}`);
  assert.ok(b.z1 + SHELL_Z < BENCH.z - BENCH.halfD, 'clips the bench');
});

test('the slab hole sits inside the turf hole, so no turf is left floating', () => {
  // A slab whose top plane is LOWER than the lawn's is only pierced nearer the
  // umbo, so the lawn hole is the wider of the two. The annulus between them is
  // where the dish is still climbing through the lawn thickness - turf removed,
  // slab intact - and there the dish surface itself is what you see.
  assert.ok(T_GRASS_HOLE > T_SLAB_HOLE,
    `turf hole ${T_GRASS_HOLE.toFixed(4)} should reach further out than slab ${T_SLAB_HOLE.toFixed(4)}`);
  const turf = worldHole(T_GRASS_HOLE);
  const slab = worldHole(T_SLAB_HOLE);
  assert.ok(slab.x0 > turf.x0 && slab.x1 < turf.x1, JSON.stringify({ turf, slab }));
  assert.ok(slab.z0 > turf.z0 && slab.z1 < turf.z1, JSON.stringify({ turf, slab }));
});

test('the pit closes on the umbo, so there is no gap at the hinge', () => {
  for (const t of [T_GRASS_HOLE, T_SLAB_HOLE]) {
    const pts = clamFanOutline(t, SHELL_X, SHELL_Z);
    assert.ok(Math.hypot(pts[0][0], pts[0][1]) < EPS2, 'the outline must start at the umbo');
    // pts[0] is the umbo and pts[1] is the far end of the fan's first straight
    // side edge, so that one step is a whole radial edge and is legitimately
    // long. The ARC after it must be a fine-grained walk.
    assert.ok(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) > 0.5,
      'the second point should be out on the fan edge');
    for (let i = 2; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      assert.ok(d < 0.25, `arc jumps ${d.toFixed(3)} at point ${i}`);
    }
    // Closing the path must bring the last arc point back down to the umbo by
    // a radial side edge, mirroring the first one.
    const last = pts[pts.length - 1];
    assert.ok(Math.hypot(last[0], last[1]) > 0.5, 'the fan must actually have edges');
    assert.ok(Math.abs(Math.hypot(last[0], last[1]) - Math.hypot(pts[1][0], pts[1][1])) < 1e-6,
      'the two side edges must be the same length');
    assert.ok(Math.abs(last[1] + pts[1][1]) < 1e-6 && Math.abs(last[0] - pts[1][0]) < 1e-6,
      'the fan must be symmetric about its centre rib');
  }
});

test('the drivable ground is the dish inside its margin, lawn outside', () => {
  // Off the shell the ground is the top of the lawn, not zero - the lawn is a
  // slab, and the caller adds this straight onto the world's ground height.
  for (const [x, z] of [[25, SHELL_Z], [SHELL_X, SHELL_Z + 2.6], [21, SHELL_Z], [SHELL_X, 45]]) {
    assert.equal(clamBowlHeightAt(x, z), SHELL_GRASS, `(${x},${z}) should be flat turf`);
  }
  assert.ok(Math.abs(clamBowlHeightAt(SHELL_X, SHELL_Z) - SHELL_UMBO_Y) < EPS2,
    'the umbo is the lowest point of the dish');
  const mid = clamBowlHeightAt(SHELL_X + 1.0, SHELL_Z);
  assert.ok(mid > SHELL_UMBO_Y && mid < 0, `mid-bowl should be between: ${mid}`);
  // Walking in from the lip toward the umbo, the dish falls monotonically.
  let prev = Infinity;
  for (let x = SHELL_X + 1.5; x > SHELL_X; x -= 0.05) {
    const y = clamBowlHeightAt(x, SHELL_Z);
    assert.ok(y <= prev + EPS2, `dish rises again at x=${x.toFixed(2)}`);
    prev = y;
  }
  assert.ok(prev < 0, 'the walk should have ended in the bowl, not on the turf');
});

test('the fan leaves a lawn wedge behind its umbo, and the ground says so', () => {
  // A pecten fan is ~200 deg wide, so the two straight side edges meet at the
  // umbo and everything outside them - including due west, behind the hinge -
  // is still lawn. The dish therefore bottoms out on a knife point, and there
  // is a genuine step in the ground where that point is. This test pins that
  // behaviour so a future change to the fan width cannot move it silently.
  const apexStep = clamBowlHeightAt(SHELL_X, SHELL_Z) - clamBowlHeightAt(SHELL_X - 0.05, SHELL_Z);
  assert.ok(apexStep < -0.4,
    `expected a ~${(SHELL_GRASS - SHELL_UMBO_Y).toFixed(2)} step just behind the umbo, got ${apexStep.toFixed(3)}`);
  // The wedge is narrow: the fan only wraps this far west of the umbo, so the
  // car - which stops in the trigger pocket, well east - never reaches it.
  const west = worldHole(T_GRASS_HOLE).x0 + SHELL_X;
  assert.ok(SHELL_X - west < 0.35, `wedge reaches ${(SHELL_X - west).toFixed(2)} west of the umbo`);
  assert.ok(west > 21.5, 'the wedge should still be inside the lawn, not cut into the road');
  // And the trigger pocket never overlaps it.
  assert.ok(clamInsideShell(SHELL_X - 0.05, SHELL_Z) || SHELL_X - 0.05 > west,
    'trigger pocket must not reach behind the umbo');
});

test('the mouth is a continuous slope, with no cliff on the driving line', () => {
  // This is the line the car actually drives down, from the park road to the
  // trigger pocket. It has to be smooth all the way - no step where the lawn
  // ends, no drop where the dish crosses the turf.
  let worst = 0;
  let prev = clamBowlHeightAt(24.5, SHELL_Z);
  for (let x = 24.45; x >= SHELL_X + 0.02; x -= 0.01) {
    const y = clamBowlHeightAt(x, SHELL_Z);
    assert.ok(Number.isFinite(y), `ground went non-finite at x=${x.toFixed(2)}`);
    worst = Math.max(worst, Math.abs(y - prev));
    prev = y;
  }
  assert.ok(worst < 0.02, `the mouth steps by ${worst.toFixed(4)} - that is a cliff to drive into`);
  // It has to actually be a bowl, not a flat plate.
  assert.ok(clamBowlHeightAt(SHELL_X + 0.05, SHELL_Z) < -0.25, 'the bowl is not deep enough to read');
});

test('the bowl profile reaches the lawn exactly where the hole is cut', () => {
  // At the turf hole's parameter the dish must sit exactly on the lawn, or the
  // cut edge and the visible dish would disagree.
  for (const a of [0, 0.5, -0.9, 1.4]) {
    const r = LOWER_SIZE * shellRadius(T_GRASS_HOLE, a);
    const wx = SHELL_X + r * Math.cos(a) * SHELL_SQUASH;
    const wz = SHELL_Z - r * Math.sin(a);
    assert.ok(Math.abs(clamBowlHeightAt(wx, wz) - SHELL_GRASS) < 1e-5,
      `at a=${a}: dish ${clamBowlHeightAt(wx, wz)} vs lawn ${SHELL_GRASS}`);
    // And just inside the rim the dish must already be below the lawn, or the
    // hole would have nothing to show.
    const ri = LOWER_SIZE * shellRadius(T_GRASS_HOLE - 0.02, a);
    assert.ok(clamBowlHeightAt(SHELL_X + ri * Math.cos(a) * SHELL_SQUASH, SHELL_Z - ri * Math.sin(a)) < SHELL_GRASS);
  }
});

test('the trigger is a small pocket in the middle of the bowl', () => {
  for (const [x, z] of [[SHELL_X, SHELL_Z], [SHELL_X + 0.4, SHELL_Z], [SHELL_X + 0.4, SHELL_Z + 0.3]]) {
    assert.ok(clamInsideShell(x, z), `(${x},${z}) should trigger`);
  }
  // Out on the rim, off the shell, or out at the wide ends of the fan.
  for (const [x, z] of [[25, SHELL_Z], [SHELL_X, SHELL_Z + 2.2], [SHELL_X, 45], [0, 0],
                        [SHELL_X + 1.5, SHELL_Z], [SHELL_X, SHELL_Z - 1.6]]) {
    assert.ok(!clamInsideShell(x, z), `(${x},${z}) must NOT trigger`);
  }
  // The pocket is a fraction of the bowl, so you cannot trip it by driving past.
  assert.ok(LOWER_SIZE > 1.2, 'bowl is implausibly small');
});

test('the valves swing from open to a sealed shut', () => {
  assert.ok(SHELL_OPEN > 1.5 && SHELL_OPEN < Math.PI, `open angle out of range: ${SHELL_OPEN}`);
  // Shut is measured the long way round: the valve sweeps past vertical, so it
  // is past pi even though the swing group only ever rotates positive.
  assert.ok(SHELL_SHUT > SHELL_OPEN && SHELL_SHUT < 2 * Math.PI,
    `shut must be further round than open: ${SHELL_SHUT}`);
  // Rotate the upper valve's margin about the hinge and see where it lands.
  // Its local point is (0, -UPPER_H, UPPER_SIZE): the valve sweeps out to +Z
  // and below the hinge, which is what makes it lean back when open.
  const marginY = -UPPER_H * Math.cos(SHELL_SHUT) - UPPER_SIZE * Math.sin(SHELL_SHUT);
  const marginOut = -UPPER_H * Math.sin(SHELL_SHUT) + UPPER_SIZE * Math.cos(SHELL_SHUT);
  assert.ok(marginOut > 0, `upper valve must swing out over the bowl: ${marginOut.toFixed(3)}`);
  // Sealed means the closed valve's rim reaches past the open bowl's lip,
  // overlapping the mouth rather than stopping short of it.
  assert.ok(SHELL_X + marginOut > LOWER_LIP_X,
    `shut margin x=${(SHELL_X + marginOut).toFixed(2)} vs bowl lip x=${LOWER_LIP_X.toFixed(2)}`);
  assert.ok(SHELL_UMBO_Y + marginY > SHELL_UMBO_Y, 'upper margin rises above the hinge as it closes');
  // The open valve leans back to the west, away from the bowl, so it does not
  // block the mouth you drive into.
  const openOut = -UPPER_H * Math.sin(SHELL_OPEN) + UPPER_SIZE * Math.cos(SHELL_OPEN);
  assert.ok(openOut < 0, `open valve should lean back, not out: ${openOut.toFixed(2)}`);
});

test('the umbo is buried, and the dish really dips below the turf', () => {
  assert.ok(SHELL_UMBO_Y < 0, 'the hinge must sit under the lawn or the pit shows');
  assert.ok(SHELL_UMBO_Y > -0.5, 'buried too deep - the dish would be a hidden pit');
  assert.ok(SHELL_GRASS > 0, 'the lawn has thickness');
  assert.ok(LOWER_H > SHELL_GRASS - SHELL_UMBO_Y, 'the dish must actually dip below the turf');
  assert.ok(SHELL_UMBO_Y + LOWER_H > SHELL_GRASS + 0.1,
    'the lower valve rim must still stand proud of the lawn, or the shell is buried');
  assert.ok(T_GRASS_HOLE > 0 && T_GRASS_HOLE < 1, 'the turf hole must be on the dish');
  assert.ok(LOWER_FLAT < 1 && UPPER_FLAT === 1, 'only the lower valve is squashed');
  // The valve needs to be bigger than the hole it sits in, or the rim would be
  // clipped off flush with the cut instead of overhanging and burying itself.
  assert.ok(LOWER_LIP_X > bounds(clamFanOutline(T_GRASS_HOLE, SHELL_X, SHELL_Z)).x1,
    'the valve rim must overhang the turf hole');
});
