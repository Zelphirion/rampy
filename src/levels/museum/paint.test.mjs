// The paint exhibit, driven headless: knock a ladder over, watch its can spill,
// then drive out of the puddle and leave a trail that thins to nothing.
//
// Run: node --test src/levels/museum/paint.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('../house/threeShim.mjs', import.meta.url);

const { buildPaintExhibit, LADDER_SPOTS, RAINBOW_PAINTS, LADDER_FRAME, PAINT_SWAP_DIST } = await import('./paint.js');
// The SAME module instance paint.js gets (its import carries the cache stamp),
// or the test would step a second, empty knockables list.
const { updateKnockables, triggerKnockable } = await import('../../physics.js?v=1800000000006');

const FLOOR = -36;
const BOUNDS = { x0: -167.5, x1: 167.5, z0: -265.5, z1: 69.5 };
const PUDDLE_MAX = 16;   // kept in step with paint.js
// A clear patch of cloth for the driving tests, well away from the room's own
// two hundred ladders.
const SOLO = { x: 60, z: -120, yaw: 0 };

function makeExhibit() {
  const parent = { add() {} };
  return buildPaintExhibit(parent, { floorY: FLOOR, bounds: BOUNDS });
}

// A one-ladder room, so a driving test can lay a trail without ploughing into
// the next of the two hundred.
function makeSolo(spot = SOLO) {
  const parent = { add() {} };
  return buildPaintExhibit(parent, { floorY: FLOOR, bounds: BOUNDS, spots: [spot] });
}

// One of a ladder's four feet, in world x/z. The frame is open between them, so
// this is the only part of a standing ladder a car can actually hit.
function footOf(spot, sx = 1, sz = 1) {
  const c = Math.cos(spot.yaw || 0), s = Math.sin(spot.yaw || 0);
  const lx = sx * LADDER_FRAME.footX;
  const lz = sz * LADDER_FRAME.footZ;
  return { x: spot.x + lx * c + lz * s, z: spot.z - lx * s + lz * c };
}

// Topple a ladder the way a car really does: drive into one of its feet.
function knockLadder(paint, spot = SOLO, sx = 1, sz = 1) {
  const f = footOf(spot, sx, sz);
  const at = { x: f.x, y: FLOOR, z: f.z };
  paint.update(0.016, at, 14);   // the first frame just records the car
  paint.update(0.016, at, 14);   // runs the foot down
  paint.update(0.016, at, 14);   // detects the fall and spills
  return f;
}

// Knock the solo ladder over and sit in its puddle, so the tyres are soaked.
function soakTyres(paint, spot = SOLO) {
  knockLadder(paint, spot);
  const spill = paint.stats().spills[0];
  assert.ok(spill, 'nothing spilled');
  for (let i = 0; i < 20; i++) paint.update(0.05, { x: spill.x, y: FLOOR, z: spill.z }, 0);
  return spill;
}

function drive(paint, x, z, steps, dx = 0, dz = 0) {
  for (let i = 0; i < steps; i++) {
    x += dx;
    z += dz;
    paint.update(0.05, { x, y: FLOOR, z }, 14);
  }
  return { x, z };
}

test('two hundred scattered ladders, all on the drop cloth and clear of the ramp', () => {
  const paint = makeExhibit();
  assert.equal(paint.ladders.length, 200);
  assert.equal(paint.spots.length, 200);
  assert.ok(RAINBOW_PAINTS.length >= 12);
  // The ramp run is the driving lane down from the portal: no ladder may stand
  // in it, and none may hang off the cloth.
  for (const s of paint.spots) {
    assert.ok(Math.abs(s.x) < BOUNDS.x1 && s.z < BOUNDS.z1 && s.z > BOUNDS.z0,
      `ladder at (${s.x}, ${s.z}) is off the drop cloth`);
    if (s.z > -44 && s.z < 62) {
      assert.ok(Math.abs(s.x) > 34, `ladder at (${s.x}, ${s.z}) blocks the ramp lane`);
    }
  }
  // And they are spread over the whole room, not heaped at one end.
  const zs = paint.spots.map((s) => s.z);
  assert.ok(Math.min(...zs) < -200 && Math.max(...zs) > 0, 'the ladders do not reach both ends');
  // Scattered, not in rows: no two ladders are on top of each other, and the
  // x positions are not a repeating handful of columns.
  let closest = Infinity;
  for (let i = 0; i < paint.spots.length; i++) {
    for (let j = i + 1; j < paint.spots.length; j++) {
      const dx = paint.spots[i].x - paint.spots[j].x;
      const dz = paint.spots[i].z - paint.spots[j].z;
      closest = Math.min(closest, Math.hypot(dx, dz));
    }
  }
  assert.ok(closest > 12, `two ladders are only ${closest.toFixed(1)} apart`);
  const distinctX = new Set(paint.spots.map((s) => Math.round(s.x)));
  assert.ok(distinctX.size > 120, 'the x positions still look like a grid of columns');
});

test('the ladders are human scale beside the museum furniture', () => {
  const paint = makeExhibit();
  // Every ladder stands on the floor and is taller than the reception desk (11).
  for (const L of paint.ladders) {
    assert.equal(L.group.position.y, FLOOR);
    assert.ok(L.group.scale.x > 2, 'the ladder is still desk-toy sized');
  }
});

test('a ladder knocked over spills a spreading puddle of its own colour', () => {
  const paint = makeSolo();
  knockLadder(paint);

  const st = paint.stats();
  assert.equal(st.spills.length, 1, 'the can did not spill');
  assert.equal(st.ladders[0].spilled, true);
  assert.equal(st.spills[0].color, RAINBOW_PAINTS[0].color);

  const r0 = st.spills[0].radius;
  paint.update(0.8, { x: 0, y: FLOOR, z: -210 }, 0);
  paint.update(0.8, { x: 0, y: FLOOR, z: -210 }, 0);
  const r1 = paint.stats().spills[0].radius;
  assert.ok(r1 > r0 + 1, `the puddle did not spread (${r0} -> ${r1})`);
});

test('driving through wet paint leaves a solid trail, then tracks, then nothing', () => {
  const paint = makeSolo();
  const spill = soakTyres(paint);

  let x = spill.x;
  let z = spill.z;
  const prevMarks = paint.stats().marks;
  assert.ok(prevMarks > 0, 'no paint was laid while sitting in the puddle');

  // Drive out of the puddle: the tyres are soaked, so it is a full-width band.
  ({ x, z } = drive(paint, x, z, 120, -0.4));
  const afterDrive = paint.stats().marks;
  assert.ok(afterDrive > prevMarks + 20, `the car laid no trail (${prevMarks} -> ${afterDrive})`);
  const st = paint.stats();
  assert.equal(st.lastMark.solid, true, 'the soak did not lay a full-width band');
  assert.equal(st.lastMark.color, RAINBOW_PAINTS[0].color);
  // A can still lasts a long way: 48 units in, the tyres are still wet.
  assert.ok(st.load > 0 && st.load < 1, `the trail ran out too early (load ${st.load})`);

  // Keep driving until the tyres run dry, then confirm nothing more is laid.
  ({ x, z } = drive(paint, x, z, 400, -0.4));
  assert.equal(paint.stats().load, 0, 'the trail never ran out');
  const dryStart = paint.stats().marks;
  ({ x, z } = drive(paint, x, z, 60, -0.4));
  assert.equal(paint.stats().marks, dryStart, 'the trail never ran out');
});

test('driving back over your own band re-soaks the tyres', () => {
  const paint = makeSolo();
  const spill = soakTyres(paint);

  // Lay a full trail west, then let it run dry well past the band. (The trail is
  // a 90-unit stroke starting at the puddle's edge, so ~116 units out is dry.)
  let { x, z } = drive(paint, spill.x, spill.z, 290, -0.4);
  assert.equal(paint.stats().load, 0, 'the trail never ran out');

  // Turn round and drive back east over it: first the tyre-track tail...
  const before = paint.stats().marks;
  ({ x, z } = drive(paint, x, z, 60, 0.4));
  assert.ok(paint.stats().marks > before, 'crossing the old trail laid no paint');
  assert.equal(paint.stats().lastMark.solid, false, 'the tyre-track tail should pick up tracks, not a band');
  assert.equal(paint.stats().lastMark.color, RAINBOW_PAINTS[0].color);
  assert.ok(paint.stats().load > 0 && paint.stats().load < 0.55,
    `crossing a tyre track should only wet the tyres (load ${paint.stats().load})`);

  // ...and further back the full-width band under the car re-soaks them.
  ({ x, z } = drive(paint, x, z, 100, 0.4));
  assert.equal(paint.stats().lastMark.solid, true, 'the full-width band did not re-soak the tyres');
  assert.equal(paint.stats().lastMark.color, RAINBOW_PAINTS[0].color);
  assert.ok(paint.stats().load > 0.55, `the band should soak the tyres (load ${paint.stats().load})`);

  // Turn off the old trail: the re-soak wears off the same way a fresh one does
  // — band first, then tyre tracks, then nothing.
  ({ x, z } = drive(paint, x, z, 80, 0, -0.4));
  assert.equal(paint.stats().lastMark.solid, true, 'the re-soaked band should last a while');
  ({ x, z } = drive(paint, x, z, 100, 0, -0.4));
  assert.equal(paint.stats().lastMark.solid, false, 'the re-soaked band should wear to tyre tracks');
  assert.equal(paint.stats().lastMark.color, RAINBOW_PAINTS[0].color);
  ({ x, z } = drive(paint, x, z, 160, 0, -0.4));
  assert.equal(paint.stats().load, 0, 'the re-soaked paint never wore off');
  const dry = paint.stats().marks;
  ({ x, z } = drive(paint, x, z, 40, 0, -0.4));
  assert.equal(paint.stats().marks, dry, 'the re-soaked paint never wore off');
});

test('the trail is one continuous ribbon, not a row of round splats', () => {
  const src = readFileSync(new URL('./paint.js', import.meta.url), 'utf8');
  assert.match(src, /function paintBandTexture\(/, 'the trail texture is not the smooth band');
  assert.doesNotMatch(src, /createRadialGradient/,
    'a radial splat per quad is back — that is what scalloped the edges');
  // Consecutive quads must share an edge. Overlapping separate quads each blend
  // their own soft edge, which is what serrated the outline.
  assert.match(src, /const near = edge \|\| \{/,
    'the stroke quads do not reuse the previous quad\'s edge');
});

test('the chase car lays paint but never knocks the exhibit over', () => {
  const paint = makeSolo();
  const away = { x: SOLO.x + 70, y: FLOOR, z: SOLO.z };
  paint.update(0.016, away, 0);   // P1 parked well clear, just records itself

  // The chase car drives straight through the ladder.
  let cx = SOLO.x - 20;
  for (let i = 0; i < 80; i++) {
    cx += 0.4;
    paint.update(0.016, away, 0, [{ id: 'chaser', pos: { x: cx, y: FLOOR, z: SOLO.z }, speed: 8, knock: false }]);
  }
  let st = paint.stats();
  assert.equal(st.ladders[0].state, 'standing', 'the chase car knocked a ladder over');
  assert.equal(st.spills.length, 0, 'the chase car spilled a can');
  assert.equal(st.marks, 0, 'the chase car laid paint out of nowhere');

  // Soak the floor with P1, then send the chase car through the puddle.
  soakTyres(paint);
  const spill = paint.stats().spills[0];
  const before = paint.stats().marks;
  let cx2 = spill.x;
  for (let i = 0; i < 80; i++) {
    cx2 -= 0.4;
    paint.update(0.05, away, 0, [{ id: 'chaser', pos: { x: cx2, y: FLOOR, z: spill.z }, speed: 8 }]);
  }
  st = paint.stats();
  assert.ok(st.marks > before, 'the chase car laid no paint');
  assert.ok(st.loads.chaser > 0, 'the chase car never picked the paint up');
  assert.ok((st.marksBy.chaser || 0) > 0, 'the chase car laid no marks of its own');
  assert.equal(st.lastMark.color, RAINBOW_PAINTS[0].color);
});

test('player two knocks ladders and lays paint of their own', () => {
  const paint = makeSolo();
  const away = { x: SOLO.x - 70, y: FLOOR, z: SOLO.z };
  paint.update(0.016, away, 0);   // P1 parked well clear

  // Along the line of the ladder's feet: the middle of the frame is open, so a
  // car aimed at it drives through without touching anything.
  let px = SOLO.x - 20;
  for (let i = 0; i < 80; i++) {
    px += 0.4;
    paint.update(0.016, away, 0, [{
      id: 'p2', pos: { x: px, y: FLOOR, z: SOLO.z + LADDER_FRAME.footZ }, speed: 8, knock: true,
    }]);
  }
  let st = paint.stats();
  assert.equal(st.ladders[0].spilled, true, 'P2 did not knock the ladder over');
  assert.equal(st.spills[0].color, RAINBOW_PAINTS[0].color);

  // ...and the twin carries its own paint, not P1's.
  const spill = paint.stats().spills[0];
  let px2 = spill.x;
  for (let i = 0; i < 60; i++) {
    px2 -= 0.4;
    paint.update(0.05, away, 0, [{ id: 'p2', pos: { x: px2, y: FLOOR, z: spill.z }, speed: 8, knock: true }]);
  }
  st = paint.stats();
  assert.ok(st.loads.p2 > 0, 'P2 never picked the paint up');
  assert.equal(st.load, 0, "P1 should not be carrying P2's paint");
  assert.equal(st.lastMark.color, RAINBOW_PAINTS[0].color);
});

test('paint runs up the ramp and into the lobby with the car', () => {
  // A stand-in for the museum floor: the exhibit floor, then a ramp up to the
  // lobby at atrium height.
  const rampUp = (x, z) => (z <= -60 ? FLOOR : z >= -20 ? 0 : FLOOR * ((z + 20) / -40));
  const spot = { x: 60, z: -90, yaw: 0 };
  const paint = buildPaintExhibit({ add() {} }, {
    floorY: FLOOR, bounds: BOUNDS, spots: [spot], surfaceAt: rampUp,
  });
  const at = { x: spot.x, y: FLOOR, z: spot.z };
  knockLadder(paint, spot);
  const spill = paint.stats().spills[0];
  assert.ok(spill, 'nothing spilled');
  for (let i = 0; i < 20; i++) paint.update(0.05, { x: spill.x, y: rampUp(spill.x, spill.z), z: spill.z }, 0);

  // Drive north up the ramp, holding the car on the surface as it climbs.
  let x = spill.x;
  let z = spill.z;
  for (let i = 0; i < 260; i++) {
    z += 0.4;
    paint.update(0.05, { x, y: rampUp(x, z), z }, 14);
  }
  assert.ok(paint.stats().marks > 0, 'no trail was laid');

  // The stroke followed the floor: its lowest edge is on the exhibit floor and
  // its highest has climbed all the way onto the lobby level.
  let trail = null;
  paint.group.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.color) trail = o;
  });
  const pos = trail.geometry.attributes.position.array;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < paint.stats().marks * 6 * 3; i += 3) {
    lo = Math.min(lo, pos[i]);
    hi = Math.max(hi, pos[i]);
  }
  assert.ok(lo < FLOOR + 1, `the trail never touched the exhibit floor (lowest ${lo})`);
  assert.ok(hi > -1, `the trail never climbed the ramp to the lobby (highest ${hi})`);
  // And on the lobby floor it sits clear of the runner's brass inlays (whose
  // tops are 0.22 above the floor), or the two z-fight on the rug.
  assert.ok(hi > 0.3, `the paint is not lifted clear of the rug (highest ${hi})`);
});

test('puddles stack among themselves, and the tyres\' paint draws over them', () => {
  const { paint } = twoColourRun();
  const st = paint.stats();
  assert.ok(st.spills.length >= 2, 'need two puddles to check stacking');
  const orders = st.spills.map((s) => s.order);
  // Two puddles must not share an order: that is the z-fighting.
  assert.equal(new Set(orders).size, orders.length, 'two puddles share a draw order');
  // The trail is drawn AFTER every puddle. Puddles are transparent with no depth
  // write, so draw order is the only thing deciding what covers what: a puddle
  // drawn last would wipe the tyres' paint (the two old-colour tracks you leave
  // crossing a new puddle) straight off the floor.
  for (const o of orders) {
    assert.ok(o < st.trailOrder, `a puddle (order ${o}) draws over the trail (${st.trailOrder})`);
  }
  assert.ok(st.trailOrder > 10, 'the trail is not above the puddle band');
  assert.equal(st.spills[0].transparent, true);
  assert.equal(st.spills[0].depthWrite, false);
});

test('a fallen ladder is still a prop: drive into it and it skitters aside', () => {
  const paint = makeSolo();
  const at = { x: SOLO.x, y: FLOOR, z: SOLO.z };
  knockLadder(paint);
  const L = paint.ladders[0];
  assert.ok(L.knock, 'the solo ladder is not a knockable');
  // Let it finish going over.
  for (let i = 0; i < 80; i++) updateKnockables(0.02);
  assert.equal(L.knock.state, 'fallen');
  const before = { x: L.group.position.x, z: L.group.position.z };

  // Drive into the MIDDLE of the fallen ladder — its body lies out from the foot
  // it tipped over from, and that length is what used to be a ghost.
  const dir = L.knock.pushDir;
  const midX = before.x + dir.x * 12;
  const midZ = before.z + dir.z * 12;
  let px = at.x, pz = at.z;
  for (let i = 0; i < 40; i++) {
    px += (midX - px) * 0.12;
    pz += (midZ - pz) * 0.12;
    paint.update(0.05, { x: px, y: FLOOR, z: pz }, 8);
    updateKnockables(0.05);
  }
  const moved = Math.hypot(L.group.position.x - before.x, L.group.position.z - before.z);
  assert.ok(moved > 0.5, `the fallen ladder did not move out of the way (moved ${moved.toFixed(2)})`);
});

test('a fallen ladder is solid along its whole length, not just at its foot', () => {
  const paint = makeSolo();
  knockLadder(paint);
  const L = paint.ladders[0];
  for (let i = 0; i < 80; i++) updateKnockables(0.02);
  assert.equal(L.knock.state, 'fallen');
  const dir = L.knock.pushDir;

  // Come at it from BEYOND its far end, so the car is over the middle of the
  // body rather than at the pivot it tipped over from. Stop well short of the
  // foot: the far half of the ladder has to register on its own.
  const base = { x: L.group.position.x, z: L.group.position.z };
  const before = { x: base.x, z: base.z };
  let px = base.x + dir.x * 26;
  let pz = base.z + dir.z * 26;
  for (let i = 0; i < 40; i++) {
    px -= dir.x * 0.3;
    pz -= dir.z * 0.3;
    paint.update(0.05, { x: px, y: FLOOR, z: pz }, 10);
    updateKnockables(0.05);
  }
  const moved = Math.hypot(L.group.position.x - before.x, L.group.position.z - before.z);
  assert.ok(moved > 0.5, `the far half of the fallen ladder is a ghost (moved ${moved.toFixed(2)})`);
});

test('a fallen bucket is a prop too: hit it and it skids away, pouring more paint', () => {
  const paint = makeSolo();
  knockLadder(paint);
  // Park well clear so the car does not nudge the can while it settles.
  const away = { x: SOLO.x + 80, y: FLOOR, z: SOLO.z };
  for (let i = 0; i < 40; i++) paint.update(0.05, away, 0);
  const st0 = paint.stats();
  assert.equal(st0.spills.length, 1);
  const can = st0.cans[0];
  assert.ok(can, 'the spilled can is not a prop');
  assert.equal(can.pours > 0, true, 'the can has no paint left to pour');

  // Drive through it.
  let x = can.x + 12;
  for (let i = 0; i < 60; i++) {
    x -= 0.3;
    paint.update(0.05, { x, y: FLOOR, z: can.z }, 14);
  }
  const st1 = paint.stats();
  const after = st1.cans[0];
  const moved = Math.hypot(after.x - can.x, after.z - can.z);
  assert.ok(moved > 0.8, `the can did not move (${moved.toFixed(2)})`);
  assert.ok(after.pours < can.pours, 'the can poured no extra paint');
  assert.ok(st1.spills.length > st0.spills.length, 'no new puddle appeared');
  // The new puddle is the can's own colour and starts small, then spreads.
  const fresh = st1.spills[st1.spills.length - 1];
  assert.equal(fresh.color, RAINBOW_PAINTS[0].color);
  assert.ok(fresh.radius < PUDDLE_MAX, 'the extra pour is a full puddle of its own');
});

test('a ladder only goes over if the car touches one of its feet', () => {
  // Straight down the middle of the frame: nothing but air between the legs, so
  // a careful line through it must leave the ladder standing.
  const paint = makeSolo();
  const SOUTH = Math.PI / 2;   // nose due +z
  paint.update(0.016, { x: SOLO.x, y: FLOOR, z: SOLO.z - 20 }, 14, null, SOUTH);
  let z = SOLO.z - 20;
  for (let i = 0; i < 100; i++) {
    z += 0.4;
    paint.update(0.016, { x: SOLO.x, y: FLOOR, z }, 14, null, SOUTH);
  }
  assert.equal(paint.stats().ladders[0].state, 'standing', 'driving between the legs knocked it over');
  assert.equal(paint.stats().spills.length, 0);

  // Then aim at a foot: the same room, the same speed, one foot clipped.
  const f = footOf(SOLO);
  let x = f.x - 20;
  for (let i = 0; i < 60; i++) {
    x += 0.4;
    paint.update(0.016, { x, y: FLOOR, z: f.z }, 14, null, Math.PI);
  }
  assert.notEqual(paint.stats().ladders[0].state, 'standing', 'clipping a foot did not knock it');
  assert.ok(paint.stats().spills.length > 0, 'the knocked ladder spilled nothing');
});

test('the ladder frame really does leave a driving gap between its feet', () => {
  // The gap has to be wider than the car, or "drive through it" is not a thing.
  assert.ok(LADDER_FRAME.footX * 2 > LADDER_FRAME.carHalfW * 2 + 1,
    'the frame is too narrow to drive through');
});

// Two ladders in two colours: the first knocked and soaked in, the second's can
// poured without moving the car, so a test can drive out of one paint into the
// other.
function twoColourRun() {
  const A = { x: 60, z: -170, yaw: 0 };
  const B = { x: 60, z: -110, yaw: 0 };
  const paint = buildPaintExhibit({ add() {} }, { floorY: FLOOR, bounds: BOUNDS, spots: [A, B] });
  knockLadder(paint, A);
  const spillA = paint.stats().spills[0];
  assert.ok(spillA, 'the first ladder spilled nothing');
  const atA = { x: spillA.x, y: FLOOR, z: spillA.z };
  for (let i = 0; i < 20; i++) paint.update(0.05, atA, 0);
  assert.ok(paint.stats().load > 0.5, 'the tyres never soaked');
  triggerKnockable(paint.ladders[1].knock);
  for (let i = 0; i < 60; i++) {
    updateKnockables(0.02);
    paint.update(0.02, atA, 0);
  }
  const spills = paint.stats().spills;
  assert.equal(spills.length, 2, 'the second can did not spill');
  return { paint, spillA, spillB: spills[1] };
}

test('a new colour scrubs the old one off as two tracks for two car lengths', () => {
  // Soak in the first colour, then drive straight through the second: the first
  // two car lengths inside that paint are still OLD-colour tyre tracks (paint on
  // paint), and only then does the new colour take.
  const { paint, spillA, spillB } = twoColourRun();
  assert.equal(spillB.color, RAINBOW_PAINTS[1].color);

  const dx = spillB.x - spillA.x;
  const dz = spillB.z - spillA.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  let x = spillA.x;
  let z = spillA.z;
  let into = 0;            // distance travelled since entering B's puddle
  let inside = false;
  let marks = paint.stats().marks;
  const laid = [];
  for (let i = 0; i < 400; i++) {
    x += ux * 0.4;
    z += uz * 0.4;
    paint.update(0.05, { x, y: FLOOR, z }, 14);
    const s = paint.stats();
    // The puddle grows, so ask it for its radius now, exactly as the exhibit does.
    const pb = s.spills.find((sp) => sp.color === RAINBOW_PAINTS[1].color);
    const inB = Math.hypot(x - pb.x, z - pb.z) <= pb.radius + 0.4;
    if (inB && !inside) { inside = true; into = 0; } else if (inB) into += 0.4;
    if (s.marks > marks) {
      marks = s.marks;
      if (inB) laid.push({ into, color: s.lastMark.color, solid: s.lastMark.solid });
    }
  }
  assert.ok(laid.length > 4, `no paint was laid inside the new puddle (${laid.length} marks)`);

  // Still old-colour tracks for the first two car lengths...
  const early = laid.filter((m) => m.into < PAINT_SWAP_DIST - 1.5);
  assert.ok(early.length > 2, 'the change happened too early to see the scrub');
  for (const m of early) {
    assert.equal(m.color, RAINBOW_PAINTS[0].color, `a mark at ${m.into.toFixed(1)} into the new paint is already the new colour`);
    assert.equal(m.solid, false, `the old paint should scrub off as two tracks, not a band (at ${m.into.toFixed(1)})`);
  }
  // ...then the new colour takes over, as a full band (fresh soak).
  const late = laid.filter((m) => m.into > PAINT_SWAP_DIST + 1.5);
  assert.ok(late.length > 1, 'the new colour never took over inside the puddle');
  assert.equal(late[0].color, RAINBOW_PAINTS[1].color, 'the new colour never took over');
  assert.equal(late[0].solid, true, 'the new paint should soak in as a band');
});

test('the colour change waits while the car is out of the new paint', () => {
  const { paint, spillA, spillB } = twoColourRun();
  const dx = spillB.x - spillA.x;
  const dz = spillB.z - spillA.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  let x = spillA.x;
  let z = spillA.z;
  // Drive until four units into the new paint.
  let into = 0;
  let inside = false;
  while (into < 4 && into > -1) {
    x += ux * 0.4;
    z += uz * 0.4;
    paint.update(0.05, { x, y: FLOOR, z }, 14);
    const s = paint.stats();
    const pb = s.spills.find((sp) => sp.color === RAINBOW_PAINTS[1].color);
    const inB = Math.hypot(x - pb.x, z - pb.z) <= pb.radius + 0.4;
    if (inB) { inside = true; into += 0.4; }
    else if (inside) break;
  }
  let st = paint.stats();
  assert.ok(st.wear, 'no colour change started in the new paint');
  assert.ok(st.wear.remaining < PAINT_SWAP_DIST, 'the change should be part-done');
  // Turn out sideways: the countdown runs while the car is still in the paint,
  // and stops the moment it is clear of it.
  let left = null;
  for (let i = 0; i < 200 && left === null; i++) {
    x += -uz * 0.4;
    z += ux * 0.4;
    paint.update(0.05, { x, y: FLOOR, z }, 14);
    const s = paint.stats();
    const pb = s.spills.find((sp) => sp.color === RAINBOW_PAINTS[1].color);
    if (Math.hypot(x - pb.x, z - pb.z) > pb.radius + 0.6) left = s.wear ? s.wear.remaining : null;
  }
  assert.ok(left !== null, 'the change finished before the car left the paint');
  // Away over bare floor: it must not tick on.
  for (let i = 0; i < 40; i++) {
    x += -uz * 0.4;
    z += ux * 0.4;
    paint.update(0.05, { x, y: FLOOR, z }, 14);
  }
  st = paint.stats();
  const pb = st.spills.find((sp) => sp.color === RAINBOW_PAINTS[1].color);
  assert.ok(Math.hypot(x - pb.x, z - pb.z) > pb.radius + 1, 'the test car is still in the puddle');
  assert.ok(st.wear, 'the pending change was lost');
  assert.ok(left - st.wear.remaining <= 0.5, 'the change ran on outside the puddle');
  assert.equal(st.lastMark.color, RAINBOW_PAINTS[0].color, 'the colour changed out on bare floor');
});

test('the old colour never runs past two car lengths, even across puddles', () => {
  // Three colours in a line. Soaking in the first and then driving through the
  // second and the third must not start the two-car-length budget again at each
  // puddle: the old paint comes off once, over two car lengths of driving.
  const spots = [
    { x: 60, z: -200, yaw: 0 },
    { x: 60, z: -160, yaw: 0 },
    { x: 60, z: -120, yaw: 0 },
  ];
  const paint = buildPaintExhibit({ add() {} }, { floorY: FLOOR, bounds: BOUNDS, spots });
  knockLadder(paint, spots[0]);
  const spillA = paint.stats().spills[0];
  const at = { x: spillA.x, y: FLOOR, z: spillA.z };
  for (let i = 0; i < 20; i++) paint.update(0.05, at, 0);
  assert.ok(paint.stats().load > 0.5, 'the tyres never soaked');
  triggerKnockable(paint.ladders[1].knock);
  triggerKnockable(paint.ladders[2].knock);
  for (let i = 0; i < 90; i++) {
    updateKnockables(0.02);
    paint.update(0.02, at, 0);
  }
  assert.equal(paint.stats().spills.length, 3, 'not all three cans spilled');

  // Drive north through all three puddles and note, for each mark, how far the
  // car had travelled since entering the second colour's paint.
  const second = paint.stats().spills.find((s) => s.color === RAINBOW_PAINTS[1].color);
  const dx = second.x - spillA.x;
  const dz = second.z - spillA.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  let x = spillA.x;
  let z = spillA.z;
  let marks = paint.stats().marks;
  let travelled = 0;          // distance driven since the first foreign paint
  const trail = [];           // { at, color }
  for (let i = 0; i < 500; i++) {
    x += ux * 0.4;
    z += uz * 0.4;
    paint.update(0.05, { x, y: FLOOR, z }, 14);
    const s = paint.stats();
    const foreign = s.spills.some((sp) => sp.color !== RAINBOW_PAINTS[0].color &&
      Math.hypot(x - sp.x, z - sp.z) <= sp.radius + 0.4) || travelled > 0;
    if (foreign) travelled += 0.4;
    if (s.marks > marks) {
      marks = s.marks;
      if (foreign) trail.push({ at: travelled, color: s.lastMark.color });
    }
  }
  assert.ok(trail.length > 6, `not enough trail laid through the puddles (${trail.length})`);
  const lastOld = trail.filter((m) => m.color === RAINBOW_PAINTS[0].color).pop();
  assert.ok(lastOld, 'the old colour stopped before the second puddle');
  assert.ok(lastOld.at <= PAINT_SWAP_DIST + 1,
    `the old colour ran ${lastOld.at.toFixed(1)} units into the new paint (limit ${PAINT_SWAP_DIST})`);
  const last = trail[trail.length - 1];
  assert.notEqual(last.color, RAINBOW_PAINTS[0].color, 'the new colour never took over');
});

test('a reset stands the ladders back up and wipes the paint away', () => {
  const paint = makeSolo();
  knockLadder(paint);
  assert.equal(paint.stats().spills.length, 1);

  paint.reset();
  const st = paint.stats();
  assert.equal(st.spills.length, 0);
  assert.equal(st.marks, 0);
  for (const L of st.ladders) assert.equal(L.spilled, false);
});

// ---- Per-ride tyre signatures ---------------------------------------------
// Lay a trail with the default car until its tyres are wet but thinning (the
// tail of the stroke), then hand the same painter a different ride: the marks
// laid after that are that ride's own signature.
function thinningRun(kind, steps = 20) {
  const paint = makeSolo();
  const spill = soakTyres(paint);
  let { x, z } = drive(paint, spill.x, spill.z, 290, -0.4);
  ({ x, z } = drive(paint, x, z, 60, 0.4));
  assert.equal(paint.stats().lastMark.solid, false, 'the tyres never thinned to tracks');
  const before = paint.stats().marks;
  for (let i = 0; i < steps; i++) {
    z -= 0.4;
    paint.update(0.05, { x, y: FLOOR, z }, 14, null, 0, kind);
  }
  const st = paint.stats();
  const added = st.marks - before;
  return { added, marks: st.lastMarks(Math.max(1, added)), st };
}

test('the giant robot leaves footprints, not tyre tracks', () => {
  const { added, marks, st } = thinningRun('robot', 60);
  assert.equal(st.profile, 'robot');
  // One print is two pads (toe + heel) and prints step along a 6.4-unit stride:
  // a short run lays only a handful of marks, not a continuous twin ribbon.
  assert.ok(added > 0 && added <= 12, `the robot laid ${added} marks, not footprints`);
  // Prints alternate left and right of the centreline.
  const xs = new Set(marks.map((m) => Math.round(m.x * 10) / 10));
  assert.ok(xs.size >= 2, 'the robot prints are all on one line');
  assert.ok(marks.every((m) => !m.solid), 'a footprint was flagged as a solid tyre band');
});

test('the steamroller leaves one wide drum track that never separates', () => {
  const { added, marks, st } = thinningRun('steamroller');
  assert.equal(st.profile, 'steamroller');
  // Half the marks of a two-tyre car: one ribbon per step, not two.
  assert.equal(added, 20, `the drum laid ${added} marks — that is a tyre pair`);
  const xs = new Set(marks.map((m) => Math.round(m.x * 10) / 10));
  assert.equal(xs.size, 1, 'the drum track split into two lines');
});

test("the monster truck's ruts are wider than a hatchback's", () => {
  const car = thinningRun('classic');
  const monster = thinningRun('monstertruck');
  assert.equal(monster.st.profile, 'monstertruck');
  const gauge = (r) => {
    const xs = r.marks.map((m) => m.x);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(gauge(monster) > gauge(car) + 0.4,
    `monster gauge ${gauge(monster).toFixed(2)} is not wider than the car's ${gauge(car).toFixed(2)}`);
  // ...and the contact patch itself is fatter.
  assert.ok(monster.marks[0].r > car.marks[0].r + 0.1,
    'the monster truck leaves the same thin tyre as a car');
});

test('a school bus and a skateboard keep their own gauges', () => {
  const bus = thinningRun('bus');
  const skater = thinningRun('skateboarder');
  const gauge = (r) => {
    const xs = r.marks.map((m) => m.x);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(gauge(bus) > gauge(skater) + 1,
    'the bus and the skateboard leave the same width of track');
});
