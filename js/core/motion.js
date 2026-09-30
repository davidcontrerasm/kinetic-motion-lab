/**
 * Shared runtime for every animated module:
 *  - math helpers (clamp, lerp, frame-rate independent damping)
 *  - the reduced-motion preference (OS setting + persisted user override)
 *  - a single requestAnimationFrame ticker that modules subscribe to
 *  - scroll velocity tracking and viewport visibility helpers
 *  - physically generated CSS spring easings
 */
import { toLinearEasing } from './spring.js';
import { clamp, lerp, damp } from './math.js';

export { clamp, lerp, damp };
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = 'kinetic:motion';
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePreference(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Storage can be unavailable (private mode); the preference is then session-only. */
  }
}

let reduced = (() => {
  const stored = readPreference();
  return stored ? stored === 'reduced' : reduceQuery.matches;
})();

const motionSubscribers = new Set();

function applyMotionAttribute() {
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
}

applyMotionAttribute();

export const motion = {
  get reduced() {
    return reduced;
  },
  setReduced(value, { persist = true } = {}) {
    const next = Boolean(value);
    if (persist) writePreference(next ? 'reduced' : 'full');
    if (next === reduced) return;
    reduced = next;
    applyMotionAttribute();
    for (const subscriber of motionSubscribers) {
      try {
        subscriber(reduced);
      } catch (error) {
        console.error('[kinetic] motion subscriber failed', error);
      }
    }
  },
  toggle() {
    this.setReduced(!reduced);
  },
  subscribe(subscriber) {
    motionSubscribers.add(subscriber);
    return () => motionSubscribers.delete(subscriber);
  },
};

reduceQuery.addEventListener?.('change', (event) => {
  // Follow the OS only while the user has not chosen explicitly.
  if (!readPreference()) motion.setReduced(event.matches, { persist: false });
});

/* -------------------------------------------------------------------------- */
/* Ticker: one rAF loop for the whole site                                    */
/* -------------------------------------------------------------------------- */

const frameCallbacks = new Set();
let rafId = 0;
let lastTime = 0;

function tick(now) {
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
  lastTime = now;
  for (const callback of frameCallbacks) {
    try {
      callback(dt, now);
    } catch (error) {
      frameCallbacks.delete(callback);
      console.error('[kinetic] frame callback removed after throwing', error);
    }
  }
  rafId = frameCallbacks.size ? requestAnimationFrame(tick) : 0;
}

/**
 * Registers a per-frame callback `(dt, now) => void`.
 * @returns {() => void} unsubscribe
 */
export function onFrame(callback) {
  frameCallbacks.add(callback);
  if (!rafId) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
  return () => frameCallbacks.delete(callback);
}

/** A start/stop handle around onFrame, so modules only run while needed. */
export function createLoop(callback) {
  let unsubscribe = null;
  return {
    start() {
      if (!unsubscribe) unsubscribe = onFrame(callback);
    },
    stop() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
    get running() {
      return unsubscribe !== null;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Scroll velocity                                                            */
/* -------------------------------------------------------------------------- */

export const scroll = { y: window.scrollY, velocity: 0 };

{
  let lastY = window.scrollY;
  onFrame((dt) => {
    const y = window.scrollY;
    const raw = dt > 0 ? (y - lastY) / dt : 0;
    lastY = y;
    scroll.y = y;
    scroll.velocity = damp(scroll.velocity, clamp(raw, -6000, 6000), 12, dt);
    if (Math.abs(scroll.velocity) < 0.01) scroll.velocity = 0;
  });
}

/* -------------------------------------------------------------------------- */
/* Visibility                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Calls `callback(isVisible, entry)` whenever the element enters or leaves the viewport.
 * @returns {() => void} disconnect
 */
export function observeVisibility(element, callback, { rootMargin = '0px', threshold = 0 } = {}) {
  if (!element) return () => {};
  if (!('IntersectionObserver' in window)) {
    callback(true, null);
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) callback(entry.isIntersecting, entry);
    },
    { rootMargin, threshold },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

/* -------------------------------------------------------------------------- */
/* Spring easing for CSS and WAAPI                                            */
/* -------------------------------------------------------------------------- */

const linearSupported =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', 'linear(0, 1)');
const curveCache = new Map();

/**
 * Returns `{ easing, duration, supported }` for a spring configuration. `easing` is a
 * physically sampled `linear()` curve when supported, otherwise a close cubic-bezier.
 */
export function springCurve(config, fallback = 'cubic-bezier(0.34, 1.56, 0.64, 1)') {
  const key = JSON.stringify(config);
  if (!curveCache.has(key)) curveCache.set(key, toLinearEasing(config, { samples: 48 }));
  const { easing, duration } = curveCache.get(key);
  return { easing: linearSupported ? easing : fallback, duration, supported: linearSupported };
}
