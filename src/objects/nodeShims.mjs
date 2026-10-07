// Minimal DOM globals so the game's real level modules can be imported (and
// their real model builders called) inside `node --test`.
//
// The object browser now shows the FULL versions of everything, which means
// catalog.js imports the level modules themselves — and those modules draw
// canvas textures (`document.createElement('canvas')`, a 2d context, a
// `CanvasTexture`) as part of building a model. None of that needs to draw
// anything meaningful in a headless test; it only needs to not throw.
//
// So: a canvas whose 2d context is a chainable no-op, plus the handful of
// globals modules touch at import time. Install with:
//
//   node --import ./src/objects/nodeShims.mjs --test src/...
//
// The context is a Proxy over a function: any property reads back a callable
// that returns the context itself, so `ctx.fillStyle = x`, `ctx.beginPath()`,
// `grad.addColorStop(0, c)` and friends all work and chain.

function noopContext() {
  const ctx = new Proxy(function noop() {}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => noopContext();
      }
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (prop === 'createImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      return (...args) => ctx;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    apply() { return ctx; },
  });
  return ctx;
}

function makeCanvas() {
  const canvas = {
    width: 300,
    height: 150,
    style: {},
    getContext: () => noopContext(),
    toDataURL: () => 'data:image/png;base64,',
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
  };
  return canvas;
}

const doc = {
  canvas: null,
  readyState: 'complete',
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return {
      style: {},
      children: [],
      appendChild() {},
      removeChild() {},
      setAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      getContext: () => noopContext(),
    };
  },
  createElementNS(ns, tag) { return doc.createElement(tag); },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  body: { appendChild() {}, removeChild() {}, style: {} },
  documentElement: { style: {} },
};

if (!globalThis.document) globalThis.document = doc;
if (!globalThis.window) {
  globalThis.window = new Proxy(globalThis, {
    get(t, p) { return p in t ? t[p] : undefined; },
    set(t, p, v) { t[p] = v; return true; },
  });
}
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node', language: 'en' };
if (!globalThis.self) globalThis.self = globalThis;
if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16);
if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};
if (!globalThis.Image) globalThis.Image = function Image() { this.onload = null; };
