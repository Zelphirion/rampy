import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  BEACH_HALF_W, BEACH_SEA_Y, BEACH_SHORE_Z, BEACH_RIM_Z, BEACH_BASIN_Y,
  BEACH_TRENCH_Z, BEACH_TRENCH_Y, BEACH_SHELF_Z0, BEACH_SHELF_Z1,
  beachGroundOffsetAt, clamp01, cliffHash,
  PERSON_H, animalSize,
} from './layout.js?v=1791038381904';

// ===== The wildlife =====
//
// Four populations, each with a reason to be where it is:
//
//   crabs    on the dry sand, sheltering behind the boulders. They come out and
//            run you down when you drive up on them, then lose interest.
//   fish     in the water above the shelf and along the drop-off, in schools of
//            a few different species so the sea does not look like one animal
//            copied around.
//   turtles  gliding the deep basin, which is the deepest water you can drive.
//   seahorses hanging in the kelp-ish water off the cliff feet.
//   mermaid  down in the trench past the drop-off - the one thing out here you
//            can never reach, only look down on.
//
// Everything here is built from primitives and driven by a plain wander, so
// there is no pathfinding and nothing that can end up stuck inside the cliff.

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

// ===== Scale =====
//
// The beach is on the same scale as the HOUSE, and in the house a person is a
// giant: they sit in a chair whose seat is 3 wide and 2.6 off the floor, with a
// back that reaches 6.5 (src/levels/house/index.js, function chair()). Someone
// sitting in one of those chairs stands about 7-8 tall - roughly twice the width
// of the car (radius 2.2, so 4.4 across).
//
// That is the yardstick for everything on this beach. Without it the wildlife was
// built to no scale at all and came out smaller than the car, which is the one
// object in the level whose size is fixed and cannot be argued with. A mermaid
// you cannot tell from a seahorse at a distance is not a mermaid.
//
// So: PERSON_H is the reference, and every animal below is expressed as a
// fraction of it. A real crab is about a hundredth of a person's height and is
// invisible at this scale, so the beach crabs are not realistic - they are the
// SMALLEST thing here that still reads as an animal from the car.
// The yardstick itself, PERSON_H, and the table of animal sizes in fractions of
// it, both live in layout.js. They are data, not geometry, and layout.js is the
// module that can be read without a renderer - so the scale can be tested by
// the plain node test suite. What follows is only the machinery that turns a
// fraction into an actual mesh of that size.

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...opts });

// ---- shared geometry, built once ----
const G = {
  sphere: new THREE.SphereGeometry(1, 10, 8),
  sphereLo: new THREE.SphereGeometry(1, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 7),
  tail: new THREE.ConeGeometry(0.5, 1, 5),
};

function part(geo, material, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---- sizing to the person, not to guesswork ----
//
// Every animal below is modelled in whatever numbers read well as a shape, then
// run through fitSize() to make its real extent match the size it was ASKED for.
// That is the whole reason scale lives in one place: the numbers inside each
// model are free to be whatever makes the silhouette good, and only the size
// that reaches the screen is pinned to PERSON_H.
//
// It works by scaling ONE wrapper node, never the parts. The earlier version
// multiplied each part's scale in place, which is wrong in a way that looks fine
// on screen at a glance: scaling a part's scale does NOT move it, so a fin or a
// claw stays exactly where it was while growing, and the animal comes out the
// wrong overall size with its limbs detached. Scaling a single parent moves the
// whole hierarchy together, and the animation pivots inside it (a leg's shoulder,
// a tail's root) still work because they are scaled along with everything else.
//
// Axis is the model's long axis: 'x' for a fish, 'y' for a swimming figure,
// 'z' for the turtle, which is modelled nose-along -Z. `ground` drops the model
// so its underside sits at y=0, which is what the crabs need to stand on the sand
// instead of hovering over it.
//
// `inner` is the wrapper the model was built into; the caller keeps the OUTER
// group for positioning, so nothing gameplay does gets scaled.
const _box = new THREE.Box3();
function fitSize(inner, size, axis = 'x', ground = false) {
  const axisOf = (b) => (axis === 'y' ? b.max.y - b.min.y : axis === 'z' ? b.max.z - b.min.z : b.max.x - b.min.x);
  _box.setFromObject(inner);
  const ext = axisOf(_box);
  const k = size / (ext || 1);
  inner.scale.setScalar(k);
  // Re-measure with the new scale applied, then shift the WRAPPER so the model's
  // underside lands on y=0. Moving the wrapper rather than the parts is what
  // keeps the pivots intact.
  _box.setFromObject(inner);
  if (ground) inner.position.y -= _box.min.y - inner.position.y;
  // Tag the wrapper with what it IS, so a test can go looking for "the mermaid"
  // and get her whole bounding box rather than one of her hair spheres. Measuring
  // a part instead of the animal is how the scale bug survived the first pass.
  inner.userData.animal = size;
  inner.userData.axis = axis;
  return inner;
}

// ===== Crabs =====
//
// A crab is SOLID. It is a collider like a boulder or a coral head, so the car
// cannot drive through one and a crab cannot walk through the car. Both halves
// of that are needed: the collider alone stops the car driving into it, but a
// crab running at the car would still walk straight through the bodywork and end
// up standing inside it, so the crab's own step also resolves the overlap.
//
// Their temperament is the rest of it, and it is a loop rather than a switch:
//   hide    skulking behind its rock, keeping an eye on you
//   scatter PANIC. Touch one crab and the whole beach bolts - they are never
//           alone out there, so one alarmed crab alarms every crab.
//   stalk   they come BACK, slowly, and stop short of you. This is the curious
//           bit: they edge in, hold a standoff distance, and wander round you
//           looking for a way in.
//   chase   get close enough and they commit and run you down, then lose their
//           nerve and fall back to stalking.
const CRAB_W = animalSize('crab');
// Collision radius: just under half the width, so the collider matches the
// carapace rather than the claws. Claws held out front are pose, not width.
const CRAB_R = CRAB_W * 0.5;

const CRAB_TOUCH_R = 13;      // how close you have to be to startle one
const CRAB_FLEE_R = 34;       // and how far it runs before it dares look back
const CRAB_STALK_STOP = 8.5;  // where curiosity stops and it starts circling
const CRAB_LUNGE_R = 10;      // inside this it commits and runs you down
const CRAB_PANIC = 5.0;       // seconds of every-crab panic
const CRAB_STALK_TIME = 9.0;  // how long it will keep creeping back
const CRAB_CHASE_TIME = 4.5;
const SPEED_FLEE = 9.0;
const SPEED_STALK = 2.2;
const SPEED_CHASE = 6.0;

function makeCrab(x, z, homeRock) {
  const g = new THREE.Group();
  const shell = mat(0xc4512c);
  const pale = mat(0xe8b48a);
  const dark = mat(0x7a2c16);

  // Squashed carapace, a bit wider than it is long.
  g.add(part(G.sphere, shell, 0.46, 0.26, 0.36, 0, 0.3, 0));
  // Eyestalks, because two little eyes on stalks are most of what makes a
  // silhouette read as a crab.
  for (const sx of [-0.2, 0.2]) {
    g.add(part(G.sphereLo, dark, 0.05, 0.05, 0.05, sx, 0.52, 0.26));
  }
  // Claws, held up in front - the give-away pose.
  const claws = [];
  for (const sx of [-0.5, 0.5]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.9, 0.28, 0.24);
    arm.add(part(G.sphere, shell, 0.2, 0.13, 0.28, 0, 0, 0));
    arm.add(part(G.box, pale, 0.05, 0.17, 0.05, 0, 0.11, 0.02));
    g.add(arm);
    claws.push(arm);
  }
  // Legs.
  const legs = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.4, 0.22, -0.22 + i * 0.16);
      leg.rotation.z = sx * 0.9;
      leg.add(part(G.box, dark, 0.05, 0.05, 0.34, 0, 0, 0.15));
      g.add(leg);
      legs.push(leg);
    }
  }
  // Scale the model as one piece, standing on the sand rather than sinking into
  // it. The leg and claw groups keep their own pivots inside the wrapper, so the
  // scuttle animation below still rotates them about the right point.
  fitSize(g, CRAB_W, 'x', true);
  g.userData.kind = 'crab';
  return {
    group: g, legs, claws,
    // The live collider. Mutated in place every frame so the car's own physics
    // sees the crab where the crab actually is - a crab you can drive through
    // because its collider was left at its spawn point is not solid.
    collider: { x, z, r: CRAB_R, noRoof: true },
    x, z, home: homeRock,
    state: 'hide', timer: 0, heading: cliffHash(x, z) * TAU,
    speed: 0,
    // Panic heading, in radians, and the drift it wanders by while bolting.
    fleeHeading: 0, drift: 0,
    // Which way it is circling while it works up the nerve, and the arc it is
    // currently halfway round.
    orbitDir: 1, orbitPhase: 0,
  };
}

// One crab goes off, and because crabs are never alone out here, all of them do.
function startle(crabs, from) {
  for (const c of crabs) {
    c.state = 'scatter';
    c.timer = CRAB_PANIC;
    // Run directly away from whatever startled it, fanned out a little so the
    // whole beach does not bolt in a single line.
    const a = Math.atan2(c.x - from.x, c.z - from.z) + (cliffHash(c.x, c.z) - 0.5) * 1.5;
    c.fleeHeading = a;
    c.drift = (cliffHash(c.z, c.x) - 0.5) * 1.1;
  }
}

function updateCrabs(crabs, dt, t, carX, carZ, carR) {
  for (const c of crabs) {
    c.timer -= dt;
    const dx = carX - c.x;
    const dz = carZ - c.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    // A crab will not go into the water: it is a beach crab, and a beach crab
    // bolting across the shallows reads as a bug rather than as an animal.
    const shoreLimit = BEACH_SHORE_Z + 1.5;

    if (c.state === 'hide') {
      // Skitter about behind its rock, and keep an eye on you.
      c.x += Math.cos(t * 1.7 + c.heading) * 0.35 * dt;
      c.z += Math.sin(t * 1.9 + c.heading) * 0.35 * dt;
      // Stay tucked behind the boulder it belongs to.
      c.x = lerp(c.x, c.home.x, 1 - Math.exp(-2 * dt));
      c.z = lerp(c.z, c.home.z, 1 - Math.exp(-2 * dt));
      if (dist < CRAB_TOUCH_R) startle(crabs, { x: carX, z: carZ });
    } else if (c.state === 'scatter') {
      // Flat out, away, drifting as it goes so the panic looks like a scatter
      // rather than a synchronised sprint.
      const a = c.fleeHeading + Math.sin(t * 1.1 + c.heading) * c.drift;
      c.x += Math.sin(a) * SPEED_FLEE * dt;
      c.z += Math.cos(a) * SPEED_FLEE * dt;
      c.heading = a;
      c.speed = SPEED_FLEE;
      if (c.timer <= 0) {
        // Panic over. It has seen you and it wants another look.
        c.state = 'stalk';
        c.timer = CRAB_STALK_TIME;
        c.orbitDir = cliffHash(c.x, c.z) > 0.5 ? 1 : -1;
        c.orbitPhase = 0;
      }
    } else if (c.state === 'stalk') {
      // Creep in until it is close enough to feel safe, then hold and circle.
      c.speed = SPEED_STALK;
      if (dist > CRAB_STALK_STOP) {
        c.x += (dx / dist) * SPEED_STALK * dt;
        c.z += (dz / dist) * SPEED_STALK * dt;
        c.heading = Math.atan2(dx, dz);
      } else {
        // Too close to come straight in, so it goes round instead - and every
        // few seconds it leans in a little, which is the tell that it is
        // working up to charging rather than just loitering.
        c.orbitPhase += c.orbitDir * dt * 0.5;
        const lean = 0.35 + 0.65 * Math.abs(Math.sin(c.orbitPhase));
        const a = Math.atan2(dx, dz) + c.orbitDir * Math.PI * 0.5;
        c.x += Math.sin(a) * SPEED_STALK * lean * dt;
        c.z += Math.cos(a) * SPEED_STALK * lean * dt;
        c.heading = Math.atan2(dx, dz);
      }
      if (dist < CRAB_LUNGE_R) {
        c.state = 'chase';
        c.timer = CRAB_CHASE_TIME;
      } else if (c.timer <= 0 || dist > CRAB_FLEE_R * 1.6) {
        // Bored, or you have gone too far away to be worth creeping at.
        c.state = 'hide';
        c.timer = 0;
      }
    } else if (c.state === 'chase') {
      // Committed. Straight at the car, at a dead run.
      c.speed = SPEED_CHASE;
      c.x += (dx / dist) * SPEED_CHASE * dt;
      c.z += (dz / dist) * SPEED_CHASE * dt;
      c.heading = Math.atan2(dx, dz);
      if (c.timer <= 0 || dist > CRAB_FLEE_R) {
        // Nerve gone. Back to creeping.
        c.state = 'stalk';
        c.timer = CRAB_STALK_TIME;
      }
    }

    // ---- the car is solid ----
    // Whatever it was doing, a crab never ends up standing inside the car. This
    // is resolved on the CRAB's side of the pair: the car's own collider pass
    // stops the car driving into a crab, but a crab walking towards the car
    // has to be the one that gives way, or the two pass through each other and
    // the crab is left embedded in the bodywork.
    const touch = carR + CRAB_R;
    if (dist < touch) {
      c.x = carX + (dx / dist) * touch;
      c.z = carZ + (dz / dist) * touch;
      // And being run into counts as being touched.
      if (c.state !== 'scatter') startle(crabs, { x: carX, z: carZ });
    }

    // Keep it on the sand, whatever it was trying to do.
    if (c.z < shoreLimit) {
      c.z = shoreLimit;
      c.fleeHeading = Math.PI;
    }

    // Sit on the sand, not through it, and turn to face where it is going.
    const gy = beachGroundOffsetAt(c.x, c.z);
    c.group.position.set(c.x, gy, c.z);
    c.group.rotation.y = c.heading;
    // Scuttle: the legs windmill faster the harder it is running, and the body
    // rocks side to side over them.
    const scuttle = t * (7 + c.speed * 2.4) + c.heading * 3;
    c.legs.forEach((l, i) => {
      const s = Math.sin(scuttle + i * 1.7) * 0.34;
      l.rotation.x = s;
    });
    c.group.rotation.z = Math.sin(scuttle) * 0.09;
    // Claws lift when it is running at you, and come down low and sneaky while
    // it is only creeping - which is most of the difference between "coming
    // back to look at you" and "coming for you".
    const lift = c.state === 'chase' ? 0.5 : c.state === 'scatter' ? 0.65 : c.state === 'stalk' ? 0.12 : 0;
    c.claws.forEach((cl, i) => {
      cl.rotation.x = -lift + Math.sin(scuttle * 0.7 + i * 2) * 0.12;
    });

    // Publish where it ended up, so the car's collider pass is looking at the
    // crab's real position and not at the one it spawned on.
    c.collider.x = c.x;
    c.collider.z = c.z;
  }
}

// ===== Fish =====
//
// Six species, so a glance into the water shows more than one animal. Each
// school wanders its own loop around the cove and turns as a body.
//
// Lengths are PERSON_H fractions, and the range is much wider than a real sea:
// the smallest is a hand-sized minnow at 0.06 and the biggest is a 0.33
// shark-sized animal nearly a third of a person. On a beach where the car is a
// toy and a person is a giant, "realistic" would make the fish invisible and the
// sharks as long as the mermaid, which is the thing this whole pass is fixing.
const FISH_KINDS = [
  // The length is NOT here: it comes from ANIMAL_SCALE.fish by index, which is
  // what stops a fraction of a person being handed to makeFish() as a length in
  // metres. Everything below this row is colour, markings, depth and speed.
  // name            tail  colour      stripes  school  depth  speed
  { tail: 0.45, col: 0xbfd4e0, n: 14, band: 0, y: [-1.5, -5], sp: 3.2 },
  { tail: 0.6, col: 0x2f7fd0, n: 8, band: 0, y: [-2.5, -8], sp: 2.6 },
  { tail: 0.5, col: 0xf2a03d, n: 10, band: 2, y: [-3, -9], sp: 2.9 },
  { tail: 0.85, col: 0x6b7f8c, n: 4, band: 1, y: [-6, -11], sp: 3.8 },
  // Two kinds that only ever swim the deep half, so the further out and the
  // lower you go the more the water stops being the same water. These are the
  // big ones - at 0.26 and 0.33 of a person they are what you see coming.
  { tail: 0.95, col: 0x3f5f8a, n: 5, band: 1, y: [-13, -21], sp: 4.2 },
  { tail: 1.1, col: 0x8fd4c8, n: 3, band: 0, y: [-18, -27], sp: 3.1 },
];

function makeFish(len, colour, band) {
  const g = new THREE.Group();
  const body = mat(colour, { roughness: 0.35, metalness: 0.1 });
  const trim = mat(0xf2f2ee, { roughness: 0.35 });
  g.add(part(G.sphere, body, len * 0.5, len * 0.34, len * 0.22, 0, 0, 0));
  // Dorsal + a hint of a side fin, so it is not a lozenge.
  g.add(part(G.box, body, len * 0.05, len * 0.22, len * 0.3, 0, len * 0.24, -len * 0.02));
  // The tail, on its own group so it can wag.
  const tail = new THREE.Group();
  tail.position.set(0, 0, -len * 0.42);
  tail.add(part(G.tail, trim, len * 0.16, len * 0.34, len * 0.2, 0, 0, -len * 0.1));
  g.add(tail);
  if (band) {
    for (let i = 0; i < 2; i++) {
      g.add(part(G.box, trim, len * 0.52, len * 0.3, len * 0.23, 0, 0, -len * 0.06 + i * len * 0.16));
    }
  }
  // `len` is the real length, in world units; the numbers above are proportions
  // of it. Sorting that out here means the FISH_KINDS table can talk in fractions
  // of a person and never has to be re-derived.
  fitSize(g, len, 'x');
  g.userData.kind = 'fish';
  return { group: g, tail };
}

function updateFish(schools, dt, t) {
  for (const s of schools) {
    s.angle += (s.spin) * dt;
    // Swim the centre of the loop, and let the whole school fan out behind it.
    const cx = s.cx + Math.cos(s.angle) * s.r;
    const cz = s.cz + Math.sin(s.angle * 0.8) * s.r * 0.7;
    const heading = s.angle + Math.PI / 2;
    s.group.position.set(cx, lerp(s.group.position.y, s.wy, 1 - Math.exp(-0.8 * dt)), cz);
    s.group.rotation.y = heading;
    s.members.forEach((f, i) => {
      const ph = i * 0.7;
      const rx = Math.cos(ph) * s.spread;
      const rz = Math.sin(ph) * s.spread;
      // Offsets are in the school's local frame, so they rotate with it.
      const ox = Math.cos(heading) * rz + Math.sin(heading) * rx;
      const oz = -Math.sin(heading) * rz + Math.cos(heading) * rx;
      f.group.position.set(ox, Math.sin(t * 1.6 + ph) * 0.25, oz);
      f.group.rotation.y = -0.3 + Math.sin(t * 1.1 + ph) * 0.25;
      // Tail wag, faster the faster the school is moving.
      f.tail.rotation.y = Math.sin(t * (9 + s.spin * 2) + ph) * 0.6;
    });
  }
}

// ===== Turtles =====
//
// Big, slow, and indifferent. They glide the deep basin on long lazy loops.
// A sea turtle's carapace is roughly a third of a person's height long, so at
// PERSON_H this comes out about 2.5 from nose to flipper tip - which is a bit
// over half the car's width, and unmistakably a big animal.
const TURTLE_L = animalSize('turtle');

function makeTurtle(scale) {
  const g = new THREE.Group();
  const shellMat = mat(0x4a5d3a, { roughness: 0.6 });
  const skin = mat(0x7f8f63, { roughness: 0.8 });
  const dome = part(G.sphere, shellMat, scale, scale * 0.42, scale * 1.15, 0, 0, 0);
  g.add(dome);
  // A lighter rim round the carapace, and the plates on top.
  g.add(part(G.sphereLo, skin, scale * 0.93, scale * 0.3, scale * 1.05, 0, -scale * 0.08, 0));
  g.add(part(G.sphere, skin, scale * 0.42, scale * 0.3, scale * 0.34, 0, scale * 0.12, scale * 0.86));
  const flippers = [];
  for (const sx of [-1, 1]) {
    for (const sz of [0.6, -0.55]) {
      const f = new THREE.Group();
      f.position.set(sx * scale * 0.85, -scale * 0.05, scale * sz);
      f.add(part(G.sphereLo, skin, scale * 0.42, scale * 0.09, scale * 0.26, sx * scale * 0.3, 0, 0));
      g.add(f);
      flippers.push(f);
    }
  }
  // The model above is built nose-along -Z, so measure the long axis on Z and
  // scale it to TURTLE_L times this turtle's own variety factor. Flipper groups
  // keep their pivots, so the sweep below still works.
  fitSize(g, TURTLE_L * scale, 'z');
  g.userData.kind = 'turtle';
  return { group: g, flippers };
}

// ===== Seahorses =====
//
// Upright, curled, and almost stationary. They hang off the cliff feet where
// the water is deepest against the rock.
// Seahorses hang off the cliff feet. Small - a hand's length - but not specks:
// at 0.09 of a person they are the smallest deliberate animal on the level, and
// the first pass had them nearly as long as the car, which made them read as
// eels.
const SEAHORSE_H = animalSize('seahorse');

function makeSeahorse(hue) {
  const g = new THREE.Group();
  const body = mat(hue, { roughness: 0.65 });
  // A stack of shrinking spheres reads as a segmented, tapering body.
  for (let i = 0; i < 5; i++) {
    const k = 1 - i / 5.4;
    g.add(part(G.sphereLo, body, 0.09 * k, 0.11 * k, 0.09 * k, 0, i * 0.17, 0));
  }
  // The curl of the tail.
  for (let i = 0; i < 4; i++) {
    const a = i * 0.7;
    g.add(part(G.sphereLo, body, 0.06, 0.06, 0.06,
      Math.sin(a) * 0.11, 0.88 + i * 0.02 - Math.cos(a) * 0.11, 0));
  }
  g.add(part(G.cone, body, 0.07, 0.2, 0.07, 0, 1.0, 0.02));
  // Built nose-up over roughly 1.1, so scale that to SEAHORSE_H and sit the tail
  // curl on y=0 - they hang, so the anchor point is the bottom, not the middle.
  fitSize(g, SEAHORSE_H, 'y');
  g.userData.kind = 'seahorse';
  return g;
}

// ===== Mermaid =====
//
// The deep ones. They live in the trench PAST the drop-off, in the water the car
// cannot get to, and they are the reason the drop-off is worth stopping at: drive
// to the lip, look over, and they are down there in the dark.
//
// MERMAID_H is the important number in this file. She is a PERSON - same scale
// as someone sitting in a house chair, so PERSON_H - which makes her about twice
// the car's width. At the 2 units she used to be, she was smaller than a turtle
// and there was no reading of the scene in which she was a person at all.
//
// SHE SWIMS. This is the other half of it. A mermaid built upright and left
// upright, whatever her proportions, reads as a mermaid standing on the seabed
// with her tail down like a mermaid-shaped bollard. What makes her read as a
// creature in water is the POSE: nose forward into the direction of travel, tail
// trailing behind, body carried at an angle, banking through her turns and
// undulating as she goes.
//
// The pose is three nested nodes, one rotation each, because the maths stops
// being obvious the moment two rotations share a node and the order they are
// applied in starts to matter:
//   g      - outer. Positioned in the world and turned to face the way she is
//            ACTUALLY travelling. Its +Z is her direction of travel, which is
//            why the model is built nose-along +Z.
//   roll   - banking, about her direction of travel.
//   pitch  - the swimming angle: rotates the head-up model down onto her front,
//            less than 90 degrees so her nose is still tilted up out of the water.
//   model  - built head-up along +Y, because that is the natural way to lay out a
//            body and how you get the proportions right.
const MERMAID_H = animalSize('mermaid');
// How far her nose is off horizontal. Roughly 30 degrees: shallow enough to
// still be clearly swimming rather than flying, steep enough that she is not
// lying flat like a dropped plank.
const SWIM_TILT = 0.52;

function makeMermaid(tailHex, finHex, hairHex) {
  const g = new THREE.Group();
  const roll = new THREE.Group();
  const pitch = new THREE.Group();
  const model = new THREE.Group();
  g.add(roll);
  roll.add(pitch);
  pitch.add(model);

  const skin = mat(0xf2cfae, { roughness: 0.55 });
  const tailMat = mat(tailHex, { roughness: 0.38, metalness: 0.12 });
  const finMat = mat(finHex, { roughness: 0.32, metalness: 0.12 });
  // The shells are the SAME colour as the tail, deliberately: they are cut from
  // it. Matching them to the tail is what makes the whole thing read as one
  // animal rather than as a woman with unrelated jewellery on.
  const shellMat = mat(tailHex, { roughness: 0.28, metalness: 0.16 });
  const shellLip = mat(0xf7eddf, { roughness: 0.4 });
  const hairMat = mat(hairHex, { roughness: 0.8 });
  const dark = mat(0x2a1c18, { roughness: 0.4 });

  // ---- the human half, built up from the hips ----
  // Hips, then a waist NARROWER than both the hips and the bust. That single
  // pinch is most of what separates a female figure from a lozenge, and it is
  // the difference between "person" and "fish with arms".
  model.add(part(G.sphere, skin, 0.2, 0.17, 0.16, 0, 0.28, 0));
  model.add(part(G.sphere, skin, 0.135, 0.15, 0.11, 0, 0.46, 0));
  model.add(part(G.sphere, skin, 0.185, 0.16, 0.135, 0, 0.63, 0));
  // The bust, as two rather than one lump, so the chest has a front and a
  // shoulder either side of it.
  for (const sx of [-0.1, 0.1]) {
    model.add(part(G.sphere, skin, 0.1, 0.095, 0.09, sx, 0.665, 0.06));
  }
  // Shoulders and neck.
  model.add(part(G.sphere, skin, 0.21, 0.11, 0.12, 0, 0.75, 0));
  model.add(part(G.sphere, skin, 0.06, 0.09, 0.06, 0, 0.84, 0));
  // Head, with a jaw so it is not a ball, hair swept back off the face, and two
  // dark eyes - at 7.5 tall she is a person-sized figure and the eyes are the
  // difference between a head and an egg.
  model.add(part(G.sphere, skin, 0.115, 0.145, 0.12, 0, 0.95, 0.005));
  model.add(part(G.sphereLo, skin, 0.085, 0.07, 0.09, 0, 0.885, 0.02));
  model.add(part(G.sphere, hairMat, 0.125, 0.135, 0.1, 0, 0.965, -0.055));
  model.add(part(G.sphere, hairMat, 0.09, 0.16, 0.07, 0, 0.87, -0.085));
  for (const sx of [-0.045, 0.045]) {
    model.add(part(G.sphereLo, dark, 0.022, 0.028, 0.02, sx, 0.965, 0.1));
  }
  // Arms, trailing back alongside the body in the classic swim.
  for (const sx of [-1, 1]) {
    model.add(part(G.sphere, skin, 0.055, 0.15, 0.055, sx * 0.235, 0.6, -0.015));
    model.add(part(G.sphereLo, skin, 0.048, 0.13, 0.048, sx * 0.265, 0.44, -0.05));
    model.add(part(G.sphereLo, skin, 0.05, 0.055, 0.04, sx * 0.275, 0.33, -0.06));
  }

  // ---- the shells ----
  // Two scallop halves over the bust, in the tail's colour, each with a pale
  // lip along its edge so they read as shell rather than as beads.
  for (const sx of [-1, 1]) {
    const sh = new THREE.Mesh(
      new THREE.SphereGeometry(0.108, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), shellMat);
    sh.position.set(sx * 0.1, 0.672, 0.045);
    sh.rotation.set(Math.PI * 0.42, 0, sx * 0.5);
    sh.scale.set(1, 1, 0.72);
    model.add(sh);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.102, 0.017, 5, 12, Math.PI), shellLip);
    lip.position.set(sx * 0.1, 0.648, 0.082);
    lip.rotation.set(Math.PI * 0.42 + Math.PI / 2, 0, sx * 0.5);
    model.add(lip);
  }

  // ---- the tail, on its own group so it can sweep ----
  const tail = new THREE.Group();
  tail.position.set(0, 0.3, 0);
  tail.add(part(G.sphere, tailMat, 0.165, 0.22, 0.135, 0, -0.16, 0));
  tail.add(part(G.sphere, tailMat, 0.145, 0.24, 0.115, 0, -0.42, 0));
  tail.add(part(G.sphereLo, tailMat, 0.1, 0.2, 0.085, 0, -0.62, 0));
  // THE FLUKE: two lobes splayed back and out. It is far TWICE as wide as it was
  // - the tail is the whole silhouette of a mermaid at this distance, and at the
  // old width she read as an eel with a fin on the end.
  //
  // The lobes also sweep BACK (`rotation.x`), not just out. A fluke that only
  // spreads sideways is a fan; swept back it is a tail being dragged through
  // water, which is what she is doing, and it is also what keeps her span down
  // to something a 7.5-long body can carry - get the spread wrong and she ends
  // up wider nose-to-fluke than she is long, which reads as a butterfly.
  const fluke = new THREE.Group();
  fluke.position.set(0, -0.7, 0);
  for (const sx of [-1, 1]) {
    const lobe = new THREE.Group();
    lobe.rotation.z = sx * 0.55;
    lobe.rotation.x = 0.85;
    lobe.add(part(G.tail, finMat, 0.26, 0.5, 0.05, 0, -0.25, 0));
    fluke.add(lobe);
  }
  tail.add(fluke);
  // A pair of small side fins low on the tail, which is what stops her reading
  // as a bare cone from behind.
  for (const sx of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(sx * 0.13, -0.44, 0);
    f.rotation.z = sx * 1.15;
    f.add(part(G.tail, finMat, 0.2, 0.24, 0.05, 0, -0.12, 0));
    tail.add(f);
  }
  model.add(tail);

  // ---- sizing, then the pose ----
  // Built head-up, so the extent that matters is her height. She is going to be
  // pitched onto her front by (90 - SWIM_TILT), which shortens her projected
  // length by cos(tilt) - so she is built oversize by exactly that much, and
  // her nose-to-fluke length as she actually swims comes out at MERMAID_H.
  fitSize(model, MERMAID_H / Math.cos(SWIM_TILT), 'y');
  // fitSize tags the node it measured. She is tagged on the OUTER group instead,
  // measured on the axis she really swims along, so that "find the mermaid and
  // measure her" finds one whole mermaid and not an arm inside one.
  delete model.userData.animal;
  delete model.userData.axis;
  pitch.rotation.x = Math.PI / 2 - SWIM_TILT;
  g.userData.kind = 'mermaid';
  g.userData.animal = MERMAID_H;
  g.userData.axis = 'z';
  g.userData.tail = tail;
  g.userData.roll = roll;
  g.userData.pitch = pitch;
  return { group: g, tail, roll, pitch };
}

// =====================================================================
// Assembly
// =====================================================================

export function addBeachLife(parent, baseY = 0) {
  const group = new THREE.Group();
  group.position.y = baseY;
  parent.add(group);

  // ---- crabs, one tucked behind each boulder ----
  const crabs = [];
  const rocks = [
    [-33, 22], [12, 30], [26, 14], [-44, 24], [4, 14],
    [36, 34], [-20, 42], [-8, 36], [46, 18], [-28, 8],
  ];
  rocks.forEach(([rx, rz], i) => {
    const c = makeCrab(rx - 2.4 - (i % 3), rz - 1.6, { x: rx, z: rz });
    group.add(c.group);
    crabs.push(c);
  });

  // ---- fish schools ----
  const schools = [];
  const schoolSpots = [
    [-24, -8, 16], [22, -10, 20], [0, -20, 14], [-40, -16, 10], [40, -18, 12],
    [-30, -46, 12], [34, -50, 12],
  ];
  FISH_KINDS.forEach((kind, ki) => {
    // The length the model is built at, then converted to a world length and to
    // the school spacing that goes with it. Both come off the same fraction, so a
    // school of big fish spreads out further and a school of minnows stays tight.
    const worldLen = animalSize('fish', ki);
    const s = {
      members: [],
      cx: schoolSpots[ki % schoolSpots.length][0],
      cz: schoolSpots[ki % schoolSpots.length][1],
      r: 9 + ki * 4,
      angle: ki * 1.3,
      spin: kind.sp / 22,
      wy: lerp(kind.y[0], kind.y[1], 0.4) + BEACH_SEA_Y,
      // Room for the fish, plus its own length, so a big one has space to swim
      // without its neighbours being inside it.
      spread: PERSON_H * 0.22 + worldLen * 0.9,
    };
    const holder = new THREE.Group();
    holder.position.set(s.cx, s.wy, s.cz);
    for (let i = 0; i < kind.n; i++) {
      const f = makeFish(worldLen, kind.col, kind.band);
      holder.add(f.group);
      s.members.push(f);
    }
    group.add(holder);
    s.group = holder;
    schools.push(s);
  });

  // ---- turtles ----
  const turtles = [];
  [[-14, -20, 1.0], [18, -24, 0.85], [-34, -14, 0.7], [30, -22, 1.1],
   [-48, -40, 1.0], [44, -44, 0.9]].forEach(([x, z, sc], i) => {
    const t = makeTurtle(sc);
    t.group.position.set(x, BEACH_BASIN_Y + BEACH_SEA_Y + 3.4 + i * 1.1, z);
    t.angle = i * 1.9;
    t.r = 13 + i * 3;
    t.speed = 0.16 + i * 0.02;
    group.add(t.group);
    turtles.push(t);
  });

  // ---- seahorses, hanging off the cliff feet where the water is deepest ----
  const seahorses = [];
  for (let i = 0; i < 9; i++) {
    const east = i % 2 === 0;
    const x = (east ? 1 : -1) * (BEACH_HALF_W - 6 - cliffHash(i, 3) * 5);
    const z = lerp(-58, 60, cliffHash(i, 9));
    const s = makeSeahorse([0xd9a441, 0xc07a4a, 0xb8c46a][i % 3]);
    const baseY = clamp01((BEACH_SHORE_Z - z) / 40) * 5 + BEACH_SEA_Y - 2.4;
    s.position.set(x, baseY, z);
    s.userData.phase = i * 1.3;
    group.add(s);
    seahorses.push(s);
  }

  // ---- the mermaids, in the trench past the drop-off ----
  // Two of them, on offset loops so they are never in the same place at once and
  // you are always seeing one of them somewhere. Both stay just past the rim, in
  // water the car cannot reach: the trench runs from the drop-off's lip to the
  // map's seaward edge, so a slow sweep along it keeps them somewhere new to look
  // at from the lip while never once being reachable.
  //
  // They are PATROLLING, not perched: each sweeps a long ellipse in the XZ plane
  // at a fixed deep depth, turning to face the way it is actually travelling.
  //
  // Colours are per-mermaid so the two are not the same animal copied: a teal
  // tail and a plum one. The shell on each chest is the same colour as her own
  // tail, which is why the tail colour is passed in rather than baked into
  // makeMermaid.
  const MERMAID_SKINS = [
    { tail: 0x2f8f7a, fin: 0x7fdcc0, hair: 0xc4622f },
    { tail: 0x8a4fa8, fin: 0xd6a8ea, hair: 0x2f2a44 },
  ];
  const mermaids = MERMAID_SKINS.map((s) => makeMermaid(s.tail, s.fin, s.hair));
  const mermaidStates = mermaids.map((m, i) => {
    // Centre the patrol in the trench, and make the two loops different sizes and
    // phases so they cross paths at different places.
    const zc = lerp(BEACH_RIM_Z - 4, BEACH_TRENCH_Z + 4, 0.42);
    const angle = 0.6 + i * Math.PI * 0.85;
    const r = 15 - i * 5;
    const halfZ = (BEACH_RIM_Z - BEACH_TRENCH_Z) * (0.3 + i * 0.08);
    // Deep enough to stay under the lip's sightline, and far enough above the
    // trench floor that a 7.5-tall figure is not clipping through it.
    const y = BEACH_TRENCH_Y + 8 + i * 2.5;
    // Put her ON her loop straight away, at her own starting angle, rather than at
    // the loop's centre. Built at y=0 she would be floating at the waterline on the
    // surface by the shore until the first update tick moved her, which is a frame
    // of a 7.5-tall mermaid standing in the shallows.
    m.group.position.set(Math.cos(angle) * r, y, zc + Math.sin(angle) * halfZ);
    group.add(m.group);
    return {
      m,
      angle,
      r,
      zc,
      halfZ,
      y,
      speed: 0.1 + i * 0.045,
    };
  });

  return {
    group,
    crabs,
    // The live crab colliders, for the level to add to its own list so the car
    // is stopped by them. Mutated in place by updateCrabs.
    crabColliders: crabs.map((c) => c.collider),
    update(delta, carX, carZ, carR) {
      const t = (this.clock = (this.clock || 0) + delta);
      updateCrabs(crabs, delta, t, carX, carZ, carR || 4.4);
      updateFish(schools, delta, t);

      for (const tu of turtles) {
        tu.angle += tu.speed * delta;
        tu.group.position.x += Math.cos(tu.angle) * tu.speed * tu.r * delta;
        tu.group.position.z += Math.sin(tu.angle) * tu.speed * tu.r * delta;
        tu.group.position.y = BEACH_BASIN_Y + BEACH_SEA_Y + 3.4 + Math.sin(t * 0.4 + tu.angle) * 0.6;
        tu.group.rotation.y = -tu.angle;
        // Front flippers sweep, back ones steer.
        tu.flippers.forEach((f, i) => {
          f.rotation.z = Math.sin(t * (i < 2 ? 1.5 : 1.1) + i) * (i < 2 ? 0.5 : 0.22);
        });
      }

      for (const s of seahorses) {
        // Seahorses hang almost still and just rock and turn on the spot.
        const p = s.userData.phase;
        s.position.y += Math.sin(t * 0.9 + p) * 0.09 * delta * 10;
        s.rotation.y = Math.sin(t * 0.5 + p) * 0.5;
        s.rotation.z = Math.sin(t * 0.7 + p * 1.7) * 0.14;
      }

      // Each mermaid swims her long slow ellipse, rolling a little with each turn
      // of the tail.
      for (const s of mermaidStates) {
        s.angle += delta * s.speed;
        const prevX = s.m.group.position.x;
        const prevZ = s.m.group.position.z;
        s.m.group.position.x = Math.cos(s.angle) * s.r;
        s.m.group.position.z = s.zc + Math.sin(s.angle) * s.halfZ;
        s.m.group.position.y = s.y + Math.sin(t * 0.5) * 0.7;
        // Face along the direction she is ACTUALLY travelling, which is not the
        // direction of the loop - on an ellipse those differ most at the ends of
        // the short axis, and using the loop's own angle points her sideways
        // through the turn.
        const vx = s.m.group.position.x - prevX;
        const vz = s.m.group.position.z - prevZ;
        if (vx || vz) s.m.group.rotation.y = Math.atan2(vx, vz);
        // ...and then the swim itself, on the two inner nodes. She leans into
        // her turns and bobs with each beat of the tail, which is what stops a
        // correctly-posed mermaid from looking like a model on a turntable.
        s.m.roll.rotation.z = Math.sin(t * 0.8 + s.angle * 2) * 0.22;
        s.m.pitch.rotation.x = (Math.PI / 2 - SWIM_TILT) + Math.sin(t * 0.7) * 0.07;
        s.m.tail.rotation.y = Math.sin(t * 1.4 + s.angle) * 0.42;
      }
    },
  };
}

export { BEACH_SHELF_Z0, BEACH_SHELF_Z1 };
