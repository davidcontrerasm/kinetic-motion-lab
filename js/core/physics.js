/**
 * Pure physics helpers for direct-manipulation demos: rubber banding,
 * momentum with exponential decay, distance-scaled durations and bounces.
 * No DOM access, so every function is unit tested in Node.
 */
import { clamp } from './math.js';

/**
 * iOS-style rubber banding. An offset past a boundary is compressed so it
 * approaches, but never exceeds, `dimension`:
 *   f(x) = (1 − 1 / (|x|·c / d + 1)) · d
 * Small pulls feel almost 1:1; long pulls meet increasing resistance.
 */
export function rubberBand(offset, dimension, constant = 0.55) {
  if (!(dimension > 0) || offset === 0) return 0;
  const magnitude = (1 - 1 / ((Math.abs(offset) * constant) / dimension + 1)) * dimension;
  return Math.sign(offset) * magnitude;
}

/**
 * Where a body moving with exponential decay (v(t) = v₀·e^(−kt)) comes to rest:
 * the integral of velocity is v₀ / k.
 */
export function projectMomentum(position, velocity, decayRate) {
  if (!(decayRate > 0)) throw new RangeError('decayRate must be positive');
  return position + velocity / decayRate;
}

/** Exact exponential-decay step, frame-rate independent. */
export function decayStep(position, velocity, decayRate, dt) {
  if (!(decayRate > 0)) throw new RangeError('decayRate must be positive');
  const factor = Math.exp(-decayRate * dt);
  return {
    position: position + (velocity * (1 - factor)) / decayRate,
    velocity: velocity * factor,
  };
}

/**
 * A duration that grows with the square root of the distance travelled, so
 * short hops are not sluggish and long journeys are not rushed.
 */
export function scaledDuration(distance, { base = 240, reference = 100, min = 150, max = 700 } = {}) {
  const d = Math.abs(Number(distance)) || 0;
  return clamp(base * Math.sqrt(d / reference), min, max);
}

/** The value in `targets` closest to `value` (first one wins on ties). */
export function nearest(value, targets) {
  if (!targets.length) throw new RangeError('nearest needs at least one target');
  let best = targets[0];
  for (const target of targets) if (Math.abs(target - value) < Math.abs(best - value)) best = target;
  return best;
}

/** Velocity after hitting a surface with a coefficient of restitution in [0, 1]. */
export function bounce(velocity, restitution) {
  return -velocity * clamp(restitution, 0, 1);
}
