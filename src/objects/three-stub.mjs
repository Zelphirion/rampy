// A minimal THREE stand-in for running the object catalogue headless.
//
// Enough of three to CONSTRUCT every catalogue model — which is all this file
// has to do, because the browser does the drawing. Geometry classes are
// recorded, not built, and nothing here simulates a renderer.
//
// This exists because the catalogue is ~100 hand-written builders used by the
// Objects browser, and a typo in one of them (a bad option name, a `cone` called
// with the wrong argument order) is invisible to `node --check` and only shows
// up as one blank tile in the grid. The build test calls every builder.
//
// NOTE: kept deliberately separate from levels/house/three-stub.mjs. That one is
// shaped around what the house builder touches; this one is shaped around the
// catalogue's, and sharing one file would mean both had to grow every symbol the
// other happened to need.
//
// Run: node --test src/objects/catalogBuild.test.mjs
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  normalize() { return this; }
}
class Obj3 {
  constructor() {
    this.children = [];
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
class Points extends Mesh {}
class LineSegments extends Mesh {}
class Material {
  constructor(p = {}) { Object.assign(this, p); }
  dispose() {}
}
class MeshStandardMaterial extends Material {}
class MeshBasicMaterial extends Material {}
class LineBasicMaterial extends Material {}
class SpriteMaterial extends Material {}
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
class Box3 {
  constructor() {
    this.min = new V3(Infinity, Infinity, Infinity);
    this.max = new V3(-Infinity, -Infinity, -Infinity);
  }
  setFromObject() { return this; }
  getSize(v) { return v; }
}
class Raycaster { set() { return this; } intersectObject() { return []; } intersectObjects() { return []; } }
class Clock {
  constructor() { this.t = 0; }
  getDelta() { return 0; }
  getElapsedTime() { return this.t; }
  start() {}
  stop() {}
}
class Shape {
  moveTo() { return this; }
  lineTo() { return this; }
  quadraticCurveTo() { return this; }
  absarc() { return this; }
  closePath() { return this; }
}

// The real geometry classes are constructible and the catalogue calls them with
// `new`, so each one has to be a class - an arrow function is not. They record
// their arguments, which is all anything needs of them here, and the transform
// methods are no-ops returning `this` so the builders that nudge a geometry
// after building it still run to completion.
class Geometry {
  constructor(kind, params) { this.kind = kind; this.params = params; }
  translate() { return this; }
  rotateX() { return this; }
  rotateY() { return this; }
  rotateZ() { return this; }
  scale() { return this; }
  center() { return this; }
  computeVertexNormals() { return this; }
  dispose() {}
}
const geo = (kind) => class extends Geometry {
  constructor(...params) { super(kind, params); }
};

export const BoxGeometry = geo('BoxGeometry');
export const CapsuleGeometry = geo('CapsuleGeometry');
export const CircleGeometry = geo('CircleGeometry');
export const ConeGeometry = geo('ConeGeometry');
export const CylinderGeometry = geo('CylinderGeometry');
export const DodecahedronGeometry = geo('DodecahedronGeometry');
export const ExtrudeGeometry = geo('ExtrudeGeometry');
export const IcosahedronGeometry = geo('IcosahedronGeometry');
export const OctahedronGeometry = geo('OctahedronGeometry');
export const PlaneGeometry = geo('PlaneGeometry');
export const SphereGeometry = geo('SphereGeometry');
export const TorusGeometry = geo('TorusGeometry');

export const SRGBColorSpace = 'srgb';
export const RepeatWrapping = 'repeat';
export const FrontSide = 0;
export const BackSide = 1;
export const DoubleSide = 2;
export const AdditiveBlending = 2;
export const NormalBlending = 1;
export const ACESFilmicToneMapping = 4;
export const PCFSoftShadowMap = 2;
export const MathUtils = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
};
export const Vector3 = V3;

export {
  Group, Scene, Mesh, Points, LineSegments, Material, MeshStandardMaterial, MeshBasicMaterial,
  LineBasicMaterial, SpriteMaterial, Texture, Color, Vector2, Box3, Raycaster, Clock, Shape,
};