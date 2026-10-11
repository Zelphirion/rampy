import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitViewports, splitCoversFullWidth, SPLIT_FOV } from './splitViewports.js';

test('even width: two equal halves, full height', () => {
  const [a, b] = splitViewports(800, 600);
  assert.deepEqual(a, { x: 0, y: 0, width: 400, height: 600 });
  assert.deepEqual(b, { x: 400, y: 0, width: 400, height: 600 });
});

test('odd width: left half floors, right half gets the remainder', () => {
  const [a, b] = splitViewports(801, 600);
  assert.equal(a.width, 400);
  assert.equal(b.x, 400);
  assert.equal(b.width, 401);
  assert.equal(a.width + b.width, 801);
});

test('tiny widths still tile exactly', () => {
  const [a, b] = splitViewports(1, 100);
  assert.deepEqual(a, { x: 0, y: 0, width: 0, height: 100 });
  assert.deepEqual(b, { x: 0, y: 0, width: 1, height: 100 });
  assert.ok(splitCoversFullWidth(1));
  assert.ok(splitCoversFullWidth(2));
  assert.ok(splitCoversFullWidth(3));
  assert.ok(splitCoversFullWidth(799));
  assert.ok(splitCoversFullWidth(800));
});

test('a zero/negative width never produces negative rects', () => {
  const [a, b] = splitViewports(0, 600);
  assert.ok(a.width >= 0 && b.width >= 0);
  const [c, d] = splitViewports(-5, 600);
  assert.ok(c.width >= 0 && d.width >= 0);
});

test('SPLIT_FOV bumps the vertical field of view for the halved aspect', () => {
  assert.equal(SPLIT_FOV, 72);
});