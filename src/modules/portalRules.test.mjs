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
  const building = { x: 56, z: 20, w: 14, d: 14, h: 10 };
  assert.equal(isInsideLevitationHall(56, 20, building, 9), true);
  assert.equal(isInsideLevitationHall(70, 20, building, 9), false);
  assert.equal(isStillWithinLevitationHall(70, 20, building), false);
});

test('mine dive trigger works for the tunnel lip', () => {
  const portal = { triggerX: -55, triggerXHalf: 2.2, triggerZ: 42 };
  assert.equal(isInMineDiveTrigger(-55, 43, portal), true);
  assert.equal(isInMineDiveTrigger(-55, 41, portal), false);
});

test('underground return zone matches the tunnel foot', () => {
  assert.equal(isInUndergroundReturnZone(0, 0, 0, 0, 8), true);
  assert.equal(isInUndergroundReturnZone(0, 9, 0, 0, 8), false);
});
