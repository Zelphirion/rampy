import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markerLayerFor, cameraSeesMarkerOf, markerIndexesVisibleTo } from './splitMarkers.js';

test("P1's tag lives on the layer only P2's camera enables", () => {
  assert.equal(markerLayerFor(0), 2);
  assert.equal(cameraSeesMarkerOf(0), 2);
  assert.deepEqual(markerIndexesVisibleTo(1), [0]);
});

test("P2's tag lives on the layer only P1's camera enables", () => {
  assert.equal(markerLayerFor(1), 1);
  assert.equal(cameraSeesMarkerOf(1), 1);
  assert.deepEqual(markerIndexesVisibleTo(0), [1]);
});

test('each viewport sees exactly the OTHER car, never its own', () => {
  assert.deepEqual(markerIndexesVisibleTo(0), [1]);
  assert.deepEqual(markerIndexesVisibleTo(1), [0]);
});