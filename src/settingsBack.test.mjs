// The gear modal's back button, and the split-screen screens that hang off it.
//
// Every one of these screens is DOM + module state, so the contract worth
// pinning is the LAYERING one: pressing back must undo exactly the screen you
// are looking at, never two of them at once, and nothing may be left behind on
// top of the game afterwards.
//
// Run: node --test src/settingsBack.test.mjs
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

test('Esc inside the showroom stops there instead of also closing the split', () => {
  // The showroom's Esc branch used to fall through into the handlers below it:
  // one press closed the modal AND the split-screen settings overlay behind it
  // (or collapsed the live split), so the player landed in the game with their
  // menu gone.
  const start = main.indexOf('// Car-showroom keys (gear screen)');
  const end = main.indexOf('// Esc leaves a running split-screen');
  assert.ok(start > 0 && end > start, 'the keydown menu handlers have moved');
  const chunk = main.slice(start, end);
  assert.match(chunk, /if \(selectMode\) \{/, 'the selectMode key branch is gone');
  assert.match(chunk, /return;/, 'the selectMode branch falls through to the split handlers');
});

test('backing out of a shared panel returns to the split overlay, not the game', () => {
  const body = bodyOf('exitSelectMode');
  assert.match(body, /openMpSettings\(true\)/,
    'the shared panel no longer hands back to the split-screen overlay');
  // ...and it must hand back the overlay's own pause snapshot, not
  // selectWasPaused (which is always "paused", because the overlay paused it).
  assert.match(body, /setPaused\(backToSplitOverlay \? mpWasPaused : selectWasPaused\)/,
    'exitSelectMode restores the wrong pause state when leaving a shared panel');
});

test('starting a split tears the settings overlay down first', () => {
  const body = bodyOf('beginSplit');
  assert.match(body, /classList\.remove\([^)]*'mp-settings-open'\)/,
    'beginSplit can leave the split settings overlay on top of the running game');
  assert.match(body, /mpSettingsOpen = false/,
    'beginSplit leaves the overlay flag set');
});

test('a fresh session drops the handoff back to the split overlay', () => {
  for (const name of ['startClaimFlow', 'startTouchSplit']) {
    const body = bodyOf(name);
    assert.match(body, /mpReturnFromShared = false/,
      `${name} can bounce straight back into the split overlay`);
    assert.match(body, /if \(splitActive\) endSplit\(\)/,
      `${name} stacks a second split on a live one`);
  }
});

test('the gear button opens the split\'s own settings while two are playing', () => {
  const body = bodyOf('openSettingsFromGear');
  assert.match(body, /selectMode\) exitSelectMode\(false\)/,
    'the gear button no longer closes the showroom');
  assert.match(body, /splitActive\) openMpSettings\(\)/,
    'the gear button opens the single-player showroom over a running split');
  // One entry point for the mouse and the pad's View button.
  assert.match(main, /addEventListener\('click', openSettingsFromGear\)/,
    'the gear button has its own copy of the routing');
  assert.match(main, /if \(press\(8\)\)[^}]*openSettingsFromGear\(\)/,
    'the pad View button bypasses the gear button\'s routing');
});

test('the pick screen\'s Back really does back out, on every input', () => {
  const keys = bodyOf('handlePickKey');
  assert.match(keys, /event\.code === 'Escape'[^;]*cancelClaimFlow\(\)/,
    'Esc no longer cancels the car picker');
  const pads = bodyOf('pickFromPads');
  assert.match(pads, /bEdge\) \{ cancelClaimFlow\(\); return; \}/,
    'pad B no longer cancels the car picker, though the screen promises it does');
  assert.match(html, /id="pick-cancel"/, 'the pick screen has no Back button');
  assert.match(main, /pickCancelBtn\.addEventListener\('click', \(\) => cancelClaimFlow\(\)\)/,
    'the pick screen\'s Back button is not wired');
});

test('the split settings overlay is navigable and escapable from the pad', () => {
  assert.match(main, /if \(mpSettingsOpen\) \{[\s\S]{0,400}closeMpSettings\(\); return;/,
    'pad B / Start cannot leave the split settings overlay');
  assert.match(main, /classList\.contains\('mp-settings-open'\)\) scope = document\.getElementById\('mp-settings-screen'\)/,
    'the pad cannot walk the split settings overlay\'s buttons');
});

test('nothing unpauses or shows through the menus', () => {
  // Space (and pad Start) must not start the world running behind a menu that
  // is holding it still.
  assert.match(main, /event\.code === 'Space' && !selectMode && !mpSettingsOpen/,
    'Space unpauses the world behind the split settings overlay');
  // The split bar and the live-split markers are frozen furniture while the
  // showroom is up (the split loop is not running to re-hide them).
  assert.match(html, /body\.select-mode #mp-bar \{ display: none; \}/,
    'the split bar shows through the settings screen');
  assert.match(html, /body\.select-mode #split-divider \{ display: none; \}/,
    'the split divider shows through the settings screen');
  assert.match(html, /body\.select-mode \.split-off-indicator \{ display: none !important; \}/,
    'a frozen rival marker shows through the settings screen');
});
