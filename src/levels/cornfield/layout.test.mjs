// Pure-logic tests for the cornfield level. These import layout.js only — the
// THREE-bearing index.js is deliberately never touched here (it pulls three off
// a CDN and would fail to resolve under node --test).
//
// Run: node --test src/levels/cornfield/layout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORN_GROUND, CORN_SPAWN, CORN_RETURN,
  BARN, BARN_RAMP, SILO, CORNFIELD_RECT, PUMPKIN_PATCH, CORN,
  ORCHARD, APPLE_TREE, SQUIRREL, TRACTOR, BARREL_STACKS,
  HILL, FARM_TRUCK, FARM_BOUNDS, BRICK_WALL, WATER_TOWER, ROLLING,
  spiralRampSegments, barnColliders, siloColliders, cornGrid,
  shouldKnockStalk, stepPumpkin, stepBarrel, PUMPKIN_VINE_BREAK,
  orchardGrid, squirrelThrowHits, barrelPyramid,
  hillProfileY, hillShoulderY, HILL_PROFILE_STEPS, HILL_SHOULDER_END_Y,
  hillRamp, hillHeightAt, plateauTopAt,
  hillColliders, farmBoundsColliders, FARM_WALL_TOP,
  PASTURE, PASTURE_FENCE_H, BULL, pastureAt,
  pastureFenceColliders, pastureFenceBayDefs,
  RIVER, riverAt, riverFlowAt, riverSurfaceY, riverWallColliders,
  MILL, millColliders, FARM_HOUSE, farmHouseColliders,
} from './layout.js';

// ---- Spawn / return ---------------------------------------------------------

test('the spawn sits south of the field facing north into the rows', () => {
  assert.equal(CORN_GROUND, 0);
  assert.equal(CORN_SPAWN.yaw, Math.PI / 2);
  assert.ok(CORN_SPAWN.z < CORNFIELD_RECT.z0, 'spawn must start clear of the corn');
  assert.ok(CORN_RETURN.z < CORN_SPAWN.z, 'the way home is behind the spawn');
});

// ---- Spiral ramp chain ------------------------------------------------------

test('spiralRampSegments lays an unbroken chain of the requested length', () => {
  const defs = spiralRampSegments({ cx: 0, cz: 0, startAngle: 0, r: 3.2, y0: 0, y1: 12, turns: 3, segsPerTurn: 20 });
  assert.equal(defs.length, 60);

  for (const d of defs) {
    assert.ok(Math.abs(Math.hypot(d.runX, d.runZ) - 1) < 1e-9, 'run vector must be unit length');
    assert.ok(d.len > 0);
    assert.equal(d.width, 3);
    assert.equal(d.boost, 0);
  }
});

test('consecutive spiral segments meet end-to-start with no gap', () => {
  const defs = spiralRampSegments({ cx: 5, cz: -7, startAngle: 1.1, r: 4, y0: 2, y1: 9, turns: 2.5, segsPerTurn: 16 });
  const start = (d) => ({ x: d.x - (d.runX * d.len) / 2, z: d.z - (d.runZ * d.len) / 2, y: d.baseY });
  const end = (d) => ({ x: d.x + (d.runX * d.len) / 2, z: d.z + (d.runZ * d.len) / 2, y: d.baseY + d.height });
  for (let i = 1; i < defs.length; i++) {
    const a = end(defs[i - 1]);
    const b = start(defs[i]);
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9, `x/z break at ${i}`);
    assert.ok(Math.abs(a.y - b.y) < 1e-9, `height break at ${i}`);
  }
});

test('the spiral climbs evenly from y0 to y1', () => {
  const defs = spiralRampSegments({ cx: 0, cz: 0, y0: 1, y1: 13, turns: 2, segsPerTurn: 18 });
  assert.equal(defs[0].baseY, 1);
  const last = defs[defs.length - 1];
  assert.ok(Math.abs(last.baseY + last.height - 13) < 1e-9, 'must top out exactly at y1');
  const step = defs[0].height;
  for (const d of defs) assert.ok(Math.abs(d.height - step) < 1e-9, 'each segment climbs the same amount');
});

// ---- Colliders --------------------------------------------------------------

test('barn walls carry top = wallH so a loft-height car is contained', () => {
  const cols = barnColliders();
  assert.equal(cols.length, 5);
  for (const c of cols) {
    assert.equal(c.top, BARN.wallH);
    assert.equal(c.h, BARN.wallH);
  }
});

test('the barn south wall is split around a drivable doorway', () => {
  const south = barnColliders().filter((c) => Math.abs(c.z - (BARN.z - BARN.halfD)) < 1e-9);
  assert.equal(south.length, 2);
  // Nothing may cover the doorway span x in [doorX-doorHalf, doorX+doorHalf].
  for (const c of south) {
    const x0 = c.x - c.halfW, x1 = c.x + c.halfW;
    assert.ok(x1 <= BARN.doorX - BARN.doorHalf + 1e-9 || x0 >= BARN.doorX + BARN.doorHalf - 1e-9,
      `wall segment [${x0}, ${x1}] intrudes on the doorway`);
  }
  // The loft ramp runs up the EAST side wall, deliberately clear of the doorway
  // it used to line up with: it starts in the south-east corner, climbs north
  // (+Z) to the back-half loft, and never crosses the door opening.
  assert.ok(BARN_RAMP.x > BARN.x && BARN_RAMP.x < BARN.x + BARN.halfW,
    'ramp hugs the east side of the barn');
  assert.ok(BARN_RAMP.x - BARN_RAMP.width / 2 >= BARN.doorX + BARN.doorHalf,
    'ramp stands clear of the doorway');
  assert.equal(BARN_RAMP.runX, 0, 'the ramp runs straight along the wall');
  assert.equal(BARN_RAMP.runZ, 1, 'the ramp climbs north into the loft');
  assert.ok(BARN_RAMP.z + BARN_RAMP.len >= BARN.z + BARN.loftSouth,
    'the ramp top reaches the loft edge');
});

test('the silo is closed: a full ring of colliders at full wall height', () => {
  const cols = siloColliders();
  assert.equal(cols.length, 20, 'one station every 18 degrees, no entrance gap');
  for (const c of cols) {
    const r = Math.hypot(c.x - SILO.x, c.z - SILO.z);
    assert.ok(Math.abs(r - SILO.r) < 1e-9, 'colliders must sit on the wall radius');
    assert.equal(c.top, SILO.h, 'ringed at the full wall height — nothing drives in');
    assert.equal(c.h, SILO.h);
  }
  // The silo stands INSIDE the corn rect; index.js clears a stalk-free
  // clearing around it, so the corn must reach out past the silo on every side.
  assert.ok(SILO.x - SILO.r > CORNFIELD_RECT.x0 && SILO.x + SILO.r < CORNFIELD_RECT.x1);
  assert.ok(SILO.z - SILO.r > CORNFIELD_RECT.z0 && SILO.z + SILO.r < CORNFIELD_RECT.z1);
});

// ---- Corn grid --------------------------------------------------------------

test('the corn grid fills the field at the configured spacing', () => {
  const pts = cornGrid();
  const nx = Math.floor((CORNFIELD_RECT.x1 - CORNFIELD_RECT.x0) / CORN.spacing);
  const nz = Math.floor((CORNFIELD_RECT.z1 - CORNFIELD_RECT.z0) / CORN.spacing);
  assert.equal(pts.length, nx * nz);
  for (const p of pts) {
    assert.ok(p.x >= CORNFIELD_RECT.x0 - 0.5 && p.x <= CORNFIELD_RECT.x1 + 0.5, `x ${p.x} out of field`);
    assert.ok(p.z >= CORNFIELD_RECT.z0 - 0.5 && p.z <= CORNFIELD_RECT.z1 + 0.5, `z ${p.z} out of field`);
  }
});

test('no corn grows on or into the plateau', () => {
  // The field's north edge must clear the plateau's toe (the rise starts at
  // HILL.zNear), so no stalk comes up out of the mound's slope.
  assert.ok(CORNFIELD_RECT.z1 < HILL.zNear, 'the field stops short of the toe');
  for (const p of cornGrid()) {
    assert.ok(p.z < HILL.zNear, `stalk at z ${p.z} grows on the plateau`);
    assert.equal(hillHeightAt(p.x, p.z), 0, 'stalk ground is flat farm ground');
  }
});

// ---- Knock rules ------------------------------------------------------------

test('a stalk is knocked only from within knockR while the car is moving', () => {
  const stalk = { x: 0, z: 0 };
  assert.equal(shouldKnockStalk(1, 0, 3, stalk), true);
  assert.equal(shouldKnockStalk(2, 0, 3, stalk), false, 'outside knockR');
  assert.equal(shouldKnockStalk(0.5, 0, 0.1, stalk), false, 'too slow to matter');
  assert.equal(shouldKnockStalk(2, 0, 3, stalk, 3), true, 'an explicit radius widens the rule');
});

test('knocking is radial in xz, not axis-aligned', () => {
  const stalk = { x: 0, z: 0 };
  const d = CORN.knockR * 0.7;
  const diag = Math.hypot(d, d);
  assert.ok(diag < CORN.knockR, 'diagonal point is inside the circle');
  assert.equal(shouldKnockStalk(d, d, 5, stalk), true);
});

// ---- Pumpkin rolling --------------------------------------------------------

test('a moving pumpkin advances, spins and bleeds off speed', () => {
  const p = { x: 0, z: 0, vx: 6, vz: 0, spin: 0, radius: 1.5 };
  const sp = stepPumpkin(p, 1 / 60);
  assert.equal(sp, 6, 'returns the pre-friction speed');
  assert.ok(Math.abs(p.x - 0.1) < 1e-9);
  assert.ok(Math.abs(p.spin - (6 / 60) / 1.5) < 1e-9);
  assert.ok(Math.abs(p.vx - 6 * (1 - 1.8 / 60)) < 1e-9);
  assert.equal(p.vz, 0);
});

test('a nearly-stopped pumpkin is parked exactly', () => {
  const p = { x: 4, z: 4, vx: 0.01, vz: 0, spin: 0, radius: 1.5 };
  assert.equal(stepPumpkin(p, 1 / 60), 0);
  assert.equal(p.vx, 0);
  assert.equal(p.vz, 0);
  assert.equal(p.x, 4, 'must not drift while parked');
});

test('a rolling pumpkin comes to rest in a bounded number of frames', () => {
  const p = { x: 0, z: 0, vx: 8, vz: 0, spin: 0, radius: 1.5 };
  let frames = 0;
  while (stepPumpkin(p, 1 / 60) > 0 && frames < 100000) frames++;
  assert.ok(frames > 0 && frames < 100000, 'pumpkin must eventually stop');
  assert.equal(p.vx, 0);
  assert.equal(p.vz, 0);
});

// ---- Orchard ----------------------------------------------------------------

test('orchardGrid fills the orchard rect at the tree spacing', () => {
  const pts = orchardGrid();
  const nx = Math.floor((ORCHARD.x1 - ORCHARD.x0) / APPLE_TREE.spacing);
  const nz = Math.floor((ORCHARD.z1 - ORCHARD.z0) / APPLE_TREE.spacing);
  assert.equal(pts.length, nx * nz);
  for (const p of pts) {
    assert.ok(p.x >= ORCHARD.x0 - APPLE_TREE.spacing && p.x <= ORCHARD.x1 + APPLE_TREE.spacing, `x ${p.x}`);
    assert.ok(p.z >= ORCHARD.z0 && p.z <= ORCHARD.z1, `z ${p.z}`);
  }
});

test('the squirrel is an expert marksman: exactly one throw in three lands', () => {
  let hits = 0;
  for (let i = 0; i < 30; i++) if (squirrelThrowHits(i)) hits++;
  assert.equal(hits, 10, '1 in 3 over 30 throws');
  assert.equal(squirrelThrowHits(0), true, 'the first throw connects');
  assert.equal(squirrelThrowHits(1), false);
  assert.equal(squirrelThrowHits(2), false);
  assert.equal(squirrelThrowHits(3), true);
});

// ---- Barrel pyramids --------------------------------------------------------

test('barrelPyramid stacks a triangular pile of barrels lying on their sides', () => {
  const radius = 0.5, length = 1.3;
  const items = barrelPyramid({ x: 0, z: 0, rows: 4, alongX: true, radius, length });
  assert.equal(items.length, 1 + 2 + 3 + 4, 'rows of 4,3,2,1');
  // Every barrel lies on its side: the bottom tier rests at y = radius, and
  // each tier up rises by half a hex-packing step (radius * sqrt(3)).
  const tierH = radius * Math.sqrt(3);
  for (const b of items) {
    const tier = Math.round((b.y - radius) / tierH);
    assert.ok(Math.abs(b.y - (radius + tier * tierH)) < 1e-9, 'tier at hex height');
    assert.equal(b.length, length);
  }
});

test('lying barrels in a pile never intersect (hex pitch along and across)', () => {
  const radius = 0.5;
  const items = barrelPyramid({ x: 5, z: -5, rows: 4, alongX: false, radius, length: 1.3 });
  const pitch = radius * 2.04;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const d = Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z);
      const tierGap = Math.abs(items[i].y - items[j].y);
      const sameTier = tierGap < 1e-6;
      assert.ok(
        (sameTier && d >= pitch - 1e-9) || (!sameTier && d * d + tierGap * tierGap >= (radius * 2) ** 2 - 1e-9),
        `barrels ${i} and ${j} overlap (d=${d}, dy=${tierGap})`);
    }
  }
});

// ---- Hill, plateau, and its two slopes --------------------------------------

test('hillRamp is two cosine chains: up the south face, then the shoulder', () => {
  const segs = hillRamp();
  const n = HILL_PROFILE_STEPS;
  assert.equal(segs.length, 2 * n, 'one chain per face');
  const cx = (HILL.x0 + HILL.x1) / 2;
  const width = HILL.x1 - HILL.x0;
  const up = segs.slice(0, n);
  const shoulder = segs.slice(n);
  for (const r of segs) {
    assert.equal(r.runX, 0);
    assert.equal(r.runZ, 1, 'both faces run along +Z');
    assert.equal(r.x, cx, 'the ramp runs up the middle of the mound');
    assert.equal(r.width, width, 'full width of the mound');
    assert.equal(r.boost, 0);
  }

  // South face: zNear -> zTop, sampling hillProfileY, always climbing.
  const runUp = HILL.zTop - HILL.zNear;
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(up[i].len - runUp / n) < 1e-9, `up segment ${i} length`);
    assert.ok(up[i].height > 0, 'the south face climbs');
  }
  assert.equal(up[0].baseY, 0, 'starts at ground at the toe');
  const upLast = up[n - 1];
  assert.ok(Math.abs(upLast.baseY + upLast.height - HILL.topY) < 1e-9, 'tops out at the summit');
  assert.ok(Math.abs(upLast.z + upLast.len / 2 - HILL.zTop) < 1e-9, 'ends at the plateau edge');

  // Shoulder: zFar -> zBack, sampling hillShoulderY — a monotonic easing DOWN
  // past the fence line into the backing ridges.
  const runSh = HILL.zBack - HILL.zFar;
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(shoulder[i].len - runSh / n) < 1e-9, `shoulder segment ${i} length`);
    assert.ok(shoulder[i].height <= 0, 'the shoulder only eases down');
  }
  assert.equal(shoulder[0].baseY, HILL.topY, 'starts at summit height at the lip');
  assert.ok(Math.abs(shoulder[0].z - shoulder[0].len / 2 - HILL.zFar) < 1e-9, 'starts at the plateau edge');
  const shLast = shoulder[n - 1];
  assert.ok(Math.abs(shLast.baseY + shLast.height - HILL_SHOULDER_END_Y) < 1e-9,
    'ends buried in the backing ridge');
  assert.ok(Math.abs(shLast.z + shLast.len / 2 - HILL.zBack) < 1e-9, 'runs out to zBack');

  // Consecutive segments meet end-to-start inside each chain (the flat
  // plateau joins the two chains, so there is no continuity across it).
  for (const chain of [up, shoulder]) {
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1], b = chain[i];
      assert.ok(Math.abs(a.z + a.len / 2 - (b.z - b.len / 2)) < 1e-9, `z break at ${i}`);
      assert.ok(Math.abs(a.baseY + a.height - b.baseY) < 1e-9, `height break at ${i}`);
    }
  }
});

test('the hill profile is a cosine mound: gentle toe and crest, steep middle', () => {
  const n = HILL_PROFILE_STEPS;
  assert.ok(Math.abs(hillProfileY(0.5) - HILL.topY / 2) < 1e-9, 'half height at the midpoint');
  const toe = hillProfileY(1 / n) - hillProfileY(0);
  const middle = hillProfileY(0.5) - hillProfileY(0.5 - 1 / n);
  const crest = hillProfileY(1) - hillProfileY(1 - 1 / n);
  assert.ok(middle > toe * 3, 'the middle step is far steeper than the toe');
  assert.ok(Math.abs(crest - toe) < 1e-9, 'the profile is symmetric');
  assert.equal(hillProfileY(1), HILL.topY, 'the profile tops out at topY');
});

test('the shoulder eases monotonically down past the fence into the ridges', () => {
  assert.equal(hillShoulderY(0), HILL.topY, 'full height at the lip (continues the crown)');
  const end = hillShoulderY(1);
  assert.equal(end, HILL_SHOULDER_END_Y, 'buries into the backing ridge at zBack');
  assert.ok(end > 0 && end < HILL.topY, 'eases down toward the rolling ridges');
  // Monotonic: it never climbs again beyond the fence.
  let prev = hillShoulderY(0);
  for (let i = 1; i <= 256; i++) {
    const h = hillShoulderY(i / 256);
    assert.ok(h <= prev + 1e-9, `never climbs at step ${i}`);
    prev = h;
  }
  // Gentle at the lip (no step where the fence stands).
  const toe = hillShoulderY(1 / HILL_PROFILE_STEPS) - hillShoulderY(0);
  assert.ok(toe > -HILL.topY * 0.2 && toe <= 0, 'no cliff at the lip');
  assert.ok(Math.abs(hillShoulderY(0.5) - (HILL.topY + HILL_SHOULDER_END_Y) / 2) < 1e-9,
    'half height at the midpoint');
});

test('plateauTopAt lifts only a car already up at the top', () => {
  const cx = (HILL.x0 + HILL.x1) / 2;
  const cz = (HILL.zTop + HILL.zFar) / 2;
  assert.equal(plateauTopAt(cx, cz, HILL.topY), HILL.topY, 'a car at the top rides it');
  assert.equal(plateauTopAt(cx, cz, 0), 0, 'a ground car below is NOT lifted');
  assert.equal(plateauTopAt(HILL.x0 - 5, cz, HILL.topY), 0, 'off the flanks is 0');
  assert.equal(plateauTopAt(cx, HILL.zNear, HILL.topY), 0, 'the slope is not the plateau');
});

test('hillColliders leaves the mound open: no invisible lip fence', () => {
  assert.deepEqual(hillColliders(), [], 'the flanks and lip block nothing');
});

test('hillHeightAt is a plateau: full width, level crown, flush everywhere else', () => {
  const cz = (HILL.zTop + HILL.zFar) / 2;
  // The crown is UNIFORMLY flat — the same height at every x, all the way out
  // to the boundary fence line (inclusive), so the north fence stands on the
  // plateau edge rather than in a buried trench.
  for (const x of [HILL.x0, HILL.x0 + 1, 0, (HILL.x0 + HILL.x1) / 2, HILL.x1 - 1, HILL.x1]) {
    assert.equal(hillHeightAt(x, cz), HILL.topY, `full height at x ${x}`);
  }
  const midX = (HILL.x0 + HILL.x1) / 2;
  assert.equal(hillHeightAt(midX, HILL.zNear), 0, 'flush at the river bank at the south toe');
  assert.equal(hillHeightAt(midX, HILL.zBack + 1), 0, 'past the shoulder is flat ground');
  assert.equal(hillHeightAt(HILL.x0 - 10, cz), 0, '0 outside the footprint');
  assert.equal(hillHeightAt(HILL.x1 + 10, cz), 0, '0 outside the footprint');
  // The crown band is flat from zTop to zFar, inclusive at both ends.
  assert.equal(hillHeightAt(0, HILL.zTop), HILL.topY, 'level at the crest line');
  assert.equal(hillHeightAt(0, HILL.zFar), HILL.topY, 'level at the fence line');
  // Climbing in from the south toe: a series of small steps — no vertical wall.
  let prev = 0;
  for (let i = 1; i <= 10; i++) {
    const h = hillHeightAt(0, HILL.zNear + (HILL.zTop - HILL.zNear) * (i / 10));
    assert.ok(h >= prev, 'climbs inland');
    assert.ok(h - prev < HILL.topY * 0.2, `no cliff at step ${i}`);
    prev = h;
  }
  assert.ok(Math.abs(prev - HILL.topY) < 1e-9, 'tops out at the crown');
});

// ---- Farm boundary ----------------------------------------------------------

test('farm bounds fence three sides and wall the south in brick', () => {
  const cols = farmBoundsColliders();
  assert.equal(cols.length, 4);
  assert.equal(BRICK_WALL.z, FARM_BOUNDS.z0, 'the brick wall sits on the south boundary');
  for (const c of cols) assert.equal(c.top, c.h, 'walls are plain walls');
  // One wall per side, each spanning the full opposite dimension.
  const { x0, x1, z0, z1 } = FARM_BOUNDS;
  const vertical = cols.filter((c) => Math.abs(c.x - x0) < 1e-9 || Math.abs(c.x - x1) < 1e-9);
  const horizontal = cols.filter((c) => Math.abs(c.z - z0) < 1e-9 || Math.abs(c.z - z1) < 1e-9);
  assert.equal(vertical.length, 2);
  assert.equal(horizontal.length, 2);
  // The drawn walls are short, but the COLLIDERS are invisible towers: the
  // bull's launch (and any hilltop launch over the north fence) must bounce
  // back inside at any height.
  for (const c of cols) {
    assert.equal(c.h, FARM_WALL_TOP, 'every boundary run is an invisible tower');
    assert.equal(c.top, FARM_WALL_TOP, 'and rejects the car at any height');
  }
  assert.ok(FARM_WALL_TOP > 50, 'the tower dwarfs every drawn wall (brick or fence)');
  assert.ok(FARM_WALL_TOP > BRICK_WALL.h, 'including the tall brick wall');
});

// ---- Bull pasture -----------------------------------------------------------

test('the pasture is a fenced paddock on the plateau, clear of the corn', () => {
  const { x0, x1, z0, z1 } = PASTURE;
  assert.ok(x0 > FARM_BOUNDS.x0 && x1 < FARM_BOUNDS.x1);
  assert.ok(z0 > FARM_BOUNDS.z0 && z1 < FARM_BOUNDS.z1);
  assert.ok(z0 > CORNFIELD_RECT.z1, 'north of the corn');
  assert.ok(x1 < BARN.x - BARN.halfW, 'west of the barn');
  // It stands ON the plateau's level crown, clear of the lip and the patch.
  assert.ok(z0 >= HILL.zTop && z1 <= HILL.zFar, 'inside the crown band');
  assert.ok(x0 > HILL.x0 && x1 < HILL.x1, 'inside the plateau flanks');
  for (const [px, pz] of [[x0, z0], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
    assert.equal(hillHeightAt(px, pz), HILL.topY, `pasture ground at (${px}, ${pz}) is the crown`);
  }
  assert.ok(PASTURE.x1 < PUMPKIN_PATCH.x0, 'the pumpkin patch is a separate patch to the east');
  assert.equal(pastureAt((x0 + x1) / 2, (z0 + z1) / 2), true);
  assert.equal(pastureAt(x0 - 1, (z0 + z1) / 2), false);
  assert.equal(pastureAt((x0 + x1) / 2, z1 + 1), false);
  assert.ok(BULL.home.x > x0 && BULL.home.x < x1, 'bull starts inside');
  assert.ok(BULL.home.z > z0 && BULL.home.z < z1);
  assert.equal(hillHeightAt(BULL.home.x, BULL.home.z), HILL.topY, 'the bull stands on the crown');
  assert.ok(BULL.chargeSpeed > BULL.walkSpeed, 'the charge is faster than a stroll');
  assert.ok(BULL.chargeRadius > 1, 'the horns reach past the bumper');
});

test('the pasture fence is a set of bays, each lifted to the plateau', () => {
  const cols = pastureFenceColliders();
  const bays = pastureFenceBayDefs();
  assert.equal(cols.length, bays.length, 'colliders and bays stay in lockstep');
  assert.ok(bays.length >= 20, 'the paddock is many bays, not four walls');
  const { x0, x1, z0, z1 } = PASTURE;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    assert.equal(c.pastureFence, true);
    assert.equal(c.bay, i, 'each collider names its bay');
    // A hard hit only drops the bays it smashes, so every bay starts intact
    // (no `broken` flag is baked in) and stands at plateau height.
    assert.equal(c.h, PASTURE_FENCE_H);
    assert.equal(c.top, HILL.topY + PASTURE_FENCE_H, 'the fence stands on the plateau');
    assert.ok(c.x >= x0 - 1e-9 && c.x <= x1 + 1e-9);
    assert.ok(c.z >= z0 - 1e-9 && c.z <= z1 + 1e-9);
  }
  // The long (north/south) sides run along x; the short sides along z.
  const alongX = cols.filter((c) => c.halfD < 0.5).length;
  const alongZ = cols.filter((c) => c.halfW < 0.5).length;
  assert.equal(alongX + alongZ, cols.length, 'every bay is a thin box along one axis');
  assert.ok(alongX > alongZ, 'the paddock is wider than it is deep, so more bays run along x');
});

// ---- The river --------------------------------------------------------------

test('the river is an L: a channel along the east side and a leg along the plateau toe', () => {
  assert.ok(RIVER.x0 > FARM_BOUNDS.x0 + (FARM_BOUNDS.x1 - FARM_BOUNDS.x0) / 2,
    'the channel runs along the farm\u2019s east side');
  assert.ok(RIVER.x1 < FARM_BOUNDS.x1, 'it stays inside the east fence');
  assert.ok(RIVER.bedY < RIVER.waterY && RIVER.waterY < 0, 'bed under water under grass');
  assert.ok(RIVER.flowSpeed > 0 && RIVER.flowDrag > 0, 'the current is real');
  assert.equal(RIVER.legZ1, HILL.zNear, 'the plateau descends straight into the leg');
  assert.ok(RIVER.legX0 < CORNFIELD_RECT.x0, 'the leg runs west past the corn to the spring');
  const cx = (RIVER.x0 + RIVER.x1) / 2;
  const lm = (RIVER.legZ0 + RIVER.legZ1) / 2;
  assert.equal(riverAt(cx, 20), RIVER, 'mid-channel is river');
  assert.equal(riverAt(RIVER.x0 - 1, 20), null, 'west of the bank is not');
  assert.equal(riverAt(RIVER.x1 + 1, 20), null, 'east of the bank is not');
  assert.equal(riverAt(60, lm), RIVER, 'the leg is river');
  assert.equal(riverAt(112, lm), RIVER, 'the corner is river');
  assert.equal(riverAt(60, RIVER.legZ0 - 4), null, 'short of the leg is dry');
  assert.equal(riverAt(60, RIVER.legZ1 + 6), null, 'beyond the leg is dry');
  assert.equal(riverAt(RIVER.legX0 - 1, lm), null, 'west of the spring is dry');
  assert.equal(riverAt(RIVER.legX0, lm), RIVER, 'the spring bank is the leg\u2019s west end');
});

test('the current runs south down the channel and east along the leg', () => {
  const cx = (RIVER.x0 + RIVER.x1) / 2;
  const channel = riverFlowAt(cx, 20, RIVER.bedY);
  assert.ok(channel, 'afloat in the channel feels the push');
  assert.equal(channel.dx, 0, 'the channel runs along z only');
  assert.equal(channel.dz, -RIVER.flowSpeed, 'downstream is -Z');
  assert.equal(channel.drag, RIVER.flowDrag);
  const lm = (RIVER.legZ0 + RIVER.legZ1) / 2;
  const leg = riverFlowAt(60, lm, RIVER.bedY);
  assert.ok(leg, 'afloat in the leg feels the push');
  assert.equal(leg.dx, RIVER.flowSpeed, 'the leg runs east (+X) toward the bend');
  assert.equal(leg.dz, 0, 'no southward push out in the leg');
  const corner = riverFlowAt(cx, lm, RIVER.bedY);
  assert.equal(corner.dx, 0, 'at the corner the water is already turning south');
  assert.equal(corner.dz, -RIVER.flowSpeed, 'the corner flows with the channel');
  assert.equal(riverFlowAt(cx, 20, 5), null, 'flying clear above ignores the river');
  assert.equal(riverFlowAt(0, 20, 0), null, 'dry ground is not a river');
});

test('the river has no walls: every bank slopes smoothly to the bed', () => {
  assert.deepEqual(riverWallColliders(), [], 'nothing holds the car in the river');
  const mid = (RIVER.x0 + RIVER.x1) / 2;
  const legMid = (RIVER.legZ0 + RIVER.legZ1) / 2;
  // The centre of each arm is the full bed depth.
  assert.equal(riverSurfaceY(mid, -20), RIVER.bedY, 'channel centre is the bed');
  assert.equal(riverSurfaceY(60, legMid), RIVER.bedY, 'leg centre is the bed');
  // Every bank edge meets the grass exactly at y = 0.
  assert.equal(riverSurfaceY(RIVER.x0, -20), 0, 'west bank');
  assert.equal(riverSurfaceY(RIVER.x1, -20), 0, 'east bank');
  assert.equal(riverSurfaceY(mid, RIVER.legZ1), 0, 'north bank');
  assert.equal(riverSurfaceY(60, RIVER.legZ0), 0, 'south bank of the leg');
  assert.equal(riverSurfaceY(RIVER.legX0, legMid), 0, 'the spring end');
  assert.equal(riverSurfaceY(RIVER.legX0 - 5, legMid), null, 'dry land is not river');
  // The inside corner is open water, not a ridge between the two arms.
  assert.equal(riverSurfaceY(mid, RIVER.legZ0), RIVER.bedY, 'no bank across the corner');
  // Walking in from a bank is a short, monotonic descent — no lip or wall.
  let prev = 0;
  for (let i = 1; i <= 8; i++) {
    const y = riverSurfaceY(RIVER.x0 + RIVER.bankW * (i / 8), -20);
    assert.ok(y <= prev + 1e-9, 'descends inward');
    assert.ok(prev - y < 0.5, `no cliff at step ${i}`);
    prev = y;
  }
});
// ---- Mill house -------------------------------------------------------------

test('the mill stands on the leg\u2019s south bank at the west end, wheel in the current', () => {
  assert.ok(MILL.z + MILL.halfD < RIVER.legZ0, 'the walls stay south of the leg');
  assert.ok(MILL.z + MILL.halfD < HILL.zNear, 'the mill is south of the hill\u2019s toe');
  assert.ok(MILL.x - MILL.halfW > RIVER.legX0, 'clear of the spring at the west end');
  assert.ok(MILL.wheel.z > RIVER.legZ0 && MILL.wheel.z < RIVER.legZ1, 'the wheel hangs over the leg');
  assert.ok(MILL.wheel.x > RIVER.legX0 && MILL.wheel.x < RIVER.x1, 'the wheel is over water, not land');
  assert.ok(MILL.wheel.y - MILL.wheel.r < RIVER.waterY, 'the wheel bottom reaches into the water');
  assert.ok(MILL.x + MILL.halfW < CORNFIELD_RECT.x0, 'west of the corn');
  assert.ok(MILL.x + MILL.halfW < PUMPKIN_PATCH.x0, 'west of the pumpkins');
  // Inside the fence on every side.
  assert.ok(MILL.x - MILL.halfW > FARM_BOUNDS.x0 && MILL.x + MILL.halfW < FARM_BOUNDS.x1);
  assert.ok(MILL.z - MILL.halfD > FARM_BOUNDS.z0 && MILL.z + MILL.halfD < FARM_BOUNDS.z1);
});

test('mill walls leave the doorway open on the south face and stay solid elsewhere', () => {
  const cols = millColliders();
  const south = cols.filter((c) => Math.abs(c.z - (MILL.z - MILL.halfD)) < 1e-9);
  assert.equal(south.length, 2, 'the south face is split around the door');
  for (const c of south) {
    const x0 = c.x - c.halfW, x1 = c.x + c.halfW;
    assert.ok(x1 <= MILL.x - MILL.doorHalf + 1e-9 || x0 >= MILL.x + MILL.doorHalf - 1e-9,
      `wall segment [${x0}, ${x1}] intrudes on the doorway`);
  }
  const walls = cols.filter((c) => c.top === MILL.wallH);
  assert.equal(walls.length, 5, 'four faces, one of them split in two');
  // The wheel and the threshing machine are solid too.
  const wheel = cols.find((c) => Math.abs(c.z - MILL.wheel.z) < 1e-9);
  assert.ok(wheel, 'the wheel is solid');
  assert.ok(wheel.h > MILL.wheel.r, 'the wheel collider stands taller than its radius');
  assert.ok(wheel.x - wheel.halfW > RIVER.legX0 && wheel.x + wheel.halfW < RIVER.x1,
    'the wheel collider stays within the leg reach');
  assert.ok(wheel.z - wheel.halfD >= RIVER.legZ0 && wheel.z + wheel.halfD <= RIVER.legZ1,
    'the wheel spans the leg across its width');
  assert.ok(cols.some((c) => Math.abs(c.x - MILL.drum.x) < 1e-9 && c.top > MILL.drum.y),
    'the threshing machine is solid');
  // The mill train and distillery machinery are solid too, and stay inside.
  const machinery = cols.filter((c) => c.top < MILL.wallH && !(c.z === MILL.wheel.z));
  assert.ok(machinery.length >= 8, 'the millstones, still, tuns and casks all block');
  for (const c of machinery) {
    assert.ok(c.x - c.halfW > MILL.x - MILL.halfW && c.x + c.halfW < MILL.x + MILL.halfW,
      `machinery at x ${c.x} pokes through the wall`);
    assert.ok(c.z - c.halfD > MILL.z - MILL.halfD && c.z + c.halfD < MILL.z + MILL.halfD,
      `machinery at z ${c.z} pokes through the wall`);
  }
  assert.equal(cols.length, 17, '5 walls + wheel + thresher + 10 pieces of machinery');
});

// ---- Farmhouse --------------------------------------------------------------

test('the farmhouse is a solid box clear of every other farm feature', () => {
  const { x, z, halfW, halfD } = FARM_HOUSE;
  assert.ok(x - halfW > CORNFIELD_RECT.x1, 'east of the corn');
  assert.ok(z + halfD < CORNFIELD_RECT.z0 || x - halfW > CORNFIELD_RECT.x1);
  assert.ok(Math.hypot(x - WATER_TOWER.x, z - WATER_TOWER.z) > halfW + 8, 'clear of the water tower');
  // The tractor loop runs around the farmhouse; keep the house off the lane.
  const distToSeg = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  };
  let laneGap = Infinity;
  for (let i = 0; i < TRACTOR.path.length; i++) {
    const a = TRACTOR.path[i], b = TRACTOR.path[(i + 1) % TRACTOR.path.length];
    laneGap = Math.min(laneGap, distToSeg(x, z, a[0], a[1], b[0], b[1]));
  }
  assert.ok(laneGap > halfW + 3, 'clear of the tractor loop');
  assert.ok(x - halfW > BARN.x + BARN.halfW + 4 || z + halfD < BARN.z - BARN.halfD - 4, 'clear of the barn');
  assert.ok(Math.hypot(x - CORN_SPAWN.x, z - CORN_SPAWN.z) > 10, 'clear of the spawn');
  // Inside the fence.
  assert.ok(x + halfW < FARM_BOUNDS.x1 && x - halfW > FARM_BOUNDS.x0);
  assert.ok(z + halfD < FARM_BOUNDS.z1 && z - halfD > FARM_BOUNDS.z0);
});

test('the farmhouse walls fully enclose the footprint (no drive-through gaps)', () => {
  const cols = farmHouseColliders();
  assert.equal(cols.length, 4);
  for (const c of cols) {
    assert.equal(c.h, FARM_HOUSE.wallH);
    assert.equal(c.top, FARM_HOUSE.wallH, 'solid walls, not a drive-in');
  }
  // The four walls tile the perimeter: two along x, two along z.
  assert.equal(cols.filter((c) => c.halfD === FARM_HOUSE.halfD).length, 2);
  assert.equal(cols.filter((c) => c.halfW === FARM_HOUSE.halfW).length, 2);
});

// ---- Outward landscape ------------------------------------------------------

test('the rolling ridges knit the mound into the landform, outside the fence', () => {
  assert.ok(ROLLING.length >= 4, 'several ridges continue the landscape');
  const { x0, x1, z0, z1 } = FARM_BOUNDS;
  for (const r of ROLLING) {
    assert.ok(r.axis === 'x' || r.axis === 'z', 'axis is x or z');
    assert.ok(r.len > 0 && r.halfW > 0 && r.h > 0, 'real dimensions');
    const outside = r.axis === 'x' ? (r.z < z0 || r.z > z1) : (r.x < x0 || r.x > x1);
    assert.ok(outside, `ridge at (${r.x}, ${r.z}) must sit outside the fence`);
  }
});

// ---- Constant sanity --------------------------------------------------------

test('level constants stay mutually consistent', () => {
  assert.equal(BARN_RAMP.height, BARN.loftY, 'the ramp must reach the loft');
  // The loft spans the full width, flush with the west wall edge (loftWest may
  // sit exactly ON the wall line, hence >=).
  assert.ok(BARN.loftWest >= BARN.x - BARN.halfW && BARN.loftWest < BARN.x + BARN.halfW);
  assert.ok(SILO.h > BARN.wallH, 'the closed silo is the tall landmark in the clearing');
  // The pumpkin patch rides the plateau's level crown, clear of the corn.
  assert.ok(PUMPKIN_PATCH.x0 > CORNFIELD_RECT.x1, 'the pumpkin patch grows east of the corn');
  assert.ok(PUMPKIN_PATCH.z0 >= HILL.zTop && PUMPKIN_PATCH.z1 <= HILL.zFar,
    'the patch sits on the crown, so every vine lies on flat high ground');
  for (const [px, pz] of [[PUMPKIN_PATCH.x0, PUMPKIN_PATCH.z0], [PUMPKIN_PATCH.x1, PUMPKIN_PATCH.z1]]) {
    assert.equal(hillHeightAt(px, pz), HILL.topY, `patch corner (${px}, ${pz}) is crown`);
  }
  assert.ok(PUMPKIN_VINE_BREAK > 2, 'the vine tears off well short of a full lap of the patch');
  assert.ok(PUMPKIN_VINE_BREAK < Math.hypot(PUMPKIN_PATCH.x1 - PUMPKIN_PATCH.x0, PUMPKIN_PATCH.z1 - PUMPKIN_PATCH.z0),
    'and well inside the patch\u2019s own diagonal');
});

test('the farm stays inside the boundary and clear of itself', () => {
  // Everything the boundary must contain.
  assert.ok(ORCHARD.x0 > FARM_BOUNDS.x0 && ORCHARD.x1 < FARM_BOUNDS.x1);
  assert.equal(HILL.x0, FARM_BOUNDS.x0, 'the plateau spans to the west fence');
  assert.equal(HILL.x1, FARM_BOUNDS.x1, 'and to the east fence');
  assert.equal(HILL.zNear, RIVER.legZ1, 'the plateau\u2019s south toe ends at the leg');
  assert.equal(HILL.zFar, FARM_BOUNDS.z1, 'the crown runs right out to the north fence');
  for (const b of BARREL_STACKS) {
    assert.ok(b.x > FARM_BOUNDS.x0 && b.x < FARM_BOUNDS.x1 && b.z > FARM_BOUNDS.z0 && b.z < FARM_BOUNDS.z1);
    assert.equal(hillHeightAt(b.x, b.z), 0, `stack at (${b.x}, ${b.z}) stands on flat ground`);
  }
  // Every stack stays clear of the tractor lane, so the loop never clips one.
  const distToSeg = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  };
  for (const b of BARREL_STACKS) {
    let laneGap = Infinity;
    for (let i = 0; i < TRACTOR.path.length; i++) {
      const a = TRACTOR.path[i], c = TRACTOR.path[(i + 1) % TRACTOR.path.length];
      laneGap = Math.min(laneGap, distToSeg(b.x, b.z, a[0], a[1], c[0], c[1]));
    }
    assert.ok(laneGap > 4, `stack at (${b.x}, ${b.z}) crowds the tractor lane (${laneGap.toFixed(1)})`);
  }
  // The orchard must not grow over the corn or the pumpkin patch.
  assert.ok(ORCHARD.x0 > CORNFIELD_RECT.x1, 'orchard is east of the corn');
  assert.ok(ORCHARD.x0 > PUMPKIN_PATCH.x1, 'orchard is east of the pumpkins');
  // The mill, the plateau and the river stay out of each other's way.
  assert.ok(MILL.z + MILL.halfD < HILL.zNear, 'the mill is south of the plateau toe');
  assert.ok(MILL.z + MILL.halfD < RIVER.legZ0, 'the mill is south of the leg');
  // The truck starts on the plateau, clear of the lip, so it has a runway.
  assert.ok(FARM_TRUCK.z >= HILL.zTop && FARM_TRUCK.z < HILL.zFar, 'truck starts on the plateau');
  assert.ok(FARM_TRUCK.x > HILL.x0 && FARM_TRUCK.x < HILL.x1, 'truck starts between the flanks');
  assert.equal(hillHeightAt(FARM_TRUCK.x, FARM_TRUCK.z), HILL.topY, 'truck starts on the crown');
  assert.equal(FARM_TRUCK.yaw, -Math.PI / 2, 'the truck faces south, down the long slope (\u2212Z)');
  // The tractor loop stays a real loop.
  assert.ok(TRACTOR.path.length >= 3);
  assert.ok(TRACTOR.speed > 0 && SQUIRREL.runSpeed > 0);
});

// ---- Barrel rolling ---------------------------------------------------------

test('a barrel rolls only broadside: along-axis travel skids without spin', () => {
  // axis 0 -> long axis is world +X; broadside is +Z. Pushed along +X it skids.
  const b = { x: 0, z: 0, vx: 6, vz: 0, roll: 0, axis: 0, radius: 0.5 };
  const sp = stepBarrel(b, 1 / 60);
  assert.equal(sp, 6, 'returns the pre-friction speed');
  assert.ok(Math.abs(b.x - 0.1) < 1e-9, 'still slides along the axis');
  assert.equal(b.roll, 0, 'must not roll while sliding along its length');
});

test('a barrel spins a no-slip amount when pushed broadside', () => {
  const b = { x: 0, z: 0, vx: 0, vz: 6, roll: 0, axis: 0, radius: 0.5 };
  const sp = stepBarrel(b, 1 / 60);
  assert.equal(sp, 6);
  assert.ok(Math.abs(b.z - 0.1) < 1e-9);
  // v = \u03c9\u00b7r in the broadside (perpendicular) component.
  assert.ok(Math.abs(b.roll - (6 / 60) / 0.5) < 1e-9);
  // Low drag by default: a knocked barrel keeps going like a ramp-world tire.
  assert.ok(Math.abs(b.vz - 6 * (1 - 1.0 / 60)) < 1e-9);
});

test('a rolling barrel comes to rest and parks exactly', () => {
  const b = { x: 0, z: 0, vx: 5, vz: 5, roll: 0, axis: Math.PI / 4, radius: 0.5 };
  let frames = 0;
  while (stepBarrel(b, 1 / 60) > 0 && frames < 100000) frames++;
  assert.ok(frames > 0 && frames < 100000, 'barrel must stop in bounded frames');
  assert.equal(b.vx, 0);
  assert.equal(b.vz, 0);
  const x = b.x, z = b.z;
  assert.equal(stepBarrel(b, 1 / 60), 0);
  assert.equal(b.x, x, 'must not drift while parked');
  assert.equal(b.z, z);
});
