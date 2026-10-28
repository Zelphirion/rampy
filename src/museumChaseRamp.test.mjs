// The blue chase car climbs the museum ramp.
//
// The ramp is the only way between the atrium (y 0) and the exhibit hall
// (y -36), and the chase car used to steer for the ramp's foot whenever it was
// anywhere near the slope — so a player who drove up it left the blue car
// oscillating at the bottom, never following. The route is pure arithmetic on
// three numbers (the chase car's x/z and the player's x/y/z), so it is lifted
// out of main.js and run against the real RAMP / EXHIBIT / museumOnRamp.
//
// Run: node --test src/museumChaseRamp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RAMP, EXHIBIT, ATRIUM_EDGE, museumOnRamp, museumSurfaceAt } from './levels/museum/layout.js';

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

// main.js is not importable (top-level await + DOM), so the function is lifted
// textually and handed stubs, exactly like the cat-swipe tests do.
const body = [
  'const RAMP = __RAMP, EXHIBIT = __EXHIBIT, ATRIUM_EDGE = __ATRIUM_EDGE;',
  'const museumWorld = { onRamp: __onRamp, surfaceAt: __surfaceAt };',
  'const bumperCar = { position: { x: 0, y: 0, z: 0 } };',
  'const car = { position: { x: 0, y: 0, z: 0 } };',
  grab('museumChaseTarget'),
  'return (bumper, player) => {',
  '  bumperCar.position.x = bumper.x; bumperCar.position.y = bumper.y; bumperCar.position.z = bumper.z;',
  '  car.position.x = player.x; car.position.y = player.y; car.position.z = player.z;',
  '  return museumChaseTarget();',
  '};',
].join('\n');

const target = new Function('__RAMP', '__EXHIBIT', '__ATRIUM_EDGE', '__onRamp', '__surfaceAt', body)(
  RAMP, EXHIBIT, ATRIUM_EDGE, museumOnRamp, museumSurfaceAt,
);

// The floor height the car sits at on the slope, for the "player is on the
// ramp" cases.
const rampY = (z) => RAMP.yTop + (RAMP.yBottom - RAMP.yTop) * ((RAMP.zTop - z) / (RAMP.zTop - RAMP.zBottom));

test('a player up in the atrium makes the blue car climb, not dive', () => {
  // Sitting at the foot of the ramp, having just followed the player in from
  // the hall: the old route sent it back down to zBottom - 14 for ever.
  const t = target({ x: 0, y: EXHIBIT.floorY, z: RAMP.zBottom + 2 }, { x: 0, y: 0, z: 100 });
  assert.ok(t.z > RAMP.zTop, `expected a target up the slope, got z ${t.z}`);
  assert.equal(t.x, 0, 'climbs the middle of the slope');
});

test('a player up top and a car out in the hall lines up with the ramp foot first', () => {
  // A straight line from the far corner of the hall would cut through the
  // ramp's side rails, so the car goes to the middle of the foot first.
  const t = target({ x: 90, y: EXHIBIT.floorY, z: -180 }, { x: 0, y: 0, z: 100 });
  assert.equal(t.x, 0);
  assert.ok(t.z >= RAMP.zBottom && t.z < RAMP.zTop, 'target is at the ramp foot');
});

test('a car under the ramp gets out before it climbs after a player up top', () => {
  // Stuck in the space beneath the slope with the player back up in the atrium:
  // it has to come out past the ramp's north end and climb from the foot, not
  // drive south into the underside of the landing.
  const t = target({ x: 3, y: EXHIBIT.floorY, z: 52 }, { x: 0, y: 0, z: 100 });
  assert.ok(t.z < RAMP.zBottom, 'should head for the foot of the ramp, not the landing');
  assert.equal(t.x, 0);
});

test('on the slope below the player it follows them straight up it', () => {
  const t = target({ x: 4, y: rampY(10), z: 10 }, { x: 8, y: rampY(30), z: 30 });
  assert.deepEqual(t, { x: 8, z: 30 });
});

test('up on the landing it closes the gap directly', () => {
  const t = target({ x: 0, y: 0, z: RAMP.zTop + 6 }, { x: 120, y: 0, z: 40 });
  assert.deepEqual(t, { x: 120, z: 40 });
});

test('a player down in the hall brings it in from the lobby and down the ramp', () => {
  // Straight down the middle and over the stairs: the portal opening is on that
  // line, so no lobby waypoint is needed.
  const t = target({ x: 0, y: 0, z: ATRIUM_EDGE - 4 }, { x: 0, y: EXHIBIT.floorY, z: -120 });
  assert.equal(t.x, 0);
  assert.ok(t.z < RAMP.zBottom, 'aims down the ramp');
});

test('a player down in the hall and a car already on the slope heads down', () => {
  const t = target({ x: 0, y: rampY(20), z: 20 }, { x: 0, y: EXHIBIT.floorY, z: -120 });
  assert.ok(t.z < RAMP.zBottom, 'heads for the bottom of the ramp');
});

test('once down in the hall it chases the player directly', () => {
  const t = target({ x: 20, y: EXHIBIT.floorY, z: RAMP.zBottom - 30 }, { x: -60, y: EXHIBIT.floorY, z: -200 });
  assert.deepEqual(t, { x: -60, z: -200 });
});

test('a car in the space under the ramp drives out of the side, not back up it', () => {
  // Under the slope (well below it), with the player out in the hall: no detour
  // to the foot of the ramp, just drive out from under it.
  const t = target({ x: 0, y: EXHIBIT.floorY, z: 0 }, { x: 120, y: EXHIBIT.floorY, z: 0 });
  assert.deepEqual(t, { x: 120, z: 0 });
});

test('a player under the ramp is reached from the side, not by climbing it', () => {
  // Both on the hall floor, one of them under the overhang. A straight line at
  // them from the foot of the ramp would put the blue car up on top of the
  // slope, so it goes out beside the ramp first, level with the player...
  const t = target({ x: 0, y: EXHIBIT.floorY, z: RAMP.zBottom - 4 }, { x: 0, y: EXHIBIT.floorY, z: 24 });
  assert.ok(Math.abs(t.x) > RAMP.halfW, 'does not move out to the side of the ramp');
  assert.ok(t.z < RAMP.zBottom, 'should stay clear of the foot of the ramp while it swings wide');
  // ...and from out there, straight in underneath.
  const u = target({ x: RAMP.halfW + 14, y: EXHIBIT.floorY, z: 24 }, { x: 0, y: EXHIBIT.floorY, z: 24 });
  assert.deepEqual(u, { x: 0, z: 24 });
  // Already under the ramp with them: keep coming, do not swing back out.
  const v = target({ x: 20, y: EXHIBIT.floorY, z: 0 }, { x: 0, y: EXHIBIT.floorY, z: 24 });
  assert.deepEqual(v, { x: 0, z: 24 });
  // Up on TOP of the ramp, it comes down it first.
  const w = target({ x: 0, y: rampY(30), z: 30 }, { x: 0, y: EXHIBIT.floorY, z: 24 });
  assert.ok(w.z < RAMP.zBottom, 'should head down past the foot of the ramp');
});
