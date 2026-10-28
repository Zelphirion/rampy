// ===== Two-point terrain pitch ================================================
// The rule every drivable heightfield in the game uses to tip a car's body: read
// the ground a half wheelbase ahead of and behind the car, along its heading, and
// pitch the body to the chord between those two samples. Nose goes UP climbing,
// DOWN dropping, and the sign stays right whichever way the slope runs beneath
// the car because the sample follows the heading, not the world axes.
//
// It lives here (pure maths, no three.js) so `node --test` can pin the sign and
// the magnitude, and so Player 1's physics block and the split-screen twin's
// condensed step read the slope with the exact same function — a hill must tip
// both cars the same way (see cityHills.js for the outer-belt hills).
//
// `heightAt(x, z)` is in the caller's own units (offsets from the ground datum
// are fine — only the difference matters). `halfBase` is half the wheelbase.
export const CAR_HALF_BASE = 1.35;

export function terrainPitchAt(x, z, dirX, dirZ, heightAt, halfBase = CAR_HALF_BASE) {
  const frontH = heightAt(x + dirX * halfBase, z + dirZ * halfBase);
  const rearH = heightAt(x - dirX * halfBase, z - dirZ * halfBase);
  // Cars are modelled nose-first along -X, so a NEGATIVE rotation about the local
  // Z axis lifts the nose. Hence the leading minus.
  return -Math.atan2(frontH - rearH, halfBase * 2);
}
