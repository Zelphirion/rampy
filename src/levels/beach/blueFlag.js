import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { BEACH_BLUE_FLAG, beachGroundOffsetAt } from './layout.js?v=1800000000003';

// ===== The blue flag =====
//
// The gate to the deep. The mermaids, their drowned castle and the wreck all
// sit BEHIND this post, and the post says so: a blue pennant that is NOT
// lifted until the player has actually gone under the water.
//
// Until the dive, the pennant hangs limp down the post - a wet blue rag
// furled against the wood - and the deep behind it is not drawn at all. From
// the beach, out past the drop-off, there is nothing but a bare marker
// standing in the sea. Once the camera goes under, the flag swings up and
// opens out, and stays that way for the rest of the session.
//
// The post is planted on the sea floor at the lip of the drop-off, just
// outside the rim wall, so the car can drive up to the wall and stop with the
// flag right in front of it and never reach it. It is tall enough to break
// the surface, which makes it a landmark: a thing to steer towards from the
// sand, and the first sign that the water down there is deep.
//
// The flag is a single sheet of cloth with its HOIST (the edge tied to the
// post) at x = 0 and its body reaching out in +x. That is the shape of a
// flying flag. Hanging limp is the same sheet rotated a quarter turn about
// the post, so the cloth falls DOWN the wood instead of reaching out, and the
// two states are one rigid rotation apart - which means the lift can be a
// single continuous swing from one to the other.
const POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.92 });
const POLE_DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x453a2c, roughness: 0.95 });
const STONE_MAT = new THREE.MeshStandardMaterial({ color: 0x9aa6a8, roughness: 0.85 });
const FLAG_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a63c8, roughness: 0.78, side: THREE.DoubleSide,
});
const FLAG_DARK_MAT = new THREE.MeshStandardMaterial({
  color: 0x1b3f8a, roughness: 0.82, side: THREE.DoubleSide,
});

export function buildBlueFlag(base) {
  const F = BEACH_BLUE_FLAG;
  const group = new THREE.Group();

  // The post is planted in the sea floor, not in the sand: it takes its height
  // from the ground profile at its own XZ, exactly like everything else out
  // there, so it stands on the bottom of the basin and not on the beach.
  const ground = beachGroundOffsetAt(F.x, F.z);
  group.position.set(F.x, base + ground, F.z);

  // The collar of stones round the foot stays put on the bottom while the post
  // itself sways in the swell, so the two are in separate groups.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const s = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.45 + (i % 3) * 0.18, 0),
      STONE_MAT,
    );
    s.position.set(Math.cos(a) * (F.poleR + 0.45), 0.2, Math.sin(a) * (F.poleR + 0.45));
    s.rotation.set(a * 1.3, a * 0.7, a);
    s.castShadow = true;
    group.add(s);
  }

  // Everything that hangs off the post swings with it.
  const sway = new THREE.Group();
  group.add(sway);

  // ---- the post ----
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(F.poleR * 0.72, F.poleR, F.poleH, 10),
    POLE_MAT,
  );
  post.position.y = F.poleH / 2;
  post.castShadow = true;
  sway.add(post);

  // A cap on top, and the spar the pennant is tied to.
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(F.poleR * 1.05, 0.9, 10),
    POLE_DARK_MAT,
  );
  cap.position.y = F.poleH + 0.35;
  sway.add(cap);

  const yard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6),
    POLE_DARK_MAT,
  );
  yard.rotation.z = Math.PI / 2;
  yard.position.set(F.poleR + 0.25, F.yardY, 0);
  sway.add(yard);

  // ---- the pennant ----
  // The plane is built with its hoist edge AT the origin and its body reaching
  // out in +x, so the flying state is simply "no rotation" and the furled state
  // is a quarter turn about the post.
  const geo = new THREE.PlaneGeometry(F.flagW, F.flagH, 12, 4);
  geo.translate(F.flagW / 2, 0, 0);
  const cloth = new THREE.Mesh(geo, FLAG_MAT);
  cloth.position.set(F.poleR + 0.6, F.yardY, 0);
  cloth.rotation.z = -Math.PI / 2;   // hanging limp, down the post
  cloth.castShadow = true;
  sway.add(cloth);

  // A darker stripe along the bottom edge of the cloth, so the flag has a
  // visible hem when it is flying and reads as a shape rather than a smudge.
  // It is a CHILD of the cloth, so it follows the flutter exactly.
  const hemGeo = new THREE.PlaneGeometry(F.flagW, F.flagH * 0.18, 12, 1);
  hemGeo.translate(F.flagW / 2, 0, 0);
  const hem = new THREE.Mesh(hemGeo, FLAG_DARK_MAT);
  hem.position.set(0, -F.flagH * 0.41, 0.02);
  cloth.add(hem);

  // ---- the lift ----
  // `lift` is 0 while the flag is furled and 1 once it is flying. It eases
  // towards its target rather than snapping, so the flag swings up over about
  // a second and a half and the dive has something to watch.
  let lift = 0;
  let t = 0;

  function update(delta, lifted) {
    t += delta;
    const target = lifted ? 1 : 0;
    const speed = target > lift ? 0.9 : 1.6;
    lift += (target - lift) * Math.min(1, delta * speed);
    if (Math.abs(target - lift) < 0.002) lift = target;

    // The swing itself: a quarter turn about the post takes the cloth from
    // hanging down the wood to reaching out, with the fly lifting as it goes.
    const swing = -Math.PI / 2 * (1 - lift);
    // Once it is out, it flutters - the cloth swings about the post and
    // ripples along its length. A furled flag does not ripple, it just hangs.
    const ripple = lift * 0.12;
    cloth.rotation.z = swing + Math.sin(t * 1.7) * ripple;
    cloth.rotation.y = Math.sin(t * 1.1) * 0.22 * lift;

    // The post sways a little in the swell.
    sway.rotation.z = Math.sin(t * 0.6) * 0.012;
  }

  update(0, false);
  return { group, update, cloth, get lifted() { return lift > 0.5; } };
}
