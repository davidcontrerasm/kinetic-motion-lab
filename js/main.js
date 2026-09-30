/**
 * Kinetic — entry point.
 *
 * Every module is initialised in isolation: one failing module logs an error
 * and the rest of the page keeps working.
 */
import { springCurve } from './core/motion.js';
import { initFillButtons, initRanges } from './core/ui.js';
import { initReveal, initScramble } from './modules/reveal.js';
import { initHeader } from './modules/header.js';
import { initCursor } from './modules/cursor.js';
import { initMagnetic } from './modules/magnetic.js';
import { initHero } from './modules/hero.js';
import { initMarquee } from './modules/marquee.js';
import { initManifesto } from './modules/manifesto.js';
import { initBezier } from './modules/bezier.js';
import { initInteractions } from './modules/interactions.js';
import { initSpringLab } from './modules/spring-lab.js';
import { initGallery } from './modules/gallery.js';
import { initFlip } from './modules/flip.js';
import { initTilt } from './modules/tilt.js';
import { initFooter } from './modules/footer.js';
import { initPreloader } from './modules/preloader.js';
import { initFieldGuide } from './modules/field-guide.js';

function installSpringEasing() {
  // CSS transitions across the site use a spring sampled from real physics.
  const curve = springCurve({ stiffness: 190, damping: 17 });
  if (curve.supported) document.documentElement.style.setProperty('--ease-spring', curve.easing);
}

const steps = [
  ['spring easing', installSpringEasing],
  ['ranges', () => initRanges()],
  ['fill buttons', () => initFillButtons()],
  ['reveal', initReveal],
  ['scramble', initScramble],
  ['header', initHeader],
  ['cursor', initCursor],
  ['magnetic', initMagnetic],
  ['hero', initHero],
  ['marquee', initMarquee],
  ['manifesto', initManifesto],
  ['bezier', initBezier],
  ['interactions', initInteractions],
  ['field guide', initFieldGuide],
  ['spring lab', initSpringLab],
  ['gallery', initGallery],
  ['flip', initFlip],
  ['tilt', initTilt],
  ['footer', initFooter],
  ['preloader', initPreloader],
];

for (const [name, init] of steps) {
  try {
    init();
  } catch (error) {
    console.error(`[kinetic] "${name}" failed to initialise`, error);
  }
}
