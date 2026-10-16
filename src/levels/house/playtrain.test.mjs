// Authoring checker + regression guard for the house play train's floor route.
// Builds the real furniture footprints (via the house harness) and the Hot Wheels
// floor lane, then asserts the route stays inside the house, visits every room
// but the bathroom and the dark garage, only crosses walls through their
// doorways, never doubles back through itself, and keeps clear of furniture and
// the Hot Wheels track.
//
// Run: node --test src/levels/house/playtrain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { addHouse } from './houseHarness.mjs';
import { ROOMS, HOUSE, HOUSE_WALLS } from './layout.js';
import { playTrainPoints, PLAY_TRAIN_OPS, expandOps } from './playtrain.mjs';

const pts = playTrainPoints();

// ---- Furniture footprints, measured from the actual built house -------------
// Same reduction __ft.mjs uses: every non-structure box (or group of boxes) that
// stands on the floor becomes a 2D AABB in world space.
function footprints(world) {
  const out = [];
  const boxFp = (g) => {
    const q = Math.round(g.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
    const cos = Math.cos(q), sin = Math.sin(q);
    const gx = g.position.x, gz = g.position.z;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, h1 = 0, meshes = 0;
    const add = (lx, lz, w, d) => {
      const rx = lx * cos + lz * sin, rz = -lx * sin + lz * cos;
      const hw = (Math.abs(w * cos) + Math.abs(d * sin)) / 2;
      const hd = (Math.abs(w * sin) + Math.abs(d * cos)) / 2;
      x0 = Math.min(x0, gx + rx - hw); x1 = Math.max(x1, gx + rx + hw);
      z0 = Math.min(z0, gz + rz - hd); z1 = Math.max(z1, gz + rz + hd);
    };
    g.traverse((o) => {
      if (!o.isMesh || o.geometry?.kind !== 'box') return;
      meshes++;
      const [w, h, d] = o.geometry.params.map(Number);
      h1 = Math.max(h1, o.position.y + h / 2);
      const walk = (n, ax, az) => {
        const px = ax + n.position.x, pz = az + n.position.z;
        if (n === o) { add(px, pz, w, d); return; }
        for (const ch of n.children) walk(ch, px, pz);
      };
      walk(g, -gx, -gz);
    });
    if (!meshes) return null;
    return { x0, x1, z0, z1, h1 };
  };
  for (const child of world.group.children) {
    if (child.userData?.structure) continue;
    if (child.isMesh) {
      const geo = child.geometry;
      if (!geo || geo.kind !== 'box') continue;
      const [bw, bh, bd] = geo.params.map(Number);
      if (bh > 20 || bh < 1) continue;
      if (child.position.y - bh / 2 > 2) continue;
      out.push({ x0: child.position.x - bw / 2, x1: child.position.x + bw / 2, z0: child.position.z - bd / 2, z1: child.position.z + bd / 2 });
      continue;
    }
    if (!child.children.some((c) => c.isMesh)) continue;
    const fp = boxFp(child);
    if (!fp) continue;
    const cx = (fp.x0 + fp.x1) / 2, cz = (fp.z0 + fp.z1) / 2;
    if (cx < HOUSE.minX || cx > HOUSE.maxX || cz < HOUSE.minZ || cz > HOUSE.maxZ) continue;
    if (fp.x1 - fp.x0 < 2 && fp.z1 - fp.z0 < 2) continue;
    out.push(fp);
  }
  return out;
}

const world = await addHouse({ add() {} }, {});
const FURN = footprints(world);

// ---- Hot Wheels floor lane (the track within a train-height of the boards) --
import { hotwheelsNodes, buildTrack } from './hotwheels.mjs';
const hw = buildTrack(hotwheelsNodes()).samples.filter((p) => p.y < 4);

// ---- helpers ---------------------------------------------------------------
const ROOM_NAMES = Object.keys(ROOMS);
function roomAt(x, z, m = 0) {
  for (const n of ROOM_NAMES) {
    const r = ROOMS[n];
    if (x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m) return n;
  }
  return null;
}
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
// Distance from a point to an AABB (0 if inside).
function distToBox(x, z, b) {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
}

test('the route is a substantial closed-ish loop of points', () => {
  assert.ok(pts.length > 200, `dense enough to lay rails (${pts.length})`);
  assert.ok(PLAY_TRAIN_OPS.length > 10, 'many pieces');
});

test('every point stays inside the house shell', () => {
  for (const p of pts) {
    assert.ok(p.x > HOUSE.minX && p.x < HOUSE.maxX, `x ${p.x.toFixed(1)} inside`);
    assert.ok(p.z > HOUSE.minZ && p.z < HOUSE.maxZ, `z ${p.z.toFixed(1)} inside`);
    assert.ok(p.y >= 0 && p.y < 5, `y ${p.y.toFixed(2)} on the floor`);
  }
});

test('the route visits every room except the bathroom and the dark garage', () => {
  const seen = new Set();
  for (const p of pts) {
    const r = roomAt(p.x, p.z, 4);      // well inside, not grazing a wall
    if (r) seen.add(r);
  }
  for (const n of ROOM_NAMES) {
    if (n === 'bathroom' || n === 'darkGarage') {
      assert.ok(!seen.has(n), `never enters the ${n}`);
      continue;
    }
    assert.ok(seen.has(n), `visits ${n}`);
  }
});

test('the route only crosses walls through their doorways', () => {
  for (const w of HOUSE_WALLS) {
    const gap = w.gap;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      let cross = null, along = null;
      if (w.axis === 'z') {
        const va = a.x - w.at, vb = b.x - w.at;
        if (va === 0 && vb === 0) continue;
        if ((va <= 0 && vb > 0) || (va >= 0 && vb < 0)) {
          const t = va / (va - vb);
          const z = a.z + (b.z - a.z) * t;
          if (z >= w.run0 && z <= w.run1) { cross = true; along = z; }
        }
      } else {
        const va = a.z - w.at, vb = b.z - w.at;
        if (va === 0 && vb === 0) continue;
        if ((va <= 0 && vb > 0) || (va >= 0 && vb < 0)) {
          const t = va / (va - vb);
          const x = a.x + (b.x - a.x) * t;
          if (x >= w.run0 && x <= w.run1) { cross = true; along = x; }
        }
      }
      if (!cross) continue;
      assert.ok(gap, `crosses the solid wall ${w.axis}=${w.at} at ${along.toFixed(1)}`);
      assert.ok(along > gap.a0 + 1 && along < gap.a1 - 1,
        `crosses wall ${w.axis}=${w.at} at ${along.toFixed(1)}, in the gap ${gap.a0}..${gap.a1}`);
    }
  }
});

test('the route never doubles back through itself', () => {
  // Cumulative arc length along the polyline, so "apart along the track" is
  // measured properly rather than by index.
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + dist2(pts[i].x, pts[i].z, pts[i - 1].x, pts[i - 1].z);
  }
  const total = cum[cum.length - 1];
  const MIN_ARC = 10;
  const CLEAR = 2.4;               // sleeper is 2.4 wide at unit scale; ~1.8 at 0.75
  let worst = Infinity, where = null;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const arc = Math.min(cum[j] - cum[i], total - (cum[j] - cum[i]));
      if (arc < MIN_ARC) continue;
      const di = dist2(pts[i].x, pts[i].z, pts[j].x, pts[j].z);
      if (di < worst) { worst = di; where = [i, j, cum[i], cum[j]]; }
    }
  }
  assert.ok(worst >= CLEAR,
    `closest self-approach ${worst.toFixed(2)} at s=${where?.[2].toFixed(1)} ` +
    `(${pts[where?.[0]]?.x.toFixed(1)},${pts[where?.[0]]?.z.toFixed(1)}) vs ` +
    `s=${where?.[3].toFixed(1)} (${pts[where?.[1]]?.x.toFixed(1)},${pts[where?.[1]]?.z.toFixed(1)})`);
});

test('the route keeps clear of the furniture', () => {
  const CLEAR = 0.9;               // half a sleeper
  let worst = Infinity, hit = null;
  for (const p of pts) {
    for (const f of FURN) {
      const d = distToBox(p.x, p.z, f);
      if (d < worst) { worst = d; hit = { p, f }; }
    }
  }
  assert.ok(worst >= CLEAR,
    `passes within ${worst.toFixed(2)} of furniture ` +
    `x[${hit?.f.x0.toFixed(1)},${hit?.f.x1.toFixed(1)}] z[${hit?.f.z0.toFixed(1)},${hit?.f.z1.toFixed(1)}] ` +
    `at (${hit?.p.x.toFixed(1)},${hit?.p.z.toFixed(1)})`);
});

test('the route keeps clear of the Hot Wheels floor lane', () => {
  const CLEAR = 1.6;
  let worst = Infinity, hit = null;
  for (const p of pts) {
    for (const q of hw) {
      const d = dist2(p.x, p.z, q.x, q.z);
      if (d < worst) { worst = d; hit = { p, q }; }
    }
  }
  assert.ok(worst >= CLEAR,
    `passes within ${worst.toFixed(2)} of the Hot Wheels track ` +
    `at (${hit?.p.x.toFixed(1)},${hit?.p.z.toFixed(1)}) vs (${hit?.q.x.toFixed(1)},${hit?.q.z.toFixed(1)})`);
});
