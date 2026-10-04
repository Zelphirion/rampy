import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  BEACH_CLIFF_Z, BEACH_HALF_W, BEACH_MAP_X1, BEACH_MAP_Z0, BEACH_MAP_Z1,
  BEACH_SEA_Y, cliffFaceZ, BEACH_CLIFF_SEEDS, cliffHash as hash,
} from './layout.js?v=1791038381904';

// ===== The cliffs =====
//
// Sunset Cliffs, San Diego: a wall of banded sandstone that is sheer almost all
// the way up, undercut where the sea has chewed the base, and overhanging at the
// lip where the top course is waiting to fall on whoever parks below. They are
// not scenery - they are the level boundary, and the sand is banked up against
// their feet, so the car simply cannot get past them.
//
// SOLID, and that is the defining constraint rather than a detail.
//
// The first version was a stack of discrete blocks: for each course of strata it
// drew a front face, a top, an underside, a back and two end caps, per segment.
// Closing each block meant every one of those internal faces existed, and from
// any angle that could see between two courses you were looking at a grid of
// little rock boxes - a lattice. It read as scaffolding, no matter how the rock
// was coloured. What is here instead is ONE closed solid per wall: a continuous
// front surface, and the top, bottom, two ends and back all derived from the
// EDGES of that one surface. There is no geometry between the courses to see
// through, so the wall is a wall from every angle.
//
// LUMPY, which is the other half of it. A closed solid with a smooth extruded
// profile is still a backdrop, not a cliff - you could put your hand through the
// silhouette and nothing would object. So the face is displaced by cliffLumps()
// (buttresses, hollows, broken shelves, gullies, chips) and then studded with
// half-buried boulders and a pile of talus at the foot. The lumps come from
// layout.js, which is where the collider barrier is measured from too, so the
// rock the player sees and the rock the car is stopped by are the same rock.
//
// One BufferGeometry per wall, not one mesh per block or per boulder: a few
// thousand triangles in a single geometry is a single draw call, and the vertex
// colours carry both the banding and the underwater darkening.

const CLIFF_TOP = 30;        // top of the lip, as an offset from groundHeight
const CLIFF_BOTTOM = -40;    // well under the trench floor and its dark floor
const STRATA = 15;           // horizontal bands
const DEPTH = 26;            // how far the rock reaches back behind the face
const SEG_LEN = 3.4;         // how finely the run is sampled, so lumps read

// Banded sandstone, with the wet rock below the tide line going green-grey.
const ROCK_DRY = [0xc9ab80, 0xbc9a6e, 0xa07a53, 0xd6bd95, 0x8f7154, 0xe0c9a2];
const ROCK_WET = [0x5a7164, 0x4e665d, 0x445a53];
// The boulders and talus are the same stone, just a shade apart from the cut
// face - which is what makes them read as loose rock rather than as another
// piece of wall.
const ROCK_LOOSE = [0xb59770, 0xa4855f, 0xc4a87e, 0x93774f];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const rgbOf = (hex, k = 1) => [
  ((hex >> 16) & 255) / 255 * k,
  ((hex >> 8) & 255) / 255 * k,
  (hex & 255) / 255 * k,
];

// A growing mesh: raw triangle soup with a flat colour per triangle.
//
// Non-indexed on purpose. It is what lets a lump of rock be stamped into the
// same arrays as the wall without any index bookkeeping, and flat shading reads
// the facet normals from the screen-space derivatives anyway, so nothing is
// lost by having three vertices per triangle rather than a shared grid.
function MeshSoup() {
  this.pos = [];
  this.col = [];
}

// One quad. `a b c d` wound so the visible face is the front of it.
MeshSoup.prototype.quad = function quad(a, b, c, d, rgb) {
  for (const v of [a, b, c, a, c, d]) {
    this.pos.push(v[0], v[1], v[2]);
    this.col.push(rgb[0], rgb[1], rgb[2]);
  }
};

// Append a prepared THREE geometry, transformed, in one flat colour. Used to
// weld the loose boulders into the wall's own geometry so the whole cliff is
// still a single draw call.
MeshSoup.prototype.stamp = function stamp(geo, matrix, rgb) {
  const p = geo.attributes.position.array;
  const v = new THREE.Vector3();
  // IcosahedronGeometry is non-indexed, so `p` is already flat triangles and can
  // simply be stepped through three vertices at a time.
  for (let i = 0; i < p.length; i += 9) {
    for (let t = 0; t < 3; t++) {
      v.set(p[i + t * 3], p[i + t * 3 + 1], p[i + t * 3 + 2]).applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      this.col.push(rgb[0], rgb[1], rgb[2]);
    }
  }
};

MeshSoup.prototype.geometry = function geometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
  geo.computeVertexNormals();
  return geo;
};

// One wall, as a single closed solid.
//
// Built in a local frame: the run goes along local X, the face looks down local
// -Z, and y is an offset from groundHeight like everything else in the beach.
// `cliffFaceZ()` is read straight out of layout.js, so this file decides nothing
// about where the rock is - it only decides how the rock is drawn.
function buildWall({ length, seed, bands = STRATA }) {
  const soup = new MeshSoup();
  const segs = Math.max(16, Math.round(length / SEG_LEN));
  const segW = length / segs;
  const bandH = (CLIFF_TOP - CLIFF_BOTTOM) / bands;
  const x = (j) => -length / 2 + j * segW;
  const zB = DEPTH;   // the flat back plane, buried in the rock mass

  // ---- 1. the front surface, as a single continuous grid ----
  // face[i][j] is the local Z of the front surface at the corner of course i,
  // segment j. Negative is out over the beach, positive is cut back into the
  // hill. Because neighbouring courses and segments SHARE their corners there
  // is never a gap between them, so an overhang is just one row of the grid
  // sitting further forward than the row above it.
  const face = [];
  for (let i = 0; i <= bands; i++) {
    const u = clamp01(i / bands);
    const row = [];
    for (let j = 0; j <= segs; j++) row.push(cliffFaceZ(u, j / segs, seed));
    face.push(row);
  }

  // ---- 2. colour of each band ----
  const bandColour = (i, k = 1) => {
    const y0 = CLIFF_BOTTOM + i * bandH;
    const y1 = y0 + bandH;
    // Below the tide line it is wet, dark and green.
    const wet = y1 < BEACH_SEA_Y - 3;
    const pal = wet ? ROCK_WET : ROCK_DRY;
    const base = rgbOf(pal[Math.floor(hash(i * 3.7, seed) * pal.length) % pal.length]);
    // Deeper rock reads darker even in the dry band, so the wall has weight.
    const shade = (0.74 + 0.26 * clamp01((y1 - CLIFF_BOTTOM) / (CLIFF_TOP - CLIFF_BOTTOM))) * k;
    return [base[0] * shade, base[1] * shade, base[2] * shade];
  };
  const cols = [];
  for (let i = 0; i < bands; i++) cols.push(bandColour(i));

  // ---- 3. the front face itself ----
  // Wound a -> up -> across, which puts the visible side on the seaward (-Z)
  // side. The previous version wound it the other way and then relied on the
  // face being offset the other sign as well, so the two mistakes cancelled and
  // the rock was only ever visible from INSIDE the cliff.
  for (let i = 0; i < bands; i++) {
    const y0 = CLIFF_BOTTOM + i * bandH;
    const y1 = y0 + bandH;
    const [r, g, b] = cols[i];
    for (let j = 0; j < segs; j++) {
      soup.quad(
        [x(j), y0, face[i][j]], [x(j), y1, face[i + 1][j]],
        [x(j + 1), y1, face[i + 1][j + 1]], [x(j + 1), y0, face[i][j + 1]], [r, g, b]);
    }
  }

  // ---- 4. the edges of that same grid, which close the solid ----
  // Each of these follows an edge of the front surface. None of them is internal
  // to the rock: they are the top, the bottom and the two ends, and they exist
  // only so the wall is a closed solid rather than a one-sided sheet.

  // The TOP: the lip of the cliff, running the full length, from the front edge
  // back to the back plane. One continuous ledge rather than a row of little
  // block-tops.
  for (let j = 0; j < segs; j++) {
    const zf0 = face[bands][j], zf1 = face[bands][j + 1];
    const [r, g, b] = cols[bands - 1];
    soup.quad(
      [x(j), CLIFF_TOP, zf0], [x(j + 1), CLIFF_TOP, zf1],
      [x(j + 1), CLIFF_TOP, zB], [x(j), CLIFF_TOP, zB], [r, g, b]);
  }

  // The BOTTOM: the underside of the whole wall, down at CLIFF_BOTTOM, which is
  // far below the trench floor and never seen. It exists only to close the solid.
  for (let j = 0; j < segs; j++) {
    const zf0 = face[0][j], zf1 = face[0][j + 1];
    const [r, g, b] = cols[0];
    soup.quad(
      [x(j), CLIFF_BOTTOM, zf0], [x(j + 1), CLIFF_BOTTOM, zf1],
      [x(j + 1), CLIFF_BOTTOM, zB], [x(j), CLIFF_BOTTOM, zB],
      [r * 0.5, g * 0.5, b * 0.5]);
  }

  // The two ENDS: the full height of the wall at each end of the run, so the
  // rock ends in a face rather than in a seam you can see into.
  for (const j of [0, segs]) {
    for (let i = 0; i < bands; i++) {
      const y0 = CLIFF_BOTTOM + i * bandH;
      const y1 = y0 + bandH;
      const [r, g, b] = bandColour(i, 0.82);
      const zf0 = face[i][j], zf1 = face[i + 1][j];
      const a = [x(j), y0, zf0], bpt = [x(j), y0, zB];
      const c = [x(j), y1, zB], d = [x(j), y1, zf1];
      // Wind the two ends opposite ways so the solid's faces all point outwards.
      if (j === 0) soup.quad(a, bpt, c, d, [r, g, b]);
      else soup.quad(a, d, c, bpt, [r, g, b]);
    }
  }

  // The BACK: a single flat plane across the whole wall, one quad per band so
  // the strata wrap around it. Not internal - it is the far side of the rock.
  for (let i = 0; i < bands; i++) {
    const y0 = CLIFF_BOTTOM + i * bandH;
    const y1 = y0 + bandH;
    const [r, g, b] = cols[i];
    soup.quad(
      [-length / 2, y0, zB], [-length / 2, y1, zB],
      [length / 2, y1, zB], [length / 2, y0, zB], [r * 0.5, g * 0.5, b * 0.5]);
  }

  // ---- 5. the lumps, welded on ----
  // Half-buried boulders standing proud of the face. These are what stop the
  // wall reading as an extrusion: they break the silhouette, catch the light on
  // their own facets, and cast the wall into its own shadow.
  //
  // `faceAt` samples the SAME grid the wall is built from, so a boulder sits on
  // the rock rather than floating in front of it or sinking into it.
  const faceAt = (u, s) => {
    const fi = clamp01(u) * bands;
    const i0 = Math.min(bands - 1, Math.floor(fi));
    const fu = fi - i0;
    const fj = clamp01(s) * segs;
    const j0 = Math.min(segs - 1, Math.floor(fj));
    const fs = fj - j0;
    const a = face[i0][j0], b = face[i0][j0 + 1];
    const c = face[i0 + 1][j0 + 1], d = face[i0 + 1][j0];
    return (a * (1 - fu) + d * fu) * (1 - fs) + (b * (1 - fu) + c * fu) * fs;
  };

  const boulders = Math.round(length * 0.62);
  for (let i = 0; i < boulders; i++) {
    const u = 0.06 + hash(i * 2.13, seed) * 0.92;
    const s = hash(i * 5.77, seed + 1.3);
    // Bigger lumps low down where the wall is buttressed, smaller chips up top.
    const size = (1.1 + hash(i * 3.31, seed + 2.1) * 3.4) * (1.25 - 0.45 * u);
    const hex = ROCK_LOOSE[Math.floor(hash(i * 7.13, seed) * ROCK_LOOSE.length) % ROCK_LOOSE.length];
    // Sunk into the face by a third of its radius, so it reads as embedded.
    const z = faceAt(u, s) + size * 0.22;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(-length / 2 + s * length, CLIFF_BOTTOM + u * (CLIFF_TOP - CLIFF_BOTTOM), z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        hash(i, seed) * 3, hash(i * 3, seed) * 3, hash(i * 7, seed) * 3)),
      new THREE.Vector3(size * (0.8 + hash(i * 11, seed) * 0.5), size * (0.7 + hash(i * 13, seed) * 0.5), size * 0.85),
    );
    soup.stamp(new THREE.IcosahedronGeometry(1, 1), m, rgbOf(hex, 0.86 + hash(i * 17, seed) * 0.24));
  }

  // ---- 6. the talus: what has fallen off and piled at the foot ----
  // Underwater for most of its height, which is why it is dark; but it is the
  // detail that stops the wall meeting the sand in a clean line.
  const talus = Math.round(length * 0.34);
  for (let i = 0; i < talus; i++) {
    const u = 0.02 + hash(i * 4.19, seed + 5.5) * 0.2;
    const s = hash(i * 9.13, seed + 6.1);
    const size = 0.9 + hash(i * 2.71, seed + 7.3) * 2.8;
    const hex = ROCK_LOOSE[Math.floor(hash(i * 6.71, seed + 8.1) * ROCK_LOOSE.length) % ROCK_LOOSE.length];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(-length / 2 + s * length,
        CLIFF_BOTTOM + u * (CLIFF_TOP - CLIFF_BOTTOM),
        faceAt(u, s) + size * 0.45),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        hash(i * 5, seed) * 3, hash(i * 6, seed) * 3, hash(i * 8, seed) * 3)),
      new THREE.Vector3(size * 1.15, size * 0.8, size),
    );
    soup.stamp(new THREE.IcosahedronGeometry(1, 0), m, rgbOf(hex, 0.62 + hash(i * 21, seed) * 0.2));
  }

  return soup.geometry();
}

// Adds the three walls that make the cove a box: one along the back, one down
// each side, all of them running on past the drop-off so the cliff carries on
// under the water the whole way.
export function addBeachCliffs(parent, baseY = 0) {
  const group = new THREE.Group();
  group.position.y = baseY;
  parent.add(group);

  // DoubleSide is deliberate belt-and-braces: the walls are the one thing on
  // this level the player must always be able to see, and a single mis-wound
  // quad on one wall would otherwise leave a hole straight through the world.
  // Flat shading gives the crisp facets that make the lumps read as rock.
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0,
    flatShading: true, side: THREE.DoubleSide,
  });

  // Back wall: runs along X, face looking south at the beach. It is built wider
  // than the cove so both of its ends bury themselves inside the side walls -
  // otherwise the corner shows a seam, and with the cliffs now out at the map's
  // edge that seam is on show for the whole level.
  const backLen = (BEACH_MAP_X1 + 34) * 2;
  const back = new THREE.Mesh(buildWall({ length: backLen, seed: BEACH_CLIFF_SEEDS[0] }), mat);
  // Tagged so a test can ray-cast the actual cliff masses and confirm they are
  // solid AND visible from the cove, rather than trying to pick them out of the
  // scene by colour.
  back.userData.isCliffWall = true;
  back.position.set(0, 0, BEACH_CLIFF_Z);
  back.receiveShadow = true;
  back.castShadow = true;
  group.add(back);

  // Side walls: run along Z, face looking in at the beach. They start out past
  // the back wall so the corner is solid, and end well past the drop-off so the
  // cliff is still there when you are looking down into the trench.
  const sideFrom = BEACH_MAP_Z1 + 10;
  const sideTo = BEACH_MAP_Z0 - 6;
  const sideLen = sideFrom - sideTo;
  [1, -1].forEach((sx, i) => {
    const side = new THREE.Mesh(buildWall({ length: sideLen, seed: BEACH_CLIFF_SEEDS[i + 1] }), mat);
    // The wall is built with its face looking down its own local -Z. A quarter
    // turn about Y swings the run onto world Z and turns that face in toward the
    // cove: +90 deg for the east wall (face looks west), -90 deg for the west
    // wall (face looks east). Get this backwards and the west wall ends up with
    // its sheer side buried in the sand.
    side.rotation.y = sx * Math.PI / 2;
    side.userData.isCliffWall = true;
    side.position.set(sx * BEACH_HALF_W, 0, (sideFrom + sideTo) / 2);
    side.receiveShadow = true;
    side.castShadow = true;
    group.add(side);
  });

  return group;
}

// Exported so the tests and the level builder can agree on how tall the cliff
// is without re-reading the numbers out of the geometry.
export const CLIFF_HEIGHT = CLIFF_TOP;
export const CLIFF_BASE = CLIFF_BOTTOM;