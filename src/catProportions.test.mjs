// The cat is thin, not a barrel.
//
// This is a guard on proportions, which is the one thing about the cat that a
// reader cannot check by eye without opening the game. It used to be 9 long by
// 5.2 tall by 5.0 WIDE — as tall as it was wide, which reads as a pig no matter
// how many ears and whiskers are hung off it. The fix was the three numbers at
// the top of cat.js: length up, height down, width nearly halved.
//
// So the numbers themselves are asserted, AND the built model is measured. The
// second half matters because every other dimension in cat.js is derived from
// those three: a model that keeps hard-coding a wide barrel would pass a test
// that only read the constants, and that is exactly the failure that was reported
// in the first place.
//
// Run: node --test src/catProportions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = readFileSync(new URL('./cat.js', import.meta.url), 'utf8');

// three comes from a CDN at runtime, so the test fetches the exact build cat.js
// pins and caches it. cat.js is a browser module, so it is evaluated as a patched
// copy in src/ (next to catTemper.js, which it imports relatively) rather than
// imported directly.
const THREE_URL = (SRC.match(/from '(https:\/\/[^']*three[^']*)'/) || [])[1];
if (!THREE_URL) throw new Error('cannot find the three.js CDN URL in cat.js');
const cacheDir = join(tmpdir(), 'opencode', 'threecache');
const cacheFile = join(cacheDir, 'three.module.js');
if (!existsSync(cacheFile)) {
  mkdirSync(cacheDir, { recursive: true });
  const res = await fetch(THREE_URL);
  if (!res.ok) throw new Error(`could not fetch three.js for the test: HTTP ${res.status}`);
  writeFileSync(cacheFile, await res.text());
}
const THREE = await import(pathToFileURL(cacheFile).href);

const patched = SRC.replace(
  /import\s+\*\s+as\s+THREE\s+from\s+'https:[^']*';/,
  `import * as THREE from ${JSON.stringify(pathToFileURL(cacheFile).href)};`
);
assert.ok(!patched.includes('https://cdn'), 'the CDN three import was not swapped out');
const built = new URL('./__cat_under_test.mjs', import.meta.url);
writeFileSync(built, patched);
// The patched copy is a build artefact, not source. Node caches the module, so
// removing it on exit does not affect the tests that already loaded it.
process.on('exit', () => { try { unlinkSync(built); } catch { /* already gone */ } });

const { addCat } = await import(built.href);

// The three dimensions, read out of the source rather than duplicated here. A
// copy would let the two drift, which is the same duplicated-number trap the
// rest of this repo's tests go out of their way to avoid.
function dimension(name) {
  const m = new RegExp(`^const ${name} = ([\\d.]+);`, 'm').exec(SRC);
  assert.ok(m, `cannot find ${name} in cat.js`);
  return Number(m[1]);
}
const LEN = dimension('CAT_LEN');
const HGT = dimension('CAT_HEIGHT');
const WID = dimension('CAT_WIDTH');

// The bounds of a subtree, in the parent's space, from every mesh's geometry
// bounding box pushed through the accumulated local transforms.
function bounds(root) {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  let meshes = 0;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    for (const x of [bb.min.x, bb.max.x]) {
      for (const y of [bb.min.y, bb.max.y]) {
        for (const z of [bb.min.z, bb.max.z]) {
          const v = new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld);
          b.minX = Math.min(b.minX, v.x); b.maxX = Math.max(b.maxX, v.x);
          b.minY = Math.min(b.minY, v.y); b.maxY = Math.max(b.maxY, v.y);
          b.minZ = Math.min(b.minZ, v.z); b.maxZ = Math.max(b.maxZ, v.z);
        }
      }
    }
  });
  b.meshes = meshes;
  b.w = b.maxX - b.minX;
  b.h = b.maxY - b.minY;
  b.l = b.maxZ - b.minZ;
  return b;
}

// Drive the cat awake and let it run, so the pose measured is the standing one.
function standingCat() {
  const cat = addCat({ add() {} }, { spots: [{ x: 0, z: 0 }, { x: 60, z: 60 }] });
  cat.wake();
  for (let i = 0; i < 90; i++) {
    cat.update(1 / 60, { playerPos: { x: 0, y: 0, z: 900 }, playerR: 2.2, blocked: () => false });
  }
  assert.equal(cat.state.mode, 'chase', 'the cat never got up, so the standing pose is untested');
  return cat;
}

test('the cat is tall and narrow, not long and low', () => {
  // This assertion has been through three revisions along with the model, and each
  // one is worth recording because each was a real thing it looked like.
  //
  //   v1  9 long / 5.2 tall / 5.0 wide — as tall as wide. Read as a barrel, or a
  //       pig. Fixed by making the length hugely exceed the height.
  //   v2  12 long / 4.2 tall / 2.9 wide — fixed the fatness, and overcorrected into
  //       a stretched tube or a ferret: three times as long as it was tall, with
  //       stubby legs under a heavy body.
  //   v3  10.4 long / 6.2 tall / 2.5 wide — the current one. A real cat is about
  //       1.5 to 1.8 times as long (chest to tail base) as it is tall at the
  //       shoulder, and that is where these numbers sit.
  //
  // So the length:height ratio is now an UPPER bound as well as a lower one. Too
  // low and it is a barrel again; too high and it is a ferret.
  const ratio = LEN / HGT;
  assert.ok(ratio < 2,
    `CAT_LEN ${LEN} against CAT_HEIGHT ${HGT} is ${ratio.toFixed(2)} to 1; past 2 it ` +
    'reads as a stretched tube rather than a cat');
  assert.ok(ratio > 1.3,
    `CAT_LEN ${LEN} against CAT_HEIGHT ${HGT} is ${ratio.toFixed(2)} to 1; under 1.3 ` +
    'it is a barrel again');
  // Narrower still than before, so the extra height did not just make it fatter.
  assert.ok(WID < HGT * 0.55,
    `CAT_WIDTH ${WID} is not clearly narrower than CAT_HEIGHT ${HGT}; that is a barrel`);
  // And it must not have been fixed by shrinking the whole animal out of the
  // world. It is still a real obstacle: it has to stay bigger than the 4.3 car.
  assert.ok(LEN > 8,
    `CAT_LEN dropped to ${LEN}, which is no longer larger than the car`);
  assert.ok(HGT > 5.5,
    `CAT_HEIGHT dropped to ${HGT}, which is not "taller" in any meaningful sense`);
});

test('most of the cat is leg', () => {
  // This is the number that actually makes it read as a cat. On a real cat the
  // shoulder sits about two thirds of the way up and what you read as "body" is a
  // compact barrel riding high on four long thin limbs. At 62% — which is where
  // this used to sit — the animal was two thirds body and read as a ferret with
  // a heavy middle.
  const hipY = Number(/^const HIP_Y = CAT_HEIGHT \* ([\d.]+);/m.exec(SRC)[1]);
  assert.ok(hipY > 0.66,
    `HIP_Y is only ${(hipY * 100).toFixed(0)}% of the cat's height; over 66% is what ` +
    'makes it stand like a cat rather than crawl');
  // The two segments together must actually span the gap from hip to floor, or the
  // legs are decoration and the barrel is sitting on the ground.
  const upper = Number(/^const UPPER_LEN = CAT_HEIGHT \* ([\d.]+);/m.exec(SRC)[1]);
  const lowerMatch = /^const LOWER_LEN = (?:CAT_HEIGHT \* [\d.]+|HIP_Y - UPPER_LEN);/m.exec(SRC);
  const lowerExpr = lowerMatch ? lowerMatch[0] : '';
  let lower;
  if (lowerExpr.includes('HIP_Y - UPPER_LEN')) {
    const hipYv = Number(/^const HIP_Y = CAT_HEIGHT \* ([\d.]+);/m.exec(SRC)[1]);
    const upperV = Number(/^const UPPER_LEN = CAT_HEIGHT \* ([\d.]+);/m.exec(SRC)[1]);
    lower = hipYv - upperV;
  } else {
    const m2 = /CAT_HEIGHT \* ([\d.]+)/.exec(lowerExpr);
    lower = m2 ? Number(m2[1]) * HGT : Number(/^const LOWER_LEN = ([\d.]+);/m.exec(SRC)[1]);
  }
  assert.ok(Math.abs(hipY - upper - lower) < 1e-9,
    `HIP_Y ${hipY} minus UPPER_LEN ${upper} minus LOWER_LEN ${lower} does not leave the ` +
    'paws on the floor');
  // A cat's lower leg is the longer half — that is what puts the knee high and
  // reads as an animal built to spring.
  assert.ok(lower > upper,
    `UPPER_LEN ${upper} is longer than LOWER_LEN ${lower}; a cat's lower leg is not`);
});

test('the body it actually builds is long, low and narrow', () => {
  // Measured, not declared: every other dimension in the model is derived from
  // the three constants, so this is what catches a model that stops deriving.
  const b = bounds(standingCat().mesh);
  assert.ok(b.meshes > 20, `only ${b.meshes} meshes — the model is truncated`);
  assert.ok(b.w < HGT * 1.45,
    `the standing cat is ${b.w.toFixed(2)} across against a ${HGT} height — it is fat again`);
  assert.ok(b.l > LEN,
    `the cat measures ${b.l.toFixed(2)} long, which is shorter than the ${LEN} it is declared to be`);
});

test('it stands on its feet rather than sinking through the floor', () => {
  // The legs used to overshoot by a whole unit, which on a body that already
  // squashed on sleep read as something squat and heavy standing on nothing.
  const b = bounds(standingCat().mesh);
  assert.ok(b.minY > -0.5 && b.minY < 0.5,
    `the paws are at y=${b.minY.toFixed(2)}; a standing cat's should be on the floor`);
  assert.ok(b.h > LEN * 0.28,
    `it stands only ${b.h.toFixed(2)} tall over a ${b.l.toFixed(2)} body — it is not UP`);
});

test('asleep it lies down, and awake it stands up', () => {
  const cat = addCat({ add() {} }, { spots: [{ x: 0, z: 0 }, { x: 60, z: 60 }] });
  const settled = () => {
    for (let i = 0; i < 60; i++) {
      cat.update(1 / 60, { playerPos: { x: 0, y: 0, z: 900 }, playerR: 2.2, blocked: () => false });
    }
  };
  settled();
  const lying = bounds(cat.mesh).h;
  cat.wake();
  settled();
  const up = bounds(cat.mesh).h;
  assert.ok(up > lying,
    `the cat is the same height asleep (${lying.toFixed(2)}) as it is running (${up.toFixed(2)})`);
});