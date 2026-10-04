// Tests for the car/building yaw conventions. Run: node --test src/modules/heading.test.mjs
//
// These exist because the mismatch is silent. Nothing throws when the house
// exit uses the building's own yaw — the car just appears facing sideways out
// of the garage, which reads as a placement bug in main.js and sends you
// hunting through the wrong file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carForward, buildingFront, outwardYaw } from './heading.js';

const EPS = 1e-9;
// The four facade orientations the city places buildings at.
const FACINGS = { E: 0, S: Math.PI / 2, W: Math.PI, N: 3 * Math.PI / 2 };

test('outwardYaw points the car straight out of the building front', () => {
  for (const [name, yaw] of Object.entries(FACINGS)) {
    const fwd = carForward(outwardYaw(yaw));
    const front = buildingFront(yaw);
    // The two vectors must be parallel and pointing the same way.
    const dot = fwd.x * front.x + fwd.z * front.z;
    assert.ok(Math.abs(dot - 1) < EPS,
      `${name}-facing garage: car forward (${fwd.x}, ${fwd.z}) vs building front (${front.x}, ${front.z})`);
  }
});

test('the building yaw itself is NOT the outward heading', () => {
  // The regression guard. This is the exact mistake: reusing the building yaw
  // and getting a car that comes out at 90 degrees to the door.
  for (const [name, yaw] of Object.entries(FACINGS)) {
    const fwd = carForward(yaw);
    const front = buildingFront(yaw);
    const dot = fwd.x * front.x + fwd.z * front.z;
    assert.ok(Math.abs(dot) < EPS,
      `${name}-facing garage: building yaw is unexpectedly already the outward heading`);
  }
});

test('an east-facing garage sends the car out along +Z', () => {
  // Concrete check on the real placement used for the suburban garage, so a
  // change to either convention has a visible, specific failure.
  const fwd = carForward(outwardYaw(FACINGS.E));
  assert.ok(Math.abs(fwd.x) < EPS && Math.abs(fwd.z - 1) < EPS,
    `expected (0, 1), got (${fwd.x}, ${fwd.z})`);
});

test('car forward is a unit vector for every heading', () => {
  for (let i = 0; i < 32; i++) {
    const ry = (i / 32) * Math.PI * 2;
    const f = carForward(ry);
    assert.ok(Math.abs(Math.hypot(f.x, f.z) - 1) < EPS, `heading ${ry} gave a non-unit forward`);
  }
});
