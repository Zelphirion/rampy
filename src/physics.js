import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Simple knock-over physics for props (lampposts, signs, trees, parked cars, ...).
// Props register themselves via addKnockable(); main.js calls knockAt() whenever
// a car gets close and updateKnockables() every frame to animate the falls.

const knockables = [];

// Register a prop to be knockable.
//   group  - the THREE.Group (or Mesh) for the prop
//   radius - collision radius used to decide when a car knocks it over
//   opts:
//     mode: 'fall'  (default) tips the prop over onto the ground
//           'slide' shoves the prop along the ground (parked cars, fences)
//           'wobble' rocks the prop on impact, then springs back upright
//           'roll'   rolls a lying cylinder (timber log) along the ground
//     fallTime:      seconds for the animation
//     slideDistance: how far a 'slide' prop travels
export function addKnockable(group, radius, opts = {}) {
  const k = {
    group,
    radius,
    mode: opts.mode || 'fall',
    state: 'standing',           // standing | falling | fallen | wobbling | sliding
    t: 0,
    basePos: group.position.clone(),
    baseQuat: group.quaternion.clone(),
    finalQuat: null,
    pushDir: new THREE.Vector3(1, 0, 0),
    fallTime: opts.fallTime || 0.4,
    slideDistance: opts.slideDistance || 1.6,
    flyHeight: opts.flyHeight || 0.9,   // arc peak for 'scatter' mode
    perp: new THREE.Vector3(1, 0, 0),    // sideways fan for 'scatter' mode
    spin: 0,                             // tumble rate for 'scatter' mode
    // Shove physics for a prop that is ALREADY knocked over (fallen/sliding):
    // hitting it again slides it along the ground like a traffic car — the
    // velocity + yaw spin decay each frame, then it settles where it stops.
    shoveVx: 0,                          // slide velocity (x)
    shoveVz: 0,                          // slide velocity (z)
    shoveSpin: 0,                        // yaw spin rate while sliding
    shovePower: opts.shovePower ?? 8,           // slide speed when re-hit while down
    shoveSpinPower: opts.shoveSpinPower ?? 1.8, // yaw spin while sliding
    linked: null,                        // other knockables that fall together
    // 'domino' mode (ramp-world domino run): a falling domino tips over along
    // its pushDir and knocks any standing domino its body actually *touches*
    // as it pivots (exact box-vs-box overlap, checked every frame) — a real
    // one-after-another chain reaction, not the all-at-once `linked` burst.
    // If the fall misses a neighbor (a careful / angled hit), that neighbor
    // stays standing, so you can topple just one domino on purpose.
    dominoW: opts.dominoW || 0,     // thickness (along the fall direction)
    dominoH: opts.dominoH || 0,     // height
    dominoD: opts.dominoD || 0,     // width (side-to-side along the row)
    // 'wobble' mode (buildings): rock on the hit, then spring back upright
    wobbleAxis: new THREE.Vector3(1, 0, 0),
    wobbleT: 0,
    wobbleAmp: opts.wobbleAmp ?? 0.6,       // peak tilt (radians)
    wobbleFreq: opts.wobbleFreq ?? 9,       // rock speed (rad/s)
    wobbleDamping: opts.wobbleDamping ?? 3, // how fast it settles back
    // 'roll' mode (ramp-world timber logs): a cylinder lying on its side that
    // ROLLS along the ground when hit — the whole group slides with a decaying
    // velocity while `spinGroup` (local Z = the log's long axis) rotates at the
    // matching rolling rate, so the log visibly rolls away a good distance.
    rollVx: 0,
    rollVz: 0,
    rollRadius: opts.rollRadius || 2.1,
    rollPower: opts.rollPower ?? 24,        // initial roll speed
    rollDecay: opts.rollDecay ?? 1.0,       // per-second exponential damping
    rollWrapX: opts.rollWrapX || 0,         // wrap span for x (180) so a log rolling off the west edge reappears on the east (torus seam)
    spinGroup: opts.spinGroup || null,
    spinBaseRotZ: opts.spinGroup ? opts.spinGroup.rotation.z : 0,
    rollAxis: opts.rollAxis ? opts.rollAxis.clone() : new THREE.Vector3(0, 0, 1), // world-space unit axis of the log's long axis
    // Optional per-knockable predicate(pos: Vector3) -> bool: when true the
    // prop is considered off the playable world and should drop away to
    // invisibility. Useful for ramp-world items that can be pushed off cliffs.
    isOffEdge: opts.isOffEdge || null,
    offscreen: false,
    removed: false,
    dropSpeed: opts.dropSpeed || 60,      // units per second downward when falling off
    disappearY: opts.disappearY ?? -200,
  };
  knockables.push(k);
  return k;
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

const SHOVE_DECAY = 0.9;   // per-frame damping of a downed prop's shove slide

export function updateKnockables(delta) {
  for (const k of knockables) {
    if (k.removed) continue;
    if (k.offscreen) {
      // Animate a quick downward fall; when deep enough, hide the object.
      k.group.position.y -= k.dropSpeed * delta;
      if (k.group.position.y <= k.disappearY) {
        k.group.visible = false;
        k.removed = true;
      }
      continue;
    }
    if (k.state === 'wobbling') {
      k.wobbleT += delta;
      const decay = Math.exp(-k.wobbleDamping * k.wobbleT);
      const tilt = Math.sin(k.wobbleT * k.wobbleFreq) * k.wobbleAmp * decay;
      k.group.quaternion.copy(k.baseQuat).premultiply(
        new THREE.Quaternion().setFromAxisAngle(k.wobbleAxis, tilt)
      );
      // give the base a little shove toward the hit, easing back as it settles
      k.group.position.copy(k.basePos).addScaledVector(k.pushDir, 0.3 * decay);
      if (decay < 0.02) {
        k.state = 'standing';
        k.group.quaternion.copy(k.baseQuat);
        k.group.position.copy(k.basePos);
      }
      continue;
    }
    if (k.state === 'rolling') {
      // A log rolls away from the hit: the group slides along the ground with a
      // decaying velocity while `spinGroup` spins around its own long axis (its
      // local Z) at the matching rolling rate, so the log visibly rolls the
      // whole way, then settles where it stops.
      k.group.position.x += k.rollVx * delta;
      k.group.position.z += k.rollVz * delta;
      if (k.spinGroup) {
        const speed = Math.hypot(k.rollVx, k.rollVz);
        if (speed > 0.05) {
          // Rolling rate about the log's long axis (k.rollAxis, set at build
          // time from the yaw) for a no-slip cylinder (v = w x r).
          const ax = k.rollAxis.x, az = k.rollAxis.z;
          let omega;
          if (Math.abs(az) > 0.01) omega = -k.rollVx / (k.rollRadius * az);
          else omega = k.rollVz / (k.rollRadius * ax);
          k.spinGroup.rotation.z += omega * delta;
        }
      }
      const decay = Math.exp(-k.rollDecay * delta);
      k.rollVx *= decay;
      k.rollVz *= decay;
      // Keep a far-rolling log inside the playable band: wrap x around the
      // torus seam (span 180) so it never rolls off the world edge.
      if (k.rollWrapX) {
        const half = k.rollWrapX / 2;
        k.group.position.x = ((k.group.position.x + half) % k.rollWrapX + k.rollWrapX) % k.rollWrapX - half;
      }
      // Off-edge detection: if the caller provided an isOffEdge predicate,
      // call it now and start the drop-away animation if it returns true.
      if (k.isOffEdge && k.isOffEdge(k.group.position)) {
        k.offscreen = true;
        continue;
      }
      if (Math.hypot(k.rollVx, k.rollVz) < 0.08) k.state = 'fallen';
      continue;
    }
    if (k.state === 'sliding') {
      // A knocked-over prop being shoved along the ground (traffic-car-style):
      // it stays lying flat but slides with a decaying velocity + yaw spin,
      // then comes to rest wherever it stops.
      k.group.position.x += k.shoveVx * delta;
      k.group.position.z += k.shoveVz * delta;
      k.group.rotation.y += k.shoveSpin * delta;
      k.shoveVx *= SHOVE_DECAY;
      k.shoveVz *= SHOVE_DECAY;
      k.shoveSpin *= SHOVE_DECAY;
      if (Math.hypot(k.shoveVx, k.shoveVz) < 0.06 && Math.abs(k.shoveSpin) < 0.02) {
        k.state = 'fallen';
      }
        if (k.isOffEdge && k.isOffEdge(k.group.position)) {
          k.offscreen = true;
        }
      continue;
    }
    if (k.state !== 'falling') continue;
    k.t = Math.min(k.t + delta / k.fallTime, 1);
    const e = easeOut(k.t);
    if (k.mode === 'slide') {
      k.group.position.copy(k.basePos).addScaledVector(k.pushDir, k.slideDistance * e);
      k.group.quaternion.copy(k.baseQuat);
      k.group.rotateY(0.5 * e);
      k.group.rotateZ(-0.15 * e);
    } else if (k.mode === 'scatter') {
      // Loose items (fruit): fly outward in an arc, fanning sideways and
      // tumbling, until they rest scattered on the ground.
      k.group.position.copy(k.basePos)
        .addScaledVector(k.pushDir, k.slideDistance * e)
        .addScaledVector(k.perp, k.slideDistance * 0.6 * e);
      k.group.position.y = k.basePos.y + (0.03 - k.basePos.y) * e + Math.sin(k.t * Math.PI) * k.flyHeight;
      k.group.rotation.x += delta * k.spin;
      k.group.rotation.z += delta * k.spin * 0.6;
    } else {
      if (k.finalQuat) {
        k.group.quaternion.copy(k.baseQuat).slerp(k.finalQuat, e);
      }
      // nudge the base a little in the fall direction so it clears the car
      k.group.position.copy(k.basePos).addScaledVector(k.pushDir, 0.35 * e);
    }
    // Domino chain: the falling domino's tilting body is tested against every
    // standing neighbor for real overlap (SAT), so the next domino only
    // topples if this one actually *hits* it. A clean hit along the row
    // cascades; a careful side/angled hit that makes it miss never chains.
    if (k.mode === 'domino') chainKnock(k, delta);
    if (k.t >= 1) k.state = 'fallen';
    if (k.isOffEdge && k.isOffEdge(k.group.position)) k.offscreen = true;
  }
}

// Knock over any standing domino that the falling domino `k` physically hits
// as it pivots over. The falling domino is modeled as its real 3D box rotated
// by the same angle the renderer draws (easeOut(k.t) * 90 degrees), and each
// standing neighbor is an axis-aligned box; a separating-axis (SAT) test
// reports true overlap. Contact is sampled at a few sub-steps inside the
// current frame so a fast-moving leading edge can't tunnel through a neighbor.
function chainKnock(k, delta) {
  const hW = k.dominoW / 2, hH = k.dominoH / 2, hD = k.dominoD / 2;
  if (!hH) return;
  const f = k.pushDir;            // unit, in the XZ plane
  const sx = -f.z, sz = f.x;      // perpendicular unit in the XZ plane
  const steps = 2;
  const stepRad = (delta / k.fallTime) * (Math.PI / 2) / steps;
  for (let s = 0; s <= steps; s++) {
    const th = Math.max(easeOut(k.t) * (Math.PI / 2) - s * stepRad, 0);
    const sinT = Math.sin(th), cosT = Math.cos(th);
    // Pivot is the domino's base centre; the rendered group also nudges the
    // base forward a touch each frame, so mirror that for visual truth.
    const cx = k.group.position.x + f.x * (hH * sinT);
    const cy = hH * cosT;
    const cz = k.group.position.z + f.z * (hH * sinT);
    // OBB axes (world space) + half-extents for the tilted domino:
    //   axis 0 = thickness (tilts up off the ground)
    //   axis 1 = height    (tilts down toward the ground)
    //   axis 2 = width     (stays horizontal, perpendicular to the fall)
    const axes = [
      [f.x * cosT, sinT, f.z * cosT],
      [f.x * sinT, cosT, f.z * sinT],
      [sx, 0, sz],
    ];
    const hA = [hW, hH, hD];
    for (const j of knockables) {
      if (j === k || j.mode !== 'domino' || j.state !== 'standing') continue;
      // Standing neighbor: an axis-aligned box centred on its base.
      const jc = [j.basePos.x, j.dominoH / 2, j.basePos.z];
      const jh = [j.dominoW / 2, j.dominoH / 2, j.dominoD / 2];
      if (satOverlap(cx, cy, cz, axes, hA, jc, jh)) {
        startFall(j, f.clone());
        return;
      }
    }
  }
}

// Separating-axis test: does the oriented box (centre c, axes `axes`, half
// extents `hA`) overlap the axis-aligned box (centre jc, half extents jh)?
// Returns true when the two boxes genuinely intersect.
function satOverlap(cx, cy, cz, axes, hA, jc, jh) {
  const d = [cx - jc[0], cy - jc[1], cz - jc[2]];
  const world = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const projA = (L) => hA[0] * Math.abs(L[0] * axes[0][0] + L[1] * axes[0][1] + L[2] * axes[0][2])
                    + hA[1] * Math.abs(L[0] * axes[1][0] + L[1] * axes[1][1] + L[2] * axes[1][2])
                    + hA[2] * Math.abs(L[0] * axes[2][0] + L[1] * axes[2][1] + L[2] * axes[2][2]);
  const projB = (L) => jh[0] * Math.abs(L[0]) + jh[1] * Math.abs(L[1]) + jh[2] * Math.abs(L[2]);
  const separated = (L) => Math.abs(d[0] * L[0] + d[1] * L[1] + d[2] * L[2]) > projA(L) + projB(L);
  for (const L of world) if (separated(L)) return false;
  for (const A of axes) if (separated(A)) return false;
  for (const A of axes) for (const B of world) {
    const L = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
    const len = Math.hypot(L[0], L[1], L[2]);
    if (len < 1e-6) continue;
    const Ln = [L[0] / len, L[1] / len, L[2] / len];
    if (separated(Ln)) return false;
  }
  return true;
}

// A knocked-over prop that gets hit again: shove it along the ground the way
// a traffic car is knocked — it keeps lying flat, slides with a decaying
// velocity and a little yaw spin, and settles where it stops. Re-hitting it
// while it is still sliding re-shoves it, so you can bat the fallen dominoes
// and bowling pins around like hockey pucks.
function startShove(k, d) {
  k.shoveVx = d.x * k.shovePower;
  k.shoveVz = d.z * k.shovePower;
  k.shoveSpin = (Math.random() < 0.5 ? 1 : -1) * k.shoveSpinPower;
  k.state = 'sliding';
}

// Start tipping one prop over. `d` is the (normalized) direction the impact
// comes from, so the prop falls / flies away from it.
function startFall(k, d) {
  k.pushDir.copy(d);
  k.t = 0;
  if (k.mode === 'wobble') {
    // Rock the building around a horizontal axis perpendicular to the hit,
    // wobbling back and forth and settling upright again (it never falls).
    const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(k.baseQuat);
    const axis = new THREE.Vector3().crossVectors(worldUp, d);
    if (axis.lengthSq() < 1e-4) axis.set(d.z, 0, -d.x);
    axis.normalize();
    k.wobbleAxis.copy(axis);
    k.wobbleT = 0;
    k.state = 'wobbling';
    return;
  }
  if (k.mode === 'roll') {
    // A lying log always ROLLS: project the hit direction onto the plane
    // perpendicular to the log's long axis, so no matter how you bump it the
    // log rolls away (spinning around its own axis) at full speed — a side
    // bump rolls it straight on, an end-on bump rolls it sideways. A small
    // random fan keeps neighbouring logs from all rolling perfectly parallel.
    const a = k.rollAxis;
    const along = d.x * a.x + d.z * a.z;   // component of the hit along the log
    let px = d.x - along * a.x;            // perpendicular component
    let pz = d.z - along * a.z;
    let pl = Math.hypot(px, pz);
    if (pl < 1e-3) { px = -a.z; pz = a.x; pl = 1; }  // pure end-on: roll sideways
    px /= pl; pz /= pl;
    const fan = (Math.random() - 0.5) * 0.3;
    const c = Math.cos(fan), s = Math.sin(fan);
    const rx = px * c - pz * s;
    const rz = px * s + pz * c;
    k.rollVx = rx * k.rollPower;
    k.rollVz = rz * k.rollPower;
    k.state = 'rolling';
    return;
  }
  k.state = 'falling';
  if (k.mode === 'fall' || k.mode === 'domino') {
    // Rotate the prop's world "up" axis down onto pushDir (flat on the ground).
    const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(k.baseQuat);
    const axis = new THREE.Vector3().crossVectors(worldUp, d);
    const angle = Math.acos(THREE.MathUtils.clamp(worldUp.dot(d), -1, 1));
    if (axis.lengthSq() < 1e-4) {
      axis.set(d.z, 0, -d.x);
    }
    axis.normalize();
    k.finalQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(k.baseQuat.clone());
  } else if (k.mode === 'scatter') {
    // Loose fruit: fan sideways as it flies so a whole pile scatters apart.
    const perp = new THREE.Vector3(-d.z, 0, d.x);
    k.perp.copy(perp).multiplyScalar((Math.random() < 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.65));
    k.spin = (Math.random() - 0.5) * 12;
  }
}

// Knock over every standing prop whose base is within `radius` of `point`,
// tipping it away from the impact point. When `worldSizeX` / `worldSizeZ` are
// given, the map wraps like a torus (with separate spans per axis, since the
// world is wider than it is tall), so a car on one edge can knock a prop near
// the opposite edge (and never knocks far props across the seam).
export function knockAt(point, radius, worldSizeX = 0, worldSizeZ = 0) {
  for (const k of knockables) {
    // A prop that is already down (fallen or sliding) can still be hit — it
    // gets shoved along the ground, exactly like knocking a traffic car.
    const lying = k.state === 'fallen' || k.state === 'sliding';
    if (k.state !== 'standing' && !lying) continue;
    // Measure from the prop's CURRENT spot (a shoved prop has moved away from
    // its original base), so hits track where it actually lies right now.
    let dx = k.group.position.x - point.x;
    let dz = k.group.position.z - point.z;
    if (worldSizeX) {
      const half = worldSizeX / 2;
      dx = ((dx + half) % worldSizeX + worldSizeX) % worldSizeX - half;
    }
    if (worldSizeZ) {
      const half = worldSizeZ / 2;
      dz = ((dz + half) % worldSizeZ + worldSizeZ) % worldSizeZ - half;
    }
    if (Math.hypot(dx, dz) > radius + k.radius) continue;

    let d = new THREE.Vector3(dx, 0, dz);
    if (d.lengthSq() < 1e-4) d.set(1, 0, 0);
    d.normalize();
    // Already down: shove it along the ground instead of tipping it over.
    if (lying) {
      startShove(k, d);
      continue;
    }
    startFall(k, d);
    // Anything linked (e.g. the fruit on a table) goes down together, so a
    // whole stall collapses and its fruit scatter at the same moment.
    if (k.linked) {
      for (const lk of k.linked) {
        if (lk.state === 'standing') startFall(lk, d);
      }
    }
  }
}

// Stand every knocked-over / slid / wobbled prop back up exactly where it
// started. Called when the player leaves a world (city portal / ramp-world
// vortex), so the city's lamp posts, benches, barrels, parked cars and the
// ramp world's bowling pins and dominoes are all standing again when you
// come back to that world.
export function resetKnockables() {
  for (const k of knockables) {
    k.state = 'standing';
    k.t = 0;
    k.wobbleT = 0;
    k.shoveVx = 0;
    k.shoveVz = 0;
    k.shoveSpin = 0;
    k.rollVx = 0;
    k.rollVz = 0;
    if (k.spinGroup) k.spinGroup.rotation.z = k.spinBaseRotZ;
    k.group.position.copy(k.basePos);
    k.group.quaternion.copy(k.baseQuat);
    k.offscreen = false;
    k.removed = false;
    k.group.visible = true;
  }
}

// TEMP DEBUG: return a compact view of rolling knockables for in-page tests.
// Remove this before finalizing production builds.
// (debug helper removed)
