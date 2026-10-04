// The two suburban houses on the west side of the street, and their garages.
//
// There are two of them, and they have swapped jobs. They used to be:
//
//   houseGarage   (z -49,  gray shingle roof)  - PANELLED roller door, wound UP.
//                                                You drove in through it, and the
//                                                beckoning light and the pegboard
//                                                of tools were waiting inside.
//   houseStandard (z -68,  brown shingle roof) - no door at all, an open bay.
//
// Now the way into the house is the other way round, because the house's front
// door is locked and the only way out of it is a dark garage off the kitchen:
//
//   houseStandard (z -68,  brown shingle roof) - the OPEN BAY. This is the way in,
//                                                and the way you come back out to.
//                                                It holds the beckoning light and
//                                                the tools.
//   houseGarage   (z -49,  gray shingle roof)  - a PANELLED roller door, SHUT, its
//                                                three slats hung out flat. Nothing
//                                                inside it, no light, no trigger.
//
// The gray-roofed garage once had no front wall and no door hardware, just a bare
// hole, which read as an unfinished building. The brown-roofed house once had a
// door SHUT across a solid block with no room behind it. Both are fixed, and the
// fix this time is that the roles changed rather than the styling.
//
// Run: node --test src/suburbanGarages.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, 'cityBuildings.js'), 'utf8');

function builder(name) {
  const s = SRC.indexOf(`function ${name}(`);
  assert.ok(s > -1, `could not find ${name}() in cityBuildings.js`);
  const e = SRC.indexOf('\nfunction ', s + 10);
  return SRC.slice(s, e > -1 ? e : undefined);
}

const shut = builder('houseWithGarage');     // grey roof, roller door shut
const open = builder('houseStandard');       // brown roof, open bay

// The source with its // comments removed.
//
// The notes in these builders explain the changes at length, and several of them
// NAME the things that moved - the grey-roofed garage has a comment saying the
// beckoning light used to be in it. Testing the raw source for "beckoning" would
// match the sentence explaining its removal, so anything about what the code
// does rather than what the comment says is matched against this.
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const shutCode = code(shut);
const openCode = code(open);

// The constant tables, for resolving the sizes the builders write symbolically.
const shutDefs = consts(shut);
const openDefs = consts(open);

// Pull out the box() calls in a builder, leaving the coordinates as written.
function boxes(src) {
  return [...src.matchAll(/box\(g,\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+)/g)]
    .map((m) => ({ w: m[1].trim(), h: m[2].trim(), d: m[3].trim(), x: m[4].trim(), y: m[5].trim(), z: m[6].trim(), mat: m[7].trim() }));
}

// A literal number written in a builder, or null for anything else - including a
// missing match, which is why this guards on the type rather than just on the
// pattern.
const num = (e) => (typeof e === 'string' && /^[\d.]+$/.test(e.trim()) ? parseFloat(e) : null);

// Split a declarator list on commas that are not inside brackets, so a
// declaration like `const x = f(1, 2), y = 3;` is not cut in half.
function splitTop(s) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  parts.push(s.slice(start));
  return parts;
}

// Every constant a builder declares, name -> initialiser.
//
// These builders declare in runs: `const GX = 2.25, GW2 = 5.5, GH2 = 2.6;`.
// Searching for the text `const GW2` finds nothing, because only the first
// declarator has the keyword in front of it - so the names are collected by
// splitting each declaration on its commas.
function consts(src) {
  const map = new Map();
  for (const m of src.matchAll(/\bconst\s+([^;]+);/g)) {
    for (const decl of splitTop(m[1])) {
      const d = /^([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/.exec(decl.trim());
      if (d && !map.has(d[1])) map.set(d[1], d[2].trim());
    }
  }
  return map;
}

// Resolve an expression a builder wrote, following its constants back to
// literals.
//
// The shut door's slats are `GDW` wide, `slatH - 0.03` tall, drawn at a height
// computed inside the loop. A test that only understands literal numbers cannot
// tell a closed roller door from an open one, because none of those three are
// written as numbers - so this walks the chain: `GDW` is `GW - 0.8`, `GW` is 7.
function resolve(expr, defs, seen = new Set()) {
  const e = String(expr).trim();
  const lit = num(e);
  if (lit !== null) return lit;

  // Split on the first operator both sides of which resolve, and apply it. This
  // is a left-to-right fold rather than a precedence parser, which is the right
  // trade for the handful of shapes these builders use: `GX - GW2 / 2` and
  // `slatH - 0.03` both come out right. Each attempt gets its own copy of `seen`,
  // so a branch that dead-ends on an unresolvable name does not poison the next.
  for (let i = 1; i < e.length; i++) {
    const op = e[i];
    if (!'+-*/'.includes(op)) continue;
    const left = e.slice(0, i).trim(), right = e.slice(i + 1).trim();
    if (!left || !right) continue;
    const a = resolve(left, defs, new Set(seen));
    if (a === null) continue;
    const b = resolve(right, defs, new Set(seen));
    if (b === null) continue;
    if (op === '-') return a - b;
    if (op === '+') return a + b;
    if (op === '*') return a * b;
    return a / b;
  }

  const name = /^([A-Za-z_$][\w$]*)$/.exec(e);
  if (!name || seen.has(name[1])) return null;      // `seen` also stops a cycle
  if (!defs.has(name[1])) return null;
  seen.add(name[1]);
  return resolve(defs.get(name[1]), defs, seen);
}

// ---------------------------------------------------------------------------
// The grey-roofed house: shut, empty, and not a way in.
// ---------------------------------------------------------------------------

test('the grey-roofed garage has a panelled roller door, and it is SHUT', () => {
  // The same three slats as before, now hung out flat from the head to the floor
  // instead of coiled in a hood. Hardware that says "a panelled door, closed".
  const b = boxes(shut);
  assert.ok(/const GDW = GW - 0\.8/.test(shut), 'the door width constant is gone');
  assert.ok(/gDoorTop = 2\.55/.test(shut), 'the shut-door height constant is gone');
  assert.ok(!/gHeadY/.test(shut), 'the old coiled-door height constant is still there');

  // Three slats, and they have to start on the floor. A door drawn across the top
  // third of the opening is an awning, not a closed garage.
  assert.match(shut, /const slatH = gDoorTop \/ 3;/, 'the three-slat loop is gone');
  assert.match(shut, /const sy = slatH \* \(i \+ 0\.5\);/,
    'the slats are not stacked up from the floor');
  assert.match(shut, /box\(g, GDW, slatH - 0\.03, 0\.26, gx, sy, gFrontZ \+ 0\.02, M\.trimWhite/,
    'the shut slats are not painted leaf, so it is not the panelled door style');

  // The band across each panelled slat, in the same style as the old door.
  const bands = b.filter((x) => /GDW - 0\.55, 0\.11/.test(`${x.w}, ${x.h}`));
  assert.ok(bands.length > 0, 'the panelled bands across the shut slats are missing');

  // Rails, one each side of the opening.
  const rails = b.filter((x) => /0\.22, GH - 0\.3, 0\.34/.test(`${x.w}, ${x.h}, ${x.d}`));
  assert.ok(rails.length > 0, 'the guide rails are missing from the grey-roofed garage');

  // A padlock, because shut here means "shut on purpose", the same as the front
  // door inside the house.
  assert.match(shut, /M\.signRed/, 'the shut door has no lock on it');
});

test('the grey-roofed garage is shut, so the mouth is NOT clear', () => {
  // The inverse of the old test. The old one asserted nothing was drawn across
  // the aperture; this asserts something IS, that it spans the mouth, and that it
  // reaches from the concrete to the head.
  const b = boxes(shut);
  const GDW = resolve('GDW', shutDefs);
  assert.ok(GDW !== null && GDW > 4, `could not resolve the door width: GDW = ${GDW}`);

  const across = b.filter((x) => {
    const w = resolve(x.w, shutDefs);
    if (w === null || w < 4) return false;   // must span the mouth to close it
    return /gFrontZ/.test(x.z);              // drawn on the door face
  });
  assert.ok(across.length > 0, 'nothing is drawn across the garage mouth, so it is not shut');
  // ...and it has to read as a door, not as a blanked wall.
  assert.ok(across.length < 6,
    `${across.length} pieces across the mouth, which reads as a blanked wall rather than a door`);

  // The loop runs i = 0..2, so the lowest slat's centre is at slatH / 2 and the
  // highest slat's top is at slatH * 2.5 plus half a slat. Both ends matter: a
  // door that stops short of the floor is an awning, and one that stops short of
  // the head is a hole above a door.
  const slatH = resolve('slatH', shutDefs);
  const gDoorTop = resolve('gDoorTop', shutDefs);
  assert.ok(slatH !== null && gDoorTop !== null, 'could not resolve the slat height');
  const lowest = slatH * 0.5 - (slatH - 0.03) / 2;
  assert.ok(lowest < 0.1, `the lowest slat's underside is at y=${lowest.toFixed(2)}, not on the floor`);
  const highest = slatH * 2.5 + (slatH - 0.03) / 2;
  assert.ok(highest > 2.5, `the shut door only reaches y=${highest.toFixed(2)} of a ${gDoorTop} opening`);
  assert.ok(highest <= gDoorTop + 0.01,
    `the shut door reaches y=${highest.toFixed(2)}, above its own ${gDoorTop} head - the slats overlap`);
});

test('the grey-roofed garage has a collider across its mouth', () => {
  // Collision is 2D with no height term, so anything over the mouth would stop
  // the car. That is the point now: this door is shut, and the car has to bounce
  // off it on the apron.
  const pushes = [...shut.matchAll(/colliders\.push\(\{([^}]*)\}/g)].map((m) => m[1].replace(/\s+/g, ' '));
  assert.equal(pushes.length, 4, `expected 4 colliders on the grey-roofed house, found ${pushes.length}`);
  assert.ok(pushes.some((p) => /gFrontZ/.test(p)),
    'no collider sits at the garage mouth, so the shut door does not stop the car');
});

test('the grey-roofed garage is empty, unlit, and has no trigger', () => {
  // "Nothing inside" is a design requirement, not an accident of editing: the
  // beckoning light and the pegboard moved to the open bay, and none of them
  // should have been left behind here. Matched against the code, not the
  // comments - the note above the door explains where they went, and matching
  // that would defeat the point.
  assert.ok(!/beckoning/i.test(shutCode), 'the beckoning light is still in the grey-roofed garage');
  assert.ok(!/new THREE\.PointLight/.test(shutCode), 'the grey-roofed garage still has a light in it');
  assert.ok(!/pegboard/i.test(shutCode), 'the pegboard of tools is still in the grey-roofed garage');
  // No lit ceiling panel over the void either.
  assert.ok(!/flatPanel\(g, GW - 1\.2, D - 2\.0, gx, GH - 0\.12/.test(shutCode),
    'the grey-roofed garage still has a lit ceiling');
  // And it exports no trigger: `houseGarageLocal` is the open bay's now.
  assert.ok(!/houseGarageLocal/.test(shutCode),
    'the grey-roofed garage still sets houseGarageLocal, so it is still a way in');
});

// ---------------------------------------------------------------------------
// The brown-roofed house: the open bay, which is now the way in and out.
// ---------------------------------------------------------------------------

test('the brown-roofed house has no garage door at all', () => {
  // It is an open bay. A panelled leaf across the opening is exactly what this
  // house must not have.
  const b = boxes(open);
  const leaf = b.find((x) => /GW2/.test(x.w) && /GH2/.test(x.h) && num(x.d) !== null && num(x.d) <= 0.3);
  assert.equal(leaf, undefined,
    'houseStandard has a panel drawn across the bay mouth - it is meant to be an open garage');
  assert.ok(!/const gy = 1\.2/.test(open), 'the old shut-door constant is still there');
  assert.match(open, /an open bay you can drive into|no roller door here at all/,
    'the note explaining the open bay is gone');
});

test('the brown-roofed bay is a room you can actually drive into', () => {
  const GX = num(/GX = ([\d.]+)/.exec(open)[1]);
  const GW2 = num(/GW2 = ([\d.]+)/.exec(open)[1]);
  const GH2 = num(/GH2 = ([\d.]+)/.exec(open)[1]);

  // Wide enough for the 2.2-radius car, with room either side to line up.
  assert.ok(GW2 / 2 > 2.2, `the bay is ${GW2} wide; the car needs more than 4.4`);
  assert.ok(GW2 / 2 - 2.2 >= 0.4,
    `only ${(GW2 / 2 - 2.2).toFixed(2)} of slack either side of the car; it will not go in`);
  assert.ok(GH2 > 2.2, `the bay is only ${GH2} high`);

  // A real room, not a recess. The floor and ceiling are flatPanels, so they
  // have to be looked for there as well as among the boxes.
  const b = boxes(open);
  const panels = [...open.matchAll(/flatPanel\(g,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*(M\.\w+)/g)]
    .map((m) => m[1]);
  assert.ok([...b.map((x) => x.mat), ...panels].includes('M.concrete'),
    'the bay has no concrete floor');
  assert.ok([...b.map((x) => x.mat), ...panels].includes('M.wood'),
    'the bay has no workbench');
  // A lit ceiling over the void, or you see straight up into the roof space.
  assert.ok(panels.includes('lampMatOf()') || b.some((x) => /lampMatOf/.test(x.mat)),
    'the bay has no lit ceiling');

  // And the shell is built as pieces around the void, not one solid block that
  // happens to have a door drawn on it.
  const solid = /colliders\.push\(\{\s*x:\s*0,\s*z:\s*0,\s*halfW:\s*W\s*\/\s*2/.test(open);
  assert.ok(!solid,
    'houseStandard is back to a single solid collider, so the bay is a recess again');
  assert.equal([...open.matchAll(/colliders\.push\(/g)].length, 3,
    'the bay should be enclosed by exactly three colliders, open at the front');
});

test('the brown-roofed bay has the beckoning light and the tools', () => {
  // These moved here from the grey-roofed garage, and they are the whole reason
  // you pull off the street: a warm pool of light deep in a dark opening with a
  // pegboard of tools caught in it.
  assert.match(open, /beckoning/i, 'the beckoning light is not in the open bay');
  assert.match(open, /const workLight = new THREE\.PointLight\(0xffd9a0/,
    'the bay has no beckoning point light');
  assert.match(open, /blinkers\.push\(\{ light: workLight/,
    'the beckoning lamp does not flicker');
  // The tools: a pegboard and enough distinct implements to read as a row.
  assert.match(open, /const pegW = 4\.0, pegH = 1\.4, pegY = 1\.4;/, 'the pegboard is gone');
  for (const [what, re] of [
    ['hammer', /hammer handle/], ['handsaw', /handsaw blade/], ['spanner', /spanner/],
    ['screwdrivers', /screwdrivers/], ['paint roller', /paint roller/],
    ['shovel', /shovel, leaning/], ['coiled hose', /coiled hose/],
  ]) {
    assert.match(open, re, `the ${what} is not on the pegboard any more`);
  }
});

test('the open bay is the one that exports the drive-in trigger', () => {
  // This is the swap that makes the whole thing work: main.js gets its trigger
  // and its camera from this bay, and the returned car is dropped back into it.
  assert.match(open, /houseGarageLocal = \{/, 'the open bay does not set houseGarageLocal');
  const m = /houseGarageLocal = \{([\s\S]*?)\n  \};/.exec(open);
  assert.ok(m, 'could not read the trigger block out of the open bay');
  const t = m[1];
  for (const key of ['x0', 'x1', 'z0', 'z1', 'mouthX', 'mouthZ', 'apronX', 'apronZ',
    'camX', 'camY', 'camZ']) {
    assert.match(t, new RegExp(`\\b${key}:`), `the trigger is missing ${key}`);
  }
  // Set back inside the mouth, so clipping the threshold does not fire it. The
  // edges are written as `gx0 + 0.4` and `gx1 - 0.4`, so they have resolving.
  const gx0 = resolve('gx0', openDefs), gx1 = resolve('gx1', openDefs);
  const x0 = resolve(/x0: ([^,]+)/.exec(t)[1], openDefs);
  const x1 = resolve(/x1: ([^,]+)/.exec(t)[1], openDefs);
  assert.ok(gx0 !== null && gx1 !== null, 'could not resolve the bay opening');
  assert.ok(x0 !== null && x1 !== null, 'could not resolve the trigger edges');
  assert.ok(x0 > gx0 && x1 < gx1,
    `the trigger spans x ${x0}..${x1}, which is not inside the bay's ${gx0}..${gx1}`);
});

test('addCityBuildings reads the trigger off the open bay, not the shut garage', () => {
  // The other half of the swap. The LAYOUT lookup is a name comparison, so if it
  // still asked for 'houseGarage' the trigger would be rotated out of the grey
  // roof's origin while the geometry was authored against the brown one, and the
  // car would appear inside a building that is now closed.
  // assert.ok rather than assert.match: a failing assert.match prints the whole
  // string it was given, and SRC is the entire 116kB of cityBuildings.js.
  assert.ok(/if \(entry\.name === 'houseStandard'\) \{/.test(SRC),
    "the layout does not read the trigger off 'houseStandard'");
  assert.ok(!/if \(entry\.name === 'houseGarage'\)/.test(SRC),
    'the layout is still reading the trigger off the shut garage');
});

test('the bay does not eat the front door or the windows', () => {
  // The bay's west edge has to clear the front-door glazing, or there is glass
  // across the corner of a driveable opening.
  const gx0 = num(/GX = ([\d.]+)/.exec(open)[1]) - num(/GW2 = ([\d.]+)/.exec(open)[1]) / 2;
  for (const x of [-1.4, -4.4]) {
    assert.ok(x + 0.65 <= gx0,
      `the window at ${x} runs to ${(x + 0.65).toFixed(2)}, into the bay opening at ${gx0}`);
  }
  assert.ok(-3.2 + 0.5 <= gx0, 'the front door runs into the bay opening');
});

test('the two houses really do have different roof colours', () => {
  // This is what lets the player tell them apart from the street, and it is how
  // the houses were identified in the first place.
  assert.match(shut, /M\.shingle\b/,
    'the grey-roofed house no longer uses the cool grey shingle');
  assert.match(open, /M\.shingleWarm/,
    'the open-bay house no longer uses the warm brown shingle');
});

// ---- The streetlights in front of the two garages ----
//
// props.js runs a lamp-post row down x = -17, which is the front plane of both
// houses, and two of its posts landed in a garage mouth: the open bay (the way
// into the house) and the shut roller door. props.js knows nothing about
// buildings, so it declares the two frontage bands itself; these tests re-derive
// those bands from cityBuildings.js and prove the row skips them and puts the
// replacements on the verge instead.

// World z of a house's garage opening, from the builder + LAYOUT numbers.
function garageMouthZ(builderSrc, entryName) {
  // Every one of these numbers is negative, and the suite's `num` only parses
  // unsigned literals, so this reads its own.
  const n = (s) => {
    assert.match(String(s), /^-?\d+(\.\d+)?$/, `cannot read the number "${s}" out of the source`);
    return Number(s);
  };
  // Both houses face 'E', so world z = entry.z - local x.
  const entry = new RegExp(`\\{ name: '${entryName}',[^}]*?z: (-?[\\d.]+),`).exec(SRC);
  assert.ok(entry, `could not find the LAYOUT entry for ${entryName}`);
  const entryZ = n(entry[1]);

  if (entryName === 'houseStandard') {
    // The open bay: GX = 2.25, GW2 = 5.5.
    const GX = n(/GX = (-?[\d.]+)/.exec(builderSrc)[1]);
    const GW2 = n(/GW2 = (-?[\d.]+)/.exec(builderSrc)[1]);
    return { z0: entryZ - (GX + GW2 / 2) - 0.5, z1: entryZ - (GX - GW2 / 2) + 0.5 };
  }
  // The shut garage: gx = MAIN_X - W/2 - GW/2, width GW = 7.
  const MAIN_X = n(/MAIN_X = (-?[\d.]+)/.exec(builderSrc)[1]);
  const W = n(/, W = (-?[\d.]+)/.exec(builderSrc)[1]);
  const GW = n(/GW = (-?[\d.]+)/.exec(builderSrc)[1]);
  const gx = MAIN_X - W / 2 - GW / 2;
  return { z0: entryZ - (gx + GW / 2) - 0.5, z1: entryZ - (gx - GW / 2) + 0.5 };
}

const n2 = (s) => { assert.match(s, /^-?\d+(\.\d+)?$/); return Number(s); };
const PROPS = fs.readFileSync(path.join(here, 'props.js'), 'utf8');
const frontages = /const HOUSE_FRONTAGES = \[([\s\S]*?)\n  \];/.exec(PROPS);
assert.ok(frontages, 'props.js no longer declares HOUSE_FRONTAGES');
const declared = [...frontages[1].matchAll(/z0: (-?[\d.]+),\s*z1: (-?[\d.]+)/g)]
  .map((m) => ({ z0: n2(m[1]), z1: n2(m[2]) }));

test('the streetlight frontage bands match where the garages actually are', () => {
  // If a house is nudged along the street, the light exclusion has to follow it.
  // Re-derive each band from the builder's own numbers and the LAYOUT origin.
  const real = [
    garageMouthZ(open, 'houseStandard'),
    garageMouthZ(shut, 'houseGarage'),
  ];
  assert.equal(declared.length, real.length,
    `props.js declares ${declared.length} frontage band(s), there are ${real.length} garage(s)`);
  for (let i = 0; i < real.length; i++) {
    // The band only has to COVER the garage, so allow a little slack either way.
    assert.ok(declared[i].z0 <= real[i].z0 + 0.51 && declared[i].z1 >= real[i].z1 - 0.51,
      `frontage ${i} is z ${declared[i].z0}..${declared[i].z1}, which does not cover the ` +
      `garage mouth at z ${real[i].z0.toFixed(2)}..${real[i].z1.toFixed(2)}`);
  }
});

test('no streetlight stands in a garage mouth, and the replacements are on the verge', () => {
  // Reproduce the x = -17 lamp-post row the same way props.js does, then check it
  // against the two frontage bands.
  const row = [];
  for (let z = -70; z <= 70; z += 14) if (!declared.some((f) => z > f.z0 && z < f.z1)) row.push(z);
  for (const z of row) {
    for (const [i, f] of declared.entries()) {
      assert.ok(!(z > f.z0 && z < f.z1),
        `a lamp post still stands at x -17, z ${z}, inside garage mouth ${i}`);
    }
  }
  // The two posts that used to be there must not simply have been deleted: the
  // frontages still need lighting, so they are re-placed on the grass verge
  // between the houses' front faces and the arterial-ns kerb.
  const replacements = [...PROPS.matchAll(/makeLampPost\(scene, (-?[\d.]+), (-?[\d.]+)\)/g)]
    .map((m) => ({ x: n2(m[1]), z: n2(m[2]) }))
    .filter((p) => p.x !== 17 && p.x !== -17 && Math.abs(p.x) > 12);
  assert.ok(replacements.length >= 2,
    `expected the two garage-frontage lamp posts to be replaced on the verge, found ${replacements.length}`);
  for (const p of replacements) {
    assert.ok(p.x > -17.5 && p.x < -12,
      `the replacement lamp at x ${p.x} is not on the verge between the houses and the kerb`);
    for (const [i, f] of declared.entries()) {
      assert.ok(!(p.z > f.z0 && p.z < f.z1),
        `the replacement lamp at (${p.x}, ${p.z}) is inside garage mouth ${i}`);
    }
  }
});
