// Tests for the cat's swat: how far it throws you, which way you end up facing,
// and the hard rule that it can never push you out of the house.
//
// "Can never get outside" is arithmetic, so it is simulated rather than asserted
// from the source: a real swipe is integrated frame by frame against the real
// house bounds, including the roller-door opening, which deliberately has NO
// collider because that is how the car normally leaves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveStuck, wallNormal } from './modules/unstick.js';
import { HOUSE, HOUSE_EXIT } from './levels/house/layout.js';

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

function grab(name) {
  const at = src.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `${name} is missing from main.js`);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const num = (name) => Number(src.match(new RegExp(`^const ${name} = ([\\d.]+);`, 'm'))[1]);

// The real constant declarations, textually lifted, so the test cannot drift out
// of step with the values the game actually uses.
const constSrc = ['CAT_SWIPE_POWER', 'CAT_SWIPE_HOP', 'CAT_BOUNCE_KEEP', 'KNOCK_AIRBORNE_HOP']
  .map((c) => {
    const line = src.match(new RegExp(`^const ${c} = .*$`, 'm'));
    assert.ok(line, `${c} is missing from main.js`);
    return line[0];
  })
  .join('\n');

// The constants and functions under test, lifted out of main.js and run against
// stub state. main.js cannot be imported (top-level await + DOM), so this is the
// same brace-matched extraction the camera fade tests use.
function harness({ x = 0, z = 0, yaw = 0, solids = [] } = {}) {
  const car = { position: { x, y: 0, z }, rotation: { y: yaw } };
  const state = { playerKnock: null, car };
  const body = [
    constSrc,
    'const car = __car;',
    'let playerKnock = null;',
    'const HOUSE = { minX: __HOUSE.minX, maxX: __HOUSE.maxX, minZ: __HOUSE.minZ, maxZ: __HOUSE.maxZ };',
    'const playerCarRadius = __R;',
    'const playerSolids = () => __solids;',
    'const wallNormal = __wallNormal, resolveStuck = __resolveStuck;',
    'const KNOCK_DECAY = __decay, KNOCK_TIME = __time;',
    'const velocity = { value: 0 }, shake = { intensity: 0 }, jumpState = { inAir: false, yVelocity: 0 };',
    grab('makeKnock'),
    grab('knockPlayerAway'),
    grab('catSwipeAway'),
    grab('confineKnockToHouse'),
    'return { catSwipeAway, confineKnockToHouse, get playerKnock() { return playerKnock; },',
    '  setKnock: (k) => { playerKnock = k; }, };',
  ].join('\n');
  const factory = new Function(
    '__car', '__HOUSE', '__R', '__solids', '__wallNormal', '__resolveStuck', '__decay', '__time',
    `${body}\n`,
  );
  const api = factory(
    car, HOUSE, 2.2, solids, wallNormal, resolveStuck, 0.9, 0.7,
  );
  // `step` MUST read the knock through api.playerKnock. Two traps here, both of
  // which make the loop silently do nothing while the tests still "pass":
  //   - reading a local object the eval'd code never writes to, and
  //   - spreading `api`, which EVALUATES the getter and copies a frozen null.
  // A test whose car never moves proves nothing, so step has to go via `api`.
  const h = {
    ...api,
    car,
    get playerKnock() { return api.playerKnock; },
    step(dt = 1 / 60, n = 60) {
      for (let i = 0; i < n; i++) {
        const k = api.playerKnock;
        if (!k) return;
        car.position.x += k.vx * dt;
        car.position.z += k.vz * dt;
        car.rotation.y += k.w * dt;
        if (k.confine) api.confineKnockToHouse(k);
        k.vx *= 0.9;
        k.vz *= 0.9;
        k.w *= 0.9;
        k.t -= dt;
        if (k.t <= 0) api.setKnock(null);
      }
    },
  };
  return h;
}

// The car's forward vector, as main.js defines it.
const forward = (yaw) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });

test('the swat throws you half as far as it used to', () => {
  const power = num('CAT_SWIPE_POWER');
  const old = 130;   // the value this replaced
  assert.equal(power, old / 2,
    `CAT_SWIPE_POWER is ${power}; the request was half of ${old}`);
  // Prove it as distance, not just as a number: integrate a real swipe.
  const h = harness();
  h.catSwipeAway(1, 0);
  h.step(1 / 60, 120);
  const travelled = Math.abs(h.car.position.x - 0);
  // Same integral at the old power, for comparison.
  const old2 = harness();
  old2.setKnock({ vx: old, vz: 0, w: 0, t: 0.7, confine: false });
  old2.step(1 / 60, 120);
  const wasDistance = Math.abs(old2.car.position.x - 0);
  assert.ok(Math.abs(travelled - wasDistance / 2) < 0.5,
    `a swipe now covers ${travelled.toFixed(1)} units; half of the old ${wasDistance.toFixed(1)} ` +
    'is what was asked for');
  assert.ok(travelled < wasDistance, 'the swipe did not get any shorter');
});

test('a swat leaves you facing the cat, not looking away down the road', () => {
  // The swipe is thrown off to one side (a paw coming across you), so this also
  // pins that the aim uses the CAT's position rather than the reversed travel
  // vector — the two differ by 20-30 degrees and only one of them points at her.
  for (const [x, z, cx, cz] of [
    [0, 0, -9, 0],      // cat due west
    [0, 0, 0, 9],       // due north
    [0, 0, 9, 0],       // due east
    [0, 0, 0, -9],      // due south
    [20, 30, 20, 22],   // close, almost due north
    [0, 0, -7, 7],      // diagonal
  ]) {
    const h = harness({ x, z });
    h.catSwipeAway(-1, 0, cx, cz);   // swipe direction is irrelevant to the aim
    const f = forward(h.car.rotation.y);
    const dx = cx - x, dz = cz - z;
    const len = Math.hypot(dx, dz);
    const dot = (f.x * dx + f.z * dz) / len;
    assert.ok(dot > 0.9999,
      `with the car at (${x}, ${z}) and the cat at (${cx}, ${cz}) the car faces ` +
      `(${f.x.toFixed(3)}, ${f.z.toFixed(3)}), which is not her ` +
      `(dot ${dot.toFixed(4)})`);
  }
});

test('with no cat position supplied, the aim falls back to the swipe direction', () => {
  const h = harness();
  h.catSwipeAway(1, 0);
  const f = forward(h.car.rotation.y);
  // Loose on purpose: the swipe's sideways fan tilts the travel direction, so
  // the fallback is a degraded aim, not an exact one.
  assert.ok(f.x * -1 > 0.95,
    'the fallback did not at least face back down the swipe direction');
});

test('a swat does not spin the car away from the cat', () => {
  // The old call passed spin 5, so the heading wandered for the whole knock.
  const h = harness();
  h.catSwipeAway(1, 0);
  const yawAtSwipe = h.car.rotation.y;
  h.step(1 / 60, 40);
  assert.ok(Math.abs(h.car.rotation.y - yawAtSwipe) < 1e-6,
    'the car yawed during the swipe, so it stopped facing the cat');
  // Math.abs, not assert.equal: makeKnock computes `(dot >= 0 ? 1 : -1) * 0`,
  // which is -0 about half the time, and Object.is(-0, 0) is false. -0 is a
  // perfectly good "no spin" — that made this test fail at random.
  assert.equal(Math.abs(h.playerKnock.w), 0, 'the swipe still applies spin');
});

test('a swat can never push you outside the house', () => {
  // The killer case is the roller door: the shell wall there has NO collider,
  // because that is how the car normally drives out. A swipe aimed at it would
  // otherwise sail through the gap onto the grass.
  const spots = [
    { x: 74, z: 76, nx: 1, nz: 0, what: 'at the roller door, pushed east' },
    { x: 74, z: 76, nx: 0.3, nz: 0.95, what: 'at the roller door, pushed north' },
    { x: -78, z: 0, nx: -1, nz: 0, what: 'against the west wall' },
    { x: 0, z: -78, nx: 0, nz: -1, what: 'against the south wall' },
    { x: 0, z: 110, nx: 0, nz: 1, what: 'against the north wall' },
    { x: 0, z: 0, nx: 1, nz: 0, what: 'in the middle of the house' },
  ];
  for (const s of spots) {
    const h = harness({ x: s.x, z: s.z });
    h.catSwipeAway(s.nx, s.nz);
    h.step(1 / 60, 180);
    const p = h.car.position;
    assert.ok(p.x >= HOUSE.minX && p.x <= HOUSE.maxX,
      `${s.what}: ended at x=${p.x.toFixed(1)}, outside the house`);
    assert.ok(p.z >= HOUSE.minZ && p.z <= HOUSE.maxZ,
      `${s.what}: ended at z=${p.z.toFixed(1)}, outside the house`);
  }
});

test('swiped at a wall, you bounce back towards the middle of the house', () => {
  // All four shell walls, not just one: each has its own clamp branch, and a
  // branch that quietly zeroes the velocity instead of reversing it is a dead
  // stop, not a bounce.
  //
  // Started right against the wall on purpose. From the middle of the house the
  // swipe is spent before it ever reaches the plaster, so there is no energy
  // left to bounce back with — which is correct physics, not a failure, and
  // would make this test assert the wrong thing.
  const inset = 2.2;
  const cases = [
    { name: 'west', wall: HOUSE.minX + inset, nx: -1, nz: 0, axis: 'x', start: HOUSE.minX + inset + 0.3 },
    { name: 'east', wall: HOUSE.maxX - inset, nx: 1, nz: 0, axis: 'x', start: HOUSE.maxX - inset - 0.3 },
    { name: 'south', wall: HOUSE.minZ + inset, nx: 0, nz: -1, axis: 'z', start: HOUSE.minZ + inset + 0.3 },
    { name: 'north', wall: HOUSE.maxZ - inset, nx: 0, nz: 1, axis: 'z', start: HOUSE.maxZ - inset - 0.3 },
  ];
  for (const c of cases) {
    const pos = c.axis === 'x' ? { x: c.start, z: 0 } : { x: 0, z: c.start };
    const h = harness(pos);
    h.catSwipeAway(c.nx, c.nz);
    // `out` points from the start at the wall. The outward extreme is how close
    // it actually got to the plaster — tracking "furthest from the start"
    // instead would count a good bounce AWAY from the wall as the extreme.
    const out = Math.sign(c.wall - c.start);
    let reversed = false;
    let outward = c.start;
    for (let i = 0; i < 180 && h.playerKnock; i++) {
      const before = h.car.position[c.axis];
      h.step(1 / 60, 1);
      const now = h.car.position[c.axis];
      if ((now - c.start) * out > (outward - c.start) * out) outward = now;
      if ((now - before) * out < -1e-6) reversed = true;   // moving back inward
    }
    const end = h.car.position[c.axis];
    const gotToWall = Math.abs(outward - c.wall);
    const endedFromWall = Math.abs(end - c.wall);
    assert.ok(reversed, `${c.name}: the slide never reversed — it just ground along the wall`);
    assert.ok(endedFromWall > gotToWall + 1,
      `${c.name}: it only came back ${(endedFromWall - gotToWall).toFixed(1)} units off the wall ` +
      `(closest ${outward.toFixed(1)}, ended ${end.toFixed(1)}) — that is a stop, not a bounce`);
  }
});

test('an internal partition stops a swipe too, not just the outside shell', () => {
  // The hard interior clamp only catches the shell. Interior walls are caught by
  // the collider bounce, so they need their own case: a swipe aimed across a
  // partition must not carry the car through it into the next room.
  const wall = { kind: 'rect', x: 0, z: 0, hw: 20, hd: 1 };
  const h = harness({ x: 0, z: -10, solids: [wall] });
  h.catSwipeAway(0, 1, 0, -14);   // shoved north, straight at the partition
  let closest = -Infinity;         // how far north it got before turning round
  for (let i = 0; i < 180 && h.playerKnock; i++) {
    h.step(1 / 60, 1);
    closest = Math.max(closest, h.car.position.z);
  }
  const p = h.car.position;
  // The car body is a 2.2 circle, so it can never reach z = -1 - 2.2 = -3.2.
  assert.ok(closest < -3.2 + 1e-6,
    `the swipe carried the car to z=${closest.toFixed(2)}, straight through the partition`);
  // And it must have been turned around rather than left sitting in the plaster.
  assert.ok(p.z < closest - 1,
    `it only came back ${(closest - p.z).toFixed(1)} units off the partition ` +
    `(closest z=${closest.toFixed(1)}, ended z=${p.z.toFixed(1)}) — that is a stop, not a bounce`);
});

test('ordinary knocks are still free to throw you out of the house', () => {
  // Only a swipe is confined. Everything else (gems, the mallet, the wheel of
  // death) must keep working, and the front door must still let the car out.
  const h = harness({ x: 74, z: 76 });
  h.setKnock({ vx: 130, vz: 0, w: 0, t: 0.7 });   // no `confine`
  h.step(1 / 60, 180);
  assert.ok(h.car.position.x > HOUSE.maxX,
    'a plain knock is now being confined too, which would seal the front door');
});

test('the swipe is wired to the confined knock, and the confinement is called', () => {
  // The two halves of the behaviour live in different places: the swipe flags the
  // knock, and animate() has to honour that flag. A dangling flag confined by
  // nothing would look correct in the source and fling you onto the lawn.
  assert.match(src, /onSwipe: \(dx, dz\) => catSwipeAway\(dx, dz, houseCat\.mesh\.position\.x, houseCat\.mesh\.position\.z\)/,
    'the cat is not using the confined swipe, or is not passing her position so the car can face her');
  assert.match(src, /if \(k\.confine\) confineKnockToHouse\(k\);/,
    'the knock integration ignores the confine flag');
  assert.match(grab('catSwipeAway'), /k\.confine = true/,
    'the swipe does not mark its knock for confinement');
});

test('the house bounds used are the interior, so the shell still has thickness', () => {
  // The shell walls are built OUTSIDE these bounds, so clamping to them leaves
  // the plaster where it is rather than shoving the car into it.
  //
  // This used to be asserted as "the bounds are not the slab edges" (maxX < 90,
  // maxZ < 123). That test is no longer possible and no longer the right question:
  // the house is now a GIANT SQUARE that fills the map, so its interior
  // deliberately reaches the slab's own x edge at maxX = 90 — a check for "under
  // the slab edge" would fail on a correct plan. What has to hold is that the
  // bounds are the interior faces, one wall-thickness inside the outer faces.
  assert.equal(HOUSE.maxX - HOUSE.minX, HOUSE.maxZ - HOUSE.minZ,
    'the house interior is not square, so which face is the interior one is ambiguous');
  assert.ok(HOUSE.wall > 0, 'the shell has no thickness, so interior and outer faces coincide');
  assert.equal(HOUSE.maxX + HOUSE.wall - HOUSE.maxX, HOUSE.wall, 'the east shell has no thickness');
  assert.equal(HOUSE.minX - (HOUSE.minX - HOUSE.wall), HOUSE.wall, 'the west shell has no thickness');
  // The clamp keeps the car a full radius inside those faces, which is what stops
  // the body poking into plaster — so the carve-up must be a real radius and the
  // resulting box has to still be a room.
  assert.match(grab('confineKnockToHouse'), /const inset = playerCarRadius;/,
    'the hard clamp no longer insets by the car radius');
  assert.ok(HOUSE.maxX - HOUSE.minX > 100 && HOUSE.maxZ - HOUSE.minZ > 100,
    'the clamp bounds are implausibly small for this house');
  void HOUSE_EXIT;   // the opening that makes the hard clamp necessary
});
