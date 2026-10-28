// The museum plan, checked without building a single mesh.
//
// Run: node --test src/levels/museum/layout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MUSEUM_HALL, MUSEUM_START, MUSEUM_EXIT, MUSEUM_VESTIBULE, ATRIUM_EDGE, ATRIUM,
  RUNNER, RECEPTION, COAT, PORTAL, EXHIBIT, RAMP, BALCONY, RAMP_UNDER_CLEARANCE,
  museumSurfaceAt, museumOnRamp,
} from './layout.js';

const inside = (x, z, r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

test('the arrival point is on the runner in the second-floor atrium', () => {
  assert.ok(MUSEUM_START.x > MUSEUM_HALL.minX && MUSEUM_START.x < MUSEUM_HALL.maxX);
  assert.ok(MUSEUM_START.z > MUSEUM_HALL.minZ && MUSEUM_START.z < MUSEUM_HALL.maxZ);
  assert.ok(MUSEUM_START.z > ATRIUM_EDGE, 'the car must arrive in the atrium, not the exhibit');
  assert.ok(Math.abs(MUSEUM_START.x) < RUNNER.halfW, 'start is off the crimson runner');
  // Facing north: the portal is straight ahead.
  assert.ok(Math.abs(MUSEUM_START.yaw + Math.PI / 2) < 1e-9);
});

test('the exit is out past the glass vestibule, clear of the arrival point', () => {
  const box = { x0: MUSEUM_EXIT.x0, x1: MUSEUM_EXIT.x1, z0: MUSEUM_EXIT.z0, z1: MUSEUM_EXIT.z1 };
  assert.equal(inside(MUSEUM_START.x, MUSEUM_START.z, box), false,
    'the car would spawn in the exit trigger');
  assert.ok(MUSEUM_EXIT.z0 > MUSEUM_VESTIBULE.z0, 'the exit is inside the vestibule, not beyond it');
  assert.ok(MUSEUM_EXIT.z1 < MUSEUM_VESTIBULE.z1, 'the exit trigger is beyond the glass wall');
});

test('driving straight in passes the desk and reaches the portal', () => {
  // The desk bows into the atrium at x ≈ 94, so the centre lane is clear.
  const deskFront = RECEPTION.cx - RECEPTION.r;
  assert.ok(deskFront > 60, 'the reception desk is too close to the centre lane');
  assert.ok(deskFront < MUSEUM_HALL.maxX, 'the desk is outside the hall');
  // The runner runs from the entrance doors to the portal.
  assert.ok(RUNNER.z1 >= MUSEUM_HALL.maxZ - 2);
  assert.ok(Math.abs(RUNNER.z0 - ATRIUM_EDGE) < 1e-9);
  // The portal is centred on the runner and wide enough for the car.
  assert.equal(PORTAL.z, ATRIUM_EDGE);
  assert.ok(PORTAL.halfW * 2 > 4.4 * 4);
});

test('the entrance is wide enough for the toy car', () => {
  const gap = MUSEUM_HALL.doorGap;
  assert.ok(gap.x1 - gap.x0 > 4.4 * 4, 'entrance is too narrow to drive through');
  assert.ok(gap.top > 12, 'entrance lintel is too low for the museum doors');
});

test('the surface knows the atrium, the ramp and the deep exhibit floor apart', () => {
  // Atrium.
  assert.equal(museumSurfaceAt(0, 100), 0);
  // Balcony, high above the exhibit floor.
  assert.equal(museumSurfaceAt(BALCONY.innerX + 20, -100), 0);
  assert.equal(museumSurfaceAt(-(BALCONY.innerX + 20), -100), 0);
  // North balcony.
  assert.equal(museumSurfaceAt(0, EXHIBIT.northInnerZ - 5), 0);
  // Exhibit floor, in the middle of the void.
  assert.equal(museumSurfaceAt(0, -120), EXHIBIT.floorY);
  assert.equal(museumSurfaceAt(50, -120), EXHIBIT.floorY);
  // The ramp is halfway down at its midpoint.
  const midZ = (RAMP.zTop + RAMP.zBottom) / 2;
  const midY = museumSurfaceAt(0, midZ);
  assert.ok(Math.abs(midY - EXHIBIT.floorY / 2) < 0.001, `ramp midpoint is at ${midY}`);
  // And the landing at the top is level — all the way across, so it opens onto
  // both balconies.
  assert.equal(museumSurfaceAt(0, (RAMP.zTop + ATRIUM_EDGE) / 2), 0);
  assert.equal(museumSurfaceAt(60, (RAMP.zTop + ATRIUM_EDGE) / 2), 0);
  assert.equal(museumSurfaceAt(-60, (RAMP.zTop + ATRIUM_EDGE) / 2), 0);
  // North of that landing, off the ramp, is open void: that is the drop the car
  // takes when it flies off a balcony.
  assert.equal(museumSurfaceAt(60, RAMP.zTop - 4), EXHIBIT.floorY);
  assert.equal(museumSurfaceAt(BALCONY.innerX - 4, RAMP.zTop - 60), EXHIBIT.floorY);
});

test('onRamp is true only on the slope', () => {
  assert.equal(museumOnRamp(0, (RAMP.zTop + RAMP.zBottom) / 2), true);
  assert.equal(museumOnRamp(0, (RAMP.zTop + ATRIUM_EDGE) / 2), false);
  assert.equal(museumOnRamp(RAMP.halfW + 5, 0), false);
});

test('the ramp is a roof as well as a road: a car below it drives under it', () => {
  // A car up on the slope is on the slope, whichever way you ask.
  const z = (RAMP.zTop + RAMP.zBottom) / 2;
  const onIt = museumSurfaceAt(0, z);
  assert.ok(onIt > EXHIBIT.floorY + 10, 'the midpoint of the ramp should be well up in the air');
  assert.equal(museumSurfaceAt(0, z, onIt), onIt);
  // A car down in the hall, well below the slope, is on the hall floor.
  assert.equal(museumSurfaceAt(0, z, EXHIBIT.floorY), EXHIBIT.floorY);
  // Right at the foot there is no space under it — the slope IS the floor — so
  // even a floor-level car is put on the ramp there.
  assert.equal(museumSurfaceAt(0, RAMP.zBottom + 1, EXHIBIT.floorY), museumSurfaceAt(0, RAMP.zBottom + 1));
  // And the clearance is a few units, not the whole height of the hall.
  assert.ok(RAMP_UNDER_CLEARANCE > 1 && RAMP_UNDER_CLEARANCE < 10);
});

test('the exhibit hall is a 336 square, and the lobby is the narrow wing', () => {
  // The open void is 336 across and 336 deep — a perfect square.
  assert.equal(EXHIBIT.innerX * 2, 336);
  assert.equal(ATRIUM_EDGE - EXHIBIT.northInnerZ, 336);
  // The hall is the wide part of the building; the lobby is the narrow stem.
  const exhibitDepth = ATRIUM_EDGE - EXHIBIT.northZ;
  const totalDepth = MUSEUM_HALL.maxZ - MUSEUM_HALL.minZ;
  assert.ok(exhibitDepth / totalDepth > 0.7, 'the exhibit hall should dominate the level');
  assert.ok(BALCONY.innerX * 2 < MUSEUM_HALL.maxX - MUSEUM_HALL.minX);
  assert.ok(ATRIUM.maxX - ATRIUM.minX < BALCONY.innerX * 2, 'the lobby is not the wide part');
  assert.ok(ATRIUM.minX >= MUSEUM_HALL.minX && ATRIUM.maxX <= MUSEUM_HALL.maxX,
    'the lobby wing must sit inside the hall envelope');
  assert.ok(RAMP.zTop > RAMP.zBottom, 'the ramp must run downhill from the atrium');
});

test('the coat check is on the west side, opposite the desk', () => {
  assert.ok(COAT.x1 < 0, 'the coat check should be on the west');
  assert.ok(COAT.z0 >= ATRIUM_EDGE && COAT.z1 <= MUSEUM_HALL.maxZ);
  assert.ok(RECEPTION.cx - RECEPTION.r > 0, 'the desk should be on the east');
});
