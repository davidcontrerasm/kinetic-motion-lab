/**
 * Intro sequence: a counter that waits for fonts, then a two-layer curtain wipe.
 * `replayIntro()` lets the footer CTA run it again.
 */
import { qs } from '../core/dom.js';
import { motion, damp, wait } from '../core/motion.js';
import { easeInOutCubic } from '../core/easing.js';

let running = false;
let firstRun = true;

export function initPreloader() {
  run();
}

export function replayIntro() {
  if (running) return;
  const root = document.documentElement;
  root.classList.remove('is-loaded');
  // Jump to the top without the smooth scrolling that CSS applies to html.
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previous;
  run();
}

function reveal() {
  document.documentElement.classList.add('is-loaded');
  window.dispatchEvent(new CustomEvent('kinetic:ready'));
}

function run() {
  const element = qs('[data-preloader]');
  const root = document.documentElement;
  if (!element) {
    reveal();
    return;
  }

  running = true;
  element.style.animation = 'none'; // JavaScript is in control: disarm the CSS failsafe.
  element.hidden = false;
  element.classList.remove('is-leaving');
  root.classList.add('is-loading');

  const count = qs('[data-preloader-count]', element);
  const bar = qs('[data-preloader-bar]', element);
  const words = qs('[data-preloader-words]', element);
  words?.classList.remove('is-running');
  void words?.offsetWidth;
  words?.classList.add('is-running');

  const fontsReady =
    firstRun && document.fonts ? Promise.race([document.fonts.ready, wait(3000)]) : Promise.resolve();
  const duration = firstRun ? 1700 : 1200;
  firstRun = false;

  if (motion.reduced) {
    fontsReady.then(() => leave(element, true));
    return;
  }

  let fontsDone = false;
  fontsReady.then(() => {
    fontsDone = true;
  });

  const start = performance.now();
  let last = start;
  let shown = 0;

  const step = (now) => {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
    last = now;
    const t = Math.min((now - start) / duration, 1);
    // Hold short of 100 until fonts are ready, so the reveal never reflows.
    const target = easeInOutCubic(fontsDone ? t : Math.min(t, 0.85));
    shown = damp(shown, target, 14, dt);
    if (target === 1 && 1 - shown < 0.004) shown = 1;

    if (count) count.textContent = String(Math.round(shown * 100)).padStart(3, '0');
    if (bar) bar.style.transform = `scaleX(${shown.toFixed(4)})`;
    element.style.setProperty('--p', shown.toFixed(3));

    if (shown >= 1) {
      leave(element, false);
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function leave(element, immediate) {
  element.classList.add('is-leaving');
  document.documentElement.classList.remove('is-loading');
  setTimeout(reveal, immediate ? 0 : 220);
  setTimeout(
    () => {
      element.hidden = true;
      running = false;
    },
    immediate ? 0 : 1400,
  );
}
