import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cubicBezier,
  easings,
  bezierPresets,
  formatBezier,
  formatNumber,
  linearFromFunction,
  easeOutBounce,
} from '../js/core/easing.js';

const close = (actual, expected, epsilon = 1e-4, message) =>
  assert.ok(Math.abs(actual - expected) < epsilon, message ?? `${actual} !~ ${expected}`);

test('every named easing maps 0 -> 0 and 1 -> 1', () => {
  for (const [name, fn] of Object.entries(easings)) {
    close(fn(0), 0, 1e-9, `${name}(0)`);
    close(fn(1), 1, 1e-9, `${name}(1)`);
  }
});

test('cubicBezier with linear points is the identity', () => {
  const ease = cubicBezier(0, 0, 1, 1);
  for (let x = 0; x <= 1; x += 0.05) close(ease(x), x, 1e-9);
});

test('every named easing is continuous (no jumps between close samples)', () => {
  for (const [name, fn] of Object.entries(easings)) {
    for (let i = 0; i < 1000; i++) {
      const a = fn(i / 1000);
      const b = fn((i + 1) / 1000);
      assert.ok(Math.abs(b - a) < 0.08, `${name} jumps at ${i / 1000}`);
    }
  }
});

test('linearFromFunction samples a curve into a CSS linear() string', () => {
  const css = linearFromFunction(easeOutBounce, 20);
  assert.match(css, /^linear\((-?\d+(\.\d+)?)(, -?\d+(\.\d+)?)+\)$/);
  const values = css.slice(7, -1).split(', ').map(Number);
  assert.equal(values.length, 21);
  assert.equal(values[0], 0);
  assert.equal(values[20], 1);
  assert.throws(() => linearFromFunction('nope'), TypeError);
  assert.equal(linearFromFunction((t) => t, 1), 'linear(0, 0.5, 1)');
});

test('cubicBezier clamps progress outside [0, 1]', () => {
  const ease = cubicBezier(...bezierPresets.outBack);
  assert.equal(ease(-0.5), 0);
  assert.equal(ease(1.5), 1);
});

test('cubicBezier matches the CSS `ease` keyword reference values', () => {
  const ease = cubicBezier(0.25, 0.1, 0.25, 1);
  // Reference values computed with a high-precision parametric sweep.
  close(ease(0.25), 0.4094, 1e-3);
  close(ease(0.5), 0.8024, 1e-3);
  close(ease(0.75), 0.9604, 1e-3);
});

test('cubicBezier agrees with brute-force parametric sampling for many curves', () => {
  const curves = [
    ...Object.values(bezierPresets),
    [0.1, 0.9, 0.2, 1],
    [0.99, 0, 0.01, 1],
    [0, 1.8, 1, -0.8],
    [0.5, 0.5, 0.5, 0.5],
  ];
  for (const points of curves) {
    const ease = cubicBezier(...points);
    for (let i = 1; i < 200; i++) {
      const t = i / 200;
      const x = ease.sampleX(t);
      const y = ease.sampleY(t);
      close(ease(x), y, 5e-4, `curve ${points} at t=${t}`);
    }
  }
});

test('cubicBezier rejects x control points outside [0, 1]', () => {
  assert.throws(() => cubicBezier(-0.1, 0, 1, 1), RangeError);
  assert.throws(() => cubicBezier(0, 0, 1.2, 1), RangeError);
  assert.throws(() => cubicBezier(0, NaN, 1, 1), TypeError);
});

test('overshooting curves exceed 1 before settling', () => {
  const ease = cubicBezier(...bezierPresets.outBack);
  let max = 0;
  for (let x = 0; x <= 1; x += 0.01) max = Math.max(max, ease(x));
  assert.ok(max > 1.05, `expected overshoot, got max ${max}`);
});

test('formatting produces compact CSS', () => {
  assert.equal(formatNumber(0.5), '0.5');
  assert.equal(formatNumber(1), '1');
  assert.equal(formatNumber(-0.0001), '0');
  assert.equal(formatNumber(1.5, 2), '1.5');
  assert.equal(formatNumber(0.125, 3), '0.125');
  assert.equal(formatNumber(-0.6), '-0.6');
  assert.equal(formatNumber(10, 0), '10');
  assert.equal(formatNumber(0, 0), '0');
  assert.equal(formatNumber(100), '100');
  assert.equal(formatNumber(2.0004, 2), '2');
  assert.equal(formatBezier([0.34, 1.56, 0.64, 1]), 'cubic-bezier(0.34, 1.56, 0.64, 1)');
});
