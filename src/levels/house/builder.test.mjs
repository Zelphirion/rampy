// Guards on the house builder's source. Run: node --test src/levels/house/builder.test.mjs
//
// These are checks on the builder that a type-checker and `node --check` both
// pass straight over, because they only fail once the function actually runs:
//
//   - A local that shadows a module-level helper. `addHouse` used to destructure
//     `wall` out of HOUSE as a wall thickness, which shadowed the module-level
//     `function wall(...)` that builds wall meshes. Every call became `3(...)`,
//     so the house threw "wall is not a function" the first time it was built —
//     after the whole city had already loaded. Static analysis cannot see it;
//     a source scan can.
//   - Mojibake. Rewriting these files through a Latin-1 round-trip silently turns
//     every em dash into three wrong characters — an a-circumflex, a euro sign and
//     a right double quote — in the comments. Harmless to the game, but it means
//     the file has been through a tool that may have done worse elsewhere. A
//     round-trip through a codepage that cannot represent the character is worse
//     still: it does not garble, it destroys, leaving U+FFFD behind with no way
//     back. Both are checked for below, across all of src/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, 'index.js'), 'utf8');

const builderStart = SRC.indexOf('export async function addHouse');
const builder = SRC.slice(builderStart);

test('addHouse exists, so the scan below is looking at a real function', () => {
  assert.ok(builderStart > -1, 'could not find addHouse in index.js');
  assert.ok(builder.length > 1000, 'addHouse looks truncated');
});

test('no local inside addHouse shadows a module-level helper function', () => {
  const helpers = new Set([...SRC.matchAll(/^function (\w+)/gm)].map((m) => m[1]));
  assert.ok(helpers.size > 10, 'failed to find the module-level helpers to check against');

  // Walk each `const`/`let`/`var` line and pull out the names it binds. Object
  // and array destructuring bind the names inside the braces, which is exactly
  // the form that caused this, so those are unpacked rather than skipped.
  const lines = builder.split(/\r?\n/);
  const clashes = [];
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (!/\b(const|let|var)\b/.test(code)) return;
    let decl = code.slice(code.search(/\b(const|let|var)\b/));
    decl = decl
      .replace(/\b(const|let|var)\b/g, ' ')
      .replace(/'[^']*'/g, "''")
      .replace(/`[^`]*`/g, '``');
    const names = [];
    // destructuring groups: take the identifiers inside them
    for (const m of decl.matchAll(/\{([^{}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const name = part.split(':').pop().split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
      }
    }
    // plain single-name bindings: `const foo =` / `let bar, baz =`
    const flat = decl.replace(/\{[^{}]*\}/g, ' ');
    const head = flat.split('=')[0];
    for (const tok of head.split(',')) {
      const name = tok.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
    }
    for (const n of names) {
      if (helpers.has(n)) clashes.push(`index.js line ~${builderStart ? i + 1 : i + 1}: "${n}" in  ${code.trim().slice(0, 70)}`);
    }
  });

  assert.deepEqual(clashes, [], 'addHouse shadows a module-level helper:\n  ' + clashes.join('\n  '));
});

test('the shell thickness local is not named after the wall builder', () => {
  // A narrower, more readable restatement of the check above for the one case
  // that actually bit, so the failure message points straight at the fix.
  assert.match(builder, /const\s+shellT\s*=\s*HOUSE\.wall/,
    'expected the shell thickness to be read as HOUSE.wall into a differently-named local');
});

test('no mojibake or lost characters anywhere in the source tree', () => {
  // Two distinct failures, and the version of this test that came before it caught
  // neither of them - which is how both got into the tree in the first place.
  //
  //   1. Double-encoded UTF-8. An em dash (bytes E2 80 94) decoded as Windows-1252
  //      and re-encoded as UTF-8 comes back as three characters: a-circumflex,
  //      euro sign, right double quote. The old check looked for a-circumflex
  //      followed by a character in U+0080..U+00BF - but the euro sign is U+20AC,
  //      so every real instance of the damage failed to match.
  //   2. Destroyed characters. Round-tripping through a codepage that cannot
  //      represent a character does not garble it, it loses it, leaving U+FFFD.
  //      There is no pattern to recognise and no way back to the original, so the
  //      only real defence is not to write the file that way.
  //
  // Both are silent, both survive `node --check`, and both mean the file was
  // rewritten through the wrong encoding by a shell tool. That is worth a test
  // precisely because it is invisible: you find out when a human reads the
  // comment, by which point it has usually spread to the next file edited.
  //
  // Scanned across every file under src/, not just this module. The damage is not
  // a property of the house builder - it is a property of whichever tool last
  // wrote the file, and that has been every module in the project.
  //
  // Deliberately scoped to src/. The repository root holds three committed debug
  // scratch copies of cityBuildings.js (cb-under-test.mjs, cb-under-test2.mjs,
  // undertest-cityBuildings.js) that carry the same double-encoded em dashes, and
  // they predate any of this. Sweeping them in would mean either deleting files
  // nobody asked about or carrying an exemption list, and both are worse than
  // leaving three stale artefacts alone until they are dealt with deliberately.
  const srcRoot = path.join(here, '..', '..');
  const skip = new Set(['node_modules', '.git', 'coverage']);
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      // `__`-prefixed files are scratch: the furniture audit writes a copy of the
      // builder here and deletes it again on exit, so a scan that walks the tree
      // while another test file is mid-run reads a file that has just been
      // unlinked and dies with ENOENT. That happened. Node's test runner runs
      // each file in its own process but in PARALLEL, so this is a real race and
      // not a theoretical one.
      if (entry.name.startsWith('__')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|css|html|json)$/.test(entry.name)) files.push(full);
    }
  })(srcRoot);

  // Guard the guard: a tiny file list means the walk silently found nothing and
  // this test would pass without having read a single file.
  assert.ok(files.length > 50, `only found ${files.length} source files to scan`);

  // A lead character in U+00C2/U+00C3/U+00E2 followed by one that can only come
  // from a mis-decode, rather than the accented Latin letters they also are.
  // Written with escapes on purpose: spelling these out literally would put the
  // very patterns being searched for into this file, and the test scans itself.
  const GARBLED = new RegExp('[\\u00C2\\u00C3\\u00E2][\\u0080-\\u00BF\\u20AC\\u2018\\u2019\\u201C\\u201D]');
  const LOST = new RegExp('\\uFFFD', 'g');
  const problems = [];
  for (const file of files) {
    const rel = path.relative(srcRoot, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    const lost = text.match(LOST);
    if (lost) problems.push(`${rel}: ${lost.length} lost character(s)`);
    const m = GARBLED.exec(text);
    if (m) {
      const line = text.slice(0, m.index).split(/\r?\n/).length;
      problems.push(`${rel}:${line}: mis-decoded "${m[0]}"`);
    }
  }
  assert.deepEqual(problems, [],
    'these files look like they were rewritten through the wrong text encoding:\n  ' +
    problems.join('\n  '));
});

test('the module is valid ESM syntax', async () => {
  // Cheap guard that the file has not been left half-edited.
  assert.match(SRC, /^import \* as THREE from 'https:/m, 'the THREE import is missing');
  assert.match(SRC, /^import \{[^}]+\} from '\.\/layout\.js';$/m, 'the layout import is missing');
});
