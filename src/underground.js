import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== The Underworld =====
// A secret cavern beneath the WHOLE map, reached ONLY through a cave at the
// Holy Mountain's base. The game runs TWO SEPARATE WORLDS and only ONE is
// loaded at a time (see main.js): the surface world and this underworld. The
// cave mouth on the surface and the spiral tunnel's foot in the cavern are the
// two ends of a PORTAL — driving into one unloads the current world, loads the
// other, and jumps the car to the opposite end behind a fade. There is no
// driveable helix ramp; the tunnel is a teleport, so the two worlds can never
// interfere with each other. The three sideworlds (Cosmic Desert east, Golden
// Factory west, Glass City north) live down here on the cavern floor. On the
// surface those regions are plain grass again — the only hint is the rocky
// cave mouth tucked against the mountain.

export const UNDERGROUND_Y = -30;   // top of the cavern floor (the car rides it at +0.15)

// ---- The tunnel: a descending helix around the Holy Mountain's centre ----
const TUNNEL = {
  cx: -58, cz: 104,      // spiral axis = the mountain's centre
  R: 21,                 // centreline radius
  halfW: 3.5,            // half-width of the tube's drive surface (visual only now)
  theta0: 0.45,          // entrance angle (rad) -> cave mouth on the mountain's NE base
  sweep: 1.4 * Math.PI,  // ~252° of spiral
  startY: 0.15,          // cave mouth sits at ground level
  endY: UNDERGROUND_Y + 0.15,   // the exit lands on the cavern floor
};

function easeSmooth(s) { return s * s * (3 - 2 * s); }   // zero grade at both ends

const N = 240;   // path samples (also the tube's tubular segments)
const pathSamples = [];
for (let i = 0; i <= N; i++) {
  const s = i / N;
  const th = TUNNEL.theta0 + TUNNEL.sweep * s;
  pathSamples.push({
    s,
    x: TUNNEL.cx + TUNNEL.R * Math.cos(th),
    z: TUNNEL.cz + TUNNEL.R * Math.sin(th),
    y: TUNNEL.startY + (TUNNEL.endY - TUNNEL.startY) * easeSmooth(s),
  });
}

// Point on the tunnel centreline at parameter s (the driving surface height).
export function tunnelPoint(s) {
  const th = TUNNEL.theta0 + TUNNEL.sweep * s;
  return {
    x: TUNNEL.cx + TUNNEL.R * Math.cos(th),
    z: TUNNEL.cz + TUNNEL.R * Math.sin(th),
    y: TUNNEL.startY + (TUNNEL.endY - TUNNEL.startY) * easeSmooth(s),
  };
}

// The tunnel is now a PORTAL (see main.js) — there is no driveable helix ramp
// physics anymore, so the nearest-point / surface-height / normal helpers that
// used to steer the car down the spiral have been removed. tunnelPoint() is
// still used for the tube geometry and for the two portal ends.

// Deterministic jitter so the entrance rocks look hand-scattered (no flicker).
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Build the cave entrance (SURFACE world) ----
// The cave mouth, rock arch and boulders at the Holy Mountain's NE base. This
// is the surface end of the tunnel-portal, built into the surface root with
// absolute coordinates (the surface root sits at the world origin).
export function addCaveEntrance(parent) {
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x181415, roughness: 1, side: THREE.DoubleSide });
  const archMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 });
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 });

  const tubeR = 5;
  const p0 = tunnelPoint(0);
  const th0 = TUNNEL.theta0;
  const t0 = new THREE.Vector3(-Math.sin(th0), 0, Math.cos(th0)).normalize();  // travel dir
  const n0 = new THREE.Vector3(Math.cos(th0), 0, Math.sin(th0));               // radial out

  // The dark ring at the entrance so you can spot the hole in the hillside.
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(tubeR - 0.2, 0.5, 10, 28), mouthMat);
  mouth.position.set(p0.x, p0.y + tubeR, p0.z);
  mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t0);
  parent.add(mouth);

  // The rock arch: two pillars + a lintel framing the mouth.
  for (const side of [-1, 1]) {
    const px0 = p0.x + n0.x * (tubeR + 0.8) * side;
    const pz0 = p0.z + n0.z * (tubeR + 0.8) * side;
    const pil = new THREE.Mesh(new THREE.BoxGeometry(1.6, tubeR * 2.1, 1.6), archMat);
    pil.position.set(px0, p0.y + tubeR * 1.05, pz0);
    parent.add(pil);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry((tubeR + 0.8) * 2 + 1.6, 1.6, 1.6), archMat);
  lintel.position.set(p0.x, p0.y + tubeR * 2.0, p0.z);
  lintel.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), t0);
  parent.add(lintel);

  // Boulders clustered around the mouth so the cave reads as a rocky spur of
  // the mountain (kept to the s<0.15 part of the ramp, which stays above the
  // surface — the rest of the tube lives in the underworld now).
  const rand = seededRandom(0xC0FFEE);
  for (let k = 0; k < 18; k++) {
    const s = rand() * 0.15;
    const p = tunnelPoint(s);
    const th = TUNNEL.theta0 + TUNNEL.sweep * s;
    const nx = Math.cos(th), nz = Math.sin(th);
    const spread = (rand() - 0.5) * 7;
    const r = 0.6 + rand() * 1.0;
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), boulderMat);
    b.position.set(
      p.x + nx * (tubeR + 0.4 + rand() * 1.6) + nz * spread,
      p.y + tubeR * (0.55 + rand() * 0.7),
      p.z + nz * (tubeR + 0.4 + rand() * 1.6) - nx * spread
    );
    b.castShadow = true;
    parent.add(b);
  }
}

// ---- Build the underworld (UNDERGROUND world) ----
// The cavern floor, the spiral tunnel tube that rises from the floor (the
// visual "way back up" — its foot, s=1, is where the portal drops the car),
// the glowing guide markers along it, and two big rock pillars. Built into the
// underworld root, which sits at UNDERGROUND_Y, so LOCAL y = world y + 30.
export function addUnderground(parent) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2b2627, roughness: 1 });
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x241f20, roughness: 1, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffb84d, emissive: 0xffb84d, emissiveIntensity: 0.95 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3434, roughness: 1 });

  const tubeR = 5;
  const localY = (absY) => absY - UNDERGROUND_Y;   // root is at UNDERGROUND_Y

  // ---- The cavern floor: a huge rock slab. Its top sits a hair BELOW the
  // drive surface (UNDERGROUND_Y + 0.15) so the sideworlds' floors never
  // z-fight it.
  const plain = new THREE.Mesh(new THREE.BoxGeometry(292, 0.25, 276), rockMat);
  plain.position.set(0, -0.145, 41.5);   // local y -> world UNDERGROUND_Y - 0.145
  plain.receiveShadow = true;
  parent.add(plain);

  // ---- The tunnel tube: the spiral column rising from the cavern floor up
  // to the surface. Its centreline is offset UP by its radius so the drive
  // surface along its bottom sits at the floor; DoubleSide so it reads as a
  // hollow passage.
  const pts = pathSamples.map((p) => new THREE.Vector3(p.x, localY(p.y) + tubeR, p.z));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, N, tubeR, 20, false), tubeMat);
  tube.castShadow = true;
  parent.add(tube);

  // ---- Glowing floor markers (guide lights) along the spiral. They're
  // tucked against the tube wall so the car never clips them, and they glow
  // through the fog so the way back up is always readable.
  const markerR = tubeR - 1.6;   // lateral offset from the centreline (car half-width 2.2)
  for (let i = 1; i <= 30; i++) {
    const s = i / 30;
    const p = tunnelPoint(s);
    const th = TUNNEL.theta0 + TUNNEL.sweep * s;
    const nx = Math.cos(th), nz = Math.sin(th);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), glowMat);
      m.position.set(p.x + nx * markerR * side, localY(p.y) + 0.12, p.z + nz * markerR * side);
      parent.add(m);
    }
  }

  // ---- Two big rock pillars framing the cavern near the tunnel exit, so the
  // underworld has a bit of vertical drama (they're solid, but off the routes
  // to the three worlds).
  const pillars = [
    { x: -72, z: 98 },
    { x: -40, z: 66 },
  ];
  const pillarColliders = [];
  for (const p of pillars) {
    const w = 3.0, h = 14;
    const pil = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), pillarMat);
    pil.position.set(p.x, h / 2, p.z);   // local y = h/2 (world UNDERGROUND_Y + h/2)
    pil.castShadow = true;
    parent.add(pil);
    pillarColliders.push({ x: p.x, z: p.z, halfW: w / 2, halfD: w / 2, h });
  }

  // Colliders: only the decorative pillars (the tube is purely visual now —
  // the portal teleports the car, it never drives along the spiral).
  const colliders = [...pillarColliders];

  return {
    colliders,
    update() { /* the cavern is static */ },
  };
}
