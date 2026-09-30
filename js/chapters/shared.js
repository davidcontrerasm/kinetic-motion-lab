/**
 * Helpers shared by every chapter's demo module: a fault-isolating demo
 * runner, first-view triggers, rail travel measurement and SVG curve paths.
 */
import { qsa } from '../core/dom.js';
import { motion, observeVisibility } from '../core/motion.js';

const initializing = new WeakSet();

/** Initialises every `[data-demo]` element that has a matching function; one failure never stops the rest. */
export function runDemos(demos, root = document) {
  qsa('[data-demo]', root).forEach((element) => {
    const demo = demos[element.dataset.demo];
    if (!demo || element.dataset.ready === 'true' || initializing.has(element)) return;
    initializing.add(element);
    try {
      demo(element);
      element.dataset.ready = 'true';
    } catch (error) {
      delete element.dataset.ready;
      console.error(`[kinetic] demo "${element.dataset.demo}" failed`, error);
    } finally {
      initializing.delete(element);
    }
  });
}

/** One continuous first-view dwell; also works with synchronous IO fallback. */
export function onFirstView(element, fn, { delay = 250, threshold = 0.5 } = {}) {
  let done = false;
  let timer = 0;
  let stop = () => {};
  const inView = () => {
    const rect = element.getBoundingClientRect();
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return !document.hidden && rect.height > 0 && height > 0 &&
      (height / rect.height >= threshold || height >= window.innerHeight * 0.5);
  };
  const update = () => {
    if (done) return;
    if (!inView()) {
      clearTimeout(timer);
      timer = 0;
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = 0;
        if (!inView()) return;
        done = true;
        cleanup();
        fn();
      }, delay);
    }
  };
  const cleanup = () => {
    clearTimeout(timer);
    timer = 0;
    stop();
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  };
  document.addEventListener('visibilitychange', update);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  stop = observeVisibility(element, update, { threshold: [0, threshold] });
  if (done) stop();
  return () => { done = true; cleanup(); };
}

/** Shared early-study activity gate; no independent frame loop or preference. */
export function watchDemoActivity(root, callback) {
  let visible = false;
  let previous;
  const update = () => {
    const active = visible && !document.hidden && !motion.reduced;
    root.dataset.active = String(active);
    // Invoke on preference changes even when already offscreen: settle targets.
    callback(active);
    previous = active;
  };
  const stop = observeVisibility(root, (value) => {
    visible = value;
    const active = visible && !document.hidden && !motion.reduced;
    if (active !== previous) update();
  });
  const unsubscribe = motion.subscribe(update);
  document.addEventListener('visibilitychange', update);
  update();
  return () => {
    stop();
    unsubscribe();
    document.removeEventListener('visibilitychange', update);
  };
}

/** How far a ball can travel inside its rail. */
export const travelOf = (rail, ball, inset = 8) => Math.max(0, rail.clientWidth - ball.offsetWidth - inset);

/**
 * SVG path for y = fn(t), t in [0, 1], inside a `width` x `height` box.
 * `range` maps [low, high] progress to the bottom and top edges (inside `padding`).
 */
export function curvePath(fn, { width, height, range = [0, 1], padding = 0, samples = 96 }) {
  const [low, high] = range;
  const span = high - low || 1;
  let d = '';
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = padding + t * (width - padding * 2);
    const y = padding + (1 - (fn(t) - low) / span) * (height - padding * 2);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

/** Restarts CSS animations keyed on a class. */
export function replayClass(element, className = 'is-playing') {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

/** Flips (or sets) a toggle button's aria-pressed state and returns the new value. */
export function togglePressed(button, force) {
  const next = force ?? button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(next));
  return next;
}
