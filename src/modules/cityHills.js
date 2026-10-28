// ===== The outer belt's rolling hills ========================================
// The green hills out past the railway are REAL ground: the car drives up and
// over them, and a knocked tire rests on their slope instead of sinking into
// it. They used to be bare cone meshes with nothing behind them, so the car
// drove straight through and anything thrown at one vanished into it.
//
// One height function serves both jobs, and the mesh is built FROM it — the
// ground you see and the ground the physics rides are the same surface, which
// is the only way a hill can be driven on without the car floating above it or
// sinking into it.
//
// Pure maths, no three.js, so `node --test` can check it directly.
export const CITY_HILLS = Object.freeze([
  { x: 124, z: -66, r: 22, h: 8 },    // south of the soccer pitch
  { x: 124, z: 150, r: 22, h: 9 },    // and north of it
  { x: 60, z: -172, r: 20, h: 7 },
  { x: -138, z: 128, r: 16, h: 7 },
]);

// The profile of one hill at a distance from its centre. A cosine dome: flat at
// the foot (so the car rolls on without a lip to climb) and flat at the crown
// (so it does not spike the nose over the top), steepest halfway up.
export function hillProfileAt(hill, distance) {
  if (distance >= hill.r) return 0;
  return hill.h * 0.5 * (1 + Math.cos((distance / hill.r) * Math.PI));
}

// How high the hills stand at a point — 0 anywhere off them. Hills are spaced
// far apart, so the tallest of them is simply the height there.
export function natureHillHeightAt(x, z) {
  let best = 0;
  for (const hill of CITY_HILLS) {
    const dx = x - hill.x, dz = z - hill.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= hill.r * hill.r) continue;
    const y = hillProfileAt(hill, Math.sqrt(d2));
    if (y > best) best = y;
  }
  return best;
}
