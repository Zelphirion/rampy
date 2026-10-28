// ===== One tire, two worlds ==================================================
// The soccer pitch's score piles and the ramp-world junkyard pyramid are the
// same model at two sizes: an extruded carcass lying flat, bead rings moulded
// into both sidewalls, chunky tread lugs round the shoulder, and a metal bead
// lining the bore. Everything is proportioned off the tread radius, so
// makeTire(0.72) and makeTire(0.6) are the same tire bigger and smaller.
//
// Two things here are easy to get wrong, and both were:
//
//   1. The tire is built in its own XZ plane, because it stands on the ground.
//      THREE.TorusGeometry stands upright in the XY plane by default, so every
//      ring needs a quarter turn down about X — an unrotated one hangs through
//      the rubber like a hoop.
//   2. ExtrudeGeometry's bevel ADDS to both dimensions: it carries the depth out
//      by bevelThickness at each end and pushes bevelSize out past the shape
//      outline. Both are paid back here, or the finished mesh is a quarter
//      bigger than the numbers that place it on the ground — which buried the
//      bead rings inside the sidewall and sank every stacked tire into the one
//      below it.
//
// The buffers are built once per radius and shared by every tire of that size:
// a score pile can be twenty tires deep and the ramp pyramid is thirty-six, so
// a thousand transforms must not mean a thousand icosahedra.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// The size these proportions were drawn at — the soccer ball's tire.
const BASE_RADIUS = 0.72;
const BASE_HALF_WIDTH = 0.18;
const BASE_BEVEL = 0.045;          // rounds the shoulder, along the width
const BASE_SHOULDER = 0.02;        // rounds the shoulder, radially
const BASE_TREAD_LIFT = 0.025;     // how far the lugs stand proud of the carcass
const BASE_TREAD_DEPTH = 0.1;      // radial thickness of one lug
const BASE_BEAD_OUTER = 0.032;     // tube radius of the shoulder bead ring
const BASE_BEAD_INNER = 0.022;     // …and of the bead ring next to the bore
const BASE_FACE_INSET = 0.006;     // bead centres sit this far inside the face
// Measured off the built mesh: the face plus a six-segment bead tube standing
// proud of it. This is the height a stack has to nest on.
const BASE_HALF_HEIGHT = 0.202;
const BORE_SCALE = 0.49;           // bore radius as a fraction of the tread radius
const TREAD_BLOCKS = 20;           // few enough to leave a groove between neighbours

// A fresh tire and a sun-bleached one, so a junkyard pile is not thirty-six of
// the same black ring.
const SKINS = [
  { carcass: 0x202124, sidewall: 0x3b3c41, tread: 0x292a2d },
  { carcass: 0x2b2b2a, sidewall: 0x4a453e, tread: 0x35342f },
];

const skinMaterials = new Map();
function materialsFor(skin) {
  const index = skin % SKINS.length;
  let mats = skinMaterials.get(index);
  if (!mats) {
    const s = SKINS[index];
    mats = {
      carcass: new THREE.MeshStandardMaterial({ color: s.carcass, roughness: 0.96 }),
      sidewall: new THREE.MeshStandardMaterial({ color: s.sidewall, roughness: 0.9 }),
      tread: new THREE.MeshStandardMaterial({ color: s.tread, roughness: 0.96 }),
      // Double-sided because the only thing wearing it is the open liner inside
      // the bore, which is seen from the inside as much as from the outside.
      bore: new THREE.MeshStandardMaterial({
        color: 0x77736a, roughness: 0.8, metalness: 0.12, side: THREE.DoubleSide,
      }),
    };
    skinMaterials.set(index, mats);
  }
  return mats;
}

// The finished half-height of a tire at this radius: what one rests on, and what
// half of the nesting step is for a stack of them.
export function tireHalfHeight(radius) {
  return BASE_HALF_HEIGHT * (radius / BASE_RADIUS);
}

const geometryCache = new Map();

function tireGeometries(radius) {
  let set = geometryCache.get(radius);
  if (set) return set;

  const k = radius / BASE_RADIUS;
  const halfWidth = BASE_HALF_WIDTH * k;
  const bevel = BASE_BEVEL * k;
  const shoulder = BASE_SHOULDER * k;
  const bore = radius * BORE_SCALE;
  // The carcass tops out just under where the lugs do, and its outline is inset
  // by the bevel, so the widest part of the rubber lands under the tread.
  const outline = radius - BASE_TREAD_LIFT * k - shoulder;
  const depth = halfWidth * 2 - bevel * 2;

  const shape = new THREE.Shape();
  shape.absarc(0, 0, outline, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const body = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: shoulder,
    bevelSegments: 2,
    curveSegments: 28,
  });
  body.rotateX(-Math.PI / 2);
  // The extrusion runs from -bevelThickness to depth + bevelThickness, so it is
  // already centred on depth/2 — not on the finished half-width.
  body.translate(0, -depth / 2, 0);

  set = {
    body,
    beadOuter: new THREE.TorusGeometry(radius * 0.73, BASE_BEAD_OUTER * k, 6, 40),
    beadInner: new THREE.TorusGeometry(radius * 0.53, BASE_BEAD_INNER * k, 6, 40),
    tread: new THREE.BoxGeometry(0.12 * k, 0.26 * k, BASE_TREAD_DEPTH * k),
    bore: new THREE.CylinderGeometry(
      bore - 0.006 * k, bore - 0.006 * k, depth - 0.02 * k, 28, 1, true,
    ),
    face: halfWidth - BASE_FACE_INSET * k,
    treadRadius: radius - (BASE_TREAD_DEPTH * k) / 2,
  };
  geometryCache.set(radius, set);
  return set;
}

// Build a tire of `radius` (its tread radius, which is what it rolls on).
export function makeTire(radius = BASE_RADIUS, skin = 0) {
  const geo = tireGeometries(radius);
  const mats = materialsFor(skin);
  const tire = new THREE.Group();
  tire.name = 'tire';

  const body = new THREE.Mesh(geo.body, mats.carcass);
  body.castShadow = true;
  body.receiveShadow = true;
  tire.add(body);

  // Bead rings on both faces: half of each tube is buried in the rubber, so the
  // rest reads as a lip moulded round the sidewall.
  for (const y of [-geo.face, geo.face]) {
    for (const geometry of [geo.beadOuter, geo.beadInner]) {
      const bead = new THREE.Mesh(geometry, mats.sidewall);
      bead.rotation.x = -Math.PI / 2;
      bead.position.y = y;
      bead.castShadow = true;
      tire.add(bead);
    }
  }

  // Tread lugs round the outer shoulder, each turned to face along its own
  // radius. Their outer faces sit exactly on the radius the tire rolls on.
  for (let i = 0; i < TREAD_BLOCKS; i++) {
    const angle = (i / TREAD_BLOCKS) * Math.PI * 2;
    const block = new THREE.Mesh(geo.tread, mats.tread);
    block.position.set(
      Math.sin(angle) * geo.treadRadius,
      0,
      Math.cos(angle) * geo.treadRadius,
    );
    block.rotation.y = angle;
    block.castShadow = true;
    tire.add(block);
  }

  // A dull metal bead lining the bore, so the hole reads as a rim rather than a
  // hole punched through rubber. Open-ended, and it stops short of the bevel so
  // the two surfaces never fight.
  tire.add(new THREE.Mesh(geo.bore, mats.bore));
  return tire;
}
