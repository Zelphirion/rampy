// Scratch harness for designing the freehand Hot Wheels coaster. Not shipped.
import { buildTrack, teardropLoopNodes } from './hotwheels.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const ANCHORS = [
  [-12, 0, -22],
  [-12, 4, -42],
  [-17, 7, -54],
  [-32, 9, -60],
  [-48, 11, -62],
  [-64, 10, -60],
  [-78, 12, -54],
  [-78, 15, -42],
  [-70, 17, -28],
  [-66, 16, -16],
  [-60, 14, -2],
  [-54, 12, 14],
  [-58, 16, 30],
  [-44, 20, 42],
  [-30, 22, 48],
  [-26, 20, 60],
  [-24, 24, 74],
  [-30, 18, 84],
  [-14, 22, 86],
  [4, 20, 84],
  [24, 24, 82],
  [44, 22, 82],
  [64, 24, 80],
  [80, 22, 72],
  [82, 18, 60],
  [66, 16, 58],
  [48, 14, 60],
  [28, 12, 62],
  [20, 14, 50],
  [20, 18, 40],
  [24, 16, 26],
  [30, 14, 14],
  [44, 14, 6],
  [58, 16, 6],
  [72, 18, 12],
  [80, 18, 24],
  [72, 20, 36],
  [58, 22, 30],
  [52, 24, 14],
  [46, 22, 6],
  [26, 20, -6],
  [16, 16, -22],
  [16, 14, -40],
  [16, 12, -58],
  [28, 14, -66],
  [48, 16, -68],
  [66, 18, -68],
  [80, 20, -62],
  [82, 22, -50],
  [74, 18, -40],
  [60, 16, -52],
  [52, 14, -56],
  [40, 12, -56],
  [24, 10, -56],
  [10, 8, -56],
  [0, 7, -62],
  [-8, 5, -70],
  [-10, 1, -78],
  [-18, 0, -80],
  [-26, 0, -78],
  [-28, 1, -72],
  [-26, 0.5, -66],
];

export const LOOP = { cx: -24, cz: -62, rBot: 6, rTop: 2.8, steps: 16, heading: Math.PI / 2 };

export function rideNodes(anchors) {
  const n = anchors.length;
  const dir = (i) => {
    const a = anchors[i], b = anchors[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const m = Math.hypot(dx, dz) || 1;
    return { x: dx / m, z: dz / m };
  };
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const a = anchors[i];
    let roll = 0;
    if (i > 0 && i < n - 1) {
      const d0 = dir(i - 1), d1 = dir(i);
      const cross = d0.x * d1.z - d0.z * d1.x;
      const dotv = d0.x * d1.x + d0.z * d1.z;
      const turn = Math.atan2(cross, dotv);
      roll = clamp(0.7 * turn, -0.55, 0.55);
    }
    nodes.push({ x: a[0], y: a[1], z: a[2], ux: 0, uy: 1, uz: 0, roll });
  }
  return nodes;
}

export function candidateNodes() {
  const nodes = rideNodes(ANCHORS);
  // teardrop loop, entered heading north (+Z) at the last anchor
  const mouth = { x: 0, y: 4, z: -62 };  // placeholder
  const L = LOOP;
  const loop = teardropLoopNodes(L.cx, 0, LOOP.cz, LOOP.rBot, L.rTop, LOOP.steps, 0, 0, LOOP.heading);
  for (let i = 0; i < loop.length; i++) nodes.push(loop[i]);
  // launch north off the loop exit
  const out = loop[loop.length - 1];
  const LIP = 26, dy = 13;
  const n = 6;
  for (let i = 1; i <= n; i++) nodes.push({ x: out.x, y: out.y + 13 * (i / n), z: out.z + 22 * (i / n), ux: 0, uy: 1, uz: 0, roll: 0 });
  return nodes;
}

// ---- checks ----
export function check(nodes, label = 'route') {
  const track = buildTrack(nodes);
  const HOUSE = { x0: -90, x1: 90, z0: -86, z1: 94 };
  const CEIL = 36;
  const PLAY = { x0: -46, x1: 6, z0: -86, z1: -20 };
  const errs = [];
  for (const p of track.samples) if (!(p.x > HOUSE.x0 && p.x < HOUSE.x1)) { errs.push(`x out ${p.x.toFixed(1)} @s${p.s.toFixed(1)}`); break; }
  for (const p of track.samples) if (!(p.z > HOUSE.z0 && p.z < HOUSE.z1)) { errs.push(`z out ${p.z.toFixed(1)} @s${p.s.toFixed(1)}`); break; }
  for (const p of track.samples) if (!(p.y >= -0.01 && p.y < CEIL)) { errs.push(`y out ${p.y.toFixed(1)} @s${p.s.toFixed(1)}`); break; }
  for (const p of track.samples) if (p.y < 4 && !(p.x > PLAY.x0 && p.x < PLAY.x1 && p.z > PLAY.z0 && p.z < PLAY.z1)) { errs.push(`low outside playroom (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) @s${p.s.toFixed(1)}`); break; }
  const MIN_ARC = 8, CLEAR = 2.8;
  let worst = { d: 99, a: null, b: null };
  for (let i = 0; i < track.samples.length; i++) {
    const a = track.samples[i];
    for (let j = i + 1; j < track.samples.length; j++) {
      const b = track.samples[j];
      if (b.s - a.s < MIN_ARC) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (d < worst.d) worst = { d, a, b };
      if (d < CLEAR) errs.push(`cross s${a.s.toFixed(1)}(${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)}) vs s${b.s.toFixed(1)}(${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}) d=${d.toFixed(2)}`);
    }
  }
  let minUy = 1, top = null;
  for (const p of track.samples) if (p.uy < minUy) { minUy = p.uy; top = p; }
  console.log(`--- ${label}: len=${track.length.toFixed(1)} samples=${track.samples.length} ---`);
  console.log(`worst self-gap ${worst.d.toFixed(2)} at s${worst.a?.s.toFixed(1)} vs s${worst.b?.s.toFixed(1)}`);
  if (top) console.log(`min up.y=${minUy.toFixed(2)} at y=${top.y.toFixed(1)} s=${top.s.toFixed(1)}`);
  if (errs.length) { console.log('ERRORS:'); for (const e of errs.slice(0, 30)) console.log('  ', e); }
  else console.log('all basic checks pass');
  return { track, errs, worst, minUy };
}

export function plan(nodes) {
  const track = buildTrack(nodes);
  const cells = 4;
  const cols = 180 / cells, rows = 180 / cells;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  for (const p of track.samples) {
    const c = Math.floor((p.x + 90) / cells), r = Math.floor((94 - p.z) / cells);
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    const h = p.y;
    grid[r][c] = h > 18 ? '@' : h > 13 ? '#' : h > 9 ? '+' : h > 5 ? '-' : '.';
  }
  let out = '';
  for (const row of grid) out += row.join('') + '\n';
  console.log(out);
}
