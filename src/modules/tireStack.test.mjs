// Unit tests for the tire-pyramid layout + rolling math.
// Run: node --test src/modules/tireStack.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIRE_STACK_DEFAULTS,
  tirePyramidSlots,
  tirePyramidSupports,
  tireRollOmega,
} from './tireStack.js';

const EPS = 1e-9;

test('pyramid has a triangular number of slots in shrinking rows', () => {
  for (const rows of [1, 2, 3, 5, 8]) {
    const slots = tirePyramidSlots({ rows });
    assert.equal(slots.length, (rows * (rows + 1)) / 2);
    for (let row = 0; row < rows; row++) {
      const inRow = slots.filter((s) => s.row === row);
      assert.equal(inRow.length, rows - row, `row ${row} count`);
    }
  }
});

test('each row is centred on x=0 and steps up by nestStep', () => {
  const { spacing, nestStep, tubeR } = TIRE_STACK_DEFAULTS;
  const slots = tirePyramidSlots({});
  const byRow = new Map();
  for (const s of slots) {
    if (!byRow.has(s.row)) byRow.set(s.row, []);
    byRow.get(s.row).push(s);
  }
  let prevY = null;
  for (const [row, list] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const cx = list.reduce((acc, s) => acc + s.x, 0) / list.length;
    assert.ok(Math.abs(cx) < EPS, `row ${row} not centred (cx=${cx})`);
    // Neighbours within a row sit exactly `spacing` apart.
    const xs = list.map((s) => s.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(Math.abs(xs[i] - xs[i - 1] - spacing) < EPS);
    }
    // Bottom row rests on the ground (centre at tube radius); each higher
    // row rises one nestStep.
    const y = list[0].y;
    assert.ok(Math.abs(y - (tubeR + row * nestStep)) < EPS);
    if (prevY !== null) assert.ok(Math.abs(y - prevY - nestStep) < EPS);
    prevY = y;
  }
});

test('row offset stacks each upper tire over the next lower tire', () => {
  const spacing = 1.25;
  const slots = tirePyramidSlots({ rows: 5, spacing, rowOffset: spacing / 2 });
  for (let row = 1; row < 5; row++) {
    const upper = slots.filter((s) => s.row === row);
    const lower = slots.filter((s) => s.row === row - 1);
    for (let i = 0; i < upper.length; i++) {
      assert.ok(Math.abs(upper[i].x - lower[i + 1].x) < EPS,
        `row ${row} tire ${i} is not over lower tire ${i + 1}`);
    }
  }
});

test('support map covers every non-bottom slot exactly once with valid pairs', () => {
  for (const rows of [2, 3, 5, 8]) {
    const slots = tirePyramidSlots({ rows });
    const supports = tirePyramidSupports(rows);
    assert.equal(supports.length, slots.length - rows);
    const seen = new Set();
    // Running start index of each row in slot order.
    const rowStart = (r) => r * rows - (r * (r - 1)) / 2;
    for (const w of supports) {
      assert.ok(!seen.has(w.slot), `slot ${w.slot} supported twice`);
      seen.add(w.slot);
      assert.equal(w.b, w.a + 1, 'supporters must be adjacent');
      const row = slots[w.slot].row;
      assert.ok(w.a >= rowStart(row - 1) && w.b <= rowStart(row) - 1,
        `supporters of slot ${w.slot} not in the row below`);
    }
    for (let s = rows; s < slots.length; s++) {
      assert.ok(seen.has(s), `slot ${s} has no support entry`);
    }
  }
});

test('each tire sits centred between its two supporters', () => {
  const rows = 5;
  const slots = tirePyramidSlots({ rows });
  for (const w of tirePyramidSupports(rows)) {
    const mid = (slots[w.a].x + slots[w.b].x) / 2;
    assert.ok(Math.abs(slots[w.slot].x - mid) < EPS,
      `slot ${w.slot} not centred over supporters (${slots[w.slot].x} vs ${mid})`);
    assert.ok(slots[w.slot].y > slots[w.a].y, 'supported tire must sit above');
  }
});

test('rolling rate matches no-slip: |omega| = |v| / r for perpendicular motion', () => {
  const r = 3.2;
  // Axle along +Z, rolling toward +X → spins negatively about local Z.
  let omega = tireRollOmega(10, 0, 0, 1, r);
  assert.ok(Math.abs(omega - -10 / r) < EPS);
  // Axle along +X, rolling toward +Z → spins positively.
  omega = tireRollOmega(0, 10, 1, 0, r);
  assert.ok(Math.abs(omega - 10 / r) < EPS);
  // Arbitrary diagonal axle with velocity exactly perpendicular to it:
  // â⊥ = (-az, ax), so v = â⊥·|v| must give omega = |v| / r.
  const ax = Math.sin(0.7), az = Math.cos(0.7);
  const speed = 7.5;
  omega = tireRollOmega(-az * speed, ax * speed, ax, az, r);
  assert.ok(Math.abs(omega - speed / r) < EPS);
});

test('rolling rate agrees with the legacy branchy formula it replaces', () => {
  // physics.js used to branch on |az|: omega = -vx/(r·az) or vz/(r·ax).
  // For velocities perpendicular to the axle (the only case the game
  // produces — startFall projects the hit direction), both agree exactly.
  const r = 2.1;
  for (const rotY of [0.3, -0.2, 1.1, Math.PI / 2, 0]) {
    const ax = Math.sin(rotY), az = Math.cos(rotY);
    const speed = 12;
    const vx = -az * speed, vz = ax * speed; // perpendicular unit × speed
    const legacy = Math.abs(az) > 0.01 ? -vx / (r * az) : vz / (r * ax);
    const unified = tireRollOmega(vx, vz, ax, az, r);
    assert.ok(Math.abs(legacy - unified) < 1e-9, `rotY=${rotY}`);
  }
});
