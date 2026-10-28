import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { SOCCER, createBall, stepBall, separateBalls, BALL_SPLIT_COOLDOWN } from './soccerPhysics.mjs?v=1800000000054';
import { addKnockable } from './physics.js?v=1800000000006';
import { makeTire } from './modules/tireModel.js?v=1800000000060';
import { natureHillHeightAt } from './modules/cityHills.js?v=1793123233707';

// ===== The soccer pitch ======================================================
// A big marked pitch in the clear belt east of the railway loop, with a goal
// at each end and one oversized ball. Both player cars can boot it — and so
// does the city's chase car, which shoves it around but is never allowed to
// duplicate it (see `canSplit` in soccerPhysics.mjs).

const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
export const SCORE_TIRE_RADIUS = 0.72;
export const SCORE_TIRE_HALF_WIDTH = 0.18;
// One tire up the pile. The beads stand a little proud of each sidewall, so
// consecutive tires nest into each other rather than sitting on air.
const SCORE_TIRE_STEP = SCORE_TIRE_HALF_WIDTH * 2 + 0.015;
export const SCORE_TIRE_GROUND = SCORE_TIRE_HALF_WIDTH;
const SCORE_TIRE_DROP_HEIGHT = 10;

const postMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f5f0, roughness: 0.5 });
const netLineMaterial = new THREE.LineBasicMaterial({ color: 0xf1f5f7, transparent: true, opacity: 0.9 });

// A goal tire: the tire model both worlds share (see modules/tireModel.js), at
// the size the score pile stacks.
export function makeScoreTire() {
  return makeTire(SCORE_TIRE_RADIUS);
}

function dropScoreTire(state, goalIndex) {
  const goal = state.goals[goalIndex];
  const stack = state.tireStacks[goalIndex];
  let supporter = [...stack].reverse().find((k) =>
    (k.state === 'standing' || k.state === 'bouncing') && !k.removed &&
    Math.hypot(k.group.position.x - k.basePos.x, k.group.position.z - k.basePos.z) < 0.75,
  ) || null;
  const layer = supporter ? Math.round((supporter.slotY - SCORE_TIRE_GROUND) / SCORE_TIRE_STEP) + 1 : 0;
  const seed = stack.length + 1;
  const offsetX = Math.sin(seed * 2.37 + goalIndex) * 0.19;
  const offsetZ = Math.cos(seed * 1.71 + goalIndex) * 0.17;
  const x = SOCCER.cx + SOCCER.goalHalf + SCORE_TIRE_RADIUS * 0.9 + offsetX;
  const z = goal.line + goal.dir * (0.9 + offsetZ);
  const slotY = SCORE_TIRE_GROUND + layer * SCORE_TIRE_STEP;
  const group = makeScoreTire();
  group.position.set(x, slotY + SCORE_TIRE_DROP_HEIGHT, z);
  group.rotation.set(
    (Math.sin(seed * 0.91) * 0.08),
    seed * 0.57,
    (Math.cos(seed * 1.13) * 0.07),
  );
  state.group.add(group);

  const k = addKnockable(group, SCORE_TIRE_RADIUS, {
    mode: 'tire',
    // The FLAT ground, not the tire's slot. This is where a knocked tire lands
    // and rolls, and — crucially — where a tire that loses its support falls to.
    // It used to be the slot height, so a tire whose support was knocked out
    // "dropped" to exactly the height it was already at and the pile looked
    // like it had merely drifted apart instead of collapsing.
    groundY: SCORE_TIRE_GROUND,
    // …and the ground is not always flat: a tire knocked toward one of the
    // outer belt's hills has to climb and settle on it, not sink into it.
    groundAt: (x, z) => SCORE_TIRE_GROUND + natureHillHeightAt(x, z),
    // A collapsed column is one tire wide, so the landing tires have to spread
    // out or they all come to rest in a heap on the same spot.
    dropSkid: 0.85,
    rimLift: SCORE_TIRE_RADIUS - SCORE_TIRE_HALF_WIDTH,
    rollRadius: SCORE_TIRE_RADIUS,
    rollPower: 15,
    rollDecay: 1.05,
    rollDuration: 0.8,
    sideChance: 0.35,
    slideDistance: 3.2,
    flyHeight: 1.1,
    spinGroup: group,
    rollSpinAxis: 'y',
    shovePower: 5.5,
    shoveSpinPower: 2.2,
    supporters: supporter ? [supporter] : null,
    bounceRestitution: 0.42,
  });
  k.state = 'bouncing';
  k.vy = 0;
  k.slotY = slotY;
  k.bounceVx = Math.sin(seed * 1.23) * 0.5;
  k.bounceVz = Math.cos(seed * 1.47) * 0.5;
  k.bounceSpin = (seed % 2 ? 1 : -1) * 1.4;
  k.bounceCount = 0;
  // A knocked-out column falls outward, so each tire is given its own radial
  // shove direction (spread by the golden angle) instead of all of them sliding
  // the same way. knockAt overwrites this with the real hit direction.
  const fallAngle = seed * 2.39996;
  k.pushDir.set(Math.sin(fallAngle), 0, Math.cos(fallAngle));
  k.perp.set(Math.cos(fallAngle), 0, -Math.sin(fallAngle));
  // Tier by tier, like the ramp-world pyramid: the bottom tire hits the ground
  // before the one above it lets go.
  k.dropDelay = 0.06 + layer * 0.12;
  stack.push(k);
  return k;
}

export function updateSoccerScoreTires(state, delta) {
  for (const stack of state.tireStacks) {
    for (const k of stack) {
      if (k.state !== 'bouncing') continue;
      k.vy -= 26 * delta;
      k.group.position.x += k.bounceVx * delta;
      k.group.position.z += k.bounceVz * delta;
      k.group.position.y += k.vy * delta;
      k.group.rotation.y += delta * k.bounceSpin;
      const damping = Math.exp(-2.2 * delta);
      k.bounceVx *= damping;
      k.bounceVz *= damping;
      k.bounceSpin *= damping;

      if (k.group.position.y > k.slotY) continue;
      k.group.position.y = k.slotY;
      if (k.vy < -0.75 && k.bounceCount < 8) {
        k.vy = -k.vy * 0.42;
        k.bounceVx *= 0.72;
        k.bounceVz *= 0.72;
        k.bounceCount++;
        continue;
      }

      k.vy = 0;
      k.bounceVx = 0;
      k.bounceVz = 0;
      k.bounceSpin = 0;
      k.basePos.copy(k.group.position);
      k.baseQuat.copy(k.group.quaternion);
      k.state = 'standing';
    }
  }
}

const ICOSAHEDRON_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

// How each panel is drawn. The ball is a proper truncated icosahedron projected
// onto a sphere: the 60 panel corners sit exactly ON the sphere, and every panel
// is domed (its face follows the ball's curve) rather than being a flat chord.
// Flat panels were the reason the ball looked wrong — they left the silhouette
// lumpy and the pattern broke up near the top, where the flat facets fell away
// from the sphere and let the background show between them.
const BALL_PANEL_INSET = 0.032;   // each panel pulls back from its shared edges…
const BALL_EDGE_STEPS = 3;        // …sampled this many times per edge (rounds the outline)
const BALL_RINGS = 2;             // radial rings from a panel's centre out to its edge

function buildBallGeometries(radius) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  const dirs = raw.map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
  const adjacent = dirs.map(() => new Set());
  for (const [a, b, c] of ICOSAHEDRON_FACES) {
    adjacent[a].add(b); adjacent[a].add(c);
    adjacent[b].add(a); adjacent[b].add(c);
    adjacent[c].add(a); adjacent[c].add(b);
  }

  // The 60 truncation corners: for each icosahedron edge, the point a third of
  // the way along it, pulled back onto the sphere. Every pentagon and hexagon
  // shares these exact corners, so the panels tile the ball with no seams to
  // paper over.
  const cuts = new Map();
  const cut = (from, to) => {
    const key = from * 12 + to;
    let point = cuts.get(key);
    if (!point) {
      point = dirs[from].clone().multiplyScalar(2).add(dirs[to]).normalize();
      cuts.set(key, point);
    }
    return point;
  };

  // Panels are accumulated per colour rather than per mesh: one geometry holds
  // all twelve pentagons and another all twenty hexagons, so a ball is three
  // meshes instead of thirty-three. That matters because the pitch MULTIPLIES
  // its ball (see splitBall) — at a hundred-plus balls it is the difference
  // between three hundred draw calls and three thousand.
  const positions = { pentagon: [], hexagon: [] };
  const normals = { pentagon: [], hexagon: [] };

  // One panel: `corners` are unit sphere directions in the order they run round
  // the panel's outline.
  const addPanel = (corners, type) => {
    const centre = new THREE.Vector3();
    for (const corner of corners) centre.add(corner);
    centre.normalize();

    // Pull the outline toward the panel's own centre, leaving the groove.
    const outline = corners.map((corner) => corner.clone().lerp(centre, BALL_PANEL_INSET).normalize());
    const shape = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      for (let step = 0; step < BALL_EDGE_STEPS; step++) {
        shape.push(a.clone().lerp(b, step / BALL_EDGE_STEPS).normalize());
      }
    }
    // Wound so the finished panel faces outward (the pixels are one-sided).
    const facing = new THREE.Vector3().crossVectors(
      shape[1].clone().sub(shape[0]), shape[2].clone().sub(shape[0]),
    );
    if (facing.dot(centre) < 0) shape.reverse();

    const onBall = (dir) => dir.normalize().multiplyScalar(radius);
    const apex = onBall(centre.clone());
    const rings = [];
    for (let ring = 1; ring <= BALL_RINGS; ring++) {
      const t = ring / BALL_RINGS;
      rings.push(shape.map((dir) => onBall(centre.clone().lerp(dir, t))));
    }

    const tris = positions[type], norms = normals[type];
    const triangle = (a, b, c) => {
      for (const point of [a, b, c]) {
        tris.push(point.x, point.y, point.z);
        // Radial normals: the panels shade as one smooth (round) ball.
        norms.push(point.x / radius, point.y / radius, point.z / radius);
      }
    };
    const first = rings[0];
    for (let i = 0; i < first.length; i++) {
      const next = (i + 1) % first.length;
      triangle(apex, first[i], first[next]);
      for (let ring = 0; ring < BALL_RINGS - 1; ring++) {
        triangle(rings[ring][i], rings[ring + 1][i], rings[ring + 1][next]);
        triangle(rings[ring][i], rings[ring + 1][next], rings[ring][next]);
      }
    }
  };

  for (let i = 0; i < dirs.length; i++) {
    const normal = dirs[i];
    const reference = Math.abs(normal.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(reference, normal).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    const neighbours = [...adjacent[i]].sort((a, b) => {
      const pa = cut(i, a), pb = cut(i, b);
      return Math.atan2(pa.dot(v), pa.dot(u)) - Math.atan2(pb.dot(v), pb.dot(u));
    });
    addPanel(neighbours.map((neighbour) => cut(i, neighbour)), 'pentagon');
  }

  for (const face of ICOSAHEDRON_FACES) {
    const [a, b, c] = face;
    const outward = new THREE.Vector3().crossVectors(
      dirs[b].clone().sub(dirs[a]),
      dirs[c].clone().sub(dirs[a]),
    ).dot(dirs[a].clone().add(dirs[b]).add(dirs[c]));
    const [first, second, third] = outward >= 0 ? face : [a, c, b];
    addPanel([
      cut(first, second), cut(second, first),
      cut(second, third), cut(third, second),
      cut(third, first), cut(first, third),
    ], 'hexagon');
  }

  const panelGeometry = (type) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions[type], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals[type], 3));
    return g;
  };
  return {
    core: new THREE.SphereGeometry(radius * 0.985, 28, 18),
    pentagon: panelGeometry('pentagon'),
    hexagon: panelGeometry('hexagon'),
  };
}

// One cached set of ball buffers per radius, shared by every ball on the pitch.
const ballGeometryCache = new Map();
const ballWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f4ec, roughness: 0.55 });
const ballBlackMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 });

function ballGeometries(radius) {
  let set = ballGeometryCache.get(radius);
  if (!set) {
    set = buildBallGeometries(radius);
    ballGeometryCache.set(radius, set);
  }
  return set;
}

// A fresh ball to hang in the scene. The meshes are new (they carry their own
// transforms) but the buffers behind them are shared, so a thousand of these
// cost a thousand transforms, not a thousand icosahedra.
export function makeSoccerBall(radius) {
  const geo = ballGeometries(radius);
  const ball = new THREE.Group();
  ball.name = 'soccerBall';

  // The dark inner sphere. It fills the grooves between panels, so those grooves
  // read as black stitching instead of see-through cracks, and it keeps the
  // silhouette a circle even where a panel's edge is inset.
  const core = new THREE.Mesh(geo.core, ballBlackMaterial);
  core.castShadow = true;
  core.receiveShadow = true;
  ball.add(core);

  for (const [type, geometry, count] of [
    ['pentagon', geo.pentagon, 12],
    ['hexagon', geo.hexagon, 20],
  ]) {
    const panel = new THREE.Mesh(geometry, type === 'pentagon' ? ballBlackMaterial : ballWhiteMaterial);
    panel.userData.panelType = type;
    panel.userData.panelCount = count;
    panel.castShadow = true;
    panel.receiveShadow = true;
    ball.add(panel);
  }
  return ball;
}

function buildGoal(g, colliders, side, postMat, lineMat) {
  const S = SOCCER;
  const line = side === 0 ? S.z0 : S.z1;
  const dir = side === 0 ? -1 : 1;
  const back = line + dir * S.goalDepth;

  // The white frame.
  const postGeo = new THREE.CylinderGeometry(0.18, 0.18, S.goalH, 8);
  const addPost = (x, y, z) => {
    const m = new THREE.Mesh(postGeo, postMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  for (const sx of [-1, 1]) {
    addPost(S.cx + sx * S.goalHalf, S.goalH / 2, line);   // mouth post
    addPost(S.cx + sx * S.goalHalf, S.goalH / 2, back);   // back post
  }
  // Crossbar (and the back top bar), laid along X.
  const crossGeo = new THREE.CylinderGeometry(0.18, 0.18, S.goalHalf * 2, 8);
  for (const z of [line, back]) {
    const bar = new THREE.Mesh(crossGeo, postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(S.cx, S.goalH, z);
    bar.castShadow = true;
    g.add(bar);
  }
  // Ground bars.
  const lowGeo = new THREE.CylinderGeometry(0.09, 0.09, S.goalDepth, 6);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(lowGeo, postMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(S.cx + sx * S.goalHalf, 0.12, (line + back) / 2);
    g.add(rail);
    // Top side rails, tying the mouth posts to the back frame.
    const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, S.goalDepth, 6), postMat);
    topRail.rotation.x = Math.PI / 2;
    topRail.position.set(S.cx + sx * S.goalHalf, S.goalH, (line + back) / 2);
    topRail.castShadow = true;
    g.add(topRail);
  }
  const backLow = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, S.goalHalf * 2, 6), postMat);
  backLow.rotation.z = Math.PI / 2;
  backLow.position.set(S.cx, 0.12, back);
  g.add(backLow);

  // The net: one LineSegments grid for the back, both sides and the roof.
  const seg = [];
  const step = 0.7, y0 = 0.1;
  for (let x = -S.goalHalf; x <= S.goalHalf + 1e-6; x += step) {
    seg.push(S.cx + x, y0, back, S.cx + x, S.goalH, back);
  }
  for (let y = y0; y <= S.goalH + 1e-6; y += step) {
    seg.push(S.cx - S.goalHalf, y, back, S.cx + S.goalHalf, y, back);
  }
  for (const sx of [-1, 1]) {
    const x = S.cx + sx * S.goalHalf;
    for (let d = 0; d <= S.goalDepth + 1e-6; d += step) {
      seg.push(x, y0, line + dir * d, x, S.goalH, line + dir * d);
    }
    for (let y = y0; y <= S.goalH + 1e-6; y += step) {
      seg.push(x, y, line, x, y, back);
    }
  }
  for (let x = -S.goalHalf; x <= S.goalHalf + 1e-6; x += step) {
    seg.push(S.cx + x, S.goalH, line, S.cx + x, S.goalH, back);
  }
  for (let d = 0; d <= S.goalDepth + 1e-6; d += step) {
    seg.push(S.cx - S.goalHalf, S.goalH, line + dir * d, S.cx + S.goalHalf, S.goalH, line + dir * d);
  }
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const net = new THREE.LineSegments(netGeo, lineMat);
  net.name = 'soccerGoalNet';
  g.add(net);

  // The goal flash: a flat ring at the mouth that pops when a goal goes in.
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(2.7, 0.3, 6, 32),
    new THREE.MeshBasicMaterial({ color: 0x9fe8b0, transparent: true, opacity: 0 }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(S.cx, 0.1, line - dir * 0.15);
  g.add(glow);

  // Cars stop against the frame: the four posts (well, the two mouth posts —
  // the back pair is inside the shell below) and the net walls.
  colliders.push({ x: S.cx - S.goalHalf, z: line, halfW: 0.24, halfD: 0.24, h: S.goalH, noRoof: true });
  colliders.push({ x: S.cx + S.goalHalf, z: line, halfW: 0.24, halfD: 0.24, h: S.goalH, noRoof: true });
  colliders.push({ x: S.cx, z: back, halfW: S.goalHalf, halfD: 0.14, h: S.goalH, noRoof: true });
  for (const sx of [-1, 1]) {
    colliders.push({
      x: S.cx + sx * S.goalHalf, z: (line + back) / 2,
      halfW: 0.14, halfD: S.goalDepth / 2, h: S.goalH, noRoof: true,
    });
  }

  return { glow, flash: 0, line, back, dir };
}

// The pitch itself: grass, markings, both goals and the ball. Returns the group
// without putting it in a scene, because the object browser wants the same pitch
// on its spinning stage (see makeSoccerPitch).
function buildPitch(colliders) {
  const S = SOCCER;
  const g = new THREE.Group();
  g.name = 'soccerPitch';

  const pitchMat = new THREE.MeshStandardMaterial({ color: 0x4c9648, roughness: 0.96 });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xf1f5ef, roughness: 0.85 });

  const W = S.x1 - S.x0, D = S.z1 - S.z0;
  const flat = (w, d, x, z, mat = paintMat, y = 0.035) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // Mown pitch and painted markings.
  flat(W, D, S.cx, S.cz, pitchMat, 0.02);
  const t = 0.22;
  flat(W, t, S.cx, S.z0 + t / 2);
  flat(W, t, S.cx, S.z1 - t / 2);
  flat(t, D, S.x0 + t / 2, S.cz);
  flat(t, D, S.x1 - t / 2, S.cz);
  flat(W - 0.2, t, S.cx, S.cz);
  // Centre circle + spot.
  const circle = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.11, 4, 56), paintMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.set(S.cx, 0.045, S.cz);
  g.add(circle);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12), paintMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(S.cx, 0.045, S.cz);
  g.add(spot);
  // Penalty boxes (16 wide, 5.5 deep) with a penalty spot in each.
  for (const s of [-1, 1]) {
    const lineZ = s < 0 ? S.z0 : S.z1;
    const front = lineZ - s * 5.5;          // 5.5 into the pitch
    flat(16, t, S.cx, front);
    flat(t, 5.5, S.cx - 8, (lineZ + front) / 2);
    flat(t, 5.5, S.cx + 8, (lineZ + front) / 2);
    const pen = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12), paintMat);
    pen.rotation.x = -Math.PI / 2;
    pen.position.set(S.cx, 0.045, lineZ - s * 4);
    g.add(pen);
  }

  const goals = [
    buildGoal(g, colliders, 0, postMaterial, netLineMaterial),
    buildGoal(g, colliders, 1, postMaterial, netLineMaterial),
  ];

  // The oversized ball. Everything the ball needs to live on the pitch (its
  // physics body, its mesh) travels in one record, because the pitch can now
  // hold a whole horde of them.
  const balls = [newBall(S.cx, S.cz)];
  g.add(balls[0].mesh);

  return { group: g, balls, goals };
}

// A ball's physics body and its mesh, together. `createBall` keeps the physics
// module free of THREE, so the mesh is just hung off the record here.
function newBall(x, z) {
  const ball = createBall(x, z);
  ball.mesh = makeSoccerBall(SOCCER.ballR);
  ball.mesh.position.set(x, SOCCER.ballR + 0.04, z);
  return ball;
}

// A ceiling on the horde. Each bump doubles it, so 160 is eight bumps from the
// kick-off — enough to carpet the pitch, and still inside what the frame budget
// can draw (every ball is three shared-buffer meshes).
const MAX_SOCCER_BALLS = 160;

// Every punt splits the ball it hit: that ball becomes two. Drive through the
// pair and it is four, and so on. The newcomer is thrown off at an angle so the
// two never occupy the same hole, and it starts on its own split cooldown so the
// touch that made it cannot immediately split it again.
function splitBall(state, ball) {
  if (state.balls.length >= MAX_SOCCER_BALLS) return;
  // The ball divides rather than spawning a copy of itself: the two halves share
  // its momentum and fly apart along the line between them, popping out just
  // clear of each other, so what you see is one ball becoming two.
  const a = Math.random() * Math.PI * 2;
  const nx = Math.cos(a), nz = Math.sin(a);
  const share = 0.5;
  const pvx = ball.vx * share, pvz = ball.vz * share;
  const spread = 3.5;
  const copy = newBall(ball.x + nx * ball.r * 1.6, ball.z + nz * ball.r * 1.6);
  ball.vx = pvx + nx * spread;
  ball.vz = pvz + nz * spread;
  copy.vx = pvx - nx * spread;
  copy.vz = pvz - nz * spread;
  copy.kickCool = BALL_SPLIT_COOLDOWN;
  copy.mesh.position.set(copy.x, copy.r + 0.04, copy.z);
  state.group.add(copy.mesh);
  state.balls.push(copy);
}

export function buildSoccerField(scene, colliders) {
  const { group, balls, goals } = buildPitch(colliders);
  group.name = 'soccerField';
  scene.add(group);
  return {
    group,
    balls,
    goals,
    tireStacks: [[], []],
  };
}

// The whole pitch, for the object browser's stage: the same group the level
// gets, just not put in a scene. The ball is on its centre spot.
export function makeSoccerPitch() {
  return buildPitch([]).group;
}

// One goal on its own, for the object browser. Its net is line segments rather
// than a mesh, so the browser's thumbnail still has the frame to show.
export function makeSoccerGoal() {
  const g = new THREE.Group();
  g.name = 'soccerGoal';
  buildGoal(g, [], 0, postMaterial, netLineMaterial);
  return g;
}

// Per-frame: step the physics of every ball on the pitch, place and roll each
// one, split whatever was just booted, and run the goal flash.
export function updateSoccerBall(state, delta, actors) {
  if (!state) return;
  // Snapshot the count first: a ball split this frame is stepped from next
  // frame, so nothing gets integrated twice in one tick.
  const count = state.balls.length;
  const scored = [false, false];
  for (let i = 0; i < count; i++) {
    const b = state.balls[i];
    const ev = stepBall(b, delta, actors);
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.02) {
      _axis.set(b.vz / sp, 0, -b.vx / sp);
      _q.setFromAxisAngle(_axis, (sp * delta) / b.r);
      b.mesh.quaternion.premultiply(_q);
    }
    if (ev && ev.kick) splitBall(state, b);
    if (ev && ev.goal !== undefined) {
      scored[ev.goal] = true;
      dropScoreTire(state, ev.goal);
    }
  }

  // Resolve the horde's own overlaps after every ball has moved, then hang the
  // meshes off the finished positions.
  separateBalls(state.balls);
  for (const b of state.balls) b.mesh.position.set(b.x, b.r + 0.04, b.z);

  for (let i = 0; i < state.goals.length; i++) {
    const goal = state.goals[i];
    if (scored[i]) goal.flash = 1;
    if (goal.flash > 0) {
      goal.flash = Math.max(0, goal.flash - delta * 1.5);
      const k = 1 - goal.flash;
      goal.glow.material.opacity = 0.65 * goal.flash * goal.flash;
      goal.glow.scale.setScalar(1 + k * 1.3);
    } else if (goal.glow.material.opacity !== 0) {
      goal.glow.material.opacity = 0;
      goal.glow.scale.setScalar(1);
    }
  }
}
