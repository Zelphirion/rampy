// The substation at minimap (37, 195) is the city's mains switch: the whole
// yard is armed, and a heavy ride touching ANY piece of kit detonates it -- the
// arc-flash shower, the city-wide blackout, and every piece of gear blasted UP,
// outward and scattered around the yard.
//
// The old yard was ringed by five collider runs with only a car-width gate, and
// collider blocking is a 2D rect test with no height term, so that ring sealed
// the pen: a heavy ride could never reach the transformer to smash it. The
// fence is now a purpose-built heavy knock-down (smashFence): each section
// bundles its two posts, its top rail and its wire into one heavyweight
// knockable, so a heavy car takes the whole fence down -- and each section also
// reports a GATE collider, so to anyone who CANNOT knock it down (a light car
// carries no `heavy` flag) the fence is a real, solid wall. Everything inside
// the lines is reserved for the heaviest rides: knockAt() skips any prop whose
// smashOnlyBy flag the vehicle object does not carry, and only the steamroller,
// monster truck and fire engine carry `heavy`.
//
// The demolition deliberately does NOT use the beach sandcastle's slow inward
// fold: touching any armed sensor fires the blast (planSubstationBlast /
// startSubstationBlast / advanceSubstationBlast), which shoves every loose piece
// up and out from the transformer epicentre to scatter around the gravel yard.
//
// Run: node --test src/substation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, 'cityBuildings.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const PROPS = fs.readFileSync(path.join(here, 'props.js'), 'utf8');

// Isolate the substation() builder.
const fnStart = SRC.indexOf('function substation(');
assert.ok(fnStart > -1, 'could not find substation() in cityBuildings.js');
const fnEnd = SRC.indexOf('\nfunction ', fnStart + 10);
const fn = SRC.slice(fnStart, fnEnd > -1 ? fnEnd : undefined);

// ...and the bespoke fence builder it uses.
const fenceStart = SRC.indexOf('function smashFence(');
assert.ok(fenceStart > -1, 'could not find smashFence() in cityBuildings.js');
const fenceEnd = SRC.indexOf('\nfunction ', fenceStart + 10);
const fenceFn = SRC.slice(fenceStart, fenceEnd > -1 ? fenceEnd : undefined);

function colliders() {
  return [...fn.matchAll(/colliders\.push\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
}

// The substation is 14 x 12, built from W and D in its own source.
const scope = { W: 14, D: 12 };
const num = (expr) => new Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope));

function field(body, name) {
  const m = body.match(new RegExp(`${name}:\\s*([^,}]+)`));
  assert.ok(m, `collider has no ${name}: ${body}`);
  return num(m[1]);
}

test('the fence is a gate: a solid wall to light cars, a knock-down for heavy cars', () => {
  // The real bug history: the old perimeter colliders sealed the pen behind a
  // car-width gate (collider blocking has no height term), so a heavy ride could
  // never reach the gear. The fence is now a heavy knock-down -- five runs of
  // smashFence(), never the old chainFence() -- and WHILE a section stands it is
  // a real collider to anyone who cannot knock it down.
  const fenceCalls = [...fn.matchAll(/smashFence\(g, /g)];
  assert.equal(fenceCalls.length, 5, `expected 5 fence runs, found ${fenceCalls.length}`);
  assert.ok(!/chainFence\(/.test(fn), 'the substation still uses the old chainFence()');
  // No run of the old perimeter survives as a plain collider.
  const perim = colliders().filter((b) => /halfW:\s*T,|halfD:\s*T,/.test(b));
  assert.equal(perim.length, 0, `the old perimeter colliders still wall the yard: ${perim.join(' | ')}`);
  for (const body of colliders()) {
    const fullW = /halfW:\s*W\s*\/\s*2/.test(body);
    const fullD = /halfD:\s*D\s*\/\s*2/.test(body);
    assert.ok(!(fullW && fullD),
      `a collider spans the full yard width AND depth, which seals the enclosure: ${body}`);
  }
  // smashFence() returns a GATE collider spec per section (the knockable itself,
  // noRoof so the fence is never a rooftop), and substation() hands them all to
  // the world.
  assert.match(fenceFn, /cols\.push\(\{/,
    'smashFence() never reports a collider spec for its sections');
  assert.match(fenceFn, /gate,/,
    'the fence sections are not gated to their knockable');
  assert.match(fenceFn, /noRoof: true/,
    'the fence colliders are not marked noRoof, so they could act as rooftops');
  const pushes = [...fn.matchAll(/colliders\.push\(fc\)/g)];
  assert.equal(pushes.length, 5,
    `substation() does not hand every fence run's gate colliders to the world: found ${pushes.length}`);
});

test('every part of the fence is knockable by heavy cars', () => {
  // The rebuilt fence must move as a whole: posts, rails and wire together.
  // smashFence() puts all of them in one group per section and registers that
  // group as a heavy-only knockable.
  const knock = fenceFn.match(/addKnockable\((\w+),[\s\S]*?\);/);
  assert.ok(knock, 'smashFence() never registers a knockable');
  assert.match(knock[0], /smashOnlyBy:\s*'heavy'/,
    'the fence is not restricted to the heavy vehicles');
  const group = knock[1];
  // Each section must carry the posts, the rail and the wire, so they all fall.
  assert.match(fenceFn, /for \(const s of \[-0\.5, 0\.5\]\) cyl\(/,
    'the fence sections have no posts');
  assert.match(fenceFn, /cyl\([\s\S]*?rail\.rotation\.z = Math\.PI \/ 2/,
    'the fence sections have no top rail');
  assert.match(fenceFn, /new THREE\.Mesh\(new THREE\.PlaneGeometry\(segLen, h\)/,
    'the fence sections have no wire panel');
  // ...and they must all be children of the knockable group, not added to the
  // run's parent, or the bars would stay put again.
  assert.match(fenceFn, new RegExp(`cyl\\(${group},`), 'the posts are not inside the knockable section');
  assert.match(fenceFn, new RegExp(`${group}\\.add\\(mesh\\)`), 'the wire is not inside the knockable section');
});

test('a downed fence section frees itself everywhere the game checks solids', () => {
  // The gate collider is live only while its knockable is 'standing'. The three
  // places the game treats colliders as real solids must all honour that, or the
  // monster truck bulldozes the fence over and STILL can't drive through it (the
  // blocking test, the anti-stuck pass, and collider placement).
  assert.match(MAIN, /!\(collider\.gate && collider\.gate\.state !== 'standing'\)/,
    'isPositionBlocked does not free a knocked-over fence section');
  const unstuck = fs.readFileSync(path.join(here, 'modules/unstick.js'), 'utf8');
  assert.match(unstuck, /if \(c\.gate && c\.gate\.state !== 'standing'\) continue;/,
    'the anti-stuck solver still treats a knocked-over fence section as solid');
  assert.match(SRC, /if \(c\.gate\) out\.gate = c\.gate;/,
    'placeCollider drops the gate flag, so the world never sees the fence collider');
  assert.match(SRC, /if \(c\.noRoof\) out\.noRoof = true;/,
    'placeCollider drops noRoof, so a fence could be ridden as a rooftop');
});

test('the chain fence gate is left open, so you can drive in', () => {
  // smashFence() splits the +Z run into two pieces around a 2.4-wide gap at
  // x in [-1.2, 1.2]. That gap is now the way the car reaches the gear, and
  // nothing may bridge it.
  const gate = [...fn.matchAll(/smashFence\(g,\s*([^,]+),\s*D\s*\/\s*2,\s*([^,]+),\s*D\s*\/\s*2,\s*[^)]+\)/g)];
  assert.equal(gate.length, 2, 'the +Z fence is not split into two gate runs');
  const spans = gate.map((m) => [num(m[1].trim()), num(m[2].trim())]).sort((a, b) => a[0] - b[0]);
  assert.ok(spans[0][1] < 0 && spans[1][0] > 0,
    `the gate runs do not straddle x = 0 (${JSON.stringify(spans)})`);
  const gapLo = spans[0][1], gapHi = spans[1][0];
  assert.ok(gapHi - gapLo >= 2.4 - 1e-9, `the gate is only ${(gapHi - gapLo).toFixed(2)} wide`);
  // And nothing in the collider list blocks that gap.
  const onGateLine = colliders().filter((b) => /z:\s*D\s*\/\s*2/.test(b));
  assert.equal(onGateLine.length, 0, 'a collider still closes the fence gate');
});

test('everything left in the yard still blocks', () => {
  // Opening the fence is not the same as emptying the yard. The transformer,
  // gantry, kiosk and switchgear cabinets each keep their own solid rect, so a
  // light car hits the gear and stops rather than clipping through it.
  const bodies = colliders();
  assert.equal(bodies.length, 4, `expected 4 pieces of kit, found ${bodies.length} collider pushes`);
  assert.ok(bodies.some((b) => /halfW:\s*2\.5,\s*halfD:\s*2\.0,\s*h:\s*3\.2/.test(b)),
    'the transformer no longer has a collider of its own');
  assert.ok(bodies.some((b) => /halfW:\s*2\.4,\s*halfD:\s*0\.6,\s*h:\s*2\.2/.test(b)),
    'the switchgear cabinets are not blocking');
});

test('only the heaviest vehicles can trip the transformer', () => {
  // knockAt() skips a prop whose smashOnlyBy flag the vehicle object does not
  // carry, so the transformer is reserved for the steamroller, the monster
  // truck and the fire engine. An ordinary car just thumps into the collider
  // and stops.
  const m = fn.match(/xfmrKnock\s*=\s*addKnockable\([^;]+;/);
  assert.ok(m, 'the transformer is not registered as a knockable assigned to xfmrKnock');
  assert.match(m[0], /smashOnlyBy:\s*'heavy'/,
    'the transformer is not restricted to the heavy vehicles');
  // It is a trigger, not a slow topple victim: the blast owns the launch plan
  // and physics hands it straight over the moment the sensor trips.
  assert.match(m[0], /mode:\s*'fall'/, 'the transformer is not a knockable trigger');
  // ...and main.js has to actually carry that flag, or nothing could ever trip it.
  assert.match(MAIN, /heavy:\s*playerSteamroller\s*\|\|\s*playerMonster\s*\|\|\s*playerFiretruck/,
    'main.js never sets the heavy flag, so no vehicle could ever trip the transformer');
});

test('every piece of kit inside the station is armed and heavy-only', () => {
  // The user asked that EVERYTHING inside the power station be knockable and
  // that touching any of it detonates the whole yard. Besides the transformer
  // there are the gantry, the switchgear, the kiosk, the bollards, the trench
  // covers and the two gate signs -- each gets an empty probe armed as a heavy
  // knockable via the local arm() helper, and the transformer joins the list.
  // On top of those position sensors, every real solid block (the transformer
  // pad, the gantry, the kiosk, the switchgear bank) also gets its own oversized
  // touch-probe so a physical collision at ANY speed is always within reach.
  const arms = [...fn.matchAll(/\n  arm\(/g)];
  assert.equal(arms.length, 11,
    `expected 11 armed probes (7 position sensors + 4 collider touch-probes), found ${arms.length}`);
  assert.match(fn, /subTriggers\.push\(addKnockable\(probe, r, \{ mode: 'fall', fallTime: 0\.4, smashOnlyBy: 'heavy' \}\)\)/,
    'the arm() helper never arms its probe as a heavy knockable');
  assert.match(fn, /subTriggers\.push\(xfmrKnock\)/,
    'the transformer is not part of the trigger list');
});

test('the transformer and all its gear are part of the blast plan', () => {
  // The blast owns every loose mesh: nothing may be excluded from the launch
  // plan except the gravel yard, the spark FX and the individual fence
  // sections (which topple on their own as their own knockables).
  const collect = fn.match(/g\.traverse\(\(o\) => \{[\s\S]*?\n    \}\);/);
  assert.ok(collect, 'substation() never collects its meshes for the blast');
  assert.ok(!/a === xfmr/.test(collect[0]),
    'the transformer is excluded from the blast plan -- its gear would never fly');
  assert.match(fn, /subPieces\s*=\s*planSubstationBlast\(pieces, tx, tz\)/,
    'the substation does not plan its pieces for the blast');
  assert.match(fn, /subDust\s*=\s*makeSubDust\(g\)/,
    'the substation does not build a dust pool');
  assert.match(SRC, /function planSubstationBlast\(pieces, epiX, epiZ\)/,
    'planSubstationBlast() is missing');
  assert.match(SRC, /function startSubstationBlast\(\)/, 'startSubstationBlast() is missing');
  assert.match(SRC, /function advanceSubstationBlast\(dt\)/, 'advanceSubstationBlast() is missing');
  assert.match(SRC, /function resetSubstationWreck\(\)/, 'resetSubstationWreck() is missing');
  // It must launch outward and upward, not fold in on itself like the
  // sandcastle, and the pieces must scatter beyond their starting spots.
  assert.match(SRC, /vel: new THREE\.Vector3\(/,
    'planSubstationBlast() gives no piece a real velocity');
  assert.match(SRC, /SUB_GRAV/, 'the blast never applies gravity to the flung gear');
  // The rest height must be the same low constant for every piece -- tying it to
  // a fraction of the start height left the tall gantry/insulator debris floating
  // mid-air, which the user explicitly flagged.
  assert.match(SRC, /restY: 0\.2,/, 'a piece can still settle at a height off the ground');
  // The instant the blast goes the yard's own colliders go soft, so the car
  // drives through the ruin instead of being fenced out of it.
  assert.match(SRC, /for \(const c of subColliders\) c\.soft = true;/,
    'the yard colliders are not softened when the blast goes off');
  // ...and addCityBuildings has to collect them for that to have anything to do.
  const add = SRC.match(/export function addCityBuildings\([\s\S]*?\n}/);
  assert.ok(add, 'could not find addCityBuildings()');
  assert.match(add[0], /entry\.name === 'substation'[\s\S]*?subColliders\.push\(placed\)/,
    'addCityBuildings never collects the substation colliders for softening');
});

test('detonating it blacks the city out, and standing the sensors back up brings the lights on', () => {
  const out = SRC.match(/export function cityPowerOut\([^)]*\)\s*\{[^}]*\}/);
  assert.ok(out, 'cityPowerOut() is not exported, so main.js cannot see the blackout');
  const upd = SRC.match(/export function updateCityBuildings\(t\)\s*\{[\s\S]*?\n}/);
  assert.ok(upd, 'could not find updateCityBuildings()');
  assert.match(upd[0], /subTriggers\.some\(\(k\) => k\.state !== 'standing'\)/,
    'touching ANY armed sensor no longer detonates the station');
  assert.match(upd[0], /startSubstationBlast\(\)/,
    'updateCityBuildings never fires the blast when a sensor trips');
  assert.match(upd[0], /setCityPower\(!down\)/,
    'the power state is not set from the station');
  assert.match(upd[0], /advanceSubstationBlast\(dt\)/,
    'updateCityBuildings never advances the blast');
  assert.match(upd[0], /subTriggers\.every\(\(k\) => k\.state === 'standing'\)[\s\S]*?resetSubstationWreck\(\)/,
    'updateCityBuildings never rebuilds the yard when the sensors stand back up');
  // The materials must actually go dark, and the animated beacons must yield to
  // it -- the sine would otherwise keep flashing alarms in a dead city.
  assert.match(upd[0], /if \(!cityPowerOn\)/,
    'updateCityBuildings does not stop the blinkers during a blackout');
  assert.match(SRC, /m\.emissiveIntensity = 0;/,
    'setCityPower() never zeroes the emissive materials');
  // And a world rebuild has to start with the lights on again.
  const add = SRC.match(/export function addCityBuildings\([\s\S]*?\n}/);
  assert.ok(add, 'could not find addCityBuildings()');
  assert.match(add[0], /setCityPower\(true\)/,
    'rebuilding the city does not restore power');
});

test('the street lamps go out with the rest of the city', () => {
  // They are the one lot of emissive prop that lives in props.js, so they need
  // their own switch and main.js has to hand the state across.
  assert.match(PROPS, /export function setStreetLights\(/,
    'props.js does not export setStreetLights');
  assert.match(MAIN, /import \{[^}]*setStreetLights[^}]*\} from '\.\/props\.js\?v=\d+'/,
    'main.js does not import setStreetLights');
  assert.match(MAIN, /cityPowerOut\(\)/,
    'main.js never asks whether the city is powered');
  assert.match(MAIN, /setStreetLights\(!powerOut\)/,
    'main.js never takes the street lamps down during a blackout');
});
