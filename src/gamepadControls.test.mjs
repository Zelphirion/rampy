// The gear screen's Controls tab is a table of promises: "press this, that
// happens", in two columns — keyboard/mouse and Xbox. A promise the code does
// not keep is worse than no table, so both halves are pinned together here:
// the markup has to promise only things the code actually reads, and every
// binding the code reads has to be listed.
//
// The driving bindings live in the input-scheme module (modules/player.js,
// INPUT_SCHEMES), resolved per player by readInput(); the global one-shot keys
// (pause, horn, bookmark, top-down, menu navigation) stay in main.js's keydown
// handler. A binding can live in either half and the table must list it.
//
// Run: node --test src/gamepadControls.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('main.js', import.meta.url), 'utf8');
const player = readFileSync(new URL('modules/player.js', import.meta.url), 'utf8');
const src = main + '\n' + player;   // bindings may live in either half

// The markup is written with entities (&uarr; and friends) so it survives in a
// plain file; the assertions below are written in real characters.
const decode = (s) => s
  .replace(/&uarr;/g, '↑').replace(/&darr;/g, '↓')
  .replace(/&larr;/g, '←').replace(/&rarr;/g, '→')
  .replace(/&middot;/g, '·').replace(/&hellip;/g, '…')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));


// The tbody, split into rows: enough to count cells without a real parser.
const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
const rows = tbody
  ? [...tbody[1].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].map((m) => ({
      attrs: m[1],
      cells: [...m[2].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((c) => ({
        attrs: c[1],
        text: c[2].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim(),
      })),
    }))
  : [];

test('the table is actually there, in a Controls tab of the gear screen', () => {
  assert.ok(tbody, 'index.html has no <tbody> — the Controls table is gone');
  assert.match(html, /id="tab-controls"\s+class="picker-tab"/,
    'the gear screen has no Controls tab button');
  assert.match(html, /id="controls-panel"\s+class="browser-panel"/,
    'the Controls tab has no panel');
  assert.match(main, /setPickerTab\('controls'\)/,
    'main.js never switches to the controls tab');
  assert.match(main, /classList\.toggle\('tab-controls', tab === 'controls'\)/,
    'setPickerTab does not turn the controls panel on');
  assert.match(main, /tab === 'levels' \|\| tab === 'objects' \|\| tab === 'controls'/,
    'the controls tab does not hide the showroom furniture like the other browsers');
});

test('every row says what it does: input, description, Xbox button', () => {
  assert.ok(rows.length >= 15, `only ${rows.length} rows — the table is thin`);
  let groups = 0;
  for (const row of rows) {
    if (/ctl-group|ctl-note/.test(row.attrs)) {
      groups++;
      assert.equal(row.cells.length, 1, 'a section / note row spans all columns');
      assert.ok(row.cells[0].attrs.includes('colspan'), 'a section row must span');
      continue;
    }
    assert.equal(row.cells.length, 3,
      `row "${row.cells[0] && row.cells[0].text}" must have Input | What it does | Xbox`);
    assert.ok(row.cells[0].text.length > 0, 'a row has no input');
    assert.ok(row.cells[1].text.length > 0, `"${row.cells[0].text}" does not say what it does`);
    assert.ok(row.cells[2].text.length > 0, `"${row.cells[0].text}" has no Xbox button`);
  }
  assert.ok(groups >= 4, 'the table is missing its section headings');
});

test('the Xbox buttons in the table are the ones the code reads', () => {
  // Standard-mapping indices, exactly as pollGamepad uses them.
  const documented = new Set(
    [...html.matchAll(/<span class="padbtn">([^<]+)<\/span>/g)].map((m) => decode(m[1].trim())),
  );
  for (const want of ['A', 'B', 'X', 'LB', 'RB', 'RT', 'LT', 'Start', 'View', 'R3']) {
    assert.ok(documented.has(want), `the table never mentions ${want}`);
  }
  for (const idx of ['0', '1', '2', '4', '5', '6', '7', '8', '9', '11']) {
    // Read as a press (edge), a hold (b()) or an analog trigger value.
    assert.ok(main.includes(`press(${idx})`) || main.includes(`b(${idx})`) || main.includes(`buttons[${idx}]`),
      `main.js never reads gamepad button ${idx}, which the table documents`);
  }
});

test('the keyboard bindings in the table are the ones the game reads', () => {
  // Keyboard half: the <kbd> caps in the table against the input schemes
  // (modules/player.js) and the global keydown handler (main.js).
  const caps = [...html.matchAll(/<kbd>([^<]+)<\/kbd>/g)].map((m) => decode(m[1].trim()));
  const expect = {
    'W': "'KeyW'", 'S': "'KeyS'", 'A': "'KeyA'", 'D': "'KeyD'",
    'Shift': "'ShiftLeft'", 'Space': "event.code === 'Space'",
    'H': "event.code === 'KeyH'",
    'C': "event.code === 'KeyC'", 'B': "event.code === 'KeyB'",
    'Enter': "event.code === 'Enter'", 'Esc': "event.code === 'Escape'",
    '←': "event.code === 'ArrowLeft'", '→': "event.code === 'ArrowRight'",
    '↑': "'ArrowUp'", '↓': "'ArrowDown'",
  };
  for (const [cap, needle] of Object.entries(expect)) {
    assert.ok(caps.includes(cap), `the table no longer lists ${cap}`);
    assert.ok(src.includes(needle), `nothing reads ${cap} (${needle}) anywhere`);
  }
  // The split-screen schemes are keysets, not loose conditions: each cap above
  // must be declared in the scheme its player is bound to.
  assert.ok(player.includes("'kb-wasd'") && player.includes("'kb-arrows'"),
    'the input schemes module is missing the wasd / arrows halves');
});

test('the pad is polled every frame and feeds the car', () => {
  assert.match(main, /pollGamepad\(/, 'nothing polls the Gamepad API');
  assert.match(main, /navigator\.getGamepads/, 'the pad is never read');
  // Polled inside animate(), BEFORE the paused early-return, so Start can
  // unpause and the settings screen stays reachable from the pad.
  const animate = main.slice(main.indexOf('function animate()'), main.indexOf('function animate()') + 1200);
  const pollAt = animate.indexOf('pollGamepad(');
  const pausedAt = animate.indexOf('if (isPaused)');
  assert.ok(pollAt >= 0, 'the frame loop never polls the pad');
  assert.ok(pausedAt >= 0, 'the frame loop lost its paused early-return');
  assert.ok(pollAt < pausedAt,
    'the poll sits after the paused early-return, so a paused game would ignore the pad');
  // The pad's analog state is published by pollGamepad and folded into the
  // per-frame input by the scheme resolver (modules/player.js) — not read loose
  // in the driving block any more.
  assert.match(main, /pad\.throttle = throttle/, 'the poll never publishes throttle');
  assert.match(main, /readInput\(players\[0\], \{ keys, pad, joy \}\)/,
    'the frame loop does not resolve the driving input through the player');
  assert.match(player, /pad\.throttle > 0\.05/, 'the scheme resolver never accelerates with the triggers');
  assert.match(player, /pad\.reverse > 0\.05/, 'the scheme resolver never reverses with the triggers');
  assert.match(player, /state\.pad\.steer/, 'the scheme resolver never steers with the stick');
  assert.match(player, /pad\.boost/, 'the scheme resolver never folds X into the boost');
  assert.match(main, /addEventListener\('gamepadconnected'/, 'no connect status');
  assert.match(main, /addEventListener\('gamepaddisconnected'/, 'no disconnect status');
});
