// Geometry guards for the city's sports kit: the basketball hoops and the
// outer-belt soccer pitch. Uses the real builders against the headless THREE shim.
//
// Run: node --test src/schoolSports.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import './objects/nodeShims.mjs';

const THREE = await import('three');
const { addCityBuildings } = await import('./cityBuildings.js');
const { buildSoccerField, updateSoccerBall, updateSoccerScoreTires, makeScoreTire, SCORE_TIRE_RADIUS, SCORE_TIRE_HALF_WIDTH, SCORE_TIRE_GROUND } = await import('./soccer.js');
const { SOCCER } = await import('./soccerPhysics.mjs');
const { knockAt, updateKnockables } = await import('./physics.js?v=1800000000006');
const { onRoad, railClearance } = await import('./cityRoads.js');

test('the school hoops are flat rings with nets, not plates on the backboard', () => {
  const scene = new THREE.Scene();
  addCityBuildings(scene, []);
  scene.updateMatrixWorld(true);
  const rims = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'TorusGeometry') return;
    // The rim is the fat torus; the thin ones are the net's rings below it.
    if ((o.geometry.parameters?.tube ?? 0) < 0.03) return;
    const p = o.getWorldPosition(new THREE.Vector3());
    if (p.x > 12 && p.x < 30 && p.z > 15 && p.z < 38 && p.y > 2 && p.y < 4) rims.push({ o, p });
  });
  assert.equal(rims.length, 2, 'expected one rim at each end of the school yard');
  const n = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (const { o, p } of rims) {
    o.getWorldQuaternion(q);
    n.set(0, 0, 1).applyQuaternion(q);
    assert.ok(Math.abs(n.y) > 0.99,
      `the rim at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) is not lying flat (normal y ${n.y.toFixed(2)})`);
  }
  // A net hangs under each rim: strands and rings within the rim's footprint.
  for (const { p } of rims) {
    let strands = 0;
    const v = new THREE.Vector3();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.getWorldPosition(v);
      if (v.y > p.y - 0.8 && v.y < p.y - 0.02 && Math.hypot(v.x - p.x, v.z - p.z) < 0.55) strands++;
    });
    assert.ok(strands >= 8, `only ${strands} net parts under the rim`);
  }
});

test('the large outer-belt soccer pitch has a complete panelled ball and two goals', () => {
  const scene = new THREE.Scene();
  const colliders = [];
  const soccer = buildSoccerField(scene, colliders);
  const primary = soccer.balls[0];
  assert.ok(primary && primary.mesh, 'the field has no ball');
  assert.equal(primary.r, SOCCER.ballR);
  assert.ok(SOCCER.ballR > 1.4, 'the ball is not oversized');
  assert.deepEqual([SOCCER.cx, SOCCER.cz], [136, 73], 'the pitch is not at map (44, 173)');
  assert.ok(SOCCER.x1 - SOCCER.x0 >= 75 && SOCCER.z1 - SOCCER.z0 >= 95,
    'the outer-belt pitch does not have enough room');
  for (let x = SOCCER.x0; x <= SOCCER.x1; x += 2) {
    for (let z = SOCCER.z0; z <= SOCCER.z1; z += 2) {
      assert.equal(onRoad(x, z), false, `road cuts across the pitch at (${x}, ${z})`);
    }
  }
  for (const x of [SOCCER.x0, SOCCER.x1]) {
    for (const z of [SOCCER.z0, SOCCER.z1]) {
      assert.ok(railClearance(x, z) > 0, `the pitch reaches the railway at (${x}, ${z})`);
    }
  }
  assert.equal(soccer.goals.length, 2, 'expected a goal at each end');
  assert.ok(colliders.length >= 6, 'the goal frames are not solid to the car');
  const panels = [];
  primary.mesh.traverse((o) => { if (o.userData.panelType) panels.push(o); });
  // The panels of each colour share one merged mesh (a ball has to be cheap
  // enough to stamp out a hundred and sixty of them), so the count comes off
  // userData rather than off the mesh count.
  const panelTotal = (type) => panels.filter((p) => p.userData.panelType === type)
    .reduce((n, p) => n + p.userData.panelCount, 0);
  assert.equal(panelTotal('pentagon'), 12, 'the ball needs twelve pentagons');
  assert.equal(panelTotal('hexagon'), 20, 'the ball needs twenty hexagons');
  // Every panel corner must sit exactly on the ball's surface: the whole ball is
  // one sphere, so the pattern wraps all the way over the top with no flat
  // facets falling away from the curve (which is what used to break it up).
  for (const panel of panels) {
    const pos = panel.geometry.attributes.position.array;
    assert.ok(pos.length >= 9 * 3, 'a panel is degenerate');
    for (let i = 0; i < pos.length; i += 3) {
      const r = Math.hypot(pos[i], pos[i + 1], pos[i + 2]);
      assert.ok(Math.abs(r - SOCCER.ballR) < 1e-3,
        `a ${panel.userData.panelType} vertex sits at r=${r.toFixed(3)}, not on the ball`);
    }
    assert.ok(panel.geometry.attributes.normal, 'the ball panels have no normals');
  }
  // A dark core sphere fills the seam grooves, so no groove shows the sky.
  let cores = 0;
  primary.mesh.traverse((o) => { if (o.geometry?.type === 'SphereGeometry') cores++; });
  assert.equal(cores, 1, 'the ball needs one core sphere under its panels');
  let nets = 0;
  soccer.group.traverse((o) => { if (o.name === 'soccerGoalNet') nets++; });
  assert.equal(nets, 2, 'each goal should have a net');
  assert.equal(primary.x, SOCCER.cx);
  assert.equal(primary.z, SOCCER.cz);

  // The per-frame update moves the mesh with the physics.
  primary.vx = 6;
  updateSoccerBall(soccer, 1 / 60, []);
  assert.ok(primary.mesh.position.x > SOCCER.cx, 'the ball mesh does not follow the ball');
  assert.ok(primary.mesh.position.y >= SOCCER.ballR, 'the ball is sunk into the pitch');
});

test('every bump doubles the balls, until the pitch is carpeted', () => {
  const scene = new THREE.Scene();
  const soccer = buildSoccerField(scene, []);
  assert.equal(soccer.balls.length, 1, 'the match starts with one ball');

  // One car per ball, all in the same frame: that is what "bumping the ball"
  // means once there is more than one of them.
  const carAt = (b) => ({ x: b.x + 0.01, z: b.z + 0.01, heading: Math.PI / 2, speed: 9 });
  const settle = () => {
    // Let the split cooldown expire between rounds, so a round is one bump per
    // ball rather than one bump per cooldown tick.
    for (let i = 0; i < 30; i++) updateSoccerBall(soccer, 1 / 60, []);
  };
  const bumpAll = () => {
    settle();
    updateSoccerBall(soccer, 1 / 60, soccer.balls.map(carAt));
    return soccer.balls.length;
  };

  assert.equal(bumpAll(), 2, 'one ball becomes two');
  assert.equal(bumpAll(), 4, 'two become four');
  assert.equal(bumpAll(), 8, 'four become eight');

  // Every ball is its own mesh in the pitch group, and every one is on the pitch.
  for (const b of soccer.balls) {
    assert.ok(b.mesh && b.mesh.parent === soccer.group, 'a ball has no mesh on the pitch');
    assert.ok(b.x > SOCCER.x0 && b.x < SOCCER.x1 && b.z > SOCCER.z0 && b.z < SOCCER.z1,
      `ball at (${b.x}, ${b.z}) is off the pitch`);
  }
  // A ball pressed against a car must not spawn a copy every frame — one touch,
  // one extra ball. Without the cooldown this would have gone to hundreds.
  const held = soccer.balls.length;
  const one = soccer.balls[0];
  const nudger = { x: one.x + 0.5, z: one.z, heading: Math.PI, speed: 9 };
  for (let i = 0; i < 12; i++) updateSoccerBall(soccer, 1 / 60, [nudger]);
  assert.ok(soccer.balls.length <= held + 1, 'one held touch spawned a burst of balls');

  // The horde is capped: keep bumping and it stops growing rather than eating
  // the frame budget.
  for (let i = 0; i < 8; i++) bumpAll();
  assert.equal(soccer.balls.length, 160, 'the horde should top out at its cap');
  bumpAll();
  assert.equal(soccer.balls.length, 160, 'and stay there');
});

test('each goal scores a detailed tire that drops, bounces, and stacks unevenly', () => {
  const scene = new THREE.Scene();
  const soccer = buildSoccerField(scene, []);
  const ball = soccer.balls[0];
  const score = (goalIndex) => {
    const goal = soccer.goals[goalIndex];
    const expectedTires = soccer.tireStacks[goalIndex].length + 1;
    ball.resetT = 0;
    ball.x = SOCCER.cx;
    ball.z = goalIndex === 0 ? SOCCER.z0 + ball.r + 0.2 : SOCCER.z1 - ball.r - 0.2;
    ball.vx = 0;
    ball.vz = goalIndex === 0 ? -12 : 12;
    for (let i = 0; i < 30 && soccer.tireStacks[goalIndex].length < expectedTires; i++) {
      updateSoccerBall(soccer, 1 / 60, []);
    }
    assert.equal(soccer.tireStacks[goalIndex].length, expectedTires, `goal ${goalIndex} did not add one tire`);
  };

  score(0);
  score(0);
  score(1);
  assert.equal(soccer.tireStacks[0].length, 2);
  assert.equal(soccer.tireStacks[1].length, 1);

  const firstStack = soccer.tireStacks[0];
  const first = firstStack[0], second = firstStack[1];
  assert.equal(first.state, 'bouncing', 'a scored tire should start falling');
  assert.ok(first.group.position.y > first.groundY + 8,
    `tire did not drop from the sky (y=${first.group.position.y}, ground=${first.groundY})`);
  assert.deepEqual(second.supporters, [first], 'the new tire should be supported by the prior tire');
  assert.notEqual(first.group.position.x, second.group.position.x, 'stack tires should be offset');
  assert.notEqual(first.group.position.z, second.group.position.z, 'stack tires should be individually visible');

  const toruses = [], treadBlocks = [];
  first.group.traverse((o) => {
    if (o.geometry?.type === 'TorusGeometry') toruses.push(o);
    if (o.isMesh && o.geometry?.type === 'BoxGeometry') treadBlocks.push(o);
  });
  assert.equal(toruses.length, 4, 'tire needs a bead ring on each face, inside and out');
  assert.equal(treadBlocks.length, 20, 'tire should have a full ring of chunky tread blocks');
  // The finished mesh has to be exactly the size the physics stacks it at, and
  // centred on its own middle: ExtrudeGeometry's bevel ADDS to both the depth and
  // the outline, so paying it back is what keeps the bead rings on the outside of
  // the rubber instead of buried in it.
  const fresh = makeScoreTire();
  fresh.updateMatrixWorld(true);
  const tireBox = new THREE.Box3().setFromObject(fresh);
  assert.ok(Math.abs(tireBox.max.x - SCORE_TIRE_RADIUS) < 1e-6,
    `the tire's tread reaches ${tireBox.max.x}, not its rolling radius`);
  const halfH = (tireBox.max.y - tireBox.min.y) / 2;
  assert.ok(Math.abs(halfH - SCORE_TIRE_HALF_WIDTH) < 0.03,
    `the tire is ${halfH.toFixed(3)} tall, not the ${SCORE_TIRE_HALF_WIDTH} it is stacked at`);
  assert.ok(Math.abs(tireBox.max.y + tireBox.min.y) < 1e-6, 'the tire is not centred on its own middle');
  // Every ring lies flat in the tire's own plane, half-buried in the face it
  // decorates. A TorusGeometry stands upright in the XY plane, so one that was
  // never turned down hangs out through the sidewall like a hoop, and one left
  // below the face is invisible inside the rubber - both of which happened.
  for (const ring of toruses) {
    assert.ok(Math.abs(Math.abs(ring.rotation.x) - Math.PI / 2) < 1e-6,
      `a sidewall ring is standing up (rotation.x ${ring.rotation.x})`);
    assert.ok(Math.abs(ring.position.y) > SCORE_TIRE_HALF_WIDTH - 0.03,
      `a sidewall ring is buried inside the tire at y=${ring.position.y}`);
  }
  // …and every tread block sits on the tread band, not on a sidewall, with its
  // outer face exactly on the radius the tire rolls on.
  for (const block of treadBlocks) {
    const p = block.geometry.parameters;
    assert.ok(block.geometry.type === 'BoxGeometry', 'a tread block is not a block');
    const reach = Math.hypot(block.position.x, block.position.z) + p.depth / 2;
    assert.ok(Math.abs(reach - SCORE_TIRE_RADIUS) < 1e-6,
      `the tread reaches ${reach.toFixed(3)}, not the tire's rolling radius`);
    assert.ok(p.height < SCORE_TIRE_HALF_WIDTH * 2, 'a tread block is wider than the tire');
    assert.ok(Math.abs(block.position.y) < 1e-6, 'a tread block is on a sidewall, not the tread');
  }

  let bounced = false;
  for (let i = 0; i < 240; i++) {
    updateSoccerScoreTires(soccer, 1 / 60);
    if (first.bounceCount > 0) bounced = true;
  }
  assert.ok(bounced, 'the dropped tire should rebound on its rubber');
  assert.equal(first.state, 'standing', 'the tire should settle onto the stack');
  assert.ok(Math.abs(first.group.position.y - first.slotY) < 1e-6, 'the tire settled out of its slot');
  knockAt(first.group.position, 0.5, 0, 0, 14);
  assert.equal(first.state, 'falling', 'a scored tire should remain knockable');
});

test('knocking the pile over brings the whole column down to the ground', () => {
  const scene = new THREE.Scene();
  const soccer = buildSoccerField(scene, []);
  const ball = soccer.balls[0];
  // Four tires at the south goal, one on top of the other.
  for (let n = 0; n < 4; n++) {
    const want = soccer.tireStacks[0].length + 1;
    ball.resetT = 0;
    ball.x = SOCCER.cx;
    ball.z = SOCCER.z0 + ball.r + 0.2;
    ball.vx = 0;
    ball.vz = -12;
    for (let i = 0; i < 30 && soccer.tireStacks[0].length < want; i++) {
      updateSoccerBall(soccer, 1 / 60, []);
    }
    assert.equal(soccer.tireStacks[0].length, want, 'a goal did not add a tire');
  }
  const stack = soccer.tireStacks[0];
  assert.equal(stack.length, 4);
  // Let them all drop and bounce themselves to rest.
  for (let i = 0; i < 600; i++) updateSoccerScoreTires(soccer, 1 / 60);
  for (const k of stack) assert.equal(k.state, 'standing', 'a tire never settled onto the pile');
  assert.ok(stack[3].slotY > stack[0].slotY + 1, 'the pile should be several tires high');
  assert.ok(Math.abs(stack[0].slotY - SCORE_TIRE_GROUND) < 1e-9, 'the bottom tire sits on the ground');
  assert.ok(stack.every((k) => k.groundY === SCORE_TIRE_GROUND),
    'a tire that falls out of the pile must land on the ground, not on its old slot');

  // Knock the BOTTOM tire out. Everything above it loses its support and has to
  // come down too — the same tier-by-tier collapse as the ramp-world pyramid.
  knockAt(stack[0].group.position, 0.5, 0, 0, 14);
  assert.equal(stack[0].state, 'falling', 'the bottom tire should be knocked out');
  for (let i = 0; i < 900; i++) {
    updateSoccerScoreTires(soccer, 1 / 60);
    updateKnockables(1 / 60);
  }
  for (const k of stack) {
    assert.ok(k.group.position.y <= SCORE_TIRE_GROUND + 1.2,
      `a tire is still up in the air at y=${k.group.position.y.toFixed(2)}`);
    assert.ok(k.state === 'fallen' || k.state === 'sliding' || k.state === 'rolling',
      `a tire is still ${k.state} after the pile came down`);
  }
});
