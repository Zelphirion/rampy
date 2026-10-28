// The outer belt's hills are ground: what the car drives on and what a knocked
// tire rests on has to be the SAME surface as the mesh, or a hill you can see is
// a hill you fall through.
//
// Run: node --test src/modules/cityHills.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import '../objects/nodeShims.mjs';

const THREE = await import('three');
const { CITY_HILLS, hillProfileAt, natureHillHeightAt } = await import('./cityHills.js');
const { addCityOuter } = await import('../cityOuter.js');
const { addKnockable, updateKnockables, resetKnockables } = await import('../physics.js');

test('a hill is a dome: full height at the crown, nothing at the rim', () => {
  for (const hill of CITY_HILLS) {
    assert.ok(hill.r > 0 && hill.h > 0, `hill at (${hill.x}, ${hill.z}) has no size`);
    assert.equal(hillProfileAt(hill, 0), hill.h, 'the crown is the full height');
    assert.equal(hillProfileAt(hill, hill.r), 0, 'the rim is flush with the field');
    assert.equal(hillProfileAt(hill, hill.r * 2), 0, 'and nothing beyond it');
    // No ledge to drive into and no spike over the top: the profile only ever
    // falls, and it is flattest at both ends.
    let prev = hill.h, steepest = 0;
    const step = hill.r / 40;
    for (let i = 1; i <= 40; i++) {
      const d = (i / 40) * hill.r;
      const y = hillProfileAt(hill, d);
      assert.ok(y <= prev + 1e-9, `the hill climbs again at d=${d.toFixed(2)}`);
      steepest = Math.max(steepest, (prev - y) / step);
      prev = y;
    }
    assert.ok(Math.abs(prev) < 1e-9, 'the profile does not end at the rim');
    // Steep enough to be a hill, gentle enough for a car: under 45 degrees.
    assert.ok(steepest > 0.15, 'the hill is a flat disc, not a hill');
    assert.ok(steepest < 1, `the hill is a cliff (slope ${steepest.toFixed(2)})`);
  }
});

test('natureHillHeightAt reads the same surface, and is 0 off the hills', () => {
  for (const hill of CITY_HILLS) {
    assert.equal(natureHillHeightAt(hill.x, hill.z), hill.h, 'not the full height on the crown');
    for (const [dx, dz] of [[hill.r, 0], [-hill.r, 0], [0, hill.r], [0, -hill.r]]) {
      assert.equal(natureHillHeightAt(hill.x + dx, hill.z + dz), 0, 'the rim is not flush');
    }
    assert.equal(natureHillHeightAt(hill.x + hill.r + 1, hill.z), 0);
  }
  // Everywhere else in the city is flat.
  for (const [x, z] of [[0, 0], [-40, -40], [60, 60], [170, 240], [-170, -170]]) {
    assert.equal(natureHillHeightAt(x, z), 0, `(${x}, ${z}) is not flat ground`);
  }
  assert.ok(natureHillHeightAt(0, 0) >= 0, 'the height can never be negative');
});

test('the hill MESH is the same surface the car drives on', () => {
  const scene = new THREE.Scene();
  addCityOuter(scene, []);
  scene.updateMatrixWorld(true);
  let hills = 0;
  const vertex = new THREE.Vector3();
  scene.traverse((o) => {
    if (o.name !== 'cityHill' || !o.isMesh) return;
    hills++;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      vertex.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const expected = natureHillHeightAt(vertex.x, vertex.z);
      assert.ok(Math.abs(vertex.y - expected) < 1e-3,
        `the hill mesh stands at y=${vertex.y.toFixed(2)} where the ground is ${expected.toFixed(2)}`);
    }
    assert.ok(o.geometry.attributes.normal, 'the hill has no normals, so it will not light');
  });
  assert.equal(hills, CITY_HILLS.length, 'not every hill was built');
});

test('a tire dropped on a hill comes to rest on its slope, not inside it', () => {
  resetKnockables();
  const hill = CITY_HILLS[0];
  const ontoHill = (x, z) => 0.18 + natureHillHeightAt(x, z);
  const assertRestsOnSurface = (label) => {
    resetKnockables();
    const group = new THREE.Group();
    group.position.set(hill.x, 30, hill.z);   // dropped from the sky over the crown
    group.name = label;
    const k = addKnockable(group, 0.72, {
      mode: 'tire',
      groundY: 0.18,
      groundAt: ontoHill,
      rimLift: 0.72 - 0.18,
      rollRadius: 0.72,
      rollPower: 8,
      rollDecay: 1.2,
      rollDuration: 0.6,
      shovePower: 4,
      dropSkid: 0,
    });
    k.state = 'dropping';
    k.vy = 0;
    for (let i = 0; i < 400; i++) updateKnockables(1 / 60);
    const surface = natureHillHeightAt(group.position.x, group.position.z);
    // A tire that went to sleep at the flat ground height (0.18) has fallen
    // inside the hill; one resting on the surface is up at 0.18 + the hill.
    assert.ok(surface > 1, `the tire did not stay over the hill (surface ${surface.toFixed(2)})`);
    assert.ok(group.position.y >= 0.18 + surface - 1e-6,
      `${label}: the tire sank ${((0.18 + surface) - group.position.y).toFixed(2)} into the hill`);
  };
  assertRestsOnSurface('dropped');
});
