// ============================================================================
// The County Fair — layout constants
// ============================================================================
// A flat, walled fairground reached by driving into the circus big top out in
// the city's south-east belt. Everything here is WORLD coordinates; the minimap
// is a 180-degree-rotated view of the same plane (see AGENTS.md).
//
// The ground plan, south (z-) to north (z+):
//
//   z -132  the arrival gate (and the way home) — the car comes in facing +Z
//   z -124 .. 26   the midway: a wide gravel lane with booths on both sides
//   z 40 .. 130    the rides: tilt-a-whirl, ferris wheel, coaster, pendulum,
//                  chair-swing tower
//
// The lane is kept clear between x -11 and 11 so the drive in is never blocked
// by a booth collider.

export const FAIR_GROUND = 0;

// The playable rectangle. The invisible boundary colliders sit on these lines
// and the backstop (clampInsideFair) refuses to let a knock throw the car past
// them — the same two-layer guarantee the cornfield fence gives.
export const FAIR_BOUNDS = { x0: -150, x1: 150, z0: -140, z1: 140 };

// Half-thickness of the boundary collider run, plus a hair.
export const FAIR_WALL_INSET = 0.9;

// Where a car arriving from the circus lands, facing +Z (north) up the midway.
// `yaw` follows the car convention: forward = (-cos yaw, sin yaw), so PI/2 is +Z.
export const FAIR_SPAWN = { x: 0, z: -112, yaw: Math.PI / 2 };

// The way home: the illuminated arch behind the spawn. Drive back into it and
// the car returns to the city, just outside the circus tent.
export const FAIR_RETURN = { x: 0, z: -132, halfW: 6.5, halfD: 4.5 };

// The open driving lane down the middle of the midway.
export const FAIR_LANE = { x0: -9, x1: 9, z0: -124, z1: 26 };

// ===== Rides ================================================================
// `r` is the structural radius; `facing` is a yaw in radians (0 = the ride's
// own +Z face looks north, i.e. away from the arriving car).
export const FERRIS = { x: -76, z: 76, r: 30, hubY: 36, facing: 0.16 };
export const PENDULUM = { x: 52, z: 98, facing: -0.22, armLen: 26 };
export const COASTER = { stationX: 88, stationZ: -18, stationYaw: -Math.PI / 2 };
export const TILT = { x: 8, z: 54, r: 11 };
export const SWINGS = { x: -30, z: 116, h: 30 };

// ===== Midway booths ========================================================
// Every booth's front faces the lane: left-row booths look east (+X), right-row
// booths look west (-X). `kind` picks the builder in index.js.
export const BOOTHS = [
  { id: 'popcorn-n', label: 'Popcorn Carton', kind: 'popcorn', x: -15, z: -94, facing: Math.PI / 2 },
  { id: 'cotton', label: 'Cotton Candy Cloud', kind: 'cotton', x: 15, z: -94, facing: -Math.PI / 2 },
  { id: 'teddy', label: 'Teddy Bear Booth', kind: 'teddy', x: -15, z: -72, facing: Math.PI / 2 },
  { id: 'donut', label: 'Donut Shop', kind: 'donut', x: 15, z: -72, facing: -Math.PI / 2 },
  { id: 'dart', label: 'Dart Board', kind: 'dart', x: -15, z: -50, facing: Math.PI / 2 },
  { id: 'milk', label: 'Milk Bottle Tower', kind: 'milk', x: 15, z: -50, facing: -Math.PI / 2 },
  { id: 'apple', label: 'Candy Apple', kind: 'apple', x: -15, z: -28, facing: Math.PI / 2 },
  { id: 'corndog', label: 'Corn Dog Cart', kind: 'corndog', x: 15, z: -28, facing: -Math.PI / 2 },
  { id: 'icecream', label: 'Ice Cream Cone', kind: 'icecream', x: -15, z: -6, facing: Math.PI / 2 },
  { id: 'ring', label: 'Ring Toss', kind: 'ring', x: 15, z: -6, facing: -Math.PI / 2 },
];

// Spilled popcorn, loose tubs, cups and bottles scattered on the gravel.
// Positions are hand-placed so nothing solid lands in the driving lane.
export const FAIR_SCATTER = [
  { kind: 'tub', x: -10.5, z: -82 }, { kind: 'tub', x: -11.2, z: -80.6 },
  { kind: 'tub', x: -10.2, z: -79.4 }, { kind: 'tub', x: 10.4, z: -62 },
  { kind: 'tub', x: 11.1, z: -60.8 }, { kind: 'tub', x: -10.6, z: -40 },
  { kind: 'cup', x: -9.8, z: -88 }, { kind: 'cup', x: -10.9, z: -86.6 },
  { kind: 'cup', x: 10.1, z: -44 }, { kind: 'cup', x: 9.4, z: -40.4 },
  { kind: 'cup', x: 10.7, z: -90 }, { kind: 'cup', x: -10.1, z: -66 },
  { kind: 'bottles', x: 11.5, z: -50.5 },
  { kind: 'popcorn', x: -8.2, z: -90 }, { kind: 'popcorn', x: 7.4, z: -80 },
  { kind: 'popcorn', x: 8.8, z: -38 }, { kind: 'popcorn', x: -7.8, z: -58 },
  { kind: 'popcorn', x: 6.6, z: -14 }, { kind: 'popcorn', x: -8.2, z: -6 },
  { kind: 'popcorn', x: 5.4, z: -100 }, { kind: 'popcorn', x: -6.2, z: -110 },
];

// The invisible wall run and the backstop. Both layers, as the farm has: the
// colliders stop a driving car, the clamp stops a knocked one.
export const FAIR_WALL_TOP = 9999;
export function fairBoundsColliders() {
  const t = 0.6, h = FAIR_WALL_TOP;
  const { x0, x1, z0, z1 } = FAIR_BOUNDS;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  return [
    { x: x0, z: cz, halfW: t, halfD: (z1 - z0) / 2, h, top: h },
    { x: x1, z: cz, halfW: t, halfD: (z1 - z0) / 2, h, top: h },
    { x: cx, z: z0, halfW: (x1 - x0) / 2, halfD: t, h, top: h },
    { x: cx, z: z1, halfW: (x1 - x0) / 2, halfD: t, h, top: h },
  ];
}

export function clampInsideFair(x, z, inset = FAIR_WALL_INSET) {
  const { x0, x1, z0, z1 } = FAIR_BOUNDS;
  const west = x0 + inset;
  const east = x1 - inset;
  const south = z0 + inset;
  const north = z1 - inset;
  return {
    x: Math.min(Math.max(x, west), east),
    z: Math.min(Math.max(z, south), north),
    hitX: x < west ? -1 : x > east ? 1 : 0,
    hitZ: z < south ? -1 : z > north ? 1 : 0,
  };
}
