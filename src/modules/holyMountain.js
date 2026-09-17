// Pure layout math for the Holy Mountain — the hollow, snow-capped peak
// standing in the underground cavern's open west half. You can drive the
// pilgrim's road up to its snowy summit skylight rim. The mountain has NO
// cave mouth: its base is solid rock all the way round (the outside face is
// the drives-up-anywhere skin, the ground ring is a solid skirt), the only way
// in is the summit skylight (an open hole in the cone's very top — roll over
// it and you drop straight down through the chamber's oculus onto the floor
// beside the man with his goats and their mysterious light), and the only way
// out is the staged "mysterious ejection" that lifts the car back out through
// the skylight and over the cone onto the open cavern floor. The chamber
// itself is too small to drive around, so it's a cutscene, not a driving
// surface. There are no meshes here — every function returns plain numbers /
// rects so node --test can verify the driving-surface and collision-layout
// invariants, and the level file turns them into three.js objects.

export const MOUNT = {
  cx: -100, cz: 8,       // centre on the cavern floor (open west half) — kept
                         // clear of the neon staircase (south-east), the glass
                         // city (north-east) and all slab walls
  baseR: 34,             // cone radius at y=0
  padR: 9.5,             // cone radius where it's cut flat — the OUTER edge of
                         // the summit skylight rim the road lands on
  skylightR: 4.5,        // radius of the open skylight hole in the summit — the
                         // whole "top of the mountain" you drive over and drop
                         // into to see the man and his goats below
  peakY: 26,             // summit rim height — highest point in the cavern
  snowY: 17,             // snowline: rock below, snow cap above
  archH: 7.5,            // rock band split height (lintel legacy — base band
                         // top); no mouth opening exists, the band is full circle
  archHalf: 0.26,        // half-angle (rad) kept only for mouthFrame's legacy
                         // edge data — no longer punches a gap in the shell
  mouthDeg: 225,         // azimuth (CCW from +X/east) the old mouth faced — now
                         // only orients the shrine inside the chamber
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

// Inverse of coneRadiusAt: the surface height of the cone at horizontal
// radius r from the axis. Clamped to the cone's actual band (0..peakY).
export function coneHeightAt(r, cfg = MOUNT) {
  const slope = cfg.baseR - cfg.padR;                       // horizontal run of the face
  const t = Math.max(0, Math.min(1, (cfg.baseR - r) / slope));
  return cfg.peakY * t;
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
  // summit skylight rim. The centreline ends `roadHalfW + roadClear` short of
  // the axis, just outside the rim's outer edge — this bridge overlaps the
  // ring of the summit so the car rolls straight off the road onto the rim
  // with no hop.
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

// Direct-climb skin: a dense ring of slim radial ramps tiling the cone's
// whole outside from base to summit. Run direction points radially inward
// along the cone generator, so each wedge's surface IS the cone surface — the
// level registers them (after the spiral road, which wins on overlaps) as
// invisible ride-able ramps over the shell visuals. That makes the entire
// mountain face drivable: you can buzz straight up the rock anywhere instead
// of only following the pilgrim's road. The ring is FULL circle — there is no
// cave mouth any more, so every azimuth is covered and there is no flat
// pass-through where a grounded car could drive into the rock.
const SKIN_SECTORS = 48;   // azimuth divisions around the cone
const SKIN_BANDS = 12;     // equal-height bands from base to summit
export function coneSkinSegments(cfg = MOUNT, sectors = SKIN_SECTORS, bands = SKIN_BANDS) {
  const bandH = cfg.peakY / bands;
  const segs = [];
  const over = 1.2;        // width overlap factor: guarantees no azimuth seams
  for (let b = 0; b < bands; b++) {
    const y0 = b * bandH, y1 = y0 + bandH;
    const r0 = coneRadiusAt(y0, cfg), r1 = coneRadiusAt(y1, cfg);
    const len = Math.hypot(r0 - r1, bandH);          // length along the slope
    const width = ((2 * Math.PI * r0) / sectors) * over;   // arc at the widest (bottom) end
    for (let k = 0; k < sectors; k++) {
      const phi = ((k + 0.5) / sectors) * TAU;
      const dx = Math.cos(phi), dz = Math.sin(phi);
      const cx = cfg.cx + ((r0 + r1) / 2) * dx;
      const cz = cfg.cz + ((r0 + r1) / 2) * dz;
      segs.push({
        x: cx, z: cz,
        runX: -dx, runZ: -dz,          // inward = uphill
        len,
        width,
        height: bandH,
        baseY: y0,
        boost: 1,
        collider: {
          x: cx, z: cz,
          halfW: Math.abs(dx) * len / 2 + Math.abs(dz) * width / 2,
          halfD: Math.abs(dz) * len / 2 + Math.abs(dx) * width / 2,
          h: y1,
          soft: true,
        },
      });
    }
  }
  return segs;
}

// Collision layout for everything that isn't a drivable ramp. Solid rects make
// the cone base SOLID to grounded cars (you bump the rock instead of driving
// through it) and protect the hollow chamber's shrine; soft rects are rideable
// surfaces (the summit skylight rim, the chamber ceiling around the oculus
// skylight). The drives-up-anywhere cone face is handled by coneSkinSegments'
// ride-able ramps, which lift a climbing car above the `elevated` gate in
// main.js — so the base ring below can never fence off the climb. Rect format
// matches the game: {x, z, halfW, halfD, h, soft?}.
export function mountainBlockers(cfg = MOUNT) {
  const solids = [];
  const softs = [];

  // Base skirt: a full ring of overlapping boxes tucked just inside the cone's
  // ground footprint, so a GROUNDED car that isn't riding the skin bumps the
  // mountain instead of ghosting through the rock. Every box corner stays well
  // inside the radius where the skin has already lifted a climbing car above
  // the `car.y > 0.5` elevation threshold, so a car driving at the mountain is
  // riding the face (and therefore `elevated`, which skips solids) before the
  // ring can block it — no deadlock at the base.
  const SKIRT_BOXES = 30;
  const skirtR = 26, skirtHalf = 3.2;
  for (let k = 0; k < SKIRT_BOXES; k++) {
    const phi = (k / SKIRT_BOXES) * TAU;
    solids.push({
      x: cfg.cx + skirtR * Math.cos(phi),
      z: cfg.cz + skirtR * Math.sin(phi),
      halfW: skirtHalf, halfD: skirtHalf, h: 8,
    });
  }

  // Chamber wall ring: full circle around the hollow, so a car that drops in
  // through the skylight can't ghost through the chamber wall before the
  // ejection cinematic runs.
  for (let k = 0; k < 8; k++) {
    const phi = (k / 8) * TAU;
    const r = 12.5;
    solids.push({ x: cfg.cx + r * Math.cos(phi), z: cfg.cz + r * Math.sin(phi), halfW: 3.4, halfD: 3.4, h: 17 });
  }
  // The shrine dais: bonk politely instead of ghosting through the holy man
  // and his goats.
  solids.push({ x: cfg.cx, z: cfg.cz, halfW: 3.6, halfD: 3.6, h: 3.4 });

  // Summit skylight rim: four planks forming a square annulus (outer
  // padR + 0.4 = 9.9, hole ±skylightR·√2) sitting flat on the top of the
  // mountain. Soft so buildingTopAt/ugElevatorTopAt seat the car arriving off
  // the last road wedge (its inner edge overlaps the outer half of the ring).
  // The centre is deliberately left OPEN — that open circle **is** the
  // skylight, the "drop in through the top" you drive over and fall through
  // into the chamber below.
  const ringOuter = cfg.padR + 0.4, ringInner = cfg.skylightR;
  const rmid = (ringOuter + ringInner) / 2, rhalf = (ringOuter - ringInner) / 2;
  const rimTop = cfg.peakY;
  softs.push({ x: cfg.cx, z: cfg.cz - rmid, halfW: ringOuter, halfD: rhalf, h: rimTop, soft: true });
  softs.push({ x: cfg.cx, z: cfg.cz + rmid, halfW: ringOuter, halfD: rhalf, h: rimTop, soft: true });
  softs.push({ x: cfg.cx + rmid, z: cfg.cz, halfW: rhalf, halfD: ringOuter, h: rimTop, soft: true });
  softs.push({ x: cfg.cx - rmid, z: cfg.cz, halfW: rhalf, halfD: ringOuter, h: rimTop, soft: true });
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

// Legacy mouth-frame data. There is no cave mouth any more, so the level only
// uses this to orient the shrine inside the chamber (its `betaM` facing); the
// throat radii/edges are kept for compatibility and tests.
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
