// Minimal Three.js stand-in: enough of the API surface for cityBuildings.js to
// build every mesh and collider in plain Node, so the layout can be audited.

class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
  // Axis-local translation: on a real Vector3 these are no-ops until the
  // object is applied, and no audit cares, so they just pass the delta through.
  translateX(d) { this.x += d; return this; }
  translateY(d) { this.y += d; return this; }
  translateZ(d) { this.z += d; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}
class Euler { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
class Vec2 { set(x, y) { this.x = x; this.y = y; return this; } }

class Object3D {
  constructor() {
    this.position = new V3();
    this.rotation = new Euler();
    this.scale = new V3(1, 1, 1);
    this.castShadow = false;
    this.receiveShadow = false;
    this.children = [];
  }
  add(...o) { for (const c of o) this.children.push(c); return this; }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  lookAt() { /* orientation irrelevant to the audits */ }
  // Object-level translation in local axes. Props code uses these on meshes
  // directly, so they have to live here as well as on V3.
  translateX(d) { this.position.x += d; return this; }
  translateY(d) { this.position.y += d; return this; }
  translateZ(d) { this.position.z += d; return this; }
  updateMatrixWorld() { /* audits walk matrixWorld directly */ }
  updateWorldMatrix() { /* ditto */ }
  // Column-major world matrix, filled in just enough for axis-aligned reads.
  // Parent transforms are NOT composed: the props and buildings that need that
  // (audit2) run against the real three.js, this is only for simple scans.
  get matrixWorld() {
    if (!this._mw) this._mw = { elements: new Array(16).fill(0) };
    const m = this._mw.elements;
    m[0] = this.scale.x; m[5] = this.scale.y; m[10] = this.scale.z;
    m[12] = this.position.x; m[13] = this.position.y; m[14] = this.position.z;
    m[15] = 1;
    return this._mw;
  }
}

class Group extends Object3D {}
class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.isMesh = true;
    this.geometry = geometry;
    this.material = material;
  }
}
class PointLight extends Object3D {
  constructor(color, intensity, distance, decay) {
    super();
    this.color = color; this.intensity = intensity; this.distance = distance; this.decay = decay;
  }
}
class MeshStandardMaterial {
  constructor(opts = {}) { Object.assign(this, opts); }
  clone() { return Object.assign(Object.create(Object.getPrototypeOf(this)), this); }
}

class Geometry {
  rotateY() { return this; }
  rotateX() { return this; }
  rotateZ() { return this; }
  translate() { return this; }
  scale() { return this; }
  dispose() {}
}
class BoxGeometry extends Geometry {
  constructor(w, h, d) { super(); this.w = w; this.h = h; this.d = d; this.parameters = { width: w, height: h, depth: d }; }
}
class CylinderGeometry extends Geometry { constructor(rt, rb, h, seg) { super(); this.rt = rt; this.rb = rb; this.h = h; this.seg = seg; } }
class SphereGeometry extends Geometry { constructor(r, w, h, a, b, c, d) { super(); this.r = r; } }
class ConeGeometry extends Geometry { constructor(r, h, seg) { super(); this.r = r; this.h = h; this.seg = seg; } }
class PlaneGeometry extends Geometry { constructor(w, h) { super(); this.w = w; this.h = h; } }
class TorusGeometry extends Geometry { constructor(r, t, a, b, arc) { super(); this.r = r; this.t = t; } }
class CircleGeometry extends Geometry {
  constructor(r, seg) { super(); this.r = r; this.seg = seg; this.parameters = { radius: r, segments: seg }; }
}
class RingGeometry extends Geometry {
  constructor(r0, r1, seg) { super(); this.parameters = { innerRadius: r0, outerRadius: r1, segments: seg }; }
}
class BufferGeometry extends Geometry { constructor() { super(); this.attributes = {}; } }
class Float32BufferAttribute extends Geometry {
  constructor(arr, size) { super(); this.array = arr; this.itemSize = size; }
}
class MeshBasicMaterial { constructor(opts = {}) { Object.assign(this, opts); } }
class LineBasicMaterial extends MeshBasicMaterial {}
// Every other polyhedron the props reach for; all just need to exist.
class PolyGeometry extends Geometry {
  constructor(r, d) { super(); this.r = r; this.d = d; }
}
class OctahedronGeometry extends PolyGeometry {}
class IcosahedronGeometry extends PolyGeometry {}
class TetrahedronGeometry extends PolyGeometry {}
class DodecahedronGeometry extends PolyGeometry {}
class LatheGeometry extends PolyGeometry {
  constructor(points, seg) { super(); this.points = points; this.seg = seg; }
}
class TubeGeometry extends PolyGeometry {}
class CapsuleGeometry extends PolyGeometry {
  constructor(r, len, cap, rad) { super(); this.parameters = { radius: r, length: len }; }
}
class Shape {
  constructor() { this.mnx = Infinity; this.mxx = -Infinity; this.mny = Infinity; this.mxy = -Infinity; }
  moveTo(x, y) { this.mnx = Math.min(this.mnx, x); this.mxx = Math.max(this.mxx, x); this.mny = Math.min(this.mny, y); this.mxy = Math.max(this.mxy, y); }
  lineTo(x, y) { this.moveTo(x, y); }
  closePath() {}
  get bbox() { return { w: this.mxx - this.mnx, h: this.mxy - this.mny }; }
}
class ExtrudeGeometry extends Geometry { constructor(shapes, opts = {}) { super(); this.shapes = Array.isArray(shapes) ? shapes : [shapes]; this.depth = opts.depth ?? 0.22; } }

class Texture {
  constructor(img) { this.image = img; this.needsUpdate = false; this.repeat = new Vec2(); }
  clone() { return new Texture(this.image); }
}
class CanvasTexture extends Texture {}

const strokeCtx = {
  strokeStyle: '', lineWidth: 1, fillStyle: '', font: '', textAlign: '',
  beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, closePath() {},
  arc() {}, fill() {}, rect() {},
  fillRect() {}, strokeRect() {}, clearRect() {},
  fillText() {}, strokeText() {}, measureText: () => ({ width: 0 }),
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData() {},
};

class Color {
  constructor(c) { this.r = 0; this.g = 0; this.b = 0; this.set(c); }
  set(c) {
    if (typeof c === 'number') this.r = ((c >> 16) & 255) / 255, this.g = ((c >> 8) & 255) / 255, this.b = (c & 255) / 255;
    else if (c && typeof c === 'object') { this.r = c.r ?? 0; this.g = c.g ?? 0; this.b = c.b ?? 0; }
    return this;
  }
  // Enough of HSL for the portal's rainbow ring; the audit only needs it to
  // not throw.
  setHSL(h, s, l) { this.r = l; this.g = l * s; this.b = l * (1 - s); return this; }
  clone() { return new Color(this); }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  getHex() { return ((this.r * 255) << 16) | ((this.g * 255) << 8) | (this.b * 255); }
  getStyle() { return `rgb(${this.r * 255},${this.g * 255},${this.b * 255})`; }
  lerp() { return this; }
}

export const SRGBColorSpace = 'srgb';
export const RepeatWrapping = 1000;
export const DoubleSide = 2;
export const FrontSide = 0;
export const BackSide = 1;
export const AdditiveBlending = 2;
export const NormalBlending = 1;
export const ACESFilmicToneMapping = 4;
export const PCFSoftShadowMap = 2;
export const MathUtils = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  degToRad: (d) => (d * Math.PI) / 180,
  radToDeg: (r) => (r * 180) / Math.PI,
  randFloat: (a, b) => a + Math.random() * (b - a),
  randFloatSpread: (s) => (Math.random() - 0.5) * 2 * s,
  generateUUID: () => 'stub-uuid',
};
export class Clock {
  constructor() { this.t = 0; }
  getDelta() { return 0; }
  getElapsedTime() { return this.t; }
}
export class Quaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
  setFromAxisAngle() { return this; }
  set() { return this; }
}
export class Raycaster { setFromCamera() {} intersectObjects() { return []; } }
export const Vector2 = V3;
export const Vector3 = V3;
export class Line3 { constructor(a, b) { this.start = a; this.end = b; } closestPointToPoint(p) { return { point: p, distance: 0 }; } }

export {
  Group, Mesh, PointLight, Object3D, Color,
  MeshStandardMaterial, MeshBasicMaterial, LineBasicMaterial,
  BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, PlaneGeometry,
  CircleGeometry, RingGeometry, TorusGeometry, ExtrudeGeometry, Shape,
  BufferGeometry, Float32BufferAttribute, CanvasTexture,
  OctahedronGeometry, IcosahedronGeometry, TetrahedronGeometry,
  DodecahedronGeometry, LatheGeometry, TubeGeometry, CapsuleGeometry,
};

export default {
  Group, Mesh, PointLight, Object3D, Color,
  MeshStandardMaterial, MeshBasicMaterial, LineBasicMaterial,
  BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, PlaneGeometry,
  CircleGeometry, RingGeometry, TorusGeometry, ExtrudeGeometry, Shape,
  BufferGeometry, Float32BufferAttribute, CanvasTexture,
  OctahedronGeometry, IcosahedronGeometry, TetrahedronGeometry,
  DodecahedronGeometry, LatheGeometry, TubeGeometry, CapsuleGeometry,
  SRGBColorSpace, RepeatWrapping, DoubleSide, FrontSide, BackSide,
  AdditiveBlending, NormalBlending, ACESFilmicToneMapping, PCFSoftShadowMap,
  MathUtils, Clock, Raycaster, Vector2, Vector3, Euler, Quaternion, Line3,
};

export function installDomStubs() {
  globalThis.document = {
    createElement() {
      return { width: 0, height: 0, getContext: () => strokeCtx };
    },
  };
}
