// A minimal THREE stand-in, just enough for the house builder to run headless.
// It records nothing clever — it exists so `addHouse` can actually be CALLED in
// a test, which is the only way to catch errors that a syntax check cannot see.
//
// Run: node --test src/levels/house/build.test.mjs
export function installDomStubs() {}

class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  // Used by the knockable physics while animating a prop. The headless build
  // only constructs vectors, but a test that steps the physics should not blow
  // up on a missing method, so the cheap ones are here.
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  applyMatrix3() { return this; }
  setFromMatrixPosition() { return this; }
  crossVectors(a, b) {
    this.x = a.y * b.z - a.z * b.y;
    this.y = a.z * b.x - a.x * b.z;
    this.z = a.x * b.y - a.y * b.x;
    return this;
  }
  applyQuaternion() { return this; }
  normalize() { return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
}

class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
  // The knockable physics mutates a prop's quaternion to animate it, even in a
  // headless build, so the stub has to answer these rather than be a bare object.
  premultiply() { return this; }
  multiply() { return this; }
  slerp() { return this; }
  setFromAxisAngle() { return this; }
  setFromEuler() { return this; }
  normalize() { return this; }
}

// The toy train poses each car with a YXZ euler (pitch onto the grade, yaw along
// the rails) before turning it into a quaternion, so the stub needs a constructor
// the real code can call. It stores the three angles and nothing else.
class Euler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
  set(x, y, z, order) { this.x = x; this.y = y; this.z = z; if (order !== undefined) this.order = order; return this; }
  copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; this.order = e.order; return this; }
  clone() { return new Euler(this.x, this.y, this.z, this.order); }
}

class Obj3 {
  constructor() {
    this.children = [];
    // Real THREE.Object3D has `name` and furniture helpers set it, so the stub
    // needs it too — without it the audit tests cannot tell a wardrobe from a
    // coffee table and have to guess from the bounding box.
    this.name = '';
    this.position = new V3();
    this.rotation = new V3();
    this.quaternion = new Quaternion();
    this.scale = new V3(1, 1, 1);
    this.visible = true;
    this.userData = {};
    this.castShadow = false;
    this.receiveShadow = false;
  }
  lookAt() { return this; }
  add(...c) { for (const x of c) if (x) this.children.push(x); return this; }
  remove(c) { const i = this.children.indexOf(c); if (i > -1) this.children.splice(i, 1); return this; }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  // Real THREE clones a node (and its subtree) through Object3D.clone. The pet
  // lizard mirrors its left eye and horn onto the right with `.clone()`, so the
  // headless build needs a working deep copy rather than a shared reference.
  clone() {
    const c = Object.create(Object.getPrototypeOf(this));
    for (const k of Object.keys(this)) {
      const v = this[k];
      if (v instanceof V3) c[k] = new V3(v.x, v.y, v.z);
      else if (v instanceof Quaternion) c[k] = new Quaternion(v.x, v.y, v.z, v.w);
      else if (v instanceof Euler) c[k] = new Euler(v.x, v.y, v.z, v.order);
      else if (k === 'userData' && v && typeof v === 'object') c[k] = { ...v };
      else if (Array.isArray(v)) c[k] = v.slice();
      else c[k] = v;
    }
    c.children = [];
    for (const ch of this.children) c.add(ch.clone());
    return c;
  }
}

class Group extends Obj3 {}
class Scene extends Obj3 {}
class Mesh extends Obj3 {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; }
}
class PointLight extends Obj3 {
  constructor(c, i = 1, d = 0) { super(); this.color = c; this.intensity = i; this.distance = d; }
}
class DirectionalLight extends Obj3 {
  constructor(c, i = 1) { super(); this.color = c; this.intensity = i; }
}
class HemisphereLight extends Obj3 {
  constructor(sky, ground, i = 1) { super(); this.color = sky; this.groundColor = ground; this.intensity = i; }
}
class Fog { constructor() {} }
class Material {
  constructor(p = {}) { Object.assign(this, p); }
  dispose() {}
  // The real modules reused by the playroom (the spaceport ship) clone a shared
  // material per part, so the stub has to answer clone() or `makeShip` throws.
  clone() { return new this.constructor(this); }
}
class MeshStandardMaterial extends Material {}
class MeshBasicMaterial extends Material {}
class LineBasicMaterial extends Material {}
// `makeShip` (reused for the playroom's hanging rocket) builds its canopy from a
// physical (glass) material; the stub only has to construct it.
class MeshPhysicalMaterial extends Material {}
// `makeShip` parks a marker in an Object3D; treat it as a plain node.
class Object3D extends Obj3 {}
// The Hot Wheels deck is one swept BufferGeometry; the stub only needs to store
// the attributes and answer the two calls the builder makes on it.
class BufferGeometry {
  constructor() { this.attributes = {}; this.kind = 'buffer'; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  computeVertexNormals() { return this; }
  dispose() {}
}
class Float32BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
}
class Geometry {
  constructor(kind, params) { this.kind = kind; this.params = params; }
  // The stub keeps sizes in `params` and has no vertices to transform, so the
  // bake-in rotations are inert — exactly as they are in the root stub. They
  // exist so builder code that spins a plane in its own plane still runs.
  rotateX() { return this; }
  rotateY() { return this; }
  rotateZ() { return this; }
  dispose() {}
}
// The real geometry classes are constructible, and the builder calls them with
// `new`. Arrow functions are not, so each one is a small class.
//
// Sizes are kept per-axis rather than as a single `params`: a test needs to know
// a box is 24 wide and 20 tall, not just that it is a box. A rest argument is
// fine in a class constructor, so the extra args are simply collected.
const geo = (kind) => class extends Geometry {
  constructor(...params) { super(kind, params); }
};
class Texture {
  constructor() { this.repeat = { x: 1, y: 1, set() {} }; this.wrapS = 0; this.wrapT = 0; this.colorSpace = ''; }
  dispose() {}
}
class Color {
  constructor(c) { this.value = c; }
  set(c) { this.value = c; return this; }
  getHex() { return this.value; }
}
class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
class Raycaster { set() { return this; } intersectObjects() { return []; } }
class Line3 {}
class Matrix4 {}
class LineSegments extends Mesh {}
class Clock { constructor() { this.t = 0; } getDelta() { return 0; } getElapsedTime() { return this.t; } start() {} stop() {} }
class Shape { moveTo() {} lineTo() {} quadraticCurveTo() {} absarc() {} }

export const SRGBColorSpace = 'srgb';
export const RepeatWrapping = 'repeat';
export const DoubleSide = 2;
export const FrontSide = 0;
export const BackSide = 1;
export const AdditiveBlending = 2;
export const NormalBlending = 1;
export const ACESFilmicToneMapping = 4;
export const PCFSoftShadowMap = 2;
export const MathUtils = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t };
export { V3 as Vector3, Group, Scene, Mesh, PointLight, DirectionalLight, HemisphereLight, Fog, Material, MeshStandardMaterial, MeshBasicMaterial, LineBasicMaterial, MeshPhysicalMaterial, Object3D, LineSegments, Texture, Color, Vector2, Raycaster, Line3, Quaternion, Euler, Matrix4, Clock, Shape };
export const BoxGeometry = geo('box');
export const SphereGeometry = geo('sphere');
export const CylinderGeometry = geo('cylinder');
export const ConeGeometry = geo('cone');
export const PlaneGeometry = geo('plane');
export const TorusGeometry = geo('torus');
export const CircleGeometry = geo('circle');
export const RingGeometry = geo('ring');
export const ShapeGeometry = geo('shape');
export const CapsuleGeometry = geo('capsule');
export const TubeGeometry = geo('tube');
export { BufferGeometry, Float32BufferAttribute };
// The rocking horse's rocker rails and the toy train's rails are swept along a
// Catmull-Rom curve; the stub mostly just has to hold the points. The house's
// train rails also SAMPLE their horizontal shape off the curve (getPoint) and
// take their height from the deck, so the closed 'catmullrom' case is answered
// here too — enough for the headless build to run, not a full port of three.
export class CatmullRomCurve3 {
  constructor(points = [], closed = false, type = 'centripetal', tension = 0.5) {
    this.points = points; this.closed = closed; this.curveType = type; this.tension = tension;
  }
  getPoint(t) {
    const pts = this.points;
    const l = pts.length;
    if (l === 0) return new V3();
    if (l === 1) return pts[0].clone();
    const tension = this.tension;
    let p = (this.closed ? l : l - 1) * t;
    let i = Math.floor(p);
    const w = p - i;
    if (this.closed) i += i > 0 ? 0 : (Math.floor(Math.abs(i) / l) + 1) * l;
    const at = (k) => pts[((k % l) + l) % l];
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const cubic = (x0, x1, x2, x3) => {
      const c0 = x1, c1 = tension * (x2 - x0);
      const c2 = -3 * x1 + 3 * x2 - 2 * c1 - tension * (x3 - x1);
      const c3 = 2 * x1 - 2 * x2 + c1 + tension * (x3 - x1);
      return ((c3 * w + c2) * w + c1) * w + c0;
    };
    return new V3(
      cubic(p0.x, p1.x, p2.x, p3.x),
      cubic(p0.y, p1.y, p2.y, p3.y),
      cubic(p0.z, p1.z, p2.z, p3.z),
    );
  }
}

// The builder's `phase()` yields to the browser between build steps. Running
// that synchronously keeps the test to one tick, and a stubbed window is what
// makes the "if (window.requestAnimationFrame)" branch take.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    requestAnimationFrame: (fn) => { fn(); return 1; },
    devicePixelRatio: 1,
    addEventListener() {},
    innerWidth: 800,
    innerHeight: 600,
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement: () => ({ style: {}, getContext: () => null }) };
}
