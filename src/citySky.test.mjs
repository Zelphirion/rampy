// Unit tests for the city's bright daylight sky: colour, drifting clouds and
// the occasional bird flock.
// Run: node --import ./src/objects/nodeShims.mjs --test src/citySky.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CITY_SKY, buildCitySky } from './citySky.js';

test('sky and haze are bright, cheerful and lighter than the old night sky', () => {
  const sky = new THREE.Color(CITY_SKY.color);
  const haze = new THREE.Color(CITY_SKY.fogColor);
  // The old city sky was 0x07101c (very dark). A daytime sky is dominated by
  // its blue/green channels and is overall much brighter.
  assert.ok(sky.r + sky.g + sky.b > 1.5, 'sky colour is not bright');
  assert.ok(sky.b >= sky.r && sky.b >= sky.g, 'sky colour is not blue');
  assert.ok(haze.r + haze.g + haze.b > sky.r + sky.g + sky.b, 'haze should be paler than the sky');
  assert.ok(CITY_SKY.fogDensity < 0.01, 'haze is too thick for a sunny day');
});

test('builds a full sky of fluffy clouds high above the city', () => {
  const scene = new THREE.Scene();
  const sky = buildCitySky(scene, { seed: 1 });
  assert.equal(sky.clouds.length, CITY_SKY.cloudCount);
  assert.ok(sky.root.parent === scene);

  for (const cloud of sky.clouds) {
    assert.ok(cloud.children.length >= 5, 'a cloud should be a clump of puffs');
    assert.ok(cloud.position.y >= CITY_SKY.cloudMinY, 'cloud is too low');
    for (const puff of cloud.children) {
      assert.equal(puff.castShadow, false);
      assert.equal(puff.receiveShadow, false);
      assert.ok(puff.scale.y < puff.scale.x, 'puffs should be flattened, not balls');
    }
  }
});

test('clouds drift and wrap around instead of leaving a gap in the sky', () => {
  const sky = buildCitySky(new THREE.Scene(), { seed: 2 });
  const cloud = sky.clouds[0];
  const x0 = cloud.position.x;
  sky.update(1, 0);
  assert.notEqual(cloud.position.x, x0, 'cloud did not drift');

  cloud.position.x = cloud.userData.wrapHi + 10;
  sky.update(0, 0);
  assert.ok(cloud.position.x <= cloud.userData.wrapHi, 'cloud did not wrap at the east edge');

  cloud.position.x = cloud.userData.wrapLo - 10;
  sky.update(0, 0);
  assert.ok(cloud.position.x >= cloud.userData.wrapLo, 'cloud did not wrap at the west edge');
});

test('flocks start hidden, then appear, flap and leave before returning later', () => {
  const sky = buildCitySky(new THREE.Scene(), { seed: 3 });
  assert.equal(sky.flocks.length, CITY_SKY.flockCount);
  assert.ok(sky.flocks.every((f) => !f.active && !f.group.visible), 'flocks should start hidden');

  const flock = sky.flocks[0];
  let elapsed = 0;
  for (let i = 0; i < 400 && !flock.active; i++) {
    elapsed += 0.1;
    sky.update(0.1, elapsed);
  }
  assert.ok(flock.active, 'first flock never appeared');
  assert.ok(flock.group.visible);
  assert.ok(flock.baseY > 30, 'birds should fly well above the rooftops');

  const wing = flock.birds[0].userData.right;
  const flap0 = wing.rotation.z;
  sky.update(0.05, (elapsed += 0.05));
  assert.notEqual(wing.rotation.z, flap0, 'wings should flap');

  // The flock crosses the city and disappears; it must not stay up forever.
  for (let i = 0; i < 800 && flock.active; i++) {
    elapsed += 0.1;
    sky.update(0.1, elapsed);
  }
  assert.equal(flock.active, false, 'flock never left');
  assert.equal(flock.group.visible, false);
  assert.ok(flock.timer >= CITY_SKY.flockMinGap, 'flock should wait before returning');
});
