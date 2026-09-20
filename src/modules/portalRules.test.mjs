import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInVortexReturnZone,
  isInsideLevitationHall,
  isStillWithinLevitationHall,
  isInMineDiveTrigger,
  isInUndergroundReturnZone,
} from './portalRules.js';

test('vortex return triggers inside its radius', () => {
  assert.equal(isInVortexReturnZone(2, 0, 0, 0, 10), true);
  assert.equal(isInVortexReturnZone(15, 0, 0, 0, 10), false);
});

test('levitation hall logic matches the building trigger', () => {
  const building = { x: 56, z: 27, w: 28, d: 28, h: 20 };
  assert.equal(isInsideLevitationHall(56, 27, building, 19), true);
  // x=70 is past the inner hall box (|dx| 14 > 14-0.5) but still within the
  // loose +1.5 margin; x=72 clears even the loose margin.
  assert.equal(isInsideLevitationHall(70, 20, building, 9), false);
  assert.equal(isStillWithinLevitationHall(70, 20, building), true);
  assert.equal(isStillWithinLevitationHall(72, 20, building), false);
});

test('mine dive trigger is bounded inside the open pit', () => {
  const portal = { triggerX: -55, triggerXHalf: 2.2, triggerZ: 34, triggerZ1: 44 };
  assert.equal(isInMineDiveTrigger(-55, 34.1, portal), true);   // inside the mouth
  assert.equal(isInMineDiveTrigger(-55, 43.9, portal), true);   // open-pit back wall
  assert.equal(isInMineDiveTrigger(-55, 33.9, portal), false);  // before the lip
  // The tunnel crown (z > 44) is sealed meadow — the grass behind/over the
  // shaft, reachable without any dive — must never trigger.
  assert.equal(isInMineDiveTrigger(-55, 44, portal), false);
  assert.equal(isInMineDiveTrigger(-55, 50, portal), false);
  assert.equal(isInMineDiveTrigger(-55, 60, portal), false);
});

test('underground return zone matches the tunnel foot', () => {
  assert.equal(isInUndergroundReturnZone(0, 0, 0, 0, 8), true);
  assert.equal(isInUndergroundReturnZone(0, 9, 0, 0, 8), false);
});
