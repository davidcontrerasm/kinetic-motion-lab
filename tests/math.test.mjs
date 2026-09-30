import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, lerp, damp, toNumber, rangePercent } from '../js/core/math.js';

test('clamp and lerp', () => {
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(2), 1);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(lerp(10, 20, 0.25), 12.5);
});

test('damp is frame-rate independent', () => {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 30; i++) a = damp(a, 100, 8, 1 / 30);
  for (let i = 0; i < 144; i++) b = damp(b, 100, 8, 1 / 144);
  assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
});

test('toNumber keeps zero and falls back only for missing or invalid input', () => {
  assert.equal(toNumber('0', 100), 0);
  assert.equal(toNumber(0, 100), 0);
  assert.equal(toNumber('', 100), 100);
  assert.equal(toNumber(null, 5), 5);
  assert.equal(toNumber(undefined, 5), 5);
  assert.equal(toNumber('abc', 7), 7);
  assert.equal(toNumber('-2.5', 0), -2.5);
});

test('rangePercent honours a zero maximum', () => {
  assert.equal(rangePercent('0', '-100', '0'), 100);
  assert.equal(rangePercent('-50', '-100', '0'), 50);
  assert.equal(rangePercent('-100', '-100', '0'), 0);
});

test('rangePercent uses HTML defaults for missing attributes and clamps', () => {
  assert.equal(rangePercent('40', '', ''), 40);
  assert.equal(rangePercent('150', '0', '100'), 100);
  assert.equal(rangePercent('5', '5', '5'), 0);
  const fractional = rangePercent('0.6', '0.2', '1');
  assert.ok(Math.abs(fractional - 50) < 1e-10, `expected ~50, got ${fractional}`);
});
