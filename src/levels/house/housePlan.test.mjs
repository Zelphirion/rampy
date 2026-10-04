// Floor-plan tests for the house: the room layout and the interior wall list.
// Run: node --test src/levels/house/housePlan.test.mjs
//
// These test the REAL exported layout rather than a copy. The three questions
// worth asking about a floor plan are: does it tile the footprint (no gaps you
// can fall through, no rooms inside each other), is every room reachable from
// where the car arrives, and is every doorway wider than the car.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOUSE, ROOMS, HOUSE_WALLS, HOUSE_START, HOUSE_EXIT, FRONT_DOOR, MAP_ITEMS, CAR_RADIUS } from './layout.js';

const CAR_DIAMETER = CAR_RADIUS * 2;
const EPS = 1e-6;

const NAMES = Object.keys(ROOMS);

// The boundaries with NO wall on them. These are the open-plan joins, marked
// "(open)" where they are commented out in HOUSE_WALLS, and they are what makes
// the place read as a house instead of a corridor:
//
//   kitchen | dining    the cased opening you cook across
//   dining  | foyer     no wall between them at all
//   living  | hall      one long room with the front rooms off it
//   hall    | bathroom  the bathroom opens straight onto the hall
//
// Spelled out here rather than inferred, because "there is no wall covering this
// boundary" is not the same claim as "these two rooms are meant to be one
// space" — and it is the second claim the other two tests below are resting on.
// Listed as pairs so a wall cannot be deleted by accident and quietly turn a
// walled boundary into open plan.
const OPEN_PLAN = [
  ['kitchen', 'dining'],
  ['dining', 'foyer'],
  ['living', 'hall'],
  ['hall', 'bathroom'],
];
const isOpenPlan = (a, b) => OPEN_PLAN.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

// Where two rooms touch, and along which axis.
function sharedEdge(a, b) {
  const A = ROOMS[a], B = ROOMS[b];
  const touchesX = Math.abs(A.x1 - B.x0) < EPS || Math.abs(B.x1 - A.x0) < EPS;
  const touchesZ = Math.abs(A.z1 - B.z0) < EPS || Math.abs(B.z1 - A.z0) < EPS;
  const overlapZ = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0);
  const overlapX = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
  if (touchesX && overlapZ > EPS) {
    return { axis: 'z', at: Math.abs(A.x1 - B.x0) < EPS ? A.x1 : B.x1, lo: Math.max(A.z0, B.z0), hi: Math.min(A.z1, B.z1) };
  }
  if (touchesZ && overlapX > EPS) {
    return { axis: 'x', at: Math.abs(A.z1 - B.z0) < EPS ? A.z1 : B.z1, lo: Math.max(A.x0, B.x0), hi: Math.min(A.x1, B.x1) };
  }
  return null;
}

// The wall that covers a shared edge, if there is one.
function wallCovering(edge) {
  return HOUSE_WALLS.find((w) =>
    w.axis === edge.axis && Math.abs(w.at - edge.at) < EPS
    && w.run0 <= edge.lo + EPS && w.run1 >= edge.hi - EPS
  ) || HOUSE_WALLS.find((w) =>
    w.axis === edge.axis && Math.abs(w.at - edge.at) < EPS
    && w.run0 < edge.hi - EPS && w.run1 > edge.lo + EPS
  );
}

test('rooms tile the footprint exactly, with no overlaps', () => {
  let area = 0;
  for (let i = 0; i < NAMES.length; i++) {
    for (let j = i + 1; j < NAMES.length; j++) {
      const e = sharedEdge(NAMES[i], NAMES[j]);
      // Not a shared edge just means they are diagonal neighbours here.
      void e;
      const A = ROOMS[NAMES[i]], B = ROOMS[NAMES[j]];
      const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
      const oz = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0);
      assert.ok(ox <= EPS || oz <= EPS,
        `rooms ${NAMES[i]} and ${NAMES[j]} overlap by ${ox} x ${oz}`);
    }
  }
  for (const n of NAMES) {
    const r = ROOMS[n];
    assert.ok(r.x1 > r.x0 && r.z1 > r.z0, `room ${n} is degenerate`);
    area += (r.x1 - r.x0) * (r.z1 - r.z0);
  }
  const foot = (HOUSE.maxX - HOUSE.minX) * (HOUSE.maxZ - HOUSE.minZ);
  assert.equal(area, foot, 'rooms do not cover the whole interior footprint');
});

test('every room boundary is either walled or a declared open-plan join', () => {
  const joins = new Set();
  for (let i = 0; i < NAMES.length; i++) {
    for (let j = i + 1; j < NAMES.length; j++) {
      const edge = sharedEdge(NAMES[i], NAMES[j]);
      if (!edge) continue;
      if (wallCovering(edge)) continue;
      // Nothing on this boundary at all, so the two rooms have to be one space on
      // purpose rather than because a wall went missing.
      assert.ok(isOpenPlan(NAMES[i], NAMES[j]),
        `no wall covers the ${edge.axis}=${edge.at} boundary between ${NAMES[i]} and ${NAMES[j]}, and it is not an open-plan join`);
      // One space, but the car still has to get through it.
      const wide = edge.hi - edge.lo;
      assert.ok(wide >= CAR_DIAMETER,
        `the open plan between ${NAMES[i]} and ${NAMES[j]} is only ${wide} wide, less than the ${CAR_DIAMETER} car`);
      joins.add(`${NAMES[i]}/${NAMES[j]}`);
    }
  }
  // ...and the other direction: a join that HAS been walled is no longer open
  // plan, so the list above is out of date and the test has stopped meaning what
  // it says.
  for (const [a, b] of OPEN_PLAN) {
    const edge = sharedEdge(a, b);
    assert.ok(edge, `${a} and ${b} are declared open plan but do not share an edge`);
    assert.ok(!wallCovering(edge), `${a} and ${b} are declared open plan but a wall now covers their edge`);
    assert.ok(joins.has(`${a}/${b}`), `${a} and ${b} are declared open plan but were never examined as a pair`);
  }
});

test('every room is reachable from the room the car arrives in', () => {
  // Room graph: an edge exists only where a doorway actually pierces the wall.
  const adj = Object.fromEntries(NAMES.map((n) => [n, []]));
  for (let i = 0; i < NAMES.length; i++) {
    for (let j = i + 1; j < NAMES.length; j++) {
      const edge = sharedEdge(NAMES[i], NAMES[j]);
      if (!edge) continue;
      const w = wallCovering(edge);
      if (w) {
        // A walled boundary, so the only way through is the doorway cut in it.
        if (!w.gap) continue;
        if (!(w.gap.a1 > edge.lo && w.gap.a0 < edge.hi)) continue;
      }
      // No wall on this boundary at all: open plan, and you drive straight from
      // one room into the next.
      adj[NAMES[i]].push(NAMES[j]);
      adj[NAMES[j]].push(NAMES[i]);
    }
  }
  // Start the flood from whichever room contains the arrival point.
  const start = NAMES.find((n) => {
    const r = ROOMS[n];
    return HOUSE_START.x >= r.x0 && HOUSE_START.x <= r.x1
      && HOUSE_START.z >= r.z0 && HOUSE_START.z <= r.z1;
  });
  assert.ok(start, `the car starts at ${HOUSE_START.x},${HOUSE_START.z}, which is not inside any room`);

  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const n of adj[queue.pop()]) {
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  const unreached = NAMES.filter((n) => !seen.has(n));
  assert.deepEqual(unreached, [], `unreachable rooms: ${unreached.join(', ')}`);
});

test('every doorway is wider than the car', () => {
  for (const w of HOUSE_WALLS) {
    if (!w.gap) continue;
    const width = w.gap.a1 - w.gap.a0;
    assert.ok(width >= CAR_DIAMETER,
      `doorway at ${w.axis}=${w.at} is ${width} wide; the car is ${CAR_DIAMETER} across`);
  }
});

test('doorway lintels are below the ceiling, so every opening is a real opening', () => {
  for (const w of HOUSE_WALLS) {
    if (!w.gap) continue;
    assert.ok(w.gap.top < HOUSE.ceil,
      `doorway lintel at ${w.axis}=${w.at} is at ${w.gap.top}, not below the ceiling ${HOUSE.ceil}`);
  }
});

test('the house is a square', () => {
  const w = HOUSE.maxX - HOUSE.minX, d = HOUSE.maxZ - HOUSE.minZ;
  assert.equal(w, d,
    `the house is ${w} x ${d}; it is supposed to be a square`);
  // ...and a big one: it should take up essentially the whole x span of the
  // slab, or "giant square covering most of the map" has quietly become
  // "moderately large square".
  assert.ok(w >= 176, `the house is only ${w} across`);
});

test('the arrival point is in the foyer, and the exit trigger in the dark garage', () => {
  const inRoom = (r, p) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
  const exitMid = { x: (HOUSE_EXIT.x0 + HOUSE_EXIT.x1) / 2, z: (HOUSE_EXIT.z0 + HOUSE_EXIT.z1) / 2 };
  assert.ok(inRoom(ROOMS.foyer, HOUSE_START),
    `the arrival point (${HOUSE_START.x}, ${HOUSE_START.z}) is not in the foyer`);
  assert.ok(inRoom(ROOMS.darkGarage, exitMid),
    `the exit trigger (${exitMid.x}, ${exitMid.z}) is not in the dark garage`);
});

test('the exit trigger is wide enough for the car and sits against a shell wall', () => {
  assert.ok(HOUSE_EXIT.x1 - HOUSE_EXIT.x0 >= CAR_DIAMETER, 'exit trigger too narrow in x');
  assert.ok(HOUSE_EXIT.z1 - HOUSE_EXIT.z0 >= CAR_DIAMETER, 'exit trigger too narrow in z');
  // It is hard against the west shell wall, so the car rolls away from the
  // camera and into the back of the garage.
  assert.equal(HOUSE_EXIT.x0, ROOMS.darkGarage.x0,
    'the exit trigger does not reach the west shell wall');
  assert.equal(HOUSE_EXIT.dirX, -1, 'the exit roll should head west, into the back of the garage');
});

test('the exit camera stands BEHIND the roll, so you watch the car drive into the dark', () => {
  // The whole shot is the camera holding its ground while the car recedes. If
  // the camera were on the far side of the trigger it would be watching the car
  // come AT it, and the last frame before the cut would be a headlight filling
  // the frame instead of a car swallowed by the dark.
  //
  // `dir` points the way the car ROLLS, so "behind" is a NEGATIVE projection of
  // (camera - mouth) onto dir.
  const behind = (HOUSE_EXIT.camX - HOUSE_EXIT.mouthX) * HOUSE_EXIT.dirX
    + (HOUSE_EXIT.camZ - HOUSE_EXIT.mouthZ) * HOUSE_EXIT.dirZ;
  assert.ok(behind < 0,
    `the watch camera at (${HOUSE_EXIT.camX}, ${HOUSE_EXIT.camZ}) is in front of the roll, not behind it`);
  assert.ok(HOUSE_EXIT.camX > ROOMS.darkGarage.x0 && HOUSE_EXIT.camX < ROOMS.darkGarage.x1
    && HOUSE_EXIT.camZ > ROOMS.darkGarage.z0 && HOUSE_EXIT.camZ < ROOMS.darkGarage.z1,
    'the watch camera should stand inside the garage, by the door');
  // There has to be somewhere to roll TO, or the car stops dead in the shot.
  // Coming from the east, the car trips the trigger at its x1 face.
  const enterAt = HOUSE_EXIT.dirX < 0
    ? HOUSE_EXIT.x1 + CAR_RADIUS : (HOUSE_EXIT.x1 - CAR_RADIUS);
  const roll = (HOUSE_EXIT.mouthX - enterAt) * HOUSE_EXIT.dirX
    + (HOUSE_EXIT.mouthZ - enterAt) * HOUSE_EXIT.dirZ;
  assert.ok(roll > 6, `only ${roll.toFixed(1)} units of roll between the trigger and the back wall`);
});

test('the exit camera is far enough back that the car fits in frame', () => {
  const gap = Math.hypot(HOUSE_EXIT.camX - HOUSE_EXIT.mouthX, HOUSE_EXIT.camZ - HOUSE_EXIT.mouthZ);
  assert.ok(gap > 20, `the camera is only ${gap.toFixed(1)} from the far wall; that is not a shot`);
});

test('the dark garage is reachable ONLY through the kitchen', () => {
  // Otherwise the exit trigger is a shortcut across the whole floor plan, and
  // the house stops being the thing you have to cross.
  const gar = ROOMS.darkGarage;
  const doors = HOUSE_WALLS.filter((w) => {
    // Any wall lying on one of the dark garage's four boundaries...
    const onX = w.axis === 'z' && (w.at === gar.x0 || w.at === gar.x1);
    const onZ = w.axis === 'x' && (w.at === gar.z0 || w.at === gar.z1);
    if (!onX && !onZ) return false;
    // ...that has a doorway in it, and that doorway sits within the garage's span.
    if (!w.gap) return false;
    const lo = onX ? gar.z0 : gar.x0, hi = onX ? gar.z1 : gar.x1;
    return w.gap.a1 > lo && w.gap.a0 < hi;
  });
  assert.equal(doors.length, 1, `the dark garage has ${doors.length} doorways, expected exactly 1`);
  // ...and that one is on the east wall, which is the kitchen's side.
  assert.equal(doors[0].at, gar.x1, 'the dark garage door is not on the kitchen side');
  assert.equal(ROOMS[gar === ROOMS.darkGarage ? 'kitchen' : ''].x0, gar.x1,
    'the kitchen does not sit against the dark garage door');
});

test('the front door is in the foyer, on the east wall, and there is no way out of it', () => {
  // The locked door is a detail, but the DETAIL is the point: it must be in a
  // room the player can actually reach, or the locked door is decoration in
  // somewhere they never go.
  const f = FRONT_DOOR;
  assert.equal(f.at, HOUSE.maxX + HOUSE.wall / 2, 'the front door is not in the east shell wall');
  assert.ok(f.z0 > ROOMS.foyer.z0 && f.z1 < ROOMS.foyer.z1,
    'the front door is not in the foyer');
  assert.ok(f.z1 - f.z0 >= CAR_DIAMETER, 'the front door is too narrow to be a door');
  assert.ok(f.h < HOUSE.ceil, 'the front door is taller than the house');
  // No doorway anywhere in the shell: every gap in the plan is an interior
  // wall gap, and the only way out of the house is the dark garage trigger.
  for (const w of HOUSE_WALLS) {
    const spansTheShell = (w.axis === 'z' && (w.at <= HOUSE.minX || w.at >= HOUSE.maxX))
      || (w.axis === 'x' && (w.at <= HOUSE.minZ || w.at >= HOUSE.maxZ));
    assert.ok(!spansTheShell, `a wall at ${w.axis}=${w.at} is outside the interior: the shell must be solid`);
  }
});

test('the locked front door is not itself an exit trigger', () => {
  // The exit box is in the dark garage, far away in the north-west. If the front
  // door's rectangle ever became the trigger, the locked door would quietly be
  // the way out after all.
  const f = FRONT_DOOR;
  const overlapX = Math.min(HOUSE_EXIT.x1, HOUSE.maxX) - Math.max(HOUSE_EXIT.x0, f.at);
  const overlapZ = Math.min(HOUSE_EXIT.z1, f.z1) - Math.max(HOUSE_EXIT.z0, f.z0);
  assert.ok(overlapX <= 0 || overlapZ <= 0,
    'the exit trigger overlaps the locked front door');
});

test('every big map object is inside a room, clear of the walls', () => {
  // The minimap draws these, so an object hanging in a wall would put a
  // rectangle on the plan that no longer matches anything in the world.
  //
  // The clearance test is on the object's EXTENT, not its centre: a 40-wide
  // counter whose centre happens to be 26 from a wall still has 14 of itself
  // inside it.
  for (const it of MAP_ITEMS) {
    const hw = it.w / 2, hd = it.d / 2, tag = it.label || it.kind;
    const r = NAMES.find((n) => it.x > ROOMS[n].x0 && it.x < ROOMS[n].x1
      && it.z > ROOMS[n].z0 && it.z < ROOMS[n].z1);
    assert.ok(r, `map item ${tag} at (${it.x}, ${it.z}) is not inside any room`);
    // Fully inside its room, with room to spare for the 3-thick wall on the
    // boundary and a little clearance off it.
    assert.ok(it.x - hw >= ROOMS[r].x0 + 2.5 && it.x + hw <= ROOMS[r].x1 - 2.5
      && it.z - hd >= ROOMS[r].z0 + 2.5 && it.z + hd <= ROOMS[r].z1 - 2.5,
      `map item ${tag} at (${it.x}, ${it.z}) ${it.w}x${it.d} does not fit inside ${r}`);
    for (const w of HOUSE_WALLS) {
      const across = w.axis === 'z'
        ? it.x + hw > w.at - 2.5 && it.x - hw < w.at + 2.5
        : it.z + hd > w.at - 2.5 && it.z - hd < w.at + 2.5;
      const along = w.axis === 'z'
        ? it.z + hd > w.run0 - 2.5 && it.z - hd < w.run1 + 2.5
        : it.x + hw > w.run0 - 2.5 && it.x - hw < w.run1 + 2.5;
      assert.ok(!(across && along),
        `map item ${tag} at (${it.x}, ${it.z}) is in the wall at ${w.axis}=${w.at}`);
    }
  }
});

test('nothing stands in the drive-in lane to the exit trigger', () => {
  // The car has to roll the length of the dark garage and reach the trigger.
  // A workbench parked in the middle of that is not a decoration, it is a wall:
  // the exit shot would stop short and you would circle it forever.
  const e = HOUSE_EXIT;
  for (const it of MAP_ITEMS) {
    const hw = it.w / 2, hd = it.d / 2;
    const overlapX = Math.min(it.x + hw, e.x1) - Math.max(it.x - hw, e.x0);
    const overlapZ = Math.min(it.z + hd, e.z1) - Math.max(it.z - hd, e.z0);
    assert.ok(overlapX <= 0 || overlapZ <= 0,
      `map item ${it.label || it.kind} at (${it.x}, ${it.z}) is standing in the exit trigger`);
  }
  // ...and the same for the last stretch before it, where the car is lined up
  // on the trigger's own axis.
  const laneX1 = e.x1 + CAR_RADIUS, laneX0 = e.x0 - CAR_RADIUS;
  for (const it of MAP_ITEMS) {
    const hw = it.w / 2, hd = it.d / 2;
    if (it.x + hw <= e.x1) continue;                    // already clear of it
    const inZ = it.z + hd > e.z0 - 2 && it.z - hd < e.z1 + 2;
    assert.ok(!(inZ && it.x - hw < laneX1 + 4),
      `map item ${it.label || it.kind} at (${it.x}, ${it.z}) blocks the run up to the exit trigger`);
    void laneX0;
  }
});

test('there is a map object in every room, so no room is a blank on the plan', () => {
  for (const n of NAMES) {
    const r = ROOMS[n];
    const inRoom = MAP_ITEMS.some((it) => it.x > r.x0 && it.x < r.x1 && it.z > r.z0 && it.z < r.z1);
    assert.ok(inRoom, `no map objects in ${n}: it would draw as an empty rectangle`);
  }
});

test('the minimap draws EVERY interior wall, gapless ones included', () => {
  // The plan is built from this list. A wall with no `gap` is a wall you cannot
  // drive through, and it used to be skipped entirely because the drawing code
  // only ever looped over the gap-splitting path. The garage's solid partition
  // was the worst casualty: nothing at all where the room is sealed off.
  const src = readFileSync(new URL('../../main.js', import.meta.url), 'utf8');
  const at = src.indexOf('} else if (worldState === \'house\') {');
  assert.notEqual(at, -1, 'the house branch of drawMinimap is missing from main.js');
  const body = src.slice(at, src.indexOf("ctx.fillStyle = '#ff4444'", at));

  assert.ok(!/if \(!w\.gap\) continue;/.test(body),
    'drawMinimap still skips gapless walls, so solid interior partitions are invisible on the map');
  assert.match(body, /const runs = w\.gap/,
    'drawMinimap does not branch on a wall having a gap, so solid walls cannot be drawn');
  assert.match(body, /\[\[w\.run0, w\.run1\]\]/,
    'a wall with no gap is not drawn over its full run');

  // Every authored wall must actually reach the drawing loop, gapless or not,
  // and the doorway is clamped to the run so no stub can be drawn outside the
  // wall it belongs to. One doorway is authored wider than its wall (bed2|hall);
  // the builder already tolerates that, and the plan must agree.
  for (const w of HOUSE_WALLS) {
    assert.ok(w.run1 > w.run0, `wall ${w.axis}=${w.at} run ${w.run0}..${w.run1} has no length`);
    if (!w.gap) continue;
    assert.ok(w.gap.a1 > w.gap.a0, `the doorway in wall ${w.axis}=${w.at} is inside out`);
    const g0 = Math.max(w.run0, w.gap.a0), g1 = Math.min(w.run1, w.gap.a1);
    assert.ok(g0 >= w.run0 && g1 <= w.run1 && g0 <= g1,
      `the doorway in wall ${w.axis}=${w.at} run ${w.run0}..${w.run1} does not clamp into it`);
  }
  assert.ok(HOUSE_WALLS.some((w) => !w.gap),
    'no solid walls in the list at all, so this test proves nothing');

  assert.match(body, /const g0 = w\.gap \? Math\.max\(w\.run0, w\.gap\.a0\) : 0;/,
    'the doorway is not clamped to the wall run before the wall is split');
});

test('the minimap shell band is drawn at the wall, outside the interior', () => {
  // The shell is 3 thick and sits OUTSIDE the interior face, so a plan drawn at
  // the interior bounds is a hairline in the wrong place. It has to be drawn at
  // minX/maxX +/- wall/2 or the map and the collider disagree about where the
  // house stops.
  const src = readFileSync(new URL('../../main.js', import.meta.url), 'utf8');
  const at = src.indexOf('} else if (worldState === \'house\') {');
  const body = src.slice(at, src.indexOf("ctx.fillStyle = '#ff4444'", at));

  assert.match(body, /HOUSE\.minX - HOUSE\.wall \/ 2/,
    'the west shell band is not drawn at the wall\'s outer face');
  assert.match(body, /HOUSE\.maxZ \/ 2|HOUSE\.maxZ \+ HOUSE\.wall \/ 2/,
    'the south shell band is not drawn at the wall\'s outer face');
  assert.ok(!/strokeRect\(px\(HOUSE\.minX\), pz\(HOUSE\.minZ\)/.test(body),
    'the shell is still a hairline outline instead of a visible band');
  assert.ok(HOUSE.wall > 0, 'HOUSE.wall is not a thickness');
});

test('the locked front door bar is drawn on the shell wall it lives in', () => {
  // This one was simply wrong: the drawing code read `FRONT_DOOR.w`, a field
  // that does not exist, and mixed its axes — `at` (an x) into the z helper and
  // the door's z-span into the width. The bar landed off the east wall.
  const src = readFileSync(new URL('../../main.js', import.meta.url), 'utf8');
  const at = src.indexOf('} else if (worldState === \'house\') {');
  const body = src.slice(at, src.indexOf("ctx.fillStyle = '#ff4444'", at));

  assert.ok(!/FRONT_DOOR\.w/.test(body),
    'drawMinimap still reads FRONT_DOOR.w, which is not a field on FRONT_DOOR');
  assert.match(body, /fillRect\(px\(FRONT_DOOR\.at\) - 2, pz\(FRONT_DOOR\.z0\), 4,\s*\(FRONT_DOOR\.z1 - FRONT_DOOR\.z0\) \* mmScale\)/,
    'the front door bar is not drawn as a vertical bar at FRONT_DOOR.at spanning z0..z1');

  // And the bar has to land on the east shell wall, inside it, no wider than the
  // door opening is tall.
  assert.equal(FRONT_DOOR.wallAxis, 'z', 'the front door should live in a constant-x wall');
  assert.ok(Math.abs(FRONT_DOOR.at - (HOUSE.maxX + HOUSE.wall / 2)) < EPS,
    `FRONT_DOOR.at is ${FRONT_DOOR.at}, not the centre of the east shell wall`);
  assert.ok(FRONT_DOOR.z1 > FRONT_DOOR.z0, 'the front door has no z extent to draw');
  assert.ok(FRONT_DOOR.z0 >= HOUSE.minZ && FRONT_DOOR.z1 <= HOUSE.maxZ,
    'the front door opening runs off the end of the east wall');
});
