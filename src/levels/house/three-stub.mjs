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
}
class MeshStandardMaterial extends Material {}
class MeshBasicMaterial extends Material {}
class LineBasicMaterial extends Material {}
class Geometry {
  constructor(kind, params) { this.kind = kind; this.params = params; }
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
class Quaternion {}
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
export { Group, Scene, Mesh, PointLight, DirectionalLight, HemisphereLight, Fog, Material, MeshStandardMaterial, MeshBasicMaterial, LineBasicMaterial, LineSegments, Texture, Color, Vector2, Raycaster, Line3, Quaternion, Matrix4, Clock, Shape };
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
