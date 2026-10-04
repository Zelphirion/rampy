// The cat's temper: how many swats it has left before it gets bored of you.
//
// Split out from cat.js (which builds meshes and needs THREE) so the rule can be
// unit-tested. The rule the game has to keep is simple and has to be exact: once
// the car wakes the cat it chases you and swats you THREE times, and then — on
// the third, not before and not a fourth time — it loses interest and goes off to
// find a bed somewhere else in the house.
//
// The budget is counted, not timed. An earlier version gave up after 25 seconds
// of chasing, which meant a cat could swipe you a dozen times or, if you kept
// your distance, not once — the number of swats depended on how you drove rather
// than on the cat running out of interest. Counting swats means three is three.
//
// What does NOT end it early, and why:
//   - Distance. Distance is not a reason to stop; it is how you avoid a swat,
//     not how you end the chase.
//   - The arch. The half second the cat spends arching its back is a beat before
//     the first swat and comes out of the same mood, not out of the budget.
//
// What DOES end it: the third swat, and nothing else. So a cat that never gets
// close enough to swat will keep coming, which is correct — it is still interested
// in you, it just has not had a paw on you yet.

export const CAT_MAX_SWIPES = 3;
export const CAT_RISE_TIME = 0.45;   // the back-arching beat, before the first swat

// Has the cat spent its swat budget? Pure: no timers, no side effects.
//
// `swipes` is the number of swats already thrown. Returns true from the third
// onwards. The arch-then-chase split is deliberately NOT in here: that is a
// property of the animation, not of the temper, and folding it in meant a cat that
// was already chasing could be sent back to 'rising' because it had stopped
// reporting an arch time.
export function swipeSpent(swipes) {
  return swipes >= CAT_MAX_SWIPES;
}

// Swats left, given how many have been thrown. Clamped at zero so a caller that
// overshoots by a frame does not report a negative budget.
export function swipesLeft(swipes) {
  return Math.max(0, CAT_MAX_SWIPES - swipes);
}
