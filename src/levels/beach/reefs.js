import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { BEACH_REEFS, beachGroundOffsetAt, cliffNoise as noise } from './layout.js?v=1791038381904';

// ===== The reefs =====
//
// Coral heads growing up off the floor of the basin, in the water the car drives
// through. They are the reason the basin is worth driving into: they force you to
// pick a line instead of running straight at the drop-off.
//
// Each head is a lumpy dome with a few branches off the top, rather than a
// smooth ball. A reef is seen from close up and from every angle while driving,
// and a plain sphere reads as a rock that fell off a cliff - which is exactly
// what the boulder field higher up the beach already is. The lumps and the
// branches are what make it read as coral.
//
// The build is one BufferGeometry for the WHOLE reef field rather than one mesh
// per head: six heads' worth of lumps is a few hundred triangles, all with
// vertex colours, so the entire reef costs a single draw call. Per-head meshes
// would mean six more objects to sort against the water for no visible gain.

const RING = 10;              // segments around a head
const RINGS = 5;              // rings from the base up to the crown

// Coral colours: warm and cool, all of them muted a little by being underwater.
// Saturated reef colours under a green-blue sea light read as plastic toys, so
// these are the real thing seen through water rather than on a poster.
const CORAL = [
  [0.85, 0.36, 0.42],
  [0.90, 0.52, 0.30],
  [0.78, 0.44, 0.62],
  [0.36, 0.66, 0.58],
  [0.82, 0.68, 0.38],
  [0.62, 0.40, 0.56],
];

// Which colour a head is. noise() is SIGNED (it returns roughly -1..1), so it
// has to be made positive before it can index an array - the first version of
// this floored a negative number and read off the end of CORAL.
const headColour = (seed) =>
  CORAL[Math.floor(Math.abs(noise(seed, seed * 2.3)) * CORAL.length) % CORAL.length];

function domeRadius(u, ang, seed, wide) {
  // u: 0 at the base, 1 at the crown. Coral heads are widest a little above the
  // sand and taper in from there, so the profile is a shoulder, not a hemisphere.
  const profile = Math.sin(Math.PI * Math.pow(u, 0.72)) * wide;
  const lump = 1
    + 0.22 * noise(ang * 1.7 + seed, u * 3.1 + seed * 0.3)
    + 0.11 * noise(ang * 3.9 - seed * 1.4, u * 6.2);
  return Math.max(0.02, profile * lump);
}

function buildReefField(heads = BEACH_REEFS) {
  const pos = [];
  const col = [];

  const quad = (a, b, c, d, rgb) => {
    const [r, g, b2] = rgb;
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0], v[1], v[2]);
      col.push(r, g, b2);
    }
  };

  for (const [cx, cz, r, h, seed] of heads) {
    // The coral rises out of the sand at this spot, so the base sits ON the sea
    // floor rather than at some absolute depth. Building it here and letting the
    // caller's mesh be positioned at groundHeight keeps the two in agreement.
    const baseY = beachGroundOffsetAt(cx, cz);
    // Sit the head slightly INTO the sand so its base is never a visible seam
    // where it meets the floor.
    const sink = -r * 0.22;
    const wide = r;
    // One colour per head, decided once here. The crown is lighter than the
    // base: the light in this world comes from above, and that gradient is what
    // makes the shape of the lump read rather than looking like a flat blob.
    const base = headColour(seed);

    for (let ri = 0; ri < RINGS; ri++) {
      const u0 = ri / RINGS;
      const u1 = (ri + 1) / RINGS;
      for (let ai = 0; ai < RING; ai++) {
        const a0 = (ai / RING) * Math.PI * 2;
        const a1 = ((ai + 1) / RING) * Math.PI * 2;
        const y0 = baseY + sink + h * u0;
        const y1 = baseY + sink + h * u1;
        const r00 = domeRadius(u0, a0, seed, wide);
        const r01 = domeRadius(u0, a1, seed, wide);
        const r11 = domeRadius(u1, a1, seed, wide);
        const r10 = domeRadius(u1, a0, seed, wide);
        const lift = 0.62 + 0.5 * u0;
        quad(
          [cx + Math.cos(a0) * r00, y0, cz + Math.sin(a0) * r00],
          [cx + Math.cos(a1) * r01, y0, cz + Math.sin(a1) * r01],
          [cx + Math.cos(a1) * r11, y1, cz + Math.sin(a1) * r11],
          [cx + Math.cos(a0) * r10, y1, cz + Math.sin(a0) * r10],
          [base[0] * lift, base[1] * lift, base[2] * lift],
        );
      }
    }

    // Branches: short tapered spikes off the upper part of the head. They are
    // what says "coral" rather than "rock", and they are drawn in the same
    // colour as the head they grow out of, so the whole thing reads as one
    // thing rather than as a ball with debris sitting on it.
    //
    // 3 to 5 of them. noise() is signed, so it has to be made positive before
    // it can count anything.
    const branches = 3 + Math.floor(Math.abs(noise(seed * 1.9, seed)) * 3);
    for (let bi = 0; bi < branches; bi++) {
      const t = (bi + 0.5) / branches;
      const ang = t * Math.PI * 2 + seed;
      const u = 0.55 + 0.3 * noise(bi * 2.7 + seed, t * 4.1);
      const rr = domeRadius(u, ang, seed, wide);
      const bx = cx + Math.cos(ang) * rr * 0.8;
      const bz = cz + Math.sin(ang) * rr * 0.8;
      const by = baseY + sink + h * u;
      const bl = r * (0.5 + 0.45 * Math.abs(noise(bi * 3.3, seed * 1.7)));
      const bw = r * 0.3;
      const lift = 0.62 + 0.5 * u;
      const rgb = [base[0] * lift, base[1] * lift, base[2] * lift];
      // The branch leans OUTWARD, away from the middle of the head, and upward.
      // An earlier version offset its tip sideways along the tangent instead,
      // which made every branch a flat card lying across the head.
      const tipX = bx + Math.cos(ang) * bl;
      const tipZ = bz + Math.sin(ang) * bl;
      const tipY = by + bl * 0.5;
      // A four-sided cone from a small square base out to a single point, so it
      // is a solid stub of coral and does not vanish when you drive past it
      // edge-on.
      const BASE_SIDES = 4;
      const ring = [];
      for (let s = 0; s < BASE_SIDES; s++) {
        const o = (s / BASE_SIDES) * Math.PI * 2 + ang;
        ring.push([bx + Math.cos(o) * bw, by, bz + Math.sin(o) * bw]);
      }
      for (let s = 0; s < BASE_SIDES; s++) {
        const p0 = ring[s];
        const p1 = ring[(s + 1) % BASE_SIDES];
        const tip = [tipX, tipY, tipZ];
        // Two triangles per side, wound so the outside of the cone faces out.
        pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], tip[0], tip[1], tip[2]);
        for (let k = 0; k < 3; k++) col.push(rgb[0], rgb[1], rgb[2]);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// The reef field, at groundHeight. The coral's own vertical position was taken
// from beachGroundOffsetAt when it was built, so the mesh only has to supply the
// level's own base height - the same treatment the palms and rocks get.
export function buildReefs() {
  const mesh = new THREE.Mesh(
    buildReefField(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.isReef = true;
  return mesh;
}

// A SINGLE coral head, for the object browser. It uses the same field geometry
// code as buildReefs(), just restricted to one site instead of the whole basin,
// so the preview is a real head and not a miniature of the whole field.
export function buildCoralHead(index = 0) {
  const entry = BEACH_REEFS[index % BEACH_REEFS.length];
  const mesh = new THREE.Mesh(
    buildReefField([entry]),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.isReef = true;
  return mesh;
}

// The height of the crown above the level's base, per head. The tests use this
// to check the coral stays under the water, which is a real constraint rather
// than a matter of taste: a head that breaks the surface reads as a rock, and a
// head that pokes past the drop-off lip is standing somewhere the car can hit it.
export function reefCrownHeight() {
  return BEACH_REEFS.map(([x, z, r, h, seed]) => ({
    x, z, seed, top: beachGroundOffsetAt(x, z) + h,
  }));
}
