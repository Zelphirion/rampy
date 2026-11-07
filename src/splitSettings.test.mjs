// The two-player settings screens: the split-screen settings overlay (each side
// changes its OWN ride, everything else is shared) and the car picker that
// starts a session.
//
// What is worth pinning here is that a ride chosen in one screen is the ride
// every OTHER screen believes in — the stale-preview bug below is what made a
// car picked in the split silently revert the moment you opened Settings.
//
// Run: node --test src/splitSettings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(here, 'main.js'), 'utf8');

function bodyOf(name) {
  const at = main.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `main.js has no ${name}()`);
  const end = main.indexOf('\n}', at);
  return main.slice(at, end);
}

test('the overlay has a column per player, and one button each way', () => {
  for (const id of ['mps-p1', 'mps-p2']) {
    assert.ok(html.includes(`id="${id}"`), `the overlay has no ${id} column`);
  }
  for (const id of ['mps-p1-prev', 'mps-p1-next', 'mps-p2-prev', 'mps-p2-next']) {
    assert.ok(html.includes(`id="${id}"`), `the overlay has no ${id} button`);
  }
  // The arrows are wired by a single loop over both players and both
  // directions; a hand-written pair is how one of them goes missing.
  assert.match(main, /for \(const \[pi, dir\] of \[\[0, -1\], \[0, 1\], \[1, -1\], \[1, 1\]\]\)/,
    'the overlay arrows are no longer wired in one loop');
  assert.match(html, /id="mps-close"[^>]*>[\s\S]{0,40}Resume/, 'the overlay lost its Resume button');
  assert.match(html, /id="mps-exit"/, 'the overlay lost its Exit Split button');
});

test('cycling one player\'s ride leaves the other one alone', () => {
  const body = bodyOf('mpCycleCar');
  // P1 goes through swapPlayerCar (the same commit the showroom uses) and P2
  // through applyPlayerTwoCar, which owns P2's own kind/footprint/abilities.
  assert.match(body, /pi === 0[\s\S]*?swapPlayerCar\(next\)/, 'P1 no longer cycles its own body');
  assert.match(body, /applyPlayerTwoCar\(next\)/, 'P2 no longer cycles its own body');
  assert.match(body, /updateMpSettingsUI\(\)/, 'the overlay names are not repainted after a cycle');
  // Both commits record their kind, and the tags are re-attached after the
  // models are rebuilt (the rebuild takes the sprite children with it).
  assert.match(bodyOf('swapPlayerCar'), /playerCarKind = kind/, 'P1\'s ride is not recorded');
  const p2 = bodyOf('applyPlayerTwoCar');
  assert.match(p2, /playerTwoCarKind = entry\.id/, 'P2\'s ride is not recorded');
  assert.match(p2, /players\[1\]\.kind = entry\.id/, 'P2\'s player record keeps a stale ride id');
  assert.match(body, /reattachSplitMarkers\(\)/, 'a body swap drops the floating name tags');
});

test('a ride changed live drags the showroom\'s armed preview with it', () => {
  // Committing in the showroom re-applies the armed preview, so if a live swap
  // (split overlay, pick step) left that preview behind, opening Settings
  // showed the OLD car and Enter quietly put you back in it.
  assert.match(bodyOf('swapPlayerCar'), /playerPreview = kind/,
    'the Player tab keeps previewing the body you already replaced');
  assert.match(bodyOf('applyChaseCar'), /chasePreview = kind/,
    'the Chase tab keeps previewing the body you already replaced');
});

test('a new session starts both players on the rides they last had', () => {
  const body = bodyOf('enterPickPhase');
  assert.match(body, /pickKinds\[0\] = playerCarKind/, 'P1\'s last ride is forgotten');
  assert.match(body, /pickKinds\[1\] = playerTwoCarKind/,
    'P2\'s column snaps back to a hard-coded starter every session');
});

test('a body swap onto a non-car clears any leftover pancake', () => {
  const p2 = bodyOf('applyPlayerTwoCar');
  assert.match(p2, /isRobot \|\| entry\.id === 'skateboarder' \|\| entry\.id === 'crab'/,
    'P2 keeps P1\'s old body\'s squash rules');
  assert.match(p2, /flatCar2State = createFlatCarState\(false\)/,
    'P2 stays flattened through a swap onto a body that cannot be squashed');
});

test('the live split\'s HUD does not ghost through the settings overlay', () => {
  // The overlay is translucent and full-screen; the split bar, divider, gear
  // badges and a rival's frozen edge marker all belong to the game underneath.
  assert.match(html, /body\.mp-settings-open #split-divider/,
    'the split divider shows through the overlay');
  assert.match(html, /body\.mp-settings-open \.split-off-indicator/,
    'a rival\'s off-screen marker shows through the overlay');
  assert.match(html, /body\.mp-settings-open #gear-btn/,
    'the gear badge shows through the overlay');
  // A paused frame is drawn through ONE full-screen camera, so the floating
  // tags (one per split viewport) would sit on the wrong half.
  const paused = bodyOf('setPaused');
  assert.match(paused, /if \(splitActive\) \{[\s\S]{0,300}marker\.visible = false/,
    'a paused split draws the rival\'s floating tag on your own screen');
});

test('a paused split still draws BOTH viewports behind the menu', () => {
  // The settings overlay, the shared Graphics/Camera panels and Space-pause all
  // hold the world still. That paused frame used to fall through to a single
  // full-screen P1 render, so opening the menu looked like it had dropped you
  // back into one-player until you resumed.
  const paused = main.slice(main.indexOf('  if (isPaused) {'), main.indexOf('  const rawDelta = clock.getDelta();'));
  assert.ok(paused.length > 0, 'the paused branch of animate() has moved');
  assert.match(paused, /if \(splitActive && camB\) \{[\s\S]{0,200}renderSplitFrame\(\)/,
    'a paused split falls back to the single-player view');
  assert.match(paused, /followCameraTwo\(players\[1\], 1 \/ 60\)/,
    'P2\'s camera is not eased while the world is held still');
  // One implementation for both paths: the live frame and the paused frame must
  // not drift into two different two-viewport renders.
  assert.equal((main.match(/renderer\.setScissorTest\(true\)/g) || []).length, 1,
    'the two-viewport render has been duplicated');
  assert.equal((main.match(/renderSplitFrame\(\);/g) || []).length, 2,
    'the two-viewport render is not shared by the live and paused paths');
});

test('the overlay is the only place a ride changes mid-split', () => {
  // The chaser is parked in a split, so its tab would change a car neither
  // player can see; the tab row is reachable from the overlay's shared panels.
  assert.match(html, /body\.split-on #tab-chase \{ display: none; \}/,
    'the Chase tab is still offered during a split');
  assert.match(main, /if \(tab === 'chase' && splitActive\) tab = 'player'/,
    'something can still open the Chase tab during a split');
  // ...and the pad must not step onto the hidden tab.
  assert.match(main, /el\.offsetParent !== null/,
    'the pad walks tabs that are hidden on this screen');
});
