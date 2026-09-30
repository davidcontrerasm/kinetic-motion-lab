/**
 * Damped harmonic oscillator utilities.
 *
 * - `Spring`: an interruptible spring for interactive motion. Targets can change
 *   at any moment and velocity is preserved. Each frame is advanced with the
 *   exact closed-form solution (the target is constant within a frame), so the
 *   motion is identical at 30, 60 or 144 fps and never becomes unstable.
 * - `springPosition`: the closed-form position, used for graphs, tests and for
 *   generating CSS `linear()` easing strings.
 *
 * Pure module: no DOM access.
 */

/** Largest frame advanced in one go, so a backgrounded tab does not teleport. */
const MAX_FRAME = 0.1;
/** Damping ratios this close to 1 use the critically damped formula. */
const CRITICAL_TOLERANCE = 1e-6;

export const springPresets = {
  default: { stiffness: 170, damping: 26, mass: 1 },
  gentle: { stiffness: 120, damping: 14, mass: 1 },
  wobbly: { stiffness: 180, damping: 12, mass: 1 },
  stiff: { stiffness: 210, damping: 20, mass: 1 },
  slow: { stiffness: 280, damping: 60, mass: 1 },
  molasses: { stiffness: 280, damping: 120, mass: 1 },
};

/**
 * Exact state of a damped spring after `t` seconds.
 *
 * @param {number} t elapsed time in seconds
 * @param {number} x0 initial displacement from the resting point
 * @param {number} v0 initial velocity
 * @param {{stiffness:number, damping:number, mass?:number}} config
 * @returns {{x:number, v:number}} displacement and velocity at time t
 */
export function solveSpring(t, x0, v0, { stiffness, damping, mass = 1 }) {
  if (!(mass > 0)) throw new RangeError('Spring mass must be positive');

  // Degenerate case: no restoring force, only (optional) viscous drag.
  if (!(stiffness > 0)) {
    if (!(damping > 0)) return { x: x0 + v0 * t, v: v0 };
    const decay = Math.exp((-damping / mass) * t);
    return { x: x0 + ((v0 * mass) / damping) * (1 - decay), v: v0 * decay };
  }

  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (Math.abs(zeta - 1) < CRITICAL_TOLERANCE) {
    const A = x0;
    const B = v0 + w0 * x0;
    const e = Math.exp(-w0 * t);
    return { x: e * (A + B * t), v: e * (B - w0 * (A + B * t)) };
  }

  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const A = x0;
    const B = (v0 + zeta * w0 * x0) / wd;
    const e = Math.exp(-zeta * w0 * t);
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    return {
      x: e * (A * cos + B * sin),
      v: e * ((-zeta * w0 * A + wd * B) * cos + (-zeta * w0 * B - wd * A) * sin),
    };
  }

  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - root);
  const r2 = -w0 * (zeta + root);
  const c2 = (v0 - r1 * x0) / (r2 - r1);
  const c1 = x0 - c2;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return { x: c1 * e1 + c2 * e2, v: c1 * r1 * e1 + c2 * r2 * e2 };
}

export class Spring {
  /**
   * @param {object} [options]
   * @param {number} [options.stiffness=170] spring constant k
   * @param {number} [options.damping=26] damping coefficient c
   * @param {number} [options.mass=1] mass m
   * @param {number} [options.value=0] initial position
   * @param {number} [options.target] resting position (defaults to value)
   * @param {number} [options.velocity=0] initial velocity (units per second)
   * @param {number} [options.precision=0.001] settle threshold
   */
  constructor({
    stiffness = 170,
    damping = 26,
    mass = 1,
    value = 0,
    target = value,
    velocity = 0,
    precision = 0.001,
  } = {}) {
    if (!(mass > 0)) throw new RangeError('Spring mass must be positive');
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
    this.value = value;
    this.target = target;
    this.velocity = velocity;
    this.precision = precision;
  }

  /** Updates physical parameters without resetting motion. */
  configure({ stiffness = this.stiffness, damping = this.damping, mass = this.mass } = {}) {
    if (!(mass > 0)) throw new RangeError('Spring mass must be positive');
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
    return this;
  }

  /** Jumps to a value with no motion. */
  set(value) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    return this;
  }

  /**
   * Advances the simulation by `dt` seconds (clamped to MAX_FRAME).
   * @returns {number} the new value
   */
  step(dt) {
    const t = Math.min(Math.max(dt, 0), MAX_FRAME);
    if (t > 0) {
      const { x, v } = solveSpring(t, this.value - this.target, this.velocity, this);
      this.value = this.target + x;
      this.velocity = v;
    }
    if (this.isSettled()) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }

  isSettled() {
    return (
      Math.abs(this.velocity) < this.precision &&
      Math.abs(this.value - this.target) < this.precision
    );
  }
}

/** Damping ratio ζ = c / (2√(km)). ζ < 1 oscillates, ζ = 1 is critical. */
export function dampingRatio({ stiffness, damping, mass = 1 }) {
  return damping / (2 * Math.sqrt(stiffness * mass));
}

/** Undamped natural angular frequency ω₀ = √(k/m) in rad/s. */
export function naturalFrequency({ stiffness, mass = 1 }) {
  return Math.sqrt(stiffness / mass);
}

/** Classifies the damping regime of a configuration. */
export function dampingRegime(config, tolerance = 0.005) {
  const zeta = dampingRatio(config);
  if (Math.abs(zeta - 1) <= tolerance) return 'critical';
  return zeta < 1 ? 'underdamped' : 'overdamped';
}

/** Closed-form position of a damped spring at time `t` (seconds). */
export function springPosition(t, { from = 0, to = 1, velocity = 0, ...config }) {
  return to + solveSpring(t, from - to, velocity, config).x;
}

/**
 * Time (seconds) after which the spring stays within `threshold` of the total
 * travel distance. Sampled from the analytic solution.
 */
export function settleTime(config, { threshold = 0.01, maxTime = 10, step = 1 / 240 } = {}) {
  const from = config.from ?? 0;
  const to = config.to ?? 1;
  const distance = Math.abs(to - from) || 1;
  let lastOutside = 0;
  for (let t = 0; t <= maxTime; t += step) {
    const x = springPosition(t, { ...config, from, to });
    if (Math.abs(x - to) > threshold * distance) lastOutside = t;
  }
  return Math.min(lastOutside + step, maxTime);
}

/**
 * Generates a CSS `linear()` easing that reproduces a spring from 0 to 1,
 * plus the duration it needs. CSS animations can then feel physical without
 * any JavaScript running per frame.
 *
 * @returns {{ easing: string, duration: number }} duration in milliseconds
 */
export function toLinearEasing(config, { samples = 40, threshold = 0.002 } = {}) {
  const duration = settleTime({ ...config, from: 0, to: 1 }, { threshold });
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * duration;
    const value = i === samples ? 1 : springPosition(t, { ...config, from: 0, to: 1 });
    points.push(Number(value.toFixed(4)));
  }
  points[0] = 0;
  return { easing: `linear(${points.join(', ')})`, duration: Math.round(duration * 1000) };
}
