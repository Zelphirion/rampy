// Regression tests for the airlock-vent rescue cinematic and the two robot hands.
//
// Two things are easy to break here and invisible to `node --check`:
//   1. The depressurization trigger used to be a floor grate at a fixed spot;
//      it now lives inside a shoulder decon-airlock BAY, and the rescue crane has
//      to stand AT that bay so its hoist line drops exactly where the car is flung.
//   2. Both robot hands are sized to the car they lift. The city boarding hand and
//      the space rescue grip read the live car box; if that wiring is dropped the
//      monster truck gets gripped through its roof again.
//
// The sector half runs the real sectors.js against the stub three. The main.js /
// spaceport.js half checks the source wiring, because those are not importable in
// a headless test (they touch the DOM at import time).
//
// Run: node --test src/spaceVent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './objects/nodeShims.mjs';
import { RING_HALF_W, RING_TURN, createRingState, stepRing } from './spaceRing.js';

const sectors = await import('./levels/space/sectors.js');
const space = await import('./levels/space/index.js');
const mainSrc = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const portSrc = readFileSync(new URL('./spaceport.js', import.meta.url), 'utf8');
const idxSrc = readFileSync(new URL('./levels/space/index.js', import.meta.url), 'utf8');
const sectSrc = readFileSync(new URL('./levels/space/sectors.js', import.meta.url), 'utf8');

// ===== The sector scene =====================================================

test('the decon bay hangs off the +w edge, not spanning the road', () => {
  const world = sectors.buildSpaceSectors();
  const vents = world.zones.filter((z) => z.type === 'vent');
  assert.equal(vents.length, 1, `expected one vent zone, found ${vents.length}`);
  const z = vents[0];
  // The chamber hangs OFF the ship: its seat and outer wall sit past the window
  // wall, so it never blocks the lane and the car has to steer into it.
  assert.ok(z.w > RING_HALF_W, `the bay seat is at w=${z.w}, still inside the wall`);
  assert.ok(z.w1 > RING_HALF_W, `the bay does not reach past the wall (w1=${z.w1})`);
  // Its mouth reaches back to the lane edge, but the rectangle still never
  // covers the road centre: the approach is a turn off the lane, not a gate.
  assert.ok(z.w0 > 0, `the bay rectangle reaches into the lane (w0=${z.w0})`);
  assert.ok(z.w0 < z.w1 && z.s0 < z.s1, 'the vent rectangle is inverted');
  // The level publishes the widened-lane footprint the car drives in through.
  assert.ok(world.decon, 'the sector no longer publishes the bay footprint');
  assert.ok(world.decon.lane > RING_HALF_W, 'the bay does not open the lane past the wall');
  assert.equal(world.decon.s, z.s, 'the bay footprint is not at the vent seat');
});

test('the road-spanning decon gate is gone', () => {
  const world = sectors.buildSpaceSectors();
  const decon = world.zones.filter((z) => z.type === 'decon');
  assert.equal(decon.length, 0, 'a road-spanning decon gate still exists');
});

test('the driving lane opens at the side bay so the car can drive in', () => {
  assert.match(mainSrc, /const decon = spaceWorld\.decon/,
    'main.js no longer reads the decon bay footprint');
  assert.match(mainSrc, /laneHi = Math\.max\(laneHi, decon\.lane\)/,
    'the lane is not widened out to the side bay');
});

test('the window wall is opened once across the docking shoulder for both hangars', () => {
  assert.match(idxSrc, /SHOULDER_GAP_A/,
    'the +Z wall gap no longer reaches the side decon bay');
  assert.match(idxSrc, /gapB \+ Math\.PI \/ 2, Math\.PI \* 2 - gapLen/,
    'the +Z window wall is not cut with the merged shoulder gap');
});

test('the rescue crane stands at the bay so its hoist line meets the flung car', () => {
  const world = sectors.buildSpaceSectors();
  const z = world.zones.find((v) => v.type === 'vent');
  assert.ok(world.crane, 'the waste sector no longer publishes a crane');
  assert.equal(world.crane.s, z.s, 'the crane is not at the vent seat (s)');
  assert.equal(world.crane.w, z.w, 'the crane is not at the vent seat (w)');
  // The jib pivot must hang over the bay (local x = 0), even though the tower is
  // built off to one side, or the claw descends beside the car instead of onto it.
  const { boomPivot } = world.crane.mount.userData;
  assert.equal(boomPivot.position.x, 0, 'the hoist line is not over the bay mouth');
});

test('the rescue grip closes around a car of the measured half-width', () => {
  const world = sectors.buildSpaceSectors();
  const fingers = world.crane.mount.userData.fingers;
  assert.equal(fingers.length, 2, 'the grip is no longer a two-prong hand');

  world.crane.setClaw(0, 1.6);   // shut around a 3.2-wide car
  assert.ok(Math.abs(fingers[0].position.x + 1.6) < 1e-6, 'left jaw is not at the car flank');
  assert.ok(Math.abs(fingers[1].position.x - 1.6) < 1e-6, 'right jaw is not at the car flank');

  world.crane.setClaw(1, 1.6);   // wide open
  assert.ok(Math.abs(fingers[0].position.x + 2.6) < 1e-6, 'left jaw did not open');
  assert.ok(Math.abs(fingers[1].position.x - 2.6) < 1e-6, 'right jaw did not open');

  // A narrower car is gripped more tightly, not at a fixed spread.
  world.crane.setClaw(0, 0.8);
  assert.ok(Math.abs(fingers[0].position.x + 0.8) < 1e-6, 'the grip ignores the car width');
});

test('the rescue jaws hang DOWN onto the car, not back up toward the cable', () => {
  const world = sectors.buildSpaceSectors();
  const fingers = world.crane.mount.userData.fingers;
  for (const f of fingers) {
    assert.ok(f.position.y < 0,
      'a jaw points back up the cable instead of down around the car');
  }
});

test('the decon bay builder makes real, animated geometry', () => {
  const bay = sectors.makeDeconBay();
  const { rings, jets, curtain } = bay.userData;
  assert.equal(rings.length, 2, 'expected two scanner rings');
  assert.equal(jets.length, 10, 'expected a nozzle/jet row on each side wall');
  assert.ok(curtain, 'the suction throat is missing');
  let meshes = 0;
  bay.traverse((n) => { if (n.isMesh) meshes++; });
  assert.ok(meshes > 20, `the bay is nearly empty (${meshes} meshes)`);
});

test('the trash loader bot is a real, articulated tracked machine', () => {
  const bot = sectors.makeLoaderBot();
  const { arm, scoop, eye, beacon } = bot.userData;
  assert.ok(arm && arm.rotation, 'the loader has no lifting arm to drive');
  assert.ok(scoop, 'the loader has no scoop');
  assert.ok(eye, 'the loader has no sensor eye');
  assert.ok(beacon, 'the loader has no warning beacon');
  let meshes = 0;
  bot.traverse((n) => { if (n.isMesh) meshes++; });
  assert.ok(meshes >= 12, `the loader is nearly empty (${meshes} meshes)`);
});

test('the trash loader ferries bins around a closed floor loop when the car is near', () => {
  const world = sectors.buildSpaceSectors();
  const tb = world.trashBot;
  assert.ok(tb && tb.bot && tb.cube, 'the waste sector no longer publishes the trash loader');
  assert.ok(tb.intake && tb.return, 'the loader loop has no intake / return conveyors');
  const zone = world.zones.find((z) => z.type === 'vent');

  // Nobody near: the loop must stay dormant (this is a proximity trigger).
  const far = { s: zone.s + 200, w: zone.w, speed: 0 };
  for (let i = 0; i < 120; i++) world.update(1 / 60, i / 60, far);
  assert.equal(tb.near, false, 'the loop ran with the car far away');
  assert.equal(tb.clock, 0, 'the loop clock advanced with nobody near');
  assert.equal(tb.cube.visible, false, 'trash appeared with nobody near');

  // Car at the airlock: the loader runs a full cycle over ~12s.
  const near = { s: zone.s, w: zone.w, speed: 0 };
  let sawCube = false, sawFull = false, sawEmpty = false;
  let maxW = -Infinity, minW = Infinity;
  let clawMax = 0;
  const frames = Math.ceil(14 * 60);
  for (let i = 0; i < frames; i++) {
    world.update(1 / 60, i / 60, near);
    clawMax = Math.max(clawMax, Math.abs(world.crane.claw.position.x));
    if (tb.cube.visible) {
      sawCube = true;
      maxW = Math.max(maxW, tb.cube.position.z);
      minW = Math.min(minW, tb.cube.position.z);
      if (tb.cube.userData.pile.visible) sawFull = true; else sawEmpty = true;
    }
  }
  assert.ok(sawCube, 'no bin ever appeared in the loop');
  assert.ok(sawFull && sawEmpty, 'the bin never read as both full and empty across the loop');
  // The bin is carried to the airlock mouth and back to the return belt on the
  // far side, but is NEVER flung out into the void: the rework replaced the old
  // un-rescued fire-out with a closed delivery loop into the airlock.
  assert.ok(maxW > zone.w - 6, `the bin never reached the airlock mouth (maxW=${maxW})`);
  assert.ok(minW < 0, `the empty bin never reached the return belt (minW=${minW})`);
  assert.ok(maxW < zone.w + 20, `the bin was still fired out into the void (maxW=${maxW})`);
  assert.ok(clawMax < 0.01, 'the rescue crane left its park to chase the trash');

  // Suppressed mid-loop: the whole loader stands down for the car's own vent.
  const t0 = tb.clock;
  tb.suppress = true;
  for (let i = 0; i < 60; i++) world.update(1 / 60, i / 60, near);
  assert.equal(tb.clock, t0, 'the loader kept running while suppressed');
  tb.suppress = false;
});

test('the level publishes the very trash loader the catalogue shows', () => {
  assert.match(sectSrc, /export function makeLoaderBot\(/,
    'the loader bot builder is not exported for the catalogue');
  assert.match(idxSrc, /trashBot: sectors\.trashBot/,
    'the level does not publish the trash loader');
});

// ===== The space-station detail pass ========================================

test('the lane is curtained with a dense field of swinging vines', () => {
  const world = sectors.buildSpaceSectors();
  assert.ok(Array.isArray(world.vines), 'the sectors no longer publish vines');
  assert.ok(world.vines.length >= 90, `only ${world.vines.length} vines across the lane`);
  for (const v of world.vines.slice(0, 8)) {
    assert.ok(v.node && v.node.rotation, 'a vine has no node to swing');
    assert.equal(typeof v.ang, 'number', 'a vine has no swing angle to integrate');
    assert.equal(typeof v.vel, 'number', 'a vine has no swing velocity');
  }
  // Driving the car through the curtain must actually swing the vines and drag
  // on it: the update needs a car with a speed to have any effect.
  const before = world.vines.map((v) => v.ang);
  const car = { s: world.vines[3].s, w: world.vines[3].w, speed: 20 };
  world.update(0.05, 1.0, car);
  assert.ok(world.vines.some((v, i) => Math.abs(v.ang - before[i]) > 1e-4),
    'none of the vines moved when the car drove through');
  assert.ok(car.speed < 20, 'the vine curtain did not drag on the car');
  // ...but a car driving the lane nowhere near a vine must not be slowed: the
  // drag waits for genuine contact, not mere proximity.
  const far = { s: world.vines[3].s, w: world.vines[3].w + 30, speed: 20 };
  world.update(0.05, 1.0, far);
  assert.equal(far.speed, 20, 'the vines dragged on a car that never touched them');
});

test('a driven vine is a solid prop that parts around the car', () => {
  const world = sectors.buildSpaceSectors();
  const v = world.vines[3];
  assert.ok(v.node && v.node.quaternion, 'a vine has no swing pivot');
  // The anchor is FIXED: the stem never moves and the whole vine swings about it
  // (only the pivot rotates), so the top always stays pinned to the ceiling.
  const stem0 = [v.stem.position.x, v.stem.position.y, v.stem.position.z];
  const car = { s: v.s, w: v.w, speed: 24 };
  world.update(0.05, 1.0, car);
  assert.ok(Math.abs(v.dw) > 1e-3 || Math.abs(v.ang) > 1e-3,
    'the vine club did not part when the car drove into it');
  assert.deepEqual([v.stem.position.x, v.stem.position.y, v.stem.position.z], stem0,
    'the vine anchor moved - its top is supposed to stay fixed');
});

test('a vine is always thrown AWAY from the car, never toward it', () => {
  const world = sectors.buildSpaceSectors();
  const v = world.vines[10];
  // Car sits off the vine's +w flank; the only correct reaction is to swing to
  // the -w side. (The old code pushed it the same way the car sat - into the car.)
  const car = { s: v.s, w: v.w + 1.5, speed: 18 };
  for (let i = 0; i < 30; i++) world.update(1 / 60, i / 60, car);
  assert.ok(v.dw < -0.05, `the vine swung toward the car (dw=${v.dw})`);
});

test('a returning vine BOUNCES off the car - it can never be a ghost', () => {
  const world = sectors.buildSpaceSectors();
  const v = world.vines[20];
  const club = () => ({ s: v.s + Math.sin(v.ang) * v.len, w: v.w + v.dw });
  const car = { s: v.s, w: v.w + 0.5, speed: 0 };
  let minDist = Infinity;
  for (let i = 0; i < 400; i++) {
    world.update(1 / 60, i / 60, car);
    const c = club();
    minDist = Math.min(minDist, Math.hypot(c.s - car.s, c.w - car.w));
  }
  // The club must never sink inside the car's contact radius - it stops on the
  // surface and springs back instead of passing through.
  assert.ok(minDist >= 2.4 - 0.02, `the club sank through the car (minDist=${minDist})`);
});

test('a hanging vine is pinned to a fixed ceiling anchor as it swings', () => {
  const world = sectors.buildSpaceSectors();
  const v = world.vines[7];
  const anchor0 = [v.stem.position.x, v.stem.position.y, v.stem.position.z];
  const car = { s: v.s, w: v.w, speed: 26 };
  let maxAng = 0;
  let maxDw = 0;
  for (let i = 0; i < 240; i++) {
    world.update(1 / 60, i / 60, car);
    car.s += 0.4;   // drive straight through the vine's column
    maxAng = Math.max(maxAng, Math.abs(v.ang));
    maxDw = Math.max(maxDw, Math.abs(v.dw));
    assert.deepEqual([v.stem.position.x, v.stem.position.y, v.stem.position.z], anchor0,
      'the vine anchor drifted - its top must stay fixed while the club swings');
  }
  assert.ok(maxAng > 0.02 || maxDw > 0.02,
    'the vine club never swung while the car drove through it');
});

test('the bio-domes sit at the lane edges, small enough to drive between', () => {
  // Moved off the roof centre: they now line BOTH edges and are scaled to 0.5,
  // leaving a clear lane up the middle the car can drive between.
  assert.match(sectSrc, /place\(dome, s, side \* \(RING_HALF_W -/,
    'the bio-domes are not placed at the lane edges');
  assert.match(sectSrc, /dome\.scale\.setScalar\(0\.5\)/,
    'the bio-domes are not shrunk to leave a driving gap');
  assert.doesNotMatch(sectSrc, /place\(dome, s, 0, RING_R - 8\.5\)/,
    'a bio-dome is still parked on the roof centre, unseen');
});

test('the space cinematic tripod rolls with the car instead of world up', () => {
  assert.match(mainSrc, /function cineAimTarget\(/,
    'there is no car-aware cine aim helper');
  assert.match(mainSrc, /_cineUp\.set\(0, 1, 0\)\.applyQuaternion\(car\.quaternion\)\.normalize\(\)/,
    'the cine up is not derived from the car orientation');
  assert.match(mainSrc, /if \(worldState === 'space'\) camera\.up\.copy\(_cineUp\)/,
    'the space tripod does not follow the car up, so it can flip upside down');
});

test('the wheel turns at the same rate as the ground cars, at any speed', () => {
  // The ground cars cap steering.value at 0.9 and yaw at 2.3 -> 2.07 rad/s, with
  // no speed dependence. The wheel must match exactly.
  assert.equal(RING_TURN, 2.3, 'the wheel steering authority no longer matches the cars');
  const crawl = createRingState(0, 0, 0);
  crawl.speed = 1;
  const fast = createRingState(0, 0, 0);
  fast.speed = 25;
  stepRing(crawl, { throttle: 0, steer: 1 }, 1 / 60);
  stepRing(fast, { throttle: 0, steer: 1 }, 1 / 60);
  assert.ok(Math.abs(crawl.heading - fast.heading) < 1e-9,
    'the turn rate depends on speed, so the wheel corners slower than every other level');
  assert.ok(Math.abs(fast.heading - RING_TURN / 60) < 1e-9,
    'full-lock steering is not at the wheel\'s rated authority');
});

test('the lander fins are splayed out like a lander, not standing straight', () => {
  assert.match(portSrc, /legPivot\.rotation\.z = 0\.55/,
    'the three tail fins are not angled out from the hull');
  assert.match(portSrc, /legPivot\.position\.set\(finRootX, finRootR - 0\.2, 0\)/,
    'the fin hinge is not rooted into the hull');
  assert.match(portSrc, /finRootR = R \* Math\.sqrt\(/,
    'the fin root does not sit on the ellipsoid hull surface');
});

// ===== The pod bay ==========================================================

test('the pod bay is a real two-door airlock and its doors draw apart', () => {
  const bay = space.buildSpacePodBay();
  let meshes = 0;
  bay.traverse((n) => { if (n.isMesh) meshes++; });
  assert.ok(meshes > 15, `the pod bay is nearly empty (${meshes} meshes)`);
  assert.equal(typeof bay.userData.setDoors, 'function', 'the pod bay has no door driver');
  const { doorL, doorR } = bay.userData;
  bay.userData.setDoors(0);
  const shut = Math.abs(doorR.position.x);
  assert.ok(doorL.position.x < 0 && doorR.position.x > 0, 'the doors are not a symmetric pair');
  bay.userData.setDoors(1);
  assert.ok(Math.abs(doorR.position.x) > shut + 1, 'the doors do not draw apart');
});

test('the level dock is built from the very pod-bay model the catalogue shows', () => {
  assert.match(idxSrc, /const bay = buildSpacePodBay\(/,
    'the level dock no longer uses the catalogue pod-bay builder');
  assert.match(idxSrc, /setDoors\(open\) \{\s*bay\.userData\.setDoors\(open\)/,
    'the level dock no longer forwards to the pod bay door driver');
});

test('console screens carry a glyph texture and a scrambled variant', () => {
  const bank = space.buildSpaceConsoleBank(1);
  const scr = bank.children[1];
  assert.ok(scr.material.map, 'the console screen has no glyph texture');
  assert.ok(scr.userData.texN && scr.userData.texG, 'the screen has no normal/scrambled pair');
  assert.notEqual(scr.userData.texN, scr.userData.texG,
    'the two screen variants are the same texture');
});

// ===== The main.js wiring ===================================================

test('the space rescue grip is fitted to the car being flung', () => {
  assert.match(mainSrc, /function measureBoardingCar\(scale\)/,
    'measureBoardingCar is gone');
  assert.match(mainSrc, /const fit = measureBoardingCar\(car\.scale\.x \|\| 1\)/,
    'the vent does not measure the live car for the grip');
  assert.match(mainSrc, /spaceVent\.half = fit\.half \+ 0\.3/,
    'the grip is not fitted to the measured width');
  assert.match(mainSrc, /spaceVent\.top = fit\.top/,
    'the chamber does not hold the car at its measured height');
  assert.match(mainSrc, /crane\.setClaw\(1, spaceVent\.half\)/,
    'the crane is not opened to the measured width on start');
  assert.match(mainSrc, /crane\.setClaw\(grabbed \? 0 : 1, spaceVent\.half\)/,
    'the crane does not close around the measured width mid-reel');
});

test('the wash-and-spin pins the car by its centre inside the chamber', () => {
  // The car used to spin about its own origin while sitting on the floor, which
  // swung its roof down through the deck (it clipped "outside the airlock"). It is
  // now held about its geometric centre, pinned at the blast port's height, and the
  // lift eases in as the chamber charges and back out as it is driven clear.
  assert.match(mainSrc, /const SPACE_VENT_CHAMBER_Y = 2\.7;/,
    'the chamber-centre height constant is gone');
  assert.match(mainSrc, /SPACE_VENT_CHAMBER_Y - upDot \* spaceVent\.top \* 0\.5/,
    'the car is not held about its measured centre');
  assert.match(mainSrc, /const upDot = _spaceTmp\.x \* rimX \+ _spaceTmp\.y \* rimY/,
    'the car-up / rim-up alignment is not read');
  assert.match(mainSrc, /car\.position\.set\(p\.px \+ rimX \* rise, p\.py \+ rimY \* rise, p\.pz\)/,
    'the centring lift is not applied along the rim');
  // The spin must not begin until the chamber charges, so the car drives in flat.
  // In act 1 there is no drive beat — the tumble is already running on the cut.
  assert.match(mainSrc, /else if \(act === 1 \|\| t >= SPACE_VENT_DRIVE\) \{[\s\S]{0,400}spaceVent\.rollV \+= 1\.8 \* delta/,
    'the car tumbles before the chamber charges');
});

test('only the blast repeats: an interior lens, then an exterior cinematic angle', () => {
  // Act 0 is the interior lens (drive-in, charge, a truncated blast); act 1 is an
  // exterior angle that replays only the blast and then runs the rescue. The full
  // sequence is NOT shown twice — the drive, the wind-up and the rescue happen once.
  assert.match(mainSrc, /const SPACE_VENT_TOTAL = SPACE_VENT_ACT \+ SPACE_VENT_ACT_B;/,
    'the vent is no longer two dissimilar acts');
  assert.match(mainSrc, /const SPACE_VENT_ACT = SPACE_VENT_DRIVE \+ SPACE_VENT_CHARGE \+ SPACE_VENT_FLY;/,
    'act 0 is not drive-in + charge + a truncated blast');
  assert.match(mainSrc, /const act = spaceVent\.timer >= SPACE_VENT_ACT \? 1 : 0;/,
    'the vent does not split into two acts');
  assert.match(mainSrc, /const SPACE_VENT_EXT_CAM = \{ x: 52, y: 16, z: 68 \};/,
    'there is no exterior vantage for the second showing');
  assert.match(mainSrc, /if \(spaceVent\.timer >= SPACE_VENT_ACT\) \{[\s\S]{0,400}SPACE_VENT_EXT_CAM/,
    'the replay does not cut to the exterior angle');
  // Act 0 truncates the blast; act 1 runs it the whole way.
  assert.match(mainSrc, /out = SPACE_VENT_DIST_A \* \(1 - Math\.pow\(1 - k, 3\)\)/,
    'act 0 does not use its own truncated blast distance');
  assert.match(mainSrc, /const k = t \/ SPACE_VENT_FLY_B;/,
    'act 1 does not run the full blast');
  // The tumble carries ACROSS the cut, so the second showing is not a jarring reset.
  assert.doesNotMatch(mainSrc, /spaceVent\.roll = 0; spaceVent\.rollV = 0; spaceVent\.out = 0;/,
    'the cut resets the tumble instead of carrying it across');
});

test('the airlock hands the car back on the road, not parked in the chamber', () => {
  // After the claw reels it home the car is driven back OUT of the chamber mouth
  // and onto the middle of the lane, so control returns with a car on the road.
  assert.match(mainSrc, /SPACE_VENT_EXIT/, 'there is no exit phase after the reel');
  assert.match(mainSrc, /const w = \(seatW \+ out \+ drift\) \* \(1 - exit\)/,
    'the car is not driven back out of the chamber to the lane centre');
  assert.match(mainSrc, /spaceDrive = createRingState\(s, 0, h\)/,
    'the car is not handed back on the road centre-line');
});

test('the chamber fires the car sideways (+w) out of its far port', () => {
  // The fling is axial now, not radial: the car is driven out along +w at the rim
  // radius (the pose's radial arg stays 0) rather than flung off the rim.
  assert.match(mainSrc, /const p = ringPose\(seatS, w, yaw, 0\)/,
    'the car is still flung radially instead of fired out the port');
  assert.match(mainSrc, /SPACE_VENT_DIST = 30;      \/\//,
    'the fling distance constant is gone');
  // The far end of the chamber is an open blast port, not a solid wall.
  assert.match(sectSrc, /portGlow/,
    'the decon bay has no blast port at its far end');
});

test('the car drives in and the chamber charges before the blast', () => {
  // A drive-in phase and a multi-second charge must sit between the trigger and
  // the blast, so the camera can hold on the chamber as it winds up.
  assert.match(mainSrc, /const SPACE_VENT_DRIVE = [\d.]+;/,
    'there is no drive-in phase');
  const charge = mainSrc.match(/const SPACE_VENT_CHARGE = ([\d.]+);/);
  assert.ok(charge, 'the chamber-charge beat is gone');
  assert.ok(Number(charge[1]) >= 2,
    `the charge is only ${charge[1]}s, too brief to watch the chamber wind up`);
  assert.match(mainSrc, /spaceWorld\.decon\.charge = charge/,
    'main.js never drives the chamber charge');
  assert.match(sectSrc, /decon\.charge/,
    'the sector never reads the chamber charge to light it up');
});

test('the rescue cable is a flexible rope, not a rigid rod', () => {
  // The hoist line is a chain of segments the sector lays out, and `setReach`
  // takes a waviness + phase so it can snake like a cable and go taut when held.
  const world = sectors.buildSpaceSectors();
  const { rope } = world.crane.mount.userData;
  assert.ok(rope, 'the crane no longer has a rope/hoist line');
  const n = rope.children.length;
  assert.ok(n >= 8, `the cable is only ${n} unit(s) - not a flexible chain`);
  assert.match(sectSrc, /setReach\(reach, heading = 0, waviness = 0, phase = 0, lift = 0\)/,
    'setReach cannot flex the cable');
  const first = rope.children[0], last = rope.children[n - 1];
  // A taut line runs straight from the pivot out to the claw...
  world.crane.setReach(20, 0, 0, 0);
  assert.ok(first.position.x > 0 && first.position.x < 2,
    `the taut line does not start near the pivot (${first.position.x})`);
  assert.ok(last.position.x > 18 && last.position.x < 20,
    `the taut line does not reach the claw (${last.position.x})`);
  assert.ok(rope.children.every((s) => Math.abs(s.position.z) < 1e-6),
    'the taut line is not straight');
  // ...and a wavy line bows off that straight axis.
  let maxOff = 0;
  world.crane.setReach(20, 0, 1, 0.5);
  for (const seg of rope.children) maxOff = Math.max(maxOff, Math.abs(seg.position.z));
  assert.ok(maxOff > 0.2, `the cable barely flexed (maxOff=${maxOff.toFixed(3)})`);
});

test('the idle rig parks its claw clear of the bay and its mast stands aside', () => {
  const world = sectors.buildSpaceSectors();
  const crane = world.crane;
  // The claw tucks up toward the jib when parked, and drops back down for a reach.
  crane.setReach(0, 0);
  const down = crane.claw.position.y;
  crane.setReach(0, 0, 0, 0, crane.parkLift);
  const parked = crane.claw.position.y;
  assert.ok(parked > down + 1.5, `the claw did not lift to park (down=${down}, parked=${parked})`);
  // The mast is built off to the side (local +Z) so it is out of the +w ejection
  // lane, while the jib still reaches back over the bay mouth at local (0,0).
  const tower = crane.mount.getObjectByName('Crane Tower');
  assert.ok(tower, 'the crane mast is not a separate tower group');
  assert.ok(tower.position.z > 2, 'the mast still stands out along the jib, not aside');
});

test('the rescue camera cuts INSIDE the station for the vent', () => {
  // The old lens sat on the space side of the rim; the new one is inboard of the
  // window wall so the car is watched being fired out through the port.
  assert.match(mainSrc, /const inboard = 3\.0;/,
    'the vent camera is not pulled inside the station');
  assert.doesNotMatch(mainSrc, /const out = 44 \+ spaceVent\.e \* 0\.35/,
    'the old exterior rim lens is still there');
  assert.match(mainSrc, /camera\.up\.set\(-c, -sn, 0\)/,
    'the inside lens does not stand on the rim');
});

test('the jib runs the claw out along +w and turns it to the car', () => {
  const world = sectors.buildSpaceSectors();
  const crane = world.crane;
  const zone = world.zones.find((v) => v.type === 'vent');
  const claw = crane.claw;
  // Extending the reach slides the claw out along +w, still at the rim radius.
  crane.setReach(0, 0);
  const at0 = { x: claw.position.x, y: claw.position.y, z: claw.position.z };
  crane.setReach(10, 0);
  assert.ok(claw.position.x > at0.x + 9, 'the claw does not run out along +w');
  assert.ok(Math.abs(claw.position.y - at0.y) < 1e-6,
    'the claw left the rim radius as it ran out');
  // The grip turns to face the car: jaw axis follows the car heading.
  crane.setReach(5, Math.PI / 2);
  const yawA = claw.rotation.y;
  crane.setReach(5, 0);
  assert.ok(Math.abs(yawA - claw.rotation.y) > 1, 'the grip ignores the car heading');
});

test('the city boarding hand is fitted to the car, not a fixed palm height', () => {
  assert.match(mainSrc, /rocketRide\.hold = m\.top \+ 0\.12/,
    'the palm height is not fitted to the car roof');
  assert.match(mainSrc, /const fit = \{[\s\S]{0,220}half: rocketRide\.half[\s\S]{0,220}width: rocketRide\.half \* 2 \+ 0\.4/,
    'the hand fit is not built from the measured half-width');
  assert.match(mainSrc, /const claw = b\.reach\(hand, st\.grip, fit\)/,
    'the arm reach does not get the car fit');
});

test('the city hand turns the car with it, and sets it down facing forward', () => {
  assert.match(mainSrc, /const armYaw = b\.armYaw\(\)/,
    'the ride never reads the arm heading');
  assert.match(mainSrc, /rocketRide\.yawOffset = rocketRide\.yaw - armYaw/,
    'the car-vs-hand yaw offset is not captured at pickup');
  assert.match(mainSrc, /const heldYaw = turningWithHand \? armYaw \+ rocketRide\.yawOffset : rocketRide\.yaw/,
    'the held car yaw does not follow the hand');
  assert.match(mainSrc, /car\.rotation\.set\(0, heldYaw, 0\)/,
    'the held car does not use the hand-tracking yaw');
});

test('the boarding arm exposes its heading and accepts the car fit', () => {
  assert.match(portSrc, /reach: \(worldTarget, grip, fit\) => arm\.reach\(worldTarget, grip, fit\)/,
    'the boarding reach does not forward the car fit');
  assert.match(portSrc, /armYaw: \(\) => arm\.yawAngle\(\)/,
    'the boarding object does not expose the arm heading');
  assert.match(portSrc, /const yawAngle = \(\) => yaw\.rotation\.y/,
    'makeBoardingArm does not measure its own yaw');
});

// ===== The side hangar + the return leg =====================================

test('the side dock is a big hangar, not the tiny catalogue airlock', () => {
  // The level builds the pod-bay model BIG so the whole rocket fits inside.
  assert.match(idxSrc, /const bay = buildSpacePodBay\(\{ mouthR: [\d.]+, hx: [\d.]+, hz0: -?[\d.]+, hz1: [\d.]+, hy0: -?[\d.]+ \}\)/,
    'the level dock is not enlarged into a full hangar');
  const small = space.buildSpacePodBay();
  const big = space.buildSpacePodBay({ mouthR: 7.5, hx: 7, hz0: 2, hz1: 28, hy0: -30 });
  let n = 0;
  big.traverse((o) => { if (o.isMesh) n++; });
  assert.ok(n >= 15, `the enlarged hangar is nearly empty (${n} meshes)`);
  // The big hangar's mouth is wider than the catalogue airlock.
  assert.notEqual(small.userData.mouthR, big.userData.mouthR,
    'the hangar was not enlarged past the catalogue airlock');
});

test('a big hydraulic arm stands in the hangar, sized to span it', () => {
  const arm = space.buildSpaceHangarArm({ baseX: 5, baseZ: 8, a: 9, b: 9, baseH: 2.6 });
  assert.equal(typeof arm.reach, 'function', 'the hangar arm cannot reach');
  assert.equal(typeof arm.yawAngle, 'function', 'the hangar arm has no heading');
  assert.ok(arm.g.position.x === 5 && arm.g.position.z === 8,
    'the hangar arm is not based off the car lane');
  let meshes = 0;
  arm.g.traverse((n) => { if (n.isMesh) meshes++; });
  assert.ok(meshes >= 6, `the hangar arm is nearly empty (${meshes} meshes)`);
  assert.match(idxSrc, /buildSpaceHangarArm\(\{ baseX: 5, baseZ: 8, a: 9, b: 9, baseH: 2\.6 \}\)/,
    'the level does not mount the big hangar loading arm');
});

test('the space departure lifts the car into the rocket with the arm', () => {
  assert.match(mainSrc, /buildSpaceHangarArm|hangarArm\.reach|arm\.reach\(_spaceHand, grip, fit\)/,
    'the departure never drives an arm to load the car');
  assert.match(mainSrc, /const SPACE_DEPART_LOAD = SPACE_DEPART_LOAD_GRAB/,
    'the load phases are gone');
  assert.match(mainSrc, /_spaceHand\.copy\(_spacePadH\)\.lerp\(_spaceRoofH, l\)/,
    'the arm does not carry the car from the berth to the roof');
  assert.match(mainSrc, /_spaceHand\.copy\(_spaceRoofH\)\.lerp\(_spaceSeatH, l\)/,
    'the arm does not lower the car into the hold');
  assert.match(mainSrc, /spaceWorld\.arrivalHinge\.rotation\.z = 1\.15/,
    'the rocket roof is not opened to receive the car');
});

test('the return leg lands the rocket and unloads the car in the city', () => {
  assert.match(mainSrc, /function startCityLanding\(\)/,
    'the departure no longer hands off to a city landing');
  assert.match(mainSrc, /startCityLanding\(\);\s*\n\}/,
    'finishSpaceDeparture does not call the landing');
  assert.match(mainSrc, /const CITY_LAND_DESCEND =/,
    'the landing timeline is gone');
  assert.match(mainSrc, /_clHand\.copy\(_clSeatH\)\.lerp\(_clHigh, l\)/,
    'the arm does not lift the car out of the hold');
  assert.match(mainSrc, /_clHand\.copy\(_clHigh\)\.lerp\(_clStageH, l\)/,
    'the arm does not set the car back on the apron');
  assert.match(mainSrc, /if \(cityLanding\.active\) updateCityLanding\(delta\)/,
    'the landing is never advanced from the loop');
  assert.match(mainSrc, /!rocketRide\.active && !cityLanding\.active/,
    'the landing does not stand the car physics down');
});
