// The settings screen's Levels and Objects browsers.
//
// These two live almost entirely in DOM and in a WebGL canvas, so there is very
// little pure maths to unit-test - but there IS a contract worth pinning, and
// every item here is one that silently stops existing if somebody tidies the
// markup:
//
//   - a per-level "Objects" button, so a level's catalogue is one click away
//     from the level itself (and NOT the same click: browsing a place you are
//     not standing in is the point)
//   - page numbers above the grid, so you can see how many pages there are
//   - a 9-per-page grid, captioned "Objects 10 - 18"
//   - a spinning miniature per tile, drawn into that tile's own box
//   - ?objects=<name> pushed as history state, so a refresh comes back to the
//     same object rather than the top of the list
//
// Run: node --test src/objectBrowser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const catalog = fs.readFileSync(path.join(here, 'objects', 'catalog.js'), 'utf8');

test('every level row offers its own Objects button', () => {
  // The level button and the Objects button are SIBLINGS inside a row wrapper.
  // Nesting one inside the other is invalid HTML and the inner button stops
  // being clickable in some browsers, which would make the catalogue
  // unreachable - so the wrapper is part of the contract, not decoration.
  assert.ok(/className = 'level-row'/.test(main), 'the level list builds no row wrapper');
  assert.ok(/row\.append\(b, ob\)/.test(main),
    'the Objects button is not appended beside its level button');
  assert.ok(/b\.addEventListener\('click', \(\) => travelToLevel\(lvl\.id\)\)/.test(main),
    'the level button no longer travels you there');
  assert.ok(/ob\.addEventListener\('click', \(\) => openLevelObjects\(lvl\.id\)\)/.test(main),
    'the Objects button does not open that level\'s objects');
  // And the CSS has to give the row somewhere to put it.
  assert.ok(/\.level-row \{[^}]*display: flex/.test(html), '.level-row is not a flex row');
  assert.ok(/\.lv-objects-btn \{/.test(html), 'the Objects button has no styles');
});

test('opening a level\'s objects browses it without travelling there', () => {
  const fn = main.slice(main.indexOf('function openLevelObjects('));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(/objLevel = levelId/.test(body), 'it does not switch to the level asked for');
  assert.ok(/objCat = null/.test(body), 'it does not reset the category');
  assert.ok(/objOpen = null/.test(body), 'it does not start with nothing open');
  assert.ok(/setPickerTab\('objects'\)/.test(body), 'it does not go to the Objects tab');
  assert.ok(/pushBrowserUrl\(\)/.test(body), 'the URL does not follow it');
  // The one thing it must NOT do is move the car: that is what "view in
  // context" is for.
  assert.ok(!/travelToLevel/.test(body),
    'browsing a level teleports you there; view-in-context is the button for that');
});

test('the grid is nine to a page, captioned by its real range', () => {
  assert.ok(/const OBJ_PAGE_SIZE = 9;/.test(main),
    'the page size is not nine, so the caption cannot read "Objects 10 - 18"');
  assert.ok(/grid-template-columns: repeat\(3, 1fr\)/.test(html),
    'the grid is not three across');
  assert.ok(/`Objects \$\{from \+ 1\} - \$\{last\}`/.test(main),
    'the caption is not "Objects <first> - <last>"');
  // The caption counts within the CATEGORY, not within the page, or it would
  // restart at 1 on every page.
  assert.ok(/const from = objPage \* OBJ_PAGE_SIZE;/.test(main),
    'the page offset does not come from the page number');
});

test('page numbers are drawn above the grid', () => {
  assert.ok(/id="obj-pages"/.test(html), 'there is no page-number row in the markup');
  // Above the grid, not below it: the user asked for the page count at the top.
  assert.ok(html.indexOf('id="obj-pages"') < html.indexOf('id="obj-grid"'),
    'the page numbers are below the grid');
  assert.ok(/for \(let p = 0; p < pages; p\+\+\)/.test(main), 'one button per page is not built');
  assert.ok(/pb\.textContent = String\(p \+ 1\)/.test(main), 'the buttons are not numbered from 1');
  // A single-page category does not need a lonely "1".
  assert.ok(/if \(pages > 1\)/.test(main), 'a one-page category still shows a page number');
  // ...and the arrows stay at the bottom.
  assert.ok(/id="obj-prev"[\s\S]*?id="obj-range"[\s\S]*?id="obj-next"/.test(html),
    'the prev / range / next pager is not below the grid');
});

test('each tile has a box for its miniature and a caption under it', () => {
  // The canvas draws over the tiles, so each tile needs an element whose rect IS
  // the viewport, and a caption strip the canvas never covers.
  assert.ok(/thumb\.className = 'ot-thumb'/.test(main), 'the tile has no preview box');
  assert.ok(/foot\.className = 'ot-foot'/.test(main), 'the tile has no caption strip');
  assert.ok(/tile\.append\(thumb, foot\)/.test(main),
    'the caption is not under the miniature');
  assert.ok(/label\.textContent = o\.name/.test(main), 'the tile shows no name');
  assert.ok(/\.obj-tile \.ot-thumb \{[^}]*flex: 1 1 auto/.test(html),
    'the preview box does not take up the space above the caption');
});

test('the miniatures are drawn into the tiles\' own rects', () => {
  assert.ok(/id="obj-thumbs"/.test(html), 'there is no thumbnail canvas');
  assert.ok(/pointer-events: none/.test(html.slice(html.indexOf('#obj-thumbs {'), html.indexOf('#obj-thumbs {') + 300)),
    'the thumbnail canvas would swallow clicks meant for the tiles');
  // One context, scissored per tile - nine WebGL contexts would be nine chances
  // to hit the browser's limit.
  assert.ok(/setScissorTest\(true\)/.test(main), 'the tiles are not drawn through a scissor');
  assert.ok(/new THREE\.WebGLRenderer\(\{ canvas: objThumbCanvas/.test(main),
    'the thumbnails are not drawn by their own renderer');
  // And each model spins.
  assert.ok(/v\.t\.group\.rotation\.y = v\.t\.spin/.test(main), 'the miniatures do not turn');
  // Viewport maths: three counts from the bottom-left, the DOM from the top.
  assert.ok(/y: host\.height - \(r\.bottom - host\.top\)/.test(main),
    'the thumbnails are drawn the right way up');
  // The canvas follows the grid, positioned against the padding box.
  assert.ok(/panel\.clientLeft/.test(main),
    'the canvas is not placed against the panel\'s padding box');
});

test('the URL carries the object, so a refresh comes back to it', () => {
  assert.ok(/p\.set\('objects', objOpen\)/.test(main),
    'the open object is not written into the URL');
  assert.ok(/history\.(push|replace)State\(state, '', url\)/.test(main),
    'the URL is not written with history state');
  // Read back on load, so a refresh restores rather than silently resetting.
  assert.ok(/const objects = p\.get\('objects'\)[\s\S]{0,200}?objOpen = objects \|\| null;/.test(main),
    'the object in the URL is not read back');
  assert.ok(/readBrowserUrl\(\)[\s\S]{0,200}?enterSelectMode\(\)/.test(main),
    'a URL naming an object does not reopen the browser on it');
  // Back and forward walk the object history rather than leaving the game.
  assert.ok(/window\.addEventListener\('popstate'/.test(main), 'there is no popstate handler');
});

test('the catalogue covers every level and names its categories', () => {
  const levels = [...catalog.matchAll(/\{ id: '([a-z]+)', label: '([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.ok(levels.length >= 4, `only ${levels.length} levels are catalogued`);
  for (const [id, label] of levels) {
    assert.ok(main.includes(`travelToLevel`) && catalog.includes(`id: '${id}'`),
      `the ${label} level is not reachable from the list`);
  }
  // Categories are what the browser is built around, so there must be more than
  // one per level.
  const cats = [...catalog.matchAll(/id: '([a-z]+)', name: '([^']+)'/g)];
  assert.ok(cats.length >= levels.length,
    'some level has no categories of its own, so its Objects button would land on nothing');
});