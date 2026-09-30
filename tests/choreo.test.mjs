import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staggerDelays, staggerTotal, schedule, mulberry32, STAGGER_PATTERNS } from '../js/core/choreo.js';

test('index and reverse patterns are linear in reading order', () => {
  assert.deepEqual(staggerDelays(4, { step: 50 }), [0, 50, 100, 150]);
  assert.deepEqual(staggerDelays(4, { pattern: 'reverse', step: 50 }), [150, 100, 50, 0]);
});

test('center pattern starts in the middle and ends at the corners', () => {
  const delays = staggerDelays(9, { pattern: 'center', columns: 3, step: 100 });
  assert.equal(delays[4], 0);
  const corner = Math.max(...delays);
  for (const i of [0, 2, 6, 8]) assert.equal(delays[i], corner);
});

test('edges pattern is the mirror of center', () => {
  const center = staggerDelays(25, { pattern: 'center', columns: 5, step: 10 });
  const edges = staggerDelays(25, { pattern: 'edges', columns: 5, step: 10 });
  const max = Math.max(...center);
  center.forEach((value, i) => assert.ok(Math.abs(edges[i] - (max - value)) < 1e-9));
});

test('diagonal pattern depends on row + column', () => {
  assert.deepEqual(staggerDelays(6, { pattern: 'diagonal', columns: 3, step: 1 }), [0, 1, 2, 1, 2, 3]);
});

test('random pattern is reproducible for a seed and bounded', () => {
  const a = staggerDelays(20, { pattern: 'random', step: 10, seed: 7 });
  const b = staggerDelays(20, { pattern: 'random', step: 10, seed: 7 });
  const c = staggerDelays(20, { pattern: 'random', step: 10, seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const value of a) assert.ok(value >= 0 && value <= 190);
});

test('unknown patterns and modes throw', () => {
  assert.throws(() => staggerDelays(3, { pattern: 'spiral' }), RangeError);
  assert.throws(() => schedule([100], 'sideways'), RangeError);
  assert.ok(STAGGER_PATTERNS.includes('center'));
});

test('mulberry32 yields values in [0, 1)', () => {
  const random = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const value = random();
    assert.ok(value >= 0 && value < 1);
  }
});

test('staggerTotal adds one duration to the last start', () => {
  assert.equal(staggerTotal([0, 40, 80], 300), 380);
  assert.equal(staggerTotal([], 300), 0);
});

test('schedule computes parallel, sequential and overlapping starts', () => {
  const durations = [200, 400, 300];
  assert.deepEqual(schedule(durations, 'parallel'), [0, 0, 0]);
  assert.deepEqual(schedule(durations, 'sequential'), [0, 200, 600]);
  assert.deepEqual(schedule(durations, 'overlap', 0.5), [0, 100, 300]);
  assert.deepEqual(schedule(durations, 'overlap', 2), [0, 0, 0]);
});
