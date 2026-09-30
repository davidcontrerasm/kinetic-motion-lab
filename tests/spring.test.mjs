import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Spring,
  solveSpring,
  springPosition,
  dampingRatio,
  dampingRegime,
  naturalFrequency,
  settleTime,
  toLinearEasing,
  springPresets,
} from '../js/core/spring.js';

const close = (actual, expected, epsilon, message) =>
  assert.ok(Math.abs(actual - expected) < epsilon, message ?? `${actual} !~ ${expected}`);

test('damping ratio and regime classification', () => {
  close(dampingRatio({ stiffness: 100, damping: 20, mass: 1 }), 1, 1e-12);
  assert.equal(dampingRegime({ stiffness: 100, damping: 20, mass: 1 }), 'critical');
  assert.equal(dampingRegime(springPresets.wobbly), 'underdamped');
  assert.equal(dampingRegime(springPresets.molasses), 'overdamped');
  close(naturalFrequency({ stiffness: 400, mass: 4 }), 10, 1e-12);
});

test('analytic solution starts at `from` and ends at `to`', () => {
  const configs = [
    { stiffness: 180, damping: 12 },
    { stiffness: 100, damping: 20 },
    { stiffness: 280, damping: 120 },
  ];
  for (const config of configs) {
    close(springPosition(0, { ...config, from: 3, to: 10 }), 3, 1e-9);
    close(springPosition(20, { ...config, from: 3, to: 10 }), 10, 1e-6);
  }
});

test('analytic solution honours initial velocity', () => {
  const config = { stiffness: 170, damping: 26, from: 0, to: 0, velocity: 5 };
  const dt = 1e-5;
  const slope = (springPosition(dt, config) - springPosition(0, config)) / dt;
  close(slope, 5, 1e-2);
});

test('numeric Spring matches the analytic solution in every regime', () => {
  const configs = [
    { stiffness: 180, damping: 12, mass: 1 },
    { stiffness: 100, damping: 20, mass: 1 },
    { stiffness: 280, damping: 120, mass: 1 },
    { stiffness: 60, damping: 4, mass: 2.5 },
  ];
  for (const config of configs) {
    const spring = new Spring({ ...config, value: 0, target: 100, velocity: 30, precision: 1e-9 });
    let t = 0;
    const frame = 1 / 60;
    for (let i = 0; i < 120; i++) {
      spring.step(frame);
      t += frame;
      const expected = springPosition(t, { ...config, from: 0, to: 100, velocity: 30 });
      close(spring.value, expected, 1e-6, `config ${JSON.stringify(config)} at t=${t.toFixed(3)}`);
    }
  }
});

test('Spring settles exactly on its target and reports it', () => {
  const spring = new Spring({ ...springPresets.stiff, value: 0, target: 1 });
  for (let i = 0; i < 600 && !spring.isSettled(); i++) spring.step(1 / 60);
  assert.ok(spring.isSettled());
  assert.equal(spring.value, 1);
  assert.equal(spring.velocity, 0);
});

test('Spring is frame-rate independent', () => {
  const a = new Spring({ ...springPresets.wobbly, value: 0, target: 1, precision: 1e-9 });
  const b = new Spring({ ...springPresets.wobbly, value: 0, target: 1, precision: 1e-9 });
  for (let i = 0; i < 30; i++) a.step(1 / 30);
  for (let i = 0; i < 120; i++) b.step(1 / 120);
  close(a.value, b.value, 1e-9);
});

test('solveSpring velocity is the derivative of its position', () => {
  const configs = [
    { stiffness: 180, damping: 12 },
    { stiffness: 100, damping: 20 },
    { stiffness: 280, damping: 120 },
    { stiffness: 0, damping: 5 },
    { stiffness: 0, damping: 0 },
  ];
  const h = 1e-6;
  for (const config of configs) {
    for (const t of [0, 0.05, 0.3, 1.2]) {
      const a = solveSpring(t, 40, -12, config);
      const b = solveSpring(t + h, 40, -12, config);
      close((b.x - a.x) / h, a.v, 1e-2, `config ${JSON.stringify(config)} t=${t}`);
    }
  }
});

test('Spring retargeting mid-flight preserves velocity', () => {
  const spring = new Spring({ ...springPresets.default, value: 0, target: 100 });
  for (let i = 0; i < 10; i++) spring.step(1 / 60);
  const velocity = spring.velocity;
  spring.target = -50;
  assert.equal(spring.velocity, velocity);
  spring.step(1 / 240);
  assert.ok(spring.velocity < velocity, 'velocity should start decreasing toward the new target');
});

test('Spring rejects non-positive mass', () => {
  assert.throws(() => new Spring({ mass: 0 }), RangeError);
  assert.throws(() => new Spring().configure({ mass: -1 }), RangeError);
});

test('stiffer springs settle faster', () => {
  const soft = settleTime({ stiffness: 80, damping: 18 });
  const stiff = settleTime({ stiffness: 400, damping: 40 });
  assert.ok(soft > 0 && stiff > 0);
  assert.ok(stiff < soft, `stiff ${stiff} should settle before soft ${soft}`);
});

test('toLinearEasing produces a valid CSS linear() string', () => {
  const { easing, duration } = toLinearEasing(springPresets.wobbly, { samples: 30 });
  assert.match(easing, /^linear\((-?\d+(\.\d+)?)(, -?\d+(\.\d+)?)+\)$/);
  const values = easing.slice(7, -1).split(', ').map(Number);
  assert.equal(values.length, 31);
  assert.equal(values[0], 0);
  assert.equal(values.at(-1), 1);
  assert.ok(Math.max(...values) > 1, 'wobbly spring should overshoot');
  assert.ok(duration > 300 && duration < 3000, `duration ${duration}`);
});
