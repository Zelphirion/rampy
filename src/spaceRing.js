// ===== Wheel-station ring drive (pure math) =====
//
// The space level is a rotating wheel (Von Braun) station. The player drives on
// the INNER surface of a big cylinder, so "down" is radially outward and "up"
// points at the central hub. Instead of pretending the floor is flat, the whole
// drive is expressed in ring coordinates and only converted to world space for
// rendering:
//
//   s       distance along the loop in world units. Wraps every RING_CIRC, so
//           driving forever just goes round and round.
//   w       offset across the corridor, measured along the cylinder axis
//           (world Z). Clamped to +/- RING_LANE so the car stays between the
//           window walls.
//   heading direction of travel in the local (tangent, axial) plane. 0 means
//           "straight down the corridor" (+tangent); PI/2 means "across the
//           corridor" (toward +axis). Steering bends this.
//   speed   scalar speed along `heading`, signed (negative = reverse).
//
// All of this is deterministic and free of THREE so it can be unit-tested; the
// renderer (main.js) turns the pose into a quaternion.

// Inner floor radius. Big enough that the corridor reads almost flat under the
// wheels while still visibly curving away on both sides.
export const RING_R = 44;
// Corridor width, measured along the cylinder axis (world Z). Doubled from the
// original 14 to make room for the four themed sectors that now line the rim.
export const RING_W = 28;
export const RING_HALF_W = RING_W / 2;
// Full circumference (world units) — the length of one lap.
export const RING_CIRC = Math.PI * 2 * RING_R;
// Drivable half-width across the corridor: the window walls / consoles sit
// inside RING_HALF_W, so this leaves a comfortable margin before either side.
export const RING_LANE = RING_HALF_W - 2.0;

export const RING_ACCEL = 26;      // units/s^2 of throttle
export const RING_MAX = 30;        // top speed forward
export const RING_REVERSE = 13;    // top speed in reverse
export const RING_DRAG = 8;        // coasting deceleration when no throttle
export const RING_TURN = 2.3;      // rad/s of steering authority (matches the city car)

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Wrap a loop distance into [0, RING_CIRC).
export function ringWrapS(s) {
  const m = s % RING_CIRC;
  return m < 0 ? m + RING_CIRC : m;
}

export function createRingState(s = 0, w = 0, heading = 0) {
  return { s: ringWrapS(s), w, heading, speed: 0 };
}

// Advance the ring drive by dt. `input.throttle` is -1..1 (forward positive),
// `input.steer` is -1..1 (right positive). `input.laneHi` / `input.laneLo`
// optionally override the corridor clamp on the +w / -w sides, so a level can
// open a bay on one side (the wheel's dock spur) without opening the other.
// Mutates and returns `st`.
export function stepRing(st, input = {}, dt = 0) {
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  const laneHi = input.laneHi === undefined ? RING_LANE : input.laneHi;
  const laneLo = input.laneLo === undefined ? -RING_LANE : input.laneLo;
  // A surface grip multiplier (1 = normal). Slick/mud or muddy belts lower it
  // so the nose wanders and corners wash out.
  const gripMul = input.grip === undefined ? 1 : input.grip;

  // Steering authority is constant, exactly like the ground cars: no speed
  // dependence, so turning feels identical at a crawl or at full tilt. Only the
  // surface grip multiplier (slick patches, mud) scales it.
  const grip = gripMul;
  st.heading += steer * RING_TURN * grip * dt;

  if (throttle > 0.01) {
    st.speed += RING_ACCEL * throttle * dt;
  } else if (throttle < -0.01) {
    // Braking first, then reversing once the forward speed is gone.
    st.speed += RING_ACCEL * throttle * dt;
  } else {
    const drop = Math.min(Math.abs(st.speed), RING_DRAG * dt);
    st.speed -= Math.sign(st.speed) * drop;
  }
  st.speed = clamp(st.speed, -RING_REVERSE, RING_MAX);

  // Translate along the heading, then fold back into the corridor.
  st.s += Math.cos(st.heading) * st.speed * dt;
  st.w += Math.sin(st.heading) * st.speed * dt;
  if (st.w > laneHi) st.w = laneHi;
  else if (st.w < laneLo) st.w = laneLo;
  st.s = ringWrapS(st.s);
  return st;
}

// World-space pose of the car at (s, w, heading), riding `y` units off the
// floor. Returns the position plus the car's three local axes (the columns of a
// rotation matrix), so callers can build a quaternion with setFromRotationMatrix.
//
// Local axes: +X is the car's BACKWARD (its hood is local -X), +Y is up (toward
// the hub), +Z is the right-hand cross so the basis is orthonormal.
export function ringPose(s, w, heading = 0, y = 0) {
  const t = s / RING_R;                 // angle around the hub
  const c = Math.cos(t), sn = Math.sin(t);

  // Floor point sits at radius RING_R; rising off the floor moves INWARD (toward
  // the hub), so the driven radius shrinks as y grows.
  const rad = RING_R - y;
  const px = rad * c;
  const py = rad * sn;
  const pz = w;

  // Tangent to the loop at this angle (unit), and the axial direction (+Z).
  const tx = -sn, ty = c;
  const ch = Math.cos(heading), sh = Math.sin(heading);

  // Forward in the (tangent, axial) plane; up points at the hub (inward).
  const fx = tx * ch, fy = ty * ch, fz = sh;
  const ux = -c, uy = -sn, uz = 0;

  // Basis columns: X = -forward, Y = up, Z = X cross Y.
  const xx = -fx, xy = -fy, xz = -fz;
  const yx = ux, yy = uy, yz = uz;
  const zx = xy * yz - xz * yy;
  const zy = xz * yx - xx * yz;
  const zz = xx * yy - xy * yx;

  return { px, py, pz, xx, xy, xz, yx, yy, yz, zx, zy, zz };
}

// Camera for the ring: sits `back` behind the car along its heading and `up`
// toward the hub, looking a little ahead of and above the car.
export function ringCamera(s, w, heading, back, up, ahead = 3, lookUp = 1.2, y = 0) {
  const t = s / RING_R;
  const c = Math.cos(t), sn = Math.sin(t);
  const rad = RING_R - y;
  const px = rad * c, py = rad * sn, pz = w;
  const tx = -sn, ty = c;
  const ch = Math.cos(heading), sh = Math.sin(heading);
  const fx = tx * ch, fy = ty * ch, fz = sh;
  const ux = -c, uy = -sn, uz = 0;
  return {
    cam: {
      x: px - fx * back + ux * up,
      y: py - fy * back + uy * up,
      z: pz - fz * back + uz * up,
    },
    look: {
      x: px + fx * ahead + ux * lookUp,
      y: py + fy * ahead + uy * lookUp,
      z: pz + fz * ahead + uz * lookUp,
    },
  };
}
