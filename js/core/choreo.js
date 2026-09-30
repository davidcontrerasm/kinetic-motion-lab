/**
 * Choreography helpers: stagger delays for grid patterns and start times for
 * parallel, sequential and overlapping sequences. Pure and unit tested.
 */

/** Small deterministic PRNG (mulberry32) so "random" staggers are reproducible. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STAGGER_PATTERNS = ['index', 'reverse', 'center', 'edges', 'diagonal', 'random'];

/**
 * Delays in milliseconds for `count` items laid out in rows of `columns`.
 *  - index / reverse: reading order
 *  - center: ripples outward from the middle
 *  - edges: converges from the outside in
 *  - diagonal: sweeps from the top-left corner
 *  - random: shuffled but reproducible (seeded)
 */
export function staggerDelays(count, { pattern = 'index', columns = count, step = 40, seed = 1 } = {}) {
  if (!STAGGER_PATTERNS.includes(pattern)) throw new RangeError(`Unknown stagger pattern: ${pattern}`);
  const cols = Math.max(1, Math.floor(columns));
  const rows = Math.ceil(count / cols);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const farthest = Math.hypot(cx, cy);
  const random = mulberry32(seed);
  const delays = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    let rank = i;
    if (pattern === 'reverse') rank = count - 1 - i;
    else if (pattern === 'center') rank = Math.hypot(col - cx, row - cy);
    else if (pattern === 'edges') rank = farthest - Math.hypot(col - cx, row - cy);
    else if (pattern === 'diagonal') rank = col + row;
    else if (pattern === 'random') rank = random() * Math.max(count - 1, 0);
    delays.push(rank * step);
  }
  return delays;
}

/** Total time a staggered group takes: the last start plus one duration. */
export function staggerTotal(delays, duration) {
  return delays.length ? Math.max(...delays) + duration : 0;
}

/**
 * Start times for a sequence of parts with the given durations.
 *  - parallel: everything starts together
 *  - sequential: each part waits for the previous one to finish
 *  - overlap: each part starts once the previous is `overlap` (0..1) of the way through
 */
export function schedule(durations, mode = 'sequential', overlap = 0.5) {
  const starts = [];
  let cursor = 0;
  for (const duration of durations) {
    if (mode === 'parallel') {
      starts.push(0);
    } else if (mode === 'sequential') {
      starts.push(cursor);
      cursor += duration;
    } else if (mode === 'overlap') {
      starts.push(cursor);
      cursor += duration * (1 - Math.min(Math.max(overlap, 0), 1));
    } else {
      throw new RangeError(`Unknown schedule mode: ${mode}`);
    }
  }
  return starts;
}
