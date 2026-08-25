// Pure layout math for the Holy Mountain — the hollow, snow-capped peak
// standing in the underground cavern's open west half. You can drive the
// pilgrim's road up to its snowy summit, but the mountain is hollow: around
// on its far side a cave mouth opens into a torch-lit chamber where a man
// in a huge brimmed white hat stands flanked by two goats under a mysterious
// light. There are no meshes here — every function returns plain numbers /
// rects so node --test can verify the driving-surface and collision-layout
// invariants, and the level file turns them into three.js objects.

export const MOUNT = {
  cx: -95, cz: 0,        // centre on the cavern floor (open west half)
  baseR: 34,             // cone radius at y=0
  padR: 5.5,             // cone radius where it's cut flat (the summit pad)
  peakY: 26,             // summit pad height — highest point in the cavern
  snowY: 17,             // snowline: rock below, snow cap above
  archH: 7.5,            // cave-mouth lintel height
  archHalf: 0.26,        // half-angle (rad) of the mouth gap ≈ ±15°
  mouthDeg: 225,         // mouth azimuth (CCW from +X/east) — far side from
                         // the road start, so you must drive around to see in
  roadHalfW: 4.5,        // pilgrim's road half width
  roadClear: 1.2,        // gap between road inner edge and the cone surface
  segsPerRev: 14,        // road wedge segments per revolution
  revs: 1.5,             // total turns from floor to summit
};

// Cavern slab bounds the whole layout must stay inside (mirrors the level's
// SLAB constant without importing it — keeps this module dependency-free).
export const SLAB_BOUNDS = { minX: -146, maxX: 146, minZ: -96.5, maxZ: 179.5 };

const TAU = Math.PI * 2;

// Cone silhouette: linear radius from baseR at y=0 down to padR at peakY.
export function coneRadiusAt(y, cfg = MOUNT) {
  const t = Math.max(0, Math.min(1, y / cfg.peakY));
  return cfg.baseR + (cfg.padR - cfg.baseR) * t;
}

// Road centreline radius: hugs the cone with a fixed clearance plus half the
// road width, so the wedge spirals tightly inward as it climbs.
export function roadCenterRadiusAt(y, cfg = MOUNT) {
  return coneRadiusAt(y, cfg) + cfg.roadHalfW + cfg.roadClear;
}

// The pilgrim's road: `revs * segsPerRev` chained wedge ramps spiralling up
// the outside of the cone. Each entry is an addUgRamp-style def ({x, z,
// runX, runZ, len, width, height, baseY, boost}) whose start edge continues
// exactly where the previous wedge ended, plus a `collider`: the axis-aligned
// bounding rect of the rotated plank marked `soft`. The soft rect feeds
// buildingTopAt, which lifts wall-blocking while the car is ON the road
// (main.js `elevated` gate) — without it the invisible slope-blocking rings
// under the lower road would stop the car mid-climb.
export function spiralSegments(cfg = MOUNT) {
  const total = Math.round(cfg.revs * cfg.segsPerRev);
  const climb = cfg.peakY / total;
  const segs = [];
  let px = cfg.cx + roadCenterRadiusAt(0, cfg);   // φ starts at 0 (east side,
  let pz = cfg.cz;                                // facing the course zone)
  let py = 0;
  for (let k = 1; k <= total; k++) {
    const phi = (k / cfg.segsPerRev) * TAU;
    const y = k * climb;
    const r = roadCenterRadiusAt(y, cfg);
    const nx = cfg.cx + r * Math.cos(phi);
    const nz = cfg.cz + r * Math.sin(phi);
    const dx = nx - px, dz = nz - pz;
    const len = Math.hypot(dx, dz);
    const runX = dx / len, runZ = dz / len;
    segs.push({
      x: (px + nx) / 2, z: (pz + nz) / 2,
      runX, runZ,
      len,
      width: cfg.roadHalfW * 2,
      height: y - py,
      baseY: py,
      boost: 1,
      collider: {
        x: (px + nx) / 2, z: (pz + nz) / 2,
        halfW: Math.abs(runX) * len / 2 + Math.abs(runZ) * cfg.roadHalfW,
        halfD: Math.abs(runZ) * len / 2 + Math.abs(runX) * cfg.roadHalfW,
        h: y,
        soft: true,
      },
    });
    px = nx; pz = nz; py = y;
  }
  // Summit apron: a near-flat lead-in from the last spiral point onto the
  // peak pad. The centreline ends `roadHalfW + roadClear` short of the axis,
  // just outside the pad rect — this bridge overlaps the pad so the car
  // rolls straight off the road onto the summit with no hop.
  const phiN = (total / cfg.segsPerRev) * TAU;
  const ex = Math.cos(phiN), ez = Math.sin(phiN);
  const ax = px - ex * 6.5, az = pz - ez * 6.5;
  segs.push({
    x: (px + ax) / 2, z: (pz + az) / 2,
    runX: -ex, runZ: -ez,
    len: 6.5,
    width: cfg.roadHalfW * 2,
    height: 0.05,
    baseY: py,
    boost: 1,
    collider: {
      x: (px + ax) / 2, z: (pz + az) / 2,
      halfW: Math.abs(ex) * 6.5 / 2 + Math.abs(ez) * cfg.roadHalfW,
      halfD: Math.abs(ez) * 6.5 / 2 + Math.abs(ex) * cfg.roadHalfW,
      h: py + 0.05,
      soft: true,
    },
  });
  return segs;
}

function wrapPi(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// Collision layout for everything that isn't a drivable ramp. Solid rects
// seal the mountain's flank (grounded cars can't drive through the visual
// rock) while leaving the mouth corridor and the road fully open; soft rects
// are rideable surfaces (summit pad, the chamber ceiling around the oculus
// skylight). Rect format matches the game: {x, z, halfW, halfD, h, soft?}.
export function mountainBlockers(cfg = MOUNT) {
  const betaM = (cfg.mouthDeg * Math.PI) / 180;
  const dirX = Math.cos(betaM), dirZ = Math.sin(betaM);     // mouth direction
  const perpX = -dirZ, perpZ = dirX;                        // left of mouth

  const solids = [];
  const softs = [];
  // Angular distance from a box centre to the mouth azimuth (radians).
  const fromMouth = (phi) => Math.abs(wrapPi(phi - betaM));

  // Outer flank ring: 12 buried boxes just inside the visual base. Skip the
  // two covering the mouth sector so the cave passage stays open.
  for (let k = 0; k < 12; k++) {
    const phi = (k / 12) * TAU;
    if (fromMouth(phi) < Math.PI / 6) continue;
    const r = 25;
    solids.push({ x: cfg.cx + r * Math.cos(phi), z: cfg.cz + r * Math.sin(phi), halfW: 6, halfD: 6, h: 8 });
  }
  // Inner flank ring: stops a car slipping under the low road sections from
  // cutting clean through the rock. 12 smaller boxes tile tightly enough to
  // leave no car-sized slit, and sit fully clear of the mouth corridor.
  for (let k = 0; k < 12; k++) {
    const phi = (k / 12) * TAU;
    if (fromMouth(phi) < Math.PI / 6) continue;
    const r = 16.5;
    solids.push({ x: cfg.cx + r * Math.cos(phi), z: cfg.cz + r * Math.sin(phi), halfW: 4.2, halfD: 4.2, h: 8 });
  }
  // Mouth jamb shoulders: seal the seam between the skipped flank boxes and
  // the tunnel walls without pinching the arch's drivable core.
  for (const jd of [-50, 50]) {
    const phi = betaM + (jd * Math.PI) / 180;
    const r = 24;
    solids.push({ x: cfg.cx + r * Math.cos(phi), z: cfg.cz + r * Math.sin(phi), halfW: 3.5, halfD: 3.5, h: 8 });
  }
  // Tunnel side walls: a fine staircase of small boxes per side flanking the
  // arch edges from the chamber wall out to the shell. Small squares hug the
  // diagonal edge line far better than fat ones — the effective inner face
  // stays a full car-width clear of the arch edge everywhere, while adjacent
  // boxes overlap so nothing car-sized can slip between them.
  for (const s of [-1, 1]) {
    for (let di = 13.5; di <= 25.5; di += 3) {
      const off = di * Math.sin(cfg.archHalf) + 4.2;
      solids.push({
        x: cfg.cx + dirX * di + perpX * s * off,
        z: cfg.cz + dirZ * di + perpZ * s * off,
        halfW: 1.6, halfD: 1.6, h: 8,
      });
    }
  }
  // Chamber wall ring: keeps the car inside the hollow once it drives in.
  // Skip the box covering the entrance.
  for (let k = 0; k < 8; k++) {
    const phi = (k / 8) * TAU;
    if (fromMouth(phi) < Math.PI / 6) continue;
    const r = 12.5;
    solids.push({ x: cfg.cx + r * Math.cos(phi), z: cfg.cz + r * Math.sin(phi), halfW: 3.4, halfD: 3.4, h: 17 });
  }
  // The shrine dais: bonk politely instead of ghosting through the holy man
  // and his goats.
  solids.push({ x: cfg.cx, z: cfg.cz, halfW: 3.6, halfD: 3.6, h: 3.4 });

  // Summit pad: soft so buildingTopAt/ugElevatorTopAt seat the car arriving
  // off the last road wedge (its inner edge overlaps the pad rim).
  softs.push({ x: cfg.cx, z: cfg.cz, halfW: cfg.padR + 0.4, halfD: cfg.padR + 0.4, h: cfg.peakY, soft: true });
  // Chamber ceiling around the oculus: four planks forming a square annulus
  // (outer 14, hole ±9.5) — land on the roof of the hollow, roll into the
  // skylight hole, drop into the chamber.
  const outer = 14, hole = 9.5;
  const mid = (outer + hole) / 2, half = (outer - hole) / 2;
  softs.push({ x: cfg.cx, z: cfg.cz - mid, halfW: outer, halfD: half, h: 17, soft: true });
  softs.push({ x: cfg.cx, z: cfg.cz + mid, halfW: outer, halfD: half, h: 17, soft: true });
  softs.push({ x: cfg.cx + mid, z: cfg.cz, halfW: half, halfD: outer, h: 17, soft: true });
  softs.push({ x: cfg.cx - mid, z: cfg.cz, halfW: half, halfD: outer, h: 17, soft: true });

  return { solids, softs };
}

// Mouth frame data the level needs for mesh placement (throat edge angles
// and radii), derived from the same config.
export function mouthFrame(cfg = MOUNT) {
  const betaM = (cfg.mouthDeg * Math.PI) / 180;
  return {
    betaM,
    dirX: Math.cos(betaM),
    dirZ: Math.sin(betaM),
    edgeBeta: [betaM - cfg.archHalf, betaM + cfg.archHalf],
    throatOuterR: coneRadiusAt(cfg.archH, cfg),   // shell radius at lintel top
    throatInnerR: 12.5,                            // chamber wall radius
  };
}
