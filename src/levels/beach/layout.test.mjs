import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beachGroundOffsetAt, beachSandOffsetAt, beachColliders,
  beachShellPitPath, inBeachShellPit,
  BEACH_START, BEACH_SHELL, BEACH_SAND_Y, BEACH_SEA_Y, BEACH_SHORE_Z,
  BEACH_RIM_Z, BEACH_TRENCH_Z, BEACH_CLIFF_Z, BEACH_HALF_W, BEACH_BASIN_Y,
  BEACH_PALMS, BEACH_ROCKS, BEACH_REEFS, clamp01, courseInset, CLIFF_REACH,
  PERSON_H, ANIMAL_SCALE, animalSize,
} from './layout.js?v=1791038381904';

const inRange = (v, lo, hi) => v >= lo && v <= hi;

// The cove, sampled all the way out to sea. Offsets, not absolute heights.
const Z_PROBE = [80, 70, 68, 60, 56, 46, 40, 34, 30, 26, 20, 18, 12, 6, 0, -4, -10, -17, -24, -28, -30, -33, -37, -40, -50];

test('you are let off between the cliffs and the water, on dry sand, facing the sea', () => {
  assert.ok(BEACH_START.z < BEACH_CLIFF_Z, 'spawn is south of the back cliff');
  assert.ok(BEACH_START.z > BEACH_SHORE_Z + 8, 'spawn is well north of the waterline');
  const y = beachGroundOffsetAt(BEACH_START.x, BEACH_START.z);
  assert.ok(y > BEACH_SEA_Y + 0.4, `spawn is above the water (got ${y.toFixed(2)})`);
  assert.ok(inRange(y, BEACH_SAND_Y - 0.2, BEACH_SAND_Y + 0.35), `spawn is on flat dry sand (got ${y.toFixed(2)})`);
  // yaw PI faces -Z, and the sea is at -Z, so the water is straight ahead.
  assert.equal(BEACH_START.yaw, Math.PI);
  assert.ok(BEACH_START.z - 10 > BEACH_SHORE_Z, 'ten units ahead of the spawn is still beach');
});

test('the sand is continuous under the wheels - no cliff anywhere on a driving line', () => {
  // Walk everywhere the car can actually get to, at a resolution finer than a
  // wheel, on several lines across the cove, and reject any step big enough to
  // stop the car dead. The scan stops at the drop-off rim because that is a
  // collider, not ground: past it the car is never going.
  let worst = 0;
  let worstAt = null;
  for (const x of [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]) {
    let prev = beachGroundOffsetAt(x, BEACH_CLIFF_Z + 6);
    for (let z = BEACH_CLIFF_Z + 6; z >= BEACH_RIM_Z; z -= 0.25) {
      const y = beachGroundOffsetAt(x, z);
      const step = Math.abs(y - prev) / 0.25;
      if (step > worst) { worst = step; worstAt = `x=${x} z=${z.toFixed(2)}`; }
      prev = y;
    }
  }
  assert.ok(worst < 1.6, `steepest drivable slope ${worst.toFixed(2)} at ${worstAt}`);

  // ...and the rim itself IS steep, which is the point of it.
  const lip = Math.abs(beachGroundOffsetAt(0, BEACH_RIM_Z - 1) - beachGroundOffsetAt(0, BEACH_RIM_Z));
  assert.ok(lip > 3, `the drop-off lip is a real cliff (${lip.toFixed(2)} in one unit)`);
});

test('the profile runs sand -> sea -> basin -> drop-off -> trench, once and in order', () => {
  const at = (z) => beachGroundOffsetAt(0, z);
  assert.ok(at(BEACH_CLIFF_Z - 1) > BEACH_SAND_Y, 'clifftop sand is above the beach');
  assert.ok(at(BEACH_SHORE_Z) > BEACH_SEA_Y, 'the waterline is still above the sea');
  assert.ok(at(-10) < BEACH_SEA_Y, 'the sea floor is below the water');
  // The basin is a broad pan, not a point: it reaches very nearly full depth and
  // stays there across most of the run out to the drop-off. (Depth is NEGATIVE,
  // so the deepest point is the MINIMUM height, not the maximum.)
  let basin = Infinity;
  for (let z = BEACH_SHORE_Z - 6; z > BEACH_RIM_Z; z -= 2) basin = Math.min(basin, at(z));
  assert.ok(Math.abs(basin - BEACH_BASIN_Y) < 0.6, `the basin bottoms out near BEACH_BASIN_Y (got ${basin.toFixed(2)})`);
  assert.ok(at(BEACH_RIM_Z + 1) > BEACH_BASIN_Y - 2, 'the rim is still shallow enough to drive to');
  assert.ok(at(BEACH_TRENCH_Z) < at(BEACH_RIM_Z) - 10, 'past the rim it plunges');
});

test('the drop-off is a wall, not just a slope - the car cannot leave the basin', () => {
  const cs = beachColliders();
  const rim = cs.find((c) => Math.abs(c.z - BEACH_RIM_Z) < 0.5);
  assert.ok(rim, 'there is a collider standing on the drop-off rim');
  assert.ok(rim.noRoof, 'the rim is a barrier, so it must not report a rooftop');
  // It has to span the whole cove, or you could squeeze out beside it.
  assert.ok(rim.halfW >= BEACH_HALF_W, `the rim spans the cove (halfW ${rim.halfW})`);
  // And the sand outside the rim really is far below the rim, so the wall is
  // not hiding a ramp that could be driven around.
  assert.ok(beachGroundOffsetAt(0, BEACH_RIM_Z - 3) < beachGroundOffsetAt(0, BEACH_RIM_Z) - 3,
    'the ground falls away immediately past the rim');
});

test('every wall is noRoof, so none of them can be driven along the top of', () => {
  for (const c of beachColliders()) {
    assert.equal(c.noRoof, true, `collider at (${c.x}, ${c.z}) is a barrier`);
    // Colliders come in two shapes. main.js's onColliderFootprint() treats a
    // collider carrying `r` as a disc and everything else as a box, and these
    // tests have to agree with that rule rather than assume a box - the reef
    // colliders are round, and a round collider drawn as its bounding box would
    // overhang the visible coral by 41% at each corner.
    if (c.r !== undefined) {
      assert.ok(c.r > 0, `the round collider at (${c.x}, ${c.z}) has a radius`);
    } else {
      assert.ok(c.halfW > 0 && c.halfD > 0, `collider at (${c.x}, ${c.z}) has a size`);
    }
  }
});

test('the reefs are round, submerged, and reachable from the basin', () => {
  const cs = beachColliders();
  const reefs = BEACH_REEFS.map(([x, z, r, h]) => ({ x, z, r, h }));
  assert.ok(reefs.length >= 4, 'there are reefs worth driving around');
  for (const reef of reefs) {
    const c = cs.find((c) => Math.abs(c.x - reef.x) < 1e-6 && Math.abs(c.z - reef.z) < 1e-6);
    assert.ok(c, `the reef at (${reef.x}, ${reef.z}) has a collider`);
    // A reef is round, and a square collider around a round lump of coral stops
    // the car well clear of anything it can see.
    assert.ok(c.r !== undefined, `the reef at (${reef.x}, ${reef.z}) is a disc`);
    // The collider goes just inside the coral's widest flare, never outside it:
    // a barrier wider than the visible reef reads as hitting thin air.
    assert.ok(c.r < reef.r, `the reef collider at (${reef.x}, ${reef.z}) is inside the coral`);
    assert.ok(c.r > reef.r * 0.6, `the reef collider at (${reef.x}, ${reef.z}) is not a sliver`);
    // Submerged. A coral head that breaks the surface stops reading as coral.
    assert.ok(beachGroundOffsetAt(reef.x, reef.z) + reef.h < BEACH_SEA_Y - 1,
      `the reef at (${reef.x}, ${reef.z}) stays under the water`);
    // In the drivable basin, not out past the drop-off lip.
    assert.ok(reef.z > BEACH_RIM_Z + 6, `the reef at (${reef.x}, ${reef.z}) is before the rim`);
  }
  // No two reefs may overlap, or they fuse into one barrier the car cannot pass.
  for (let i = 0; i < reefs.length; i++) {
    for (let j = i + 1; j < reefs.length; j++) {
      const a = reefs[i], b = reefs[j];
      const gap = Math.hypot(a.x - b.x, a.z - b.z) - (a.r + b.r);
      assert.ok(gap > 8, `the reefs at (${a.x}, ${a.z}) and (${b.x}, ${b.z}) leave a driveable gap`);
    }
  }
});

test('the cove is closed on all three land sides, out at the overhanging lip', () => {
  const cs = beachColliders();
  // The barrier has to stand at the furthest the rock ever reaches OUT, which is
  // the overhanging top courses - not at the nominal base line. A wall on the
  // base line would let the car drive out under the overhang.
  const backReach = BEACH_CLIFF_Z - CLIFF_REACH.out;
  const sideReach = BEACH_HALF_W - CLIFF_REACH.out;
  assert.ok(CLIFF_REACH.out > 3, `the cliff really does overhang the beach (${CLIFF_REACH.out.toFixed(2)})`);

  const back = cs.find((c) => c.halfW >= BEACH_HALF_W && c.z > BEACH_CLIFF_Z - 20 && c.z < BEACH_CLIFF_Z);
  assert.ok(back, 'the back cliff is walled across the whole cove');
  assert.ok(back.z - back.halfD <= backReach + 1e-6,
    `the back wall reaches the overhang (inner edge ${(back.z - back.halfD).toFixed(2)} vs reach ${backReach.toFixed(2)})`);

  for (const sx of [-1, 1]) {
    const side = cs.find((c) => c.halfD > 50 && Math.sign(c.x) === sx && Math.abs(Math.abs(c.x) - sideReach) < 12);
    assert.ok(side, `the ${sx < 0 ? 'west' : 'east'} cliff is walled`);
    const inner = sx < 0 ? side.x + side.halfW : side.x - side.halfW;
    assert.ok(inner <= sideReach + 1e-6,
      `the ${sx < 0 ? 'west' : 'east'} wall reaches the overhang (inner edge ${inner.toFixed(2)} vs reach ${sideReach.toFixed(2)})`);
  }

  // ...and the two back corners, where a wall each way leaves a notch.
  for (const sx of [-1, 1]) {
    assert.ok(cs.some((c) => Math.sign(c.x) === sx && c.z > BEACH_CLIFF_Z - 16 && c.z < BEACH_CLIFF_Z),
      `the ${sx < 0 ? 'west' : 'east'} back corner is filled in`);
  }
});

test('the cliff rock overhangs its own base line, undercut at the foot', () => {
  // Up at the top the courses must lean OUT over the beach (that is the Sunset
  // Cliffs look), and at the bottom they must be cut BACK (the sea caves).
  assert.ok(courseInset(1) < -3, 'the lip overhangs');
  assert.ok(courseInset(0) > 0, 'the foot is undercut');
  assert.ok(Math.abs(courseInset(0.5)) < 1, 'the middle is close to sheer');
  // And the barrier is out at that overhang, never in behind it.
  assert.ok(CLIFF_REACH.back > 0.5, 'the cliff recedes somewhere');
  assert.ok(CLIFF_REACH.out > -courseInset(1) - 1e-9, 'reachOut matches the worst overhang');
});

test('the beach does not wrap: it is a box, with bounded ground all the way round', () => {
  // Nothing outside the cove may offer a drivable surface: drive the plane and
  // there is nowhere out there to be.
  for (const z of [200, 500, 5000]) {
    for (const x of [-5000, -200, 200, 5000]) {
      const y = beachGroundOffsetAt(x, z);
      assert.ok(Number.isFinite(y), `ground at (${x}, ${z}) is finite`);
    }
  }
  // And far out to sea it is flat trench floor, not a second beach to wrap to.
  assert.equal(beachGroundOffsetAt(0, -4000), beachGroundOffsetAt(0, -400));
});

test('the shell is bedded in the sand and its hole is a real hole in the ground', () => {
  assert.equal(BEACH_SHELL.surfaceY, BEACH_SAND_Y, 'the shell is cut for one single ground height');
  const centre = beachGroundOffsetAt(BEACH_SHELL.x, BEACH_SHELL.z);
  assert.ok(centre < BEACH_SAND_Y - 0.4, `the bowl really dips (got ${centre.toFixed(2)})`);
  const path = beachShellPitPath();
  assert.ok(inBeachShellPit(BEACH_SHELL.x, BEACH_SHELL.z, path), 'the umbo is inside the hole');
  // ...and there IS sand around it, so the hole is a hole and not a hole in
  // the middle of a hole.
  const far = BEACH_SHELL.reach().x + 2.5;
  assert.ok(!inBeachShellPit(BEACH_SHELL.x + far, BEACH_SHELL.z, path), 'sand closes back up beyond the shell');
  assert.ok(inRange(beachGroundOffsetAt(BEACH_SHELL.x + far, BEACH_SHELL.z), BEACH_SAND_Y - 0.01, BEACH_SAND_Y + 0.01),
    'the sand beyond the hole is flat sand at exactly BEACH_SAND_Y');
});

test('the shell hole is not flush with the sand - it overlaps it', () => {
  // If the hole were cut exactly on the crossing there would be a hairline
  // crack between the sand and the valve. It has to be cut a touch tighter.
  const path = beachShellPitPath();
  // A ring just outside the true crossing must already be sand.
  const reach = BEACH_SHELL.reach();
  for (const [dx, dz] of [[reach.x * 1.2, 0], [-reach.x * 1.2, 0], [0, reach.z * 1.2], [0, -reach.z * 1.2]]) {
    assert.ok(!inBeachShellPit(BEACH_SHELL.x + dx, BEACH_SHELL.z + dz, path),
      `(${(BEACH_SHELL.x + dx).toFixed(2)}, ${(BEACH_SHELL.z + dz).toFixed(2)}) is sand`);
  }
});

test('the trigger is a small pocket deep in the bowl, not the whole hole', () => {
  assert.ok(BEACH_SHELL.inside(BEACH_SHELL.x, BEACH_SHELL.z), 'the umbo triggers');
  assert.ok(!BEACH_SHELL.inside(BEACH_SHELL.x + 3, BEACH_SHELL.z), 'the sand outside does not');
  assert.ok(!BEACH_SHELL.inside(BEACH_SHELL.x - 3, BEACH_SHELL.z), 'the gap side does not');
});

test('the spawn is clear of the shell, so arriving never fires the way home', () => {
  const d = Math.hypot(BEACH_START.x - BEACH_SHELL.x, BEACH_START.z - BEACH_SHELL.z);
  assert.ok(d > 6, `the spawn is a good walk from the shell (got ${d.toFixed(2)})`);
  assert.ok(!BEACH_SHELL.inside(BEACH_START.x, BEACH_START.z), 'the spawn is not inside the trigger');
});

test('the shell sits on the flat, driveable shelf between the cliffs and the sea', () => {
  assert.ok(inRange(BEACH_SHELL.z, 18, 34), `the shell is on the flat shelf (z ${BEACH_SHELL.z})`);
  // A straight run at it from the west, the way the park shell is taken.
  for (let x = BEACH_SHELL.x - 8; x <= BEACH_SHELL.x; x += 0.5) {
    const y = beachGroundOffsetAt(x, BEACH_SHELL.z);
    assert.ok(y > BEACH_SEA_Y - 0.1, `the run-up at x=${x.toFixed(1)} is dry land`);
  }
});

test('scenery is all on dry sand and clear of the shell hole', () => {
  const path = beachShellPitPath();
  for (const [x, z] of [...BEACH_PALMS, ...BEACH_ROCKS]) {
    const y = beachGroundOffsetAt(x, z);
    assert.ok(y > BEACH_SEA_Y, `(${x}, ${z}) is out of the water (got ${y.toFixed(2)})`);
    assert.ok(Math.abs(x) < BEACH_HALF_W - 2, `(${x}, ${z}) is inside the cliffs`);
    assert.ok(z < BEACH_CLIFF_Z - 2, `(${x}, ${z}) is clear of the cliff foot`);
    assert.ok(!inBeachShellPit(x, z, path), `(${x}, ${z}) is not standing in the shell`);
  }
});

test('the sand profile and the drivable surface agree everywhere but the bowl', () => {
  // Away from the hole they must be identical, or the mesh the player looks at
  // and the surface the car rides on have quietly come apart.
  for (let x = -50; x <= 50; x += 5) {
    for (let z = BEACH_CLIFF_Z; z >= BEACH_TRENCH_Z; z -= 2) {
      if (inBeachShellPit(x, z, beachShellPitPath())) continue;
      assert.equal(beachGroundOffsetAt(x, z), beachSandOffsetAt(x, z), `at (${x}, ${z})`);
    }
  }
});

test('clamp01 is a clamp', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(0.5), 0.5);
});

// ---- Scale ----
//
// The wildlife was rebuilt against the house-chair person, and it went wrong
// twice in ways that no amount of looking at the code would have caught: the
// fish were being built at their raw FRACTION as if it were a length in metres,
// and the mermaid measured 5.36 against a target of 7.5. Both came from the same
// root - sizes written as bare numbers in more than one place. These tests are
// here so the table cannot quietly go back to that.

test('the person is the yardstick, and it is a person and not a car', () => {
  // The chair in the house seats someone about this tall.
  assert.ok(PERSON_H >= 7 && PERSON_H <= 8, `a person here is ${PERSON_H} tall`);
  // The car is 4.4 across (playerCarRadius 2.2). It must be smaller than a
  // person, or the person is not the yardstick.
  assert.ok(PERSON_H > 4.4, 'a person is taller than the car is wide');
});

test('every animal size is a FRACTION of a person, not a length', () => {
  for (const [kind, entry] of Object.entries(ANIMAL_SCALE)) {
    const fracs = Array.isArray(entry.frac) ? entry.frac : [entry.frac];
    assert.ok(fracs.length > 0, `${kind} has at least one size`);
    for (const f of fracs) {
      // A fraction, strictly: above zero, and never more than a whole person.
      // A value over 1 here is the signature of a length in metres that has been
      // filed as a fraction.
      assert.ok(f > 0 && f <= 1, `${kind} size ${f} is a fraction of a person`);
      assert.equal(animalSize(kind, fracs.indexOf(f)), PERSON_H * f,
        `${kind} converts its fraction to a length consistently`);
    }
    assert.ok('x' === entry.axis || 'y' === entry.axis || 'z' === entry.axis,
      `${kind} declares the axis it is measured along`);
  }
});

test('the sizes are ordered like the animals they are', () => {
  const big = animalSize('fish', 5);   // the largest fish
  assert.ok(animalSize('mermaid') > big, 'a mermaid is longer than the biggest fish');
  assert.ok(animalSize('mermaid') > animalSize('turtle'), 'a mermaid beats a turtle');
  assert.ok(animalSize('turtle') > animalSize('crab'), 'a turtle beats a crab');
  assert.ok(animalSize('crab') > animalSize('seahorse'), 'a crab beats a seahorse');
  assert.ok(animalSize('seahorse') > 0.5, 'the smallest animal is still visible from the car');
});

test('a mermaid is the size of a person, which is the whole point of her', () => {
  assert.equal(animalSize('mermaid'), PERSON_H);
  // Measured on screen, she is judged against the CAR, so check her against it
  // too: she should tower over the thing the player is sitting in.
  assert.ok(animalSize('mermaid') / 4.4 > 1.5, 'she is well over a car-width across');
});

test('the fish kinds and their sizes are the same length', () => {
  // ANIMAL_SCALE indexes FISH_KINDS by position, and the kinds table carries no
  // length of its own. If a kind is added without a matching fraction,
  // animalSize() hands makeFish() undefined and every fish of that kind is built
  // at NaN.
  assert.equal(ANIMAL_SCALE.fish.frac.length, 6, 'there is a fraction for each fish kind');
  for (let i = 0; i < ANIMAL_SCALE.fish.frac.length; i++) {
    const len = animalSize('fish', i);
    assert.ok(Number.isFinite(len) && len > 0, `fish kind ${i} has a real length`);
  }
});

test('every size animalSize is asked for resolves to a finite length', () => {
  // Guards the indexing above against a typo'd kind name quietly producing
  // undefined and taking the whole beach with it.
  for (const kind of Object.keys(ANIMAL_SCALE)) {
    const entry = ANIMAL_SCALE[kind];
    const n = Array.isArray(entry.frac) ? entry.frac.length : 1;
    for (let i = 0; i < n; i++) {
      assert.ok(Number.isFinite(animalSize(kind, i)), `${kind}[${i}] resolves`);
    }
  }
});
