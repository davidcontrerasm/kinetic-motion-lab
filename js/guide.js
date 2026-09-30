/**
 * Kinetic field guide — entry point for every page under /guide.
 *
 * Shared behaviour boots first (each step isolated so one failure never takes
 * the page down), then the chapter's own demo module is loaded on demand.
 */
import { springCurve } from './core/motion.js';
import { initFillButtons, initRanges } from './core/ui.js';
import { initReveal, initScramble } from './modules/reveal.js';
import { initHeader } from './modules/header.js';
import { initCursor } from './modules/cursor.js';
import { initMagnetic } from './modules/magnetic.js';
import { initGuideShell } from './guide/shell.js';

// Guide pages have no intro sequence: reveal the chrome immediately.
document.documentElement.classList.add('is-loaded');

function installSpringEasing() {
  const curve = springCurve({ stiffness: 190, damping: 17 });
  if (curve.supported) document.documentElement.style.setProperty('--ease-spring', curve.easing);
}

const steps = [
  ['spring easing', installSpringEasing],
  ['ranges', () => initRanges()],
  ['reveal', initReveal],
  ['scramble', initScramble],
  ['header', initHeader],
  ['guide shell', initGuideShell],
  ['cursor', initCursor],
];

for (const [name, init] of steps) {
  try {
    init();
  } catch (error) {
    console.error(`[kinetic] "${name}" failed to initialise`, error);
  }
}

async function initChapter() {
  const moduleName = document.body.dataset.module ?? document.body.dataset.chapter;
  if (moduleName) {
    try {
      const module = await import(`./chapters/${moduleName}.js`);
      module.init();
    } catch (error) {
      console.error(`[kinetic] page module "${moduleName}" failed to load`, error);
    }
  }
  // Buttons and magnetic targets created by chapter demos exist only now.
  for (const [name, init] of [
    ['fill buttons', () => initFillButtons()],
    ['magnetic', initMagnetic],
  ]) {
    try {
      init();
    } catch (error) {
      console.error(`[kinetic] "${name}" failed to initialise`, error);
    }
  }
}

initChapter();
