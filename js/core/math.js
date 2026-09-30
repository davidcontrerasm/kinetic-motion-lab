/**
 * Pure numeric helpers shared by the runtime. No DOM access, so they are unit tested in Node.
 */

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Exponential smoothing that behaves identically at any frame rate. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/**
 * Parses a numeric attribute value, keeping legitimate zeros and falling back
 * only for missing or invalid input ("", null, undefined, NaN).
 */
export function toNumber(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Percentage (0–100) of `value` between `min` and `max`, using the HTML range
 * input defaults (min 0, max 100) only when an attribute is missing or invalid.
 */
export function rangePercent(value, min, max) {
  const lo = toNumber(min, 0);
  const hi = toNumber(max, 100);
  const v = toNumber(value, lo);
  if (hi === lo) return 0;
  return clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
}
