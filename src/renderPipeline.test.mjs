// Render-pipeline guards: the canvas tracks the live viewport, and the space
// station is warmed before its first cinematic frame.
//
// main.js cannot be imported headless (top-level await + DOM), so this checks
// the source wiring the way the other render/cinematic tests do.
//
// Run: node --test src/renderPipeline.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

test('the drawing buffer follows the live window size, not just resize events', () => {
  assert.match(main, /function syncRendererSize\(force = false\)/,
    'there is no shared size sync');
  // The renderer is sized from the LIVE window, and the pixel ratio is re-read
  // (a DPR change on zoom / another monitor is a resolution change too).
  assert.match(main, /const w = Math\.max\(1, Math\.floor\(window\.innerWidth\)\)/);
  assert.match(main, /const h = Math\.max\(1, Math\.floor\(window\.innerHeight\)\)/);
  assert.match(main, /const ratio = gfxPixelRatio\(\)/);
  assert.match(main, /renderer\.setSize\(w, h\)/);
  // Checked on every frame: a missed resize event must not leave the old buffer.
  const animate = main.slice(main.indexOf('function animate()'));
  assert.match(animate.slice(0, 400), /syncRendererSize\(\);/,
    'the frame loop never reconciles the canvas size');
  // ...and layout-driven changes that fire no window resize are covered too.
  assert.match(main, /new ResizeObserver\(\(\) => syncRendererSize\(\)\)/,
    'the document ResizeObserver is gone');
  assert.match(main, /visualViewport\.addEventListener\('resize'/,
    'visualViewport resizes (mobile chrome) are ignored');
});

test('the size-sync state is initialised before the frame loop starts', () => {
  // The frame loop calls syncRendererSize() on its very first pass, so a `let`
  // declared below `animate();` is still in its temporal dead zone — which is
  // exactly the "can't access lexical declaration '_winW' before initialization"
  // crash this pins.
  const declAt = main.indexOf('let _winW');
  const callAt = main.indexOf('\nanimate();');
  assert.ok(declAt > 0, 'the size-sync state is gone');
  assert.ok(callAt > 0, 'could not find the animate() start');
  assert.ok(declAt < callAt, '_winW is declared after animate() starts (TDZ crash)');
});

test('the car pitches up and down on the bathroom dish', () => {
  // A two-point height sample of the board/dish, then the local Z pitch — the
  // same rule the farm and beach use, gated so the flat rest of the house is
  // untouched.
  assert.match(main, /bathSurfs = surfs\.filter/,
    'the bathroom slope sample is gone');
  assert.match(main, /terrainPitch = THREE\.MathUtils\.clamp\(\s*-Math\.atan2\(fh - rh, halfBase \* 2\)/,
    'the bath dish no longer drives the car pitch');
  assert.match(main, /\} else if \(worldState === 'house'\) \{[\s\S]{0,600}car\.rotation\.z \+= \(terrainPitch - car\.rotation\.z\)/,
    'the house attitude branch no longer applies the slope pitch');
});

test('the house camera is held inside the room the car is in', () => {
  assert.match(main, /function houseRoomAt\(x, z\)/,
    'the room lookup is gone');
  assert.match(main, /for \(const name in ROOMS\)/,
    'the room lookup no longer walks ROOMS');
  assert.match(main, /const room = houseRoomAt\(car\.position\.x, car\.position\.z\)/,
    'the chase camera does not pick the car\'s room');
  assert.match(main, /camera\.position\.x = THREE\.MathUtils\.clamp\(camera\.position\.x, room\.x0 \+ m, room\.x1 - m\)/,
    'the lens can still swing into the next room');
  assert.match(main, /camera\.position\.z = THREE\.MathUtils\.clamp\(camera\.position\.z, room\.z0 \+ m, room\.z1 - m\)/);
});

test('the space station is GPU-warmed during the launch, before the arrival fades in', () => {
  assert.match(main, /function warmSpaceStation\(\)/,
    'no space-station warm pass');
  // It renders the REAL scene into an offscreen target with culling disabled,
  // so every program/buffer the cinematic will need is already uploaded.
  assert.match(main, /renderer\.setRenderTarget\(_spaceWarmRT\)/);
  assert.match(main, /if \(o\.isMesh && o\.frustumCulled\)/);
  assert.match(main, /renderer\.render\(spaceScene, _spaceWarmCam\)/);
  // The launch ride is the window: it runs while the opening black is up.
  const ride = main.slice(main.indexOf('function updateRocketRide(delta)'));
  assert.match(ride.slice(0, 700), /warmSpaceStation\(\);/,
    'the launch ride does not warm the station');
  // The arrival gate: warm first, so the fade-up can never reveal a compiling
  // station, even on a direct jump.
  const arrival = main.slice(main.indexOf('function startSpaceArrival()'));
  const warmAt = arrival.indexOf('warmSpaceStation();');
  assert.ok(warmAt > 0 && warmAt < 700, 'the arrival can fade up before the station is warm');
});

// The house is the most expensive scene in the game to draw: thousands of small
// meshes, every one of them casting a shadow, plus a cube-map reflection. These
// guard the three places that cost was paid for nothing. None of them changes
// what the player can do or see, so they must not silently regress.
test('the house sun shadow is cached, not re-rendered every frame', () => {
  assert.match(main, /houseSun\.shadow\.autoUpdate = false;/,
    'the house sun is back to baking its shadow map every frame');
  assert.match(main, /function houseShadowTick\(now\)/, 'no shadow-bake scheduler');
  assert.match(main, /houseSun\.shadow\.needsUpdate = true;/,
    'nothing ever asks the sun to re-bake');
  // It has to run inside the house branch of the frame loop, or the car's own
  // shadow would never follow it.
  const houseBlock = main.slice(main.search(/if \(worldState === 'house'\) \{\s*updateHouseFire/));
  assert.match(houseBlock.slice(0, 400), /houseShadowTick\(clock\.elapsedTime\);/,
    'the frame loop never ticks the house shadow');
  // A new WebGL context (the anti-alias toggle) owns no shadow maps, so the
  // cached ones have to be re-armed or the house loses its shadows for good.
  const aa = main.slice(main.indexOf('function gfxApplyAA()'));
  assert.match(aa.slice(0, 1600), /o\.shadow\.needsUpdate = true;/,
    'the renderer swap does not re-arm cached shadow maps');
});

test('the house mirror reflection is only baked near a mirror', () => {
  assert.match(main, /const HOUSE_MIRROR_RANGE = \d+;/, 'no mirror range gate');
  assert.match(main, /const houseMirrorSpots = houseWorld\.mirrorSpots \|\| \[\];/,
    'the mirror panes are not carried over from the builder');
  assert.match(main, /inMirrorRoom \|\| near < range2/, 'the cube bake is unconditional again');
  // ...and the builder has to actually publish those panes.
  const builder = readFileSync(new URL('./levels/house/index.js', import.meta.url), 'utf8');
  assert.match(builder, /mirrorSpots,/, 'addHouse does not return the mirror panes');
});

test('the house has had the tiny-shadow-caster perf pass applied to it', () => {
  assert.match(main, /capShadowCasters\(houseWorld\.group\);/, 'the house is exempt from the caster cap');
});
