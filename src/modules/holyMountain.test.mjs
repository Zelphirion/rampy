// Unit tests for the Holy Mountain layout math (hollow snow-capped peak in
// the underground). Run: node --test src/modules/holyMountain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOUNT,
  SLAB_BOUNDS,
  coneRadiusAt,
  roadCenterRadiusAt,
  spiralSegments,
  mountainBlockers,
  mouthFrame,
} from './holyMountain.js';

const EPS = 1e-9;

// Axis-aligned rect vs point, with the rect expanded by `pad` on every side.
function pointInRect(px, pz, r, pad = 0) {
  return Math.abs(px - r.x) <= r.halfW + pad && Math.abs(pz - r.z) <= r.halfD + pad;
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

test('mouth corridor is clear of solid blockers (car radius margin)', () => {
  const CAR = 2.2;
  const { solids } = mountainBlockers();
  const f = mouthFrame();
  for (let di = 13; di <= 26; di += 0.5) {
    const halfOpen = di * Math.sin(MOUNT.archHalf) * 0.35;   // drivable core
    for (const lat of [-halfOpen, 0, halfOpen]) {
      const px = MOUNT.cx + f.dirX * di + (-f.dirZ) * lat;
      const pz = MOUNT.cz + f.dirZ * di + f.dirX * lat;
      for (const r of solids) {
        assert.ok(!pointInRect(px, pz, r, CAR),
          `corridor point d=${di} lat=${lat.toFixed(1)} blocked by rect at (${r.x},${r.z})`);
      }
    }
  }
});

test('chamber interior is reachable from the mouth (only the shrine blocks)', () => {
  const { solids } = mountainBlockers();
  const shrine = solids[solids.length - 1];   // pushed last
  const f = mouthFrame();
  for (let di = 12.6; di >= 4.5; di -= 0.5) {
    const px = MOUNT.cx + f.dirX * di;
    const pz = MOUNT.cz + f.dirZ * di;
    for (const r of solids) {
      if (r === shrine) continue;
      assert.ok(!pointInRect(px, pz, r, 0),
        `path to shrine blocked at d=${di} by rect at (${r.x},${r.z})`);
    }
  }
  // And the shrine itself stops the car before the exact centre.
  assert.ok(pointInRect(MOUNT.cx + f.dirX * 3, MOUNT.cz + f.dirZ * 3, shrine, 0));
});

test('flank ring seals the perimeter except at the mouth', () => {
  const CAR = 2.2;
  const { solids } = mountainBlockers();
  const f = mouthFrame();
  // The AABB ring's scallop valleys guarantee a wall by r≈30 worst-case —
  // well inside the visual base (34), so rock can never be driven through.
  for (let deg = 0; deg < 360; deg += 3) {
    const beta = deg * Math.PI / 180;
    let d = Math.abs(beta - f.betaM);
    while (d > Math.PI) d = Math.PI * 2 - d;
    if (d <= MOUNT.archHalf + 10 * Math.PI / 180) continue;   // the mouth gap
    for (const rad of [27, 29]) {
      const px = MOUNT.cx + rad * Math.cos(beta);
      const pz = MOUNT.cz + rad * Math.sin(beta);
      assert.ok(solids.some((r) => pointInRect(px, pz, r, CAR)),
        `perimeter point β=${deg}° r=${rad} not sealed`);
    }
  }
});

test('summit pad catches the road apron; ceiling has a drivable hole', () => {
  const segs = spiralSegments();
  const apron = segs[segs.length - 1];
  const endX = apron.x + apron.runX * apron.len / 2;
  const endZ = apron.z + apron.runZ * apron.len / 2;
  const { softs } = mountainBlockers();
  const pad = softs[0];
  assert.ok(pointInRect(endX, endZ, pad, 1.6), 'road end misses the summit pad');

  const planks = softs.slice(1);
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
