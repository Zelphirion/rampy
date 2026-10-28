// The bathroom's own rules, measured off the real built house:
//   * nothing in the room may be tagged as a camera-fade occluder — everything
//     there is solid, because the lens is kept inside the room (main.js) and the
//     tub you drive in must never turn see-through around you;
//   * the bath is EMPTY (no water slab) so the dish is a proper skate bowl;
//   * the boogie board is full height and leans against the tub's outer wall.
//
// This one builds the house against the REAL three.js (the CDN loader is shimmed
// to the local package) so the board's tilted mesh can be measured with Box3;
// the stub-based house tests cannot see through a rotation.
//
// Run: node --test src/levels/house/bathroom.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../objects/nodeShims.mjs';
import { ROOMS } from './layout.js';

const THREE = await import('three');
const { addHouse } = await import('./index.js');
const world = await addHouse({ add() {} }, {});
const g = world.group;
g.updateMatrixWorld(true);
const br = ROOMS.bathroom;

test('no mesh in the bathroom is a camera-fade occluder', () => {
  let meshes = 0;
  const ghosts = [];
  const v = new THREE.Vector3();
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.getWorldPosition(v);
    if (v.x < br.x0 || v.x > br.x1 || v.z < br.z0 || v.z > br.z1) return;
    meshes++;
    if (o.userData.houseOccluder) ghosts.push([+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)]);
  });
  assert.ok(meshes > 20, `expected a furnished bathroom, found ${meshes} meshes`);
  assert.deepEqual(ghosts, [], 'bathroom meshes still fade out of the way');
});

test('the boogie board is full height and leans on the tub, not over the opening', () => {
  let board = null;
  g.traverse((o) => { if (o.name === 'boogieBoard') board = o; });
  assert.ok(board, 'the boogie board is missing');
  let fading = false;
  board.traverse((o) => { if (o.isMesh && o.userData.houseOccluder) fading = true; });
  assert.equal(fading, false, 'the board fades like a wall');
  const b = new THREE.Box3().setFromObject(board);
  // The tub's west wall is at x = 81.5..81.9; the rim's top is 5.75. The board
  // must be tall (reaching the rim) but stop at the wall, not hang into the bath.
  assert.ok(b.max.x < 82.0, `the board reaches x=${b.max.x.toFixed(2)}, over the opening`);
  assert.ok(b.max.y > 5.0, `the board tops out at y=${b.max.y.toFixed(2)}, too short to reach the rim`);
  assert.ok(b.max.y < 5.75, `the board reaches y=${b.max.y.toFixed(2)}, through the rim`);
});

test('the tub is empty — no water slab in the dish', () => {
  let tub = null;
  g.traverse((o) => { if (o.name === 'tub') tub = o; });
  assert.ok(tub, 'the tub is missing');
  const slabs = [];
  const b = new THREE.Box3();
  const s = new THREE.Vector3();
  tub.traverse((o) => {
    if (!o.isMesh) return;
    b.setFromObject(o);
    b.getSize(s);
    if (s.y > 2 && s.x > 2 && s.z > 2 && b.min.y > 1.0) slabs.push([+s.x.toFixed(1), +s.y.toFixed(1), +s.z.toFixed(1)]);
  });
  assert.deepEqual(slabs, [], 'the tub still has its water/liner slab in the bowl');
});
