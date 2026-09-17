// Unit tests for the Holy Mountain layout math (hollow snow-capped peak in
// the underground). Run: node --test src/modules/holyMountain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOUNT,
  SLAB_BOUNDS,
  coneRadiusAt,
  coneHeightAt,
  coneSkinSegments,
  roadCenterRadiusAt,
  spiralSegments,
  mountainBlockers,
} from './holyMountain.js';

const EPS = 1e-9;

// Axis-aligned rect vs point, with the rect expanded by `pad` on every side.
function pointInRect(px, pz, r, pad = 0) {
  return Math.abs(px - r.x) <= r.halfW + pad && Math.abs(pz - r.z) <= r.halfD + pad;
}

// Is (px, pz) inside the sloped-plank footprint of a ramp def (the same test
// ugRampInfoAt uses, without the height gate)?
function onRampFootprint(px, pz, def) {
  const dx = px - def.x, dz = pz - def.z;
  const along = dx * def.runX + dz * def.runZ;
  const perp = -dx * def.runZ + dz * def.runX;
  return along >= -def.len / 2 && along <= def.len / 2 && Math.abs(perp) < def.width / 2;
}

test('cone profile runs baseR -> padR linearly and clamps', () => {
  assert.equal(coneRadiusAt(0), MOUNT.baseR);
  assert.equal(coneRadiusAt(MOUNT.peakY), MOUNT.padR);
  const mid = coneRadiusAt(MOUNT.peakY / 2);
  assert.ok(Math.abs(mid - (MOUNT.baseR + MOUNT.padR) / 2) < EPS);
  assert.equal(coneRadiusAt(-5), MOUNT.baseR);
  assert.equal(coneRadiusAt(999), MOUNT.padR);
});

test('road hugs the cone with clearance + half width', () => {
  for (let y = 0; y <= MOUNT.peakY; y += 2) {
    assert.ok(Math.abs(roadCenterRadiusAt(y) - (coneRadiusAt(y) + MOUNT.roadHalfW + MOUNT.roadClear)) < EPS);
  }
});

test('spiral road is continuous and lands exactly on the summit height', () => {
  const segs = spiralSegments();
  const total = Math.round(MOUNT.revs * MOUNT.segsPerRev);
  assert.equal(segs.length, total + 1);   // +1: the flat summit apron
  let py = 0;
  // Walk the wedge start/end edges: each def's surface at its far edge must
  // equal the next def's surface at its near edge (no lips or gaps).
  segs.forEach((s, i) => {
    assert.ok(Math.abs(s.baseY - py) < EPS, `seg ${i} baseY ${s.baseY} != ${py}`);
    py = s.baseY + s.height;
  });
  assert.ok(Math.abs(py - MOUNT.peakY) < 0.1, `road tops out at ${py}, want ${MOUNT.peakY}`);
  // The apron is the last, near-flat bridge onto the pad.
  const apron = segs[segs.length - 1];
  assert.ok(apron.height < 0.2, 'apron must be flat');
});

test('every road segment is climbable (slope under 13 degrees)', () => {
  for (const s of spiralSegments()) {
    const slope = Math.atan2(s.height, s.len) * 180 / Math.PI;
    assert.ok(slope > 0 && slope < 13, `slope ${slope.toFixed(1)} deg`);
  }
});

test('road start sits at floor level on the east side, facing CCW', () => {
  const s0 = spiralSegments()[0];
  assert.ok(Math.abs(s0.baseY) < EPS);
  // Start point is due east of the axis.
  assert.ok(s0.z > MOUNT.cz, 'road begins north of centre as it curls CCW');
  assert.ok(s0.x > MOUNT.cx, 'road begins east of centre');
});

test('road and colliders stay inside the cavern slab', () => {
  for (const s of spiralSegments()) {
    const exX = Math.abs(s.runZ) * MOUNT.roadHalfW + Math.abs(s.runX) * s.len / 2;
    const exZ = Math.abs(s.runX) * MOUNT.roadHalfW + Math.abs(s.runZ) * s.len / 2;
    assert.ok(s.x - exX > SLAB_BOUNDS.minX && s.x + exX < SLAB_BOUNDS.maxX, 'x bounds');
    assert.ok(s.z - exZ > SLAB_BOUNDS.minZ && s.z + exZ < SLAB_BOUNDS.maxZ, 'z bounds');
  }
  const { solids, softs } = mountainBlockers();
  for (const r of [...solids, ...softs]) {
    assert.ok(r.x - r.halfW >= SLAB_BOUNDS.minX && r.x + r.halfW <= SLAB_BOUNDS.maxX, 'rect x bounds');
    assert.ok(r.z - r.halfD >= SLAB_BOUNDS.minZ && r.z + r.halfD <= SLAB_BOUNDS.maxZ, 'rect z bounds');
  }
});

test('the cone base is solid to grounded cars but never fences off the climb', () => {
  // There is no cave mouth any more, so the ONLY way in is the summit skylight
  // drop and the only way out is the staged ejection. A GROUNDED car driving at
  // the mountain must hit rock (the base skirt), not ghost through it. But the
  // skirt must never deadlock the drivable face: a car riding the skin is
  // `elevated` (car.y > 0.5) once it is inside rElev, and `elevated` skips
  // solids in main.js — so every box must stop a grounded car only at a radius
  // where a riding car would already be elevated.
  const { solids } = mountainBlockers();
  // Radius where the cone surface reaches the 0.5 elevation threshold:
  // coneHeightAt(r) = 0.5  ->  r = baseR - 0.5 * (baseR - padR) / peakY.
  const rElev = MOUNT.baseR - 0.5 * (MOUNT.baseR - MOUNT.padR) / MOUNT.peakY;
  const PLAYER_R = 2.2;
  const STEPS = 720;
  for (let k = 0; k < STEPS; k++) {
    const phi = (k / STEPS) * Math.PI * 2;
    const dx = Math.cos(phi), dz = Math.sin(phi);
    // Outermost solid along a ground ray: where the skirt's outer face is.
    let faceR = null;
    for (let r = MOUNT.baseR; r > 18; r -= 0.1) {
      const px = MOUNT.cx + r * dx, pz = MOUNT.cz + r * dz;
      if (solids.some((s) => pointInRect(px, pz, s, 0))) { faceR = r; break; }
    }
    assert.ok(faceR !== null,
      `no base solid at azimuth ${(phi * 180 / Math.PI).toFixed(1)}° — a grounded car can drive into the mountain`);
    // The car center stops ~PLAYER_R outside the box face.
    assert.ok(faceR + PLAYER_R < rElev,
      `base skirt deadlocks the climb at ${(phi * 180 / Math.PI).toFixed(1)}°: stops at ${(faceR + PLAYER_R).toFixed(2)}, elevation radius is ${rElev.toFixed(2)}`);
  }
});

test('cone skin tiles the whole face with no seams', () => {
  const skin = coneSkinSegments();
  assert.ok(skin.length > 0, 'skin must produce ramps');
  const BANDS = 12, STEPS = 36;
  for (let b = 0; b < BANDS; b++) {
    const y0 = b * MOUNT.peakY / BANDS;
    const r0 = coneRadiusAt(y0), r1 = coneRadiusAt(y0 + MOUNT.peakY / BANDS);
    for (let k = 0; k < STEPS; k++) {
      const phi = (k / STEPS) * Math.PI * 2;
      const r = (r0 + r1) / 2;
      const px = MOUNT.cx + r * Math.cos(phi);
      const pz = MOUNT.cz + r * Math.sin(phi);
      const hit = skin.find((s) => onRampFootprint(px, pz, s));
      assert.ok(hit, `skin seam at band ${b} φ=${(phi * 180 / Math.PI).toFixed(1)}° r=${r.toFixed(1)}`);
      // The ramp's surface under the sample matches the cone profile (a sloped
      // plank standing on the real cone surface, not a phantom floor).
      const along = (px - hit.x) * hit.runX + (pz - hit.z) * hit.runZ;
      const surfY = hit.baseY + hit.height * (along + hit.len / 2) / hit.len;
      const wantY = coneHeightAt(r);
      assert.ok(Math.abs(surfY - wantY) < 1.5, `skin off-cone at b=${b} φ=${(phi * 180 / Math.PI).toFixed(1)}°: got ${surfY.toFixed(2)} want ~${wantY.toFixed(2)}`);
    }
  }
});

test('cone skin wraps the full face and fits the slab', () => {
  for (const s of coneSkinSegments()) {
    // Driving collider (same AABB the level registers) stays inside the slab.
    const c = s.collider;
    assert.ok(c.x - c.halfW >= SLAB_BOUNDS.minX && c.x + c.halfW <= SLAB_BOUNDS.maxX, `skin x bounds at (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(c.z - c.halfD >= SLAB_BOUNDS.minZ && c.z + c.halfD <= SLAB_BOUNDS.maxZ, `skin z bounds at (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
  }
});

test('summit skylight rim catches the road apron; its centre stays open', () => {
  const segs = spiralSegments();
  const apron = segs[segs.length - 1];
  const endX = apron.x + apron.runX * apron.len / 2;
  const endZ = apron.z + apron.runZ * apron.len / 2;
  const { softs } = mountainBlockers();
  const rim = softs.slice(0, 4);                      // the summit rim ring
  assert.equal(rim.length, 4);
  assert.ok(rim.some((r) => pointInRect(endX, endZ, r, 1.6)), 'road end misses the summit rim');

  const outer = MOUNT.padR + 0.4;                     // 9.9
  // Outer edge of the rim is landable…
  assert.ok(rim.some((r) => pointInRect(MOUNT.cx + outer - 1, MOUNT.cz, r, 0)));
  assert.ok(rim.some((r) => pointInRect(MOUNT.cx, MOUNT.cz - outer + 1, r, 0)));
  // …the centre is the OPEN skylight hole you drop through.
  assert.ok(!rim.some((r) => pointInRect(MOUNT.cx, MOUNT.cz, r, 0)), 'skylight hole must stay open');
  assert.ok(!rim.some((r) => pointInRect(MOUNT.cx + MOUNT.skylightR - 0.1, MOUNT.cz, r, 0)),
    'skylight hole must be clear of the rim ring');

  const planks = softs.slice(4);                      // chamber ceiling ring
  assert.equal(planks.length, 4);
  // Centre of the roof is OPEN — that's the oculus you drop through.
  assert.ok(!planks.some((r) => pointInRect(MOUNT.cx + 5, MOUNT.cz + 5, r, 0)),
    'oculus hole must stay open');
  // The ring around it is landable.
  assert.ok(planks.some((r) => pointInRect(MOUNT.cx + 12, MOUNT.cz, r, 0)));
  assert.ok(planks.some((r) => pointInRect(MOUNT.cx, MOUNT.cz - 12, r, 0)));
});

test('all soft surfaces are marked soft and solids are not', () => {
  const { solids, softs } = mountainBlockers();
  for (const r of solids) assert.ok(!r.soft);
  for (const r of softs) assert.ok(r.soft);
});
