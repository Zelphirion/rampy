// Pure layout + rolling math for the ramp-world tire pyramid.
// Deliberately dependency-free (no three.js, no DOM) so `node --test` can
// exercise it directly, same as stairCycle.js.

export const TIRE_STACK_DEFAULTS = Object.freeze({
  rows: 8,       // tires in the bottom row (each higher row has one fewer)
  spacing: 1.25, // centre-to-centre distance between tires in a row
  nestStep: 0.305, // tire thickness plus a tiny non-intersection clearance
  tubeR: 0.15,   // flat tire half-width / ground-to-centre height
});

// Slot offsets for a pyramid of flat-lying tires: row 0 is the bottom row
// with `rows` tires centred on x=0, and each higher row loses one tire and
// sits `nestStep` higher without intersecting the row below. Returns [{ row, i, x, y }] where y is the
// ground-to-CENTRE height while lying flat (tubeR + row * nestStep).
export function tirePyramidSlots({
  rows = TIRE_STACK_DEFAULTS.rows,
  spacing = TIRE_STACK_DEFAULTS.spacing,
  nestStep = TIRE_STACK_DEFAULTS.nestStep,
  tubeR = TIRE_STACK_DEFAULTS.tubeR,
  rowOffset = 0,
} = {}) {
  const slots = [];
  for (let row = 0; row < rows; row++) {
    const count = rows - row;
    for (let i = 0; i < count; i++) {
      slots.push({
        row,
        i,
        x: (i - (count - 1) / 2) * spacing + row * rowOffset,
        y: tubeR + row * nestStep,
      });
    }
  }
  return slots;
}

// Stack support map: which slots each higher tire RESTS ON. A tire in row r
// ≥ 1 sits centred between the two tires directly below it, so it is
// supported while EITHER of them is still standing in place — knock out both
// and it drops. Slots are indexed by running position in tirePyramidSlots
// order (row 0 first). Returns [{ slot, a, b }] with a/b the two supporters.
export function tirePyramidSupports(rows = TIRE_STACK_DEFAULTS.rows) {
  const rowStart = (r) => r * rows - (r * (r - 1)) / 2;
  const supports = [];
  for (let row = 1; row < rows; row++) {
    for (let i = 0; i < rows - row; i++) {
      supports.push({
        slot: rowStart(row) + i,
        a: rowStart(row - 1) + i,
        b: rowStart(row - 1) + i + 1,
      });
    }
  }
  return supports;
}

// No-slip rolling rate about a horizontal axle (axleX, axleZ — unit length)
// for a wheel whose contact point is instantaneously stationary while its
// centre moves at (vx, vz): ω = (v · â⊥) / r, where â⊥ = (-az, ax) is the
// ground-plane unit vector perpendicular to the axle. The sign matches the
// spinGroup local-Z rotation used by physics.js 'roll'/'tire' modes.
export function tireRollOmega(vx, vz, axleX, axleZ, radius) {
  return (-vx * axleZ + vz * axleX) / radius;
}
