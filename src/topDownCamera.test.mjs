// Regression tests for the C-key top-down camera.
//
// The mode is a thin hook into main.js, so most of what can go wrong is a hook
// that silently does nothing: a key that never fires, a zoom that is still
// clamped to the chase cam's ceiling, or a camera that teleports on the way
// back. These check the source wiring and the zoom bounds arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const TOPDOWN_ZOOM_MAX = Number(src.match(/TOPDOWN_ZOOM_MAX = ([\d.]+)/)[1]);

test('C toggles the top-down camera, and only C', () => {
  assert.match(src, /event\.code === 'KeyC'[\s\S]{0,220}toggleTopDownCamera\(\)/,
    'no KeyC handler calls toggleTopDownCamera');
  // Toggling means the same key turns it off again. Read the function body out
  // properly rather than guessing a regex window — it is ~500 chars and a
  // too-tight window fails on a harmless comment edit.
  const fn = src.slice(src.indexOf('function toggleTopDownCamera()'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /topDown\.active = false/,
    'toggleTopDownCamera never turns the mode back off');
  assert.match(body, /topDown\.active = true/,
    'toggleTopDownCamera never turns the mode on');
  // Holding the key must not machine-gun the toggle.
  assert.match(src, /!event\.repeat/);
  // C is not already bound to something else.
  assert.doesNotMatch(src, /keys\.c\b|keys\['c'\]|keys\.KeyC/,
    'C is read as a driving control somewhere');
});

test('the top-down zoom goes well past the chase cam ceiling', () => {
  const min = Number(src.match(/TOPDOWN_ZOOM_MIN = ([\d.]+)/)[1]);
  const max = Number(src.match(/TOPDOWN_ZOOM_MAX = ([\d.]+)/)[1]);
  const camMax = Number(src.match(/const CAM_ZOOM_MAX = ([\d.]+)/)[1]);
  assert.ok(max > camMax * 5,
    `top-down max (${max}) is not meaningfully past the chase cap (${camMax}) — ` +
    'the mode would not actually be "unlimited zoom"');
  assert.ok(min >= 1, 'zoom-in floor is below one unit, so the camera goes underground');
  assert.ok(min < max, 'zoom bounds are inverted');
  // The wheel must route to the top-down radius, not the chase one, or the
  // "unlimited" zoom is silently capped back to CAM_ZOOM_MAX. Extract the real
  // listener body — a loose /wheel[\s\S]{0,400}/ window matches the phrase
  // "wheel of death" in a comment further up the file and passes either way.
  const wheelAt = src.indexOf("addEventListener('wheel'");
  assert.ok(wheelAt > 0, 'no wheel listener found');
  const wheel = src.slice(wheelAt, src.indexOf('});', wheelAt));
  assert.match(wheel, /topDown\.active[\s\S]{0,200}TOPDOWN_ZOOM_MAX/,
    'the scroll wheel does not drive the top-down zoom');
  // The chase clamp is still there for the chase cam — it has to be, just not on
  // the top-down path. The `return` is what keeps them apart, so that is the
  // thing to check.
  assert.match(wheel, /TOPDOWN_ZOOM_MAX\);\s*return;\s*\}/,
    'the top-down wheel branch does not return, so the wheel would also re-clamp ' +
    'the chase radius and cap the plan view');
  assert.match(src, /pinchStartRadius \* factor, TOPDOWN_ZOOM_MIN, TOPDOWN_ZOOM_MAX/,
    'pinch-to-zoom does not use the top-down bounds');
  // The pinch has to measure from the height the plan view is actually at.
  assert.match(src, /pinchStartRadius = topDown\.active \? topDown\.zoom : cameraOrbit\.radius/);
});

test('the plan view aims straight down at the car, and does not jitter', () => {
  // A top-down cam that still looks at the horizon is just a high chase cam.
  assert.match(src, /_lookTarget\.set\(tx, car\.position\.y, tz\)/,
    'the plan view does not aim at the car');

  // The horizontal position must be a hard copy of the car, with no easing and
  // no reference to camera.position. A target built from
  // `car + wrappedDelta(car, camera)` is a feedback loop — the camera chases a
  // position defined by where it already is, so per-frame noise compounds and
  // the view shivers.
  //
  // Anchor on the branch's own comment, not on `if (topDown.active) {` — that
  // exact line also opens the up-vector state machine earlier in the function,
  // so an unanchored search silently latches onto the wrong block.
  const commentAt = src.indexOf('// Straight down over the car.');
  assert.ok(commentAt > 0, 'cannot find the top-down branch in updateCamera');
  const branchStart = src.indexOf('if (topDown.active) {', commentAt);
  const branchEnd = src.indexOf('// ===== Chase-cam handoff', branchStart);
  const branch = src.slice(branchStart, branchEnd);
  assert.match(branch, /_camDbg\.topDown = true/,
    'the extracted block is not the plan-view branch');

  assert.match(branch, /const tx = car\.position\.x;\s*const tz = car\.position\.z;/,
    'the plan view does not copy the car position directly');
  assert.match(branch, /camera\.position\.x = tx;\s*camera\.position\.z = tz;/,
    'the plan view does not hard-lock the camera to the car in plan');
  // No feedback: the branch must not read camera.position.x/z to build its
  // own target. Comments are stripped first — the branch explains the old
  // feedback loop in prose, and matching that would flag the explanation as
  // the bug.
  const code = branch.split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  assert.doesNotMatch(code, /wrappedDelta/,
    'the plan view still derives its target from camera.position via wrappedDelta ' +
    '- that is a feedback loop and it jitters');
  // The eased lerp may only read the camera position inside the transition-in
  // gate; the steady-state path must be a straight assignment.
  const afterGate = code.slice(code.indexOf('} else {'));
  assert.doesNotMatch(afterGate, /camera\.position\.(x|z)\s*=\s*THREE\.MathUtils\.lerp/,
    'the steady-state plan view still eases horizontally, so the car lags the centre');
  // Easing is allowed only for the transition-in, gated on blend < 1.
  assert.match(branch, /if \(topDown\.blend < 1\) \{/,
    'the transition-in ease is not gated, so the view is never fully steady');
});

test('index.html cache-busts the main.js it loads', () => {
  // main.js is served with a ?v= stamp, and the browser keys the cache on the
  // full URL — so a stamp that is not bumped means every edit to main.js is
  // invisible until a hard refresh. That silently served stale camera code
  // once already: the up-vector fix was correct in the file but never loaded.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/src="\.\/src\/main\.js\?v=(\d+)"/);
  assert.ok(m, 'index.html does not load main.js with a ?v= cache stamp');
  const stamp = Number(m[1]);
  assert.ok(Number.isInteger(stamp), `main.js cache stamp "${m[1]}" is not an integer`);

  // The meaningful invariant is not "how old is the stamp" but "is it older
  // than the file it busts for". A stamp can be only hours old and still be
  // stale relative to the current main.js, which is exactly the failure here.
  const mainMtime = statSync(new URL('./main.js', import.meta.url)).mtimeMs;
  assert.ok(stamp >= mainMtime,
    `main.js cache stamp ${stamp} predates main.js (mtime ${Math.round(mainMtime)}) — ` +
    'bump the ?v= in index.html or the browser will keep serving a stale main.js');
});

test('the plan view is north-locked, matching the minimap', () => {
  // The minimap is a 180-degree rotation of the world plane: +Z (north) at the
  // top, +X (east) on the LEFT. The plan view has to reproduce that, which means
  // the camera's up vector must point along +Z, not the default +Y.
  assert.match(src, /camera\.up\.set\(0, 0, 1\)/,
    'the camera up-vector is never set to +Z, so the plan view is not north-locked');
  assert.match(src, /camera\.up\.set\(0, 1, 0\)/,
    'the default up-vector is never restored for the chase cam');
  // Verified against Three's own lookAt basis rather than assumed: with the eye
  // directly above the target, z = (0,1,0) and up = (0,0,1) gives
  // x = cross(up, z) = (-1,0,0) and y = cross(z, x) = (0,0,1).
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // `+ 0` normalises -0 to 0 — deepStrictEqual treats them as different, and the
  // cross products here pick up a signed zero for free.
  const same = (got, want, msg) => assert.deepEqual(got.map((n) => n + 0), want, msg);
  const up = [0, 0, 1], z = [0, 1, 0];              // looking straight down
  const xAxis = cross(up, z);                        // screen right, in world
  const yAxis = cross(z, xAxis);                     // screen up, in world
  same(xAxis, [-1, 0, 0],
    'screen right is not -X, so east would be on the right and the map is mirrored');
  same(yAxis, [0, 0, 1],
    'screen up is not +Z, so north is not at the top');
  // Degenerate-lookAt guard. Three builds the basis as x = cross(up, z), where
  // z = normalize(eye - target) = (0,1,0) for a straight-down view. The default
  // up is (0,1,0) too, so cross(up, z) is the ZERO VECTOR — normalize() of that
  // is undefined, which is the tumble/jitter. Pointing up at +Z makes the cross
  // product non-zero, which is why this matters and not just tidiness.
  const defaultUp = [0, 1, 0];
  const defaultX = cross(defaultUp, z);
  assert.deepEqual(defaultX.map((n) => n + 0), [0, 0, 0],
    'expected cross(default up, view axis) to be zero — if not, the default up ' +
    'was never degenerate for a straight-down camera and the fix is unnecessary');
  const dot = up[0] * z[0] + up[1] * z[1] + up[2] * z[2];
  assert.notEqual(dot, 1, 'up is parallel to the view axis — lookAt is still degenerate');
  // The heading must not follow the car or the camera yaw, or it would disagree
  // with the minimap.
  const upAt = src.indexOf('camera.up.set(0, 0, 1)');
  const upBlock = src.slice(Math.max(0, upAt - 700), upAt + 40);
  assert.doesNotMatch(upBlock, /cameraYawOffset|car\.quaternion/,
    'the north-lock block references the car heading or the camera yaw');
});

// Pulls the real up-vector block out of main.js and runs it, rather than only
// pattern-matching it. The bug this exists to catch was a state machine that
// READS correctly and BEHAVES wrongly: the release arm sat behind an
// unreachable `else if`, so every regex above passed while the chase cam stayed
// north-locked forever and came back as a sideways view.
test('the up-vector is genuinely released when the mode is toggled off', () => {
  // Extract the state machine by brace-matching from its header comment, so the
  // extraction does not assume a particular internal shape. An implementation
  // that never releases the lock should fail on BEHAVIOUR below, not on "cannot
  // find the block" — that distinction is the whole point of this test.
  const headerAt = src.indexOf('// ===== Camera up-vector: north-locked for the plan view =====');
  assert.ok(headerAt > 0, 'cannot find the camera up-vector block in updateCamera');
  // Start at the first statement after the header comment, whether that is an
  // `if (...)` or a `const ...` — anchoring specifically on
  // `if (topDown.active) {` would skip past an implementation that guards the
  // lock with a computed flag, and then report a confusing failure against an
  // unrelated block further down.
  const firstStmt = src.slice(headerAt).search(/\n  (?:if \(|const )/);
  assert.ok(firstStmt > 0, 'the up-vector block has no statement after its comment');
  const firstIf = headerAt + firstStmt;
  // Walk braces from the `if` to find where the chain ends, stepping over
  // `} else if (...) {` / `} else {` continuations — a plain depth counter stops
  // at that first `}` and captures only the `if` arm, which is exactly how the
  // release logic went missing unnoticed.
  const isElse = (from) => {
    let j = from;
    for (; j < src.length; j++) {
      if (!/\s/.test(src[j])) break;
      if (src[j] === '/' && src[j + 1] === '/') {           // skip a comment line
        while (j < src.length && src[j] !== '\n') j++;
        continue;
      }
    }
    return src.startsWith('else', j);
  };
  let depth = 0, i = src.indexOf('{', firstIf);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0 && !isElse(i + 1)) { i++; break; }
    }
  }
  const block = src.slice(firstIf, i);

  // Read the threshold from source rather than hardcoding it — passing a literal
  // in here meant retuning the constant in main.js could not possibly fail this
  // test, which is exactly the kind of duplicated-number drift that hides bugs.
  const thr = Number(src.match(/TOPDOWN_UP_RELEASE_Y = ([\d.]+)/)[1]);
  assert.ok(thr > 0, 'the up-vector release threshold is not positive');

  // The threshold has to sit in a usable band, and BOTH failure directions are
  // the sideways-cam bug reached by different routes:
  //
  //  - Below the chase cam's resting height and it never fires. The camera
  //    descends from ~600 and settles at `restH` without ever passing below
  //    `thr`, so the lock is never released at all.
  //  - Far above the resting height and it fires on the first frame after
  //    toggle-off, while the camera is still overhead, putting the default up
  //    back on a straight-down lookAt (degenerate) and snapping the roll.
  //
  // So: low enough that the release happens at the chase cam's resting height,
  // high enough that it does not happen up at the top-down height.
  const restR = Number(src.match(/\bradius: ([\d.]+)/)[1]);
  const restPhi = Number(src.match(/\bphi: ([\d.]+)/)[1]);
  const restH = restR * Math.cos(restPhi) + 2.2;
  assert.ok(thr >= restH,
    `release threshold ${thr} is below the chase cam's resting height ${restH.toFixed(2)} — ` +
    'the camera never descends that far, so the north-lock is never released (sideways cam)');
  assert.ok(thr < TOPDOWN_ZOOM_MAX / 4,
    `release threshold ${thr} is so high it would release while the camera is still ` +
    'high overhead, putting the default up back on a degenerate straight-down lookAt');

  // Execute the extracted block against mock objects.
  const run = (topDown, camera, car) => {
    // eslint-disable-next-line no-new-func
    const fn = new Function('topDown', 'camera', 'car', 'TOPDOWN_UP_RELEASE_Y', block);
    fn(topDown, camera, car, thr);
  };
  const mkCam = (y) => ({ up: { x: 0, y: 1, z: 0, set(x, yy, z) { this.x = x; this.y = yy; this.z = z; } }, position: { y } });
  const car = { position: { y: 0.3 } };

  // 1. Off -> on: north-lock engages.
  const td = { active: true, blend: 0, upIsNorth: false };
  const cam = mkCam(3);
  run(td, cam, car);
  assert.deepEqual([cam.up.x, cam.up.y, cam.up.z], [0, 0, 1], 'toggling on did not north-lock');

  // 2. Still on, next frame: no change.
  run(td, cam, car);
  assert.deepEqual([cam.up.x, cam.up.y, cam.up.z], [0, 0, 1], 'north-lock is not stable while on');

  // 3. Toggle off but the camera is still high: must STAY north, or the
  //    straight-down lookAt goes degenerate mid-descent.
  td.active = false;
  td.blend = 0.3;
  cam.position.y = 0.3 + thr * 20;
  run(td, cam, car);
  assert.deepEqual([cam.up.x, cam.up.y, cam.up.z], [0, 0, 1],
    'released the north-lock while the camera was still overhead');

  // 4. Descent continues; release once low enough. This is the step the
  //    original bug never reached. Just above the threshold must still hold.
  td.blend = 0;
  cam.position.y = 0.3 + thr + 0.5;
  run(td, cam, car);
  assert.deepEqual([cam.up.x, cam.up.y, cam.up.z], [0, 0, 1],
    'released too early, while still high above the car');
  cam.position.y = 0.3 + thr;
  run(td, cam, car);
  assert.deepEqual([cam.up.x, cam.up.y, cam.up.z], [0, 1, 0],
    'NEVER released the north-lock — the chase cam would come back sideways');

  // 5. Latch: the car diving 10 units down the mine shaft leaves the camera far
  //    above it again. A non-latched release would re-engage north here and the
  //    chase cam would silently roll mid-drop.
  car.position.y = -10;
  cam.position.y = 0.3 + thr * 20;
  run(td, cam, car);
  assert.deepEqual([cam.up.x, cam.up.y, cam.up.z], [0, 1, 0],
    're-locked north after release — a dive would silently roll the chase cam');
  car.position.y = 0.3;

  // 6. And toggling on again still works after all that.
  td.active = true;
  cam.position.y = 45;
  run(td, cam, car);
  assert.deepEqual([cam.up.x, cam.up.y, cam.up.z], [0, 0, 1],
    'the second toggle-on did not re-engage the north-lock');

  // Structural sanity, checked only after the behaviour so that a broken state
  // machine reports the symptom a player would see rather than a shape mismatch.
  assert.match(block, /camera\.up\.set\(/, 'the extracted up-vector block sets no up-vector');
  assert.match(block, /upIsNorth = false/, 'the extracted block never clears upIsNorth');
});

test('the plan view is bounded by roofs and ceilings, not just by zoom', () => {
  // Underground is a slab with a ceiling at y=30; straight down from further
  // than that shows the underside of the roof and hides the car.
  assert.match(src, /worldState === 'underground' && camera\.position\.y > UG_TILE_UNDER/,
    'no underground ceiling clamp on the plan view');

  // The house is deliberately NOT clamped any more — requested, so the plan
  // view can pull out and see the house from above. The clamp is commented out
  // rather than deleted, so assert it is inert. Scope this to the plan-view
  // branch: the CHASE cam has its own live `if (worldState === 'house')` clamp
  // that keeps the camera inside the walls, and that one must stay.
  const commentAt2 = src.indexOf('// Straight down over the car.');
  const branchStart2 = src.indexOf('if (topDown.active) {', commentAt2);
  const branchEnd2 = src.indexOf('// ===== Chase-cam handoff', branchStart2);
  const planBranch = src.slice(branchStart2, branchEnd2);
  assert.ok(planBranch.length > 0, 'cannot find the plan-view branch');
  // Strip comment-only lines before looking for a live clamp — a regex over the
  // raw text happily matches THROUGH the `//` of a commented-out line.
  const planCode = planBranch.split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  assert.doesNotMatch(planCode, /if \(worldState === 'house'\)/,
    'the house ceiling clamp is live again in the plan view — it cannot zoom out over the house');
  assert.match(planBranch, /^\s*\/\/ if \(worldState === 'house'\) \{/m,
    'the house clamp was deleted outright rather than commented out for re-enabling');

  // With the clamp gone the camera rises through the ceiling, and the ceiling
  // slab faces UP, so from above it is opaque and would hide the whole house.
  // The cutaway is what makes the zoom-out usable, so it has to be wired up.
  assert.match(src, /houseWorld\.ceilingMesh\.visible = !\(topDown\.active && worldState === 'house'\)/,
    'the house ceiling cutaway is not wired to the top-down toggle');
  const house = readFileSync(new URL('./levels/house/index.js', import.meta.url), 'utf8');
  assert.match(house, /const ceilingMesh = flat\(/,
    'the house builder no longer keeps a reference to the ceiling mesh');
  assert.match(house, /ceilingMesh,/,
    'the house builder does not expose ceilingMesh, so the cutaway cannot work');
  // The ceiling COLLIDER must stay — only the visual is hidden, or the car
  // would drive straight out through the roof.
  assert.match(house, /h: ceil, ceiling: true, soft: true/,
    'the house ceiling collider is gone — the car could now drive through the roof');

  // The far plane is 300, which a 600-high plan view exceeds — without
  // stretching it the world clips to black at the frame edge.
  assert.match(src, /camera\.far = wantedFar/,
    'the far plane is not extended for the high view');
  assert.match(src, /Math\.max\(300, camera\.position\.y/,
    'the far plane extension is not bounded below by the chase cam default');
  // And it has to be put back, or the chase cam keeps an oversized depth range.
  assert.match(src, /camera\.far = 300/,
    'the far plane is never restored for the chase cam');
});

test('toggling back returns to the chase cam without a jump', () => {
  // The chase cam's own framing is remembered, so a player who zoomed in tight
  // still has that shot afterwards.
  assert.match(src, /topDown\.savedRadius = cameraOrbit\.radius/);
  assert.match(src, /topDown\.savedPhi = cameraOrbit\.phi/);
  assert.match(src, /cameraOrbit\.radius = topDown\.savedRadius/,
    'the chase cam radius is not restored on toggle-off');
  assert.match(src, /cameraOrbit\.phi = topDown\.savedPhi/,
    'the chase cam pitch is not restored on toggle-off');
  // camOffset goes stale while the plan view owns the frame; without the
  // handoff the first chase frame back teleports to a stale offset.
  assert.match(src, /if \(topDown\.handoff\)[\s\S]{0,260}camOffset\.copy\(camera\.position\)\.sub\(cameraTarget\)/,
    'no camOffset handoff on the way back to the chase cam');
  assert.match(src, /topDown\.handoff = true/,
    'the handoff is never armed on toggle-off');
});

test('cutscenes still win over the plan view', () => {
  // The top-down branch must come after the cinematic overrides, or pressing C
  // during a ride would hijack the framing. Every cinematic early-return has to
  // appear before it.
  const topdown = src.indexOf('===== Top-down camera (C key) =====', src.indexOf('function updateCamera'));
  assert.ok(topdown > 0, 'cannot find the top-down camera branch in updateCamera');
  for (const marker of [
    'if (expressState.active || expressCinT > 0) {',
    'if (chamberCine.active) {',
    'if (spiralCine.active) {',
    'if (tunnelAscentCine.active) {',
    'if (mineAscent.active) {',
    'if (buildingLevitate.active && buildingLevitate.levitating) {',
    'if (_postCineTimer > 0) {',
  ]) {
    const at = src.indexOf(marker);
    assert.ok(at > 0, `missing cinematic override: ${marker}`);
    assert.ok(at < topdown, `cinematic override is now AFTER the plan view: ${marker}`);
  }
  // And the plan view must return, or the chase cam would fight it for the
  // camera every frame.
  const branch = src.slice(topdown, src.indexOf('// ===== Chase-cam handoff', topdown));
  assert.match(branch, /return;\s+\/\/ the plan view owns the frame/,
    'the top-down branch does not return — the chase cam will fight it');
});
