// Regression tests for the house camera fade (see-through walls).
//
// This is the one feature in here that CANNOT be checked by reading the source.
// A raycast either finds the wall or it does not; a regex will happily pass on a
// system that never fades anything at all. So these build real Three.js
// geometry, run the real functions out of main.js, and measure the opacity that
// comes out the other end.
//
// The functions are lifted out of main.js and eval'd because main.js is a
// top-level-await browser entrypoint that cannot be imported here. Everything
// they touch is stubbed below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

// three is loaded from a CDN at runtime and is not in node_modules, so the test
// fetches the exact build main.js pins and caches it in the OS temp dir. Node
// cannot import https: URLs, hence the download rather than a bare import.
const THREE_URL = (src.match(/from '(https:\/\/[^']*three[^']*)'/) || [])[1];
if (!THREE_URL) throw new Error('cannot find the three.js CDN URL in main.js');

const cacheDir = join(tmpdir(), 'opencode', 'threecache');
const cacheFile = join(cacheDir, 'three.module.js');
if (!existsSync(cacheFile)) {
  mkdirSync(cacheDir, { recursive: true });
  const res = await fetch(THREE_URL);
  if (!res.ok) throw new Error(`could not fetch three.js for the test: HTTP ${res.status}`);
  writeFileSync(cacheFile, await res.text());
}
const THREE = await import(pathToFileURL(cacheFile).href);

// Pull a function out of main.js by name, brace-matched, so a comment edit
// inside an unrelated function cannot shift the window and silently change what
// is under test.
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

// Constants the fade code reads at module scope.
const consts = ['HOUSE_FADE_OPACITY', 'HOUSE_FADE_IN', 'HOUSE_FADE_OUT', 'HOUSE_FADE_SKIP'];
const constSrc = consts
  .map((c) => src.match(new RegExp(`^const ${c} = .*$`, 'm'))?.[0])
  .filter(Boolean)
  .join('\n');

// Build a harness: a small room, a shared material, and the fade functions.
function harness({ extraMeshes = [], worldState = 'house', selectMode = false } = {}) {
  const group = new THREE.Group();

  // Every plaster surface in the house shares ONE material instance. This is the
  // trap the design has to survive, so the harness reproduces it faithfully.
  const shared = new THREE.MeshStandardMaterial({ color: 0xf0e7d8 });

  const wall = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shared);
    m.position.set(x, y, z);
    m.userData.houseOccluder = true;
    group.add(m);
    return m;
  };

  // Room: 20 x 20, walls at +/-10. The car sits at the origin, the camera starts
  // on the far side of the +X wall.
  const walls = {
    xPos: wall(1, 6, 20, 10, 3, 0),
    xNeg: wall(1, 6, 20, -10, 3, 0),
    zPos: wall(20, 6, 1, 0, 3, 10),
    zNeg: wall(20, 6, 1, 0, 3, -10),
  };
  const extras = [];
  for (const make of extraMeshes) {
    const m = make(shared);
    m.userData.houseOccluder = true;
    group.add(m);
    extras.push(m);
  }

  // Raycasting reads matrixWorld, which the renderer normally refreshes every
  // frame. Nothing has rendered here, so the harness has to do it — otherwise
  // every mesh still has an identity matrix and the ray misses a wall the car is
  // plainly behind.
  group.updateMatrixWorld(true);

  const car = { position: new THREE.Vector3(0, 0, 0) };
  const camera = new THREE.PerspectiveCamera(70, 1.7, 0.1, 1000);
  camera.position.set(15, 3, 0);   // outside, looking back through xPos

  const state = {
    THREE,
    houseWorld: { group },
    worldState: 'house',
    selectMode: false,
    car,
    camera,
    houseFade: null,   // the module-level singleton, created by constSrc + state
  };

  // worldState and selectMode are declared INSIDE the eval'd body as `let`, not
  // passed as parameters, because in main.js they are module-scope bindings that
  // get reassigned at runtime. A frozen parameter would make it impossible to
  // test the house -> city transition, which is exactly the path that has to
  // un-fade the plaster.
  const body = [
    constSrc,
    'let worldState = __worldState;',
    'let selectMode = __selectMode;',
    'const houseFade = {',
    '  ray: new THREE.Raycaster(),',
    '  blocking: new Set(),',
    '  fading: new Set(),',
    '  dir: new THREE.Vector3(),',
    '  right: new THREE.Vector3(),',
    '  upv: new THREE.Vector3(),',
    '  from: new THREE.Vector3(),',
    '  org: new THREE.Vector3(),',
    '  offsets: [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]],',
    '};',
    grab('houseFadeMaterial'),
    grab('stepHouseFade'),
    grab('clearHouseFade'),
    grab('updateHouseFade'),
    'return { updateHouseFade, clearHouseFade, houseFade, shared,',
    '  setWorld: (v) => { worldState = v; }, setSelect: (v) => { selectMode = v; } };',
  ].join('\n');

  const factory = new Function(
    'THREE', 'houseWorld', '__worldState', '__selectMode', 'car', 'camera', 'shared',
    `${body}\n`,
  );
  const api = factory(THREE, state.houseWorld, worldState, selectMode, car, camera, shared);
  return { ...api, group, car, camera, shared, walls, extras, state };
}

const step = (h, n = 240, dt = 1 / 60) => { for (let i = 0; i < n; i++) h.updateHouseFade(dt); };
const op = (mesh) => (mesh.userData.houseFade ? mesh.userData.houseFade.cur : 1);

test('a wall between the lens and the car is faded, and only that wall', () => {
  const h = harness();
  step(h);
  assert.ok(op(h.walls.xPos) < 0.5,
    `the blocking wall stayed opaque (opacity ${op(h.walls.xPos)}) — you still cannot see the car`);
  // The other three walls are not in the line of sight and must be untouched.
  for (const k of ['xNeg', 'zPos', 'zNeg']) {
    assert.equal(op(h.walls[k]), 1,
      `${k} faded even though it is nowhere near the sight line — the whole room dissolves`);
  }
});

test('fading one wall does not fade every surface sharing its material', () => {
  const h = harness();
  step(h);
  assert.ok(op(h.walls.xPos) < 0.5, 'precondition: the blocking wall should be faded');
  // The regression this guards: setting opacity on the SHARED material would make
  // xNeg, zPos and zNeg go see-through at the same instant, since they are the
  // very same material instance.
  assert.equal(h.shared.opacity, 1,
    'the shared material itself was mutated — every wall in the house went see-through together');
  assert.notEqual(h.walls.xPos.material, h.shared,
    'the blocking wall is using the shared material directly, so fading it fades the house');
});

test('a see-through wall stops writing depth', () => {
  // Otherwise the invisible wall still z-culls everything behind it, which is the
  // whole reason the fade exists.
  const h = harness();
  step(h);
  const f = h.walls.xPos.userData.houseFade;
  assert.equal(f.mat.depthWrite, false, 'a faded wall still writes depth, so it hides the car anyway');
  assert.equal(f.mat.transparent, true, 'a faded wall is not marked transparent');
});

test('furniture is faded too, not just walls', () => {
  // The user asked for "any object in the house" — a wardrobe between the lens
  // and the car hides it just as effectively as a wall does.
  const h = harness({
    extraMeshes: [(shared) => {
      const wardrobe = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), shared);
      wardrobe.position.set(4, 1.5, 0);   // between the car and the lens
      return wardrobe;
    }],
  });
  step(h);
  assert.ok(op(h.extras[0]) < 0.5,
    `a wardrobe in the sight line stayed opaque (opacity ${op(h.extras[0])})`);
});

test('the car bodywork is never treated as an occluder', () => {
  // HOUSE_FADE_SKIP exists so a hit right on the car is ignored. Verify the rays
  // actually start clear of the car rather than inside it.
  const h = harness();
  step(h);
  const skip = Number(src.match(/^const HOUSE_FADE_SKIP = ([\d.]+)/m)[1]);
  assert.ok(skip > 0, 'HOUSE_FADE_SKIP is zero, so the car is its own occluder and it blinks out');
});

test('walls fade back to fully solid, and hand the shared material back', () => {
  const h = harness();
  step(h);
  assert.ok(op(h.walls.xPos) < 0.5, 'precondition: the wall should start faded');
  // Move the camera into the room — nothing is in the way any more.
  h.camera.position.set(0, 3, -6);
  step(h);
  assert.equal(op(h.walls.xPos), 1, 'the wall never faded back — the house is permanently see-through');
  assert.equal(h.walls.xPos.material, h.shared,
    'the wall kept its private clone after becoming solid, so clones leak for every wall ever crossed');
  assert.equal(h.walls.xPos.userData.houseFade, null, 'stale fade state left on the mesh');
});

test('leaving the house restores every faded wall', () => {
  const h = harness();
  step(h);
  assert.ok(op(h.walls.xPos) < 0.5, 'precondition: the wall should start faded');
  h.clearHouseFade();
  assert.equal(op(h.walls.xPos), 1, 'leaving the house left a wall transparent');
  assert.equal(h.walls.xPos.material, h.shared, 'leaving the house leaked a cloned material');
  assert.equal(h.houseFade.fading.size, 0, 'the fading set was not emptied, so it grows forever');
});

test('a car that is only PARTLY behind something still clears the view', () => {
  // This is the case a single centre ray gets wrong. The pillar sits just
  // off-axis: the ray down the middle of the car sails past it, so the car looks
  // fine, but the offset rays catch it and the pillar is exactly where the car's
  // flank is. If the offsets are ever dropped the pillar stays solid and half the
  // car stays hidden — which is precisely the bug the player reports.
  const h = harness({
    extraMeshes: [(shared) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), shared);
      pillar.position.set(5, 1, -1.5);   // off the centre line, in the car's path
      return pillar;
    }],
  });
  step(h);
  assert.ok(op(h.extras[0]) < 0.5,
    `a pillar beside the centre line stayed opaque (opacity ${op(h.extras[0])}) — ` +
    'the offset rays are gone, so a partly-hidden car stays partly hidden');
});

test('something hugging the car is not faded — that is the car itself', () => {
  // The rays start on the car, so without HOUSE_FADE_SKIP they can start inside
  // the bodywork and the car fades itself out.
  const h = harness({
    extraMeshes: [(shared) => {
      const ownBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), shared);
      ownBody.position.set(0.5, 1, 0);   // right where the ray starts
      return ownBody;
    }],
  });
  step(h);
  assert.equal(op(h.extras[0]), 1,
    'a mesh inside HOUSE_FADE_SKIP of the car was faded, so the car would fade itself out');
});

test('an untagged mesh in the sight line is left alone', () => {
  // The house builder tags what it builds; anything parented to the house root
  // afterwards is not tagged. The car is the important one — fading it would make
  // the thing you are trying to see disappear.
  const h = harness();
  const decoy = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), h.shared);
  decoy.position.set(5, 1, 0);          // dead centre, directly in the way
  h.group.add(decoy);
  h.group.updateMatrixWorld(true);
  step(h);
  assert.equal(decoy.userData.houseFade, undefined,
    'an untagged mesh was faded, so the car would be faded out from under the player');
  // Precondition: the tagged wall in the same scene did fade, so this is a real
  // discrimination and not the raycast simply failing for everything.
  assert.ok(op(h.walls.xPos) < 0.5, 'precondition: the tagged wall should have faded');
});

test('the fade is skipped outside the house, and in the car showroom', () => {
  // Identical geometry and camera to the passing case above — only the world
  // differs. If the world guard is dropped, walls in the house group would fade
  // while the player is in the city, where the group is not even on screen.
  for (const [label, opts] of [
    ['in the city', { worldState: 'city' }],
    ['in the showroom', { selectMode: true }],
  ]) {
    const h = harness(opts);
    step(h);
    assert.equal(op(h.walls.xPos), 1, `a wall faded while the player was ${label}`);
  }
});

test('the fade clears itself when the player leaves the house', () => {
  // worldState is reassigned at runtime in main.js, and the guard has to un-fade
  // the plaster on the way out — otherwise the house is left see-through and the
  // player sees through its walls in every later visit.
  const h = harness();
  step(h);
  assert.ok(op(h.walls.xPos) < 0.5, 'precondition: the wall should start faded');
  h.setWorld('city');
  h.updateHouseFade(1 / 60);
  assert.equal(op(h.walls.xPos), 1, 'leaving the house left a wall transparent');
  assert.equal(h.walls.xPos.material, h.shared, 'leaving the house leaked a cloned material');
  assert.equal(h.houseFade.fading.size, 0, 'the fading set was not emptied, so it grows forever');
});

test('the showroom also clears the fade', () => {
  const h = harness();
  step(h);
  assert.ok(op(h.walls.xPos) < 0.5, 'precondition: the wall should start faded');
  h.setSelect(true);
  h.updateHouseFade(1 / 60);
  assert.equal(op(h.walls.xPos), 1, 'opening the showroom left a wall transparent');
});
