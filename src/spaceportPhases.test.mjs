// The spacecraft choreography, tested as a pure timeline (src/spaceportPhases.js),
// which src/spaceport.js feeds with the game clock. This pins the behaviour the
// ship animation is built on:
//
//   1. The loop is a fixed ordered list of named segments and the phase lookup
//      wraps cleanly, so the fleet never stalls or lands in a gap.
//   2. Every derived value is normalised into its legal range (0..1, or 0..MAX_Y
//      for altitude) at every instant of the cycle.
//   3. The story actually happens in order: the window opens, the arm loads, the
//      hull tilts up, it taxis to the pad, launches high enough to leave the
//      view, comes back down and lies flat again ready to be refilled.
//
// Run: node --test src/spaceportPhases.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHIP_SEGMENTS,
  SHIP_CYCLE,
  SHIP_MAX_Y,
  SHIP_HOVER_Y,
  shipPhaseAt,
  shipOffsets,
  shipStateAt,
} from './spaceportPhases.js';

// Start time of a named segment inside one loop.
function startOf(name) {
  let t = 0;
  for (const [n, dur] of SHIP_SEGMENTS) { if (n === name) return t; t += dur; }
  throw new Error(`no segment named ${name}`);
}
const mid = (name) => startOf(name) + SHIP_SEGMENTS.find(([n]) => n === name)[1] / 2;

test('the loop is an ordered list of positive segments that sums to SHIP_CYCLE', () => {
  assert.ok(SHIP_SEGMENTS.length >= 10, 'the loop should have every beat of the story');
  for (const [name, dur] of SHIP_SEGMENTS) {
    assert.equal(typeof name, 'string');
    assert.ok(dur > 0, `segment "${name}" must have positive duration`);
  }
  const sum = SHIP_SEGMENTS.reduce((a, s) => a + s[1], 0);
  assert.equal(SHIP_CYCLE, sum);
  assert.ok(SHIP_MAX_Y > 40, 'a launch must climb high enough to leave the view');
  assert.ok(SHIP_HOVER_Y > 0 && SHIP_HOVER_Y < SHIP_MAX_Y);
});

test('shipPhaseAt wraps and always lands inside a real segment', () => {
  const names = new Set(SHIP_SEGMENTS.map(([n]) => n));
  for (let i = 0; i < 400; i++) {
    const t = (i / 400) * SHIP_CYCLE * 3 - SHIP_CYCLE;   // negative through three loops
    const { phase, local } = shipPhaseAt(t);
    assert.ok(names.has(phase), `phase "${phase}" at t=${t} is not a segment`);
    assert.ok(local >= 0 && local < 1.0000001, `local ${local} out of range at t=${t}`);
  }
  // A full cycle later is the identical pose.
  const a = shipPhaseAt(1.234);
  const b = shipPhaseAt(1.234 + SHIP_CYCLE);
  assert.equal(a.phase, b.phase, 'same point one cycle on must be the same phase');
  assert.ok(Math.abs(a.local - b.local) < 1e-9, 'and the same point inside it');
});

test('shipOffsets spaces the fleet evenly around the loop', () => {
  const offs = shipOffsets(4);
  assert.equal(offs.length, 4);
  assert.equal(offs[0], 0);
  for (let i = 1; i < offs.length; i++) {
    assert.ok(Math.abs(offs[i] - (i / 4) * SHIP_CYCLE) < 1e-9);
  }
});

test('the two-ship fleet never shares the single pad', () => {
  // Two ships (see spaceport.js dockDefs) share one launch pad. Their offsets are
  // half a cycle apart, which must stay longer than the pad window (taxi..back,
  // 20.9s) or one rocket would land on top of another. Sweep a whole loop and
  // assert they are never both on the pad at once.
  const offs = shipOffsets(2);
  assert.equal(offs.length, 2);
  for (let i = 0; i < 8800; i++) {
    const t = (i / 8800) * SHIP_CYCLE;
    const a = shipStateAt(t, offs[0]);
    const b = shipStateAt(t, offs[1]);
    assert.ok(!(a.pad > 0.5 && b.pad > 0.5),
      `both ships on the pad at t=${t.toFixed(2)} (pad ${a.pad.toFixed(2)}, ${b.pad.toFixed(2)})`);
  }
});

test('every derived value stays in range for the whole loop', () => {
  for (let i = 0; i < 500; i++) {
    const t = (i / 500) * SHIP_CYCLE;
    const s = shipStateAt(t, 0);
    for (const k of ['windowOpen', 'arm', 'cargo', 'tilt', 'pad', 'plume']) {
      assert.ok(s[k] >= 0 && s[k] <= 1, `${k}=${s[k]} out of 0..1 at t=${t}`);
    }
    assert.ok(s.y >= 0 && s.y <= SHIP_MAX_Y, `y=${s.y} out of range at t=${t}`);
  }
});

test('the ship starts the loop parked and flat, window shut', () => {
  const s = shipStateAt(0, 0);
  assert.equal(s.phase, 'dock');
  assert.equal(s.windowOpen, 0);
  assert.equal(s.tilt, 0);
  assert.equal(s.pad, 0);
  assert.equal(s.y, 0);
  assert.equal(s.plume, 0);
});

test('the window opens, the arm loads cargo, then it closes and stows', () => {
  assert.equal(shipStateAt(mid('load'), 0).windowOpen, 1, 'window should be wide open while loading');
  assert.equal(shipStateAt(mid('load'), 0).arm, 1, 'the arm should be over the hatch while loading');
  assert.ok(shipStateAt(startOf('close'), 0).windowOpen > 0.99, 'window is still open as close begins');
  assert.ok(shipStateAt(startOf('tilt'), 0).windowOpen < 0.01, 'window is shut before the launch');
  assert.ok(shipStateAt(startOf('tilt'), 0).arm < 0.01, 'the arm is stowed before the launch');
  // Cargo climbs from empty to full across the load, then stays aboard mid-flight.
  assert.ok(shipStateAt(startOf('load'), 0).cargo < 0.01);
  assert.ok(shipStateAt(mid('load'), 0).cargo > shipStateAt(startOf('load') + 0.1, 0).cargo);
  assert.equal(shipStateAt(mid('ascend'), 0).cargo, 1, 'cargo rides along through the flight');
});

test('the hull tilts up, taxes to the pad, and launches out of sight', () => {
  assert.ok(shipStateAt(startOf('tilt'), 0).tilt < 0.01);
  assert.ok(shipStateAt(startOf('taxi'), 0).tilt > 0.99, 'it must be upright before taxiing');
  assert.ok(shipStateAt(mid('taxi'), 0).pad > 0 && shipStateAt(mid('taxi'), 0).pad < 1);
  assert.equal(shipStateAt(mid('ignite'), 0).pad, 1, 'it is on the pad when the engine lights');
  assert.equal(shipStateAt(mid('absent'), 0).y, SHIP_MAX_Y, 'it is fully gone during "absent"');
  assert.equal(shipStateAt(mid('ascend'), 0).plume, 1, 'the main engine burns all the way up');
  assert.ok(shipStateAt(startOf('ascend'), 0).y > 0, 'it leaves the pad during ascent');
});

test('it comes back down, lies flat again and re-docks empty', () => {
  const descendEnd = startOf('descend') + SHIP_SEGMENTS.find(([n]) => n === 'descend')[1];
  assert.ok(shipStateAt(descendEnd - 0.001, 0).y <= SHIP_HOVER_Y + 0.5,
    'it descends to just above the pad');
  assert.ok(shipStateAt(startOf('untilt'), 0).tilt > 0.99, 'still upright as it settles');
  assert.ok(shipStateAt(startOf('back'), 0).tilt < 0.01, 'flat again before sliding back');
  assert.ok(shipStateAt(startOf('back'), 0).pad > 0.99, 'still on the pad as the return begins');
  // By the very end of the loop it is back home, empty, ready to refill.
  const end = shipStateAt(SHIP_CYCLE - 1e-6, 0);
  assert.ok(end.pad < 0.01, 'it has returned to its cradle');
  assert.ok(end.cargo < 0.01, 'the cargo was delivered, so it is empty again');
});

test('a mid-cycle ship never jumps: fine sampling shows no teleport', () => {
  let prev = shipStateAt(0, 0);
  for (let i = 1; i <= 2000; i++) {
    const s = shipStateAt((i / 2000) * SHIP_CYCLE, 0);
    // Altitude changes at most a little per fine step (no instant warp).
    assert.ok(Math.abs(s.y - prev.y) < SHIP_MAX_Y / 20,
      `altitude jumped at step ${i}: ${prev.y} -> ${s.y}`);
    prev = s;
  }
});
