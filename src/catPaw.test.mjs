// The swipe is a FRONT PAWN, not a body-check.
//
// It used to be triggered by distance from the middle of the cat, so the swipe
// only landed once the car was underneath her — by which time she was on top of
// you and the shove read as a collision. The ask was that she kicks you with a
// swiping motion using her front paw, and that the paw is what reaches you.
//
// So two things are pinned here. First, the REGION: a half-disc in front of her
// shoulders, wide to the sides, and nothing behind her chest. Second, that the
// paw the animation actually puts on screen stays inside that region at every
// frame of the swing — otherwise the cat claws cars she never appears to touch,
// which is the failure a "it works" test would happily ship.
//
// Run: node --test src/catPaw.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SWAT_TIME, SWAT_WINDUP, SWAT_STRIKE,
  swatGeometry, pawReaches, toLocal, swatPose, pawTip,
} from './catPaw.js';

const LEN = 10.4, HGT = 6.2, WID = 2.5;
const LIMB = HGT * 0.68;
const G = swatGeometry({ len: LEN, limb: LIMB, wid: WID });
const CAR_R = 2.2;

// The car, in world coordinates, and whether her front paw can reach it. The cat
// sits at the origin facing +z.
const inReach = (x, z, heading = 0, playerR = CAR_R) => {
  const l = toLocal(heading, x, z);
  return pawReaches(G, l.x, l.z, playerR);
};

test('you get swatted passing her on either side, not only under her', () => {
  // This is the complaint. Under the old rule the trigger was distance from her
  // middle, so the interesting spots — level with her, trying to get past — are
  // exactly the ones that have to work now.
  for (const [what, x, z] of [
    ['dead centre, underneath her', 0, 0],
    ['level with her ribs, left', -5, 0.5],
    ['level with her ribs, right', 5, 0.5],
    ['out by her shoulder, left', -7, 2],
    ['out by her shoulder, right', 7, 2],
    ['just past her nose', 0, 9],
    ['ahead and off to one side', 6, 7],
  ]) {
    assert.ok(inReach(x, z), `${what} (${x}, ${z}) was out of the paw's reach`);
  }
});

test('and not from behind her, where a front paw cannot go', () => {
  // The other half of the same change: a half-disc, not a circle round her
  // middle. She claws what is in front of her and beside her; directly astern is
  // the haunch and the tail, not the swatting paw.
  for (const [what, x, z] of [
    ['directly behind', 0, -4],
    ['behind and to the side', 5, -4],
    ['well astern', 0, -8],
  ]) {
    assert.ok(!inReach(x, z), `${what} (${x}, ${z}) was inside the swat region`);
  }
});

test('the region turns with her, because the paw does', () => {
  // A region pinned to world axes would mean she claws a wall she is facing away
  // from. Heading pi puts her nose on -z, so the reach has to move with her.
  const heading = Math.PI;
  assert.ok(inReach(0, -7, heading), 'ahead of her, once she is facing -z');
  assert.ok(!inReach(0, 7, heading), 'behind her, once she is facing -z');
  // And a quarter turn, so it is a rotation and not a mirror. A heading of -pi/2
  // is the one that faces -x; +pi/2 faces +x, which is where she started out.
  const q = -Math.PI / 2;
  assert.ok(inReach(-7, 0, q), 'ahead of her, once she is facing -x');
  assert.ok(!inReach(7, 0, q), 'behind her, once she is facing -x');
});

test('the region grows with the car, so a wide car is swatted from further out', () => {
  // The region is grown by the car's radius, because it is the car the paw has to
  // touch. Pinned the other way round — "a big car is harder to hit" — is true of
  // a fixed region and false here, and it is the sort of thing that reads as a
  // regression when it is actually the radius doing its job.
  assert.ok(!inReach(0, 11, 0, CAR_R), 'a normal car is swatted well before that');
  assert.ok(inReach(0, 11, 0, CAR_R * 2), 'a twice-as-wide car reaches the same spot');
});

test('the paw tip stays inside the region it claims, every frame of the swing', () => {
  // The invariant that makes this honest rather than merely plausible: whatever
  // pawTip() says the animation is drawing, pawReaches() has to agree is inside
  // the swat. Sampled across the whole gesture, for both front paws, and at the
  // player's radius.
  for (const side of [1, -1]) {
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * SWAT_TIME;
      const p = pawTip(t, side, G);
      // The tip is a child of the hip, which sits out to one side of the spine.
      const hipX = side * WID * 0.3;
      assert.ok(pawReaches(G, hipX + p.x, G.shoulderZ + p.z, CAR_R),
        `at t=${t.toFixed(3)} the paw is at (${(hipX + p.x).toFixed(2)}, ` +
        `${(G.shoulderZ + p.z).toFixed(2)}) in her frame, outside the region she is swatting`);
    }
  }
});

test('the paw comes down through the height of a car', () => {
  // A swat that goes over the top of the car or under the chassis reads as a
  // miss, so the tip has to pass through the band a 4.3 car occupies somewhere in
  // the strike. Sampled on the strike, because that is the only beat that matters.
  let through = 0;
  for (let i = 0; i <= 30; i++) {
    const t = SWAT_TIME * (SWAT_WINDUP + (SWAT_STRIKE - SWAT_WINDUP) * (i / 30));
    // pawTip is an offset from the hip, and the hip is up at the top of the leg,
    // so the height the car meets is the two added together.
    const y = LIMB + pawTip(t, 1, G).y;
    if (y > 0 && y < 4.3) through++;
  }
  assert.ok(through > 15,
    `the paw only passed through car height on ${through} of 31 samples of the strike`);
});

test('it is a wind-up, a strike and a follow-through, not one ramp', () => {
  // The three beats are the gesture. A single eased ramp from 0 to 1 and back is
  // a shrug, and it is what the old pose reduced to.
  const cocked = swatPose(SWAT_TIME * SWAT_WINDUP * 0.5, 1, G);
  const struck = swatPose(SWAT_TIME * SWAT_STRIKE, 1, G);
  const done = swatPose(SWAT_TIME, 1, G);
  assert.ok(cocked.across < 0, 'the wind-up does not draw the paw back');
  assert.ok(struck.across > 0.9, `the strike only got ${struck.across} of the way across`);
  assert.ok(struck.lift < cocked.lift - 1,
    'the paw does not lift into the strike, so it never comes down on anything');
  assert.ok(Math.abs(done.across) < 0.05, `the paw is left ${done.across} across at the end`);
  // And it starts and ends at rest. The yaw used to be read off `across`
  // linearly, which threw the cocked paw out to nearly twice the follow-through's
  // angle and snapped it sideways on the very first frame of the swat.
  //
  // Math.abs, not assert.equal, for the same reason catSwipe.test.mjs gives: this
  // multiplies by a sign that is -0 about half the time, and Object.is(-0, 0) is
  // false. A paw at rest is a paw at rest whichever zero it landed on.
  assert.ok(Math.abs(swatPose(0, 1, G).yaw) < 1e-9,
    'the paw jumps sideways the instant a swat starts');
  assert.ok(Math.abs(done.yaw) < 0.02, `the paw is left ${done.yaw} out at the end`);
  assert.ok(cocked.yaw < 0, 'the wind-up does not draw the paw back on screen either');
  assert.ok(Math.abs(cocked.yaw) < Math.abs(struck.yaw) + 0.01,
    'the paw is cocked further out than it is thrown across, which is backwards');
});

test('the two front paws alternate, so the swat is not always the same leg', () => {
  // Same paw every time means the model contradicts itself: the shove direction
  // alternates but the leg does not.
  const right = swatPose(SWAT_TIME * SWAT_STRIKE, 1, G).yaw;
  const left = swatPose(SWAT_TIME * SWAT_STRIKE, -1, G).yaw;
  assert.ok(right * left < 0, `both paws swing the same way (${right}, ${left})`);
  assert.ok(Math.abs(Math.abs(right) - Math.abs(left)) < 1e-9, 'the two paws are not mirrored');
});
