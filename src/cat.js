// ============================================================================
// The black cat.
//
// It lives in the house and does nothing at all until you drive into it. Then
// it gets up and chases you — but only to swipe you THREE times. After the third
// swat it loses interest, walks off somewhere else in the house and goes back to
// sleep. A cat's patience is short and this is what that looks like: three goes
// and it has lost interest in you.
//
// Each swipe is a genuine hammer — the same power, spin and hop as a mallet head
// in the ramp world, so being clawed is the same event as being flattened by the
// gauntlet.
//
// Size: about 10.4 long against a 4.3 car. The house is scaled up around a car
// that stayed the size it always was, so the cat is over twice the car —
// a real obstacle rather than a decoration.
//
// PROPORTIONS, which are the whole of "more feline". This went through two
// revisions. First it was 9 long by 5.2 tall by 5.0 WIDE — as tall as it was
// wide, so it read as a barrel or a pig no matter how many ears and whiskers hung
// off it. Slimming it fixed the fatness but introduced the opposite problem: at
// 12 long by 4.2 tall the length dominated so completely that it read as a
// stretched tube or a ferret, and the legs were stubby stubs under a heavy body.
//
// What it is now is the second revision, and it is the one that matters: a cat is
// ALL LEG. On a real cat the shoulder sits about two thirds of the way up, and
// what you read as "body" is a compact barrel riding high on four long thin
// limbs. So the length came DOWN (12 -> 10.4), the height went UP (4.2 -> 6.2),
// and the hips moved from 62% of the height to 68% — legs from just over half the
// animal to nearly seven tenths of it. Every piece of the model below is derived
// from these three numbers, so the whole animal stays consistent when they move.
// ============================================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CAT_MAX_SWIPES, CAT_RISE_TIME, swipeSpent, swipesLeft } from './catTemper.js';
import { SWAT_TIME, swatGeometry, pawReaches, toLocal, swatPose } from './catPaw.js';

// Three swats and it has lost interest. The budget and the rules about what does
// and does not spend it live in catTemper.js so they can be tested without
// building the cat.
export { CAT_MAX_SWIPES };

// Body length from chest to tail base. Down from 12: at 12 against a 6.2 height
// the animal was more than three times as long as it was tall, which reads as a
// tube with legs rather than a cat.
const CAT_LEN = 10.4;    // chest to tail base
const CAT_HEIGHT = 6.2;  // shoulder height standing
const CAT_WIDTH = 2.5;   // across the ribs. A cat is narrow AND tall now — this
                          // went down again so the taller animal does not also
                          // become a fatter one

// Three swats, then boredom (CAT_MAX_SWIPES, from catTemper.js). This is the
// whole of the cat's personality now.

const WAKE_REACH = 7.5;     // close enough for the car to have disturbed it
const SWIPE_COOLDOWN = 1.9; // seconds between swats — long enough that the three
                             // read as three separate attempts, not one flurry
// A swat is thrown with the whole body behind it. She lunges into the swing, so
// the paw visibly ARRIVES on you instead of reaching out from a standstill —
// which matters now that the paw, not her spine, is what decides the reach.
const SWAT_LUNGE = 7.6;    // extra units/s while a swat is playing
const CHASE_SPEED = 12.5;   // slower than the car, so it is a threat not a death
const TURN_RATE = 4.2;      // rad/s the body swings round to face its heading

// One place for the leg geometry, so "the legs are the right length" is a single
// number and not four magic fractions scattered through the model. A standing cat
// puts its hip up at the top of the barrel and its paws ON THE FLOOR, so the two
// halves of the leg have to add up to the gap between them.
//
// This is the number that makes it read as a cat rather than a ferret: HIP_Y is
// 68% of the total height, so nearly seven tenths of the animal is leg and only
// three tenths is body. That is the real ratio on a cat, and it is the opposite
// of the 62% this used to use, which left a heavy barrel riding low.
const HIP_Y = CAT_HEIGHT * 0.68;      // where the legs hang from
const UPPER_LEN = CAT_HEIGHT * 0.30;  // thigh / shoulder
// Shin / forearm. DERIVED, not declared: it is whatever is left between the hip
// and the floor after the thigh, so the paws land on the floorboards by
// construction. Declaring all three independently is how the legs ended up a
// unit below the floor the first time, and it is a mistake waiting to happen
// every time the height or the hip moves. At 0.68 - 0.30 that leaves 0.38, so the
// lower leg is the longer half — which is what puts the knee high, and is most
// of why the animal reads as built to spring rather than built to waddle.
const LOWER_LEN = HIP_Y - UPPER_LEN;
const PAW_DROP = LOWER_LEN;           // paw sits at the bottom of the lower leg

// What the swat can reach, taken off the model's own numbers. The paw pivots on
// the shoulder and the tip of it is as far from that pivot as the leg is long,
// so the reach is HIP_Y by construction — which is the same HIP_Y the paws are
// built from, so it cannot drift away from the legs that are actually drawn.
const PAW = swatGeometry({ len: CAT_LEN, limb: HIP_Y, wid: CAT_WIDTH });

// How far the whole animal drops when it curls up.
//
// A sleeping cat is not a standing cat squashed flat — it is a compact loaf
// RESTING ON the floorboards. So the drop is measured, not guessed: the body has
// to come down until the LOWEST of the three masses is touching y=0, and that is
// the haunch, because it hangs lowest and is the tallest of them. Taking the
// barrel instead sinks the haunch through the floor; taking the highest one leaves
// the cat hovering.
//
// Measuring it this way is also why the drop cannot drift out of date: change the
// height, the barrel, the haunch or the hip and the curl follows, instead of
// needing a hand-tuned number nudged every time the proportions move.
const HAUNCH_Y = HIP_Y + CAT_HEIGHT * 0.075;
const HAUNCH_HALF = CAT_HEIGHT * 0.29;
const CURL_DROP = HAUNCH_Y - HAUNCH_HALF;
// Where the tail root ends up: on the floor, just inboard of the haunch, which is
// where a curled cat carries it.
const CURL_TAIL_Y = CURL_DROP + CAT_HEIGHT * 0.06;

// A cat that walks through the wallpaper would give the whole thing away, so it
// gets the same wall-slide treatment the car does: try the heading you want,
// then progressively sharper deviations either side of it, and take the first
// one that is not inside a wall.
const FAN = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, Math.PI];

export function addCat(scene, opts = {}) {
  const fur = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.86 });
  const furSoft = new THREE.MeshStandardMaterial({ color: 0x1d1f26, roughness: 0.92 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xd98f92, roughness: 0.7 });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xd8f06a, emissive: 0xa8e024, emissiveIntensity: 0.0, roughness: 0.25,
  });
  const claw = new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.5 });

  // ---- The model ---------------------------------------------------------
  // A group per moving part, so the animation is a handful of rotations rather
  // than a skeleton.
  const root = new THREE.Group();
  root.scale.setScalar(1);
  scene.add(root);

  const body = new THREE.Group();
  root.add(body);

  // The curl, declared here because the head, legs and tail are all added to it
  // below and it has to exist first.
  //
  // A sleeping cat does not lie down like a dropped plank — it folds into a disc,
  // with its legs and tail tucked in under it and its head turned back onto its own
  // flank. That closed shape is most of why a sleeping cat reads as a sleeping cat,
  // so the foldable parts get their own group and `curl` moves the whole assembly
  // rather than each piece separately.
  //
  // This is NOT a scale. Squashing a standing model flat leaves the legs poking out
  // sideways, which is exactly what the old 0.6 body-scale did — a cat lying down,
  // not a cat curled up. The barrel, chest and haunches stay in `body`; the head,
  // legs and tail live in `curl`, and that split is what lets them tuck rather than
  // splay.
  const curl = new THREE.Group();
  body.add(curl);

  // The barrel now rides HIGH on the legs. It is a compact mass between
  // HIP_Y and the shoulder line rather than a long lozenge through the whole
  // animal, and it is shorter in Z than CAT_LEN because the extra length is in
  // the legs, not the trunk.
  const barrel = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fur);
  barrel.scale.set(CAT_WIDTH * 0.44, CAT_HEIGHT * 0.235, CAT_LEN * 0.26);
  barrel.position.set(0, HIP_Y + CAT_HEIGHT * 0.07, 0);
  barrel.castShadow = true;
  body.add(barrel);
  // Chest and haunches, so it is not one smooth lozenge — and haunches are the
  // WIDEST part of a cat, wider than the waist, which is the opposite of how the
  // old barrel was built (everything the same width, so it read as a barrel).
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), furSoft);
  chest.scale.set(CAT_WIDTH * 0.48, CAT_HEIGHT * 0.25, CAT_LEN * 0.155);
  chest.position.set(0, HIP_Y + CAT_HEIGHT * 0.09, CAT_LEN * 0.22);
  body.add(chest);
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), furSoft);
  haunch.scale.set(CAT_WIDTH * 0.55, CAT_HEIGHT * 0.29, CAT_LEN * 0.175);
  haunch.position.set(0, HIP_Y + CAT_HEIGHT * 0.075, -CAT_LEN * 0.24);
  body.add(haunch);
  // A neck, so the head is carried forward and up off the shoulders rather than
  // sitting straight on top of them. Cheap, and it is a large part of the profile.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(
    CAT_WIDTH * 0.3, CAT_WIDTH * 0.4, CAT_HEIGHT * 0.16, 10), fur);
  neck.rotation.x = 0.5;
  neck.position.set(0, HIP_Y + CAT_HEIGHT * 0.15, CAT_LEN * 0.32);
  body.add(neck);

  // ---- Head --------------------------------------------------------------
  // Carried forward and up on the neck, which is where a cat holds its head when
  // it is interested in something. Sitting it low and back on the shoulders is
  // what made the old one look like a lizard.
  //
  // In `curl`, because a sleeping cat turns its head back and rests its cheek on
  // its own flank — which means the head has to be able to swing sideways, not
  // just tip.
  const head = new THREE.Group();
  head.position.set(0, HIP_Y + CAT_HEIGHT * 0.32, CAT_LEN * 0.42);
  curl.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fur);
  skull.scale.set(CAT_WIDTH * 0.42, CAT_HEIGHT * 0.36, CAT_LEN * 0.115);
  skull.castShadow = true;
  head.add(skull);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), furSoft);
  muzzle.scale.set(CAT_WIDTH * 0.24, CAT_HEIGHT * 0.16, CAT_LEN * 0.08);
  muzzle.position.set(0, -CAT_HEIGHT * 0.13, CAT_LEN * 0.075);
  head.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), pink);
  nose.position.set(0, -CAT_HEIGHT * 0.07, CAT_LEN * 0.12);
  head.add(nose);
  // Ears: big triangles, tipped outward, which is most of a cat's silhouette.
  // They are BIG relative to the head on purpose — a narrow head carrying small
  // ears is a weasel, and this is the single cheapest thing that stops a slimmed
  // cat reading as a rodent.
  const ears = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(CAT_WIDTH * 0.21, CAT_HEIGHT * 0.34, 4), fur);
    e.position.set(s * CAT_WIDTH * 0.26, CAT_HEIGHT * 0.3, -CAT_LEN * 0.015);
    e.rotation.z = s * 0.3;
    e.castShadow = true;
    head.add(e);
    ears.push(e);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(CAT_WIDTH * 0.13, CAT_HEIGHT * 0.21, 4), pink);
    inner.position.set(s * CAT_WIDTH * 0.26, CAT_HEIGHT * 0.29, CAT_LEN * 0.012);
    inner.rotation.z = s * 0.3;
    head.add(inner);
  }
  // Eyes. They light up when it wakes, which is the whole tell. Big and forward-
  // set, because that is where a cat puts them.
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(CAT_WIDTH * 0.1, 10, 8), eyeMat);
    e.position.set(s * CAT_WIDTH * 0.19, CAT_HEIGHT * 0.03, CAT_LEN * 0.105);
    e.scale.set(1, 0.72, 1);
    head.add(e);
    eyes.push(e);
  }
  // Whiskers: three a side, which is what makes it read as a cat up close.
  // Kept just wider than the body. Long ones on the old 5-wide head set the
  // animal's whole silhouette width, so on the slimmed model they are trimmed to
  // span about as far as the ribs — a cat's whiskers do, and any wider than that
  // reads as a badger.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 2.4, 4), claw);
      w.position.set(s * CAT_WIDTH * 0.24, -CAT_HEIGHT * 0.05 + i * 0.26 - 0.26, CAT_LEN * 0.11);
      w.rotation.z = s * (1.3 + i * 0.1);
      w.rotation.x = -0.25;
      head.add(w);
    }
  }

  // ---- Legs --------------------------------------------------------------
  // Two segments each, so a run reads as a stride rather than a shuffle. Thick,
  // and deliberately so: the previous revision made them pencil-thin to fight the
  // barrel, and on a cat that is 6.2 tall and mostly leg that overshot into
  // spider legs. A cat's legs are slim, not spindly — the upper leg in
  // particular is heavily muscled, because that is where the spring is. These
  // numbers put the thigh at roughly a third of the body's width.
  //
  // HIP_Y is 68% of the animal's height and the two segments span nearly all of
  // it, which is what stops the cat reading as a weasel. They are also set
  // FURTHER apart in Z than the old ±0.21, so the stride is longer as well as
  // higher: a cat's legs are planted wide fore and aft, not gathered underneath.
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group();
    hip.position.set(sx * CAT_WIDTH * 0.3, HIP_Y, sz * CAT_LEN * 0.24);
    // In `curl`, not `body`, so a sleeping cat can fold its legs in under itself
    // instead of leaving four stiff legs sticking out of a low body.
    curl.add(hip);
    // Thigh heavy at the top and tapering to the knee, as a cat's is.
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(CAT_WIDTH * 0.17, CAT_WIDTH * 0.1, UPPER_LEN, 8), fur);
    upper.position.y = -UPPER_LEN / 2;
    upper.castShadow = true;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -UPPER_LEN;
    hip.add(knee);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(CAT_WIDTH * 0.08, CAT_WIDTH * 0.1, LOWER_LEN, 8), furSoft);
    lower.position.y = -LOWER_LEN / 2;
    knee.add(lower);
    // Paw: flat and rounded, sitting ON the floor. The pad is wider than the
    // ankle, which is what makes a cat's foot read as a foot at this scale.
    const paw = new THREE.Mesh(new THREE.SphereGeometry(CAT_WIDTH * 0.1, 8, 6), furSoft);
    paw.scale.set(1, 0.6, 1.35);
    paw.position.y = -PAW_DROP;
    knee.add(paw);
    legs.push({ hip, knee, phase: (sx > 0 ? 0 : Math.PI) + (sz > 0 ? 0 : Math.PI / 2) });
  }

  // The curl. A sleeping cat does not lie down like a dropped plank — it folds
  // into a disc, with its legs and tail tucked in under it and its head turned
  // back onto its own flank. That closed shape is most of why a sleeping cat reads
  // as a sleeping cat, so it gets its own group: everything that folds goes in
  // here, and `curl` rotates the whole assembly rather than each piece separately.
  //
  // This is NOT a scale. Squashing a standing model flat leaves the legs poking
  // out sideways, which is what the old 0.6 body-scale did.
  const tail = [];
  // The tail lives in `curl`, and sweeps across X rather than trailing along Z.
  // A tail parented to `body` can only stick out behind the cat; a sleeping cat's
  // tail comes FORWARD and round the front of the paws, which is most of what
  // makes the curled shape read as a curl.
  let parentSeg = curl;
  const SEG = 7;
  for (let i = 0; i < SEG; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? HIP_Y + CAT_HEIGHT * 0.2 : 0, i === 0 ? -CAT_LEN * 0.33 : -CAT_LEN * 0.105);
    parentSeg.add(seg);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(CAT_WIDTH * (0.075 - i * 0.0085), CAT_WIDTH * (0.085 - i * 0.0085), CAT_LEN * 0.11, 7), fur);
    m.rotation.x = Math.PI / 2;
    m.position.z = -CAT_LEN * 0.055;
    m.castShadow = true;
    seg.add(m);
    tail.push(seg);
    parentSeg = seg;
  }

  // ---- State -------------------------------------------------------------
  const spots = (opts.spots && opts.spots.length) ? opts.spots : [{ x: 0, z: 0 }];
  const state = {
    mode: 'sleep',     // sleep | rising | chase | returning
    awakeFor: 0,       // seconds since it was woken — for the debug readout only,
                        // no longer the reason it gives up
    x: spots[0].x,
    z: spots[0].z,
    heading: 0,        // radians, the body's facing
    targetHeading: 0,
    sleepAt: { x: spots[0].x, z: spots[0].z },
    home: { x: spots[0].x, z: spots[0].z },
    swipeCd: 0,
    riseT: 0,
    swipes: 0,         // how many of the three have been thrown — :debug
    swatT: -1,         // -1 when no swat is playing, else seconds into the swing
    swatSide: 1,       // which front paw is doing it: +1 her right, -1 her left
    bored: false,      // set on the third, so the pose can slump into "done with you"
    wakes: 0,          // :debug
    breath: Math.random() * 6,
    gait: 0,
  };

  const ctx = {
    playerPos: new THREE.Vector3(),
    playerR: 2.2,
    blocked: () => false,
    onSwipe: null,     // (dirX, dirZ) => void — main.js turns this into a hammer knock
    onWake: null,
    onSleep: null,
  };

  function placeAt(x, z) {
    state.x = x;
    state.z = z;
    root.position.set(x, 0, z);
  }

  // Pick somewhere new in the house to lie down. Never the spot it is already
  // on, so "walks off and sleeps somewhere else" is actually true.
  function pickNewSleepSpot() {
    if (spots.length < 2) return spots[0];
    let s = spots[0];
    for (let i = 0; i < 8; i++) {
      s = spots[Math.floor(Math.random() * spots.length)];
      if (Math.hypot(s.x - state.x, s.z - state.z) > 18) break;
    }
    return s;
  }

  function wake() {
    if (state.mode !== 'sleep') return;
    state.mode = 'rising';
    state.awakeFor = 0;     // the debug clock starts now
    state.riseT = 0;
    state.swipes = 0;       // a fresh wake is a fresh budget of three
    state.bored = false;
    state.wakes++;
    if (ctx.onWake) ctx.onWake();
  }

  // Its three swats are done and it has lost interest: it breaks off and goes to
  // find a bed somewhere else in the house. One place, so both the rising and
  // chase branches end the same way.
  function getBored() {
    state.mode = 'returning';
    state.bored = true;
    state.sleepAt = pickNewSleepSpot();
  }

  // A step of `dist` from the cat along `dir`, unless that is inside a wall.
  // The fan is what makes it slide along a wall instead of nosing into it.
  function stepToward(tx, tz, dist) {
    let dx = tx - state.x, dz = tz - state.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.0001) return false;
    dx /= len; dz /= len;
    for (const a of FAN) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = dx * ca - dz * sa;
      const nz = dx * sa + dz * ca;
      const px = state.x + nx * dist;
      const pz = state.z + nz * dist;
      if (!ctx.blocked(px, pz, CAT_WIDTH * 0.42)) {
        state.x = px;
        state.z = pz;
        // Face where it actually went, not where it wanted to go — that is the
        // difference between a cat following you round a corner and a cat
        // grinding into the corner.
        state.targetHeading = Math.atan2(nx, nz);
        return true;
      }
    }
    return false;
  }

  function update(delta, ctxIn) {
    Object.assign(ctx, ctxIn);
    state.breath += delta;
    state.swipeCd = Math.max(0, state.swipeCd - delta);
    // The swing runs to its end and then clears itself, so a paw is never left
    // stuck out if she goes back to sleep or loses interest mid-gesture.
    if (state.swatT >= 0) {
      state.swatT += delta;
      if (state.swatT > SWAT_TIME) state.swatT = -1;
    }

    const dxp = ctx.playerPos.x - state.x;
    const dzp = ctx.playerPos.z - state.z;
    const dist = Math.hypot(dxp, dzp);

    switch (state.mode) {
      // ---- Asleep -------------------------------------------------------
      case 'sleep':
        // Ears twitch now and then, and it breathes. That is the whole idle.
        if (Math.random() < delta * 0.5) ears[Math.random() < 0.5 ? 0 : 1].rotation.x = -0.5;
        ears.forEach((e) => { e.rotation.x += (0 - e.rotation.x) * Math.min(1, delta * 3); });
        // ...and the car touching it is what wakes it.
        if (dist < WAKE_REACH + ctx.playerR) wake();
        break;

      // ---- Just woken: the arch, before it moves -----------------------
      case 'rising': {
        // The arch is a beat before the first swat. It cannot end anything on its
        // own — the budget is three swats and none of them have been thrown yet —
        // but the check is still here so that a cat which somehow arrives at
        // 'rising' already spent (a reset mid-archive, say) does not sit arching
        // forever.
        state.riseT += delta;
        state.awakeFor += delta;
        if (swipeSpent(state.swipes)) getBored();
        else if (state.riseT > CAT_RISE_TIME) state.mode = 'chase';
        break;
      }

      // ---- The chase ----------------------------------------------------
      case 'chase': {
        state.awakeFor += delta;
        // A swat is thrown with her whole body, so she lunges into it. The paw is
        // what decides the reach now, and a paw reaching out from a standing start
        // does not look like it connects — this is the half that closes the gap
        // between what you watch and what hits you.
        const lunging = state.swatT >= 0 ? SWAT_LUNGE : 0;
        stepToward(ctx.playerPos.x, ctx.playerPos.z, (CHASE_SPEED + lunging) * delta);
        state.gait += delta * (CHASE_SPEED / CAT_LEN) * 6;
        // Swat. The reach is the PAW's, not her middle's: pawReaches() asks
        // whether a car is inside the half-disc her front paw sweeps across, so
        // this lands when you try to get past her on either side or get in front
        // of her, rather than only once you are underneath her spine. The
        // swipeSpent() guard is the whole personality: the third swat is the last
        // one, so it is spent BEFORE the swat is thrown, which is what makes the
        // count exactly three rather than four. Without it the cooldown would let
        // a fourth through on the frame after.
        const local = toLocal(state.heading, dxp, dzp);
        if (!swipeSpent(state.swipes)
            && pawReaches(PAW, local.x, local.z, ctx.playerR) && state.swipeCd <= 0) {
          state.swipeCd = SWIPE_COOLDOWN;
          state.swipes++;
          const l = Math.hypot(dxp, dzp) || 1;
          // Swat to the SIDE, not straight back — a paw comes across you, so
          // this is the difference between being shoved and being swatted. The
          // paw follows the same alternation, so the leg you watch is the leg that
          // decided the direction.
          const side = (state.swipes % 2) ? 1 : -1;
          state.swatSide = side;
          state.swatT = 0;
          const px = -dzp / l, pz = dxp / l;
          const sw = 0.55;
          if (ctx.onSwipe) {
            ctx.onSwipe(dxp / l + px * side * sw, dzp / l + pz * side * sw);
          }
          // The third one is where it loses interest. It breaks off immediately
          // rather than following you for a while first — that is the ask, and it
          // is also what stops the cat from looking like it is still playing.
          if (swipeSpent(state.swipes)) getBored();
        }
        break;
      }

      // ---- Walking back to a new bed ------------------------------------
      case 'returning': {
        const tx = state.sleepAt.x, tz = state.sleepAt.z;
        const d = Math.hypot(tx - state.x, tz - state.z);
        if (d < 1.6) {
          placeAt(tx, tz);
          state.mode = 'sleep';
          if (ctx.onSleep) ctx.onSleep();
        } else {
          stepToward(tx, tz, CHASE_SPEED * 0.45 * delta);
          state.gait += delta * 1.6;
        }
        break;
      }
    }

    // ---- Facing ---------------------------------------------------------
    // Turn at a fixed rate rather than snapping, so it leads you round corners.
    let dy = state.targetHeading - state.heading;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    state.heading += dy * Math.min(1, TURN_RATE * delta);
    root.position.set(state.x, 0, state.z);
    root.rotation.y = state.heading;

    // ---- Pose -----------------------------------------------------------
    const asleep = state.mode === 'sleep';
    const rising = state.mode === 'rising';
    const awake = !asleep && !rising;

    // The curl. Asleep, the whole animal comes down onto the floorboards and the
    // foldable parts draw in toward the middle of it, so the legs tuck underneath
    // and the tail wraps round the front. Awake, it all goes back to where it
    // stands.
    //
    // The drop is on `body`, not on `curl`. That matters: `curl` holds the legs, the
    // head and the tail, so moving `curl` alone would leave the barrel hanging in
    // the air with everything else on the floor — and, worse, would push the
    // tucked tail down through the floorboards. Everything is in local space
    // relative to the hip line, so lowering `body` by CURL_DROP lowers all of it
    // together and the barrel ends up resting where a loaf of cat rests.
    //
    // Interpolated rather than switched, so getting up is one motion. The old
    // approach scaled the body flat instead, which left four stiff legs sticking
    // out of a squashed loaf — a cat lying down, not a cat curled up.
    const drop = (asleep ? -CURL_DROP : 0);
    // The breathing is part of the TARGET, not an addition to the position. It used
    // to be added after the ease, which meant every frame pushed the body down by
    // up to 0.09 and then removed only 1/15th of that, so the animal drifted a
    // whole body-height off the floor and back again on a slow cycle — her paws
    // sinking through the floorboards and then hovering above them. It also made
    // the proportions test, which measures where the paws actually are, fail at
    // random depending on where the breath happened to be in its cycle.
    const breath = Math.sin(state.breath * 1.4) * (asleep ? 0.06 : 0.09);
    body.position.y += ((drop + breath) - body.position.y) * Math.min(1, delta * 4);
    // The foldables tuck in. Only a little in Y — the legs get their tuck from the
    // joint rotations below, and squashing them as well would double the fold and
    // pull the paws up off the floor.
    curl.scale.x += ((asleep ? 0.72 : 1) - curl.scale.x) * Math.min(1, delta * 4);
    curl.scale.y += ((asleep ? 0.94 : 1) - curl.scale.y) * Math.min(1, delta * 4);
    curl.scale.z += ((asleep ? 0.86 : 1) - curl.scale.z) * Math.min(1, delta * 4);

    // Eyes: shut slits when asleep, hard glowing discs when it is on you, and
    // half-shut once it is bored — it is not interested any more, and the eyes are
    // where that reads from across the room.
    const bored = state.bored;
    const eyeTarget = bored ? 0.7 : awake ? 2.4 : rising ? 1.4 : 0.0;
    eyeMat.emissiveIntensity += (eyeTarget - eyeMat.emissiveIntensity) * Math.min(1, delta * 8);
    for (const e of eyes) {
      const open = asleep ? 0.12 : bored ? 0.5 : 1;
      e.scale.y += (open * 0.72 - e.scale.y) * Math.min(1, delta * 8);
    }

    // Legs: striding when it runs, and held slack once it has lost interest — it
    // walks off, not stalks off. Asleep they fold right in: the thigh swings
    // forward and the shin doubles back underneath it, which puts both paws under
    // the belly instead of leaving them splayed out in front. The front pair and
    // the back pair are half a cycle apart, as they are on a real cat.
    //
    // These rotations are added to whatever the stride is doing, so they compose
    // rather than fight — the curl is a separate transform on `curl` and does not
    // touch the leg joints at all.
    for (const L of legs) {
      const sw = awake ? Math.sin(state.gait + L.phase) * 0.75 : 0;
      const tuck = asleep ? 1 : 0;
      L.hip.rotation.x = sw + tuck * 1.45;
      L.knee.rotation.x = Math.max(0, -sw * 1.3) + tuck * 2.3;
      // Cleared every frame, so a paw that was left out by a swat comes back to
      // the walk rather than staying cocked for the rest of the level.
      L.hip.rotation.y = 0;
    }

    // The front paw doing the swat overrides the stride entirely. A gait blended
    // under a swat looks like a twitch; a paw that winds back, comes across and
    // lands in front of her is the whole difference between "she shoved you" and
    // "she swatted you".
    //
    // Applied AFTER the stride loop so it wins, and applied to one leg only — the
    // other three keep running, which is what sells it as a cat swatting while
    // still on the move rather than a model being posed.
    if (state.swatT >= 0) {
      const swat = swatPose(state.swatT, state.swatSide, PAW);
      // legs[0] is her left (local -x) and legs[1] her right, from the
      // [[-1, 1], [1, 1], ...] build order above.
      const pawLeg = legs[state.swatSide > 0 ? 1 : 0];
      pawLeg.hip.rotation.y = swat.yaw;
      pawLeg.hip.rotation.x = swat.lift;
      pawLeg.knee.rotation.x = swat.knee;
    }

    // Tail: lies along the floor asleep with a lazy hook at the tip, and streams
    // out behind and UP when it runs. A cat carries its tail up when it is moving
    // and drops it when it is settled, and on a body this long that flag is a
    // large part of what makes the silhouette read as a cat at all. The per-link
    // curl climbs along the tail so the bend is in the tip rather than at the base.
    // Bored and walking away, it drops — which is the clearest read that it is
    // done with you rather than still hunting.
    for (let i = 0; i < tail.length; i++) {
      // Asleep the tail swings right round and lies along the cat's own side,
      // tip tucked in — the rotation per link climbs steeply so the wrap is a
      // smooth curve rather than a hinge at the base. Bored it hangs low and
      // loose. Awake it streams out behind and up.
      const wrap = asleep ? 0.5 + i * 0.42 : 0;
      const lowCurl = asleep ? 0 : bored ? 0.02 + i * 0.04 : rising ? 0.06 : 0.16;
      const sway = awake ? Math.sin(state.gait * 0.5 - i * 0.55) * 0.22 : Math.sin(state.breath * 0.9 - i * 0.4) * 0.1;
      tail[i].rotation.y = wrap + (awake ? Math.sin(state.gait * 0.4 - i * 0.5) * 0.16 : 0);
      tail[i].rotation.x = lowCurl + sway;
      // Asleep the tail root comes down to the floor alongside the haunch instead of
      // standing off the back of it, so the wrap lies along the ground rather than
      // in the air. CURL_TAIL_Y is the drop already applied to `body`, added back
      // here so the two cannot disagree about where the floor is.
      tail[i].position.y = i === 0 ? (asleep ? CURL_TAIL_Y : HIP_Y + CAT_HEIGHT * 0.2) : 0;
    }
    // Head: leads the turn, and drops to look at you when it is close. Bored, it
    // turns away and looks where it is going. Asleep, it turns right back and
    // settles its cheek against its own flank, which is both what a cat does and
    // what closes the curl into a ring.
    head.rotation.x = awake ? (dist < 22 ? 0.18 : 0) : (asleep ? 0.62 : 0.3);
    head.rotation.y = asleep ? 1.15 : awake ? (bored ? 0 : Math.sin(state.breath * 0.7) * 0.12) : 0;
    // Asleep the head comes down onto the shoulder rather than floating above a
    // curled body. It is a local Y inside `curl`, so it does NOT need the drop
    // added — `body` has already moved.
    head.position.y = HIP_Y + CAT_HEIGHT * (asleep ? 0.16 : 0.32);
  }

  // Put the cat back in its first bed — used when re-entering the house.
  function reset() {
    const s = spots[0];
    state.mode = 'sleep';
    state.awakeFor = 0;
    state.riseT = 0;
    state.swipeCd = 0;
    state.swipes = 0;
    state.swatT = -1;
    state.swatSide = 1;
    state.bored = false;
    state.wakes = 0;
    state.sleepAt = { x: s.x, z: s.z };
    state.home = { x: s.x, z: s.z };
    state.targetHeading = 0;
    state.heading = 0;
    placeAt(s.x, s.z);
    root.rotation.y = 0;
    // Start fully curled, not part-way through standing up. The old reset set a
    // body scale of 0.6, which is not a pose the model can ever reach on its own,
    // so the cat visibly popped up out of a squash on the first frame. Snapping to
    // the same transforms `update` eases toward means the first rendered frame is
    // already the sleeping pose, and getting up is one smooth motion.
    body.position.y = -CURL_DROP;
    curl.scale.set(0.72, 0.94, 0.86);
    for (const L of legs) {
      L.hip.rotation.x = 1.45;
      L.knee.rotation.x = 2.3;
    }
  }

  reset();

  return {
    mesh: root,
    state,
    update,
    reset,
    wake,
    get sleeping() { return state.mode === 'sleep'; },
    // Swats remaining before it loses interest. main.js's debug readout uses
    // this; it replaces the old 25-seconds-remaining clock.
    get swipesLeft() { return swipesLeft(state.swipes); },
    get bored() { return state.bored; },
  };
}
