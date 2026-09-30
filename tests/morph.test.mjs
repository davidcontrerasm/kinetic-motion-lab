import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath, serializePath, createMorph, interpolatePath } from '../js/core/morph.js';

test('parsePath reads commands and numbers, including compact forms', () => {
  assert.deepEqual(parsePath('M0-1L2.5.5Z'), [
    { type: 'M', values: [0, -1] },
    { type: 'L', values: [2.5, 0.5] },
    { type: 'Z', values: [] },
  ]);
  assert.throws(() => parsePath('10 20 L1 1'), SyntaxError);
});

test('serializePath round-trips', () => {
  const d = 'M10 20 C1 2 3 4 5 6 Z';
  assert.equal(serializePath(parsePath(d)), d);
});

test('createMorph returns the endpoints at 0 and 1 and midpoints in between', () => {
  const morph = createMorph('M0 0 L10 10', 'M10 0 L0 20');
  assert.equal(morph(0), 'M0 0 L10 10');
  assert.equal(morph(1), 'M10 0 L0 20');
  assert.equal(morph(0.5), 'M5 0 L5 15');
  assert.equal(interpolatePath('M0 0', 'M4 8', 0.25), 'M1 2');
});

test('incompatible paths are rejected', () => {
  assert.throws(() => createMorph('M0 0 L1 1', 'M0 0'), /length/);
  assert.throws(() => createMorph('M0 0 L1 1', 'M0 0 C1 1 1 1 1 1'), /differs/);
});

test('arcs morph their numeric parameters but keep flags intact', () => {
  const morph = createMorph('M0 0 A10 10 0 0 1 20 20', 'M0 0 A30 30 0 0 1 40 40');
  assert.equal(morph(0.5), 'M0 0 A20 20 0 0 1 30 30');
  // Repeated arc groups are validated group by group.
  assert.equal(
    interpolatePath('M0 0 A5 5 0 1 0 10 0 5 5 0 0 1 20 0', 'M0 0 A9 9 0 1 0 10 0 9 9 0 0 1 20 0', 0.5),
    'M0 0 A7 7 0 1 0 10 0 7 7 0 0 1 20 0',
  );
});

test('arcs with different flags are rejected instead of emitting invalid flags', () => {
  assert.throws(() => createMorph('M0 0 A10 10 0 0 0 20 20', 'M0 0 A10 10 0 1 1 20 20'), /arc flags/);
  assert.throws(
    () => createMorph('M0 0 A5 5 0 1 0 10 0 5 5 0 0 1 20 0', 'M0 0 A5 5 0 1 0 10 0 5 5 0 1 1 20 0'),
    /arc flags/,
  );
});
