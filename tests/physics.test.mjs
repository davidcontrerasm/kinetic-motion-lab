import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rubberBand, projectMomentum, decayStep, scaledDuration, nearest, bounce } from '../js/core/physics.js';

const close = (actual, expected, epsilon = 1e-9, message) =>
  assert.ok(Math.abs(actual - expected) < epsilon, message ?? `${actual} !~ ${expected}`);

test('rubberBand is odd, monotonic and bounded by the dimension', () => {
  assert.equal(rubberBand(0, 300), 0);
  close(rubberBand(-120, 300), -rubberBand(120, 300));
  let previous = 0;
  for (let x = 10; x <= 5000; x += 10) {
    const value = rubberBand(x, 300);
    assert.ok(value > previous, `not increasing at ${x}`);
    assert.ok(value < 300, `exceeded dimension at ${x}`);
    assert.ok(value < x, `resistance must shrink the offset at ${x}`);
    previous = value;
  }
});

test('rubberBand is close to 1:1 for tiny pulls and zero for invalid dimensions', () => {
  close(rubberBand(1, 1000) / 0.55, 1, 1e-3);
  assert.equal(rubberBand(50, 0), 0);
});

test('decayStep integrates exactly and converges to projectMomentum', () => {
  let state = { position: 10, velocity: 800 };
  for (let i = 0; i < 600; i++) state = decayStep(state.position, state.velocity, 4, 1 / 60);
  close(state.position, projectMomentum(10, 800, 4), 1e-3);
  close(state.velocity, 0, 1e-3);
});

test('decayStep is frame-rate independent', () => {
  let a = { position: 0, velocity: 500 };
  let b = { position: 0, velocity: 500 };
  for (let i = 0; i < 30; i++) a = decayStep(a.position, a.velocity, 3, 1 / 30);
  for (let i = 0; i < 144; i++) b = decayStep(b.position, b.velocity, 3, 1 / 144);
  close(a.position, b.position, 1e-9);
});

test('projectMomentum and decayStep reject non-positive decay', () => {
  assert.throws(() => projectMomentum(0, 1, 0), RangeError);
  assert.throws(() => decayStep(0, 1, -1, 0.1), RangeError);
});

test('scaledDuration grows with the square root of distance and respects bounds', () => {
  close(scaledDuration(100), 240);
  close(scaledDuration(400), 480);
  assert.equal(scaledDuration(1), 150);
  assert.equal(scaledDuration(100000), 700);
  close(scaledDuration(-400), 480);
});

test('nearest picks the closest target', () => {
  assert.equal(nearest(47, [0, 100, 200]), 0);
  assert.equal(nearest(51, [0, 100, 200]), 100);
  assert.equal(nearest(-30, [0, 100]), 0);
  assert.throws(() => nearest(1, []), RangeError);
});

test('bounce reverses and scales velocity by restitution', () => {
  assert.equal(bounce(10, 0.5), -5);
  assert.equal(bounce(-4, 2), 4);
  assert.equal(bounce(3, -1), -0);
});
