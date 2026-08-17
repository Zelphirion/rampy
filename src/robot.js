import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== Giant eating robot =====
// A colossal stomping robot that patrols the city on a big diamond loop, spots
// nearby cars, chases them down, picks them up in its claw and eats them.
//   - The player gets eaten too, then respawns at a safe spot (brief cooldown
//     so it can't be instantly re-eaten).
//   - Traffic + the blue bumper car are eaten and respawn back on the map.
//   - The fire engine is too heavy/hot — the robot leaves it alone.
// The model's front faces +Z, so rotation.y = atan2(dx, dz) points it at its
// target (same convention as the pedestrians).

const WALK_SPEED = 4.0;    // patrol speed (units/s)
const SEEK_SPEED = 4.6;    // chase speed when a car is spotted
const DETECT_RANGE = 38;   // how far the robot can "see" a car
const PICKUP_RANGE = 12;   // how close it must get before grabbing
const ROBOT_RADIUS = 4.5;  // circle collider used against the player
const BODY_CLEAR = 3.5;    // clearance vs buildings while it walks
const EAT_COOLDOWN = 4;    // seconds of peace after each meal
const PATROL_R = 58;       // diamond patrol radius around the origin

// Pickup animation timeline (seconds)
const REACH_T = 0.5;                       // lower the claw toward the car
const LIFT_T = 1.0;                        // raise claw + car up to the mouth
const EAT_T = 0.9;                         // mouth open, car shrinks away
const RETURN_T = 0.6;                      // claw/head/jaw back to rest
const CHEW_T = 1.6;                        // stand still and chomp
const PICKUP_TOTAL = REACH_T + LIFT_T + EAT_T + RETURN_T;

// Claw arm rotation.x targets (negative = arm swings up/forward in front of
// the robot — the claw starts low and ends up at mouth height).
const REST_ANG = -0.35;
const REACH_ANG = -0.85;
const LIFT_ANG = -2.0;

const lerp = (a, b, k) => a + (b - a) * k;

export function addRobot(scene) {
  // ---- Materials ----
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.55 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xb6bec7, roughness: 0.45, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3035, roughness: 0.75, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xd24a2a, roughness: 0.5, metalness: 0.3 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x33ddff, emissive: 0x22ccff, emissiveIntensity: 2.2 });
  const chestMat = new THREE.MeshStandardMaterial({ color: 0x33ddff, emissive: 0x22ccff, emissiveIntensity: 1.5 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, metalness: 0.7 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x0a0505, roughness: 1 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 });

  const robot = new THREE.Group();

  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    robot.add(m);
    return m;
  };

  // ===== Legs (hip pivots swing while walking) =====
  const legL = new THREE.Group(); legL.position.set(-1.3, 3.6, 0); robot.add(legL);
  const legR = new THREE.Group(); legR.position.set(1.3, 3.6, 0); robot.add(legR);
  for (const leg of [legL, legR]) {
    const upper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.0, 2.2), metalMat);
    upper.position.y = -1.6; upper.castShadow = true; upper.receiveShadow = true; leg.add(upper);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 2.1), darkMat);
    thigh.position.set(0, -1.05, 0.3); thigh.castShadow = true; leg.add(thigh);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10), accentMat);
    knee.position.set(0, -2.95, 0); knee.castShadow = true; leg.add(knee);
    const kneeArmor = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 2.0), darkMat);
    kneeArmor.position.set(0, -3.0, 0.3); kneeArmor.castShadow = true; leg.add(kneeArmor);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.6), panelMat);
    shin.position.set(0, -2.5, 0.4); shin.castShadow = true; leg.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.9, 4.4), darkMat);
    foot.position.set(0, -3.2, 0.4); foot.castShadow = true; foot.receiveShadow = true; leg.add(foot);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 0.9), metalMat);
    toe.position.set(0, -3.55, 2.2); leg.add(toe);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.8), darkMat);
    heel.position.set(0, -3.5, -1.6); leg.add(heel);
  }

  // ===== Torso =====
  box(5.0, 6.0, 3.4, metalMat, 0, 7.0, 0);
  box(5.5, 1.1, 3.9, accentMat, 0, 4.8, 0);          // waist belt
  box(3.4, 2.6, 0.22, darkMat, 0, 7.3, 1.71);        // chest panel
  // reactor: glowing ring around a bright core
  const reactor = new THREE.Mesh(new THREE.CircleGeometry(0.72, 18), chestMat);
  reactor.position.set(0, 7.3, 1.85);
  reactor.rotation.x = -Math.PI / 2;
  robot.add(reactor);
  const reactorRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 8, 24), glowMat);
  reactorRing.position.set(0, 7.3, 1.86);
  reactorRing.rotation.x = -Math.PI / 2;
  robot.add(reactorRing);
  const reactorCore = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), glowMat);
  reactorCore.position.set(0, 7.3, 1.87);
  reactorCore.rotation.x = -Math.PI / 2;
  robot.add(reactorCore);
  box(0.4, 1.6, 0.25, darkMat, -2.0, 5.6, 1.71);      // chest vents
  box(0.4, 1.6, 0.25, darkMat, 2.0, 5.6, 1.71);
  // layered abdominal armor plates
  for (let i = 0; i < 3; i++) {
    const ab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 3.1), darkMat);
    ab.position.set(0, 5.55 + i * 0.5, 0.1); ab.castShadow = true; robot.add(ab);
  }
  // side intake vents with a glowing strip
  for (const sx of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 1.5), darkMat);
    intake.position.set(sx * 2.85, 7.1, 0); intake.castShadow = true; robot.add(intake);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1.0), glowMat);
    vent.position.set(sx * 3.18, 7.1, 0); robot.add(vent);
  }
  // backpack thrusters
  const pack = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 1.4), darkMat);
  pack.position.set(0, 8.0, -2.25); pack.castShadow = true; robot.add(pack);
  for (const sx of [-1, 1]) {
    const thr = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 12), metalMat);
    thr.rotation.x = Math.PI / 2;
    thr.position.set(sx * 0.95, 8.0, -2.75); thr.castShadow = true; robot.add(thr);
    const nozzle = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), glowMat);
    nozzle.position.set(sx * 0.95, 8.0, -3.2);
    nozzle.rotation.x = Math.PI / 2;
    robot.add(nozzle);
  }
  // neck stack + collar (connects the head to the torso — no more gap)
  box(2.6, 0.7, 2.6, darkMat, 0, 10.35, 0);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 1.9), darkMat);
  neck.position.set(0, 11.4, 0); neck.castShadow = true; robot.add(neck);
  box(2.2, 0.5, 2.2, metalMat, 0, 12.4, 0);
  for (const ny of [11.0, 11.8]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 20), glowMat);
    ring.position.set(0, ny, 0);
    ring.rotation.x = Math.PI / 2;
    robot.add(ring);
  }

  // ===== Arms =====
  // Left arm swings while walking. The RIGHT arm + claw does the grabbing.
  const shoulderL = new THREE.Group(); shoulderL.position.set(-3.4, 10.2, 0); robot.add(shoulderL);
  const shoulderR = new THREE.Group(); shoulderR.position.set(3.4, 10.2, 0); robot.add(shoulderR);
  const armL = new THREE.Group(); shoulderL.add(armL);
  const armR = new THREE.Group(); shoulderR.add(armR);
  for (const arm of [armL, armR]) {
    const pauldron = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.3), darkMat);
    pauldron.position.set(0, 0.15, 0); pauldron.castShadow = true; arm.add(pauldron);
    const sJoint = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), metalMat);
    sJoint.position.set(0, -0.15, 0); arm.add(sJoint);
    const ua = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.0, 1.7), metalMat);
    ua.position.y = -1.6; ua.castShadow = true; ua.receiveShadow = true; arm.add(ua);
    const bicep = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 1.8), darkMat);
    bicep.position.set(0, -1.2, 0.25); arm.add(bicep);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), accentMat);
    elbow.position.y = -2.9; elbow.castShadow = true; arm.add(elbow);
    const elbowArmor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), darkMat);
    elbowArmor.position.set(0, -2.85, 0.3); arm.add(elbowArmor);
    const fa = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 1.5), darkMat);
    fa.position.y = -3.9; fa.castShadow = true; fa.receiveShadow = true; arm.add(fa);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.4), panelMat);
    guard.position.set(0, -3.7, 0.3); guard.castShadow = true; arm.add(guard);
  }
  // Claw (grabber) at the end of the right arm
  const clawR = new THREE.Group(); clawR.position.set(0, -5.2, 0); armR.add(clawR);
  const wrist = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.1), accentMat);
  wrist.position.set(0, 0.15, 0); wrist.castShadow = true; clawR.add(wrist);
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.5), darkMat);
  knuckle.position.set(0, -0.35, 0); clawR.add(knuckle);
  for (const s of [-1, 1]) {
    const pincer = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.15, 0.6), bladeMat);
    pincer.position.set(s * 0.7, -0.6, 0); pincer.castShadow = true; clawR.add(pincer);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.7), bladeMat);
    tip.position.set(s * 0.7, -1.25, 0.2); tip.castShadow = true; clawR.add(tip);
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), darkMat);
    piston.position.set(s * 0.7, -0.15, 0.55); clawR.add(piston);
  }
  // Left hand (fist) at the end of the left arm
  const handL = new THREE.Group(); handL.position.set(0, -5.0, 0); armL.add(handL);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.2), metalMat);
  palm.position.set(0, 0, 0); palm.castShadow = true; handL.add(palm);
  for (let i = -1; i <= 2; i++) {
    const kn = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.85), darkMat);
    kn.position.set(-0.55 + i * 0.37, -0.35, 0.55); handL.add(kn);
  }
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.7), darkMat);
  thumb.position.set(0.72, 0.1, 0.45); thumb.rotation.y = -0.4; handL.add(thumb);

  // ===== Head =====
  const head = new THREE.Group(); head.position.set(0, 13.7, 0); robot.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.2, 3.0), darkMat);
  skull.castShadow = true; skull.receiveShadow = true; head.add(skull);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 0.3), metalMat);
  brow.position.set(0, 0.8, 1.48); brow.castShadow = true; head.add(brow);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.34, 0.22), glowMat);
  eyes.position.set(0, 0.35, 1.52); head.add(eyes);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.55), darkMat);
    ear.position.set(sx * 1.7, 0.3, 0); ear.castShadow = true; head.add(ear);
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.12), glowMat);
    cheek.position.set(sx * 0.9, -0.35, 1.53); head.add(cheek);
  }
  const crest = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 0.2), accentMat);
  crest.position.set(0, 1.35, 0); head.add(crest);
  const crest2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.2), accentMat);
  crest2.position.set(0, 1.75, 0); head.add(crest2);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), darkMat);
  antenna.position.set(0.95, 1.6, 0); head.add(antenna);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), glowMat);
  beacon.position.set(0.95, 2.2, 0); head.add(beacon);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.25), mouthMat);
  mouth.position.set(0, -0.05, 1.5); head.add(mouth);
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.35), darkMat);
  chin.position.set(0, -0.55, 1.5); head.add(chin);
  // Jaw group chomps when eating (rotation.x swings it open)
  const jaw = new THREE.Group(); jaw.position.set(0, -0.25, 1.45); head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 0.9), darkMat);
  jawMesh.position.set(0, -0.25, 0.35); jawMesh.castShadow = true; jaw.add(jawMesh);
  for (let i = -1; i <= 1; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.18), toothMat);
    tooth.position.set(i * 0.6, 0.05, 0.62); jaw.add(tooth);
  }
  for (const sx of [-1, 1]) {
    const jplate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.8), darkMat);
    jplate.position.set(sx * 0.9, -0.25, 0.6); jaw.add(jplate);
  }

  robot.userData = { legL, legR, armL, armR, clawR, head, jaw, eyes, reactor, beacon };
  robot.position.set(0, 0, -PATROL_R);
  scene.add(robot);

  // ===== Public API =====
  const api = {
    mesh: robot,
    radius: ROBOT_RADIUS,
    playerCaptured: false,
    bumperCaptured: false,
    update,
  };

  // ===== Robot state machine =====
  const waypoints = [
    { x: 0, z: -PATROL_R },
    { x: PATROL_R, z: 0 },
    { x: 0, z: PATROL_R },
    { x: -PATROL_R, z: 0 },
  ];
  const st = {
    mode: 'patrol',   // patrol | seek | pickup | chew
    wp: 0,
    phase: Math.random() * Math.PI * 2,
    beaconT: 0,
    timer: 0,
    cooldown: 1,
    noHunt: 0,        // seconds it keeps patrolling after a meal before hunting again
    stuck: 0,         // seconds spent unable to move toward a target
    target: null,     // { kind, mesh, t, d, dx, dz }
    captured: null,   // { kind, mesh, t, off, snapped }
    respawn: null,    // eaten traffic info awaiting respawn
  };

  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  const rectCircleHit = (px, pz, c, r) => {
    const dx = Math.max(Math.abs(px - c.x) - c.halfW, 0);
    const dz = Math.max(Math.abs(pz - c.z) - c.halfD, 0);
    return dx * dx + dz * dz <= r * r;
  };
  const blockedByBuilding = (x, z, r, colliders) => {
    for (const c of colliders) if (rectCircleHit(x, z, c, r)) return true;
    return false;
  };

  const face = (dx, dz) => { robot.rotation.y = Math.atan2(dx, dz); };

  const clawWorld = () => {
    clawR.getWorldPosition(tmpV);
    return tmpV;
  };

  // Nearest edible car, wrap-aware (separate spans per axis). The fire engine
  // is never edible.
  function nearestEdible(ctx, wrapDeltaX, wrapDeltaZ) {
    let best = null;
    const consider = (kind, mesh, t) => {
      if (!mesh) return;
      if (kind === 'player' && api.playerCaptured) return;
      if (kind === 'bumper' && api.bumperCaptured) return;
      if (kind === 'traffic' && !ctx.traffic.includes(t)) return;
      // Altitude gate: the robot never goes underground, so it must only hunt
      // things on its own level. A player driving in the cavern below the
      // city must NOT be chased (and eaten) by the invisible robot overhead.
      if (Math.abs(robot.position.y - mesh.position.y) > 6) return;
      const dx = wrapDeltaX(robot.position.x, mesh.position.x);
      const dz = wrapDeltaZ(robot.position.z, mesh.position.z);
      const d = Math.hypot(dx, dz);
      if (!best || d < best.d) best = { kind, mesh, t, d, dx, dz };
    };
    consider('player', ctx.player.mesh);
    consider('bumper', ctx.bumper.mesh);
    for (const t of ctx.traffic) consider('traffic', t.mesh, t);
    return best;
  }

  function moveToward(dx, dz, step, wrapX, wrapZ, colliders) {
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const canStand = (x, z) => !blockedByBuilding(x, z, BODY_CLEAR, colliders);
    // Try the direct path first.
    const nx = wrapX(robot.position.x + ux * step);
    const nz = wrapZ(robot.position.z + uz * step);
    if (canStand(nx, nz)) {
      robot.position.x = nx;
      robot.position.z = nz;
      return true;
    }
    // Blocked ahead — slide perpendicular (right, then left) to get around
    // the building instead of getting stuck against its corner.
    const px = -uz;
    const pz = ux;
    for (const s of [1, -1]) {
      const tx = wrapX(robot.position.x + px * s * step);
      const tz = wrapZ(robot.position.z + pz * s * step);
      if (canStand(tx, tz)) {
        robot.position.x = tx;
        robot.position.z = tz;
        return true;
      }
    }
    return false;
  }

  function walkAnim(delta, speed) {
    st.phase += delta * speed * 2.4;
    const swing = Math.sin(st.phase) * 0.7;
    robot.userData.legL.rotation.x = swing;
    robot.userData.legR.rotation.x = -swing;
    robot.userData.armL.rotation.x = -swing * 0.6;
    robot.userData.armR.rotation.x = swing * 0.6;
  }

  function beginCapture(ctx, n) {
    st.captured = {
      kind: n.kind,
      mesh: n.mesh,
      t: n.t || null,
      off: n.t ? (n.t.axis === 'x' ? n.mesh.position.z : n.mesh.position.x) : 0,
      snapped: false,
      eaten: false,
    };
    st.mode = 'pickup';
    st.timer = 0;
    // Stop simulating the victim immediately (traffic is spliced out).
    if (n.kind === 'traffic' && n.t) {
      const idx = ctx.traffic.indexOf(n.t);
      if (idx !== -1) ctx.traffic.splice(idx, 1);
    }
  }

  function finishEat(ctx) {
    const cap = st.captured;
    cap.mesh.visible = false;
    if (cap.kind === 'player') {
      api.playerCaptured = false;
      ctx.onPlayerEaten();          // main.js respawns the player
    } else if (cap.kind === 'bumper') {
      api.bumperCaptured = false;
      ctx.onBumperEaten();
    } else if (cap.kind === 'traffic') {
      st.respawn = { axis: cap.t.axis, dir: cap.t.dir, speed: cap.t.speed, off: cap.off, mesh: cap.mesh };
    }
    st.captured = null;
    st.cooldown = EAT_COOLDOWN;
    // Keep walking for a bit before hunting again, so it doesn't just camp
    // on a busy lane and eat every car that drives by in place.
    st.noHunt = 5;
  }

  function respawnTraffic(ctx) {
    const rp = st.respawn;
    if (!rp) return;
    // Drop it somewhere on its lane that isn't on top of another car (a
    // respawn landing inside existing traffic would get both de-overlapped).
    let coord = Math.random() * 160 - 80;
    for (let tries = 0; tries < 20; tries++) {
      const tx = rp.axis === 'x' ? coord : rp.off;
      const tz = rp.axis === 'x' ? rp.off : coord;
      let clash = false;
      for (const other of ctx.traffic) {
        const dx = Math.abs(other.mesh.position.x - tx);
        const dz = Math.abs(other.mesh.position.z - tz);
        if (dx < 8 && dz < 8) { clash = true; break; }
      }
      if (!clash) break;
      coord = Math.random() * 160 - 80;
    }
    const mesh = rp.mesh;
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    if (rp.axis === 'x') {
      mesh.position.set(coord, 0.15, rp.off);
      mesh.rotation.y = rp.dir === -1 ? 0 : Math.PI;
    } else {
      mesh.position.set(rp.off, 0.15, coord);
      mesh.rotation.y = rp.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    ctx.traffic.push({ mesh, axis: rp.axis, dir: rp.dir, speed: rp.speed, speedCur: rp.speed, homeLat: rp.off, shove: 0, knock: null });
    st.respawn = null;
  }

  function pickupAnim(delta, ctx) {
    st.timer += delta;
    const t = st.timer;
    const armR = robot.userData.armR;
    const head = robot.userData.head;
    const jaw = robot.userData.jaw;

    // Legs + left arm ease back to neutral while it works
    robot.userData.legL.rotation.x *= 0.88;
    robot.userData.legR.rotation.x *= 0.88;
    robot.userData.armL.rotation.x = 0.3;

    if (t < REACH_T) {
      // Reach: claw swings down toward the victim in front
      const k = t / REACH_T;
      armR.rotation.x = lerp(armR.rotation.x, REACH_ANG, Math.min(1, k * 1.6));
    } else if (t < REACH_T + LIFT_T) {
      // Grab (snap the car into the claw), then lift it toward the mouth
      if (!st.captured.snapped) {
        st.captured.snapped = true;
        st.captured.mesh.position.copy(clawWorld());
        if (st.captured.kind === 'player') api.playerCaptured = true;
        if (st.captured.kind === 'bumper') api.bumperCaptured = true;
      }
      const k = (t - REACH_T) / LIFT_T;
      armR.rotation.x = lerp(REACH_ANG, LIFT_ANG, k);
      st.captured.mesh.position.lerp(clawWorld(), Math.min(1, delta * 18));
    } else if (t < REACH_T + LIFT_T + EAT_T) {
      // Eat: head dips, jaw opens, the car shrinks into the mouth
      armR.rotation.x = LIFT_ANG;
      const k = (t - REACH_T - LIFT_T) / EAT_T;
      head.rotation.x = k * 0.5;
      jaw.rotation.x = -k * 0.75;
      head.getWorldPosition(tmpV2);
      st.captured.mesh.position.lerp(tmpV2, Math.min(1, delta * 14));
      st.captured.mesh.scale.setScalar(Math.max(0.001, 1 - k));
      if (k >= 1 && !st.captured.eaten) {
        st.captured.eaten = true;
        finishEat(ctx);
      }
    } else if (t < PICKUP_TOTAL) {
      // Return the claw/head/jaw to rest
      const k = (t - REACH_T - LIFT_T - EAT_T) / RETURN_T;
      armR.rotation.x = lerp(LIFT_ANG, REST_ANG, k);
      head.rotation.x = 0.5 * (1 - k);
      jaw.rotation.x = -0.75 * (1 - k);
    } else {
      // Safety net: if a huge frame gap jumped past the eat phase, finalize
      // the meal now so eaten cars always get hidden/respawned.
      if (st.captured && !st.captured.eaten) {
        st.captured.eaten = true;
        finishEat(ctx);
      }
      st.mode = 'chew';
      st.timer = 0;
      armR.rotation.x = REST_ANG;
      head.rotation.x = 0;
      jaw.rotation.x = 0;
      st.target = null;
    }
  }

  function update(delta, ctx) {
    const wrapX = ctx.wrapX;
    const wrapZ = ctx.wrapZ;
    const wrapDeltaX = ctx.wrapDeltaX;
    const wrapDeltaZ = ctx.wrapDeltaZ;
    // Clamp huge frame gaps (tab hitches / background throttling) so the
    // animation can't skip whole phases in one step.
    delta = Math.min(delta, 0.1);

    if (st.cooldown > 0) st.cooldown -= delta;
    if (st.noHunt > 0) st.noHunt -= delta;
    st.beaconT += delta;

    // Blinking antenna beacon
    robot.userData.beacon.material.emissiveIntensity =
      Math.sin(st.beaconT * 2.2) > 0.4 ? 2.4 : 0.15;

    switch (st.mode) {
      case 'patrol': {
        const tgt = waypoints[st.wp];
        const dx = wrapDeltaX(robot.position.x, tgt.x);
        const dz = wrapDeltaZ(robot.position.z, tgt.z);
        if (Math.hypot(dx, dz) < 1.0) {
          st.wp = (st.wp + 1) % waypoints.length;
          break;
        }
        face(dx, dz);
        if (st.cooldown <= 0 && st.noHunt <= 0) {
          const n = nearestEdible(ctx, wrapDeltaX, wrapDeltaZ);
          if (n && n.d < DETECT_RANGE) { st.target = n; st.mode = 'seek'; break; }
        }
        moveToward(dx, dz, WALK_SPEED * delta, wrapX, wrapZ, ctx.colliders);
        walkAnim(delta, WALK_SPEED);
        break;
      }
      case 'seek': {
        const n = nearestEdible(ctx, wrapDeltaX, wrapDeltaZ);
        if (!n) { st.mode = 'patrol'; st.target = null; st.stuck = 0; break; }
        if (n.d < PICKUP_RANGE) { beginCapture(ctx, n); st.stuck = 0; break; }
        st.target = n;
        face(n.dx, n.dz);
        const moved = moveToward(n.dx, n.dz, SEEK_SPEED * delta, wrapX, wrapZ, ctx.colliders);
        st.stuck = moved ? 0 : st.stuck + delta;
        if (st.stuck > 3) { st.mode = 'patrol'; st.target = null; st.stuck = 0; break; }
        walkAnim(delta, SEEK_SPEED);
        break;
      }
      case 'pickup':
        pickupAnim(delta, ctx);
        break;
      case 'chew': {
        st.timer += delta;
        const chomp = Math.sin(st.timer * 12);
        robot.userData.jaw.rotation.x = chomp > 0 ? 0 : -chomp * 0.9;
        if (st.timer > CHEW_T) {
          st.mode = 'patrol';
          st.timer = 0;
          robot.userData.jaw.rotation.x = 0;
          if (st.respawn) respawnTraffic(ctx);
        }
        break;
      }
    }

    robot.position.x = wrapX(robot.position.x);
    robot.position.z = wrapZ(robot.position.z);
  }

  return api;
}
