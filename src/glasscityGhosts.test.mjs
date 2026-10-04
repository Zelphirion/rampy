// The Glass City street ghosts, and the rules that make them fair.
//
// The ghosts are the one hazard in the game you cannot outrun by being better
// at driving - they are on a fixed loop and they do not chase. That is a
// design rule, not an implementation detail, and every one of these tests
// exists to pin it: if someone makes them home in on the player, or parks a
// corner on top of a shop, or makes one leg faster than another, the ride stops
// being a hazard and becomes a nuisance with no counterplay.
//
// No three.js here on purpose: the route arithmetic is pure, so it can be
// driven at full speed without a renderer, a scene or a clock.
//
// Run: node --test src/glasscityGhosts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLASS_TOWER_COLS, GLASS_TOWER_ROWS, GLASS_Z0, GLASS_Z1,
  GHOST_ROUTES, GHOST_REACH, GHOST_RECHARGE, GHOST_SPEED,
  streetLanes, laneBlocked, isLane, legLengths, routePerimeter, routeWalker, ghostTouches,
} from './glasscityGhosts.js';

// The whole city footprint, for "is this point even in the city" checks.
const IN_CITY = (x, z) => x >= -142 && x <= 142 && z >= GLASS_Z0 && z <= GLASS_Z1;

test('the tower grid is where the glass city says it is', () => {
  // These numbers are the layout. If a test elsewhere has to hard-code them
  // again, the two copies will drift and the tests will be lying.
  assert.deepEqual(GLASS_TOWER_COLS[0], -126);
  assert.deepEqual(GLASS_TOWER_COLS.at(-1), 134);
  assert.deepEqual(GLASS_TOWER_ROWS, [134, 152, 170]);
  assert.equal(GLASS_Z0, 132);
  assert.equal(GLASS_Z1, 173);
});

test('every street lane is clear of every tower', () => {
  const { cols, rows } = streetLanes();
  assert.ok(cols.length > 0 && rows.length > 0, 'no street lanes were derived at all');
  // A lane sits midway between two towers, so it is at least half a corridor
  // away from either. Assert the real gap rather than "it is not equal".
  const minColGap = Math.min(...cols.flatMap((x) =>
    GLASS_TOWER_COLS.map((t) => Math.abs(t - x)).filter((d) => d > 0)));
  assert.ok(minColGap >= 8, `a street lane runs only ${minColGap} from a tower; it cannot be driven`);
  const minRowGap = Math.min(...rows.flatMap((z) =>
    GLASS_TOWER_ROWS.map((t) => Math.abs(t - z)).filter((d) => d > 0)));
  assert.ok(minRowGap >= 8, `a street lane runs only ${minRowGap} from a tower row`);
});

test('the ghost routes are made of street lanes and never touch a shop', () => {
  assert.ok(GHOST_ROUTES.length >= 1, 'there are no ghost routes; nothing to patrol');
  for (const r of GHOST_ROUTES) {
    assert.ok(r.legs.length >= 3, 'a route needs at least three legs to be a loop');
    for (const [x, z] of r.legs) {
      assert.ok(isLane(x, z), `route corner (${x}, ${z}) is not on a street lane, so it may clip a tower`);
      assert.ok(!laneBlocked(x, z), `route corner (${x}, ${z}) is inside a tableau shop`);
      assert.ok(IN_CITY(x, z), `route corner (${x}, ${z}) is outside the glass city`);
    }
  }
});

test('the tableau shops really do sit on lanes, so the route check has teeth', () => {
  // If the shops were off-lane then the previous test would pass no matter what
  // the routes did. Pin that they are on the grid.
  assert.ok(laneBlocked(-96, 143));
  assert.ok(laneBlocked(-16, 143));
  assert.ok(laneBlocked(84, 161));
  // And that a lane which is not a shop is not reported as one.
  assert.ok(!laneBlocked(0, 143));
  assert.ok(!laneBlocked(84, 143));
});

test('a walker starts at the first corner', () => {
  const w = routeWalker(GHOST_ROUTES[0].legs);
  assert.equal(w.leg, 0);
  assert.equal(w.along, 0);
});

test('a walker moves at the same speed on every leg', () => {
  // The reason legLengths() exists. A square route whose legs differ in length
  // must still be walked at one constant speed, or the ghost visibly lunges on
  // the long leg and crawls on the short one.
  const legs = [[0, 0], [100, 0], [100, 4], [0, 4]];
  assert.notDeepEqual(legLengths(legs)[0], legLengths(legs)[1], 'this route is square; the test needs a lopsided one');

  const w = routeWalker(legs);
  const dt = 1 / 60;
  const speeds = [];
  for (let i = 0; i < 200; i++) {
    const mv = w.step(dt);
    if (!mv) continue;
    speeds.push(mv.moved / dt);
  }
  for (const s of speeds) {
    assert.ok(Math.abs(s - GHOST_SPEED) < 1e-9, `a leg was walked at ${s}u/s, not ${GHOST_SPEED}u/s`);
  }
});

test('a walker covers its whole route and returns to the start', () => {
  const legs = GHOST_ROUTES[0].legs;
  const w = routeWalker(legs);
  const period = routePerimeter(legs) / GHOST_SPEED;
  // Exactly one lap: N equal steps sized so the total distance travelled is the
  // perimeter. Looping past the end would land somewhere random and prove nothing.
  const steps = 1000;
  for (let i = 0; i < steps; i++) w.step(period / steps);
  const mv = w.step(0);
  assert.ok(Math.abs(mv.x - legs[0][0]) < 1e-6, `ended at x=${mv.x}, expected ${legs[0][0]}`);
  assert.ok(Math.abs(mv.z - legs[0][1]) < 1e-6, `ended at z=${mv.z}, expected ${legs[0][1]}`);
});

test('a walker stays on the route no matter how big the step', () => {
  // One enormous dt has to be handled by crossing several legs, not by teleporting
  // past the corner. This is the case that bites at low frame rates.
  const legs = GHOST_ROUTES[0].legs;
  const w = routeWalker(legs);
  for (let i = 0; i < 50; i++) {
    const mv = w.step(0.4);
    assert.ok(isLane(mv.x, mv.z) || onSegment(legs, mv.x, mv.z),
      `after a 0.4s step the walker is at (${mv.x}, ${mv.z}), which is off the route`);
  }
});

// Is a point on one of the route's straight legs? Corners are lane centres, so
// a point between two corners is on a segment but not a lane.
function onSegment(legs, x, z) {
  for (let i = 0; i < legs.length; i++) {
    const [ax, az] = legs[i];
    const [bx, bz] = legs[(i + 1) % legs.length];
    const onX = ax === bx ? Math.abs(x - ax) < 1e-6 : x >= Math.min(ax, bx) - 1e-6 && x <= Math.max(ax, bx) + 1e-6;
    const onZ = az === bz ? Math.abs(z - az) < 1e-6 : z >= Math.min(az, bz) - 1e-6 && z <= Math.max(az, bz) + 1e-6;
    if (onX && onZ) return true;
  }
  return false;
}

test('a walker refuses a route it cannot walk', () => {
  assert.throws(() => routeWalker([[0, 0]]), /at least two legs/);
  assert.throws(() => routeWalker([[0, 0], [0, 0], [1, 1]]), /zero-length leg/);
});

test('a recharging walker stands still and then rejoins where it stopped', () => {
  const legs = GHOST_ROUTES[0].legs;
  const w = routeWalker(legs);
  w.step(0.5);
  w.recharge = GHOST_RECHARGE;
  const legBefore = w.leg;
  // While recharging it reports "did not move" rather than a stale position, so
  // the caller can keep the mesh where it is without a special case.
  assert.equal(w.step(0.1), null);
  assert.ok(w.recharge > 0, 'the recharge ran out after a tenth of a second');
  // Once it expires it walks on from the same leg, not from the start.
  while (w.recharge > 0) w.step(0.1);
  const resumed = w.step(0.01);
  assert.ok(resumed, 'the walker never resumed after the recharge expired');
  assert.equal(w.leg, legBefore, 'the walker jumped to a different leg when it resumed');
  assert.ok(Number.isFinite(resumed.x) && Number.isFinite(resumed.z));
});

test('the ghosts never steer toward the car', () => {
  // The core design rule, asserted directly: the walker's position is a
  // function of time alone. Run it twice with wildly different "player"
  // positions - there is no player argument, so the only thing that can differ
  // is the clock.
  const legs = GHOST_ROUTES[0].legs;
  const a = routeWalker(legs);
  const b = routeWalker(legs);
  for (let i = 0; i < 120; i++) {
    const ma = a.step(1 / 60);
    const mb = b.step(1 / 60);
    assert.equal(ma.x, mb.x);
    assert.equal(ma.z, mb.z);
  }
  assert.equal(a.leg, b.leg);
});

test('a ghost picks the car up when you drive into it', () => {
  assert.ok(ghostTouches(0, 0, 0, 0), 'standing on the ghost did nothing');
  assert.ok(ghostTouches(0, 0, GHOST_REACH - 0.1, 0), 'just inside reach did nothing');
  assert.ok(ghostTouches(0, 0, 0, -(GHOST_REACH - 0.1)), 'just inside reach on z did nothing');
});

test('a ghost lets the car past when it is well clear', () => {
  assert.ok(!ghostTouches(0, 0, GHOST_REACH + 0.5, 0), 'you were grabbed from outside the touch radius');
  assert.ok(!ghostTouches(0, 0, 40, 40), 'you were grabbed from across the city');
});

test('a ghost ignores a car flying overhead', () => {
  // The second roof runs at y ~ 32. A car up there sails over the streets and
  // must not be snatched out of the air by a street-level ghost.
  assert.ok(!ghostTouches(0, 0, 0, 0, 32), 'the ghost grabbed a car off the ceiling');
  assert.ok(!ghostTouches(0, 0, 0, 0, 12), 'the ghost grabbed a car high in the air');
  assert.ok(ghostTouches(0, 0, 0, 0, 3.9), 'the ghost will not grab a car on the ground');
});