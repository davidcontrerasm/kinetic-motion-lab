/**
 * Easing functions and a CSS-compatible cubic-bezier solver.
 *
 * This module is pure (no DOM access) so it can be unit tested in Node and
 * shared by every animation in the site.
 */

export const linear = (t) => t;
export const easeInSine = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine = (t) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInQuart = (t) => t * t * t * t;
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
export const easeInExpo = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutExpo = (t) => {
  if (t === 0 || t === 1) return t;
  return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
};
export const easeInCirc = (t) => 1 - Math.sqrt(1 - t * t);
export const easeOutCirc = (t) => Math.sqrt(1 - Math.pow(t - 1, 2));
export const easeInOutCirc = (t) =>
  t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;

const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;
export const easeInBack = (t) => BACK_C3 * t * t * t - BACK_C1 * t * t;
export const easeOutBack = (t) => 1 + BACK_C3 * Math.pow(t - 1, 3) + BACK_C1 * Math.pow(t - 1, 2);
export const easeInOutBack = (t) =>
  t < 0.5
    ? (Math.pow(2 * t, 2) * ((BACK_C2 + 1) * 2 * t - BACK_C2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((BACK_C2 + 1) * (t * 2 - 2) + BACK_C2) + 2) / 2;

export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export const easeOutBounce = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const easings = {
  linear,
  easeInSine,
  easeOutSine,
  easeInOutSine,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  easeInCirc,
  easeOutCirc,
  easeInOutCirc,
  easeInBack,
  easeOutBack,
  easeInOutBack,
  easeOutElastic,
  easeOutBounce,
};

/**
 * Samples any easing function into a CSS `linear()` string, so curves that
 * cubic-bezier cannot express (bounce, elastic, springs) can run in pure CSS.
 */
export function linearFromFunction(fn, samples = 40, digits = 4) {
  if (typeof fn !== 'function') throw new TypeError('linearFromFunction expects a function');
  const count = Math.max(2, Math.floor(samples));
  const points = [];
  for (let i = 0; i <= count; i++) points.push(Number(fn(i / count).toFixed(digits)));
  points[0] = 0;
  points[count] = 1;
  return `linear(${points.join(', ')})`;
}

const NEWTON_ITERATIONS = 8;
const NEWTON_EPSILON = 1e-7;
const MIN_SLOPE = 1e-6;
const BISECTION_ITERATIONS = 40;

/**
 * Builds the polynomial coefficients for one axis of a cubic bezier whose
 * end points are fixed at 0 and 1 (the CSS timing-function convention).
 */
function coefficients(p1, p2) {
  const c = 3 * p1;
  const b = 3 * (p2 - p1) - c;
  const a = 1 - c - b;
  return { a, b, c };
}

/**
 * Returns an easing function equivalent to CSS `cubic-bezier(x1, y1, x2, y2)`.
 *
 * The curve is parametric in t, so for a given progress x we first solve
 * X(t) = x (Newton-Raphson, falling back to bisection where the slope is flat)
 * and then evaluate Y(t).
 *
 * @throws {RangeError} when x1 or x2 fall outside [0, 1] (invalid in CSS too)
 */
export function cubicBezier(x1, y1, x2, y2) {
  const values = [x1, y1, x2, y2];
  if (values.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    throw new TypeError('cubicBezier expects four numbers');
  }
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new RangeError('cubicBezier x values must be within [0, 1]');
  }

  const X = coefficients(x1, x2);
  const Y = coefficients(y1, y2);
  const sampleX = (t) => ((X.a * t + X.b) * t + X.c) * t;
  const sampleY = (t) => ((Y.a * t + Y.b) * t + Y.c) * t;
  const slopeX = (t) => (3 * X.a * t + 2 * X.b) * t + X.c;

  function solveT(x) {
    // Newton-Raphson converges in a handful of steps for most curves.
    let t = x;
    for (let i = 0; i < NEWTON_ITERATIONS; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < NEWTON_EPSILON) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < MIN_SLOPE) break;
      t -= error / slope;
    }
    if (t >= 0 && t <= 1 && Math.abs(sampleX(t) - x) < NEWTON_EPSILON) return t;

    // Robust fallback: X(t) is monotonic on [0, 1] because x1, x2 are in [0, 1].
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < BISECTION_ITERATIONS; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < NEWTON_EPSILON) return t;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  }

  const isLinear = x1 === y1 && x2 === y2;
  const ease = (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (isLinear) return x;
    return sampleY(solveT(x));
  };
  ease.points = [x1, y1, x2, y2];
  ease.solveT = solveT;
  ease.sampleX = sampleX;
  ease.sampleY = sampleY;
  return ease;
}

/** Well-known curves, expressed as bezier control points. */
export const bezierPresets = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  outExpo: [0.16, 1, 0.3, 1],
  outBack: [0.34, 1.56, 0.64, 1],
  inOutBack: [0.68, -0.6, 0.32, 1.6],
  anticipate: [0.6, -0.28, 0.73, 0.04],
  snap: [0.9, 0, 0.1, 1],
};

/** Formats a number compactly for CSS output: 0.50 -> 0.5, 1.00 -> 1. */
export function formatNumber(value, digits = 2) {
  const fixed = Number(value).toFixed(digits);
  // Only trim zeros that belong to a fractional part: 10 must stay "10".
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

/** Returns the CSS string for a set of control points. */
export function formatBezier(points, digits = 2) {
  return `cubic-bezier(${points.map((p) => formatNumber(p, digits)).join(', ')})`;
}
