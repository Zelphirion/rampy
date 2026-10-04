// The house's driveable surfaces, measured.
//
//   Run: node --test src/houseSurfaces.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAD, WEDGE, BOWL, surfaceAt, surfacesAt, houseSurfaceY, houseLandingY,
  stepAllowance, pad, wedge, bowl,
} from './levels/house/surfaces.js';

test('a pad is flat and only exists inside its rectangle', () => {
  const p = pad(0, 0, 10, 4, 3);
  assert.equal(surfaceAt(p, 0, 0), 3);
  assert.equal(surfaceAt(p, -4.9, 1.9), 3);
  assert.equal(surfaceAt(p, 5.1, 0), null, 'x past the edge');
  assert.equal(surfaceAt(p, 0, 2.1), null, 'z past the edge');
  // Edge-inclusive, because the car's centre exactly on the boundary should be on it.
  assert.equal(surfaceAt(p, 5, 2), 3);
});

test('a wedge rises along its run and is flat across it', () => {
  // Rises towards +x: low at x=-5, high at x=+5.
  const w = wedge(0, 0, 0, 10, 4, 6, 0);
  assert.equal(surfaceAt(w, -5, 0), 0);
  assert.equal(surfaceAt(w, 0, 0), 3);
  assert.equal(surfaceAt(w, 5, 0), 6);
  // Across the width the height does not change.
  assert.equal(surfaceAt(w, 0, -1.9), 3);
  assert.equal(surfaceAt(w, 0, 1.9), 3);
  assert.equal(surfaceAt(w, 0, 2.1), null, 'off the side');
  assert.equal(surfaceAt(w, 5.1, 0), null, 'past the top');
});

test('a wedge points where the angle says, on all four headings', () => {
  const cases = [
    [0, 5, 0],            // +x
    [Math.PI / 2, 0, 5],  // +z
    [Math.PI, -5, 0],     // -x
    [-Math.PI / 2, 0, -5], // -z
  ];
  for (const [ry, topX, topZ] of cases) {
    const w = wedge(0, 0, ry, 10, 4, 6, 0);
    assert.equal(surfaceAt(w, topX, topZ), 6, `top of the ramp at heading ${ry}`);
    assert.equal(surfaceAt(w, -topX, -topZ), 0, `foot of the ramp at heading ${ry}`);
  }
});

test('a wedge can rise from a raised base', () => {
  const w = wedge(0, 0, 0, 10, 4, 6, 12);
  assert.equal(surfaceAt(w, -5, 0), 12);
  assert.equal(surfaceAt(w, 5, 0), 18);
});

test('a bowl is lowest at the centre and at its rim height at the edge', () => {
  const b = bowl(0, 0, 5, 3, 5, 4);
  assert.equal(surfaceAt(b, 0, 0), 1, 'the bottom');
  assert.equal(surfaceAt(b, 5, 0), 5, 'the +x rim');
  assert.equal(surfaceAt(b, 0, 3), 5, 'the +z rim, on the shorter radius');
  assert.equal(surfaceAt(b, 5.1, 0), null, 'outside the rim');
  // Paraboloid, not cone: halfway out in radius is only a QUARTER of the way up.
  // A cone would put it at the halfway point, and that difference is what makes the
  // floor of the tub flat enough to drive around on.
  assert.ok(Math.abs(surfaceAt(b, 2.5, 0) - 2) < 1e-9, `got ${surfaceAt(b, 2.5, 0)}`);
});

test('a bowl is a dish, not a cone', () => {
  const b = bowl(0, 0, 6, 6, 10, 9);
  const edge = surfaceAt(b, 5.4, 0);
  const mid = surfaceAt(b, 2.7, 0);
  assert.ok(edge > mid && mid > surfaceAt(b, 0, 0));
  // The slope is shallowest at the bottom: a bowl you can roll around in.
  const lowSlope = (surfaceAt(b, 1.35, 0) - surfaceAt(b, 0, 0));
  const highSlope = (surfaceAt(b, 5.4, 0) - surfaceAt(b, 4.05, 0));
  assert.ok(lowSlope < highSlope, 'the bowl should get steeper towards the rim');
});

test('an unknown surface kind reports nothing rather than throwing', () => {
  assert.equal(surfaceAt({ kind: 'spiralRamp' }, 0, 0), null);
});

test('surfacesAt lists every surface at a point, low to high', () => {
  const list = [pad(0, 0, 10, 10, 8), pad(0, 0, 10, 10, 2), bowl(0, 0, 5, 5, 6, 4)];
  const ys = surfacesAt(list, 0, 0);
  // Two pads at 8 and 2, plus the floor of the bowl (rim 6 less its 4 of depth).
  assert.deepEqual(ys, [2, 2, 8]);
  // A point off every surface reports nothing at all, not zero.
  assert.deepEqual(surfacesAt(list, 100, 100), []);
});

// The bathtub, as the level actually builds it: a tiled pad at floor height
// running round the tub, and the tub itself as a bowl sunk below that floor with
// its rim level with it.
//
// The wall of the tub is NOT one of these surfaces — it is a collider the house
// builder pushes, because a heightfield cannot express a vertical. What the
// surfaces have to get right is everything else: that the tile holds the car up,
// that once the car is IN the tub it is on the dish, and that the surfboard (a
// wedge) carries it up to the rim.
const TILE_Y = 0.6;                                  // the tiled surround
const TUB = bowl(70, 30, 9, 5, TILE_Y, 4.5, { steep: 0.9 });
// The tile is a RING, four pads, not one pad over everything. A single pad over the
// tub would win the highest-surface contest at the centre and the bath would be
// filled in — and a ring is also what is actually tiled in a room like this.
const TILE = [
  pad(59, 30, 4, 20, TILE_Y),      // west of the tub
  pad(81, 30, 4, 20, TILE_Y),      // east
  pad(70, 37.5, 18, 5, TILE_Y),    // north
  pad(70, 22.5, 18, 5, TILE_Y),    // south
];
const BATHROOM = [...TILE, TUB];

test('the tiled surround holds the car up at the height of the tile', () => {
  assert.equal(houseSurfaceY(BATHROOM, 58, 30, TILE_Y), TILE_Y, 'tile west of the tub');
  assert.equal(houseSurfaceY(BATHROOM, 70, 38, TILE_Y), TILE_Y, 'tile north of the tub');
  assert.equal(houseLandingY(BATHROOM, 58, 30), TILE_Y);
});

test('the tub is a dish below the tile once you are over its rim', () => {
  // The colliders have already stopped the car getting here from the side; this is
  // about the floor it finds when it is here.
  // At the rim the tile and the bowl agree, so there is no step at the threshold.
  assert.equal(houseSurfaceY(BATHROOM, 61, 30, TILE_Y), TILE_Y, 'at the rim');
  // The ring has no tile over the middle, so the middle is the dish — not a floor.
  assert.equal(houseSurfaceY(BATHROOM, 70, 30, TILE_Y), TILE_Y - 4.5, 'down in the bath');
  assert.equal(houseSurfaceY(BATHROOM, 70, 30, TILE_Y - 4.5), TILE_Y - 4.5, 'the bottom');
});

test('the surfboard carries the car from the floor up to the rim of the tub', () => {
  // Leaning on the tub's west side: 20 long, tail on the bathroom floor at x=43.5,
  // nose at x=63.5 — past the rim at x=61, so it overhangs the bath.
  const board = wedge(53.5, 30, 0, 20, 7, TILE_Y + 0.4, 0);
  assert.equal(houseSurfaceY([board], 43.5, 30, 0), 0, 'the tail is on the floor');
  assert.equal(houseSurfaceY([board], 63.5, 30, 0), TILE_Y + 0.4, 'the nose is past the rim');
  // Part way up it is a genuine slope, not a teleport.
  assert.equal(houseSurfaceY([board], 53.5, 30, 0), 0.5);
  // Rolling up it from the floor, the car is carried the whole way.
  assert.equal(houseSurfaceY([board], 50, 30, 0.1), 0.325);
  // Where the board crosses the tile it is the higher of the two and wins.
  assert.equal(houseSurfaceY([board, ...BATHROOM], 58, 30, 0.6), 0.725);
  // At the lip the board still holds it up, above the tile's 0.6.
  assert.equal(houseSurfaceY([board, ...BATHROOM], 61, 30, 0.6), 0.875);
  // ...and past the lip the board is over the dish, so it drops in.
  assert.ok(houseSurfaceY([board, ...BATHROOM], 65, 30, 0.975) < 0, 'into the bath');
});

test('a car stranded in the tub can drive back out the way it came', () => {
  // The recovery path, and the reason the bowl's `steep` is 0.9: every step up the
  // inside wall has to be within the allowance, or a cat swat into the bath would
  // leave the car stuck there for good.
  let y = TILE_Y - 4.5;
  for (let x = 70; x >= 61; x -= 0.25) {
    const s = surfaceAt(TUB, x, 30);
    if (s === null) continue;
    assert.ok(s - y <= 0.9 + 1e-9, `the wall at x=${x} jumps ${s - y} in one step`);
    y = s;
  }
  assert.ok(Math.abs(y - TILE_Y) < 1e-9, 'it gets back out to the rim');
  // ...and once on the rim, the board is there to climb. Same climb, in reverse.
  const board = wedge(53.5, 30, 0, 20, 7, TILE_Y + 0.4, 0);
  assert.equal(houseSurfaceY([board, ...BATHROOM], 60, 30, 0.75), 0.825);
});

test('a pad is not a step: it has to be reached by something you can climb', () => {
  const p = pad(0, 0, 10, 10, 3);
  // This is the bathtub rim case, and it is deliberate. If the rim were a step the
  // surfboard propped against it would be pointless — you would just drive up onto
  // the tub from the side of the room. A low pad you CAN roll onto:
  assert.equal(houseSurfaceY([pad(0, 0, 10, 10, 0.4)], 0, 0, 0), 0.4, 'a low kerb is drivable');
  // ...and a 3-high one is not, no matter how the car approaches it.
  assert.equal(houseSurfaceY([p], 0, 0, 0), null, '3 up is not a step');
  // The allowance is 0.6, so 2.3 up is still out of reach and 2.4 is not.
  assert.equal(houseSurfaceY([p], 0, 0, 2.3), null, 'still not, from just below');
  assert.equal(houseSurfaceY([p], 0, 0, 2.4), 3, 'but from within the step allowance');
  // Standing off it entirely: nothing there at all.
  assert.equal(houseSurfaceY([p], 20, 20, 0), null, 'not over it');
});

test('a ramp can always be driven up, however tall its far end is', () => {
  const w = wedge(0, 0, 0, 20, 8, 14, 0);
  // Approaching from the low end at floor level: the near end is at 0, fine.
  assert.equal(houseSurfaceY([w], -10, 0, 0), 0);
  // Part way up, the car is on the ramp and follows it up.
  assert.equal(houseSurfaceY([w], 0, 0, 3), 7);
  assert.equal(houseSurfaceY([w], 10, 0, 12), 14, 'the top is reachable from just below it');
});

test('a wedge lets the car roll DOWN it as well as up', () => {
  const w = wedge(0, 0, 0, 20, 8, 14, 0);
  // Leaving the top: every point down the slope is below the car, so it is
  // always the answer, all the way to the bottom. Exact heights, not
  // approximate — a ramp that is 0.1 out at the bottom leaves the car hovering.
  for (let x = 10; x >= -10; x -= 2) {
    const y = houseSurfaceY([w], x, 0, 14);
    assert.ok(Math.abs(y - (x + 10) * 0.7) < 1e-9, `at x=${x} expected ${(x + 10) * 0.7}, got ${y}`);
  }
});

test('the highest standable surface is chosen', () => {
  // A ramp that runs up to a landing pad, with the floor under both.
  const w = wedge(-20, 0, 0, 20, 8, 8, 0);
  // The pad you arrive at the top of a ramp gets the ramp's step allowance: it is
  // the far end of the same climb, not a separate kerb to jump.
  const landing = pad(-5, 0, 10, 8, 8, { stepUp: 2 });
  // On the ramp, the ramp is the only surface.
  assert.equal(houseSurfaceY([w, landing], -20, 0, 4), 4);
  // On the landing, the landing is higher than nothing else and wins.
  assert.equal(houseSurfaceY([w, landing], -5, 0, 7), 8);
  // And where the two overlap, the higher one wins rather than the first found.
  const low = pad(-5, 0, 10, 8, 2);
  assert.equal(houseSurfaceY([low, landing], -5, 0, 7), 8, 'the landing beats the low pad');
});

test('landing takes the highest surface whatever the car was doing', () => {
  // Under the ramp there is a pad. Arriving from the air over the ramp's foot, the
  // car lands on the ramp, not on the pad it is passing.
  const w = wedge(0, 0, 0, 20, 8, 10, 6);
  const floorPad = pad(0, 0, 40, 40, 1);
  // The ramp starts at 6 at its foot and rises to 16 at its head.
  assert.equal(houseLandingY([w, floorPad], -8, 0), 7, 'on the ramp, not the pad under it');
  assert.equal(houseLandingY([w, floorPad], 0, 0), 11);
  assert.equal(houseLandingY([w, floorPad], 10, 0), 16, 'the top of the ramp');
});

test('landing on nothing reports null, so the caller uses the house floor', () => {
  assert.equal(houseLandingY([], 0, 0), null);
  assert.equal(houseLandingY([pad(50, 50, 4, 4, 3)], 0, 0), null);
  assert.equal(houseSurfaceY([], 0, 0, 0), null);
});

test('a bowl can be driven out of once you are in it', () => {
  const b = bowl(0, 0, 8, 8, 0, 3);
  // Drop in: the floor under the car at the centre is the bottom of the bowl.
  assert.equal(houseSurfaceY([b], 0, 0, 1), -3);
  // Half way out, the car is part way up the wall.
  assert.equal(houseSurfaceY([b], -4, 0, 0), -2.25);
  // At the rim it is level with the room floor.
  assert.equal(houseSurfaceY([b], -8, 0, 0), 0);
});

test('a plain bowl in an open floor is driveable in from the side', () => {
  // No colliders, no lip — a dish sunk in a bare floor with nothing stopping the
  // car. Here it SHOULD roll in, because nothing says otherwise. This is the
  // sand-pit case, and it is why `steep` is per-bowl rather than a global rule.
  const pit = bowl(0, 0, 9, 6, 0, 3, { steep: 1.2 });
  assert.equal(stepAllowance(pit), 1.2);
  // The rim is level with the floor.
  assert.equal(houseSurfaceY([pit], -9, 0, 0), 0);
  // Just inside, the floor has dropped a little — within the allowance, so the car
  // rolls in rather than being stopped by a lip it cannot see.
  assert.ok(houseSurfaceY([pit], -8.5, 0, 0) < 0, 'it rolls in');
  // And it can climb back out, because the bowl is a smooth dish: at every point
  // on the way up, the surface above the car is less than `steep` above the car.
  let y = -3;
  for (let x = -0.2; x >= -9; x -= 0.2) {
    const s = surfaceAt(pit, x, 0);
    if (s === null) continue;
    assert.ok(s - y <= 1.2 + 1e-9, `the wall at x=${x} jumps ${s - y} in one step`);
    y = s;
  }
  assert.ok(y > -0.1, 'and back out onto the floor');
});

test('step allowances are ordered: ramps are generous, pads are not', () => {
  const ramp = wedge(0, 0, 0, 10, 4, 8, 0);
  const kerb = pad(0, 0, 10, 10, 2);
  assert.ok(stepAllowance(ramp) > stepAllowance(kerb),
    'you can climb a ramp you could not step onto as a kerb');
  // A pad can be given its own allowance where the house needs one (a ramped
  // kerb, a folded blanket, the lip of the tub).
  const rampedKerb = pad(0, 0, 10, 10, 2, { stepUp: 5 });
  assert.equal(stepAllowance(rampedKerb), 5);
  assert.equal(houseSurfaceY([rampedKerb], 0, 0, 0), 2, 'a big allowance really does let it up');
});

test('every surface is finite everywhere it reports a height', () => {
  // A NaN height would put the car at an unrecoverable spot, so this is the check
  // that catches a degenerate footprint (a zero width, a zero radius) at the
  // source rather than in a physics report.
  const list = [
    pad(0, 0, 10, 10, 3),
    wedge(0, 0, 0.7, 12, 6, 5, 1),
    bowl(0, 0, 7, 4, 2, 3),
  ];
  for (let x = -14; x <= 14; x += 0.5) {
    for (let z = -14; z <= 14; z += 0.5) {
      const y = houseLandingY(list, x, z);
      if (y !== null) assert.ok(Number.isFinite(y), `bad height ${y} at ${x},${z}`);
    }
  }
});

test('a surface with a zero extent does not report a height at its centre', () => {
  // A wedge authored with len 0 or width 0 is a mistake, and silently dividing
  // by it makes the surface infinite or NaN. It must read as nothing.
  for (const bad of [wedge(0, 0, 0, 0, 4, 5), wedge(0, 0, 0, 10, 0, 5), bowl(0, 0, 0, 4, 2, 1)]) {
    const y = surfaceAt(bad, 0, 0);
    assert.ok(y === null || Number.isFinite(y), `degenerate surface reported ${y}`);
  }
});
