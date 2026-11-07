import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ============================================================================
// The circus big top (south-east outskirts)
// ============================================================================
// A striped canvas big top parked in the empty south-east corner of the outer
// belt. That corner is the one genuinely open field out there: it is clear of
// the railway ring, both parking lots, the museum plot, the spaceport yard, the
// soccer pitch and every rolling hill, so the tent and its giant arrows get a
// clean sightline from the arterial all the way in.
//
// The doorway faces +z (north), i.e. AWAY from the south boundary wall the tent
// backs onto (that wall's inner face is z = -180). Someone arriving from town
// therefore drives INTO the open flap, never at the back of the canvas.

export const CIRCUS = {
  x: 128,
  z: -146,
  radius: 15,       // radius of the vertical canvas skirt
  wallH: 5,         // height of that skirt
  peak: 17,         // height of the centre mast's canvas peak
  masts: 8,         // secondary masts ringing the roof
  mastR: 7.5,       // radius those masts stand on
  ridgeH: 3.4,      // how far the canvas lifts at each secondary mast
  gapHalf: 0.34,    // half the doorway's opening angle, radians (about 10 wide)
};

// Ground the nature pass must leave alone: the tent, its gravel apron and the
// two arrow signs with their posts. Imported by cityOuter.js into RESERVED so
// the deterministic pine scatter never grows through the canvas.
export const CIRCUS_SITE = { x0: 96, x1: 162, z0: -176, z1: -106 };

// ===== Canvas texture ========================================================
// One stripe pattern serves the roof, the skirt and the flaps. Everything is
// generated (colour, roughness and normals) so the fabric reads as heavy canvas
// rather than as flat paint, with dark retro stripes: midnight blue and
// burgundy. The stripes run along u, which is the angle around the tent, so
// they land as radial gores on the custom roof geometry too.
const STRIPE_COUNT = 20;
let fabricCache = null;

// Deterministic noise: the textures must look identical on every load.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fabricTextures() {
  if (fabricCache) return fabricCache;
  const rng = makeRng(0x5eed1a);
  const N = 512;
  const bandW = N / STRIPE_COUNT;

  // Colour: the stripes themselves.
  const colorC = document.createElement('canvas');
  colorC.width = colorC.height = N;
  const g = colorC.getContext('2d');
  for (let i = 0; i < STRIPE_COUNT; i++) {
    g.fillStyle = i % 2 ? '#c6222c' : '#f4efe4';   // circus red / canvas white
    g.fillRect(Math.floor(i * bandW), 0, Math.ceil(bandW) + 1, N);
  }
  // Weave: pale warp threads and a shadowed weft, faint enough to be fabric at
  // a distance and a visible weave up close.
  for (let y = 0; y < N; y += 2) {
    g.fillStyle = `rgba(255,255,255,${(0.018 + rng() * 0.012).toFixed(3)})`;
    g.fillRect(0, y, N, 1);
  }
  for (let x = 0; x < N; x += 3) {
    g.fillStyle = `rgba(0,0,0,${(0.02 + rng() * 0.02).toFixed(3)})`;
    g.fillRect(x, 0, 1, N);
  }
  // Slubs: the odd thicker thread lying across the weave.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.02 + rng() * 0.05).toFixed(3)})`;
    g.fillRect(rng() * N, rng() * N, 1 + rng() * 3, 1);
  }

  // Roughness: cloth is rough everywhere; the two stripe colours wear slightly
  // differently so the seam is not a hard line under a moving sun.
  const roughC = document.createElement('canvas');
  roughC.width = roughC.height = N;
  const r = roughC.getContext('2d');
  for (let i = 0; i < STRIPE_COUNT; i++) {
    const v = i % 2 ? 205 : 222;
    r.fillStyle = `rgb(${v},${v},${v})`;
    r.fillRect(Math.floor(i * bandW), 0, Math.ceil(bandW) + 1, N);
  }
  for (let i = 0; i < 5000; i++) {
    const v = 170 + Math.floor(rng() * 70);
    r.fillStyle = `rgb(${v},${v},${v})`;
    r.fillRect(rng() * N, rng() * N, 2, 2);
  }

  // Normals: a shallow weave, no spikes - too strong a normal map turns the
  // big triangular roof gores into glitter.
  const normC = document.createElement('canvas');
  normC.width = normC.height = 256;
  const n = normC.getContext('2d');
  const img = n.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const nx = Math.sin(x * 0.9) * 0.2 + (rng() - 0.5) * 0.1;
      const ny = Math.sin(y * 0.9) * 0.2 + (rng() - 0.5) * 0.1;
      const i = (y * 256 + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  n.putImageData(img, 0, 0);

  const asTexture = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  fabricCache = {
    map: asTexture(colorC, true),
    roughnessMap: asTexture(roughC, false),
    normalMap: asTexture(normC, false),
  };
  return fabricCache;
}

// Squeeze a geometry's UVs so a flat piece of canvas shows the stripes at the
// same pitch as the tent itself. The skirt's u = 0..1 already runs along its
// whole arc, so a flap `w` wide must only cover w/arc of the texture - without
// this, a 5-unit flap gets all 20 stripes the whole tent has.
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

// ===== Roof profile ==========================================================
// The roof is one continuous surface, not a stack of cones: a tall dome that
// lifts into a scallop at each secondary mast. That is what gives the classic
// multi-peak circus silhouette, and because the poles are placed FROM this same
// function they always meet the canvas exactly at the peaks.
function roofY(r, th) {
  const t = Math.max(0, 1 - r / CIRCUS.radius);
  const dome = CIRCUS.wallH + (CIRCUS.peak - CIRCUS.wallH) * Math.pow(t, 1.55);
  // Ridge envelope: zero at the centre and at the rim, strongest over the mast
  // ring, so the dome keeps its single high point and the scallops sit low.
  const env = Math.pow(Math.sin(Math.PI * Math.min(1, r / CIRCUS.radius)), 1.1);
  const ridge = Math.max(0, Math.cos(CIRCUS.masts * th));
  return dome + CIRCUS.ridgeH * env * Math.pow(ridge, 1.8);
}

const ROOF_RINGS = 18;
const ROOF_SEGS = 96;

function roofGeometry() {
  const pos = [0, roofY(0, 0), 0];      // centre of the canvas
  const uv = [0.5, 0];
  for (let ring = 1; ring <= ROOF_RINGS; ring++) {
    const r = (ring / ROOF_RINGS) * CIRCUS.radius;
    for (let s = 0; s < ROOF_SEGS; s++) {
      const th = (s / ROOF_SEGS) * Math.PI * 2;
      pos.push(Math.sin(th) * r, roofY(r, th), Math.cos(th) * r);
      uv.push(s / ROOF_SEGS, r / CIRCUS.radius);
    }
  }
  const at = (ring, s) => 1 + (ring - 1) * ROOF_SEGS + (s % ROOF_SEGS);
  const index = [];
  for (let s = 0; s < ROOF_SEGS; s++) index.push(0, at(1, s), at(1, s + 1));
  for (let ring = 1; ring < ROOF_RINGS; ring++) {
    for (let s = 0; s < ROOF_SEGS; s++) {
      index.push(at(ring, s), at(ring + 1, s), at(ring, s + 1));
      index.push(at(ring, s + 1), at(ring + 1, s), at(ring + 1, s + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// ===== The giant arrow signs =================================================
// Each sign is ONE flat plate extruded in its own plane, so a driver coming up
// the road from the north sees it face-on. In that plane the arrow points down
// and inward at the doorway, then its tail bends at the elbow and runs straight
// up beside the support post it hangs from. The plate is built tip-at-origin
// with +y up, which is why the sign group is just placed at the tip's world
// position.
const LEAN = 0.42;             // shaft lean off vertical, radians (~24 deg)
const HEAD_HALF_W = 2.8;       // barb half-width: half the old giant arrow
const HEAD_LEN = 4.4;          // tip to the barb line
const SHAFT_HALF_W = 0.8;      // shaft half-thickness
const SHAFT_LEN = 5.0;         // tip to the elbow, measured along the shaft
const TAIL_UP = 5.5;           // elbow to the top of the tail, straight up
const SIGN_DEPTH = 0.5;        // plate thickness
const BULB_PITCH = 0.72;       // spacing of the bulb rows / columns

function meetLines(p1, d1, p2, d2) {
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-6) return p1.clone();
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
  return new THREE.Vector2(p1.x + d1.x * t, p1.y + d1.y * t);
}

// The plate outline. `side` is +1 for the sign standing left of the door (its
// shaft leans up-left, so the tip points down and INWARD at the doorway) and -1
// for its mirror image on the other side.
function signPlate(side) {
  const ax = new THREE.Vector2(-side * Math.sin(LEAN), Math.cos(LEAN));
  const n = new THREE.Vector2(-ax.y, ax.x);            // left of the shaft
  const at = (p, q) => new THREE.Vector2(ax.x * p + n.x * q, ax.y * p + n.y * q);
  const elbow = at(SHAFT_LEN, 0);
  const up = new THREE.Vector2(0, 1);

  // Mitre the two rails around the elbow, so the bend is one clean corner
  // instead of a notch: the shaft's left edge runs into the tail's left edge,
  // and the same on the other side.
  const leftRail = meetLines(at(SHAFT_LEN, SHAFT_HALF_W), ax,
    new THREE.Vector2(elbow.x - SHAFT_HALF_W, elbow.y), up);
  const rightRail = meetLines(at(SHAFT_LEN, -SHAFT_HALF_W), ax,
    new THREE.Vector2(elbow.x + SHAFT_HALF_W, elbow.y), up);

  const pts = [
    new THREE.Vector2(0, 0),                                            // tip
    at(HEAD_LEN, HEAD_HALF_W),                                          // barb
    at(HEAD_LEN, SHAFT_HALF_W),
    leftRail,
    new THREE.Vector2(elbow.x - SHAFT_HALF_W, elbow.y + TAIL_UP),       // top
    new THREE.Vector2(elbow.x + SHAFT_HALF_W, elbow.y + TAIL_UP),
    rightRail,
    at(HEAD_LEN, -SHAFT_HALF_W),
    at(HEAD_LEN, -HEAD_HALF_W),
  ];
  // ExtrudeGeometry needs a positive-area (CCW) shape or the plate comes out
  // inside-out.
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) pts.reverse();
  return { pts, elbow };
}

function insidePolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Grow the outline by a constant distance, for the glowing red border. Each
// vertex walks along the mitre of its two edge normals, so the border keeps the
// same width down both long sides of the shaft and tail.
function offsetOutline(pts, d) {
  const out = [];
  const outward = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return new THREE.Vector2(dy / len, -dx / len);    // outward for a CCW ring
  };
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const n1 = outward(pts[(i - 1 + pts.length) % pts.length], cur);
    const n2 = outward(cur, pts[(i + 1) % pts.length]);
    const sum = n1.clone().add(n2);
    const l2 = sum.lengthSq();
    out.push(l2 < 1e-4
      ? cur.clone().addScaledVector(n1, d)
      : cur.clone().addScaledVector(sum, (2 * d) / l2));
  }
  return out;
}

function extrudePlate(pts, depth) {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 2 });
  geo.translate(0, 0, -depth / 2);      // centre the plate on its own plane
  return geo;
}

const signs = [];
const _bulbColor = new THREE.Color();
// The doorway portal built by buildCircus, animated by updateCircus: a dark disc
// with a glowing rim and drifting sparkles. It is what the entrance cut is
// played against — the car drives into the disc and is swallowed.
let portalFx = null;

// Build one sign: plate, glowing border, its grid of bulbs. Returns where the
// elbow and the top of the tail ended up, so the caller can stand a post there.
function buildArrowSign(side, tipX, tipY, signZ, plateMat, glowMat, group) {
  const { pts, elbow } = signPlate(side);

  const sign = new THREE.Group();
  sign.position.set(tipX, tipY, signZ);

  const plate = new THREE.Mesh(extrudePlate(pts, SIGN_DEPTH), plateMat);
  plate.castShadow = true;
  sign.add(plate);

  // Bold outline: the same plate grown by a fixed 0.16 and drawn back-faces
  // only, so a hot red rim shows all the way round the silhouette, and thicker
  // in z than the plate so it reads from either side.
  const rim = new THREE.Mesh(extrudePlate(offsetOutline(pts, 0.16), SIGN_DEPTH + 0.14), glowMat);
  sign.add(rim);

  // Bulbs in ROWS right across the plate, not just around its edge. The rows
  // are stepped along the plate's own centre line - down the vertical tail,
  // then round the elbow and down the shaft - so each half's rows square up
  // with that half and the bend is filled in instead of leaving a gap. Row 0 is
  // the top of the tail, so the frame loop's sweep runs down the tail, round
  // the bend and out to the tip.
  const ax = new THREE.Vector2(-side * Math.sin(LEAN), Math.cos(LEAN));   // shaft axis
  const nrm = new THREE.Vector2(-ax.y, ax.x);                            // across the shaft
  const rows = [];

  const centreLen = TAIL_UP + SHAFT_LEN;
  const nRows = Math.max(3, Math.round(centreLen / BULB_PITCH));
  for (let r = 0; r < nRows; r++) {
    const s = ((r + 0.5) / nRows) * centreLen;
    const row = [];
    if (s < TAIL_UP) {
      // Level row across the vertical tail.
      const v = elbow.y + TAIL_UP - s;
      for (let u = elbow.x - SHAFT_HALF_W + BULB_PITCH / 2; u < elbow.x + SHAFT_HALF_W; u += BULB_PITCH) {
        if (insidePolygon(u, v, pts)) row.push({ u, v });
      }
    } else {
      // Row square to the shaft, `p` measured back from the elbow to the tip.
      const p = SHAFT_LEN - (s - TAIL_UP);
      for (let q = -HEAD_HALF_W; q <= HEAD_HALF_W; q += BULB_PITCH) {
        const u = ax.x * p + nrm.x * q;
        const v = ax.y * p + nrm.y * q;
        if (insidePolygon(u, v, pts)) row.push({ u, v });
      }
    }
    if (row.length) rows.push(row);
  }

  const spots = [];
  rows.forEach((row, index) => {
    for (const s of row) spots.push({ u: s.u, v: s.v, row: index });
  });
  const rowCount = rows.length;

  if (spots.length) {
    const bulbGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
    const mesh = new THREE.InstancedMesh(bulbGeo, bulbMat, spots.length);
    const m4 = new THREE.Matrix4();
    const frontZ = SIGN_DEPTH / 2 + 0.17;
    spots.forEach((s, i) => {
      m4.makeTranslation(s.u, s.v, frontZ);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, _bulbColor.setRGB(0.13, 0.085, 0.03));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    sign.add(mesh);
    signs.push({ mesh, spots, rowCount });
  }

  group.add(sign);
  return { elbow, top: tipY + elbow.y + TAIL_UP };
}

// ===== Build =================================================================
export function buildCircus(scene, buildingColliders = []) {
  const col = CIRCUS;
  // The frame loop animates whatever is in `signs`, so a rebuild must not
  // leave the previous build's bulbs in the list.
  signs.length = 0;
  const group = new THREE.Group();
  group.name = 'circusBigTop';

  const fabric = fabricTextures();
  const cloth = new THREE.MeshStandardMaterial({
    map: fabric.map,
    roughnessMap: fabric.roughnessMap,
    normalMap: fabric.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    // A little self-illumination off the same stripe map keeps the red and
    // white reading as canvas on the shaded side of the tent, instead of
    // turning into blue-grey board under the sky light.
    emissive: 0xffffff,
    emissiveMap: fabric.map,
    emissiveIntensity: 0.16,
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7d5731, roughness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a253, roughness: 0.35, metalness: 0.8 });
  const voidBack = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, fog: false });
  const voidFlat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });

  // --- Gravel apron --------------------------------------------------------
  // A ring of hardstanding so the tent reads as pitched on purpose rather than
  // dropped in the grass, and so the join between canvas and lawn is covered.
  const apron = new THREE.Mesh(
    new THREE.RingGeometry(col.radius - 1.5, col.radius + 5.5, 64),
    new THREE.MeshStandardMaterial({ color: 0x7d7052, roughness: 1 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(col.x, 0.03, col.z);
  apron.receiveShadow = true;
  group.add(apron);

  // --- Canvas skirt --------------------------------------------------------
  // The wall is a ring with a wedge cut out of it for the doorway. thetaStart
  // puts the missing wedge at theta = 0, which is +z: the entrance.
  const skirtGeo = new THREE.CylinderGeometry(
    col.radius, col.radius, col.wallH, ROOF_SEGS, 1, true,
    col.gapHalf, Math.PI * 2 - col.gapHalf * 2,
  );
  const skirt = new THREE.Mesh(skirtGeo, cloth);
  skirt.position.set(col.x, col.wallH / 2, col.z);
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  group.add(skirt);

  // --- Pitch-black interior ------------------------------------------------
  // A black drum just inside the canvas, with the same wedge removed, closed by
  // a black ceiling and a black floor. Looking through the flap you see nothing
  // but unlit black, which is exactly the deep-shadow reading we want. A black
  // backdrop wall sits a few metres in, so the void has a back to it (and a
  // collider, so the car cannot drive out through the far side of the drum).
  const drumGeo = new THREE.CylinderGeometry(
    col.radius - 0.45, col.radius - 0.45, col.wallH - 0.1, ROOF_SEGS, 1, true,
    col.gapHalf + 0.02, Math.PI * 2 - (col.gapHalf + 0.02) * 2,
  );
  const drum = new THREE.Mesh(drumGeo, voidBack);
  drum.position.set(col.x, (col.wallH - 0.1) / 2, col.z);
  group.add(drum);

  const ceiling = new THREE.Mesh(new THREE.CircleGeometry(col.radius - 0.3, 64), voidFlat);
  ceiling.rotation.x = Math.PI / 2;         // face downwards, into the tent
  ceiling.position.set(col.x, col.wallH - 0.06, col.z);
  group.add(ceiling);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(col.radius - 0.3, 64), voidFlat);
  floor.rotation.x = -Math.PI / 2;          // face upwards
  floor.position.set(col.x, 0.06, col.z);
  group.add(floor);

  const BACKDROP_DEPTH = 4.5;               // how far inside the black back sits
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(28, col.wallH), voidFlat);
  backdrop.position.set(col.x, col.wallH / 2, col.z - BACKDROP_DEPTH);
  group.add(backdrop);

  // --- The way in ----------------------------------------------------------
  // A dark portal disc fills the mouth of the tent, ringed in warm carnival
  // bulbs with sparkles drifting across it. The driver sees a lit doorway and
  // aims for it; the locked-off entrance cut uses the disc's black face to hide
  // the car as it drives through.
  portalFx = null;
  const portalR = 5.4;
  const discMesh = new THREE.Mesh(
    new THREE.CircleGeometry(portalR, 40),
    new THREE.MeshBasicMaterial({ color: 0x0d0710, fog: false }),
  );
  discMesh.position.set(col.x, 3.2, col.z + 8.5);
  group.add(discMesh);
  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(portalR, 0.2, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false }),
  );
  ringMesh.position.copy(discMesh.position);
  group.add(ringMesh);
  const sparks = [];
  for (let i = 0; i < 10; i++) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, fog: false, transparent: true }),
    );
    spark.position.set(
      col.x + Math.sin(i * 2.3) * 3.3,
      1.2 + ((i * 0.87) % 3.2),
      col.z + 9.5 + Math.sin(i * 1.7) * 0.5,
    );
    group.add(spark);
    sparks.push(spark);
  }
  portalFx = { ring: ringMesh, sparks };

  // --- Canvas roof ---------------------------------------------------------
  const roof = new THREE.Mesh(roofGeometry(), cloth);
  roof.position.set(col.x, 0, col.z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // --- Flaps ---------------------------------------------------------------
  // The two halves of the doorway, swung out and held open. Each hangs off the
  // edge of the wedge, so the opening genuinely starts where the canvas stops.
  const flapW = 4.8;
  const skirtArc = (Math.PI * 2 - col.gapHalf * 2) * col.radius;   // world width of u = 1
  for (const side of [-1, 1]) {
    const a = side * col.gapHalf;
    const flap = new THREE.Group();
    flap.position.set(col.x + Math.sin(a) * col.radius, 0, col.z + Math.cos(a) * col.radius);
    // Each flap hangs off the doorway's edge and swings outwards, splaying
    // slightly away from the middle of the opening so the two of them frame the
    // entrance like drawn-back curtains instead of closing it again.
    const dx = side * 0.35, dz = 0.94;
    flap.rotation.y = Math.atan2(-dz, dx);   // local +x lands on (dx, dz)
    const panel = new THREE.Mesh(
      scaleUV(new THREE.PlaneGeometry(flapW, col.wallH), flapW / skirtArc, 1), cloth);
    panel.position.set(flapW / 2, col.wallH / 2, 0);
    panel.castShadow = true;
    flap.add(panel);
    // The rolled leading edge - the heavy hem every real tent flap has.
    const rollGeo = scaleUV(
      new THREE.CylinderGeometry(0.22, 0.22, col.wallH, 8), (Math.PI * 2 * 0.22) / skirtArc, 1);
    const roll = new THREE.Mesh(rollGeo, cloth);
    roll.position.set(flapW, col.wallH / 2, 0);
    flap.add(roll);
    group.add(flap);
  }

  // --- Poles ---------------------------------------------------------------
  // Perimeter poles stand just outside the canvas at regular intervals; the
  // doorway stays clear. Each gets a brass finial.
  const POLE_SEGS = 14;
  for (let i = 0; i < POLE_SEGS; i++) {
    const th = (i / POLE_SEGS) * Math.PI * 2;
    if (Math.abs(wrapAngle(th)) < col.gapHalf + 0.2) continue;   // leave the door clear
    const x = col.x + Math.sin(th) * (col.radius + 0.5);
    const z = col.z + Math.cos(th) * (col.radius + 0.5);
    const h = col.wallH + 1.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, h, 10), wood);
    pole.position.set(x, h / 2, z);
    pole.castShadow = true;
    group.add(pole);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), brass);
    finial.position.set(x, h + 0.2, z);
    group.add(finial);
  }

  // Roof masts: only the length that stands proud of the canvas is built. A
  // full floor-to-peak pole would show through the doorway as a lit stick in
  // the middle of the black void; the canvas hides the rest anyway, so the
  // visible stub is all a viewer ever sees from outside.
  const mastGeo = new THREE.CylinderGeometry(0.3, 0.36, 1, 10);
  const finialGeo = new THREE.SphereGeometry(0.42, 10, 8);
  const MAST_PROUD = 3.4;
  for (let i = 0; i < col.masts; i++) {
    const th = (i / col.masts) * Math.PI * 2;
    const x = col.x + Math.sin(th) * col.mastR;
    const z = col.z + Math.cos(th) * col.mastR;
    const peakY = roofY(col.mastR, th);
    const bottom = peakY - 0.9;
    const mast = new THREE.Mesh(mastGeo, wood);
    mast.scale.y = MAST_PROUD;
    mast.position.set(x, bottom + MAST_PROUD / 2, z);
    mast.castShadow = true;
    group.add(mast);
    const finial = new THREE.Mesh(finialGeo, brass);
    finial.position.set(x, bottom + MAST_PROUD + 0.28, z);
    group.add(finial);
  }

  // Centre mast: the tallest point on the whole model, with a pennant.
  const centreBottom = col.peak - 1.2;
  const centreH = 3.6;
  const centreMast = new THREE.Mesh(mastGeo, wood);
  centreMast.scale.set(1.1, centreH, 1.1);
  centreMast.position.set(col.x, centreBottom + centreH / 2, col.z);
  centreMast.castShadow = true;
  group.add(centreMast);
  const centreFinial = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), brass);
  centreFinial.position.set(col.x, centreBottom + centreH + 0.3, col.z);
  group.add(centreFinial);
  const pennantShape = new THREE.Shape();
  pennantShape.moveTo(0, 0);
  pennantShape.lineTo(2.2, -0.55);
  pennantShape.lineTo(0, -1.1);
  pennantShape.closePath();
  const pennant = new THREE.Mesh(
    new THREE.ShapeGeometry(pennantShape),
    new THREE.MeshStandardMaterial({ color: 0xd0263c, roughness: 0.8, side: THREE.DoubleSide }),
  );
  pennant.position.set(col.x, centreBottom + centreH - 0.2, col.z);
  pennant.rotation.y = Math.PI / 2;         // fly across the wind, seen from the approach
  group.add(pennant);

  // --- Colliders -----------------------------------------------------------
  // The canvas is solid: a ring of disc colliders just inside the skirt, with
  // the doorway wedge left open so the car can actually drive in. Discs are
  // used rather than boxes because rectCircleIntersect tests `r` colliders as
  // circles, and a ring of circles reads as a round wall rather than a set of
  // square corners.
  const SEGS = 24;
  for (let i = 0; i < SEGS; i++) {
    const th = (i / SEGS) * Math.PI * 2;
    if (Math.abs(wrapAngle(th)) < col.gapHalf + 0.1) continue;
    buildingColliders.push({
      x: col.x + Math.sin(th) * (col.radius - 0.3),
      z: col.z + Math.cos(th) * (col.radius - 0.3),
      r: 2.2,
      h: col.wallH,
    });
  }
  buildingColliders.push({
    x: col.x, z: col.z - BACKDROP_DEPTH, halfW: 8, halfD: 0.4, h: col.wallH,
  });

  // --- Giant arrow signs ---------------------------------------------------
  // Two of them, flanking the doorway, each hanging off its own post. Their
  // rows of bulbs chase from the top of the tail down to the point, running the
  // eye straight into the mouth of the tent.
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf7f3ea, metalness: 0.05, roughness: 0.6,
    emissive: 0xfff2dd, emissiveIntensity: 0.12,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff2a16, side: THREE.BackSide, fog: false,
  });
  const mouthZ = col.z + col.radius;
  const signZ = mouthZ + 3.0;
  const signTipY = 3.6;
  const SIGN_OFFSET = 9.5;          // each tip's distance from the door centre
  for (const side of [1, -1]) {
    const tipX = col.x - side * SIGN_OFFSET;
    const info = buildArrowSign(side, tipX, signTipY, signZ, plateMat, glowMat, group);

    // The support: a post from the ground to the top of the sign's vertical
    // tail, set just behind the plate so the tail reads as bolted to it.
    const postX = tipX + info.elbow.x;
    const postZ = signZ - 0.62;
    const postH = info.top + 0.45;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, postH, 10), wood);
    post.position.set(postX, postH / 2, postZ);
    post.castShadow = true;
    group.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.42, 12), wood);
    foot.position.set(postX, 0.21, postZ);
    foot.receiveShadow = true;
    group.add(foot);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), brass);
    cap.position.set(postX, postH + 0.2, postZ);
    group.add(cap);
  }

  scene.add(group);
  return group;
}

function wrapAngle(a) {
  let t = a;
  while (t > Math.PI) t -= Math.PI * 2;
  while (t < -Math.PI) t += Math.PI * 2;
  return t;
}

// ===== Animation =============================================================
// Most of the bulbs stay lit; a single DARK band sweeps from the top row of
// each sign to the bottom row and repeats. Because the rows are lit in order
// downwards, the travelling gap still pulls the eye down the tail, round the
// bend and out to the point at the doorway.
export function updateCircus(time) {
  for (const s of signs) {
    const litRow = ((time * 0.55) % 1) * s.rowCount;
    for (let i = 0; i < s.spots.length; i++) {
      let d = s.spots[i].row - litRow;
      if (d < 0) d += s.rowCount;              // wrap, so the gap re-enters at the top
      const g = 1 - Math.exp(-(d * d) / 4.0);  // 1 = lit, 0 = inside the dark band
      s.mesh.setColorAt(i, _bulbColor.setRGB(
        0.13 + 0.87 * g,
        0.085 + 0.845 * g,
        0.03 + 0.69 * g,
      ));
    }
    if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
  }

  // The doorway portal: the rim turns slowly and the sparkles drift up it.
  if (portalFx) {
    portalFx.ring.rotation.z = time * 0.55;
    const pulse = 0.86 + 0.14 * Math.sin(time * 2.4);
    portalFx.ring.material.color.setRGB(pulse, 0.72 * pulse, 0.30 * pulse);
    for (let i = 0; i < portalFx.sparks.length; i++) {
      const sp = portalFx.sparks[i];
      sp.position.y = 1.2 + ((time * 0.5 + i * 0.42) % 3.2);
      sp.material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(time * 2.6 + i));
    }
  }
}
