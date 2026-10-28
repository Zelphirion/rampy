// The two-point terrain pitch — the rule that tips a car's body over every
// drivable slope in the game (the outer belt's hills, the beach shelf, the ramp
// world's hills, the farm's mound).
//
// Two things are pinned here. First the sign and the magnitude of the maths, so
// "nose up climbing, nose down dropping" cannot silently invert. Second the
// WIRING: Player 1's physics block and the split-screen twin's condensed step
// must both feed their heightfield through this one helper, because a hill that
// tilts one car and not the other is the bug this file exists to prevent.
//
// Run: node --test src/modules/terrainTilt.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainPitchAt, CAR_HALF_BASE } from './terrainTilt.js';
import { CITY_HILLS, natureHillHeightAt } from './cityHills.js';

const flat = () => 0;

const level = (v) => Math.abs(v) === 0;   // -0 is still level

test('flat ground leaves the body level', () => {
  assert.ok(level(terrainPitchAt(0, 0, 1, 0, flat)));
  assert.ok(level(terrainPitchAt(12.5, -40, 0, 1, flat)));
});

test('climbing tips the nose up, descending tips it down', () => {
  const ramp = (x, z) => z * 0.5;             // rises with +Z, 26.6 degrees
  const climbing = terrainPitchAt(0, 0, 0, 1, ramp);
  const descending = terrainPitchAt(0, 0, 0, -1, ramp);
  // Cars are modelled nose-first along -X, so a nose-up attitude is a NEGATIVE
  // rotation about local Z.
  assert.ok(climbing < 0, `climbing north gave ${climbing}, which is nose-DOWN`);
  assert.ok(descending > 0, `descending north gave ${descending}, which is nose-UP`);
  assert.ok(Math.abs(climbing + descending) < 1e-12, 'reversing heading must mirror the pitch');
  assert.ok(Math.abs(Math.abs(climbing) - Math.atan(0.5)) < 1e-12,
    'the pitch is not the slope angle of the chord it sampled');
});

test('the sample follows the car heading, not the world axes', () => {
  const bank = (x) => x * 0.4;                // slope runs along X only
  const upTheBank = terrainPitchAt(0, 0, 1, 0, bank);   // heading +X (uphill)
  const alongIt = terrainPitchAt(0, 0, 0, 1, bank);     // heading +Z (level)
  assert.ok(Math.abs(upTheBank) > 0.3, 'driving straight up a bank did not tilt the car');
  assert.ok(upTheBank < 0, 'heading up the bank must be nose-up');
  assert.ok(level(alongIt), 'driving along the contour must stay level');
});

test('the wheelbase sets the baseline, and a linear slope reads the same', () => {
  const ramp = (x, z) => z * 0.3;
  const short = terrainPitchAt(0, 0, 0, 1, ramp, 0.8);
  const long = terrainPitchAt(0, 0, 0, 1, ramp, 4);
  assert.ok(Math.abs(short - long) < 1e-12);
  assert.equal(CAR_HALF_BASE, 1.35, 'the game\'s cars are modelled with wheels at x = +/-1.35');
});

test('every outer-belt hill tips a car driving at it, and levels it on the crown', () => {
  for (const hill of CITY_HILLS) {
    // Halfway up the south face, heading north: the steepest part of the dome.
    const z = hill.z - hill.r * 0.5;
    const climbing = terrainPitchAt(hill.x, z, 0, 1, natureHillHeightAt);
    const descending = terrainPitchAt(hill.x, z, 0, -1, natureHillHeightAt);
    assert.ok(climbing < -0.3,
      `the hill at (${hill.x}, ${hill.z}) only tipped the car ${climbing.toFixed(3)} rad climbing`);
    assert.ok(descending > 0.3,
      `the hill at (${hill.x}, ${hill.z}) only tipped the car ${descending.toFixed(3)} rad dropping`);
    // Flat at the crown, so a car parked on top is not spiked nose-up.
    assert.ok(level(terrainPitchAt(hill.x, hill.z, 0, 1, natureHillHeightAt)));
    // ...and clear of the hill it is flat ground again.
    const off = hill.z - hill.r - 2;
    assert.ok(level(terrainPitchAt(hill.x, off, 0, 1, natureHillHeightAt)));
  }
});

test('Player 1 and Player 2 both read the hill slope through the shared helper', () => {
  const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

  // P1: the beach / city-hill branch feeds its heightfield into the helper.
  assert.match(src,
    /terrainPitch = terrainPitchAt\(car\.position\.x, car\.position\.z, direction\.x, direction\.z, heightAt\)/,
    'Player 1 no longer pitches its body with terrainPitchAt');

  // P2: the twin builds one sampler per world and reads it along its own heading.
  assert.match(src,
    /p\.terrainPitch2 = terrainPitchAt\(carTwo\.position\.x, carTwo\.position\.z,\s*_sp2Dir\.x, _sp2Dir\.z, pitchSurface2\)/,
    'Player 2 no longer samples a terrain pitch for its body');
  assert.match(src,
    /if \(natureHillHeightAt\(carTwo\.position\.x, carTwo\.position\.z\) > 0\) pitchSurface2 = natureHillHeightAt/,
    'the twin has no hill sampler in the city, so it stays level over the outer-belt hills');
  assert.match(src, /pitchSurface2 = beachGroundOffsetAt/, 'the twin has no beach sampler');
  assert.match(src, /pitchSurface2 = terrainHeightAt/, 'the twin has no ramp-world hill sampler');

  // ...and the attitude block applies that sample in every world, not just the farm.
  assert.match(src, /else if \(p\.terrainPitch2 !== undefined && !j2\.inAir\)/,
    'the twin\'s terrain pitch is still gated to the cornfield');
});
