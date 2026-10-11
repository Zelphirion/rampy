import { cliffFaceZ, courseInset, BEACH_CLIFF_SEEDS, CLIFF_REACH } from './src/levels/beach/layout.js';

console.log('CLIFF_REACH', CLIFF_REACH);

function stats(seed, uLo, uHi) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const u = uLo + (uHi - uLo) * (i / 40);
    for (let j = 0; j <= 200; j++) {
      const v = cliffFaceZ(u, j / 200, seed);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  return { mn, mx };
}

for (const seed of BEACH_CLIFF_SEEDS) {
  console.log('seed', seed,
    'carBand u0.5-0.72 faceZ', stats(seed, 0.5, 0.72),
    'full u0-1', stats(seed, 0, 1),
    'courseInset(0.62)=', courseInset(0.62, seed).toFixed(3));
}

// car y on flat foot = BEACH_CLIFF_FOOT_Y=3.4, u=(3.4+40)/70
console.log('u at car foot =', ((3.4 + 40) / 70).toFixed(3));
